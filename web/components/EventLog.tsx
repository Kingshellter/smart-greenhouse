"use client";

import { fmtDateTime, usePoll } from "@/lib/client";
import type { ActuatorEvent } from "@/lib/types";

const TRIGGER: Record<string, string> = { auto: "otomatis", web: "web", serial: "serial", safety: "safety", boot: "boot" };

function describe(e: ActuatorEvent) {
  switch (e.actuator) {
    case "pump":
      return `💧 Pompa menyala ${((e.value ?? 0) / 1000).toFixed(1)} s`;
    case "lid":
      if (e.action === "open") return `🔼 Ventilasi dibuka (${e.value}°)`;
      if (e.action === "close") return `🔽 Ventilasi ditutup (${e.value}°)`;
      if (e.action === "maintenance") return `🛠 Mode maintenance, tutup diangkat (${e.value}°)`;
      return `↕ Servo ke ${e.value}°`;
    case "mode":
      return `⚙ Mode → ${e.action === "manual" ? "manual" : "otomatis"}`;
    case "system": {
      const reason = (e.detail?.reason as string | undefined) ?? "";
      if (e.action === "boot") return "⏻ ESP32 menyala";
      if (e.action === "tank_warning") return "⚠ Peringatan tangki air";
      if (e.action === "safety") return `⛔ Safety stop${reason ? `: ${reason}` : ""}`;
      return e.action;
    }
  }
}

export default function EventLog({ id }: { id: string }) {
  const { data } = usePoll<ActuatorEvent[]>(`/api/devices/${id}/events?limit=30`, 5000);
  return (
    <section className="card">
      <h3>Log aktuator</h3>
      {!data?.length ? (
        <p className="muted empty">Belum ada aksi tercatat.</p>
      ) : (
        <ul className="log">
          {data.map((e) => (
            <li key={e.id}>
              <time>{fmtDateTime(e.ts)}</time>
              <span>{describe(e)}</span>
              <span className={`tag ${e.trigger}`}>{TRIGGER[e.trigger] ?? e.trigger}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
