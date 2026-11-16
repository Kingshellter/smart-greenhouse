// GET /api/mqtt/config → koneksi MQTT untuk dashboard (WebSocket, akun khusus subscribe).
// Di balik login dashboard (proxy.ts). Kosong/enabled:false = dashboard tetap polling HTTP saja.

import { MQTT_PREFIX } from "@/lib/mqtt";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.MQTT_WS_URL?.trim();
  if (!url) return Response.json({ enabled: false });
  return Response.json({
    enabled: true,
    url,
    username: process.env.MQTT_VIEW_USER || null,
    password: process.env.MQTT_VIEW_PASS || null,
    prefix: MQTT_PREFIX,
  });
}
