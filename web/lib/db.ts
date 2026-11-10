import postgres from "postgres";

// Satu pool per proses (hindari pool baru tiap hot-reload saat dev).
const g = globalThis as unknown as { __sql?: postgres.Sql };

export const sql =
  g.__sql ??
  postgres(process.env.DATABASE_URL!, {
    prepare: false, // wajib untuk Supabase transaction pooler (port 6543)
    max: 5,
    idle_timeout: 20,
    types: {
      // numeric → number (default postgres.js: string)
      numeric: {
        to: 1700,
        from: [1700],
        serialize: (x: number) => String(x),
        parse: (x: string) => Number(x),
      },
    },
  });

if (process.env.NODE_ENV !== "production") g.__sql = sql;

export const APP_TZ = process.env.APP_TZ || "Asia/Jakarta";
