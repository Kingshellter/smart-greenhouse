// GET  /api/presets  → semua preset (bawaan dulu, lalu custom)
// POST /api/presets  {name, soil_dry_pct, temp_open_c, temp_close_c, hum_open_pct, hum_close_pct, note?} → preset custom baru

import { sql } from "@/lib/db";
import { bad, readJson } from "@/lib/http";
import { PRESET_FIELDS, cleanName, validatePreset } from "@/lib/presets";

export const dynamic = "force-dynamic";
const COLS = ["id", "name", "builtin", ...PRESET_FIELDS, "source", "note"];

export async function GET() {
  const rows = await sql`select ${sql(COLS)} from plant_presets order by builtin desc, id`;
  return Response.json(rows);
}

export async function POST(req: Request) {
  const b = await readJson(req);
  if (!b) return bad("JSON tidak valid");
  const name = cleanName(b.name);
  if (!name) return bad("Nama preset 2–40 karakter");
  const v = validatePreset(b);
  if (typeof v === "string") return bad(v, 422);
  const note = b.note ? String(b.note).slice(0, 200) : null;

  const [row] = await sql`
    insert into plant_presets ${sql({ name, builtin: false, ...v, source: null, note })}
    on conflict (name) do nothing
    returning ${sql(COLS)}`;
  if (!row) return bad(`Preset "${name}" sudah ada`, 409);
  return Response.json(row, { status: 201 });
}
