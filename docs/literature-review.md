# Studi Literatur — 13 paper (2022–2026)

Terkait: ringkasan proyek dan kesesuaian dengan kebutuhan dosen di [README.md](../README.md), rancangan teknis di [setup.md](setup.md), [hardware.md](hardware.md), dan [api.md](api.md). Bagian "Ringkasan posisi proyek kami" di bawah menjelaskan apa yang membedakan proyek ini.

Syarat dosen: minimal 10 studi terkait dari 5 tahun terakhir (2021–2026).
No. 1–3 adalah paper yang sudah ada di PPT Laporan Antara 2; no. 4–13 adalah tambahan.

> **Perhatian:** Ichwana & Nasution (2020) di slide 11 sudah lebih dari 5 tahun, jadi tidak dihitung. Paper itu boleh tetap dipakai sebagai latar belakang, tapi bukan bagian dari 10 studi wajib.

Format sitasi: IEEE. Cek ulang nomor halaman sebelum dimasukkan ke laporan.

---

## A. Masalah iklim mikro greenhouse tropis

**[1] Suud dkk. (2023)** — *JKPTB* 11(1). *(sudah ada di PPT)*
- **Isi:** Greenhouse lipat modular untuk iklim tropis. Pukul 12.00 suhu di dalam mencapai 45 °C, sedangkan suhu luar 34 °C.
- **Kaitan:** Bukti utama bahwa ventilasi otomatis dibutuhkan.

**[2] I. Zakira, G. M. D. Putra, dan G. N. D. Side** — "Rancang bangun sistem pemantauan iklim cerdas pada budidaya tanaman pakcoy di smart greenhouse sistem hidroponik vertikal farming," *J-AGENT*, vol. 4, no. 1, pp. 78–89, 2026.
- **Isi:** Greenhouse 4×3 m dengan ESP32 dan DHT22. Suhu siang mencapai 42,3 °C.
- **Kaitan:** Data terbaru (2026) yang menguatkan masalah panas. Juga contoh pemakaian DHT22 di greenhouse nyata.

## B. Irigasi otomatis berbasis kelembapan tanah

**[3] Parma dkk. (2023)** — Penyiraman otomatis berbasis IoT dengan Blynk. *(sudah ada di PPT)*
- **Isi:** ESP8266, sensor tanah, DHT11, relay, dan pompa 5 V.
- **Kaitan:** Dasar rangkaian relay + pompa.
- **Yang kami kembangkan:** Panas ditangani ventilasi, bukan dengan menyiram.

**[4] Prasetyo dkk. (2022)** — Penyiraman otomatis tanaman hias dengan Blynk dan NodeMCU. *(sudah ada di PPT)*
- **Isi:** Ide sensor isi tangki.
- **Kaitan:** Diwujudkan sebagai peringatan "Cek tangki air".

**[5] R. M. Akbar, J. Maulindar, dan N. F. Muhammad** — "Internet of Things-based automation system for watering cayenne pepper plants," *J. Artif. Intell. Softw. Eng. (J-AISE)*, vol. 5, no. 3, pp. 1079–1085, Sep. 2025, doi: 10.30811/jaise.v5i3.7359.
- **Isi:** ESP32 + DHT22 + sensor tanah + relay/pompa. Data dikirim lewat HTTP ke database Supabase dan tampil di web dalam kurang dari 5 detik.
- **Kaitan:** Arsitekturnya paling mirip dengan kami (HTTP → PostgreSQL → web).
- **Yang kami tambahkan:** Ventilasi servo, stop rule, multi-node, dan modul analitik.

**[6] A. P. Pratama dkk.** — "Smart irrigation system berbasis IoT dengan sensor soil moisture dan DHT22 menggunakan sumber daya terbarukan," *Prosiding SENATIB*, Univ. Duta Bangsa Surakarta, 2025, doi: 10.47701/2p6nej88.
- **Isi:** ESP32 + soil moisture + DHT22. Riwayat kelembapan dan aktivitas pompa disimpan di database.
- **Kaitan:** Mendukung pencatatan setiap aksi pompa (tabel `actuator_events`).

## C. Smart greenhouse ESP32: ventilasi atap + penyiraman

**[7] D. A. Permana, C. W. Kurniawan, dan M. H. Sidiq** — "Smart greenhouse otomatis berbasis IoT untuk tanaman selada," *Prosiding SENATIB 2025*, Univ. Duta Bangsa Surakarta, pp. 642–652, Jul. 2025.
- **Isi:** ESP32 mengatur servo atap dan pompa berdasarkan ambang suhu dan kelembapan tanah. Diuji hanya lewat simulasi Wokwi.
- **Kaitan:** Konsepnya sama (servo atap + pompa).
- **Yang kami kembangkan:** Prototipe fisik dengan tanaman nyata, hysteresis, dan servo yang bergerak pelan.

**[8] A. Permana, F. Ariani, A. Mardiansyah, dan Nurdianita** — "Rancang bangun smart greenhouse berbasis Internet of Things menggunakan ESP32 dengan monitoring dan kontrol otomatis," *EXPERT: Jurnal Manajemen Sistem Informasi dan Teknologi*, 2026, doi: 10.36448/expert.v16i1.4940.
- **Isi:** ESP32 + DHT22 + soil moisture + BH1750 + dashboard web. Error suhu 0,26 °C dan delay data rata-rata 0,82 s.
- **Kaitan:** Metode pengujian akurasi dan delay bisa kami tiru di Bab Pengujian.
- **Catatan:** Cek volume di halaman jurnal. Header PDF tertulis Vol. 13, tetapi DOI-nya v16.

**[9] R. T. P. H. Lambang, D. Saputra, M. M. H. Aufa, S. M. Sholihah, dan N. N. Khatirokimmah** — "Sistem smart greenhouse berbasis IoT menggunakan Firebase untuk monitoring suhu dan kelembapan," *JATI (Jurnal Mahasiswa Teknik Informatika)*, vol. 10, no. 3, pp. 5260–5266, 2026, doi: 10.36040/jati.v10i3.18238.
- **Isi:** ESP32 + DHT22. Kipas menyala pada ≥ 32 °C dan mati di sekitar 29 °C.
- **Kaitan:** Pembanding langsung untuk ambang hysteresis 32/29 °C yang kami pakai.

## D. Arsitektur cloud sendiri, database, dan skalabilitas multi-node

**[10] M. F. A. Farisi, G. Abdillah, dan A. Komarudin** — "Sistem monitoring tanaman paprika di greenhouse menggunakan Internet of Things," *Jurnal Algoritma*, vol. 22, no. 2, pp. 197–204, Nov. 2025, doi: 10.33364/algoritma/v.22-2.2437.
- **Isi:** Dua ESP32 (DHT22 + pH dan NPK) mengirim data ke Firestore tiap 10 detik, ditampilkan di dashboard web. Packet loss 0%.
- **Kaitan:** Contoh lebih dari satu node ESP32 dalam satu sistem.

**[11] Supriyanto, P. O. W. Aryawan, M. Solahudin, L. Sucahyo, S. Widodo, dan S. Susanto** — "Development of tropical grape greenhouse monitoring and nutrient delivery scheduling using MQTT protocol and IoT," *Jurnal Teknotan*, vol. 20, no. 2, 2026, doi: 10.24198/jt.vol20n2.6.
- **Isi:** Node ESP32 menggunakan broker MQTT di VPS sendiri dan database MySQL. Latensi kontrol 63–86 ms, di bawah batas 150 ms.
- **Kaitan:** Contoh cloud dan database milik sendiri.
- **Bahan diskusi:** Perbandingan HTTP (pilihan kami) dengan MQTT.

**[12] O. E. Guijarro-Rubio, D. R. Vinocunga-Pillajo, O. Del Real-Fleites, E. Guardado-Yordi, dan A. Pérez-Martínez** — "Monitoring of environmental variables in greenhouse crops through an IoT wireless sensor network," *DYNA*, vol. 92, no. 235, 2025, doi: 10.15446/dyna.v92n235.115402.
- **Isi:** Jaringan sensor nirkabel dengan beberapa node client ESP8266 dan satu node server ESP32. Data mengalir lewat MQTT → Node-RED → InfluxDB → Grafana.
- **Kaitan:** Referensi skalabilitas banyak node. Di sistem kami, skalabilitas dicapai dengan `device_id` per node.

**[13] R. F. Kirwan, F. Abbas, I. Atmosukarto, A. W. Y. Loo, J. H. Lim, dan S. Yeo** — "Scalable agritech growbox architecture," *Frontiers in the Internet of Things*, vol. 2, art. 1256163, 2023, doi: 10.3389/friot.2023.1256163.
- **Isi:** Growbox modular dengan banyak controller (termasuk ESP32), backend database, dan dashboard web untuk monitoring, peringatan, dan manajemen perangkat.
- **Kaitan:** Dasar desain "menambah node cukup lewat konfigurasi, tanpa kode baru".

---

### Ringkasan posisi proyek kami

Penelitian sebelumnya umumnya hanya memenuhi sebagian aspek. Ada yang hanya memantau [2], [10]. Ada yang memakai platform pihak ketiga, yaitu Blynk [3], [4] atau Firebase [9], [10]. Ada yang hanya diuji lewat simulasi [7]. Ada juga yang menangani panas dengan cara menyiram [3].

Proyek kami menggabungkan beberapa hal sekaligus:
1. Irigasi berbasis kadar air tanah dengan stop rule.
2. Ventilasi atap servo dengan hysteresis.
3. Cloud API dan PostgreSQL milik sendiri.
4. Dukungan banyak node melalui `device_id`.
5. Modul analitik.
