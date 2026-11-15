"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Data GET terakhir per URL. Halaman yang dibuka lagi (atau sudah di-prefetch) langsung tampil
// dengan data ini, lalu polling memperbaruinya. Tanpa ini setiap pindah halaman mulai dari kosong.
const cache = new Map<string, unknown>();

/** Ambil `url` di latar belakang supaya halaman berikutnya bisa langsung tampil. Error diabaikan. */
export function prefetch(url: string) {
  api(url).catch(() => {});
}

export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  if (!init?.method || init.method === "GET") cache.set(url, data);
  return data as T;
}

/** Ambil data dari `url` tiap `ms` milidetik. Berhenti saat tab tersembunyi. */
export function usePoll<T>(url: string | null, ms: number) {
  const [data, setData] = useState<T | null>(() => (url ? (cache.get(url) as T | undefined) ?? null : null));
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;

  const refresh = useCallback(async () => {
    const u = urlRef.current;
    if (!u) return;
    try {
      const d = await api<T>(u);
      if (urlRef.current === u) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (url && cache.has(url)) setData(cache.get(url) as T); // mis. ganti rentang grafik ke yang pernah dibuka
    refresh();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, ms);
    return () => clearInterval(t);
  }, [url, ms, refresh]);

  return { data, error, refresh };
}

const TZ = "Asia/Jakarta";
export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit" });
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
/** Tanggal kalender (WIB) sebuah waktu, untuk mengelompokkan per hari. */
export const dayKey = (iso: string | number | Date) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
/** "Hari ini", "Kemarin", atau tanggal pendek. */
export function dayLabel(iso: string) {
  const k = dayKey(iso);
  if (k === dayKey(Date.now())) return "Hari ini";
  if (k === dayKey(Date.now() - 86_400_000)) return "Kemarin";
  return new Date(iso).toLocaleDateString("id-ID", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
}
export const fmtAxis = (iso: string, long: boolean) =>
  new Date(iso).toLocaleString("id-ID", long
    ? { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
    : { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

export function ago(iso: string | null | undefined) {
  if (!iso) return "belum pernah";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} dtk lalu`;
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
}

export const fmt = (v: number | null | undefined, digits = 1, unit = "") =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : `${Number(v).toFixed(digits)}${unit}`;
