// GET /api/notify/chats → chat yang baru mengirim pesan ke bot Telegram (untuk memilih chat ID).
// Kosong = belum ada yang mengirim /start ke bot dalam ±24 jam terakhir.

import { bad } from "@/lib/http";
import { botUsername, DRY_RUN, recentChats } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) return bad(DRY_RUN ? "Mode uji tanpa token: daftar chat tidak tersedia" : "TELEGRAM_BOT_TOKEN belum diisi di server", 422);
  const r = await recentChats();
  if (!r.ok) return bad(`Telegram: ${r.error}`, 502);
  return Response.json({ bot: await botUsername(), chats: r.chats });
}
