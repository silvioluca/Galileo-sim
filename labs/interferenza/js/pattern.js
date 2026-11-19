// pattern.js — dalla soluzione ondulatoria all'immagine.
// Le tabelle calcolate da wave.js (una riga per lunghezza d'onda) diventano texture; uno shader le
// combina pixel per pixel — somma coerente dei campi dei fori, somma incoerente sui colori — e
// produce la figura sullo schermo, la vista ingrandita del riquadro e il "foglio di luce" che mostra
// l'intensità nel piano orizzontale lungo tutto il banco.
import * as THREE from 'three';
import { NEUTRAL_GLSL } from '../../../shared/js/stage.js';
import { SCREEN_W, SCREEN_H } from './wave.js';

export const TABLE_W = 2048;      // campioni per riga
export const NL_MAX = 48;         // lunghezze d'onda al massimo
export const SHEET_K = 192;       // sezioni lungo il banco
export const SHEET_M = 384;       // campioni trasversali
export const SHEET_HALF = 0.16;   // semi-larghezza del foglio di luce (m)
export const SHEET_SINH = 4.5;    // addensamento dei campioni verso l'asse

const FS_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const FIELD_GLSL = /* glsl */ `
  uniform sampler2D tWide, tDetail;
  uniform int mode, nLam, nHoles, tableN;
  uniform vec4 lamA[${NL_MAX}];        // rgb: peso cromatico · w: raggio verticale del fascio (elementi lineari)
  uniform vec4 lamB[${NL_MAX}];        // x: π/(λB) · y: A′
  uniform vec3 holes[3];               // x: posizione · y: ampiezza del fascio sul foro
  uniform float wideHalf, detailHalf;  // estensione delle tabelle (m); detailHalf = 0 → nessun dettaglio

  vec2 row(sampler2D t, float u, int r) {
    float x = clamp(u, 0.0, 1.0) * float(tableN - 1);
    int i = int(floor(x));
    float f = x - float(i);
    vec2 a = texelFetch(t, ivec2(i, r), 0).rg;
    vec2 b = texelFetch(t, ivec2(min(i + 1, tableN - 1), r), 0).rg;
    return mix(a, b, f);
  }
  // celle mediate: il campione m copre [m, m+1]/N
  float cell(sampler2D t, float u, int r) {
    if (u <= 0.0 || u >= 1.0) return 0.0;
    float x = u * float(tableN) - 0.5;
    int i = int(floor(x));
    float f = x - float(i);
    float a = texelFetch(t, ivec2(clamp(i, 0, tableN - 1), r), 0).r;
    float b = texelFetch(t, ivec2(clamp(i + 1, 0, tableN - 1), r), 0).r;
    return mix(a, b, f);
  }
  /** Radianza spettrale integrata (sRGB lineare) nel punto p dello schermo (m). */
  vec3 pattern(vec2 p) {
    vec3 acc = vec3(0.0);
    bool fine = detailHalf > 0.0;
    for (int i = 0; i < ${NL_MAX}; i++) {
      if (i >= nLam) break;
      float I;
      if (mode == 0) {
        float ix = (fine && abs(p.x) < detailHalf) ? cell(tDetail, p.x / detailHalf * 0.5 + 0.5, i) : cell(tWide, p.x / wideHalf * 0.5 + 0.5, i);
        float wy = lamA[i].w;
        I = ix * exp(-2.0 * p.y * p.y / (wy * wy));
      } else {
        vec2 U = vec2(0.0);
        float k = lamB[i].x, Ap = lamB[i].y;
        for (int j = 0; j < 3; j++) {
          if (j >= nHoles) break;
          float hx = holes[j].x;
          float r = length(p - vec2(Ap * hx, 0.0));
          vec2 E = (fine && r < detailHalf) ? row(tDetail, r / detailHalf, i) : (r < wideHalf ? row(tWide, r / wideHalf, i) : vec2(0.0));
          float ph = k * (Ap * hx * hx - 2.0 * hx * p.x);
          float c = cos(ph), s = sin(ph);
          U += holes[j].y * vec2(E.x * c - E.y * s, E.x * s + E.y * c);
        }
        I = dot(U, U);
      }
      acc += lamA[i].rgb * I;
    }
    // i colori spettrali puri cadono fuori dalla gamma sRGB: li riporto dentro conservando la luminanza
    float Y = dot(acc, vec3(0.2126, 0.7152, 0.0722));
    float m = min(acc.r, min(acc.g, acc.b));
    if (m < 0.0 && Y > 0.0) acc = Y + (acc - Y) * (Y / (Y - m));
    return max(acc, 0.0);
  }`;

export class PatternField {
  constructor(renderer) {
    this.renderer = renderer;
    const tex = () => {
      const t = new THREE.DataTexture(new Float32Array(TABLE_W * NL_MAX * 2), TABLE_W, NL_MAX, THREE.RGFormat, THREE.FloatType);
      t.minFilter = t.magFilter = THREE.NearestFilter;
      t.needsUpdate = true;
      return t;
    };
    this.wide = tex(); this.detail = tex();
    this.uniforms = {
      tWide: { value: this.wide }, tDetail: { value: this.detail },
      mode: { value: 0 }, nLam: { value: 1 }, nHoles: { value: 1 }, tableN: { value: TABLE_W },
      lamA: { value: Array.from({ length: NL_MAX }, () => new THREE.Vector4()) },
      lamB: { value: Array.from({ length: NL_MAX }, () => new THREE.Vector4()) },
      holes: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
      wideHalf: { value: SCREEN_W / 2 }, detailHalf: { value: 0 },
      exposure: { value: 1 },
    };
    const base = { depthTest: false, depthWrite: false, blending: THREE.NoBlending, vertexShader: FS_VERT, toneMapped: false };
    // figura sull'intero schermo, in radianza lineare: diventa la texture emissiva del pannello
    this.screenMat = new THREE.ShaderMaterial({
      ...base, uniforms: { ...this.uniforms, size: { value: new THREE.Vector2(SCREEN_W, SCREEN_H) }, texel: { value: new THREE.Vector2() } },
      fragmentShader: `varying vec2 vUv; uniform vec2 size, texel; uniform float exposure; ${FIELD_GLSL}
        void main(){
          vec2 p = (vUv - 0.5) * size;
          // quattro campioni per pixel: le frange più fitte non fanno moiré
          vec3 c = vec3(0.0);
          for (int i = 0; i < 4; i++) c += pattern(p + (vec2(float(i & 1), float(i >> 1)) - 0.5) * 0.5 * texel);
          gl_FragColor = vec4(c * 0.25 * exposure, 1.0);
        }`,
    });
    // vista del riquadro: finestra ingrandibile, carta e luce ambiente, curva tonale
    this.viewUniforms = { ...this.uniforms, view: { value: new THREE.Vector4(0, 0, SCREEN_W / 2, SCREEN_H / 2) }, ambient: { value: 0.4 }, pixel: { value: 1e-4 }, gridStep: { value: 0.01 } };
    this.viewMat = new THREE.ShaderMaterial({
      ...base, uniforms: this.viewUniforms,
      fragmentShader: `varying vec2 vUv; uniform vec4 view; uniform float exposure, ambient, pixel, gridStep; ${FIELD_GLSL} ${NEUTRAL_GLSL}
        void main(){
          vec2 p = view.xy + (vUv - 0.5) * 2.0 * view.zw;
          vec3 c = vec3(0.0);
          for (int i = 0; i < 4; i++) c += pattern(p + (vec2(float(i & 1), float(i >> 1)) - 0.5) * 0.5 * pixel);
          c *= 0.25 * exposure;
          // carta dello schermo con reticolo di riferimento
          vec2 g = abs(fract(p / gridStep - 0.5) - 0.5) * gridStep / pixel;
          float line = 1.0 - clamp(min(g.x, g.y), 0.0, 1.0);
          vec2 ax = abs(p) / pixel;
          float axis = 1.0 - clamp(min(ax.x, ax.y), 0.0, 1.0);
          // la carta illuminata dalla stanza è molto meno luminosa della figura: l'esposizione è regolata sulla luce che arriva
          vec3 paper = vec3(0.92, 0.915, 0.9) * (0.035 + 0.3 * ambient) * (1.0 - 0.12 * line - 0.22 * axis);
          if (abs(p.x) > ${(SCREEN_W / 2).toFixed(4)} || abs(p.y) > ${(SCREEN_H / 2).toFixed(4)}) { paper = vec3(0.012); c = vec3(0.0); }
          vec3 o = linearToSRGB(neutralToneMap(paper + c));
          o += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
          gl_FragColor = vec4(o, 1.0);
        }`,
    });
    this.rt = new THREE.WebGLRenderTarget(1536, 1024, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
    this.rt.texture.anisotropy = 8;
    this.screenMat.uniforms.texel.value.set(SCREEN_W / 1536, SCREEN_H / 1024);
    this.shotRT = new THREE.WebGLRenderTarget(1280, 720, { depthBuffer: false });

    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.Camera();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(g, this.screenMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this._size = new THREE.Vector2();
  }

  /** Dichiara che le tabelle sono cambiate e ridisegna la texture dello schermo. */
  commit() {
    this.wide.needsUpdate = true; this.detail.needsUpdate = true;
    this.renderScreen();
  }

  renderScreen() {
    const r = this.renderer, prev = r.getRenderTarget();
    this.quad.material = this.screenMat;
    r.setRenderTarget(this.rt);
    r.render(this.quadScene, this.quadCam);
    r.setRenderTarget(prev);
  }

  /** Disegna la vista ingrandita in un rettangolo del canvas (pixel CSS, origine in alto a sinistra). */
  present(rect, canvasHeight, view, ambient) {
    const r = this.renderer, u = this.viewUniforms;
    u.view.value.set(view.cx, view.cy, view.hx, view.hy);
    u.ambient.value = ambient;
    u.pixel.value = (2 * view.hx) / (rect.w * r.getPixelRatio());
    u.gridStep.value = view.hx > 0.045 ? 0.01 : view.hx > 0.0045 ? 0.001 : 0.0001;
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

  /** La vista corrente come canvas (per ingrandirla e scaricarla). */
  snapshot(view, ambient) {
    const r = this.renderer, u = this.viewUniforms, W = this.shotRT.width, Hh = this.shotRT.height;
    u.view.value.set(view.cx, view.cy, view.hx, view.hy);
    u.ambient.value = ambient;
    u.pixel.value = (2 * view.hx) / W;
    const prev = r.getRenderTarget();
    this.quad.material = this.viewMat;
    r.setRenderTarget(this.shotRT);
    r.render(this.quadScene, this.quadCam);
    const buf = new Uint8Array(W * Hh * 4);
    r.readRenderTargetPixels(this.shotRT, 0, 0, W, Hh, buf);
    r.setRenderTarget(prev);
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = Hh;
    const c = canvas.getContext('2d'), img = c.createImageData(W, Hh), row = W * 4;
    for (let yy = 0; yy < Hh; yy++) img.data.set(buf.subarray((Hh - 1 - yy) * row, (Hh - yy) * row), yy * row);
    c.putImageData(img, 0, 0);
    return canvas;
  }
}

/** Foglio di luce: l'intensità nel piano orizzontale che contiene l'asse ottico, dalla sorgente allo schermo. */
export class LightSheet {
  constructor(axisHeight) {
    this.data = new Float32Array(SHEET_K * SHEET_M * 4);
    this.tex = new THREE.DataTexture(this.data, SHEET_K, SHEET_M, THREE.RGBAFormat, THREE.FloatType);
    this.tex.minFilter = this.tex.magFilter = THREE.NearestFilter;
    this.tex.needsUpdate = true;
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      uniforms: { tSheet: { value: this.tex }, logHi: { value: 0 }, decades: { value: 4.2 }, opacity: { value: 0.9 }, glow: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec2 vUv; uniform sampler2D tSheet; uniform float logHi, decades, opacity, glow;
        vec3 tap(int k, int j){ return texelFetch(tSheet, ivec2(clamp(k, 0, ${SHEET_K - 1}), clamp(j, 0, ${SHEET_M - 1})), 0).rgb; }
        void main(){
          // lungo il banco: sezioni equidistanti; di traverso: campioni addensati verso l'asse (mappa sinh)
          float x = vUv.x * float(${SHEET_K - 1});
          float t = asinh((vUv.y * 2.0 - 1.0) * sinh(${SHEET_SINH.toFixed(2)})) / ${SHEET_SINH.toFixed(2)};
          float y = (t * 0.5 + 0.5) * float(${SHEET_M - 1});
          int k = int(floor(x)), j = int(floor(y));
          float fx = x - float(k), fy = y - float(j);
          vec3 I = mix(mix(tap(k, j), tap(k + 1, j), fx), mix(tap(k, j + 1), tap(k + 1, j + 1), fx), fy);
          float Y = dot(I, vec3(0.2126, 0.7152, 0.0722));
          float m = min(I.r, min(I.g, I.b));
          if (m < 0.0 && Y > 0.0) I = Y + (I - Y) * (Y / (Y - m));
          I = max(I, 0.0);
          float L = max(I.r, max(I.g, I.b));
          if (L <= 0.0) discard;
          // scala logaritmica: si vedono insieme il fascio diretto e gli ordini più deboli
          float s = clamp((log(L) * 0.4342945 - logHi + decades) / decades, 0.0, 1.0);
          if (s <= 0.002) discard;
          vec3 hue = I / L;
          float a = pow(s, 1.25) * opacity;
          gl_FragColor = vec4(hue * (0.55 + 1.6 * s) * glow, a);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.mesh.rotation.x = Math.PI / 2;            // v crescente ↔ z crescente, come ξ sullo schermo
    this.mesh.position.y = axisHeight;
    this.mesh.renderOrder = 8;
    this.mesh.userData.noAO = true;
    this.mesh.frustumCulled = false;
  }

  /** Il foglio copre il banco da x = 0 a xEnd. */
  setExtent(xEnd) {
    this.mesh.scale.set(xEnd, 2 * SHEET_HALF, 1);
    this.mesh.position.x = xEnd / 2;
  }
  commit() { this.tex.needsUpdate = true; }
}
