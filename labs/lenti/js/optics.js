// optics.js — le lenti del banco ottico: forme vere (superfici sferiche, spessore, vetro dispersivo), analisi
// parassiale (matrici ABCD, punti cardinali, coniugati) e tracciamento esatto dei raggi con la legge di Snell.
// Nessuna dipendenza: gira identico nel browser e in Node (per le prove).
//
// Riferimento: asse ottico lungo x (verso di propagazione della luce, dall'oggetto allo schermo), lunghezze in
// metri, lunghezze d'onda in micrometri. Una superficie ha il vertice in x e curvatura c = 1/R: c > 0 vuol dire
// centro di curvatura dalla parte di +x. Il punto della superficie a distanza r dall'asse sta in x + sag(c, r).

/** Le tre lunghezze d'onda della simulazione (rosso, verde, blu) e quella di riferimento (riga d del sodio). */
export const LAM = [0.61, 0.55, 0.465];
export const LAM_D = 0.5876;

// vetri (catalogo Schott): indice nd e numero di Abbe vd
const GLASS = { BK7: { nd: 1.5168, vd: 64.17 }, F2: { nd: 1.62004, vd: 36.37 } };
const LF = 0.4861, LC = 0.6563;

/** Indice di rifrazione alla lunghezza d'onda lam (µm): formula di Cauchy a due termini dai dati del catalogo. */
export function nOf(glass, lam) {
  if (!glass) return 1;
  const g = GLASS[glass];
  const B = (g.nd - 1) / g.vd / (1 / (LF * LF) - 1 / (LC * LC));
  return g.nd - B / (LAM_D * LAM_D) + B / (lam * lam);
}

export const TYPES = {
  biconvex: { label: 'Biconvessa', sign: 1, asym: false },
  planoconvex: { label: 'Piano-convessa', sign: 1, asym: true },
  biconcave: { label: 'Biconcava', sign: -1, asym: false },
  planoconcave: { label: 'Piano-concava', sign: -1, asym: true },
  achromat: { label: 'Acromatica', sign: 1, asym: true },
};

/** Freccia della calotta: distanza lungo x fra il vertice e il punto della superficie a distanza r dall'asse. */
export const sag = (c, r) => (c * r * r) / (1 + Math.sqrt(Math.max(0, 1 - c * c * r * r)));

const EDGE = 0.0012, CENTER_MIN = 0.0016;   // spessori minimi al bordo e al centro (m)

/**
 * Una lente vera. type: chiave di TYPES; fAbs: |f| nominale (m); flip: girata (per le lenti asimmetriche la
 * faccia curva, o la parte di crown dell'acromatica, guarda lo schermo invece dell'oggetto).
 * Restituisce { type, f, D, a, T, surfaces: [{dx, c, glass}] } con dx = posizione del vertice rispetto al centro
 * del portalente e glass = vetro che segue la superficie (null = aria).
 */
export function makeLens(type, fAbs, flip = false) {
  const info = TYPES[type], f = info.sign * fAbs;
  // diametro: 50 mm, meno per le lenti molto curve (un doppietto più aperto di f/2,5 sarebbe un mattone di vetro)
  const D = Math.min(0.05, (type === 'achromat' ? 0.4 : 0.8) * fAbs), a = D / 2;
  let cs, glasses;
  if (type === 'achromat') {
    // doppietto di Fraunhofer incollato: biconvessa di crown davanti, menisco divergente di flint dietro.
    // Condizione di acromatismo per lenti sottili: φ1/V1 + φ2/V2 = 0.
    const V1 = GLASS.BK7.vd, V2 = GLASS.F2.vd, n1 = GLASS.BK7.nd, n2 = GLASS.F2.nd, phi = 1 / f;
    const phi1 = (phi * V1) / (V1 - V2), phi2 = (-phi * V2) / (V1 - V2);
    const c1 = phi1 / (2 * (n1 - 1)), c2 = -c1, c3 = c2 - phi2 / (n2 - 1);
    cs = [c1, c2, c3]; glasses = ['BK7', 'F2', null];
  } else {
    const k = 1 / (2 * (GLASS.BK7.nd - 1) * f);   // lente sottile equiconvessa come primo tentativo
    if (type === 'biconvex' || type === 'biconcave') cs = [k, -k];
    else cs = [2 * k, 0];                          // piano: la faccia curva fa tutto il lavoro
    glasses = ['BK7', null];
  }
  if (flip && info.asym) {
    // girata: le superfici in ordine inverso, curvature col segno cambiato
    cs = cs.slice().reverse().map((c) => -c || 0);
    glasses = type === 'achromat' ? ['F2', 'BK7', null] : glasses;
  }
  let lens;
  // le curvature si scalano finché la focale vera (lente spessa, alla riga d) è quella nominale
  for (let it = 0; it < 8; it++) {
    lens = assemble(type, f, D, a, cs, glasses, flip);
    const fe = lensEFL(lens, LAM_D);
    const k = fe / f;
    if (Math.abs(k - 1) < 1e-9) break;
    cs = cs.map((c) => c * k);
  }
  return lens;
}

function assemble(type, f, D, a, cs, glasses, flip) {
  // spessori: ogni elemento di vetro almeno CENTER_MIN al centro ed EDGE al bordo
  const ts = [];
  for (let i = 0; i < cs.length - 1; i++) ts.push(Math.max(CENTER_MIN, EDGE + sag(cs[i], a) - sag(cs[i + 1], a)));
  const T = ts.reduce((s, t) => s + t, 0);
  const surfaces = [];
  let x = -T / 2;
  for (let i = 0; i < cs.length; i++) { surfaces.push({ dx: x, c: cs[i], glass: glasses[i] }); if (i < ts.length) x += ts[i]; }
  return { type, f, D, a, T, flip: !!flip, surfaces };
}

/** Focale efficace di una lente sola (parassiale, in aria). */
export function lensEFL(lens, lam) {
  const M = abcd(lens.surfaces.map((s) => ({ x: s.dx, c: s.c, glass: s.glass })), lam);
  return -1 / M.C;
}

/**
 * Matrice ABCD (raggio parassiale [y, n·u]) dal primo all'ultimo vertice di una sequenza di superfici
 * { x, c, glass, stop? } ordinata lungo x. I diaframmi non contano.
 */
export function abcd(surfs, lam) {
  // M ← T·M per un tratto (y' = y + t·nu, t = d/n), M ← R·M per una rifrazione (nu' = nu − φ·y, φ = (n′ − n)·c)
  let A = 1, B = 0, C = 0, Dm = 1, n = 1, xp = null;
  for (const s of surfs) {
    if (s.stop) continue;
    if (xp !== null) { const t = (s.x - xp) / n; A += t * C; B += t * Dm; }
    const n2 = nOf(s.glass, lam), phi = (n2 - n) * s.c;
    C -= phi * A; Dm -= phi * B;
    n = n2; xp = s.x;
  }
  return { A, B, C, D: Dm };
}

/** Le superfici di tutto il banco in coordinate assolute: lenti [{lens, x}] e un diaframma { x, r } facoltativo. */
export function benchSurfaces(items, iris) {
  const out = [];
  items.forEach(({ lens, x }, id) => {
    lens.surfaces.forEach((s) => {
      const ext = sag(s.c, lens.a);
      out.push({ x: x + s.dx, c: s.c, glass: s.glass, a: lens.a, mount: lens.a + 0.009, xmin: x + s.dx + Math.min(0, ext), xmax: x + s.dx + Math.max(0, ext), lensId: id });
    });
  });
  if (iris) out.push({ x: iris.x, c: 0, glass: null, a: iris.r, mount: 0.036, xmin: iris.x, xmax: iris.x, stop: true });
  out.sort((p, q) => p.x - q.x);
  return out;
}

/**
 * Punti cardinali del sistema (parassiale, alla lunghezza d'onda lam): f, fuochi F e F′, piani principali H e H′,
 * primo e ultimo vertice. Con potenza nulla (sistema afocale) f = ∞.
 */
export function cardinal(surfs, lam = LAM_D) {
  const real = surfs.filter((s) => !s.stop);
  if (!real.length) return null;
  const M = abcd(real, lam), x0 = real[0].x, x1 = real[real.length - 1].x;
  if (Math.abs(M.C) < 1e-9) return { f: Infinity, x0, x1, M };
  const f = -1 / M.C, Fp = x1 - M.A / M.C, F = x0 + M.D / M.C;
  return { f, F, Fp, H: F + f, Hp: Fp - f, x0, x1, M };
}

/**
 * Immagine parassiale di un oggetto in xo (null = all'infinito, con altezza angolare alpha).
 * Restituisce { x, m, real } (x = null: immagine all'infinito) oppure, per l'oggetto all'infinito, { x, h }.
 */
export function imageOf(card, xo, alpha = 0) {
  if (!card || !isFinite(card.f)) return { x: null, m: 1, real: false };
  if (xo === null) return { x: card.Fp, h: -card.f * Math.tan(alpha), real: card.f > 0 };
  const s = card.H - xo;                       // distanza oggetto–piano principale (positiva se l'oggetto è prima)
  if (Math.abs(s - card.f) < 1e-7) return { x: null, m: Infinity, real: false };
  const sp = (s * card.f) / (s - card.f);
  const x = card.Hp + sp;
  return { x, m: -sp / s, real: x > card.x1 + 1e-6 };
}

// ───────────────────────────── tracciamento esatto (piano meridiano) ─────────────────────────────

/** Interseca il raggio (px, py) + t·(dx, dy) con la superficie s; restituisce t (o NaN se non la incontra). */
function hitSurface(s, px, py, dx, dy) {
  const X = px - s.x, c = s.c;
  const B = c * (X * dx + py * dy) - dx, K = c * (X * X + py * py) - 2 * X;
  const disc = B * B - c * K;
  if (disc < 0) return NaN;
  return -K / (B + (B >= 0 ? 1 : -1) * Math.sqrt(disc));
}

/**
 * Segue un raggio nel piano meridiano attraverso le superfici, nel verso di dx. Restituisce la spezzata
 * [[x, y], …] fino all'ultima superficie attraversata, la direzione d'uscita e se il raggio è stato fermato
 * (da un bordo, da un diaframma o da una riflessione totale).
 */
export function traceRay(surfs, x, y, dx, dy, lam) {
  const pts = [[x, y]];
  let l = Math.hypot(dx, dy); dx /= l; dy /= l;
  const fwd = dx > 0, order = fwd ? surfs : surfs.slice().reverse();
  let n = 1, missed = false;
  for (const s of order) {
    if (fwd ? s.xmax < x - 1e-9 : s.xmin > x + 1e-9) continue;
    const t = hitSurface(s, x, y, dx, dy);
    if (!(t > 1e-9)) continue;
    const hx = x + t * dx, hy = y + t * dy;
    if (Math.abs(hy) > s.a) {
      if (Math.abs(hy) < s.mount) { pts.push([hx, hy]); return { pts, dx, dy, blocked: true }; }
      missed = true; continue;                    // passa fuori dal portalente
    }
    x = hx; y = hy; pts.push([x, y]);
    if (s.stop) continue;
    // indice dopo la superficie nel verso del raggio (all'indietro: il vetro che precede la superficie)
    const n2 = fwd ? nOf(s.glass, lam) : nOf(glassBefore(surfs, s), lam);
    let nx = s.c * (x - s.x) - 1, ny = s.c * y;
    l = Math.hypot(nx, ny); nx /= l; ny /= l;
    if (nx * dx + ny * dy > 0) { nx = -nx; ny = -ny; }
    const eta = n / n2, cosi = -(nx * dx + ny * dy), k = 1 - eta * eta * (1 - cosi * cosi);
    if (k < 0) return { pts, dx, dy, blocked: true };
    const a = eta * cosi - Math.sqrt(k);
    dx = eta * dx + a * nx; dy = eta * dy + a * ny;
    n = n2;
  }
  return { pts, dx, dy, blocked: false, missed };
}

/** Il vetro che sta subito prima della superficie s (null = aria). */
export function glassBefore(surfs, s) {
  for (let i = surfs.indexOf(s) - 1; i >= 0; i--) if (!surfs[i].stop) return surfs[i].glass;
  return null;
}

/**
 * Fuoco migliore per un punto sull'asse (xo; null = all'infinito): segue un ventaglio di raggi che riempie
 * l'apertura e trova il piano dove la macchia è più piccola (minimo dello scarto quadratico, pesato come su un
 * disco). Restituisce { x, rms, n } oppure null se i raggi escono divergenti (nessuna immagine reale).
 */
export function bestFocus(surfs, xo, lam = LAM[1], beamR = 0.022, nRays = 48) {
  const real = surfs.filter((s) => !s.stop);
  if (!real.length) return null;
  const first = surfs[0], rays = [];
  for (let i = 0; i < nRays; i++) {
    // altezze sulla prima superficie fino al suo bordo (oltre, il portalente ferma la luce)
    const h = ((i + 0.5) / nRays) * (xo === null ? Math.min(beamR, first.a) : first.a);
    const r = xo === null ? traceRay(surfs, first.xmin - 0.01, h, 1, 0, lam) : traceRay(surfs, xo, 0, first.x - xo, h, lam);
    if (r.blocked || r.missed) continue;
    const [x0, y0] = r.pts[r.pts.length - 1];
    rays.push({ x0, y0, u: r.dy / r.dx, w: h });
  }
  if (rays.length < 3) return null;
  // y(x) = y0 + u·(x − x0); minimo di Σ w·y²
  let num = 0, den = 0;
  for (const r of rays) { const b = r.y0 - r.u * r.x0; num += r.w * r.u * b; den += r.w * r.u * r.u; }
  const x = -num / den;
  const lastX = real[real.length - 1].x;
  const conv = rays.reduce((s, r) => s + r.w * r.u * Math.sign(r.y0), 0) < 0;
  if (!conv || x < lastX) return null;
  return { x, rms: spotRMS(rays, x), rays };
}

function spotRMS(rays, x) {
  let s = 0, w = 0;
  for (const r of rays) { const y = r.y0 + r.u * (x - r.x0); s += r.w * y * y; w += r.w; }
  return Math.sqrt(s / w);
}

/** Raggio quadratico medio della macchia di un punto sull'asse sul piano x (stessi raggi di bestFocus). */
export function spotAt(focus, x) { return focus ? spotRMS(focus.rays, x) : null; }
