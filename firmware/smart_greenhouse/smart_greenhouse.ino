/*
  Smart Mini-Greenhouse — firmware ESP32

  Pin (sesuai hardware contract):
    GPIO 34  Capacitive soil moisture sensor (analog, ADC1)
    GPIO 13  DHT22 (suhu & kelembapan udara)
    GPIO 14  Relay IN → pompa 5 V
    GPIO 18  Servo MG996R (tutup atap: close / open / maintenance)

  Library (Arduino IDE → Library Manager):
    - DHT sensor library (Adafruit) + Adafruit Unified Sensor
    - ESP32Servo (Kevin Harrington)
    - ArduinoJson (Benoit Blanchon) v7
    - PubSubClient (Nick O'Leary) — MQTT, hanya dipakai kalau MQTT_HOST diisi di config.h
  Board: "ESP32 Dev Module" (esp32 by Espressif).

  Alur:
    - Sensor dibaca terus, dihaluskan (EMA).
    - Mode otomatis: tanah < ambang → pompa 1 dosis → tunggu meresap → baca ulang.
      Dosis per jam dibatasi (stop rule). Suhu/RH tinggi → tutup dibuka (hysteresis).
    - Tiap ~3 s ESP32 POST ke /api/ingest; balasan berisi setting terbaru + perintah web.
    - MQTT (opsional): state live ke <prefix>/<id>/state, status online/offline (LWT),
      perintah dari <prefix>/<id>/cmd dan setting dari <prefix>/<id>/settings seketika.
      HTTP tetap jalan sebagai penyimpan data dan cadangan; perintah yang sama tidak dijalankan dua kali.
    - Semua logika keselamatan jalan lokal, tetap bekerja walau WiFi putus.
*/

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <ESP32Servo.h>
#include <PubSubClient.h>
#include "esp_timer.h"
#include "esp_system.h"
#include "config.h"

// MQTT opsional: config.h lama (tanpa baris MQTT) tetap bisa di-compile, MQTT nonaktif.
#ifndef MQTT_HOST
#define MQTT_HOST ""
#endif
#ifndef MQTT_PORT
#define MQTT_PORT 8883
#endif
#ifndef MQTT_USER
#define MQTT_USER ""
#endif
#ifndef MQTT_PASS
#define MQTT_PASS ""
#endif
#ifndef MQTT_TOPIC_PREFIX
#define MQTT_TOPIC_PREFIX "greenhouse"
#endif

// ───────────────────────── Pin & konstanta tetap ─────────────────────────
constexpr int PIN_SOIL  = 34;
constexpr int PIN_DHT   = 13;
constexpr int PIN_RELAY = 14;
constexpr int PIN_SERVO = 18;

constexpr uint32_t PUMP_HARD_MAX_MS  = 10000;  // batas mutlak 1x pompa menyala, tidak bisa diubah dari web
constexpr uint32_t POLL_INTERVAL_MS  = 3000;   // sync ke server (ambil perintah)
constexpr uint32_t MQTT_RETRY_MS     = 10000;  // jeda sambung ulang broker (connect TLS bisa memblokir 1–3 s)
constexpr uint32_t MQTT_CHECK_MS     = 250;    // seberapa sering state dicek untuk dikirim
constexpr uint32_t MQTT_SENSOR_MS    = 2000;   // perubahan nilai sensor saja dikirim paling cepat tiap sekian ms
constexpr uint32_t MQTT_STATE_MS     = 10000;  // heartbeat: state tetap dikirim minimal sekian ms walau tidak berubah
// Hemat kuota broker gratis (mis. EMQX Serverless 1 GB/bulan): aktuator seketika, sensor ≤ 1 pesan / 2 s.
constexpr uint32_t DHT_INTERVAL_MS   = 2500;   // DHT22 maks 1x per 2 detik
constexpr uint32_t SOIL_INTERVAL_MS  = 1000;
constexpr uint32_t SERVO_HOLD_MS     = 600;    // jeda setelah sampai sebelum HTTP boleh jalan lagi (servo TIDAK di-detach)
constexpr uint32_t SERVO_STEP_MS     = 15;     // kecepatan servo tetap: 15 ms per 1° (bertahap agar tutup tidak terbanting dan arus servo tidak melonjak)
constexpr int      SOIL_RAW_MIN_OK   = 100;    // di luar rentang ini = sensor lepas/korslet
constexpr int      SOIL_RAW_MAX_OK   = 4000;
constexpr int      DHT_MAX_FAILS     = 3;      // NaN berturut-turut sebelum dianggap invalid
constexpr float    EMA_ALPHA         = 0.3f;
constexpr int      LID_MAX_SWING     = 90;     // sudut maks dari posisi tertutup (maintenance = 90°)
constexpr uint32_t HTTP_TIMEOUT_MS = 8000;   // HTTPS + cold start Vercel
constexpr uint32_t LID_OVERRIDE_MS   = 120000; // perintah tutup dari Serial: mode otomatis menunggu 2 menit
constexpr uint32_t BOOT_GRACE_MS     = 30000;  // 30 s pertama setelah boot: tidak ada penyiraman otomatis (cegah restart berulang)

#ifndef RELAY_ACTIVE_LOW
#define RELAY_ACTIVE_LOW true
#endif

// ───────────────────────── Setting (dari server, disimpan di NVS) ─────────────────────────
struct Settings {
  int32_t  manual          = 0;      // semua field 4 byte → tanpa padding (aman untuk memcmp/NVS)
  int      soilDryPct      = 35;
  uint32_t doseMs          = 3000;
  uint32_t soakS           = 60;
  int      maxDosesPerHour = 6;
  float    tempOpen        = 32, tempClose = 29;
  float    humOpen         = 90, humClose  = 80;
  int      lidClosedDeg    = 90, lidOpenDeg = 135, lidMaintDeg = 180;
  int      soilRawDry      = 3000, soilRawWet = 1300;
  uint32_t reportIntervalS = 10;
};
Settings S;
Preferences prefs;

// ───────────────────────── State ─────────────────────────
DHT dht(PIN_DHT, DHT22);
Servo servo;

int   soilRaw = -1;   float soilPct = NAN;  bool soilValid = false;
float tempC = NAN;    float humPct = NAN;   bool dhtValid = false;  int dhtFails = 0;

volatile bool pumpOn = false;
volatile bool pumpTimerFired = false;
uint32_t pumpStartMs = 0;
const char* pumpTrigger = "auto";
esp_timer_handle_t pumpTimer;
uint32_t lastDoseEndMs = 0;  bool dosedOnce = false;
uint32_t doseLog[30];        int doseLogN = 0;   // waktu dosis otomatis (untuk stop rule)
bool tankWarning = false;
bool autoPumpPaused = false;   // 'auto off' di Serial: penyiraman otomatis dijeda (tidak disimpan, kembali aktif setelah restart)

enum LidPos { LID_CLOSED, LID_OPEN, LID_MAINT };
LidPos lidPos = LID_CLOSED;
const char* lidName(LidPos p) { return p == LID_OPEN ? "open" : p == LID_MAINT ? "maintenance" : "closed"; }
int lidAngle(LidPos p) { return p == LID_OPEN ? S.lidOpenDeg : p == LID_MAINT ? S.lidMaintDeg : S.lidClosedDeg; }
int  servoPos = -1, servoTarget = -1;
bool servoAttached = false;
uint32_t servoLastStep = 0, servoArrivedMs = 0;
uint32_t lastSettingsMs = 0;   // kapan setting terakhir diterima dari server (0 = belum pernah sejak boot)
uint32_t lidOverrideUntil = 0;   // millis() sampai kapan kontrol otomatis tutup ditahan

bool stateChanged = true;   // kirim reading segera di sync berikutnya
uint32_t lastPollMs = 0, lastReportMs = 0, lastDhtMs = 0, lastSoilMs = 0;
bool netEnabled = strlen(WIFI_SSID) > 0;

// ───────────────────────── Antrean event → cloud ─────────────────────────
struct Event { const char* actuator; const char* action; float value; const char* trigger; uint32_t atMs; const char* reason; };
constexpr int EVQ = 24;
Event evq[EVQ]; int evN = 0;

void logEvent(const char* actuator, const char* action, float value, const char* trigger, const char* reason = nullptr) {
  if (evN == EVQ) { memmove(evq, evq + 1, sizeof(Event) * (EVQ - 1)); evN--; }  // buang yang paling lama
  evq[evN++] = { actuator, action, value, trigger, millis(), reason };
  stateChanged = true;
  Serial.printf("[event] %s %s %.0f (%s)%s%s\n", actuator, action, value, trigger, reason ? " " : "", reason ? reason : "");
}

// ───────────────────────── Pompa ─────────────────────────
inline void relayWrite(bool on) { digitalWrite(PIN_RELAY, (on != RELAY_ACTIVE_LOW) ? HIGH : LOW); }

// Timer hardware: mematikan relay tepat waktu walaupun loop() sedang tertahan (mis. HTTP lambat).
void onPumpTimer(void*) {   // dijalankan task esp_timer, bukan ISR
  relayWrite(false);
  pumpTimerFired = true;
}

void startPump(uint32_t ms, const char* trigger) {
  if (pumpOn) return;
  ms = constrain(ms, 200UL, PUMP_HARD_MAX_MS);
  pumpTrigger = trigger;
  pumpStartMs = millis();
  pumpTimerFired = false;
  pumpOn = true;
  relayWrite(true);
  esp_timer_start_once(pumpTimer, (uint64_t)ms * 1000ULL);
  stateChanged = true;
  Serial.printf("[pump] ON %lu ms (%s)\n", (unsigned long)ms, trigger);
}

void stopPump(const char* reason = nullptr) {
  if (!pumpOn) return;
  esp_timer_stop(pumpTimer);
  relayWrite(false);
  pumpOn = false;
  uint32_t dur = millis() - pumpStartMs;
  lastDoseEndMs = millis();
  dosedOnce = true;
  logEvent("pump", "run", dur, pumpTrigger);
  if (reason) logEvent("system", "safety", dur, "safety", reason);
}

int dosesLastHour() {
  uint32_t now = millis(); int n = 0;
  for (int i = 0; i < doseLogN; i++) if (now - doseLog[i] < 3600000UL) n++;
  return n;
}

void recordAutoDose() {
  // buang entri > 1 jam, lalu tambah yang baru
  uint32_t now = millis(); int j = 0;
  for (int i = 0; i < doseLogN; i++) if (now - doseLog[i] < 3600000UL) doseLog[j++] = doseLog[i];
  doseLogN = j;
  if (doseLogN < 30) doseLog[doseLogN++] = now;
}

void updatePump() {
  if (!pumpOn) return;
  if (pumpTimerFired) { stopPump(); return; }
  if (millis() - pumpStartMs > PUMP_HARD_MAX_MS + 500) stopPump("hard timeout");  // cadangan jika timer gagal
}

// ───────────────────────── Servo / tutup ─────────────────────────
int clampLid(int deg) {
  deg = constrain(deg, 0, 180);
  return constrain(deg, S.lidClosedDeg - LID_MAX_SWING, S.lidClosedDeg + LID_MAX_SWING);
}

// Posisi tutup terakhir disimpan di NVS (hanya saat servo sampai, bukan tiap derajat → aman untuk flash).
// Saat boot/restart (mis. brownout) servo ditahan di posisi itu, BUKAN langsung lompat ke 90°.
void saveLidState() {
  int32_t st[2] = { (int32_t)lidPos, (int32_t)servoPos };
  int32_t old[2] = { -1, -1 };
  prefs.getBytes("lid", old, sizeof(old));
  if (memcmp(st, old, sizeof(st)) != 0) prefs.putBytes("lid", st, sizeof(st));
}

bool restoreLidState() {
  int32_t st[2];
  if (prefs.getBytesLength("lid") != sizeof(st)) return false;
  prefs.getBytes("lid", st, sizeof(st));
  if (st[0] < LID_CLOSED || st[0] > LID_MAINT || st[1] < 0 || st[1] > 180) return false;
  lidPos = (LidPos)st[0];
  servoPos = st[1];
  servoGoTo(st[1]);                     // attach + tulis posisi yang sama → servo tidak bergerak
  logEvent("lid", lidPos == LID_OPEN ? "open" : lidPos == LID_MAINT ? "maintenance" : "close", st[1], "boot", "restore");
  return true;
}

void servoGoTo(int deg) {
  servoTarget = clampLid(deg);
  if (!servoAttached) {
    servo.setPeriodHertz(50);
    servo.attach(PIN_SERVO, 500, 2400);
    servoAttached = true;
    if (servoPos >= 0) servo.write(servoPos);   // tahan di posisi sekarang dulu (cegah servo melompat saat attach)
  }
  if (servoPos < 0) {           // boot: posisi asli tidak diketahui, langsung ke target
    servoPos = servoTarget;
    servo.write(servoPos);
  }
  servoArrivedMs = 0;
}

bool servoMoving() {
  return servoAttached && (servoPos != servoTarget || servoArrivedMs == 0 || millis() - servoArrivedMs < SERVO_HOLD_MS);
}

void updateServo() {
  if (!servoAttached) return;
  uint32_t now = millis();
  if (servoPos != servoTarget) {
    if (now - servoLastStep >= SERVO_STEP_MS) {
      servoLastStep = now;
      servoPos += (servoTarget > servoPos) ? 1 : -1;
      servo.write(servoPos);
    }
    return;
  }
  if (servoArrivedMs == 0) { servoArrivedMs = now; saveLidState(); }
  // Servo sengaja TIDAK di-detach: sebagian MG996R meluncur sendiri ke ujung saat sinyal PWM dilepas.
  // Sinyal tetap aktif menahan posisi (juga mencegah tutup melorot karena beratnya sendiri).
}

// Restart karena brownout saat tutup diangkat (maintenance): biasanya servo menahan di luar jangkauan
// mekanisnya (mentok) dan terus menarik arus besar, lalu ESP32 restart berulang. Turunkan 10° ke arah
// tertutup, tapi tidak melewati posisi "terbuka": tutup tetap terangkat (bisa ada tangan di dalam kotak).
// Perbaikan sebenarnya: kurangi sudut maintenance di web (popup Servo tutup) dan perkuat catu daya.
void brownoutBackoff() {
  int dir = S.lidClosedDeg > servoPos ? 1 : -1;
  int target = servoPos + dir * 10;
  if ((dir < 0 && target < S.lidOpenDeg) || (dir > 0 && target > S.lidOpenDeg)) target = S.lidOpenDeg;
  target = clampLid(target);
  if (target == servoPos) return;
  Serial.printf("[safety] brownout saat maintenance: servo %d° → %d°. Kurangi sudut maintenance di web.\n", servoPos, target);
  servoGoTo(target);
  logEvent("lid", "maintenance", target, "safety", "brownout backoff");
}

void setLid(LidPos p, const char* trigger) {
  int target = lidAngle(p);
  bool changed = (p != lidPos) || (clampLid(target) != servoTarget);
  lidPos = p;
  servoGoTo(target);
  if (changed) logEvent("lid", p == LID_OPEN ? "open" : p == LID_MAINT ? "maintenance" : "close", clampLid(target), trigger);
}

// ───────────────────────── Sensor ─────────────────────────
void readSoil() {
  long sum = 0;
  for (int i = 0; i < 16; i++) sum += analogRead(PIN_SOIL);
  soilRaw = sum / 16;
  soilValid = soilRaw >= SOIL_RAW_MIN_OK && soilRaw <= SOIL_RAW_MAX_OK && S.soilRawDry != S.soilRawWet;
  if (!soilValid) { soilPct = NAN; return; }
  float pct = 100.0f * (S.soilRawDry - soilRaw) / (float)(S.soilRawDry - S.soilRawWet);
  pct = constrain(pct, 0.0f, 100.0f);
  soilPct = isnan(soilPct) ? pct : soilPct + EMA_ALPHA * (pct - soilPct);
}

void readDht() {
  float t = dht.readTemperature(), h = dht.readHumidity();
  if (isnan(t) || isnan(h)) {
    if (++dhtFails >= DHT_MAX_FAILS && dhtValid) { dhtValid = false; tempC = humPct = NAN; stateChanged = true; }
    return;
  }
  dhtFails = 0;
  if (!dhtValid) { tempC = t; humPct = h; dhtValid = true; stateChanged = true; return; }
  tempC += EMA_ALPHA * (t - tempC);
  humPct += EMA_ALPHA * (h - humPct);
}

// ───────────────────────── Logika otomatis ─────────────────────────
void autoControl() {
  if (S.manual) return;

  // Ventilasi dengan hysteresis (tidak berlaku saat maintenance / sesaat setelah perintah manual dari Serial)
  bool lidOverride = lidOverrideUntil && (int32_t)(millis() - lidOverrideUntil) < 0;
  if (dhtValid && lidPos != LID_MAINT && !lidOverride) {
    bool tooHot = tempC >= S.tempOpen || humPct >= S.humOpen;
    bool okAgain = tempC <= S.tempClose && humPct <= S.humClose;
    if (lidPos == LID_CLOSED && tooHot) setLid(LID_OPEN, "auto");
    else if (lidPos == LID_OPEN && okAgain) setLid(LID_CLOSED, "auto");
  }

  // Sensor invalid → pompa otomatis berhenti, tidak ada dosis baru
  if (!soilValid || !dhtValid) {
    if (pumpOn && strcmp(pumpTrigger, "auto") == 0) stopPump(!soilValid ? "soil sensor invalid" : "DHT22 invalid");
    return;
  }

  if (tankWarning && soilPct >= S.soilDryPct + 5) { tankWarning = false; stateChanged = true; }
  if (pumpOn || soilPct >= S.soilDryPct) return;
  if (millis() < BOOT_GRACE_MS) return;   // beri waktu setelah boot (dan waktu membuka Serial Monitor)
  if (autoPumpPaused) return;             // dijeda dari Serial Monitor ('auto off')
  if (dosedOnce && millis() - lastDoseEndMs < S.soakS * 1000UL) return;   // tunggu meresap

  if (dosesLastHour() >= S.maxDosesPerHour) {
    if (!tankWarning) { tankWarning = true; logEvent("system", "tank_warning", dosesLastHour(), "safety", "max doses/hour reached"); }
    return;
  }
  recordAutoDose();
  startPump(S.doseMs, "auto");
}

// ───────────────────────── Setting: simpan, muat, terapkan ─────────────────────────
void saveSettings() { prefs.putBytes("s", &S, sizeof(S)); }
void loadSettings() {
  if (prefs.getBytesLength("s") == sizeof(S)) prefs.getBytes("s", &S, sizeof(S));
}

void applySettings(JsonObjectConst o) {
  if (o.isNull()) return;
  lastSettingsMs = millis();
  Settings n = S;
  if (o["mode"].is<const char*>()) n.manual = strcmp(o["mode"].as<const char*>(), "manual") == 0 ? 1 : 0;
  if (o["soil_dry_pct"].is<float>())       n.soilDryPct      = o["soil_dry_pct"];
  if (o["dose_ms"].is<float>())            n.doseMs          = std::min<uint32_t>(o["dose_ms"].as<uint32_t>(), PUMP_HARD_MAX_MS);
  if (o["soak_s"].is<float>())             n.soakS           = o["soak_s"];
  if (o["max_doses_per_hour"].is<float>()) n.maxDosesPerHour = o["max_doses_per_hour"];
  if (o["temp_open_c"].is<float>())        n.tempOpen        = o["temp_open_c"];
  if (o["temp_close_c"].is<float>())       n.tempClose       = o["temp_close_c"];
  if (o["hum_open_pct"].is<float>())       n.humOpen         = o["hum_open_pct"];
  if (o["hum_close_pct"].is<float>())      n.humClose        = o["hum_close_pct"];
  if (o["lid_closed_deg"].is<float>())     n.lidClosedDeg    = o["lid_closed_deg"];
  if (o["lid_open_deg"].is<float>())       n.lidOpenDeg      = o["lid_open_deg"];
  if (o["lid_maint_deg"].is<float>())      n.lidMaintDeg     = o["lid_maint_deg"];
  if (o["soil_raw_dry"].is<float>())       n.soilRawDry      = o["soil_raw_dry"];
  if (o["soil_raw_wet"].is<float>())       n.soilRawWet      = o["soil_raw_wet"];
  if (o["report_interval_s"].is<float>())  n.reportIntervalS = o["report_interval_s"];

  bool modeChanged = n.manual != S.manual;
  bool lidAnglesChanged = n.lidClosedDeg != S.lidClosedDeg || n.lidOpenDeg != S.lidOpenDeg || n.lidMaintDeg != S.lidMaintDeg;
  bool any = memcmp(&n, &S, sizeof(S)) != 0;
  if (!any) return;

  S = n;
  saveSettings();
  stateChanged = true;
  Serial.println("[settings] diperbarui dari server");
  if (modeChanged) logEvent("mode", S.manual ? "manual" : "auto", 0, "web");
  if (lidAnglesChanged) servoGoTo(lidAngle(lidPos));   // kalibrasi: servo ikut sudut baru
}

// Perintah bisa datang dua kali (MQTT seketika + HTTP sync sebagai cadangan), dan setelah restart HTTP bisa
// mengantar ulang perintah yang sudah dijalankan lewat MQTT. Id perintah di database selalu naik, jadi id
// terbesar yang sudah dijalankan disimpan di NVS: id yang sama atau lebih lama dilewati (yang terbaru berlaku).
int32_t lastCmdId = 0;   // dimuat dari NVS di setup()
bool commandSeen(long id) {
  if (id <= 0) return false;
  // Selisih sangat besar = database baru (id mulai dari 1 lagi): terima dan mulai hitung ulang.
  if (id <= lastCmdId && lastCmdId - id < 100000) return true;
  lastCmdId = id;
  prefs.putInt("cmd", lastCmdId);
  return false;
}

void runCommand(JsonObjectConst c) {
  if (commandSeen(c["id"] | 0L)) return;
  const char* type = c["type"] | "";
  const char* pos = c["payload"]["position"] | "";
  // Maintenance boleh di mode apa pun
  if (strcmp(type, "lid") == 0 && strcmp(pos, "maintenance") == 0) { setLid(LID_MAINT, "web"); return; }
  if (strcmp(type, "lid") == 0 && strcmp(pos, "exit_maintenance") == 0) {
    if (lidPos == LID_MAINT) setLid(LID_CLOSED, "web");
    return;
  }
  if (!S.manual) { Serial.printf("[cmd] %s diabaikan (mode auto)\n", type); return; }
  if (strcmp(type, "pump_dose") == 0) {
    startPump(c["payload"]["ms"] | S.doseMs, "web");
  } else if (strcmp(type, "lid") == 0) {
    if (strcmp(pos, "open") == 0) setLid(LID_OPEN, "web");
    else if (strcmp(pos, "closed") == 0) setLid(LID_CLOSED, "web");
  }
}

// ───────────────────────── Jaringan ─────────────────────────
int lastHttpCode = 0; uint32_t lastHttpMs = 0; bool serverOk = false;
WiFiClientSecure tlsClient;
WiFiClient plainClient;

void addNum(JsonObject o, const char* key, float v, bool valid = true) {
  if (valid && !isnan(v)) o[key] = roundf(v * 10) / 10.0f;
  else o[key] = nullptr;
}

// Isi reading, sama untuk /api/ingest dan topik MQTT state. `liveAngle` = sudut servo saat ini (MQTT,
// supaya tutup di dashboard ikut bergerak); HTTP menyimpan sudut tujuan.
void fillReading(JsonObject r, bool liveAngle) {
  if (soilRaw >= 0) r["soil_raw"] = soilRaw; else r["soil_raw"] = nullptr;
  addNum(r, "soil_pct", soilPct, soilValid);
  addNum(r, "temperature_c", tempC, dhtValid);
  addNum(r, "humidity_pct", humPct, dhtValid);
  r["lid_state"] = lidName(lidPos);
  r["lid_angle"] = liveAngle ? servoPos : servoTarget;
  r["pump_state"] = pumpOn ? "on" : "off";
  r["mode"] = S.manual ? "manual" : "auto";
  r["tank_warning"] = tankWarning;
}

void syncCloud() {
  if (!netEnabled || WiFi.status() != WL_CONNECTED) return;

  uint32_t now = millis();
  bool sendReading = stateChanged || now - lastReportMs >= S.reportIntervalS * 1000UL;

  JsonDocument doc;
  doc["device_id"] = DEVICE_ID;
  if (sendReading) {
    JsonObject r = doc["reading"].to<JsonObject>();
    fillReading(r, false);
    r["rssi"] = WiFi.RSSI();
  }
  int sentEvents = evN;
  JsonArray ev = doc["events"].to<JsonArray>();
  for (int i = 0; i < sentEvents; i++) {
    JsonObject e = ev.add<JsonObject>();
    e["actuator"] = evq[i].actuator;
    e["action"] = evq[i].action;
    e["value"] = evq[i].value;
    e["trigger"] = evq[i].trigger;
    e["age_ms"] = now - evq[i].atMs;
    if (evq[i].reason) e["detail"]["reason"] = evq[i].reason;
  }
  String body;
  serializeJson(doc, body);

  String url = String(SERVER_URL) + "/api/ingest";
  HTTPClient http;
  bool https = url.startsWith("https");
  if (https) { tlsClient.setInsecure(); http.begin(tlsClient, url); }   // prototipe: tanpa verifikasi sertifikat
  else http.begin(plainClient, url);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-key", DEVICE_KEY);

  uint32_t t0 = millis();
  int code = http.POST(body);
  lastHttpCode = code; lastHttpMs = millis() - t0;
  if (code == 200 && !serverOk) Serial.printf("[net] terhubung ke server ✓ (%lu ms)\n", (unsigned long)lastHttpMs);
  serverOk = (code == 200);
  if (code == 200) {
    // hapus event yang sudah terkirim (event baru selama request tetap di antrean)
    memmove(evq, evq + sentEvents, sizeof(Event) * (evN - sentEvents));
    evN -= sentEvents;
    if (sendReading) { lastReportMs = now; stateChanged = false; }

    JsonDocument resp;
    String payload = http.getString();   // getString() juga menangani chunked encoding
    if (!deserializeJson(resp, payload)) {
      applySettings(resp["settings"].as<JsonObjectConst>());
      for (JsonObjectConst c : resp["commands"].as<JsonArrayConst>()) runCommand(c);
    }
  } else {
    Serial.printf("[net] POST gagal: %d %s\n", code, code < 0 ? http.errorToString(code).c_str() : "");
  }
  http.end();
}

// ───────────────────────── MQTT (opsional) ─────────────────────────
// Broker terpisah dari server web. Putus/gagal tidak mengganggu apa pun: HTTP sync tetap jalan.
WiFiClientSecure mqttTls;
PubSubClient mqtt(mqttTls);
const bool mqttEnabled = netEnabled && strlen(MQTT_HOST) > 0;
const String mqttBase = String(MQTT_TOPIC_PREFIX) + "/" + DEVICE_ID + "/";
uint32_t lastMqttTry = 0, lastStateCheck = 0, lastStatePub = 0;
String lastStateSent;   // state terakhir yang dikirim (tanpa rssi), untuk deteksi perubahan
String lastActSent;     // bagian aktuator saja (tutup, pompa, mode, tangki): perubahan ini dikirim seketika

void onMqttMessage(char* topic, byte* payload, unsigned int len) {
  JsonDocument doc;
  if (deserializeJson(doc, (const char*)payload, len)) return;
  String t(topic);
  if (t.endsWith("/settings")) applySettings(doc.as<JsonObjectConst>());
  else if (t.endsWith("/cmd")) runCommand(doc.as<JsonObjectConst>());
}

void ensureMqtt() {
  if (!mqttEnabled || WiFi.status() != WL_CONNECTED) return;
  if (mqtt.connected()) { mqtt.loop(); return; }
  // Connect TLS memblokir loop sebentar: jangan saat pompa menyala / servo bergerak.
  if (pumpOn || servoMoving() || millis() - lastMqttTry < MQTT_RETRY_MS) return;
  lastMqttTry = millis();
  String cid = String("gh-") + DEVICE_ID + "-" + String((uint32_t)ESP.getEfuseMac(), HEX);
  String status = mqttBase + "status";
  bool ok = mqtt.connect(cid.c_str(),
                         strlen(MQTT_USER) ? MQTT_USER : nullptr, strlen(MQTT_PASS) ? MQTT_PASS : nullptr,
                         status.c_str(), 1, true, "offline");   // LWT: broker menulis "offline" kalau ESP32 hilang
  if (!ok) { Serial.printf("[mqtt] gagal terhubung (state %d)\n", mqtt.state()); return; }
  Serial.println("[mqtt] terhubung ✓");
  mqtt.publish(status.c_str(), "online", true);
  mqtt.subscribe((mqttBase + "cmd").c_str(), 1);
  mqtt.subscribe((mqttBase + "settings").c_str(), 1);
  lastStateSent = ""; lastActSent = "";   // kirim state segera
}

// Kirim state: perubahan aktuator seketika (dicek tiap 250 ms, juga saat pompa menyala dan servo bergerak,
// jadi dashboard melihatnya langsung), perubahan sensor paling cepat tiap 2 s, dan heartbeat tiap 10 s.
void publishState() {
  if (!mqtt.connected() || millis() - lastStateCheck < MQTT_CHECK_MS) return;
  uint32_t now = lastStateCheck = millis();
  JsonDocument doc;
  JsonObject r = doc.to<JsonObject>();
  fillReading(r, true);
  String act = String(lidName(lidPos)) + "|" + String(servoPos) + (pumpOn ? "|on" : "|off") +
               (S.manual ? "|m" : "|a") + (tankWarning ? "|t" : "|-");
  String cmp;
  serializeJson(doc, cmp);
  uint32_t since = now - lastStatePub;
  bool due = act != lastActSent                                       // aktuator berubah
          || (cmp != lastStateSent && since >= MQTT_SENSOR_MS)        // sensor berubah
          || since >= MQTT_STATE_MS;                                  // heartbeat
  if (!due) return;
  r["rssi"] = WiFi.RSSI();   // rssi selalu berubah, jadi tidak ikut deteksi perubahan
  String body;
  serializeJson(doc, body);
  if (mqtt.publish((mqttBase + "state").c_str(), body.c_str(), true)) {
    lastStateSent = cmp; lastActSent = act; lastStatePub = now;
  }
}

void ensureWifi() {
  static uint32_t lastTry = 0;
  if (!netEnabled || WiFi.status() == WL_CONNECTED) return;
  if (millis() - lastTry < 10000) return;   // jangan blokir loop; coba ulang tiap 10 s
  lastTry = millis();
  Serial.println("[net] menghubungkan WiFi…");
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

// ───────────────────────── Serial (kalibrasi di meja) ─────────────────────────
void printStatus() {
  Serial.printf("soil raw=%d pct=%.1f valid=%d | T=%.1f RH=%.1f valid=%d\n", soilRaw, soilPct, soilValid, tempC, humPct, dhtValid);
  Serial.printf("pump=%s lid=%s servo=%d (closed=%d open=%d maint=%d) mode=%s doses/h=%d tank_warning=%d\n",
                pumpOn ? "ON" : "off", lidName(lidPos), servoTarget, S.lidClosedDeg, S.lidOpenDeg, S.lidMaintDeg,
                S.manual ? "manual" : "auto", dosesLastHour(), tankWarning);
  Serial.printf("servo pos=%d target=%d | setting server terakhir: ", servoPos, servoTarget);
  if (lastSettingsMs) Serial.printf("%lu s lalu\n", (unsigned long)((millis() - lastSettingsMs) / 1000));
  else Serial.println("belum pernah sejak boot");
  Serial.printf("siram otomatis=%s\n", S.manual ? "mati (mode manual)" : autoPumpPaused ? "DIJEDA (auto off)" : "aktif");
  Serial.printf("wifi=%s rssi=%d queue=%d\n", WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "-", WiFi.RSSI(), evN);
  Serial.printf("server=%s | http terakhir=%d (%lu ms)\n", SERVER_URL, lastHttpCode, (unsigned long)lastHttpMs);
  if (mqttEnabled) Serial.printf("mqtt=%s:%d %s (state %d) topik=%s*\n", MQTT_HOST, MQTT_PORT,
                                 mqtt.connected() ? "terhubung" : "putus", mqtt.state(), mqttBase.c_str());
  else Serial.println("mqtt=nonaktif (MQTT_HOST kosong)");
}

void handleSerial() {
  if (!Serial.available()) return;
  String line = Serial.readStringUntil('\n');
  line.trim();
  if (line == "status" || line == "s") printStatus();
  else if (line == "cal") {
    long sum = 0; for (int i = 0; i < 64; i++) { sum += analogRead(PIN_SOIL); delay(5); }
    Serial.printf("soil raw rata-rata = %ld  (catat saat sensor di udara = kering, di air = basah)\n", sum / 64);
  }
  else if (line.startsWith("pump")) startPump(line.length() > 5 ? line.substring(5).toInt() : S.doseMs, "serial");
  else if (line == "stop") stopPump();
  else if (line == "auto off") { autoPumpPaused = true;  Serial.println("Penyiraman otomatis DIJEDA. 'auto on' untuk mengaktifkan lagi."); }
  else if (line == "auto on")  { autoPumpPaused = false; Serial.println("Penyiraman otomatis AKTIF."); }
  else if (line == "lid open")  { lidOverrideUntil = millis() + LID_OVERRIDE_MS; setLid(LID_OPEN, "serial"); }
  else if (line == "lid close") { lidOverrideUntil = millis() + LID_OVERRIDE_MS; setLid(LID_CLOSED, "serial"); }
  else if (line == "lid mt" || line == "lid maintenance") setLid(LID_MAINT, "serial");
  else if (line == "lid auto")  { lidOverrideUntil = 0; Serial.println("tutup kembali diatur otomatis"); }
  else if (line.startsWith("lid ")) { lidOverrideUntil = millis() + LID_OVERRIDE_MS; int d = line.substring(4).toInt(); servoGoTo(d); Serial.printf("servo → %d° (otomatis ditahan 2 menit)\n", clampLid(d)); }
  else Serial.println("Perintah: status | cal | pump [ms] | stop | auto off | auto on | lid open | lid close | lid mt | lid auto | lid <derajat>");
}

// ───────────────────────── Setup & loop ─────────────────────────
void setup() {
  // Pompa HARUS mati sejak awal: set level OFF sebelum pin jadi output.
  digitalWrite(PIN_RELAY, RELAY_ACTIVE_LOW ? HIGH : LOW);
  pinMode(PIN_RELAY, OUTPUT);
  relayWrite(false);

  Serial.begin(115200);
  delay(200);
  Serial.println("\n== Smart Mini-Greenhouse ==");
  esp_reset_reason_t rr = esp_reset_reason();
  const char* rrs = rr == ESP_RST_POWERON ? "power on" : rr == ESP_RST_BROWNOUT ? "BROWNOUT (daya kurang!)" :
                    rr == ESP_RST_SW ? "software" : rr == ESP_RST_PANIC ? "crash" : rr == ESP_RST_EXT ? "tombol EN" :
                    (rr == ESP_RST_INT_WDT || rr == ESP_RST_TASK_WDT || rr == ESP_RST_WDT) ? "watchdog" : "lain";
  Serial.printf("Alasan restart: %s\n", rrs);

  esp_timer_create_args_t args = {};
  args.callback = &onPumpTimer;
  args.name = "pump";
  esp_timer_create(&args, &pumpTimer);

  prefs.begin("greenhouse", false);
  loadSettings();
  lastCmdId = prefs.getInt("cmd", 0);

  analogReadResolution(12);
  dht.begin();

  ESP32PWM::allocateTimer(0);
  if (!restoreLidState()) setLid(LID_CLOSED, "boot");   // pertama kali: tertutup
  logEvent("system", "boot", (float)rr, "boot", rr == ESP_RST_BROWNOUT ? "brownout" : nullptr);
  if (rr == ESP_RST_BROWNOUT && lidPos == LID_MAINT) brownoutBackoff();

  if (netEnabled) {
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  } else {
    Serial.println("[net] WIFI_SSID kosong → mode offline");
  }
  if (mqttEnabled) {
    mqttTls.setInsecure();              // prototipe: tanpa verifikasi sertifikat (sama dengan HTTP)
    mqtt.setServer(MQTT_HOST, MQTT_PORT);
    mqtt.setCallback(onMqttMessage);
    mqtt.setBufferSize(1024);           // bawaan 256 byte terlalu kecil untuk pesan setting
    mqtt.setKeepAlive(30);
    mqtt.setSocketTimeout(5);
  }
  readSoil();
  Serial.println("Ketik 'status' atau 'cal' di Serial Monitor (115200, Newline).");
}

void loop() {
  uint32_t now = millis();

  updatePump();
  updateServo();
  handleSerial();

  if (now - lastSoilMs >= SOIL_INTERVAL_MS) { lastSoilMs = now; readSoil(); }
  if (now - lastDhtMs >= DHT_INTERVAL_MS)   { lastDhtMs = now;  readDht(); }

  autoControl();
  ensureWifi();
  ensureMqtt();
  publishState();

  // Jangan HTTP saat pompa/servo bergerak: request bisa memblokir loop beberapa detik.
  if (!pumpOn && !servoMoving() && now - lastPollMs >= POLL_INTERVAL_MS) {
    lastPollMs = now;
    syncCloud();
  }
}
