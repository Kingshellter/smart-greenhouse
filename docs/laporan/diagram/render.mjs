// Render diagram laporan ke ../gambar/*.png: *.mmd lewat Mermaid (skala 2x), *.svg lewat browser.
// 4-1-proses-bisnis.svg dibuat oleh 4-1-proses-bisnis.py (jalankan dulu bila .py diubah).
// Butuh @mermaid-js/mermaid-cli 11 dan Chrome/Edge terpasang. Mermaid-cli tidak ada di package mana pun
// di repo; pasang di folder lain: PUPPETEER_SKIP_DOWNLOAD=1 npm i @mermaid-js/mermaid-cli@11.4.2
// Pakai: MMDC_HOME=<folder>/node_modules node render.mjs [path ke chrome.exe]
import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "gambar");
const chrome = process.argv[2] || "C:/Program Files/Google/Chrome/Application/chrome.exe";
// Folder node_modules tempat mermaid-cli terpasang (bawaan: ./node_modules)
const nm = process.env.MMDC_HOME || join(here, "node_modules");
const require = createRequire(join(nm, "x.js"));
const mmdc = join(nm, "@mermaid-js", "mermaid-cli", "src", "cli.js");
const puppeteer = require("puppeteer");

const pcfg = join(tmpdir(), "greenhouse-puppeteer.json");
writeFileSync(pcfg, JSON.stringify({ executablePath: chrome, headless: "new" }));

for (const f of readdirSync(here).filter((f) => f.endsWith(".mmd"))) {
  const png = join(out, f.replace(/\.mmd$/, ".png"));
  execFileSync(process.execPath, [mmdc, "-i", join(here, f), "-o", png, "-c", join(here, "mermaid.json"),
    "-p", pcfg, "-b", "white", "-w", "2400", "-s", "2"], { stdio: "inherit" });
  console.log("ok", png);
}

// SVG buatan tangan (swimlane) → PNG lewat browser
const browser = await puppeteer.launch({ executablePath: chrome, headless: "new" });
for (const f of readdirSync(here).filter((f) => f.endsWith(".svg"))) {
  const svg = readFileSync(join(here, f), "utf8");
  const [, w, h] = svg.match(/width="(\d+)" height="(\d+)"/);
  const page = await browser.newPage();
  await page.setViewport({ width: +w, height: +h, deviceScaleFactor: 1.2 });
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  const png = join(out, f.replace(/\.svg$/, ".png"));
  await page.screenshot({ path: png, clip: { x: 0, y: 0, width: +w, height: +h } });
  console.log("ok", png);
}
await browser.close();
