# Troubleshooting

Terkait: [setup.md](setup.md) (instalasi dan env), [hardware.md](hardware.md) (wiring dan tes), [bom-and-power.md](bom-and-power.md#anggaran-daya) (kebutuhan daya), [safety.md](safety.md), [api.md](api.md) (kode respons), dan [user-guide.md](user-guide.md#kalibrasi-alat) (menu kalibrasi).

Cari gejalanya, lalu ikuti pemeriksaan dari atas ke bawah. Info dasar selalu tersedia lewat Serial Monitor (115200, Newline): perintah `status` menampilkan sensor, state, `SERVER_URL`, dan kode HTTP terakhir. Baris boot menampilkan alasan reset terakhir.

## Hardware

| Gejala | Kemungkinan penyebab | Tindakan |
|---|---|---|
| Pompa menyala saat boot / terbalik | Logika relay terbalik | Ubah `RELAY_ACTIVE_LOW` di `config.h` (`true`/`false`) |
| Pompa langsung menyala saat daya dicolok, relay tidak aktif | Kabel merah pompa ada di terminal NC | Cabut daya, pindahkan ke terminal NO |
| ESP32 restart saat servo atau pompa bergerak (boot log: `BROWNOUT`) | Daya kurang atau lonjakan arus | Cek kapasitor 470–1000 µF dekat servo; kabel merah servo ke titik 5 V (bukan ke ESP32); sumber ≥ 2 A; jangan memakai USB laptop untuk beban |
| Servo bergetar atau melorot sendiri | Sinyal PWM dilepas, daya lemah, atau horn longgar | Jangan men-*detach* servo (sengaja tidak dilakukan di firmware); cek daya dan kencangkan horn |
| Tutup tidak mencapai posisi yang benar | Sudut belum dikalibrasi | Atur sudut Tertutup/Terbuka/Maintenance di bar perangkat → *Servo tutup* → kalibrasi (±1°/±5°) |
| Nilai tanah tidak masuk akal / sensor tanah tidak terbaca | Kabel sensor lepas, sensor resistif, atau belum dikalibrasi | Cek kabel ke GPIO 34; jalankan `cal` di udara dan di air, isi dashboard. Nilai ADC di luar 100–4000 dianggap sensor lepas/korslet |
| Suhu/RH kosong, DHT22 gagal | Kabel, pull-up, atau pembacaan terlalu cepat | Pasang pull-up 10 kΩ ke 3,3 V bila modul tidak punya; DHT22 hanya dibaca ≥ 2 detik sekali |
| Upload gagal dari Arduino IDE | Adaptor 5 V masih tersambung ke VIN, port salah, atau board belum masuk mode flash | Lepas adaptor, pilih port dan board *ESP32 Dev Module* yang benar, tahan tombol BOOT saat "Connecting…" |
| Setting kalibrasi kembali ke bawaan setelah upload firmware baru | Struktur `Settings` di firmware berubah, jadi data NVS lama dibuang | Isi ulang kalibrasi dari dashboard; ini perilaku yang diketahui |

## Penyiraman dan ventilasi tidak jalan

Cek berurutan:

1. **Mode** harus *Otomatis* untuk kontrol otomatis. Di mode *Manual* ESP32 hanya menjalankan perintah dari web.
2. **30 detik pertama setelah boot** tidak ada penyiraman otomatis (`BOOT_GRACE_MS`).
3. **Ambang**: siram hanya jika kelembapan tanah di bawah ambang (`soil_dry_pct`). Lihat angka ambang di kartu tanah.
4. **Stop rule**: jumlah dosis per jam sudah tercapai → pompa berhenti dan muncul peringatan *Cek tangki air*. Isi tangki dulu. Batasnya dihitung per jam, jadi penyiraman lanjut setelah hitungan dosis turun; batasnya bisa dinaikkan di bar perangkat → *Tangki air* → *Stop rule*.
5. **Sensor tidak valid**: bila sensor tanah di luar rentang atau DHT22 gagal 3× berturut-turut, pompa otomatis berhenti dan tutup tidak bergerak otomatis.
6. **Waktu meresap**: setelah satu dosis, ESP32 menunggu `soak_s` sebelum membaca ulang.
7. **Maintenance** aktif → ventilasi otomatis dijeda sampai keluar dari Maintenance.

## Dashboard dan koneksi

| Gejala | Kemungkinan penyebab | Tindakan |
|---|---|---|
| Node tampil *Offline* | Tidak ada sync dalam 30 detik terakhir | Cek WiFi (harus 2,4 GHz), `SERVER_URL` (tanpa garis miring di akhir), dan kode HTTP di output `status` |
| Serial: `POST gagal: -1` dst. | Tidak ada koneksi ke server | Cek internet/IP, kalau lokal pastikan laptop dan ESP32 satu jaringan dan firewall mengizinkan port 3000 |
| Serial: HTTP timeout | Cold start Vercel atau jaringan lambat | Batas waktu 8 detik; coba lagi, sync berikutnya biasanya berhasil |
| Respons 401 `device_id atau key salah` | `DEVICE_KEY`/`DEVICE_ID` di `config.h` tidak sama dengan baris di tabel `devices` | Samakan; untuk `gh-01`, cek apakah `api_key` sudah diganti di database |
| Dashboard minta login terus | Salah `DASHBOARD_USER`/`DASHBOARD_PASSWORD` | Cek env, lalu deploy ulang bila di Vercel |
| Tombol siram/tutup ditolak (409) | Node dalam mode Otomatis | Ubah ke Manual; hanya *Maintenance* yang boleh di mode Otomatis |
| Perintah tidak dijalankan | Perintah kedaluwarsa setelah 60 detik tanpa diambil ESP32 | Pastikan node online, lalu kirim lagi |
| Tombol tutup kembali ke posisi semula + notifikasi | ESP32 tidak mengonfirmasi perintah tutup dalam 25 detik | Cek node online dan servo tidak macet |
| Data lama/palsu di grafik | Sisa data simulator | Hapus: `delete from readings; delete from actuator_events; delete from commands;` |
| Model 3D kosong | WebGL tidak aktif di browser/GPU | Aktifkan akselerasi perangkat keras, coba browser lain |

## Database dan deploy

| Gejala | Kemungkinan penyebab | Tindakan |
|---|---|---|
| Error koneksi ke Supabase | Host pooler salah (`aws-0` vs `aws-1`), port salah, atau tanpa `?sslmode=require` | `npm run db:check` (memperbaiki host otomatis); pakai **Transaction pooler** port 6543 |
| `npm run db:init` gagal | `psql` tidak ada, atau `$DATABASE_URL` tidak dikenali di shell Windows | Pasang `psql` dan jalankan dari Git Bash, atau tempel isi file SQL ke SQL Editor Supabase |
| Build gagal di Vercel tapi jalan lokal | Nama file peka huruf besar/kecil di Linux (`./Charts` ≠ `./charts`) | Samakan huruf import dengan nama file |
| Web error `prepared statement ... does not exist` | `prepare: false` tidak aktif untuk pooler | Konfigurasi sudah diset di `web/lib/db.ts`; jangan menghapusnya |
| Kolom tidak ada setelah update | Skema lama | Jalankan ulang ketiga file SQL (aman diulang) |

## WhatsApp

| Gejala | Tindakan |
|---|---|
| Tidak ada pesan sama sekali | Cek `FONNTE_TOKEN` terisi dan device Fonnte tersambung; tabel `notifications` mencatat tiap percobaan (status `sent`/`skipped`/`failed`) |
| Status `skipped` | Jenis pesan dimatikan untuk node itu di popup 🔔, atau belum ada nomor tujuan (isi nomor di popup atau `WA_TARGET`) |
| Pesan tidak muncul walau kejadian terjadi lagi | Jeda minimum per jenis pesan (15–60 menit, lihat [setup.md](setup.md#3-notifikasi-whatsapp-opsional-fonnte)) |
| Hanya uji coba tanpa kirim | `WA_DRY_RUN=1` hanya menulis ke log server |
| Tidak pernah ada peringatan *node offline* | Cron eksternal belum dibuat: butuh `CRON_SECRET` dan job tiap 5 menit ke `/api/cron/offline` dengan header `Authorization: Bearer ...` |
| Cron mengembalikan 503 / 401 | 503: `CRON_SECRET` belum diisi. 401: secret di cron tidak cocok |
| Pengirim berhenti bekerja | Nomor mungkin dibatasi WhatsApp; siapkan nomor cadangan |

## Kalau masih buntu

Kumpulkan: output `status` dari Serial, 20 baris terakhir log Serial saat gejala muncul, status HTTP dari Serial, dan (di Vercel) log fungsi `/api/ingest`. Itu hampir selalu cukup untuk menentukan apakah masalahnya di hardware, jaringan, atau server.
