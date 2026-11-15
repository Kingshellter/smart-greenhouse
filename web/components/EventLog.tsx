"use client";

import { Fragment } from "react";
import { dayKey, dayLabel, fmtDateTime, fmtTime, usePoll } from "@/lib/client";
import type { ActuatorEvent } from "@/lib/types";
import { Icon, type IconName } from "./icons";

const TRIGGER: Record<string, string> = { auto: "otomatis", web: "web", serial: "serial", safety: "safety", boot: "boot" };

function describe(e: ActuatorEvent) {
  switch (e.actuator) {
    case "pump":
      return `Pompa menyala ${((e.value ?? 0) / 1000).toFixed(1)} s`;
    case "lid":
      if (e.action === "open") return `Ventilasi dibuka (${e.value}°)`;
      if (e.action === "close") return `Ventilasi ditutup (${e.value}°)`;
      if (e.action === "maintenance") return `Mode maintenance, tutup diangkat (${e.value}°)`;
      return `Servo ke ${e.value}°`;
    case "mode":
      return `Mode diubah ke ${e.action === "manual" ? "manual" : "otomatis"}`;
    case "system": {
      const reason = (e.detail?.reason as string | undefined) ?? "";
      if (e.action === "boot") return "ESP32 menyala";
      if (e.action === "tank_warning") return "Peringatan tangki air";
      if (e.action === "safety") return `Safety stop${reason ? `: ${reason}` : ""}`;
      return e.action;
    }
  }
}

/** Ikon + warna gelembung per jenis aksi, supaya log bisa dipindai tanpa membaca tiap baris. */
function look(e: ActuatorEvent): { icon: IconName; tone: string } {
  if (e.trigger === "safety" || e.action === "tank_warning" || e.action === "safety") return { icon: e.action === "tank_warning" ? "tank" : "info", tone: "danger" };
  if (e.actuator === "pump") return { icon: "pump", tone: "pump" };
  if (e.actuator === "lid") return { icon: e.action === "maintenance" ? "wrench" : "lid", tone: "lid" };
  if (e.actuator === "mode") return { icon: "mode", tone: "" };
  return { icon: "wifi", tone: "" };
}

export default function EventLog({ id }: { id: string }) {
  const { data } = usePoll<ActuatorEvent[]>(`/api/devices/${id}/events?limit=30`, 5000);
  return (
    <section className="card log-card">
      <h3>Log aktuator</h3>
      {!data?.length ? (
        <div className="chart-empty log-empty">{data ? "Belum ada aksi tercatat." : "Memuat…"}</div>
      ) : (
        // daftar mengisi tinggi baris (mengikuti kartu di sebelahnya) dan di-scroll di dalam
        <div className="log-fill">
          <ul className="log">
            {data.map((e, i) => {
              const { icon, tone } = look(e);
              // tanggal hanya sekali per hari (judul kelompok); tiap baris cukup jamnya
              const newDay = i === 0 || dayKey(e.ts) !== dayKey(data[i - 1].ts);
              return (
                <Fragment key={e.id}>
                  {newDay && <li className="log-day">{dayLabel(e.ts)}</li>}
                  <li className="ev">
                    <span className={`ev-ico ${tone}`}><Icon name={icon} size={15} /></span>
                    <span className="ev-text">{describe(e)}</span>
                    <span className={`ev-trigger ${e.trigger}`}>{TRIGGER[e.trigger] ?? e.trigger}</span>
                    <time dateTime={e.ts} title={fmtDateTime(e.ts)}>{fmtTime(e.ts)}</time>
                  </li>
                </Fragment>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
