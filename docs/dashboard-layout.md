# Dashboard, Model 3D, dan Styling: Referensi Pengembang

Referensi desain dan implementasi untuk siapa pun (termasuk asisten AI) yang mengubah `web/`. Isinya sama dengan bagian *Web app*, *3D model*, dan *Styling* di [CLAUDE.md](../CLAUDE.md), yang ditulis dalam bahasa Inggris. Kalau mengubah salah satunya, ubah juga yang lain.

Terkait: cara memakai dashboard di [user-guide.md](user-guide.md), endpoint dan protokol sync di [api.md](api.md), variabel environment (termasuk login dashboard) di [setup.md](setup.md#variabel-environment), serta menu kalibrasi tiap perangkat dan cara mengukur nilainya di [hardware.md](hardware.md#urutan-tes).

## Aplikasi web (`web/`, Next.js 16 App Router, React 19)

### Struktur
- Halaman dibuat tipis: `app/page.tsx` → `components/DeviceList.tsx`, `app/devices/[id]/page.tsx` → `components/Dashboard.tsx`. Semuanya client component yang polling API lewat `usePoll` (`lib/client.ts`), yang berhenti saat tab tersembunyi. Tidak ada server component yang mengambil data.
- Route API memakai `postgres.js` lewat satu `sql` ber-pool di `lib/db.ts` (`prepare: false` wajib untuk Supabase transaction pooler; `numeric` diparse menjadi `number`). Helper validasi input ada di `lib/http.ts` (`num`, `oneOf`, `readJson`, `bad`). Nilai sensor di luar rentang disimpan sebagai `null`, tidak dipotong.
- "Online" berarti `last_seen` kurang dari 30 detik lalu (dihitung di `/state` dan di `DeviceList`).
- `proxy.ts` (nama baru middleware di Next 16) menambah Basic auth HTTP hanya bila `DASHBOARD_USER`/`DASHBOARD_PASSWORD` diisi, dan mengecualikan `/api/ingest`, `/api/health`, dan `/api/cron`.
- Dashboard menampilkan perubahan mode/tutup secara optimistis (state `pending`, dihapus saat reading mengonfirmasi atau setelah 25 detik). Kalau ESP32 tidak mengonfirmasi perintah tutup dalam 25 detik, state optimistis dikembalikan dengan toast. Tanpa MQTT, firmware tidak mengirim reading saat pompa jalan, jadi animasi pompa diputar ulang dari event `pump run`; dengan MQTT, `pump_state` langsung menggerakkan animasi (`livePump` di `Dashboard.tsx`).
- Lapisan MQTT opsional: `useLive()` (`lib/live.ts`) mengambil `/api/mqtt/config` (URL WebSocket + akun khusus subscribe, di balik login dashboard) dan memuat `mqtt` secara lazy. `mergeLive()` menimpa hasil polling `/state` dengan state live selama masih baru (`LIVE_FRESH_MS` 25 detik; pesan *retained* diabaikan karena umurnya tidak diketahui). Polling HTTP tetap berjalan tiap 3 detik. Topik dan alurnya: [api.md](api.md#mqtt).
- Analitik harian dikelompokkan menurut `APP_TZ` (bawaan Asia/Jakarta); format waktu di sisi klien juga di-hardcode ke Asia/Jakarta.

### Layout
- Dashboard muat satu layar tanpa scroll halaman (lebar ≥1024 px dan tinggi ≥640 px; di bawah itu kolom ditumpuk dan halaman di-scroll). Tiga kolom, kanan lebih lebar dari kiri, ditambah baris bawah selebar penuh.
- **Kolom kiri:** judul, kartu status sistem, tiga kartu sensor.
  - Judul tidak punya tautan kembali: logo merek di navigasi membawa ke daftar node. Nama yang panjang tidak dipotong, tapi melintas di atas panggung 3D dengan `pointer-events: none` supaya orbit tetap bisa dipakai.
  - Judul dipaku di bagian atas kolom (sejajar dengan kartu tanaman). Kedua kolom samping mulai 40 px di bawah atas panggung (18 px di layar pendek), dan log event menyerap selisihnya. Kartu status dan kartu sensor menumpuk dari bawah, jadi sisa tinggi berada di antara judul dan kartu status.
- **Kartu status:** satu-satunya kartu berwarna di halaman; warnanya adalah state (`ok` gradien hijau / `warn` kuning / `off` gelap). Judul = masalah pertama, satu baris `short` yang terlihat, semua masalah dengan teks lengkap di tooltip ⓘ yang terbuka di samping kartu (di atas kartu saat ditumpuk).
- **Kartu sensor** (`SensorCards.tsx`: tanah / suhu / RH dengan mini chart 24 jam; varian `compact` dari chart di `Charts.tsx`): label + status, nilai + ambang yang dipakai, lalu chart selebar penuh. Di bawah tinggi 800 px, chart pindah ke samping nilai. Saat node offline, nilai sensor diredupkan dan badge status diganti umur data (`stale`), karena reading terakhir bukan data langsung.
- **Navigasi:** merek, id node, dan pil Live/Offline dengan umur data (*Live · MQTT* selama state MQTT masih baru).
- **Tengah:** panggung 3D, dengan pilihan mode berupa tiga tombol kecil terpisah yang mengambang di bagian bawah panggung (`.mode-float`, opasitas 55 % sampai di-hover atau difokus). Tombolnya solid dan tanpa transform: `backdrop-filter` di atas canvas yang beranimasi membuatnya berkedip.
- **Kolom kanan:** kartu tanaman, lalu log event (`EventLog.tsx`: gelembung ikon per jenis aksi, pemicu di bawah teks, waktu di kanan, satu header lengket per hari). Kolom kanan di-scroll secara internal bila ada baris yang dibuka.

### Rentang riwayat
Rentang riwayat (`1h…30d`) adalah satu pengaturan bersama di `lib/range.ts`: store modul dengan `useSyncExternalStore`, bukan React context, karena `<Html>` dari drei merender kartu hotspot di root terpisah. Pilihannya diingat di localStorage. Mengubahnya di popup atau kartu hotspot juga mengubah kartu sensor di kiri.

### Kartu hotspot (`HotspotCards.tsx`, chart di `Charts.tsx`)
Chart dan kontrol tutup/pompa ada di kartu hotspot 3D.
- Tanah/udara menampilkan nilai pada `Gauge` (skala bertanda dengan ambang pemicu otomatisasi, `gaugeFor` di `ui.tsx`), riwayat (tab rentang), dan min/rata-rata/maks hari ini.
- Kartu udara berpindah antara suhu dan RH lewat dua tab nilai.
- Pompa menampilkan batang 7 hari + Siram (`DayBars` mengisi hari yang kosong, karena `/analytics` hanya mengembalikan hari yang punya data). Tutup menampilkan persen terbuka 7 hari + Tutup/Buka.
- Hotspot tutup dan pompa abu-abu (`locked`) dan tombolnya nonaktif di luar mode manual atau saat maintenance. Kartu lalu menampilkan catatan `Lock`, dengan pintasan "Ke Manual" bila penyebabnya mode otomatis.

### Bar perangkat (`DeviceBar.tsx`)
- Baris bawah (grid area `bar`, selebar penuh di bawah ketiga kolom) adalah satu kartu dengan satu kolom di tengah per perangkat: sensor tanah, DHT22, pompa, servo tutup, tangki, WiFi (nama, ikon, status + titik).
- Satu kolom membuka popup perangkat itu: node kartu hotspot yang sama dengan yang dibuat di `Dashboard.tsx` (`cards`, diteruskan ke `DeviceBar`: nilai, gauge ambang, riwayat dengan tab rentang, statistik hari ini, kontrol), lalu angka analitik dan kalibrasinya.
- Kalibrasi per perangkat (blok di `DeviceBar.tsx`, field di `SettingsBlock.tsx` dan `DeviceSettings.tsx`): tanah → "Kalibrasi sensor" (ADC kering/basah dengan bacaan mentah saat ini); pompa → "Dosis pompa"; servo tutup → sudut; tangki → "Stop rule"; WiFi → "Pengiriman data" (interval kirim).

### Popup tanaman (`PresetPicker.tsx`)
- Ukuran tetap; header dan footer (`Terapkan <nama>`) diam sementara bagian isi di-scroll.
- Isi: tile preset yang ringkas, lalu tiga ambang preset terpilih sebagai skala yang bisa digeser (`GaugeSlider` di `ui.tsx`, min–maks tetap supaya skala tidak bergeser saat digeser) dengan input ketik (`NumField`) di bawahnya.
- Nilai yang diedit diterapkan sebagai preset + patch setting (`applyPreset` di `Dashboard.tsx`).
- Input `SettingsBlock` mengambil min/maks dari `NUMERIC_LIMITS` dan menampilkan petunjuk saat diedit. Tidak ada popup detail.

## Model 3D (`components/Greenhouse3D.tsx`)

### Model
Model react-three-fiber dengan skala sebenarnya (1 unit = 1 cm; kotak 32×20×20 cm, ruang tanaman di kiri, elektronik di kanan, tutup berengsel di tepi belakang). Model mengikuti state langsung: sudut tutup dianimasikan pada kecepatan servo sebenarnya (`SERVO_DEG_PER_S` di `lib/settings.ts`, sesuai `SERVO_STEP_MS` tetap di firmware = 15 ms/°; kecepatan servo bukan setting), warna tanah, aliran pompa, peringatan tangki.
- Tampilannya rangka aluminium + kaca; ruang kanan (elektronik) punya tutup tetap.
- Botol air berdiri di luar kotak, diikat ke dinding kanan luar (`BOTTLE_X`/`BOTTLE_Z`), sehingga model lebih lebar di kanan (`MODEL_W`, `TARGET` digeser ke kanan).
- Selang pompa digambar oleh `roundedPath()` sebagai ruas lurus dengan tikungan bulat (`TUBE_POINTS`, `TUBE_BEND`): naik keluar dari botol, melintang lewat grommet di dinding kanan dan sekat, lalu turun di atas tanaman. Tetesan air pompa mengikuti jalur yang sama.
- Bidang `GroundShadow` (tekstur canvas-2D yang dibuat sekali, tanpa render pass tambahan) membuat kotak dan botol terkesan menapak.

### Hotspot
- Titik `Hotspot` (drei `<Html>`: tanah / udara / pompa / tangki / tutup) membawa ikon bagiannya dan menampilkan namanya saat di-hover. Warnanya hijau, kuning dan berdenyut bila `tones[kind]` bernilai `warn` (tanah kering, udara panas/lembap, peringatan tangki), abu-abu bila `locked`.
- Kartunya tersembunyi: menekan titik menampilkan kartu callout (garis putus-putus + node `cards[kind]` yang dibuat di `Dashboard.tsx`); menekannya lagi atau menekan canvas kosong (`onPointerMissed`) menyembunyikannya; hanya satu yang terbuka sekaligus.
- Pembungkus titik menghentikan propagasi klik, kalau tidak klik naik ke root event R3F dan dihitung sebagai klik meleset.
- Kartu di-portal ke div `.gh3d` (di luar `overflow: hidden` milik canvas). Saat dibuka, hotspot mengukur ruang di tiap sisi dan memilih sisi/lebar yang muat (`--hc-w`), dan `CalloutCard` menggeser kartu secara vertikal agar tetap di dalam panggung.
- `CalloutCard` adalah komponen tersendiri karena drei merender anak `<Html>` di React root terpisah, sehingga ref ke kartu masih null saat effect milik `Hotspot` berjalan.
- Hotspot yang terbuka dinaikkan lewat `wrapperClass="hs-open"` karena drei hanya menghitung ulang `zIndexRange` saat kamera bergerak, dan drei tidak pernah menghapus `wrapperClass`, jadi class itu selalu dipasang.
- Hotspot tutup adalah anak dari grup tutup yang berputar.

### Kamera dan pemuatan
- `CameraFit` menggeser model ke atas bila tepi bawahnya akan berada di ruang tombol mode (`BOTTOM_ROOM_PX`), dan di panggung yang tinggi menggesernya ke bawah sebesar setengah ruang sisa supaya tutup yang terbuka punya ruang di atasnya.
- Dimuat lewat `GreenhouseView.tsx` (`next/dynamic`, `ssr: false`).

### Transisi halaman
Navigasi halaman memakai View Transitions API (`lib/transition.ts`): halaman tujuan memanggil `transitionReady()` setelah canvas 3D menggambar frame pertamanya. Logo `Brand` besar di daftar node (`<Brand large />`) dan kecil di navigasi dashboard; `.brand-in` di dalamnya membawa `view-transition-name: brand` (bukan tautannya, yang direnggangkan oleh flex navigasi) sehingga logo mengecil/membesar dengan mulus antar halaman. Kedua halaman memakai `max-width: 1480px` yang sama (`.page, .dash`) supaya logo tetap di tempatnya; viewBox SVG logo dipangkas sesuai gambarnya.

## Styling
CSS biasa di `app/globals.css` (tanpa Tailwind/CSS modules). Font Inter dimuat dengan `next/font` di `app/layout.tsx` (`--font-sans`), sehingga bobot tipis dan angka tabular tampil sama di semua OS. Design token ada di `:root`, dan gaya visualnya kartu "kaca" buram di atas latar abu-hijau terang. Primitif UI bersama (`MetricCard`, kontrol segmen `Seg`, `Brand`) ada di `components/ui.tsx`.
