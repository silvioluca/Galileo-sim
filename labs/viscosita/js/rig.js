// rig.js — il viscosimetro a caduta: tubo di vetro alto un metro su un sostegno da laboratorio, pieno di
// fluido, con scala graduata e due segni a pennarello che delimitano il tratto di misura,
// termometro digitale con sonda, tubetto di guida per far cadere la sfera sull'asse, sfere sul fondo.
// Unità: metri. Il tubo sta in (TUBE.x, ·, 0); le quote dei segni sono misurate dal fondo interno.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture } from '../../../shared/js/geo.js';

export const TUBE = { x: 0.05, y0: 0.03, bottom: 0.042, top: 1.04, wall: 0.003 };   // base, fondo interno, bordo
export const SURF = 0.98;                                   // pelo libero
export const ROD = { x: -0.14, z: -0.05, top: 1.2 };
const FONT = '"Geist Variable", "Segoe UI", Arial, sans-serif';
const MONO = '"Geist Mono Variable", Consolas, monospace';
const cyl = (r0, r1, h, seg = 32, open = false) => new THREE.CylinderGeometry(r0, r1, h, seg, 1, open);

/** Scala in centimetri dal fondo interno: tacche nere su fondo trasparente (stampata sul vetro). */
function scaleTexture(cm) {
  const W = 128, H = 4096, px = H / cm;
  return canvasTexture(W, H, (g) => {
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#121418'; g.textBaseline = 'middle'; g.textAlign = 'left';
    for (let mm = 0; mm <= cm * 10; mm++) {
      const y = H - (mm / 10) * px, L = mm % 100 === 0 ? 70 : mm % 50 === 0 ? 52 : mm % 10 === 0 ? 38 : 20;
      g.fillRect(0, y - (mm % 10 === 0 ? 1.6 : 0.8), L, mm % 10 === 0 ? 3.2 : 1.6);
      if (mm % 50 === 0 && mm > 0 && mm < cm * 10) { g.font = `${mm % 100 === 0 ? 700 : 600} ${mm % 100 === 0 ? 40 : 32}px ${FONT}`; g.fillText(String(mm / 10), 76, y); }
    }
  }, { aniso: 16 });
}
function labelTexture(lines, w = 512, h = 160) {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = '#f4f2ec'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c8281e'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = '#15181c'; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach(([t, size, y]) => { g.font = `700 ${size}px ${FONT}`; g.fillText(t, w / 2, y); });
  });
}

export class Rig {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'viscosimetro';
    const std = (o) => new THREE.MeshStandardMaterial(o);
    this.M = {
      iron: std({ color: '#2c3440', metalness: 0.55, roughness: 0.48 }),
      chrome: std({ color: '#e4e5e6', metalness: 1, roughness: 0.14 }),
      black: std({ color: '#121315', metalness: 0.45, roughness: 0.42 }),
      rubber: std({ color: '#1a1b1d', metalness: 0, roughness: 0.9 }),
      ink: std({ color: '#d4301f', metalness: 0, roughness: 0.5 }),
      boss: std({ color: '#3a4250', metalness: 0.7, roughness: 0.35 }),
      cork: std({ color: '#b98b5b', metalness: 0, roughness: 0.92 }),
    };
    this.glassMat = new THREE.MeshPhysicalMaterial({ color: '#eaf3f6', metalness: 0, roughness: 0.03, transparent: true, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.03, side: THREE.DoubleSide, depthWrite: false });
    // il liquido: materiale a trasmissione, con rifrazione e assorbimento lungo lo spessore (colore del fluido)
    // (indice di rifrazione ridotto: la rifrazione della trasmissione è un'approssimazione che esagera l'effetto lente)
    this.fluidMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 0, roughness: 0.04, transmission: 1, thickness: 0.06, ior: 1.08, attenuationColor: new THREE.Color('#f3eed2'), attenuationDistance: 0.5, specularIntensity: 0.6 });
    this.surfMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 0.1, roughness: 0.02, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false });
    this._buildStand();
    this.tubeGroup = new THREE.Group();
    this.group.add(this.tubeGroup);
    this.marks = [];
    this._buildThermo();
    this.pile = new THREE.Group();
    this.group.add(this.pile);
    this.D = 0;
  }

  _mesh(geo, mat, parent) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = !mat.transparent; m.receiveShadow = true;
    (parent || this.group).add(m);
    return m;
  }

  _buildStand() {
    const M = this.M;
    this._mesh(new RoundedBoxGeometry(0.36, 0.026, 0.26, 3, 0.008).translate(-0.04, 0.013, -0.01), M.iron);
    for (const [x, z] of [[-0.2, -0.12], [-0.2, 0.1], [0.12, -0.12], [0.12, 0.1]]) this._mesh(cyl(0.012, 0.014, 0.006, 20).translate(x, -0.0, z), M.rubber);
    this._mesh(cyl(0.0085, 0.0085, ROD.top - 0.026, 24).translate(ROD.x, (ROD.top + 0.026) / 2, ROD.z), M.chrome);
    this._mesh(cyl(0.011, 0.011, 0.012, 24).translate(ROD.x, ROD.top + 0.006, ROD.z), M.black);
    // targhetta sul basamento
    const plq = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.018), new THREE.MeshStandardMaterial({ map: labelTexture([['VISCOSIMETRO A CADUTA', 58, 80]], 768, 120), roughness: 0.5 }));
    plq.rotation.x = -Math.PI / 2; plq.position.set(-0.11, 0.0262, 0.08); this.group.add(plq);
  }

  /** Morsetto a noce sull'asta con un braccio fino al tubo e un anello che lo stringe, alla quota y. */
  _clamp(y, R, parent) {
    const M = this.M;
    this._mesh(new RoundedBoxGeometry(0.03, 0.03, 0.03, 2, 0.004).translate(ROD.x, y, ROD.z), M.boss, parent);
    this._mesh(cyl(0.004, 0.004, 0.02, 12).rotateX(Math.PI / 2).translate(ROD.x, y, ROD.z + 0.024), M.chrome, parent);
    const L = Math.hypot(TUBE.x - ROD.x, ROD.z) - R - 0.006, ang = Math.atan2(-ROD.z, TUBE.x - ROD.x);
    const arm = this._mesh(cyl(0.0045, 0.0045, L, 12).rotateZ(Math.PI / 2), M.chrome, parent);
    arm.position.set(ROD.x + (Math.cos(ang) * L) / 2 + 0.008, y, ROD.z + (Math.sin(ang) * L) / 2);
    arm.rotation.y = -ang;
    this._mesh(new THREE.TorusGeometry(R + 0.004, 0.0035, 10, 48).rotateX(Math.PI / 2).translate(TUBE.x, y, 0), M.black, parent);
  }

  /** Tubo di diametro interno D (si ricostruisce). */
  setTube(D) {
    if (D === this.D) return;
    this.D = D;
    const T = this.tubeGroup, M = this.M;
    for (const c of [...T.children]) { T.remove(c); c.traverse((o) => o.geometry && o.geometry.dispose()); }
    const R = D / 2, Ro = R + TUBE.wall, H = TUBE.top - TUBE.y0;
    // piedino di gomma, vetro (pareti e fondo spesso), fluido, pelo libero
    this._mesh(cyl(Ro + 0.012, Ro + 0.014, 0.012, 48).translate(TUBE.x, TUBE.y0 - 0.002, 0), M.rubber, T);
    const glass = this._mesh(cyl(Ro, Ro, H, 64, true).translate(TUBE.x, TUBE.y0 + H / 2, 0), this.glassMat, T); glass.renderOrder = 4;
    const gin = this._mesh(cyl(R, R, H, 64, true).translate(TUBE.x, TUBE.y0 + H / 2, 0), this.glassMat, T); gin.renderOrder = 4;
    this._mesh(new THREE.TorusGeometry(R + TUBE.wall / 2, TUBE.wall / 2, 8, 64).rotateX(Math.PI / 2).translate(TUBE.x, TUBE.top, 0), this.glassMat, T).renderOrder = 4;
    const bot = this._mesh(cyl(Ro, Ro, TUBE.bottom - TUBE.y0, 64).translate(TUBE.x, (TUBE.y0 + TUBE.bottom) / 2, 0), this.glassMat, T); bot.renderOrder = 4;
    const fl = this._mesh(cyl(R - 0.0003, R - 0.0003, SURF - TUBE.bottom, 64).translate(TUBE.x, (SURF + TUBE.bottom) / 2, 0), this.fluidMat, T); fl.castShadow = false;
    this.fluidMat.thickness = D;
    // menisco: un anello appena più alto contro il vetro
    const men = new THREE.Mesh(new THREE.RingGeometry(0, R - 0.0003, 64).rotateX(-Math.PI / 2).translate(TUBE.x, SURF, 0), this.surfMat);
    men.renderOrder = 5; T.add(men);
    this._mesh(cyl(R - 0.0003, R - 0.0003, 0.003, 64, true).translate(TUBE.x, SURF + 0.0015, 0), this.surfMat, T).renderOrder = 5;
    // scala graduata sul davanti del vetro
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.018, SURF + 0.02 - TUBE.bottom), new THREE.MeshStandardMaterial({ map: scaleTexture(Math.round((SURF + 0.02 - TUBE.bottom) * 100)), transparent: true, alphaTest: 0.3, roughness: 0.5, depthWrite: false }));
    sc.position.set(TUBE.x - 0.004, (SURF + 0.02 + TUBE.bottom) / 2, Ro + 0.0004); sc.renderOrder = 6;
    T.add(sc);
    // morsetti e tubetto di guida
    this._clamp(0.32, Ro, T); this._clamp(0.86, Ro, T);
    const gy = SURF + 0.02;
    this._mesh(cyl(0.009, 0.009, 0.1, 32, true).translate(TUBE.x, gy + 0.05, 0), new THREE.MeshPhysicalMaterial({ color: '#dfe9ee', roughness: 0.1, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }), T);
    this._mesh(new THREE.TorusGeometry(0.0105, 0.002, 8, 32).rotateX(Math.PI / 2).translate(TUBE.x, gy + 0.1, 0), M.black, T);
    this._clampGuide(gy + 0.075, T);
    this.thermoProbe.position.set(TUBE.x + (R - 0.0045) * Math.SQRT1_2, 0, -(R - 0.0045) * Math.SQRT1_2);
    // segni del tratto di misura: due righe a pennarello sul davanti del vetro, attraverso la scala
    const arc = 1.25;
    this.marks = [0, 1].map(() => {
      const m = this._mesh(new THREE.CylinderGeometry(Ro + 0.0004, Ro + 0.0004, 0.0018, 24, 1, true, -arc / 2, arc), M.ink, T);
      m.castShadow = false; m.renderOrder = 6;
      return m;
    });
  }
  /** Quote dei due segni (dal fondo interno, in metri). */
  setMarks(h1, h2) {
    [h1, h2].forEach((h, i) => { if (this.marks[i]) this.marks[i].position.set(TUBE.x, TUBE.bottom + h, 0); });
  }
  _clampGuide(y, parent) {
    const M = this.M, L = TUBE.x - ROD.x - 0.012;
    this._mesh(new RoundedBoxGeometry(0.026, 0.026, 0.026, 2, 0.004).translate(ROD.x, y, ROD.z), M.boss, parent);
    const arm = this._mesh(cyl(0.004, 0.004, Math.hypot(L, ROD.z), 12).rotateZ(Math.PI / 2), M.chrome, parent);
    arm.position.set((ROD.x + TUBE.x - 0.012) / 2, y, ROD.z / 2); arm.rotation.y = Math.atan2(ROD.z, L);
    this._mesh(new THREE.TorusGeometry(0.0115, 0.0025, 8, 32).rotateX(Math.PI / 2).translate(TUBE.x, y, 0), M.black, parent);
  }

  /** Colore del fluido; alpha (0–1) dice quanto è carico: da qui la distanza di assorbimento. */
  setFluid(color, alpha) {
    const m = this.fluidMat;
    m.attenuationColor.set(color);
    m.attenuationDistance = 0.02 / Math.max(alpha, 0.05) ** 2;
    m.thickness = this.D || 0.06;
    this.surfMat.color.set(color).lerp(new THREE.Color('#ffffff'), 0.6);
  }

  // ───────────────────────────── termometro digitale ─────────────────────────────
  _buildThermo() {
    const M = this.M;
    // sonda d'acciaio appesa al bordo del tubo, cavo verso il display sul basamento
    const probe = new THREE.Group(); this.group.add(probe);
    this._mesh(cyl(0.0016, 0.0016, 0.16, 12).translate(0, SURF - 0.04, 0), M.chrome, probe);
    this._mesh(new RoundedBoxGeometry(0.012, 0.03, 0.012, 2, 0.003).translate(0, TUBE.top + 0.02, 0), M.black, probe);
    probe.position.set(TUBE.x, 0, 0);
    this.thermoProbe = probe;
    this._mesh(new RoundedBoxGeometry(0.09, 0.03, 0.06, 2, 0.005).translate(0.16, 0.041, 0.06), new THREE.MeshStandardMaterial({ color: '#e9e8e3', roughness: 0.45 }));
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    this.thermoCtx = c.getContext('2d');
    this.thermoTex = new THREE.CanvasTexture(c); this.thermoTex.colorSpace = THREE.SRGBColorSpace;
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.026), new THREE.MeshBasicMaterial({ map: this.thermoTex, toneMapped: false }));
    disp.rotation.x = -Math.PI / 2; disp.position.set(0.16, 0.0562, 0.06); this.group.add(disp);
    // il cavo scende dietro il tubo
    const cable = new THREE.CatmullRomCurve3([[TUBE.x + 0.015, TUBE.top + 0.035, -0.02], [TUBE.x + 0.07, TUBE.top - 0.02, -0.07], [0.15, 0.55, -0.09], [0.2, 0.08, -0.05], [0.19, 0.045, 0.03], [0.16, 0.045, 0.06]].map((p) => new THREE.Vector3(...p)));
    this._mesh(new THREE.TubeGeometry(cable, 80, 0.0018, 6), M.rubber);
    this.thermoText = '';
  }
  setThermo(T) {
    const text = `${T.toFixed(1)} °C`;
    if (text === this.thermoText) return;
    this.thermoText = text;
    const g = this.thermoCtx;
    g.fillStyle = '#c9d4c4'; g.fillRect(0, 0, 256, 96);
    g.fillStyle = '#1a2018'; g.font = `700 58px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 128, 52);
    this.thermoTex.needsUpdate = true;
  }

  // ───────────────────────────── sfere ─────────────────────────────
  ballMaterial(key) {
    const look = {
      steel: { color: '#e2e4e6', metalness: 1, roughness: 0.08 }, brass: { color: '#d4ab52', metalness: 1, roughness: 0.18 },
      glass: { color: '#cfe6ec', metalness: 0, roughness: 0.02, transparent: true, opacity: 0.55 }, alu: { color: '#c8ccd1', metalness: 1, roughness: 0.3 },
      ptfe: { color: '#f4f2ec', metalness: 0, roughness: 0.45 }, nylon: { color: '#efe6cf', metalness: 0, roughness: 0.38 },
    }[key];
    return new THREE.MeshPhysicalMaterial({ ...look, clearcoat: key === 'glass' ? 1 : 0 });
  }
  makeBall(key, r) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), this.ballMaterial(key));
    m.castShadow = true; m.renderOrder = 2;
    return m;
  }
  /** Una sfera arrivata sul fondo resta lì (al più 24). */
  addToPile(key, r, x, z) {
    const m = this.makeBall(key, r);
    m.position.set(x, TUBE.bottom + r, z);
    this.pile.add(m);
    while (this.pile.children.length > 24) this.pile.remove(this.pile.children[0]);
  }
  clearPile() { for (const c of [...this.pile.children]) this.pile.remove(c); }
}
