# Catatan Keselamatan

Alat ini memadukan air, listrik, dan bagian bergerak. Baca sebelum merangkai atau meninggalkan alat menyala tanpa pengawasan.

Terkait: wiring dan pengaman firmware di [hardware.md](hardware.md), kebutuhan arus dan pemilihan adaptor di [bom-and-power.md](bom-and-power.md#anggaran-daya), pengamanan akun dan key di [setup.md](setup.md#1-database), dan gejala kerusakan di [troubleshooting.md](troubleshooting.md#hardware).

## Listrik

- **Cabut semua daya (USB dan adaptor) setiap kali memindah kabel.**
- Rangkaian ini bertegangan rendah (5 V). Satu-satunya bagian bertegangan jaringan (listrik rumah) adalah **adaptor di colokan dinding**. Pakai adaptor bersertifikat dengan casing utuh, jangan adaptor yang retak, panas berlebihan, atau kabelnya terkelupas. Jangan membuka adaptor.
- **Jangan menyambungkan beban tegangan jaringan (AC) ke relay.** Modul relay 1 channel di proyek ini hanya dipakai untuk memutus kabel merah pompa 5 V. Kalau suatu saat ingin mengganti pompa dengan yang berdaya AC, itu desain baru yang butuh kotak tertutup, isolasi, dan pengaman khusus.
- Jangan sambungkan 5 V ke pin 3V3 ESP32 atau VCC sensor 3,3 V. Periksa ulang sebelum daya dicolok.
- Pasang kapasitor dengan polaritas benar (kaki bergaris = −). Kapasitor terbalik bisa meledak atau menggembung.
- Pertimbangkan sekering atau pemutus arus kecil (mis. 3–4 A) pada jalur 5 V dari adaptor, supaya korsleting tidak membuat kabel panas. Ini saran tambahan, belum ada di desain sekarang.
- **Cabut adaptor 5 V sebelum upload firmware lewat USB** bila VIN tersambung ke adaptor, supaya dua sumber daya tidak saling bertemu.

## Air dan listrik

- Pisahkan ruang elektronik (kanan) dari ruang tanaman (kiri). Tangki air ada di luar kotak, di dinding kanan, dan selang masuk lewat grommet. Pastikan lubang selang tidak meneteskan air ke sisi elektronik.
- Letakkan sambungan, relay, dan breadboard **lebih tinggi daripada** tangki dan jalur selang, supaya tetesan tidak mengalir ke sana.
- Isolasi sambungan kabel pompa (pilin lalu bungkus isolasi, atau pakai heat-shrink) dan jangan biarkan kabel telanjang menyentuh air atau logam rangka.
- Pompa celup harus terendam saat menyala. Pompa yang berjalan kering cepat panas dan rusak.
- Saat tes, arahkan selang ke gelas, bukan ke pot.
- Mode *Maintenance* hanya mengangkat tutup dan menjeda ventilasi otomatis. Penyiraman otomatis tetap bisa berjalan. Kalau perlu mengerjakan pompa, selang, atau kabel di dalam kotak, matikan daya node dulu.

## Bagian bergerak

- Servo MG996R kuat. Jari bisa terjepit antara tutup dan rangka. Pakai mode *Maintenance* (tutup terangkat penuh) saat bekerja di dalam kotak, dan jauhkan tangan dari engsel saat mode otomatis aktif.
- Tutup bergerak sendiri mengikuti suhu dan RH. Jangan menaruh benda di jalur gerak tutup.
- Tes servo pertama kali **tanpa horn terpasang ke tutup**. Begitu ESP32 menyala, servo langsung bergerak ke sudut tertutup (90°).

## Fail-safe dan batasannya

Yang sudah ada di firmware (lihat [hardware.md](hardware.md#keselamatan-yang-sudah-ada-di-firmware)): batas 10 detik per nyala pompa, stop rule dosis per jam, berhenti menyiram bila sensor tidak valid, jeda 30 detik setelah boot.

Batasannya: semuanya perangkat lunak. Kalau relay macet menutup (kontak menempel), atau ESP32 hang saat pompa menyala, tidak ada pengaman fisik yang mematikan pompa. Untuk pemakaian tanpa pengawasan lama, tambahkan pengaman fisik, misalnya sakelar pelampung pada tangki penampung atau tampungan di bawah pot, atau timer terpisah di jalur daya pompa.

## Data dan akun

- Ganti `api_key` bawaan `gh-01` sebelum alat tersambung ke internet.
- Isi `DASHBOARD_USER` dan `DASHBOARD_PASSWORD` (lihat [setup.md](setup.md#variabel-environment)). Tanpa itu, siapa pun yang tahu URL bisa melihat data dan menjalankan pompa dan tutup.
- Jangan commit `.env.local` atau `firmware/.../config.h`, dan jangan menempelkan token atau key di screenshot.
- Pakai nomor WhatsApp khusus untuk pengirim Fonnte, bukan nomor pribadi.
