// Notifikasi WhatsApp lewat Fonnte (https://fonnte.com).
// Server hanya MENGABARKAN kejadian; keputusan aktuator tetap di ESP32.
//
// Env (berlaku untuk semua node):
//   FONNTE_TOKEN  token device dari dashboard Fonnte
//   WA_TARGET     nomor tujuan bawaan, pisahkan koma (08xx / 628xx). Boleh juga ID grup Fonnte.
//                 Tiap node bisa punya nomor sendiri + pilihan jenis pesan (tabel notify_settings,
//                 diatur dari tombol lonceng di dashboard node).
//   WA_DRY_RUN=1  jangan kirim, cukup tulis ke log server (untuk uji)
//   APP_URL       opsional, untuk tautan dashboard di pesan (di Vercel otomatis dari domain production)

import { sql, APP_TZ } from "@/lib/db";
import { DEFAULT_PREFS, TOGGLE_KEYS, type NotifyPrefs, type NotifyToggle } from "@/lib/notify-prefs";

export type NotifyKind = "tank_warning" | "safety" | "brownout" | "sensor" | "offline" | "online" | "auto" | "test";

/** Jeda minimum antar pesan sejenis per node, supaya tidak spam. offline/online diatur oleh state, bukan cooldown. */
const COOLDOWN_MIN: Record<NotifyKind, number> = {
  tank_warning: 60,
  safety: 15,
  brownout: 30,
  sensor: 60,
  offline: 0,
  online: 0,
  auto: 0, // tiap aksi otomatis dikabarkan; aksi dalam satu sync digabung jadi satu pesan
  test: 0,
};

/** Toggle di notify_settings yang mengizinkan jenis pesan ini (null = selalu; aksi otomatis disaring pemanggil per baris). */
const TOGGLE_OF: Record<NotifyKind, NotifyToggle | null> = {
  tank_warning: "tank_warning",
  safety: "safety",
  brownout: "brownout",
  sensor: "sensor",
  offline: "offline",
  online: "offline",
  auto: null,
  test: null,
};

/** Node dianggap offline (untuk peringatan WA) setelah sekian menit tanpa data. */
export const OFFLINE_ALERT_MIN = Math.max(1, Number(process.env.WA_OFFLINE_MIN) || 5);

export const DRY_RUN = process.env.WA_DRY_RUN === "1";
/** Server bisa mengirim (ada token). Nomor tujuan dicek per node. */
export const waEnabled = () => DRY_RUN || !!process.env.FONNTE_TOKEN;
export const envTarget = () => process.env.WA_TARGET?.trim() || null;

/** Setting notifikasi node; tanpa baris = semua aktif, nomor dari env. */
export async function getNotifyPrefs(deviceId: string): Promise<NotifyPrefs> {
  const [row] = await sql<NotifyPrefs[]>`
    select wa_target, ${sql(TOGGLE_KEYS)} from notify_settings where device_id = ${deviceId}`;
  return row ? { ...DEFAULT_PREFS, ...row } : { ...DEFAULT_PREFS };
}

const appUrl = () => {
  const u = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  return u ? u.replace(/\/$/, "") : null;
};

const fmtTime = (d: Date) =>
  d.toLocaleString("id-ID", { timeZone: APP_TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });

export const fmtDuration = (ms: number) => {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} menit`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} jam ${m % 60} menit` : `${h} jam`;
};

async function sendWhatsApp(target: string, message: string): Promise<{ ok: boolean; error?: string }> {
  if (DRY_RUN) {
    console.log(`[wa:dry-run] → ${target}\n${message}`);
    return { ok: true };
  }
  try {
    const res = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: process.env.FONNTE_TOKEN! },
      body: new URLSearchParams({ target, message, countryCode: "62" }),
      signal: AbortSignal.timeout(10_000),
    });
    // Fonnte membalas HTTP 200 juga saat gagal; status ada di body
    const j = (await res.json().catch(() => null)) as { status?: boolean; reason?: string } | null;
    if (res.ok && j?.status === true) return { ok: true };
    return { ok: false, error: String(j?.reason ?? `HTTP ${res.status}`).slice(0, 300) };
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 300) };
  }
}

/** sent = terkirim; skipped = nonaktif / dimatikan untuk node ini / tanpa nomor / masih cooldown; failed = gagal kirim. */
export type NotifyResult = { status: "sent" | "skipped" | "failed"; error?: string };

/** Kirim satu pesan untuk node + catat ke tabel notifications. `prefs` boleh diisi supaya tidak dibaca ulang. */
export async function notify(
  device: { id: string; name: string },
  kind: NotifyKind,
  text: string,
  at: Date = new Date(),
  prefs?: NotifyPrefs,
): Promise<NotifyResult> {
  if (!waEnabled()) return { status: "skipped", error: "FONNTE_TOKEN belum diisi di server" };
  const p = prefs ?? (await getNotifyPrefs(device.id));
  const toggle = TOGGLE_OF[kind];
  if (toggle && !p[toggle]) return { status: "skipped" };
  const target = p.wa_target || envTarget();
  if (!target) return { status: "skipped", error: "Nomor tujuan belum diisi" };
  const cd = COOLDOWN_MIN[kind];
  if (cd > 0) {
    const [recent] = await sql`
      select 1 from notifications
      where device_id = ${device.id} and kind = ${kind} and ok
        and ts > now() - make_interval(mins => ${cd})
      limit 1`;
    if (recent) return { status: "skipped" };
  }
  const url = appUrl();
  const message = [`🌱 *${device.name}* (${device.id})`, text, `🕒 ${fmtTime(at)}`, url && `${url}/devices/${device.id}`]
    .filter(Boolean)
    .join("\n");
  const r = await sendWhatsApp(target, message);
  await sql`
    insert into notifications (device_id, kind, message, ok, error)
    values (${device.id}, ${kind}, ${message}, ${r.ok}, ${r.error ?? null})`;
  if (!r.ok) console.error(`[wa] gagal kirim ${kind} untuk ${device.id}: ${r.error}`);
  return r.ok ? { status: "sent" } : { status: "failed", error: r.error };
}

const SAFETY_REASON: Record<string, string> = {
  "hard timeout": "pompa melewati batas 10 detik (timer cadangan)",
  "soil sensor invalid": "sensor tanah tidak valid",
  "DHT22 invalid": "sensor DHT22 tidak valid",
};

/** Event dari ESP32 yang layak dikabarkan lewat WA (null = tidak perlu). */
export function eventAlert(e: { actuator: string; action: string; value: number | null; reason?: string }):
  | { kind: NotifyKind; text: string }
  | null {
  if (e.actuator !== "system") return null;
  if (e.action === "tank_warning")
    return {
      kind: "tank_warning",
      text:
        `⚠️ *Tangki air kemungkinan kosong.* Pompa sudah ${e.value ?? "beberapa"} kali menyiram dalam 1 jam ` +
        `tapi tanah masih kering, jadi penyiraman otomatis dihentikan. Isi ulang tangki; peringatan hilang sendiri saat tanah basah lagi.`,
    };
  if (e.action === "safety") {
    const why = e.reason ? (SAFETY_REASON[e.reason] ?? e.reason) : "pengaman firmware";
    const dur = e.value != null ? ` setelah ${(e.value / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} detik` : "";
    return { kind: "safety", text: `🛑 *Pompa dihentikan paksa*${dur}: ${why}. Cek pompa dan sensor.` };
  }
  if (e.action === "boot" && e.reason === "brownout")
    return {
      kind: "brownout",
      text: "🔌 *ESP32 restart karena brownout* (tegangan turun). Cek adaptor/catu daya, biasanya terjadi saat pompa atau servo menyala.",
    };
  return null;
}

type AutoCtx = {
  settings?: Record<string, unknown>;
  // reading pada sync yang sama; hanya dipakai untuk event yang baru terjadi
  reading?: { soil_pct: number | null; temperature_c: number | null; humidity_pct: number | null };
};

const n1 = (v: number) => v.toLocaleString("id-ID", { maximumFractionDigits: 1 });

/** Satu baris pesan untuk aksi otomatis ESP32 (pompa / tutup), null = bukan aksi otomatis. */
export function autoActionLine(
  e: { actuator: string; action: string; value: number | null; trigger: string },
  ctx: AutoCtx,
): { toggle: "auto_pump" | "auto_lid"; text: string } | null {
  if (e.trigger !== "auto") return null;
  const S = ctx.settings ?? {};
  const R = ctx.reading;
  if (e.actuator === "pump" && e.action === "run") {
    const sec = e.value != null ? ` ${n1(e.value / 1000)} detik` : "";
    const flow = Number(S.pump_flow_ml_s) || 0;
    const ml = flow > 0 && e.value != null ? `, ±${Math.round((flow * e.value) / 1000)} ml` : "";
    const why = R?.soil_pct != null && S.soil_dry_pct != null ? ` (tanah ${n1(R.soil_pct)} %, batas ${S.soil_dry_pct} %)` : "";
    return { toggle: "auto_pump", text: `💧 Menyiram otomatis${sec}${ml}${why}` };
  }
  if (e.actuator === "lid" && (e.action === "open" || e.action === "close")) {
    const t = R?.temperature_c, h = R?.humidity_pct;
    let why = "";
    if (t != null && h != null) {
      if (e.action === "open") {
        const hot = S.temp_open_c != null && t >= Number(S.temp_open_c);
        const humid = S.hum_open_pct != null && h >= Number(S.hum_open_pct);
        why = hot
          ? ` (suhu ${n1(t)} °C ≥ ${n1(Number(S.temp_open_c))} °C)`
          : humid
            ? ` (RH ${n1(h)} % ≥ ${n1(Number(S.hum_open_pct))} %)`
            : ` (suhu ${n1(t)} °C, RH ${n1(h)} %)`;
      } else why = ` (suhu ${n1(t)} °C, RH ${n1(h)} %)`;
    }
    const text = e.action === "open" ? `🌬️ Tutup dibuka otomatis untuk ventilasi${why}` : `🔒 Tutup ditutup otomatis${why}`;
    return { toggle: "auto_lid", text };
  }
  return null;
}

/** Gabungkan aksi otomatis satu sync jadi satu pesan (banyak aksi = node baru tersambung lagi). */
export function autoActionsText(lines: { text: string; at: Date }[], max = 10): string {
  const time = (d: Date) => d.toLocaleTimeString("id-ID", { timeZone: APP_TZ, hour: "2-digit", minute: "2-digit" });
  if (lines.length === 1) return lines[0].text;
  const shown = lines.slice(0, max).map((l) => `• ${time(l.at)} ${l.text}`);
  if (lines.length > max) shown.push(`…dan ${lines.length - max} aksi lain (lihat log di dashboard)`);
  return `🤖 *${lines.length} aksi otomatis:*\n${shown.join("\n")}`;
}
