"use client";

import Link from "next/link";
import { useState } from "react";
import { ago, api, fmt, usePoll } from "@/lib/client";
import type { DeviceState } from "@/lib/types";
import type { Settings } from "@/lib/settings";
import Charts from "./Charts";
import AnalyticsPanel from "./AnalyticsPanel";
import SettingsForm from "./SettingsForm";
import EventLog from "./EventLog";

export default function Dashboard({ id }: { id: string }) {
  const { data, error, refresh } = usePoll<DeviceState>(`/api/devices/${id}/state`, 3000);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; err?: boolean } | null>(null);

  const flash = (text: string, err = false) => {
    setToast({ text, err });
    setTimeout(() => setToast(null), 3500);
  };

  async function run(label: string, fn: () => Promise<unknown>, okText: string) {
    setBusy(label);
    try {
      await fn();
      flash(okText);
      refresh();
    } catch (e) {
      flash((e as Error).message, true);
    } finally {
      setBusy(null);
    }
  }

  const saveSettings = (patch: Partial<Settings>, okText = "Setting disimpan, dikirim ke ESP32 pada sync berikutnya") =>
    run("settings", () => api(`/api/devices/${id}/settings`, { method: "PUT", body: JSON.stringify(patch) }), okText);

  const command = (type: string, payload: object, okText: string) =>
    run(type, () => api(`/api/devices/${id}/commands`, { method: "POST", body: JSON.stringify({ type, payload }) }), okText);

  if (!data) {
    return (
      <main className="page">
        <p className="muted">{error ? `Gagal memuat: ${error}` : "Memuat…"}</p>
        <Link href="/" className="small">← Semua node</Link>
      </main>
    );
  }

  const { device, settings: s, reading: r } = data;
  const manual = s.mode === "manual";
  const lidOpen = r?.lid_state === "open";
  const lidMaint = r?.lid_state === "maintenance";
  const lidLabel = lidMaint ? "Maintenance" : lidOpen ? "Terbuka" : r?.lid_state === "closed" ? "Tertutup" : "—";

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <Link href="/" className="small muted">← Semua node</Link>
          <h1>{device.name}</h1>
          <p className="muted small">
            <span className={`pill ${device.online ? "ok" : "off"}`}>{device.online ? "Online" : "Offline"}</span>{" "}
            {device.id} · data terakhir {ago(r?.ts)}
            {r?.rssi != null && ` · WiFi ${r.rssi} dBm`}
            {data.pending_commands > 0 && ` · ${data.pending_commands} perintah menunggu ESP32`}
          </p>
        </div>
      </header>

      {r?.tank_warning && (
        <div className="alert warn">
          <strong>Cek tangki air.</strong> Batas siram per jam tercapai tapi tanah masih kering. Isi botol atau periksa pompa/selang.
        </div>
      )}
      {r && device.online && (r.soil_pct == null || r.temperature_c == null) && (
        <div className="alert warn">
          <strong>Sensor tidak terbaca</strong> ({[r.soil_pct == null && "sensor tanah", r.temperature_c == null && "DHT22"].filter(Boolean).join(", ")}).
          Penyiraman otomatis dihentikan sampai sensor normal. Periksa kabel.
        </div>
      )}
      {lidMaint && (
        <div className="alert warn">
          <strong>Mode maintenance aktif.</strong> Tutup diangkat {r?.lid_angle}°; buka/tutup otomatis dijeda. Klik <em>Selesai maintenance</em> setelah selesai.
        </div>
      )}
      {r && device.online && !lidMaint && !r.tank_warning && r.soil_pct != null && r.temperature_c != null && (
        <div className="alert ok">
          Kondisi terpantau normal. {manual ? "Mode manual aktif: kontrol ada di tangan pengguna." : "Sistem berjalan otomatis, tidak perlu tindakan."}
        </div>
      )}
      {!device.online && (
        <div className="alert">ESP32 tidak mengirim data lebih dari 30 detik. Penyiraman otomatis tetap berjalan lokal di ESP32.</div>
      )}

      <section className="stats">
        <Stat label="Kelembapan tanah" value={fmt(r?.soil_pct, 0, "%")} sub={`raw ${r?.soil_raw ?? "—"} · siram < ${s.soil_dry_pct}%`}
              tone={r?.soil_pct != null && r.soil_pct < s.soil_dry_pct ? "warn" : undefined} />
        <Stat label="Suhu udara" value={fmt(r?.temperature_c, 1, "°C")} sub={`buka ≥ ${s.temp_open_c}° · tutup ≤ ${s.temp_close_c}°`}
              tone={r?.temperature_c != null && r.temperature_c >= s.temp_open_c ? "hot" : undefined} />
        <Stat label="Kelembapan udara" value={fmt(r?.humidity_pct, 0, "%")} sub={`buka ≥ ${s.hum_open_pct}% · tutup ≤ ${s.hum_close_pct}%`} />
        <Stat label="Tutup atap" value={lidLabel}
              sub={r?.lid_angle != null ? `servo ${r.lid_angle}°` : undefined} tone={lidMaint ? "warn" : lidOpen ? "on" : undefined} />
        <Stat label="Pompa" value={r?.pump_state === "on" ? "Menyala" : r?.pump_state === "off" ? "Mati" : "—"}
              sub={`dosis ${s.dose_ms / 1000} s · maks ${s.max_doses_per_hour}/jam`} tone={r?.pump_state === "on" ? "on" : undefined} />
        <Stat label="Mode" value={manual ? "Manual" : "Otomatis"} sub={r?.mode && r.mode !== s.mode ? "menunggu ESP32…" : undefined} />
      </section>

      <section className="two-col">
        <div className="card">
          <h3>Kontrol</h3>
          <p className="small" style={{ marginBottom: 6 }}><strong>Mode kontrol</strong></p>
          <div className="seg seg2">
            <button className={!manual ? "on" : ""} disabled={busy !== null || !manual}
                    onClick={() => saveSettings({ mode: "auto" }, "Mode diubah ke otomatis")}>
              🤖 Otomatis<small>ikut sensor</small>
            </button>
            <button className={manual ? "on" : ""} disabled={busy !== null || manual}
                    onClick={() => saveSettings({ mode: "manual" }, "Mode diubah ke manual")}>
              🖐️ Manual<small>kontrol dari web</small>
            </button>
          </div>
          {!manual && (
            <p className="lock-note mt">🔒 Kontrol terkunci selama mode otomatis. Pilih <strong>Manual</strong> untuk menyiram atau menggerakkan tutup.</p>
          )}
          <div className="row gap wrap mt">
            <button className="btn primary" disabled={!manual || busy !== null}
                    onClick={() => command("pump_dose", { ms: s.dose_ms }, `Perintah siram ${s.dose_ms / 1000} s dikirim`)}>
              {manual ? "💧" : "🔒"} Siram 1 dosis
            </button>
          </div>
          <p className="small mt" style={{ marginBottom: 6 }}><strong>Posisi tutup</strong></p>
          <div className="seg">
            <button className={r?.lid_state === "closed" ? "on" : ""} disabled={!manual || busy !== null || r?.lid_state === "closed"}
                    onClick={() => command("lid", { position: "closed" }, "Perintah tutup dikirim")}>
              Close<small>{s.lid_closed_deg}°</small>
            </button>
            <button className={lidOpen ? "on" : ""} disabled={!manual || busy !== null || lidOpen}
                    onClick={() => command("lid", { position: "open" }, "Perintah buka ventilasi dikirim")}>
              Open<small>{s.lid_open_deg}°</small>
            </button>
            <button className={lidMaint ? "on" : ""} disabled={!manual || busy !== null || lidMaint}
                    onClick={() => command("lid", { position: "maintenance" }, "Mode maintenance: tutup diangkat")}>
              Maintenance<small>{s.lid_maint_deg}°</small>
            </button>
          </div>
          {lidMaint && (
            <button className="btn mt" disabled={busy !== null}
                    onClick={() => command("lid", { position: "exit_maintenance" }, "Maintenance selesai, tutup ditutup")}>
              ✓ Selesai maintenance
            </button>
          )}
          <p className="muted small mt">
            {manual ? "Mode manual: siram, Open, Close, dan Maintenance dikendalikan dari web. Penyiraman & ventilasi otomatis dimatikan."
                    : "Mode otomatis: ESP32 menyiram dan membuka/menutup ventilasi berdasarkan threshold sensor."}
          </p>
        </div>

        <div className="card">
          <h3>Kalibrasi sudut tutup</h3>
          <p className="muted small">Atur saat tutup sudah terpasang. Servo langsung bergerak ke sudut baru jika tutup sedang di posisi itu. Selisih dari posisi tertutup maks 90°.</p>
          <AngleRow label="Tertutup" value={s.lid_closed_deg} disabled={busy !== null}
                    onChange={(v) => saveSettings({ lid_closed_deg: v }, `Sudut tertutup = ${v}°`)} />
          <AngleRow label="Terbuka" value={s.lid_open_deg} disabled={busy !== null}
                    onChange={(v) => saveSettings({ lid_open_deg: v }, `Sudut terbuka = ${v}°`)} />
          <AngleRow label="Maintenance" value={s.lid_maint_deg} disabled={busy !== null}
                    onChange={(v) => saveSettings({ lid_maint_deg: v }, `Sudut maintenance = ${v}°`)} />
          <div className="speed-row">
            <span>Kecepatan servo</span>
            <div className="seg seg4">
              {SPEEDS.map(([label, ms]) => (
                <button key={ms} className={s.servo_step_ms === ms ? "on" : ""} disabled={busy !== null || s.servo_step_ms === ms}
                        onClick={() => saveSettings({ servo_step_ms: ms }, `Kecepatan servo: ${label}`)}>
                  {label}<small>{((ms * Math.abs(s.lid_maint_deg - s.lid_closed_deg)) / 1000).toFixed(1)} s ke maint.</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Charts id={id} settings={s} />
      <AnalyticsPanel id={id} hasFlow={s.pump_flow_ml_s > 0} />
      <SettingsForm settings={s} busy={busy !== null} onSave={(p) => saveSettings(p)} />
      <EventLog id={id} />

      {toast && <div className={`toast ${toast.err ? "err" : ""}`}>{toast.text}</div>}
    </main>
  );
}

const SPEEDS: [string, number][] = [["Cepat", 10], ["Normal", 15], ["Pelan", 30], ["Sangat pelan", 50]];

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" | "hot" | "on" }) {
  return (
    <div className={`card stat ${tone ?? ""}`}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {sub && <p className="stat-sub">{sub}</p>}
    </div>
  );
}

function AngleRow({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled: boolean }) {
  const set = (v: number) => onChange(Math.min(180, Math.max(0, v)));
  return (
    <div className="row between angle-row">
      <span>{label}</span>
      <div className="row gap">
        <button className="btn sm" disabled={disabled} onClick={() => set(value - 5)}>−5</button>
        <button className="btn sm" disabled={disabled} onClick={() => set(value - 1)}>−1</button>
        <strong className="angle">{value}°</strong>
        <button className="btn sm" disabled={disabled} onClick={() => set(value + 1)}>+1</button>
        <button className="btn sm" disabled={disabled} onClick={() => set(value + 5)}>+5</button>
      </div>
    </div>
  );
}
