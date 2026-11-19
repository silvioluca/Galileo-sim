// cameraModel.js — modello procedurale della fotocamera (corpo, otturatore, sensore, obiettivo generato
// dalla prescrizione ottica reale, diaframma a lamelle, treppiede) con vista in spaccato.
// Tutta la geometria è costruita in millimetri dentro un gruppo scalato a metri.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  revolveX, bevelProfile, extrudeX, extrudeY, rectShape, roundedRectPath, knurledShape, sliceZ,
  canvasTexture, leatherNormalMap, hatchTexture,
} from '../../../shared/js/geo.js';

const CUT_Z = 0.0137;                  // piano di sezione (mm): appena fuori dall'asse per evitare casi degeneri
const FLANGE = 18;                     // tiraggio: distanza baionetta–sensore (mm)
const FONT = '"Geist Variable", "Segoe UI", Arial, sans-serif';
const TWO_PI = Math.PI * 2;
const COATINGS = ['#c9b4ff', '#a9f0cf', '#ffd6a0', '#b4dcff', '#ffc2e4', '#c8ffb0'];

function makeMaterials() {
  const leatherN = leatherNormalMap();
  leatherN.repeat.set(1 / 9, 1 / 9);
  const leatherCyl = leatherN.clone();
  leatherCyl.repeat.set(12.5, 7.3);
  leatherCyl.needsUpdate = true;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const hatchA = hatchTexture('#d6d9dd', '#b9bec5', 1); hatchA.repeat.set(1 / 5, 1 / 5);
  const hatchB = hatchTexture('#676c74', '#4c5158', -1); hatchB.repeat.set(1 / 5, 1 / 5);
  const glass = (tint, opacity = 0.07) => {
    const m = new THREE.MeshPhysicalMaterial({
      color: '#0b1a20', roughness: 0.02, metalness: 0, ior: 1.6, specularIntensity: 1, specularColor: tint,
      transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 2.4,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    return m;
  };
  return {
    leather: std({ color: '#131313', roughness: 0.78, normalMap: leatherN, normalScale: new THREE.Vector2(0.9, 0.9) }),
    leatherCyl: std({ color: '#131313', roughness: 0.78, normalMap: leatherCyl, normalScale: new THREE.Vector2(0.9, 0.9) }),
    silver: std({ color: '#c6c8cb', metalness: 1, roughness: 0.34 }),
    chrome: std({ color: '#e4e5e6', metalness: 1, roughness: 0.14 }),
    black: std({ color: '#0d0e10', metalness: 0.75, roughness: 0.36 }),
    matte: std({ color: '#0a0a0b', metalness: 0.1, roughness: 0.9 }),
    satin: std({ color: '#1c1d20', metalness: 0.6, roughness: 0.5 }),
    rubber: std({ color: '#0b0b0c', metalness: 0, roughness: 0.86 }),
    blade: std({ color: '#23262b', metalness: 0.9, roughness: 0.42, side: THREE.DoubleSide }),
    curtain: std({ color: '#2b2d31', metalness: 0.8, roughness: 0.4 }),
    brass: std({ color: '#c9a24e', metalness: 1, roughness: 0.3 }),
    pcb: std({ color: '#0f5a3a', metalness: 0.1, roughness: 0.55 }),
    chip: std({ color: '#141518', metalness: 0.2, roughness: 0.45 }),
    ceramic: std({ color: '#3b4048', metalness: 0.1, roughness: 0.7 }),
    silicon: std({ color: '#17202b', metalness: 0.7, roughness: 0.22 }),
    darkGlass: new THREE.MeshPhysicalMaterial({ color: '#06080b', roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03 }),
    frosted: std({ color: '#dfe3e6', roughness: 0.8 }),
    amber: std({ color: '#3a1a05', emissive: '#ff8a1e', emissiveIntensity: 0.5, roughness: 0.3 }),
    white: std({ color: '#f1f1ef', roughness: 0.6 }),
    glass, glassList: COATINGS.map((c) => glass(c)),
    coverGlass: glass('#9fffe0', 0.05),
    caps: {
      metal: std({ color: '#ffffff', map: hatchA, metalness: 0.1, roughness: 0.65 }),
      dark: std({ color: '#ffffff', map: hatchB, metalness: 0.1, roughness: 0.75 }),
      pcb: std({ color: '#1c7a50', roughness: 0.6 }),
      glass: new THREE.MeshBasicMaterial({ color: '#8fd3e8', transparent: true, opacity: 0.42, depthWrite: false, fog: false, side: THREE.DoubleSide }),
    },
    outline: new THREE.LineBasicMaterial({ color: '#1d2228', transparent: true, opacity: 0.6, depthWrite: false }),
  };
}

// solido di rivoluzione attorno all'asse verticale: profilo [r, y]
const lathe = (pts, seg = 48, crease = 0.5) => revolveX(pts.map(([r, y]) => [y, r]), seg, crease).rotateZ(Math.PI / 2);

function stadium(cx, halfStraight, r) {
  const s = new THREE.Shape();           // coordinate (u, v) = (x, −z)
  s.moveTo(cx + r, -halfStraight);
  s.lineTo(cx + r, halfStraight);
  s.absarc(cx, halfStraight, r, 0, Math.PI, false);
  s.lineTo(cx - r, -halfStraight);
  s.absarc(cx, -halfStraight, r, Math.PI, TWO_PI, false);
  s.closePath();
  return s;
}

function ringText(text, { w = 2048, h = 96, size = 54, color = '#f2f2f0', bg = '#0d0e10', spacing = 0.22, repeat = 2 } = {}) {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = color; g.textBaseline = 'middle'; g.font = `600 ${size}px ${FONT}`;
    const chars = [...text];
    const widths = chars.map((c) => g.measureText(c).width + size * spacing);
    const total = widths.reduce((a, b) => a + b, 0);
    for (let r = 0; r < repeat; r++) {
      let x = (w / repeat) * r + (w / repeat - total) / 2;
      chars.forEach((c, i) => { g.fillText(c, x, h / 2 + 2); x += widths[i]; });
    }
  }, { aniso: 16 });
}

/** Fascia conica interna (anello con la sigla dell'obiettivo), rivolta verso l'asse e verso il davanti. */
function coneBandX(xA, rA, xB, rB, seg = 128) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= seg; j++) {
    const a = (TWO_PI * j) / seg, c = Math.cos(a), s = Math.sin(a), u = 1 - j / seg;
    pos.push(xA, rA * c, rA * s, xB, rB * c, rB * s);
    uv.push(u, 0, u, 1);
    if (j < seg) { const k = j * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function bandX(x0, x1, r, seg = 128) {
  const g = new THREE.CylinderGeometry(r, r, x1 - x0, seg, 1, true);
  g.rotateZ(-Math.PI / 2);
  g.translate((x0 + x1) / 2, 0, 0);
  return g;
}

export class CameraRig {
  constructor(axisHeight) {
    this.axisHeight = axisHeight;
    this.group = new THREE.Group();
    this.group.name = 'fotocamera';
    this.group.position.set(0, axisHeight, 0);
    this.group.scale.setScalar(0.001);
    this.M = makeMaterials();
    this.cutaway = false;
    this.lensParts = null;

    this.sensorMat = new THREE.MeshBasicMaterial({ color: '#05070a', fog: false });
    this.lcdMat = new THREE.MeshBasicMaterial({ color: '#05070a', fog: false });

    this.bodyFull = this._buildBody();
    this.group.add(this.bodyFull);
    this.bodyHalf = this._slice(this.bodyFull);
    this.group.add(this.bodyHalf);
    this.internals = this._buildInternals();
    this.group.add(this.internals);
    this.group.add(this._buildTripod());

    this.lensFixedFull = new THREE.Group(); this.lensFixedHalf = new THREE.Group();
    this.lensMove = new THREE.Group();
    this.lensMoveFull = new THREE.Group(); this.lensMoveHalf = new THREE.Group();
    this.iris = new THREE.Group();
    this.iris.rotation.y = Math.PI / 2;
    this.lensMove.add(this.lensMoveFull, this.lensMoveHalf, this.iris);
    this.group.add(this.lensFixedFull, this.lensFixedHalf, this.lensMove);
    this.setShutter(0, 0);

    // piano di sezione animato: durante il passaggio taglia il modello intero, poi subentra quello con le facce di taglio
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 10);
    const sheet = new THREE.Group();
    const sg = new THREE.PlaneGeometry(1, 1);
    const fill = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: '#0c9d8f', transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(sg), new THREE.LineBasicMaterial({ color: '#0c9d8f', transparent: true, opacity: 0.9, depthWrite: false }));
    fill.userData.noAO = true; fill.renderOrder = 7; edge.renderOrder = 7;
    sheet.add(fill, edge);
    sheet.visible = false;
    this.sheet = sheet;
    this.group.add(sheet);
    this._applyClip(this.bodyFull);
    this.detail = 1;
    this.setCutaway(false);
  }

  _applyClip(grp) {
    grp.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (!m.clippingPlanes) { m.clippingPlanes = [this.clipPlane]; m.needsUpdate = true; }
    });
  }

  _mesh(geo, mat, cut = 'metal', opts = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.userData.cut = cut;
    m.castShadow = opts.cast !== false;
    m.receiveShadow = opts.receive !== false;
    if (mat.transparent) { m.userData.noAO = true; m.castShadow = false; }
    return m;
  }

  // ───────────────────────────── corpo macchina ─────────────────────────────
  _buildBody() {
    const M = this.M, g = new THREE.Group();
    const add = (geo, mat, cut, opts) => { const m = this._mesh(geo, mat, cut, opts); g.add(m); return m; };
    const Y0 = -41, Y1 = -36.5, Y2 = 29, Y3 = 43, CX = -3, HS = 50, BR = 18;

    // guscio centrale rivestito in similpelle: parete anteriore (con la gola dell'innesto), camera, dorso
    const front = rectShape(-HS, HS, Y1, Y2);
    const hole = new THREE.Path(); hole.absarc(0, 0, 24.6, 0, TWO_PI, true); front.holes.push(hole);
    add(extrudeX(front, 11, 15, { curveSegments: 48 }), M.leather, 'metal');
    const frame = rectShape(-HS, HS, Y1, Y2);
    frame.holes.push(roundedRectPath(new THREE.Path(), -44, 44, -31.5, 25, 2));
    add(extrudeX(frame, -16, 11), M.leather, 'metal');
    add(extrudeX(rectShape(-HS, HS, Y1, Y2), -21, -16), M.leather, 'metal');
    for (const z of [-HS, HS]) {
      add(new THREE.CylinderGeometry(BR, BR, Y2 - Y1, 56).translate(CX, (Y1 + Y2) / 2, z), M.leatherCyl, 'metal');
    }
    // calotta e fondello
    add(extrudeY(stadium(CX, HS, BR + 0.5), Y2, Y3, 1.7, { curveSegments: 40 }), M.silver, 'metal');
    add(extrudeY(stadium(CX, HS, BR + 0.4), Y0, Y1, 1.2, { curveSegments: 40 }), M.silver, 'metal');

    // ghiera dei tempi
    const dialX = -3, dialZ = 27;
    add(extrudeY(knurledShape(11, 0, 60, 0.5), Y3 + 0.5, Y3 + 7.4, 0.35).translate(dialX, 0, dialZ), M.silver, 'metal');
    add(new THREE.CylinderGeometry(11.8, 11.8, 0.7, 48).translate(dialX, Y3 + 0.35, dialZ), M.silver, 'metal');
    const dialTex = canvasTexture(512, 512, (c, w) => {
      const grd = c.createRadialGradient(w / 2, w / 2, 10, w / 2, w / 2, w / 2);
      grd.addColorStop(0, '#d6d7d9'); grd.addColorStop(1, '#bfc1c4');
      c.fillStyle = grd; c.fillRect(0, 0, w, w);
      c.fillStyle = '#151515'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `600 40px ${FONT}`;
      const labels = ['4000', '2000', '1000', '500', '250', '125', '60', '30', '15', '8', '4', '2', '1', 'B'];
      labels.forEach((t, i) => {
        c.save(); c.translate(w / 2, w / 2); c.rotate((TWO_PI * i) / labels.length); c.translate(0, -w * 0.375);
        c.fillStyle = t === '125' ? '#c8281e' : '#151515';
        c.fillText(t, 0, 0); c.restore();
      });
      c.beginPath(); c.arc(w / 2, w / 2, w * 0.2, 0, TWO_PI); c.strokeStyle = '#8f9296'; c.lineWidth = 3; c.stroke();
    });
    const dialTop = new THREE.Mesh(new THREE.CircleGeometry(10.3, 48).rotateX(-Math.PI / 2).translate(dialX, Y3 + 7.42, dialZ), new THREE.MeshStandardMaterial({ map: dialTex, metalness: 0.9, roughness: 0.36 }));
    dialTop.receiveShadow = true;
    g.add(dialTop);
    // pulsante di scatto
    add(lathe([[0, Y3], [8.2, Y3], [8.2, Y3 + 2.2], [7.4, Y3 + 3], [5.4, Y3 + 3], [5.4, Y3 + 1.6], [0, Y3 + 1.6]], 40).translate(2, 0, 49), M.silver, 'metal');
    add(lathe([[0, Y3 + 1.5], [4.7, Y3 + 1.5], [4.7, Y3 + 4.2], [4.2, Y3 + 4.8], [2.6, Y3 + 4.5], [0, Y3 + 4.1]], 32).translate(2, 0, 49), M.chrome, 'metal');
    // ghiera ISO
    add(extrudeY(knurledShape(9.6, 0, 52, 0.5), Y3 + 0.4, Y3 + 5.6, 0.35).translate(-3, 0, -47), M.silver, 'metal');
    add(new THREE.CylinderGeometry(7.2, 7.2, 0.5, 40).translate(-3, Y3 + 5.8, -47), M.black, 'dark');
    // slitta accessori
    const shoe = [new THREE.BoxGeometry(19, 1.3, 19).translate(-6, Y3 + 0.65, 0)];
    for (const z of [-8.4, 8.4]) {
      shoe.push(new THREE.BoxGeometry(19, 2.1, 2.2).translate(-6, Y3 + 2.3, z));
      shoe.push(new THREE.BoxGeometry(19, 0.8, 4.4).translate(-6, Y3 + 3.7, z - Math.sign(z) * 1.1));
    }
    add(mergeGeometries(shoe.map((s) => s.toNonIndexed())), M.chrome, 'metal');
    // finestre del mirino sulla calotta
    add(new RoundedBoxGeometry(1.2, 9.6, 15.5, 2, 0.5).translate(15.3, 36, -41.5), M.darkGlass, 'dark');
    add(new RoundedBoxGeometry(1.2, 6.2, 11.5, 2, 0.5).translate(15.3, 36.6, -19), M.frosted, 'metal');
    add(new RoundedBoxGeometry(1.2, 6.0, 8.0, 2, 0.5).translate(15.3, 36.6, 23), M.darkGlass, 'dark');
    add(new THREE.SphereGeometry(2.1, 20, 14).translate(14.4, 22.5, 39), M.amber, 'dark');
    // oculare
    add(revolveX(bevelProfile([[-24.6, 5.2], [-21.5, 5.2], [-21.5, 8.2], [-24.6, 8.2]], 0.4), 40).translate(0, 35.8, -42), M.rubber, 'dark');
    add(new THREE.CylinderGeometry(5.2, 5.2, 0.6, 32).rotateZ(Math.PI / 2).translate(-22.6, 35.8, -42), M.darkGlass, 'dark');
    // marchio inciso
    const brand = canvasTexture(1024, 180, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.fillStyle = '#16171a'; c.textBaseline = 'middle'; c.font = `600 120px ${FONT}`;
      let x = 24; for (const ch of 'GALILEO') { c.fillText(ch, x, h / 2 + 6); x += c.measureText(ch).width + 34; }
    });
    const brandMesh = new THREE.Mesh(new THREE.PlaneGeometry(24, 4.2).rotateY(Math.PI / 2).translate(15.56, 36.4, 2),
      new THREE.MeshStandardMaterial({ map: brand, transparent: true, roughness: 0.5, metalness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false }));
    brandMesh.userData.noAO = true;
    g.add(brandMesh);
    // dorso: schermo e comandi
    add(new RoundedBoxGeometry(1.8, 54, 80, 2, 0.8).translate(-21.7, -5, 4), M.darkGlass, 'dark');
    const lcd = new THREE.Mesh(new THREE.PlaneGeometry(66, 44).rotateY(-Math.PI / 2).translate(-22.66, -5, 4), this.lcdMat);
    lcd.userData.cut = null;
    g.add(lcd);
    for (const y of [8, -4, -16]) add(new THREE.CylinderGeometry(2.9, 2.9, 1.6, 24).rotateZ(Math.PI / 2).translate(-21.6, y, -43), M.satin, 'dark');
    // comandi frontali
    add(new THREE.CylinderGeometry(3.3, 3.3, 2.4, 24).rotateZ(Math.PI / 2).translate(15.9, -15, 35), M.chrome, 'metal');
    // occhielli per la tracolla
    for (const z of [-1, 1]) {
      add(new THREE.TorusGeometry(3.4, 0.75, 10, 28).rotateY(Math.PI / 2).translate(CX, 24, z * (HS + BR + 2.6)), M.chrome, 'metal');
      add(new THREE.CylinderGeometry(1.3, 1.3, 3.5, 12).rotateX(Math.PI / 2).translate(CX, 24, z * (HS + BR + 0.6)), M.chrome, 'metal');
    }
    // innesto a baionetta e gola
    add(revolveX(bevelProfile([[15, 24.2], [18, 24.2], [18, 30.6], [15, 31.4]], 0.45), 96), M.chrome, 'metal');
    add(revolveX([[5, 23.4], [15, 23.4], [15, 24.6], [5, 24.6]], 96), M.matte, 'dark');
    // telaio dell'otturatore a tendina
    const fr = rectShape(-28, 28, -25, 25, 1.5);
    fr.holes.push(roundedRectPath(new THREE.Path(), -19, 19, -13, 13, 0.6));
    add(extrudeX(fr, 2.7, 5.5), M.satin, 'dark');
    // elettronica dietro il sensore
    add(new THREE.BoxGeometry(1.8, 48, 64).translate(-3.9, 0, 0), M.silver, 'metal');
    add(new THREE.BoxGeometry(1.2, 52, 86).translate(-7.2, -1, 0), M.pcb, 'pcb');
    const chips = [[-8.4, 6, -22, 14, 14], [-8.4, -11, 16, 9, 12], [-8.4, 10, 20, 7, 7], [-8.4, -12, -18, 6, 10]]
      .map(([x, y, z, h, w]) => new THREE.BoxGeometry(1.4, h, w).translate(x, y, z).toNonIndexed());
    chips.push(new THREE.BoxGeometry(1.5, 9, 9).translate(-8.4, 2, 0.5).toNonIndexed());
    add(mergeGeometries(chips), M.chip, 'dark');
    return g;
  }

  // ───────────────────────────── sensore e otturatore (mai sezionati) ─────────────────────────────
  _buildInternals() {
    const M = this.M, g = new THREE.Group();
    const add = (geo, mat, opts) => { const m = this._mesh(geo, mat, null, opts); g.add(m); return m; };
    add(new THREE.BoxGeometry(2.2, 36, 48).translate(-1.7, 0, 0), M.ceramic);
    add(new THREE.BoxGeometry(0.6, 25.2, 37.2).translate(-0.3, 0, 0), M.silicon);
    // immagine sul sensore: vista dal davanti è la fotografia capovolta
    const img = new THREE.PlaneGeometry(36, 24).rotateY(Math.PI / 2).translate(0.03, 0, 0);
    const uv = img.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    this.sensorMesh = new THREE.Mesh(img, this.sensorMat);
    g.add(this.sensorMesh);
    const cg = add(new RoundedBoxGeometry(0.7, 28, 40, 1, 0.2).translate(1.3, 0, 0), M.coverGlass);
    cg.renderOrder = 2;
    this.curtains = [[], []];
    for (let c = 0; c < 2; c++) for (let i = 0; i < 4; i++) {
      const slat = add(new THREE.BoxGeometry(0.12, 7.6, 39.4), M.curtain, { cast: false });
      slat.position.x = (c === 0 ? 3.25 : 4.45) + i * 0.17;
      slat.userData.park = c === 0 ? -17.6 - i * 0.28 : 17.6 + i * 0.28;
      slat.userData.dep = c === 0 ? 9.75 - 6.5 * i : -9.75 + 6.5 * i;
      this.curtains[c].push(slat);
    }
    return g;
  }

  /** Posizione delle due tendine: 0 = riposta (sensore scoperto), 1 = distesa davanti al sensore. */
  setShutter(c1, c2) {
    [c1, c2].forEach((c, k) => {
      for (const s of this.curtains[k]) { s.position.y = s.userData.park + (s.userData.dep - s.userData.park) * c; s.visible = c > 0.001; }
    });
  }

  _buildTripod() {
    const M = this.M, g = new THREE.Group();
    const floor = -this.axisHeight * 1000;
    const add = (geo, mat) => { const m = this._mesh(geo, mat, null); g.add(m); return m; };
    add(lathe([[0, -41.08], [15, -41.08], [15, -43.2], [13.5, -44], [0, -44]], 40), M.rubber);
    add(new THREE.CylinderGeometry(4.6, 4.6, 7, 24).translate(0, -47.5, 0), M.chrome);
    add(new THREE.SphereGeometry(9.6, 40, 28).translate(0, -58, 0), M.chrome);
    add(lathe([[0, -62], [11.6, -62], [12.8, -63.5], [12.8, -73], [10.5, -75], [10.5, -82], [0, -82]], 48), M.black);
    add(new THREE.CylinderGeometry(2.6, 2.6, 9, 16).rotateX(Math.PI / 2).translate(0, -68, 14), M.silver);
    add(new THREE.SphereGeometry(4.2, 20, 14).translate(0, -68, 20), M.rubber);
    const legs = [], feet = [];
    for (let k = 0; k < 3; k++) {
      const a = (TWO_PI * k) / 3 + Math.PI / 6;
      const top = new THREE.Vector3(6 * Math.cos(a), -78, 6 * Math.sin(a));
      const foot = new THREE.Vector3(56 * Math.cos(a), floor + 4.5, 56 * Math.sin(a));
      const len = top.distanceTo(foot);
      const leg = new THREE.CylinderGeometry(3.9, 3.3, len, 20);
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), foot.clone().sub(top).normalize().negate());
      m4.compose(top.clone().add(foot).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
      leg.applyMatrix4(m4);
      legs.push(leg);
      feet.push(new THREE.SphereGeometry(4.6, 20, 14).translate(foot.x, foot.y, foot.z));
    }
    add(mergeGeometries(legs), M.black);
    add(mergeGeometries(feet), M.rubber);
    return g;
  }

  // ───────────────────────────── spaccato ─────────────────────────────
  _slice(src) {
    const M = this.M;
    src.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(src.matrixWorld).invert();
    const out = new THREE.Group();
    const lines = [];
    const m4 = new THREE.Matrix4();
    src.traverse((o) => {
      if (!o.isMesh) return;
      m4.multiplyMatrices(inv, o.matrixWorld);
      const { kept, cap, loops } = sliceZ(o.geometry, m4, CUT_Z);
      if (kept) {
        const m = new THREE.Mesh(kept, o.material);
        m.castShadow = o.castShadow; m.receiveShadow = o.receiveShadow; m.renderOrder = o.renderOrder;
        m.userData.noAO = o.userData.noAO;
        out.add(m);
      }
      const capMat = o.userData.cut ? M.caps[o.userData.cut] : null;
      if (cap && capMat) {
        const m = new THREE.Mesh(cap, capMat);
        m.receiveShadow = !capMat.transparent;
        if (capMat.transparent) { m.userData.noAO = true; m.renderOrder = 3; }
        out.add(m);
        for (const l of loops) for (let i = 0; i < l.length; i += 2) {
          const j = (i + 2) % l.length;
          lines.push(l[i], l[i + 1], CUT_Z + 0.02, l[j], l[j + 1], CUT_Z + 0.02);
        }
      }
    });
    if (lines.length) {
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
      const ls = new THREE.LineSegments(lg, M.outline);
      ls.renderOrder = 4;
      out.add(ls);
    }
    return out;
  }

  _show(half) {
    this.bodyFull.visible = !half; this.bodyHalf.visible = half;
    this.lensFixedFull.visible = !half; this.lensFixedHalf.visible = half;
    this.lensMoveFull.visible = !half; this.lensMoveHalf.visible = half;
  }

  /** Attiva o disattiva lo spaccato; con animate il piano di sezione attraversa la fotocamera. */
  setCutaway(on, animate = false) {
    this.cutaway = on;
    if (!animate) {
      this._cut = null;
      this.clipPlane.constant = 10;
      this.sheet.visible = false;
      this._show(on);
      return;
    }
    this._cut = { t: this._cut ? 1 - this._cut.t : 0, on };
    this._show(false);
  }

  /** Avanza l'animazione del piano di sezione. */
  tick(dt) {
    const a = this._cut;
    if (!a) return;
    a.t = Math.min(a.t + dt / 0.75, 1);
    const k = a.t < 0.5 ? 2 * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 2) / 2;
    const OPEN = 0.074;
    const z = a.on ? OPEN * (1 - k) : OPEN * k;
    this.clipPlane.constant = z + CUT_Z * 0.001;
    const i = this.info || {};
    const x1 = Math.max((i.xFront || 70) + this.lensMove.position.x + 8, 40), x0 = -30;
    const half = Math.max((i.Ro || 25) + 10, 52);
    this.sheet.visible = true;
    this.sheet.position.set((x0 + x1) / 2, 2, z * 1000);
    this.sheet.scale.set(x1 - x0, 2 * half, 1);
    if (a.t >= 1) this.setCutaway(a.on, false);
  }

  // ───────────────────────────── obiettivo ─────────────────────────────
  _clear(grp) {
    for (const c of [...grp.children]) {
      grp.remove(c);
      c.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
  }

  /** Ricostruisce l'obiettivo dalla prescrizione ottica (cambio di schema o di focale). */
  setLens(lens, detail = 1) {
    this.detail = detail;
    for (const g of [this.lensFixedFull, this.lensFixedHalf, this.lensMoveFull, this.lensMoveHalf, this.iris]) this._clear(g);
    for (const t of this._lensTextures || []) t.dispose();
    this._lensTextures = [];
    this.info = lens.isPinhole ? this._buildPinhole(lens) : this._buildLens(lens);
    this._applyClip(this.lensFixedFull); this._applyClip(this.lensMoveFull);
    this._resliceLens();
    this.update(lens, true);
  }

  _resliceLens() {
    this._clear(this.lensFixedHalf); this._clear(this.lensMoveHalf);
    const a = this._slice(this.lensFixedFull), b = this._slice(this.lensMoveFull);
    this.lensFixedHalf.add(...a.children); this.lensMoveHalf.add(...b.children);
  }

  /** Suddivisioni angolari, ridotte durante le ricostruzioni in bozza. */
  _q(n) { return Math.max(24, Math.round(n * this.detail)); }

  _buildLens(lens) {
    const M = this.M, S = lens.surf, mm = 1000;
    const f = lens.f * mm;
    const u = Math.max(0.75, f / 50);
    const fixed = this.lensFixedFull, moving = this.lensMoveFull;
    const add = (grp, geo, mat, cut, opts) => { const m = this._mesh(geo, mat, cut, opts); grp.add(m); return m; };
    const q = (n) => this._q(n);
    const X = (i) => (lens.bfl + lens.L - S[i].z) * mm;
    const Rof = (i) => S[i].R * mm;
    const sag = (i, r) => { const R = Rof(i); if (!isFinite(R)) return 0; return R - Math.sign(R) * Math.sqrt(Math.max(R * R - r * r, 0)); };
    const sd = (i) => Math.min(S[i].sd * mm, isFinite(Rof(i)) ? Math.abs(Rof(i)) * 0.985 : Infinity);

    // ── elementi di vetro ──
    const groups = lens.groups.map((els) => {
      const rm = Math.max(...els.flatMap((el) => [sd(el.iFront), sd(el.iBack)])) * 1.035 + 0.3 * u;
      return { els, rm, iF: els[0].iFront, iB: els[els.length - 1].iBack };
    });
    let elIndex = 0;
    for (const g of groups) {
      for (const el of g.els) {
        let rf = sd(el.iFront), rb = sd(el.iBack);
        for (let k = 0; k < 40; k++) {
          const edge = (X(el.iFront) - sag(el.iFront, rf)) - (X(el.iBack) - sag(el.iBack, rb));
          if (edge >= 0.3 * u) break;
          rf *= 0.975; rb *= 0.975;
        }
        const rm = Math.max(g.rm, rf, rb);
        const xf = X(el.iFront) - sag(el.iFront, rf), xb = X(el.iBack) - sag(el.iBack, rb);
        el.xf = xf; el.xb = xb;
        const prof = [], n = Math.max(12, Math.round(30 * this.detail));
        for (let k = 0; k <= n; k++) { const r = (rf * k) / n; prof.push([X(el.iFront) - sag(el.iFront, r), r]); }
        prof.push([xf, rm], [xb, rm]);
        for (let k = n; k >= 0; k--) { const r = (rb * k) / n; prof.push([X(el.iBack) - sag(el.iBack, r), r]); }
        const mesh = add(moving, revolveX(prof, q(112), 0.45), M.glassList[elIndex % M.glassList.length], 'glass');
        mesh.renderOrder = 2;
        elIndex++;
      }
      g.xa = g.els[0].xf; g.xb = g.els[g.els.length - 1].xb;
    }

    // ── barilotto mobile: sedi delle lenti, distanziali, camera dell'iride ──
    const lipL = 0.7 * u, cl = 0.04;
    const first = groups[0];
    const sdF = (g) => sd(g.iF), sdB = (g) => sd(g.iB);
    const xTop = Math.max(X(first.iF), first.xa);
    const hood = 5 + 0.09 * f;
    const xFront = xTop + hood;
    const rStopMax = lens.rStopMax * mm;
    const rIris = rStopMax * 1.42 + 1.0 * u;
    const rmMax = Math.max(...groups.map((g) => g.rm));
    const Ri = Math.max(rmMax + 2.4 * u, rIris + 1.5 * u);
    const Ro = Ri + 3.0 * u;
    const xStop = X(lens.iStop);
    const wCh = 0.8 * u;
    const rHood = Math.min(Ri - 1.3 * u, sdF(first) + hood * 0.55 + 0.4);
    const bore = [[xFront, rHood], [first.xa + lipL, sdF(first) + 0.25]];
    const feats = groups.map((g) => ({ g, x: g.xa })).concat([{ stop: true, x: xStop }]).sort((a, b) => b.x - a.x);
    let rCur = sdF(first) + 0.25, xRear = 0;
    feats.forEach((ft, k) => {
      const next = feats[k + 1];
      if (ft.g) {
        const g = ft.g;
        bore.push([g.xa, rCur], [g.xa, g.rm + cl], [g.xb, g.rm + cl]);
        let rAfter;
        if (!next) rAfter = Math.min(sdB(g) + 0.25, g.rm - 0.3);
        else if (next.stop) rAfter = Math.min(sdB(g) + 0.25, g.rm - 0.3);
        else rAfter = Math.min(Math.max(sdB(g), sdF(next.g)) + 0.25, Math.min(g.rm, next.g.rm) - 0.3);
        bore.push([g.xb, rAfter]);
        rCur = rAfter;
        if (!next) { xRear = g.xb - lipL - 1.3 * u; bore.push([g.xb - lipL, rAfter], [xRear, rAfter + 0.9 * u]); }
      } else {
        const rLip = rStopMax + 0.02;
        const xa = ft.x + wCh + lipL, xb = ft.x - wCh - lipL;
        bore.push([xa, rCur], [xa, rLip], [ft.x + wCh, rLip], [ft.x + wCh, rIris], [ft.x - wCh, rIris], [ft.x - wCh, rLip], [xb, rLip]);
        const rAfter = next ? Math.max(Math.min(sdF(next.g) + 0.25, next.g.rm - 0.3), rLip) : rLip + 1.2 * u;
        bore.push([xb, rAfter]);
        rCur = rAfter;
        if (!next) { xRear = xb - 2.2 * u; bore.push([xRear, rAfter + 0.7 * u]); }
      }
    });
    const xS1 = xFront - Math.max(0.32 * (xFront - 21.2), 7);       // estremità della canna fissa
    const xBz = xS1 + 0.5;
    const ringW = 1.4 * u;
    const outer = [[xRear, Ri], [xBz, Ri], [xBz, Ro], [xFront - ringW, Ro], [xFront - ringW, Ro - 1.0 * u], [xFront, Ro - 1.0 * u]];
    add(moving, revolveX(bevelProfile(outer.concat(bore), 0.2 * u, 2), q(128), 0.5), M.black, 'dark');
    add(moving, revolveX(bevelProfile([[xFront - ringW, Ro - 1.0 * u + 0.02], [xFront + 0.25, Ro - 1.0 * u + 0.02], [xFront + 0.25, Ro + 0.12], [xFront - ringW, Ro + 0.12]], 0.3 * u, 3), q(128)), M.chrome, 'metal');
    // anello con la sigla, sul cono interno del paraluce
    const t0 = 0.22, t1 = 0.9;
    const xL = first.xa + lipL, rL = sdF(first) + 0.25;
    const cx = (t) => xL + (xFront - xL) * t, cr = (t) => rL + (rHood - rL) * t - 0.05;
    const nameTex = ringText(`GALILEO   ·   ${lens.label.toUpperCase()}   1:${lens.minN}   f = ${Math.round(f)} mm`, { size: 56, repeat: 2, bg: '#0a0b0c' });
    this._lensTextures.push(nameTex);
    const nameBand = new THREE.Mesh(coneBandX(cx(t0), cr(t0), cx(t1), cr(t1), q(128)), new THREE.MeshStandardMaterial({ map: nameTex, roughness: 0.55, metalness: 0.3, side: THREE.DoubleSide }));
    nameBand.receiveShadow = true;
    moving.add(nameBand);

    // ── canna fissa, innesto, ghiere ──
    add(fixed, revolveX(bevelProfile([[FLANGE, 20], [21.2, 20], [21.2, 31], [FLANGE, 31]], 0.35), q(96)), M.chrome, 'metal');
    const rin = Ri + 0.35;
    const coneO = Math.max(0, (Ro - 31) * 1.1), coneI = Math.max(0, (rin - 20) * 1.1);
    const sleeve = [];
    sleeve.push([21.2, Math.min(rin, 20)]);
    if (coneI > 0) sleeve.push([21.2 + coneI, rin]);
    sleeve.push([xS1, rin], [xS1, Ro]);
    if (coneO > 0) sleeve.push([21.2 + coneO, Ro], [21.2, 31]); else sleeve.push([21.2, Ro]);
    add(fixed, revolveX(bevelProfile(sleeve, 0.25 * u, 2), q(128)), M.black, 'dark');
    // diaframmi antiriflesso nel tratto posteriore (teleobiettivi)
    const xb0 = 21.2 + coneI + 3;
    if (xRear - xb0 > 12) {
      const rB = Math.max(sdB(groups[groups.length - 1]) + 0.8, 22.5);
      const nB = Math.max(1, Math.floor((xRear - xb0) / (10 * u)));
      for (let k = 0; k < nB; k++) {
        const x = xb0 + ((xRear - 4 - xb0) * (k + 0.5)) / nB;
        if (rB < rin - 1) add(fixed, revolveX([[x, rB], [x + 0.5, rB + 0.4], [x + 0.5, rin + 0.2], [x, rin + 0.2]], q(96)), M.matte, 'dark');
      }
    }
    const xc = 21.2 + coneO;
    const avail = xS1 - xc;
    const wa = Math.min(8 * u, 0.3 * avail);
    const xa0 = xc + 1.0 * u, xa1 = xa0 + wa;
    const rA = Ro + 1.1 * u;
    // ghiera dei diaframmi: metà zigrinata, metà liscia con la scala incisa
    const xk = xa0 + wa * 0.42;
    add(fixed, extrudeX(knurledShape(rA + 0.25 * u, Ro - 0.05, Math.round((TWO_PI * rA) / 1.5), 0.45 * u), xa0, xk, { curveSegments: 64 }), M.black, 'dark');
    add(fixed, revolveX(bevelProfile([[xk, Ro - 0.05], [xa1, Ro - 0.05], [xa1, rA], [xk, rA]], 0.25 * u, 2), q(128)), M.black, 'dark');
    const stops = [2.8, 4, 5.6, 8, 11, 16, 22];
    const DU = 0.036;
    const scaleTex = canvasTexture(2048, 96, (c, w, h) => {
      c.fillStyle = '#0d0e10'; c.fillRect(0, 0, w, h);
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `600 52px ${FONT}`;
      stops.forEach((s, i) => {
        c.fillStyle = i === 0 ? '#ff9c2a' : '#f2f2f0';
        c.fillText(String(s), (0.5 + (i - 3) * DU) * w, h / 2 + 3);
      });
    }, { aniso: 16 });
    scaleTex.wrapS = THREE.RepeatWrapping;
    this._lensTextures.push(scaleTex);
    this.scaleTex = scaleTex; this.scaleDU = DU;
    const band = new THREE.Mesh(bandX(xk + 0.3 * u, xa1 - 0.3 * u, rA + 0.03, q(128)), new THREE.MeshStandardMaterial({ map: scaleTex, roughness: 0.5, metalness: 0.5 }));
    band.receiveShadow = true;
    fixed.add(band);
    // indice di riferimento
    const alpha = (35 * Math.PI) / 180;
    this.scaleIndexU = ((alpha - Math.PI / 2) / TWO_PI + 1) % 1;
    const idxMesh = add(fixed, new THREE.BoxGeometry(1.5 * u, 0.5, 0.2).translate(xa1 + 1.2 * u, 0, 0), M.white, null);
    idxMesh.geometry.translate(0, 0, Ro + 0.03).rotateX(-(Math.PI / 2 - alpha));
    // ghiera di messa a fuoco
    const xf0 = xa1 + 2.4 * u, xf1 = xS1 - 1.2 * u;
    if (xf1 - xf0 > 3) {
      const rF = Ro + 1.7 * u;
      add(fixed, extrudeX(knurledShape(rF, Ro - 0.05, Math.round((TWO_PI * rF) / 2.1), 0.75 * u), xf0, xf1, { curveSegments: 64 }), M.rubber, 'dark');
    }

    // ── diaframma a iride ──
    this.iris.position.x = xStop;
    this.irisBlades = [];
    for (let k = 0; k < lens.blades; k++) {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), M.blade);
      m.position.z = (k - lens.blades / 2) * 0.05;
      m.castShadow = false; m.receiveShadow = true;
      this.iris.add(m); this.irisBlades.push(m);
    }
    this.irisR = rIris - 0.12;
    return { xFront, xStop, Ro, Ri, rIris, xS1, xRear, xTop, rFrontGlass: sdF(first), u };
  }

  _buildPinhole(lens) {
    const M = this.M, mm = 1000;
    const q = (n) => this._q(n);
    const v = lens.fNominal * mm;
    const fixed = this.lensFixedFull;
    const add = (grp, geo, mat, cut) => { const m = this._mesh(geo, mat, cut); grp.add(m); return m; };
    add(fixed, revolveX(bevelProfile([[FLANGE, 20], [21.2, 20], [21.2, 31], [FLANGE, 31]], 0.35), 96), M.chrome, 'metal');
    const R = 27;
    add(fixed, revolveX(bevelProfile([[21.2, R - 1.8], [v - 0.5, R - 1.8], [v - 0.5, R], [21.2, R]], 0.3, 2), q(128)), M.black, 'dark');
    this.iris.position.x = v;
    this.irisBlades = [];
    this.pinR = R; this.pinX = v;
    this._pinholePlate(lens);
    return { xFront: v + 0.4, xStop: v, Ro: R, Ri: R - 1.8, rIris: 3, xS1: v, xRear: 21.2, xTop: v, rFrontGlass: 2, u: 1 };
  }

  _pinholePlate(lens) {
    const rh = Math.max(lens.rStop * 1000, 0.02), v = this.pinX, R = this.pinR;
    if (this.pinPlate) { this.lensMoveFull.remove(this.pinPlate); this.pinPlate.geometry.dispose(); }
    const prof = [[v - 0.4, R], [v + 0.4, R], [v + 0.4, rh + 0.9], [v, rh], [v - 0.4, rh + 0.9]];
    this.pinPlate = this._mesh(revolveX(prof, 96, 0.4), this.M.brass, 'metal');
    this.lensMoveFull.add(this.pinPlate);
  }

  /** Aggiorna le parti mobili: estensione di messa a fuoco, lamelle del diaframma, scala incisa. */
  update(lens, force = false) {
    const mm = 1000;
    this.lensMove.position.x = lens.e * mm;
    const key = lens.rIn.toFixed(7) + lens.polygonal;
    if (key === this._irisKey && !force) return;
    this._irisKey = key;
    if (lens.isPinhole) {
      this._pinholePlate(lens);
      this._clear(this.lensMoveHalf);
      this.lensMoveHalf.add(...this._slice(this.lensMoveFull).children);
      return;
    }
    // ogni lamella copre il semipiano oltre il proprio bordo: insieme lasciano libero un poligono regolare
    const Rc = this.irisR;
    const d = Math.min(lens.polygonal ? lens.rIn * mm : lens.rStopMax * mm * 1.03, Rc * 0.999);
    const a = Math.acos(d / Rc);
    const shape = new THREE.Shape();
    shape.moveTo(d, -Rc * Math.sin(a));
    shape.absarc(0, 0, Rc, -a, a, false);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape, 24);
    const old = this.irisBlades[0] && this.irisBlades[0].geometry;
    this.irisBlades.forEach((b, k) => {
      b.geometry = geo;
      b.rotation.z = Math.PI / 2 - (lens.bladePhase + (TWO_PI * k) / lens.blades);
    });
    if (old) old.dispose();
    if (this.scaleTex) {
      const kf = 2 * Math.log2(lens.N / 2.8);
      this.scaleTex.offset.x = 0.5 + (kf - 3) * this.scaleDU - this.scaleIndexU;
    }
  }

  /** Punti notevoli in coordinate di mondo (per le etichette). */
  anchor(name, lens, out) {
    const i = this.info || {};
    const e = lens.e * 1000;
    const P = {
      sensor: [0, 13.5, 0], shutter: [4.1, 25.5, 0], iris: [(i.xStop || 0) + e, (i.rIris || 8) + 0.5, 0],
      glass: [(i.xTop || 60) + e, (i.rFrontGlass || 15) * 0.72, 0], mount: [FLANGE, 31.5, 0],
      lcd: [-22.7, 18, 4], barrel: [(i.xS1 || 45) - 6, (i.Ro || 22) + 2.4, 0],
    }[name];
    return out.set(P[0], P[1], P[2]).applyMatrix4(this.group.matrixWorld);
  }
}
