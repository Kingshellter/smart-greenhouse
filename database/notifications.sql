-- Notifikasi Telegram: log pesan, setting per node, penanda node offline.
-- Jalankan SETELAH schema.sql. Aman dijalankan ulang, juga di database yang sudah berisi data:
--   psql "$DATABASE_URL" -f database/notifications.sql
-- Supabase: tempel isi file ini di SQL Editor lalu Run.

create table if not exists notifications (
  id         bigserial primary key,
  device_id  text not null references devices(id) on delete cascade,
  ts         timestamptz not null default now(),
  kind       text not null,          -- tank_warning | safety | brownout | offline | online
  message    text not null,
  ok         boolean not null,       -- false = gagal kirim (lihat error)
  error      text
);
-- dipakai untuk cooldown: "sudah kirim kind ini ke node ini dalam X menit terakhir?"
create index if not exists notifications_device_kind_ts on notifications (device_id, kind, ts desc);
alter table notifications enable row level security;

-- Kapan peringatan "node offline" terkirim (null = tidak sedang offline).
-- Diisi oleh /api/cron/offline, dikosongkan oleh /api/ingest saat node kirim data lagi.
alter table devices add column if not exists offline_alert_at timestamptz;

-- Setting notifikasi per node: chat ID Telegram tujuan + jenis pesan yang aktif.
-- Tidak ada baris = semua aktif, chat ID dari env TELEGRAM_CHAT_ID. Tidak dikirim ke ESP32.
create table if not exists notify_settings (
  device_id     text primary key references devices(id) on delete cascade,
  tg_chat_id    text,                            -- null = pakai TELEGRAM_CHAT_ID dari env; pisah koma
  tank_warning  boolean not null default true,
  safety        boolean not null default true,
  sensor        boolean not null default true,
  brownout      boolean not null default true,
  offline       boolean not null default true,   -- termasuk pesan "online lagi"
  auto_pump     boolean not null default true,   -- tiap siram otomatis
  auto_lid      boolean not null default true,   -- tiap tutup dibuka/ditutup otomatis
  updated_at    timestamptz not null default now()
);
alter table notify_settings enable row level security;

-- Versi awal memakai WhatsApp (kolom wa_target berisi nomor WA). Nomor WA bukan chat ID Telegram,
-- jadi kolom lama dibuang dan diganti tg_chat_id (kosong = pakai TELEGRAM_CHAT_ID).
alter table notify_settings add column if not exists tg_chat_id text;
alter table notify_settings drop column if exists wa_target;

-- Role aplikasi di Supabase (kalau ada) perlu izin ke tabel baru
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'greenhouse_app') then
    grant select, insert, update, delete on notifications to greenhouse_app;
    grant usage, select on sequence notifications_id_seq to greenhouse_app;
    grant select, insert, update, delete on notify_settings to greenhouse_app;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications' and policyname = 'app_all') then
      create policy app_all on notifications for all to greenhouse_app using (true) with check (true);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notify_settings' and policyname = 'app_all') then
      create policy app_all on notify_settings for all to greenhouse_app using (true) with check (true);
    end if;
  end if;
end $$;
