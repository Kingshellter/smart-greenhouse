import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Inter dimuat sendiri (bukan mengandalkan font sistem) supaya bobot tipis & angka tabular tampil sama
// di macOS, Windows, dan Android. Sumbu opsz memberi bentuk "display" untuk angka besar.
const inter = Inter({ subsets: ["latin"], axes: ["opsz"], display: "swap", variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Smart Mini-Greenhouse",
  description: "Pemantauan iklim mikro dan otomasi irigasi presisi berbasis IoT",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
