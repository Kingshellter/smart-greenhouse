// MQTT sisi server (opsional). Vercel serverless tidak bisa terus tersambung ke broker,
// jadi server hanya PUBLISH: sambung → kirim → putus, dijalankan lewat after() supaya respons tidak menunggu.
//
// Topik (prefix bawaan "greenhouse", lihat MQTT_TOPIC_PREFIX):
//   <prefix>/<id>/state     ESP32 → semua   state live (sensor, tutup, pompa, mode), JSON, retained
//   <prefix>/<id>/status    ESP32 → semua   "online" / "offline" (LWT), retained
//   <prefix>/<id>/cmd       server → ESP32  perintah {id, type, payload}, sama dengan balasan /api/ingest
//   <prefix>/<id>/settings  server → ESP32  setting lengkap (sama dengan balasan /api/ingest), retained
//
// Env:
//   MQTT_URL                  mqtts://<host>:8883 (dipakai server)
//   MQTT_SERVER_USER/_PASS    akun server: publish
//   MQTT_WS_URL               wss://<host>:8884/mqtt (dipakai browser)
//   MQTT_VIEW_USER/_PASS      akun dashboard: cukup subscribe (terlihat di browser!)
//   MQTT_TOPIC_PREFIX         opsional, bawaan "greenhouse"

import mqtt from "mqtt";
import { SETTINGS_COLUMNS, type Settings } from "@/lib/settings";

export const MQTT_PREFIX = (process.env.MQTT_TOPIC_PREFIX?.trim() || "greenhouse").replace(/\/+$/, "");
export const topic = (deviceId: string, leaf: "state" | "status" | "cmd" | "settings") => `${MQTT_PREFIX}/${deviceId}/${leaf}`;

/** Server bisa publish (perintah/setting langsung sampai ke ESP32 tanpa menunggu sync 3 s). */
export const mqttServerEnabled = () => !!process.env.MQTT_URL?.trim();

type Msg = { topic: string; payload: unknown; retain?: boolean };

/** Kirim beberapa pesan dengan satu koneksi. Gagal = hanya dicatat; HTTP sync tetap jadi cadangan. */
export async function mqttPublish(msgs: Msg[]): Promise<boolean> {
  if (!mqttServerEnabled() || !msgs.length) return false;
  let client: mqtt.MqttClient | null = null;
  try {
    client = await mqtt.connectAsync(process.env.MQTT_URL!.trim(), {
      username: process.env.MQTT_SERVER_USER || undefined,
      password: process.env.MQTT_SERVER_PASS || undefined,
      clientId: `gh-server-${Math.random().toString(16).slice(2, 10)}`,
      connectTimeout: 5000,
      reconnectPeriod: 0, // satu kali coba; jangan menahan fungsi serverless
    });
    for (const m of msgs) {
      await client.publishAsync(m.topic, JSON.stringify(m.payload), { qos: 1, retain: !!m.retain });
    }
    return true;
  } catch (e) {
    console.error(`[mqtt] publish gagal: ${(e as Error).message}`);
    return false;
  } finally {
    await client?.endAsync().catch(() => {});
  }
}

/** Setting yang dikirim ke ESP32: kolom yang sama dengan balasan /api/ingest. */
export const settingsPayload = (row: Record<string, unknown>) =>
  Object.fromEntries(SETTINGS_COLUMNS.map((k) => [k, row[k]])) as Settings;
