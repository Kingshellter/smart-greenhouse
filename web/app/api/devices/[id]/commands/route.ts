// POST /api/devices/:id/commands
//   { type: "pump_dose", payload: { ms: 3000 } }
//   { type: "lid", payload: { position: "open" | "closed" | "maintenance" | "exit_maintenance" } }
// Mode manual: semua perintah. Mode otomatis: semua terkunci, kecuali masuk/keluar maintenance
// (sama dengan runCommand() di firmware: maintenance boleh di mode apa pun).
// Kalau MQTT aktif, perintah juga langsung dikirim ke topik <prefix>/<id>/cmd (ESP32 menjalankannya
// seketika). ESP32 tetap mengambilnya pada sync berikutnya sebagai cadangan, dan melewati id yang
// sudah dijalankan. Perintah yang tidak terambil dalam 60 s kedaluwarsa.

import { after } from "next/server";
import { sql } from "@/lib/db";
import { bad, num, readJson } from "@/lib/http";
import { mqttPublish, mqttServerEnabled, topic } from "@/lib/mqtt";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const b = await readJson(req);
  if (!b) return bad("JSON tidak valid");

  const [s] = await sql`select mode, dose_ms from device_settings where device_id = ${id}`;
  if (!s) return bad("Node tidak ditemukan", 404);
  const p = (b.payload ?? {}) as Record<string, unknown>;
  const maint = b.type === "lid" && (p.position === "maintenance" || p.position === "exit_maintenance");
  if (s.mode !== "manual" && !maint) return bad("Ubah ke mode manual dulu untuk kontrol langsung", 409);

  let payload: Record<string, unknown>;
  if (b.type === "pump_dose") {
    const ms = p.ms === undefined ? s.dose_ms : num(p.ms, 500, 10000);
    if (ms === null) return bad("ms harus 500-10000");
    payload = { ms };
  } else if (b.type === "lid") {
    if (!["open", "closed", "maintenance", "exit_maintenance"].includes(p.position as string))
      return bad("position harus open, closed, maintenance, atau exit_maintenance");
    payload = { position: p.position };
  } else {
    return bad("type harus pump_dose atau lid");
  }

  const [cmd] = await sql`
    insert into commands (device_id, type, payload) values (${id}, ${b.type as string}, ${sql.json(payload as never)})
    returning id::int as id, type, payload, status, created_at`;
  if (mqttServerEnabled())
    after(() => mqttPublish([{ topic: topic(id, "cmd"), payload: { id: cmd.id, type: cmd.type, payload: cmd.payload } }]));
  return Response.json(cmd, { status: 201 });
}
