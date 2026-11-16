"use client";

// State live lewat MQTT (WebSocket) untuk dashboard satu node. Tanpa MQTT_WS_URL di server,
// hook ini diam saja dan dashboard tetap memakai polling HTTP.
// ESP32 publish <prefix>/<id>/state: aktuator seketika, sensor ≤ tiap 2 s, heartbeat tiap 10 s,
// plus <prefix>/<id>/status (LWT).

import { useEffect, useState } from "react";
import { api } from "./client";
import type { DeviceState, Reading } from "./types";

type Config = { enabled: false } | { enabled: true; url: string; username: string | null; password: string | null; prefix: string };

/** Isi pesan state dari ESP32 (field sama dengan `reading` di /api/ingest). */
export type LiveReading = Partial<Omit<Reading, "ts">>;

export type Live = {
  /** tersambung ke broker */
  connected: boolean;
  /** state terakhir yang diterima selama halaman terbuka (bukan pesan retained lama) */
  reading: LiveReading | null;
  /** waktu (ms) pesan state terakhir diterima */
  at: number;
  /** status LWT terakhir dari ESP32 */
  status: "online" | "offline" | null;
};

/** Pesan state dianggap live selama sekian ms; ESP32 mengirim heartbeat minimal tiap 10 s. */
export const LIVE_FRESH_MS = 25_000;

const EMPTY: Live = { connected: false, reading: null, at: 0, status: null };

export function useLive(id: string): Live {
  const [live, setLive] = useState<Live>(EMPTY);

  useEffect(() => {
    let stop = false;
    let client: { end: (force?: boolean) => void } | null = null;
    (async () => {
      const cfg = await api<Config>("/api/mqtt/config").catch(() => null);
      if (stop || !cfg?.enabled) return;
      const { default: mqtt } = await import("mqtt"); // dimuat hanya kalau MQTT aktif
      if (stop) return;
      const base = `${cfg.prefix}/${id}`;
      const c = mqtt.connect(cfg.url, {
        username: cfg.username ?? undefined,
        password: cfg.password ?? undefined,
        clientId: `gh-web-${Math.random().toString(16).slice(2, 10)}`,
        reconnectPeriod: 5000,
        connectTimeout: 10_000,
        clean: true,
      });
      client = c;
      c.on("connect", () => {
        setLive((l) => ({ ...l, connected: true }));
        c.subscribe([`${base}/state`, `${base}/status`], { qos: 0 });
      });
      c.on("close", () => setLive((l) => ({ ...l, connected: false })));
      c.on("message", (t, buf, packet) => {
        const text = buf.toString();
        if (t.endsWith("/status")) {
          const status = text === "online" ? "online" : text === "offline" ? "offline" : null;
          setLive((l) => ({ ...l, status }));
          return;
        }
        // Pesan retained = state terakhir sebelum halaman dibuka; umurnya tidak diketahui, jadi tidak dianggap live.
        if (packet.retain) return;
        try {
          const reading = JSON.parse(text) as LiveReading;
          setLive((l) => ({ ...l, reading, at: Date.now() }));
        } catch {
          /* pesan rusak: abaikan */
        }
      });
    })();
    return () => {
      stop = true;
      client?.end(true);
      setLive(EMPTY);
    };
  }, [id]);

  return live;
}

/** State live masih baru (ESP32 tersambung ke broker dan mengirim). */
export const liveFresh = (l: Live, now = Date.now()) => !!l.reading && l.status !== "offline" && now - l.at < LIVE_FRESH_MS;

/** Gabungkan hasil polling HTTP dengan state live MQTT: nilai live menimpa reading selama masih baru. */
export function mergeLive(polled: DeviceState | null, l: Live): DeviceState | null {
  if (!polled || !l.reading || !liveFresh(l)) return polled;
  const ts = new Date(l.at).toISOString();
  const base: Reading = polled.reading ?? {
    ts, soil_raw: null, soil_pct: null, temperature_c: null, humidity_pct: null, lid_state: null,
    lid_angle: null, pump_state: null, mode: null, tank_warning: false, rssi: null,
  };
  return {
    ...polled,
    device: { ...polled.device, online: true, last_seen: ts },
    reading: { ...base, ...l.reading, ts },
  };
}
