// GET /api/health → cek koneksi database (tanpa login). Tidak membuka data apa pun.
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [r] = await sql`select count(*)::int as nodes from devices`;
    return Response.json({ ok: true, db: "connected", nodes: r.nodes });
  } catch (e) {
    return Response.json({ ok: false, db: "error", error: (e as Error).message }, { status: 500 });
  }
}
