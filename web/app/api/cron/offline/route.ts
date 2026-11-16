// Cek node offline → kirim WA. Node yang offline tidak memanggil /api/ingest,
// jadi perlu pemicu dari luar: cron tiap 1–5 menit (mis. cron-job.org, karena
// cron Vercel Hobby hanya sekali sehari).
//   GET /api/cron/offline   header: Authorization: Bearer <CRON_SECRET>
// Pesan "online lagi" dikirim oleh /api/ingest saat node kembali.

import { sql } from "@/lib/db";
import { bad, safeEqual } from "@/lib/http";
import { fmtDuration, notify, OFFLINE_ALERT_MIN, waEnabled } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return bad("CRON_SECRET belum diisi", 503);
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) return bad("Tidak diizinkan", 401);
  if (!waEnabled()) return Response.json({ enabled: false, alerted: [] });

  // Klaim dulu (hanya node yang pernah online, sudah lewat batas, dan belum dikabarkan),
  // supaya dua cron yang tumpang tindih tidak mengirim dua kali.
  const rows = await sql<{ id: string; name: string; last_seen: Date }[]>`
    update devices set offline_alert_at = now()
    where last_seen is not null and offline_alert_at is null
      and last_seen < now() - make_interval(mins => ${OFFLINE_ALERT_MIN})
    returning id, name, last_seen`;

  const alerted: string[] = [];
  for (const d of rows) {
    const ok = await notify(
      d,
      "offline",
      `📴 *Node offline:* tidak ada data selama ±${fmtDuration(Date.now() - d.last_seen.getTime())}. ` +
        `Kontrol otomatis tetap jalan di ESP32, tapi data dan perintah dari web tertunda. Cek WiFi dan daya node.`,
    );
    if (ok) alerted.push(d.id);
    // Gagal kirim → lepas klaim, dicoba lagi di cron berikutnya
    else await sql`update devices set offline_alert_at = null where id = ${d.id}`;
  }
  return Response.json({ enabled: true, checked: rows.length, alerted });
}
