// main.js — Il principio di Bernoulli
import * as THREE from 'three';
import { Stage } from '../../../shared/js/stage.js';
import { Tags } from '../../../shared/js/tags.js';
import { expandablePlot } from '../../../shared/js/plotview.js';
import { PIPE, G, RHO_W, RHO_A, NU_W, makeProfile, solveQ, heads, at, jetU, JET, BALLS, Ball } from './flow.js';
import { Rig, TUBE_TOP, RES, BEAKER } from './rig.js';
import { createUI, fmt } from './ui.js';

const state = {
  app: 'venturi', profile: 'venturi', throat: 13, H: 40, valve: 32, ideal: false,
  pitot: false, aspirator: false, tracers: true, slow: false,
  U0: 12, tilt: 0, ball: 'pingpong', smoke: true, forces: false,
  outline: false, labels: true, quality: 'low', plotKind: 'line',
};
const BASE = { profile: 'venturi', throat: 13, H: 40, valve: 32, ideal: false, pitot: false, aspirator: false, tracers: true, slow: false, U0: 12, tilt: 0, ball: 'pingpong', smoke: true, forces: false, plotKind: 'line' };
// esperimenti classici: [id, testo, descrizione, impostazioni, passi, inquadratura]
// passi: {set} · {wait: s} · {note} · {sweep: {key, to, dur}} · {push: ±1} · {drop}
const PRESETS = [
  ['venturi', 'Il tubo di Venturi', 'Dove il tubo si stringe l\'acqua accelera e la pressione cala: nei tubicini sopra la gola l\'acqua sale meno. Oltre, la pressione risale, ma non del tutto: un po\' di energia si perde', { app: 'venturi' }, [], 'front'],
  ['pitot', 'Il carico totale', 'Nei tubi di Pitot, con la presa rivolta contro corrente, l\'acqua sale di v²/2g in più: la somma h + v²/2g resta quasi la stessa lungo tutto il tubo', { app: 'venturi', pitot: true }, [], 'front'],
  ['ideal', 'Il fluido ideale', 'Senza attrito né vortici la pressione oltre la gola torna al valore d\'ingresso: vale Bernoulli esatto, p + ½ρv² = costante', { app: 'venturi', ideal: true }, [], 'front'],
  ['step', 'La strozzatura brusca', 'Un restringimento a spigolo vivo: oltre, la corrente si stacca dalla parete e fa vortici, e molta energia va persa. Allargamento brusco: perdita di Borda–Carnot', { app: 'venturi', profile: 'step', valve: 45 }, [], 'front'],
  ['meter', 'Il venturimetro', 'Si apre la valvola un poco alla volta e si annotano la portata, misurata con il becher, e il dislivello fra l\'ingresso e la gola: Δh cresce come Q². È un misuratore di portata', { app: 'venturi', valve: 12, plotKind: 'meter' }, [14, 19, 24, 29, 34, 38].flatMap((v) => [{ sweep: { key: 'valve', to: v, dur: 1 } }, { wait: 3.5 }, { note: true }]), 'front'],
  ['suction', 'L\'aspiratore', 'Aprendo la valvola la pressione alla gola scende sotto quella atmosferica e l\'inchiostro viene risucchiato nel tubo: è la pompa a getto d\'acqua, ed è lo spruzzatore', { app: 'venturi', aspirator: true, valve: 28 }, [{ wait: 2 }, { sweep: { key: 'valve', to: 58, dur: 6 } }], 'close'],
  ['ball', 'La pallina che galleggia', 'La spinta dell\'aria regge la pallina dove la velocità del getto vale circa 8,6 m/s: lì la resistenza uguaglia il peso. Di lato non scappa', { app: 'jet', U0: 12, tilt: 0 }, [{ drop: true }], 'overview'],
  ['tilt', 'Il getto inclinato', 'Anche con l\'asciugacapelli inclinato la pallina resta nel getto: sul fianco verso l\'asse l\'aria corre più veloce, la pressione è più bassa e la tiene dentro. Oltre i 35–40° cade', { app: 'jet', U0: 11, tilt: 0, forces: true }, [{ drop: true }, { wait: 2 }, { sweep: { key: 'tilt', to: 34, dur: 9 } }], 'front'],
  ['push', 'Spinta e ritorno', 'Spinta di lato, la pallina esce dall\'asse e ci ritorna, oscillando: è in equilibrio stabile', { app: 'jet', U0: 12, tilt: 0, forces: true }, [{ drop: true }, { wait: 2.5 }, { push: 1 }, { wait: 2.5 }, { push: -1 }, { wait: 2.5 }, { push: 1 }], 'front'],
];
const VIEWS = [['overview', 'Panoramica'], ['front', 'Di fronte'], ['close', 'Da vicino']];

async function boot() {
  try {
    await Promise.all([document.fonts.load('600 20px "Geist Variable"'), document.fonts.load('italic 400 20px "Fraunces Variable"'), document.fonts.load('700 12px "Geist Mono Variable"')]);
  } catch { /* i font di sistema vanno bene lo stesso */ }
  const canvas = document.getElementById('stage');
  let stage;
  try { stage = new Stage(canvas, { keyPosition: [-1.4, 2.8, 2.2], keyTarget: [0, 0.3, 0], shadowBox: [-1.2, 1.2, 1.2, -1.2], shadowFar: 7, fog: [7, 50] }); } catch (err) {
    document.querySelector('#boot p').innerHTML = 'Questo laboratorio richiede WebGL 2.<small>Aggiorna il browser o attiva l\'accelerazione grafica</small>';
    console.error(err);
    return;
  }
  const { scene, camera } = stage;
  stage.controls.maxDistance = 12;          // sui telefoni, stretti, l'apparato intero sta a quasi 8 m
  const rig = new Rig();
  scene.add(rig.group);
  const tags = new Tags(document.getElementById('labels'));
  const Y0 = PIPE.Y0, A1 = Math.PI * (PIPE.D1 / 2) ** 2;

  // ───────────────────────── il tubo ─────────────────────────
  let P = null, Qss = 0, Q = 0, hd = null, levels = [], vels = [], aspir = { y: 0, v: 0 }, beakerL = 0.3, beakerInk = 0, fillMark = null, qMeas = null;
  let parts = [], airIn = false, inkIn = false, paused = false, seq = null, pendingView = null, records = [], dirtyOut = true, beakerX = BEAKER.x;
  const throatR = () => P.r(P.xs[P.tap]);

  function rebuildPipe() {
    P = makeProfile(state.profile, state.throat / 1000);
    rig.setPipe(P, { pitot: state.pitot, aspirator: state.aspirator });
    levels = rig.tubes.map((T) => (T ? T.base : 0)); vels = levels.map(() => 0);
    aspir = { y: rig.aspir ? rig.aspir.cupY : 0, v: 0 };
    initParts();
    retarget();
    // i livelli partono già al loro valore di regime
    const tg = targets();
    levels = levels.map((l, i) => (rig.tubes[i] ? Math.max(rig.tubes[i].base, tg[i]) : 0));
  }
  function retarget() {
    const q0 = Qss;
    Qss = solveQ(P, state.valve / 100, state.H / 100, state.ideal);
    if (Math.abs(Qss - q0) > 0.03 * Math.max(q0, 1e-6)) { fillMark = null; qMeas = null; }   // la misura col becher ricomincia
    dirtyOut = true;
  }
  /** Livelli d'equilibrio di ogni tubicino (y assolute) per la portata attuale. */
  function targets() {
    hd = heads(P, Q, state.H / 100, state.ideal);
    return rig.tubes.map((T) => { if (!T) return 0; const h = at(hd.h, hd.x, T.x), E = at(hd.E, hd.x, T.x); return Y0 + (T.pitot ? E : h); });
  }
  function initParts() {
    parts = [];
    for (let i = 0; i < 360; i++) parts.push(newPart(PIPE.x0 + Math.random() * (PIPE.x1 - PIPE.x0)));
  }
  function newPart(x, ink = false, bubble = false) {
    return { x, rf: ink || bubble ? 0.3 + Math.random() * 0.5 : Math.sqrt(Math.random()) * 0.92, th: Math.random() * Math.PI * 2, ink, bubble };
  }

  function stepVenturi(dt) {
    // la portata segue la valvola con un po' d'inerzia della colonna d'acqua
    Q += (Qss - Q) * (1 - Math.exp(-dt / 0.35));
    const tg = targets();
    // i tubicini: oscillatori smorzati verso il livello d'equilibrio; se la gola è in depressione si svuotano
    airIn = false;
    rig.tubes.forEach((T, i) => {
      if (!T) return;
      const L = Math.max(0.05, levels[i] - T.base + 0.06), w = Math.sqrt((2 * G) / L), z = 0.38;
      let target = tg[i];
      if (target < T.base) { target = T.base; if (!T.pitot) airIn = true; }
      vels[i] += (w * w * (target - levels[i]) - 2 * z * w * vels[i]) * dt;
      levels[i] += vels[i] * dt;
      if (levels[i] < T.base) { levels[i] = T.base; vels[i] = 0; }
    });
    // l'aspiratore: l'inchiostro sale di quanto la pressione al fondo della gola è sotto l'atmosferica
    inkIn = false;
    if (rig.aspir) {
      const A = rig.aspir, hBottom = at(hd.h, hd.x, A.x) + throatR(), rise = Math.max(0, -hBottom);
      let target = A.cupY + rise;
      if (target > A.top) { target = A.top; inkIn = true; }
      const w = Math.sqrt((2 * G) / Math.max(0.05, aspir.y - A.cupY + 0.04));
      aspir.v += (w * w * (target - aspir.y) - 2 * 0.45 * w * aspir.v) * dt; aspir.y += aspir.v * dt;
      if (aspir.y < A.cupY) { aspir.y = A.cupY; aspir.v = 0; }
      airIn = false;
    }
    // il becher
    const prevL = beakerL;
    beakerL += Q * dt * 1000;
    if (inkIn) beakerInk = Math.min(1, beakerInk + dt * 0.08); else beakerInk = Math.max(0, beakerInk - dt * 0.01);
    // il cronometro parte quando l'acqua passa la tacca di mezzo litro e si ferma a un litro e mezzo
    if (prevL < 0.5 && beakerL >= 0.5) fillMark = { t: simT - (beakerL - 0.5) / Math.max(1e-9, Q * 1000) };
    if (beakerL >= 1.5 && fillMark && !fillMark.done) { fillMark.done = true; qMeas = { t: simT - fillMark.t, Q: 1 / (simT - fillMark.t) }; }
    if (beakerL >= 1.9) { beakerL = 0.05; fillMark = null; dirtyOut = true; }
    // le particelle
    const k = state.slow ? 0.2 : 1, V = (x) => Q / P.area(x);
    for (const p of parts) {
      const x = Math.max(PIPE.x0, Math.min(PIPE.x1, p.x)), Re = (V(x) * 2 * P.r(x)) / NU_W;
      const shape = p.bubble ? 1.1 : Re < 2300 ? 2 * (1 - p.rf * p.rf) : 1.22 * Math.pow(Math.max(0, 1 - p.rf), 1 / 7);
      p.x += V(x) * shape * k * dt;
      p.u = V(x) * shape;
      if (p.x > PIPE.x1) Object.assign(p, newPart(PIPE.x0 + Math.random() * 0.02));
    }
    // aria o inchiostro che entrano alla gola
    if ((airIn || inkIn) && Math.random() < dt * 60) {
      const victim = parts[(Math.random() * parts.length) | 0];
      Object.assign(victim, newPart(P.xs[P.tap], inkIn, airIn));
    }
  }

  // ───────────────────────── la pallina ─────────────────────────
  const ball = new Ball();
  let smoke = [], jetEnv = null, spinAng = 0;
  function dropBall() { const e = rig.setDryer((state.tilt * Math.PI) / 180); ball.p = [e.N[0] + e.t[0] * 0.45, e.N[1] + e.t[1] * 0.45]; ball.v = [0, 0]; }
  function pushBall(dir) { const t = jetEnv ? jetEnv.t : [0, 1]; ball.v[0] += -t[1] * 0.45 * dir; ball.v[1] += t[0] * 0.45 * dir; }
  function stepJet(dt) {
    const tilt = (state.tilt * Math.PI) / 180, e = rig.setDryer(tilt);
    jetEnv = { U0: state.U0, N: e.N, t: e.t, ball: state.ball, floorY: 0 };
    ball.step(dt, jetEnv);
    spinAng += ball.spin * dt * 40;
    // fumo
    if (state.smoke && state.U0 > 0.3) {
      const nNew = Math.min(160, Math.round(dt * 5200));      // il fumo esce a filo continuo: l'aria lo porta via in un attimo
      for (let i = 0; i < nNew; i++) smoke.push({ s: 0, r: (Math.random() * 2 - 1) * JET.D0 * 0.4, z: (Math.random() * 2 - 1) * JET.D0 * 0.4, age: 0 });
    }
    const [tx, ty] = e.t, nx = -ty, ny = tx;
    const width = (s) => Math.max(JET.D0 * 0.46, JET.spread * (s + 1.2 * JET.D0));
    for (const p of smoke) {
      // il fumo va con l'aria e si allarga con il getto
      const u = jetU(state.U0, p.s, Math.hypot(p.r, p.z)) * 0.9 + 0.15, b0 = width(p.s);
      p.s += u * dt;
      const k = width(p.s) / b0; p.r *= k; p.z *= k;
      p.r += (Math.random() - 0.5) * 0.004; p.z += (Math.random() - 0.5) * 0.004;
      p.age += dt;
      p.x = e.N[0] + tx * p.s + nx * p.r; p.y = e.N[1] + ty * p.s + ny * p.r;
    }
    smoke = smoke.filter((p) => p.s < 0.85 && p.age < 2.5).slice(-2200);
  }

  // ───────────────────────── esperimenti classici ─────────────────────────
  let simT = 0;
  function stepSeq(dt) {
    if (!seq) return;
    const st = seq.list[seq.i];
    if (!st) { seq = null; return; }
    if (!seq.started) {
      seq.started = true; seq.t = 0;
      if (st.set) { Object.assign(state, st.set); ui.refresh(); ui.sync(); retarget(); }
      if (st.note) note();
      if (st.drop) dropBall();
      if (st.push) pushBall(st.push);
      if (st.sweep) seq.from = state[st.sweep.key];
    }
    seq.t += dt;
    if (st.sweep) {
      const k = Math.min(1, seq.t / st.sweep.dur), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      state[st.sweep.key] = seq.from + (st.sweep.to - seq.from) * e; ui.refresh(st.sweep.key);
      if (state.app === 'venturi') retarget();
      if (k >= 1) { seq.i++; seq.started = false; }
    } else if (seq.t >= (st.wait || 0.02)) { seq.i++; seq.started = false; }
    if (seq && seq.i >= seq.list.length) seq = null;
  }
  function note() {
    if (state.app !== 'venturi' || !hd) return;
    const i0 = 0, it = tubeIndexOf(P.tap);
    if (it < 0) return;
    const dh = levels[i0] - levels[it];
    records.push({ Q: qMeas && Math.abs(qMeas.Q / 1000 - Q) / Q < 0.08 ? qMeas.Q / 1000 : Q, dh, kind: state.profile, d: state.throat });
    plotDirty = true;
  }
  /** Indice in rig.tubes del tubicino piezometrico della stazione k (non quello di Pitot). */
  function tubeIndexOf(k) { let n = 0; for (let i = 0; i < rig.tubes.length; i++) { const T = rig.tubes[i]; if (T && T.pitot) continue; if (n === k) return T ? i : -1; n++; } return -1; }

  // ───────────────────────── interfaccia ─────────────────────────
  const ui = createUI(state, {
    presets: PRESETS, views: VIEWS,
    text: {
      throat: () => `${fmt.num(state.throat, 1)} mm <small>· area ${fmt.num((PIPE.D1 * 1000 / state.throat) ** 2, 1)} volte più piccola</small>`,
      H: () => `${fmt.num(state.H, 1)} cm <small>sopra l'asse</small>`,
      valve: () => (state.valve < 0.5 ? 'chiusa' : `${Math.round(state.valve)} % <small>aperta</small>`),
      U0: () => (state.U0 < 0.2 ? 'spento' : `${fmt.num(state.U0, 1)} m/s <small>all'uscita</small>`),
      tilt: () => `${fmt.num(state.tilt, 1)}° <small>dalla verticale</small>`,
    },
  }, (k, arg) => {
    switch (k) {
      case 'preset': {
        const p = PRESETS.find((x) => x[0] === arg);
        const was = state.app;
        Object.assign(state, BASE, p[3]);
        records = []; paused = false;
        ui.refresh(); ui.sync(); setApp(was !== state.app);
        seq = { list: p[4], i: 0, started: false };
        pendingView = p[5];
        break;
      }
      case 'view': setView(arg); break;
      case 'pause': paused = !paused; break;
      case 'note': note(); break;
      case 'clear': records = []; plotDirty = true; break;
      case 'push': pushBall(Math.random() < 0.5 ? -1 : 1); break;
      case 'drop': dropBall(); break;
      case 'fullscreen': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); break;
      case 'layout': onResize(); setTimeout(onResize, 470); break;
      case 'quality': stage.setQuality(state.quality); break;
      case 'plotKind': ui.sync(); plotDirty = true; break;
      case 'app': seq = null; ui.sync(); setApp(true); setView('overview'); break;
      case 'profile': case 'throat': case 'pitot': case 'aspirator': seq = null; ui.refresh(); rebuildPipe(); records = records.filter((r) => r.kind === state.profile && r.d === state.throat); break;
      case 'H': case 'valve': case 'ideal': seq = null; retarget(); rig.setReservoir(state.H / 100); break;
      case 'ball': dropBall(); break;
      default: break;
    }
  });
  function setApp(reset) {
    rig.setApparatus(state.app);
    if (state.app === 'venturi') { rebuildPipe(); rig.setReservoir(state.H / 100); Q = reset ? Qss : Q; }
    else { smoke = []; if (reset) dropBall(); }
    plotDirty = true;
  }

  // ───────────────────────── etichette ─────────────────────────
  const isV = () => state.app === 'venturi';
  tags.add('Serbatoio a livello costante', '', (o) => o.set((RES.x0 + RES.x1) / 2, Y0 + RES.top + 0.03, 0), isV);
  tags.add('Troppo pieno', 'floor alt', (o) => o.set(RES.x0 + 0.05, Y0 + state.H / 100 + 0.01, -0.04), isV);
  tags.add('Tubicini piezometrici', '', (o) => o.set(P ? P.xs[1] : -0.2, Y0 + TUBE_TOP + 0.01, 0), isV);
  tags.add('La gola', 'floor', (o) => o.set(P ? P.throatX : 0, Y0 - 0.03, 0.03), () => isV() && state.profile !== 'uniform' && !state.aspirator);
  tags.add('Aspiratore', 'floor', (o) => o.set(P ? P.xs[P.tap] + 0.04 : 0, Y0 - 0.12, 0.03), () => isV() && state.aspirator);
  tags.add('Valvola', '', (o) => o.set(PIPE.x1 + 0.03, Y0 + 0.07, 0), isV);
  tags.add('Becher', '', (o) => o.set(beakerX, BEAKER.H + 0.03, 0), isV);
  tags.add('Tubi di Pitot', 'floor alt', (o) => o.set(P ? P.xs[5] : 0.2, Y0 + 0.47, 0.016), () => isV() && state.pitot);
  tags.add('Asciugacapelli', '', (o) => o.set(0.09, 0.2, 0), () => !isV());
  tags.add('Pallina', 'floor', (o) => o.set(ball.p[0] + 0.05, ball.p[1] + 0.04, 0), () => !isV());
  tags.add('Asta graduata', '', (o) => o.set(-0.24, 1.02, -0.12), () => !isV());

  // ───────────────────────── inquadrature ─────────────────────────
  const DEG = Math.PI / 180;
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
    let dist = 1;
    for (let it = 0; it < 3; it++) {
      let lo = 0.02, hi = 20;
      for (let k = 0; k < 32; k++) { const d = Math.sqrt(lo * hi); put(d); const b = bounds(); if (b.x1 - b.x0 <= rect.x1 - rect.x0 && b.y1 - b.y0 <= rect.y1 - rect.y0) hi = d; else lo = d; }
      dist = hi; put(dist);
      const b = bounds(), wpp = (2 * dist * Math.tan((camera.fov * DEG) / 2)) / Hh;
      right.setFromMatrixColumn(cam.matrixWorld, 0); up.setFromMatrixColumn(cam.matrixWorld, 1);
      target.addScaledVector(right, -(((rect.x0 + rect.x1) / 2) - (b.x0 + b.x1) / 2) * wpp).addScaledVector(up, (((rect.y0 + rect.y1) / 2) - (b.y0 + b.y1) / 2) * wpp);
    }
    put(dist);
    return { pos: cam.position.toArray(), target: target.toArray() };
  }
  const box = (x0, y0, z0, x1, y1, z1) => { const o = []; for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) o.push(V(x, y, z)); return o; };
  function viewPose(id) {
    if (isV()) {
      if (id === 'front') return fitPose(V(0, 0.04, 1).normalize(), box(RES.x0, 0, 0.05, beakerX + BEAKER.R, Y0 + TUBE_TOP + 0.04, 0.05));
      if (id === 'close') { const x = P ? P.throatX : 0; return fitPose(V(0.12, 0.12, 1).normalize(), box(x - 0.2, Y0 - 0.2, 0, x + 0.2, Y0 + 0.42, 0.02)); }
      return fitPose(V(0.4, 0.34, 1).normalize(), box(RES.x0, 0, -0.12, beakerX + BEAKER.R, Y0 + TUBE_TOP + 0.05, 0.12));
    }
    if (id === 'front') return fitPose(V(0, 0.05, 1).normalize(), box(-0.3, 0, 0, 0.35, 0.95, 0));
    if (id === 'close') return { pos: [ball.p[0] + 0.12, ball.p[1] + 0.06, 0.42], target: [ball.p[0], ball.p[1] - 0.04, 0] };
    return fitPose(V(0.42, 0.3, 1).normalize(), box(-0.3, 0, -0.18, 0.35, 0.95, 0.1));
  }
  function setView(id, instant = false) {
    const v = viewPose(id);
    if (instant) { camera.position.set(...v.pos); stage.controls.target.set(...v.target); stage.controls.update(); } else stage.flyTo(v.pos, v.target);
  }
  function onResize() {
    const w = window.innerWidth, hh = window.innerHeight, r = freeRect();
    stage.resize(w, hh, Math.round((r.x0 + r.x1) / 2 - w / 2), Math.round(hh / 2 - (r.y0 + r.y1) / 2));
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'p') { paused = !paused; }
    else if (k === 'a') note();
    else if (k === 's' && !isV()) pushBall(Math.random() < 0.5 ? -1 : 1);
    else if (k === 'h') ui.togglePanel();
    else if (k === 'f') document.getElementById('fullscreen').click();
    else if (k === 'arrowleft' || k === 'arrowright') {
      e.preventDefault(); seq = null; const d = k === 'arrowright' ? 1 : -1;
      if (isV()) { state.valve = Math.max(0, Math.min(100, state.valve + d)); ui.refresh('valve'); retarget(); }
      else { state.tilt = Math.max(0, Math.min(55, state.tilt + d)); ui.refresh('tilt'); }
    } else if (k >= '1' && k <= '3') setView(VIEWS[Number(k) - 1][0]);
  });

  // ───────────────────────── grafici ─────────────────────────
  let plotDirty = true;
  function drawPlot() {
    plotDirty = false;
    if (isV()) {
      if (!hd) return;
      const H = state.H / 100, cm = (a) => Array.from(a, (v) => v * 100), xs = cm(hd.x);
      if (state.plotKind === 'line') {
        const ideal = Array.from(hd.v, (v) => (H - (v * v) / (2 * G)) * 100);
        const pts = [];
        rig.tubes.forEach((T, i) => { if (T) pts.push({ x: T.x * 100, y: (levels[i] - Y0) * 100, color: T.pitot ? '#e8452c' : '#2c67dc', r: 6 }); });
        const sc = 1.6 / (PIPE.D1 / 2) / 100;           // il tubo disegnato in basso, ingrandito
        const prof = Array.from(hd.x, (x) => P.r(x) * sc * 100);
        const lo = Math.min(-8, ...pts.map((p) => p.y), ...cm(hd.h).filter((v, i) => i % 8 === 0)) - 4;
        ui.drawPlot({
          fills: [{ x: xs, y0: prof.map((r) => lo + 4 - r), y1: prof.map((r) => lo + 4 + r), color: 'rgba(63,143,214,0.25)' }],
          series: [{ x: xs, y: cm(hd.E), color: '#e8452c', width: 2, dash: [8, 6] }].concat(state.ideal ? [] : [{ x: xs, y: ideal, color: '#9aa1ab', width: 1.6, dash: [4, 5] }]).concat([{ x: xs, y: cm(hd.h), color: '#2c67dc', width: 2.6 }]),
          points: pts, X0: PIPE.x0 * 100, X1: PIPE.x1 * 100, Y0: Math.max(lo, -60), Y1: state.H * 1.12,
          xLabel: 'lungo il tubo (cm)', yLabel: 'altezza sopra l\'asse (cm)',
          legend: [['h + v²/2g', '#e8452c'], ...(state.ideal ? [] : [['ideale', '#9aa1ab']]), ['h', '#2c67dc']],
        });
      } else if (state.plotKind === 'meter') {
        const A2 = Math.PI * (state.throat / 2000) ** 2, k2 = 1 / (2 * G) * (1 / (A2 * A2) - 1 / (A1 * A1));
        const qx = [], qy = [];
        const qmax = Math.max(0.8, ...records.map((r) => r.Q * 1000), Q * 1000) * 1.15;
        for (let i = 0; i <= 100; i++) { const q = (qmax * i) / 100 / 1000; qx.push(q * 1000); qy.push(k2 * q * q * 100); }
        const it = tubeIndexOf(P.tap), cur = it >= 0 ? (levels[0] - levels[it]) * 100 : 0;
        const ymax = Math.max(10, ...records.map((r) => r.dh * 100), cur, qy[60]) * 1.15;
        ui.drawPlot({
          series: [{ x: qx, y: qy, color: '#9aa1ab', width: 2, dash: [7, 6] }],
          points: records.map((r) => ({ x: r.Q * 1000, y: r.dh * 100, color: '#e8452c', r: 6 })).concat([{ x: Q * 1000, y: cur, color: 'rgba(0,0,0,0)', r: 9, ring: '#15181c' }]),
          X0: 0, X1: qmax, Y0: 0, Y1: ymax, xLabel: 'portata Q (L/s)', yLabel: 'dislivello ingresso − gola (cm)',
          legend: [['annotati', '#e8452c'], ['ideale: Δh ∝ Q²', '#9aa1ab']],
        });
      } else {
        const pts = [], pit = [];
        let x1 = 0;
        P.xs.forEach((x, k) => {
          const A = P.area(x), inv = 1 / (A * 1e4); x1 = Math.max(x1, inv);
          pts.push({ x: inv, y: Q / A, color: '#2c67dc', r: 6 });
          if (state.pitot) {
            const ip = rig.tubes.findIndex((T) => T && T.pitot && Math.abs(T.x - x - 0.012) < 1e-6), iz = rig.tubes.findIndex((T) => T && !T.pitot && Math.abs(T.x - x) < 1e-6);
            if (ip >= 0 && iz >= 0) pit.push({ x: inv, y: Math.sqrt(Math.max(0, 2 * G * (levels[ip] - levels[iz]))), color: '#e8452c', r: 5 });
          }
        });
        const vmax = Math.max(0.5, ...pts.map((p) => p.y), ...pit.map((p) => p.y)) * 1.15;
        ui.drawPlot({
          series: [{ x: [0, x1 * 1.15], y: [0, Q * 1e4 * x1 * 1.15], color: '#9aa1ab', width: 2, dash: [7, 6] }],
          points: pts.concat(pit), X0: 0, X1: x1 * 1.15, Y0: 0, Y1: vmax, xLabel: '1/A (1/cm²)', yLabel: 'velocità (m/s)',
          legend: state.pitot ? [['v = Q/A', '#2c67dc'], ['dai tubi di Pitot', '#e8452c']] : [['v = Q/A', '#2c67dc'], ['pendenza: Q', '#9aa1ab']],
        });
      }
    } else {
      if (!jetEnv) return;
      const B = BALLS[state.ball], ueq = Math.sqrt((2 * B.m * G) / (RHO_A * B.Cd * Math.PI * B.R * B.R));
      const s = ball.F.s ?? 0, r = ball.F.r ?? 0;
      if (state.plotKind === 'axis') {
        const xs = [], ys = [];
        for (let i = 0; i <= 160; i++) { const ss = (0.8 * i) / 160; xs.push(ss * 100); ys.push(jetU(state.U0, ss, 0)); }
        ui.drawPlot({
          series: [{ x: xs, y: ys, color: '#2c67dc', width: 2.6 }, { x: [0, 80], y: [ueq, ueq], color: '#e8452c', width: 2, dash: [8, 6] }],
          vlines: [{ x: s * 100, color: 'rgba(18,21,26,0.45)', dash: [4, 4] }],
          points: [{ x: s * 100, y: jetU(state.U0, s, r), color: '#15181c', r: 7 }],
          X0: 0, X1: 80, Y0: 0, Y1: Math.max(10, state.U0 * 1.12), xLabel: 'distanza dall\'ugello (cm)', yLabel: 'velocità dell\'aria sull\'asse (m/s)',
          legend: [['sull\'asse', '#2c67dc'], ['regge il peso', '#e8452c']],
        });
      } else {
        const xs = [], ys = [];
        for (let i = 0; i <= 160; i++) { const rr = -0.15 + (0.3 * i) / 160; xs.push(rr * 100); ys.push(jetU(state.U0, Math.max(0, s), rr)); }
        ui.drawPlot({
          series: [{ x: xs, y: ys, color: '#2c67dc', width: 2.6 }],
          fills: [{ x: [(r - B.R) * 100, (r + B.R) * 100], y0: [0, 0], y1: [Math.max(10, state.U0) * 1.1, Math.max(10, state.U0) * 1.1], color: 'rgba(232,69,44,0.08)' }],
          points: [{ x: (r - B.R) * 100, y: jetU(state.U0, s, r - B.R), color: '#15181c', r: 6 }, { x: (r + B.R) * 100, y: jetU(state.U0, s, r + B.R), color: '#15181c', r: 6 }],
          X0: -15, X1: 15, Y0: 0, Y1: Math.max(10, state.U0) * 1.1, xLabel: 'di traverso (cm)', yLabel: 'velocità all\'altezza della pallina (m/s)',
          legend: [['la pallina', 'rgba(232,69,44,0.6)']],
        });
      }
    }
  }

  // ───────────────────────── misure ─────────────────────────
  function hud() {
    ui.setPause(paused ? 'Riprendi' : 'Pausa');
    if (isV()) {
      if (!hd) return;
      const H = state.H / 100, v1 = Q / A1, xt = P.xs[P.tap], vt = Q / P.area(xt), ht = at(hd.h, hd.x, xt);
      const iIn = tubeIndexOf(0), it = tubeIndexOf(P.tap), dh = it >= 0 ? levels[iIn] - levels[it] : (at(hd.h, hd.x, P.xs[0]) - ht);
      const last = P.xs[P.xs.length - 1], lost = H - at(hd.E, hd.x, last), Re = (v1 * PIPE.D1) / NU_W;
      ui.setStatus(paused ? 'in pausa' : Q < 1e-6 ? 'ferma' : airIn ? 'aspira aria' : inkIn ? 'aspira inchiostro' : 'scorre', !paused && Q > 1e-6);
      ui.setClock(`${fmt.num(ht * 100, 1)} <small>cm alla gola</small>`);
      ui.setSide(`v = ${fmt.num(vt, 2)} m/s · v²/2g = ${fmt.num((vt * vt) / (2 * G) * 100, 1)} cm`, `p = ${fmt.num((RHO_W * G * ht) / 1000, 2)} kPa ${ht < 0 ? '(sotto l\'atmosferica)' : 'sopra l\'atmosferica'}`);
      const st = P.xs.map((x, k) => {
        const h = at(hd.h, hd.x, x), v = Q / P.area(x), kin = (v * v) / (2 * G);
        return { h, k: kin, loss: Math.max(0, H - h - kin), label: k === P.tap && state.profile !== 'uniform' ? 'gola' : `${k + 1}` };
      });
      ui.drawBalance({ H, st, sel: P.tap });
      ui.setMetrics([
        { k: 'Portata', v: `${fmt.num(Q * 1000, 3)} <small>L/s</small>`, s: qMeas ? `becher: 1 L in ${fmt.num(qMeas.t, 1)} s` : 'il becher si riempie…' },
        { k: 'Velocità', v: `${fmt.num(v1, 2)} <small>→</small> ${fmt.num(vt, 2)} <small>m/s</small>`, s: `ingresso → gola · A₁v₁ = A₂v₂`, title: 'Continuità: la stessa portata passa da sezioni diverse' },
        { k: 'Dislivello', v: `${fmt.num(dh * 100, 1)} <small>cm</small>`, s: 'ingresso − gola: misura la portata' },
        { k: 'Pressione alla gola', v: `${fmt.num((RHO_W * G * ht) / 1000, 2)} <small>kPa</small>`, s: ht < 0 ? 'sotto l\'atmosferica: aspira' : 'rispetto all\'atmosfera' },
        { k: 'Perdite', p: 2, v: `${fmt.num(Math.max(0, lost) * 100, 1)} <small>cm</small>`, s: state.ideal ? 'fluido ideale: nessuna' : 'di carico, per attrito e vortici' },
        { k: 'Reynolds', p: 3, v: fmt.num(Re, 0), s: Re < 2300 ? 'moto laminare' : Re < 4000 ? 'di transizione' : 'moto turbolento' },
      ]);
    } else {
      if (!jetEnv) return;
      const B = BALLS[state.ball], F = ball.F, A = Math.PI * B.R * B.R, ueq = Math.sqrt((2 * B.m * G) / (RHO_A * B.Cd * A));
      const flying = ball.p[1] > B.R + 0.01, s = F.s ?? 0, r = F.r ?? 0;
      const u = jetU(state.U0, s, r), ui0 = jetU(state.U0, s, r - B.R), uo = jetU(state.U0, s, r + B.R);
      const latF = Math.hypot(F.lat[0], F.lat[1]), dragF = Math.hypot(F.drag[0], F.drag[1]);
      ui.setStatus(paused ? 'in pausa' : state.U0 < 0.2 ? 'spento' : flying ? 'galleggia' : 'caduta', !paused && flying);
      ui.setClock(flying ? `${fmt.num(s * 100, 1)} <small>cm dall'ugello</small>` : '<small>a terra</small>');
      ui.setSide(`aria a ${fmt.num(u, 1)} m/s · regge il peso a ${fmt.num(ueq, 1)} m/s`, `${fmt.num(Math.abs(r) * 100, 1)} cm dall'asse`);
      const half = 0.12, prof = [];
      for (let i = 0; i <= 120; i++) { const rr = -half + (2 * half * i) / 120; prof.push([rr, jetU(state.U0, Math.max(0, s), rr)]); }
      const fl = (F.lat[0] * -jetEnv.t[1] + F.lat[1] * jetEnv.t[0]);
      ui.drawJet({ half, prof, Umax: Math.max(state.U0, ueq) * 1.15, ueq, r, R: B.R, ui: ui0, uo, flat: fl });
      ui.setMetrics([
        { k: 'Altezza', v: flying ? `${fmt.num(s * 100, 1)} <small>cm</small>` : '—', s: 'dall\'ugello, lungo il getto' },
        { k: 'Aria sulla pallina', v: `${fmt.num(u, 1)} <small>m/s</small>`, s: `regge il peso a ${fmt.num(ueq, 1)} m/s` },
        { k: 'Spinta e peso', v: `${fmt.num(dragF * 1000, 1)} <small>/</small> ${fmt.num(B.m * G * 1000, 1)} <small>mN</small>`, s: 'resistenza dell\'aria e peso' },
        { k: 'Forza laterale', v: `${fmt.num(latF * 1000, 1)} <small>mN</small>`, s: `fianchi a ${fmt.num(ui0, 1)} e ${fmt.num(uo, 1)} m/s` },
        { k: 'Fuori asse', p: 2, v: `${fmt.num(Math.abs(r) * 100, 1)} <small>cm</small>`, s: `inclinazione ${fmt.num(state.tilt, 0)}°` },
        { k: 'Pallina', p: 3, v: `${fmt.num(B.m * 1000, 1)} <small>g</small>`, s: `${B.name.toLowerCase()} · ⌀ ${fmt.num(B.R * 200, 0)} cm` },
      ]);
    }
  }

  // ───────────────────────── ciclo principale ─────────────────────────
  let last = performance.now() / 1000, fpsEma = 60, hudTimer = 0, outTimer = 0;
  function frame(nowMs) {
    requestAnimationFrame(frame);
    const now = nowMs / 1000, rawDt = now - last, dt = Math.min(Math.max(rawDt, 0), 0.05);
    last = now;
    const w = window.innerWidth, hh = window.innerHeight;
    if (!paused) { stepSeq(dt); simT += dt; }
    if (pendingView) { setView(pendingView); pendingView = null; }
    if (isV()) {
      if (!paused) stepVenturi(dt);
      rig.setLevels(levels, aspir.y);
      rig.setValve(state.valve / 100);
      rig.setBeaker(beakerL);
      rig.M.waterTank.color.set('#5aa0dc');
      outTimer += dt;
      if (dirtyOut || outTimer > 0.25) {
        outTimer = 0; dirtyOut = false;
        const ve = Q / A1;
        // il becher si mette dove cade il getto d'acqua
        const T = Math.sqrt((2 * (Y0 - BEAKER.H)) / G), land = rig.outX + Math.max(0.02, Qss / A1) * T;
        beakerX += (Math.max(0.66, Math.min(1.05, land)) - beakerX) * 0.5;
        rig.moveBeaker(beakerX);
        rig.setOutflow(ve, Q, rig.beakerSurf ?? 0.02);
      }
      const k = state.slow ? 0.2 : 1;
      rig.parts.visible = state.tracers;
      if (state.tracers) {
        rig.setParticles(parts.map((p) => {
          const x = Math.max(PIPE.x0, Math.min(PIPE.x1, p.x)), R = P.r(x) * 0.92;
          return { x, y: Y0 + p.rf * R * Math.cos(p.th), z: p.rf * R * Math.sin(p.th), len: (p.u || 0) * k * 0.02, ink: p.ink };
        }));
      }
      stage.outlined = state.outline ? rig.tubes.filter(Boolean).map((T) => T.col) : [];
    } else {
      if (!paused) stepJet(dt);
      else rig.setDryer((state.tilt * Math.PI) / 180);
      const B = BALLS[state.ball];
      rig.setBall(ball.p, B.R, spinAng);
      rig.setSmoke(smoke.map((p) => ({ x: p.x, y: p.y, z: p.z, a: Math.max(0, 0.9 - p.s * 1.1) })), state.smoke);
      const F = ball.F;
      rig.setArrows(state.forces, ball.p, [[0, -B.m * G], F.drag, F.lat]);
      stage.outlined = state.outline ? [rig.ball] : [];
    }
    stage.update(dt);
    tags.update(camera, w, hh, state.labels);
    stage.render();
    fpsEma += (1 / Math.max(rawDt, 1e-3) - fpsEma) * 0.06;
    hudTimer += dt;
    if (hudTimer > 0.1) { hudTimer = 0; ui.setFps(Math.round(fpsEma)); hud(); drawPlot(); }
  }

  // ───────────────────────── avvio ─────────────────────────
  stage.setQuality(state.quality);
  setApp(true); Q = Qss;
  ui.refresh(); ui.sync();
  if (window.matchMedia('(max-width: 720px)').matches) ui.togglePanel();
  hud();
  onResize();
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => onResize()); ro.observe(document.getElementById('metrics')); ro.observe(document.getElementById('live')); }
  setView('overview', true);
  const plotView = expandablePlot(document.getElementById('plot'), { title: 'Grafico', tools: [document.getElementById('plot-kind')], redraw: () => drawPlot() });
  window.lab = { state, ui, stage, rig, THREE, plotView, setView, ball, get Q() { return Q; }, get levels() { return levels; }, records: () => records, seq: () => seq, get hd() { return hd; }, P: () => P };
  requestAnimationFrame((t) => { last = t / 1000; frame(t); ui.boot(); });
}

boot();
