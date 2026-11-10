// GET  /api/devices        → daftar node + reading terakhir
// POST /api/devices {id,name} → daftarkan node baru, return api_key (sekali saja)

import { randomBytes } from "node:crypto";
import { sql } from "@/lib/db";
import { bad, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await sql`
    select d.id, d.name, d.last_seen,
           s.mode, r.ts, r.soil_pct, r.temperature_c, r.humidity_pct,
           r.lid_state, r.pump_state, r.tank_warning
    from devices d
    left join device_settings s on s.device_id = d.id
    left join lateral (select * from readings where device_id = d.id order by ts desc limit 1) r on true
    order by d.id`;
  return Response.json(rows);
}

export async function POST(req: Request) {
  const b = await readJson(req);
  const id = String(b?.id ?? "").trim();
  const name = String(b?.name ?? "").trim() || id;
  if (!/^[a-z0-9-]{2,32}$/.test(id)) return bad("id: 2-32 karakter huruf kecil, angka, atau tanda -");

  const apiKey = randomBytes(18).toString("base64url");
  const inserted = await sql.begin(async (tx) => {
    const rows = await tx`insert into devices (id, name, api_key) values (${id}, ${name}, ${apiKey})
                          on conflict (id) do nothing returning id`;
    if (rows.length) await tx`insert into device_settings (device_id) values (${id})`;
    return rows.length > 0;
  });
  if (!inserted) return bad(`Node ${id} sudah ada`, 409);
  return Response.json({ id, name, api_key: apiKey }, { status: 201 });
}
