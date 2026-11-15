// Preset tanaman = subset setting yang bergantung pada jenis tanaman.
// Kalibrasi sensor, dosis pompa, dan sudut servo TIDAK ikut preset (itu milik alat, bukan tanaman).

import { NUMERIC_LIMITS, type Settings } from "./settings";

export const PRESET_FIELDS = ["soil_dry_pct", "temp_open_c", "temp_close_c", "hum_open_pct", "hum_close_pct"] as const;
export type PresetField = (typeof PRESET_FIELDS)[number];
export type PresetValues = Pick<Settings, PresetField>;

export type Preset = PresetValues & {
  id: number;
  name: string;
  builtin: boolean;
  source: string | null;
  note: string | null;
};

/** Validasi nilai preset (rentang sama dengan setting + aturan hysteresis). Return error string atau nilai bersih. */
export function validatePreset(body: Record<string, unknown>): PresetValues | string {
  const out = {} as PresetValues;
  for (const k of PRESET_FIELDS) {
    const [min, max] = NUMERIC_LIMITS[k];
    const n = Number(body[k]);
    if (body[k] === undefined || body[k] === "" || !Number.isFinite(n) || n < min || n > max) return `${k} harus di antara ${min} dan ${max}`;
    out[k] = n;
  }
  if (out.temp_close_c >= out.temp_open_c) return "Suhu tutup harus lebih kecil dari suhu buka";
  if (out.hum_close_pct >= out.hum_open_pct) return "RH tutup harus lebih kecil dari RH buka";
  return out;
}

export function cleanName(v: unknown): string | null {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  return s.length >= 2 && s.length <= 40 ? s : null;
}

/** true jika setting node masih sama persis dengan nilai preset. */
export const matchesPreset = (s: PresetValues, p: PresetValues) => PRESET_FIELDS.every((k) => Number(s[k]) === Number(p[k]));
