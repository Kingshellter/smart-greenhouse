// POST /api/devices/:id/preset {preset_id} → salin nilai preset ke setting node.
// ESP32 menerima threshold baru pada sync berikutnya, sama seperti PUT settings.

import { sql } from "@/lib/db";
import { bad, readJson } from "@/lib/http";
import { PRESET_FIELDS, type PresetValues } from "@/lib/presets";
import { SETTINGS_COLUMNS, mergeSettings, type Settings } from "@/lib/settings";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const b = await readJson(req);
  const presetId = Number(b?.preset_id);
  if (!Number.isInteger(presetId)) return bad("preset_id tidak valid");

  const [[current], [preset]] = await Promise.all([
    sql<Settings[]>`select ${sql(SETTINGS_COLUMNS)} from device_settings where device_id = ${id}`,
    sql<(PresetValues & { name: string })[]>`select name, ${sql(PRESET_FIELDS)} from plant_presets where id = ${presetId}`,
  ]);
  if (!current) return bad("Node tidak ditemukan", 404);
  if (!preset) return bad("Preset tidak ditemukan", 404);

  const patch = Object.fromEntries(PRESET_FIELDS.map((k) => [k, preset[k]]));
  const next = mergeSettings(current, patch);
  if (typeof next === "string") return bad(next, 422);

  const [saved] = await sql`
    update device_settings set ${sql(next, SETTINGS_COLUMNS)}, preset_id = ${presetId}, updated_at = now()
    where device_id = ${id}
    returning ${sql(SETTINGS_COLUMNS)}, preset_id, updated_at`;
  return Response.json({ ...saved, preset_name: preset.name });
}
