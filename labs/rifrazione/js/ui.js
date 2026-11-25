// ui.js — pannello dei controlli, riquadro delle misure (angoli, schema della superficie, grafico), fascia delle
// misure. Nessuna fisica qui.
import { createControls } from '../../../shared/js/controls.js';

const NF = [];
const num = (v, d = 1) => (NF[d] || (NF[d] = new Intl.NumberFormat('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }))).format(v);
export const fmt = { num, deg: (r, d = 1) => `${num((r * 180) / Math.PI, d)}°` };
const niceStep = (v) => { const p = 10 ** Math.floor(Math.log10(v)), f = v / p; return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p; };
const MONO = '"Geist Mono Variable", Consolas, monospace';

/** ctx: { presets, views, angRange(), angLabel(), angText(), levelText() } */
export function createUI(state, ctx, on) {
  const $ = (s, r = document) => r.querySelector(s);
  const { slider, toggle, seg, refresh } = createControls(state, on);

  seg('app', 'Apparato', [['tank', 'La vasca', 'Un acquario d\'acqua e un laser'], ['disc', 'Il disco ottico', 'Il disco graduato di Hartl con un mezzo cilindro trasparente']]);
  seg('color', 'Colore del laser', [['red', 'Rosso', '650 nm'], ['green', 'Verde', '532 nm'], ['violet', 'Viola', '405 nm']]);
  seg('mode', 'Il laser entra', [['top', 'Dall\'alto', 'Dall\'aria nell\'acqua'], ['side', 'Dal fianco', 'Dal vetro di lato, verso la superficie: dall\'acqua all\'aria'], ['fountain', 'Fontana', 'Nel getto d\'acqua che esce dal foro']]);
  seg('side', 'Il laser colpisce', [['flat', 'La parte piana', 'Dall\'aria al materiale'], ['curved', 'La parte curva', 'Il fascio attraversa il bordo curvo senza piegarsi e arriva alla faccia piana dall\'interno']]);
  slider('ang', { range: ctx.angRange, read: () => ctx.angGet(), write: (v) => ctx.angSet(v), label: ctx.angLabel, text: ctx.angText, disabled: () => state.app === 'tank' && state.mode === 'fountain' });
  seg('liquid', 'Liquido', [['water', 'Acqua'], ['alcohol', 'Alcol'], ['glycerin', 'Glicerina']]);
  slider('level', { range: () => [8, 20, 0.5], read: () => state.level, write: (v) => { state.level = v; }, label: () => 'Livello', text: ctx.levelText });
  toggle('oil', 'Uno strato d\'olio sopra', '2,5 cm d\'olio di semi, che galleggia');
  toggle('milk', 'Qualche goccia di latte', 'nel liquido: il fascio si vede');
  toggle('smoke', 'Fumo nell\'aria', 'il fascio si vede anche fuori dall\'acqua');
  seg('block', 'Mezzo cilindro di', [['water', 'Acqua', 'In una vaschetta semicircolare'], ['pmma', 'Plexiglas'], ['crown', 'Vetro crown'], ['flint', 'Vetro flint'], ['zirconia', 'Zirconia', 'Zirconia cubica: il «diamante» finto']], 3);
  slider('ambient', { range: () => [0, 1, 0.01], read: () => state.ambient, write: (v) => { state.ambient = v; }, label: () => 'Luce ambiente', text: () => (state.ambient < 0.03 ? 'buio' : `${Math.round(state.ambient * 100)} %`) });
  toggle('protractor', 'Goniometro sul vetro', 'centrato dove il fascio incontra la superficie');
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
  for (const id of ['go', 'note', 'clear', 'fullscreen']) $(`#${id}`).addEventListener('click', () => on(id));
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
  const sch = $('#schema'), sc = sch.getContext('2d');
  let clockTxt = '';

  return {
    refresh,
    sync() {
      const tank = state.app === 'tank';
      document.querySelectorAll('.only-tank').forEach((e) => { e.hidden = !tank; });
      document.querySelectorAll('.only-disc').forEach((e) => { e.hidden = tank; });
      document.querySelectorAll('#plot-kind button').forEach((b) => b.classList.toggle('on', b.dataset.k === state.plotKind));
    },
    togglePanel() { setPanel($('#panel').classList.contains('collapsed')); },
    setStatus(text, busy) { const s = $('#status'); if (s.textContent !== text) s.textContent = text; s.classList.toggle('busy', !!busy); },
    setFps(v) { $('#fps').textContent = v; },
    setClock(txt) { if (txt !== clockTxt) { clockTxt = txt; $('#clock').innerHTML = txt; } },
    setSide(a, b) { const x = $('#side1'), y = $('#side2'); if (x.innerHTML !== a) x.innerHTML = a; if (y.innerHTML !== b) y.innerHTML = b; },
    setGo(label, lit) { const s = $('#go span'); if (s.textContent !== label) s.textContent = label; $('#go').classList.toggle('lit', !!lit); },
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
     * Lo schema della superficie, come sul libro: la normale, il fascio che arriva, quello riflesso, quello rifratto,
     * gli angoli. d: { th1, th2|null, R, fromAbove, m1, m2, n1, n2, color: css, crit|null, empty: testo }
     */
    drawSchema(d) {
      const W = sch.width, H = sch.height, cx = W / 2, cy = H / 2, L = Math.min(W, H) * 0.44;
      sc.fillStyle = '#f7f7f5'; sc.fillRect(0, 0, W, H);
      if (!d || d.empty) {
        sc.fillStyle = '#9aa1ab'; sc.font = `500 22px ${MONO}`; sc.textAlign = 'center'; sc.textBaseline = 'middle';
        sc.fillText(d && d.empty ? d.empty : '', cx, cy); return;
      }
      const up = d.fromAbove;
      // i due mezzi
      sc.fillStyle = up ? '#eef4f8' : '#dfeaf0'; sc.fillRect(0, 0, W, cy);
      sc.fillStyle = up ? '#dfeaf0' : '#eef4f8'; sc.fillRect(0, cy, W, H - cy);
      const dens = (n) => Math.min(1, (n - 1) / 1.3);
      sc.fillStyle = `rgba(60,110,150,${0.05 + 0.18 * dens(up ? d.n2 : d.n1)})`; sc.fillRect(0, cy, W, H - cy);
      sc.fillStyle = `rgba(60,110,150,${0.05 + 0.18 * dens(up ? d.n1 : d.n2)})`; sc.fillRect(0, 0, W, cy);
      sc.strokeStyle = 'rgba(18,21,26,0.6)'; sc.lineWidth = 2; sc.beginPath(); sc.moveTo(0, cy); sc.lineTo(W, cy); sc.stroke();
      sc.setLineDash([10, 8]); sc.strokeStyle = 'rgba(18,21,26,0.45)'; sc.beginPath(); sc.moveTo(cx, 12); sc.lineTo(cx, H - 12); sc.stroke(); sc.setLineDash([]);
      sc.font = `600 20px ${MONO}`; sc.fillStyle = '#3a3f46'; sc.textAlign = 'left'; sc.textBaseline = 'alphabetic';
      const top = up ? [d.m1, d.n1] : [d.m2, d.n2], bot = up ? [d.m2, d.n2] : [d.m1, d.n1];
      sc.fillText(`${top[0]} · n = ${num(top[1], 3)}`, 14, 30); sc.fillText(`${bot[0]} · n = ${num(bot[1], 3)}`, 14, H - 14);
      const s = up ? -1 : 1;        // verso del fascio che arriva lungo y dello schermo
      // fascio incidente, dal lato da cui viene
      const ray = (ang, side, len, alpha, width, arrow) => {
        const ex = cx + Math.sin(ang) * len * side.x, ey = cy + Math.cos(ang) * len * side.y;
        sc.strokeStyle = d.color; sc.globalAlpha = alpha; sc.lineWidth = width; sc.beginPath(); sc.moveTo(cx, cy); sc.lineTo(ex, ey); sc.stroke();
        if (arrow) {
          const mx = (cx + ex) / 2, my = (cy + ey) / 2, ux = (ex - cx) / len, uy = (ey - cy) / len, dirSign = arrow;
          sc.fillStyle = d.color; sc.beginPath();
          sc.moveTo(mx + ux * 9 * dirSign, my + uy * 9 * dirSign); sc.lineTo(mx - uy * 7 - ux * 7 * dirSign, my + ux * 7 - uy * 7 * dirSign); sc.lineTo(mx + uy * 7 - ux * 7 * dirSign, my - ux * 7 - uy * 7 * dirSign); sc.fill();
        }
        sc.globalAlpha = 1;
      };
      // incidente: arriva da sinistra, dal lato del mezzo 1 (in alto se dall'alto)
      ray(d.th1, { x: -1, y: s }, L, 1, 5, -1);
      // riflesso: dall'altra parte della normale, nello stesso mezzo
      ray(d.th1, { x: 1, y: s }, L, d.th2 === null ? 1 : Math.max(0.18, Math.sqrt(d.R)), d.th2 === null ? 5 : 3, 1);
      // rifratto
      if (d.th2 !== null) ray(d.th2, { x: 1, y: -s }, L, Math.sqrt(1 - d.R), 5, 1);
      // angoli
      const arc = (a0, a1, r, col, label, side) => {
        sc.strokeStyle = col; sc.lineWidth = 2.5; sc.beginPath(); sc.arc(cx, cy, r, a0, a1, a1 < a0); sc.stroke();
        const am = (a0 + a1) / 2; sc.fillStyle = col; sc.font = `600 22px ${MONO}`; sc.textAlign = 'center'; sc.textBaseline = 'middle';
        sc.fillText(label, cx + Math.cos(am) * (r + 26) + (side || 0), cy + Math.sin(am) * (r + 22));
      };
      const nUp = -Math.PI / 2, nDn = Math.PI / 2;
      const n1 = up ? nUp : nDn, n2 = up ? nDn : nUp;
      arc(n1, n1 + (up ? -1 : 1) * d.th1, 62, '#15181c', `θ₁ ${fmt.deg(d.th1)}`, -30);
      if (d.th2 !== null) arc(n2, n2 + (up ? -1 : 1) * d.th2, 78, '#e8452c', `θ₂ ${fmt.deg(d.th2)}`, 30);
      else {
        sc.fillStyle = '#e8452c'; sc.font = `600 22px ${MONO}`; sc.textAlign = 'right'; sc.fillText('riflessione totale', W - 14, up ? H - 40 : 40);
      }
      if (d.crit !== null && d.crit !== undefined) {
        sc.setLineDash([6, 6]); sc.strokeStyle = 'rgba(232,69,44,0.55)'; sc.lineWidth = 2;
        for (const sx of [-1, 1]) { sc.beginPath(); sc.moveTo(cx, cy); sc.lineTo(cx + sx * Math.sin(d.crit) * L * 0.9, cy + s * Math.cos(d.crit) * L * 0.9); sc.stroke(); }
        sc.setLineDash([]);
        sc.fillStyle = 'rgba(232,69,44,0.8)'; sc.font = `500 18px ${MONO}`; sc.textAlign = 'right';
        sc.fillText(`angolo limite ${fmt.deg(d.crit)}`, W - 14, up ? 30 : H - 14);
      }
    },

    /** Grafico. series: [{x, y, color, width, alpha, dash}]; points: [{x, y, color, r, ring}]; vlines; bands: [{x0, x1, color}] */
    drawPlot({ series = [], points = [], vlines = [], bands = [], X0, X1, Y0, Y1, xLabel, yLabel, legend, xDeg = false, yDeg = false }) {
      const W = plot.width, Hh = plot.height, padL = 70, padB = 40, padT = 18, padR = 16;
      pc.clearRect(0, 0, W, Hh); pc.fillStyle = '#f7f7f5'; pc.fillRect(0, 0, W, Hh);
      const xOf = (x) => padL + ((x - X0) / (X1 - X0)) * (W - padL - padR), yOf = (y) => Hh - padB - ((y - Y0) / (Y1 - Y0)) * (Hh - padT - padB);
      pc.font = `500 18px ${MONO}`; pc.fillStyle = '#6b7380';
      const xs = niceStep((X1 - X0) / Math.max(3, Math.round((W - padL - padR) / 120))), ys = niceStep((Y1 - Y0) / Math.max(3, Math.round((Hh - padT - padB) / 55)));
      const dec = (s) => (s < 0.01 ? 3 : s < 0.1 ? 2 : s < 1 ? 1 : 0);
      for (const b of bands) { pc.fillStyle = b.color; pc.fillRect(xOf(b.x0), padT, xOf(b.x1) - xOf(b.x0), Hh - padT - padB); if (b.text) { pc.fillStyle = b.textColor || '#b03a2a'; pc.textAlign = 'center'; pc.font = `500 16px ${MONO}`; pc.fillText(b.text, (xOf(b.x0) + xOf(b.x1)) / 2, padT + 36); pc.font = `500 18px ${MONO}`; } }
      pc.fillStyle = '#6b7380'; pc.textAlign = 'center';
      const xlw = pc.measureText(xLabel).width + 34;
      for (let x = Math.ceil(X0 / xs) * xs; x <= X1 + 1e-9; x += xs) {
        const px = xOf(x);
        pc.strokeStyle = 'rgba(18,21,26,0.08)'; pc.beginPath(); pc.moveTo(px, padT); pc.lineTo(px, Hh - padB); pc.stroke();
        if (px < W - padR - xlw) pc.fillText(`${num(Math.abs(x) < xs / 2 ? 0 : x, dec(xs))}${xDeg ? '°' : ''}`, px, Hh - 12);
      }
      pc.textAlign = 'right';
      for (let y = Math.ceil(Y0 / ys) * ys; y <= Y1 + 1e-9; y += ys) {
        const py = yOf(y);
        pc.strokeStyle = 'rgba(18,21,26,0.08)'; pc.beginPath(); pc.moveTo(padL, py); pc.lineTo(W - padR, py); pc.stroke();
        pc.fillText(`${num(Math.abs(y) < ys / 2 ? 0 : y, dec(ys))}${yDeg ? '°' : ''}`, padL - 8, py + 6);
      }
      pc.textAlign = 'left'; pc.fillStyle = '#9aa1ab'; pc.fillText(yLabel, padL + 6, padT + 14);
      pc.textAlign = 'right'; pc.fillText(xLabel, W - padR, Hh - 12);
      if (legend) {
        let lx = W - padR - 8; pc.font = `500 17px ${MONO}`;
        for (const [text, col] of legend.slice().reverse()) { const tw = pc.measureText(text).width; pc.fillStyle = col; pc.fillText(text, lx, padT + 14); lx -= tw + 22; }
      }
      pc.save(); pc.beginPath(); pc.rect(padL, padT - 4, W - padL - padR, Hh - padT - padB + 4); pc.clip();
      for (const s of series) {
        if (s.x.length < 2) continue;
        pc.strokeStyle = s.color; pc.lineWidth = s.width || 3; pc.globalAlpha = s.alpha ?? 1; pc.setLineDash(s.dash || []); pc.lineJoin = 'round';
        pc.beginPath(); let pen = false;
        for (let i = 0; i < s.x.length; i++) { if (!isFinite(s.y[i])) { pen = false; continue; } const px = xOf(s.x[i]), py = yOf(s.y[i]); if (pen) pc.lineTo(px, py); else pc.moveTo(px, py); pen = true; }
        pc.stroke(); pc.setLineDash([]); pc.globalAlpha = 1;
      }
      for (const v of vlines) { pc.strokeStyle = v.color; pc.lineWidth = v.width || 2; pc.setLineDash(v.dash || []); pc.beginPath(); pc.moveTo(xOf(v.x), padT); pc.lineTo(xOf(v.x), Hh - padB); pc.stroke(); pc.setLineDash([]); }
      for (const p of points) { pc.beginPath(); pc.arc(xOf(p.x), yOf(p.y), p.r || 6, 0, Math.PI * 2); pc.fillStyle = p.color; pc.fill(); if (p.ring) { pc.strokeStyle = p.ring; pc.lineWidth = 2.5; pc.stroke(); } }
      pc.restore();
      pc.strokeStyle = 'rgba(18,21,26,0.35)'; pc.beginPath(); pc.moveTo(padL - 0.5, padT); pc.lineTo(padL - 0.5, Hh - padB); pc.stroke();
    },
  };
}
