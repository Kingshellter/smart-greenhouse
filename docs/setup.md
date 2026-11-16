# Panduan Setup

> Isi file ini sama dengan bagian *Panduan Setup* di [README.md](../README.md#panduan-setup). Kalau mengubah salah satunya, ubah juga yang lain.

Urutan pemasangan: database → web → (opsional) Telegram dan MQTT → firmware. Untuk wiring lihat [hardware.md](hardware.md), untuk daftar komponen [bom-and-power.md](bom-and-power.md), dan baca [safety.md](safety.md) sebelum merangkai. Referensi endpoint ada di [api.md](api.md). Kalau ada yang tidak jalan, lihat [troubleshooting.md](troubleshooting.md).

## Prasyarat

| Kebutuhan | Keterangan |
|---|---|
| Node.js | Versi yang didukung Next.js 16 (LTS terbaru) |
| PostgreSQL 14+ | Supabase (gratis) atau Postgres sendiri |
| `psql` | Dipakai `npm run db:init` dan perintah manual di bawah |
| Arduino IDE | Untuk upload firmware (tidak ada build lewat CLI di repo ini) |
| Akun Vercel | Opsional, untuk deploy web |
| Bot Telegram | Opsional, untuk notifikasi (dibuat gratis lewat @BotFather) |
| Broker MQTT | Opsional, untuk dashboard real-time (EMQX Cloud Serverless, gratis) |

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
| `TELEGRAM_BOT_TOKEN` | Untuk Telegram | Token bot dari @BotFather (pengirim) |
| `TELEGRAM_CHAT_ID` | Tidak | Chat ID tujuan bawaan, pisah koma |
| `CRON_SECRET` | Untuk peringatan offline | String acak, mis. `openssl rand -hex 16` |
| `NOTIFY_OFFLINE_MIN` | Tidak | Menit tanpa data sebelum dikabarkan offline (bawaan 5) |
| `APP_URL` | Tidak | Tautan dashboard di pesan Telegram (di Vercel otomatis dari domain production) |
| `NOTIFY_DRY_RUN` | Tidak | `1` = pesan hanya ditulis ke log server, tidak dikirim |
| `MQTT_URL` | Untuk MQTT | `mqtts://<host>:8883`, dipakai server untuk publish perintah dan setting |
| `MQTT_SERVER_USER`, `MQTT_SERVER_PASS` | Untuk MQTT | Akun broker untuk server |
| `MQTT_WS_URL` | Untuk MQTT | `wss://<host>:8084/mqtt`, dipakai browser untuk subscribe state |
| `MQTT_VIEW_USER`, `MQTT_VIEW_PASS` | Untuk MQTT | Akun broker untuk dashboard; cukup izin subscribe, karena terlihat di browser |
| `MQTT_TOPIC_PREFIX` | Tidak | Awal topik (bawaan `greenhouse`), harus sama dengan firmware |

Jangan commit `.env.local` atau `config.h`. Untuk mengganti rahasia (password DB, token bot, `CRON_SECRET`, password MQTT, key node), ubah di sumbernya lalu perbarui env di Vercel dan `config.h` di firmware.

### Deploy ke Vercel

1. Import repo dan set *Root Directory* = `web`.
2. Isi environment variables di atas (minimal `DATABASE_URL`, `DASHBOARD_USER`, `DASHBOARD_PASSWORD`).
3. Deploy. URL hasil deploy menjadi `SERVER_URL` di firmware.

`web/scripts/vercel-setup.sh` mendorong variabel dari `.env.local` ke Vercel lalu deploy ke production. Region fungsi diatur ke `sin1` (Singapura) di `web/vercel.json`.

Deploy otomatis dari GitHub diblokir Vercel kalau pembuat commit bukan anggota tim project. Deploy manual dari **root repo** dengan akun yang punya akses: `npx vercel --prod`. `.vercelignore` di root memastikan hanya folder `web/` yang diunggah, tanpa `.env.local` maupun `config.h`.

Nama file di Vercel (Linux) peka huruf besar/kecil. Import `./Charts` tidak sama dengan `./charts`.

### Tambah node baru

Dari halaman awal dashboard: **Tambah node**, isi id (huruf kecil, angka, `-`, 2–32 karakter) dan nama. API key dibuat otomatis dan **hanya ditampilkan sekali**, jadi salin langsung ke `DEVICE_KEY` di firmware node tersebut. Firmware untuk semua node sama; hanya `DEVICE_ID` dan `DEVICE_KEY` yang berbeda.

## 3. Notifikasi Telegram (opsional)

1. Buat bot lewat [@BotFather](https://t.me/BotFather) (`/newbot`), lalu salin tokennya.
2. Isi env `TELEGRAM_BOT_TOKEN` (di `.env.local` dan Vercel; jangan di-commit). Jalankan `database/notifications.sql` jika belum.
3. Kirim `/start` ke bot dari akun Telegram penerima (atau tambahkan bot ke grup dan kirim satu pesan di sana).
4. Atur per node lewat tombol 🔔 di navigasi dashboard node: tekan *Cari chat ID* untuk memilih chat yang baru mengirim pesan ke bot, pilih jenis pesan yang dikirim, lalu *Kirim pesan uji*. Chat ID yang dikosongkan memakai env `TELEGRAM_CHAT_ID` (opsional, tujuan bawaan untuk semua node, pisah koma). Token bot tetap satu untuk seluruh web.
5. Untuk peringatan *node offline*, isi `CRON_SECRET` (string acak) lalu buat job di [cron-job.org](https://cron-job.org) tiap 5 menit:
   `GET https://<domain>/api/cron/offline` dengan header `Authorization: Bearer <CRON_SECRET>`.
   Node yang offline tidak mengirim apa-apa, jadi perlu pemicu dari luar; cron Vercel Hobby hanya sekali sehari.

Semua jenis aktif secara bawaan; tiap jenis bisa dimatikan per node.

| Kejadian (sakelar di popup) | Sumber | Jeda minimum per node |
|---|---|---|
| Tangki air kosong | event `system tank_warning` | 60 menit |
| Pompa dihentikan pengaman | event `system safety` | 15 menit |
| Sensor tidak terbaca | 2 reading berturut-turut tanpa nilai | 60 menit |
| Restart karena brownout | event `system boot` | 30 menit |
| Node offline / online lagi | `/api/cron/offline` (setelah `NOTIFY_OFFLINE_MIN`, bawaan 5 menit) / reading pertama setelahnya | sekali per kejadian |
| Siram otomatis / Ventilasi otomatis (beserta alasannya, mis. suhu ≥ batas) | event pompa / tutup dengan trigger `auto` | tiap aksi; aksi dalam satu sync digabung jadi satu pesan |

Pengaturan dari sisi pengguna: [user-guide.md](user-guide.md#notifikasi-telegram). Kalau pesan tidak terkirim: [troubleshooting.md](troubleshooting.md#telegram).

Semua pesan (berhasil atau gagal) tercatat di tabel `notifications`. Untuk uji tanpa mengirim, isi `NOTIFY_DRY_RUN=1`: pesan hanya ditulis ke log server.

## 4. MQTT (opsional, dashboard real-time)

HTTP tetap jalan seperti biasa (penyimpanan data, analitik, notifikasi). MQTT menambahkan jalur langsung; topik dan isi pesannya ada di [api.md](api.md#mqtt). Broker yang disarankan: **EMQX Cloud Serverless** (gratis permanen: 1 juta session minutes + 1 GB trafik per bulan, TLS + WebSocket). HiveMQ Cloud sekarang hanya uji coba 15 hari lalu berbayar. Broker lain juga bisa selama mendukung MQTT over TLS dan WebSocket (wss).

1. Daftar di [EMQX Cloud](https://cloud.emqx.com) → *EMQX Broker* → *New* → **Serverless**. Biarkan *Spend Limit* = 0, supaya broker hanya berhenti saat kuota gratis habis, tanpa tagihan. Catat *Address* (host) dari halaman *Overview*: port TLS **8883**, WebSocket TLS **8084**.
2. Di *Access Control → Authentication*, buat 3 akun dengan password acak yang panjang:
   - **device** → `MQTT_USER`/`MQTT_PASS` di `config.h` firmware
   - **server** → `MQTT_SERVER_USER`/`MQTT_SERVER_PASS`
   - **dashboard** → `MQTT_VIEW_USER`/`MQTT_VIEW_PASS`
3. Di *Access Control → Authorization*, batasi akun dashboard: *Allow · Subscribe* `greenhouse/#` dan *Deny · Publish* `#`. Kredensial dashboard terlihat di browser, jadi tanpa aturan ini siapa pun yang membuka dashboard bisa mengirim perintah langsung ke ESP32.
4. Isi env web (di `.env.local` dan Vercel): `MQTT_URL=mqtts://<host>:8883`, `MQTT_WS_URL=wss://<host>:8084/mqtt`, plus akun di atas.
5. Isi `MQTT_HOST` (+ akun device) di `config.h`, lalu upload ulang firmware.

Kalau semua tersambung, penanda di navigasi dashboard berubah jadi **Live · MQTT**. Tanpa env MQTT, dashboard kembali ke polling tiap 3 detik. Kirim state sudah dibuat hemat supaya muat di kuota gratis: perubahan aktuator seketika, perubahan sensor paling cepat tiap 2 detik, heartbeat tiap 10 detik.

## 5. Uji tanpa hardware (simulator)

```bash
node tools/simulate-esp32.mjs --url http://localhost:3000 --id gh-01 --key <api_key>
# dengan MQTT:
node tools/simulate-esp32.mjs --url http://localhost:3000 --id gh-01 --key <api_key> \
  --mqtt-url mqtts://<host>:8883 --mqtt-user <akun device> --mqtt-pass <password>
```

Simulator meniru protokol sync ESP32 (reading, event, perintah, aturan mode, dan MQTT; lihat [api.md](api.md#post-apiingest-protokol-esp32)). Datanya buatan. Setelah selesai uji, hapus supaya grafik dan analitik tidak tercampur:

```sql
delete from readings;
delete from actuator_events;
delete from commands;
```

## 6. Firmware ESP32

1. Install board **esp32 by Espressif** lewat Board Manager.
2. Install library lewat Library Manager:
   - **DHT sensor library** (Adafruit) + **Adafruit Unified Sensor**
   - **ESP32Servo**
   - **ArduinoJson** (v7)
   - **PubSubClient** (Nick O'Leary), untuk MQTT
3. Salin `firmware/smart_greenhouse/config.example.h` menjadi `config.h`, lalu isi WiFi, `SERVER_URL`, `DEVICE_ID`, dan `DEVICE_KEY`. `DEVICE_KEY` harus sama dengan `api_key` di tabel `devices`. Kosongkan `WIFI_SSID` untuk tes offline di breadboard. Untuk MQTT, isi juga `MQTT_HOST`, `MQTT_USER`, `MQTT_PASS` (kosongkan `MQTT_HOST` = MQTT nonaktif).
4. Pilih board **ESP32 Dev Module**.
5. Lepas daya 5 V dari adaptor sebelum upload lewat USB (lihat [safety.md](safety.md)).
6. Buka Serial Monitor (115200, Newline) dan cek baris boot: alasan reset terakhir dan status WiFi. Perintah `status` juga menampilkan status MQTT.

WiFi harus 2,4 GHz (ESP32 tidak mendukung 5 GHz). `SERVER_URL` ditulis tanpa garis miring di akhir.

Catat versi board package dan library yang dipakai saat firmware terakhir terbukti jalan, supaya orang lain bisa mereproduksi build. Tambahkan di tabel ini:

| Komponen | Versi yang diuji |
|---|---|
| esp32 by Espressif | _isi_ |
| DHT sensor library | _isi_ |
| Adafruit Unified Sensor | _isi_ |
| ESP32Servo | _isi_ |
| ArduinoJson | 7.4.3 |
| PubSubClient | _isi_ |

## Selanjutnya

Rangkai alat dan jalankan urutan tes di [hardware.md](hardware.md#urutan-tes), lalu lihat cara memakai dashboard di [user-guide.md](user-guide.md). Kalau koneksi, upload, atau database bermasalah: [troubleshooting.md](troubleshooting.md).
