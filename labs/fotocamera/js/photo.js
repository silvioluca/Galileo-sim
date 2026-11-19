// photo.js — la fotografia: ciò che il sensore registra davvero.
// La scena è ripresa molte volte da punti diversi della pupilla d'ingresso (e, se il soggetto si
// muove, in istanti diversi del tempo di posa); la media di queste riprese riproduce in modo fisico
// profondità di campo, forma dello sfocato, mosso, aberrazione sferica e cromatica assiale.
// Lo "sviluppo" aggiunge esposizione, vignettatura cos⁴, diffrazione e rumore del sensore.
import * as THREE from 'three';
import { NEUTRAL_GLSL } from '../../../shared/js/stage.js';
import { LensSystem, SENSOR_W, SENSOR_H } from './optics.js';

const FS_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const R2A = 0.7548776662466927, R2B = 0.5698402909980532, GOLD = 0.6180339887498949;
/** Costante di calibrazione dell'esposizione: t·ISO/N² che dà la posa corretta con la luce della scena. */
export const EXPOSURE_K = 0.17;

function fsTriangle() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  return g;
}

export class PhotoSystem {
  constructor(renderer, scene, axisHeight, { width = 768, height = 512 } = {}) {
    this.renderer = renderer; this.scene = scene; this.h = axisHeight;
    this.W = width; this.H = height;
    const half = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    const floatOK = renderer.extensions.has('EXT_color_buffer_float');
    this.sampleRT = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, depthBuffer: true });
    const accOpts = { ...half, type: floatOK ? THREE.FloatType : THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
    this.accum = [new THREE.WebGLRenderTarget(width, height, accOpts), new THREE.WebGLRenderTarget(width, height, accOpts)];
    this.devRT = new THREE.WebGLRenderTarget(width, height, { ...half, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    this.devRT.texture.anisotropy = 8;
    this.captureRT = new THREE.WebGLRenderTarget(width, height, { depthBuffer: false });

    this.camera = new THREE.PerspectiveCamera();
    this.camera.rotation.y = -Math.PI / 2;        // guarda verso +x, con +z a destra
    this.camera.matrixAutoUpdate = false;

    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.Camera();
    this.quad = new THREE.Mesh(fsTriangle(), null);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    const raw = { depthTest: false, depthWrite: false, vertexShader: FS_VERT, blending: THREE.NoBlending, toneMapped: false };
    // media progressiva: nuovo = mix(vecchio, campione, peso·maschera)
    this.mixMat = new THREE.ShaderMaterial({
      ...raw,
      uniforms: { tOld: { value: null }, tNew: { value: null }, weight: { value: new THREE.Vector3(1, 1, 1) } },
      fragmentShader: `uniform sampler2D tOld, tNew; uniform vec3 weight; varying vec2 vUv;
        void main(){ vec3 o = texture2D(tOld, vUv).rgb; vec3 n = min(texture2D(tNew, vUv).rgb, vec3(4000.0));
          gl_FragColor = vec4(mix(o, n, weight), 1.0); }`,
    });
    // sviluppo: esposizione, vignettatura naturale, diffrazione, rumore fotonico e di lettura
    this.devMat = new THREE.ShaderMaterial({
      ...raw,
      uniforms: {
        tAccum: { value: null }, res: { value: new THREE.Vector2(width, height) },
        exposure: { value: 1 }, electrons: { value: 12000 }, readNoise: { value: 2.5 }, seed: { value: 0 },
        tanHalf: { value: new THREE.Vector2(0.3, 0.2) }, sigma: { value: 0 }, clip: { value: 8 },
      },
      fragmentShader: `uniform sampler2D tAccum; uniform vec2 res, tanHalf; uniform float exposure, electrons, readNoise, seed, sigma, clip;
        varying vec2 vUv;
        uint pcg(uint v){ uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
        float rnd(inout uint st){ st = pcg(st); return (float(st) + 0.5) / 4294967296.0; }
        float gauss(inout uint st){ float u1 = rnd(st), u2 = rnd(st); return sqrt(-2.0 * log(u1)) * cos(6.2831853 * u2); }
        vec3 tap(vec2 uv){ return texture2D(tAccum, uv).rgb; }
        void main(){
          vec3 c;
          if (sigma > 0.2) {
            // macchia di diffrazione (nucleo del disco di Airy approssimato da una gaussiana)
            vec2 px = 1.0 / res; c = tap(vUv); float wsum = 1.0;
            for (int i = 0; i < 18; i++) {
              float fi = float(i) + 0.5;
              float r = sqrt(fi / 18.0) * 2.4 * sigma;
              float a = fi * 2.399963;
              float w = exp(-0.5 * (r * r) / (sigma * sigma));
              c += tap(vUv + vec2(cos(a), sin(a)) * r * px) * w; wsum += w;
            }
            c /= wsum;
          } else c = tap(vUv);
          vec2 t = (vUv - 0.5) * 2.0 * tanHalf;
          float cos2 = 1.0 / (1.0 + dot(t, t));
          c *= cos2 * cos2 * exposure;
          // elettroni raccolti → rumore di Poisson (approssimazione gaussiana) + rumore di lettura
          uvec2 ip = uvec2(gl_FragCoord.xy);
          uint st = pcg(ip.x + pcg(ip.y + pcg(uint(seed))));
          vec3 e = max(c, 0.0) * electrons;
          e += sqrt(e) * vec3(gauss(st), gauss(st), gauss(st)) + readNoise * vec3(gauss(st), gauss(st), gauss(st));
          c = clamp(e / electrons, 0.0, clip);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    // presentazione: curva tonale e codifica sRGB
    this.showMat = new THREE.ShaderMaterial({
      ...raw,
      uniforms: { tDev: { value: this.devRT.texture }, gain: { value: 1 } },
      fragmentShader: `uniform sampler2D tDev; uniform float gain; varying vec2 vUv;
        ${NEUTRAL_GLSL}
        void main(){
          vec3 c = linearToSRGB(neutralToneMap(texture2D(tDev, vUv).rgb * gain));
          c += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });

    this.mass = 0; this.index = 0; this.read = 0;
    this.maxLive = 420;
    this.capture = null;
    this.frameSeed = 1;
    this._lk = { kappa: 0, ve: 0 };
    this._clear = new THREE.Color();
    this.exposure = 1; this.iso = 200;
  }

  /** Scarta l'accumulo: va chiamato a ogni cambiamento della scena o dell'obiettivo. */
  reset() { if (!this.capture) this.mass = 0; }

  get converged() { return !this.capture && this.mass >= this.maxLive; }
  get progress() { return this.capture ? this.capture.done / this.capture.total : Math.min(this.mass / this.maxLive, 1); }

  startCapture(t0, T, total) {
    this.capture = { t0, T, total, done: 0 };
    this.mass = 0;
  }

  /** Disegna il materiale a schermo intero nel bersaglio dato. */
  _blit(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  /**
   * Aggiunge n riprese all'accumulo.
   * ctx: { lens, now, T, motion, dt, hide:Object3D[], setTime(t) }
   * @returns {boolean} true se una posa (capture) è appena terminata
   */
  accumulate(n, ctx) {
    const { lens } = ctx;
    const r = this.renderer;
    if (!this.capture && this.mass >= this.maxLive && !ctx.motion) return false;
    const tables = lens.pupilTables();
    const prevTarget = r.getRenderTarget();
    const prevAuto = r.autoClear;
    r.getClearColor(this._clear);
    const prevAlpha = r.getClearAlpha();
    const vis = ctx.hide.map((o) => o.visible);
    ctx.hide.forEach((o) => { o.visible = false; });
    r.autoClear = true;
    r.setClearColor(this.scene.fog ? this.scene.fog.color : 0x000000, 1);

    const cam = this.camera, near = 0.02, far = 140;
    const xEP = lens.xEP, R = lens.rEPcirc, Af = lens.Af;
    const cap = this.capture;
    const massCap = cap ? Infinity : ctx.motion ? n * Math.min(Math.max(ctx.T / Math.max(ctx.dt, 1e-3), 1), 8) : Infinity;
    let finished = false;

    for (let s = 0; s < n; s++) {
      // punto sulla pupilla d'ingresso (sequenza a bassa discrepanza, mappata sul disco, rifiuto fuori dal poligono)
      let pe = 0, pz = 0;
      for (let tries = 0; tries < 24; tries++) {
        const k = ++this.index;
        const u = ((0.5 + k * R2A) % 1) * 2 - 1, v = ((0.5 + k * R2B) % 1) * 2 - 1;
        let rr, th;
        if (u === 0 && v === 0) { rr = 0; th = 0; }
        else if (Math.abs(u) > Math.abs(v)) { rr = u; th = (Math.PI / 4) * (v / u); }
        else { rr = v; th = Math.PI / 2 - (Math.PI / 4) * (u / v); }
        pe = R * rr * Math.cos(th); pz = R * rr * Math.sin(th);
        if (lens.apertureContains(pe * Af, pz * Af)) break;
      }
      const rho = Math.hypot(pe, pz);
      // istante della ripresa
      const xi = (this.index * GOLD) % 1;
      let tau = ctx.now;
      if (cap) tau = cap.t0 + (cap.T * (cap.done + xi)) / cap.total;
      else if (ctx.motion) tau = ctx.now - ctx.T * xi;
      ctx.setTime(tau);

      cam.position.set(xEP, this.h + pe, -pz);
      cam.updateMatrix();
      cam.matrixWorld.copy(cam.matrix);
      cam.matrixWorldInverse.copy(cam.matrix).invert();
      const ar = -pz, au = pe;
      const jx = (Math.random() - 0.5) / this.W, jy = (Math.random() - 0.5) / this.H;
      const a = 1 / (this.mass + 1);

      for (let c = 0; c < tables.length; c++) {
        LensSystem.lookup(tables[c], rho, this._lk);
        const { kappa, ve } = this._lk;
        const tw = SENSOR_W / ve, th2 = SENSOR_H / ve;
        const l = (-0.5 + jx) * tw - ar * kappa, rgt = (0.5 + jx) * tw - ar * kappa;
        const b = (-0.5 + jy) * th2 - au * kappa, t = (0.5 + jy) * th2 - au * kappa;
        cam.projectionMatrix.makePerspective(l * near, rgt * near, t * near, b * near, near, far);
        cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
        r.setRenderTarget(this.sampleRT);
        r.render(this.scene, cam);
        // media progressiva (ping-pong)
        const src = this.accum[this.read], dst = this.accum[1 - this.read];
        this.mixMat.uniforms.tOld.value = src.texture;
        this.mixMat.uniforms.tNew.value = this.sampleRT.texture;
        const w = this.mixMat.uniforms.weight.value;
        if (tables.length === 1) w.set(a, a, a); else w.set(c === 0 ? a : 0, c === 1 ? a : 0, c === 2 ? a : 0);
        this._blit(this.mixMat, dst);
        this.read = 1 - this.read;
      }
      this.mass = Math.min(this.mass + 1, massCap);
      if (cap) { cap.done++; if (cap.done >= cap.total) { finished = true; break; } }
    }
    ctx.setTime(ctx.now);
    ctx.hide.forEach((o, i) => { o.visible = vis[i]; });
    r.setRenderTarget(prevTarget);
    r.autoClear = prevAuto;
    r.setClearColor(this._clear, prevAlpha);
    return finished;
  }

  /** Sviluppa l'accumulo nell'immagine lineare (usata anche come texture del sensore e dello schermo). */
  develop(lens, exposure, iso, { freeze = false, gain = 1 } = {}) {
    const r = this.renderer, u = this.devMat.uniforms;
    const prevTarget = r.getRenderTarget();
    if (!freeze) this.frameSeed = (this.frameSeed + 1) % 100000;
    u.tAccum.value = this.accum[this.read].texture;
    u.exposure.value = exposure * gain;
    u.electrons.value = (12000 * 100) / iso;
    u.seed.value = this.frameSeed;
    u.tanHalf.value.set(SENSOR_W / 2 / lens.ve, SENSOR_H / 2 / lens.ve);
    u.sigma.value = (0.42 * 0.55e-6 * lens.Neff) / (SENSOR_W / this.W);
    this._blit(this.devMat, this.devRT);
    r.setRenderTarget(prevTarget);
  }

  /** Mostra la fotografia sviluppata in un rettangolo dello schermo (pixel CSS, origine in alto a sinistra). */
  present(rect, canvasHeight) {
    const r = this.renderer;
    const prevAuto = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(null);
    r.setScissorTest(true);
    const y = canvasHeight - rect.y - rect.h;
    r.setViewport(rect.x, y, rect.w, rect.h);
    r.setScissor(rect.x, y, rect.w, rect.h);
    this.quad.material = this.showMat;
    r.render(this.quadScene, this.quadCam);
    r.setScissorTest(false);
    const size = r.getSize(this._size || (this._size = new THREE.Vector2()));
    r.setViewport(0, 0, size.x, size.y);
    r.setScissor(0, 0, size.x, size.y);
    r.autoClear = prevAuto;
  }

  /** Restituisce la fotografia sviluppata come canvas (per la galleria e il download). */
  snapshot() {
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    this._blit(this.showMat, this.captureRT);
    const buf = new Uint8Array(this.W * this.H * 4);
    r.readRenderTargetPixels(this.captureRT, 0, 0, this.W, this.H, buf);
    r.setRenderTarget(prevTarget);
    const canvas = document.createElement('canvas');
    canvas.width = this.W; canvas.height = this.H;
    const g = canvas.getContext('2d');
    const img = g.createImageData(this.W, this.H);
    const row = this.W * 4;
    for (let y = 0; y < this.H; y++) img.data.set(buf.subarray((this.H - 1 - y) * row, (this.H - y) * row), y * row);
    g.putImageData(img, 0, 0);
    return canvas;
  }
}
