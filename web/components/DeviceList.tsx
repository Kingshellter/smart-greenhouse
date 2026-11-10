"use client";

import Link from "next/link";
import { useState } from "react";
import { ago, api, fmt, usePoll } from "@/lib/client";
import type { DeviceSummary } from "@/lib/types";

export default function DeviceList() {
  const { data, error, refresh } = usePoll<DeviceSummary[]>("/api/devices", 5000);
  const [form, setForm] = useState({ id: "", name: "" });
  const [created, setCreated] = useState<{ id: string; api_key: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

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

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Smart Agriculture · IoT</p>
          <h1>Smart Mini-Greenhouse</h1>
          <p className="muted">Pemantauan iklim mikro dan otomasi irigasi presisi</p>
        </div>
      </header>

      {error && <div className="alert">Gagal memuat data: {error}</div>}

      <section className="node-grid">
        {data?.map((d) => {
          const online = d.last_seen && Date.now() - new Date(d.last_seen).getTime() < 30_000;
          return (
            <Link key={d.id} href={`/devices/${d.id}`} className="card node-card">
              <div className="row between">
                <h2>{d.name}</h2>
                <span className={`pill ${online ? "ok" : "off"}`}>{online ? "Online" : "Offline"}</span>
              </div>
              <p className="muted small">{d.id} · {ago(d.last_seen)}</p>
              <dl className="mini-stats">
                <div><dt>Tanah</dt><dd>{fmt(d.soil_pct, 0, "%")}</dd></div>
                <div><dt>Suhu</dt><dd>{fmt(d.temperature_c, 1, "°C")}</dd></div>
                <div><dt>RH</dt><dd>{fmt(d.humidity_pct, 0, "%")}</dd></div>
              </dl>
              <p className="small muted">
                Mode {d.mode ?? "—"} · Tutup {d.lid_state === "open" ? "terbuka" : d.lid_state === "closed" ? "tertutup" : d.lid_state === "maintenance" ? "maintenance" : "—"}
                {d.tank_warning ? " · ⚠ Cek tangki air" : ""}
              </p>
            </Link>
          );
        })}
        {data && data.length === 0 && <p className="muted">Belum ada node. Tambahkan di bawah.</p>}
      </section>

      <section className="card narrow">
        <h3>Tambah node</h3>
        <p className="muted small">Setiap ESP32 punya device_id dan key sendiri. Menambah node tidak perlu mengubah kode.</p>
        <form onSubmit={addNode} className="row gap wrap">
          <input placeholder="device_id, mis. gh-02" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} required />
          <input placeholder="Nama" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <button className="btn primary">Tambah</button>
        </form>
        {msg && <p className="error small">{msg}</p>}
        {created && (
          <div className="keybox">
            <p className="small">Simpan key ini ke <code>firmware/config.h</code> (hanya ditampilkan sekali):</p>
            <code>#define DEVICE_ID  &quot;{created.id}&quot;<br />#define DEVICE_KEY &quot;{created.api_key}&quot;</code>
          </div>
        )}
      </section>
    </main>
  );
}
