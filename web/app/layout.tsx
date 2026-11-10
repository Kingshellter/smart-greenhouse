import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Mini-Greenhouse",
  description: "Pemantauan iklim mikro dan otomasi irigasi presisi berbasis IoT",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
