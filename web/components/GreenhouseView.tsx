"use client";

// Model 3D dimuat terpisah (tanpa SSR) supaya halaman tetap cepat terbuka.
import dynamic from "next/dynamic";

const GreenhouseView = dynamic(() => import("./Greenhouse3D"), {
  ssr: false,
  loading: () => <div className="gh3d-fallback">Memuat model 3D…</div>,
});

export default GreenhouseView;
