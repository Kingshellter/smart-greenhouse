# Referensi API

Semua endpoint ada di `web/app/api/`. Body dan respons berformat JSON. Error berbentuk `{ "error": "pesan" }`.

Terkait: variabel environment dan cara deploy di [setup.md](setup.md#variabel-environment), simulator yang meniru protokol ini di [setup.md](setup.md#4-uji-tanpa-hardware-simulator), kode error yang sering muncul di [troubleshooting.md](troubleshooting.md#dashboard-dan-koneksi), dan penjelasan fitur dari sisi pengguna di [user-guide.md](user-guide.md).

## Autentikasi

| Jalur | Otentikasi |
|---|---|
| `/api/ingest` | Header `x-device-key` (harus cocok dengan `devices.api_key` untuk `device_id` di body) |
| `/api/cron/*` | Header `Authorization: Bearer <CRON_SECRET>` |
| `/api/health` | Tanpa login |
| Semua yang lain (dashboard dan API dashboard) | HTTP Basic auth, hanya aktif bila `DASHBOARD_USER` dan `DASHBOARD_PASSWORD` diisi |

## Ringkasan endpoint

| Method | Endpoint | Fungsi |
|---|---|---|
| POST | `/api/ingest` | Dari ESP32 (header `x-device-key`) |
| GET | `/api/health` | Cek hidup |
| GET | `/api/cron/offline` | Cek node offline → WhatsApp |
| GET / POST | `/api/devices` | Daftar node / tambah node |
| GET | `/api/devices/:id/state` | Status terkini + setting |
| PUT | `/api/devices/:id/settings` | Ubah threshold, kalibrasi, mode (parsial) |
| POST | `/api/devices/:id/commands` | `pump_dose` / `lid` |
| GET | `/api/devices/:id/readings?range=1h\|6h\|24h\|3d\|7d\|30d` | Riwayat (di-downsample) |
| GET | `/api/devices/:id/events` | Log aktuator |
| GET | `/api/devices/:id/analytics?days=7` | Statistik harian (1–90 hari) |
| POST | `/api/devices/:id/preset` | Terapkan preset tanaman `{preset_id}` ke node |
| GET / PUT | `/api/devices/:id/notify` | Setting notifikasi WhatsApp node (nomor + jenis pesan) |
| POST | `/api/devices/:id/notify/test` | Kirim pesan WA uji |
| GET / POST | `/api/presets` | Daftar preset / buat preset custom |
| PUT / DELETE | `/api/presets/:pid` | Ubah / hapus preset custom (bawaan hanya-baca) |

## `POST /api/ingest` (protokol ESP32)

Dipanggil ESP32 tiap ±3 detik.

Request:

```json
{
  "device_id": "gh-01",
  "reading": {
    "soil_raw": 2100, "soil_pct": 48.2, "temperature_c": 29.4, "humidity_pct": 71.0,
    "lid_state": "closed", "lid_angle": 90, "pump_state": "off",
    "mode": "auto", "tank_warning": false, "rssi": -58
  },
  "events": [
    { "actuator": "pump", "action": "run", "value": 3000, "trigger": "auto", "age_ms": 12000, "detail": {} }
  ]
}
```

- `reading` opsional: dikirim tiap `report_interval_s` (bawaan 10 s) dan setiap ada perubahan state.
- Nilai sensor di luar rentang disimpan sebagai `null`, bukan dipotong.
- `events` maksimal 50 per request. `actuator`: `pump | lid | mode | system`. `trigger`: `auto | web | serial | safety | boot`. `age_ms` diubah server menjadi waktu kejadian asli.

Respons:

```json
{ "settings": { "...": "seluruh baris device_settings" }, "commands": [ { "id": 1, "type": "lid", "payload": { "position": "open" } } ], "server_time": 1760000000 }
```

Perintah berstatus `pending → sent` saat diambil, dan `expired` bila lebih dari 60 detik belum terambil (mencegah aksi basi setelah WiFi pulih).

Kode: 401 untuk `device_id`/key salah, 400 untuk JSON tidak valid.

Protokol ini ada di tiga tempat yang harus sama: `web/app/api/ingest/route.ts`, `syncCloud()` di firmware, dan `tools/simulate-esp32.mjs`. Perubahan protokol harus menyentuh ketiganya.

## `POST /api/devices/:id/commands`

```json
{ "type": "pump_dose", "payload": { "ms": 3000 } }
{ "type": "lid", "payload": { "position": "open" } }
```

- `ms` 500–10000 (bawaan `dose_ms` node). `position`: `open | closed | maintenance | exit_maintenance`.
- Mode `auto`: semua ditolak dengan **409**, kecuali `maintenance` / `exit_maintenance`.
- Respons 201 berisi `id`, `type`, `payload`, `status`, `created_at`.

## `PUT /api/devices/:id/settings`

Body berisi field yang ingin diubah saja. Nama field sama dengan kolom `device_settings` dan JSON ke ESP32. Aturan lintas-field (respons **422** bila dilanggar):

- ambang tutup < ambang buka (hysteresis suhu dan RH)
- ayunan servo ≤ 90° dari posisi tertutup
- kalibrasi tanah kering dan basah berbeda ≥ 200 ADC

## `POST /api/devices`

```json
{ "id": "gh-02", "name": "Greenhouse 2" }
```

Respons 201 memuat `api_key` **sekali saja**. 409 bila id sudah ada.

## `GET /api/cron/offline`

Menandai node yang tidak mengirim data lebih dari `WA_OFFLINE_MIN` menit, lalu mengirim WhatsApp. Respons: `{ "enabled": true, "checked": n, "alerted": ["gh-01"] }`. 503 bila `CRON_SECRET` belum diisi, 401 bila secret salah.
