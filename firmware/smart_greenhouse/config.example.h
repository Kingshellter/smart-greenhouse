// Salin file ini menjadi config.h (di folder yang sama) lalu isi.
// config.h tidak ikut di-commit ke GitHub (.gitignore).
#pragma once

// WiFi 2.4 GHz (ESP32 tidak bisa 5 GHz). Kosongkan SSID untuk tes offline di breadboard.
#define WIFI_SSID     "nama-wifi"
#define WIFI_PASSWORD "password-wifi"

// URL backend, tanpa garis miring di akhir.
//   Vercel : "https://nama-project.vercel.app"
//   Lokal  : "http://192.168.1.10:3000"  (IP laptop yang menjalankan `npm run dev`)
#define SERVER_URL    "https://nama-project.vercel.app"

// Harus sama dengan baris di tabel devices.
#define DEVICE_ID     "gh-01"
#define DEVICE_KEY    "ganti-dengan-key-rahasia"

// Kebanyakan modul relay 1-channel aktif saat pin LOW.
// Jika pompa malah menyala saat boot / terbalik, ubah ke false.
#define RELAY_ACTIVE_LOW true
