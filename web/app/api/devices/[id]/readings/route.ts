// GET /api/devices/:id/readings?range=1h|6h|24h|7d
// Data di-downsample per bucket waktu supaya grafik ringan.

import { sql } from "@/lib/db";
import { bad } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const RANGES: Record<string, { range: string; bucket: string }> = {
  "1h": { range: "1 hour", bucket: "30 seconds" },
  "6h": { range: "6 hours", bucket: "2 minutes" },
  "24h": { range: "24 hours", bucket: "5 minutes" },
  "7d": { range: "7 days", bucket: "30 minutes" },
};

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const key = new URL(req.url).searchParams.get("range") ?? "1h";
  const r = RANGES[key];
  if (!r) return bad("range harus 1h, 6h, 24h, atau 7d");

  const rows = await sql`
    select date_bin(${r.bucket}::interval, ts, timestamptz '2000-01-01') as t,
           round(avg(soil_pct), 1)::float8      as soil_pct,
           round(avg(temperature_c), 1)::float8 as temperature_c,
           round(avg(humidity_pct), 1)::float8  as humidity_pct,
           max(case when pump_state = 'on'  then 1 else 0 end) as pump_on,
           max(case when lid_state in ('open', 'maintenance') then 1 else 0 end) as lid_open
    from readings
    where device_id = ${id} and ts > now() - ${r.range}::interval
    group by 1 order by 1`;
  return Response.json(rows);
}
