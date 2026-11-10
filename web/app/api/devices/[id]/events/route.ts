// GET /api/devices/:id/events?limit=50 → log aksi aktuator terbaru

import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get("limit")) || 50, 1), 500);
  const rows = await sql`
    select id::int as id, ts, actuator, action, value, trigger, detail
    from actuator_events where device_id = ${id}
    order by ts desc limit ${limit}`;
  return Response.json(rows);
}
