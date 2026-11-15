// PUT    /api/presets/:pid  → ubah preset custom (nama/nilai/catatan)
// DELETE /api/presets/:pid  → hapus preset custom
// Preset bawaan hanya-baca.

import { sql } from "@/lib/db";
import { bad, readJson } from "@/lib/http";
import { PRESET_FIELDS, cleanName, validatePreset } from "@/lib/presets";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ pid: string }> };
const COLS = ["id", "name", "builtin", ...PRESET_FIELDS, "source", "note"];

async function findCustom(pid: string) {
  const id = Number(pid);
  if (!Number.isInteger(id)) return { err: bad("id preset tidak valid") };
  const [p] = await sql`select id, builtin from plant_presets where id = ${id}`;
  if (!p) return { err: bad("Preset tidak ditemukan", 404) };
  if (p.builtin) return { err: bad("Preset bawaan tidak bisa diubah atau dihapus", 403) };
  return { id };
}

export async function PUT(req: Request, { params }: Ctx) {
  const f = await findCustom((await params).pid);
  if (f.err) return f.err;
  const b = await readJson(req);
  if (!b) return bad("JSON tidak valid");
  const name = cleanName(b.name);
  if (!name) return bad("Nama preset 2–40 karakter");
  const v = validatePreset(b);
  if (typeof v === "string") return bad(v, 422);
  const note = b.note ? String(b.note).slice(0, 200) : null;

  try {
    const [row] = await sql`
      update plant_presets set ${sql({ name, ...v, note })}, updated_at = now()
      where id = ${f.id} returning ${sql(COLS)}`;
    return Response.json(row);
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return bad(`Preset "${name}" sudah ada`, 409);
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const f = await findCustom((await params).pid);
  if (f.err) return f.err;
  await sql`delete from plant_presets where id = ${f.id}`; // device_settings.preset_id → null (on delete set null)
  return Response.json({ ok: true });
}
