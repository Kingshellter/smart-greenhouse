"use client";

// Kartu di kiri panggung: tiga sensor. Tiap kartu: label + status, nilai sekarang + ambang yang
// dipakai, lalu grafik kecil riwayat selebar kartu (rentang bersama, lib/range.ts). Riwayat pompa ada di popup Pompa (DeviceBar).
// Saat ESP32 offline nilainya data lama: diredupkan dan statusnya diganti umur data.
// Grafik lengkap ada di kartu hotspot 3D.

import type { ReactNode } from "react";
import { ago, fmt, usePoll } from "@/lib/client";
import type { DeviceState, SeriesPoint } from "@/lib/types";
import { SERIES } from "@/lib/chart";
import { rangeLabel, rangePollMs, useRange } from "@/lib/range";
import type { Badge } from "./Greenhouse3D";
import { Icon, type IconName } from "./icons";
import { MiniArea } from "./Charts";

export default function SensorCards({ id, state, soilBadge, tempBadge, humBadge }: {
  id: string; state: DeviceState; soilBadge?: Badge; tempBadge?: Badge; humBadge?: Badge;
}) {
  const s = state.settings, r = state.reading;
  // rentang mengikuti pilihan di popup perangkat / kartu hotspot
  const [range] = useRange();
  const { data: rows } = usePoll<SeriesPoint[]>(`/api/devices/${id}/readings?range=${range}`, rangePollMs(range));
  const span = rangeLabel(range);
  const loading = !rows;
  // offline: tampilkan umur data, bukan status "Normal/Kering" yang bisa sudah tidak berlaku
  const stale = !state.device.online && r ? ago(r.ts) : null;
  return (
    <div className="sensor-cards">
      <SensorCard icon="soil" label="Kelembapan tanah" color={SERIES.soil} value={fmt(r?.soil_pct, 0)} unit="%" badge={soilBadge}
                  hint={`siram < ${s.soil_dry_pct}% · ${span}`} stale={stale}>
        <MiniArea compact rows={rows} loading={loading} dataKey="soil_pct" color={SERIES.soil} unit="%" label="Tanah" domain={[0, 100]} refY={s.soil_dry_pct} />
      </SensorCard>
      <SensorCard icon="temp" label="Suhu udara" color={SERIES.temp} value={fmt(r?.temperature_c, 1)} unit="°C" badge={tempBadge}
                  hint={`buka ≥ ${s.temp_open_c}°C · ${span}`} stale={stale}>
        <MiniArea compact rows={rows} loading={loading} dataKey="temperature_c" color={SERIES.temp} unit="°C" label="Suhu" refY={s.temp_open_c} />
      </SensorCard>
      <SensorCard icon="humidity" label="Kelembapan udara" color={SERIES.hum} value={fmt(r?.humidity_pct, 0)} unit="%" badge={humBadge}
                  hint={`buka ≥ ${s.hum_open_pct}% · ${span}`} stale={stale}>
        <MiniArea compact rows={rows} loading={loading} dataKey="humidity_pct" color={SERIES.hum} unit="%" label="RH" domain={[0, 100]} refY={s.hum_open_pct} />
      </SensorCard>
    </div>
  );
}

function SensorCard({ icon, label, color, value, unit, badge, hint, stale, children }: {
  icon: IconName; label: string; color: string; value: string; unit: string; badge?: Badge; hint: string;
  /** Umur data bila ESP32 offline (mis. "13 jam lalu"); null = data langsung. */
  stale: string | null;
  children: ReactNode;
}) {
  return (
    <section className={`card sensor-card ${stale ? "stale" : ""}`}>
      <div className="sensor-top">
        <span className="sensor-label" style={{ color }}><Icon name={icon} size={16} /><b>{label}</b></span>
        {stale ? <span className="stat-status stale"><Icon name="clock" size={13} />{stale}</span>
          : badge && <span className={`stat-status ${badge.warn ? "warn" : ""} ${badge.tone ?? ""}`}><i />{badge.text}</span>}
      </div>
      <p className="sensor-value">{value}{unit && value !== "—" && <span>{unit}</span>}</p>
      <p className="sensor-hint">{hint}</p>
      <div className="sensor-chart">{children}</div>
    </section>
  );
}
