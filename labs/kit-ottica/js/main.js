// main.js — Il kit di ottica sulla lavagna
import * as THREE from 'three';
import { Stage } from '../../../shared/js/stage.js';
import { Tags } from '../../../shared/js/tags.js';
import { expandablePlot } from '../../../shared/js/plotview.js';
import { PIECES, nPMMA } from './shapes.js';
import { buildScene, traceBeams, convergence, fresnel } from './trace.js';
import { Board, CY, BOARD, PAPER, PROTRACTOR_R } from './board.js';
import { Beams } from './beams.js';
import { createUI, fmt } from './ui.js';

const DEG = Math.PI / 180;
const LASERS = { red: { lam: 0.65, rgb: [1.7, 0.07, 0.035], name: 'rosso' }, green: { lam: 0.532, rgb: [0.12, 1.55, 0.14], name: 'verde' }, violet: { lam: 0.405, rgb: [0.85, 0.14, 1.75], name: 'viola' } };
const ORBIT_R = 0.17;
const BOUNDS = [-BOARD.w / 2 + 0.003, -BOARD.h / 2 + 0.003, BOARD.w / 2 - 0.003, BOARD.h / 2 - 0.003];
const MAX_PIECES = 10;
const COLORS = ['#e8452c', '#2c67dc', '#0c9d8f', '#d99a12', '#7a47cf', '#d6336c', '#4f5a69', '#a8744a'];
const MARK = { n: new THREE.Color('#2a323d'), i: new THREE.Color('#2c67dc'), r: new THREE.Color('#0c9d8f'), f: new THREE.Color('#15181c') };

const state = {
  beams: 5, spacing: 10, color: 'red', orbit: false, inc: 30, phi: 0, lu: -0.2, lv: 0,
  marks: true, ext: true, weak: true, ambient: 0.6, labels: true, quality: 'low', plotKind: 'snell',
};
const BASE = { beams: 5, spacing: 10, color: 'red', orbit: false, inc: 30, phi: 0, lu: -0.2, lv: 0, marks: true, ext: true, weak: true };
const KIT = {
  lens: ['biconvex', 'biconcave', 'planoconvex', 'planoconcave', 'meniscusPos', 'meniscusNeg'],
  block: ['semicircle', 'disk', 'slab', 'prism60', 'prism45'],
  mirror: ['mirrorPlane', 'mirrorConcave', 'mirrorConvex'],
};
const P = (type, u = 0, v = 0, rot = 0) => ({ type, u, v, rot });
const sweep = (list, f) => list.flatMap((x) => f(x));
// esperimenti classici: [id, testo, descrizione, impostazioni, pezzi, passi, inquadratura]
const PRESETS = [
  ['snell', 'Legge di Snell', 'Il raggio entra nel centro della faccia piana del semicilindro: l\'angolo di rifrazione si legge sul goniometro, e dalla parte curva il raggio esce diritto. sin i / sin r è sempre lo stesso: è l\'indice n', { beams: 1, orbit: true, inc: 10, plotKind: 'snell' }, [P('semicircle')], [{ clear: true }, ...sweep([10, 20, 30, 40, 50, 60, 70, 80], (i) => [{ inc: i }, { wait: 0.6 }, { note: true }])], 'close'],
  ['tir', 'Angolo limite', 'Il raggio entra dalla parte curva diretto al centro, senza deviare, e arriva sulla faccia piana dall\'interno. Oltre 42° non esce più: riflessione totale', { beams: 1, orbit: true, inc: 20, plotKind: 'fresnel' }, [P('semicircle', 0, 0, 180)], [{ clear: true }, ...sweep([20, 30, 38, 41, 42, 43, 50, 60], (i) => [{ inc: i }, { wait: 0.7 }, { note: true }])], 'close'],
  ['conv', 'Lente convergente', 'Cinque raggi paralleli: la biconvessa li fa convergere nel fuoco, a circa 11 cm', { beams: 5, lu: -0.22, lv: 0, phi: 0 }, [P('biconvex')], [], 'front'],
  ['div', 'Lente divergente', 'La biconcava apre i raggi; i prolungamenti tratteggiati si incontrano nel fuoco virtuale, dalla parte del laser', { beams: 5, lu: -0.22, lv: 0, phi: 0 }, [P('biconcave')], [], 'front'],
  ['plano', 'Piano-convessa nei due versi', 'Con la faccia curva verso il laser i raggi vanno quasi tutti nello stesso punto; girata, quelli del bordo vanno a fuoco prima: aberrazione sferica', { beams: 5, spacing: 14, lu: -0.22, lv: 0, phi: 0 }, [P('planoconvex')], [{ wait: 3 }, { rot: [0, 180] }, { wait: 1 }], 'front'],
  ['menisci', 'I menischi', 'Due facce curve dalla stessa parte: se è più spesso al centro è convergente, se è più spesso al bordo è divergente', { beams: 5, lu: -0.22, lv: 0, phi: 0 }, [P('meniscusPos')], [{ wait: 3.5 }, { swap: [0, 'meniscusNeg'] }, { wait: 1 }], 'front'],
  ['slab', 'Lastra a facce parallele', 'Il raggio esce parallelo a quello che entra, ma spostato di lato: tanto di più quanto più è inclinato', { beams: 1, orbit: true, inc: 20 }, [P('slab', 0.0225, 0)], [{ inc: 60, dur: 4 }, { inc: 40, dur: 1.5 }], 'close'],
  ['prism', 'Prisma: deviazione minima', 'Ruotando il prisma la deviazione cala, tocca un minimo (circa 36° col laser rosso) e risale. Al minimo il raggio attraversa il prisma in modo simmetrico', { beams: 1, lu: -0.22, lv: 0.004, phi: 0 }, [P('prism60')], [{ rot: [0, -38], dur: 5 }, { rot: [0, -18], dur: 2.5 }], 'front'],
  ['retro', 'Prisma a 45°', 'Due riflessioni totali sui cateti: la luce torna indietro parallela a sé stessa, come nei catarifrangenti', { beams: 3, spacing: 13, lu: -0.22, lv: 0.004, phi: 0 }, [P('prism45', 0, 0, 135)], [], 'front'],
  ['concave', 'Specchio concavo', 'I raggi paralleli riflessi convergono nel fuoco, a metà del raggio di curvatura (10 cm)', { beams: 5, lu: -0.22, lv: 0, phi: 0 }, [P('mirrorConcave', 0.1, 0)], [], 'front'],
  ['convex', 'Specchio convesso', 'Lo specchio convesso apre i raggi: sembrano venire da un fuoco virtuale dietro lo specchio', { beams: 5, lu: -0.22, lv: 0, phi: 0 }, [P('mirrorConvex', 0.1, 0)], [], 'front'],
  ['plane', 'Specchio piano', 'L\'angolo di riflessione è uguale a quello d\'incidenza: leggili tutti e due sul goniometro', { beams: 1, orbit: true, inc: 25 }, [P('mirrorPlane')], [{ inc: 55, dur: 3 }], 'close'],
  ['ball', 'Lente sferica', 'Un cilindro pieno è una lente fortissima: i raggi vanno a fuoco subito dopo, e quelli del bordo molto prima', { beams: 5, lu: -0.22, lv: 0, phi: 0 }, [P('disk')], [], 'front'],
];
const VIEWS = [['front', 'Di fronte'], ['close', 'Il goniometro'], ['angle', 'Di tre quarti'], ['room', 'La lavagna']];

async function boot() {
  try {
    await Promise.all([document.fonts.load('600 20px "Geist Variable"'), document.fonts.load('italic 400 20px "Fraunces Variable"'), document.fonts.load('600 12px "Geist Mono Variable"')]);
  } catch { /* i font di sistema vanno bene lo stesso */ }
  const canvas = document.getElementById('stage');
  let stage;
  try { stage = new Stage(canvas, { keyPosition: [-1.2, 3.2, 2.6], keyTarget: [0, 1.0, 0], shadowBox: [-1.4, 1.4, 1.6, -1.2], shadowFar: 9 }); } catch (err) {
    document.querySelector('#boot p').innerHTML = 'Questo laboratorio richiede WebGL 2.<small>Aggiorna il browser o attiva l\'accelerazione grafica</small>';
    console.error(err);
    return;
  }
  const { scene, camera } = stage;
  const board = new Board();
  scene.add(board.group);
  const beams = new Beams();
  scene.add(beams.group);
  const tags = new Tags(document.getElementById('labels'));

  // ───────────────────────── i pezzi sulla lavagna ─────────────────────────
  let pieces = [], sel = null, dirty = true, result = null, central = null, focus = null, refPiece = null;
  let records = [], recId = 0, colorI = 0, seq = null, anim = null, pendingView = null, plotDirty = true;
  let fpsEma = 60, hudTimer = 0;
  const n = () => nPMMA(LASERS[state.color].lam);

  function addPiece(type, u, v, rot = 0) {
    if (pieces.length >= MAX_PIECES) return null;
    const mesh = board.makePiece(PIECES[type]);
    board.pieces.add(mesh);
    const p = { type, u, v, rot, mesh };
    pieces.push(p);
    place(p);
    dirty = true;
    return p;
  }
  function removePiece(p) {
    board.pieces.remove(p.mesh);
    p.mesh.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    pieces = pieces.filter((q) => q !== p);
    if (sel === p) sel = null;
    dirty = true;
  }
  function place(p) { p.mesh.position.set(p.u, p.v, 0); p.mesh.rotation.z = p.rot * DEG; }
  /** Un posto libero per un pezzo nuovo: il centro del goniometro, se è libero, poi a destra e a sinistra. */
  function freeSpot() {
    for (const [u, v] of [[0, 0], [0.13, 0], [-0.13, 0.08], [0.13, 0.09], [0.13, -0.09], [-0.1, -0.1], [0.24, 0], [0.24, 0.1]]) if (!pieces.some((p) => Math.hypot(p.u - u, p.v - v) < 0.07)) return [u, v];
    return [0.05 * pieces.length - 0.2, -0.12];
  }

  // ───────────────────────── il laser ─────────────────────────
  function laserPose() {
    if (state.orbit) { const a = state.inc * DEG; state.lu = -ORBIT_R * Math.cos(a); state.lv = ORBIT_R * Math.sin(a); state.phi = -state.inc; }
    return { u: state.lu, v: state.lv, phi: state.phi * DEG };
  }
  function beamList() {
    const L = laserPose(), k = state.beams, sp = state.spacing / 1000, dx = Math.cos(L.phi), dy = Math.sin(L.phi);
    const offs = Array.from({ length: k }, (_, i) => (i - (k - 1) / 2) * sp);
    board.setLaser(L.u, L.v, L.phi, offs, LASERS[state.color].rgb);
    return offs.map((o) => ({ x: L.u - o * dy + dx * 0.001, y: L.v + o * dx + dy * 0.001, dx, dy }));
  }

  // ───────────────────────── calcolo e disegno ─────────────────────────
  // ostacoli che non si spostano a mano: i magneti del foglio e il corpo del laser assorbono la luce che li colpisce
  const BLACK_DISK = { medium: false, edges: [{ type: 'arc', c: [0, 0], r: 0.0118, s: 0, e: 2 * Math.PI, ccw: true, kind: 'black' }] };
  const LASER_BODY = { medium: false, edges: [[-0.0015, 0.038], [-0.137, 0.038], [-0.137, -0.038], [-0.0015, -0.038]].map((a, i, A) => ({ type: 'seg', a, b: A[(i + 1) % 4], kind: 'black' })) };
  const MAGNETS = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sy]) => [sx * (PAPER.w / 2 - 0.012), sy * (PAPER.h / 2 - 0.012)]);

  function rebuild() {
    dirty = false;
    pieces.forEach(place);
    const bl = beamList();
    const L = laserPose();
    const sc = buildScene([
      ...pieces.map((p) => ({ def: PIECES[p.type], u: p.u, v: p.v, rot: p.rot * DEG })),
      ...MAGNETS.map(([u, v]) => ({ def: BLACK_DISK, u, v, rot: 0 })),
      { def: LASER_BODY, u: L.u, v: L.v, rot: L.phi },
    ]);
    result = traceBeams(sc, bl, n(), BOUNDS);
    beams.setColor(LASERS[state.color].rgb);
    beams.setRays(state.weak ? result.segs : result.segs.filter((s) => s.main), CY);
    central = result.paths[(bl.length - 1) >> 1];
    focus = state.beams > 1 ? convergence(result.paths) : null;
    const evs = central.events.filter((e) => e.type !== 'absorb');
    refPiece = evs.length ? pieces[evs[evs.length - 1].k] : null;
    drawMarks();
    plotDirty = true;
  }

  const tI = tags.add('i', 'floor', (o) => o.set(markPos.i[0], CY + markPos.i[1], 0.002), () => state.marks && !!markPos.i);
  const tR = tags.add('r', 'floor alt', (o) => o.set(markPos.r[0], CY + markPos.r[1], 0.002), () => state.marks && !!markPos.r);
  const tF = tags.add('F', '', (o) => o.set(markPos.f[0], CY + markPos.f[1], 0.002), () => !!markPos.f);
  const markPos = { i: null, r: null, f: null };

  function drawMarks() {
    beams.beginMarks();
    markPos.i = markPos.r = markPos.f = null;
    const e = firstEvent();
    if (state.marks && e && e.i > 0.5 * DEG) {
      const L = 0.045, R = 0.022;
      beams.mark('dash', e.x - L * e.nx, e.y - L * e.ny, e.x + L * e.nx, e.y + L * e.ny, MARK.n, CY);
      // i: fra la normale (dalla parte del raggio che arriva) e il raggio che arriva, preso al contrario
      const an = Math.atan2(e.ny, e.nx), ai = Math.atan2(-e.dy, -e.dx);
      const arc = (a0, a1, rad, col, kind = 'solid') => { let d = a1 - a0; d = Math.atan2(Math.sin(d), Math.cos(d)); beams.arcMark(kind, e.x, e.y, rad, a0, a0 + d, col, CY); return a0 + d / 2; };
      const mi = arc(an, ai, R, MARK.i);
      markPos.i = [e.x + (R + 0.012) * Math.cos(mi), e.y + (R + 0.012) * Math.sin(mi)];
      tags.setText(tI, `i ${fmt.deg(e.i)}`);
      if (e.type === 'refr') {
        const ar = Math.atan2(e.oy, e.ox), mr = arc(an + Math.PI, ar, R * 1.2, MARK.r);
        markPos.r = [e.x + (R * 1.2 + 0.012) * Math.cos(mr), e.y + (R * 1.2 + 0.012) * Math.sin(mr)];
        tags.setText(tR, `r ${fmt.deg(e.r)}`);
      } else {
        const ar = Math.atan2(e.oy, e.ox), mr = arc(an, ar, R * 1.2, MARK.r);
        markPos.r = [e.x + (R * 1.2 + 0.012) * Math.cos(mr), e.y + (R * 1.2 + 0.012) * Math.sin(mr)];
        tags.setText(tR, `${e.type === 'tir' ? 'riflessione totale' : 'riflesso'} ${fmt.deg(e.i)}`);
      }
    }
    if (focus && !focus.parallel) {
      const s = 0.006;
      const kind = focus.real ? 'solid' : 'dash';
      beams.mark(kind, focus.x - s, focus.y - s, focus.x + s, focus.y + s, MARK.f, CY);
      beams.mark(kind, focus.x - s, focus.y + s, focus.x + s, focus.y - s, MARK.f, CY);
      markPos.f = [focus.x, focus.y + 0.012];
      tags.setText(tF, focus.real ? 'F' : 'F virtuale');
      if (!focus.real && state.ext) {
        for (const p of result.paths) { const l = p.last; if (l && l.end !== 'stop') beams.mark('dash', l.x, l.y, focus.x, focus.y, new THREE.Color(...LASERS[state.color].rgb.map((c) => Math.min(1, c * 0.7))), CY); }
      }
    }
    beams.endMarks();
  }

  // ───────────────────────── misure ─────────────────────────
  /** L'incontro da misurare: il primo in cui il raggio centrale non arriva perpendicolare (lì non succede nulla). */
  function firstEvent() {
    if (!central) return null;
    const ev = central.events.filter((q) => q.type !== 'absorb');
    return ev.find((q) => q.i > 0.3 * DEG) || ev[0] || null;
  }
  function deviation() {
    if (!central || !central.last) return null;
    const b = central.beam, l = central.last;
    return Math.acos(Math.max(-1, Math.min(1, b.dx * l.dx + b.dy * l.dy)));
  }
  function focalMeasured() {
    if (!focus || focus.parallel || !refPiece) return null;
    return { d: Math.hypot(focus.x - refPiece.u, focus.y - refPiece.v), real: focus.real, rms: focus.rms };
  }
  function note() {
    const e = firstEvent();
    if (!e || (e.type !== 'refr' && e.type !== 'tir')) return;
    records.push({ id: ++recId, color: COLORS[colorI++ % COLORS.length], i: e.i, r: e.type === 'refr' ? e.r : null, into: e.n2 > e.n1, R: e.R, n: n(), laser: state.color });
    if (records.length > 30) records.splice(0, records.length - 30);
    plotDirty = true;
  }
  function nFit() {
    const rs = records.filter((r) => r.r !== null && r.i > 0.01);
    if (rs.length < 2) return null;
    // retta per l'origine: entrando sin r = sin i / n, uscendo sin r = n·sin i
    let a = 0, b = 0, c = 0, d = 0;
    for (const r of rs) { const x = Math.sin(r.i), y = Math.sin(r.r); if (r.into) { a += x * x; b += x * y; } else { c += x * y; d += x * x; } }
    const ests = [];
    if (b > 0) ests.push(a / b);
    if (d > 0) ests.push(c / d);
    return ests.length ? ests.reduce((s, x) => s + x, 0) / ests.length : null;
  }

  function hud() {
    const e = firstEvent(), nn = n(), fm = focalMeasured(), dv = deviation();
    let status = 'il raggio non incontra nulla';
    if (state.beams > 1 && fm) {
      ui.setTitle('Misure', ' · i raggi paralleli');
      ui.setClock(fmt.num(fm.d * 100, 1), 'cm');
      ui.setSide(`fuoco ${fm.real ? 'reale' : 'virtuale'}, dal centro`, `macchia ⌀ ${fmt.num(fm.rms * 4000, 1)} mm${refPiece && PIECES[refPiece.type].focal(nn) ? ` · nominale ${fmt.num(Math.abs(PIECES[refPiece.type].focal(nn)) * 100, 1)} cm` : ''}`);
      status = fm.real ? 'fuoco reale' : 'fuoco virtuale';
    } else if (e) {
      ui.setTitle('Misure', ' · raggio centrale');
      if (e.type === 'refr') {
        ui.setClock(fmt.num(e.r / DEG, 1), '°');
        const nm = e.n2 > e.n1 ? Math.sin(e.i) / Math.sin(e.r) : Math.sin(e.r) / Math.sin(e.i);
        ui.setSide(`i ${fmt.deg(e.i)} → r ${fmt.deg(e.r)} · ${e.n2 > e.n1 ? 'aria → acrilico' : 'acrilico → aria'}`, e.i > 0.003 ? `n = ${e.n2 > e.n1 ? 'sin i / sin r' : 'sin r / sin i'} = ${fmt.num(nm, 3)} · riflesso ${fmt.num(e.R * 100, 1)} %` : 'incidenza normale: nessuna deviazione');
        status = 'rifrazione';
      } else if (e.type === 'tir') {
        ui.setClock('totale', '');
        ui.setSide(`i ${fmt.deg(e.i)} oltre l'angolo limite ${fmt.deg(Math.asin(1 / nn))}`, 'la luce non esce: riflessione totale');
        status = 'riflessione totale';
      } else {
        ui.setClock(fmt.num(e.i / DEG, 1), '°');
        ui.setSide(`specchio: angolo di riflessione = angolo d'incidenza = ${fmt.deg(e.i)}`, `riflette il 92 % della luce`);
        status = 'riflessione';
      }
    } else { ui.setTitle('Misure', ''); ui.setClock('—', ''); ui.setSide('metti un pezzo sulla strada del raggio', ''); }
    if (seq) status += ' · esperimento';
    ui.setStatus(status, !!seq || !!anim);
    const rows = records.slice().reverse().slice(0, 12).map((r) => ({ key: r.id, color: r.color, name: `i ${fmt.deg(r.i)}<small>${r.into ? 'entra' : 'esce'} · ${LASERS[r.laser].name}</small>`, t: r.r === null ? 'totale' : `r ${fmt.deg(r.r)}`, v: r.r === null ? `R 100 %` : r.i > 0.003 ? `n ${fmt.num(r.into ? Math.sin(r.i) / Math.sin(r.r) : Math.sin(r.r) / Math.sin(r.i), 3)}` : '' }));
    ui.setRows(rows, 'Un raggio solo su una faccia del pezzo: «Annota» (A) registra i e r.');
    // fascia delle misure
    const sp = sel ? PIECES[sel.type] : refPiece ? PIECES[refPiece.type] : null, f = sp && sp.focal(nn);
    const cells = [
      { k: sp ? sp.label : 'Pezzo', v: f ? `${f > 0 ? '+' : '−'}${fmt.num(Math.abs(f) * 100, 1)} <small>cm</small>` : sp ? '—' : '—', s: sp ? `${f ? 'focale nominale · ' : ''}acrilico n ${fmt.num(nn, 4)} (${LASERS[state.color].name})` : 'scegli un pezzo dal kit', title: 'Focale paraxiale: lenti spesse in aria, specchi R/2' },
      { k: 'Incidenza', v: e ? `${fmt.num(e.i / DEG, 1)} <small>°</small>` : '—', s: e ? 'dalla normale, raggio centrale' : '&nbsp;' },
      { k: e && e.type !== 'refr' ? 'Riflessione' : 'Rifrazione', v: !e ? '—' : e.type === 'refr' ? `${fmt.num(e.r / DEG, 1)} <small>°</small>` : e.type === 'tir' ? 'totale' : `${fmt.num(e.i / DEG, 1)} <small>°</small>`, s: e && e.type === 'refr' ? `riflesso il ${fmt.num(e.R * 100, 1)} %` : e && e.type === 'tir' ? 'oltre l\'angolo limite' : e ? 'uguale all\'incidenza' : '&nbsp;' },
      { k: 'Angolo limite', p: 2, v: `${fmt.num(Math.asin(1 / nn) / DEG, 1)} <small>°</small>`, s: 'sin θ = 1/n, dall\'acrilico all\'aria' },
      { k: 'Deviazione', p: 2, v: dv !== null ? `${fmt.num(dv / DEG, 1)} <small>°</small>` : '—', s: 'fra il raggio che entra e quello che esce' },
      { k: 'Fuoco', v: fm ? `${fmt.num(fm.d * 100, 1)} <small>cm</small>` : '—', s: fm ? `${fm.real ? 'reale' : 'virtuale'}, dal centro del pezzo` : state.beams > 1 ? (focus && focus.parallel ? 'i raggi escono paralleli' : '&nbsp;') : 'servono più raggi' },
    ];
    const nf = nFit();
    if (nf) cells.push({ k: 'n dalle misure', p: 3, v: fmt.num(nf, 3), s: `${records.filter((r) => r.r !== null).length} misure · sin i / sin r` });
    ui.setMetrics(cells);
  }

  function drawPlot() {
    plotDirty = false;
    const nn = n(), e = firstEvent(), nf = nFit();
    const N = 90, xs = [], A = [], B = [];
    if (state.plotKind === 'snell') {
      for (let k = 0; k <= N; k++) { const x = k / N; xs.push(x); A.push(x / nn); B.push(nn * x <= 1 ? nn * x : NaN); }
      const pts = records.filter((r) => r.r !== null).map((r) => ({ x: Math.sin(r.i), y: Math.sin(r.r), color: r.color, r: 7 }));
      if (e && e.type === 'refr') pts.push({ x: Math.sin(e.i), y: Math.sin(e.r), color: '#15181c', r: 6, ring: true });
      ui.drawPlot({ series: [{ x: xs, y: A, color: '#2c67dc', width: 2, dash: [8, 6] }, { x: xs, y: B, color: '#0c9d8f', width: 2, dash: [8, 6] }], points: pts, X0: 0, X1: 1, Y0: 0, Y1: 1, xLabel: 'sin i', yLabel: 'sin r', legend: [['entra', '#2c67dc'], ['esce', '#0c9d8f'], ...(nf ? [[`misure: n = ${fmt.num(nf, 3)}`, '#e8452c']] : [[`teoria: n = ${fmt.num(nn, 3)}`, '#15181c']])] });
    } else if (state.plotKind === 'ir') {
      for (let k = 0; k <= N; k++) { const i = (k / N) * 90; xs.push(i); A.push(Math.asin(Math.sin(i * DEG) / nn) / DEG); const s = nn * Math.sin(i * DEG); B.push(s <= 1 ? Math.asin(s) / DEG : NaN); }
      const pts = records.filter((r) => r.r !== null).map((r) => ({ x: r.i / DEG, y: r.r / DEG, color: r.color, r: 7 }));
      if (e && e.type === 'refr') pts.push({ x: e.i / DEG, y: e.r / DEG, color: '#15181c', r: 6, ring: true });
      ui.drawPlot({ series: [{ x: xs, y: A, color: '#2c67dc', width: 2.2 }, { x: xs, y: B, color: '#0c9d8f', width: 2.2 }], points: pts, marks: [{ x: Math.asin(1 / nn) / DEG, color: '#9aa1ab' }], X0: 0, X1: 90, Y0: 0, Y1: 90, xLabel: 'i (°)', yLabel: 'r (°)', legend: [['aria → acrilico', '#2c67dc'], ['acrilico → aria', '#0c9d8f'], ['angolo limite', '#9aa1ab']] });
    } else {
      for (let k = 0; k <= N; k++) {
        const i = (k / N) * 90; xs.push(i);
        const ci = Math.cos(i * DEG), si = Math.sin(i * DEG);
        const ct = Math.sqrt(Math.max(0, 1 - (si / nn) ** 2)); A.push(fresnel(1, nn, ci, ct) * 100);
        const s2 = nn * si; B.push(s2 >= 1 ? 100 : fresnel(nn, 1, ci, Math.sqrt(1 - s2 * s2)) * 100);
      }
      const pts = records.map((r) => ({ x: r.i / DEG, y: r.R * 100, color: r.color, r: 7 }));
      if (e && (e.type === 'refr' || e.type === 'tir')) pts.push({ x: e.i / DEG, y: e.R * 100, color: '#15181c', r: 6, ring: true });
      ui.drawPlot({ series: [{ x: xs, y: A, color: '#2c67dc', width: 2.2 }, { x: xs, y: B, color: '#0c9d8f', width: 2.2 }], points: pts, marks: [{ x: Math.asin(1 / nn) / DEG, color: '#9aa1ab' }], X0: 0, X1: 90, Y0: 0, Y1: 100, xLabel: 'i (°)', yLabel: 'luce riflessa (%)', legend: [['aria → acrilico', '#2c67dc'], ['acrilico → aria', '#0c9d8f']] });
    }
  }

  // ───────────────────────── esperimenti classici ─────────────────────────
  function animate(set, from, to, dur) { anim = { set, from, to, t: 0, dur }; }
  function stepAnim(dt) {
    if (!anim) return;
    anim.t = Math.min(1, anim.t + dt / anim.dur);
    const k = anim.t < 0.5 ? 4 * anim.t ** 3 : 1 - (-2 * anim.t + 2) ** 3 / 2;
    anim.set(anim.from + (anim.to - anim.from) * k);
    dirty = true;
    if (anim.t >= 1) anim = null;
  }
  function stepSeq(dt) {
    if (!seq) return;
    const st = seq.list[seq.i];
    if (!st) { seq = null; return; }
    if (!seq.started) {
      seq.started = true; seq.t = 0;
      if (st.inc !== undefined) animate((v) => { state.inc = v; ui.refresh('inc'); }, state.inc, st.inc, st.dur ?? Math.max(0.5, Math.abs(st.inc - state.inc) / 25));
      if (st.rot) { const p = pieces[st.rot[0]]; if (p) animate((v) => { p.rot = v; ui.refresh('rot'); }, p.rot, st.rot[1], st.dur ?? 1.4); }
      if (st.swap) { const p = pieces[st.swap[0]]; if (p) { const { u, v, rot } = p; removePiece(p); sel = addPiece(st.swap[1], u, v, rot); syncSel(); } }
      if (st.note) { if (dirty) rebuild(); note(); }
      if (st.clear) { records = []; colorI = 0; plotDirty = true; }
    }
    seq.t += dt;
    const done = st.wait ? seq.t >= st.wait : (st.inc !== undefined || st.rot) ? !anim : seq.t > 0.05;
    if (done) { seq.i++; seq.started = false; if (seq.i >= seq.list.length) seq = null; }
  }
  function loadPreset(id) {
    const p = PRESETS.find((x) => x[0] === id);
    seq = null; anim = null;
    for (const q of [...pieces]) removePiece(q);
    Object.assign(state, BASE, p[3]);
    for (const q of p[4]) addPiece(q.type, q.u, q.v, q.rot);
    sel = null; selLaser = false;
    ui.refresh(); syncSel();
    seq = { list: p[5], i: 0, started: false };
    pendingView = p[6];
    dirty = true;
  }

  // ───────────────────────── interfaccia ─────────────────────────
  const ui = createUI(state, {
    presets: PRESETS.map(([id, t, d]) => [id, t, d]), views: VIEWS,
    kit: Object.fromEntries(Object.entries(KIT).map(([g, ids]) => [g, ids.map((id) => [id, PIECES[id].short || PIECES[id].label])])),
    incText: () => `${fmt.num(Math.abs(state.inc), 1)}° <small>· ${state.inc >= 0 ? 'dall\'alto' : 'dal basso'}</small>`,
    phiText: () => `${fmt.num(state.phi, 1)}°`,
    selRot: () => (sel ? Math.round(wrap180(sel.rot) * 2) / 2 : 0),
    setSelRot: (v) => { if (sel) sel.rot = v; },
    rotText: () => (sel ? `${fmt.num(wrap180(sel.rot), 1)}°` : '—'),
  }, (k, arg) => {
    switch (k) {
      case 'preset': loadPreset(arg); break;
      case 'view': setView(arg); break;
      case 'add': { if (!PIECES[arg]) break; seq = null; const [u, v] = freeSpot(); const p = addPiece(arg, u, v, 0); if (p) { sel = p; syncSel(); } break; }
      case 'rot': seq = null; anim = null; dirty = true; break;
      case 'flip': if (sel) { sel.rot = wrap180(sel.rot + 180); ui.refresh('rot'); dirty = true; } break;
      case 'center': if (sel) { sel.u = 0; sel.v = 0; dirty = true; } break;
      case 'remove': if (sel) { removePiece(sel); syncSel(); } break;
      case 'clear-kit': for (const q of [...pieces]) removePiece(q); syncSel(); break;
      case 'aim': { state.orbit = false; const L = laserPose(); state.phi = Math.round((Math.atan2(-L.v, -L.u) / DEG) * 2) / 2; ui.refresh(); ui.sync(); dirty = true; break; }
      case 'note': note(); break;
      case 'clear': records = []; colorI = 0; plotDirty = true; break;
      case 'plotKind': ui.sync(); plotDirty = true; break;
      case 'fullscreen': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); break;
      case 'layout': onResize(); setTimeout(onResize, 470); break;
      case 'ambient': stage.setAmbient(0.04 + 0.96 * state.ambient); board.setAmbient(state.ambient); break;
      case 'quality': stage.setQuality(state.quality); break;
      case 'labels': break;
      case 'orbit': if (!state.orbit) laserPose(); ui.sync(); ui.refresh(); dirty = true; break;
      case 'inc': case 'phi': seq = null; anim = null; dirty = true; break;
      default: ui.sync(syncName()); dirty = true; break;
    }
  });
  const wrap180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
  const syncName = () => (sel ? PIECES[sel.type].label : null);
  function syncSel() { ui.sync(syncName()); ui.refresh('rot'); }

  // ───────────────────────── trascinare, ruotare, scegliere ─────────────────────────
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), hit3 = new THREE.Vector3();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.006);
  let drag = null, hoverTick = 0;
  const setRay = (e) => { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); raycaster.setFromCamera(ndc, camera); };
  const boardPoint = () => (raycaster.ray.intersectPlane(plane, hit3) ? [hit3.x, hit3.y - CY] : null);
  function pick(e) {
    setRay(e);
    const targets = [board.knob, board.laser, board.pieces];
    const hits = raycaster.intersectObjects(targets, true).filter((h) => h.object.userData.pick && visibleChain(h.object));
    if (!hits.length) return null;
    const o = hits[0].object;
    if (o.userData.pick === 'knob') return { kind: 'knob' };
    if (o.userData.pick === 'laser') return { kind: 'laser' };
    const p = pieces.find((q) => { let x = o; while (x) { if (x === q.mesh) return true; x = x.parent; } return false; });
    return p ? { kind: 'piece', p } : null;
  }
  const visibleChain = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
  canvas.addEventListener('pointerdown', (e) => {
    stage.cancelTween();
    if (e.button !== 0) return;
    const h = pick(e);
    if (!h) { if (sel || selLaser) { sel = null; selLaser = false; syncSel(); } return; }
    const bp = boardPoint();
    if (!bp) return;
    seq = null; anim = null;
    if (h.kind === 'piece') { sel = h.p; selLaser = false; syncSel(); drag = { kind: 'piece', p: h.p, du: bp[0] - h.p.u, dv: bp[1] - h.p.v }; }
    else if (h.kind === 'laser') { selLaser = true; sel = null; syncSel(); state.orbit = false; ui.refresh(); ui.sync(syncName()); drag = { kind: 'laser', du: bp[0] - state.lu, dv: bp[1] - state.lv }; }
    else drag = { kind: 'knob' };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('grabbing');
    e.stopImmediatePropagation();
  }, { capture: true });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) { if (e.buttons === 0 && (hoverTick++ & 1) === 0) canvas.classList.toggle('grab', !!pick(e)); return; }
    setRay(e);
    const bp = boardPoint();
    if (!bp) return;
    const lim = (u, v) => [Math.max(BOUNDS[0] + 0.03, Math.min(BOUNDS[2] - 0.03, u)), Math.max(BOUNDS[1] + 0.03, Math.min(BOUNDS[3] - 0.03, v))];
    if (drag.kind === 'piece') {
      let [u, v] = lim(bp[0] - drag.du, bp[1] - drag.dv);
      if (Math.hypot(u, v) < 0.006) { u = 0; v = 0; }              // il centro del goniometro attira
      drag.p.u = u; drag.p.v = v;
    } else if (drag.kind === 'laser') {
      [state.lu, state.lv] = lim(bp[0] - drag.du, bp[1] - drag.dv);
    } else {
      const k = knobRef();
      if (!k) return;
      let a = Math.atan2(bp[1] - k.v, bp[0] - k.u) / DEG - k.base;
      a = e.shiftKey ? a : Math.round(a * 2) / 2;
      if (k.laser) { state.phi = wrap180(a); ui.refresh('phi'); } else { sel.rot = wrap180(a); ui.refresh('rot'); }
    }
    dirty = true;
    e.stopImmediatePropagation();
  }, { capture: true });
  const endDrag = (e) => {
    if (!drag) return;
    drag = null;
    canvas.classList.remove('grabbing');
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    e.stopImmediatePropagation();
  };
  canvas.addEventListener('pointerup', endDrag, { capture: true });
  canvas.addEventListener('pointercancel', endDrag, { capture: true });
  let selLaser = false;
  /** La manopola: attorno al pezzo scelto (in alto) o dietro al laser. */
  function knobRef() {
    if (sel) return { u: sel.u, v: sel.v, rho: PIECES[sel.type].extent + 0.025, base: 90, a: (sel.rot + 90) * DEG };
    if (selLaser && !state.orbit) return { u: state.lu, v: state.lv, rho: 0.165, base: 180, a: (state.phi + 180) * DEG, laser: true };
    return null;
  }

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'h') ui.togglePanel();
    else if (k === 'f') document.getElementById('fullscreen').click();
    else if (k === 'a') note();
    else if ((k === 'q' || k === 'e') && sel) { sel.rot = wrap180(sel.rot + (k === 'q' ? 1 : -1) * (e.shiftKey ? 0.1 : 1)); ui.refresh('rot'); seq = null; dirty = true; }
    else if ((k === 'delete' || k === 'backspace') && sel) { removePiece(sel); syncSel(); }
    else if (k === 'escape') { sel = null; selLaser = false; syncSel(); }
    else if (k >= '1' && k <= String(VIEWS.length)) setView(VIEWS[Number(k) - 1][0]);
  });

  // ───────────────────────── inquadrature ─────────────────────────
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  function freeRect() {
    const Wd = window.innerWidth, Hh = window.innerHeight, m = 22;
    const live = document.getElementById('live').getBoundingClientRect(), lay = ui.layout();
    if (Wd <= 860) return { x0: m, x1: Wd - m, y0: 96, y1: (live.height ? live.top : Hh) - m };
    return { x0: lay.left + m + 20, x1: (live.height ? live.left : Wd) - m - 20, y0: 84, y1: lay.metricsTop - m };
  }
  function fitPose(dirv, pts) {
    const cam = camera.clone(), rect = freeRect(), Wd = window.innerWidth, Hh = window.innerHeight;
    const target = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3());
    const pv = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
    const bounds = () => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, behind = false;
      for (const p of pts) { pv.copy(p).project(cam); if (pv.z > 1 || pv.z < -1) behind = true; const x = (pv.x * 0.5 + 0.5) * Wd, y = (-pv.y * 0.5 + 0.5) * Hh; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      return behind ? { x0: 0, x1: Infinity, y0: 0, y1: Infinity } : { x0, x1, y0, y1 };
    };
    const put = (d) => { cam.position.copy(target).addScaledVector(dirv, d); cam.lookAt(target); cam.updateMatrixWorld(); };
    let dist = 3;
    for (let it = 0; it < 3; it++) {
      let lo = 0.05, hi = 40;
      for (let k = 0; k < 30; k++) { const d = Math.sqrt(lo * hi); put(d); const b = bounds(); if (b.x1 - b.x0 <= rect.x1 - rect.x0 && b.y1 - b.y0 <= rect.y1 - rect.y0) hi = d; else lo = d; }
      dist = hi; put(dist);
      const b = bounds(), wpp = (2 * dist * Math.tan((camera.fov * DEG) / 2)) / Hh;
      right.setFromMatrixColumn(cam.matrixWorld, 0); up.setFromMatrixColumn(cam.matrixWorld, 1);
      target.addScaledVector(right, -(((rect.x0 + rect.x1) / 2) - (b.x0 + b.x1) / 2) * wpp).addScaledVector(up, (((rect.y0 + rect.y1) / 2) - (b.y0 + b.y1) / 2) * wpp);
    }
    put(dist);
    return { pos: cam.position.toArray(), target: target.toArray() };
  }
  function viewPose(id) {
    const pw = PAPER.w / 2 + 0.01, ph = PAPER.h / 2 + 0.01;
    const paper = [V(-pw, CY - ph, 0), V(pw, CY - ph, 0), V(-pw, CY + ph, 0), V(pw, CY + ph, 0)];
    switch (id) {
      case 'close': { const r = PROTRACTOR_R + 0.03; return fitPose(V(0.05, 0.06, 1).normalize(), [V(-r, CY - r, 0), V(r, CY - r, 0), V(-r, CY + r, 0), V(r, CY + r, 0)]); }
      case 'angle': return fitPose(V(-0.55, 0.2, 1).normalize(), paper);
      case 'room': return fitPose(V(-0.4, 0.12, 1).normalize(), [V(-0.72, 0, 0.3), V(0.72, 0, -0.3), V(-0.72, CY + 0.45, 0), V(0.72, CY + 0.45, 0)]);
      default: return fitPose(V(0.08, 0.1, 1).normalize(), paper);
    }
  }
  function setView(id, instant = false) {
    const v = viewPose(id);
    if (instant) { camera.position.set(...v.pos); stage.controls.target.set(...v.target); stage.controls.update(); } else stage.flyTo(v.pos, v.target);
  }
  function onResize() {
    const w = window.innerWidth, hh = window.innerHeight, lay = ui.layout();
    stage.resize(w, hh, w > 860 ? Math.round(lay.left / 2) : 0, w > 860 ? Math.round((hh - lay.metricsTop) / 2) : 0);
  }
  window.addEventListener('resize', onResize);

  tags.add('Laser', '', (o) => { const L = laserPose(); o.set(L.u - 0.065 * Math.cos(L.phi), CY + L.v - 0.065 * Math.sin(L.phi) + 0.045, 0.03); });

  // ───────────────────────── ciclo principale ─────────────────────────
  let last = performance.now() / 1000;
  function frame(nowMs) {
    requestAnimationFrame(frame);
    const now = nowMs / 1000, rawDt = now - last, dt = Math.min(Math.max(rawDt, 0), 0.1);
    last = now;
    const w = window.innerWidth, hh = window.innerHeight;
    stepAnim(dt);
    stepSeq(dt);
    if (dirty) rebuild();
    if (pendingView) { setView(pendingView); pendingView = null; }
    const k = knobRef();
    board.setKnob(!!k, k ? k.u : 0, k ? k.v : 0, k ? k.rho : 0.1, k ? k.a : 0);
    stage.outlined = sel ? [sel.mesh] : selLaser ? [board.laser] : [];
    stage.update(dt);
    tags.update(camera, w, hh, state.labels);
    stage.render();
    fpsEma += (1 / Math.max(rawDt, 1e-3) - fpsEma) * 0.06;
    hudTimer += dt;
    if (hudTimer > 0.12) { hudTimer = 0; ui.setFps(Math.round(fpsEma)); hud(); if (plotDirty) drawPlot(); }
  }

  // ───────────────────────── avvio ─────────────────────────
  stage.setQuality(state.quality);
  stage.setAmbient(0.04 + 0.96 * state.ambient); board.setAmbient(state.ambient);
  addPiece('biconvex', 0, 0, 0);
  ui.refresh(); syncSel();
  if (window.matchMedia('(max-width: 720px)').matches) ui.togglePanel();
  onResize();
  rebuild();
  setView('front', true);
  const plotView = expandablePlot(document.getElementById('plot'), { title: 'Grafico', tools: [document.getElementById('plot-kind')], redraw: () => drawPlot() });
  window.lab = { state, ui, stage, board, beams, pieces: () => pieces, sel: () => sel, knob: () => knobRef(), result: () => result, focus: () => focus, central: () => central, records: () => records, seq: () => seq, anim: () => anim, setView, loadPreset, plotView, THREE, markDirty: () => { dirty = true; } };
  requestAnimationFrame((t) => { last = t / 1000; frame(t); ui.boot(); });
}

boot();
