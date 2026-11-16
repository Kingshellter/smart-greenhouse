"use client";

// Tombol lonceng di navigasi dashboard + popup setting notifikasi WhatsApp untuk node ini:
// nomor tujuan (kosong = WA_TARGET server) dan jenis pesan yang dikirim.

import { useRef, useState } from "react";
import { api } from "@/lib/client";
import { NOTIFY_TOGGLES, TOGGLE_KEYS, type NotifyInfo, type NotifyToggle } from "@/lib/notify-prefs";
import { Icon } from "./icons";
import { Alert, type AlertTone } from "./ui";

type Draft = Record<NotifyToggle, boolean> & { wa_target: string };

const toDraft = (i: NotifyInfo): Draft => ({
  ...(Object.fromEntries(TOGGLE_KEYS.map((k) => [k, i[k]])) as Record<NotifyToggle, boolean>),
  wa_target: (i.wa_target ?? "").replaceAll(",", ", "),
});
const sameDraft = (a: Draft, b: Draft) => a.wa_target.trim() === b.wa_target.trim() && TOGGLE_KEYS.every((k) => a[k] === b[k]);

export default function NotifySettings({ id, notify }: { id: string; notify: (text: string, tone?: AlertTone) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [info, setInfo] = useState<NotifyInfo | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    dialog.current?.showModal();
    setError(null);
    try {
      const i = await api<NotifyInfo>(`/api/devices/${id}/notify`);
      setInfo(i);
      setDraft(toDraft(i));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const close = () => dialog.current?.close();
  const dirty = !!info && !!draft && !sameDraft(draft, toDraft(info));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || !dirty) return;
    setBusy("save");
    setError(null);
    try {
      const i = await api<NotifyInfo>(`/api/devices/${id}/notify`, {
        method: "PUT",
        body: JSON.stringify({ ...draft, wa_target: draft.wa_target.trim() || null }),
      });
      setInfo(i);
      setDraft(toDraft(i));
      notify("Setting notifikasi disimpan");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    setError(null);
    try {
      await api(`/api/devices/${id}/notify/test`, { method: "POST" });
      notify(info?.dry_run ? "Pesan uji ditulis ke log server (mode uji)" : "Pesan uji terkirim, cek WhatsApp", info?.dry_run ? "info" : "ok");
    } catch (e) {
      setError(`Pesan uji gagal: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const noTarget = !!draft && !draft.wa_target.trim() && !info?.env_target;
  const group = (g: "alert" | "auto") => NOTIFY_TOGGLES.filter((t) => t.group === g);

  return (
    <>
      <button type="button" className="icon-btn" onClick={open} aria-label="Notifikasi WhatsApp" title="Notifikasi WhatsApp">
        <Icon name="bell" />
      </button>

      <dialog ref={dialog} className="sheet nt-dialog" onClick={(e) => e.target === dialog.current && close()}>
        <form onSubmit={save} className="nt-form">
          <header className="pd-head">
            <div className="dev-head">
              <Icon name="bell" size={22} className="nt-ico" />
              <h2>Notifikasi WhatsApp</h2>
            </div>
            <button type="button" className="icon-btn" onClick={close} aria-label="Tutup"><Icon name="close" /></button>
          </header>

          <div className="pd-body">
            {info && !info.enabled && (
              <Alert tone="warn">Server belum punya token Fonnte (<code>FONNTE_TOKEN</code>), jadi belum ada pesan yang terkirim. Setting tetap bisa disimpan.</Alert>
            )}
            {info?.dry_run && <Alert tone="info">Mode uji (<code>WA_DRY_RUN=1</code>): pesan hanya ditulis ke log server, tidak dikirim.</Alert>}
            {error && <Alert tone="err">{error}</Alert>}

            {draft && (
              <>
                <label className="nt-target">
                  <span>Nomor tujuan</span>
                  <input type="text" inputMode="tel" value={draft.wa_target} autoComplete="off"
                         placeholder={info?.env_target ? "Kosong = nomor bawaan server" : "0812xxxxxxx, 0857xxxxxxx"}
                         onChange={(e) => setDraft({ ...draft, wa_target: e.target.value })} />
                  <small className="field-hint">
                    Pisahkan dengan koma, maksimal 10. Boleh ID grup Fonnte (…@g.us).
                    {info?.env_target ? " Kalau kosong, pesan dikirim ke nomor bawaan server (WA_TARGET)." : ""}
                  </small>
                  {noTarget && <Alert tone="warn" className="sm">Belum ada nomor tujuan, jadi tidak ada pesan yang dikirim.</Alert>}
                </label>

                <section className="pd-sec">
                  <b className="nt-group">Peringatan</b>
                  <div className="nt-list">
                    {group("alert").map((t) => <Row key={t.key} t={t} draft={draft} setDraft={setDraft} />)}
                  </div>
                </section>
                <section className="pd-sec">
                  <b className="nt-group">Aksi otomatis <small>satu pesan per aksi, bisa puluhan per hari</small></b>
                  <div className="nt-list">
                    {group("auto").map((t) => <Row key={t.key} t={t} draft={draft} setDraft={setDraft} />)}
                  </div>
                </section>
              </>
            )}
          </div>

          <footer className="pd-foot">
            <button type="button" className="btn ghost" onClick={test}
                    disabled={!info?.enabled || dirty || noTarget || !!busy}
                    title={dirty ? "Simpan dulu, pesan uji memakai setting yang tersimpan" : "Kirim pesan uji ke nomor tujuan"}>
              {busy === "test" ? "Mengirim…" : "Kirim pesan uji"}
            </button>
            <div className="pd-actions">
              <button type="button" className="btn" onClick={() => (info && dirty ? setDraft(toDraft(info)) : close())}>{dirty ? "Batal" : "Tutup"}</button>
              <button className="btn primary" disabled={!dirty || !!busy}>{busy === "save" ? "Menyimpan…" : "Simpan"}</button>
            </div>
          </footer>
        </form>
      </dialog>
    </>
  );
}

function Row({ t, draft, setDraft }: { t: (typeof NOTIFY_TOGGLES)[number]; draft: Draft; setDraft: (d: Draft) => void }) {
  return (
    <label className="nt-row">
      <span className="nt-text"><b>{t.label}</b><small>{t.desc}</small></span>
      <input type="checkbox" role="switch" className="switch" checked={draft[t.key]}
             onChange={(e) => setDraft({ ...draft, [t.key]: e.target.checked })} />
    </label>
  );
}
