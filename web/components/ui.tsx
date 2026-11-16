"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/** Logo + nama. `large` di halaman daftar node; di dashboard kecil. Pindah halaman = logo mengecil/membesar mulus. */
export function Brand({ onClick, large }: { onClick?: (e: React.MouseEvent) => void; large?: boolean }) {
  return (
    <Link href="/" className={`brand ${large ? "lg" : ""}`} aria-label="Smart Greenhouse — semua node" onClick={onClick}>
      <span className="brand-in">
        <svg viewBox="4 4.5 24 24" aria-hidden>
          <defs>
            <linearGradient id="bg-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#38d39f" />
              <stop offset="1" stopColor="#a8e063" />
            </linearGradient>
          </defs>
          <path d="M4 14 16 5l12 9v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="url(#bg-g)" />
          <path d="M16 25c-4-2-5-6-3-9 3 0 5 2 5 5 0-4 2-6 5-6 0 4-3 8-7 10z" fill="#fff" />
        </svg>
        <span>Smart Greenhouse</span>
      </span>
    </Link>
  );
}

/** Nada pesan: ok (berhasil), info, warn (perlu perhatian), err (gagal). */
export type AlertTone = "ok" | "info" | "warn" | "err";

/** Glyph putih di atas lingkaran berwarna: centang, "i", atau "!". */
function AlertIcon({ tone }: { tone: AlertTone }) {
  return (
    <svg className="alert-ico" viewBox="0 0 20 20" width={20} height={20} aria-hidden>
      <circle cx="10" cy="10" r="10" fill="currentColor" />
      <g stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none">
        {tone === "ok" ? <path d="m6 10.3 2.7 2.7L14 7.6" />
          : tone === "info" ? <><path d="M10 9.2V14" /><path d="M10 6.2v.01" /></>
          : <><path d="M10 5.8V11" /><path d="M10 14v.01" /></>}
      </g>
    </svg>
  );
}

/** Kotak pesan berwarna lembut + ikon bulat; dipakai untuk toast dan catatan di popup. */
export function Alert({ tone, children, className = "" }: { tone: AlertTone; children: ReactNode; className?: string }) {
  return (
    <div className={`alert ${tone} ${className}`} role={tone === "err" ? "alert" : undefined}>
      <AlertIcon tone={tone} />
      <span className="alert-text">{children}</span>
    </div>
  );
}

/** Tab kecil untuk memilih rentang waktu. */
export function Tabs<T extends string | number>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="tabs" role="tablist">
      {options.map(([v, label]) => (
        <button key={String(v)} type="button" role="tab" aria-selected={v === value} className={v === value ? "active" : ""} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

export function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="kpi">
      <p className="stat-label">{label}</p>
      <p className="kpi-value">{value}</p>
      <p className="stat-sub">{sub}</p>
    </div>
  );
}

export type SegOption<K extends string> = { key: K; label: ReactNode; sub?: ReactNode; disabled?: boolean };

/**
 * Kontrol segmen dengan penanda yang bergeser halus.
 * `value` = posisi yang ditampilkan (bisa nilai optimistis), `pending` = key yang sedang menunggu ESP32.
 */
export function Seg<K extends string>({ options, value, pending, locked, onSelect, className = "" }: {
  options: SegOption<K>[]; value: K | null | undefined; pending?: K | null; locked?: boolean;
  onSelect: (k: K) => void; className?: string;
}) {
  const idx = options.findIndex((o) => o.key === value);
  return (
    <div className={`seg-slide ${locked ? "locked" : ""} ${className}`} style={{ ["--n" as string]: options.length }} role="radiogroup">
      <span className="seg-thumb" style={{ transform: `translateX(${Math.max(idx, 0) * 100}%)`, opacity: idx < 0 ? 0 : 1 }} aria-hidden />
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={o.key === value}
          className={`${o.key === value ? "on" : ""} ${o.key === pending ? "pending" : ""}`}
          disabled={locked || o.disabled}
          onClick={() => o.key !== value && onSelect(o.key)}
        >
          <span>{o.label}</span>
          {o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  );
}

export type GaugeMark = { at: number; label: string; side: "left" | "right" };
export type GaugeScale = { min: number; max: number; marks: GaugeMark[]; zone: [number, number] };

/**
 * Skala bergaris: posisi nilai sekarang terhadap ambang yang memicu aksi otomatis.
 * `zone` = rentang pemicu (diarsir), `marks` = garis ambang berlabel. Tanpa `value` hanya ambangnya yang tampil.
 */
export function Gauge({ min, max, marks, zone, value, color, warn }: GaugeScale & { value?: number | null; color: string; warn?: boolean }) {
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  return (
    <div className={`gauge ${warn ? "warn" : ""}`} style={{ ["--g" as string]: color } as CSSProperties}>
      <div className="gauge-track">
        <i className="gauge-zone" style={{ left: `${pct(zone[0])}%`, width: `${pct(zone[1]) - pct(zone[0])}%` }} />
        {value != null && <i className="gauge-fill" style={{ width: `${pct(value)}%` }} />}
      </div>
      {marks.map((m) => (
        <span key={m.label} className={`gauge-mark ${m.side}`} style={{ left: `${pct(m.at)}%` }}>{m.label}</span>
      ))}
    </div>
  );
}

type Thresholds = { soil_dry_pct: number; temp_open_c: number; temp_close_c: number; hum_open_pct: number; hum_close_pct: number };

/** Skala tiap sensor dari ambang yang dipakai. Rentangnya dipilih supaya dua label ambang tidak keluar dari skala. */
export const gaugeFor = {
  soil: (t: Thresholds): GaugeScale => ({
    min: 0, max: 100, zone: [0, t.soil_dry_pct],
    marks: [{ at: t.soil_dry_pct, label: `siram < ${t.soil_dry_pct}%`, side: t.soil_dry_pct < 35 ? "right" : "left" }],
  }),
  temp: (t: Thresholds): GaugeScale => ({
    min: t.temp_close_c - 8, max: t.temp_open_c + 8, zone: [t.temp_open_c, t.temp_open_c + 8],
    marks: [
      { at: t.temp_close_c, label: `tutup ≤ ${t.temp_close_c}°`, side: "left" },
      { at: t.temp_open_c, label: `buka ≥ ${t.temp_open_c}°`, side: "right" },
    ],
  }),
  hum: (t: Thresholds): GaugeScale => ({
    min: t.hum_close_pct - 30, max: t.hum_open_pct + 30, zone: [t.hum_open_pct, t.hum_open_pct + 30],
    marks: [
      { at: t.hum_close_pct, label: `tutup ≤ ${t.hum_close_pct}%`, side: "left" },
      { at: t.hum_open_pct, label: `buka ≥ ${t.hum_open_pct}%`, side: "right" },
    ],
  }),
};

export type SliderHandle = {
  key: string;
  value: number;
  /** Nama untuk pembaca layar, mis. "buka ≥ 30°" (tidak ditampilkan; angkanya ada di input di bawah skala). */
  label: string;
  /** Batas geser handle ini (mis. suhu tutup harus di bawah suhu buka). */
  lo: number;
  hi: number;
};

/** Rentang berwarna di skala: `act` = alat bertindak (siram / buka), `rest` = tutup lagi. */
export type SliderZone = { from: number; to: number; tone: "act" | "rest" };

/**
 * Skala bergaris yang ambangnya bisa digeser: handle = garis putih tebal berbayang. Tekan/geser di mana saja pada
 * skala menggerakkan handle terdekat; panah kiri/kanan menggeser handle yang sedang fokus satu langkah (Shift = 5).
 * Skalanya tetap (min–max) supaya tidak ikut bergeser.
 */
export function GaugeSlider({ min, max, step, zones, handles, value, color, name, onChange }: {
  min: number; max: number; step: number; zones: SliderZone[]; handles: SliderHandle[]; value?: number | null; color: string;
  name: string; onChange: (key: string, v: number) => void;
}) {
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  const drag = useRef<string | null>(null);
  const snap = (h: SliderHandle, v: number) => {
    const n = Math.round(v / step) * step;
    return Number(Math.max(h.lo, Math.min(h.hi, n)).toFixed(2));
  };
  const at = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return min + ((e.clientX - r.left) / r.width) * (max - min);
  };
  const move = (key: string, v: number) => {
    const h = handles.find((x) => x.key === key);
    if (!h) return;
    const n = snap(h, v);
    if (n !== h.value) onChange(key, n);
  };
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const v = at(e);
    const near = handles.reduce((a, b) => (Math.abs(b.value - v) < Math.abs(a.value - v) ? b : a));
    drag.current = near.key;
    e.currentTarget.setPointerCapture(e.pointerId);
    (e.currentTarget.querySelector(`[data-key="${near.key}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
    move(near.key, v);
    e.preventDefault();
  };
  const onKey = (h: SliderHandle) => (e: React.KeyboardEvent) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    move(h.key, h.value + d * step * (e.shiftKey ? 5 : 1));
  };
  return (
    <div className="gauge-slider" style={{ ["--g" as string]: color } as CSSProperties}
         onPointerDown={onDown}
         onPointerMove={(e) => drag.current && move(drag.current, at(e))}
         onPointerUp={() => { drag.current = null; }}
         onPointerCancel={() => { drag.current = null; }}>
      <div className="gauge-track">
        {zones.map((z) => (
          <i key={z.tone + z.from} className={`gauge-zone ${z.tone}`} style={{ left: `${pct(z.from)}%`, width: `${pct(z.to) - pct(z.from)}%` }} />
        ))}
        {value != null && <i className="gauge-fill" style={{ width: `${pct(value)}%` }} />}
      </div>
      {handles.map((h) => (
        <i key={h.key} className="gauge-handle" role="slider" tabIndex={0} data-key={h.key} style={{ left: `${pct(h.value)}%` }}
           aria-label={`${name}: ${h.label}`} aria-valuemin={h.lo} aria-valuemax={h.hi} aria-valuenow={h.value} onKeyDown={onKey(h)} />
      ))}
    </div>
  );
}

/**
 * Input angka yang bisa diketik bebas: nilai baru dikirim ke induk hanya kalau valid (dalam lo–hi),
 * dan kembali ke nilai induk saat fokus lepas atau saat nilainya diubah dari luar.
 */
export function NumField({ label, unit, value, lo, hi, step, onChange }: {
  label: string; unit: string; value: number; lo: number; hi: number; step: number; onChange: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  // nilai berubah dari luar (skala digeser, tombol reset): ikuti, kecuali teks yang sedang diketik memang sudah sama
  useEffect(() => { setText((t) => (t !== "" && Number(t) === value ? t : String(value))); }, [value]);
  return (
    <label className="numfield">
      <span>{label}</span>
      <span className="input-unit">
        <input type="number" inputMode="decimal" value={text} min={lo} max={hi} step={step}
               onBlur={() => setText(String(value))}
               onChange={(e) => {
                 setText(e.target.value);
                 const n = Number(e.target.value);
                 if (e.target.value !== "" && Number.isFinite(n) && n >= lo && n <= hi) onChange(n);
               }} />
        <em>{unit}</em>
      </span>
    </label>
  );
}
