// tank.js — l'acqua della vaschetta, simulata nella scheda grafica.
//
// Una griglia N×N (1 mm per cella) in due bersagli di rendering che si scambiano a ogni passo: rosso = altezza h
// ora, verde = h al passo prima, blu = media nel tempo di h² (per la mappa delle ampiezze). Il passo è il salto di
// rana dell'equazione delle onde con smorzamento:
//   h' = (2h − (1 − β·dt)·h₋ + (v·dt/dx)²·∇²h + dt²·F) / (1 + β·dt)
// La tessitura del mezzo dice in ogni cella (v·dt/dx)², β·dt e se c'è una parete: contro le pareti la derivata
// normale è nulla (l'onda si riflette senza cambiare segno, come contro un bordo vero). Le sorgenti sono forze
// concentrate (una gaussiana di 3 mm) che oscillano alla frequenza del generatore.
// Un secondo passaggio trasforma l'altezza nella luce: una cresta fa da lente convergente e la luce si addensa
// (I ≈ 1/(1 + K·∇²h), K cresce con la distanza): rosso per il foglio, alfa per lo schermo dietro lo specchio, che è
// più lontano. Calcolata su una tessitura filtrabile, la si legge con l'interpolazione.
import * as THREE from 'three';

const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const STEP = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uState, uMedium;
  uniform vec2 uTexel;
  uniform float uDt2, uPhase, uAmp, uSig2, uAvgK;
  uniform vec4 uSrc[3];          // u, v, fase, accesa
  uniform vec4 uBar;             // u, v da, v a, accesa
  float solid(vec2 p) { return texture2D(uMedium, p).b; }
  void main() {
    vec4 s = texture2D(uState, vUv), m = texture2D(uMedium, vUv);
    if (m.b > 0.5) { gl_FragColor = vec4(0.0, 0.0, s.b * (1.0 - uAvgK), 0.0); return; }
    float h = s.r;
    vec2 dx = vec2(uTexel.x, 0.0), dy = vec2(0.0, uTexel.y);
    float hE = solid(vUv + dx) > 0.5 ? h : texture2D(uState, vUv + dx).r;
    float hW = solid(vUv - dx) > 0.5 ? h : texture2D(uState, vUv - dx).r;
    float hN = solid(vUv + dy) > 0.5 ? h : texture2D(uState, vUv + dy).r;
    float hS = solid(vUv - dy) > 0.5 ? h : texture2D(uState, vUv - dy).r;
    float lap = hE + hW + hN + hS - 4.0 * h;
    float F = 0.0;
    for (int i = 0; i < 3; i++) {
      if (uSrc[i].w > 0.5) { vec2 d = (vUv - uSrc[i].xy) / uTexel; F += exp(-dot(d, d) / uSig2) * sin(uPhase + uSrc[i].z); }
    }
    if (uBar.w > 0.5) {
      float du = (vUv.x - uBar.x) / uTexel.x;
      float inside = smoothstep(uBar.y - 3.0 * uTexel.y, uBar.y, vUv.y) * (1.0 - smoothstep(uBar.z, uBar.z + 3.0 * uTexel.y, vUv.y));
      F += exp(-du * du / uSig2) * inside * sin(uPhase) * 0.6;
    }
    float hn = (2.0 * h - (1.0 - m.g) * s.g + m.r * lap + uDt2 * uAmp * F) / (1.0 + m.g);
    gl_FragColor = vec4(hn, h, s.b + (hn * hn - s.b) * uAvgK, 0.0);
  }`;
const COPY = 'varying vec2 vUv; uniform sampler2D uTex; void main() { gl_FragColor = texture2D(uTex, vUv); }';
const LIGHT = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uState, uAvg, uMedium;
  uniform vec2 uTexel;
  uniform float uInvDx2, uAmpRef;
  uniform vec2 uK;
  void main() {
    vec2 dx = vec2(uTexel.x, 0.0), dy = vec2(0.0, uTexel.y);
    float h = texture2D(uState, vUv).r;
    float lap = (texture2D(uState, vUv + dx).r + texture2D(uState, vUv - dx).r + texture2D(uState, vUv + dy).r + texture2D(uState, vUv - dy).r - 4.0 * h) * uInvDx2;
    float I = 1.0 / max(0.14, 1.0 + uK.x * lap);                  // la cresta concentra la luce
    float I2 = 1.0 / max(0.14, 1.0 + uK.y * lap);
    float rms = sqrt(2.0 * max(texture2D(uAvg, vUv).b, 0.0)) / uAmpRef;
    gl_FragColor = vec4(min(I, 4.0), rms / (rms + 0.35), texture2D(uMedium, vUv).b, min(I2, 4.0));
  }`;

export class RippleSim {
  /** renderer: quello della scena; N: celle per lato; size: lato della vasca (m). */
  constructor(renderer, N, size) {
    this.r = renderer; this.N = N; this.size = size; this.dx = size / N;
    this.float = renderer.extensions.has('EXT_color_buffer_float');
    const type = this.float ? THREE.FloatType : THREE.HalfFloatType;
    const opts = { type, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false };
    this.rt = [new THREE.WebGLRenderTarget(N, N, opts), new THREE.WebGLRenderTarget(N, N, opts)];
    this.snap = new THREE.WebGLRenderTarget(N, N, opts);
    this.light = new THREE.WebGLRenderTarget(N, N, { ...opts, type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.cur = 0;
    this.mediumData = new Float32Array(N * N * 4);
    this.medium = new THREE.DataTexture(this.mediumData, N, N, THREE.RGBAFormat, THREE.FloatType);
    this.medium.minFilter = this.medium.magFilter = THREE.NearestFilter; this.medium.needsUpdate = true;
    const texel = new THREE.Vector2(1 / N, 1 / N);
    this.stepMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: STEP,
      uniforms: {
        uState: { value: null }, uMedium: { value: this.medium }, uTexel: { value: texel }, uDt2: { value: 0 }, uPhase: { value: 0 }, uAmp: { value: 0 }, uSig2: { value: 9 }, uAvgK: { value: 0.002 },
        uSrc: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, uBar: { value: new THREE.Vector4() },
      },
    });
    this.copyMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: COPY, uniforms: { uTex: { value: null } } });
    this.lightMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: LIGHT,
      uniforms: { uState: { value: null }, uAvg: { value: null }, uMedium: { value: this.medium }, uTexel: { value: texel }, uK: { value: new THREE.Vector2(0.1, 0.1) }, uInvDx2: { value: 1 / (this.dx * this.dx) }, uAmpRef: { value: 2e-5 } },
    });
    this.zeroMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }' });
    this.scene = new THREE.Scene();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.stepMat);
    this.quad.frustumCulled = false; this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.t = 0;
    this.row = new Float32Array(N * 4);
    this.clear();
  }
  _pass(mat, target) {
    const r = this.r, prev = r.getRenderTarget(), xr = r.xr.enabled;
    r.xr.enabled = false;
    this.quad.material = mat;
    r.setRenderTarget(target); r.render(this.scene, this.cam);
    r.setRenderTarget(prev); r.xr.enabled = xr;
  }
  clear() { for (const t of [...this.rt, this.snap]) this._pass(this.zeroMat, t); this.t = 0; }
  /** Il mezzo: v (m/s) per cella, smorzamento β (1/s) per cella, pareti. Le funzioni ricevono (x, z) in metri e
   *  l'indice della cella, j·N + i (j cresce verso −z). */
  setMedium(speedAt, dampAt, solidAt, dt) {
    const N = this.N, d = this.mediumData, h = this.size / 2;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -h + (i + 0.5) * this.dx, z = h - (j + 0.5) * this.dx, n = j * N + i, o = n * 4;
      const c = speedAt(x, z, n);
      d[o] = (c * dt / this.dx) ** 2; d[o + 1] = dampAt(x, z, n) * dt; d[o + 2] = solidAt(x, z, n) ? 1 : 0; d[o + 3] = 0;
    }
    this.medium.needsUpdate = true;
    this.dt = dt; this.stepMat.uniforms.uDt2.value = dt * dt;
  }
  /** Un passo di dt: sources = { pts: [[x, z, fase]…], bar: null | {x, z0, z1}, omega, amp }. */
  step(src) {
    const U = this.stepMat.uniforms, h = this.size / 2;
    for (let i = 0; i < 3; i++) {
      const p = src.pts[i];
      if (p) U.uSrc.value[i].set((p[0] + h) / this.size, (h - p[1]) / this.size, p[2] || 0, 1); else U.uSrc.value[i].w = 0;
    }
    if (src.bar) U.uBar.value.set((src.bar.x + h) / this.size, (h - src.bar.z1) / this.size, (h - src.bar.z0) / this.size, 1); else U.uBar.value.w = 0;
    U.uPhase.value = src.phase ?? src.omega * this.t;
    U.uAmp.value = src.amp;
    U.uState.value = this.rt[this.cur].texture;
    this._pass(this.stepMat, this.rt[1 - this.cur]);
    this.cur = 1 - this.cur;
    this.t += this.dt;
  }
  get state() { return this.rt[this.cur]; }
  /** Fissa lo stato attuale (un lampo dello stroboscopio). */
  flash() { this.copyMat.uniforms.uTex.value = this.state.texture; this._pass(this.copyMat, this.snap); }
  /** La luce sul foglio (K1) e sullo schermo (K2), dallo stato attuale o dall'ultimo lampo. K ∝ (n − 1)·distanza. */
  makeLight(useSnap, K1, K2, ampRef) {
    const U = this.lightMat.uniforms;
    U.uState.value = (useSnap ? this.snap : this.state).texture; U.uAvg.value = this.state.texture; U.uK.value.set(K1, K2); U.uAmpRef.value = ampRef;
    this._pass(this.lightMat, this.light);
    return this.light.texture;
  }
  /** Legge una riga (j costante, lungo x) o una colonna (i costante, lungo z) dello stato: [h, h₋, media h²].
   *  Sincrona: il processore aspetta che la scheda grafica finisca (da usare solo nelle prove). */
  read(kind, idx) {
    if (!this.float) return null;
    const N = this.N, buf = this.row;
    if (kind === 'row') this.r.readRenderTargetPixels(this.state, 0, idx, N, 1, buf);
    else this.r.readRenderTargetPixels(this.state, idx, 0, 1, N, buf);
    return buf;
  }
  /** Come read, ma senza fermare nulla: la copia parte adesso e i dati arrivano in buf quando la scheda grafica ha
   *  finito (una promessa; null se la scheda non sa leggere i numeri in virgola mobile). */
  readAsync(kind, idx, buf) {
    if (!this.float) return null;
    const N = this.N;
    return kind === 'row' ? this.r.readRenderTargetPixelsAsync(this.state, 0, idx, N, 1, buf) : this.r.readRenderTargetPixelsAsync(this.state, idx, 0, 1, N, buf);
  }
}
