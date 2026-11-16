# Smart Mini-Greenhouse — IoT

Prototype Smart Mini-Greenhouse Berbasis IoT untuk Pemantauan Iklim Mikro dan Otomasi Irigasi Presisi.
ESP32 + sensor tanah kapasitif + DHT22 + pompa (relay) + servo MG996R. Data dikirim ke cloud dan database milik sendiri, lalu ditampilkan di dashboard web dengan modul analitik. Proyek ini tidak memakai Blynk atau ThingSpeak.

```
ESP32 ──HTTP POST /api/ingest (tiap 3 s)──▶ Next.js API ──▶ PostgreSQL
   ▲                                         │
   └──── balasan: setting + perintah ◀───────┘
Browser ◀── dashboard + analitik (Next.js) ──▶ /api/devices/...
```

| Folder | Isi |
|---|---|
| `firmware/smart_greenhouse/` | Sketch Arduino ESP32 |
| `web/` | Backend API dan dashboard web (Next.js 16) |
| `database/schema.sql` | Skema PostgreSQL (tabel + node pertama) |
| `database/presets.sql` | Tabel preset tanaman + 7 preset bawaan beserta sumbernya (jalankan setelah `schema.sql`) |
| `tools/simulate-esp32.mjs` | Simulator ESP32, untuk tes tanpa hardware |

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
   - titik info di model 3D: ditekan memunculkan kartu berisi nilai sekarang + grafik (riwayat sensor 1 jam–7 hari dengan min/rata/maks hari ini, atau grafik harian pompa/ventilasi). Kartu *Tutup* berisi tombol Tutup/Buka dan kartu *Pompa* tombol Siram; keduanya abu-abu dan terkunci di mode Otomatis/Maintenance
   - tombol mode mengambang di bawah model: Otomatis / Manual / Maintenance
   - kartu status sistem (penjelasan di tooltip ⓘ di samping kartu) dan kartu di kiri: tanah, suhu, RH (nilai + grafik 24 jam) dan pompa (penyiraman 7 hari)
   - baris aktuator di kanan bisa dibuka (pompa, tutup, WiFi): angka analitik
   - popup tanaman: tab *Tanaman* (preset bergambar, ambang siram/suhu/RH) dan tab *Kalibrasi alat* (ADC tanah, pompa, sudut servo, interval kirim)

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
| 4 | Semua data tersimpan + modul analitik | Tabel `readings`, `actuator_events`, `commands`. Kartu hotspot model 3D (grafik riwayat, min/rata/maks harian, grafik harian pompa & ventilasi) dan baris aktuator yang dibuka: frekuensi & durasi pompa, estimasi air, ventilasi dibuka, % waktu ventilasi terbuka, safety stop |

## 1. Database

Bisa memakai Supabase (gratis) atau PostgreSQL sendiri (mis. Docker di home server).

**Supabase:**

1. Buat project baru.
2. Buka SQL Editor, tempel isi `database/schema.sql`, lalu Run. Ulangi untuk `database/presets.sql` dan `database/notifications.sql`.
3. **Ganti `api_key` node `gh-01`**:
   ```sql
   update devices set api_key = 'isi-key-acak-panjang' where id = 'gh-01';
   ```
4. Ambil connection string di Project Settings → Database → **Transaction pooler** (port 6543), lalu tambahkan `?sslmode=require` di akhir.

RLS sudah diaktifkan tanpa policy, jadi REST API publik Supabase tidak bisa membaca data. Backend kita terhubung langsung lewat Postgres.

**Lokal:**

```bash
createdb greenhouse
psql postgresql://user:pass@localhost:5432/greenhouse -f database/schema.sql -f database/presets.sql -f database/notifications.sql
```

## 2. Web (backend + dashboard)

```bash
cd web
cp .env.example .env.local     # isi DATABASE_URL (opsional: DASHBOARD_USER/PASSWORD)
npm install
npm run dev                    # http://localhost:3000
```

**Deploy ke Vercel:**

1. Import repo dan set *Root Directory* = `web`.
2. Isi environment variables `DATABASE_URL`, `DASHBOARD_USER`, `DASHBOARD_PASSWORD`.
3. Deploy. URL hasil deploy menjadi `SERVER_URL` di firmware.

**Notifikasi WhatsApp (opsional):**

1. Daftar di [fonnte.com](https://fonnte.com), tambah device, lalu scan QR dengan nomor WA pengirim (sebaiknya nomor khusus, bukan nomor pribadi).
2. Isi env `FONNTE_TOKEN` (token device). Jalankan `database/notifications.sql` jika belum.
3. Atur per node lewat tombol 🔔 di navigasi dashboard node: nomor tujuan (pisah koma) dan jenis pesan yang dikirim, plus tombol *Kirim pesan uji*. Nomor yang dikosongkan memakai env `WA_TARGET` (opsional, nomor bawaan untuk semua node). Token Fonnte (nomor pengirim) tetap satu untuk seluruh web.
4. Untuk peringatan *node offline*, isi `CRON_SECRET` (string acak) lalu buat job di [cron-job.org](https://cron-job.org) tiap 5 menit:
   `GET https://<domain>/api/cron/offline` dengan header `Authorization: Bearer <CRON_SECRET>`.
   (Node yang offline tidak mengirim apa-apa, jadi perlu pemicu dari luar; cron Vercel Hobby hanya sekali sehari.)

Semua jenis aktif secara bawaan; tiap jenis bisa dimatikan per node.

| Kejadian (sakelar di popup) | Sumber | Jeda minimum per node |
|---|---|---|
| Tangki air kosong | event `system tank_warning` | 60 menit |
| Pompa dihentikan pengaman | event `system safety` | 15 menit |
| Sensor tidak terbaca | 2 reading berturut-turut tanpa nilai | 60 menit |
| Restart karena brownout | event `system boot` | 30 menit |
| Node offline / online lagi | `/api/cron/offline` (setelah `WA_OFFLINE_MIN`, default 5 menit) / reading pertama setelahnya | sekali per kejadian |
| Siram otomatis / Ventilasi otomatis (beserta alasannya, mis. suhu ≥ batas) | event pompa / tutup dengan trigger `auto` | tiap aksi; aksi dalam satu sync digabung jadi satu pesan |

Semua pesan (berhasil atau gagal) tercatat di tabel `notifications`. Untuk uji tanpa mengirim, isi `WA_DRY_RUN=1`: pesan hanya ditulis ke log server.

**Uji tanpa hardware:**

```bash
node tools/simulate-esp32.mjs --url http://localhost:3000 --id gh-01 --key <api_key>
```

Data dari simulator adalah data buatan. Setelah selesai uji, hapus dengan:

```sql
delete from readings;
delete from actuator_events;
delete from commands;
```

## 3. Firmware ESP32

1. Install board **esp32 by Espressif** lewat Board Manager.
2. Install library berikut lewat Library Manager:
   - **DHT sensor library** (Adafruit) + **Adafruit Unified Sensor**
   - **ESP32Servo**
   - **ArduinoJson** (v7)
3. Salin `config.example.h` menjadi `config.h`, lalu isi WiFi, `SERVER_URL`, `DEVICE_ID`, dan `DEVICE_KEY`. Kosongkan `WIFI_SSID` untuk tes offline di breadboard.
4. Pilih board **ESP32 Dev Module**.
5. **Cabut adaptor 5 V sebelum upload lewat USB.**

Skema lengkap: `docs/skema_wiring_esp32_greenhouse.png`

| Pin | Komponen |
|---|---|
| GPIO 34 | Soil moisture kapasitif (ADC1) |
| GPIO 13 | DHT22 (pull-up 10 kΩ ke 3,3 V jika modul tidak punya) |
| GPIO 14 | Relay IN → pompa |
| GPIO 18 | Servo MG996R (daya dari rail 5 V, kapasitor 470–1000 µF) |

**Perintah Serial Monitor** (115200, Newline):

| Perintah | Fungsi |
|---|---|
| `status` | Semua nilai sensor & state |
| `cal` | Rata-rata ADC tanah. Catat nilainya di udara (kering) dan di air (basah), lalu isi di dashboard → kartu *Tanaman* → tab *Kalibrasi alat* |
| `pump 3000` | Pompa 3 detik (tes) · `stop` untuk mematikan |
| `lid open` / `lid close` / `lid 100` | Tes servo |

**Keselamatan yang sudah ada di firmware:**

- **Pompa saat boot:** relay diset OFF sebelum pin dijadikan output. Kalau pompa tetap menyala saat boot, ubah `RELAY_ACTIVE_LOW`.
- **Batas waktu pompa:** tiap kali menyala dibatasi timer hardware, dan maksimal mutlak 10 s walaupun loop tertahan.
- **Stop rule:** jumlah dosis otomatis per jam dibatasi. Jika batas tercapai tapi tanah masih kering, muncul peringatan *Cek tangki air*.
- **Sensor tidak valid:** jika sensor tanah di luar rentang atau DHT22 gagal 3× berturut-turut, pompa otomatis berhenti dan tidak ada dosis baru.
- **Servo:** bergerak cepat tapi bertahap (tetap 1°/5 ms, konstanta `SERVO_STEP_MS` di firmware) supaya tutup tidak terbanting, dan sudutnya dibatasi maksimal 90° dari posisi tertutup. Setelah sampai, servo sengaja **tidak** di-*detach*: sinyal PWM tetap menahan posisi, karena sebagian MG996R meluncur sendiri ke ujung saat sinyal dilepas dan tutup bisa melorot karena beratnya. Posisi terakhir disimpan di NVS, jadi setelah restart (mis. brownout) servo tidak melompat.
- **HTTP:** tidak dijalankan saat pompa atau servo sedang bergerak.

## 4. Urutan tes (sesuai handoff)

1. Rangkai breadboard sesuai tabel pin. Tes tiap komponen lewat Serial: `status`, `pump 1000`, `lid 100`.
2. Kalibrasi sensor tanah dengan `cal` (di udara dan di air), lalu isi nilainya di dashboard.
3. Ukur debit pompa: `pump 10000` ke gelas ukur, bagi 10, lalu isi *Debit pompa* (ml/s) lewat kartu *Tanaman* → tab *Kalibrasi alat*.
4. Jalankan servo dan pompa bersamaan, pastikan ESP32 tidak reset.
5. Tes end-to-end: reading → API → database → dashboard, lalu mode manual → tombol → pompa/tutup.
6. Di dalam kotak: atur sudut *Tertutup* / *Terbuka* lewat kartu *Tanaman* → tab *Kalibrasi alat* (±1°/±5°).

## API

| Method | Endpoint | Fungsi |
|---|---|---|
| POST | `/api/ingest` | Dari ESP32 (header `x-device-key`) |
| GET / PUT | `/api/devices/:id/notify` | Setting notifikasi WhatsApp node (nomor + jenis pesan) |
| POST | `/api/devices/:id/notify/test` | Kirim pesan WA uji |
| GET | `/api/cron/offline` | Cek node offline → WhatsApp (header `Authorization: Bearer <CRON_SECRET>`) |
| GET / POST | `/api/devices` | Daftar node / tambah node |
| GET | `/api/devices/:id/state` | Status terkini + setting |
| PUT | `/api/devices/:id/settings` | Ubah threshold/kalibrasi/mode |
| POST | `/api/devices/:id/commands` | `pump_dose` / `lid` (mode manual) |
| GET | `/api/devices/:id/readings?range=1h\|6h\|24h\|3d\|7d\|30d` | Riwayat (di-downsample) |
| GET | `/api/devices/:id/events` | Log aktuator |
| GET | `/api/devices/:id/analytics?days=7` | Statistik harian |
| POST | `/api/devices/:id/preset` | Terapkan preset tanaman `{preset_id}` ke node |
| GET / POST | `/api/presets` | Daftar preset / buat preset custom |
| PUT / DELETE | `/api/presets/:pid` | Ubah / hapus preset custom (bawaan hanya-baca) |
