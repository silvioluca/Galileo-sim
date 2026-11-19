// main.js — Il prisma ottico
import * as THREE from 'three';
import { Stage } from '../../../shared/js/stage.js';
import { Tags } from '../../../shared/js/tags.js';
import { expandablePlot } from '../../../shared/js/plotview.js';
import { displayRGB, cssRGB } from '../../../shared/js/color.js';
import { Apparatus, AXIS_H, ARC_PHI0, ARC_PHI1, TABLE_TOP, PRISM_H } from './apparatus.js';
import { Beams } from './beams.js';
import {
  MATERIALS, SOURCES, PRISMS, refractiveIndex, abbe, prismSection, tracePrism, minimumDeviation,
  buildSetup, renderSpectrum, resolvingPower, displaySamples, sourceLines, referenceLambda, deviationOf,
} from './prism.js';
import { createUI, fmt } from './ui.js';

const DEG = Math.PI / 180;
const state = {
  mode: 'screen', source: 'white', monoNm: 532,
  material: 'f2', prism: 'equilateral', apex: 45, side: 30,
  psi: 24.1, slitScreen: 1.2, slitSpectro: 30, radius: 0.6, theta: 48.2,
  ev: 0, ambient: 0.6, air: true, notes: true, labels: true, quality: 'low',
  zoomAuto: true, zoomScreen: 6, zoomSpectro: 3, plotLog: false,
};

// [id, testo, descrizione, impostazioni, λ su cui portare il prisma in deviazione minima]
const PRESETS = [
  ['newton', 'Luce bianca', 'L\'esperimento di Newton: il bianco contiene tutti i colori', { mode: 'screen', source: 'white', material: 'f2', prism: 'equilateral', side: 30, slitScreen: 1.2, radius: 0.6 }, 589],
  ['mercury', 'Righe del mercurio', 'Lo spettroscopio separa le righe della lampada', { mode: 'spectro', source: 'mercury', material: 'f2', prism: 'equilateral', side: 30, slitSpectro: 30 }, 546.07],
  ['sodium', 'Doppietto del sodio', 'Due righe gialle distanti appena 0,6 nm', { mode: 'spectro', source: 'sodium', material: 'sf11', prism: 'equilateral', side: 40, slitSpectro: 8, zoomAuto: false, zoomSpectro: 9 }, 589.29],
  ['balmer', 'Serie di Balmer', 'Le righe visibili dell\'idrogeno', { mode: 'spectro', source: 'hydrogen', material: 'sf10', prism: 'equilateral', side: 35, slitSpectro: 30 }, 486.13],
  ['tir', 'Riflessione totale', 'Un prisma retto usato come specchio', { mode: 'screen', source: 'mono', monoNm: 532, material: 'bk7', prism: 'right', side: 34, slitScreen: 1.2, radius: 0.6, psi: -22.5 }, null],
  ['diamond', 'Fuoco del diamante', 'Indice altissimo e grande dispersione', { mode: 'screen', source: 'white', material: 'diamond', prism: 'custom', apex: 30, side: 26, slitScreen: 1.2, radius: 0.6 }, 589],
];
const VIEWS = [['overview', 'Panoramica'], ['prism', 'Prisma'], ['top', 'Dall\'alto'], ['result', 'Schermo / oculare'], ['source', 'Dalla sorgente']];
const QUALITY = { low: { samples: 24 }, medium: { samples: 40 }, high: { samples: 64 } };
const ZOOM_SCREEN = [0.25, 0.5, 1, 2, 3, 5, 8, 12, 20, 35, 60, 70];          // semi-ampiezza della vista (gradi)
const ZOOM_SPECTRO = [8, 6, 4, 3, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.025];         // campo dell'oculare (gradi)
const NB_ARC = 4096, NB_VIEW = 768, NB_REF = 2048;
const TARGET = 1.6;
const SYMBOL = { white: ['W', 'tungsteno'], mercury: ['Hg', 'mercurio'], helium: ['He', 'elio'], sodium: ['Na', 'sodio'], hydrogen: ['H', 'idrogeno'], neon: ['Ne', 'neon'], mono: ['', 'laser'] };

const cssColor = (nm) => cssRGB(displayRGB(nm));
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

async function boot() {
  try {
    await Promise.all([document.fonts.load('600 20px "Geist Variable"'), document.fonts.load('italic 400 20px "Fraunces Variable"'), document.fonts.load('500 12px "Geist Mono Variable"')]);
  } catch { /* i font di sistema vanno bene lo stesso */ }

  const canvas = document.getElementById('stage');
  let stage;
  try { stage = new Stage(canvas, { keyTarget: [0, 0, -0.1], shadowBox: [-1.0, 1.0, 0.9, -0.9] }); } catch (err) {
    document.querySelector('#boot p').innerHTML = 'Questo laboratorio richiede WebGL 2.<small>Aggiorna il browser o attiva l\'accelerazione grafica</small>';
    console.error(err);
    return;
  }
  const { scene, camera, renderer } = stage;
  const app = new Apparatus();
  scene.add(app.group);
  const beams = new Beams(AXIS_H);
  scene.add(beams.group);
  const tags = new Tags(document.getElementById('labels'));

  // spettro sullo schermo ad arco: texture 1D in potenza per radiante
  const arcData = new Float32Array(NB_ARC * 4);
  const arcTex = new THREE.DataTexture(arcData, NB_ARC, 1, THREE.RGBAFormat, THREE.FloatType);
  arcTex.minFilter = arcTex.magFilter = THREE.NearestFilter;
  arcTex.needsUpdate = true;
  app.specUniforms.tSpec.value = arcTex;
  app.specUniforms.band.value.set(0.5, 0.05);
  const arcBuf = new Float32Array(NB_ARC * 3), viewBuf = new Float32Array(NB_VIEW * 3), refBuf = new Float32Array(NB_REF * 3);
  const viewLum = new Float32Array(NB_VIEW);

  let setup = null, prismKey = '', arcR = 0, refLum = 1, refChan = 1, refKey = '';
  let dirtySetup = true, dirtyView = true, metricsDirty = true;
  let view = { phiA: 0, phiB: 1 };
  let thetaTween = null, psiTween = null;
  let fpsEma = 60, hudTimer = 0;
  let dprCap = Infinity, perfAcc = 0, perfN = 0, lastScaleChange = 0;

  const cfg = () => ({
    mode: state.mode, material: state.material, prism: state.prism, apexDeg: state.apex, side: state.side * 1e-3,
    psi: state.psi * DEG, slit: state.mode === 'spectro' ? state.slitSpectro * 1e-6 : state.slitScreen * 1e-3,
    radius: state.radius, source: state.source, monoNm: state.monoNm,
  });
  const refLam = () => referenceLambda(state.source, state.monoNm);
  /** Rotazione del prisma per la deviazione minima alla lunghezza d'onda nm (gradi), NaN se impossibile. */
  function psiMinFor(nm) {
    const sec = prismSection(state.prism, state.apex, state.side * 1e-3);
    const s = refractiveIndex(MATERIALS[state.material], nm) * Math.sin(sec.apex / 2);
    return s < 1 ? (Math.asin(s) - sec.apex / 2) / DEG : NaN;
  }
  /** Righe da mostrare e da puntare: quelle della lampada, oppure alcuni colori di riferimento per il bianco. */
  function namedLines() {
    if (state.source === 'white') return [656.3, 589.3, 546.1, 486.1, 435.8, 404.7].map((l) => [l, 1]);
    return sourceLines(state.source, state.monoNm);
  }

  // ───────────────────────── i fasci nella scena ─────────────────────────
  function drawBeams() {
    beams.begin();
    const spectro = state.mode === 'spectro';
    const xSrc = spectro ? -0.088 : -0.17, reach = spectro ? 0.33 : state.radius;
    const samples = displaySamples(state.source, state.monoNm, QUALITY[state.quality].samples);
    const sum = [0, 0, 0];
    for (const s of samples) for (let k = 0; k < 3; k++) sum[k] += Math.max(s.rgb[k], 0);
    const m = Math.max(sum[0], sum[1], sum[2], 1e-9);
    const hueIn = state.source === 'white' ? [1, 1, 1] : sum.map((v) => v / m);
    const Ys = samples.map((s) => Math.max(lum(...s.rgb), 0)), Ymax = Math.max(...Ys, 1e-9);
    const mat = MATERIALS[state.material];
    const endOf = (p, d) => {
      const b = p[0] * d[0] + p[1] * d[1], c = p[0] * p[0] + p[1] * p[1] - reach * reach;
      const t = -b + Math.sqrt(Math.max(b * b - c, 0));
      return [p[0] + t * d[0], p[1] + t * d[1]];
    };
    const nRef = refractiveIndex(mat, refLam());
    // ordine "a bit invertiti": vicino al prisma, dove i colori si sovrappongono, nessuno prevale
    const order = samples.map((_, i) => i).sort((a, b) => bitrev(a) - bitrev(b));
    for (const oy of spectro ? [-0.0065, 0, 0.0065] : [0]) {
      const main = oy === 0, k = main ? 1 : 0.45;
      const ref = tracePrism(setup.verts, nRef, xSrc, oy, 1, 0, main);
      // i raggi di bordo che mancano il prisma sono fermati dal diaframma del collimatore
      if (ref.miss || (!main && ref.edgeIn !== 2)) { if (main) { const e = endOf([xSrc, oy], [1, 0]); beams.ray(xSrc, oy, e[0], e[1], hueIn, 0.55 * k); } continue; }
      beams.ray(xSrc, oy, ref.pts[1][0], ref.pts[1][1], hueIn, 0.62 * k);
      // nel vetro i colori quasi coincidono: un solo fascio
      for (let i = 1; i < ref.pts.length - 1; i++) beams.ray(ref.pts[i][0], ref.pts[i][1], ref.pts[i + 1][0], ref.pts[i + 1][1], hueIn, 0.5 * k);
      // fuori dal vetro si separano
      for (const i of order) {
        const s = samples[i];
        const tr = tracePrism(setup.verts, refractiveIndex(mat, s.lam), xSrc, oy, 1, 0, false);
        if (!tr.out || tr.miss) continue;
        const p = tr.pts[tr.pts.length - 1], e = endOf(p, tr.out);
        const w = state.source === 'white' ? 0.22 + 0.42 * (Ys[i] / Ymax) : samples.length > 1 ? 0.3 + 0.55 * (Ys[i] / Ymax) : 0.75;
        // verso lo schermo il fascio sfuma: la luce si vede soprattutto dove arriva
        beams.ray(p[0], p[1], e[0], e[1], displayRGB(s.lam), w * tr.T * k, main, w * tr.T * k * (spectro ? 0.8 : 0.3));
      }
      // riflessioni parziali (Fresnel): deboli ma visibili
      if (main) {
        for (const sc of ref.secondary) {
          const a = Math.min(1, sc.w * 7) * 0.45;
          if (sc.b) beams.ray(sc.a[0], sc.a[1], sc.b[0], sc.b[1], hueIn, a, false);
          else { const L = Math.hypot(sc.dir[0], sc.dir[1]); const e = [sc.a[0] + (sc.dir[0] / L) * 0.22, sc.a[1] + (sc.dir[1] / L) * 0.22]; beams.ray(sc.a[0], sc.a[1], e[0], e[1], hueIn, a, false); }
        }
      }
      // linee di costruzione per la lunghezza d'onda di riferimento
      if (main && state.notes && ref.out) {
        const pin = ref.pts[1], pout = ref.pts[ref.pts.length - 1];
        const nrm = (p, q, len) => { const ux = q[0] - p[0], uy = q[1] - p[1], l = Math.hypot(ux, uy); return [-uy / l * len, ux / l * len]; };
        for (const [p, edge] of [[pin, ref.edgeIn], [pout, ref.edgeOut]]) {
          const v = setup.verts, a = v[edge], b = v[(edge + 1) % 3], d = nrm(a, b, 0.032);
          beams.note(p[0] - d[0], p[1] - d[1], p[0] + d[0], p[1] + d[1]);
        }
        beams.note(pin[0], pin[1], pin[0] + 0.24, pin[1]);
        const dev = deviationOf(ref.out);
        // vertice dell'angolo δ: dove la direzione d'uscita, prolungata all'indietro, incontra quella d'ingresso
        const t = Math.abs(ref.out[1]) > 1e-6 ? -pout[1] / ref.out[1] : 0;
        const c = [pout[0] + t * ref.out[0], 0], r = 0.075;
        const N = 28;
        for (let j = 0; j < N; j++) {
          const a0 = (dev * j) / N, a1 = (dev * (j + 1)) / N;
          beams.note(c[0] + r * Math.cos(a0), r * Math.sin(a0), c[0] + r * Math.cos(a1), r * Math.sin(a1), true);
        }
        devMark = [c[0] + r * 1.25 * Math.cos(dev / 2), r * 1.25 * Math.sin(dev / 2)];
      } else if (main) devMark = null;
    }
    beams.end(state.notes);
    app.setSource(state.source === 'mono', hueIn, SYMBOL[state.source][0], SYMBOL[state.source][1]);
  }
  let devMark = null;
  const bitrev = (i) => { let r = 0; for (let b = 0; b < 10; b++) r |= ((i >> b) & 1) << (9 - b); return r; };

  // ───────────────────────── spettri ─────────────────────────
  /** Angoli entro cui cade lo spettro della sorgente. */
  function spectrumSpan() {
    const ls = state.source === 'white' ? [400, 550, 700] : sourceLines(state.source, state.monoNm).map((l) => l[0]);
    let lo = Infinity, hi = -Infinity;
    for (const l of ls) { const L = setup.landing(l); if (L) { lo = Math.min(lo, L.phi - L.width); hi = Math.max(hi, L.phi + L.width); } }
    return isFinite(lo) ? [lo, hi] : null;
  }

  function computeReference() {
    // riferimento per l'esposizione: il massimo dello spettro intero (la luminosità non cambia con lo zoom)
    const key = JSON.stringify([cfg(), state.mode]);
    if (key === refKey) return;
    refKey = key;
    if (state.mode === 'screen') {
      renderSpectrum(setup, ARC_PHI0, ARC_PHI1, NB_ARC, arcBuf);
      let mx = 0;
      let mc = 0;
      for (let k = 0; k < NB_ARC; k++) { arcData[4 * k] = arcBuf[3 * k]; arcData[4 * k + 1] = arcBuf[3 * k + 1]; arcData[4 * k + 2] = arcBuf[3 * k + 2]; arcData[4 * k + 3] = 1; mx = Math.max(mx, lum(arcBuf[3 * k], arcBuf[3 * k + 1], arcBuf[3 * k + 2])); mc = Math.max(mc, arcBuf[3 * k], arcBuf[3 * k + 1], arcBuf[3 * k + 2]); }
      arcTex.needsUpdate = true;
      refLum = Math.max(mx, 1e-12); refChan = Math.max(mc, 1e-12);
    } else {
      const span = spectrumSpan();
      if (!span) { refLum = 1; return; }
      const pad = Math.max((span[1] - span[0]) * 0.1, 0.002);
      renderSpectrum(setup, span[0] - pad, span[1] + pad, NB_REF, refBuf);
      let mx = 0, mc = 0;
      for (let k = 0; k < NB_REF; k++) { mx = Math.max(mx, lum(refBuf[3 * k], refBuf[3 * k + 1], refBuf[3 * k + 2])); mc = Math.max(mc, refBuf[3 * k], refBuf[3 * k + 1], refBuf[3 * k + 2]); }
      refLum = Math.max(mx, 1e-12); refChan = Math.max(mc, 1e-12);
    }
  }

  function chooseWindow() {
    const span = spectrumSpan();
    if (state.mode === 'spectro') {
      if (state.zoomAuto && span) {
        const w = Math.min(Math.max(((span[1] - span[0]) / DEG) * 1.35, 0.5), 8);
        let i = ZOOM_SPECTRO.findIndex((z) => z <= w);
        state.zoomSpectro = i < 0 ? ZOOM_SPECTRO.length - 1 : Math.max(i - 1, 0);
      }
      const f = ZOOM_SPECTRO[state.zoomSpectro] * DEG;
      view = { phiA: state.theta * DEG - f / 2, phiB: state.theta * DEG + f / 2 };
      return;
    }
    let c = 40 * DEG, half = 20 * DEG;
    if (span) {
      c = 0.5 * (span[0] + span[1]);
      if (state.zoomAuto) {
        const need = Math.max(((span[1] - span[0]) / 2 / DEG) * 1.3, 1.2);
        const i = ZOOM_SCREEN.findIndex((z) => z >= need);
        state.zoomScreen = i < 0 ? ZOOM_SCREEN.length - 1 : i;
      }
    }
    half = ZOOM_SCREEN[state.zoomScreen] * DEG;
    view = { phiA: c - half, phiB: c + half };
  }

  function drawHUD() {
    chooseWindow();
    renderSpectrum(setup, view.phiA, view.phiB, NB_VIEW, viewBuf);
    // il profilo traccia la componente di colore più intensa: righe blu e viola restano visibili
    for (let k = 0; k < NB_VIEW; k++) viewLum[k] = Math.max(viewBuf[3 * k], viewBuf[3 * k + 1], viewBuf[3 * k + 2], 0);
    const exposure = (TARGET / refLum) * 2 ** state.ev;
    const lines = namedLines().filter(() => state.source !== 'white' || state.mode === 'spectro').map(([lam]) => { const L = setup.landing(lam); return L ? { lam, phi: L.phi } : null; }).filter(Boolean);
    ui.drawView({ mode: state.mode, spec: viewBuf, nb: NB_VIEW, phiA: view.phiA, phiB: view.phiB, exposure, ambient: state.ambient, lines, theta: state.theta * DEG });
    const colors = [];
    ui.drawPlot({
      flip: state.mode === 'screen',
      lum: viewLum, nb: NB_VIEW, phiA: view.phiA, phiB: view.phiB, peak: refChan, log: state.plotLog,
      colorAt: (k) => colors[k] || (colors[k] = (() => { const r = viewBuf[3 * k], g = viewBuf[3 * k + 1], b = viewBuf[3 * k + 2]; const m = Math.max(r, g, b, 1e-12); return cssRGB([Math.max(r, 0) / m, Math.max(g, 0) / m, Math.max(b, 0) / m]).replace('rgb', 'rgba').replace(')', ',0.55)'); })()),
    });
    const w = (view.phiB - view.phiA) / DEG;
    ui.setViewInfo(state.mode === 'spectro' ? `campo ${fmt.num(w, w < 1 ? 2 : 1)}°${state.zoomAuto ? '' : ' · manuale'}` : `vista ${fmt.num(w, w < 2 ? 1 : 0)}° di schermo${state.zoomAuto ? '' : ' · manuale'}`);
    app.specUniforms.specGain.value = (2.2 / refLum) * 2 ** state.ev;
  }

  // ───────────────────────── misure ─────────────────────────
  function updateMetrics() {
    metricsDirty = false;
    const mat = MATERIALS[state.material], lam0 = refLam(), n0 = refractiveIndex(mat, lam0);
    const sec = setup.sec, A = sec.apex;
    const L0 = setup.landing(lam0);
    const dmin = minimumDeviation(A, n0), pm = psiMinFor(lam0);
    const atMin = L0 && isFinite(pm) && Math.abs(state.psi - pm) < 0.15;
    const tr = L0 ? L0.tr : null;
    // deviazione = direzione del raggio emergente (sullo schermo la macchia è un po' spostata: il raggio non esce dal centro)
    const dev0 = tr ? deviationOf(tr.out) : NaN;
    let status = !L0 ? 'luce intrappolata' : tr.bounces ? 'riflessione totale' : atMin ? 'deviazione minima' : `δ = ${fmt.deg(dev0, 1)}`;
    if (state.mode === 'spectro') {
      const th = state.theta * DEG;
      // la riga più vicina al crocicchio
      let best = null;
      for (const [lam] of namedLines()) { const L = setup.landing(lam); if (L && (!best || Math.abs(L.phi - th) < Math.abs(best.L.phi - th))) best = { lam, L }; }
      const on = best && Math.abs(best.L.phi - th) < Math.max(best.L.width, 2e-4) * 1.5;
      const nMeas = Math.sin((A + th) / 2) / Math.sin(A / 2);
      const lamR = best ? best.lam : lam0, R = resolvingPower(setup, lamR);
      const dd = R.dphi / DEG * 60;
      ui.setMetrics([
        { k: 'Lettura', v: fmt.dms(th).replace(/ (\d+″)$/, ' <small>$1</small>'), s: on ? `sulla riga ${fmt.nm(best.lam)}` : 'nessuna riga nel crocicchio', title: 'Angolo fra il cannocchiale e la direzione del collimatore, letto sul cerchio graduato' },
        { k: 'n misurato', v: fmt.num(nMeas, 4), s: 'n = sin((A+δ)/2) / sin(A/2)', title: 'Vale se il prisma è in deviazione minima per la riga osservata: premi «δ min» e porta il crocicchio sulla riga' },
        { k: 'Indice vero', p: 2, v: best ? fmt.num(refractiveIndex(mat, best.lam), 4) : '—', s: best ? `${mat.name} a ${fmt.num(best.lam, 1)} nm` : '' },
        { k: 'Potere risolutivo', p: 2, v: fmt.num(R.R, 0), s: `Δλ minimo ${fmt.num(R.limit, R.limit < 1 ? 2 : 1)} nm`, title: 'R = λ/Δλ: limitato dalla larghezza del fascio (diffrazione) e da quella della fenditura' },
        { k: 'Dispersione', p: 3, v: `${fmt.num(dd, dd < 1 ? 2 : 1)}′<small>/nm</small>`, s: `a ${fmt.num(lamR, 0)} nm` },
      ]);
      if (on) { const pmL = psiMinFor(best.lam); status = isFinite(pmL) && Math.abs(state.psi - pmL) < 0.15 ? 'riga in deviazione minima' : `riga ${fmt.num(best.lam, 1)} nm`; }
    } else {
      const multi = state.source !== 'mono' && (state.source === 'white' || sourceLines(state.source).length > 1);
      let fan = null;
      if (multi) {
        const ls = state.source === 'white' ? [400, 700] : sourceLines(state.source).map((l) => l[0]).sort((a, b) => a - b);
        const a = setup.landing(ls[0]), b = setup.landing(ls[ls.length - 1]);
        if (a && b) fan = Math.abs(a.phi - b.phi);
      }
      ui.setMetrics([
        { k: 'Indice', v: fmt.num(n0, 4), s: `a ${fmt.num(lam0, 0)} nm · Abbe ${fmt.num(abbe(mat), 1)}`, title: 'Indice di rifrazione del materiale (equazione di Sellmeier) e numero di Abbe: più è basso, più il vetro disperde i colori' },
        { k: 'Deviazione', v: L0 ? fmt.deg(dev0, 2) : '—', s: isFinite(dmin) ? `minima ${fmt.deg(dmin, 2)}` : 'nessun passaggio simmetrico', title: 'Angolo fra il fascio che entra e quello che esce' },
        { k: 'Angoli', p: 2, v: tr && !tr.bounces ? `${fmt.num(tr.i1 / DEG, 1)}° → ${fmt.num(tr.i2 / DEG, 1)}°` : '—', s: 'incidenza → emergenza', title: 'In deviazione minima i due angoli sono uguali: il raggio attraversa il prisma in modo simmetrico' },
        multi ? { k: 'Ventaglio', v: fan ? fmt.deg(fan, 2) : '—', s: fan ? `${fmt.len(fan * state.radius)} sullo schermo` : '', title: 'Angolo fra il primo e l\'ultimo colore dello spettro' }
          : { k: 'Angolo limite', v: fmt.deg(Math.asin(1 / n0), 1), s: 'oltre: riflessione totale', title: 'Dentro il vetro, oltre questo angolo d\'incidenza la luce non esce più' },
        { k: 'Trasmissione', p: 3, v: L0 ? fmt.pct(L0.T) : '—', s: 'perdite per riflessione', title: 'Frazione di luce che esce dal prisma: il resto è riflesso dalle facce (Fresnel)' },
      ]);
    }
    ui.setStatus(status, false);
    ui.setDispNote(`n_d ${fmt.num(refractiveIndex(mat, 587.56), 4)} · V ${fmt.num(abbe(mat), 1)}`);
    const curve = [];
    for (let l = 380; l <= 780; l += 4) curve.push(refractiveIndex(mat, l));
    ui.drawDispersion({ curves: { [state.material]: curve }, current: state.material, lines: state.source === 'white' ? [] : sourceLines(state.source, state.monoNm).map((l) => l[0]), refLam: lam0, refN: n0 });
    ui.setAim(state.mode === 'spectro' ? namedLines().filter(([lam]) => setup.landing(lam)).map(([lam]) => ({ lam, css: cssColor(lam) })) : []);
  }

  // ───────────────────────── interfaccia ─────────────────────────
  const caption = () => {
    const src = state.source === 'mono' ? `laser ${state.monoNm} nm` : SOURCES[state.source].long.toLowerCase();
    return `${src} · prisma ${PRISMS[state.prism].name.toLowerCase()} in ${MATERIALS[state.material].name}${state.mode === 'spectro' ? ` · θ = ${fmt.dms(state.theta * DEG)}` : ''}`;
  };
  const ui = createUI(state, {
    sources: Object.entries(SOURCES), prisms: Object.entries(PRISMS), materials: Object.entries(MATERIALS),
    presets: PRESETS, views: VIEWS, cssColor, caption,
  }, (key, arg) => {
    switch (key) {
      case 'preset': {
        const p = PRESETS.find((x) => x[0] === arg);
        Object.assign(state, { zoomAuto: true, ev: 0 }, p[3]);
        if (p[4]) { const pm = psiMinFor(p[4]); if (isFinite(pm)) state.psi = Math.round(pm * 100) / 100; }
        if (state.mode === 'spectro' && p[4]) { setup = buildSetup(cfg()); const L = setup.landing(p[4]); if (L) state.theta = L.phi / DEG; }
        ui.refresh(); ui.sync(); dirtySetup = true;
        setView('overview');
        break;
      }
      case 'view': setView(arg); break;
      case 'zoom':
        if (arg === 0) state.zoomAuto = true;
        else {
          state.zoomAuto = false;
          if (state.mode === 'spectro') state.zoomSpectro = Math.min(Math.max(state.zoomSpectro + arg, 0), ZOOM_SPECTRO.length - 1);
          else state.zoomScreen = Math.min(Math.max(state.zoomScreen - arg, 0), ZOOM_SCREEN.length - 1);
        }
        ui.sync(); dirtyView = true; break;
      case 'plotLog': state.plotLog = !state.plotLog; ui.sync(); dirtyView = true; break;
      case 'minDev': {
        // in spettroscopio: deviazione minima per la riga nel crocicchio, poi il cannocchiale la segue
        let lam = refLam();
        if (state.mode === 'spectro') {
          let best = null;
          for (const [l] of namedLines()) { const L = setup.landing(l); if (L && (!best || Math.abs(L.phi - state.theta * DEG) < best.d)) best = { l, d: Math.abs(L.phi - state.theta * DEG) }; }
          if (best) lam = best.l;
        }
        const pm = psiMinFor(lam);
        if (isFinite(pm)) psiTween = { a: state.psi, b: pm, t: 0, follow: state.mode === 'spectro' ? lam : null };
        break;
      }
      case 'aim': { const L = setup.landing(arg); if (L) thetaTween = { a: state.theta, b: L.phi / DEG, t: 0 }; break; }
      case 'fullscreen': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); break;
      case 'layout': onResize(); setTimeout(onResize, 470); break;
      case 'ambient': stage.setAmbient(0.04 + 0.96 * state.ambient); dirtyView = true; break;
      case 'theta': dirtyView = true; metricsDirty = true; break;
      case 'ev': refKey = ''; dirtySetup = true; break;
      case 'labels': break;
      case 'air': beams.group.visible = state.air; break;
      case 'quality': dprCap = Infinity; stage.setQuality(state.quality, dprCap); dirtySetup = true; break;
      case 'mode': case 'source': case 'prism':
        // il prisma torna in deviazione minima (il retto, che lavora per riflessione totale, a −22,5°)
        if (state.prism === 'right') { if (key === 'prism') state.psi = -22.5; } else {
          const pm = psiMinFor(refLam());
          if (isFinite(pm)) state.psi = Math.round(pm * 100) / 100;
        }
        state.zoomAuto = true;
        if (state.mode === 'spectro') { setup = buildSetup(cfg()); const L = setup.landing(refLam()); if (L) state.theta = Math.min(Math.max(L.phi / DEG, -20), 160); }
        ui.refresh(); ui.sync(); dirtySetup = true;
        if (key === 'mode') setView('overview');
        break;
      default: dirtySetup = true; break;
    }
  });

  // ───────────────────────── etichette ─────────────────────────
  const srcName = () => (state.source === 'mono' ? `Laser · ${state.monoNm} nm` : SOURCES[state.source].long);
  const tSrc = tags.add('', '', (o) => o.set(state.mode === 'spectro' ? -0.41 : -0.3, AXIS_H + 0.1, 0));
  const tPrism = tags.add('', '', (o) => o.set(0, TABLE_TOP + PRISM_H + 0.014, 0));
  tags.add('Schermo', '', (o) => { const L = setup && setup.landing(refLam()); const a = L ? Math.min(Math.max(L.phi, ARC_PHI0 + 0.1), ARC_PHI1 - 0.1) : 0.6; o.set(state.radius * Math.cos(a), AXIS_H + 0.115, -state.radius * Math.sin(a)); }, () => state.mode === 'screen');
  const tDev = tags.add('δ', 'floor nocase', (o) => o.set(devMark[0], AXIS_H, -devMark[1]), () => state.notes && !!devMark && state.mode === 'screen');
  tags.add('Collimatore', '', (o) => o.set(-0.2, AXIS_H + 0.022, 0), () => state.mode === 'spectro');
  tags.add('Cannocchiale', '', (o) => { const t = state.theta * DEG; o.set(0.2 * Math.cos(t), AXIS_H + 0.022, -0.2 * Math.sin(t)); }, () => state.mode === 'spectro');
  tags.add('Cerchio graduato', '', (o) => o.set(0.02, 0.12, 0.115), () => state.mode === 'spectro');

  // ───────────────────────── trascinamento ─────────────────────────
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), v3 = new THREE.Vector3(), plane = new THREE.Plane();
  let drag = null, hoverTick = 0;
  const visibleChain = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const ray = (e) => { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); raycaster.setFromCamera(ndc, camera); };
  const pick = (e) => { ray(e); return raycaster.intersectObjects(app.dragTargets, false).find((h) => visibleChain(h.object)); };
  const angleOn = (e) => (raycaster.ray.intersectPlane(plane, v3) ? Math.atan2(-v3.z, v3.x) : null);
  canvas.addEventListener('pointerdown', (e) => {
    stage.cancelTween();
    if (e.button !== 0) return;
    const hit = pick(e);
    if (!hit) { canvas.classList.add('dragging'); return; }
    const what = hit.object.userData.drag;
    plane.setFromNormalAndCoplanarPoint(v3.set(0, 1, 0), new THREE.Vector3(0, what === 'prism' ? TABLE_TOP : AXIS_H, 0));
    const a0 = angleOn(e);
    if (a0 === null) return;
    drag = { what, a0, v0: what === 'prism' ? state.psi : state.theta };
    thetaTween = psiTween = null;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('turning');
    e.stopImmediatePropagation();
  }, { capture: true });
  canvas.addEventListener('pointermove', (e) => {
    if (drag) {
      ray(e);
      const a = angleOn(e);
      if (a !== null) {
        let d = (a - drag.a0) / DEG;
        d = ((d + 540) % 360) - 180;
        if (drag.what === 'prism') { state.psi = Math.round(Math.min(Math.max(drag.v0 + d, -90), 90) * 10) / 10; ui.refresh('psi'); dirtySetup = true; } else { state.theta = Math.min(Math.max(drag.v0 + d, -20), 160); ui.refresh('theta'); dirtyView = true; metricsDirty = true; }
      }
      e.stopImmediatePropagation();
    } else if (e.buttons === 0 && (hoverTick++ & 1) === 0) canvas.classList.toggle('sliding', !!pick(e));
  }, { capture: true });
  const endDrag = (e) => {
    canvas.classList.remove('dragging');
    if (!drag) return;
    drag = null;
    canvas.classList.remove('turning');
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    e.stopImmediatePropagation();
  };
  canvas.addEventListener('pointerup', endDrag, { capture: true });
  canvas.addEventListener('pointercancel', endDrag, { capture: true });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'arrowright') {
      e.preventDefault();
      const s = (k === 'arrowright' ? 1 : -1) * (e.shiftKey ? 10 : 1);
      if (state.mode === 'spectro') { state.theta = Math.min(Math.max(state.theta + s * 0.01, -20), 160); ui.refresh('theta'); dirtyView = true; metricsDirty = true; } else { state.psi = Math.min(Math.max(Math.round((state.psi + s * 0.1) * 10) / 10, -90), 90); ui.refresh('psi'); dirtySetup = true; }
    } else if (k === 'h') ui.togglePanel();
    else if (k === 'f') document.getElementById('fullscreen').click();
    else if (k >= '1' && k <= String(VIEWS.length)) setView(VIEWS[Number(k) - 1][0]);
    else if (k === 'escape') document.getElementById('lightbox').classList.remove('on');
  });

  // ───────────────────────── inquadrature ─────────────────────────
  function viewPose(id) {
    const sp = state.mode === 'spectro', R = state.radius;
    const L = setup && setup.landing(refLam());
    const dev = L ? L.phi : 45 * DEG;
    switch (id) {
      case 'prism': return { pos: [0.08, 0.3, 0.2], target: [0.005, AXIS_H, 0] };
      case 'top': return sp ? { pos: [-0.05, 1.05, 0.02], target: [-0.05, 0, -0.05] } : { pos: [0.05, 1.75, 0.02], target: [0.02, 0, -0.12] };
      case 'result':
        if (sp) { const t = state.theta * DEG; return { pos: [0.52 * Math.cos(t), AXIS_H + 0.09, -0.52 * Math.sin(t)], target: [0, AXIS_H - 0.02, 0] }; }
        // di lato rispetto al ventaglio, per vedere la macchia di luce sulla carta
        return { pos: [0.3 * Math.cos(dev - 0.7), AXIS_H + 0.07, -0.3 * Math.sin(dev - 0.7)], target: [R * 0.97 * Math.cos(dev), AXIS_H - 0.005, -R * 0.97 * Math.sin(dev)] };
      case 'source': return sp ? { pos: [-0.62, 0.36, 0.2], target: [0.08, AXIS_H - 0.04, -0.04] } : { pos: [-0.66, 0.4, 0.26], target: [0.15, AXIS_H - 0.05, -0.12] };
      default:
        if (camera.aspect < 0.8) return sp ? { pos: [0.12, 0.95, 1.0], target: [-0.04, 0.14, -0.04] } : { pos: [0.32, 1.6, 1.75], target: [0.08, 0.1, -0.18] };
        return sp ? { pos: [0.3, 0.7, 0.86], target: [-0.1, 0.11, -0.05] } : { pos: [0.3, 0.98, 1.3], target: [0.02, 0.06, -0.16] };
    }
  }
  function setView(id, instant = false) {
    const v = viewPose(id);
    const k = Math.max(1, Math.min(2.2, 1.15 / camera.aspect));
    const pos = v.pos.map((p, i) => v.target[i] + (p - v.target[i]) * (id === 'overview' ? 1 : k));
    if (instant) { camera.position.set(...pos); stage.controls.target.set(...v.target); stage.controls.update(); } else stage.flyTo(pos, v.target);
  }

  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    const lay = ui.layout();
    stage.resize(w, h, w > 860 ? Math.round(lay.left / 2) : 0, w > 860 ? Math.round((h - lay.metricsTop) / 2) : 0);
  }
  window.addEventListener('resize', onResize);

  // ───────────────────────── ciclo principale ─────────────────────────
  let last = performance.now() / 1000;
  function frame(nowMs) {
    requestAnimationFrame(frame);
    const now = nowMs / 1000;
    const rawDt = now - last, dt = Math.min(Math.max(rawDt, 0), 0.1);
    last = now;
    const w = window.innerWidth, h = window.innerHeight;
    const ease = (t) => 1 - (1 - t) ** 3;
    if (psiTween) {
      psiTween.t = Math.min(psiTween.t + dt / 0.7, 1);
      state.psi = psiTween.a + (psiTween.b - psiTween.a) * ease(psiTween.t);
      ui.refresh('psi'); dirtySetup = true;
      if (psiTween.t >= 1) {
        state.psi = Math.round(psiTween.b * 100) / 100;
        if (psiTween.follow) { setup = buildSetup(cfg()); const L = setup.landing(psiTween.follow); if (L) thetaTween = { a: state.theta, b: L.phi / DEG, t: 0 }; }
        psiTween = null;
      }
    }
    if (thetaTween) {
      thetaTween.t = Math.min(thetaTween.t + dt / 0.6, 1);
      state.theta = thetaTween.a + (thetaTween.b - thetaTween.a) * ease(thetaTween.t);
      ui.refresh('theta'); dirtyView = true; metricsDirty = true;
      if (thetaTween.t >= 1) thetaTween = null;
    }
    if (dirtySetup) {
      dirtySetup = false;
      setup = buildSetup(cfg());
      const pk = [state.prism, state.apex, state.side, state.material].join();
      if (pk !== prismKey) { prismKey = pk; app.setPrism(setup.sec.verts, MATERIALS[state.material].tint); }
      if (state.mode === 'screen' && arcR !== state.radius) { arcR = state.radius; app.setArc(state.radius); }
      drawBeams();
      computeReference();
      tags.setText(tSrc, srcName());
      tags.setText(tPrism, `Prisma · ${MATERIALS[state.material].name}`);
      dirtyView = true; metricsDirty = true;
    }
    if (dirtyView) {
      dirtyView = false;
      app.layout({ mode: state.mode, psi: state.psi * DEG, theta: state.theta * DEG });
      drawHUD();
    }
    if (devMark) tags.setText(tDev, `δ = ${fmt.deg(deviationOf(setup.landing(refLam())?.tr.out || [1, 0]), 1)}`);

    stage.update(dt);
    tags.update(camera, w, h, state.labels);
    stage.render();

    fpsEma += (1 / Math.max(rawDt, 1e-3) - fpsEma) * 0.06;
    hudTimer += dt;
    if (hudTimer > 0.1) {
      hudTimer = 0;
      ui.setFps(Math.round(fpsEma));
      if (metricsDirty) updateMetrics();
    }
    if (state.quality === 'medium' && document.visibilityState === 'visible') {
      perfAcc += rawDt; perfN++;
      if (perfN >= 90) {
        const avg = perfAcc / perfN; perfAcc = 0; perfN = 0;
        const cur = renderer.getPixelRatio();
        if (avg > 0.034 && cur > 0.75 && nowMs - lastScaleChange > 1500) { dprCap = Math.max(0.7, cur - 0.2); lastScaleChange = nowMs; stage.setQuality(state.quality, dprCap); onResize(); } else if (avg < 0.0145 && cur < Math.min(window.devicePixelRatio || 1, 1.5) - 0.01 && nowMs - lastScaleChange > 9000) { dprCap = cur + 0.15; lastScaleChange = nowMs; stage.setQuality(state.quality, dprCap); onResize(); }
      }
    }
  }

  // ───────────────────────── avvio ─────────────────────────
  state.psi = Math.round(psiMinFor(589) * 100) / 100;
  stage.setQuality(state.quality, dprCap);
  stage.setAmbient(0.04 + 0.96 * state.ambient);
  ui.refresh(); ui.sync();
  if (window.matchMedia('(max-width: 720px)').matches) ui.togglePanel();
  onResize();
  setup = buildSetup(cfg());
  setView('overview', true);
  const plotView = expandablePlot(document.getElementById('plot'), { title: 'Intensità lungo lo spettro', tools: [document.getElementById('plot-log')], redraw: () => { dirtyView = true; } });
  window.lab = { state, ui, stage, app, beams, setup: () => setup, setView, plotView, THREE, mark: () => { dirtySetup = true; } };
  requestAnimationFrame((t) => {
    last = t / 1000; frame(t);
    const b = document.getElementById('boot');
    b.classList.add('done'); setTimeout(() => b.remove(), 900);
  });
}

boot();
