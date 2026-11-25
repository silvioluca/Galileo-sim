// rig.js — la vaschetta ondoscopica, appoggiata sul pavimento: un foglio bianco; sopra, su quattro gambe, la vasca
// col fondo di vetro, il telaio d'alluminio e le spiagge di spugna; la lampada in alto su un braccio; il generatore
// di vibrazioni su un sostegno accanto alla vasca, con un braccio che porta la punta, le due punte o la barra,
// oppure il carrello con la punta che scorre su una rotaia; gli ostacoli (barriere, fenditure, specchio parabolico, lastra e lente di vetro). A scelta,
// sotto la vasca, uno specchio a 45° che manda l'immagine su uno schermo verticale davanti.
// L'acqua è un piano deformato nella scheda grafica dall'altezza simulata (ingrandita); il foglio e lo schermo
// mostrano la luce della lampada dopo che l'acqua l'ha concentrata: creste chiare, valli scure, le ombre di pareti,
// punte e asta.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

export const HALF = 0.2;                         // mezza vasca (interno), m
export const GLASS_Y = 0.314;                    // faccia superiore del fondo di vetro
export const WATER_Y = 0.32;                     // pelo dell'acqua (per la proiezione)
export const LAMP_Y = 0.94;
export const PAPER_Y = 0.0015;
export const LAMP_STAND = { x: 0.5, z: -0.36 };
// lo specchio: il piano y + z = c (inclinato di 45°, guarda in alto e verso lo schermo), lungo L sul pendio, largo W
export const MIRROR = { c: 0.165, L: 0.38, W: 0.64 };
// lo schermo: carta da lucido in un telaio verticale davanti alla vasca
export const SCREEN = { z: 0.32, w: 0.84, y0: 0.02, y1: 0.41 };
const FRAME_TOP = WATER_Y + 0.022;               // bordo superiore delle sponde
export const GEN = { x: -0.47, z: 0 };           // il generatore di vibrazioni, sul suo sostegno a sinistra della vasca
export const ARM_Y = WATER_Y + 0.036;            // quota del braccio che porta le punte (passa sopra la sponda)
const cyl = (r0, r1, h, seg = 32) => new THREE.CylinderGeometry(r0, r1, h, seg);

export class Rig {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'vaschetta';
    const std = (o) => new THREE.MeshStandardMaterial(o);
    this.M = {
      iron: std({ color: '#2c3440', metalness: 0.55, roughness: 0.48 }),
      chrome: std({ color: '#e4e5e6', metalness: 1, roughness: 0.14 }),
      alu: std({ color: '#c9cdd2', metalness: 1, roughness: 0.32 }),
      black: std({ color: '#141518', metalness: 0.3, roughness: 0.5 }),
      boss: std({ color: '#3a4250', metalness: 0.7, roughness: 0.35 }),
      sponge: std({ color: '#3b3f45', metalness: 0, roughness: 1 }),
      wall: std({ color: '#30353d', metalness: 0.2, roughness: 0.55 }),
      rubber: std({ color: '#7a4a2a', metalness: 0, roughness: 0.8 }),
      mirrorEdge: std({ color: '#a9bdb8', metalness: 0.1, roughness: 0.15 }),
      red: std({ color: '#c62a1e', metalness: 0.1, roughness: 0.45 }),
      glass: new THREE.MeshPhysicalMaterial({ color: '#e3eef2', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false, clearcoat: 1 }),
      plateGlass: new THREE.MeshPhysicalMaterial({ color: '#cfe3ea', metalness: 0, roughness: 0.08, transparent: true, opacity: 0.38, depthWrite: false }),
    };
    this._buildPaper();
    this._buildTank();
    this._buildLamp();
    this._buildVibrator();
    this._buildRail();
    this._buildMirror();
    this.obst = new THREE.Group(); this.group.add(this.obst);
  }
  _mesh(geo, mat, parent) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = !mat.transparent; m.receiveShadow = true;
    (parent || this.group).add(m);
    return m;
  }

  // ───────────────────────────── il foglio e lo schermo: la luce proiettata ─────────────────────────────
  // Per ogni punto del foglio il raggio dalla lampada ha attraversato l'acqua in tp = P.xz·(yL − yA)/(yL − P.y).
  // Per lo schermo si riflette prima il punto nello specchio (P*): da lì la luce sembra venire, in linea retta dalla
  // lampada. Il raggio deve cadere sullo specchio; sul foglio, invece, lo specchio fa ombra.
  _buildPaper() {
    const gainS = ((LAMP_Y - PAPER_Y) / (LAMP_Y - (MIRROR.c - SCREEN.z))) ** 2 * 0.9;   // più lontano dalla lampada, e lo specchio riflette il 90 %
    this.paperU = {
      uLight: { value: null }, uHalf: { value: HALF }, uRoom: { value: 0.6 }, uLamp: { value: 1 }, uMode: { value: 0 },
      uLy: { value: LAMP_Y }, uWy: { value: WATER_Y }, uGainS: { value: gainS },
      uMir: { value: new THREE.Vector4(MIRROR.c, MIRROR.L / 2, MIRROR.W / 2, 0) },
      uDip: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, uBarS: { value: new THREE.Vector4() }, uArm: { value: new THREE.Vector4() }, uRail: { value: new THREE.Vector4() }, uLine: { value: new THREE.Vector4() },
      uPaper: { value: new THREE.Color('#f5f2ea') }, uFrame: { value: HALF + 0.02 },
    };
    const make = (kind, color) => new THREE.ShaderMaterial({
      uniforms: { ...this.paperU, uKind: { value: kind }, uPaper: { value: new THREE.Color(color) } },
      side: kind ? THREE.DoubleSide : THREE.FrontSide,
      vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `
        uniform sampler2D uLight; uniform float uKind, uHalf, uRoom, uLamp, uMode, uFrame, uLy, uWy, uGainS;
        uniform vec4 uDip[3]; uniform vec4 uBarS, uArm, uRail, uLine, uMir; uniform vec3 uPaper;
        varying vec3 vW;
        // il raggio dalla lampada a p passa per lo specchio? (piano y + z = c, centrato in (0, c, 0))
        float onMirror(vec3 p) {
          vec3 L = vec3(0.0, uLy, 0.0), d = p - L;
          float s = (uMir.x - uLy) / (d.y + d.z);
          vec3 H = L + s * d;
          float b = (H.y - uMir.x - H.z) * 0.70710678;
          return step(0.0, s) * step(s, 1.0) * step(abs(H.x), uMir.z) * step(abs(b), uMir.y);
        }
        void main() {
          vec3 P = vW; float lit = 1.0;
          if (uKind > 0.5) { P = vW - (vW.y + vW.z - uMir.x) * vec3(0.0, 1.0, 1.0); lit = onMirror(P) * uGainS; }
          else if (uMir.w > 0.5) lit = 1.0 - onMirror(P);
          float k = (uLy - uWy) / (uLy - P.y);
          vec2 tp = P.xz * k;                                        // il punto dell'acqua da cui viene la luce
          vec2 uv = vec2((tp.x + uHalf) / (2.0 * uHalf), (uHalf - tp.y) / (2.0 * uHalf));
          float ins = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
          float onFrame = (1.0 - ins) * step(abs(tp.x), uFrame) * step(abs(tp.y), uFrame);
          vec4 L = texture2D(uLight, clamp(uv, 0.0, 1.0));
          float I = uMode < 0.5 ? (uKind > 0.5 ? L.a : L.r) * 0.82 : 0.06 + 1.05 * L.g;
          I *= 1.0 - L.b;                                            // le pareti fanno ombra
          for (int i = 0; i < 3; i++) if (uDip[i].w > 0.5) I *= smoothstep(uDip[i].z * 0.75, uDip[i].z * 1.25, length(tp - uDip[i].xy));
          if (uBarS.w > 0.0) I *= 1.0 - (1.0 - smoothstep(uBarS.w * 0.6, uBarS.w, abs(tp.x - uBarS.x))) * step(uBarS.y, tp.y) * step(tp.y, uBarS.z) * 0.9;   // w: mezza larghezza
          if (uArm.w > 0.5) I *= 1.0 - (1.0 - smoothstep(0.0018, 0.0034, abs(tp.y - uArm.z))) * step(uArm.x, tp.x) * step(tp.x, uArm.y) * 0.85;
          if (uRail.w > 0.5) I *= 1.0 - (1.0 - smoothstep(0.003, 0.006, abs(tp.y - uRail.y))) * 0.85;
          float direct = 1.0 - smoothstep(0.0, 0.4, length(tp)) * 0.35;  // la lampada illumina meno ai bordi
          float lamp = uLamp * lit * direct * (ins * I + onFrame * 0.05 + (1.0 - ins - onFrame) * 0.95);
          vec3 col = uPaper * (uRoom * 0.32 + lamp * 1.0);
          if (uLine.w > 0.5) { float d = abs(tp.x - uLine.x) / k; col = mix(col, vec3(0.85, 0.12, 0.08), (1.0 - smoothstep(0.0008, 0.0016, d)) * ins); }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.74).rotateX(-Math.PI / 2), make(0, '#f5f2ea'));
    paper.position.y = PAPER_Y; paper.userData.noAO = true; paper.userData.noOutline = true; this.group.add(paper); this.paper = paper;
    this.screenMat = make(1, '#f1efe9');
  }

  // ───────────────────────────── la vasca ─────────────────────────────
  _buildTank() {
    const M = this.M, h = HALF, wt = 0.02, top = FRAME_TOP, bot = GLASS_Y - 0.006;
    // telaio: quattro sponde d'alluminio, il fondo di vetro, quattro gambe con i piedini
    for (const [sx, sz, lx, lz] of [[0, -1, 2 * h + 2 * wt, wt], [0, 1, 2 * h + 2 * wt, wt], [-1, 0, wt, 2 * h], [1, 0, wt, 2 * h]]) {
      this._mesh(new RoundedBoxGeometry(lx, top - bot, lz, 2, 0.003).translate(sx * (h + wt / 2), (top + bot) / 2, sz * (h + wt / 2)), M.alu);
    }
    this._mesh(new THREE.BoxGeometry(2 * h + 0.004, 0.006, 2 * h + 0.004).translate(0, GLASS_Y - 0.003, 0), M.glass);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      this._mesh(cyl(0.008, 0.008, bot - 0.012, 16).translate(sx * (h + 0.01), bot / 2 + 0.006, sz * (h + 0.01)), M.chrome);
      this._mesh(cyl(0.016, 0.018, 0.012, 24).translate(sx * (h + 0.01), 0.006, sz * (h + 0.01)), M.black);
    }
    // spiagge di spugna inclinate lungo le sponde (smorzano le onde che arrivano al bordo)
    this.beaches = new THREE.Group(); this.group.add(this.beaches);
    for (const [sx, sz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const len = 2 * h, g = new THREE.BoxGeometry(sx ? 0.024 : len, 0.004, sz ? 0.024 : len);
      const m = this._mesh(g, M.sponge, this.beaches);
      m.position.set(sx * (h - 0.012), GLASS_Y + 0.004, sz * (h - 0.012));
      if (sx) m.rotation.z = sx * 0.28; else m.rotation.x = -sz * 0.28;
    }
    // l'acqua: un piano fitto che la scheda grafica solleva con l'altezza simulata (×uGain) e di cui calcola le normali
    this.waterU = { uState: { value: null }, uTexel: { value: 1 / 400 }, uDx: { value: 0.001 }, uGain: { value: 30 }, uNG: { value: 70 }, uHalf: { value: HALF } };
    const wm = new THREE.MeshPhysicalMaterial({ color: '#cfe5ee', metalness: 0, roughness: 0.02, transparent: true, opacity: 0.42, depthWrite: false, envMapIntensity: 2.2, clearcoat: 1, clearcoatRoughness: 0.02 });
    wm.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.waterU);
      sh.vertexShader = 'uniform sampler2D uState; uniform float uTexel, uDx, uGain, uNG, uHalf;\n' + sh.vertexShader
        .replace('#include <beginnormal_vertex>', `
          vec2 wuv = vec2((position.x + uHalf) / (2.0 * uHalf), (uHalf - position.z) / (2.0 * uHalf));
          float wh = texture2D(uState, wuv).r;
          float gx = (texture2D(uState, wuv + vec2(uTexel, 0.0)).r - texture2D(uState, wuv - vec2(uTexel, 0.0)).r) / (2.0 * uDx);
          float gv = (texture2D(uState, wuv + vec2(0.0, uTexel)).r - texture2D(uState, wuv - vec2(0.0, uTexel)).r) / (2.0 * uDx);
          vec3 objectNormal = normalize(vec3(-gx * uNG, 1.0, -gv * uNG));
          #ifdef USE_TANGENT
            vec3 objectTangent = vec3(1.0, 0.0, 0.0);
          #endif`)
        .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position); transformed.y += wh * uGain;');
    };
    wm.customProgramCacheKey = () => 'ripple-water';
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(2 * h, 2 * h, 220, 220).rotateX(-Math.PI / 2), wm);
    this.water.position.y = WATER_Y; this.water.renderOrder = 4; this.water.frustumCulled = false; this.water.userData.noAO = true; this.water.userData.noOutline = true;
    this.group.add(this.water);
  }
  setDepth(depth) { this.water.position.y = GLASS_Y + depth; this.depth = depth; }
  setBeaches(on) { this.beaches.visible = on; }

  // ───────────────────────────── la lampada ─────────────────────────────
  _buildLamp() {
    const M = this.M, { x, z } = LAMP_STAND, top = LAMP_Y + 0.16;
    this._mesh(new RoundedBoxGeometry(0.2, 0.024, 0.16, 3, 0.007).translate(x, 0.012, z), M.iron);
    this._mesh(cyl(0.0095, 0.0095, top, 24).translate(x, top / 2, z), M.chrome);
    this._mesh(new RoundedBoxGeometry(0.035, 0.035, 0.035, 2, 0.004).translate(x, top - 0.02, z), M.boss);
    // braccio fino sopra il centro della vasca
    const arm = new THREE.Vector3(-x, 0, -z), len = arm.length();
    const a = this._mesh(cyl(0.008, 0.008, len, 20), M.chrome);
    a.position.set(x / 2, top - 0.02, z / 2); a.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), arm.normalize());
    this._mesh(cyl(0.006, 0.006, top - 0.02 - LAMP_Y - 0.05, 16).translate(0, (top - 0.02 + LAMP_Y + 0.05) / 2, 0), M.chrome);
    const prof = [[0.006, 0.07], [0.02, 0.07], [0.03, 0.055], [0.045, 0.02], [0.05, 0.0], [0.046, 0.0], [0.041, 0.018], [0.027, 0.05], [0.006, 0.062]].map(([r, y]) => new THREE.Vector2(r, y));
    this._mesh(new THREE.LatheGeometry(prof, 48).translate(0, LAMP_Y - 0.015, 0), M.black);
    this.bulbMat = new THREE.MeshStandardMaterial({ color: '#fff6dc', emissive: '#fff1c8', emissiveIntensity: 2.4, roughness: 0.3 });
    const bulb = this._mesh(new THREE.SphereGeometry(0.016, 24, 16).translate(0, LAMP_Y, 0), this.bulbMat); bulb.castShadow = false;
    this.lampLight = new THREE.PointLight('#fff2d6', 3, 3, 1.4);
    this.lampLight.position.set(0, LAMP_Y - 0.03, 0); this.group.add(this.lampLight);
  }
  setLamp(on) { this.bulbMat.emissiveIntensity = on ? 2.4 : 0; this.lampLight.intensity = on ? 3 : 0; this.paperU.uLamp.value = on ? 1 : 0; }

  // ───────────────────────────── il generatore di vibrazioni ─────────────────────────────
  // A sinistra della vasca, su un sostegno: il cilindro nero con la fascia gialla, l'albero che sale e scende e,
  // fissato all'albero, un braccio orizzontale che arriva sopra l'acqua con la punta, le due punte o la barra.
  _buildVibrator() {
    const M = this.M, g = new THREE.Group(); this.group.add(g); this.vibG = g;
    const { x: gx, z: gz } = GEN, bodyTop = ARM_Y - 0.014, bodyBot = bodyTop - 0.095, R = 0.045;
    const blue = new THREE.MeshStandardMaterial({ color: '#5b7fa3', metalness: 0.35, roughness: 0.58 });
    const yellow = new THREE.MeshStandardMaterial({ color: '#e0b22c', metalness: 0.15, roughness: 0.42 });
    const shell = new THREE.MeshStandardMaterial({ color: '#17181b', metalness: 0.25, roughness: 0.38 });
    // sostegno: base pesante verniciata, asta, manicotto sotto il generatore
    this._mesh(new RoundedBoxGeometry(0.15, 0.026, 0.22, 3, 0.008).translate(gx, 0.013, gz), blue, g);
    this._mesh(new RoundedBoxGeometry(0.04, 0.03, 0.04, 2, 0.006).translate(gx, 0.041, gz), blue, g);
    this._mesh(cyl(0.0065, 0.0065, bodyBot - 0.05, 20).translate(gx, (bodyBot + 0.05) / 2, gz), M.chrome, g);
    this._mesh(cyl(0.012, 0.014, 0.022, 28).translate(gx, bodyBot - 0.009, gz), shell, g);
    // il corpo: nero sotto, fascia gialla, nero sopra con lo spigolo arrotondato
    const lathe = (pts, mat) => this._mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 64).translate(gx, bodyBot, gz), mat, g);
    lathe([[0.0, 0.0], [R - 0.004, 0.0], [R, 0.004], [R, 0.045]], shell);
    lathe([[R + 0.0006, 0.045], [R + 0.0006, 0.067]], yellow);
    lathe([[R, 0.067], [R, 0.088], [R - 0.003, 0.0935], [R - 0.008, 0.095], [0.02, 0.095], [0.02, 0.0915], [0.0, 0.0915]], shell);
    this._mesh(cyl(0.02, 0.02, 0.002, 40).translate(gx, bodyTop - 0.0025, gz), M.rubber, g);          // membrana
    // le due boccole, sul davanti
    for (const [dx, mat] of [[-0.016, M.red], [0.016, M.black]]) {
      this._mesh(cyl(0.0065, 0.0065, 0.012, 20).rotateX(Math.PI / 2).translate(gx + dx, bodyBot + 0.078, gz + R + 0.004), mat, g);
      this._mesh(cyl(0.0022, 0.0022, 0.004, 12).rotateX(Math.PI / 2).translate(gx + dx, bodyBot + 0.078, gz + R + 0.011), M.chrome, g);
    }
    // cavi: dalle boccole giù fino al pavimento e via, verso il generatore di funzioni
    for (const [k, dx] of [[0, -0.016], [1, 0.016]]) {
      const a = new THREE.Vector3(gx + dx, bodyBot + 0.078, gz + R + 0.012);
      const pts = [a, a.clone().add(new THREE.Vector3(0, -0.01, 0.05)), new THREE.Vector3(gx + dx - 0.02, 0.05, gz + 0.13), new THREE.Vector3(gx - 0.08 + k * 0.02, 0.004, gz + 0.2), new THREE.Vector3(gx - 0.5, 0.004, gz + 0.36 + k * 0.03), new THREE.Vector3(gx - 1.6, 0.004, gz + 0.7 + k * 0.03)];
      this._mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 140, 0.0026, 8, false), k ? M.black : M.red, g);
    }
    // la parte che vibra: albero, dado, braccio, portapunte, punte o barra
    const mv = this.mover = new THREE.Group(); g.add(mv);
    this._mesh(cyl(0.0042, 0.0042, ARM_Y - bodyTop + 0.004, 16).translate(gx, (ARM_Y + bodyTop) / 2 - 0.002, gz), M.chrome, mv);
    this._mesh(cyl(0.0085, 0.0085, 0.012, 6).translate(gx, ARM_Y, gz), M.boss, mv);
    this.arm = this._mesh(cyl(0.0028, 0.0028, 1, 12).rotateZ(Math.PI / 2).translate(0.5, 0, 0), M.chrome, mv);
    this.arm.position.set(gx, ARM_Y, gz);
    this.holder = this._mesh(new RoundedBoxGeometry(0.016, 0.014, 0.016, 2, 0.003), M.boss, mv);
    this.cross = this._mesh(cyl(0.0022, 0.0022, 1, 10).rotateX(Math.PI / 2), M.chrome, mv);            // traversina per due punte
    this.stem = this._mesh(cyl(0.0028, 0.0028, 1, 10).translate(0, -0.5, 0), M.chrome, mv);           // gambo della barra
    this.bar = this._mesh(new RoundedBoxGeometry(0.008, 0.012, 2 * HALF - 0.03, 2, 0.002), M.alu, mv);  // la barra per le onde piane
    this.dippers = [0, 1, 2].map(() => {
      const d = new THREE.Group(); mv.add(d);
      d.rod = this._mesh(cyl(0.0012, 0.0012, 1, 8).translate(0, -0.5, 0), M.chrome, d);
      d.ball = this._mesh(new THREE.SphereGeometry(0.0042, 20, 14), M.boss, d);
      return d;
    });
  }
  /** Vibratore: x della sorgente, modo ('point' | 'two' | 'bar' | null), posizioni z delle punte, scostamento verticale (m). */
  setVibrator(x, mode, zs, dy) {
    this.vibG.visible = !!mode;
    if (!mode) return;
    this.mover.position.y = dy;
    // il braccio va dall'albero del generatore fin sopra la sorgente
    this.arm.scale.x = x - GEN.x;
    this.holder.position.set(x, ARM_Y, GEN.z);
    const pts = mode === 'bar' ? [] : zs.filter((z) => z !== undefined && z !== null);
    const span = pts.length > 1 ? Math.max(...pts) - Math.min(...pts) : 0;
    this.cross.visible = span > 0;
    if (span) { this.cross.scale.z = span + 0.012; this.cross.position.set(x, ARM_Y - 0.004, (Math.max(...pts) + Math.min(...pts)) / 2); }
    this.bar.visible = this.stem.visible = mode === 'bar';
    if (mode === 'bar') {
      const yBar = WATER_Y + 0.0045;
      this.bar.position.set(x, yBar, 0);
      this.stem.position.set(x, ARM_Y - 0.007, 0); this.stem.scale.y = ARM_Y - 0.007 - (yBar + 0.006);
    }
    this.dippers.forEach((d, i) => {
      const z = mode === 'bar' ? null : zs[i];
      d.visible = z !== undefined && z !== null;
      if (!d.visible) return;
      const top = span ? ARM_Y - 0.006 : ARM_Y - 0.007;
      d.position.set(x, top, z);
      const drop = top - (WATER_Y + 0.0015);
      d.rod.scale.y = drop; d.ball.position.y = -drop;
    });
  }

  // ───────────────────────────── la rotaia con il carrello (sorgente in moto) ─────────────────────────────
  _buildRail() {
    const M = this.M, g = new THREE.Group(); this.group.add(g); this.railG = g;
    const y = WATER_Y + 0.07, zr = 0, xp = HALF + 0.01;
    // due colonnine su morsetti alle sponde di sinistra e di destra
    for (const s of [-1, 1]) {
      this._mesh(new RoundedBoxGeometry(0.034, 0.024, 0.03, 2, 0.004).translate(s * xp, FRAME_TOP + 0.008, zr - 0.012), M.boss, g);
      this._mesh(cyl(0.006, 0.006, y - FRAME_TOP, 16).translate(s * xp, (y + FRAME_TOP) / 2, zr - 0.012), M.chrome, g);
    }
    this._mesh(new THREE.BoxGeometry(2 * xp + 0.03, 0.008, 0.02).translate(0, y + 0.004, zr - 0.012), M.alu, g);
    this.cart = new THREE.Group(); g.add(this.cart);
    this._mesh(new RoundedBoxGeometry(0.04, 0.022, 0.03, 2, 0.004).translate(0, y + 0.016, zr - 0.012), M.boss, this.cart);
    this._mesh(cyl(0.012, 0.012, 0.02, 20).rotateZ(Math.PI / 2).translate(0, y + 0.034, zr - 0.012), M.black, this.cart);
    this.cartRod = this._mesh(cyl(0.0012, 0.0012, 1, 8).translate(0, -0.5, 0), M.chrome, this.cart);
    this.cartRod.position.set(0, y + 0.005, zr); this.cartRod.scale.y = y + 0.005 - (WATER_Y + 0.0015);
    this._mesh(new THREE.SphereGeometry(0.0042, 20, 14).translate(0, WATER_Y + 0.0015, zr), M.boss, this.cart);
    this.cartBob = this.cart.children[this.cart.children.length - 1];
  }
  setRail(show, x, dy) { this.railG.visible = show; if (show) { this.cart.position.x = x; this.cartBob.position.y = dy; this.cartRod.position.y = WATER_Y + 0.075 + dy; } }

  // ───────────────────────────── specchio a 45° e schermo ─────────────────────────────
  _buildMirror() {
    const M = this.M, g = new THREE.Group(); g.visible = false; this.group.add(g); this.mirrorG = g;
    const { c, L, W } = MIRROR;
    // lo specchio ruota attorno all'asse x che passa per (0, c, 0); la faccia che riflette è il piano y + z = c
    const m = new THREE.Group(); m.position.set(0, c, 0); m.rotation.x = Math.PI / 4; g.add(m); this.mirror = m;
    this._mesh(new THREE.BoxGeometry(W, 0.004, L).translate(0, -0.002, 0), M.mirrorEdge, m);
    // la faccia argentata: un riflettore vero, che ridisegna la scena vista nello specchio (solo quando è inquadrato).
    // Nei passaggi con un materiale imposto (occlusione ambientale) non serve rifarlo.
    const refl = new Reflector(new THREE.PlaneGeometry(W, L), { color: 0x747474, textureWidth: 512, textureHeight: 512, clipBias: 0.002, multisample: 0 });
    refl.rotation.x = -Math.PI / 2; refl.position.y = 0.0004; refl.userData.noOutline = true; m.add(refl);
    const draw = refl.onBeforeRender;
    refl.onBeforeRender = function (renderer, scene, camera) { if (!scene.overrideMaterial) draw.call(this, renderer, scene, camera); };
    this.refl = refl;
    this._mesh(new THREE.BoxGeometry(W + 0.012, 0.004, L + 0.012).translate(0, -0.006, 0), M.black, m);
    for (const s of [-1, 1]) {
      this._mesh(new THREE.BoxGeometry(W + 0.012, 0.007, 0.006).translate(0, -0.003, s * (L / 2 + 0.003)), M.black, m);
      this._mesh(new THREE.BoxGeometry(0.006, 0.007, L).translate(s * (W / 2 + 0.003), -0.003, 0), M.black, m);
    }
    // due fiancate con il perno e un piede ciascuna
    for (const s of [-1, 1]) {
      const x = s * (W / 2 + 0.016);
      this._mesh(new RoundedBoxGeometry(0.012, c + 0.012, 0.03, 2, 0.003).translate(x, (c + 0.012) / 2, 0), M.iron, g);
      this._mesh(new RoundedBoxGeometry(0.03, 0.012, 0.3, 2, 0.004).translate(x, 0.006, 0), M.iron, g);
      this._mesh(cyl(0.011, 0.011, 0.012, 24).rotateZ(Math.PI / 2).translate(s * (W / 2 + 0.007), c, 0), M.boss, g);
    }
    // lo schermo
    const S = SCREEN, sw = S.w, sh = S.y1 - S.y0, yc = (S.y0 + S.y1) / 2, b = 0.014;
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), this.screenMat);
    // (non escluso dall'occlusione ambientale: è verticale, e dietro ci sono la vasca e lo specchio)
    sheet.position.set(0, yc, S.z); sheet.userData.noOutline = true; g.add(sheet); this.screen = sheet;
    this._mesh(new RoundedBoxGeometry(sw + 2 * b, b, b, 2, 0.003).translate(0, S.y1 + b / 2, S.z), M.iron, g);
    this._mesh(new RoundedBoxGeometry(sw + 2 * b, b, b, 2, 0.003).translate(0, S.y0 - b / 2, S.z), M.iron, g);
    for (const s of [-1, 1]) {
      this._mesh(new RoundedBoxGeometry(b, sh + 2 * b, b, 2, 0.003).translate(s * (sw / 2 + b / 2), yc, S.z), M.iron, g);
      this._mesh(new RoundedBoxGeometry(0.028, 0.012, 0.2, 2, 0.004).translate(s * (sw / 2 + b / 2), 0.006, S.z), M.iron, g);
    }
  }
  setMirror(on) { this.mirrorG.visible = on; this.paperU.uMir.value.w = on ? 1 : 0; }
  /** Risoluzione dell'immagine riflessa (pixel): metà di quella dello schermo basta. */
  setMirrorRes(w, h) { this.refl.getRenderTarget().setSize(Math.max(64, Math.round(w)), Math.max(64, Math.round(h))); }

  // ───────────────────────────── ostacoli ─────────────────────────────
  /** prims: [{type:'seg', a:[x,z], b:[x,z], w} | {type:'plate', poly:[[x,z]…]} | {type:'lens', c:[x,z], R, t}], depth (m). */
  setObstacles(prims, depth) {
    for (const c of [...this.obst.children]) { this.obst.remove(c); c.geometry?.dispose(); }
    for (const p of prims) {
      if (p.type === 'seg') {
        const dx = p.b[0] - p.a[0], dz = p.b[1] - p.a[1], len = Math.hypot(dx, dz);
        const m = this._mesh(new RoundedBoxGeometry(len + p.w, 0.018, p.w, 2, Math.min(0.0015, p.w / 3)), this.M.wall, this.obst);
        m.position.set((p.a[0] + p.b[0]) / 2, GLASS_Y + 0.009, (p.a[1] + p.b[1]) / 2); m.rotation.y = -Math.atan2(dz, dx);
      } else {
        const s = new THREE.Shape();
        if (p.type === 'plate') { p.poly.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z))); s.closePath(); }
        else {
          // lente biconvessa: due archi di raggio R, spessa t al centro
          const a = Math.acos((p.R - p.t / 2) / p.R), cx = p.c[0], cz = p.c[1];
          s.absarc(cx - (p.R - p.t / 2), -cz, p.R, -a, a, false);
          s.absarc(cx + (p.R - p.t / 2), -cz, p.R, Math.PI - a, Math.PI + a, false);
        }
        const g = new THREE.ExtrudeGeometry(s, { depth: depth - 0.0015, bevelEnabled: false, curveSegments: 48 }).rotateX(-Math.PI / 2).translate(0, GLASS_Y, 0);
        const m = this._mesh(g, this.M.plateGlass, this.obst); m.renderOrder = 3;
      }
    }
  }
  /** Ombre sul foglio di punte, barra o traversina, braccio {x0, x1, z}, rotaia; linea di misura (x, m) o null. */
  setShadows(dips, bar, rail, line, arm = null) {
    const U = this.paperU;
    if (arm) U.uArm.value.set(arm.x0, arm.x1, arm.z, 1); else U.uArm.value.w = 0;
    U.uDip.value.forEach((v, i) => { const d = dips[i]; if (d) v.set(d[0], d[1], 0.0045, 1); else v.w = 0; });
    if (bar) U.uBarS.value.set(bar.x, bar.z0, bar.z1, bar.hw || 0.0075); else U.uBarS.value.w = 0;
    if (rail) U.uRail.value.set(0, 0, 0, 1); else U.uRail.value.w = 0;
    if (line !== null) U.uLine.value.set(line, 0, 0, 1); else U.uLine.value.w = 0;
  }
}
