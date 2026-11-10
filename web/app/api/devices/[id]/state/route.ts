// GET /api/devices/:id/state → info node, setting, reading terakhir, perintah pending

import { sql } from "@/lib/db";
import { bad } from "@/lib/http";
import { SETTINGS_COLUMNS } from "@/lib/settings";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const [device] = await sql`select id, name, last_seen from devices where id = ${id}`;
  if (!device) return bad("Node tidak ditemukan", 404);

  const [[settings], [reading], [pending]] = await Promise.all([
    sql`select ${sql(SETTINGS_COLUMNS)}, updated_at from device_settings where device_id = ${id}`,
    sql`select * from readings where device_id = ${id} order by ts desc limit 1`,
    sql`select count(*)::int as n from commands where device_id = ${id} and status = 'pending'`,
  ]);

  const online = device.last_seen && Date.now() - new Date(device.last_seen).getTime() < 30_000;
  return Response.json({ device: { ...device, online: !!online }, settings, reading: reading ?? null, pending_commands: pending.n });
}
