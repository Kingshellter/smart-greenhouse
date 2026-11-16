// PUT /api/devices/:id/settings  body: field yang ingin diubah (parsial)
// ESP32 menerima setting baru pada sync berikutnya (≤ ~3 s), atau seketika lewat MQTT kalau aktif.

import { after } from "next/server";
import { sql } from "@/lib/db";
import { bad, readJson } from "@/lib/http";
import { mqttPublish, mqttServerEnabled, settingsPayload, topic } from "@/lib/mqtt";
import { SETTINGS_COLUMNS, mergeSettings, type Settings } from "@/lib/settings";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const patch = await readJson(req);
  if (!patch) return bad("JSON tidak valid");

  const [current] = await sql<Settings[]>`select ${sql(SETTINGS_COLUMNS)} from device_settings where device_id = ${id}`;
  if (!current) return bad("Node tidak ditemukan", 404);

  const next = mergeSettings(current, patch);
  if (typeof next === "string") return bad(next, 422);

  const [saved] = await sql`
    update device_settings set ${sql(next, SETTINGS_COLUMNS)}, updated_at = now()
    where device_id = ${id}
    returning ${sql(SETTINGS_COLUMNS)}, updated_at`;
  if (mqttServerEnabled())
    after(() => mqttPublish([{ topic: topic(id, "settings"), payload: settingsPayload(saved), retain: true }]));
  return Response.json(saved);
}
