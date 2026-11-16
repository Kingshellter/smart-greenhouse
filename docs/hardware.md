# Hardware, Wiring, dan Tes

Lihat juga: [bom-and-power.md](bom-and-power.md) (komponen dan anggaran daya), [safety.md](safety.md), [troubleshooting.md](troubleshooting.md#hardware), [setup.md](setup.md#5-firmware-esp32) (firmware dan `config.h`), dan [user-guide.md](user-guide.md#kalibrasi-alat) (menu kalibrasi di dashboard).

## Pin

| Pin | Komponen |
|---|---|
| GPIO 34 | Soil moisture kapasitif (ADC1) |
| GPIO 13 | DHT22 (pull-up 10 kΩ ke 3,3 V jika modul tidak punya) |
| GPIO 14 | Relay IN → pompa |
| GPIO 18 | Servo MG996R (daya dari rail 5 V, kapasitor 470–1000 µF) |

Skema lengkap: `docs/skema_wiring_esp32_greenhouse.png`. Panduan langkah demi langkah dengan checklist ada di `docs/panduan-wiring/index.html` (buka di browser; pilih mode daya: tes di meja, tanpa adaptor, atau di dalam kotak). Gambar per bagian ada di `docs/gambar-wiring/`.

Aturan wiring yang paling sering salah:

- Servo mengambil daya dari titik 5 V, **bukan** dari pin 3V3 atau pin daya ESP32.
- GND ESP32, relay, servo, dan adaptor harus tersambung jadi satu.
- Kabel merah pompa masuk ke terminal **NO** relay. Kalau pompa langsung menyala saat daya dicolok, kabelnya ada di NC.
- Jumper JD_VCC–VCC pada modul relay tetap terpasang.
- Kapasitor 470–1000 µF dipasang sedekat mungkin dengan kabel servo. Kaki panjang (+) ke 5 V, kaki bergaris (−) ke GND.

## Perintah Serial Monitor

Baud 115200, line ending Newline.

| Perintah | Fungsi |
|---|---|
| `status` | Semua nilai sensor dan state |
| `cal` | Rata-rata ADC tanah. Catat nilainya di udara (kering) dan di air (basah), lalu isi di dashboard → bar perangkat di bawah → *Sensor tanah* → *Kalibrasi sensor* → *Ubah* |
| `pump 3000` | Pompa 3 detik (tes) · `stop` untuk mematikan |
| `lid open` / `lid close` / `lid 100` | Tes servo |

## Keselamatan yang sudah ada di firmware

- **Pompa saat boot:** relay diset OFF sebelum pin dijadikan output. Kalau pompa tetap menyala saat boot, ubah `RELAY_ACTIVE_LOW` di `config.h`.
- **Batas waktu pompa:** tiap kali menyala dibatasi timer hardware, dan maksimal mutlak 10 s (`PUMP_HARD_MAX_MS`) walaupun loop tertahan. Batas ini tidak bisa diubah dari web.
- **Tidak menyiram 30 detik pertama setelah boot** (`BOOT_GRACE_MS`), supaya restart berulang tidak memicu penyiraman berulang.
- **Stop rule:** jumlah dosis otomatis per jam dibatasi. Jika batas tercapai tapi tanah masih kering, muncul peringatan *Cek tangki air*.
- **Sensor tidak valid:** jika sensor tanah di luar rentang (ADC < 100 atau > 4000) atau DHT22 gagal 3× berturut-turut, pompa otomatis berhenti dan tidak ada dosis baru.
- **Brownout saat maintenance:** kalau ESP32 restart karena brownout saat tutup diangkat, servo diturunkan 10° (tidak melewati posisi *terbuka*, jadi tutup tetap terangkat) supaya tidak terus menegang di batas mekanisnya dan memicu restart berulang. Event-nya tercatat `lid maintenance (safety)`.
- **Perintah tidak diputar ulang:** id perintah terakhir yang dijalankan disimpan di NVS, jadi perintah yang sama atau lebih lama tidak dijalankan lagi setelah restart (perintah bisa datang lewat MQTT dan HTTP).
- **Servo:** bergerak bertahap (tetap 1°/15 ms, konstanta `SERVO_STEP_MS`) supaya tutup tidak terbanting dan arus servo tidak melonjak (5 ms/° terbukti membuat servo macet dan ESP32 restart saat daya dari VIN), dan sudutnya dibatasi maksimal 90° dari posisi tertutup. Setelah sampai, servo sengaja **tidak** di-*detach*: sinyal PWM tetap menahan posisi, karena sebagian MG996R meluncur sendiri ke ujung saat sinyal dilepas dan tutup bisa melorot karena beratnya. Posisi terakhir disimpan di NVS, jadi setelah restart (mis. brownout) servo tidak melompat.
- **HTTP:** tidak dijalankan saat pompa atau servo sedang bergerak.
- **MQTT:** sambung ulang ke broker (TLS, bisa memblokir 1–3 s) juga tidak dijalankan saat pompa atau servo bergerak, dan dicoba paling cepat tiap 10 s. Broker mati tidak mengganggu otomasi maupun HTTP.
- **Kontrol otomatis tetap jalan saat WiFi putus.** Keputusan siram dan ventilasi dibuat di ESP32, bukan di server.

Semua pengaman di atas ada di firmware. Pengaman fisik tambahan (mis. sakelar pelampung atau timer terpisah) belum ada. Batasan dan saran pengaman fisik: [safety.md](safety.md#fail-safe-dan-batasannya).

## Urutan tes

1. Rangkai breadboard sesuai tabel pin. Tes tiap komponen lewat Serial: `status`, `pump 1000`, `lid 100`.
2. Kalibrasi sensor tanah dengan `cal` (di udara dan di air), lalu isi nilainya di dashboard.
3. Ukur debit pompa: `pump 10000` ke gelas ukur, bagi 10, lalu isi *Debit pompa* (ml/s) lewat bar perangkat di bawah → *Pompa* → *Dosis pompa*.
4. Jalankan servo dan pompa bersamaan, pastikan ESP32 tidak reset. Catat arus dan tegangan di [bom-and-power.md](bom-and-power.md#tabel-pengukuran-isi-saat-tes); kalau reset, lihat [troubleshooting.md](troubleshooting.md#hardware).
5. Tes end-to-end: reading → API → database → dashboard, lalu mode manual → tombol → pompa/tutup.
6. Di dalam kotak: atur sudut *Tertutup* / *Terbuka* lewat bar perangkat di bawah → *Servo tutup* → kalibrasi (±1°/±5°).

Untuk tes pompa, arahkan selang ke gelas, bukan ke pot, dan pastikan pompa celup terendam air tiap kali dinyalakan (pompa kering cepat rusak). Tes servo pertama tanpa horn terpasang ke tutup.

## Pemeliharaan berkala

| Kapan | Apa |
|---|---|
| Tiap minggu | Cek tinggi air tangki, selang tidak tersumbat atau berlumut, kabel sensor tidak longgar |
| Tiap bulan | Kalibrasi ulang sensor tanah (`cal`), bandingkan DHT22 dengan termometer/higrometer acuan, cek engsel dan horn servo |
| Tiap 3–6 bulan | Bersihkan tangki dan selang, periksa korosi pada probe sensor tanah dan terminal relay |
| Setelah restart brownout | Cek kapasitor, kabel daya, dan kapasitas adaptor (lihat [troubleshooting.md](troubleshooting.md)) |
