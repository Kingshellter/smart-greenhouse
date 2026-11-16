// Notifikasi WhatsApp lewat Fonnte (https://fonnte.com).
// Server hanya MENGABARKAN kejadian; keputusan aktuator tetap di ESP32.
//
// Env:
//   FONNTE_TOKEN  token device dari dashboard Fonnte
//   WA_TARGET     nomor tujuan, pisahkan koma (08xx / 628xx). Boleh juga ID grup Fonnte.
//   WA_DRY_RUN=1  jangan kirim, cukup tulis ke log server (untuk uji)
//   APP_URL       opsional, untuk tautan dashboard di pesan (di Vercel otomatis dari domain production)

import { sql, APP_TZ } from "@/lib/db";

export type NotifyKind = "tank_warning" | "safety" | "brownout" | "sensor" | "offline" | "online";

/** Jeda minimum antar pesan sejenis per node, supaya tidak spam. offline/online diatur oleh state, bukan cooldown. */
const COOLDOWN_MIN: Record<NotifyKind, number> = {
  tank_warning: 60,
  safety: 15,
  brownout: 30,
  sensor: 60,
  offline: 0,
  online: 0,
};

/** Node dianggap offline (untuk peringatan WA) setelah sekian menit tanpa data. */
export const OFFLINE_ALERT_MIN = Math.max(1, Number(process.env.WA_OFFLINE_MIN) || 5);

const DRY_RUN = process.env.WA_DRY_RUN === "1";
export const waEnabled = () => DRY_RUN || !!(process.env.FONNTE_TOKEN && process.env.WA_TARGET);

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

async function sendWhatsApp(message: string): Promise<{ ok: boolean; error?: string }> {
  if (DRY_RUN) {
    console.log(`[wa:dry-run] →\n${message}`);
    return { ok: true };
  }
  try {
    const res = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: process.env.FONNTE_TOKEN! },
      body: new URLSearchParams({ target: process.env.WA_TARGET!, message, countryCode: "62" }),
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

/**
 * Kirim satu pesan untuk node + catat ke tabel notifications.
 * Mengembalikan true jika terkirim; false jika nonaktif, masih cooldown, atau gagal.
 */
export async function notify(
  device: { id: string; name: string },
  kind: NotifyKind,
  text: string,
  at: Date = new Date(),
): Promise<boolean> {
  if (!waEnabled()) return false;
  const cd = COOLDOWN_MIN[kind];
  if (cd > 0) {
    const [recent] = await sql`
      select 1 from notifications
      where device_id = ${device.id} and kind = ${kind} and ok
        and ts > now() - make_interval(mins => ${cd})
      limit 1`;
    if (recent) return false;
  }
  const url = appUrl();
  const message = [`🌱 *${device.name}* (${device.id})`, text, `🕒 ${fmtTime(at)}`, url && `${url}/devices/${device.id}`]
    .filter(Boolean)
    .join("\n");
  const r = await sendWhatsApp(message);
  await sql`
    insert into notifications (device_id, kind, message, ok, error)
    values (${device.id}, ${kind}, ${message}, ${r.ok}, ${r.error ?? null})`;
  if (!r.ok) console.error(`[wa] gagal kirim ${kind} untuk ${device.id}: ${r.error}`);
  return r.ok;
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
