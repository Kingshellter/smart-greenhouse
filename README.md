# Smart Mini-Greenhouse — IoT

Prototype Smart Mini-Greenhouse Berbasis IoT untuk Pemantauan Iklim Mikro dan Otomasi Irigasi Presisi.
ESP32 + sensor tanah kapasitif + DHT22 + pompa (relay) + servo MG996R. Data dikirim ke cloud dan database milik sendiri, lalu ditampilkan di dashboard web dengan modul analitik. Proyek ini tidak memakai Blynk atau ThingSpeak.

```
ESP32 ──HTTP POST /api/ingest (tiap 3 s)──▶ Next.js API ──▶ PostgreSQL
   ▲                                         │
   └──── balasan: setting + perintah ◀───────┘
Browser ◀── dashboard + analitik (Next.js) ──▶ /api/devices/...
```

## Dokumentasi

| Dokumen | Isi |
|---|---|
| [docs/setup.md](docs/setup.md) | Salinan [Panduan Setup](#panduan-setup) di README ini: database, web, deploy Vercel, variabel environment, WhatsApp, simulator, firmware |
| [docs/hardware.md](docs/hardware.md) | Pin, wiring, perintah Serial, pengaman firmware, urutan tes, pemeliharaan |
| [docs/bom-and-power.md](docs/bom-and-power.md) | Daftar komponen dan anggaran daya |
| [docs/safety.md](docs/safety.md) | Catatan keselamatan listrik, air, bagian bergerak |
| [docs/troubleshooting.md](docs/troubleshooting.md) | Gejala, penyebab, dan tindakan |
| [docs/user-guide.md](docs/user-guide.md) | Cara memakai dashboard |
| [docs/api.md](docs/api.md) | Referensi API dan protokol ESP32 |
| [docs/panduan-wiring/index.html](docs/panduan-wiring/index.html) | Panduan wiring interaktif (buka di browser) |
| [docs/literature-review.md](docs/literature-review.md) | Studi literatur (13 paper) |
| [docs/dashboard-layout.md](docs/dashboard-layout.md) | Referensi pengembang: layout dashboard, model 3D, styling |

Mulai cepat: [Panduan Setup](#panduan-setup) di bawah → rangkai alat dengan [hardware.md](docs/hardware.md) → jalankan urutan tes.

| Folder | Isi |
|---|---|
| `firmware/smart_greenhouse/` | Sketch Arduino ESP32 |
| `web/` | Backend API dan dashboard web (Next.js 16) |
| `database/schema.sql` | Skema PostgreSQL (tabel + node pertama) |
| `database/presets.sql` | Tabel preset tanaman + 7 preset bawaan beserta sumbernya (jalankan setelah `schema.sql`) |
| `database/notifications.sql` | Setting dan log notifikasi WhatsApp |
| `tools/simulate-esp32.mjs` | Simulator ESP32, untuk tes tanpa hardware |
| `docs/` | Dokumentasi, gambar wiring, dan gambar laporan |

## Cara kerja

1. **ESP32** membaca sensor, lalu memutuskan sendiri kapan menyiram dan kapan membuka ventilasi (edge). Keputusan ini tetap berjalan walau WiFi putus.
2. Tiap 3 detik ESP32 mengirim `POST /api/ingest` ke server.
   - Reading sensor dan state aktuator dikirim tiap `report_interval_s` (default 10 s) dan setiap kali ada perubahan.
   - Setiap aksi pompa, gerakan tutup, pergantian mode, boot, dan safety stop dicatat sebagai event, lengkap dengan waktu kejadian aslinya.
3. **Server** menyimpan semua data ke PostgreSQL, lalu membalas dengan setting terbaru (threshold, kalibrasi, mode) dan perintah manual yang masih pending.
4. **Dashboard** menampilkan:
   - model 3D yang mengikuti kondisi alat
   - status live dan peringatan (tangki air, sensor tidak terbaca, node offline)
   - log aktuator
   - titik info di model 3D: ditekan memunculkan kartu berisi nilai sekarang + grafik (riwayat sensor 1 jam–30 hari dengan min/rata/maks hari ini, atau grafik harian pompa/ventilasi). Kartu *Tutup* berisi tombol Tutup/Buka dan kartu *Pompa* tombol Siram; keduanya abu-abu dan terkunci di mode Otomatis/Maintenance
   - tombol mode mengambang di bawah model: Otomatis / Manual / Maintenance
   - kartu status sistem (penjelasan di tooltip ⓘ di samping kartu) dan kartu di kiri: tanah, suhu, RH (nilai + grafik 24 jam)
   - bar perangkat di bawah (sensor tanah, DHT22, pompa, servo tutup, tangki, WiFi): tiap perangkat bisa dibuka untuk melihat nilai, analitik, dan kalibrasinya
   - popup tanaman: preset bergambar dengan ambang siram/suhu/RH
5. **WhatsApp** (opsional, lewat Fonnte): server mengabarkan kejadian yang perlu tindakan, yaitu tangki air kemungkinan kosong, pompa dihentikan pengaman, sensor tidak terbaca, ESP32 restart karena brownout, dan node offline / online lagi. Server hanya mengabarkan; keputusan tetap di ESP32.

> Alur utama prototipe adalah **satu arah**: sensor → ESP32 → cloud → web. Kontrol dari web (mode manual) hanya fitur tambahan. Kalau tidak dipakai saat demo, biarkan mode tetap *otomatis*.

### Kesesuaian dengan proses bisnis (slide 15)

| Langkah di diagram | Implementasi |
|---|---|
| Ukur kondisi (sensor) | `readSoil()`, `readDht()`, dihaluskan dengan EMA |
| Putuskan aksi otomatis (ESP32) | `autoControl()`: siram per dosis + waktu meresap; ventilasi dengan hysteresis 32/29 °C |
| Kirim data → simpan → tampilkan | `/api/ingest` → tabel `readings` & `actuator_events` → dashboard |
| Pengguna: "Perlu bertindak?" | Banner status: normal / cek tangki air / sensor tidak terbaca / node offline, plus pesan WhatsApp untuk kejadian yang sama |
| Pilih mode manual → kirim perintah → ESP32 jalankan | Bar kontrol (Otomatis/Manual/Maintenance) + tombol siram/buka/tutup → tabel `commands` → ESP32 mengambilnya saat sync |
| Status terbaru tampil | Reading baru dikirim segera setelah ada perubahan state |

### Kebutuhan dosen

| # | Kebutuhan | Implementasi |
|---|---|---|
| 2 | Bisa dikembangkan ke banyak node | Setiap data membawa `device_id`. Node baru ditambah lewat halaman awal → *Tambah node* (key dibuat otomatis); firmware cukup diganti `DEVICE_ID`/`DEVICE_KEY`, tanpa ubah kode |
| 3 | Cloud & web milik sendiri | API Next.js + PostgreSQL buatan tim |
| 4 | Semua data tersimpan + modul analitik | Tabel `readings`, `actuator_events`, `commands`. Kartu hotspot model 3D (grafik riwayat, min/rata/maks harian, grafik harian pompa & ventilasi) dan popup perangkat di bar bawah: frekuensi & durasi pompa, estimasi air, ventilasi dibuka, % waktu ventilasi terbuka, safety stop |

## Panduan Setup

> Bagian ini sama dengan [docs/setup.md](docs/setup.md). Kalau mengubah salah satunya, ubah juga yang lain.

Urutan pemasangan: database → web → (opsional) WhatsApp → firmware. Untuk wiring lihat [docs/hardware.md](docs/hardware.md), untuk daftar komponen [docs/bom-and-power.md](docs/bom-and-power.md), dan baca [docs/safety.md](docs/safety.md) sebelum merangkai. Referensi endpoint ada di [docs/api.md](docs/api.md). Kalau ada yang tidak jalan, lihat [docs/troubleshooting.md](docs/troubleshooting.md).

### Prasyarat

| Kebutuhan | Keterangan |
|---|---|
| Node.js | Versi yang didukung Next.js 16 (LTS terbaru) |
| PostgreSQL 14+ | Supabase (gratis) atau Postgres sendiri |
| `psql` | Dipakai `npm run db:init` dan perintah manual di bawah |
| Arduino IDE | Untuk upload firmware (tidak ada build lewat CLI di repo ini) |
| Akun Vercel | Opsional, untuk deploy web |
| Akun Fonnte + nomor WA khusus | Opsional, untuk notifikasi WhatsApp |

### 1. Database

Bisa memakai Supabase atau PostgreSQL sendiri (mis. Docker di home server).

#### Supabase

1. Buat project baru.
2. Buka SQL Editor, tempel isi `database/schema.sql`, lalu Run. Ulangi untuk `database/presets.sql` dan `database/notifications.sql`.
3. **Ganti `api_key` node `gh-01`** sebelum apa pun dipasang. Nilai bawaannya (`ganti-dengan-key-rahasia`) diketahui semua orang yang membaca repo ini (lihat juga [docs/safety.md](docs/safety.md#data-dan-akun)).
   ```sql
   update devices set api_key = 'isi-key-acak-panjang' where id = 'gh-01';
   ```
   Contoh membuat key acak: `openssl rand -base64 24`.
4. Ambil connection string di Project Settings → Database → **Transaction pooler** (port 6543), lalu tambahkan `?sslmode=require` di akhir.

RLS sudah diaktifkan tanpa policy, jadi REST API publik Supabase tidak bisa membaca data. Backend terhubung langsung lewat Postgres.

#### Lokal

```bash
createdb greenhouse
psql postgresql://user:pass@localhost:5432/greenhouse -f database/schema.sql -f database/presets.sql -f database/notifications.sql
```

Semua file SQL aman dijalankan ulang (`if not exists` / `on conflict`), jadi boleh dijalankan lagi setelah pull perubahan baru.

### 2. Web (backend + dashboard)

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

#### Variabel environment

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

#### Deploy ke Vercel

1. Import repo dan set *Root Directory* = `web`.
2. Isi environment variables di atas (minimal `DATABASE_URL`, `DASHBOARD_USER`, `DASHBOARD_PASSWORD`).
3. Deploy. URL hasil deploy menjadi `SERVER_URL` di firmware.

`web/scripts/vercel-setup.sh` mendorong variabel dari `.env.local` ke Vercel lalu deploy ke production. Region fungsi diatur ke `sin1` (Singapura) di `web/vercel.json`.

Nama file di Vercel (Linux) peka huruf besar/kecil. Import `./Charts` tidak sama dengan `./charts`.

#### Tambah node baru

Dari halaman awal dashboard: **Tambah node**, isi id (huruf kecil, angka, `-`, 2–32 karakter) dan nama. API key dibuat otomatis dan **hanya ditampilkan sekali**, jadi salin langsung ke `DEVICE_KEY` di firmware node tersebut. Firmware untuk semua node sama; hanya `DEVICE_ID` dan `DEVICE_KEY` yang berbeda.

### 3. Notifikasi WhatsApp (opsional, Fonnte)

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

Pengaturan dari sisi pengguna: [docs/user-guide.md](docs/user-guide.md#notifikasi-whatsapp). Kalau pesan tidak terkirim: [docs/troubleshooting.md](docs/troubleshooting.md#whatsapp).

Semua pesan (berhasil atau gagal) tercatat di tabel `notifications`. Untuk uji tanpa mengirim, isi `WA_DRY_RUN=1`: pesan hanya ditulis ke log server.

Fonnte adalah gerbang WhatsApp tidak resmi. Nomor pengirim bisa diblokir WhatsApp, jadi jangan gunakan nomor pribadi dan siapkan jalur cadangan (mis. telepon atau pesan langsung ke penanggung jawab).

### 4. Uji tanpa hardware (simulator)

```bash
node tools/simulate-esp32.mjs --url http://localhost:3000 --id gh-01 --key <api_key>
```

Simulator meniru protokol sync ESP32 (reading, event, perintah, aturan mode; lihat [docs/api.md](docs/api.md#post-apiingest-protokol-esp32)). Datanya buatan. Setelah selesai uji, hapus supaya grafik dan analitik tidak tercampur:

```sql
delete from readings;
delete from actuator_events;
delete from commands;
```

### 5. Firmware ESP32

1. Install board **esp32 by Espressif** lewat Board Manager.
2. Install library lewat Library Manager:
   - **DHT sensor library** (Adafruit) + **Adafruit Unified Sensor**
   - **ESP32Servo**
   - **ArduinoJson** (v7)
3. Salin `firmware/smart_greenhouse/config.example.h` menjadi `config.h`, lalu isi WiFi, `SERVER_URL`, `DEVICE_ID`, dan `DEVICE_KEY`. `DEVICE_KEY` harus sama dengan `api_key` di tabel `devices`. Kosongkan `WIFI_SSID` untuk tes offline di breadboard.
4. Pilih board **ESP32 Dev Module**.
5. Lepas daya 5 V dari adaptor sebelum upload lewat USB (lihat [docs/safety.md](docs/safety.md)).
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

### Selanjutnya

Rangkai alat dan jalankan urutan tes di [docs/hardware.md](docs/hardware.md#urutan-tes), lalu lihat cara memakai dashboard di [docs/user-guide.md](docs/user-guide.md). Kalau koneksi, upload, atau database bermasalah: [docs/troubleshooting.md](docs/troubleshooting.md).

## Keselamatan

Pompa dibatasi 10 detik per nyala, dosis per jam dibatasi, dan penyiraman berhenti bila sensor tidak valid; semuanya di firmware, jadi tetap berlaku saat offline. Rangkaian bertegangan rendah (5 V), tetapi air, adaptor, dan servo tetap perlu hati-hati. Baca [docs/safety.md](docs/safety.md) sebelum merangkai, dan **ganti `api_key` bawaan serta isi `DASHBOARD_USER`/`DASHBOARD_PASSWORD`** sebelum alat tersambung ke internet.
