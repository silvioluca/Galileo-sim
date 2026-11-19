// prism.js — la fisica del prisma: indici di rifrazione reali (equazioni di Sellmeier), righe spettrali
// delle lampade, tracciamento dei raggi nella sezione principale del prisma (Snell + Fresnel, con
// riflessione totale) e costruzione dello spettro che si vede sullo schermo o nell'oculare.
//
// Geometria in pianta: il fascio incidente viaggia lungo +x e passa per l'origine (centro della
// piattaforma); gli angoli crescono in senso antiorario; y₂ = −z del mondo 3D. Unità: metri, radianti;
// le lunghezze d'onda sono in nanometri nell'interfaccia e in micrometri nelle formule di Sellmeier.
//
// Nessuna dipendenza dal browser: gira identico in Node (per i test).
import { spectralRGB, planck } from '../../../shared/js/color.js';

// ───────────────────────────── materiali ─────────────────────────────
// n²(λ) = 1 + Σ Bᵢ λ² / (λ² − Cᵢ), λ in µm
export const MATERIALS = {
  bk7: { name: 'Crown BK7', note: 'vetro crown, poco dispersivo', tint: '#cfe9ff', B: [1.03961212, 0.231792344, 1.01046945], C: [0.00600069867, 0.0200179144, 103.560653] },
  f2: { name: 'Flint F2', note: 'vetro flint al piombo', tint: '#e9dcff', B: [1.34533359, 0.209073176, 0.937357162], C: [0.00997743871, 0.0470450767, 111.886764] },
  sf10: { name: 'Flint denso SF10', note: 'molto dispersivo', tint: '#ffe9c4', B: [1.61625977, 0.259229334, 1.07762317], C: [0.0127534559, 0.0581983954, 116.60768] },
  sf11: { name: 'Flint denso SF11', note: 'il più dispersivo tra i vetri qui', tint: '#ffe2b0', B: [1.73759695, 0.313747346, 1.89878101], C: [0.013188707, 0.0623068142, 155.23629] },
  silica: { name: 'Quarzo fuso', note: 'silice vetrosa', tint: '#d9f2ff', B: [0.6961663, 0.4079426, 0.8974794], C: [0.00467914826, 0.0135120631, 97.9340025] },
  pmma: { name: 'Acrilico', note: 'plexiglas (PMMA)', tint: '#e6f6ff', B: [1.18787], C: [0.01051] },
  water: { name: 'Acqua', note: 'prisma cavo riempito d\'acqua', tint: '#c4ecff', B: [0.5684027565, 0.1726177391, 0.02086189578, 0.1130748688], C: [0.005101829712, 0.01821153936, 0.02620722293, 10.69792721] },
  diamond: { name: 'Diamante', note: 'indice altissimo', tint: '#ffffff', B: [0.3306, 4.3356], C: [0.030625, 0.011236] },
};

/** Indice di rifrazione del materiale alla lunghezza d'onda (nm). */
export function refractiveIndex(mat, nm) {
  const l2 = (nm * 1e-3) ** 2;
  let s = 1;
  for (let i = 0; i < mat.B.length; i++) s += (mat.B[i] * l2) / (l2 - mat.C[i]);
  return Math.sqrt(s);
}
/** dn/dλ in nm⁻¹ (derivata numerica). */
export const dispersion = (mat, nm) => (refractiveIndex(mat, nm + 0.5) - refractiveIndex(mat, nm - 0.5));
/** Numero di Abbe V_d = (n_d − 1)/(n_F − n_C): grande = poco dispersivo. */
export function abbe(mat) {
  return (refractiveIndex(mat, 587.56) - 1) / (refractiveIndex(mat, 486.13) - refractiveIndex(mat, 656.27));
}

// ───────────────────────────── sorgenti ─────────────────────────────
// Righe: [lunghezza d'onda in nm, intensità relativa]
export const SOURCES = {
  white: { name: 'Bianca', long: 'Lampada a incandescenza', continuous: true },
  mercury: { name: 'Mercurio', long: 'Lampada a vapori di mercurio', lines: [[404.66, 0.55], [407.78, 0.08], [435.83, 1.0], [491.6, 0.08], [546.07, 1.0], [576.96, 0.5], [579.07, 0.5]], ref: 546.07 },
  helium: { name: 'Elio', long: 'Tubo a scarica di elio', lines: [[388.87, 0.12], [402.62, 0.05], [447.15, 0.5], [471.31, 0.12], [492.19, 0.2], [501.57, 0.45], [587.56, 1.0], [667.82, 0.5], [706.52, 0.3]], ref: 587.56 },
  sodium: { name: 'Sodio', long: 'Lampada al sodio', lines: [[588.995, 1.0], [589.592, 0.5]], ref: 588.995 },
  hydrogen: { name: 'Idrogeno', long: 'Tubo a scarica di idrogeno', lines: [[656.28, 1.0], [486.13, 0.45], [434.05, 0.2], [410.17, 0.08]], ref: 656.28 },
  neon: {
    name: 'Neon', long: 'Tubo a scarica di neon', ref: 640.22,
    lines: [[540.06, 0.15], [585.25, 0.6], [588.19, 0.3], [594.48, 0.35], [597.55, 0.15], [603.0, 0.3], [607.43, 0.4], [609.62, 0.5], [614.31, 0.6], [616.36, 0.3], [621.73, 0.3], [626.65, 0.45], [630.48, 0.2], [633.44, 0.5], [638.3, 0.6], [640.22, 1.0], [650.65, 0.6], [653.29, 0.25], [659.9, 0.3], [667.83, 0.4], [671.7, 0.2], [692.95, 0.25], [703.24, 0.5]],
  },
  mono: { name: 'Monocromatica', long: 'Laser a lunghezza d\'onda regolabile', mono: true },
};

/** Righe della sorgente (per la monocromatica: l'unica riga scelta). */
export function sourceLines(key, monoNm) {
  const s = SOURCES[key];
  if (s.mono) return [[monoNm, 1]];
  return s.lines || [];
}
/** Lunghezza d'onda di riferimento per le misure. */
export function referenceLambda(key, monoNm) {
  const s = SOURCES[key];
  return s.mono ? monoNm : s.ref || 587.56;
}
const SPEC0 = 380, SPEC1 = 780;
const whiteNorm = (() => {
  const sum = [0, 0, 0];
  for (let l = SPEC0; l <= SPEC1; l += 1) { const s = planck(l, 5600), c = spectralRGB(l); for (let k = 0; k < 3; k++) sum[k] += c[k] * s; }
  return sum;
})();
/** Peso cromatico (sRGB lineare) di 1 nm di spettro continuo attorno a λ: l'intero spettro dà il bianco. */
export function whiteWeight(nm) {
  const s = planck(nm, 5600), c = spectralRGB(nm);
  return [(c[0] * s) / whiteNorm[0], (c[1] * s) / whiteNorm[1], (c[2] * s) / whiteNorm[2]];
}
/** Campioni per disegnare i raggi: [{lam, rgb}] con i colori che sommati danno quello della sorgente. */
export function displaySamples(key, monoNm, nCont = 40) {
  const s = SOURCES[key];
  if (s.continuous) {
    const out = [], step = (700 - 400) / nCont;
    for (let i = 0; i < nCont; i++) { const lam = 400 + (i + 0.5) * step; out.push({ lam, rgb: whiteWeight(lam).map((v) => v * step) }); }
    return out;
  }
  const lines = sourceLines(key, monoNm);
  const raw = lines.map(([lam, w]) => ({ lam, rgb: spectralRGB(lam).map((v) => v * w) }));
  // normalizzo sulla luminanza totale, così ogni lampada ha un fascio ugualmente visibile
  const Y = raw.reduce((a, o) => a + Math.max(0.2126 * o.rgb[0] + 0.7152 * o.rgb[1] + 0.0722 * o.rgb[2], 0), 0) || 1;
  raw.forEach((o) => { o.rgb = o.rgb.map((v) => v / Y); });
  return raw;
}

// ───────────────────────────── geometria del prisma ─────────────────────────────
export const PRISMS = {
  equilateral: { name: 'Equilatero', angles: () => [60, 60, 60] },
  right: { name: 'Retto 45°', angles: () => [45, 90, 45] },
  half: { name: '30°–60°–90°', angles: () => [30, 90, 60] },
  custom: { name: 'Angolo libero', angles: (A) => [A, (180 - A) / 2, (180 - A) / 2] },
};

/**
 * Sezione del prisma: triangolo con l'angolo rifrangente (V0) in basso, vertici in senso antiorario
 * [V0, V2, V1]. side = lunghezza del lato più lungo (m).
 * La faccia V0–V1 (a sinistra) guarda la sorgente, la faccia V0–V2 (a destra) lo schermo.
 * L'origine (asse di rotazione della piattaforma, per cui passa il fascio) sta sulla bisettrice
 * dell'angolo rifrangente, a 0,3 della distanza fra lo spigolo e il lato opposto: così il fascio
 * entra dalla faccia giusta anche ruotando molto il prisma, come serve con i vetri più rifrangenti.
 */
export function prismSection(type, apexDeg, side) {
  const [a, b, c] = PRISMS[type].angles(apexDeg).map((d) => (d * Math.PI) / 180);
  const k = side / Math.max(Math.sin(a), Math.sin(b), Math.sin(c));
  const L1 = k * Math.sin(c), L2 = k * Math.sin(b);              // lati V0V1 e V0V2
  const v0 = [0, 0];
  const v1 = [-L1 * Math.sin(a / 2), L1 * Math.cos(a / 2)];
  const v2 = [L2 * Math.sin(a / 2), L2 * Math.cos(a / 2)];
  // dove la bisettrice (asse y) incontra il lato opposto V1–V2
  const t = -v1[0] / (v2[0] - v1[0]), yq = v1[1] + t * (v2[1] - v1[1]);
  const cx = 0, cy = 0.3 * yq;
  return { verts: [v0, v2, v1].map(([x, y]) => [x - cx, y - cy]), apex: a, base: k * Math.sin(a), faces: [L2, k * Math.sin(a), L1] };
}
export function rotateSection(verts, psi) {
  const c = Math.cos(psi), s = Math.sin(psi);
  return verts.map(([x, y]) => [x * c - y * s, x * s + y * c]);
}

// ───────────────────────────── tracciamento ─────────────────────────────
const EPS = 1e-9;
/** Coefficiente di riflessione di Fresnel per luce non polarizzata. */
export function fresnel(n1, n2, ci, ct) {
  const rs = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct), rp = (n2 * ci - n1 * ct) / (n2 * ci + n1 * ct);
  return 0.5 * (rs * rs + rp * rp);
}
function hitEdge(verts, ox, oy, dx, dy, entering) {
  let best = null;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i], b = verts[(i + 1) % verts.length];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const len = Math.hypot(ex, ey), nx = ey / len, ny = -ex / len;       // normale uscente (poligono antiorario)
    const dn = dx * nx + dy * ny;
    if (entering ? dn >= -EPS : dn <= EPS) continue;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-14) continue;
    const t = ((a[0] - ox) * ey - (a[1] - oy) * ex) / den;
    const s = ((a[0] - ox) * dy - (a[1] - oy) * dx) / den;
    if (t > 1e-9 && s >= -1e-9 && s <= 1 + 1e-9 && (!best || t < best.t)) best = { t, edge: i, nx, ny, x: ox + t * dx, y: oy + t * dy, cos: Math.abs(dn), len };
  }
  return best;
}

/**
 * Segue un raggio attraverso il prisma.
 * @returns {{pts:number[][], out:number[]|null, T:number, bounces:number, i1:number, r1:number, r2:number, i2:number,
 *            edgeIn:number, edgeOut:number, miss:boolean, secondary:Array}}
 *   pts: punti del percorso principale; out: direzione d'uscita (null se la luce resta intrappolata);
 *   secondary: raggi riflessi (parziali) [{a, b, dir, w, inside}] con il peso w rispetto al raggio incidente.
 */
export function tracePrism(verts, n, ox, oy, dx, dy, withSecondary = false) {
  const res = { pts: [[ox, oy]], out: null, T: 1, bounces: 0, i1: 0, r1: 0, r2: 0, i2: 0, edgeIn: -1, edgeOut: -1, miss: false, secondary: [] };
  const h = hitEdge(verts, ox, oy, dx, dy, true);
  if (!h) { res.miss = true; res.out = [dx, dy]; return res; }
  res.pts.push([h.x, h.y]);
  res.edgeIn = h.edge;
  // rifrazione in ingresso (la normale N punta contro il raggio)
  let c = h.cos, mu = 1 / n;
  let ct = Math.sqrt(1 - mu * mu * (1 - c * c));
  const R1 = fresnel(1, n, c, ct);
  res.i1 = Math.acos(Math.min(c, 1)); res.r1 = Math.acos(Math.min(ct, 1));
  if (withSecondary) res.secondary.push({ a: [h.x, h.y], dir: [dx + 2 * c * h.nx, dy + 2 * c * h.ny], w: R1, inside: false });
  let ddx = mu * dx + (mu * c - ct) * h.nx, ddy = mu * dy + (mu * c - ct) * h.ny;
  let px = h.x, py = h.y, w = 1 - R1;
  for (let k = 0; k < 8; k++) {
    const g = hitEdge(verts, px, py, ddx, ddy, false);
    if (!g) return res;
    res.pts.push([g.x, g.y]);
    c = g.cos;
    const s2 = n * n * (1 - c * c);
    if (s2 >= 1) {
      // riflessione totale interna
      const dn = ddx * g.nx + ddy * g.ny;
      ddx -= 2 * dn * g.nx; ddy -= 2 * dn * g.ny;
      px = g.x; py = g.y; res.bounces++;
      continue;
    }
    ct = Math.sqrt(1 - s2);
    const R2 = fresnel(n, 1, c, ct);
    res.r2 = Math.acos(Math.min(c, 1)); res.i2 = Math.acos(Math.min(ct, 1));
    res.edgeOut = g.edge;
    // N = −normale uscente
    res.out = [n * ddx + (n * c - ct) * -g.nx, n * ddy + (n * c - ct) * -g.ny];
    const il = 1 / Math.hypot(res.out[0], res.out[1]);
    res.out[0] *= il; res.out[1] *= il;
    res.T = w * (1 - R2);
    if (withSecondary && w * R2 > 0.004) {
      // il riflesso interno parziale: lo seguo fino all'uscita successiva
      const dn = ddx * g.nx + ddy * g.ny;
      const rx = ddx - 2 * dn * g.nx, ry = ddy - 2 * dn * g.ny;
      const q = hitEdge(verts, g.x, g.y, rx, ry, false);
      if (q) {
        res.secondary.push({ a: [g.x, g.y], b: [q.x, q.y], w: w * R2, inside: true });
        const s3 = n * n * (1 - q.cos * q.cos);
        if (s3 < 1) {
          const ct3 = Math.sqrt(1 - s3), R3 = fresnel(n, 1, q.cos, ct3);
          res.secondary.push({ a: [q.x, q.y], dir: [n * rx + (n * q.cos - ct3) * -q.nx, n * ry + (n * q.cos - ct3) * -q.ny], w: w * R2 * (1 - R3), inside: false });
        }
      }
    }
    return res;
  }
  return res;
}

/** Deviazione (angolo antiorario dalla direzione incidente a quella emergente). */
export const deviationOf = (out) => (out ? Math.atan2(out[1], out[0]) : NaN);

/** Deviazione minima per l'angolo rifrangente A e l'indice n; NaN se la luce non può emergere. */
export function minimumDeviation(A, n) {
  const s = n * Math.sin(A / 2);
  return s <= 1 ? 2 * Math.asin(s) - A : NaN;
}

// ───────────────────────────── lo strumento ─────────────────────────────
const F_COLL = 0.16;          // focale del collimatore e del cannocchiale (m)
const APERTURE = 0.022;       // diametro utile delle lenti (m)

/**
 * Prepara il calcolo per una configurazione.
 * cfg: { mode:'screen'|'spectro', material, prism, apexDeg, side, psi, slit (m), radius (m), source, monoNm }
 */
export function buildSetup(cfg) {
  const mat = MATERIALS[cfg.material];
  const sec = prismSection(cfg.prism, cfg.apexDeg, cfg.side);
  const verts = rotateSection(sec.verts, cfg.psi);
  const x0 = -0.5;
  const setup = { cfg, mat, sec, verts, x0, F_COLL, APERTURE };
  /** Dove va a finire la luce di lunghezza d'onda nm: angolo φ, trasmissione, larghezza angolare della riga. */
  setup.landing = (nm) => {
    const n = refractiveIndex(mat, nm);
    const tr = tracePrism(verts, n, x0, 0, 1, 0, false);
    if (!tr.out || tr.miss) return null;
    const p = tr.pts[tr.pts.length - 1];
    // larghezza del fascio: limitata dalla faccia d'ingresso; il prisma la comprime o la allarga (anamorfosi)
    const beamIn = cfg.mode === 'spectro' ? Math.min(APERTURE, sec.faces[2] * Math.cos(tr.i1) * 0.92) : Math.min(cfg.slit, sec.faces[2] * Math.cos(tr.i1) * 0.92);
    const anam = (Math.cos(tr.r1) / Math.max(Math.cos(tr.i1), 1e-6)) * (Math.cos(tr.i2) / Math.max(Math.cos(tr.r2), 1e-6));
    const beamOut = Math.max(beamIn * anam, 1e-6);
    if (cfg.mode === 'spectro') {
      // cannocchiale a fuoco all'infinito: conta solo la direzione. Riga = immagine della fenditura ⊗ diffrazione
      return { phi: Math.atan2(tr.out[1], tr.out[0]), T: tr.T, width: (cfg.slit / F_COLL) / anam, sigma: (0.42 * nm * 1e-9) / beamOut, tr, n, beamOut };
    }
    // schermo ad arco di raggio R centrato sulla piattaforma
    const R = cfg.radius, b = p[0] * tr.out[0] + p[1] * tr.out[1], cc = p[0] * p[0] + p[1] * p[1] - R * R;
    const t = -b + Math.sqrt(b * b - cc);
    const lx = p[0] + t * tr.out[0], ly = p[1] + t * tr.out[1];
    return { phi: Math.atan2(ly, lx), T: tr.T, width: beamOut / R, sigma: (0.42 * nm * 1e-9) / beamOut, tr, n, beamOut, land: [lx, ly] };
  };
  return setup;
}

function erf(x) {
  const s = x < 0 ? -1 : 1, a = Math.abs(x), t = 1 / (1 + 0.3275911 * a);
  return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a));
}
/** Primitiva di (rettangolo di larghezza w) ⊗ (gaussiana σ), normalizzata a 1. */
function lineCDF(x, w, sigma) {
  if (sigma < w * 1e-3) return Math.min(Math.max(x / w + 0.5, 0), 1);
  const G = (u) => 0.5 * u * (1 + erf(u / (sigma * Math.SQRT2))) + (sigma / Math.sqrt(2 * Math.PI)) * Math.exp((-u * u) / (2 * sigma * sigma));
  if (w < sigma * 1e-3) return 0.5 * (1 + erf(x / (sigma * Math.SQRT2)));
  return (G(x + w / 2) - G(x - w / 2)) / w;
}
function stamp(out, nb, phi0, dphi, center, width, sigma, r, g, b) {
  const reach = width / 2 + 4 * sigma;
  let k0 = Math.floor((center - reach - phi0) / dphi), k1 = Math.ceil((center + reach - phi0) / dphi);
  if (k1 < 0 || k0 >= nb) return;
  k0 = Math.max(k0, 0); k1 = Math.min(k1, nb - 1);
  let prev = lineCDF(phi0 + k0 * dphi - center, width, sigma);
  for (let k = k0; k <= k1; k++) {
    const next = lineCDF(phi0 + (k + 1) * dphi - center, width, sigma);
    const f = (next - prev) / dphi;         // potenza per radiante
    out[3 * k] += r * f; out[3 * k + 1] += g * f; out[3 * k + 2] += b * f;
    prev = next;
  }
}

/**
 * Lo spettro come si vede fra gli angoli phi0 e phi1: riempie out (nb × 3, sRGB lineare, potenza per radiante).
 * Le righe sono disegnate con il loro profilo esatto; lo spettro continuo è campionato fitto nella sola
 * parte che cade nella finestra.
 */
export function renderSpectrum(setup, phi0, phi1, nb, out) {
  out.fill(0);
  const { cfg } = setup, src = SOURCES[cfg.source];
  const dphi = (phi1 - phi0) / nb;
  if (src.continuous) {
    // scansione rada per capire quali colori cadono nella finestra
    const K = 80, lam = [], phi = [];
    for (let i = 0; i <= K; i++) { const l = SPEC0 + ((SPEC1 - SPEC0) * i) / K; const L = setup.landing(l); lam.push(l); phi.push(L ? L.phi : NaN); }
    let la = Infinity, lb = -Infinity;
    const m = (phi1 - phi0) * 0.05;
    for (let i = 0; i < K; i++) {
      const a = phi[i], b = phi[i + 1];
      if (isNaN(a) || isNaN(b)) continue;
      if (Math.max(a, b) >= phi0 - m && Math.min(a, b) <= phi1 + m) { la = Math.min(la, lam[i]); lb = Math.max(lb, lam[i + 1]); }
    }
    if (la < lb) {
      const M = 1400, dl = (lb - la) / M;
      let prev = null;
      for (let j = 0; j < M; j++) {
        const l = la + (j + 0.5) * dl, L = setup.landing(l);
        if (!L) { prev = null; continue; }
        const w = whiteWeight(l);
        // ogni campione copre almeno la distanza dal vicino: nessun buco fra un colore e l'altro
        const gap = prev !== null ? Math.abs(L.phi - prev) : 0;
        stamp(out, nb, phi0, dphi, L.phi, Math.max(L.width, gap * 1.05), L.sigma, w[0] * dl * L.T, w[1] * dl * L.T, w[2] * dl * L.T);
        prev = L.phi;
      }
    }
  }
  for (const [l, w] of sourceLines(cfg.source, cfg.monoNm)) {
    const L = setup.landing(l);
    if (!L) continue;
    const c = spectralRGB(l);
    // una riga porta la potenza di una fetta di qualche nanometro di spettro continuo
    const k = w * L.T * 0.012;
    stamp(out, nb, phi0, dphi, L.phi, L.width, L.sigma, c[0] * k, c[1] * k, c[2] * k);
  }
}

/** Potere risolutivo teorico λ/Δλ = larghezza del fascio emergente × dispersione angolare. */
export function resolvingPower(setup, nm) {
  const a = setup.landing(nm - 0.25), b = setup.landing(nm + 0.25);
  if (!a || !b) return { R: 0, dphi: 0 };
  const dphi = Math.abs(b.phi - a.phi) / 0.5;                    // rad per nm
  const diff = (nm * 1e-9) / a.beamOut;                          // limite di diffrazione (rad)
  return { R: (nm * dphi) / diff, dphi, limit: Math.max(diff, a.width) / dphi };   // limit: Δλ distinguibile (nm) con questa fenditura
}
