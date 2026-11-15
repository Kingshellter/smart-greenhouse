// Ilustrasi tanaman untuk preset (SVG datar, 64×64). Jenis ditebak dari nama preset;
// preset custom yang namanya tidak dikenali memakai gambar tunas.

import type { ReactElement } from "react";

export type PlantKind = "lettuce" | "bokchoy" | "spinach" | "kangkung" | "chili" | "tomato" | "sprout";

const MATCH: [RegExp, PlantKind][] = [
  [/selada|lettuce/i, "lettuce"],
  [/pak ?coy|pakchoi|sawi/i, "bokchoy"],
  [/bayam|spinach/i, "spinach"],
  [/kangkung/i, "kangkung"],
  [/cabai|cabe|chili/i, "chili"],
  [/tomat/i, "tomato"],
];

export const plantKind = (name: string | undefined): PlantKind =>
  MATCH.find(([re]) => re.test(name ?? ""))?.[1] ?? "sprout";

const G1 = "#2f7d32", G2 = "#43a047", G3 = "#6cc04a", G4 = "#a5dc6a";

const ART: Record<PlantKind, ReactElement> = {
  lettuce: (
    <g>
      <circle cx="19" cy="38" r="12" fill={G2} />
      <circle cx="45" cy="38" r="12" fill={G2} />
      <circle cx="32" cy="27" r="14" fill={G3} />
      <circle cx="25" cy="42" r="11" fill={G3} />
      <circle cx="39" cy="42" r="11" fill={G3} />
      <circle cx="32" cy="35" r="9.5" fill={G4} />
      <path d="M32 50V30M32 40l-6-6M32 38l6-6" stroke={G2} strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.55" />
    </g>
  ),
  bokchoy: (
    <g strokeLinecap="round" fill="none">
      <path d="M32 56c-5-9-9-18-12-30" stroke="#eaf3dc" strokeWidth="6" />
      <path d="M32 56c5-9 9-18 12-30" stroke="#eaf3dc" strokeWidth="6" />
      <path d="M32 56V22" stroke="#f4f8ec" strokeWidth="6.5" />
      <ellipse cx="18" cy="20" rx="8" ry="12" transform="rotate(-18 18 20)" fill={G1} stroke="none" />
      <ellipse cx="46" cy="20" rx="8" ry="12" transform="rotate(18 46 20)" fill={G1} stroke="none" />
      <ellipse cx="32" cy="15" rx="8.5" ry="12.5" fill={G2} stroke="none" />
      <path d="M32 26V8M19 29l-3-16M45 29l3-16" stroke="#cfe6b5" strokeWidth="1.4" />
    </g>
  ),
  spinach: (
    <g>
      {[-62, -30, 0, 30, 62].map((a, i) => (
        <path key={a} d="M32 54C22 44 20 28 26 14c3-3 9-3 12 0 6 14 4 30-6 40z"
              transform={`rotate(${a} 32 54)`} fill={i % 2 ? G1 : G2} />
      ))}
      {[-62, -30, 0, 30, 62].map((a) => (
        <path key={`v${a}`} d="M32 52V18" transform={`rotate(${a} 32 54)`} stroke={G4} strokeWidth="1.2" opacity="0.7" />
      ))}
    </g>
  ),
  kangkung: (
    <g strokeLinecap="round">
      {[[-20, G2], [-6, G1], [8, G2], [22, G1]].map(([a, c]) => (
        <g key={a} transform={`rotate(${a} 32 58)`}>
          <path d="M32 58V14" stroke="#9ccc65" strokeWidth="2.2" />
          <path d="M32 14c-3 6-3 12 0 18 3-6 3-12 0-18z" fill={c as string} />
          <path d="M32 34c-6 2-9 6-10 11 5-1 9-4 10-11z" fill={c as string} />
          <path d="M32 30c6 2 9 6 10 11-5-1-9-4-10-11z" fill={c as string} />
        </g>
      ))}
    </g>
  ),
  chili: (
    <g strokeLinecap="round">
      <path d="M32 58V20M32 40 20 30M32 34l12-10" stroke={G1} strokeWidth="2.4" fill="none" />
      <ellipse cx="20" cy="22" rx="6" ry="10" transform="rotate(-40 20 22)" fill={G2} />
      <ellipse cx="44" cy="18" rx="6" ry="10" transform="rotate(40 44 18)" fill={G2} />
      <ellipse cx="32" cy="14" rx="6" ry="9.5" fill={G3} />
      <path d="M22 32c-1 7 0 13 3 18 1-6 1-12-1-18z" fill="#e53935" />
      <path d="M41 26c2 7 2 13 0 19-2-6-3-12-2-19z" fill="#e53935" />
      <path d="M34 40c1 6 3 11 6 14 0-6-2-11-4-14z" fill="#ef5350" />
      <path d="M21 31.5l2.5-2M40 25.5l2.2 0M34.5 39.5l2-1" stroke={G1} strokeWidth="2" />
    </g>
  ),
  tomato: (
    <g>
      <path d="M32 6c-8 4-14 4-20 2 4 6 10 8 20 6 10 2 16 0 20-6-6 2-12 2-20-2z" fill={G2} />
      <path d="M32 6v10" stroke={G1} strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="22" cy="36" r="11" fill="#e53935" />
      <circle cx="42" cy="38" r="12" fill="#f4511e" />
      <circle cx="32" cy="24" r="9" fill="#ef5350" />
      <path d="M32 15.5l-3 3h6zM22 25l-3 3h6zM42 26l-3 3h6z" fill={G1} />
      <circle cx="18" cy="32" r="2.4" fill="#fff" opacity="0.35" />
      <circle cx="37.5" cy="33" r="2.6" fill="#fff" opacity="0.35" />
    </g>
  ),
  sprout: (
    <g strokeLinecap="round">
      <ellipse cx="32" cy="52" rx="16" ry="5" fill="#b8946a" opacity="0.55" />
      <path d="M32 52V28" stroke={G1} strokeWidth="2.6" fill="none" />
      <path d="M32 32C30 20 22 14 10 16c1 11 10 17 22 16z" fill={G2} />
      <path d="M32 28c1-10 8-16 20-15-1 10-9 16-20 15z" fill={G3} />
    </g>
  ),
};

export function PlantArt({ name, size = 56 }: { name: string | undefined; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="plant-art">
      {ART[plantKind(name)]}
    </svg>
  );
}
