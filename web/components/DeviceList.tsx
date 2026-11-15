"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ago, api, fmt, prefetch, usePoll } from "@/lib/client";
import type { DeviceSummary } from "@/lib/types";
import { navigate, transitionReady } from "@/lib/transition";
import GreenhouseView from "./GreenhouseView";
import { Brand } from "./ui";

const LID_DEG: Record<string, number> = { open: 45, maintenance: 90 };
const isOnline = (d: DeviceSummary) => !!d.last_seen && Date.now() - new Date(d.last_seen).getTime() < 30_000;

export default function DeviceList() {
  const router = useRouter();
  const { data, error, refresh } = usePoll<DeviceSummary[]>("/api/devices", 5000);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ id: "", name: "" });
  const [created, setCreated] = useState<{ id: string; api_key: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Data kosong / gagal: jangan biarkan transisi dari dashboard menunggu
  useEffect(() => {
    if (error || (data && data.length === 0)) transitionReady();
  }, [data, error]);

  // Siapkan halaman dashboard tiap node (kode halaman + status) supaya klik langsung pindah.
  const ids = data?.map((d) => d.id).join(",") ?? "";
  useEffect(() => {
    for (const id of ids ? ids.split(",") : []) {
      router.prefetch(`/devices/${id}`);
      prefetch(`/api/devices/${id}/state`);
    }
  }, [ids, router]);

  async function addNode(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const r = await api<{ id: string; api_key: string }>("/api/devices", { method: "POST", body: JSON.stringify(form) });
      setCreated(r);
      setForm({ id: "", name: "" });
      refresh();
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  const open = (e: React.MouseEvent, id: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    navigate(router, `/devices/${id}`);
  };

  const onlineCount = data?.filter(isOnline).length ?? 0;

  return (
    <main className="page list-page">
      <nav className="dnav">
        <Brand large />
        <div className="nav-right"><span className="muted small">Smart Agriculture · IoT</span></div>
      </nav>

      <header className="list-hero">
        <h1>Greenhouse kamu</h1>
        <p className="muted">Pemantauan iklim mikro dan otomasi irigasi presisi. Pilih node untuk membuka dashboard-nya.</p>
        {!!data?.length && (
          <span className={`live ${onlineCount ? "on" : ""}`}><i />{onlineCount} dari {data.length} node online</span>
        )}
      </header>

      {error && <div className="alert">Gagal memuat data: {error}</div>}

      <section className="node-grid">
        {data?.map((d) => {
          const online = isOnline(d);
          return (
            <a key={d.id} href={`/devices/${d.id}`} className="glass node-card" onClick={(e) => open(e, d.id)}>
              <div className="node-3d" style={{ viewTransitionName: `gh-${d.id}` }}>
                <GreenhouseView
                  lidDeg={LID_DEG[d.lid_state ?? ""] ?? 0}
                  pumpOn={d.pump_state === "on"}
                  soilPct={d.soil_pct}
                  online={online}
                  tankWarning={!!d.tank_warning}
                  degPerSec={60}
                  interactive={false}
                  onReady={transitionReady}
                />
              </div>
              <div className="node-info">
                <div className="row between">
                  <h2 style={{ viewTransitionName: `title-${d.id}` }}>{d.name}</h2>
                  <span className={`pill ${online ? "ok" : "off"}`}>{online ? "Online" : "Offline"}</span>
                </div>
                <p className="muted small">{d.id.toUpperCase()} · {ago(d.last_seen)} · mode {d.mode === "manual" ? "manual" : "otomatis"}</p>
                <dl className={`mini-stats ${online ? "" : "stale"}`}>
                  <div><dt>Tanah</dt><dd>{fmt(d.soil_pct, 0, "%")}</dd></div>
                  <div><dt>Suhu</dt><dd>{fmt(d.temperature_c, 1, "°")}</dd></div>
                  <div><dt>RH</dt><dd>{fmt(d.humidity_pct, 0, "%")}</dd></div>
                </dl>
                {d.tank_warning && <p className="node-warn">Cek tangki air</p>}
              </div>
            </a>
          );
        })}

        <div className={`glass node-card add-card ${adding ? "open" : ""}`}>
          {!adding ? (
            <button className="add-btn" onClick={() => setAdding(true)}>
              <span className="plus">+</span>
              <strong>Tambah node</strong>
              <small className="muted">Setiap ESP32 punya device_id dan key sendiri. Tidak perlu mengubah kode.</small>
            </button>
          ) : (
            <div className="add-form">
              <h2>Tambah node</h2>
              <form onSubmit={addNode} className="add-fields">
                <input placeholder="device_id, mis. gh-02" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} required autoFocus />
                <input placeholder="Nama, mis. Mini-Greenhouse 2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <div className="row gap">
                  <button className="btn primary">Tambah</button>
                  <button type="button" className="btn" onClick={() => { setAdding(false); setCreated(null); setMsg(null); }}>Tutup</button>
                </div>
              </form>
              {msg && <p className="error small">{msg}</p>}
              {created && (
                <div className="keybox">
                  <p className="small">Salin ke <code>firmware/config.h</code> (key hanya ditampilkan sekali):</p>
                  <code>#define DEVICE_ID  &quot;{created.id}&quot;<br />#define DEVICE_KEY &quot;{created.api_key}&quot;</code>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
