"use client";

// Kalibrasi & setting alat (bukan ambang tanaman), dipotong per perangkat untuk popup di bar perangkat (DeviceBar).

import { useEffect, useState } from "react";
import type { Settings } from "@/lib/settings";
import { BlockHead } from "./SettingsBlock";

type Save = (patch: Partial<Settings>, okText?: string) => void;

/** Sudut servo (tiap klik langsung disimpan). Kecepatan servo tetap di firmware (SERVO_STEP_MS). */
export function ServoSettings({ settings: s, onSave }: { settings: Settings; onSave: Save }) {
  return (
    <section className="setblock">
      <BlockHead icon="lid" title="Sudut servo tutup" desc="Tiap klik langsung disimpan. Selisih dari posisi tertutup maksimal 90°." />
      <fieldset className="servo-set">
        <div className="angle-list">
          <AngleRow label="Tertutup" value={s.lid_closed_deg} onChange={(v) => onSave({ lid_closed_deg: v }, `Sudut tertutup = ${v}°`)} />
          <AngleRow label="Terbuka" value={s.lid_open_deg} onChange={(v) => onSave({ lid_open_deg: v }, `Sudut terbuka = ${v}°`)} />
          <AngleRow label="Maintenance" value={s.lid_maint_deg} onChange={(v) => onSave({ lid_maint_deg: v }, `Sudut maintenance = ${v}°`)} />
        </div>
      </fieldset>
    </section>
  );
}

function AngleRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  // Nilai lokal supaya klik beruntun terasa langsung; server mengikuti di belakang.
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const set = (n: number) => {
    const next = Math.min(180, Math.max(0, n));
    setV(next);
    onChange(next);
  };
  return (
    <div className="row between angle-row">
      <span>{label}</span>
      <div className="row gap">
        <button type="button" className="btn sm" onClick={() => set(v - 5)}>−5</button>
        <button type="button" className="btn sm" onClick={() => set(v - 1)}>−1</button>
        <strong className="angle">{v}°</strong>
        <button type="button" className="btn sm" onClick={() => set(v + 1)}>+1</button>
        <button type="button" className="btn sm" onClick={() => set(v + 5)}>+5</button>
      </div>
    </div>
  );
}
