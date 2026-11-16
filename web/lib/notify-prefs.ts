// Setting notifikasi WhatsApp per node (tabel notify_settings). Dipakai server dan dashboard.

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

export type NotifyPrefs = Record<NotifyToggle, boolean> & { wa_target: string | null };

export const DEFAULT_PREFS: NotifyPrefs = {
  ...(Object.fromEntries(TOGGLE_KEYS.map((k) => [k, true])) as Record<NotifyToggle, boolean>),
  wa_target: null,
};

/** Respons GET /api/devices/:id/notify */
export type NotifyInfo = NotifyPrefs & {
  /** token Fonnte ada di server (atau WA_DRY_RUN) */
  enabled: boolean;
  dry_run: boolean;
  /** ada WA_TARGET di env yang dipakai kalau nomor node kosong */
  env_target: boolean;
};

/**
 * Rapikan daftar nomor: pisah koma/baris, buang spasi, tanda hubung dan "+".
 * Nomor 8–15 digit atau ID grup Fonnte (…@g.us), maks 10. "" → null. String = pesan error.
 */
export function parseTargets(v: unknown): string | null | { error: string } {
  if (v == null) return null;
  if (typeof v !== "string") return { error: "Nomor tujuan harus teks" };
  const items = v.split(/[,\n;]/).map((x) => x.trim()).filter(Boolean);
  if (!items.length) return null;
  if (items.length > 10) return { error: "Maksimal 10 nomor tujuan" };
  const out: string[] = [];
  for (const raw of items) {
    if (/^\d{10,30}@g\.us$/.test(raw)) { out.push(raw); continue; }
    const n = raw.replace(/[\s\-().]/g, "").replace(/^\+/, "");
    if (!/^\d{8,15}$/.test(n)) return { error: `Nomor tidak valid: ${raw}` };
    out.push(n);
  }
  return [...new Set(out)].join(",");
}
