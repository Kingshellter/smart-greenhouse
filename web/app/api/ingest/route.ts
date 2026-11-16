// Endpoint untuk ESP32.
// Request  : POST /api/ingest, header x-device-key, body JSON:
//   { device_id, reading?: {...}, events?: [{actuator, action, value, trigger, age_ms}] }
// Response : { settings: {...}, commands: [{id, type, payload}] }
// ESP32 memanggil ini tiap ~3 s (poll perintah) dan menyertakan `reading`
// tiap report_interval_s atau saat state berubah.

import { after } from "next/server";
import { sql } from "@/lib/db";
import { bad, num, oneOf, readJson, safeEqual } from "@/lib/http";
import { eventAlert, fmtDuration, notify, waEnabled, type NotifyKind } from "@/lib/notify";
import { SETTINGS_COLUMNS } from "@/lib/settings";

export const dynamic = "force-dynamic";

const ACTUATORS = ["pump", "lid", "mode", "system"] as const;
const TRIGGERS = ["auto", "web", "serial", "safety", "boot"] as const;
const COMMAND_TTL_S = 60; // perintah lebih tua dari ini tidak dieksekusi (mis. setelah WiFi putus)

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body) return bad("JSON tidak valid");
  const deviceId = String(body.device_id ?? "");
  const key = req.headers.get("x-device-key") ?? "";

  const [dev] = await sql`select name, api_key from devices where id = ${deviceId}`;
  if (!dev || !key || !safeEqual(dev.api_key, key)) return bad("device_id atau key salah", 401);

  const now = Date.now();
  const r = body.reading as Record<string, unknown> | undefined;
  const events = Array.isArray(body.events) ? body.events.slice(0, 50) : [];
  const alerts: { kind: NotifyKind; text: string; at: Date }[] = [];
  let prev: { prev_seen: Date | null; alert_at: Date | null } | undefined;

  await sql.begin(async (tx) => {
    if (r && typeof r === "object") {
      await tx`
        insert into readings (device_id, soil_raw, soil_pct, temperature_c, humidity_pct,
                              lid_state, lid_angle, pump_state, mode, tank_warning, rssi)
        values (${deviceId}, ${num(r.soil_raw, 0, 4095)}, ${num(r.soil_pct, 0, 100)},
                ${num(r.temperature_c, -20, 80)}, ${num(r.humidity_pct, 0, 100)},
                ${oneOf(r.lid_state, ["open", "closed", "maintenance"] as const)}, ${num(r.lid_angle, 0, 180)},
                ${oneOf(r.pump_state, ["on", "off"] as const)}, ${oneOf(r.mode, ["auto", "manual"] as const)},
                ${r.tank_warning === true}, ${num(r.rssi, -120, 0)})`;
    }
    for (const e of events as Record<string, unknown>[]) {
      const actuator = oneOf(e?.actuator, ACTUATORS);
      if (!actuator) continue;
      const age = num(e.age_ms, 0, 7 * 24 * 3600 * 1000) ?? 0; // umur event di ESP32 → timestamp asli
      const ts = new Date(now - age);
      const action = String(e.action ?? "").slice(0, 32);
      const value = num(e.value, -1e9, 1e9);
      await tx`
        insert into actuator_events (device_id, ts, actuator, action, value, trigger, detail)
        values (${deviceId}, ${ts}, ${actuator}, ${action},
                ${value}, ${oneOf(e.trigger, TRIGGERS) ?? "auto"},
                ${e.detail ? tx.json(e.detail as never) : null})`;
      const reason = (e.detail as { reason?: unknown } | undefined)?.reason;
      const alert = eventAlert({ actuator, action, value, reason: typeof reason === "string" ? reason : undefined });
      if (alert) alerts.push({ ...alert, at: ts });
    }
    // offline_alert_at terisi = sempat dikabarkan offline lewat WA → kabarkan online lagi
    [prev] = await tx<{ prev_seen: Date | null; alert_at: Date | null }[]>`
      with prev as (select last_seen, offline_alert_at from devices where id = ${deviceId} for update)
      update devices d set last_seen = now(), offline_alert_at = null from prev
      where d.id = ${deviceId}
      returning prev.last_seen as prev_seen, prev.offline_alert_at as alert_at`;
  });

  // Notifikasi WA dikirim setelah respons, supaya ESP32 tidak menunggu Fonnte
  if (waEnabled()) {
    const device = { id: deviceId, name: dev.name as string };
    const hasReading = !!r && typeof r === "object";
    after(async () => {
      try {
        if (prev?.alert_at) {
          const down = prev.prev_seen ? ` setelah offline ±${fmtDuration(now - prev.prev_seen.getTime())}` : "";
          await notify(device, "online", `✅ *Node online lagi*${down}. Data dan perintah web jalan kembali.`);
        }
        for (const a of alerts) await notify(device, a.kind, a.text, a.at);
        if (hasReading) await checkSensors(device);
      } catch (e) {
        console.error("[wa]", e);
      }
    });
  }

  await sql`
    update commands set status = 'expired'
    where device_id = ${deviceId} and status = 'pending'
      and created_at < now() - make_interval(secs => ${COMMAND_TTL_S})`;
  const commands = await sql`
    update commands set status = 'sent', sent_at = now()
    where id in (select id from commands
                 where device_id = ${deviceId} and status = 'pending'
                 order by created_at for update skip locked)
    returning id::int as id, type, payload`;

  const [settings] = await sql`select ${sql(SETTINGS_COLUMNS)} from device_settings where device_id = ${deviceId}`;

  return Response.json({ settings, commands, server_time: Math.floor(now / 1000) });
}

/** Sensor tidak terbaca di 2 reading terakhir berturut-turut (firmware tidak mengirim nilai yang invalid). */
async function checkSensors(device: { id: string; name: string }) {
  const rows = await sql`
    select soil_pct, temperature_c, humidity_pct from readings
    where device_id = ${device.id} order by ts desc limit 2`;
  if (rows.length < 2) return;
  const broken: string[] = [];
  if (rows.every((x) => x.soil_pct == null)) broken.push("sensor tanah");
  if (rows.every((x) => x.temperature_c == null || x.humidity_pct == null)) broken.push("DHT22 (suhu/RH)");
  if (!broken.length) return;
  await notify(
    device,
    "sensor",
    `🧪 *Sensor bermasalah:* ${broken.join(" dan ")} tidak terbaca. Penyiraman otomatis berhenti` +
      (broken.length > 1 || broken[0] !== "sensor tanah" ? " dan tutup tidak bergerak otomatis" : "") +
      ` sampai sensor terbaca lagi. Cek kabel dan konektor sensor.`,
  );
}
