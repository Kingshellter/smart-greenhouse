"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ago, api, prefetch, usePoll } from "@/lib/client";
import type { ActuatorEvent, DeviceState } from "@/lib/types";
import { SERVO_DEG_PER_S, type Settings } from "@/lib/settings";
import type { Preset, PresetValues } from "@/lib/presets";
import { navigate, transitionReady } from "@/lib/transition";
import PresetPicker from "./PresetPicker";
import EventLog from "./EventLog";
import GreenhouseView from "./GreenhouseView";
import SensorCards from "./SensorCards";
import DeviceBar from "./DeviceBar";
import NotifySettings from "./NotifySettings";
import type { HotspotKind } from "./Greenhouse3D";
import { AirCard, LidCard, PumpCard, SoilCard, TankCard, type Lock } from "./HotspotCards";
import { Brand, type AlertTone } from "./ui";
import { useToasts } from "./Toasts";
import { Icon, type IconName } from "./icons";

type Lid = "closed" | "open" | "maintenance";
type Mode = "auto" | "manual";
/** Pilihan di bar kontrol: dua mode setting + maintenance (tutup diangkat, bisa dari mode apa pun). */
type Ctl = Mode | "maint";
/** Aksi yang sudah dikirim tapi belum dikonfirmasi ESP32 (ditampilkan optimistis). */
type Pending = { mode?: Mode; lid?: Lid; since: number };

const PENDING_MS = 25_000;
const LID_TEXT: Record<Lid, string> = { closed: "Tertutup", open: "Terbuka", maintenance: "Maintenance" };
const LID_MOVING: Record<Lid, string> = { closed: "Menutup…", open: "Membuka…", maintenance: "Mengangkat…" };

export default function Dashboard({ id }: { id: string }) {
  const router = useRouter();
  const { data, error, refresh } = usePoll<DeviceState>(`/api/devices/${id}/state`, 3000);
  const { data: recent } = usePoll<ActuatorEvent[]>(`/api/devices/${id}/events?limit=5`, 3000);
  const [inflight, setInflight] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>({ since: 0 });
  const { flash, node: toasts } = useToasts();

  // Siapkan halaman daftar node supaya tombol kembali langsung pindah.
  useEffect(() => {
    router.prefetch("/");
    prefetch("/api/devices");
  }, [router]);

  // ── Animasi pompa ────────────────────────────────────────────────────────
  // Firmware tidak mengirim data selama pompa menyala, jadi web jarang melihat status "on".
  // Saat tombol Siram ditekan, air langsung dianimasikan selama durasi dosis. Untuk siraman
  // otomatis, animasi diputar dari log "pump run" yang baru masuk, selama durasi aslinya.
  const [pumpAnim, setPumpAnim] = useState(false);
  const pumpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPumpEvent = useRef<number | null>(null);
  const manualPumpAt = useRef(0);
  const playPump = (ms: number) => {
    setPumpAnim(true);
    if (pumpTimer.current) clearTimeout(pumpTimer.current);
    pumpTimer.current = setTimeout(() => setPumpAnim(false), Math.min(Math.max(ms, 1000), 10_000));
  };
  useEffect(() => {
    const ev = recent?.find((e) => e.actuator === "pump" && e.action === "run");
    if (!ev) return;
    if (lastPumpEvent.current === null) { lastPumpEvent.current = ev.id; return; } // event lama saat halaman dibuka
    if (ev.id === lastPumpEvent.current) return;
    lastPumpEvent.current = ev.id;
    if (Date.now() - manualPumpAt.current < 30_000) return; // sudah dianimasikan saat tombol ditekan
    playPump(ev.value ?? 3000);
  }, [recent]);
  useEffect(() => () => {
    if (pumpTimer.current) clearTimeout(pumpTimer.current);
  }, []);

  // ── Konfirmasi aksi optimistis ───────────────────────────────────────────
  const s = data?.settings;
  const r = data?.reading ?? null;
  useEffect(() => {
    if (!data) return;
    const expired = Date.now() - pending.since > PENDING_MS;
    const modeDone = pending.mode && (pending.mode === data.settings.mode || expired);
    const lidOk = !!pending.lid && pending.lid === data.reading?.lid_state;
    const lidDone = pending.lid && (lidOk || expired);
    if (!modeDone && !lidDone) return;
    // Tanpa konfirmasi, tampilan kembali ke posisi terakhir; beri tahu supaya tidak terlihat "melompat" begitu saja.
    if (pending.lid && !lidOk) flash("ESP32 belum menjalankan perintah tutup (offline?), tampilan kembali ke posisi terakhir", "warn");
    setPending((p) => ({ ...p, mode: modeDone ? undefined : p.mode, lid: lidDone ? undefined : p.lid }));
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps -- hanya dicek saat data baru masuk

  async function send(key: string, fn: () => Promise<unknown>, okText: string, onFail?: () => void, okTone: AlertTone = "ok") {
    if (inflight === key && key !== "settings") return; // cegah klik ganda untuk aksi alat
    setInflight(key);
    try {
      await fn();
      flash(okText, okTone);
      refresh();
    } catch (e) {
      onFail?.();
      flash((e as Error).message, "err");
    } finally {
      setInflight(null);
    }
  }

  const saveSettings = (patch: Partial<Settings>, okText = "Setting disimpan, dikirim ke ESP32 pada sync berikutnya") =>
    send("settings", () => api(`/api/devices/${id}/settings`, { method: "PUT", body: JSON.stringify(patch) }), okText);

  // Preset baru disalin dulu (preset_id ikut tersimpan), lalu ambang yang digeser/diketik di popup menimpanya.
  const applyPreset = (p: Preset, values: PresetValues | null) =>
    send("preset", async () => {
      if (!values || p.id !== data?.settings.preset_id)
        await api(`/api/devices/${id}/preset`, { method: "POST", body: JSON.stringify({ preset_id: p.id }) });
      if (values) await api(`/api/devices/${id}/settings`, { method: "PUT", body: JSON.stringify(values) });
    }, `${p.name}${values ? " (ambang diubah)" : ""} diterapkan, dikirim ke ESP32 pada sync berikutnya`);

  const command = (type: string, payload: object) =>
    api(`/api/devices/${id}/commands`, { method: "POST", body: JSON.stringify({ type, payload }) });

  const setMode = (mode: Mode) => {
    setPending((p) => ({ ...p, mode, since: Date.now() }));
    send("mode", () => api(`/api/devices/${id}/settings`, { method: "PUT", body: JSON.stringify({ mode }) }),
      mode === "manual" ? "Mode manual aktif" : "Mode otomatis aktif",
      () => setPending((p) => ({ ...p, mode: undefined })));
  };

  const setLid = (lid: Lid) => {
    const exitMaint = r?.lid_state === "maintenance" && lid === "closed";
    setPending((p) => ({ ...p, lid, since: Date.now() }));
    send("lid", () => command("lid", { position: exitMaint ? "exit_maintenance" : lid }),
      `Perintah dikirim, ESP32 ${lid === "open" ? "membuka" : lid === "closed" ? "menutup" : "mengangkat"} tutup dalam beberapa detik`,
      () => setPending((p) => ({ ...p, lid: undefined })), "info");
  };

  const water = () => {
    if (!s) return;
    manualPumpAt.current = Date.now();
    playPump(s.dose_ms);
    send("pump", () => command("pump_dose", { ms: s.dose_ms }), `Siram ${s.dose_ms / 1000} s dikirim ke ESP32`,
      () => { manualPumpAt.current = 0; setPumpAnim(false); }, "info");
  };

  const back = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    navigate(router, "/");
  };

  if (!data || !s) {
    return (
      <main className="dash">
        <p className="muted">{error ? `Gagal memuat: ${error}` : "Memuat…"}</p>
        <Link href="/" className="small">Kembali ke semua node</Link>
      </main>
    );
  }

  const { device } = data;
  const mode: Mode = pending.mode ?? s.mode;
  const manual = mode === "manual";
  const lidReal = (r?.lid_state ?? null) as Lid | null;
  const lidShown: Lid | null = pending.lid ?? lidReal;
  const lidAngle = (l: Lid | null) => (l === "open" ? s.lid_open_deg : l === "maintenance" ? s.lid_maint_deg : s.lid_closed_deg);
  const lidDeg = pending.lid ? Math.abs(lidAngle(pending.lid) - s.lid_closed_deg)
    : r?.lid_angle != null ? Math.abs(r.lid_angle - s.lid_closed_deg) : 0;
  const lidLabel = pending.lid ? LID_MOVING[pending.lid] : lidReal ? LID_TEXT[lidReal] : "—";
  const inMaint = lidShown === "maintenance";
  const ctl: Ctl = inMaint ? "maint" : mode;
  const ctlPending: Ctl | undefined = pending.lid === "maintenance" ? "maint" : pending.mode;
  const selectCtl = (k: Ctl) => {
    if (k === "maint") return setLid("maintenance");
    if (inMaint) setLid("closed"); // keluar dari maintenance dulu (diizinkan di mode apa pun)
    if (k !== mode) setMode(k);
  };
  const pumpVisual = r?.pump_state === "on" || pumpAnim;
  const sensorFail = !!r && device.online && (r.soil_pct == null || r.temperature_c == null);

  // `short` = satu baris yang langsung terlihat di kartu status; `detail` = penjelasan lengkap di tooltip.
  const issues: { title: string; short: string; detail: string }[] = [];
  if (!device.online) issues.push({ title: "ESP32 offline", short: `Data terakhir ${ago(r?.ts)}. Otomasi tetap jalan di alat.`, detail: "Tidak ada data lebih dari 30 detik. Penyiraman otomatis tetap berjalan lokal di ESP32." });
  if (r?.tank_warning) issues.push({ title: "Cek tangki air", short: "Isi botol atau periksa pompa dan selang.", detail: "Batas siram per jam tercapai tapi tanah masih kering. Isi botol atau periksa pompa/selang." });
  if (sensorFail) issues.push({
    title: "Sensor tidak terbaca",
    short: "Penyiraman otomatis dijeda sampai sensor normal.",
    detail: `${[r?.soil_pct == null && "Sensor tanah", r?.temperature_c == null && "DHT22"].filter(Boolean).join(", ")} tidak terbaca. Penyiraman otomatis dihentikan sampai sensor normal.`,
  });
  if (lidReal === "maintenance") issues.push({ title: "Mode maintenance", short: "Tutup diangkat, ventilasi otomatis dijeda.", detail: `Tutup diangkat ${r?.lid_angle}°; buka/tutup otomatis dijeda.` });
  const tone = !device.online ? "off" : issues.length ? "warn" : "ok";
  const soilBadge = r?.soil_pct != null ? (r.soil_pct < s.soil_dry_pct ? { text: "Kering", warn: true } : { text: "Cukup", warn: false }) : undefined;
  const tempBadge = r?.temperature_c != null ? (r.temperature_c >= s.temp_open_c ? { text: "Panas", warn: true } : { text: "Normal", warn: false }) : undefined;
  const humBadge = r?.humidity_pct != null ? (r.humidity_pct >= s.hum_open_pct ? { text: "Lembap", warn: true } : { text: "Normal", warn: false }) : undefined;
  const pumpText = pumpVisual ? "Menyiram" : r?.pump_state === "off" ? "Mati" : "—";
  // Tutup & siram hanya bisa di mode manual dan bukan saat maintenance; titiknya jadi abu-abu.
  // Dari kartu yang terkunci karena mode otomatis, pengguna bisa langsung pindah ke manual.
  const lock: Lock = inMaint ? { reason: "Sedang maintenance. Pilih Otomatis atau Manual dulu." }
    : !manual ? { reason: "Mode otomatis: dikontrol ESP32.", toManual: () => setMode("manual") } : null;
  // isi kartu yang muncul saat titik info di model 3D ditekan
  const cards: Record<HotspotKind, React.ReactNode> = {
    soil: <SoilCard id={id} state={data} badge={soilBadge} />,
    air: <AirCard id={id} state={data} tempBadge={tempBadge} humBadge={humBadge} />,
    pump: <PumpCard id={id} state={data} pumpText={pumpText} flowing={pumpAnim} lock={lock} onWater={water} />,
    tank: <TankCard state={data} />,
    lid: <LidCard id={id} state={data} lidLabel={lidLabel} value={lidShown} pending={pending.lid} lock={lock} onSelect={setLid} />,
  };
  // titik info di model ikut berwarna kuning kalau bagiannya yang bermasalah
  const tones: Partial<Record<HotspotKind, "warn">> = {
    soil: soilBadge?.warn ? "warn" : undefined,
    air: tempBadge?.warn || humBadge?.warn ? "warn" : undefined,
    tank: r?.tank_warning ? "warn" : undefined,
  };
  const MODES: [Ctl, string, IconName, string][] = [
    ["auto", "Otomatis", "mode", "ESP32 menyiram dan membuka tutup sendiri sesuai ambang tanaman"],
    ["manual", "Manual", "edit", "Pompa dan tutup dikontrol dari web"],
    ["maint", "Maintenance", "wrench", "Tutup diangkat penuh untuk akses ke tanaman"],
  ];

  return (
    <main className="dash">
      <nav className="dnav">
        <div className="nav-left">
          <Brand onClick={back} />
        </div>
        <div className="nav-right">
          <code className="node-id">{device.id.toUpperCase()}</code>
          <NotifySettings id={id} notify={flash} />
          <span className={`live ${device.online ? "on" : ""}`}>
            <i />{device.online ? `Live · ${ago(r?.ts)}` : `Offline · ${ago(device.last_seen)}`}
          </span>
        </div>
      </nav>

      <section className="stage">
        <div className="stage-col left">
          {/* judul node; kembali ke daftar node lewat logo di navigasi */}
          <div className="stage-head">
            <h1 className="stage-title" style={{ viewTransitionName: `title-${id}` }}>{device.name}</h1>
          </div>
          {/* kartu status: warnanya mengikuti keadaan (hijau normal, kuning peringatan, gelap offline) */}
          <header className={`card status-card ${tone}`}>
            <div className="card-head">
              <p className="card-title">Status sistem</p>
              {/* penjelasan lengkap ada di tooltip (hover, atau fokus/tap di layar sentuh) */}
              <span className="info-tip">
                <button type="button" className="icon-btn sm" aria-label="Penjelasan status" aria-describedby="status-tip">
                  <Icon name="info" size={17} />
                </button>
                <span role="tooltip" id="status-tip" className="tip">
                  <span className="tip-item muted">Data terakhir {ago(r?.ts)}</span>
                  {issues.length ? issues.map((i) => (
                    <span key={i.title} className="tip-item"><b>{i.title}</b>{i.detail}</span>
                  )) : <span className="tip-item"><b>Semua sistem normal</b>ESP32 online, sensor terbaca, dan tangki air normal.</span>}
                  {data.pending_commands > 0 && <span className="tip-item muted">{data.pending_commands} perintah menunggu diambil ESP32.</span>}
                </span>
              </span>
            </div>
            <p className="status-line"><i />{issues[0]?.title ?? "Semua sistem normal"}</p>
            <p className="status-detail">{issues[0]?.short ?? "ESP32 online, sensor terbaca, tangki air normal."}</p>
          </header>
          <SensorCards id={id} state={data} soilBadge={soilBadge} tempBadge={tempBadge} humBadge={humBadge} />
        </div>

        <div className="stage-main">
          <div className="stage-center" style={{ viewTransitionName: `gh-${id}` }}>
            <GreenhouseView
              lidDeg={lidDeg}
              pumpOn={pumpVisual}
              soilPct={r?.soil_pct ?? null}
              cards={cards}
              locked={{ lid: !!lock, pump: !!lock }}
              tones={tones}
              online={device.online}
              tankWarning={!!r?.tank_warning}
              degPerSec={SERVO_DEG_PER_S}
              onReady={transitionReady}
            />
            {/* pilihan mode: tiga tombol mengambang terpisah di bawah model, samar sampai disentuh kursor */}
            <div className="mode-float" role="radiogroup" aria-label="Mode">
              {MODES.map(([k, label, icon, hint]) => (
                <button key={k} type="button" role="radio" aria-checked={ctl === k} title={hint}
                        className={`mode-btn ${ctl === k ? "on" : ""} ${ctlPending === k ? "pending" : ""}`}
                        onClick={() => ctl !== k && selectCtl(k)}>
                  <Icon name={icon} size={16} />{label}
                </button>
              ))}
              {(pending.mode || pending.lid) && <span className="chip-s sync mode-sync">menunggu ESP32</span>}
            </div>
          </div>
        </div>

        <div className="stage-col right">
          <PresetPicker current={s} reading={r} online={device.online} busy={inflight === "preset" || inflight === "settings"} onApply={applyPreset}
                        notify={flash} />
          <EventLog id={id} />
        </div>

        {/* kartu perangkat selebar panggung di bawah ketiga kolom; tiap kolom membuka popup kalibrasinya */}
        <DeviceBar id={id} state={data} pumpOn={pumpVisual} lidLabel={lidLabel} lidTone={pending.lid ? "on" : inMaint ? "warn" : "ok"}
                   busy={inflight === "settings"} onSave={(p, okText) => saveSettings(p, okText)} cards={cards} />
      </section>

      {toasts}
    </main>
  );
}
