# Panduan Setup

> Isi file ini sama dengan bagian *Panduan Setup* di [README.md](../README.md#panduan-setup). Kalau mengubah salah satunya, ubah juga yang lain.

Urutan pemasangan: database → web → (opsional) WhatsApp → firmware. Untuk wiring lihat [hardware.md](hardware.md), untuk daftar komponen [bom-and-power.md](bom-and-power.md), dan baca [safety.md](safety.md) sebelum merangkai. Referensi endpoint ada di [api.md](api.md). Kalau ada yang tidak jalan, lihat [troubleshooting.md](troubleshooting.md).

## Prasyarat

| Kebutuhan | Keterangan |
|---|---|
| Node.js | Versi yang didukung Next.js 16 (LTS terbaru) |
| PostgreSQL 14+ | Supabase (gratis) atau Postgres sendiri |
| `psql` | Dipakai `npm run db:init` dan perintah manual di bawah |
| Arduino IDE | Untuk upload firmware (tidak ada build lewat CLI di repo ini) |
| Akun Vercel | Opsional, untuk deploy web |
| Akun Fonnte + nomor WA khusus | Opsional, untuk notifikasi WhatsApp |

## 1. Database

Bisa memakai Supabase atau PostgreSQL sendiri (mis. Docker di home server).

### Supabase

1. Buat project baru.
2. Buka SQL Editor, tempel isi `database/schema.sql`, lalu Run. Ulangi untuk `database/presets.sql` dan `database/notifications.sql`.
3. **Ganti `api_key` node `gh-01`** sebelum apa pun dipasang. Nilai bawaannya (`ganti-dengan-key-rahasia`) diketahui semua orang yang membaca repo ini (lihat juga [safety.md](safety.md#data-dan-akun)).
   ```sql
   update devices set api_key = 'isi-key-acak-panjang' where id = 'gh-01';
   ```
   Contoh membuat key acak: `openssl rand -base64 24`.
4. Ambil connection string di Project Settings → Database → **Transaction pooler** (port 6543), lalu tambahkan `?sslmode=require` di akhir.

RLS sudah diaktifkan tanpa policy, jadi REST API publik Supabase tidak bisa membaca data. Backend terhubung langsung lewat Postgres.

### Lokal

```bash
createdb greenhouse
psql postgresql://user:pass@localhost:5432/greenhouse -f database/schema.sql -f database/presets.sql -f database/notifications.sql
```

Semua file SQL aman dijalankan ulang (`if not exists` / `on conflict`), jadi boleh dijalankan lagi setelah pull perubahan baru.

## 2. Web (backend + dashboard)

```bash
cd web
cp .env.example .env.local     # isi DATABASE_URL (lihat tabel variabel di bawah)
npm install
npm run dev                    # http://localhost:3000
```

Perintah lain (dari folder `web/`):

| Perintah | Fungsi |
|---|---|
| `npm run build` / `npm start` | Build dan jalankan produksi |
| `npx tsc --noEmit` | Cek tipe (satu-satunya pemeriksaan statis) |
| `npm run db:init` | Terapkan ketiga file SQL ke `$DATABASE_URL` (jalankan dari Git Bash atau shell yang mengenal `$DATABASE_URL`) |
| `npm run db:check` | Tes koneksi database; otomatis memperbaiki host pooler Supabase `aws-0`/`aws-1` |
| `npm run simulate -- --url ... --id ... --key ...` | Simulator ESP32 |

### Variabel environment

| Variabel | Wajib | Fungsi |
|---|---|---|
| `DATABASE_URL` | Ya | Connection string Postgres |
| `DASHBOARD_USER`, `DASHBOARD_PASSWORD` | Sangat disarankan | Basic auth untuk dashboard dan API dashboard. **Kalau kosong, siapa pun yang tahu URL bisa melihat dan mengontrol node.** `/api/ingest`, `/api/health` dan `/api/cron` dikecualikan dari login |
| `APP_TZ` | Tidak | Zona waktu analitik harian (bawaan `Asia/Jakarta`) |
| `FONNTE_TOKEN` | Untuk WA | Token device Fonnte (nomor pengirim) |
| `WA_TARGET` | Tidak | Nomor tujuan bawaan, pisah koma |
| `CRON_SECRET` | Untuk peringatan offline | String acak, mis. `openssl rand -hex 16` |
| `WA_OFFLINE_MIN` | Tidak | Menit tanpa data sebelum dikabarkan offline (bawaan 5) |
| `APP_URL` | Tidak | Tautan dashboard di pesan WA (di Vercel otomatis dari domain production) |
| `WA_DRY_RUN` | Tidak | `1` = pesan hanya ditulis ke log server, tidak dikirim |

Jangan commit `.env.local` atau `config.h`. Untuk mengganti rahasia (password DB, token Fonnte, `CRON_SECRET`, key node), ubah di sumbernya lalu perbarui env di Vercel dan `config.h` di firmware.

### Deploy ke Vercel

1. Import repo dan set *Root Directory* = `web`.
2. Isi environment variables di atas (minimal `DATABASE_URL`, `DASHBOARD_USER`, `DASHBOARD_PASSWORD`).
3. Deploy. URL hasil deploy menjadi `SERVER_URL` di firmware.

`web/scripts/vercel-setup.sh` mendorong variabel dari `.env.local` ke Vercel lalu deploy ke production. Region fungsi diatur ke `sin1` (Singapura) di `web/vercel.json`.

Nama file di Vercel (Linux) peka huruf besar/kecil. Import `./Charts` tidak sama dengan `./charts`.

### Tambah node baru

Dari halaman awal dashboard: **Tambah node**, isi id (huruf kecil, angka, `-`, 2–32 karakter) dan nama. API key dibuat otomatis dan **hanya ditampilkan sekali**, jadi salin langsung ke `DEVICE_KEY` di firmware node tersebut. Firmware untuk semua node sama; hanya `DEVICE_ID` dan `DEVICE_KEY` yang berbeda.

## 3. Notifikasi WhatsApp (opsional, Fonnte)

1. Daftar di [fonnte.com](https://fonnte.com), tambah device, lalu scan QR dengan nomor WA pengirim (sebaiknya nomor khusus, bukan nomor pribadi).
2. Isi env `FONNTE_TOKEN` (token device). Jalankan `database/notifications.sql` jika belum.
3. Atur per node lewat tombol 🔔 di navigasi dashboard node: nomor tujuan (pisah koma) dan jenis pesan yang dikirim, plus tombol *Kirim pesan uji*. Nomor yang dikosongkan memakai env `WA_TARGET` (opsional, nomor bawaan untuk semua node). Token Fonnte (nomor pengirim) tetap satu untuk seluruh web.
4. Untuk peringatan *node offline*, isi `CRON_SECRET` (string acak) lalu buat job di [cron-job.org](https://cron-job.org) tiap 5 menit:
   `GET https://<domain>/api/cron/offline` dengan header `Authorization: Bearer <CRON_SECRET>`.
   Node yang offline tidak mengirim apa-apa, jadi perlu pemicu dari luar; cron Vercel Hobby hanya sekali sehari.

Semua jenis aktif secara bawaan; tiap jenis bisa dimatikan per node.

| Kejadian (sakelar di popup) | Sumber | Jeda minimum per node |
|---|---|---|
| Tangki air kosong | event `system tank_warning` | 60 menit |
| Pompa dihentikan pengaman | event `system safety` | 15 menit |
| Sensor tidak terbaca | 2 reading berturut-turut tanpa nilai | 60 menit |
| Restart karena brownout | event `system boot` | 30 menit |
| Node offline / online lagi | `/api/cron/offline` (setelah `WA_OFFLINE_MIN`, bawaan 5 menit) / reading pertama setelahnya | sekali per kejadian |
| Siram otomatis / Ventilasi otomatis (beserta alasannya, mis. suhu ≥ batas) | event pompa / tutup dengan trigger `auto` | tiap aksi; aksi dalam satu sync digabung jadi satu pesan |

Pengaturan dari sisi pengguna: [user-guide.md](user-guide.md#notifikasi-whatsapp). Kalau pesan tidak terkirim: [troubleshooting.md](troubleshooting.md#whatsapp).

Semua pesan (berhasil atau gagal) tercatat di tabel `notifications`. Untuk uji tanpa mengirim, isi `WA_DRY_RUN=1`: pesan hanya ditulis ke log server.

Fonnte adalah gerbang WhatsApp tidak resmi. Nomor pengirim bisa diblokir WhatsApp, jadi jangan gunakan nomor pribadi dan siapkan jalur cadangan (mis. telepon atau pesan langsung ke penanggung jawab).

## 4. Uji tanpa hardware (simulator)

```bash
node tools/simulate-esp32.mjs --url http://localhost:3000 --id gh-01 --key <api_key>
```

Simulator meniru protokol sync ESP32 (reading, event, perintah, aturan mode; lihat [api.md](api.md#post-apiingest-protokol-esp32)). Datanya buatan. Setelah selesai uji, hapus supaya grafik dan analitik tidak tercampur:

```sql
delete from readings;
delete from actuator_events;
delete from commands;
```

## 5. Firmware ESP32

1. Install board **esp32 by Espressif** lewat Board Manager.
2. Install library lewat Library Manager:
   - **DHT sensor library** (Adafruit) + **Adafruit Unified Sensor**
   - **ESP32Servo**
   - **ArduinoJson** (v7)
3. Salin `firmware/smart_greenhouse/config.example.h` menjadi `config.h`, lalu isi WiFi, `SERVER_URL`, `DEVICE_ID`, dan `DEVICE_KEY`. `DEVICE_KEY` harus sama dengan `api_key` di tabel `devices`. Kosongkan `WIFI_SSID` untuk tes offline di breadboard.
4. Pilih board **ESP32 Dev Module**.
5. Lepas daya 5 V dari adaptor sebelum upload lewat USB (lihat [safety.md](safety.md)).
6. Buka Serial Monitor (115200, Newline) dan cek baris boot: alasan reset terakhir dan status WiFi.

WiFi harus 2,4 GHz (ESP32 tidak mendukung 5 GHz). `SERVER_URL` ditulis tanpa garis miring di akhir.

Catat versi board package dan library yang dipakai saat firmware terakhir terbukti jalan, supaya orang lain bisa mereproduksi build. Tambahkan di tabel ini:

| Komponen | Versi yang diuji |
|---|---|
| esp32 by Espressif | _isi_ |
| DHT sensor library | _isi_ |
| Adafruit Unified Sensor | _isi_ |
| ESP32Servo | _isi_ |
| ArduinoJson | _isi (harus v7)_ |

## Selanjutnya

Rangkai alat dan jalankan urutan tes di [hardware.md](hardware.md#urutan-tes), lalu lihat cara memakai dashboard di [user-guide.md](user-guide.md). Kalau koneksi, upload, atau database bermasalah: [troubleshooting.md](troubleshooting.md).
