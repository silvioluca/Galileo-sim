// rig.js — gli apparati in 3D. La vasca: un acquario di vetro su un sollevatore da laboratorio, il liquido reso un
// po' lattiginoso perché il fascio si veda, a scelta uno strato d'olio, il foro e il getto della fontana con il catino,
// un goniometro trasparente sul vetro davanti. Il disco ottico di Hartl: un disco bianco graduato su un piede, con il
// mezzo cilindro trasparente al centro e il laser su un braccio che gira attorno al centro.
// I fasci sono linee luminose (sommano la luce), le macchie dove il fascio si ferma sono aloni.
// Piano del fascio: z = 0 per la vasca, z = BEAM_Z sulla faccia del disco. Coordinate del piano (x, y) → (x, y, z).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { canvasTexture } from '../../../shared/js/geo.js';
import { TANK, DISC, tankY0, jetPath } from './scenes.js';

export const BEAM_Z = 0.008;                     // sul disco il fascio passa 8 mm davanti alla faccia, dentro lo spessore del mezzo cilindro
const MONO = '"Geist Mono Variable", Consolas, monospace';
const cyl = (r0, r1, h, seg = 32) => new THREE.CylinderGeometry(r0, r1, h, seg);
const std = (o) => new THREE.MeshStandardMaterial(o);
const LIQ_TINT = { water: '#d4e9f1', alcohol: '#e2eef2', glycerin: '#e8efe6', oil: '#e9d68a' };

/** Segmenti luminosi con colore ai due capi (per l'attenuazione lungo il tratto). */
class BeamBuffer {
  constructor(max) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 6); this.col = new Float32Array(max * 6);
    this.bPos = new THREE.InstancedInterleavedBuffer(this.pos, 6, 1); this.bCol = new THREE.InstancedInterleavedBuffer(this.col, 6, 1);
    this.bPos.setUsage(THREE.DynamicDrawUsage); this.bCol.setUsage(THREE.DynamicDrawUsage);
    this.geos = [];
  }
  geometry() {
    const g = new LineSegmentsGeometry();
    g.setAttribute('instanceStart', new THREE.InterleavedBufferAttribute(this.bPos, 3, 0));
    g.setAttribute('instanceEnd', new THREE.InterleavedBufferAttribute(this.bPos, 3, 3));
    g.setAttribute('instanceColorStart', new THREE.InterleavedBufferAttribute(this.bCol, 3, 0));
    g.setAttribute('instanceColorEnd', new THREE.InterleavedBufferAttribute(this.bCol, 3, 3));
    g.instanceCount = 0; this.geos.push(g); return g;
  }
  reset() { this.n = 0; }
  push(a, b, c0, c1) {
    if (this.n >= this.max) return;
    const i = this.n * 6;
    this.pos.set([a[0], a[1], a[2], b[0], b[1], b[2]], i);
    this.col.set([c0[0], c0[1], c0[2], c1[0], c1[1], c1[2]], i);
    this.n++;
  }
  commit() { this.bPos.needsUpdate = true; this.bCol.needsUpdate = true; for (const g of this.geos) { g.instanceCount = this.n; g.computeBoundingSphere(); } }
}

function glowTexture() {
  return canvasTexture(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.18, 'rgba(255,255,255,0.75)'); r.addColorStop(0.45, 'rgba(255,255,255,0.18)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  }, { srgb: false });
}

/** La scala del disco di Hartl: 0° sulla normale (in alto e in basso), 90° sulla superficie. */
function discTexture() {
  const W = 2048;
  return canvasTexture(W, W, (g) => {
    const c = W / 2, s = c / DISC.R, P = (m) => m * s;
    g.fillStyle = '#f7f6f2'; g.fillRect(0, 0, W, W);
    // corona della scala
    const R1 = P(DISC.R - 0.004), R0 = P(DISC.R - 0.03);
    g.strokeStyle = '#1d2026'; g.fillStyle = '#1d2026'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let k = 0; k < 360; k++) {
      const a = (k * Math.PI) / 180, sx = Math.sin(a), cy = -Math.cos(a);
      const len = k % 10 === 0 ? P(0.018) : k % 5 === 0 ? P(0.012) : P(0.007);
      g.lineWidth = k % 10 === 0 ? 4 : 2.2;
      g.beginPath(); g.moveTo(c + sx * R1, c + cy * R1); g.lineTo(c + sx * (R1 - len), c + cy * (R1 - len)); g.stroke();
      if (k % 10 === 0) {
        const v = k <= 90 ? k : k <= 180 ? 180 - k : k <= 270 ? k - 180 : 360 - k;
        g.save(); g.translate(c + sx * (R0 + P(0.001)), c + cy * (R0 + P(0.001))); g.rotate(a);
        g.font = `600 ${v === 0 || v === 90 ? 50 : 40}px ${MONO}`; g.fillText(String(v), 0, 0); g.restore();
      }
    }
    g.lineWidth = 3; g.beginPath(); g.arc(c, c, R1, 0, Math.PI * 2); g.stroke();
    // normale (verticale) tratteggiata e superficie (orizzontale)
    g.setLineDash([26, 18]); g.strokeStyle = 'rgba(29,32,38,0.55)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(c, c - R0 + 40); g.lineTo(c, c + R0 - 40); g.stroke();
    g.setLineDash([]); g.strokeStyle = 'rgba(29,32,38,0.4)';
    g.beginPath(); g.moveTo(c - R0 + 40, c); g.lineTo(c + R0 - 40, c); g.stroke();
    // cerchi leggeri ogni 2 cm
    g.strokeStyle = 'rgba(29,32,38,0.08)'; g.lineWidth = 2;
    for (let r = 0.04; r < DISC.R - 0.03; r += 0.04) { g.beginPath(); g.arc(c, c, P(r), 0, Math.PI * 2); g.stroke(); }
    g.font = `500 34px ${MONO}`; g.fillStyle = 'rgba(29,32,38,0.5)'; g.fillText('normale', c + 70, c - R0 + 90);
  }, { aniso: 16 });
}

/** Il goniometro trasparente da attaccare al vetro: un cerchio graduato, 0° sulla normale. */
function protractorTexture() {
  const W = 1024;
  return canvasTexture(W, W, (g) => {
    const c = W / 2, R = c - 10;
    g.clearRect(0, 0, W, W);
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(20,24,30,0.85)'; g.fillStyle = 'rgba(20,24,30,0.9)'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let k = 0; k < 360; k++) {
      const a = (k * Math.PI) / 180, sx = Math.sin(a), cy = -Math.cos(a), len = k % 10 === 0 ? 34 : k % 5 === 0 ? 22 : 12;
      g.lineWidth = k % 10 === 0 ? 3 : 1.6;
      g.beginPath(); g.moveTo(c + sx * R, c + cy * R); g.lineTo(c + sx * (R - len), c + cy * (R - len)); g.stroke();
      if (k % 10 === 0) {
        const v = k <= 90 ? k : k <= 180 ? 180 - k : k <= 270 ? k - 180 : 360 - k;
        g.save(); g.translate(c + sx * (R - 58), c + cy * (R - 58)); g.rotate(a); g.font = `600 26px ${MONO}`; g.fillText(String(v), 0, 0); g.restore();
      }
    }
    g.lineWidth = 2; g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.stroke();
    g.setLineDash([14, 10]); g.beginPath(); g.moveTo(c, c - R + 70); g.lineTo(c, c + R - 70); g.stroke(); g.setLineDash([]);
    g.beginPath(); g.moveTo(c - 10, c); g.lineTo(c + 10, c); g.moveTo(c, c - 10); g.lineTo(c, c + 10); g.stroke();
  }, { srgb: true, aniso: 8 });
}

export class Rig {
  constructor() {
    this.group = new THREE.Group(); this.group.name = 'rifrazione';
    this.M = {
      black: std({ color: '#17181b', metalness: 0.3, roughness: 0.5 }),
      iron: std({ color: '#2c3138', metalness: 0.55, roughness: 0.45 }),
      chrome: std({ color: '#e2e4e7', metalness: 1, roughness: 0.15 }),
      alu: std({ color: '#c3c8ce', metalness: 1, roughness: 0.3 }),
      boss: std({ color: '#3a4250', metalness: 0.7, roughness: 0.35 }),
      blue: std({ color: '#5b7fa3', metalness: 0.35, roughness: 0.58 }),
      red: std({ color: '#c62a1e', metalness: 0.1, roughness: 0.45 }),
      glass: new THREE.MeshPhysicalMaterial({ color: '#e6f2f0', metalness: 0, roughness: 0.04, transparent: true, opacity: 0.16, depthWrite: false, clearcoat: 1, side: THREE.DoubleSide }),
      glassEdge: new THREE.MeshPhysicalMaterial({ color: '#8fc2b0', metalness: 0, roughness: 0.1, transparent: true, opacity: 0.6, depthWrite: false }),
      liquid: new THREE.MeshPhysicalMaterial({ color: '#d4e9f1', metalness: 0, roughness: 0.08, transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide }),
      oil: new THREE.MeshPhysicalMaterial({ color: '#e9cf6e', metalness: 0, roughness: 0.06, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }),
      surf: new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 0, roughness: 0.02, transparent: true, opacity: 0.14, depthWrite: false, envMapIntensity: 2.2, clearcoat: 1 }),
      white: new THREE.MeshPhysicalMaterial({ color: '#f6f6f2', roughness: 0.6, metalness: 0, emissive: '#ffffff', emissiveIntensity: 0.04 }),
      plastic: new THREE.MeshPhysicalMaterial({ color: '#dfeef2', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.3, depthWrite: false }),
    };
    this.tankG = new THREE.Group(); this.group.add(this.tankG);
    this.discG = new THREE.Group(); this.group.add(this.discG);
    this._buildJack();
    this._buildTank();
    this._buildDisc();
    this._buildLaser();
    this._buildBeams();
  }
  _mesh(geo, mat, parent, cast = true) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast && !mat.transparent; m.receiveShadow = true;
    (parent || this.group).add(m); return m;
  }

  // ───────────────────────────── il sollevatore ─────────────────────────────
  _buildJack() {
    const M = this.M, g = this.jack = new THREE.Group(); this.tankG.add(g);
    const top = TANK.PLAT, w = 0.3, d = 0.2;
    this._mesh(new RoundedBoxGeometry(w, 0.012, d, 2, 0.003).translate(0, top - 0.006, 0), M.alu, g);
    this._mesh(new RoundedBoxGeometry(w, 0.012, d, 2, 0.003).translate(0, 0.006, 0), M.alu, g);
    // forbici: due coppie di bracci incrociati
    const h = top - 0.024, L = Math.hypot(w * 0.78, h), ang = Math.atan2(h, w * 0.78);
    for (const z of [-d / 2 + 0.02, d / 2 - 0.02]) for (const s of [-1, 1]) {
      const b = this._mesh(new RoundedBoxGeometry(L, 0.012, 0.006, 2, 0.002), M.chrome, g);
      b.position.set(0, top / 2, z + s * 0.004); b.rotation.z = s * ang;
    }
    this._mesh(cyl(0.006, 0.006, d, 16).rotateX(Math.PI / 2).translate(0, top / 2, 0), M.chrome, g);
    this._mesh(cyl(0.004, 0.004, w * 0.95, 12).rotateZ(Math.PI / 2).translate(0, top / 2, 0), M.chrome, g);   // vite
    this._mesh(cyl(0.016, 0.016, 0.012, 20).rotateZ(Math.PI / 2).translate(w * 0.5, top / 2, 0), M.black, g);   // manopola
  }

  // ───────────────────────────── la vasca ─────────────────────────────
  _buildTank() {
    const M = this.M, g = this.tankG, { X0, G, PLAT, H, Z } = TANK;
    const W = 2 * X0 + 2 * G, D = 2 * Z + 2 * G;
    this._mesh(new THREE.BoxGeometry(W, G, D).translate(0, PLAT + G / 2, 0), M.glass, g);
    for (const s of [-1, 1]) {
      this._mesh(new THREE.BoxGeometry(W, H, G).translate(0, PLAT + H / 2, s * (Z + G / 2)), M.glass, g);        // davanti e dietro
    }
    // pareti di sinistra e di destra (a destra, con il foro della fontana: due pezzi e un anello)
    this._mesh(new THREE.BoxGeometry(G, H, 2 * Z).translate(-X0 - G / 2, PLAT + H / 2, 0), M.glass, g);
    this.wallR = this._mesh(new THREE.BoxGeometry(G, H, 2 * Z).translate(X0 + G / 2, PLAT + H / 2, 0), M.glass, g);
    // spigoli verdi del vetro (si vedono di taglio)
    const edge = (x, y, z, sx, sy, sz) => this._mesh(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z), M.glassEdge, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) edge(sx * (X0 + G / 2), PLAT + H / 2, sz * (Z + G / 2), G + 0.0006, H, G + 0.0006);
    for (const sz of [-1, 1]) edge(0, PLAT + H - 0.0015, sz * (Z + G / 2), W, 0.003, G + 0.0006);
    for (const sx of [-1, 1]) edge(sx * (X0 + G / 2), PLAT + H - 0.0015, 0, G + 0.0006, 0.003, D);
    this.hole = this._mesh(new THREE.TorusGeometry(TANK.HOLE_R + 0.0008, 0.0009, 8, 24).rotateY(Math.PI / 2), M.black, g);
    this.hole.position.set(X0 + G + 0.0004, tankY0() + TANK.HOLE, 0);
    // il liquido, l'olio, la superficie
    this.liquid = this._mesh(new THREE.BoxGeometry(1, 1, 1), M.liquid, g, false); this.liquid.renderOrder = 2;
    this.oil = this._mesh(new THREE.BoxGeometry(1, 1, 1), M.oil, g, false); this.oil.renderOrder = 3;
    this.surface = this._mesh(new THREE.PlaneGeometry(2 * X0, 2 * Z).rotateX(-Math.PI / 2), M.surf, g, false); this.surface.renderOrder = 4;
    for (const m of [this.liquid, this.oil, this.surface]) { m.userData.noAO = true; m.userData.noOutline = true; }
    // il goniometro sul vetro davanti
    this.protractor = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshBasicMaterial({ map: protractorTexture(), transparent: true, depthWrite: false, toneMapped: false }));
    this.protractor.renderOrder = 6; this.protractor.userData.noAO = true; this.protractor.userData.noOutline = true;
    g.add(this.protractor);
    // la fontana: il getto, il catino
    this.jetMesh = null;
    this.basin = new THREE.Group(); g.add(this.basin);
    const prof = [[0, 0.002], [0.07, 0.002], [0.078, 0.004], [0.082, TANK.BASIN_TOP + 0.01], [0.086, TANK.BASIN_TOP + 0.012]].map(([r, y]) => new THREE.Vector2(r, y));
    this._mesh(new THREE.LatheGeometry(prof, 48), M.plastic, this.basin, false);
    const bw = this._mesh(new THREE.CylinderGeometry(0.079, 0.074, TANK.BASIN_TOP - 0.006, 48).translate(0, (TANK.BASIN_TOP - 0.006) / 2 + 0.003, 0), M.liquid, this.basin, false);
    bw.userData.noAO = true;
  }

  /** Livello del liquido (m sopra il fondo), olio, liquido, fontana. */
  setTank({ level, liquid, oil, fountain, milk }) {
    const { X0, Z, OIL } = TANK, Y0 = tankY0(), ys = Y0 + level, o = oil ? OIL : 0;
    this.liquid.scale.set(2 * X0 - 0.0004, level - o, 2 * Z - 0.0004); this.liquid.position.set(0, Y0 + (level - o) / 2, 0);
    this.oil.visible = !!oil; this.oil.scale.set(2 * X0 - 0.0004, OIL, 2 * Z - 0.0004); this.oil.position.set(0, ys - OIL / 2, 0);
    this.surface.position.y = ys;
    const tint = new THREE.Color(LIQ_TINT[liquid] || LIQ_TINT.water);
    this.M.liquid.color.copy(tint); this.M.liquid.opacity = milk ? 0.36 : 0.2;
    this.hole.visible = this.basin.visible = !!fountain;
    if (this.jetMesh) { this.tankG.remove(this.jetMesh); this.jetMesh.geometry.dispose(); this.jetMesh = null; }
    if (fountain) {
      const jp = jetPath(level), pts = jp.pts.map((q) => new THREE.Vector3(q.x, q.y, 0));
      pts.unshift(new THREE.Vector3(X0 - 0.001, jp.y0, 0));
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, 200, 1, 14, false);
      // raggio variabile lungo il getto
      const p = geo.attributes.position, cen = new THREE.Vector3();
      for (let i = 0; i <= 200; i++) {
        const t = i / 200; curve.getPointAt(t, cen);
        const k = Math.min(jp.pts.length - 1, Math.round(t * (jp.pts.length - 1)));
        const r = jp.pts[k].r;
        for (let j = 0; j <= 14; j++) { const v = i * 15 + j; p.setXYZ(v, cen.x + (p.getX(v) - cen.x) * r, cen.y + (p.getY(v) - cen.y) * r, cen.z + (p.getZ(v) - cen.z) * r); }
      }
      geo.computeVertexNormals();
      this.jetMesh = this._mesh(geo, this.M.liquid, this.tankG, false); this.jetMesh.renderOrder = 2;
      const end = jp.pts[jp.pts.length - 1];
      this.basin.position.set(end.x, 0, 0);
    }
  }
  /** Il goniometro centrato nel punto d'incidenza (x, y) del piano del fascio. */
  setProtractor(show, x, y) {
    this.protractor.visible = show;
    this.protractor.position.set(x, y, TANK.Z + TANK.G + 0.0006);
  }

  // ───────────────────────────── il disco ottico ─────────────────────────────
  _buildDisc() {
    const M = this.M, g = this.discG, { YC, R } = DISC;
    const dtex = discTexture();
    const face = this._mesh(new THREE.CircleGeometry(R, 128), new THREE.MeshStandardMaterial({ map: dtex, roughness: 0.62, metalness: 0, emissive: '#ffffff', emissiveMap: dtex, emissiveIntensity: 0.16 }), g);
    face.position.set(0, YC, 0.0001); face.userData.noOutline = true;
    this._mesh(cyl(R, R, 0.006, 128).rotateX(Math.PI / 2).translate(0, YC, -0.003), M.alu, g);
    // piede e colonna dietro il disco
    this._mesh(new RoundedBoxGeometry(0.28, 0.022, 0.16, 2, 0.006).translate(0, 0.011, -0.04), M.iron, g);
    this._mesh(cyl(0.011, 0.011, YC - 0.022, 24).translate(0, (YC + 0.022) / 2, -0.03), M.chrome, g);
    this._mesh(cyl(0.022, 0.022, 0.026, 32).rotateX(Math.PI / 2).translate(0, YC, -0.019), M.boss, g);
    // il braccio del laser, che gira attorno al centro dietro il disco
    this.discArm = new THREE.Group(); this.discArm.position.set(0, YC, 0); g.add(this.discArm);
    this._mesh(new RoundedBoxGeometry(0.016, R + 0.012, 0.006, 2, 0.002).translate(0, (R + 0.012) / 2, -0.012), M.black, this.discArm);
    this._mesh(new RoundedBoxGeometry(0.02, 0.012, 0.03, 2, 0.003).translate(0, R + 0.006, 0.0), M.black, this.discArm);   // staffa sul bordo
    // il mezzo cilindro
    this.block = null; this.blockEdge = null;
  }
  setBlock(medium) {
    const g = this.discG, { YC, RB, T } = DISC;
    for (const m of [this.block, this.blockEdge, this.blockWater]) if (m) { g.remove(m); m.geometry.dispose(); }
    this.blockWater = null;
    const s = new THREE.Shape(); s.moveTo(-RB, 0); s.absarc(0, 0, RB, Math.PI, 2 * Math.PI, false); s.lineTo(-RB, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false, curveSegments: 96 }).translate(0, YC, 0.0004);
    const tint = { water: '#e3f1f6', pmma: '#ffffff', crown: '#eef7f2', flint: '#f6f3e8', zirconia: '#fbfbff', glycerin: '#eef4ec', alcohol: '#eef6f8', oil: '#f2e3a8' }[medium] || '#ffffff';
    const ior = { water: 1.333, pmma: 1.49, crown: 1.517, flint: 1.62, zirconia: 2.17 }[medium] || 1.5;
    // facce davanti e dietro: un velo trasparente con i riflessi dello studio (non scrive la profondità: il fascio,
    // che passa dentro, deve vedersi); il bordo lucido più visibile
    const deep = { water: '#cfe6f0', pmma: '#dde9ee', crown: '#d5eadf', flint: '#e8e3cf', zirconia: '#e6e6f4' }[medium] || '#dde9ee';
    const mat = new THREE.MeshPhysicalMaterial({ color: deep, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.32, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.8, ior });
    const edgeMat = new THREE.MeshPhysicalMaterial({ color: tint, roughness: 0.12, metalness: 0, transparent: true, opacity: medium === 'water' ? 0.45 : 0.7, clearcoat: 1, depthWrite: false, envMapIntensity: 1.6 });
    this.block = this._mesh(geo, [mat, edgeMat], g, false);
    this.block.userData.noAO = true; this.block.renderOrder = 5;
    // il contorno: gli spigoli lucidi davanti e dietro
    const pts = s.getPoints(96), seg = [];
    for (const zz of [0.0004, T + 0.0004]) for (let i = 0; i < pts.length - 1; i++) seg.push(pts[i].x, pts[i].y + YC, zz, pts[i + 1].x, pts[i + 1].y + YC, zz);
    const lg = new LineSegmentsGeometry(); lg.setPositions(seg);
    this.blockEdge = new LineSegments2(lg, this.edgeLineMat || (this.edgeLineMat = new LineMaterial({ color: 0xffffff, linewidth: 1.6, transparent: true, opacity: 0.75, depthWrite: false })));
    this.blockEdge.renderOrder = 6; this.blockEdge.userData.noOutline = true; g.add(this.blockEdge);
    if (medium === 'water') {
      // una vaschetta semicircolare di plastica sottile, piena d'acqua
      this.blockWater = this._mesh(new THREE.ExtrudeGeometry(s, { depth: T + 0.004, bevelEnabled: false, curveSegments: 96 }).scale(1.03, 1.03, 1).translate(0, YC + 0.0002, -0.0016), this.M.plastic, g, false);
    }
  }
  /** Il laser sul braccio del disco: angolo (rad) della posizione sul cerchio, misurato dall'alto in senso antiorario. */
  setDiscArm(phi) { this.discArm.rotation.z = phi; }

  // ───────────────────────────── il laser ─────────────────────────────
  _buildLaser() {
    const M = this.M, g = this.laser = new THREE.Group(); this.group.add(g);
    // corpo lungo l'asse +x locale, la finestra d'uscita nell'origine
    const L = 0.14, r = 0.0075;
    this._mesh(cyl(r, r, L - 0.02, 32).rotateZ(Math.PI / 2).translate(-(L - 0.02) / 2 - 0.02, 0, 0), M.alu, g);
    this._mesh(cyl(r * 0.85, r, 0.02, 32).rotateZ(Math.PI / 2).translate(-0.01, 0, 0), M.black, g);
    this._mesh(cyl(r * 1.02, r * 1.02, 0.012, 32).rotateZ(Math.PI / 2).translate(-L + 0.006, 0, 0), M.black, g);
    this._mesh(cyl(0.0028, 0.0028, 0.004, 16).translate(-0.06, r + 0.0005, 0), M.red, g);
    this.aperture = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff3020, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.aperture.scale.setScalar(0.03); this.aperture.position.set(0.001, 0, 0); g.add(this.aperture);
    // il sostegno della vasca: base, asta, morsetto, braccio fino al laser
    const st = this.stand = new THREE.Group(); this.group.add(st);
    this.standBase = this._mesh(new RoundedBoxGeometry(0.14, 0.022, 0.2, 2, 0.006).translate(0, 0.011, 0), M.blue, st);
    this.standRod = this._mesh(cyl(0.006, 0.006, 1, 20).translate(0, 0.5, 0), M.chrome, st);
    this.standBoss = this._mesh(new RoundedBoxGeometry(0.026, 0.026, 0.026, 2, 0.004), M.boss, st);
    this.standArm = this._mesh(cyl(0.005, 0.005, 1, 16).rotateX(Math.PI / 2).translate(0, 0, 0.5), M.chrome, st);
    this.laserClamp = this._mesh(new RoundedBoxGeometry(0.022, 0.022, 0.018, 2, 0.004), M.boss, st);
  }
  /**
   * Il laser: finestra d'uscita nel punto (x, y) del piano, direzione (dx, dy); z del piano; sul disco o sul sostegno.
   */
  placeLaser(x, y, dx, dy, z, onDisc, color) {
    const g = this.laser;
    g.position.set(x, y, z);
    g.rotation.set(0, 0, Math.atan2(dy, dx));
    this.aperture.material.color.setRGB(color[0], color[1], color[2]);
    this.stand.visible = !onDisc;
    if (!onDisc) {
      // il sostegno dietro la vasca: il morsetto tiene il laser a metà del corpo
      const mx = x - dx * 0.07, my = y - dy * 0.07, zs = -0.24;
      this.standBase.position.set(mx, 0, zs);
      this.standRod.position.set(mx, 0, zs); this.standRod.scale.y = my + 0.03;
      this.standBoss.position.set(mx, my, zs);
      this.standArm.position.set(mx, my, zs); this.standArm.scale.z = -zs - 0.012;
      this.laserClamp.position.set(mx, my, -0.012);
    }
  }
  setLaserOn(on) { this.aperture.visible = on; }

  // ───────────────────────────── i fasci e le macchie ─────────────────────────────
  _buildBeams() {
    this.beams = new BeamBuffer(1200);
    const mk = (w, op) => {
      const m = new LineMaterial({ vertexColors: true, linewidth: w, worldUnits: true, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const l = new LineSegments2(this.beams.geometry(), m);
      l.frustumCulled = false; l.renderOrder = 8; l.userData.noOutline = true;
      this.group.add(l); return l;
    };
    this.core = mk(0.0011, 1); this.halo = mk(0.006, 0.22);
    // sotto la luce, una velatura che toglie dallo sfondo i colori che il laser non ha: sul fondo chiaro il rosso
    // resta rosso invece di diventare rosa (moltiplica il colore che c'è già)
    this.tintBuf = new BeamBuffer(1200);
    const tm = new LineMaterial({ vertexColors: true, linewidth: 0.005, worldUnits: true, transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false, toneMapped: false });
    this.tint = new LineSegments2(this.tintBuf.geometry(), tm);
    this.tint.frustumCulled = false; this.tint.renderOrder = 7; this.tint.userData.noOutline = true;
    this.group.add(this.tint);
    const tex = glowTexture();
    this.spots = Array.from({ length: 40 }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
      s.visible = false; s.renderOrder = 9; this.group.add(s); return s;
    });
  }
  /**
   * segs: [{a:[x,y], b:[x,y], I0, I1, vis}], z del piano, colore del laser (rgb), spots: [{p, I}]
   */
  setBeams(segs, z, color, spots) {
    const b = this.beams, tb = this.tintBuf; b.reset(); tb.reset();
    const c0 = [0, 0, 0], c1 = [0, 0, 0], t0 = [1, 1, 1], t1 = [1, 1, 1], cm = Math.max(...color);
    for (const s of segs) {
      const k0 = s.I0 * s.vis * 3.2, k1 = s.I1 * s.vis * 3.2;
      if (k0 < 0.004 && k1 < 0.004) continue;
      const a = [s.a[0], s.a[1], z], bb = [s.b[0], s.b[1], z];
      for (let i = 0; i < 3; i++) {
        c0[i] = color[i] * k0; c1[i] = color[i] * k1;
        const miss = 1 - color[i] / cm;               // quanto di questo canale il laser non ha
        t0[i] = 1 - 0.55 * miss * Math.min(1, k0 * 0.6); t1[i] = 1 - 0.55 * miss * Math.min(1, k1 * 0.6);
      }
      b.push(a, bb, c0, c1); tb.push(a, bb, t0, t1);
    }
    b.commit(); tb.commit();
    this.spots.forEach((sp, i) => {
      const s = spots[i];
      sp.visible = !!s;
      if (!s) return;
      sp.position.set(s.p[0], s.p[1], s.z ?? z);
      const k = Math.min(1.6, 0.25 + 1.6 * s.I);
      sp.material.color.setRGB(color[0] * k, color[1] * k, color[2] * k);
      sp.scale.setScalar((s.size || 0.026) * (0.55 + 0.45 * Math.sqrt(Math.min(1, s.I))));
    });
  }

  setApparatus(kind) { this.tankG.visible = kind === 'tank'; this.discG.visible = kind === 'disc'; }
}
