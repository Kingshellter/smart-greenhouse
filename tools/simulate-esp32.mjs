#!/usr/bin/env node
// Simulator ESP32 — untuk menguji backend + dashboard tanpa hardware.
// Memakai protokol yang sama dengan firmware (POST /api/ingest tiap 3 s).
// JANGAN dipakai untuk data presentasi: datanya buatan.
//
//   node tools/simulate-esp32.mjs --url http://localhost:3000 --id gh-01 --key ganti-dengan-key-rahasia

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const URL_ = arg("url", "http://localhost:3000");
const ID = arg("id", "gh-01");
const KEY = arg("key", "ganti-dengan-key-rahasia");

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

async function sync() {
  const now = Date.now();
  const sendReading = stateChanged || now - lastReport >= S.report_interval_s * 1000;
  const sent = events.length;
  const r1 = (x) => Math.round(x * 10) / 10;
  const body = {
    device_id: ID,
    reading: sendReading ? {
      soil_raw: Math.round(S.soil_raw_dry - (soilPct / 100) * (S.soil_raw_dry - S.soil_raw_wet)),
      soil_pct: r1(soilPct), temperature_c: r1(temp), humidity_pct: r1(hum),
      lid_state: lidPos, lid_angle: angle(lidPos),
      pump_state: pumpOn ? "on" : "off", mode: S.mode, tank_warning: tankWarning, rssi: -55 - Math.round(Math.random() * 10),
    } : undefined,
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
    if (data.settings) {
      if (data.settings.mode !== S.mode) log("mode", data.settings.mode, 0, "web");
      S = { ...S, ...data.settings };
    }
    for (const c of data.commands ?? []) {
      console.log(`[cmd] ${c.type} ${JSON.stringify(c.payload)}`);
      const pos = c.payload?.position;
      if (c.type === "lid" && pos === "maintenance") { setLid("maintenance", "web"); continue; }
      if (c.type === "lid" && pos === "exit_maintenance") { if (lidPos === "maintenance") setLid("closed", "web"); continue; }
      if (S.mode !== "manual") continue;
      if (c.type === "pump_dose") startPump(c.payload.ms ?? S.dose_ms, "web");
      if (c.type === "lid" && (pos === "open" || pos === "closed")) setLid(pos, "web");
    }
  } catch (e) {
    console.error(`[net] ${e.message}`);
  }
}

log("system", "boot", 0, "boot");
console.log(`Simulator ${ID} → ${URL_}`);
setInterval(() => { physics(); auto(); }, 1000);
setInterval(() => { if (!pumpOn) sync(); }, 3000);
