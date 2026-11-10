"use client";

import { useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtAxis, fmtDateTime, usePoll } from "@/lib/client";
import type { SeriesPoint } from "@/lib/types";
import type { Settings } from "@/lib/settings";

const RANGES = ["1h", "6h", "24h", "7d"] as const;
const C = { soil: "#2f7d4f", hum: "#3b82c4", temp: "#d9622b", pump: "#3b82c4", lid: "#d9a12b" };

export default function Charts({ id, settings }: { id: string; settings: Settings }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>("1h");
  const { data } = usePoll<SeriesPoint[]>(`/api/devices/${id}/readings?range=${range}`, range === "1h" ? 10_000 : 60_000);
  const long = range === "7d" || range === "24h";
  const rows = data ?? [];
  const tick = (t: string) => fmtAxis(t, long);
  const tip = { labelFormatter: (t: unknown) => fmtDateTime(String(t)), contentStyle: { borderRadius: 8, fontSize: 13 } };

  return (
    <section className="card">
      <div className="row between wrap">
        <h3>Riwayat sensor</h3>
        <div className="tabs">
          {RANGES.map((r) => (
            <button key={r} className={r === range ? "active" : ""} onClick={() => setRange(r)}>{r}</button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="muted empty">Belum ada data pada rentang ini.</p>
      ) : (
        <div className="chart-grid">
          <figure>
            <figcaption>Kelembapan tanah & udara (%) <Legend items={[["Tanah", C.soil], ["Udara", C.hum]]} /></figcaption>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="#e7e9e3" vertical={false} />
                <XAxis dataKey="t" tickFormatter={tick} minTickGap={40} fontSize={12} stroke="#8a8f85" />
                <YAxis domain={[0, 100]} fontSize={12} stroke="#8a8f85" />
                <Tooltip {...tip} formatter={(v) => `${v}%`} />
                <ReferenceLine y={settings.soil_dry_pct} stroke={C.soil} strokeDasharray="4 4" />
                <Line type="monotone" dataKey="soil_pct" name="Tanah" stroke={C.soil} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                <Line type="monotone" dataKey="humidity_pct" name="Udara" stroke={C.hum} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </figure>
          <figure>
            <figcaption>Suhu udara (°C) <Legend items={[["Suhu", C.temp], ["Ventilasi terbuka", C.lid]]} /></figcaption>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="#e7e9e3" vertical={false} />
                <XAxis dataKey="t" tickFormatter={tick} minTickGap={40} fontSize={12} stroke="#8a8f85" />
                <YAxis yAxisId="t" domain={["dataMin - 2", "dataMax + 2"]} allowDecimals={false} fontSize={12} stroke="#8a8f85" />
                <YAxis yAxisId="lid" orientation="right" hide domain={[0, 1]} />
                <Tooltip {...tip} formatter={(v, n) => (n === "Ventilasi" ? (v ? "terbuka" : "tertutup") : `${v}°C`)} />
                <Area yAxisId="lid" type="stepAfter" dataKey="lid_open" name="Ventilasi" fill={C.lid} fillOpacity={0.15} stroke="none" isAnimationActive={false} />
                <ReferenceLine yAxisId="t" y={settings.temp_open_c} stroke={C.temp} strokeDasharray="4 4" />
                <Line yAxisId="t" type="monotone" dataKey="temperature_c" name="Suhu" stroke={C.temp} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </figure>
        </div>
      )}
      <p className="muted small">Garis putus-putus = threshold siram dan threshold buka ventilasi.</p>
    </section>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <span className="legend">
      {items.map(([l, c]) => (
        <span key={l}><i style={{ background: c }} />{l}</span>
      ))}
    </span>
  );
}
