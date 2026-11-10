// Cek koneksi ke database (DATABASE_URL di .env.local).
// Jika host pooler Supabase salah (aws-0 vs aws-1), coba yang lain lalu simpan yang berhasil.
//   npm run db:check
import { readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";

const envPath = new URL("../.env.local", import.meta.url);
const env = readFileSync(envPath, "utf8");
const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!url) { console.error("DATABASE_URL kosong di .env.local"); process.exit(1); }

const candidates = [url];
if (/aws-[01]-/.test(url)) candidates.push(url.replace(/aws-([01])-/, (_, n) => `aws-${n === "0" ? 1 : 0}-`));

for (const u of candidates) {
  const host = new URL(u).hostname;
  const sql = postgres(u, { prepare: false, max: 1, connect_timeout: 10 });
  try {
    const [r] = await sql`select count(*)::int as nodes from devices`;
    console.log(`✓ Terhubung ke ${host} — ${r.nodes} node terdaftar`);
    if (u !== url) {
      writeFileSync(envPath, env.replace(url, u));
      console.log("  .env.local diperbarui ke host ini.");
    }
    await sql.end();
    process.exit(0);
  } catch (e) {
    console.log(`✗ ${host}: ${e.message}`);
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}
console.error("Tidak bisa terhubung. Cek internet, atau salin connection string dari Supabase → Connect → Transaction pooler.");
process.exit(1);
