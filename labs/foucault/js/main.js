// main.js — Il pendolo di Foucault
import * as THREE from 'three';
import { Stage } from '../../../shared/js/stage.js';
import { Tags } from '../../../shared/js/tags.js';
import { expandablePlot } from '../../../shared/js/plotview.js';
import { Foucault, foucaultRate, airyRate, OMEGA } from './pendulum.js';
import { Rig, DIAL_R, DIAL_TOP, TIP_LEN, TIP_CLEAR } from './rig.js';
import { createUI, fmt } from './ui.js';

const DEG = Math.PI / 180;
const MAX_STEPS = 40000;                 // passi d'integrazione al massimo per fotogramma
const PLACES = [['np', 'Polo Nord', 90], ['paris', 'Parigi', 48.85], ['rome', 'Roma', 41.9], ['eq', 'Equatore', 0], ['syd', 'Sydney', -33.87], ['sp', 'Polo Sud', -90]];

const state = {
  lat: 41.9, L: 15, A: 1.5, m: 28, vt: 0, ring: true, drive: true, pins: true, trace: true, theory: true, stars: false,
  warp: 10, ambient: 1, outline: false, labels: true, quality: 'low', plotKind: 'angle',
};
const BASE = { lat: 41.9, L: 15, A: 1.5, m: 28, vt: 0, ring: true, drive: true, pins: true, trace: true, theory: true, stars: false, warp: 600, plotKind: 'angle' };
// esperimenti classici: [id, testo, descrizione, impostazioni, passi, inquadratura]
const PRESETS = [
  ['paris', 'Il Panthéon, 1851', 'Il pendolo di Foucault: 67 m di filo, 28 kg d\'ottone, 3 m di ampiezza. A Parigi il piano gira di 11,3° all\'ora: un giro in 31 h 47 min', { lat: 48.85, L: 67, A: 3, m: 28, warp: 600 }, [{ release: true }], 'overview'],
  ['rome', 'A Roma', 'Un pendolo da museo di 15 m: il piano gira di 10° all\'ora, in senso orario. Ogni birillo cade circa ogni mezz\'ora', { lat: 41.9, L: 15, A: 1.5, warp: 600 }, [{ release: true }], 'overview'],
  ['pole', 'Al Polo Nord', 'Al polo il piano fa un giro in un giorno siderale. Visto dalle stelle il piano non si muove: è la Terra che gira sotto il pendolo', { lat: 90, warp: 600 }, [{ release: true }, { wait: 9 }, { set: { stars: true } }], 'top'],
  ['eq', 'All\'equatore', 'All\'equatore il piano non gira affatto: la Terra non ruota attorno alla verticale del luogo', { lat: 0, warp: 3600 }, [{ release: true }], 'top'],
  ['south', 'Nell\'emisfero australe', 'A Sydney il piano gira al contrario, in senso antiorario, di 8,4° all\'ora', { lat: -33.87, warp: 600 }, [{ release: true }], 'top'],
  ['ellipse', 'L\'ellisse che inganna', 'Un pendolo corto lanciato con una piccola spinta di traverso: l\'oscillazione diventa un\'ellisse che gira per conto suo (precessione di Airy) e la misura sbaglia', { lat: 41.9, L: 6, A: 0.6, vt: 1.5, ring: false, warp: 600 }, [{ release: true }], 'top'],
  ['charron', 'L\'anello di Charron', 'Lo stesso pendolo con l\'anello in alto: a ogni ritorno il filo lo sfiora, l\'ellisse si smorza e il piano torna a girare come vuole la Terra', { lat: 41.9, L: 6, A: 0.6, vt: 1.5, ring: true, warp: 600 }, [{ release: true }], 'top'],
  ['decay', 'Senza spinta', 'Senza la spinta elettromagnetica l\'aria frena il peso: in un paio d\'ore l\'ampiezza si dimezza e il peso non arriva più ai birilli', { drive: false, warp: 3600, plotKind: 'amp' }, [{ release: true }], 'overview'],
];
const VIEWS = [['overview', 'Panoramica'], ['top', 'Dall\'alto'], ['pins', 'I birilli'], ['up', 'Verso l\'alto']];

async function boot() {
  try {
    await Promise.all([document.fonts.load('600 20px "Geist Variable"'), document.fonts.load('italic 400 20px "Fraunces Variable"'), document.fonts.load('700 12px "Geist Mono Variable"')]);
  } catch { /* i font di sistema vanno bene lo stesso */ }
  const canvas = document.getElementById('stage');
  let stage;
  try { stage = new Stage(canvas, { keyPosition: [-3.2, 8, 5], keyTarget: [0, 0, 0], shadowBox: [-4.6, 4.6, 4.6, -4.6], shadowFar: 20, fog: [24, 140] }); } catch (err) {
    document.querySelector('#boot p').innerHTML = 'Questo laboratorio richiede WebGL 2.<small>Aggiorna il browser o attiva l\'accelerazione grafica</small>';
    console.error(err);
    return;
  }
  const { scene, camera } = stage;
  stage.controls.maxDistance = 40;
  const rig = new Rig();
  scene.add(rig.group);
  const sim = new Foucault();
  const tags = new Tags(document.getElementById('labels'));

  // ───────────────────────── stato derivato ─────────────────────────
  let paused = false, trace = [], burnT = 1, ghosts = [], seq = null, pendingView = null, plotDirty = true;
  let fpsEma = 60, hudTimer = 0, tipK = 1, Rp = 1.4;
  const placeName = () => (PLACES.find((p) => Math.abs(p[2] - state.lat) < 0.01) || [null, null])[1];
  const rate = () => foucaultRate(state.lat * DEG);

  /** Applica i parametri: geometria, birilli, posizione di partenza (il peso torna tenuto dal filo). */
  function setup() {
    const p = sim.p;
    Object.assign(p, { L: state.L, m: state.m, phi: state.lat * DEG, A: Math.min(state.A, state.L * 0.25), vt: state.vt / 100, ring: state.ring, drive: state.drive, psi0: Math.PI / 2 });
    sim.configure(); sim.hold();
    rig.setBobSize(sim.R);
    tipK = 1 + (sim.R + TIP_LEN) / p.L;
    const yc = DIAL_TOP + TIP_CLEAR + TIP_LEN + sim.R;
    rig.setTop(yc + p.L, Math.max(0.01, (p.A * 0.4) / p.L) * 0.97, state.ring);
    Rp = Math.min(p.A * tipK - 0.035, DIAL_R - 0.4);
    const rise = p.L - Math.sqrt(p.L * p.L - (Rp / tipK) ** 2);
    rig.setPins(Rp, Math.min(0.4, Math.max(0.06, TIP_CLEAR + rise * tipK + 0.035)));
    trace = []; ghosts = [];
    sim.onTurn = (x, y) => pushTrace(x, y);
    sim.onClosest = (x, y) => pushTrace(x, y);
    paused = false;
    plotDirty = true;
  }
  function pushTrace(x, y) { trace.push([x * tipK, y * tipK]); if (trace.length > 16000) trace.splice(0, trace.length - 16000); }
  function release() { if (!sim.held) return; sim.release(); burnT = 0; }
  function standPins() { rig.pins.forEach((p) => { p.down = false; p.fall = 0; }); trace = []; }

  /** Il peso fa cadere i birilli che la punta sfiora. */
  function knock() {
    if (!state.pins) return;
    const r = sim.r, x = r[0] * tipK, y = r[1] * tipK, rho = Math.hypot(x, y);
    if (Math.abs(rho - Rp) > 0.05) return;
    const N = rig.pins.length, k0 = Math.round((((Math.atan2(y, x) / (2 * Math.PI)) * N) % N + N) % N);
    for (const k of [k0 - 1, k0, k0 + 1]) {
      const pin = rig.pins[(k + N) % N];
      if (pin.down) continue;
      if (Math.hypot(x - pin.x, y - pin.y) < 0.0135 + 0.008) { pin.down = true; pin.fall = 0; pin.dir = Math.atan2(sim.v[1], sim.v[0]); }
    }
  }

  // ───────────────────────── esperimenti classici ─────────────────────────
  function stepSeq(dt) {
    if (!seq) return;
    const st = seq.list[seq.i];
    if (!st) { seq = null; return; }
    if (!seq.started) {
      seq.started = true; seq.t = 0;
      if (st.set) { Object.assign(state, st.set); ui.refresh(); ui.sync(); }
      if (st.release) release();
    }
    seq.t += dt;
    if (seq.t >= (st.wait || 0.05)) { seq.i++; seq.started = false; if (seq.i >= seq.list.length) seq = null; }
  }

  // ───────────────────────── interfaccia ─────────────────────────
  const ui = createUI(state, {
    presets: PRESETS, views: VIEWS, places: PLACES.map(([id, t, l]) => [id, t, `${Math.abs(l)}° ${l >= 0 ? 'N' : 'S'}`]),
    placeLat: (id) => PLACES.find((p) => p[0] === id)[2],
    latText: () => `${fmt.num(Math.abs(state.lat), 2)}° ${state.lat > 0 ? 'N' : state.lat < 0 ? 'S' : ''} <small>· ${Math.abs(state.lat) < 0.01 ? 'piano fermo' : `${fmt.num((Math.abs(rate()) * 3600) / DEG, 1)}°/h`}</small>`,
    lenText: () => `${fmt.num(state.L, 1)} m <small>· periodo ${fmt.num(2 * Math.PI * Math.sqrt(state.L / 9.806), 1)} s</small>`,
    ampText: () => `${fmt.num(Math.min(state.A, state.L * 0.25), 2)} m <small>· ${fmt.num(Math.asin(Math.min(state.A, state.L * 0.25) / state.L) / DEG, 1)}°</small>`,
    massText: () => `${state.m} kg <small>· sfera d'ottone ⌀ ${fmt.num(2 * Math.cbrt((3 * state.m) / (4 * Math.PI * 8500)) * 100, 1)} cm</small>`,
    vtText: () => (state.vt ? `${fmt.num(state.vt, 1)} cm/s <small>· nasce un'ellisse</small>` : 'nessuna <small>· il filo si brucia</small>'),
  }, (k, arg) => {
    switch (k) {
      case 'preset': {
        const p = PRESETS.find((x) => x[0] === arg);
        Object.assign(state, BASE, p[3]);
        setup(); ui.refresh(); ui.sync();
        seq = { list: p[4], i: 0, started: false };
        pendingView = p[5];
        break;
      }
      case 'place': state.lat = PLACES.find((p) => p[0] === arg)[2]; seq = null; setup(); ui.refresh(); ui.sync(); break;
      case 'view': setView(arg); break;
      case 'go': seq = null; if (sim.held) release(); else { setup(); } break;
      case 'pause': if (!sim.held) paused = !paused; break;
      case 'reset': standPins(); break;
      case 'fullscreen': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); break;
      case 'layout': onResize(); setTimeout(onResize, 470); break;
      case 'ambient': stage.setAmbient(0.04 + 0.96 * state.ambient); break;
      case 'quality': stage.setQuality(state.quality); break;
      case 'plotKind': ui.sync(); plotDirty = true; break;
      case 'ring': sim.p.ring = state.ring; rig.setTop(rig.ySusp, Math.max(0.01, (sim.p.A * 0.4) / sim.p.L) * 0.97, state.ring); break;
      case 'drive': sim.p.drive = state.drive; break;
      case 'pins': rig.pinMesh.visible = state.pins; break;
      case 'trace': case 'theory': case 'stars': case 'warp': case 'outline': case 'labels': break;
      case 'lat': case 'L': case 'A': case 'm': case 'vt': seq = null; setup(); ui.refresh(); ui.sync(); break;
      default: break;
    }
  });

  // ───────────────────────── etichette ─────────────────────────
  const ear = new THREE.Vector3();
  const toWorld = (x, y, h) => { ear.set(x, h, -y); if (state.stars) ear.applyAxisAngle(new THREE.Vector3(0, 1, 0), rig.earth.rotation.y); return ear; };
  tags.add('Peso d\'ottone', '', (o) => o.copy(rig.bob.position).applyAxisAngle(new THREE.Vector3(0, 1, 0), rig.earth.rotation.y).add(new THREE.Vector3(0, sim.R + 0.25, 0)), () => !sim.held);   // da fermo è accanto al paletto: parla il filo
  tags.add('Filo bruciato al lancio', '', (o) => o.copy(toWorld(Math.cos(sim.p.psi0) * (sim.p.A + 0.35), Math.sin(sim.p.psi0) * (sim.p.A + 0.35), DIAL_TOP + 0.55)), () => sim.held);
  tags.add('Nord', 'floor', (o) => o.copy(toWorld(0, DIAL_R - 0.1, DIAL_TOP)), () => !sim.held);   // da fermo il filo che tiene il peso è proprio lì
  tags.add('Birilli', 'floor alt', (o) => o.copy(toWorld(Rp * Math.cos(-0.6), Rp * Math.sin(-0.6), DIAL_TOP + 0.1)), () => state.pins);

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
      let lo = 0.05, hi = 80;
      for (let k = 0; k < 32; k++) { const d = Math.sqrt(lo * hi); put(d); const b = bounds(); if (b.x1 - b.x0 <= rect.x1 - rect.x0 && b.y1 - b.y0 <= rect.y1 - rect.y0) hi = d; else lo = d; }
      dist = hi; put(dist);
      const b = bounds(), wpp = (2 * dist * Math.tan((camera.fov * DEG) / 2)) / Hh;
      right.setFromMatrixColumn(cam.matrixWorld, 0); up.setFromMatrixColumn(cam.matrixWorld, 1);
      target.addScaledVector(right, -(((rect.x0 + rect.x1) / 2) - (b.x0 + b.x1) / 2) * wpp).addScaledVector(up, (((rect.y0 + rect.y1) / 2) - (b.y0 + b.y1) / 2) * wpp);
    }
    put(dist);
    return { pos: cam.position.toArray(), target: target.toArray() };
  }
  function viewPose(id) {
    const R = DIAL_R + 0.1;
    switch (id) {
      case 'top': { const a = Math.min(DIAL_R, sim.p.A * 1.25 + 0.3); return fitPose(V(0, 1, 1e-4).normalize(), [V(-a, DIAL_TOP, -a), V(a, DIAL_TOP, a), V(-a, DIAL_TOP, a), V(a, DIAL_TOP, -a)]); }
      case 'pins': { const x = Rp * Math.cos(Math.PI / 2 + 0.25), z = -Rp * Math.sin(Math.PI / 2 + 0.25); return { pos: [x + 0.9, DIAL_TOP + 0.45, z + 1.3], target: [x, DIAL_TOP + 0.08, z] }; }
      case 'up': return { pos: [2.2, 0.35, 2.6], target: [0, Math.min(rig.ySusp, 30), 0] };
      default: return fitPose(V(-0.45, 0.42, 1).normalize(), [V(-R, 0, -R), V(R, 0, R), V(-R, 0, R), V(R, 0, -R), V(0, 1.5, 0)]);
    }
  }
  function setView(id, instant = false) {
    const v = viewPose(id);
    if (instant) { camera.position.set(...v.pos); stage.controls.target.set(...v.target); stage.controls.update(); } else stage.flyTo(v.pos, v.target);
  }
  function onResize() {
    // il centro della prospettiva cade al centro dello spazio libero fra i pannelli: così dall'alto
    // la telecamera sta proprio sopra il pendolo e il filo, visto di scorcio, non taglia lo schermo di sbieco
    const w = window.innerWidth, hh = window.innerHeight, r = freeRect();
    stage.resize(w, hh, Math.round((r.x0 + r.x1) / 2 - w / 2), Math.round(hh / 2 - (r.y0 + r.y1) / 2));
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); document.getElementById('go').click(); }
    else if (k === 'p') document.getElementById('pause').click();
    else if (k === 'h') ui.togglePanel();
    else if (k === 'f') document.getElementById('fullscreen').click();
    else if (k >= '1' && k <= String(VIEWS.length)) setView(VIEWS[Number(k) - 1][0]);
  });

  // ───────────────────────── misure ─────────────────────────
  function hud() {
    const th = rate(), m = sim.turns.length >= 6 ? sim.measuredRate(Math.min(7200, Math.max(900, sim.t * 0.5))) : null, perH = 3600 / DEG;
    const running = !sim.held && !paused;
    ui.setStatus(sim.held ? 'tenuto dal filo' : paused ? 'in pausa' : seq ? 'oscilla · esperimento' : 'oscilla', running);
    ui.setGo(sim.held ? 'Lascia andare' : 'Ferma', !sim.held);
    ui.setPause(paused ? 'Riprendi' : 'Pausa', !sim.held);
    const rot = sim.rotated() / DEG, thRot = sim.turns.length && sim.lastTurn ? (th * (sim.lastTurn[0] - sim.turns[0][0])) / DEG : 0;
    ui.setClock(sim.held ? '—' : fmt.dur(sim.t).replace(/(\d+) (h|min|s|g)/g, '$1<small>$2</small>'));
    ui.setSide(
      sim.held ? 'premi «Lascia andare» (barra spaziatrice)' : `il piano ha girato di ${fmt.num(Math.abs(rot), 1)}° ${rot >= 0 ? 'in senso orario' : 'in senso antiorario'}`,
      sim.held ? `${placeName() || 'latitudine ' + fmt.num(state.lat, 1) + '°'} · ${fmt.num(Math.abs(th) * perH, 2)}°/h previsti` : `previsti ${fmt.num(Math.abs(thRot), 1)}° · tempo ×${state.warp}`,
    );
    const b = sim.bmin, a = sim.amax;
    const air = airyRate(a, b, sim.p.L, sim.g);
    const fallen = rig.pins.filter((p) => p.down).length;
    ui.setMetrics([
      { k: 'Luogo', v: `${fmt.num(Math.abs(state.lat), 2)}° <small>${state.lat > 0 ? 'N' : state.lat < 0 ? 'S' : ''}</small>`, s: placeName() || `g = ${fmt.num(sim.g, 3)} m/s²` },
      { k: 'Periodo', v: `${fmt.num(sim.period(), 2)} <small>s</small>`, s: `T = 2π√(L/g) · L ${fmt.num(sim.p.L, 1)} m` },
      { k: 'Rotazione prevista', v: `${fmt.num(Math.abs(th) * perH, 2)} <small>°/h</small>`, s: Math.abs(state.lat) < 0.01 ? 'all\'equatore il piano è fermo' : `${th > 0 ? 'oraria' : 'antioraria'} · un giro in ${fmt.dur((2 * Math.PI) / Math.abs(th))}`, title: 'ω = Ω·sin φ, con Ω = 360° in un giorno siderale (23 h 56 min 4 s)' },
      { k: 'Rotazione misurata', v: m !== null ? `${fmt.num(Math.abs(m) * perH, 2)} <small>°/h</small>` : '—', s: m !== null ? (Math.abs(th) > 1e-9 ? (m * th < 0 ? `al contrario! ${m > 0 ? 'oraria' : 'antioraria'}` : `scarto ${fmt.num(((m - th) / th) * 100, 1)} %`) : Math.abs(m) * perH < 0.005 ? 'fermo, come previsto' : `${m > 0 ? 'oraria' : 'antioraria'}`) : 'dai punti d\'inversione' },
      { k: 'Ellisse', p: 2, v: `${fmt.num(b * 1000, 1)} <small>mm</small>`, s: `semiasse minore · Airy ${fmt.num(air * perH, 2)}°/h`, title: 'Un\'ellisse gira da sola: ω = (3/8)·ω₀·a·b/L² (precessione di Airy)' },
      { k: 'Birilli caduti', p: 2, v: `${fallen} <small>di ${rig.pins.length}</small>`, s: state.pins ? 'uno ogni 5°' : 'tolti' },
      { k: 'Ampiezza', p: 3, v: `${fmt.num(a, 2)} <small>m</small>`, s: state.drive ? 'mantenuta dalla spinta' : 'cala per l\'aria' },
    ]);
  }

  function drawPlot() {
    plotDirty = false;
    const T = sim.turns, th = rate();
    const H = Math.max(0.25, sim.lastTurn ? sim.lastTurn[0] / 3600 : 0) * 1.08;
    const ds = (arr, f) => { const step = Math.max(1, Math.floor(arr.length / 700)); const out = []; for (let i = 0; i < arr.length; i += step) out.push(f(arr[i])); return out; };
    if (state.plotKind === 'angle') {
      const t0 = T.length ? T[0][0] : 0, p0 = T.length ? T[0][1] : 0;
      const pts = ds(T, (q) => [(q[0] - t0) / 3600, -(q[1] - p0) / DEG]);
      const tx = [0, H], ty = [0, (th * H * 3600) / DEG];
      const ys = pts.map((p) => p[1]).concat(ty);
      const Y0 = Math.min(0, ...ys) * 1.1, Y1 = Math.max(1, ...ys) * 1.1;
      ui.drawPlot({ series: [{ x: tx, y: ty, color: '#15181c', width: 2, dash: [8, 6], alpha: 0.7 }, { x: pts.map((p) => p[0]), y: pts.map((p) => p[1]), color: '#e8452c', width: 2.6 }], X0: 0, X1: H, Y0: Math.min(Y0, -1), Y1, xLabel: 'tempo (h)', yLabel: 'rotazione del piano (°, oraria)', legend: [['misurata', '#e8452c'], ['Ω·sin φ', '#15181c']] });
    } else if (state.plotKind === 'ellipse') {
      const C = sim.closest, pts = ds(C, (q) => [q[0] / 3600, q[1] * 1000]);
      ui.drawPlot({ series: [{ x: pts.map((p) => p[0]), y: pts.map((p) => p[1]), color: '#2c67dc', width: 2.4 }], X0: 0, X1: H, Y0: 0, Y1: Math.max(1, ...pts.map((p) => p[1])) * 1.15, xLabel: 'tempo (h)', yLabel: 'semiasse minore dell\'ellisse (mm)', legend: [[state.ring ? 'con l\'anello di Charron' : 'senza anello', '#2c67dc']] });
    } else {
      const pts = ds(T, (q) => [q[0] / 3600, q[2]]);
      ui.drawPlot({ series: [{ x: pts.map((p) => p[0]), y: pts.map((p) => p[1]), color: '#0c9d8f', width: 2.4 }, { x: [0, H], y: [Rp / tipK, Rp / tipK], color: '#9aa1ab', width: 1.6, dash: [5, 5] }], X0: 0, X1: H, Y0: 0, Y1: Math.max(sim.p.A, ...pts.map((p) => p[1])) * 1.12, xLabel: 'tempo (h)', yLabel: 'ampiezza (m)', legend: [['ampiezza', '#0c9d8f'], ['birilli', '#9aa1ab']] });
    }
  }

  // ───────────────────────── ciclo principale ─────────────────────────
  let last = performance.now() / 1000;
  const look = new THREE.Vector3();
  function frame(nowMs) {
    requestAnimationFrame(frame);
    const now = nowMs / 1000, rawDt = now - last, dt = Math.min(Math.max(rawDt, 0), 0.1);
    last = now;
    const w = window.innerWidth, hh = window.innerHeight;
    stepSeq(dt);
    if (pendingView) { setView(pendingView); pendingView = null; }
    ghosts = [];
    if (!sim.held && !paused) {
      const span = Math.min(dt, 0.05) * state.warp;
      let n = Math.ceil(span / sim.h);
      if (n > MAX_STEPS) n = MAX_STEPS;
      const h = Math.min(sim.h, span / Math.max(1, n));
      const every = state.warp >= 10 ? Math.max(1, Math.floor(n / 16)) : 0;
      for (let i = 0; i < n; i++) {
        sim.step(h);
        knock();
        if (every && i % every === 0) ghosts.push(sim.r.slice());
      }
      plotDirty = true;
    }
    if (burnT < 1) burnT = Math.min(1, burnT + dt / 0.6);
    rig.burn(burnT);
    // dalle stelle: la Terra (quadrante, trave, pendolo) gira sotto il piano, con Ω·sin φ
    rig.earth.rotation.y = state.stars ? rate() * sim.t : 0;
    const bw = rig.setBob(sim.r, sim.p.L, ghosts);
    rig.setPost(sim.p.psi0, sim.p.A * tipK + 0.35, sim.held, bw);
    rig.updatePins(dt);
    rig.pinMesh.visible = state.pins;
    rig.trace.visible = state.trace;
    if (state.trace) { const pts = trace.slice(-15999); if (!sim.held) pts.push([sim.r[0] * tipK, sim.r[1] * tipK]); rig.setTrace(pts); }
    stage.outlined = state.outline ? [rig.bob] : [];
    stage.update(dt);
    // guardando giù da sopra le travi (vista dall'alto su schermi stretti) il soffitto si toglie, come in uno spaccato
    rig.top.visible = !(camera.position.y > rig.ySusp - 0.9 && camera.getWorldDirection(look).y < -0.85);
    tags.update(camera, w, hh, state.labels);
    stage.render();
    fpsEma += (1 / Math.max(rawDt, 1e-3) - fpsEma) * 0.06;
    hudTimer += dt;
    if (hudTimer > 0.12) {
      hudTimer = 0; ui.setFps(Math.round(fpsEma)); hud();
      if (plotDirty) drawPlot();
      const th = rate();
      const psiM = sim.lastTurn ? sim.lastTurn[1] : null;
      const psiT = state.theory ? sim.p.psi0 - th * sim.t : null;
      ui.drawTop({ R: Math.max(0.5, sim.p.A * tipK * 1.15), trace: state.trace ? trace.slice(-6000) : [], pins: state.pins ? rig.pins : [], bob: [sim.r[0] * tipK, sim.r[1] * tipK], r: sim.R, psiMeas: psiM, psiTh: psiT, held: sim.held, post: [Math.cos(sim.p.psi0) * (sim.p.A * tipK + 0.35), Math.sin(sim.p.psi0) * (sim.p.A * tipK + 0.35)] });
    }
  }

  // ───────────────────────── avvio ─────────────────────────
  stage.setQuality(state.quality);
  stage.setAmbient(0.04 + 0.96 * state.ambient);
  setup();
  ui.refresh(); ui.sync();
  if (window.matchMedia('(max-width: 720px)').matches) ui.togglePanel();
  hud();                                   // le misure riempite danno alla striscia in basso la sua altezza vera
  onResize();
  // se la striscia delle misure o il riquadro a destra cambiano altezza, il centro della scena si sposta con loro
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => onResize()); ro.observe(document.getElementById('metrics')); ro.observe(document.getElementById('live')); }
  setView('overview', true);
  const plotView = expandablePlot(document.getElementById('plot'), { title: 'Grafico', tools: [document.getElementById('plot-kind')], redraw: () => drawPlot() });
  window.lab = { state, ui, stage, rig, sim, seq: () => seq, paused: () => paused, release, setView, plotView, THREE, OMEGA, trace: () => trace };
  requestAnimationFrame((t) => { last = t / 1000; frame(t); ui.boot(); });
}

boot();
