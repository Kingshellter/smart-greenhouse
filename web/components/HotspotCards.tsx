"use client";

// Isi kartu yang muncul saat titik info (hotspot) di model 3D ditekan:
// nilai sekarang + posisinya terhadap ambang, grafik riwayat / harian, dan kontrol bagian itu (tutup, siram).
// Kartu hanya dirender saat terbuka, jadi datanya juga hanya diambil saat itu. Kartu yang sama dipakai
// di popup perangkat (DeviceBar), di atas kalibrasinya.

import { useState } from "react";
import { RANGES, rangePollMs, useRange } from "@/lib/range";
import { dayKey, fmt, usePoll } from "@/lib/client";
import type { Analytics, DailyStat, DeviceState, SeriesPoint } from "@/lib/types";
import { SERIES } from "@/lib/chart";
import type { Badge } from "./Greenhouse3D";
import { Icon, type IconName } from "./icons";
import { Gauge, gaugeFor, Seg, Tabs } from "./ui";
import { DayBars, MiniArea } from "./charts";


/** Kenapa kontrol terkunci (null = bisa dipakai). `toManual` = jalan pintas pindah mode dari kartu. */
export type Lock = { reason: string; toManual?: () => void } | null;

function Chip({ badge }: { badge?: Badge }) {
  if (!badge) return null;
  return <span className={`chip-s ${badge.warn ? "warn" : badge.tone === "idle" ? "" : badge.tone === "on" ? "sync" : "ok"}`}>{badge.text}</span>;
}

/** Kepala kartu: nama bagian, nilai besar, status, dan satu baris keterangan. */
function Head({ icon, label, value, unit, badge, meta }: {
  icon: IconName; label: string; value: string; unit?: string; badge?: Badge; meta?: string;
}) {
  return (
    <div className="hc-top">
      <p className="hc-label"><Icon name={icon} size={15} />{label}</p>
      <p className="hc-valrow">
        <span className="hc-value">{value}{unit && value !== "—" && <span>{unit}</span>}</span>
        <Chip badge={badge} />
      </p>
      {meta && <p className="hc-sub">{meta}</p>}
    </div>
  );
}

/** Deret angka ringkas: label kecil di atas, nilai di bawah. `title` = keterangan periodenya. */
function Stats({ title, items }: { title?: string; items: [string, string][] }) {
  return (
    <div className="hc-statwrap">
      {title && <p className="hc-sub">{title}</p>}
      <dl className="hc-stats">
        {items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
    </div>
  );
}

type Num = number | null | undefined;
const todayStats = (v: [Num, Num, Num], digits: number, unit: string): [string, string][] => [
  ["Min", fmt(v[0], digits, unit)],
  ["Rerata", fmt(v[1], digits, unit)],
  ["Maks", fmt(v[2], digits, unit)],
];

/** Riwayat sensor dengan pilihan rentang (dipakai bersama seluruh dasbor) + ringkasan hari ini dari modul analitik. */
function useHistory(id: string) {
  const [range, setRange] = useRange();
  const { data: rows } = usePoll<SeriesPoint[]>(`/api/devices/${id}/readings?range=${range}`, rangePollMs(range));
  const { data: today } = usePoll<Analytics>(`/api/devices/${id}/analytics?days=1`, 60_000);
  const tabs = <Tabs value={range} onChange={setRange} options={RANGES} />;
  return { rows, loading: !rows, tabs, d: today?.daily.at(-1) };
}

export function SoilCard({ id, state, badge }: { id: string; state: DeviceState; badge?: Badge }) {
  const s = state.settings, r = state.reading;
  const h = useHistory(id);
  return (
    <div className="hc">
      <Head icon="soil" label="Kelembapan tanah" value={fmt(r?.soil_pct, 0)} unit="%" badge={badge} />
      <Gauge {...gaugeFor.soil(s)} value={r?.soil_pct} color={SERIES.soil} warn={badge?.warn} />
      {h.tabs}
      <MiniArea rows={h.rows} loading={h.loading} dataKey="soil_pct" color={SERIES.soil} unit="%" label="Tanah"
                domain={[0, 100]} refY={s.soil_dry_pct} refLabel="siram" />
      <Stats title="Hari ini" items={todayStats([h.d?.soil_min, h.d?.soil_avg, h.d?.soil_max], 0, "%")} />
    </div>
  );
}

type Metric = "temp" | "hum";

/** Suhu dan RH dalam satu kartu: dua nilai selalu terlihat, salah satunya dipilih untuk skala + grafik. */
export function AirCard({ id, state, tempBadge, humBadge }: { id: string; state: DeviceState; tempBadge?: Badge; humBadge?: Badge }) {
  const s = state.settings, r = state.reading;
  const h = useHistory(id);
  // buka langsung di metrik yang sedang bermasalah
  const [m, setM] = useState<Metric>(humBadge?.warn && !tempBadge?.warn ? "hum" : "temp");
  const tab = (k: Metric, icon: IconName, label: string, value: string, unit: string, badge?: Badge) => (
    <button type="button" role="tab" aria-selected={m === k} className={m === k ? "on" : ""} onClick={() => setM(k)}>
      <small><Icon name={icon} size={14} />{label}</small>
      <b>{value}{value !== "—" && <span>{unit}</span>}</b>
      {badge && <em className={badge.warn ? "warn" : ""}>{badge.text}</em>}
    </button>
  );
  return (
    <div className="hc">
      <p className="hc-label"><Icon name="temp" size={15} />Udara di dalam kotak</p>
      <div className="hc-metrics" role="tablist">
        {tab("temp", "temp", "Suhu", fmt(r?.temperature_c, 1), "°C", tempBadge)}
        {tab("hum", "humidity", "Kelembapan", fmt(r?.humidity_pct, 0), "%", humBadge)}
      </div>
      {m === "temp" ? <>
        <Gauge {...gaugeFor.temp(s)} value={r?.temperature_c} color={SERIES.temp} warn={tempBadge?.warn} />
        {h.tabs}
        <MiniArea rows={h.rows} loading={h.loading} dataKey="temperature_c" color={SERIES.temp} unit="°C" label="Suhu"
                  refY={s.temp_open_c} refLabel="buka" />
        <Stats title="Hari ini" items={todayStats([h.d?.temp_min, h.d?.temp_avg, h.d?.temp_max], 1, "°")} />
      </> : <>
        <Gauge {...gaugeFor.hum(s)} value={r?.humidity_pct} color={SERIES.hum} warn={humBadge?.warn} />
        {h.tabs}
        <MiniArea rows={h.rows} loading={h.loading} dataKey="humidity_pct" color={SERIES.hum} unit="%" label="RH"
                  domain={[0, 100]} refY={s.hum_open_pct} refLabel="buka" />
        <Stats title="Hari ini" items={todayStats([h.d?.hum_min, h.d?.hum_avg, h.d?.hum_max], 0, "%")} />
      </>}
    </div>
  );
}

/** Kontrol terkunci: alasannya + jalan pintas ke mode manual (kalau itu penyebabnya). */
function LockNote({ lock }: { lock: Lock }) {
  if (!lock) return null;
  return (
    <div className="hc-lock">
      <Icon name="lock" size={15} />
      <span>{lock.reason}</span>
      {lock.toManual && <button type="button" className="btn sm" onClick={lock.toManual}>Ke Manual</button>}
    </div>
  );
}

function useWeek(id: string) {
  const week = usePoll<Analytics>(`/api/devices/${id}/analytics?days=7`, 60_000).data;
  return { week, today: week?.daily.find((d) => d.day === dayKey(Date.now())) };
}

export function PumpCard({ id, state, pumpText, flowing, lock, onWater }: {
  id: string; state: DeviceState; pumpText: string; flowing: boolean; lock: Lock; onWater: () => void;
}) {
  const s = state.settings;
  const { week, today } = useWeek(id);
  return (
    <div className="hc">
      <Head icon="pump" label="Pompa" value={pumpText}
            meta={`Dosis ${s.dose_ms / 1000} s · resap ${s.soak_s} s · maks ${s.max_doses_per_hour} dosis/jam`} />
      <Stats items={[
        ["Hari ini", week ? `${today?.pump_runs ?? 0}×` : "—"],
        ["7 hari", week ? `${week.totals.pump_runs}×` : "—"],
        // tanpa debit pompa (belum dikalibrasi) volume tidak bisa dihitung: tampilkan lama pompa menyala
        week?.totals.water_ml != null ? ["Air 7 hari", `${week.totals.water_ml} ml`] : ["Nyala 7 hari", week ? `${fmt(week.totals.pump_seconds, 0)} s` : "—"],
      ]} />
      <DayBars data={week} empty="Belum ada penyiraman." bars={[
        { key: (d: DailyStat) => d.pump_auto, name: "Otomatis", color: SERIES.soil },
        { key: (d: DailyStat) => d.pump_runs - d.pump_auto, name: "Manual (web)", color: SERIES.soilSoft },
      ]} />
      <button type="button" className={`btn primary water ${flowing ? "flowing" : ""}`} disabled={!!lock || flowing} onClick={onWater}>
        <Icon name="humidity" size={16} />{flowing ? "Menyiram…" : `Siram ${s.dose_ms / 1000} s`}
      </button>
      <LockNote lock={lock} />
    </div>
  );
}

export function TankCard({ state }: { state: DeviceState }) {
  const r = state.reading;
  return (
    <div className="hc">
      <Head icon="tank" label="Tangki air" value={r?.tank_warning ? "Cek isi" : "Normal"}
            badge={r?.tank_warning ? { text: "stop rule", warn: true } : undefined} />
      <p className="hc-sub">
        {r?.tank_warning
          ? "Batas siram per jam tercapai tapi tanah masih kering. Isi botol atau periksa pompa dan selang."
          : `Tidak ada sensor level. Peringatan muncul bila ${state.settings.max_doses_per_hour} dosis dalam satu jam tidak membuat tanah lembap.`}
      </p>
    </div>
  );
}

type Lid = "closed" | "open" | "maintenance";

export function LidCard({ id, state, lidLabel, value, pending, lock, onSelect }: {
  id: string; state: DeviceState; lidLabel: string; value: Lid | null; pending?: Lid; lock: Lock; onSelect: (l: Lid) => void;
}) {
  const s = state.settings, r = state.reading;
  const { week, today } = useWeek(id);
  return (
    <div className="hc">
      <Head icon="lid" label="Tutup" value={lidLabel}
            meta={`${r?.lid_angle != null ? `Servo ${r.lid_angle}° · ` : ""}otomatis buka ≥ ${s.temp_open_c}°C atau RH ≥ ${s.hum_open_pct}%`} />
      <Stats items={[
        ["Terbuka hari ini", fmt(today?.lid_open_pct, 0, "%")],
        ["Dibuka 7 hari", week ? `${week.totals.lid_opens}×` : "—"],
      ]} />
      <DayBars data={week} empty="Belum ada data ventilasi." unit="%" bars={[
        { key: (d: DailyStat) => d.lid_open_pct ?? 0, name: "Waktu terbuka", color: SERIES.lid },
      ]} />
      <Seg<Lid>
        value={value === "maintenance" ? null : value}
        pending={pending === "maintenance" ? undefined : pending}
        locked={!!lock}
        onSelect={onSelect}
        options={[{ key: "closed", label: "Tutup" }, { key: "open", label: "Buka" }]}
      />
      <LockNote lock={lock} />
    </div>
  );
}
