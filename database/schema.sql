-- Smart Mini-Greenhouse — skema database (PostgreSQL 14+ / Supabase)
-- Jalankan sekali: psql "$DATABASE_URL" -f database/schema.sql
-- Aman dijalankan ulang (IF NOT EXISTS / ON CONFLICT).

-- ── Node IoT ────────────────────────────────────────────────────────────────
-- Satu baris per ESP32. Menambah node = INSERT baris baru, tanpa ubah kode.
create table if not exists devices (
  id          text primary key,                 -- device_id, mis. 'gh-01'
  name        text not null,
  api_key     text not null,                    -- dikirim ESP32 di header x-device-key
  created_at  timestamptz not null default now(),
  last_seen   timestamptz
);

-- ── Setting per node (bisa diubah dari web, dikirim ke ESP32 tiap sync) ─────
create table if not exists device_settings (
  device_id           text primary key references devices(id) on delete cascade,
  mode                text    not null default 'auto' check (mode in ('auto','manual')),
  -- penyiraman
  soil_dry_pct        int     not null default 35,   -- siram jika soil_pct < nilai ini
  dose_ms             int     not null default 3000, -- lama 1 dosis pompa
  soak_s              int     not null default 60,   -- tunggu air meresap sebelum baca ulang
  max_doses_per_hour  int     not null default 6,    -- stop rule
  -- ventilasi (hysteresis)
  temp_open_c         numeric not null default 32,
  temp_close_c        numeric not null default 29,
  hum_open_pct        numeric not null default 90,
  hum_close_pct       numeric not null default 80,
  -- servo tutup (derajat servo, dikalibrasi saat tutup terpasang)
  lid_closed_deg      int     not null default 90,
  lid_open_deg        int     not null default 135,
  lid_maint_deg       int     not null default 180,  -- posisi maintenance (tutup terangkat ±90°)
  -- kalibrasi sensor tanah (nilai ADC mentah)
  soil_raw_dry        int     not null default 3000,
  soil_raw_wet        int     not null default 1300,
  -- interval kirim reading ke cloud
  report_interval_s   int     not null default 10,
  -- hasil ukur debit pompa (ml/detik) — hanya untuk analytics estimasi air
  pump_flow_ml_s      numeric not null default 0,
  updated_at          timestamptz not null default now()
);

-- ── Semua pembacaan sensor + state aktuator ────────────────────────────────
create table if not exists readings (
  id             bigserial primary key,
  device_id      text not null references devices(id) on delete cascade,
  ts             timestamptz not null default now(),
  soil_raw       int,
  soil_pct       numeric,
  temperature_c  numeric,
  humidity_pct   numeric,
  lid_state      text check (lid_state in ('open','closed','maintenance')),
  lid_angle      int,
  pump_state     text check (pump_state in ('on','off')),
  mode           text check (mode in ('auto','manual')),
  tank_warning   boolean not null default false,
  rssi           int
);
create index if not exists readings_device_ts on readings (device_id, ts desc);

-- ── Log aksi aktuator (tiap pompa jalan, tiap tutup bergerak, ganti mode) ───
create table if not exists actuator_events (
  id         bigserial primary key,
  device_id  text not null references devices(id) on delete cascade,
  ts         timestamptz not null default now(),
  actuator   text not null check (actuator in ('pump','lid','mode','system')),
  action     text not null,          -- pump: run | lid: open/close/maintenance | mode: auto/manual | system: boot/safety
  value      numeric,                -- pump: durasi ms | lid: sudut servo
  trigger    text not null default 'auto' check (trigger in ('auto','web','serial','safety','boot')),
  detail     jsonb
);
create index if not exists events_device_ts on actuator_events (device_id, ts desc);

-- ── Perintah dari web ke ESP32 (diambil saat ESP32 sync) ───────────────────
create table if not exists commands (
  id          bigserial primary key,
  device_id   text not null references devices(id) on delete cascade,
  created_at  timestamptz not null default now(),
  type        text not null check (type in ('pump_dose','lid')),
  payload     jsonb not null default '{}',
  status      text not null default 'pending' check (status in ('pending','sent','expired')),
  sent_at     timestamptz
);
create index if not exists commands_pending on commands (device_id, created_at) where status = 'pending';

-- ── Kunci akses REST publik (Supabase) ─────────────────────────────────────
-- Backend memakai koneksi Postgres langsung (owner tabel, tidak terkena RLS).
-- RLS tanpa policy = API REST Supabase dengan anon key tidak bisa baca/tulis.
alter table devices         enable row level security;
alter table device_settings enable row level security;
alter table readings        enable row level security;
alter table actuator_events enable row level security;
alter table commands        enable row level security;

-- ── Node pertama ───────────────────────────────────────────────────────────
-- GANTI api_key sebelum deploy, dan samakan dengan DEVICE_KEY di firmware/config.h
insert into devices (id, name, api_key)
values ('gh-01', 'Mini-Greenhouse 1', 'ganti-dengan-key-rahasia')
on conflict (id) do nothing;

insert into device_settings (device_id) values ('gh-01')
on conflict (device_id) do nothing;
