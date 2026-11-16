// Setting notifikasi WhatsApp per node.
// GET /api/devices/:id/notify  → { ...prefs, enabled, dry_run, env_target }
// PUT /api/devices/:id/notify  body parsial: { wa_target?: string|null, tank_warning?: boolean, ... }
// Tidak dikirim ke ESP32 (beda dengan device_settings).

import { sql } from "@/lib/db";
import { bad, readJson } from "@/lib/http";
import { DRY_RUN, envTarget, getNotifyPrefs, waEnabled } from "@/lib/notify";
import { TOGGLE_KEYS, parseTargets, type NotifyInfo, type NotifyPrefs } from "@/lib/notify-prefs";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const info = (p: NotifyPrefs): NotifyInfo => ({ ...p, enabled: waEnabled(), dry_run: DRY_RUN, env_target: !!envTarget() });

async function exists(id: string) {
  const [d] = await sql`select 1 from devices where id = ${id}`;
  return !!d;
}

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!(await exists(id))) return bad("Node tidak ditemukan", 404);
  return Response.json(info(await getNotifyPrefs(id)));
}

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const patch = await readJson(req);
  if (!patch) return bad("JSON tidak valid");
  if (!(await exists(id))) return bad("Node tidak ditemukan", 404);

  const next = await getNotifyPrefs(id);
  for (const k of TOGGLE_KEYS) {
    if (!(k in patch)) continue;
    if (typeof patch[k] !== "boolean") return bad(`${k} harus true/false`, 422);
    next[k] = patch[k];
  }
  if ("wa_target" in patch) {
    const t = parseTargets(patch.wa_target);
    if (t && typeof t === "object") return bad(t.error, 422);
    next.wa_target = t;
  }

  const row = { device_id: id, ...next };
  const cols = ["device_id", "wa_target", ...TOGGLE_KEYS] as const;
  await sql`
    insert into notify_settings ${sql(row, cols)}
    on conflict (device_id) do update set ${sql(row, cols.slice(1))}, updated_at = now()`;
  return Response.json(info(next));
}
