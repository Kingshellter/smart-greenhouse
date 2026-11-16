"use client";

// Toast di kanan atas, di bawah navigasi. Tiap pesan kotak sendiri: yang baru masuk dari atas
// (yang lama turun perlahan), yang habis waktunya memudar lalu menutup celahnya. Pesan yang sama
// selagi masih tampil hanya memperpanjang waktunya, jadi klik berulang tidak menumpuk kotak.

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, type AlertTone } from "./ui";

type Item = { id: number; text: string; tone: AlertTone; entering: boolean; leaving: boolean };

const MAX = 3; // lebih dari ini, yang paling lama ditutup
const LEAVE_MS = 320; // sama dengan durasi transisi .toast-item.leaving
const ENTER_MS = 400; // sedikit lebih lama dari animasi toast-in
const duration = (t: AlertTone) => (t === "err" || t === "warn" ? 5000 : 3200);

export function useToasts() {
  const [items, setItems] = useState<Item[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const box = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  // popup <dialog> yang sudah berada di bawah wadah toast (sejak terakhir dinaikkan)
  const raisedOver = useRef(new Set<HTMLDialogElement>());

  /**
   * Wadah toast adalah popover (top layer) supaya tampil di atas popup <dialog>. Elemen top layer
   * ditumpuk menurut urutan dibuka, jadi popup yang dibuka setelah toast muncul menutupinya.
   * Dinaikkan lagi hanya kalau ada popup baru seperti itu; toast yang sedang tampil tidak memutar
   * ulang animasinya karena animasi masuk hanya dipasang selama `entering`.
   */
  const raise = () => {
    const el = box.current;
    if (!el?.showPopover) return;
    const modals = [...document.querySelectorAll<HTMLDialogElement>("dialog:modal")];
    if (el.matches(":popover-open") && modals.every((d) => raisedOver.current.has(d))) return;
    if (el.matches(":popover-open")) el.hidePopover();
    el.showPopover();
    raisedOver.current = new Set(modals);
    for (const d of modals) d.addEventListener("close", () => raisedOver.current.delete(d), { once: true });
  };

  const schedule = (id: number, ms: number, fn: () => void) => {
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(fn, ms));
  };

  const leave = useCallback((id: number) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    schedule(id, LEAVE_MS, () => {
      timers.current.delete(id);
      setItems((xs) => xs.filter((x) => x.id !== id));
    });
  }, []);

  const flash = useCallback((text: string, tone: AlertTone = "ok") => {
    const visible = itemsRef.current.filter((x) => !x.leaving);
    const same = visible.find((x) => x.text === text && x.tone === tone);
    raise();
    if (same) return schedule(same.id, duration(tone), () => leave(same.id));

    const id = nextId.current++;
    setItems((xs) => [{ id, text, tone, entering: true, leaving: false }, ...xs]);
    setTimeout(() => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, entering: false } : x))), ENTER_MS);
    visible.slice(MAX - 1).forEach((x) => leave(x.id));
    schedule(id, duration(tone), () => leave(id));
  }, [leave]);

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  const node = (
    <div ref={box} popover="manual" className="toasts" role="status" aria-live="polite">
      {items.map((x) => (
        <div key={x.id} className={`toast-item ${x.entering ? "entering" : ""} ${x.leaving ? "leaving" : ""}`}>
          <div className="toast-in"><Alert tone={x.tone}>{x.text}</Alert></div>
        </div>
      ))}
    </div>
  );
  return { flash, node };
}
