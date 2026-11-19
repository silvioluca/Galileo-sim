// render.js — la luce vera, calcolata nella scheda grafica seguendo i raggi.
//
// 1. L'immagine sullo schermo. Per ogni punto S dello schermo si sommano i raggi che vi arrivano dall'ultima apertura
//    (lente o diaframma): ciascuno è seguito all'indietro, superficie per superficie con la legge di Snell, fino
//    all'oggetto, e porta la sua radianza (che si conserva lungo il raggio). L'irradianza è E = Σ L·cosθ·cosθ′/d²·dA:
//    sfocatura, vignettatura, aberrazione sferica e cromatica (tre lunghezze d'onda) e la luminosità che cala con
//    l'ingrandimento vengono da sole. I campioni si accumulano un fotogramma dopo l'altro e l'immagine si affina.
// 2. Il vetro delle lenti. Ogni pixel di una lente segue il raggio che parte dall'occhio (la telecamera), attraversa
//    le lenti e arriva all'oggetto, allo schermo, alla rotaia, al pavimento o al cielo: così la lente mostra
//    quello che si vedrebbe guardandoci attraverso, con l'immagine capovolta o ingrandita al posto giusto.
import * as THREE from 'three';
import { NEUTRAL_GLSL } from '../../../shared/js/stage.js';
import { canvasTexture } from '../../../shared/js/geo.js';

export const MAXS = 8;                 // superfici al massimo: due lenti (fino a tre superfici) e il diaframma
export const SCREEN_W = 0.3, SCREEN_H = 0.2;
export const SPP = 8;                  // punti dell'apertura per pixel e per fotogramma
const IMG_W = 600, IMG_H = 400;

const TRACE_GLSL = /* glsl */ `
  #define MAXS ${MAXS}
  uniform int uNS;
  uniform vec4 uS[MAXS];     // x del vertice, curvatura c, raggio utile, tipo (0 superficie, 1 diaframma)
  uniform vec4 uE[MAXS];     // x minima e massima occupate dalla superficie, raggio del portalente
  uniform vec3 uNA[MAXS];    // indice dopo la superficie (verso +x) per rosso, verde, blu
  uniform float uAxis;       // altezza dell'asse ottico
  uniform vec4 uObj;         // tipo (0 F, 1 punto, 2 F all'infinito, 3 fascio), semi-lato della F (m o rad), raggio della lastra o del collimatore, 0
  uniform sampler2D uFTex;

  float nBefore(int i, int ch) { return i == 0 ? 1.0 : uNA[i - 1][ch]; }

  // 0: attraversata, 1: mancata (fuori dal portalente, il raggio prosegue), 2: fermata
  int crossS(int i, inout vec3 p, inout vec3 d, int ch, bool fwd) {
    vec4 s = uS[i];
    vec3 P = vec3(p.x - s.x, p.y - uAxis, p.z);
    float c = s.y;
    float B = c * dot(P, d) - d.x;
    float K = c * dot(P, P) - 2.0 * P.x;
    float disc = B * B - c * K;
    if (disc < 0.0) return 1;
    float t = -K / (B + (B >= 0.0 ? 1.0 : -1.0) * sqrt(disc));
    if (t <= 1e-7) return 1;
    vec3 h = P + t * d;
    float r = length(h.yz);
    if (r > s.z) return r < uE[i].z ? 2 : 1;
    p += t * d;
    if (s.w > 0.5) return 0;
    vec3 nrm = normalize(vec3(c * h.x - 1.0, c * h.y, c * h.z));
    if (dot(nrm, d) > 0.0) nrm = -nrm;
    float na = uNA[i][ch], nb = nBefore(i, ch);
    vec3 dn = refract(d, nrm, fwd ? nb / na : na / nb);
    if (dot(dn, dn) < 0.5) return 2;      // riflessione totale
    d = normalize(dn);
    return 0;
  }

  /** Segue il raggio attraverso tutte le superfici che incontra nel suo verso; false se viene fermato. */
  bool traceOptics(inout vec3 p, inout vec3 d, int ch) {
    if (d.x > 0.0) {
      for (int i = 0; i < MAXS; i++) {
        if (i >= uNS) break;
        if (uE[i].y < p.x - 1e-6) continue;
        if (crossS(i, p, d, ch, true) == 2) return false;
      }
    } else {
      for (int k = 0; k < MAXS; k++) {
        int i = uNS - 1 - k;
        if (i < 0) break;
        if (uE[i].x > p.x + 1e-6) continue;
        if (crossS(i, p, d, ch, false) == 2) return false;
      }
    }
    return true;
  }

  float fMask(vec2 uv) {
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
    return textureLod(uFTex, uv, 0.0).r;
  }

  /** Radianza (relativa, 0–1) che l'oggetto manda lungo −d, per un raggio che va verso l'oggetto (d.x < 0). */
  float objectL(vec3 p, vec3 d) {
    if (d.x >= 0.0) return 0.0;
    vec3 q = p + (-p.x / d.x) * d;
    vec2 yz = vec2(q.y - uAxis, q.z);
    int kind = int(uObj.x + 0.5);
    if (kind == 0) {
      if (max(abs(yz.x), abs(yz.y)) > uObj.z) return 0.0;
      return fMask(vec2(0.5 - yz.y / (2.0 * uObj.y), 0.5 + yz.x / (2.0 * uObj.y)));
    }
    if (kind == 1) return 1.0 - smoothstep(uObj.y * 0.7, uObj.y, length(yz));
    if (length(yz) > uObj.z) return 0.0;                 // fuori dalla bocca del collimatore
    vec2 ang = vec2(d.y, d.z) / -d.x;                    // direzione da cui arriva la luce
    if (kind == 2) return fMask(vec2(0.5 - ang.y / (2.0 * uObj.y), 0.5 + ang.x / (2.0 * uObj.y)));
    return 1.0 - smoothstep(uObj.y * 0.6, uObj.y, length(ang));
  }`;

/** La lettera F (bianca su nero) della lastra: vista dalla lente si legge diritta. */
function fTexture() {
  return canvasTexture(512, 512, (g, W) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, W);
    // F alta 3/4 del lato, asta a sinistra; tratti spessi 1/8
    const u = W / 40;                                      // la texture copre 40 mm: 1 mm = u pixel
    g.fillStyle = '#fff';
    const x0 = W / 2 - 9 * u, y0 = W / 2 - 15 * u, s = 4.5 * u;
    g.fillRect(x0, y0, s, 30 * u);                         // asta: 30 mm, centrata sull'asse
    g.fillRect(x0, y0, 18 * u, s);                         // tratto in alto
    g.fillRect(x0, y0 + 12.5 * u, 13 * u, s);              // tratto di mezzo
  }, { srgb: false, aniso: 8 });
}
export const F_HALF = 0.02;          // la texture della F copre 40 mm
export const F_TOP = 0.015;          // la F è alta 30 mm, centrata: il tratto in alto (che passa per z = 0) sta 15 mm sopra l'asse

export class Optics {
  constructor(renderer, axisH) {
    this.renderer = renderer;
    const v4 = () => Array.from({ length: MAXS }, () => new THREE.Vector4());
    this.fTex = fTexture();
    // uniformi comuni allo schermo e al vetro delle lenti
    this.U = {
      uNS: { value: 0 }, uS: { value: v4() }, uE: { value: v4() }, uNA: { value: Array.from({ length: MAXS }, () => new THREE.Vector3(1, 1, 1)) },
      uAxis: { value: axisH }, uObj: { value: new THREE.Vector4(0, F_HALF, 0.025, 0) }, uFTex: { value: this.fTex },
    };
    // ── accumulo dell'immagine sullo schermo: tutto lo schermo (per la scena) e, se serve, la zona ingrandita nel riquadro ──
    const opts = { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter };
    const acc = (w, h) => { const rt = new THREE.WebGLRenderTarget(w, h, opts); rt.texture.anisotropy = 8; return { rt, frames: 0, clear: true, active: true, win: new THREE.Vector4(0, 0, SCREEN_W / 2, SCREEN_H / 2) }; };
    this.full = acc(IMG_W, IMG_H);
    this.zoom = acc(480, 320); this.zoom.active = false;
    this.rt = this.full.rt;
    this.imgU = {
      ...this.U,
      uRes: { value: new THREE.Vector2(IMG_W, IMG_H) }, uFrame: { value: 0 }, uTotal: { value: 256 }, uWin: { value: new THREE.Vector4() },
      uAp: { value: new THREE.Vector4() }, uScr: { value: new THREE.Vector4(1, 1, SCREEN_W / 2, SCREEN_H / 2) },
    };
    this.imgMat = new THREE.ShaderMaterial({
      uniforms: this.imgU, depthTest: false, depthWrite: false, toneMapped: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform vec2 uRes; uniform float uFrame, uTotal; uniform vec4 uAp, uScr, uWin;
        ${TRACE_GLSL}
        float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float radInv(float n) { float r = 0.0, f = 0.5; for (int i = 0; i < 14; i++) { r += f * mod(n, 2.0); n = floor(n * 0.5); f *= 0.5; } return r; }
        void main() {
          vec2 jit = vec2(hash(gl_FragCoord.xy + uFrame * 17.31), hash(gl_FragCoord.yx + uFrame * 7.77)) - 0.5;
          vec2 uv = (gl_FragCoord.xy + jit) / uRes;
          // la finestra uWin (centro z, y e semi-lati) dello schermo coperta da questa immagine
          vec3 S = vec3(uScr.x - 1e-4, uAxis + uWin.y + (uv.y - 0.5) * 2.0 * uWin.w, uWin.x + (uv.x - 0.5) * 2.0 * uWin.z);
          if (abs(S.z) > uScr.z || abs(S.y - uAxis) > uScr.w) { gl_FragColor = vec4(0.0); return; }
          // successione a bassa discrepanza sul disco dell'apertura, ruotata a caso pixel per pixel:
          // ogni prefisso copre tutta l'apertura, così l'immagine è giusta (solo più granulosa) fin dal primo fotogramma
          float sh = hash(gl_FragCoord.xy * 1.37), sa = hash(gl_FragCoord.yx * 2.11) * 6.2831853;
          vec3 E = vec3(0.0);
          for (int j = 0; j < ${SPP}; j++) {
            float g = uFrame * ${SPP}.0 + float(j);
            float r = sqrt(fract(radInv(g) + sh)) * uAp.y;
            float a = g * 2.39996323 + sa;
            vec3 A = vec3(uAp.x, uAxis + r * sin(a), r * cos(a));
            vec3 d = A - S;
            float L2 = dot(d, d);
            d *= inversesqrt(L2);
            float w = d.x * d.x / L2;                         // cosθ sullo schermo · cosθ sull'apertura / d²
            for (int ch = 0; ch < 3; ch++) {
              vec3 p = S, dd = d;
              if (traceOptics(p, dd, ch)) E[ch] += w * objectL(p, dd);
            }
          }
          E *= 3.14159265 * uAp.y * uAp.y / ${SPP}.0;
          gl_FragColor = vec4(E, 1.0);
        }`,
    });
    // azzera l'accumulo (senza fusione: con la fusione normale e alfa nullo non cancellerebbe nulla)
    this.clearMat = new THREE.ShaderMaterial({ vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: 'void main(){ gl_FragColor = vec4(0.0); }', depthTest: false, depthWrite: false, blending: THREE.NoBlending });
    this.maxFrames = 32;

    // ── vista dello schermo nel riquadro ──
    this.viewU = { tImg: { value: this.rt.texture }, win: { value: new THREE.Vector4(0, 0, SCREEN_W / 2, SCREEN_H / 2) }, gain: { value: 1 }, ambient: { value: 0.6 }, view: { value: new THREE.Vector4(0, 0, SCREEN_W / 2, SCREEN_H / 2) }, pixel: { value: 1e-3 }, halfS: { value: new THREE.Vector2(SCREEN_W / 2, SCREEN_H / 2) } };
    this.viewMat = new THREE.ShaderMaterial({
      uniforms: this.viewU, depthTest: false, depthWrite: false, toneMapped: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        varying vec2 vUv; uniform sampler2D tImg; uniform float gain, ambient, pixel; uniform vec4 view, win; uniform vec2 halfS;
        ${NEUTRAL_GLSL}
        void main() {
          vec2 p = view.xy + (vUv - 0.5) * 2.0 * view.zw;       // (z, y) sullo schermo, m
          vec2 t = (p - win.xy) / (2.0 * win.zw) + 0.5;
          vec3 img = t.x >= 0.0 && t.y >= 0.0 && t.x <= 1.0 && t.y <= 1.0 ? texture2D(tImg, t).rgb * gain : vec3(0.0);
          // la carta: un reticolo di centimetri (e di millimetri da vicino), l'asse più marcato
          vec2 g = abs(fract(p / 0.01 - 0.5) - 0.5) * 0.01 / pixel;
          vec2 gm = abs(fract(p / 0.001 - 0.5) - 0.5) * 0.001 / pixel;
          float line = 1.0 - clamp(min(g.x, g.y), 0.0, 1.0);
          float mm = (1.0 - clamp(min(gm.x, gm.y), 0.0, 1.0)) * (1.0 - smoothstep(0.12, 0.3, pixel / 0.001));
          vec2 ax = abs(p) / pixel;
          float axis = 1.0 - clamp(min(ax.x, ax.y), 0.0, 1.0);
          vec3 paper = vec3(0.92, 0.915, 0.9) * (0.05 + 0.55 * ambient) * (1.0 - 0.1 * line - 0.05 * mm - 0.2 * axis);
          if (abs(p.x) > halfS.x || abs(p.y) > halfS.y) { paper = vec3(0.05); img = vec3(0.0); }
          vec3 o = linearToSRGB(neutralToneMap(paper + img));
          o += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
          gl_FragColor = vec4(o, 1.0);
        }`,
    });

    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.Camera();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(g, this.imgMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this._size = new THREE.Vector2();

    // ── vetro delle lenti ──
    this.lensU = {
      ...this.U,
      uScr: this.imgU.uScr, uScrTex: { value: this.rt.texture }, uScrGain: { value: 1 }, uAmb: { value: 0.6 },
      uHorizon: { value: new THREE.Color('#e6e9ee') }, uZenith: { value: new THREE.Color('#c3cbd6') }, uRail: { value: new THREE.Vector2(-0.24, 1.7) },
      uLampL: { value: new THREE.Vector3(2.6, 2.4, 2.1) },
    };
    this.lensMat = new THREE.ShaderMaterial({
      uniforms: this.lensU, transparent: true, depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vW, vN;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        varying vec3 vW, vN;
        uniform vec4 uScr; uniform sampler2D uScrTex; uniform float uScrGain, uAmb; uniform vec3 uHorizon, uZenith, uLampL; uniform vec2 uRail;
        ${TRACE_GLSL}
        // righe della griglia: la larghezza di un pixel si stima dalla distanza (niente derivate dentro i cicli)
        float gridLine(vec2 p, float s, float px) { vec2 q = p / s; float fw = max(px / s, 1e-5); vec2 gg = abs(fract(q - 0.5) - 0.5) / fw; return (1.0 - clamp(min(gg.x, gg.y), 0.0, 1.0)) * (1.0 - smoothstep(0.08, 0.4, fw)); }
        vec3 sky(vec3 d) { return mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.75, d.y), 0.8)); }
        /** Quello che il raggio (p, d), uscito dalle lenti, incontra: un canale di colore. */
        float scene(vec3 p, vec3 d, int ch) {
          float room = 0.25 + 0.75 * uAmb, res = -1.0;
          // la lampada con l'oggetto, sul piano x = 0
          if (d.x < 0.0 && p.x > 0.0) {
            vec3 q = p + (-p.x / d.x) * d;
            vec2 yz = vec2(q.y - uAxis, q.z);
            if (max(abs(yz.x), abs(yz.y)) < 0.05) {
              float inner = uObj.x < 1.5 ? step(max(abs(yz.x), abs(yz.y)), uObj.z) : step(length(yz), uObj.z);
              float boost = uObj.x > 0.5 && uObj.x < 1.5 ? 1.6 : 1.0;
              res = mix(0.025 * room, 0.012 + objectL(p, d) * uLampL[ch] * boost, inner);
            }
          }
          // lo schermo
          if (res < 0.0 && d.x > 0.0 && uScr.y > 0.5 && p.x < uScr.x) {
            vec3 q = p + ((uScr.x - p.x) / d.x) * d;
            vec2 yz = vec2(q.y - uAxis, q.z);
            if (abs(yz.x) < uScr.w + 0.012 && abs(yz.y) < uScr.z + 0.012) {
              vec3 img = textureLod(uScrTex, vec2(0.5 + yz.y / (2.0 * uScr.z), 0.5 + yz.x / (2.0 * uScr.w)), 1.0).rgb * uScrGain;
              res = abs(yz.x) > uScr.w || abs(yz.y) > uScr.z ? 0.03 * room : 0.9 * (0.05 + 0.55 * uAmb) + img[ch];
            }
          }
          // la rotaia
          if (res < 0.0) {
            vec3 lo = vec3(uRail.x, 0.02, -0.038), hi = vec3(uRail.y, 0.046, 0.038);
            vec3 inv = 1.0 / d;
            vec3 t0 = (lo - p) * inv, t1 = (hi - p) * inv;
            vec3 tn = min(t0, t1), tf = max(t0, t1);
            float a = max(max(tn.x, tn.y), tn.z), b = min(min(tf.x, tf.y), tf.z);
            if (b > max(a, 0.0)) res = 0.42 * room;
          }
          // il pavimento con la griglia, oppure il cielo
          if (res < 0.0 && d.y < 0.0) {
            vec3 q = p + (-p.y / d.y) * d;
            float px = length(q - cameraPosition) * 0.0016 / max(-d.y, 0.05);
            float gl = 0.045 * gridLine(q.xz, 0.01, px) + 0.1 * gridLine(q.xz, 0.1, px) + 0.14 * gridLine(q.xz, 1.0, px);
            float fog = smoothstep(4.0, 30.0, length(q - p));
            res = mix(0.62 * room * (1.0 - min(gl, 0.24)), uHorizon[ch], fog);
          }
          if (res < 0.0) res = sky(d)[ch];
          return res;
        }
        void main() {
          vec3 rd = normalize(vW - cameraPosition);
          vec3 n = normalize(vN);
          if (dot(n, rd) > 0.0) n = -n;
          float room = 0.25 + 0.75 * uAmb;
          // bordo smerigliato
          if (abs(normalize(vN).x) < 0.35) {
            float l = 0.55 + 0.35 * max(dot(n, normalize(vec3(-0.45, 0.8, 0.4))), 0.0);
            gl_FragColor = vec4(vec3(0.62, 0.66, 0.66) * l * room, 1.0);
            return;
          }
          vec3 col;
          for (int ch = 0; ch < 3; ch++) {
            vec3 p = cameraPosition, d = rd;
            col[ch] = traceOptics(p, d, ch) ? scene(p, d, ch) : 0.0;
          }
          col *= vec3(0.965, 0.98, 0.975);                     // il vetro assorbe un poco, più nel rosso
          // riflessi: Fresnel (Schlick) sulla prima faccia, un riflesso dello studio e della luce principale
          float cosi = clamp(dot(-rd, n), 0.0, 1.0);
          float F = 0.04 + 0.96 * pow(1.0 - cosi, 5.0);
          vec3 r = reflect(rd, n);
          vec3 refl = sky(r) * room + vec3(3.2, 3.0, 2.8) * pow(max(dot(r, normalize(vec3(-0.45, 0.8, 0.4))), 0.0), 600.0) * uAmb;
          gl_FragColor = vec4(col * (1.0 - F) * (1.0 - 0.04) + refl * F, 1.0);
        }`,
    });
  }

  /**
   * Aggiorna il sistema ottico: surfs da optics.benchSurfaces (ordinate lungo x), indici per (r, g, b),
   * oggetto e schermo. ap: { x, r } disco su cui si campionano i raggi che arrivano allo schermo.
   */
  setSystem(surfs, indices, obj, screen, ap) {
    const U = this.U;
    U.uNS.value = Math.min(surfs.length, MAXS);
    surfs.slice(0, MAXS).forEach((s, i) => {
      U.uS.value[i].set(s.x, s.c, s.a, s.stop ? 1 : 0);
      U.uE.value[i].set(s.xmin, s.xmax, s.mount, 0);
      U.uNA.value[i].set(...indices[i]);
    });
    U.uObj.value.set(obj.kind, obj.half, obj.radius, 0);
    this.imgU.uScr.value.set(screen.x, screen.on ? 1 : 0, SCREEN_W / 2, SCREEN_H / 2);
    this.imgU.uAp.value.set(ap.x, ap.r, 0, 0);
    this.restart();
  }

  restart() { for (const a of [this.full, this.zoom]) { a.frames = 0; a.clear = true; } }
  get frames() { return this.full.frames; }
  get converged() { return (!this.full.active || this.full.frames >= this.maxFrames) && (!this.zoom.active || this.zoom.frames >= this.maxFrames); }

  /** La zona dello schermo da calcolare più fitta per il riquadro ingrandito ({cx, cy, hx, hy} in m), o null. */
  setZoomWindow(v) {
    const z = this.zoom;
    if (!v) { z.active = false; return; }
    if (z.active && Math.abs(z.win.x - v.cx) < 1e-6 && Math.abs(z.win.y - v.cy) < 1e-6 && Math.abs(z.win.z - v.hx) < 1e-6 && Math.abs(z.win.w - v.hy) < 1e-6) return;
    z.active = true; z.win.set(v.cx, v.cy, v.hx, v.hy); z.frames = 0; z.clear = true;
  }

  /** Un passo di accumulo per ogni immagine non ancora finita: SPP punti dell'apertura per pixel e per fotogramma. */
  accumulate() {
    if (this.converged) return false;
    // niente pulizia automatica: cancellerebbe l'accumulo (col colore del cielo) a ogni passata
    const r = this.renderer, prev = r.getRenderTarget(), xr = r.xr.enabled, auto = r.autoClear;
    r.xr.enabled = false; r.autoClear = false;
    for (const a of [this.full, this.zoom]) {
      if (!a.active || a.frames >= this.maxFrames) continue;
      r.setRenderTarget(a.rt);
      if (a.clear) { this.quad.material = this.clearMat; r.render(this.quadScene, this.quadCam); a.clear = false; }
      this.imgU.uRes.value.set(a.rt.width, a.rt.height);
      this.imgU.uWin.value.copy(a.win);
      this.imgU.uFrame.value = a.frames;
      this.imgU.uTotal.value = this.maxFrames * SPP;
      this.quad.material = this.imgMat;
      r.render(this.quadScene, this.quadCam);
      a.frames++;
    }
    r.setRenderTarget(prev); r.xr.enabled = xr; r.autoClear = auto;
    return true;
  }
  /** Fattore che porta la somma accumulata in radianza mostrata (immagine di tutto lo schermo). */
  gainFor(G) { return this.full.frames ? G / this.full.frames : 0; }

  /** Disegna lo schermo (o una sua parte) in un rettangolo del canvas, in pixel CSS con l'origine in alto a sinistra. */
  present(rect, canvasHeight, view, G, ambient) {
    const r = this.renderer, u = this.viewU;
    const a = this.zoom.active && this.zoom.frames > 0 ? this.zoom : this.full;
    u.tImg.value = a.rt.texture; u.win.value.copy(a.win);
    u.view.value.set(view.cx, view.cy, view.hx, view.hy);
    u.gain.value = a.frames ? G / a.frames : 0; u.ambient.value = ambient;
    u.pixel.value = (2 * view.hx) / (rect.w * r.getPixelRatio());
    const prevAuto = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(null);
    r.setScissorTest(true);
    const y = canvasHeight - rect.y - rect.h;
    r.setViewport(rect.x, y, rect.w, rect.h);
    r.setScissor(rect.x, y, rect.w, rect.h);
    this.quad.material = this.viewMat;
    r.render(this.quadScene, this.quadCam);
    r.setScissorTest(false);
    r.getSize(this._size);
    r.setViewport(0, 0, this._size.x, this._size.y);
    r.setScissor(0, 0, this._size.x, this._size.y);
    r.autoClear = prevAuto;
  }
}
