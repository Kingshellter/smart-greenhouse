import type { Settings } from "./settings";

export type Reading = {
  ts: string;
  soil_raw: number | null;
  soil_pct: number | null;
  temperature_c: number | null;
  humidity_pct: number | null;
  lid_state: "open" | "closed" | "maintenance" | null;
  lid_angle: number | null;
  pump_state: "on" | "off" | null;
  mode: "auto" | "manual" | null;
  tank_warning: boolean;
  rssi: number | null;
};

export type DeviceState = {
  device: { id: string; name: string; last_seen: string | null; online: boolean };
  settings: Settings & { updated_at: string };
  reading: Reading | null;
  pending_commands: number;
};

export type DeviceSummary = {
  id: string;
  name: string;
  last_seen: string | null;
  mode: string | null;
  ts: string | null;
  soil_pct: number | null;
  temperature_c: number | null;
  humidity_pct: number | null;
  lid_state: string | null;
  pump_state: string | null;
  tank_warning: boolean | null;
};

export type SeriesPoint = {
  t: string;
  soil_pct: number | null;
  temperature_c: number | null;
  humidity_pct: number | null;
  pump_on: number;
  lid_open: number;
};

export type ActuatorEvent = {
  id: number;
  ts: string;
  actuator: "pump" | "lid" | "mode" | "system";
  action: string;
  value: number | null;
  trigger: string;
  detail: Record<string, unknown> | null;
};

export type DailyStat = {
  day: string;
  readings?: number;
  temp_min?: number | null; temp_max?: number | null; temp_avg?: number | null;
  hum_min?: number | null; hum_max?: number | null; hum_avg?: number | null;
  soil_min?: number | null; soil_max?: number | null; soil_avg?: number | null;
  lid_open_pct?: number | null;
  pump_runs: number; pump_auto: number; pump_ms: number; water_ml: number | null;
  lid_opens: number; safety_stops: number;
};

export type Analytics = {
  days: number;
  timezone: string;
  totals: { days: number; pump_runs: number; pump_seconds: number; water_ml: number | null; lid_opens: number; safety_stops: number };
  daily: DailyStat[];
};
