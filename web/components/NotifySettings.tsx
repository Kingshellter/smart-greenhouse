"use client";

// Tombol lonceng di navigasi dashboard + popup setting notifikasi Telegram untuk node ini:
// chat ID tujuan (kosong = TELEGRAM_CHAT_ID server) dan jenis pesan yang dikirim.

import { useRef, useState } from "react";
import { api } from "@/lib/client";
import { NOTIFY_TOGGLES, TOGGLE_KEYS, type NotifyInfo, type NotifyToggle, type TelegramChat } from "@/lib/notify-prefs";
import { Icon } from "./icons";
import { Alert, type AlertTone } from "./ui";

type Draft = Record<NotifyToggle, boolean> & { tg_chat_id: string };

const toDraft = (i: NotifyInfo): Draft => ({
  ...(Object.fromEntries(TOGGLE_KEYS.map((k) => [k, i[k]])) as Record<NotifyToggle, boolean>),
  tg_chat_id: (i.tg_chat_id ?? "").replaceAll(",", ", "),
});
const sameDraft = (a: Draft, b: Draft) => a.tg_chat_id.trim() === b.tg_chat_id.trim() && TOGGLE_KEYS.every((k) => a[k] === b[k]);
const ids = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const CHAT_TYPE: Record<string, string> = { private: "pribadi", group: "grup", supergroup: "grup", channel: "kanal" };

export default function NotifySettings({ id, notify }: { id: string; notify: (text: string, tone?: AlertTone) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [info, setInfo] = useState<NotifyInfo | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | "chats" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chats, setChats] = useState<TelegramChat[] | null>(null);

  async function open() {
    dialog.current?.showModal();
    setError(null);
    setChats(null);
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
        body: JSON.stringify({ ...draft, tg_chat_id: draft.tg_chat_id.trim() || null }),
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
      notify(info?.dry_run ? "Pesan uji ditulis ke log server (mode uji)" : "Pesan uji terkirim, cek Telegram", info?.dry_run ? "info" : "ok");
    } catch (e) {
      setError(`Pesan uji gagal: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function findChats() {
    setBusy("chats");
    setError(null);
    try {
      const r = await api<{ chats: TelegramChat[] }>(`/api/notify/chats`);
      setChats(r.chats);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function addChat(chatId: string) {
    if (!draft) return;
    const cur = ids(draft.tg_chat_id);
    if (!cur.includes(chatId)) setDraft({ ...draft, tg_chat_id: [...cur, chatId].join(", ") });
  }

  const noTarget = !!draft && !draft.tg_chat_id.trim() && !info?.env_target;
  const group = (g: "alert" | "auto") => NOTIFY_TOGGLES.filter((t) => t.group === g);
  const botLink = info?.bot ? `https://t.me/${info.bot}` : null;

  return (
    <>
      <button type="button" className="icon-btn" onClick={open} aria-label="Notifikasi Telegram" title="Notifikasi Telegram">
        <Icon name="bell" />
      </button>

      <dialog ref={dialog} className="sheet nt-dialog" onClick={(e) => e.target === dialog.current && close()}>
        <form onSubmit={save} className="nt-form">
          <header className="pd-head">
            <div className="dev-head">
              <Icon name="bell" size={22} className="nt-ico" />
              <h2>Notifikasi Telegram</h2>
            </div>
            <button type="button" className="icon-btn" onClick={close} aria-label="Tutup"><Icon name="close" /></button>
          </header>

          <div className="pd-body">
            {info && !info.enabled && (
              <Alert tone="warn">Server belum punya token bot (<code>TELEGRAM_BOT_TOKEN</code>), jadi belum ada pesan yang terkirim. Setting tetap bisa disimpan.</Alert>
            )}
            {info?.enabled && !info.dry_run && !info.bot && (
              <Alert tone="err">Token bot ditolak Telegram. Cek <code>TELEGRAM_BOT_TOKEN</code> di server.</Alert>
            )}
            {info?.dry_run && <Alert tone="info">Mode uji (<code>NOTIFY_DRY_RUN=1</code>): pesan hanya ditulis ke log server, tidak dikirim.</Alert>}
            {error && <Alert tone="err">{error}</Alert>}

            {draft && (
              <>
                <label className="nt-target">
                  <span>Chat ID tujuan</span>
                  <input type="text" value={draft.tg_chat_id} autoComplete="off" spellCheck={false}
                         placeholder={info?.env_target ? "Kosong = chat ID bawaan server" : "123456789, -1001234567890"}
                         onChange={(e) => setDraft({ ...draft, tg_chat_id: e.target.value })} />
                  <small className="field-hint">
                    {botLink ? (
                      <>Kirim <b>/start</b> ke <a href={botLink} target="_blank" rel="noreferrer">@{info?.bot}</a> (atau tambahkan bot ke grup), lalu tekan <i>Cari chat ID</i>. </>
                    ) : (
                      "Kirim /start ke bot dulu, lalu tekan Cari chat ID. "
                    )}
                    Pisahkan dengan koma, maksimal 10.
                    {info?.env_target ? " Kalau kosong, pesan dikirim ke chat ID bawaan server (TELEGRAM_CHAT_ID)." : ""}
                  </small>
                  {noTarget && <Alert tone="warn" className="sm">Belum ada chat ID tujuan, jadi tidak ada pesan yang dikirim.</Alert>}
                </label>

                <div className="nt-chats">
                  <button type="button" className="btn sm" onClick={findChats} disabled={!info?.enabled || info.dry_run || !!busy}>
                    {busy === "chats" ? "Mencari…" : "Cari chat ID"}
                  </button>
                  {chats && chats.length === 0 && (
                    <small className="field-hint">Belum ada chat. Kirim /start ke bot (dalam 24 jam terakhir), lalu cari lagi.</small>
                  )}
                  {chats && chats.length > 0 && (
                    <div className="nt-list">
                      {chats.map((c) => {
                        const added = ids(draft.tg_chat_id).includes(c.id);
                        return (
                          <div key={c.id} className="nt-row">
                            <span className="nt-text"><b>{c.name}</b><small>{CHAT_TYPE[c.type] ?? c.type} · {c.id}</small></span>
                            <button type="button" className="btn sm" disabled={added} onClick={() => addChat(c.id)}>{added ? "Dipakai" : "Pakai"}</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

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
                    title={dirty ? "Simpan dulu, pesan uji memakai setting yang tersimpan" : "Kirim pesan uji ke chat tujuan"}>
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
