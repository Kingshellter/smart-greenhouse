# Daftar Komponen (BOM) dan Anggaran Daya

Terkait: cara merangkai di [hardware.md](hardware.md) dan `docs/panduan-wiring/index.html`, risiko listrik di [safety.md](safety.md#listrik), dan masalah daya di [troubleshooting.md](troubleshooting.md#hardware).

## Daftar komponen

Daftar mengikuti panduan wiring. **Kolom harga, toko, dan tautan sengaja dikosongkan**: isi dengan harga dan toko yang benar-benar dipakai tim, jangan diperkirakan.

| # | Komponen | Spesifikasi | Jumlah | Harga satuan | Toko / tautan | Cadangan |
|---|---|---|---|---|---|---|
| 1 | ESP32 DevKit | 30 pin, WiFi 2,4 GHz | 1 | | | 1 |
| 2 | Sensor kelembapan tanah kapasitif | v1.2 | 1 | | | 1 (probe bisa berkarat) |
| 3 | Sensor suhu/RH | DHT22 (AM2302) | 1 | | | 1 |
| 4 | Modul relay | 1 channel, 5 V | 1 | | | 1 |
| 5 | Pompa celup | 5 V, + selang | 1 | | | 1 |
| 6 | Servo | MG996R | 1 | | | 1 |
| 7 | Kapasitor elektrolit | 470–1000 µF, minimal 10 V | 1 | | | 2 |
| 8 | Adaptor | 5 V 3 A + DC jack, atau powerbank ≥ 2,4 A | 1 | | | |
| 9 | Kabel jumper | male–male, female–male | 1 set | | | |
| 10 | Breadboard / perfboard | | 1 | | | |
| 11 | Botol/tangki air | di luar kotak, diikat ke dinding kanan | 1 | | | |
| 12 | Kotak greenhouse | rangka aluminium + kaca (32×20×20 cm) | 1 | | | |
| 13 | Resistor pull-up | 10 kΩ, jika modul DHT22 tidak punya | 1 | | | |

Catatan pemilihan:

- Sensor tanah harus tipe **kapasitif**. Tipe resistif (probe logam telanjang) berkarat cepat dan membaca tidak stabil.
- Pompa dan servo berbagi satu sumber 5 V. Pilih adaptor dengan margin arus (lihat di bawah), bukan yang pas-pasan.
- Beli satu set cadangan untuk komponen yang paling sering rusak: sensor tanah, pompa, relay.

## Anggaran daya

Angka berikut adalah **perkiraan dari spesifikasi umum** komponen sejenis, bukan hasil ukur alat ini. Ukur arus sebenarnya dengan multimeter (mode seri) atau USB power meter, lalu ganti nilai di kolom "Terukur".

| Komponen | Arus tipikal (perkiraan) | Arus puncak (perkiraan) | Terukur |
|---|---|---|---|
| ESP32 (WiFi aktif) | 80–250 mA | sekitar 500 mA saat transmisi | |
| Modul relay (kumparan aktif) | sekitar 70–90 mA | sama | |
| DHT22 | di bawah 2 mA | sama | |
| Sensor tanah kapasitif | sekitar 5 mA | sama | |
| Pompa celup 5 V | 200–500 mA | beberapa kali lipat saat start | |
| Servo MG996R | 100–500 mA saat bergerak | sekitar 2,5 A saat stall (macet/menahan beban berat) | |

Kasus terburuk (semuanya aktif bersamaan, servo stall): jumlahkan kolom puncak, sekitar 3,5 A atau lebih. Itu sebabnya panduan wiring merekomendasikan adaptor **5 V 3 A** atau powerbank ≥ 2,4 A, dan kapasitor 470–1000 µF di dekat servo.

Hal yang perlu dipastikan:

- Firmware tidak menjalankan HTTP saat pompa atau servo bergerak, tetapi pompa dan servo masih bisa bergerak bersamaan. Tes langkah 4 di [hardware.md](hardware.md#urutan-tes) memeriksa ini.
- Tanda daya kurang: ESP32 restart saat servo/pompa bergerak. Firmware mencatatnya sebagai restart `BROWNOUT`, dan bisa dikabarkan lewat WhatsApp. Langkah penanganan: [troubleshooting.md](troubleshooting.md#hardware).
- Daya USB laptop tidak cukup untuk servo dengan beban. Mode "tanpa adaptor" di panduan wiring hanya untuk tes singkat tanpa beban.

## Tabel pengukuran (isi saat tes)

| Tanggal | Kondisi | Tegangan 5 V | Arus total | Catatan |
|---|---|---|---|---|
| | Idle, WiFi tersambung | | | |
| | Pompa menyala | | | |
| | Servo bergerak | | | |
| | Pompa + servo bersamaan | | | |
