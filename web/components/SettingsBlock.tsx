"use client";

// Sekelompok setting yang dibaca dulu, lalu bisa diubah lewat tombol "Ubah".
// Dipakai di popup kalibrasi tiap perangkat (DeviceBar).

import { useEffect, useState, type ReactNode } from "react";
import { NUMERIC_LIMITS, type Settings } from "@/lib/settings";
import { Icon, type IconName } from "./icons";

export type Field = { key: keyof Settings; label: string; unit?: string; step?: number; hint?: string };

export const SOIL_FIELDS: Field[] = [
  { key: "soil_raw_dry", label: "ADC kering (di udara)", hint: "Ketik 'cal' di Serial Monitor saat sensor di udara" },
  { key: "soil_raw_wet", label: "ADC basah (di air)", hint: "Ketik 'cal' di Serial Monitor saat sensor di air" },
];

export const PUMP_FIELDS: Field[] = [
  { key: "dose_ms", label: "Lama 1 dosis", unit: "ms", step: 100 },
  { key: "soak_s", label: "Waktu meresap", unit: "detik" },
  { key: "pump_flow_ml_s", label: "Debit pompa", unit: "ml/s", step: 0.1, hint: "Nyalakan 10 s ke gelas ukur, bagi 10" },
];

/** Stop rule: batas dosis per jam; terlewati berarti air tidak sampai ke tanah (tangki kosong / selang lepas). */
export const TANK_FIELDS: Field[] = [
  { key: "max_doses_per_hour", label: "Maks dosis per jam", hint: "Lebih dari ini pompa berhenti dan memicu peringatan tangki" },
];

export const LINK_FIELDS: Field[] = [
  { key: "report_interval_s", label: "Interval kirim data", unit: "detik" },
];

/** Kepala blok setting: ikon + judul, satu baris keterangan, dan aksi di kanan. */
export function BlockHead({ icon, title, desc, children }: { icon?: IconName; title: string; desc?: ReactNode; children?: ReactNode }) {
  return (
    <div className="setblock-head">
      {icon && <span className="setblock-ico"><Icon name={icon} size={16} /></span>}
      <div className="setblock-title">
        <b>{title}</b>
        {desc && <small>{desc}</small>}
      </div>
      {children}
    </div>
  );
}

export function SettingsBlock({ title, icon, desc, fields, settings, busy, onSave }: {
  title: string; icon?: IconName; desc?: ReactNode; fields: Field[]; settings: Settings; busy: boolean; onSave: (patch: Partial<Settings>) => void;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const fromSettings = () => Object.fromEntries(fields.map((f) => [f.key, String(settings[f.key])]));
  const [draft, setDraft] = useState<Record<string, string>>(fromSettings);

  // Isi ulang dari server saat tidak sedang diedit.
  useEffect(() => {
    if (!open) setDraft(fromSettings());
  }, [settings, open, fields]);

  const changed = fields.filter((f) => draft[f.key] !== undefined && Number(draft[f.key]) !== Number(settings[f.key]));

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!changed.length) return;
    onSave(Object.fromEntries(changed.map((f) => [f.key, Number(draft[f.key])])) as Partial<Settings>);
    close();
  }

  return (
    <form className="setblock" onSubmit={save}>
      <BlockHead icon={icon} title={title} desc={desc}>
        {open ? (
          <div className="row gap">
            <button type="button" className="btn sm" onClick={close}>Batal</button>
            <button className="btn sm primary" disabled={busy || !changed.length}>Simpan{changed.length ? ` (${changed.length})` : ""}</button>
          </div>
        ) : (
          <button type="button" className="btn sm ghost" onClick={() => setOpen(true)}><Icon name="edit" size={14} />Ubah</button>
        )}
      </BlockHead>
      <fieldset disabled={!open} className="setblock-grid">
        {fields.map((f) => {
          // batas yang sama dengan validasi server, supaya salah isi ketahuan di form (bukan lewat pesan error API)
          const lim = f.key === "mode" ? undefined : NUMERIC_LIMITS[f.key];
          return (
            <label key={f.key}>
              <span>{f.label}</span>
              <span className="input-unit">
                <input type="number" required step={f.step ?? 1} min={lim?.[0]} max={lim?.[1]} value={draft[f.key] ?? ""}
                       onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
                {f.unit && <em>{f.unit}</em>}
              </span>
              {/* petunjuk hanya saat mengedit: itu saatnya dibutuhkan, dan tampilan baca tetap ringkas */}
              {open && <small className="field-hint">{f.hint ? `${f.hint}. ` : ""}{lim && `Rentang ${lim[0]}–${lim[1]}.`}</small>}
            </label>
          );
        })}
      </fieldset>
    </form>
  );
}
