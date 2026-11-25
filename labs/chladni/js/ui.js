// ui.js — pannello dei controlli, riquadro del generatore (frequenza, figura prevista, grafico), fascia delle
// misure. Nessuna fisica qui.
import { createControls } from '../../../shared/js/controls.js';

const NF = [];
const num = (v, d = 1) => (NF[d] || (NF[d] = new Intl.NumberFormat('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }))).format(v);
const NOTES = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
export const fmt = {
  num,
  /** «523,3 Hz» o «2,415 kHz». */
  hz(f, html = false) {
    const sm = (u) => (html ? `<small>${u}</small>` : ` ${u}`);
    if (f >= 10000) return `${num(f / 1000, 2)}${sm('kHz')}`;
    if (f >= 1000) return `${num(f / 1000, 3)}${sm('kHz')}`;
    return `${num(f, f < 100 ? 2 : 1)}${sm('Hz')}`;
  },
  /** La nota più vicina, con lo scarto in cent (La4 = 440 Hz). */
  note(f) {
    if (!(f > 0)) return '';
    const m = 69 + 12 * Math.log2(f / 440), k = Math.round(m), c = Math.round((m - k) * 100);
    return `${NOTES[((k % 12) + 12) % 12]}${Math.floor(k / 12) - 1}${c ? ` ${c > 0 ? '+' : '−'}${Math.abs(c)} c` : ''}`;
  },
  cm(m) { return `${num(m * 100, m < 0.1 ? 1 : 0)} cm`; },
};
const niceStep = (v) => { const p = 10 ** Math.floor(Math.log10(v)), f = v / p; return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p; };

/** ctx: { presets, views, text: {f, amp, h, size, bowPos, fingerPos, pressure, grains}, fRange() } */
export function createUI(state, ctx, on) {
  const $ = (s, r = document) => r.querySelector(s);
  const { slider, toggle, seg, refresh } = createControls(state, on);
  const T = ctx.text;

  seg('shape', 'Forma', [['square', 'Quadrata'], ['circle', 'Rotonda'], ['rect', 'Rettangolare'], ['guitar', 'Chitarra']], 2);
  seg('mat', 'Materiale', [['al', 'Alluminio', 'Alluminio verniciato di nero'], ['brass', 'Ottone'], ['steel', 'Acciaio'], ['glass', 'Vetro', 'Il vetro di Chladni']]);
  slider('h', { range: () => [0.5, 3, 0.1], read: () => state.h, write: (v) => { state.h = v; }, label: () => 'Spessore', text: T.h });
  slider('size', { range: () => [16, 40, 1], read: () => state.size, write: (v) => { state.size = v; }, label: () => (state.shape === 'circle' ? 'Diametro' : 'Lunghezza'), text: T.size });
  seg('exc', 'Eccitazione', [['shaker', 'Vibratore', 'Il vibratore meccanico, comandato dal generatore di funzioni'], ['bow', 'Archetto', 'Il metodo di Chladni: lamina stretta al centro, archetto sul bordo']]);
  slider('f', { range: () => { const [a, b] = ctx.fRange(); return [Math.log10(a), Math.log10(b), 0.0004]; }, read: () => Math.log10(state.f), write: (v) => { state.f = 10 ** v; }, label: () => 'Frequenza', text: T.f });
  slider('amp', { range: () => [0, 1, 0.01], read: () => state.amp, write: (v) => { state.amp = v; }, label: () => 'Ampiezza', text: T.amp });
  toggle('sweep', 'Spazzolata lenta', 'la frequenza sale da sola e si attarda sulle risonanze');
  seg('mount', 'Foro di fissaggio', [['center', 'Al centro'], ['off', 'Decentrato', 'Fuori centro si eccitano anche i modi che al centro hanno un nodo']]);
  slider('bowPos', { range: () => [0, 1, 0.0025], read: () => state.bowPos, write: (v) => { state.bowPos = v; }, label: () => 'Archetto sul bordo', text: T.bowPos });
  toggle('finger', 'Il dito sul bordo', 'smorza i modi che sotto il dito si muovono');
  slider('fingerPos', { range: () => [0, 1, 0.0025], read: () => state.fingerPos, write: (v) => { state.fingerPos = v; }, label: () => 'Dito sul bordo', text: T.fingerPos, disabled: () => !state.finger });
  slider('pressure', { range: () => [0, 1, 0.01], read: () => state.pressure, write: (v) => { state.pressure = v; }, label: () => 'Archetto', text: T.pressure });
  seg('powder', 'Granelli', [['sand', 'Sabbia'], ['salt', 'Sale fino'], ['lyco', 'Licopodio', 'Polvere finissima: va ai ventri'], ['mix', 'Sabbia e licopodio', 'L\'esperimento di Faraday']], 2);
  slider('grains', { range: () => [4000, 48000, 1000], read: () => state.grains, write: (v) => { state.grains = v; }, label: () => 'Quantità', text: T.grains });
  toggle('vib', 'Vibrazione visibile', 'esagerata migliaia di volte e rallentata, come con uno stroboscopio');
  toggle('map', 'Mappa dell\'ampiezza', 'rosso e blu: le zone che si muovono in versi opposti');
  toggle('lines', 'Linee nodali previste', 'dove la lamina non si muove');
  toggle('sound', 'Suono', 'la nota della lamina');
  toggle('outline', 'Contorno', 'evidenzia la lamina che vibra');
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
  for (const id of ['go', 'pause', 'prev', 'next', 'sprinkle', 'fullscreen', 'clear']) $(`#${id}`).addEventListener('click', () => on(id));
  $('#sprinkle2').addEventListener('click', () => on('sprinkle'));
  document.querySelectorAll('#plot-kind button').forEach((b) => b.addEventListener('click', () => { state.plotKind = b.dataset.k; on('plotKind'); }));
  const setPanel = (show) => {
    $('#panel').classList.toggle('collapsed', !show);
    document.body.classList.toggle('panel-off', !show);
    on('layout');
  };
  $('#hide-panel').addEventListener('click', () => setPanel($('#panel').classList.contains('collapsed')));
  $('#panel-toggle').addEventListener('click', () => setPanel(true));
  $('#scrim').addEventListener('click', () => setPanel(false));

  const plot = $('#plot'), pc = plot.getContext('2d');
  const fig = $('#figure'), fc = fig.getContext('2d');
  let clockTxt = '', figMap = null;
  // clic sulla figura: archetto (sinistro) e dito (destro)
  const figPoint = (e) => {
    if (!figMap) return null;
    const r = fig.getBoundingClientRect(), sx = ((e.clientX - r.left) / r.width) * fig.width, sy = ((e.clientY - r.top) / r.height) * fig.height;
    return [(sx - figMap.cx) / figMap.s, -(sy - figMap.cy) / figMap.s];
  };
  fig.addEventListener('click', (e) => { const p = figPoint(e); if (p) on('figClick', { p, right: false }); });
  fig.addEventListener('contextmenu', (e) => { e.preventDefault(); const p = figPoint(e); if (p) on('figClick', { p, right: true }); });

  return {
    refresh,
    sync() {
      document.querySelectorAll('#plot-kind button').forEach((b) => b.classList.toggle('on', b.dataset.k === state.plotKind));
      $('#grp-shaker').hidden = state.exc !== 'shaker';
      $('#grp-bow').hidden = state.exc !== 'bow';
      $('#live-title').textContent = state.exc === 'shaker' ? 'Il generatore' : 'L\'archetto';
      $('#prev').hidden = $('#next').hidden = state.exc !== 'shaker';
      $('#go').title = state.exc === 'shaker' ? 'Accende o spegne il generatore (barra spaziatrice)' : 'Passa l\'archetto sul bordo, o fermalo (barra spaziatrice)';
    },
    togglePanel() { setPanel($('#panel').classList.contains('collapsed')); },
    setStatus(text, busy) { const s = $('#status'); if (s.textContent !== text) s.textContent = text; s.classList.toggle('busy', !!busy); },
    setFps(v) { $('#fps').textContent = v; },
    setClock(txt) { if (txt !== clockTxt) { clockTxt = txt; $('#clock').innerHTML = txt; } },
    setSide(a, b) { const x = $('#side1'), y = $('#side2'); if (x.innerHTML !== a) x.innerHTML = a; if (y.innerHTML !== b) y.innerHTML = b; },
    setGo(label, lit) { const s = $('#go span'); if (s.textContent !== label) s.textContent = label; $('#go').classList.toggle('lit', !!lit); },
    setPause(label, enabled) { const b = $('#pause'); if (b.textContent !== label) b.textContent = label; b.disabled = !enabled; b.classList.toggle('on', label !== 'Pausa'); },
    setMetrics(cells) {
      const m = $('#metrics');
      if (m.children.length !== cells.length) m.innerHTML = cells.map(() => '<div class="cell"><div class="k"></div><div class="v"></div><div class="s"></div></div>').join('');
      cells.forEach((c, i) => { const el = m.children[i]; el.children[0].textContent = c.k; el.children[1].innerHTML = c.v; el.children[2].innerHTML = c.s || '&nbsp;'; el.title = c.title || ''; el.dataset.p = c.p || 1; });
    },
    boot() { $('#boot').classList.add('done'); setTimeout(() => $('#boot').remove(), 900); },
    bootText(t) { const p = $('#boot p'); if (p) p.firstChild.textContent = t; },
    layout() {
      const panel = $('#panel');
      const left = panel.classList.contains('collapsed') ? 0 : panel.getBoundingClientRect().right;
      const metrics = $('#metrics').getBoundingClientRect();
      return { left, metricsTop: metrics.height ? metrics.top : innerHeight };
    },

    /**
     * La figura prevista. d: { img (ImageData della griglia), gx, gy, x0, y0, h (passo), gmax, outline [[x,y]…],
     * lines [[x0,y0,x1,y1]…], mount [x,y] | null, bow {x,y,nx,ny} | null, finger {x,y} | null, note (testo) }
     */
    drawFigure(d) {
      const W = fig.width, H = fig.height, pad = 22;
      const s = Math.min((W - 2 * pad) / 2, (H - 2 * pad) / (2 * d.gmax)), cx = W / 2, cy = H / 2;
      figMap = { s, cx, cy };
      fc.fillStyle = '#16181b'; fc.fillRect(0, 0, W, H);
      const path = new Path2D();
      d.outline.forEach(([x, y], i) => (i ? path.lineTo(cx + x * s, cy - y * s) : path.moveTo(cx + x * s, cy - y * s)));
      path.closePath();
      if (d.img) {
        if (!this._off || this._off.width !== d.gx || this._off.height !== d.gy) { this._off = document.createElement('canvas'); this._off.width = d.gx; this._off.height = d.gy; }
        this._off.getContext('2d').putImageData(d.img, 0, 0);
        fc.save(); fc.clip(path);
        fc.imageSmoothingEnabled = true; fc.imageSmoothingQuality = 'high';
        // l'immagine ha le righe dal basso (y crescente): si capovolge
        const x0 = cx + (d.x0 - d.h / 2) * s, w = d.gx * d.h * s, hgt = d.gy * d.h * s, yTop = cy - (d.y0 + (d.gy - 0.5) * d.h) * s;
        fc.translate(0, yTop + hgt); fc.scale(1, -1);
        fc.drawImage(this._off, x0, 0, w, hgt);
        fc.restore();
      }
      if (d.lines && d.lines.length) {
        fc.save(); fc.clip(path);
        fc.strokeStyle = 'rgba(232,69,44,0.95)'; fc.lineWidth = 2; fc.beginPath();
        for (const q of d.lines) { fc.moveTo(cx + q[0] * s, cy - q[1] * s); fc.lineTo(cx + q[2] * s, cy - q[3] * s); }
        fc.stroke(); fc.restore();
      }
      fc.strokeStyle = 'rgba(220,224,230,0.55)'; fc.lineWidth = 2; fc.stroke(path);
      if (d.mount) {
        const X = cx + d.mount[0] * s, Y = cy - d.mount[1] * s;
        fc.fillStyle = '#c3c8ce'; fc.beginPath(); fc.arc(X, Y, 7, 0, Math.PI * 2); fc.fill();
        fc.fillStyle = '#16181b'; fc.beginPath(); fc.arc(X, Y, 3, 0, Math.PI * 2); fc.fill();
      }
      if (d.clamp) { fc.fillStyle = '#8d949c'; fc.beginPath(); fc.arc(cx, cy, 9, 0, Math.PI * 2); fc.fill(); }
      if (d.bow) {
        const X = cx + d.bow.x * s, Y = cy - d.bow.y * s, nx = d.bow.nx, ny = -d.bow.ny;
        fc.strokeStyle = '#e8452c'; fc.lineWidth = 6; fc.lineCap = 'round';
        fc.beginPath(); fc.moveTo(X + nx * 6 - ny * 16, Y + ny * 6 + nx * 16); fc.lineTo(X + nx * 6 + ny * 16, Y + ny * 6 - nx * 16); fc.stroke();
        fc.font = '600 18px "Geist Mono Variable", Consolas, monospace'; fc.fillStyle = '#ff8a73'; fc.textAlign = 'center'; fc.textBaseline = 'middle';
        fc.fillText('archetto', Math.min(W - 50, Math.max(50, X + nx * 34)), Math.min(H - 12, Math.max(12, Y + ny * 22)));
      }
      if (d.finger) {
        const X = cx + d.finger.x * s, Y = cy - d.finger.y * s;
        fc.fillStyle = '#e2a98a'; fc.strokeStyle = '#7a4a33'; fc.lineWidth = 2; fc.beginPath(); fc.arc(X, Y, 8, 0, Math.PI * 2); fc.fill(); fc.stroke();
        fc.font = '600 18px "Geist Mono Variable", Consolas, monospace'; fc.fillStyle = '#f0c3a8'; fc.textAlign = 'center'; fc.textBaseline = 'middle';
        fc.fillText('dito', Math.min(W - 30, Math.max(30, X + d.finger.nx * 30)), Math.min(H - 12, Math.max(12, Y - d.finger.ny * 22)));
      }
      fc.font = '600 17px "Geist Mono Variable", Consolas, monospace'; fc.fillStyle = 'rgba(220,224,230,0.6)'; fc.textAlign = 'left'; fc.textBaseline = 'alphabetic';
      fc.fillText('LA FIGURA PREVISTA', 14, 26);
      if (d.note) {
        fc.font = '500 18px "Geist Mono Variable", Consolas, monospace'; fc.fillStyle = 'rgba(220,224,230,0.75)';
        fc.fillText(d.note, 14, H - 12);
      }
    },

    /**
     * Grafico. series: [{x, y, color, width, alpha, dash}]; points: [{x, y, color, r}]; stems: [{x, y, color, w}];
     * vlines: [{x, color, dash}]; xLog/yLog: assi logaritmici.
     */
    drawPlot({ series = [], points = [], stems = [], vlines = [], hlines = [], X0, X1, Y0, Y1, xLog = false, yLog = false, xLabel, yLabel, legend, texts = [] }) {
      const W = plot.width, Hh = plot.height, padL = 70, padB = 40, padT = 18, padR = 16;
      pc.clearRect(0, 0, W, Hh); pc.fillStyle = '#f7f7f5'; pc.fillRect(0, 0, W, Hh);
      const tx = (x) => (xLog ? Math.log10(x) : x), ty = (y) => (yLog ? Math.log10(Math.max(y, 1e-12)) : y);
      const a0 = tx(X0), a1 = tx(X1), b0 = ty(Y0), b1 = ty(Y1);
      const xOf = (x) => padL + ((tx(x) - a0) / (a1 - a0)) * (W - padL - padR), yOf = (y) => Hh - padB - ((ty(y) - b0) / (b1 - b0)) * (Hh - padT - padB);
      pc.font = '500 18px "Geist Mono Variable", Consolas, monospace'; pc.fillStyle = '#6b7380';
      const ticks = (lo, hi, log, px) => {
        if (!log) { const st = niceStep((hi - lo) / Math.max(3, Math.round(px / 120))), out = []; for (let v = Math.ceil(lo / st) * st; v <= hi + 1e-9; v += st) out.push([v, true, st]); return out; }
        const out = [], dec = Math.log10(hi / lo), ms = dec > 4.5 || (dec > 2.6 && px < 200) ? [1] : dec > 2.2 ? [1, 3] : [1, 2, 5];
        for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) for (const m of ms) { const v = m * 10 ** e; if (v >= lo * 0.999 && v <= hi * 1.001) out.push([v, true, v]); }
        return out;
      };
      const lab = (v, st) => (v >= 1000 ? `${num(v / 1000, v % 1000 ? 1 : 0)} k` : num(v, st < 0.01 ? 3 : st < 0.1 ? 2 : st < 1 ? 1 : 0));
      pc.textAlign = 'center';
      const xlw = pc.measureText(xLabel).width + 34;
      for (const [x, , st] of ticks(X0, X1, xLog, W - padL - padR)) {
        const px = xOf(x);
        pc.strokeStyle = 'rgba(18,21,26,0.08)'; pc.beginPath(); pc.moveTo(px, padT); pc.lineTo(px, Hh - padB); pc.stroke();
        if (px < W - padR - xlw) pc.fillText(lab(x, st), px, Hh - 12);
      }
      pc.textAlign = 'right';
      for (const [y, , st] of ticks(Y0, Y1, yLog, Hh - padT - padB)) {
        const py = yOf(y);
        pc.strokeStyle = 'rgba(18,21,26,0.08)'; pc.beginPath(); pc.moveTo(padL, py); pc.lineTo(W - padR, py); pc.stroke();
        pc.fillText(lab(y, st), padL - 8, py + 6);
      }
      pc.textAlign = 'left'; pc.fillStyle = '#9aa1ab'; pc.fillText(yLabel, padL + 6, padT + 14);
      pc.textAlign = 'right'; pc.fillText(xLabel, W - padR, Hh - 12);
      if (legend) {
        let lx = W - padR - 8; pc.font = '500 17px "Geist Mono Variable", Consolas, monospace';
        for (const [text, col] of legend.slice().reverse()) { const tw = pc.measureText(text).width; pc.fillStyle = col; pc.fillText(text, lx, padT + 14); lx -= tw + 22; }
      }
      pc.save(); pc.beginPath(); pc.rect(padL, padT - 4, W - padL - padR, Hh - padT - padB + 4); pc.clip();
      for (const h of hlines) { pc.strokeStyle = h.color; pc.lineWidth = 1.6; pc.setLineDash(h.dash || []); pc.beginPath(); pc.moveTo(padL, yOf(h.y)); pc.lineTo(W - padR, yOf(h.y)); pc.stroke(); pc.setLineDash([]); if (h.text) { pc.fillStyle = h.color; pc.textAlign = 'left'; pc.font = '500 16px "Geist Mono Variable", Consolas, monospace'; pc.fillText(h.text, padL + 8, yOf(h.y) - 6); } }
      for (const s of stems) { pc.strokeStyle = s.color; pc.lineWidth = s.w || 3; pc.beginPath(); pc.moveTo(xOf(s.x), yOf(Y0)); pc.lineTo(xOf(s.x), yOf(s.y)); pc.stroke(); pc.fillStyle = s.color; pc.beginPath(); pc.arc(xOf(s.x), yOf(s.y), (s.w || 3) + 1.5, 0, Math.PI * 2); pc.fill(); }
      for (const s of series) {
        if (s.x.length < 2) continue;
        pc.strokeStyle = s.color; pc.lineWidth = s.width || 3; pc.globalAlpha = s.alpha ?? 1; pc.setLineDash(s.dash || []); pc.lineJoin = 'round';
        pc.beginPath();
        let pen = false;
        for (let i = 0; i < s.x.length; i++) {
          if (!isFinite(s.y[i])) { pen = false; continue; }
          const px = xOf(s.x[i]), py = yOf(s.y[i]);
          if (pen) pc.lineTo(px, py); else pc.moveTo(px, py);
          pen = true;
        }
        pc.stroke(); pc.setLineDash([]); pc.globalAlpha = 1;
      }
      for (const v of vlines) { pc.strokeStyle = v.color; pc.lineWidth = v.width || 2; pc.setLineDash(v.dash || []); pc.beginPath(); pc.moveTo(xOf(v.x), padT); pc.lineTo(xOf(v.x), Hh - padB); pc.stroke(); pc.setLineDash([]); }
      for (const p of points) { pc.beginPath(); pc.arc(xOf(p.x), yOf(p.y), p.r || 6, 0, Math.PI * 2); pc.fillStyle = p.color; pc.fill(); if (p.ring) { pc.strokeStyle = p.ring; pc.lineWidth = 2.5; pc.stroke(); } }
      pc.font = '500 16px "Geist Mono Variable", Consolas, monospace';
      for (const t of texts) { pc.fillStyle = t.color || '#3a3f46'; pc.textAlign = t.align || 'left'; pc.fillText(t.text, xOf(t.x) + (t.dx || 0), yOf(t.y) + (t.dy || 0)); }
      pc.restore();
      pc.strokeStyle = 'rgba(18,21,26,0.35)'; pc.beginPath(); pc.moveTo(padL - 0.5, padT); pc.lineTo(padL - 0.5, Hh - padB); pc.stroke();
    },
  };
}
