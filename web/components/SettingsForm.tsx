"use client";

import { useEffect, useState } from "react";
import type { Settings } from "@/lib/settings";

type Field = { key: keyof Settings; label: string; unit?: string; step?: number; hint?: string };

const GROUPS: { title: string; fields: Field[] }[] = [
  {
    title: "Penyiraman",
    fields: [
      { key: "soil_dry_pct", label: "Siram jika tanah di bawah", unit: "%" },
      { key: "dose_ms", label: "Lama 1 dosis", unit: "ms", step: 100 },
      { key: "soak_s", label: "Waktu meresap", unit: "detik" },
      { key: "max_doses_per_hour", label: "Maks dosis per jam", hint: "Stop rule: lebih dari ini → peringatan tangki" },
    ],
  },
  {
    title: "Ventilasi (hysteresis)",
    fields: [
      { key: "temp_open_c", label: "Buka jika suhu ≥", unit: "°C", step: 0.5 },
      { key: "temp_close_c", label: "Tutup jika suhu ≤", unit: "°C", step: 0.5 },
      { key: "hum_open_pct", label: "Buka jika RH ≥", unit: "%" },
      { key: "hum_close_pct", label: "Tutup jika RH ≤", unit: "%" },
    ],
  },
  {
    title: "Kalibrasi & lainnya",
    fields: [
      { key: "soil_raw_dry", label: "ADC tanah kering (udara)", hint: "Ketik 'cal' di Serial Monitor untuk membaca nilai" },
      { key: "soil_raw_wet", label: "ADC tanah basah (air)" },
      { key: "pump_flow_ml_s", label: "Debit pompa", unit: "ml/s", step: 0.1, hint: "Nyalakan 10 s ke gelas ukur, bagi 10" },
      { key: "report_interval_s", label: "Interval kirim data", unit: "detik" },
    ],
  },
];

export default function SettingsForm({ settings, busy, onSave }: { settings: Settings; busy: boolean; onSave: (p: Partial<Settings>) => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);

  // Isi ulang form saat setting di server berubah (kecuali sedang diedit).
  useEffect(() => {
    if (!open) setDraft(Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, String(v)])));
  }, [settings, open]);

  const changed = GROUPS.flatMap((g) => g.fields).filter((f) => draft[f.key] !== undefined && Number(draft[f.key]) !== Number(settings[f.key]));

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!changed.length) return;
    onSave(Object.fromEntries(changed.map((f) => [f.key, Number(draft[f.key])])) as Partial<Settings>);
    setOpen(false);
  }

  return (
    <section className="card">
      <div className="row between">
        <h3>Threshold & kalibrasi</h3>
        <button className="btn sm" onClick={() => setOpen(!open)}>{open ? "Batal" : "Ubah"}</button>
      </div>
      <form onSubmit={save}>
        <div className="settings-grid">
          {GROUPS.map((g) => (
            <fieldset key={g.title} disabled={!open}>
              <legend>{g.title}</legend>
              {g.fields.map((f) => (
                <label key={f.key}>
                  <span>{f.label}</span>
                  <span className="input-unit">
                    <input type="number" step={f.step ?? 1} value={draft[f.key] ?? ""}
                           onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
                    {f.unit && <em>{f.unit}</em>}
                  </span>
                  {f.hint && <small className="muted">{f.hint}</small>}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        {open && (
          <div className="row gap mt">
            <button className="btn primary" disabled={busy || !changed.length}>Simpan {changed.length ? `(${changed.length})` : ""}</button>
            <span className="muted small">ESP32 menerapkan setting baru dalam beberapa detik.</span>
          </div>
        )}
      </form>
    </section>
  );
}
