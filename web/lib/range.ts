"use client";

// Rentang grafik riwayat sensor, satu untuk seluruh dasbor: diganti di popup perangkat atau kartu hotspot,
// tile sensor di kiri ikut berganti. Sengaja store modul (bukan React context), karena kartu hotspot
// dirender drei <Html> di root React terpisah yang tidak melihat context dari luar kanvas.

import { useSyncExternalStore } from "react";

/** "jam" dan "hari" ditulis lengkap: singkatan "7h" terbaca seperti 7 jam. Kunci = parameter `range` API readings. */
export const RANGES: [string, string][] = [["1h", "1 jam"], ["6h", "6 jam"], ["24h", "24 jam"], ["3d", "3 hari"], ["7d", "7 hari"], ["30d", "30 hari"]];
const DEFAULT = "24h";
const KEY = "gh-range";

let current = DEFAULT;
try {
  const saved = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
  if (saved && RANGES.some(([k]) => k === saved)) current = saved;
} catch { /* penyimpanan diblokir: pakai bawaan */ }

const subs = new Set<() => void>();
const subscribe = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; };

export function setRange(r: string) {
  if (r === current) return;
  current = r;
  try { window.localStorage.setItem(KEY, r); } catch { /* abaikan */ }
  subs.forEach((fn) => fn());
}

export const rangeLabel = (r: string) => RANGES.find(([k]) => k === r)?.[1] ?? r;

/** Rentang grafik yang sedang dipilih + pengubahnya. */
export function useRange(): [string, (r: string) => void] {
  return [useSyncExternalStore(subscribe, () => current, () => DEFAULT), setRange];
}

/** Rentang pendek dimuat ulang lebih sering. */
export const rangePollMs = (r: string) => (r === "1h" ? 10_000 : r === "6h" ? 30_000 : 60_000);
