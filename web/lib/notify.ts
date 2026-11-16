// Notifikasi lewat bot Telegram (https://core.telegram.org/bots/api).
// Server hanya MENGABARKAN kejadian; keputusan aktuator tetap di ESP32.
//
// Env (berlaku untuk semua node):
//   TELEGRAM_BOT_TOKEN  token bot dari @BotFather
//   TELEGRAM_CHAT_ID    chat ID tujuan bawaan, pisahkan koma (angka; grup diawali -100…, atau @namakanal).
//                       Tiap node bisa punya chat ID sendiri + pilihan jenis pesan (tabel notify_settings,
//                       diatur dari tombol lonceng di dashboard node).
//   NOTIFY_DRY_RUN=1    jangan kirim, cukup tulis ke log server (untuk uji)
//   APP_URL             opsional, untuk tautan dashboard di pesan (di Vercel otomatis dari domain production)

import { sql, APP_TZ } from "@/lib/db";
import { DEFAULT_PREFS, TOGGLE_KEYS, type NotifyPrefs, type NotifyToggle, type TelegramChat } from "@/lib/notify-prefs";

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

/** Node dianggap offline (untuk peringatan Telegram) setelah sekian menit tanpa data. */
export const OFFLINE_ALERT_MIN = Math.max(1, Number(process.env.NOTIFY_OFFLINE_MIN) || 5);

export const DRY_RUN = process.env.NOTIFY_DRY_RUN === "1";
const token = () => process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
/** Server bisa mengirim (ada token bot). Chat ID tujuan dicek per node. */
export const notifyEnabled = () => DRY_RUN || !!token();
export const envTarget = () => process.env.TELEGRAM_CHAT_ID?.trim() || null;

/** Setting notifikasi node; tanpa baris = semua aktif, chat ID dari env. */
export async function getNotifyPrefs(deviceId: string): Promise<NotifyPrefs> {
  const [row] = await sql<NotifyPrefs[]>`
    select tg_chat_id, ${sql(TOGGLE_KEYS)} from notify_settings where device_id = ${deviceId}`;
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

/** Panggil Bot API. Error dari Telegram dikembalikan sebagai teks (`description`). */
export async function telegram<T>(method: string, body?: Record<string, unknown>): Promise<{ ok: true; result: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(10_000),
    });
    const j = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
    if (j?.ok) return { ok: true, result: j.result as T };
    return { ok: false, error: String(j?.description ?? `HTTP ${res.status}`).slice(0, 300) };
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 300) };
  }
}

let botCache: { token: string; username: string | null } | null = null;
/** Username bot (tanpa @), di-cache per token. null = token kosong / ditolak Telegram. */
export async function botUsername(): Promise<string | null> {
  const t = token();
  if (!t) return null;
  if (botCache?.token === t) return botCache.username;
  const r = await telegram<{ username?: string }>("getMe");
  const username = r.ok ? (r.result.username ?? null) : null;
  if (r.ok) botCache = { token: t, username };
  return username;
}

/**
 * Chat yang baru mengirim pesan ke bot (mis. /start), untuk mengisi chat ID tanpa mencari manual.
 * Telegram hanya menyimpan update ±24 jam dan hanya kalau bot tidak memakai webhook.
 */
export async function recentChats(): Promise<{ ok: true; chats: TelegramChat[] } | { ok: false; error: string }> {
  type Chat = { id: number; type: string; title?: string; username?: string; first_name?: string; last_name?: string };
  type Update = { message?: { chat: Chat }; edited_message?: { chat: Chat }; channel_post?: { chat: Chat }; my_chat_member?: { chat: Chat } };
  const r = await telegram<Update[]>("getUpdates", { limit: 100, allowed_updates: ["message", "channel_post", "my_chat_member"] });
  if (!r.ok) return r;
  const seen = new Map<string, TelegramChat>();
  for (const u of r.result) {
    const c = (u.message ?? u.edited_message ?? u.channel_post ?? u.my_chat_member)?.chat;
    if (!c) continue;
    const name = c.title ?? ([c.first_name, c.last_name].filter(Boolean).join(" ") || (c.username ? `@${c.username}` : String(c.id)));
    seen.set(String(c.id), { id: String(c.id), type: c.type, name });
  }
  return { ok: true, chats: [...seen.values()].reverse() };
}

/** Teks pesan memakai *tebal* (gaya chat); Telegram dikirim sebagai HTML supaya simbol lain tidak merusak format. */
const toHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\*([^*\n]+)\*/g, "<b>$1</b>");

async function sendTelegram(targets: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const ids = targets.split(",").map((t) => t.trim()).filter(Boolean);
  if (DRY_RUN) {
    console.log(`[telegram:dry-run] → ${ids.join(", ")}\n${message}`);
    return { ok: true };
  }
  const errors: string[] = [];
  for (const chat_id of ids) {
    const r = await telegram("sendMessage", { chat_id, text: toHtml(message), parse_mode: "HTML", link_preview_options: { is_disabled: true } });
    if (!r.ok) errors.push(`${chat_id}: ${r.error}`);
  }
  // berhasil kalau minimal satu chat menerima; chat yang gagal tetap dicatat
  return errors.length < ids.length ? { ok: true, error: errors.join("; ") || undefined } : { ok: false, error: errors.join("; ").slice(0, 300) };
}

/** sent = terkirim; skipped = nonaktif / dimatikan untuk node ini / tanpa chat ID / masih cooldown; failed = gagal kirim. */
export type NotifyResult = { status: "sent" | "skipped" | "failed"; error?: string };

/** Kirim satu pesan untuk node + catat ke tabel notifications. `prefs` boleh diisi supaya tidak dibaca ulang. */
export async function notify(
  device: { id: string; name: string },
  kind: NotifyKind,
  text: string,
  at: Date = new Date(),
  prefs?: NotifyPrefs,
): Promise<NotifyResult> {
  if (!notifyEnabled()) return { status: "skipped", error: "TELEGRAM_BOT_TOKEN belum diisi di server" };
  const p = prefs ?? (await getNotifyPrefs(device.id));
  const toggle = TOGGLE_OF[kind];
  if (toggle && !p[toggle]) return { status: "skipped" };
  const target = p.tg_chat_id || envTarget();
  if (!target) return { status: "skipped", error: "Chat ID tujuan belum diisi" };
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
  const r = await sendTelegram(target, message);
  await sql`
    insert into notifications (device_id, kind, message, ok, error)
    values (${device.id}, ${kind}, ${message}, ${r.ok}, ${r.error ?? null})`;
  if (r.error) console.error(`[telegram] ${r.ok ? "sebagian gagal" : "gagal"} kirim ${kind} untuk ${device.id}: ${r.error}`);
  return r.ok ? { status: "sent" } : { status: "failed", error: r.error };
}

const SAFETY_REASON: Record<string, string> = {
  "hard timeout": "pompa melewati batas 10 detik (timer cadangan)",
  "soil sensor invalid": "sensor tanah tidak valid",
  "DHT22 invalid": "sensor DHT22 tidak valid",
};

/** Event dari ESP32 yang layak dikabarkan lewat Telegram (null = tidak perlu). */
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
