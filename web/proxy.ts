// Basic auth untuk dashboard + API dashboard.
// Aktif hanya jika DASHBOARD_USER dan DASHBOARD_PASSWORD diisi.
// /api/ingest (ESP32, x-device-key) dan /api/cron (CRON_SECRET) dikecualikan.

import { NextResponse, type NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  const user = process.env.DASHBOARD_USER;
  const pass = process.env.DASHBOARD_PASSWORD;
  if (!user || !pass) return NextResponse.next();

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const [u, ...rest] = atob(header.slice(6)).split(":");
    if (u === user && rest.join(":") === pass) return NextResponse.next();
  }
  return new NextResponse("Login diperlukan", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Smart Greenhouse"' },
  });
}

export const config = {
  matcher: ["/((?!api/ingest|api/health|api/cron|_next/static|_next/image|favicon.ico).*)"],
};
