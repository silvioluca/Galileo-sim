// stage.js — palcoscenico: renderer, luci da studio, pavimento a griglia, sfondo sfumato, post-produzione.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** Curva tonale "Khronos PBR Neutral": la stessa per la vista 3D e per lo sviluppo della fotografia. */
export const NEUTRAL_GLSL = /* glsl */ `
vec3 neutralToneMap(vec3 color) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}
vec3 linearToSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}`;

export const EXPOSURE = 1.0;
const HORIZON = new THREE.Color('#e6e9ee');
const ZENITH = new THREE.Color('#c3cbd6');

// Ombre morbide: sostituisce i 5 campioni del filtro PCF di three.js con un disco di Vogel più fitto.
function patchSoftShadows(taps) {
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const re = /shadow = \(\s*texture\( shadowMap, vec3\( shadowCoord\.xy \+ vogelDiskSample\( 0, 5, phi \) \* radius, shadowCoord\.z \) \)[\s\S]*?\) \* 0\.2;/;
  if (!re.test(chunk)) { console.warn('[lab] filtro ombre non sostituito'); return; }
  THREE.ShaderChunk.shadowmap_pars_fragment = chunk.replace(re, `
				shadow = 0.0;
				for ( int i = 0; i < ${taps}; i ++ ) {
					shadow += texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( i, ${taps}, phi ) * radius, shadowCoord.z ) );
				}
				shadow /= float( ${taps} );`);
}

function buildStudioEnvironment(renderer) {
  const s = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(30, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vP;
        void main(){
          float h = normalize(vP).y;
          vec3 top = vec3(1.02, 1.05, 1.10), mid = vec3(0.80, 0.82, 0.86), bot = vec3(0.60, 0.60, 0.60);
          vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.55)) : mix(mid, bot, pow(-h, 0.4));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  s.add(dome);
  const panel = (w, h, x, y, z, intensity, tint = 0xffffff) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  panel(9, 6, -7, 10, 8, 7.5, 0xfff3e2);     // softbox principale (alto, davanti a sinistra)
  panel(3, 12, 11, 5, -7, 4.5, 0xe8f0ff);    // controluce a striscia
  panel(14, 2, 3, 13, -4, 5.0);              // striscia zenitale
  panel(8, 8, 5, 3, 13, 1.3);                // schiarita frontale
  panel(10, 5, -14, 2.5, -5, 0.03);          // bandiera nera
  panel(6, 4, 12, 1.5, 9, 0.03);             // bandiera nera
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(s, 0.035).texture;
  pmrem.dispose();
  s.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return tex;
}

function buildSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { horizon: { value: HORIZON.clone() }, zenith: { value: ZENITH.clone() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 horizon, zenith; varying vec3 vP;
      void main(){
        float h = normalize(vP).y;
        float t = smoothstep(0.0, 0.75, h);
        gl_FragColor = vec4(mix(horizon, zenith, pow(t, 0.8)), 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 48, 24), mat);
  sky.renderOrder = -10;
  sky.userData.noAO = true;
  sky.frustumCulled = false;
  return sky;
}

function buildFloor() {
  const mat = new THREE.MeshStandardMaterial({ color: '#e2e4e8', roughness: 0.93, metalness: 0 });
  // apertura rettangolare nel pavimento (x0, z0, x1, z1): vuota di serie
  const hole = { value: new THREE.Vector4(0, 0, 0, 0) };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uHole = hole;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFloorPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFloorPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vFloorPos;
        uniform vec4 uHole;
        float gridLevel(vec2 p, float spacing) {
          vec2 q = p / spacing;
          vec2 fw = max(fwidth(q), vec2(1e-6));
          vec2 g = abs(fract(q - 0.5) - 0.5) / fw;
          float line = 1.0 - clamp(min(g.x, g.y), 0.0, 1.0);
          float density = max(fw.x, fw.y);
          return line * (1.0 - smoothstep(0.06, 0.32, density));
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vFloorPos.x > uHole.x && vFloorPos.x < uHole.z && vFloorPos.z > uHole.y && vFloorPos.z < uHole.w) discard;
        {
          vec2 p = vFloorPos.xz;
          float g = 0.045 * gridLevel(p, 0.01) + 0.10 * gridLevel(p, 0.1) + 0.14 * gridLevel(p, 1.0);
          diffuseColor.rgb *= 1.0 - min(g, 0.24);
        }`);
  };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), mat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'pavimento';
  floor.userData.hole = hole;
  return floor;
}

// Passaggio finale: esposizione, vignettatura, curva tonale, sRGB. Se richiesto disegna anche il contorno
// degli oggetti in moto: la loro sagoma (maschera) si allarga di qualche pixel; fuori dalla sagoma una riga
// bianca sottile la stacca dall'oggetto, poi il colore. Spento, il contorno non costa nulla.
const OUTLINE_LAYER = 31;
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null }, exposure: { value: EXPOSURE }, vignette: { value: 0.16 }, aspect: { value: 1 },
    outline: { value: 0 }, tMask: { value: null }, texel: { value: new THREE.Vector2(1, 1) }, width: { value: 3 }, olColor: { value: new THREE.Vector3(0.91, 0.27, 0.17) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse, tMask; uniform float exposure, vignette, aspect, outline, width; uniform vec2 texel; uniform vec3 olColor; varying vec2 vUv;
    ${NEUTRAL_GLSL}
    float inside(vec2 uv) { return textureLod(tMask, uv, 0.0).r; }
    vec3 drawOutline(vec3 c) {
      // lontano dalla sagoma (la media su blocchi di 16 pixel è nulla) non c'è nulla da fare
      if (textureLod(tMask, vUv, 4.0).r <= 0.0) return c;
      vec2 h = texel * 0.5;
      float m = 0.25 * (inside(vUv + vec2(h.x, h.y)) + inside(vUv + vec2(-h.x, h.y)) + inside(vUv + vec2(h.x, -h.y)) + inside(vUv + vec2(-h.x, -h.y)));
      if (m >= 1.0) return c;
      float outer = 0.0, inner = 0.0;
      for (int i = 0; i < 20; i++) {
        vec2 d = vec2(cos(float(i) * 0.3141593), sin(float(i) * 0.3141593)) * texel;
        outer = max(outer, max(inside(vUv + d * width), inside(vUv + d * width * 0.62)));
        inner = max(inner, inside(vUv + d * width * 0.3));
      }
      c = mix(c, olColor, clamp(outer, 0.0, 1.0) * (1.0 - m));
      return mix(c, vec3(1.0), clamp(inner, 0.0, 1.0) * (1.0 - m) * 0.9);
    }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb * exposure;
      vec2 q = (vUv - 0.5) * vec2(1.0, 1.0 / aspect);
      c *= 1.0 - vignette * smoothstep(0.25, 0.85, length(q));
      c = linearToSRGB(neutralToneMap(c));
      if (outline > 0.5) c = drawOutline(c);
      c += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class Stage {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{keyPosition?:number[], keyTarget?:number[], shadowBox?:number[]}} opts
   *        posizione e bersaglio della luce principale; shadowBox = [sinistra, destra, alto, basso] della zona d'ombra
   */
  constructor(canvas, opts = {}) {
    patchSoftShadows(16);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.localClippingEnabled = true;
    renderer.setClearColor(HORIZON, 1);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(HORIZON, ...(opts.fog || [7, 60]));
    scene.environment = buildStudioEnvironment(renderer);
    scene.environmentIntensity = 0.46;
    this.scene = scene;

    this.sky = buildSky();
    scene.add(this.sky);
    this.floor = buildFloor();
    scene.add(this.floor);

    // luce principale: una grande sorgente morbida in alto a sinistra, dietro la fotocamera
    const key = new THREE.DirectionalLight('#fff1e0', 1.9);
    key.position.set(...(opts.keyPosition || [-1.25, 2.9, 1.9]));
    key.target.position.set(...(opts.keyTarget || [0.85, 0, 0]));
    key.castShadow = true;
    key.shadow.mapSize.set(4096, 4096);
    const sc = key.shadow.camera;
    const [sl, sr, st, sb] = opts.shadowBox || [-1.75, 1.75, 1.0, -1.0];
    sc.left = sl; sc.right = sr; sc.top = st; sc.bottom = sb; sc.near = 0.5; sc.far = opts.shadowFar || 8;
    key.shadow.bias = -0.00012;
    key.shadow.normalBias = 0.0012;
    key.shadow.radius = 14;
    key.shadow.intensity = 0.42;          // ombre leggere: danno appoggio agli oggetti senza macchie scure
    scene.add(key, key.target);
    this.key = key;

    const fill = new THREE.DirectionalLight('#dfe9ff', 0.35);
    fill.position.set(1.5, 1.2, -2.2);
    scene.add(fill);
    this.fill = fill;
    this.ambient = 1;
    this._base = { env: scene.environmentIntensity, key: key.intensity, fill: fill.intensity };

    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 150);
    camera.position.set(-0.3, 0.3, 0.6);
    this.camera = camera;

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.085;
    controls.zoomToCursor = true;
    controls.screenSpacePanning = true;
    controls.minDistance = 0.04;
    controls.maxDistance = 9;
    controls.maxPolarAngle = Math.PI / 2 - 0.015;
    controls.rotateSpeed = 0.75;
    controls.zoomSpeed = 0.9;
    controls.target.set(0.25, 0.09, 0);
    this.controls = controls;

    // post-produzione: MSAA + occlusione ambientale + curva tonale
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    const gtao = new GTAOPass(scene, camera, size.x, size.y);
    gtao.updateGtaoMaterial({ radius: 0.045, distanceExponent: 1.4, thickness: 1.2, scale: 1.15, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1.5, rings: 2, samples: 16 });
    gtao.blendIntensity = 0.55;
    gtao._overrideVisibility = function () {
      const cache = this._visibilityCache;
      this.scene.traverse((o) => {
        if (o.visible && (o.isPoints || o.isLine || o.isLineSegments2 || o.userData.noAO)) { o.visible = false; cache.push(o); }
      });
    };
    // l'occlusione ambientale può essere calcolata a risoluzione ridotta
    this.aoScale = 0.5;
    const gtaoSetSize = gtao.setSize.bind(gtao);
    gtao.setSize = (w, h) => gtaoSetSize(Math.max(2, Math.round(w * this.aoScale)), Math.max(2, Math.round(h * this.aoScale)));
    composer.addPass(gtao);
    this.gtao = gtao;
    this.finalPass = new ShaderPass(FinalShader);
    composer.addPass(this.finalPass);
    /** Oggetti da contornare in questo fotogramma (i laboratori lo aggiornano a ogni fotogramma). */
    this.outlined = [];
    this.composer = composer;

    this.viewShift = 0; this.viewShiftY = 0;
    this._tween = null;
  }

  /** Luce ambiente da 0 (buio) a 1 (studio illuminato): attenua luci, riflessi, cielo e foschia insieme. */
  setAmbient(a) {
    this.ambient = a;
    this.scene.environmentIntensity = this._base.env * a;
    this.key.intensity = this._base.key * a;
    this.fill.intensity = this._base.fill * a;
    const u = this.sky.material.uniforms;
    u.horizon.value.copy(this._horizon || HORIZON).multiplyScalar(a);
    u.zenith.value.copy(this._zenith || ZENITH).multiplyScalar(a);
    this.scene.fog.color.copy(u.horizon.value);
    this.renderer.setClearColor(u.horizon.value, 1);
  }

  /** Colori del cielo all'orizzonte e allo zenit e del pavimento (per ambientare la scena, per esempio su un pianeta). */
  setPalette(horizon, zenith, floor) {
    this._horizon = new THREE.Color(horizon); this._zenith = new THREE.Color(zenith);
    if (floor) this.floor.material.color.set(floor);
    this.setAmbient(this.ambient ?? 1);
  }

  /** Apre nel pavimento un'apertura rettangolare (coordinate di mondo), per esempio un pozzetto. */
  setFloorHole(x0, z0, x1, z1) { this.floor.userData.hole.value.set(x0, z0, x1, z1); }

  /** q: 'low' | 'medium' | 'high'. dprCap limita la densità di pixel (risoluzione dinamica). */
  setQuality(q, dprCap = Infinity) {
    this.quality = q;
    const max = q === 'low' ? 1 : q === 'medium' ? 1.5 : 2;
    const dpr = Math.max(0.6, Math.min(window.devicePixelRatio || 1, max, dprCap));
    this.renderer.setPixelRatio(dpr);
    this.gtao.enabled = q !== 'low';
    this.aoScale = q === 'high' ? 1 : 0.5;
    this.gtao.updateGtaoMaterial({ samples: q === 'high' ? 16 : 8 });
    this.gtao.updatePdMaterial({ samples: q === 'high' ? 16 : 8 });
    const size = q === 'low' ? 2048 : 4096;
    if (this.key.shadow.mapSize.x !== size) {
      this.key.shadow.mapSize.setScalar(size);
      this.key.shadow.radius = q === 'low' ? 7 : 14;        // stessa morbidezza con le due risoluzioni
      if (this.key.shadow.map) { this.key.shadow.map.dispose(); this.key.shadow.map = null; }
    }
    if (this._w) this.resize(this._w, this._h, this.viewShift, this.viewShiftY);
  }

  /** shiftX/shiftY: pixel CSS di cui spostare (a destra / in alto) il centro della scena, per lasciare spazio ai pannelli. */
  resize(w, h, shiftX = 0, shiftY = 0) {
    this._w = w; this._h = h; this.viewShift = shiftX; this.viewShiftY = shiftY;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    if (shiftX || shiftY) this.camera.setViewOffset(w, h, -shiftX, shiftY, w, h); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.finalPass.uniforms.aspect.value = w / h;
    if (this._mask) this._sizeMask();
  }

  _sizeMask() {
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this._mask.setSize(s.x, s.y);
    const u = this.finalPass.uniforms;
    u.texel.value.set(1 / s.x, 1 / s.y);
    u.width.value = Math.min(7, Math.max(2.5, 3.2 * this.renderer.getPixelRatio()));   // entro metà blocco (8 px)
  }

  /** Sagoma degli oggetti da contornare, vista dalla telecamera, in una maschera bianca su nero. */
  _renderMask(list) {
    const r = this.renderer, scene = this.scene;
    if (!this._mask) {
      // mezza precisione: le medie dei livelli ridotti non si azzerano anche se la sagoma tocca pochi pixel
      this._mask = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: false, type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
      this._maskMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, fog: false, depthTest: false, depthWrite: false });
      this._maskCam = new THREE.PerspectiveCamera();
      this._clear = new THREE.Color();
      this._sizeMask();
      this.finalPass.uniforms.tMask.value = this._mask.texture;
    }
    // solo i solidi: niente linee, immagini stroboscopiche (istanze) o parti segnate come escluse
    const solid = (m) => m && m.colorWrite !== false && !(m.transparent && m.opacity === 0);
    const on = (o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isLineSegments2 || o.userData.noOutline) return;
      if (solid(Array.isArray(o.material) ? o.material[0] : o.material)) o.layers.enable(OUTLINE_LAYER);
    };
    const off = (o) => o.layers.disable(OUTLINE_LAYER);
    for (const o of list) o.traverse(on);
    const cam = this._maskCam;
    cam.copy(this.camera); cam.layers.set(OUTLINE_LAYER);
    const prevOverride = scene.overrideMaterial, prevAlpha = r.getClearAlpha();
    r.getClearColor(this._clear);
    scene.overrideMaterial = this._maskMat;
    r.setRenderTarget(this._mask);
    r.setClearColor(0x000000, 1);
    r.clear(true, false, false);
    r.render(scene, cam);
    r.setRenderTarget(null);
    r.setClearColor(this._clear, prevAlpha);
    scene.overrideMaterial = prevOverride;
    for (const o of list) o.traverse(off);
  }

  /** Transizione morbida della telecamera verso posizione/bersaglio dati. */
  flyTo(pos, target, duration = 1.1) {
    this._tween = {
      t: 0, duration,
      p0: this.camera.position.clone(), p1: new THREE.Vector3(...pos),
      q0: this.controls.target.clone(), q1: new THREE.Vector3(...target),
    };
  }

  update(dt) {
    const tw = this._tween;
    if (tw) {
      tw.t = Math.min(tw.t + dt / tw.duration, 1);
      const k = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - Math.pow(-2 * tw.t + 2, 3) / 2;
      this.camera.position.lerpVectors(tw.p0, tw.p1, k);
      this.controls.target.lerpVectors(tw.q0, tw.q1, k);
      if (tw.t >= 1) this._tween = null;
    }
    this.controls.update();
  }

  cancelTween() { this._tween = null; }

  render() {
    // la maschera si disegna prima della scena: le ombre si aggiornano solo nel passaggio principale
    const list = this.outlined.filter((o) => o && o.parent && o.visible);
    this.finalPass.uniforms.outline.value = list.length ? 1 : 0;
    if (list.length) this._renderMask(list);
    this.renderer.shadowMap.needsUpdate = true;
    this.composer.render();
  }
}
