#!/usr/bin/env node
// Simulator ESP32 — untuk menguji backend + dashboard tanpa hardware.
// Memakai protokol yang sama dengan firmware (POST /api/ingest tiap 3 s).
// JANGAN dipakai untuk data presentasi: datanya buatan.
//
//   node tools/simulate-esp32.mjs --url http://localhost:3000 --id gh-01 --key ganti-dengan-key-rahasia
// MQTT (opsional, sama dengan firmware): tambahkan
//   --mqtt-url mqtts://<host>:8883 --mqtt-user <akun device> --mqtt-pass <password> [--mqtt-prefix greenhouse]

import { createRequire } from "node:module";

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const URL_ = arg("url", "http://localhost:3000");
const ID = arg("id", "gh-01");
const KEY = arg("key", "ganti-dengan-key-rahasia");
const MQTT_URL = arg("mqtt-url", "");
const MQTT_BASE = `${arg("mqtt-prefix", "greenhouse")}/${ID}/`;

// setting default = default firmware, ditimpa oleh balasan server
let S = { mode: "auto", soil_dry_pct: 35, dose_ms: 3000, soak_s: 60, max_doses_per_hour: 6,
  temp_open_c: 32, temp_close_c: 29, hum_open_pct: 90, hum_close_pct: 80,
  lid_closed_deg: 90, lid_open_deg: 135, soil_raw_dry: 3000, soil_raw_wet: 1300, report_interval_s: 10 };

// "fisika" sederhana
let soilPct = 38, temp = 30, hum = 70;
let lidPos = "closed", pumpOn = false, pumpUntil = 0, pumpStart = 0, pumpTrigger = "auto";
let lastDoseEnd = 0, doses = [], tankWarning = false;
let events = [], stateChanged = true, lastReport = 0;
const t0 = Date.now();

const log = (actuator, action, value, trigger, reason) => {
  events.push({ actuator, action, value, trigger, at: Date.now(), reason });
  stateChanged = true;
  console.log(`[event] ${actuator} ${action} ${value ?? ""} (${trigger})`);
};
const angle = (p) => (p === "open" ? S.lid_open_deg : p === "maintenance" ? S.lid_maint_deg ?? 180 : S.lid_closed_deg);
const setLid = (p, trigger) => {
  if (p === lidPos) return;
  lidPos = p;
  log("lid", p === "closed" ? "close" : p, angle(p), trigger);
};
const lidOpen = () => lidPos !== "closed";
const startPump = (ms, trigger) => {
  if (pumpOn) return;
  pumpOn = true; pumpStart = Date.now(); pumpUntil = pumpStart + Math.min(ms, 10000); pumpTrigger = trigger;
  stateChanged = true;
};

function physics() {
  const now = Date.now();
  const hour = ((now - t0) / 60000) % 24;                // 1 menit simulasi ≈ 1 "jam" siklus suhu
  const ambient = 30 + 5 * Math.sin((hour / 24) * 2 * Math.PI);
  temp += (ambient + (lidOpen() ? -2 : 2) - temp) * 0.05 + (Math.random() - 0.5) * 0.3;
  hum += ((lidOpen() ? 65 : 82) - hum) * 0.05 + (Math.random() - 0.5);
  soilPct -= 0.15 + Math.random() * 0.05;                // tanah mengering
  if (pumpOn) soilPct += 1.2;                            // air masuk
  soilPct = Math.max(0, Math.min(100, soilPct));
  if (pumpOn && now >= pumpUntil) {
    pumpOn = false; lastDoseEnd = now;
    log("pump", "run", now - pumpStart, pumpTrigger);
  }
}

function auto() {
  if (S.mode !== "auto") return;
  if (lidPos === "closed" && (temp >= S.temp_open_c || hum >= S.hum_open_pct)) setLid("open", "auto");
  else if (lidPos === "open" && temp <= S.temp_close_c && hum <= S.hum_close_pct) setLid("closed", "auto");

  if (tankWarning && soilPct >= S.soil_dry_pct + 5) { tankWarning = false; stateChanged = true; }
  if (pumpOn || soilPct >= S.soil_dry_pct) return;
  if (lastDoseEnd && Date.now() - lastDoseEnd < S.soak_s * 1000) return;
  doses = doses.filter((t) => Date.now() - t < 3600_000);
  if (doses.length >= S.max_doses_per_hour) {
    if (!tankWarning) { tankWarning = true; log("system", "tank_warning", doses.length, "safety", "max doses/hour reached"); }
    return;
  }
  doses.push(Date.now());
  startPump(S.dose_ms, "auto");
}

const r1 = (x) => Math.round(x * 10) / 10;
// Isi reading, sama untuk /api/ingest dan topik MQTT state (seperti fillReading() di firmware)
const reading = () => ({
  soil_raw: Math.round(S.soil_raw_dry - (soilPct / 100) * (S.soil_raw_dry - S.soil_raw_wet)),
  soil_pct: r1(soilPct), temperature_c: r1(temp), humidity_pct: r1(hum),
  lid_state: lidPos, lid_angle: angle(lidPos),
  pump_state: pumpOn ? "on" : "off", mode: S.mode, tank_warning: tankWarning,
});

function applySettings(s) {
  if (!s) return;
  if (s.mode && s.mode !== S.mode) log("mode", s.mode, 0, "web");
  S = { ...S, ...s };
}

// Perintah bisa datang dua kali (MQTT + HTTP): id yang sudah dijalankan dilewati, sama dengan firmware.
const doneCmds = [];
function runCommand(c) {
  if (c.id > 0) {
    if (doneCmds.includes(c.id)) return;
    doneCmds.push(c.id);
    if (doneCmds.length > 16) doneCmds.shift();
  }
  console.log(`[cmd] ${c.type} ${JSON.stringify(c.payload)}`);
  const pos = c.payload?.position;
  if (c.type === "lid" && pos === "maintenance") return setLid("maintenance", "web");
  if (c.type === "lid" && pos === "exit_maintenance") { if (lidPos === "maintenance") setLid("closed", "web"); return; }
  if (S.mode !== "manual") return;
  if (c.type === "pump_dose") startPump(c.payload.ms ?? S.dose_ms, "web");
  if (c.type === "lid" && (pos === "open" || pos === "closed")) setLid(pos, "web");
}

async function sync() {
  const now = Date.now();
  const sendReading = stateChanged || now - lastReport >= S.report_interval_s * 1000;
  const sent = events.length;
  const body = {
    device_id: ID,
    reading: sendReading ? { ...reading(), rssi: -55 - Math.round(Math.random() * 10) } : undefined,
    events: events.map((e) => ({ actuator: e.actuator, action: e.action, value: e.value, trigger: e.trigger,
      age_ms: now - e.at, ...(e.reason ? { detail: { reason: e.reason } } : {}) })),
  };
  try {
    const res = await fetch(`${URL_}/api/ingest`, {
      method: "POST", headers: { "content-type": "application/json", "x-device-key": KEY }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return console.error(`[net] ${res.status} ${data.error}`);
    events = events.slice(sent);
    if (sendReading) { lastReport = now; stateChanged = false; }
    applySettings(data.settings);
    for (const c of data.commands ?? []) runCommand(c);
  } catch (e) {
    console.error(`[net] ${e.message}`);
  }
}

// ── MQTT (opsional) ─────────────────────────────────────────────────────────
let mqttClient = null, lastStateSent = "", lastActSent = "", lastStatePub = 0;
if (MQTT_URL) {
  // mqtt dipasang di web/node_modules (simulator dijalankan dari web/ lewat `npm run simulate`)
  const require = createRequire(new URL("../web/package.json", import.meta.url));
  const mqtt = require("mqtt");
  mqttClient = mqtt.connect(MQTT_URL, {
    username: arg("mqtt-user", undefined), password: arg("mqtt-pass", undefined),
    clientId: `gh-sim-${ID}-${Math.random().toString(16).slice(2, 8)}`,
    will: { topic: MQTT_BASE + "status", payload: "offline", qos: 1, retain: true },
    reconnectPeriod: 5000,
  });
  mqttClient.on("connect", () => {
    console.log(`[mqtt] terhubung → ${MQTT_URL} (${MQTT_BASE}*)`);
    mqttClient.publish(MQTT_BASE + "status", "online", { qos: 1, retain: true });
    mqttClient.subscribe([MQTT_BASE + "cmd", MQTT_BASE + "settings"], { qos: 1 });
    lastStateSent = lastActSent = "";
  });
  mqttClient.on("error", (e) => console.error(`[mqtt] ${e.message}`));
  mqttClient.on("message", (topic, buf) => {
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch { return; }
    if (topic.endsWith("/settings")) applySettings(msg);
    else if (topic.endsWith("/cmd")) runCommand(msg);
  });
}
// Seperti publishState() di firmware: aktuator berubah → seketika, sensor berubah → paling cepat tiap 2 s,
// heartbeat tiap 10 s.
function publishState() {
  if (!mqttClient?.connected) return;
  const r = reading();
  const cmp = JSON.stringify(r);
  const act = [r.lid_state, r.lid_angle, r.pump_state, r.mode, r.tank_warning].join("|");
  const since = Date.now() - lastStatePub;
  if (act === lastActSent && !(cmp !== lastStateSent && since >= 2000) && since < 10_000) return;
  mqttClient.publish(MQTT_BASE + "state", JSON.stringify({ ...r, rssi: -55 - Math.round(Math.random() * 10) }), { retain: true });
  lastStateSent = cmp;
  lastActSent = act;
  lastStatePub = Date.now();
}

log("system", "boot", 0, "boot");
console.log(`Simulator ${ID} → ${URL_}${MQTT_URL ? ` + MQTT ${MQTT_URL}` : ""}`);
setInterval(() => { physics(); auto(); publishState(); }, 1000);
setInterval(() => { if (!pumpOn) sync(); }, 3000);
