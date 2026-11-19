// subjects.js — i soggetti da fotografare: pendolo, pedine a distanze crescenti, metro a nastro,
// fondale e fila di lampadine (per vedere la forma del diaframma nello sfocato).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const AXIS_H = 0.10;            // altezza dell'asse ottico sul pavimento (m)
export const PENDULUM_L = 0.168;       // lunghezza del pendolo (m)
export const PENDULUM_AMP = 0.38;      // ampiezza di oscillazione (rad)
export const G = 9.81;

const UI_FONT = '"Geist Variable", "Segoe UI", Arial, sans-serif';

function canvasTexture(w, h, draw, { srgb = true, aniso = 8 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function woodTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#c99f6e'; g.fillRect(0, 0, w, h);
    const r = rng(7);
    for (let i = 0; i < 900; i++) {
      const y = r() * h, len = 60 + r() * 380, x = r() * w - 100;
      g.strokeStyle = `rgba(${90 + r() * 40 | 0},${55 + r() * 25 | 0},${25 + r() * 20 | 0},${0.04 + r() * 0.10})`;
      g.lineWidth = 0.6 + r() * 1.8;
      g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + len * 0.3, y + (r() - 0.5) * 5, x + len * 0.6, y + (r() - 0.5) * 5, x + len, y + (r() - 0.5) * 4); g.stroke();
    }
  });
}

function pawnGeometry() {
  const pts = [];
  const add = (r, y) => pts.push(new THREE.Vector2(r, y));
  add(0, 0); add(18.6, 0); add(20.2, 0.8); add(20.8, 2.6); add(20.4, 4.4); add(18.8, 5.8); add(17.4, 6.6); add(17.2, 7.8); add(18.0, 9.2); add(17.6, 10.6);
  const bell = new THREE.SplineCurve([
    new THREE.Vector2(17.0, 11.6), new THREE.Vector2(13.4, 16), new THREE.Vector2(9.8, 24), new THREE.Vector2(7.4, 34),
    new THREE.Vector2(6.1, 46), new THREE.Vector2(5.7, 56),
  ]).getPoints(22);
  bell.forEach((p) => add(p.x, p.y));
  add(6.0, 57.6); add(10.4, 59.4); add(11.6, 61.2); add(11.0, 62.8); add(7.0, 64.6); add(5.4, 66.6); add(5.2, 68.4);
  const R = 12.8, cy = 80.2;
  const a0 = -Math.acos(5.2 / R);
  for (let i = 1; i <= 26; i++) {
    const a = a0 + (Math.PI / 2 - a0) * (i / 26);
    add(Math.max(R * Math.cos(a), 0), cy + R * Math.sin(a));
  }
  const s = 1.25e-3;
  const geo = new THREE.LatheGeometry(pts.map((p) => p.multiplyScalar(s)), 64);
  return geo;
}

function tapeTexture(startCm, lengthCm) {
  const W = 4096, H = 156;
  return canvasTexture(W, H, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#f6cf2c'); grad.addColorStop(0.5, '#f2c41a'); grad.addColorStop(1, '#e9b70e');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    const pxPerMm = W / (lengthCm * 10);
    g.fillStyle = '#1b1b1b';
    for (let mm = 0; mm <= lengthCm * 10; mm++) {
      const abs = startCm * 10 + mm;
      const x = mm * pxPerMm;
      const len = abs % 100 === 0 ? H * 0.62 : abs % 10 === 0 ? H * 0.42 : abs % 5 === 0 ? H * 0.28 : H * 0.17;
      const lw = abs % 10 === 0 ? 2.4 : 1.4;
      g.fillRect(x - lw / 2, H - len, lw, len);
    }
    g.textBaseline = 'top';
    for (let cm = 0; cm <= lengthCm; cm++) {
      const abs = startCm + cm;
      if (abs === 0) continue;
      const x = cm * 10 * pxPerMm;
      if (abs % 10 === 0) {
        g.font = `700 74px ${UI_FONT}`;
        const label = String(abs);
        const tw = g.measureText(label).width;
        g.fillStyle = '#c8281e';
        g.fillRect(x + 8, 8, tw + 22, 76);
        g.fillStyle = '#fff6da';
        g.fillText(label, x + 19, 12);
      } else {
        g.font = `600 44px ${UI_FONT}`;
        g.fillStyle = '#1b1b1b';
        g.fillText(String(abs % 10), x + 7, 12);
      }
    }
  }, { aniso: 16 });
}

export function buildSubjects() {
  const group = new THREE.Group();
  group.name = 'soggetti';
  const pickables = [];
  const shadow = (m, cast = true, receive = true) => { m.castShadow = cast; m.receiveShadow = receive; return m; };

  // ── pedine: due file che si allontanano, per leggere la profondità di campo ──
  const pawnGeo = pawnGeometry();
  const pawns = [
    [0.42, -0.140, '#e0392b'], [0.55, 0.152, '#f08422'], [0.72, -0.172, '#f1c12b'], [0.95, 0.205, '#3aa84a'],
    [1.25, -0.245, '#1fa3ae'], [1.65, 0.300, '#2c67dc'], [2.20, -0.385, '#7a47cf'],
  ];
  for (const [x, z, color] of pawns) {
    const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.07 });
    const m = shadow(new THREE.Mesh(pawnGeo, mat));
    m.position.set(x, 0, z);
    m.name = 'pedina';
    group.add(m); pickables.push(m);
  }

  // ── pendolo ──
  const pend = new THREE.Group();
  pend.name = 'pendolo';
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.55, metalness: 0 });
  const brass = new THREE.MeshStandardMaterial({ color: '#c8a04a', roughness: 0.2, metalness: 1 });
  const steel = new THREE.MeshStandardMaterial({ color: '#b9bcc2', roughness: 0.3, metalness: 1 });
  const pivotY = AXIS_H + PENDULUM_L;
  const half = 0.095;
  const frame = [];
  const box = (w, h, d, x, y, z, r = 0.002) => { const g = new RoundedBoxGeometry(w, h, d, 3, r); g.translate(x, y, z); frame.push(g); };
  box(0.115, 0.014, 0.024, 0, 0.007, -half); box(0.115, 0.014, 0.024, 0, 0.007, half);
  box(0.015, pivotY + 0.004, 0.015, 0, (pivotY + 0.004) / 2 + 0.006, -half); box(0.015, pivotY + 0.004, 0.015, 0, (pivotY + 0.004) / 2 + 0.006, half);
  box(0.016, 0.016, 2 * half + 0.034, 0, pivotY + 0.012, 0);
  const frameMesh = shadow(new THREE.Mesh(mergeGeometries(frame), wood));
  frameMesh.name = 'telaio';
  pend.add(frameMesh); pickables.push(frameMesh);
  const hub = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.02, 20).rotateZ(Math.PI / 2), brass));
  hub.position.set(0, pivotY, 0);
  pend.add(hub);
  const arm = new THREE.Group();
  arm.position.set(0, pivotY, 0);
  const bobR = 0.019;
  const rod = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.0009, 0.0009, PENDULUM_L - bobR, 10).translate(0, -(PENDULUM_L - bobR) / 2, 0), steel));
  const bob = shadow(new THREE.Mesh(new THREE.SphereGeometry(bobR, 48, 32), brass));
  bob.position.y = -PENDULUM_L;
  bob.name = 'sfera';
  const cap = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0042, 0.006, 16).translate(0, -PENDULUM_L + bobR + 0.001, 0), brass));
  arm.add(rod, bob, cap);
  pend.add(arm);
  pickables.push(bob);
  group.add(pend);

  // ── metro a nastro lungo l'asse ottico: lo zero è sul piano del sensore ──
  const tapeGroup = new THREE.Group();
  const SEG = 0.5;
  for (let i = 0; i < 6; i++) {
    const mat = new THREE.MeshStandardMaterial({ map: tapeTexture(i * 50, 50), roughness: 0.42, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(SEG, 0.019), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(i * SEG + SEG / 2, 0.0005, 0);
    m.receiveShadow = true;
    m.name = 'metro';
    tapeGroup.add(m); pickables.push(m);
  }
  group.add(tapeGroup);

  // ── fondale ──
  const backMat = new THREE.MeshStandardMaterial({ color: '#22303f', roughness: 0.96, metalness: 0 });
  const backdrop = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.03, 1.5, 3.4, 2, 0.006), backMat), true, true);
  backdrop.position.set(3.55, 0.75, 0);
  backdrop.name = 'fondale';
  group.add(backdrop); pickables.push(backdrop);
  const dark = new THREE.MeshStandardMaterial({ color: '#2b2e33', roughness: 0.6, metalness: 0.4 });
  const feet = [];
  for (const z of [-1.3, 1.3]) { const g = new RoundedBoxGeometry(0.34, 0.02, 0.05, 2, 0.004); g.translate(3.55, 0.01, z); feet.push(g); }
  group.add(shadow(new THREE.Mesh(mergeGeometries(feet), dark)));

  // ── fila di lampadine ──
  const X = 3.05, HALF = 1.08, TOP = 0.66, SAG = 0.30;
  const curve = new THREE.CatmullRomCurve3(Array.from({ length: 25 }, (_, i) => {
    const z = -HALF + (2 * HALF * i) / 24;
    return new THREE.Vector3(X, TOP - SAG * (1 - (z / HALF) ** 2), z);
  }));
  const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.0013, 6), dark);
  group.add(wire);
  const posts = [];
  for (const z of [-HALF, HALF]) {
    posts.push(new THREE.CylinderGeometry(0.006, 0.006, TOP + 0.01, 12).translate(X, (TOP + 0.01) / 2, z));
    posts.push(new THREE.CylinderGeometry(0.05, 0.055, 0.012, 24).translate(X, 0.006, z));
  }
  group.add(shadow(new THREE.Mesh(mergeGeometries(posts), dark)));
  const bulbColors = [
    ['#ffe2b0', 16], ['#ffd08a', 16], ['#ffb3a1', 13], ['#bfe3ff', 13],
  ];
  const bulbGeos = bulbColors.map(() => []);
  const sockets = [];
  const NB = 15;
  for (let i = 0; i < NB; i++) {
    const p = curve.getPoint((i + 0.5) / NB);
    const k = [0, 1, 0, 2, 0, 1, 3, 0, 1, 0, 2, 1, 0, 3, 1][i];
    bulbGeos[k].push(new THREE.SphereGeometry(0.011, 20, 14).translate(p.x, p.y - 0.022, p.z));
    sockets.push(new THREE.CylinderGeometry(0.004, 0.005, 0.012, 10).translate(p.x, p.y - 0.008, p.z));
  }
  const bulbs = [];
  bulbColors.forEach(([c, intensity], k) => {
    const mat = new THREE.MeshStandardMaterial({ color: '#111', emissive: c, emissiveIntensity: intensity, roughness: 0.4 });
    const m = new THREE.Mesh(mergeGeometries(bulbGeos[k]), mat);
    m.name = 'lampadina';
    group.add(m); bulbs.push(m); pickables.push(m);
  });
  group.add(new THREE.Mesh(mergeGeometries(sockets), dark));

  const pendulum = {
    group: pend, arm, bob, pivotY,
    omega: Math.sqrt(G / PENDULUM_L),
    setDistance(x) { pend.position.x = x; },
    setAngle(a) { arm.rotation.x = a; },
    /** angolo all'istante t (oscillazione armonica, piccole ampiezze) */
    angleAt(t) { return PENDULUM_AMP * Math.cos(this.omega * t); },
  };

  return { group, pendulum, pickables, bulbs };
}
