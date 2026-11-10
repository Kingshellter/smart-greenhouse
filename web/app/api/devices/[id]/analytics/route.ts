// GET /api/devices/:id/analytics?days=7
// Modul analitik: statistik harian (min/max/rata-rata), frekuensi & durasi pompa,
// estimasi air terpakai, berapa kali ventilasi dibuka, persentase waktu tutup terbuka.

import { APP_TZ, sql } from "@/lib/db";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days")) || 7, 1), 90);

  const [daily, actions, [flow]] = await Promise.all([
    sql`
      select (ts at time zone ${APP_TZ})::date::text as day,
             count(*)::int as readings,
             round(min(temperature_c), 1)::float8 as temp_min,
             round(max(temperature_c), 1)::float8 as temp_max,
             round(avg(temperature_c), 1)::float8 as temp_avg,
             round(min(humidity_pct), 1)::float8  as hum_min,
             round(max(humidity_pct), 1)::float8  as hum_max,
             round(avg(humidity_pct), 1)::float8  as hum_avg,
             round(min(soil_pct), 1)::float8      as soil_min,
             round(max(soil_pct), 1)::float8      as soil_max,
             round(avg(soil_pct), 1)::float8      as soil_avg,
             round(100.0 * avg(case when lid_state in ('open', 'maintenance') then 1 else 0 end), 1)::float8 as lid_open_pct
      from readings
      where device_id = ${id} and ts > now() - make_interval(days => ${days})
      group by 1`,
    sql`
      select (ts at time zone ${APP_TZ})::date::text as day,
             count(*) filter (where actuator = 'pump' and action = 'run')::int        as pump_runs,
             coalesce(sum(value) filter (where actuator = 'pump' and action = 'run'), 0)::float8 as pump_ms,
             count(*) filter (where actuator = 'pump' and trigger = 'auto')::int      as pump_auto,
             count(*) filter (where actuator = 'lid' and action = 'open')::int        as lid_opens,
             count(*) filter (where actuator = 'system' and action = 'safety')::int   as safety_stops
      from actuator_events
      where device_id = ${id} and ts > now() - make_interval(days => ${days})
      group by 1`,
    sql`select pump_flow_ml_s from device_settings where device_id = ${id}`,
  ]);

  const flowMlS = Number(flow?.pump_flow_ml_s ?? 0);
  const byDay = new Map<string, Record<string, unknown>>();
  for (const d of daily) byDay.set(d.day, { ...d });
  for (const a of actions) byDay.set(a.day, { ...(byDay.get(a.day) ?? { day: a.day }), ...a });

  const rows = [...byDay.values()]
    .map((d) => {
      const pumpMs = Number(d.pump_ms ?? 0);
      return {
        pump_runs: 0, pump_auto: 0, lid_opens: 0, safety_stops: 0, ...d,
        day: String(d.day),
        pump_ms: pumpMs,
        water_ml: flowMlS > 0 ? Math.round((pumpMs / 1000) * flowMlS) : null,
      };
    })
    .sort((a, b) => a.day.localeCompare(b.day));

  const sum = (k: string) => rows.reduce((s, r) => s + Number((r as Record<string, unknown>)[k] ?? 0), 0);
  const totals = {
    days: rows.length,
    pump_runs: sum("pump_runs"),
    pump_seconds: Math.round(sum("pump_ms") / 100) / 10,
    water_ml: flowMlS > 0 ? sum("water_ml") : null,
    lid_opens: sum("lid_opens"),
    safety_stops: sum("safety_stops"),
  };
  return Response.json({ days, timezone: APP_TZ, totals, daily: rows });
}
