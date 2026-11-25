// ui.js — pannello dei controlli, riquadro (la mappa del campo vista dall'alto, il grafico), fascia delle misure.
// Nessuna fisica qui.
import { createControls } from '../../../shared/js/controls.js';
import { PLATE, MAG, HORSE, LOOP, COIL } from './field.js';

const NF = [];
const num = (v, d = 1) => (NF[d] || (NF[d] = new Intl.NumberFormat('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }))).format(v);
export const fmt = { num };
const niceStep = (v) => { const p = 10 ** Math.floor(Math.log10(v)), f = v / p; return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p; };
const MONO = '"Geist Mono Variable", Consolas, monospace';

export function createUI(state, ctx, on) {
  const $ = (s, r = document) => r.querySelector(s);
  const { slider, toggle, seg, refresh } = createControls(state, on);
  const T = ctx.text;

  seg('src', 'La sorgente', [['bar', 'Magnete', 'un magnete a barra di ferrite sotto la lastra'], ['two', 'Due magneti', 'due magneti a barra in fila'], ['horse', 'Ferro di cavallo', 'un magnete a U'], ['wire', 'Filo', 'un filo rettilineo verticale che attraversa la lastra'], ['loop', 'Spira', 'una bobina piatta nel piano nord–sud, metà sopra e metà sotto la lastra'], ['coil', 'Solenoide', 'un solenoide con l\'asse nel piano della lastra']], 3);
  seg('pair', 'I poli affacciati', [['opp', 'Opposti', 'il nord di fronte al sud: si attraggono'], ['same', 'Uguali', 'il nord di fronte al nord: si respingono']]);
  toggle('on', 'Alimentatore acceso', 'corrente continua, fino a 20 A');
  slider('I', { range: () => [0, 20, 0.05], read: () => state.I, write: (v) => { state.I = v; }, label: () => 'Corrente', text: T.I });
  toggle('rev', 'Corrente invertita', 'i due cavi scambiati ai morsetti dell\'alimentatore');
  seg('nLoop', 'Spire della bobina', [[1, '1'], [5, '5'], [10, '10']]);
  seg('nCoil', 'Spire del solenoide', [[8, '8'], [12, '12'], [20, '20']]);
  toggle('filings', 'Limatura di ferro', 'sparsa sulla lastra: picchiettala perché si disponga');
  toggle('compasses', 'Bussole', 'l\'ago rosso segue il campo, compreso quello terrestre');
  toggle('lines', 'Linee di campo sulla lastra', 'calcolate; le frecce vanno nel verso del campo');
  toggle('lines3d', 'Linee di campo nello spazio', 'in 3D attorno alla sorgente; il colore dice l\'intensità, dall\'azzurro (debole) al rosso (forte)');
  toggle('probe', 'Teslametro', 'la sonda di Hall appoggiata sulla lastra');
  slider('s', { range: () => [0, 0.18, 0.001], read: () => state.s, write: (v) => { state.s = v; }, label: () => ctx.probeLabel(), text: T.s });
  toggle('outline', 'Contorno', 'evidenzia ciò che si muove');
  toggle('labels', 'Etichette');
  seg('quality', 'Qualità di calcolo', [['low', 'Fluida'], ['medium', 'Bilanciata'], ['high', 'Massima']]);

  const chips = (host, list, key) => {
    host.innerHTML = '';
    for (const [id, text, title] of list) {
      const b = document.createElement('button');
      b.className = 'btn'; b.innerHTML = text; if (title) b.title = title; b.dataset.id = id;
      b.addEventListener('click', () => on(key, id));
      host.appendChild(b);
    }
  };
  chips($('#presets'), ctx.presets, 'preset');
  chips($('#views'), ctx.views, 'view');
  for (const id of ['pause', 'note', 'clear', 'fullscreen', 'tap', 'sprinkle', 'zero']) $(`#${id}`).addEventListener('click', () => on(id));
  const setPanel = (show) => {
    $('#panel').classList.toggle('collapsed', !show);
    document.body.classList.toggle('panel-off', !show);
    on('layout');
  };
  $('#hide-panel').addEventListener('click', () => setPanel($('#panel').classList.contains('collapsed')));
  $('#panel-toggle').addEventListener('click', () => setPanel(true));
  $('#scrim').addEventListener('click', () => setPanel(false));
  const plot = $('#plot'), pc = plot.getContext('2d');
  const sch = $('#schema'), sc = sch.getContext('2d');
  let clockTxt = '', kinds = '';

  // il riquadro della mappa: la lastra vista dall'alto, il nord in alto
  const MW = sch.width, MH = sch.height, k = Math.min((MW - 40) / PLATE.w, (MH - 40) / PLATE.d);
  const ox = (MW - PLATE.w * k) / 2, oy = (MH - PLATE.d * k) / 2;
  const PX = (x) => ox + (x + PLATE.w / 2) * k, PY = (z) => oy + (z + PLATE.d / 2) * k;

  return {
    refresh,
    sync() {
      const cond = !['bar', 'two', 'horse'].includes(state.src);
      const show = (cls, v) => document.querySelectorAll(cls).forEach((e) => { e.hidden = !v; });
      show('.only-two', state.src === 'two'); show('.only-cond', cond); show('.only-loop', state.src === 'loop'); show('.only-coil', state.src === 'coil');
      show('.only-probe', state.probe); show('.only-filings', state.filings);
      const list = state.src === 'wire' ? [['path', 'B e r'], ['inv', 'B e 1/r'], ['I', 'B e I']]
        : state.src === 'loop' ? [['path', 'sull\'asse'], ['I', 'B e I'], ['tan', 'tan θ e I']]
          : state.src === 'coil' ? [['path', 'sull\'asse'], ['I', 'B e I']] : [['path', 'lungo x']];
      const key = list.map((x) => x[0]).join();
      if (key !== kinds) {
        kinds = key; const host = $('#plot-kind'); host.innerHTML = '';
        for (const [kk, t] of list) { const b = document.createElement('button'); b.dataset.k = kk; b.textContent = t; b.addEventListener('click', () => { state.plotKind = kk; on('plotKind'); }); host.appendChild(b); }
      }
      if (!list.some((x) => x[0] === state.plotKind)) state.plotKind = list[0][0];
      document.querySelectorAll('#plot-kind button').forEach((b) => b.classList.toggle('on', b.dataset.k === state.plotKind));
      refresh('s');
    },
    togglePanel() { setPanel($('#panel').classList.contains('collapsed')); },
    setStatus(text, busy) { const s = $('#status'); if (s.textContent !== text) s.textContent = text; s.classList.toggle('busy', !!busy); },
    setFps(v) { $('#fps').textContent = v; },
    setClock(txt) { if (txt !== clockTxt) { clockTxt = txt; $('#clock').innerHTML = txt; } },
    setSide(a, b) { const x = $('#side1'), y = $('#side2'); if (x.innerHTML !== a) x.innerHTML = a; if (y.innerHTML !== b) y.innerHTML = b; },
    setPause(label) { const b = $('#pause'); if (b.textContent !== label) b.textContent = label; b.classList.toggle('on', label !== 'Pausa'); },
    setMetrics(cells) {
      const m = $('#metrics');
      if (m.children.length !== cells.length) m.innerHTML = cells.map(() => '<div class="cell"><div class="k"></div><div class="v"></div><div class="s"></div></div>').join('');
      cells.forEach((c, i) => { const el = m.children[i]; el.children[0].textContent = c.k; el.children[1].innerHTML = c.v; el.children[2].innerHTML = c.s || '&nbsp;'; el.title = c.title || ''; el.dataset.p = c.p || 1; });
    },
    boot() { $('#boot').classList.add('done'); setTimeout(() => $('#boot').remove(), 900); },
    layout() {
      const panel = $('#panel');
      const left = panel.classList.contains('collapsed') ? 0 : panel.getBoundingClientRect().right;
      const metrics = $('#metrics').getBoundingClientRect();
      return { left, metricsTop: metrics.height ? metrics.top : innerHeight };
    },

    /**
     * Lo sfondo della mappa: l'intensità del campo nel piano (scala logaritmica) e le linee di campo. Si rifà solo
     * quando cambia la sorgente. g: la griglia del campo, lines: le linee (Float32Array [x, z, |B|]…).
     */
    makeMap(g, lines) {
      const off = document.createElement('canvas'); off.width = MW; off.height = MH;
      const c = off.getContext('2d');
      c.fillStyle = '#f7f7f5'; c.fillRect(0, 0, MW, MH);
      const vals = [];
      for (let i = 0; i < g.nx * g.nz; i++) { const m = Math.hypot(g.b[i * 3], g.b[i * 3 + 2]); if (m > 0) vals.push(Math.log10(m)); }
      vals.sort((a, b) => a - b);
      const lo = vals[Math.floor(vals.length * 0.05)] ?? -6, hi = vals[Math.floor(vals.length * 0.98)] ?? -3;
      const img = c.createImageData(Math.ceil(PLATE.w * k), Math.ceil(PLATE.d * k));
      for (let py = 0; py < img.height; py++) for (let px = 0; px < img.width; px++) {
        const x = -PLATE.w / 2 + px / k, z = -PLATE.d / 2 + py / k;
        const i = Math.min(g.nx - 1, Math.max(0, Math.round((x - g.x0) / g.h))), j = Math.min(g.nz - 1, Math.max(0, Math.round((z - g.z0) / g.h)));
        const m = Math.hypot(g.b[(j * g.nx + i) * 3], g.b[(j * g.nx + i) * 3 + 2]);
        const t = Math.max(0, Math.min(1, (Math.log10(m || 1e-12) - lo) / (hi - lo)));
        const o = (py * img.width + px) * 4;
        img.data[o] = 247 - 120 * t; img.data[o + 1] = 247 - 80 * t; img.data[o + 2] = 245 - 10 * t; img.data[o + 3] = 255;
      }
      c.putImageData(img, Math.round(ox), Math.round(oy));
      c.strokeStyle = 'rgba(25,60,120,0.55)'; c.lineWidth = 1.6;
      for (const L of lines) { c.beginPath(); for (let i = 0; i < L.length; i += 3) { const x = PX(L[i]), y = PY(L[i + 1]); if (i) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke(); }
      c.strokeStyle = 'rgba(18,21,26,0.45)'; c.lineWidth = 2; c.strokeRect(ox, oy, PLATE.w * k, PLATE.d * k);
      return off;
    },
    /**
     * La mappa: sfondo, sorgente, bussole, sonda. d: { map, src, pair, I (con segno), compasses: [{x, z, a}], probe: {on, x, axis} }
     */
    drawMap(d) {
      sc.drawImage(d.map, 0, 0);
      const ink = '#2a2f36';
      // la sorgente
      const rect = (x0, z0, x1, z1, col) => { sc.fillStyle = col; sc.fillRect(PX(x0), PY(z0), (x1 - x0) * k, (z1 - z0) * k); };
      const letter = (t, x, z, col = '#ffffff') => { sc.fillStyle = col; sc.font = `700 22px ${MONO}`; sc.textAlign = 'center'; sc.textBaseline = 'middle'; sc.fillText(t, PX(x), PY(z) + 1); };
      sc.globalAlpha = 0.85;
      const barAt = (cx, dir) => { const h = MAG.L / 2, w = MAG.W / 2; rect(cx, -w, cx + dir * h, w, '#c62a1e'); rect(cx - dir * h, -w, cx, w, '#2a56b8'); letter('N', cx + dir * (h - 0.012), 0); letter('S', cx - dir * (h - 0.012), 0); };
      if (d.src === 'bar') barAt(0, 1);
      else if (d.src === 'two') { const off = MAG.L / 2 + 0.03; barAt(-off, 1); barAt(off, d.pair === 'same' ? -1 : 1); }
      else if (d.src === 'horse') {
        sc.strokeStyle = '#c62a1e'; sc.lineWidth = HORSE.w * k; sc.beginPath();
        sc.moveTo(PX(HORSE.x1), PY(HORSE.zc)); sc.lineTo(PX(HORSE.x0), PY(HORSE.zc)); sc.arc(PX(HORSE.x0), PY(0), HORSE.zc * k, Math.PI / 2, (3 * Math.PI) / 2, false); sc.lineTo(PX(HORSE.x1), PY(-HORSE.zc)); sc.stroke();
        letter('N', HORSE.x1 - 0.008, HORSE.zc); letter('S', HORSE.x1 - 0.008, -HORSE.zc);
      }
      sc.globalAlpha = 1;
      // i conduttori: ⊙ la corrente esce dalla lastra verso di noi, ⊗ ci entra
      const cross = (x, z, out) => {
        const X = PX(x), Y = PY(z), r = 10; sc.fillStyle = '#ffffff'; sc.strokeStyle = '#a8552c'; sc.lineWidth = 3;
        sc.beginPath(); sc.arc(X, Y, r, 0, Math.PI * 2); sc.fill(); sc.stroke();
        sc.fillStyle = sc.strokeStyle = ink; sc.lineWidth = 2.5;
        if (out) { sc.beginPath(); sc.arc(X, Y, 3, 0, Math.PI * 2); sc.fill(); } else { sc.beginPath(); sc.moveTo(X - 5, Y - 5); sc.lineTo(X + 5, Y + 5); sc.moveTo(X - 5, Y + 5); sc.lineTo(X + 5, Y - 5); sc.stroke(); }
      };
      const up = d.I >= 0;
      if (d.src === 'wire') cross(0, 0, up);
      else if (d.src === 'loop') { cross(0, LOOP.R, !up); cross(0, -LOOP.R, up); }
      else if (d.src === 'coil') {
        sc.strokeStyle = 'rgba(168,85,44,0.5)'; sc.lineWidth = 2; sc.strokeRect(PX(-COIL.len / 2), PY(-COIL.R), COIL.len * k, 2 * COIL.R * k);
        const N = d.nCoil;
        for (let i = 0; i < N; i += Math.max(1, Math.round(N / 8))) { const x = -COIL.len / 2 + (COIL.len * (i + 0.5)) / N; cross(x, COIL.R, !up); cross(x, -COIL.R, up); }
      }
      // le bussole
      for (const c of d.compasses) {
        const X = PX(c.x), Y = PY(c.z), r = 0.0118 * k;
        sc.fillStyle = 'rgba(255,255,255,0.92)'; sc.strokeStyle = ink; sc.lineWidth = 2; sc.beginPath(); sc.arc(X, Y, r, 0, Math.PI * 2); sc.fill(); sc.stroke();
        const dx = Math.cos(c.a), dy = -Math.sin(c.a), L = r * 0.85, w = r * 0.22;
        sc.fillStyle = '#c62a1e'; sc.beginPath(); sc.moveTo(X + dx * L, Y - dy * L); sc.lineTo(X - dy * w, Y - dx * w); sc.lineTo(X + dy * w, Y + dx * w); sc.closePath(); sc.fill();
        sc.fillStyle = '#9aa1ab'; sc.beginPath(); sc.moveTo(X - dx * L, Y + dy * L); sc.lineTo(X - dy * w, Y - dx * w); sc.lineTo(X + dy * w, Y + dx * w); sc.closePath(); sc.fill();
      }
      // la sonda: la retta su cui scorre e la punta
      if (d.probe.on) {
        sc.setLineDash([8, 6]); sc.strokeStyle = 'rgba(31,111,184,0.7)'; sc.lineWidth = 2; sc.beginPath(); sc.moveTo(PX(d.probe.x0), PY(0)); sc.lineTo(PX(PLATE.w / 2), PY(0)); sc.stroke(); sc.setLineDash([]);
        sc.fillStyle = '#3b3e44'; sc.fillRect(PX(d.probe.x), PY(0) - 3, (PLATE.w / 2 - d.probe.x) * k, 6);
        sc.fillStyle = '#1f6fb8'; sc.beginPath(); sc.arc(PX(d.probe.x), PY(0), 6, 0, Math.PI * 2); sc.fill();
        // la componente misurata
        const [ax, az] = d.probe.axis, X = PX(d.probe.x), Y = PY(0) - 16;
        sc.strokeStyle = sc.fillStyle = '#1f6fb8'; sc.lineWidth = 3; sc.beginPath(); sc.moveTo(X, Y); sc.lineTo(X + ax * 26, Y + az * 26); sc.stroke();
        sc.beginPath(); sc.arc(X + ax * 26, Y + az * 26, 4, 0, Math.PI * 2); sc.fill();
      }
      sc.fillStyle = ink; sc.font = `600 20px ${MONO}`; sc.textAlign = 'right'; sc.textBaseline = 'top';
      sc.fillText('N ↑', MW - 8, 6);
      sc.textAlign = 'left'; sc.fillStyle = '#6b7380'; sc.font = `500 18px ${MONO}`; sc.fillText('la lastra vista dall\'alto', 8, 6);
      sc.textBaseline = 'alphabetic';
    },

    /** Grafico. series: [{x, y, color, width, dash, alpha}]; points: [{x, y, color, r, ring}] */
    drawPlot({ series = [], points = [], X0, X1, Y0, Y1, xLabel, yLabel, legend }) {
      const W = plot.width, Hh = plot.height, padL = 70, padB = 40, padT = 18, padR = 16;
      pc.clearRect(0, 0, W, Hh); pc.fillStyle = '#f7f7f5'; pc.fillRect(0, 0, W, Hh);
      const xOf = (x) => padL + ((x - X0) / (X1 - X0)) * (W - padL - padR), yOf = (y) => Hh - padB - ((y - Y0) / (Y1 - Y0)) * (Hh - padT - padB);
      pc.font = `500 18px ${MONO}`; pc.fillStyle = '#6b7380';
      const xs = niceStep((X1 - X0) / Math.max(3, Math.round((W - padL - padR) / 145))), ys = niceStep((Y1 - Y0) / Math.max(3, Math.round((Hh - padT - padB) / 55)));
      const dec = (s) => (s < 0.01 ? 3 : s < 0.1 ? 2 : s < 1 ? 1 : 0);
      pc.textAlign = 'center';
      const xlw = pc.measureText(xLabel).width + 34;
      for (let x = Math.ceil(X0 / xs) * xs; x <= X1 + 1e-9; x += xs) {
        const px = xOf(x); pc.strokeStyle = Math.abs(x) < xs / 2 ? 'rgba(18,21,26,0.3)' : 'rgba(18,21,26,0.08)'; pc.beginPath(); pc.moveTo(px, padT); pc.lineTo(px, Hh - padB); pc.stroke();
        if (px < W - padR - xlw) pc.fillText(num(Math.abs(x) < xs / 2 ? 0 : x, dec(xs)), px, Hh - 12);
      }
      pc.textAlign = 'right';
      for (let y = Math.ceil(Y0 / ys) * ys; y <= Y1 + 1e-9; y += ys) {
        const py = yOf(y); pc.strokeStyle = Math.abs(y) < ys / 2 ? 'rgba(18,21,26,0.3)' : 'rgba(18,21,26,0.08)'; pc.beginPath(); pc.moveTo(padL, py); pc.lineTo(W - padR, py); pc.stroke();
        pc.fillText(num(Math.abs(y) < ys / 2 ? 0 : y, dec(ys)), padL - 8, py + 6);
      }
      pc.textAlign = 'left'; pc.fillStyle = '#9aa1ab'; pc.fillText(yLabel, padL + 6, padT + 14);
      pc.textAlign = 'right'; pc.fillText(xLabel, W - padR, Hh - 12);
      if (legend) { let lx = W - padR - 8; pc.font = `500 17px ${MONO}`; for (const [text, col] of legend.slice().reverse()) { const tw = pc.measureText(text).width; pc.fillStyle = col; pc.fillText(text, lx, padT + 14); lx -= tw + 22; } }
      pc.save(); pc.beginPath(); pc.rect(padL, padT - 4, W - padL - padR, Hh - padT - padB + 4); pc.clip();
      for (const s of series) {
        if (s.x.length < 2) continue;
        pc.strokeStyle = s.color; pc.lineWidth = s.width || 3; pc.globalAlpha = s.alpha ?? 1; pc.setLineDash(s.dash || []); pc.lineJoin = 'round';
        pc.beginPath(); let pen = false;
        for (let i = 0; i < s.x.length; i++) { if (!isFinite(s.y[i]) || !isFinite(s.x[i])) { pen = false; continue; } const px = xOf(s.x[i]), py = yOf(Math.max(Y0 - (Y1 - Y0), Math.min(Y1 + (Y1 - Y0), s.y[i]))); if (pen) pc.lineTo(px, py); else pc.moveTo(px, py); pen = true; }
        pc.stroke(); pc.setLineDash([]); pc.globalAlpha = 1;
      }
      for (const p of points) { pc.beginPath(); pc.arc(xOf(p.x), yOf(p.y), p.r || 6, 0, Math.PI * 2); pc.fillStyle = p.color; pc.fill(); if (p.ring) { pc.strokeStyle = p.ring; pc.lineWidth = 2.5; pc.stroke(); } }
      pc.restore();
      pc.strokeStyle = 'rgba(18,21,26,0.35)'; pc.beginPath(); pc.moveTo(padL - 0.5, padT); pc.lineTo(padL - 0.5, Hh - padB); pc.stroke();
    },
  };
}
