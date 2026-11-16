// Daftar setting yang boleh diubah dari web + batas validasinya.
// Nama kolom = nama field di DB = nama field yang dikirim ke ESP32.

export type Settings = {
  mode: "auto" | "manual";
  soil_dry_pct: number;
  dose_ms: number;
  soak_s: number;
  max_doses_per_hour: number;
  temp_open_c: number;
  temp_close_c: number;
  hum_open_pct: number;
  hum_close_pct: number;
  lid_closed_deg: number;
  lid_open_deg: number;
  lid_maint_deg: number;
  soil_raw_dry: number;
  soil_raw_wet: number;
  report_interval_s: number;
  pump_flow_ml_s: number;
};

export const NUMERIC_LIMITS: Record<Exclude<keyof Settings, "mode">, [number, number]> = {
  soil_dry_pct: [5, 90],
  dose_ms: [500, 10000], // firmware juga membatasi maks 10 s
  soak_s: [10, 3600],
  max_doses_per_hour: [1, 30],
  temp_open_c: [15, 50],
  temp_close_c: [10, 49],
  hum_open_pct: [30, 100],
  hum_close_pct: [20, 99],
  lid_closed_deg: [0, 180],
  lid_open_deg: [0, 180],
  lid_maint_deg: [0, 180],
  soil_raw_dry: [0, 4095],
  soil_raw_wet: [0, 4095],
  report_interval_s: [2, 300],
  pump_flow_ml_s: [0, 100],
};

/** Kecepatan servo tutup (°/s) untuk animasi 3D. Tetap, sama dengan SERVO_STEP_MS = 15 ms/° di firmware. */
export const SERVO_DEG_PER_S = 1000 / 15;

export const SETTINGS_COLUMNS =["mode", ...Object.keys(NUMERIC_LIMITS)] as (keyof Settings)[];

/** Validasi patch parsial, gabungkan dengan setting lama. Return error string atau setting baru. */
export function mergeSettings(current: Settings, patch: Record<string, unknown>): Settings | string {
  const next: Settings = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (k === "mode") {
      if (v !== "auto" && v !== "manual") return "mode harus auto atau manual";
      next.mode = v;
      continue;
    }
    const lim = NUMERIC_LIMITS[k as keyof typeof NUMERIC_LIMITS];
    if (!lim) continue; // abaikan field tak dikenal
    const n = Number(v);
    if (!Number.isFinite(n) || n < lim[0] || n > lim[1]) return `${k} harus di antara ${lim[0]} dan ${lim[1]}`;
    (next as Record<string, unknown>)[k] = n;
  }
  if (next.temp_close_c >= next.temp_open_c) return "temp_close_c harus lebih kecil dari temp_open_c";
  if (next.hum_close_pct >= next.hum_open_pct) return "hum_close_pct harus lebih kecil dari hum_open_pct";
  if (Math.abs(next.lid_open_deg - next.lid_closed_deg) > 90) return "Selisih sudut buka dan tutup maksimal 90°";
  if (Math.abs(next.lid_maint_deg - next.lid_closed_deg) > 90) return "Selisih sudut maintenance dan tutup maksimal 90°";
  if (Math.abs(next.soil_raw_dry - next.soil_raw_wet) < 200) return "Kalibrasi kering dan basah terlalu dekat";
  return next;
}
