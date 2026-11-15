"use client";

// Kartu perangkat di bawah panggung: satu kolom per sensor/aktuator (nama, ikon, status + titik warna).
// Tile diklik membuka popup perangkat itu: kartu hotspot-nya (nilai, ambang, grafik, kontrol), statistik,
// lalu kalibrasi/setting alatnya.

import { useRef, useState, type ReactNode } from "react";
import { ago, fmt, usePoll } from "@/lib/client";
import type { Settings } from "@/lib/settings";
import type { Analytics, DeviceState } from "@/lib/types";
import { Icon, type IconName } from "./icons";
import { Kpi, Tabs } from "./ui";
import { LINK_FIELDS, PUMP_FIELDS, SOIL_FIELDS, SettingsBlock, TANK_FIELDS } from "./SettingsBlock";
import { ServoSettings } from "./DeviceSettings";
import type { HotspotKind } from "./Greenhouse3D";

type Kind = "soil" | "dht" | "pump" | "lid" | "tank" | "wifi";
export type Tone = "ok" | "on" | "warn" | "off";

type Props = {
  id: string;
  state: DeviceState;
  pumpOn: boolean;
  lidLabel: string;
  lidTone: Tone;
  busy: boolean;
  onSave: (patch: Partial<Settings>, okText?: string) => void;
  /** Kartu hotspot 3D (nilai, skala ambang, grafik + rentang, kontrol); ditampilkan juga di atas popup perangkatnya. */
  cards: Record<HotspotKind, ReactNode>;
};

/** Kartu hotspot yang dipakai di popup tiap perangkat (WiFi tidak punya). */
const CARD_OF: Partial<Record<Kind, HotspotKind>> = { soil: "soil", dht: "air", pump: "pump", lid: "lid", tank: "tank" };

type Tile = { kind: Kind; icon: IconName; name: string; title: string; value: string; tone: Tone };

export default function DeviceBar(props: Props) {
  const { state, pumpOn, lidLabel, lidTone } = props;
  const { device, reading: r } = state;
  const [open, setOpen] = useState<Kind | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  // offline: status terakhir mungkin sudah tidak berlaku, titiknya abu-abu
  const t = (tone: Tone): Tone => (device.online ? tone : "off");
  const tiles: Tile[] = [
    { kind: "soil", icon: "soil", name: "Sensor tanah", title: "Sensor kelembapan tanah", value: r?.soil_pct != null ? `${fmt(r.soil_pct, 0)}%` : "Tidak terbaca", tone: t(r && r.soil_pct == null ? "warn" : "ok") },
    { kind: "dht", icon: "temp", name: "DHT22", title: "DHT22 (suhu & RH)", value: r?.temperature_c != null ? `${fmt(r.temperature_c, 1)}° · ${fmt(r.humidity_pct, 0)}%` : "Tidak terbaca", tone: t(r && r.temperature_c == null ? "warn" : "ok") },
    { kind: "pump", icon: "pump", name: "Pompa", title: "Pompa air", value: pumpOn ? "Menyiram" : r?.pump_state === "off" ? "Mati" : "—", tone: t(pumpOn ? "on" : "ok") },
    { kind: "lid", icon: "lid", name: "Servo tutup", title: "Servo tutup (MG996R)", value: lidLabel, tone: t(lidTone) },
    { kind: "tank", icon: "tank", name: "Tangki air", title: "Tangki air", value: r?.tank_warning ? "Cek isi" : "Normal", tone: t(r?.tank_warning ? "warn" : "ok") },
    { kind: "wifi", icon: "wifi", name: "WiFi", title: "Koneksi WiFi", value: device.online ? (r?.rssi != null ? `${r.rssi} dBm` : "Online") : "Offline", tone: device.online ? "ok" : "off" },
  ];
  const show = (k: Kind) => {
    setOpen(k);
    dialog.current?.showModal();
  };
  const close = () => dialog.current?.close();
  const cur = tiles.find((x) => x.kind === open);

  return (
    <>
      {/* satu kartu; tiap perangkat satu kolom: nama, ikon, lalu status */}
      <nav className="card dev-bar" aria-label="Perangkat">
        {tiles.map((x) => (
          <button key={x.kind} type="button" className="dev-tile" onClick={() => show(x.kind)} title={`Kalibrasi ${x.name}`}>
            <span className="dev-name">{x.name}</span>
            <span className="dev-ico"><Icon name={x.icon} size={28} /></span>
            <span className="dev-val"><b>{x.value}</b><i className={`dot ${x.tone}`} /></span>
          </button>
        ))}
      </nav>

      <dialog ref={dialog} className="sheet dev-dialog" onClick={(e) => e.target === dialog.current && close()} onClose={(e) => { if (!e.currentTarget.open) setOpen(null); }}>
        {cur && (
          <>
            <header className="pd-head">
              <div className="dev-head">
                <span className="dev-ico"><Icon name={cur.icon} size={18} /></span>
                <div>
                  <h2>{cur.title}</h2>
                  <p className="tiny muted">{cur.value} · data {ago(r?.ts)}</p>
                </div>
              </div>
              <button type="button" className="icon-btn" onClick={close} aria-label="Tutup"><Icon name="close" /></button>
            </header>
            <div className="pd-body">
              {CARD_OF[cur.kind] && <div className="dev-card">{props.cards[CARD_OF[cur.kind]!]}</div>}
              <DeviceBody kind={cur.kind} {...props} />
            </div>
          </>
        )}
      </dialog>
    </>
  );
}

function DeviceBody({ kind, ...p }: Props & { kind: Kind }) {
  const { state, busy, onSave } = p;
  const { settings: s, reading: r, device } = state;
  const save = (patch: Partial<Settings>) => onSave(patch);
  switch (kind) {
    case "soil":
      return (
        <>
          <div className="kpis">
            <Kpi label="ADC mentah" value={r?.soil_raw != null ? String(r.soil_raw) : "—"} sub={device.online ? "bacaan sekarang" : "bacaan terakhir"} />
          </div>
          <SettingsBlock icon="soil" title="Kalibrasi sensor" desc="ADC kering dan basah menentukan 0 % dan 100 %. Selisihnya minimal 200."
                         fields={SOIL_FIELDS} settings={s} busy={busy} onSave={save} />
        </>
      );
    case "dht":
      return (
        <>
          <p className="panel-note">DHT22 sudah terkalibrasi dari pabrik, jadi tidak ada setting di sini. Bacaan di luar rentang sensor disimpan kosong (tidak terbaca), bukan dipaksa ke batas.</p>
        </>
      );
    case "pump":
      return (
        <>
          <PumpStats {...p} />
          <SettingsBlock icon="pump" title="Dosis pompa" desc="Satu dosis, tunggu meresap, lalu baca ulang tanah."
                         fields={PUMP_FIELDS} settings={s} busy={busy} onSave={save} />
        </>
      );
    case "lid":
      return (
        <>
          <LidStats {...p} />
          <ServoSettings settings={s} onSave={onSave} />
        </>
      );
    case "tank":
      return (
        <>
          <SettingsBlock icon="tank" title="Stop rule" desc="Kalau tanah tetap kering setelah sekian dosis dalam satu jam, pompa berhenti."
                         fields={TANK_FIELDS} settings={s} busy={busy} onSave={save} />
        </>
      );
    case "wifi":
      return (
        <>
          <div className="kpis">
            <Kpi label="Data terakhir" value={ago(r?.ts)} sub={`kirim tiap ${s.report_interval_s} s`} />
            <Kpi label="Sinyal" value={r?.rssi != null ? String(r.rssi) : "—"} sub="dBm" />
            <Kpi label="Perintah menunggu" value={String(state.pending_commands)} sub="diambil saat sync" />
          </div>
          <SettingsBlock icon="wifi" title="Pengiriman data" desc="Seberapa sering ESP32 mengirim bacaan. Perubahan status dikirim saat itu juga."
                         fields={LINK_FIELDS} settings={s} busy={busy} onSave={save} />
        </>
      );
  }
}

const DAY_TABS: [number, string][] = [[1, "Hari ini"], [7, "7 hari"], [30, "30 hari"]];

function Stats({ id, children }: { id: string; children: (a: Analytics | null | undefined) => ReactNode }) {
  const [days, setDays] = useState(7);
  const { data } = usePoll<Analytics>(`/api/devices/${id}/analytics?days=${days}`, 60_000);
  return (
    <div className="dev-stats">
      <Tabs value={days} onChange={setDays} options={DAY_TABS} />
      {children(data)}
    </div>
  );
}

function PumpStats({ id, state }: Props) {
  const s = state.settings;
  return (
    <Stats id={id}>
      {(data) => {
        const t = data?.totals;
        return (
          <div className="kpis">
            <Kpi label="Penyiraman" value={t ? String(t.pump_runs) : "—"} sub="kali" />
            <Kpi label="Durasi pompa" value={t ? fmt(t.pump_seconds, 0) : "—"} sub="detik total" />
            <Kpi label="Air terpakai" value={t?.water_ml != null ? String(t.water_ml) : "—"} sub={s.pump_flow_ml_s > 0 ? "ml (estimasi)" : "isi debit pompa"} />
            <Kpi label="Safety stop" value={t ? String(t.safety_stops) : "—"} sub="kali" />
          </div>
        );
      }}
    </Stats>
  );
}

function LidStats({ id }: Props) {
  return (
    <Stats id={id}>
      {(data) => {
        const pcts = (data?.daily ?? []).map((d) => d.lid_open_pct).filter((v): v is number => v != null);
        const avgPct = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
        return (
          <div className="kpis">
            <Kpi label="Dibuka" value={data ? String(data.totals.lid_opens) : "—"} sub="kali" />
            <Kpi label="Waktu terbuka" value={fmt(avgPct, 0)} sub="% rata-rata per hari" />
          </div>
        );
      }}
    </Stats>
  );
}
