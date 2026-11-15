"use client";

// Grafik kecil yang dipakai di kartu hotspot: area riwayat sensor dan batang harian.

import { Area, AreaChart, Bar, BarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDateTime } from "@/lib/client";
import type { Analytics, DailyStat, SeriesPoint } from "@/lib/types";
import { AXIS, GRID, TOOLTIP_STYLE } from "@/lib/chart";

/** `compact` = versi kecil di kartu sensor kiri: tanpa label garis ambang, tinggi mengikuti wadahnya. */
export function MiniArea({ rows, loading, dataKey, color, unit, label, domain, refY, refLabel, compact }: {
  rows: SeriesPoint[] | null | undefined; loading: boolean; dataKey: keyof SeriesPoint; color: string; unit: string; label: string;
  domain?: [number, number]; refY?: number; refLabel?: string; compact?: boolean;
}) {
  const has = !!rows?.some((p) => p[dataKey] != null);
  if (!has) return <div className="chart-empty mini">{loading ? "Memuat…" : compact ? "—" : "Belum ada data"}</div>;
  const gid = `fill-${String(dataKey)}`;
  return (
    <div className="mini-chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows ?? []} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity={compact ? 0.22 : 0.28} />
              <stop offset="1" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="t" hide />
          <YAxis hide domain={domain ?? ["dataMin - 2", "dataMax + 2"]} />
          <Tooltip
            labelFormatter={(t) => fmtDateTime(String(t))}
            formatter={(v) => [`${v}${unit}`, label]}
            contentStyle={TOOLTIP_STYLE}
            cursor={{ stroke: color, strokeOpacity: 0.3 }}
          />
          {refY != null && (
            <ReferenceLine y={refY} stroke={color} strokeOpacity={0.6} strokeDasharray="3 3" ifOverflow="extendDomain"
                           label={compact ? undefined : { value: `${refLabel} ${refY}${unit}`, position: "insideTopRight", fontSize: 10, fill: "#9aa197" }} />
          )}
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.8} fill={`url(#${gid})`} connectNulls isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const shortDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });

/** API hanya mengirim hari yang ada datanya; isi hari kosong supaya grafik selalu menampilkan `days` batang. */
function fillDays(data: Analytics): DailyStat[] {
  const byDay = new Map(data.daily.map((d) => [d.day, d]));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const base = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: Math.max(data.days, 1) }, (_, i) => {
    const day = new Date(base - (data.days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    return byDay.get(day) ?? { day, pump_runs: 0, pump_auto: 0, pump_ms: 0, water_ml: null, lid_opens: 0, safety_stops: 0 };
  });
}

export function DayBars({ data, bars, empty, unit = "", compact }: {
  data: Analytics | null | undefined; empty: string; unit?: string; compact?: boolean;
  bars: { key: (d: DailyStat) => number; name: string; color: string }[];
}) {
  if (!data || data.daily.length === 0) return <div className="chart-empty mini">{data ? (compact ? "—" : empty) : "Memuat…"}</div>;
  return (
    <div className="mini-chart bars">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={fillDays(data)} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <XAxis dataKey="day" tickFormatter={shortDay} {...AXIS} minTickGap={16} hide={compact} />
          <Tooltip labelFormatter={(d) => shortDay(String(d))} formatter={(v) => `${v}${unit}`} contentStyle={TOOLTIP_STYLE} cursor={{ fill: GRID }} />
          {bars.map((b, i) => (
            <Bar key={b.name} dataKey={b.key} name={b.name} stackId="s" fill={b.color} maxBarSize={22} isAnimationActive={false}
                 radius={i === bars.length - 1 ? [5, 5, 0, 0] : undefined} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
