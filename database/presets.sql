-- Preset tanaman: kumpulan threshold siap pakai (bawaan + custom buatan pengguna).
-- Jalankan SETELAH schema.sql. Aman dijalankan ulang, juga di database yang sudah berisi data:
--   psql "$DATABASE_URL" -f database/presets.sql
-- Supabase: tempel isi file ini di SQL Editor lalu Run.

create table if not exists plant_presets (
  id            serial primary key,
  name          text    not null unique,
  builtin       boolean not null default false,   -- bawaan: tidak bisa diubah/dihapus dari web
  soil_dry_pct  int     not null,
  temp_open_c   numeric not null,
  temp_close_c  numeric not null,
  hum_open_pct  numeric not null,
  hum_close_pct numeric not null,
  source        text,                             -- rujukan angka
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table plant_presets enable row level security;

-- Preset terakhir yang diterapkan ke node (null = belum pernah / preset dihapus)
alter table device_settings add column if not exists preset_id int references plant_presets(id) on delete set null;

-- Role aplikasi di Supabase (kalau ada) perlu izin ke tabel baru
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'greenhouse_app') then
    grant select, insert, update, delete on plant_presets to greenhouse_app;
    grant usage, select on sequence plant_presets_id_seq to greenhouse_app;
  end if;
end $$;

-- ── Preset bawaan ───────────────────────────────────────────────────────────
-- Suhu & RH: buka tutup jika ≥ batas atas rentang optimal; tutup lagi setelah turun
-- 3 °C / 10 % (hysteresis, mengikuti pola 32/29 °C pada Lambang dkk., 2026).
-- Ambang tanah: titik awal. Tanaman yang sensitif kekeringan (MAD kecil) diberi
-- ambang lebih tinggi. Persen sensor = hasil kalibrasi kering–basah, bukan kadar
-- air volumetrik, jadi tetap perlu disesuaikan dengan media tanam.
insert into plant_presets (name, builtin, soil_dry_pct, temp_open_c, temp_close_c, hum_open_pct, hum_close_pct, source, note) values
('Default sistem', true, 35, 32, 29, 90, 80,
 'Suhu: Lambang dkk. (2026), JATI 10(3) — kipas menyala ≥ 32 °C, mati ±29 °C. RH dan tanah: nilai awal desain sistem.',
 'Nilai bawaan saat node baru dibuat.'),
('Selada', true, 50, 28, 25, 80, 70,
 'Suhu siang greenhouse 17–28 °C (Jones; dikutip Horticulturae 9(12):1255, 2023). RH optimal 70–80 % (Ahmed dkk., 2020). Selada sensitif kekeringan, MAD ±30 % (Hanson dkk., California Agriculture 54(3), 2000).',
 'Di dataran rendah suhu siang sering > 28 °C, jadi tutup akan sering terbuka.'),
('Pakcoy', true, 45, 30, 27, 80, 70,
 'Suhu 15–32 °C, RH 60–80 %, optimum 28 °C / 75 % (Mickensa dkk., 2019; dikutip J. Polbangtan Manokwari).',
 'Sebagian sumber menyebut RH 80–90 %.'),
('Bayam', true, 45, 30, 27, 80, 70,
 'Suhu optimal 20–30 °C (Khanisa dkk., 2022); RH optimum 70–80 % (Amnesty dkk., 2026); dikutip skripsi UIN Sunan Gunung Djati.',
 'Akar dangkal, jangan biarkan tanah terlalu kering.'),
('Kangkung', true, 55, 30, 27, 90, 80,
 'Suhu optimal 20–30 °C (Palada & Chang, 2003); siang ±28 °C (Rukmana, 2001). Tumbuh lebih cepat pada kondisi lembap.',
 'Tanaman semi-akuatik, suka media lembap.'),
('Cabai rawit', true, 50, 31, 28, 80, 70,
 'Suhu 18–30 °C, RH 60–80 % (Balitbangtan, Teknologi Budidaya Cabai Rawit); dataran rendah 25–31 °C. Kelengasan tanah cabai 50–80 % (Kusandriani & Sumarna, 1993; dikutip Triyono dkk., Agritech 38(4), 2018).',
 null),
('Tomat', true, 40, 29, 26, 85, 75,
 'Suhu siang 24–27 °C, jaga < 29 °C; RH 70 % optimal untuk penyerbukan, ≥ 90 % serbuk sari tidak lepas (Ohio State Univ. Extension, Bulletin 672). MAD tomat 50–60 %, lebih toleran kering (Hanson dkk., 2000).',
 null)
on conflict (name) do update set
  soil_dry_pct = excluded.soil_dry_pct, temp_open_c = excluded.temp_open_c, temp_close_c = excluded.temp_close_c,
  hum_open_pct = excluded.hum_open_pct, hum_close_pct = excluded.hum_close_pct,
  source = excluded.source, note = excluded.note, updated_at = now()
where plant_presets.builtin;
