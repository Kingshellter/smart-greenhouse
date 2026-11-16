"""Membuat 4-1-proses-bisnis.svg (swimlane proses bisnis). Jalankan: python 4-1-proses-bisnis.py
Render ke PNG dengan render.mjs di folder yang sama."""
from pathlib import Path

W, H = 2000, 1120
LANES = ["Pengguna", "Dashboard web", "Server API,<br>database + broker", "ESP32", "Sensor &<br>aktuator"]
TOP, LH, LABEL_W, X0, X1 = 86, 201, 242, 14, 1986
COLS = {1: 416, 2: 765, 3: 1114, 4: 1463, 5: 1812}
BW, BH = 268, 88
STYLE = {
    "n": ("#ffffff", "#6b7280"),
    "auto": ("#eff6ff", "#2563eb"),
    "man": ("#f5f3ff", "#7c3aed"),
    "ntf": ("#ecfdf5", "#059669"),
}
ARROW = {"n": "#374151", "man": "#7c3aed", "ntf": "#059669"}

def cy(row): return TOP + LH * row + LH // 2

out = []
def add(s): out.append(s)

def esc(t): return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def box(col, row, title, sub, kind="n"):
    x, y = COLS[col] - BW // 2, cy(row) - BH // 2
    fill, stroke = STYLE[kind]
    add(f'<rect x="{x}" y="{y}" width="{BW}" height="{BH}" rx="12" fill="{fill}" stroke="{stroke}" stroke-width="2.5"/>')
    add(f'<text x="{COLS[col]}" y="{y+36}" class="t">{esc(title)}</text>')
    add(f'<text x="{COLS[col]}" y="{y+64}" class="s">{esc(sub)}</text>')

def line(points, kind="n", label=None, lx=None, ly=None, anchor="start"):
    c = ARROW[kind]
    d = " ".join(f"{'M' if i == 0 else 'L'}{x},{y}" for i, (x, y) in enumerate(points))
    add(f'<path d="{d}" fill="none" stroke="{c}" stroke-width="2.5" marker-end="url(#a-{kind})"/>')
    if label:
        add(f'<text x="{lx}" y="{ly}" class="l" fill="{c}" text-anchor="{anchor}">{esc(label)}</text>')

add(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">')
add("""<style>
 text{font-family:Helvetica,Arial,sans-serif}
 .t{font-size:19px;font-weight:700;fill:#111827;text-anchor:middle}
 .s{font-size:15px;fill:#374151;text-anchor:middle}
 .lane{font-size:19px;font-weight:700;fill:#374151;text-anchor:middle}
 .l{font-size:16px;font-weight:700}
</style>""")
add("<defs>" + "".join(
    f'<marker id="a-{k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{c}"/></marker>'
    for k, c in ARROW.items()) + "</defs>")
add(f'<rect width="{W}" height="{H}" fill="#ffffff"/>')
add('<text x="28" y="40" style="font-size:23px;font-weight:700;fill:#111827">Dua alur utama: otomatis di ESP32 (kiri) dan kendali manual dari dashboard (kanan)</text>')
add('<text x="28" y="70" style="font-size:16px;fill:#374151">Keputusan otomatis tidak menunggu server, sehingga ventilasi dan penyiraman tetap jalan saat internet putus. Perintah manual tiba seketika lewat MQTT, dengan sinkron HTTP sebagai cadangan.</text>')

for i, name in enumerate(LANES):
    y = TOP + LH * i
    add(f'<rect x="{X0}" y="{y}" width="{X1-X0}" height="{LH}" fill="#f8fafc" stroke="#d1d5db" stroke-width="1.5"/>')
    parts = name.split("<br>")
    for j, p in enumerate(parts):
        add(f'<text x="{(X0+LABEL_W)//2}" y="{y + LH//2 + 7 + (j - (len(parts)-1)/2)*24}" class="lane">{esc(p)}</text>')
add(f'<line x1="{LABEL_W}" y1="{TOP}" x2="{LABEL_W}" y2="{TOP+LH*5}" stroke="#d1d5db" stroke-width="1.5"/>')

# Kotak
box(2, 0, "Pantau kondisi", "dashboard / Telegram")
box(4, 0, "Pilih Manual, tekan tombol", "Siram / Buka / Tutup", "man")
box(5, 0, "Melihat hasil", "di dashboard")
box(2, 1, "Tampilkan data", "model 3D, grafik, log")
box(4, 1, "Kirim perintah", "POST /commands", "man")
box(5, 1, "Status terbaru tampil", "Live · MQTT, pending ≤ 25 s")
box(2, 2, "Simpan data", "readings · actuator_events")
box(3, 2, "Kirim notifikasi Telegram", "tangki, sensor, offline, aksi otomatis", "ntf")
box(4, 2, "Simpan & teruskan perintah", "pending + publish MQTT · 60 s", "man")
box(5, 2, "Perbarui status", "state MQTT + readings, event web")
box(1, 3, "Putuskan aksi otomatis", "ambang, histeresis, stop rule", "auto")
box(2, 3, "Kirim data ke server", "POST /api/ingest 3 s + state MQTT")
box(4, 3, "Terima & jalankan perintah", "seketika lewat MQTT; cadangan: sync", "man")
box(5, 3, "Laporkan state baru", "MQTT seketika + reading HTTP")
box(1, 4, "Ukur kondisi", "tanah, suhu, RH (1–2,5 s)")
box(2, 4, "Pompa / servo bergerak", "siram 1 dosis · buka/tutup")
box(4, 4, "Pompa menyiram /", "tutup bergerak")

# Belah ketupat keputusan
dx, dy, hw, hh = COLS[3], cy(0), 124, 62
add(f'<path d="M{dx},{dy-hh} L{dx+hw},{dy} L{dx},{dy+hh} L{dx-hw},{dy} Z" fill="#ffffff" stroke="#6b7280" stroke-width="2.5"/>')
add(f'<text x="{dx}" y="{dy+7}" class="t">Perlu bertindak?</text>')

top = lambda r: cy(r) - BH // 2
bot = lambda r: cy(r) + BH // 2
L = lambda c: COLS[c] - BW // 2
R = lambda c: COLS[c] + BW // 2

# Alur otomatis
line([(COLS[1], top(4)), (COLS[1], bot(3))])
line([(R(1), cy(3)), (L(2), cy(3))])
line([(R(1), cy(3) + 20), (590, cy(3) + 20), (590, cy(4)), (L(2), cy(4))])
line([(COLS[2], top(3)), (COLS[2], bot(2))])
line([(COLS[2], top(2)), (COLS[2], bot(1))])
line([(COLS[2], top(1)), (COLS[2], bot(0))])
line([(R(2), cy(0)), (dx - hw, cy(0))])
line([(dx, dy - hh), (dx, 108), (COLS[2], 108), (COLS[2], top(0))], label="tidak, terus memantau", lx=(dx + COLS[2]) // 2, ly=100, anchor="middle")
line([(dx + hw, cy(0)), (L(4), cy(0))], label="ya", lx=dx + hw + 36, ly=cy(0) - 12)
# Notifikasi
line([(R(2), cy(2)), (L(3), cy(2))], "ntf")
line([(COLS[3], top(2)), (COLS[3], dy + hh)], "ntf", label="pesan Telegram", lx=COLS[3] + 12, ly=cy(1) + 6)
# Alur manual
for r in range(0, 4):
    line([(COLS[4], bot(r)), (COLS[4], top(r + 1))], "man")
line([(R(4), cy(3)), (L(5), cy(3))])
for r in (3, 2, 1):
    line([(COLS[5], top(r)), (COLS[5], bot(r - 1))])
add(f'<text x="{LABEL_W}" y="{bot(4)+30}" style="font-size:16px;fill:#2563eb">hasil aksi terbaca lagi oleh sensor (loop tertutup)</text>')
add("</svg>")

Path(__file__).with_suffix("").with_name("4-1-proses-bisnis.svg").write_text("\n".join(out), encoding="utf-8")
print("ok")
