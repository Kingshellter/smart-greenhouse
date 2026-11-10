"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmt, usePoll } from "@/lib/client";
import type { Analytics } from "@/lib/types";

const shortDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });

export default function AnalyticsPanel({ id, hasFlow }: { id: string; hasFlow: boolean }) {
  const [days, setDays] = useState(7);
  const { data } = usePoll<Analytics>(`/api/devices/${id}/analytics?days=${days}`, 60_000);
  const t = data?.totals;

  return (
    <section className="card">
      <div className="row between wrap">
        <h3>Analitik</h3>
        <div className="tabs">
          {[1, 7, 30].map((d) => (
            <button key={d} className={d === days ? "active" : ""} onClick={() => setDays(d)}>{d === 1 ? "Hari ini" : `${d} hari`}</button>
          ))}
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Penyiraman" value={t ? String(t.pump_runs) : "—"} sub="kali" />
        <Kpi label="Durasi pompa" value={t ? fmt(t.pump_seconds, 0) : "—"} sub="detik total" />
        <Kpi label="Air terpakai" value={t?.water_ml != null ? String(t.water_ml) : "—"} sub={hasFlow ? "ml (estimasi)" : "isi debit pompa di setting"} />
        <Kpi label="Ventilasi dibuka" value={t ? String(t.lid_opens) : "—"} sub="kali" />
        <Kpi label="Safety stop" value={t ? String(t.safety_stops) : "—"} sub="pompa dihentikan paksa" />
      </div>

      {data && data.daily.length > 0 ? (
        <>
          <figure>
            <figcaption>Penyiraman per hari</figcaption>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.daily} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid stroke="#e7e9e3" vertical={false} />
                <XAxis dataKey="day" tickFormatter={shortDay} fontSize={12} stroke="#8a8f85" />
                <YAxis allowDecimals={false} fontSize={12} stroke="#8a8f85" />
                <Tooltip labelFormatter={(d) => shortDay(String(d))} contentStyle={{ borderRadius: 8, fontSize: 13 }} />
                <Bar dataKey="pump_auto" name="Otomatis" stackId="p" fill="#2f7d4f" isAnimationActive={false} />
                <Bar dataKey={(d: { pump_runs: number; pump_auto: number }) => d.pump_runs - d.pump_auto} name="Manual (web)" stackId="p" fill="#9cc7aa" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </figure>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Suhu min / rata / maks</th>
                  <th>RH min / rata / maks</th>
                  <th>Tanah min / rata / maks</th>
                  <th>Siram</th>
                  <th>Ventilasi terbuka</th>
                </tr>
              </thead>
              <tbody>
                {[...data.daily].reverse().map((d) => (
                  <tr key={d.day}>
                    <td>{shortDay(d.day)}</td>
                    <td>{fmt(d.temp_min)} / {fmt(d.temp_avg)} / {fmt(d.temp_max)} °C</td>
                    <td>{fmt(d.hum_min, 0)} / {fmt(d.hum_avg, 0)} / {fmt(d.hum_max, 0)} %</td>
                    <td>{fmt(d.soil_min, 0)} / {fmt(d.soil_avg, 0)} / {fmt(d.soil_max, 0)} %</td>
                    <td>{d.pump_runs}× ({fmt(d.pump_ms / 1000, 0)} s{d.water_ml != null ? `, ${d.water_ml} ml` : ""})</td>
                    <td>{fmt(d.lid_open_pct, 0, "%")} waktu · {d.lid_opens}×</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="muted empty">Belum ada data untuk dianalisis.</p>
      )}
    </section>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="kpi">
      <p className="stat-label">{label}</p>
      <p className="kpi-value">{value}</p>
      <p className="stat-sub">{sub}</p>
    </div>
  );
}
