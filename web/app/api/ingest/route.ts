// Endpoint untuk ESP32.
// Request  : POST /api/ingest, header x-device-key, body JSON:
//   { device_id, reading?: {...}, events?: [{actuator, action, value, trigger, age_ms}] }
// Response : { settings: {...}, commands: [{id, type, payload}] }
// ESP32 memanggil ini tiap ~3 s (poll perintah) dan menyertakan `reading`
// tiap report_interval_s atau saat state berubah.

import { sql } from "@/lib/db";
import { bad, num, oneOf, readJson, safeEqual } from "@/lib/http";
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

  const [dev] = await sql`select api_key from devices where id = ${deviceId}`;
  if (!dev || !key || !safeEqual(dev.api_key, key)) return bad("device_id atau key salah", 401);

  const now = Date.now();
  const r = body.reading as Record<string, unknown> | undefined;
  const events = Array.isArray(body.events) ? body.events.slice(0, 50) : [];

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
      await tx`
        insert into actuator_events (device_id, ts, actuator, action, value, trigger, detail)
        values (${deviceId}, ${new Date(now - age)}, ${actuator}, ${String(e.action ?? "").slice(0, 32)},
                ${num(e.value, -1e9, 1e9)}, ${oneOf(e.trigger, TRIGGERS) ?? "auto"},
                ${e.detail ? tx.json(e.detail as never) : null})`;
    }
    await tx`update devices set last_seen = now() where id = ${deviceId}`;
  });

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
