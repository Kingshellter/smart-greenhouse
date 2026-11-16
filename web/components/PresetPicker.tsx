"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { PRESET_FIELDS, matchesPreset, type Preset, type PresetValues } from "@/lib/presets";
import { NUMERIC_LIMITS, type Settings } from "@/lib/settings";
import type { Reading } from "@/lib/types";
import { SERIES } from "@/lib/chart";
import { PlantArt } from "./PlantArt";
import { Icon, type IconName } from "./icons";
import { GaugeSlider, NumField, type AlertTone, type SliderHandle } from "./ui";

type Props = {
  current: Settings & { preset_id: number | null };
  /** Bacaan terakhir: posisi nilai sekarang ditampilkan di skala ambang (hanya saat online). */
  reading: Reading | null;
  online: boolean;
  busy: boolean;
  /** Terapkan preset; `values` diisi kalau ambangnya diubah dari nilai preset. */
  onApply: (preset: Preset, values: PresetValues | null) => void;
  notify: (text: string, tone?: AlertTone) => void;
};

const pick = (v: PresetValues): PresetValues => Object.fromEntries(PRESET_FIELDS.map((k) => [k, Number(v[k])])) as PresetValues;
const lim = (k: keyof PresetValues) => NUMERIC_LIMITS[k];

/** Satu kartu ambang: apa yang terjadi, skala yang bisa digeser, lalu angka yang bisa diketik. */
function Threshold({ icon, title, color, text, now, children }: {
  icon: IconName; title: string; color: string; text: string; now: string | null; children: React.ReactNode;
}) {
  return (
    <div className="threshold">
      <p className="threshold-title" style={{ color }}><Icon name={icon} size={15} /><b>{title}</b></p>
      <p className="threshold-text">{text}</p>
      {children}
      <p className="threshold-now">{now ? `Alat sekarang: ${now}` : " "}</p>
    </div>
  );
}

/**
 * Kartu tanaman aktif; diklik membuka popup: pilihan preset bergambar, lalu tiga ambangnya
 * sebagai skala yang bisa digeser (dan diketik). Kalibrasi alat ada di bar perangkat di bawah panggung.
 */
export default function PresetPicker({ current, reading, online, busy, onApply, notify }: Props) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [sel, setSel] = useState<number | null>(current.preset_id);
  const [draft, setDraft] = useState<PresetValues>(() => pick(current));
  /** Sedang membuat preset baru (tile "+ Baru" atau tombol "Simpan baru"): nama diketik, ambang dari draf. */
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [working, setWorking] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  // notify dari parent berganti tiap render; simpan di ref supaya load() tidak ikut berubah
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const load = useCallback(async () => {
    try {
      setPresets(await api<Preset[]>("/api/presets"));
    } catch (e) {
      notifyRef.current(`Gagal memuat preset: ${(e as Error).message}`, "err");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const active = presets.find((p) => p.id === current.preset_id);
  const chosen = presets.find((p) => p.id === sel);
  const activeEdited = active ? !matchesPreset(current, active) : false;

  /** Pilih tanaman: preset yang sedang dipakai memakai nilai alat sekarang (bisa sudah diubah), lainnya nilai presetnya. */
  const choose = (id: number | null) => {
    setSel(id);
    setConfirmDel(false);
    setCreating(false);
    setName("");
    const p = presets.find((x) => x.id === id);
    setDraft(pick(!p || id === current.preset_id ? current : p));
  };
  const open = () => {
    choose(current.preset_id);
    dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();

  async function act(fn: () => Promise<void>) {
    setWorking(true);
    try { await fn(); } catch (e) { notify((e as Error).message, "err"); } finally { setWorking(false); }
  }

  const create = () => act(async () => {
    const p = await api<Preset>("/api/presets", { method: "POST", body: JSON.stringify({ name, ...draft }) });
    await load();
    setSel(p.id);
    setCreating(false);
    setName("");
    notify(`Preset "${p.name}" disimpan. Tekan Terapkan untuk memakainya.`);
  });

  const update = (p: Preset) => act(async () => {
    await api(`/api/presets/${p.id}`, { method: "PUT", body: JSON.stringify({ name: p.name, note: p.note, ...draft }) });
    await load();
    notify(`Preset "${p.name}" diperbarui`);
  });

  const remove = (p: Preset) => act(async () => {
    await api(`/api/presets/${p.id}`, { method: "DELETE" });
    await load();
    choose(null);
    notify(`Preset "${p.name}" dihapus`);
  });

  const set = (k: keyof PresetValues) => (v: number) => setDraft((d) => ({ ...d, [k]: v }));
  const disabled = busy || working;
  const startCreate = () => { setCreating(true); setName(""); setConfirmDel(false); };
  const edited = !creating && !!chosen && !matchesPreset(draft, chosen);
  const canApply = !creating && !!chosen && (chosen.id !== current.preset_id || !matchesPreset(draft, current));

  // nilai sekarang hanya ditampilkan di skala kalau masih data langsung
  const live = online ? reading : null;
  const differs = (...keys: (keyof PresetValues)[]) => keys.some((k) => Number(current[k]) !== Number(draft[k]));
  const d = draft;

  // handle skala; batasnya menjaga suhu/RH tutup tetap di bawah nilai buka (aturan hysteresis server)
  const soilH: SliderHandle[] = [
    { key: "soil_dry_pct", value: d.soil_dry_pct, label: `siram < ${d.soil_dry_pct}%`, lo: lim("soil_dry_pct")[0], hi: lim("soil_dry_pct")[1] },
  ];
  const tempH: SliderHandle[] = [
    { key: "temp_close_c", value: d.temp_close_c, label: `tutup ≤ ${d.temp_close_c}°`, lo: lim("temp_close_c")[0], hi: d.temp_open_c - 0.5 },
    { key: "temp_open_c", value: d.temp_open_c, label: `buka ≥ ${d.temp_open_c}°`, lo: d.temp_close_c + 0.5, hi: lim("temp_open_c")[1] },
  ];
  const humH: SliderHandle[] = [
    { key: "hum_close_pct", value: d.hum_close_pct, label: `tutup ≤ ${d.hum_close_pct}%`, lo: lim("hum_close_pct")[0], hi: d.hum_open_pct - 1 },
    { key: "hum_open_pct", value: d.hum_open_pct, label: `buka ≥ ${d.hum_open_pct}%`, lo: d.hum_close_pct + 1, hi: lim("hum_open_pct")[1] },
  ];
  const onSlide = (k: string, v: number) => set(k as keyof PresetValues)(v);

  // skala + angka tiga ambang; dipakai saat melihat preset maupun saat membuat preset baru
  const editor = (
    <>
      <p className="tiny muted">Geser garis putih atau ketik angkanya. Kuning = bertindak, biru = tutup lagi.</p>
      <div className="thresholds">
        <Threshold icon="soil" title="Penyiraman" color={SERIES.soil}
                   text={`Pompa menyiram saat tanah di bawah ${d.soil_dry_pct}%.`}
                   now={differs("soil_dry_pct") ? `< ${current.soil_dry_pct}%` : null}>
          <GaugeSlider name="Penyiraman" min={0} max={100} step={1} zones={[{ from: 0, to: d.soil_dry_pct, tone: "act" }]} handles={soilH}
                       value={live?.soil_pct} color={SERIES.soil} onChange={onSlide} />
          <div className="numfields">
            <NumField label="Siram jika <" unit="%" value={d.soil_dry_pct} lo={soilH[0].lo} hi={soilH[0].hi} step={1} onChange={set("soil_dry_pct")} />
          </div>
        </Threshold>
        <Threshold icon="temp" title="Ventilasi suhu" color={SERIES.temp}
                   text={`Tutup membuka di ${d.temp_open_c}°C, menutup lagi di ${d.temp_close_c}°C.`}
                   now={differs("temp_open_c", "temp_close_c") ? `${current.temp_close_c}–${current.temp_open_c}°C` : null}>
          <GaugeSlider name="Ventilasi suhu" min={10} max={50} step={0.5} zones={[{ from: 10, to: d.temp_close_c, tone: "rest" }, { from: d.temp_open_c, to: 50, tone: "act" }]} handles={tempH}
                       value={live?.temperature_c} color={SERIES.temp} onChange={onSlide} />
          <div className="numfields">
            <NumField label="Tutup ≤" unit="°C" value={d.temp_close_c} lo={tempH[0].lo} hi={tempH[0].hi} step={0.5} onChange={set("temp_close_c")} />
            <NumField label="Buka ≥" unit="°C" value={d.temp_open_c} lo={tempH[1].lo} hi={tempH[1].hi} step={0.5} onChange={set("temp_open_c")} />
          </div>
        </Threshold>
        <Threshold icon="humidity" title="Ventilasi RH" color={SERIES.hum}
                   text={`Tutup membuka di RH ${d.hum_open_pct}%, menutup lagi di ${d.hum_close_pct}%.`}
                   now={differs("hum_open_pct", "hum_close_pct") ? `${current.hum_close_pct}–${current.hum_open_pct}%` : null}>
          <GaugeSlider name="Ventilasi RH" min={20} max={100} step={1} zones={[{ from: 20, to: d.hum_close_pct, tone: "rest" }, { from: d.hum_open_pct, to: 100, tone: "act" }]} handles={humH}
                       value={live?.humidity_pct} color={SERIES.hum} onChange={onSlide} />
          <div className="numfields">
            <NumField label="Tutup ≤" unit="%" value={d.hum_close_pct} lo={humH[0].lo} hi={humH[0].hi} step={1} onChange={set("hum_close_pct")} />
            <NumField label="Buka ≥" unit="%" value={d.hum_open_pct} lo={humH[1].lo} hi={humH[1].hi} step={1} onChange={set("hum_open_pct")} />
          </div>
        </Threshold>
      </div>
    </>
  );

  return (
    <>
      {/* kartu tanaman: judul, gambar, lalu nama + ambang utama, tersusun vertikal */}
      <button type="button" className="glass plant-card" onClick={open}>
        <small className="plant-label">Tanaman</small>
        <span className="plant-thumb"><PlantArt name={active?.name} size={110} /></span>
        <span className="plant-text">
          <strong>{active?.name ?? "Belum dipilih"}</strong>
          <em className={activeEdited ? "warn" : ""}>
            {!active ? "Pilih preset tanaman" : activeEdited ? "Diubah manual" : `Siram < ${active.soil_dry_pct}% · buka ≥ ${active.temp_open_c}°C`}
          </em>
        </span>
      </button>

      {/* ukuran popup tetap; kepala dan kaki (Terapkan) diam, hanya isi tengah yang di-scroll */}
      <dialog ref={dialog} className="sheet plant-dialog" onClick={(e) => e.target === dialog.current && close()}>
        <header className="pd-head">
          <h2>Tanaman &amp; ambang</h2>
          <button type="button" className="icon-btn" onClick={close} aria-label="Tutup"><Icon name="close" /></button>
        </header>

        <div className="pd-body">
          <section className="pd-sec">
            <p className="eyebrow">Pilih tanaman</p>
            <div className="plant-grid">
              {presets.map((p) => (
                <button key={p.id} type="button" className={`plant-tile ${!creating && p.id === sel ? "on" : ""}`} aria-pressed={!creating && p.id === sel} title={p.name} onClick={() => choose(p.id)}>
                  <span className="plant-thumb"><PlantArt name={p.name} size={40} /></span>
                  <span>{p.name}</span>
                  {/* dua ambang utama, supaya tanaman bisa dibandingkan tanpa membuka satu per satu */}
                  <em><Icon name="soil" size={12} />{p.soil_dry_pct}%<Icon name="temp" size={12} />{p.temp_open_c}°</em>
                  {p.id === current.preset_id && <i className="plant-active" title="Sedang dipakai"><Icon name="check" size={12} /></i>}
                  {!p.builtin && <small>custom</small>}
                </button>
              ))}
              {/* preset baru: mulai dari ambang yang sedang tampil, lalu diberi nama */}
              <button type="button" className={`plant-tile add ${creating ? "on" : ""}`} aria-pressed={creating} onClick={startCreate}>
                <span className="plant-thumb"><Icon name="plus" size={20} /></span>
                <span>Preset baru</span>
                <em>dari ambang ini</em>
              </button>
            </div>
          </section>

          {creating ? (
            <section className="preset-detail">
              <div className="pdt-head">
                <span className="plant-thumb"><PlantArt name={name} size={64} /></span>
                <form className="pdt-text" onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2) create(); }}>
                  <input className="pdt-input" autoFocus placeholder="Nama preset baru" value={name} maxLength={40}
                         aria-label="Nama preset baru" onChange={(e) => setName(e.target.value)} />
                  <p className="tiny muted">Atur ambangnya di bawah, lalu simpan.</p>
                </form>
              </div>
              {editor}
            </section>
          ) : chosen ? (
            <section className="preset-detail">
              <div className="pdt-head">
                <span className="plant-thumb"><PlantArt name={chosen.name} size={64} /></span>
                <div className="pdt-text">
                  <div className="pdt-name">
                    <h2>{chosen.name}</h2>
                    {chosen.id === current.preset_id && <span className={`chip-s ${activeEdited ? "warn" : "ok"}`}>{activeEdited ? "Dipakai, diubah manual" : "Sedang dipakai"}</span>}
                    {edited && <span className="chip-s warn">Ambang diubah</span>}
                    {!chosen.builtin && <span className="chip-s">Custom</span>}
                  </div>
                  {/* catatan & sumber dipotong 2 baris (teks lengkap di tooltip): tinggi kepala tetap, kartu ambang tidak bergeser */}
                  {chosen.note && <p className="small pdt-clamp" title={chosen.note}>{chosen.note}</p>}
                  {chosen.source && <p className="tiny muted pdt-clamp" title={chosen.source}>Sumber: {chosen.source}</p>}
                </div>
              </div>
              {editor}

              {!chosen.builtin && (
                <div className="row gap wrap">
                  {edited && <button type="button" className="btn sm" disabled={disabled} onClick={() => update(chosen)}>Perbarui preset</button>}
                  {confirmDel
                    ? <button type="button" className="btn sm danger" disabled={disabled} onClick={() => remove(chosen)}>Yakin hapus?</button>
                    : <button type="button" className="btn sm" disabled={disabled} onClick={() => setConfirmDel(true)}>Hapus preset</button>}
                </div>
              )}
            </section>
          ) : (
            <p className="muted small">Pilih tanaman di atas untuk melihat dan mengatur ambangnya.</p>
          )}
        </div>

        {/* kiri: kembalikan / batal; kanan: simpan sebagai preset baru + terapkan */}
        {/* isi kaki berganti dengan fade (key), dan Kembalikan selalu ada tapi baru terlihat saat ambang diubah,
            jadi tombol tidak melompat */}
        <footer className="pd-foot">
          {creating ? (
            <div key="new" className="pd-foot-in">
              <button type="button" className="btn" onClick={() => choose(sel)}>Batal</button>
              <button type="button" className="btn primary" disabled={disabled || name.trim().length < 2} onClick={create}>Simpan preset</button>
            </div>
          ) : (
            <div key="pick" className="pd-foot-in">
              <button type="button" className={`btn pd-reset ${edited ? "show" : ""}`} tabIndex={edited ? 0 : -1} aria-hidden={!edited}
                      title={chosen ? `Kembalikan ke nilai ${chosen.name}` : undefined} onClick={() => chosen && setDraft(pick(chosen))}>Kembalikan</button>
              <div className="pd-actions">
                <button type="button" className="btn" disabled={disabled} onClick={startCreate}>Simpan baru</button>
                <button type="button" className="btn primary" disabled={disabled || !canApply}
                        onClick={() => { if (chosen) { onApply(chosen, edited ? draft : null); close(); } }}>Terapkan</button>
              </div>
            </div>
          )}
        </footer>
      </dialog>
    </>
  );
}
