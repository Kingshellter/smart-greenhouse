// Setting notifikasi Telegram per node (tabel notify_settings). Dipakai server dan dashboard.

export const NOTIFY_TOGGLES = [
  { key: "tank_warning", group: "alert", label: "Tangki air kosong", desc: "Batas dosis per jam tercapai, penyiraman otomatis berhenti" },
  { key: "safety", group: "alert", label: "Pompa dihentikan pengaman", desc: "Batas 10 detik atau sensor invalid saat pompa jalan" },
  { key: "sensor", group: "alert", label: "Sensor tidak terbaca", desc: "Sensor tanah atau DHT22 kosong di 2 bacaan berturut-turut" },
  { key: "brownout", group: "alert", label: "Restart karena brownout", desc: "Tegangan ESP32 turun, biasanya catu daya kurang kuat" },
  { key: "offline", group: "alert", label: "Node offline / online lagi", desc: "Tidak ada data beberapa menit, lalu saat tersambung kembali" },
  { key: "auto_pump", group: "auto", label: "Siram otomatis", desc: "Tiap dosis pompa dari ESP32, dengan kelembapan tanah saat itu" },
  { key: "auto_lid", group: "auto", label: "Ventilasi otomatis", desc: "Tiap tutup dibuka/ditutup ESP32, dengan suhu dan RH saat itu" },
] as const;

export type NotifyToggle = (typeof NOTIFY_TOGGLES)[number]["key"];
export const TOGGLE_KEYS = NOTIFY_TOGGLES.map((t) => t.key) as NotifyToggle[];

export type NotifyPrefs = Record<NotifyToggle, boolean> & { tg_chat_id: string | null };

export const DEFAULT_PREFS: NotifyPrefs = {
  ...(Object.fromEntries(TOGGLE_KEYS.map((k) => [k, true])) as Record<NotifyToggle, boolean>),
  tg_chat_id: null,
};

/** Respons GET /api/devices/:id/notify */
export type NotifyInfo = NotifyPrefs & {
  /** token bot Telegram ada di server (atau NOTIFY_DRY_RUN) */
  enabled: boolean;
  dry_run: boolean;
  /** ada TELEGRAM_CHAT_ID di env yang dipakai kalau chat ID node kosong */
  env_target: boolean;
  /** username bot (tanpa @), null kalau token kosong / tidak valid */
  bot: string | null;
};

/** Satu chat yang pernah mengirim pesan ke bot (GET /api/notify/chats). */
export type TelegramChat = { id: string; type: string; name: string };

/**
 * Rapikan daftar chat ID: pisah koma/baris, buang spasi.
 * Chat ID angka (grup/kanal diawali "-", mis. -100…) atau @namakanal, maks 10. "" → null. String = pesan error.
 */
export function parseChatIds(v: unknown): string | null | { error: string } {
  if (v == null) return null;
  if (typeof v !== "string") return { error: "Chat ID harus teks" };
  const items = v.split(/[,\n;]/).map((x) => x.trim()).filter(Boolean);
  if (!items.length) return null;
  if (items.length > 10) return { error: "Maksimal 10 chat ID" };
  for (const id of items) {
    if (!/^-?\d{5,20}$/.test(id) && !/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(id)) return { error: `Chat ID tidak valid: ${id}` };
  }
  return [...new Set(items)].join(",");
}
