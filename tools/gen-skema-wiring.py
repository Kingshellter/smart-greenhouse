W, H = 1260, 960
from html import escape as E
o = []
a = o.append
SIG = "#2563eb"; RED = "#dc2626"; ORG = "#ea8a0c"; BLK = "#111827"; GRY = "#6b7280"
a(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Helvetica, Arial, sans-serif">')
a(f'<rect width="{W}" height="{H}" fill="#ffffff"/>')
a('<text x="40" y="52" font-size="26" font-weight="700" fill="#111827">Skema Wiring Smart Mini-Greenhouse (ESP32)</text>')
a('<text x="40" y="80" font-size="15" fill="#4b5563">Mode tes breadboard: ESP32 dari USB laptop, aktuator dari adaptor 5V. Label sama = tersambung.</text>')

def wire(pts, color=SIG, w=3):
    d = "M" + " L".join(f"{x} {y}" for x, y in pts)
    a(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" stroke-linejoin="round" stroke-linecap="round"/>')
def dot(x, y, c=BLK, r=4.5): a(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{c}"/>')
def gnd(x, y):  # ground symbol, stem from (x,y) down
    a(f'<path d="M{x} {y} V{y+10} M{x-12} {y+10} H{x+12} M{x-8} {y+15} H{x+8} M{x-4} {y+20} H{x+4}" stroke="{BLK}" stroke-width="2.2" fill="none"/>')
def tag(x, y, text, color, side="right"):
    w = 9 * len(text) + 16
    x0 = x if side == "right" else x - w
    a(f'<rect x="{x0}" y="{y-12}" width="{w}" height="24" rx="5" fill="{color}"/>')
    a(f'<text x="{x0 + w/2}" y="{y+5}" font-size="13" font-weight="700" fill="#fff" text-anchor="middle">{text}</text>')
def box(x, y, w, h, title, sub, fill="#f0fdf4", stroke="#16a34a", sub_y=None):
    a(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')
    a(f'<text x="{x+14}" y="{y+24}" font-size="16" font-weight="700" fill="#111827">{E(title)}</text>')
    sy0 = sub_y if sub_y is not None else y + 46
    for i, t in enumerate(sub):
        a(f'<text x="{x+w/2}" y="{sy0+i*17}" font-size="12.5" fill="#4b5563" text-anchor="middle">{E(t)}</text>')
def pin(x, y, label, side):  # side = which edge of component ('r' or 'l')
    dot(x, y, BLK, 4)
    if side == "r": a(f'<text x="{x-10}" y="{y+4}" font-size="12.5" font-weight="700" fill="#111827" text-anchor="end">{label}</text>')
    else: a(f'<text x="{x+10}" y="{y+4}" font-size="12.5" font-weight="700" fill="#111827">{label}</text>')

# ---- ESP32 board ----
BX0, BX1, P0, PS = 580, 780, 200, 32
left = ["EN","VP","VN","GPIO34","GPIO35","GPIO32","GPIO33","GPIO25","GPIO26","GPIO27","GPIO14","GPIO12","GPIO13","GND","VIN"]
right = ["GPIO23","GPIO22","TX0","RX0","GPIO21","GPIO19","GPIO18","GPIO5","TX2","RX2","GPIO4","GPIO2","GPIO15","GND","3V3"]
used = {"GPIO34","GPIO14","GPIO13","GND","VIN","GPIO18","3V3"}
LY = {n: P0 + PS*i for i, n in enumerate(left)}
RY = {n: P0 + PS*i for i, n in enumerate(right)}
a(f'<rect x="{BX0}" y="120" width="{BX1-BX0}" height="{P0+PS*14+28-120}" rx="12" fill="#1f2937"/>')
a(f'<rect x="{BX0+30}" y="128" width="{BX1-BX0-60}" height="44" rx="4" fill="#374151"/>')
a(f'<text x="{(BX0+BX1)/2}" y="148" font-size="15" font-weight="700" fill="#fff" text-anchor="middle">ESP32 DevKit V1</text>')
a(f'<text x="{(BX0+BX1)/2}" y="165" font-size="11.5" fill="#d1d5db" text-anchor="middle">30 pin</text>')
for n, y in LY.items():
    u = n in used and not (n == "GND" and False)
    a(f'<circle cx="{BX0+8}" cy="{y}" r="5" fill="{"#fbbf24" if u else "#9ca3af"}"/>')
    a(f'<text x="{BX0+20}" y="{y+4}" font-size="12" font-family="Menlo, monospace" fill="{"#ffffff" if u else "#9ca3af"}" font-weight="{"700" if u else "400"}">{n}</text>')
for n, y in RY.items():
    u = n in used
    a(f'<circle cx="{BX1-8}" cy="{y}" r="5" fill="{"#fbbf24" if u else "#9ca3af"}"/>')
    a(f'<text x="{BX1-20}" y="{y+4}" font-size="12" font-family="Menlo, monospace" fill="{"#ffffff" if u else "#9ca3af"}" font-weight="{"700" if u else "400"}" text-anchor="end">{n}</text>')
by = P0 + PS*14 + 28
a(f'<rect x="{(BX0+BX1)/2-28}" y="{by}" width="56" height="22" rx="3" fill="#9ca3af"/>')
a(f'<text x="{(BX0+BX1)/2}" y="{by+42}" font-size="13" font-weight="700" fill="#111827" text-anchor="middle">USB → laptop (daya + upload)</text>')

# ESP32 power pins
wire([(BX0+8, LY["GND"]), (552, LY["GND"])], BLK, 2.2); gnd(552, LY["GND"])
wire([(BX0+8, LY["VIN"]), (548, LY["VIN"])], GRY, 2.2)
a(f'<path d="M538 {LY["VIN"]-8} l14 16 M552 {LY["VIN"]-8} l-14 16" stroke="{RED}" stroke-width="2.5"/>')
a(f'<text x="530" y="{LY["VIN"]+5}" font-size="13" font-weight="700" fill="{RED}" text-anchor="end">①</text>')
wire([(BX1-8, RY["GND"]), (808, RY["GND"])], BLK, 2.2); gnd(808, RY["GND"])
wire([(BX1-8, RY["3V3"]), (822, RY["3V3"])], ORG, 2.2); tag(822, RY["3V3"], "3V3", ORG)
a(f'<text x="878" y="{RY["3V3"]+5}" font-size="12.5" fill="#4b5563">sumber 3V3 untuk sensor</text>')

# ---- Soil sensor ----
y = LY["GPIO34"]
box(200, y-62, 220, 150, "Soil Moisture v1.2", ["kapasitif, ditancap di pot", "GPIO34 = input analog (ADC1)"], sub_y=y+56)
pin(420, y-28, "VCC", "r"); pin(420, y, "AOUT", "r"); pin(420, y+28, "GND", "r")
wire([(420, y-28), (448, y-28)], ORG, 2.2); tag(448, y-28, "3V3", ORG)
wire([(420, y), (BX0+8, y)])
wire([(420, y+28), (446, y+28)], BLK, 2.2); gnd(446, y+28)

# ---- Relay ----
y = LY["GPIO14"]
box(200, y-44, 220, 156, "Relay 1 channel 5V", ["kontak NC tidak dipakai", "aktif LOW (cek modulnya)"], "#fff7ed", "#ea580c", sub_y=y+82)
pin(420, y, "IN", "r"); pin(420, y+28, "VCC", "r"); pin(420, y+56, "GND", "r")
wire([(420, y), (BX0+8, y)])
wire([(420, y+28), (448, y+28)], RED, 2.2); tag(448, y+28, "5V", RED)
wire([(420, y+56), (446, y+56)], BLK, 2.2); gnd(446, y+56)
pin(200, y, "COM", "l"); pin(200, y+28, "NO", "l"); pin(200, y+56, "NC", "l")
wire([(200, y), (178, y)], RED, 2.2); tag(178, y, "5V", RED, "left")
# pump
py = y + 120
wire([(200, y+28), (110, y+28), (110, py)], RED, 3)
a(f'<rect x="40" y="{py}" width="140" height="78" rx="10" fill="#eff6ff" stroke="#2563eb" stroke-width="2"/>')
a(f'<text x="110" y="{py+30}" font-size="16" font-weight="700" fill="#111827" text-anchor="middle">Pompa 5V</text>')
a(f'<text x="110" y="{py+50}" font-size="12.5" fill="#4b5563" text-anchor="middle">celup di botol air</text>')
dot(110, py, BLK, 4); a(f'<text x="122" y="{py-6}" font-size="12.5" font-weight="700">+</text>')
dot(110, py+78, BLK, 4); a(f'<text x="122" y="{py+94}" font-size="12.5" font-weight="700">−</text>')
wire([(110, py+78), (110, py+92)], BLK, 2.2); gnd(110, py+92)

# ---- DHT22 ----
dy = 704
box(200, dy-30, 220, 136, "DHT22", ["suhu & kelembapan udara", "modul 3 pin (pull-up sudah ada)"], sub_y=dy+82)
pin(420, dy, "DATA", "r"); pin(420, dy+28, "VCC", "r"); pin(420, dy+56, "GND", "r")
wire([(420, dy), (505, dy), (505, LY["GPIO13"]), (BX0+8, LY["GPIO13"])])
wire([(420, dy+28), (448, dy+28)], ORG, 2.2); tag(448, dy+28, "3V3", ORG)
wire([(420, dy+56), (446, dy+56)], BLK, 2.2); gnd(446, dy+56)

# ---- Servo ----
sy = RY["GPIO18"]
box(960, sy-46, 240, 152, "Servo MG996R", ["kabel: oranye · merah · coklat", "dipasang di engsel tutup"], "#fff7ed", "#ea580c", sub_y=sy+82)
a(f'<text x="1186" y="{sy-10}" font-size="16" font-weight="700" fill="#111827" text-anchor="end"></text>')
pin(960, sy, "SIG", "l"); pin(960, sy+28, "+5V", "l"); pin(960, sy+56, "GND", "l")
wire([(BX1-8, sy), (960, sy)])
wire([(960, sy+28), (934, sy+28)], RED, 2.2); tag(934, sy+28, "5V", RED, "left")
wire([(960, sy+56), (934, sy+56)], BLK, 2.2); gnd(934, sy+56)

# capacitor
cx, cy = 1080, 556
tag(cx-22, cy-30, "5V", RED)
wire([(cx, cy-18), (cx, cy)], RED, 2.2)
a(f'<path d="M{cx-18} {cy} H{cx+18}" stroke="{BLK}" stroke-width="3"/>')
a(f'<path d="M{cx-18} {cy+10} Q{cx} {cy+2} {cx+18} {cy+10}" stroke="{BLK}" stroke-width="3" fill="none"/>')
a(f'<text x="{cx-24}" y="{cy-2}" font-size="13" font-weight="700" text-anchor="end">+</text>')
wire([(cx, cy+8), (cx, cy+24)], BLK, 2.2); gnd(cx, cy+24)
a(f'<text x="{cx+30}" y="{cy+4}" font-size="13" font-weight="700" fill="#111827">C 470–1000 µF</text>')
a(f'<text x="{cx+30}" y="{cy+22}" font-size="12" fill="#4b5563">dekat kabel servo</text>')

# adapter
ay = 720
a(f'<rect x="960" y="{ay}" width="240" height="96" rx="10" fill="#f3f4f6" stroke="#374151" stroke-width="2"/>')
a(f'<text x="976" y="{ay+28}" font-size="16" font-weight="700" fill="#111827">Adaptor 5V 3A</text>')
a(f'<text x="976" y="{ay+48}" font-size="12.5" fill="#4b5563">sumber semua label 5V</text>')
pin(960, ay+64, "+", "l"); pin(960, ay+84, "−", "l")
wire([(960, ay+64), (934, ay+64)], RED, 2.2); tag(934, ay+64, "5V", RED, "left")
wire([(960, ay+84), (900, ay+84)], BLK, 2.2); gnd(900, ay+84)

# legend
lx, ly = 880, 120
a(f'<rect x="{lx}" y="{ly}" width="320" height="150" rx="10" fill="#f9fafb" stroke="#e5e7eb"/>')
a(f'<text x="{lx+16}" y="{ly+26}" font-size="14" font-weight="700">Keterangan</text>')
items = [(SIG, "kabel sinyal GPIO"), (RED, "5V dari adaptor"), (ORG, "3V3 dari ESP32"), (BLK, "GND (semua disatukan)")]
for i, (c, t) in enumerate(items):
    yy = ly + 50 + i*24
    a(f'<path d="M{lx+16} {yy} H{lx+56}" stroke="{c}" stroke-width="4" stroke-linecap="round"/>')
    a(f'<text x="{lx+68}" y="{yy+5}" font-size="13" fill="#111827">{t}</text>')

# notes
ny = 860
a(f'<rect x="40" y="{ny}" width="{W-80}" height="82" rx="10" fill="#fef2f2" stroke="#fecaca"/>')
notes = [
 "① VIN TIDAK disambung saat tes (ESP32 dari USB). Di dalam kotak: VIN → 5V, dan cabut kabel itu setiap kali upload lewat USB.",
 "Semua simbol GND tersambung jadi satu: GND adaptor = GND ESP32 = GND sensor/relay/servo/pompa. Semua label 5V ke + adaptor, semua 3V3 ke pin 3V3 ESP32.",
 "Tes pompa pertama kali dengan selang dilepas. Board 38 pin: posisi pin berbeda, ikuti nama GPIO-nya.",
]
for i, t in enumerate(notes):
    a(f'<text x="58" y="{ny+24+i*22}" font-size="13" fill="#7f1d1d">{t}</text>')
a('</svg>')
open("skema_wiring_esp32_greenhouse.svg", "w").write("\n".join(o))
