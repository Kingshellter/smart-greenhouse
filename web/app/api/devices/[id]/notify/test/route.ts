// POST /api/devices/:id/notify/test → kirim pesan uji ke chat ID node ini (atau TELEGRAM_CHAT_ID).

import { sql } from "@/lib/db";
import { bad } from "@/lib/http";
import { notify } from "@/lib/notify";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const [device] = await sql<{ id: string; name: string }[]>`select id, name from devices where id = ${id}`;
  if (!device) return bad("Node tidak ditemukan", 404);
  const r = await notify(device, "test", "🔔 *Pesan uji.* Notifikasi Telegram untuk node ini sudah tersambung.");
  if (r.status === "sent") return Response.json({ ok: true });
  return bad(r.error ?? "Tidak terkirim", r.status === "failed" ? 502 : 422);
}
