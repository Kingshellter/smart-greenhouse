"use client";

// Model 3D Smart Mini-Greenhouse — rangka aluminium + kaca, ukuran mengikuti kotak asli (1 unit = 1 cm).
// Kotak 32 × 20 × 20 cm, ruang tanaman kiri (20 cm), ruang elektronik kanan (12 cm).
// Botol air ditempel di luar dinding kanan; selang lurus dengan tekukan membulat menembus dinding kanan
// dan sekat, lalu turun ke tanaman. Tutup ruang tanaman berengsel di tepi belakang dan digerakkan servo;
// tutup ruang elektronik tetap.
//
// Sumbu: X kiri→kanan, Y ke atas, Z belakang→depan (dinding depan di z = +10).

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Html, Lightformer, OrbitControls } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import * as THREE from "three";
import { Icon, type IconName } from "./icons";

/** Keterangan status satu sensor (mis. "Kering", warn = true). */
export type Badge = { text: string; warn: boolean; tone?: "on" | "idle" };
/** Bagian model yang punya titik info; diklik memunculkan kartu keterangan. */
export type HotspotKind = "soil" | "air" | "pump" | "tank" | "lid";

export type GreenhouseState = {
  /** Sudut tutup relatif terhadap posisi tertutup (0 = tertutup). */
  lidDeg: number;
  pumpOn: boolean;
  soilPct: number | null;
  online: boolean;
  tankWarning: boolean;
  /** Kecepatan servo asli (derajat per detik), lihat SERVO_DEG_PER_S. */
  degPerSec: number;
  /** Isi kartu tiap titik info (hotspot). Tanpa ini, model tampil tanpa titik info. */
  cards?: Record<HotspotKind, ReactNode>;
  /** Titik yang kontrolnya sedang terkunci (abu-abu), mis. tutup & pompa di mode otomatis. */
  locked?: Partial<Record<HotspotKind, boolean>>;
  /** Titik yang bagiannya sedang bermasalah (kuning, berdenyut), mis. tangki saat tank_warning. */
  tones?: Partial<Record<HotspotKind, "warn">>;
  interactive?: boolean;
  /** Dipanggil setelah frame pertama tergambar (untuk transisi halaman). */
  onReady?: () => void;
};

const T = 0.3; // tebal akrilik 3 mm

const METAL_P = 0.45; // penampang profil aluminium (cm)

/** Botol air di luar dinding kanan (x = 16), menempel pada rangka; berdiri di lantai. */
const BOTTLE_R = 3.1;
const BOTTLE_X = 16 + METAL_P / 2 + BOTTLE_R + 0.05;
const BOTTLE_Z = 3;

/** Tinggi jalur mendatar selang: di bawah tutup, di atas daun. */
const TUBE_Y = 17;
/** Selang: titik sudut jalur lurus; tiap sudut dibulatkan dengan jari-jari TUBE_BEND. */
const TUBE_POINTS: V3[] = [
  [BOTTLE_X, 1.6, BOTTLE_Z],   // pompa celup di dasar botol
  [BOTTLE_X, TUBE_Y, BOTTLE_Z], // naik keluar lewat tutup botol
  [-2.5, TUBE_Y, BOTTLE_Z],     // mendatar menembus dinding kanan & sekat
  [-2.5, 10, BOTTLE_Z],         // turun ke atas tanaman
];
const TUBE_BEND = 1.6;
/** Titik selang menembus kaca (dinding kanan, sekat); di sini dipasang grommet karet. */
const TUBE_THROUGH = [16 - T / 2, 4];

export default function Greenhouse3D(props: GreenhouseState) {
  const { interactive = true, onReady } = props;
  // Di layar sentuh, model tidak menangkap gesekan jari supaya halaman tetap bisa di-scroll.
  // Zoom roda mouse juga dimatikan supaya scroll halaman tidak "tersangkut" di model.
  const touch = useMemo(() => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches, []);
  const rotate = interactive && !touch;
  // hanya satu kartu hotspot terbuka; klik titik yang sama atau area kosong menutupnya
  const [open, setOpen] = useState<HotspotKind | null>(null);
  // Kartu hotspot dipasang di div ini (di luar kanvas), supaya kartu besar tidak terpotong tepi kanvas.
  const wrap = useRef<HTMLDivElement>(null);
  // Klik di area kosong menutup kartu, tapi akhir gesekan memutar model bukan klik. R3F sudah menyaring geseran
  // ≤ 2 px lewat offsetX, yang tidak selalu andal setelah OrbitControls menangkap pointer; jadi diukur sendiri di sini.
  const down = useRef<[number, number] | null>(null);
  return (
    <div ref={wrap} className={`gh3d ${props.online ? "" : "offline"} ${rotate ? "" : "static"}`}
         onPointerDownCapture={(e) => { down.current = [e.clientX, e.clientY]; }}>
      <Canvas
        camera={{ position: BASE_CAM.toArray(), fov: 28, near: 1, far: 400 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.NeutralToneMapping }}
        onCreated={() => requestAnimationFrame(() => requestAnimationFrame(() => onReady?.()))}
        fallback={<div className="gh3d-fallback">Browser ini tidak mendukung WebGL.</div>}
        onPointerMissed={(e) => {
          const d = down.current;
          if (d && Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 6) return; // model diputar, bukan diklik
          setOpen(null);
        }}
      >
        {/* Environment hanya untuk pantulan (kaca, logam); terang-gelap bentuk datang dari lampu di bawah. */}
        <Environment resolution={256} frames={1} environmentIntensity={0.55}>
          {/* logam butuh pantulan "ruangan", kalau tidak sisi yang tak kena lampu jadi hitam */}
          <color attach="background" args={["#c3c9cc"]} />
          <Lightformer form="rect" intensity={2.4} position={[0, 18, -14]} scale={[40, 10, 1]} />
          <Lightformer form="rect" intensity={1.4} position={[-22, 8, 6]} rotation={[0, Math.PI / 2, 0]} scale={[24, 5, 1]} />
          <Lightformer form="rect" intensity={1.2} position={[22, 10, 4]} rotation={[0, -Math.PI / 2, 0]} scale={[18, 3, 1]} />
          <Lightformer form="ring" intensity={1.6} position={[0, 30, 6]} rotation={[Math.PI / 2, 0, 0]} scale={14} />
        </Environment>
        {/* lampu utama kiri-depan-atas, pengisi kanan, dan cahaya belakang untuk memisahkan siluet */}
        <hemisphereLight args={["#ffffff", "#d8d2c4", 0.9]} />
        <directionalLight position={[-20, 36, 28]} intensity={2.2} color="#fff8ee" />
        <directionalLight position={[26, 14, 10]} intensity={0.55} color="#eef4ff" />
        <directionalLight position={[6, 22, -30]} intensity={0.8} />
        <CameraFit far={!interactive} lidDeg={props.lidDeg} />
        <Scene {...props} portal={wrap} open={open} onToggle={(k) => setOpen((o) => (o === k ? null : k))} />
        <OrbitControls
          target={TARGET.toArray()}
          enablePan={false}
          enableZoom={false}
          enableRotate={rotate}
          enableDamping
          dampingFactor={0.08}
          minDistance={45}
          maxDistance={170}
          minPolarAngle={0.3}
          maxPolarAngle={1.42}
          makeDefault
        />
      </Canvas>
    </div>
  );
}

// Titik pandang digeser sedikit ke kanan dari tengah kotak, karena botol air menambah lebar di sisi kanan.
const BASE_CAM = new THREE.Vector3(-25.5, 24, 50);
const TARGET = new THREE.Vector3(2, 11, 0);

/**
 * Jarak kamera supaya seluruh kotak muat: batas tinggi (tetap) atau batas lebar (layar sempit).
 * Saat tutup diangkat tinggi (maintenance), kamera mundur pelan supaya tutup tidak terpotong.
 * Arah pandang dari pengguna (OrbitControls) dipertahankan; hanya jaraknya yang diatur.
 */
// Lebar model (kotak + botol di kanan) & seberapa jauh tepi bawahnya di bawah TARGET, dalam satuan bidang target,
// dilihat dari BASE_CAM.
const MODEL_W = 43;
const MODEL_BELOW = 19;
const SIDE_MARGIN = 1.25; // ruang kosong di kiri & kanan; kartu hotspot keluar ke arah tengah, jadi tidak butuh banyak
const BOTTOM_ROOM_PX = 68; // ruang di bawah model untuk tombol mode yang mengambang di dasar panggung

function CameraFit({ far, lidDeg }: { far: boolean; lidDeg: number }) {
  const { camera, size } = useThree();
  const first = useRef(true);
  const shift = useRef(0);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const aspect = size.width / Math.max(1, size.height);
    const halfTan = Math.tan(THREE.MathUtils.degToRad(28 / 2));
    const fitWidth = (MODEL_W * (far ? 1 : SIDE_MARGIN)) / (2 * halfTan * aspect);
    // pratinjau kecil (far) ikut mundur sejak tutup mulai terbuka, supaya tutup tidak terpotong
    const lift = Math.max(0, Math.min(1, (lidDeg - (far ? 0 : 30)) / 60));
    const want = Math.max(far ? 70 : 84, fitWidth) * (far ? 1.12 : 1) * (1 + 0.32 * lift);
    tmp.copy(camera.position).sub(TARGET);
    if (first.current) { tmp.copy(BASE_CAM).sub(TARGET); first.current = false; }
    const d = tmp.length();
    const next = Math.abs(want - d) < 0.01 ? want : d + (want - d) * Math.min(1, dt * 3);
    camera.position.copy(TARGET).add(tmp.normalize().multiplyScalar(next));

    // Tombol mode mengambang di dasar panggung: kalau tepi bawah model masuk ke ruang tombol, geser gambar ke atas.
    // Panggung tinggi & sempit: sebaliknya geser ke bawah separuh sisa ruangnya (tetap di atas tombol), supaya
    // ada ruang di atas untuk tutup yang terbuka. Pakai view offset, jadi titik putar orbit tidak berubah.
    if (far) return;
    const hv = 2 * next * halfTan;
    const side = Math.max(0, (hv * aspect - MODEL_W) / 2);
    const belowPx = ((hv / 2 - MODEL_BELOW) / hv) * size.height; // tepi bawah model → dasar panggung, tanpa geser
    const down = Math.max(0, (Math.max(0, hv / 2 - MODEL_BELOW - side) / hv) * size.height - BOTTOM_ROOM_PX);
    const wantPx = belowPx < BOTTOM_ROOM_PX ? belowPx - BOTTOM_ROOM_PX : 0.5 * down;
    const px = Math.abs(wantPx - shift.current) < 0.5 ? wantPx : shift.current + (wantPx - shift.current) * Math.min(1, dt * 4);
    const ox = 0;
    const pcam = camera as THREE.PerspectiveCamera;
    if (px !== shift.current || !pcam.view || pcam.view.offsetX !== ox || pcam.view.fullWidth !== size.width || pcam.view.fullHeight !== size.height) {
      shift.current = px;
      pcam.setViewOffset(size.width, size.height, ox, -px, size.width, size.height);
    }
  });
  return null;
}

type Side = "left" | "right";
/** Arah kartu tumbuh dari titiknya: ke atas (titik rendah), tengah, atau ke bawah (titik tinggi). */
type Grow = "up" | "mid" | "down";

function Scene(props: GreenhouseState & { portal: RefObject<HTMLDivElement | null>; open: HotspotKind | null; onToggle: (k: HotspotKind) => void }) {
  // Label <Html> baru dipasang setelah scene siap; kalau dipasang di render pertama,
  // label pertama kadang kosong (root React-nya belum sempat merender).
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(t);
  }, []);
  const { cards, locked, tones, open, onToggle, portal } = props;
  const spots = ready && cards;
  // Kartu titik di kiri model keluar ke kanan, titik di kanan keluar ke kiri, supaya tidak menutupi tepi panggung.
  const spot = (k: HotspotKind, at: V3, label: string, side: Side, grow: Grow) =>
    spots && (
      <Hotspot key={k} at={at} icon={HOTSPOT_ICON[k]} label={label} side={side} grow={grow} portal={portal} locked={!!locked?.[k]}
               warn={tones?.[k] === "warn"} open={open === k} onToggle={() => onToggle(k)}>
        {cards[k]}
      </Hotspot>
    );
  return (
    <group>
      <GroundShadow />
      <GlassBox />
      <Lid deg={props.lidDeg} degPerSec={props.degPerSec}>
        {spot("lid", [0, 0.8, 12], "Tutup", "right", "down")}
      </Lid>
      <Planter soilPct={props.soilPct} />
      <WaterSystem pumpOn={props.pumpOn} tankWarning={props.tankWarning} />
      {spot("soil", [-9.2, 3.2, 5.9], "Kelembapan tanah", "right", "up")}
      {spot("air", [-16, 17, 3], "Udara", "right", "down")}
      {spot("pump", [10, TUBE_Y, BOTTLE_Z], "Pompa", "left", "down")}
      {spot("tank", [BOTTLE_X, 7, BOTTLE_Z + BOTTLE_R], "Tangki air", "left", "mid")}
    </group>
  );
}

const HOTSPOT_ICON: Record<HotspotKind, IconName> = { soil: "soil", air: "temp", pump: "pump", tank: "tank", lid: "lid" };

/**
 * Titik info datar berikon (hijau; kuning bila bagiannya bermasalah; abu-abu bila kontrolnya terkunci).
 * Nama bagiannya muncul saat kursor di atas titik. Diklik memunculkan kartu yang keluar dari titiknya
 * lewat garis putus-putus; diklik lagi menyembunyikannya.
 */
function Hotspot({ at, icon, label, side, grow, portal, locked, warn, open, onToggle, children }: {
  at: V3; icon: IconName; label: string; side: Side; grow: Grow; portal: RefObject<HTMLDivElement | null>; locked: boolean;
  warn: boolean; open: boolean; onToggle: () => void; children: ReactNode;
}) {
  // Saat dibuka, ukur ruang di kiri/kanan titik: pakai sisi pilihan bila cukup, kalau tidak sisi yang lebih lega,
  // dan sempitkan kartu supaya tidak keluar panggung (penting di layar HP).
  const dot = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ side: Side; line: number; elbow: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const host = portal.current, el = dot.current;
    if (!open || !host || !el) return;
    const h = host.getBoundingClientRect(), d = el.getBoundingClientRect();
    // panggung sempit (HP): tekukan kecil & garis pendek; selain itu garis memanjang hanya kalau kartunya tetap selebar penuh
    const narrow = h.width < 600;
    const elbow = narrow ? 14 : ELBOW, minLine = narrow ? 26 : ELBOW + 16, maxLine = narrow ? 26 : 68;
    const x = d.left + d.width / 2 - h.left;
    const free = (sd: Side) => (sd === "right" ? h.width - x : x) - d.width / 2 - 32 - 8; // 32 = padding kartu
    const other: Side = side === "left" ? "right" : "left";
    const room = (sd: Side) => free(sd) - minLine;
    const pick = room(side) >= 240 || room(side) >= room(other) ? side : other;
    const line = Math.max(minLine, Math.min(maxLine, Math.floor(free(pick) - 288)));
    setFit({ side: pick, line, elbow, w: Math.max(170, Math.min(288, Math.floor(free(pick) - line))) });
  }, [open, side, portal]);
  const style = fit ? ({ "--elbow": `${fit.elbow}px`, "--hc-w": `${fit.w}px` } as CSSProperties) : undefined;
  return (
    // drei hanya menghitung ulang z-index saat kamera bergerak, jadi titik yang terbuka dinaikkan lewat kelas
    <Html position={at} center portal={portal as RefObject<HTMLElement>} zIndexRange={[20, 0]} wrapperClass={open ? "hs-open" : "hs"}>
      {/* klik di titik/kartu tidak diteruskan ke kanvas, supaya tidak dianggap klik area kosong (yang menutup kartu) */}
      <div ref={dot} className={`hotspot-wrap ${open ? "open" : ""} ${warn ? "warn" : locked ? "locked" : ""}`} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="hotspot" aria-label={locked ? `${label} (terkunci)` : label} aria-expanded={open} onClick={onToggle}>
          <i aria-hidden><Icon name={icon} size={18} /></i>
        </button>
        {!open && <span className="hs-label" aria-hidden>{label}</span>}
        {open && (
          <div className={`callout ${fit?.side ?? side} ${grow}`} style={style}>
            <CalloutLine width={fit?.line ?? 68} elbow={fit?.elbow ?? ELBOW} down={grow === "down"} />
            <CalloutCard host={portal} label={label} onClose={onToggle}>{children}</CalloutCard>
          </div>
        )}
      </div>
    </Html>
  );
}

/** Tinggi tekukan garis kartu (px); bawaan --elbow di globals.css sama dengan ini. */
const ELBOW = 28;

/**
 * Garis putus-putus dari titik ke kartu: naik/turun miring 45° dulu, lalu mendatar ke kartu.
 * Digambar untuk kartu di kanan titik; untuk kartu di kiri dicerminkan lewat CSS.
 */
function CalloutLine({ width, elbow: e, down }: { width: number; elbow: number; down: boolean }) {
  const y0 = down ? 1 : e + 1, y1 = down ? e + 1 : 1;
  return (
    <svg className="callout-line" width={width} height={e + 2} viewBox={`0 0 ${width} ${e + 2}`} aria-hidden>
      <path d={`M0 ${y0} L${e} ${y1} H${width}`} />
    </svg>
  );
}

/**
 * Kartu hotspot. Kartu tinggi (grafik + kontrol) bisa keluar dari atas/bawah panggung, jadi kartunya digeser
 * (garisnya tetap di titik) supaya tetap di dalam; diukur ulang saat isinya berubah tinggi, mis. grafik selesai dimuat.
 * Ini komponen sendiri karena drei merender isi <Html> di root React terpisah: ref kartu belum ada saat efek
 * milik Hotspot berjalan, sedangkan efek di sini berjalan tepat setelah kartunya terpasang.
 */
function CalloutCard({ host, label, onClose, children }: {
  host: RefObject<HTMLDivElement | null>; label: string; onClose: () => void; children: ReactNode;
}) {
  const card = useRef<HTMLDivElement>(null);
  const shiftNow = useRef(0);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const h = host.current, el = card.current;
    if (!h || !el) return;
    const measure = () => {
      const hr = h.getBoundingClientRect(), c = el.getBoundingClientRect();
      const top = c.top - shiftNow.current; // posisi kartu tanpa geseran
      const over = top + c.height - (hr.bottom - 8);
      const next = Math.round(top < hr.top + 8 ? hr.top + 8 - top : over > 0 ? -Math.min(over, top - (hr.top + 8)) : 0);
      if (next !== shiftNow.current) { shiftNow.current = next; setShift(next); }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(h);
    return () => ro.disconnect();
  }, [host]);
  return (
    <div ref={card} className="callout-card" style={shift ? { transform: `translateY(${shift}px)` } : undefined}>
      {/* tutup eksplisit: di layar sentuh tidak jelas bahwa titiknya bisa ditekan lagi */}
      <button type="button" className="icon-btn sm callout-close" aria-label={`Tutup kartu ${label}`} onClick={onClose}>
        <Icon name="close" size={15} />
      </button>
      {children}
    </div>
  );
}

/* ── Material ─────────────────────────────────────────────────────────── */

function GlassMat({ opacity = 0.05, roughness = 0.02 }: { opacity?: number; roughness?: number }) {
  return (
    <meshPhysicalMaterial
      color="#ffffff"
      transparent
      opacity={opacity}
      roughness={roughness}
      metalness={0}
      clearcoat={1}
      clearcoatRoughness={0.04}
      ior={1.5}
      envMapIntensity={3}
      depthWrite={false}
      side={THREE.DoubleSide}
    />
  );
}

function Pane({ size, position, opacity, roughness }: { size: V3; position: V3; opacity?: number; roughness?: number }) {
  return (
    <mesh position={position} renderOrder={3}>
      <boxGeometry args={size} />
      <GlassMat opacity={opacity} roughness={roughness} />
    </mesh>
  );
}

function MetalMat() {
  return <meshStandardMaterial color="#f3f5f6" metalness={0.5} roughness={0.3} envMapIntensity={1.9} />;
}

type V3 = [number, number, number];

/** 12 rusuk kotak sejajar sumbu; rusuk nol-panjang (kotak pipih) dibuang. */
function boxEdges(min: V3, max: V3): [V3, V3][] {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const c = (i: number): V3 => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
  const pairs: [number, number][] = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const seen = new Set<string>();
  return pairs
    .map(([a, b]) => [c(a), c(b)] as [V3, V3])
    .filter(([a, b]) => {
      const k = [a, b].map((v) => v.join(",")).sort().join("|");
      if (seen.has(k) || a.every((v, i) => v === b[i])) return false;
      seen.add(k);
      return true;
    });
}

/** Rangka profil aluminium di sepanjang rusuk yang diberikan. */
function Frame({ edges }: { edges: [V3, V3][] }) {
  return (
    <group>
      {edges.map(([a, b], i) => {
        const size = a.map((v, k) => Math.abs(b[k] - v) + METAL_P) as V3;
        const pos = a.map((v, k) => (v + b[k]) / 2) as V3;
        return (
          <mesh key={i} position={pos}>
            <boxGeometry args={size} />
            <MetalMat />
          </mesh>
        );
      })}
    </group>
  );
}

/* ── Bayangan lantai ──────────────────────────────────────────────────── */

/**
 * Bayangan lembut di bawah kotak supaya model tidak tampak melayang. Tekstur dibuat sekali di kanvas 2D
 * (persegi yang hanya digambar bayangannya), jadi tidak ada render pass tambahan tiap frame.
 */
// Bidang bayangan (cm) di lantai: cukup lebar untuk kotak + botol di kanan, plus ruang untuk blurnya.
const SH_X0 = -29.5, SH_X1 = BOTTLE_X + BOTTLE_R + 16, SH_Z0 = -22, SH_Z1 = 24;
const SH_PX_X = 256 / 60, SH_PX_Z = 256 / 46; // piksel tekstur per cm (sama seperti sebelum botol dipindah)

function GroundShadow() {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = Math.round((SH_X1 - SH_X0) * SH_PX_X);
    c.height = 256;
    const g = c.getContext("2d");
    if (g) {
      // bentuk digambar di luar kanvas; yang terlihat hanya bayangannya (blur merata, jalan di semua browser).
      // Kotak + lingkaran botol diisi sebagai satu path, supaya bayangan yang bertumpuk tidak jadi lebih gelap.
      const px = (x: number) => (x - SH_X0) * SH_PX_X - 512, pz = (z: number) => (z - SH_Z0) * SH_PX_Z;
      g.shadowColor = "#141e12";
      g.shadowBlur = 42;
      g.shadowOffsetX = 512;
      g.beginPath();
      g.rect(px(-13.56), pz(-7.27), 120, 92);
      const rx = (BOTTLE_R - 0.6) * SH_PX_X, rz = (BOTTLE_R - 0.6) * SH_PX_Z;
      g.moveTo(px(BOTTLE_X) + rx, pz(BOTTLE_Z)); // subpath baru, tanpa garis dari sudut persegi
      g.ellipse(px(BOTTLE_X), pz(BOTTLE_Z), rx, rz, 0, 0, Math.PI * 2);
      g.fill();
    }
    return new THREE.CanvasTexture(c);
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(SH_X0 + SH_X1) / 2, -0.06, (SH_Z0 + SH_Z1) / 2]} renderOrder={0}>
      <planeGeometry args={[SH_X1 - SH_X0, SH_Z1 - SH_Z0]} />
      <meshBasicMaterial map={tex} transparent opacity={0.26} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/* ── Kotak kaca ───────────────────────────────────────────────────────── */

const LID_Y = 20 + METAL_P; // rangka tutup sedikit di atas rangka kotak supaya tidak bertumpuk

function GlassBox() {
  const h = 20 - T;
  const y = T + h / 2;
  return (
    <group>
      <Pane size={[32, T, 20]} position={[0, T / 2, 0]} opacity={0.08} />
      <Pane size={[32, h, T]} position={[0, y, 10 - T / 2]} />
      <Pane size={[32, h, T]} position={[0, y, -10 + T / 2]} />
      <Pane size={[T, h, 20 - 2 * T]} position={[-16 + T / 2, y, 0]} />
      <Pane size={[T, h, 20 - 2 * T]} position={[16 - T / 2, y, 0]} />
      {/* sekat kaca buram di 200 mm dari kiri */}
      <Pane size={[T, h, 20 - 2 * T]} position={[4, y, 0]} opacity={0.15} roughness={0.3} />
      {/* tutup ruang elektronik: bentuknya sama dengan tutup tanaman, tapi tetap (tidak bergerak) */}
      <Pane size={[11.95, 0.2, 20]} position={[10.025, 20.25, 0]} opacity={0.07} />
      <Frame edges={BOX_FRAME} />
    </group>
  );
}

const BOX_FRAME: [V3, V3][] = [
  ...boxEdges([-16, 0, -10], [16, 20, 10]),
  // sekat di x = 4
  ...boxEdges([4, 0, -10], [4, 20, 10]),
  // tutup tetap ruang kanan
  ...boxEdges([4.4, LID_Y, -10], [15.975, LID_Y, 10]),
];

/* ── Tutup berengsel ──────────────────────────────────────────────────── */

const HINGE: V3 = [-6.025, 20.25, -10];
const LID_FRAME = boxEdges([-9.95, METAL_P, 0], [9.95, METAL_P, 20]);

function Lid({ deg, degPerSec, children }: { deg: number; degPerSec: number; children?: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const cur = useRef(deg);
  const reduce = useReducedMotion();

  useFrame((_, dt) => {
    const target = Math.max(0, Math.min(90, deg));
    if (reduce) cur.current = target;
    else {
      // bergerak secepat servo asli, dengan sedikit perlambatan di ujung supaya halus
      const diff = target - cur.current;
      const step = degPerSec * Math.min(dt, 0.05);
      const ease = Math.min(1, Math.abs(diff) / 6);
      cur.current += Math.abs(diff) <= 0.05 ? diff : Math.sign(diff) * Math.min(Math.abs(diff), step * Math.max(0.25, ease));
    }
    if (ref.current) ref.current.rotation.x = -THREE.MathUtils.degToRad(cur.current);
  });

  return (
    <group ref={ref} position={HINGE}>
      <mesh position={[0, 0, 10]} renderOrder={4}>
        <boxGeometry args={[19.95, 0.2, 20]} />
        <GlassMat opacity={0.07} />
      </mesh>
      <Frame edges={LID_FRAME} />
      {/* hotspot tutup ikut berputar bersama tutup */}
      {children}
    </group>
  );
}

/* ── Ruang tanaman ────────────────────────────────────────────────────── */

const POT_R = 7.3;       // jari-jari bibir pot
const POT_R_BASE = 6.1;  // jari-jari dasar pot
const POT_H = 6.2;
const DRY = new THREE.Color("#b8946a");
const WET = new THREE.Color("#3d2a1e");

function Planter({ soilPct }: { soilPct: number | null }) {
  const soil = useRef<THREE.MeshStandardMaterial>(null);
  const plant = useRef<THREE.Group>(null);
  const target = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }, dt) => {
    const k = soilPct == null ? 0.4 : Math.max(0, Math.min(1, soilPct / 80));
    target.copy(DRY).lerp(WET, k);
    soil.current?.color.lerp(target, Math.min(1, dt * 1.5));
    if (plant.current) plant.current.rotation.y = Math.sin(clock.elapsedTime * 0.5) * 0.05;
  });

  return (
    <group position={[-6, T, 0]}>
      {/* pot bulat, sedikit mengerucut ke bawah */}
      <mesh position={[0, POT_H / 2, 0]}>
        <cylinderGeometry args={[POT_R, POT_R_BASE, POT_H, 64]} />
        <meshStandardMaterial color="#f3f1ec" roughness={0.55} />
      </mesh>
      <mesh position={[0, POT_H, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[POT_R - 0.2, 0.32, 16, 64]} />
        <meshStandardMaterial color="#f3f1ec" roughness={0.55} />
      </mesh>
      <mesh position={[0, POT_H + 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[POT_R - 0.5, 48]} />
        <meshStandardMaterial ref={soil} color={DRY} roughness={1} />
      </mesh>
      <group ref={plant} position={[0, POT_H + 0.1, 0]}>
        <Lettuce />
      </group>
    </group>
  );
}

function Lettuce() {
  const leaves = useMemo(() => {
    const out: { r: number; tilt: number; s: number; c: string; y: number }[] = [];
    const rings = [
      { n: 9, tilt: -0.22, s: 1.25, c: "#3f8f35", y: 0.15 },
      { n: 8, tilt: -0.5, s: 1.05, c: "#56aa3e", y: 0.4 },
      { n: 7, tilt: -0.85, s: 0.85, c: "#78c24f", y: 0.65 },
      { n: 5, tilt: -1.2, s: 0.62, c: "#a6dc6e", y: 0.9 },
    ];
    rings.forEach((ring, i) => {
      for (let k = 0; k < ring.n; k++) out.push({ r: (k / ring.n) * Math.PI * 2 + i * 0.45, tilt: ring.tilt, s: ring.s, c: ring.c, y: ring.y });
    });
    return out;
  }, []);
  return (
    <group>
      {leaves.map((l, i) => (
        <group key={i} rotation={[0, l.r, 0]} position={[0, l.y, 0]}>
          <mesh rotation={[l.tilt, 0, 0]} position={[0, 0.3 + 1.2 * l.s * -Math.sin(l.tilt), 1.4 + 1.3 * l.s * Math.cos(l.tilt)]} scale={[1.6 * l.s, 0.16 * l.s, 2.4 * l.s]}>
            <sphereGeometry args={[1, 20, 12]} />
            <meshStandardMaterial color={l.c} roughness={0.55} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ── Air: tangki, pompa, selang ───────────────────────────────────────── */

const TUBE_IDLE = new THREE.Color("#e9f3f6");
const TUBE_FLOW = new THREE.Color("#5ab8f0");

/**
 * Jalur selang yang rapi: ruas lurus antar titik sudut, tiap sudut dibulatkan (kurva Bézier kuadrat dengan
 * titik kendali di sudutnya, hampir sama dengan busur lingkaran). Panjangnya dihitung per ruas, jadi
 * getPointAt() bergerak dengan kecepatan tetap untuk animasi aliran.
 */
function roundedPath(points: V3[], radius: number) {
  const v = points.map((p) => new THREE.Vector3(...p));
  const path = new THREE.CurvePath<THREE.Vector3>();
  let from = v[0];
  for (let i = 1; i < v.length - 1; i++) {
    const p = v[i];
    const r = Math.min(radius, p.distanceTo(v[i - 1]) / 2, p.distanceTo(v[i + 1]) / 2);
    const a = p.clone().addScaledVector(v[i - 1].clone().sub(p).normalize(), r);
    const b = p.clone().addScaledVector(v[i + 1].clone().sub(p).normalize(), r);
    path.add(new THREE.LineCurve3(from, a));
    path.add(new THREE.QuadraticBezierCurve3(a, p, b));
    from = b;
  }
  path.add(new THREE.LineCurve3(from, v[v.length - 1]));
  return path;
}

function WaterSystem({ pumpOn, tankWarning }: { pumpOn: boolean; tankWarning: boolean }) {
  const curve = useMemo(() => roundedPath(TUBE_POINTS, TUBE_BEND), []);
  const tubeGeo = useMemo(() => new THREE.TubeGeometry(curve, 260, 0.26, 12, false), [curve]);
  useEffect(() => () => tubeGeo.dispose(), [tubeGeo]);
  const tubeMat = useRef<THREE.MeshPhysicalMaterial>(null);
  const water = useRef<THREE.Mesh>(null);
  const waterMat = useRef<THREE.MeshPhysicalMaterial>(null);
  const drops = useRef<THREE.Group>(null);
  const drips = useRef<THREE.Group>(null);
  const flow = useRef(0);
  const level = tankWarning ? 0.1 : 0.7;
  const end = TUBE_POINTS[TUBE_POINTS.length - 1];
  const N = 28;

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    flow.current += ((pumpOn ? 1 : 0) - flow.current) * Math.min(1, dt * 5);
    const f = flow.current;
    tubeMat.current?.color.copy(TUBE_IDLE).lerp(TUBE_FLOW, f);
    if (waterMat.current) waterMat.current.color.lerp(new THREE.Color(tankWarning ? "#f08a6e" : "#7cc7f0"), Math.min(1, dt * 2));
    if (water.current) {
      const s = water.current.scale;
      s.y += (level - s.y) * Math.min(1, dt * 1.5);
      water.current.position.y = 0.4 + (12 * s.y) / 2;
    }
    drops.current?.children.forEach((c, i) => {
      c.visible = f > 0.05;
      if (!c.visible) return;
      c.position.copy(curve.getPointAt((t * 0.55 + i / N) % 1));
      c.scale.setScalar(f);
    });
    drips.current?.children.forEach((c, i) => {
      c.visible = f > 0.05;
      if (!c.visible) return;
      const u = (t * 1.8 + i / 3) % 1;
      c.position.set(end[0], end[1] - u * (end[1] - (T + 6.3)), end[2]);
      c.scale.set(f, f * 1.6, f);
    });
  });

  return (
    <group>
      <group position={[BOTTLE_X, 0, BOTTLE_Z]}>
        {/* botol air di luar dinding kanan, berdiri di lantai */}
        <mesh position={[0, 6.6, 0]} renderOrder={2}>
          <cylinderGeometry args={[BOTTLE_R, BOTTLE_R, 13, 48, 1, true]} />
          <GlassMat opacity={0.18} />
        </mesh>
        <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
          <circleGeometry args={[BOTTLE_R, 48]} />
          <GlassMat opacity={0.12} />
        </mesh>
        <mesh position={[0, 13.2, 0]}>
          <cylinderGeometry args={[1.4, 1.6, 0.9, 32]} />
          <meshStandardMaterial color="#fbfbf8" roughness={0.3} />
        </mesh>
        {/* dua cincin pengikat botol ke dinding, warnanya sama dengan rangka */}
        {[3.5, 10].map((y) => (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[BOTTLE_R + 0.06, 0.16, 10, 48]} />
            <MetalMat />
          </mesh>
        ))}
        <mesh ref={water} position={[0, 0.4, 0]} scale={[1, level, 1]} renderOrder={1}>
          <cylinderGeometry args={[BOTTLE_R - 0.15, BOTTLE_R - 0.15, 12, 40]} />
          <meshPhysicalMaterial ref={waterMat} color="#7cc7f0" transparent opacity={0.45} roughness={0.05} clearcoat={1} envMapIntensity={1.5} depthWrite={false} />
        </mesh>
      </group>

      {/* cincin grommet tempat selang menembus kaca, warnanya sama dengan rangka */}
      {TUBE_THROUGH.map((x) => (
        <mesh key={x} position={[x, TUBE_Y, BOTTLE_Z]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.36, 0.13, 10, 24]} />
          <MetalMat />
        </mesh>
      ))}

      <mesh geometry={tubeGeo}>
        <meshPhysicalMaterial ref={tubeMat} color="#e9f3f6" transparent opacity={0.7} roughness={0.1} clearcoat={1} envMapIntensity={1.5} />
      </mesh>
      <group ref={drops}>
        {Array.from({ length: N }, (_, i) => (
          <mesh key={i} visible={false}>
            <sphereGeometry args={[0.17, 10, 8]} />
            <meshBasicMaterial color="#1f9cf0" toneMapped={false} />
          </mesh>
        ))}
      </group>
      <group ref={drips}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} visible={false}>
            <sphereGeometry args={[0.2, 10, 8]} />
            <meshBasicMaterial color="#1f9cf0" toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function useReducedMotion() {
  return useMemo(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);
}
