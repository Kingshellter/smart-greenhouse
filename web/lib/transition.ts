"use client";

// Transisi halaman dengan View Transitions API: elemen yang punya view-transition-name sama
// di halaman lama dan baru (mis. preview 3D node) "berubah bentuk" dari satu posisi ke posisi lain.
// Browser tanpa dukungan (atau prefers-reduced-motion) langsung pindah halaman seperti biasa.

type Router = { push: (href: string) => void };
type DocVT = Document & { startViewTransition?: (cb: () => Promise<void>) => unknown };

let finish: (() => void) | null = null;
const MAX_WAIT_MS = 500;

export function navigate(router: Router, href: string) {
  const doc = document as DocVT;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || reduce) {
    router.push(href);
    return;
  }
  const vt = doc.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        const done = () => { if (finish === done) finish = null; resolve(); };
        finish = done;
        router.push(href);
        // Selama menunggu, halaman lama "membeku". Model 3D biasanya siap < 0,3 s; lewat dari ini
        // transisi jalan saja dan model muncul begitu siap, daripada pengguna menunggu.
        setTimeout(done, MAX_WAIT_MS);
      }),
  ) as { ready?: Promise<void>; finished?: Promise<void> } | undefined;
  // transisi bisa dibatalkan (klik beruntun, tab disembunyikan); itu normal, bukan error
  vt?.ready?.catch(() => {});
  vt?.finished?.catch(() => {});
}

/** Dipanggil halaman tujuan setelah konten utamanya (model 3D) tergambar. */
export function transitionReady() {
  finish?.();
}
