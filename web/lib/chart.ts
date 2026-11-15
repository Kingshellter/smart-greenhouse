// Warna & gaya grafik bersama: sparkline kartu, grafik riwayat, dan analitik memakai palet yang sama.

export const SERIES = {
  soil: "#18a058",
  soilSoft: "#a9dcbd",
  hum: "#3b82c4",
  temp: "#e07a3f",
  lid: "#d9a12b",
} as const;

export const GRID = "#eef0ec";

/** Props sumbu: tanpa garis sumbu & tick, label kecil abu-abu. */
export const AXIS = { fontSize: 11, stroke: "#9aa197", tickLine: false, axisLine: false } as const;

export const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: "none",
  fontSize: 13,
  boxShadow: "0 10px 30px -10px rgba(16, 24, 14, 0.25)",
};
