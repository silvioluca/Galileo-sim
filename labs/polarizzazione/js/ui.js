// ui.js — pannello dei controlli, riquadro (lo schema dell'esperienza, il grafico), fascia delle misure. Nessuna fisica qui.
import { createControls } from '../../../shared/js/controls.js';
import { displayRGB, cssRGB } from '../../../shared/js/color.js';

const NF = [];
const num = (v, d = 1) => (NF[d] || (NF[d] = new Intl.NumberFormat('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }))).format(v);
export const fmt = { num };
const niceStep = (v) => { const p = 10 ** Math.floor(Math.log10(v)), f = v / p; return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p; };
const MONO = '"Geist Mono Variable", Consolas, monospace';
const D2R = Math.PI / 180;
const deg = (v, d = 0) => `${num(v, d)}°`;

export function createUI(state, ctx, on) {
  const $ = (s, r = document) => r.querySelector(s);
  const { slider, toggle, seg, refresh } = createControls(state, on);

  seg('exp', 'Esperienza', [['bench', 'Banco ottico', 'polarizzatori, lamine, zucchero: la legge di Malus'], ['brewster', 'Brewster', 'la luce riflessa da un vetro è polarizzata'], ['photo', 'Fotoelasticità', 'gli sforzi in un disco compresso, fra polarizzatori incrociati']]);
  // il banco
  seg('src', 'Sorgente', [['lamp', 'Lampada', 'luce bianca, non polarizzata'], ['red', 'Laser rosso', '650 nm, polarizzato in verticale'], ['green', 'Laser verde', '532 nm, polarizzato in verticale']]);
  toggle('useP', 'Polarizzatore', 'il primo filtro, dopo la sorgente');
  slider('p1', { range: () => [0, 180, 0.5], read: () => state.p1, write: (v) => { state.p1 = v; }, label: () => 'Asse del polarizzatore', text: () => deg(state.p1, state.p1 % 1 ? 1 : 0), disabled: () => !state.useP });
  seg('mid', 'Al centro del banco', [['none', 'Niente'], ['pol', 'Polaroid', 'un terzo polarizzatore'], ['half', 'λ/2', 'lamina a mezz\'onda (per il rosso)'], ['quarter', 'λ/4', 'lamina a quarto d\'onda (per il rosso)'], ['sugar', 'Zucchero', 'un tubo di 20 cm con la soluzione di saccarosio']], 5);
  slider('m', { range: () => [0, 180, 0.5], read: () => state.m, write: (v) => { state.m = v; }, label: () => (state.mid === 'pol' ? 'Asse del polaroid' : 'Asse veloce della lamina'), text: () => deg(state.m, state.m % 1 ? 1 : 0) });
  slider('conc', { range: () => [0, 0.6, 0.01], read: () => state.conc, write: (v) => { state.conc = v; }, label: () => 'Concentrazione dello zucchero', text: ctx.text.conc });
  toggle('useA', 'Analizzatore', 'il secondo polarizzatore, prima dello schermo');
  slider('an', { range: () => [0, 180, 0.5], read: () => state.an, write: (v) => { state.an = v; }, label: () => 'Asse dell\'analizzatore', text: () => deg(state.an, state.an % 1 ? 1 : 0), disabled: () => !state.useA });
  // Brewster
  slider('th', { range: () => [10, 85, 0.1], read: () => state.th, write: (v) => { state.th = v; }, label: () => 'Angolo d\'incidenza', text: () => deg(state.th, 1) });
  slider('bp', { range: () => [0, 90, 0.5], read: () => state.bp, write: (v) => { state.bp = v; }, label: () => 'Polarizzazione del laser', text: () => `${deg(state.bp, state.bp % 1 ? 1 : 0)} <small>${state.bp < 1 ? '· s, verticale' : state.bp > 89 ? '· p, nel piano' : 'dalla verticale'}</small>` });
  seg('glass', 'Materiale', [['crown', 'Vetro crown', 'n = 1,52'], ['flint', 'Vetro flint', 'n = 1,62'], ['pmma', 'Plexiglas', 'n = 1,49']]);
  // fotoelasticità
  slider('load', { range: () => [0, 800, 1], read: () => state.load, write: (v) => { state.load = v; }, label: () => 'Carico della pressa', text: ctx.text.load });
  slider('pa', { range: () => [0, 180, 0.5], read: () => state.pa, write: (v) => { state.pa = v; }, label: () => 'Asse del polarizzatore', text: () => deg(state.pa, state.pa % 1 ? 1 : 0) });
  slider('aa', { range: () => [0, 180, 0.5], read: () => state.aa, write: (v) => { state.aa = v; }, label: () => 'Asse dell\'analizzatore', text: ctx.text.aa });
  toggle('circ', 'Lamine a quarto d\'onda', 'polariscopio circolare: spariscono le isocline');
  seg('light', 'Luce', [['white', 'Bianca', 'frange colorate'], ['sodium', 'Sodio', 'gialla, 589 nm: frange nere e nette']]);
  // osservare, vista
  toggle('efield', 'Campo elettrico', 'le frecce del campo che oscilla lungo il fascio');
  slider('ambient', { range: () => [0, 1, 0.01], read: () => state.ambient, write: (v) => { state.ambient = v; }, label: () => 'Luce ambiente', text: () => (state.ambient < 0.03 ? 'buio' : `${Math.round(state.ambient * 100)} %`) });
  toggle('outline', 'Contorno', 'evidenzia ciò che si gira');
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
  for (const id of ['pause', 'note', 'clear', 'fullscreen']) $(`#${id}`).addEventListener('click', () => on(id));
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
  const ink = '#2a2f36', mute = '#6b7380', red = '#d2402a';
  const arrow = (x0, y0, x1, y1, col, w = 4, hd = 14) => {
    const L = Math.hypot(x1 - x0, y1 - y0); if (L < 3) return;
    const ux = (x1 - x0) / L, uy = (y1 - y0) / L, h = Math.min(hd, L * 0.5);
    sc.strokeStyle = sc.fillStyle = col; sc.lineWidth = w; sc.beginPath(); sc.moveTo(x0, y0); sc.lineTo(x1 - ux * h * 0.8, y1 - uy * h * 0.8); sc.stroke();
    sc.beginPath(); sc.moveTo(x1, y1); sc.lineTo(x1 - ux * h - uy * h * 0.45, y1 - uy * h + ux * h * 0.45); sc.lineTo(x1 - ux * h + uy * h * 0.45, y1 - uy * h - ux * h * 0.45); sc.closePath(); sc.fill();
  };
  const text = (t, x, y, { size = 20, col = ink, align = 'left', weight = 600 } = {}) => { sc.font = `${weight} ${size}px ${MONO}`; sc.fillStyle = col; sc.textAlign = align; sc.textBaseline = 'middle'; sc.fillText(t, x, y); };
  const clear = () => { sc.fillStyle = '#f7f7f5'; sc.fillRect(0, 0, sch.width, sch.height); };
  // numeri casuali ripetibili per la luce non polarizzata
  const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  return {
    refresh,
    sync() {
      const e = state.exp;
      document.querySelectorAll('[data-only]').forEach((el) => { el.hidden = !el.dataset.only.split(' ').includes(e); });
      const mid = state.mid;
      $('[data-ctl="m"]').hidden = e !== 'bench' || !(mid === 'pol' || mid === 'half' || mid === 'quarter');
      $('[data-ctl="conc"]').hidden = e !== 'bench' || mid !== 'sugar';
      chips($('#views'), ctx.views(), 'view');
      $('#live-title').textContent = e === 'bench' ? 'Il banco ottico' : e === 'brewster' ? 'L\'angolo di Brewster' : 'La fotoelasticità';
      const list = e === 'bench' ? [['malus', 'I e angolo'], ['cos2', 'I e cos²θ'], ['spectrum', 'spettro']] : e === 'brewster' ? [['R', 'riflessa'], ['dop', 'polarizzazione']] : [['N', 'frange e carico'], ['profile', 'lungo i diametri']];
      const key = list.map((x) => x[0]).join();
      if (key !== kinds) {
        kinds = key; const host = $('#plot-kind'); host.innerHTML = '';
        for (const [k, t] of list) { const b = document.createElement('button'); b.dataset.k = k; b.textContent = t; b.addEventListener('click', () => { state.plotKind = k; on('plotKind'); }); host.appendChild(b); }
      }
      if (!list.some((x) => x[0] === state.plotKind)) state.plotKind = list[0][0];
      document.querySelectorAll('#plot-kind button').forEach((b) => b.classList.toggle('on', b.dataset.k === state.plotKind));
    },
    togglePanel() { setPanel($('#panel').classList.contains('collapsed')); },
    setStatus(t, busy) { const s = $('#status'); if (s.textContent !== t) s.textContent = t; s.classList.toggle('busy', !!busy); },
    setFps(v) { $('#fps').textContent = v; },
    setClock(t) { if (t !== clockTxt) { clockTxt = t; $('#clock').innerHTML = t; } },
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
     * Il banco: la polarizzazione dopo ogni elemento, vista guardando verso la sorgente. stages: [{ name, I (rispetto
     * alla sorgente), dop, psi, chi, axis (gradi o null), axisKind, rot (rotazione dello zucchero, gradi) }];
     * ph: la fase per il punto che gira sull'ellisse; col: il colore della luce.
     */
    drawBench({ stages, ph, col }) {
      const W = sch.width, Hh = sch.height, n = stages.length, cw = W / n, cy = 168, R0 = Math.min(74, cw * 0.36);
      clear();
      stages.forEach((s, i) => {
        const cx = cw * (i + 0.5);
        if (i) { sc.strokeStyle = 'rgba(42,47,54,0.12)'; sc.lineWidth = 1; sc.beginPath(); sc.moveTo(cw * i, 24); sc.lineTo(cw * i, Hh - 24); sc.stroke(); }
        text(s.name, cx, 34, { size: n > 4 ? 19 : 22, align: 'center', col: ink });
        // il cerchio di riferimento e gli assi
        sc.strokeStyle = 'rgba(42,47,54,0.16)'; sc.lineWidth = 1.5; sc.beginPath(); sc.arc(cx, cy, R0, 0, Math.PI * 2); sc.stroke();
        sc.beginPath(); sc.moveTo(cx - R0 - 8, cy); sc.lineTo(cx + R0 + 8, cy); sc.moveTo(cx, cy - R0 - 8); sc.lineTo(cx, cy + R0 + 8); sc.stroke();
        if (s.axis != null) {
          const a = s.axis * D2R, dx = Math.sin(a) * (R0 + 14), dy = -Math.cos(a) * (R0 + 14);
          sc.strokeStyle = s.axisKind === 'pol' ? 'rgba(232,69,44,0.75)' : 'rgba(44,103,220,0.75)'; sc.lineWidth = 2.5; sc.setLineDash([8, 6]);
          sc.beginPath(); sc.moveTo(cx - dx, cy - dy); sc.lineTo(cx + dx, cy + dy); sc.stroke(); sc.setLineDash([]);
        }
        if (s.rot) {
          const a0 = -Math.PI / 2 + (s.rot0 || 0) * D2R, a1 = a0 + s.rot * D2R;
          sc.strokeStyle = 'rgba(44,103,220,0.75)'; sc.lineWidth = 2.5; sc.beginPath(); sc.arc(cx, cy, R0 + 10, Math.min(a0, a1), Math.max(a0, a1)); sc.stroke();
        }
        const a = R0 * Math.sqrt(Math.min(1, Math.max(0, s.I)));
        if (s.I < 1e-4) { text('buio', cx, cy, { size: 18, col: mute, align: 'center', weight: 500 }); }
        else {
          // la parte non polarizzata: direzioni a caso
          const au = a * Math.sqrt(Math.max(0, 1 - s.dop));
          if (au > 2) {
            sc.strokeStyle = col.replace('rgb', 'rgba').replace(')', ',0.4)'); sc.lineWidth = 2;
            sc.beginPath();
            for (let k = 0; k < 14; k++) { const t = rnd(k + Math.floor(ph * 2)) * Math.PI; sc.moveTo(cx - Math.sin(t) * au, cy + Math.cos(t) * au); sc.lineTo(cx + Math.sin(t) * au, cy - Math.cos(t) * au); }
            sc.stroke();
          }
          const ap = a * Math.sqrt(s.dop);
          if (ap > 1.5) {
            const ps = s.psi * D2R, ch = s.chi * D2R, ux = Math.sin(ps), uy = -Math.cos(ps), vx = Math.cos(ps), vy = Math.sin(ps);
            sc.strokeStyle = col; sc.lineWidth = 3.2; sc.beginPath();
            for (let k = 0; k <= 72; k++) { const t = (k / 72) * Math.PI * 2, cu = ap * Math.cos(ch) * Math.cos(t), cv = -ap * Math.sin(ch) * Math.sin(t); const x = cx + cu * ux + cv * vx, y = cy + cu * uy + cv * vy; if (k) sc.lineTo(x, y); else sc.moveTo(x, y); }
            sc.stroke();
            // il campo in questo istante
            const cu = ap * Math.cos(ch) * Math.cos(ph), cv = -ap * Math.sin(ch) * Math.sin(ph);
            arrow(cx, cy, cx + cu * ux + cv * vx, cy + cu * uy + cv * vy, red, 3, 12);
          }
        }
        text(`${num(s.I * 100, s.I < 0.1 ? 2 : 1)} %`, cx, 278, { size: 26, align: 'center', col: ink });
        const fs = n > 4 ? 17 : 19;
        text(s.kind, cx, 312, { size: fs + 1, align: 'center', col: ink, weight: 500 });
        if (s.detail) {
          // il dettaglio va a capo prima della parentesi
          const k = s.detail.indexOf(' ('), a = k < 0 ? s.detail : s.detail.slice(0, k), b = k < 0 ? '' : s.detail.slice(k + 1);
          text(a, cx, 338, { size: fs, align: 'center', col: mute, weight: 500 });
          if (b) text(b, cx, 362, { size: fs, align: 'center', col: mute, weight: 500 });
        }
      });
      sc.textBaseline = 'alphabetic';
    },

    /**
     * Brewster, dall'alto: la faccia della lastra, la normale, il raggio incidente, il riflesso (spesso quanto la sua
     * intensità) e il rifratto; i simboli della polarizzazione s (punti: oscilla in verticale) e p (trattini nel piano).
     * d: { th, tt, n, R, Rs, Rp, bp, thB, rs, rp }
     */
    drawBrewster(d) {
      const W = sch.width, Hh = sch.height;
      clear();
      const ox = 250, oy = 150, L = 200, th = d.th * D2R, tt = d.tt * D2R;
      const nx = -Math.cos(th), ny = Math.sin(th);            // la normale, verso il laser (sullo schermo y va verso +z)
      const fx = Math.sin(th), fy = Math.cos(th);             // lungo la faccia
      // la lastra
      const T = 46, Wd = 150;
      sc.fillStyle = 'rgba(120,170,165,0.22)'; sc.strokeStyle = 'rgba(70,120,116,0.7)'; sc.lineWidth = 2;
      sc.beginPath();
      sc.moveTo(ox + fx * Wd, oy + fy * Wd); sc.lineTo(ox - fx * Wd, oy - fy * Wd); sc.lineTo(ox - fx * Wd - nx * T, oy - fy * Wd - ny * T); sc.lineTo(ox + fx * Wd - nx * T, oy + fy * Wd - ny * T); sc.closePath(); sc.fill(); sc.stroke();
      // la normale
      sc.strokeStyle = 'rgba(42,47,54,0.4)'; sc.lineWidth = 1.5; sc.setLineDash([7, 6]);
      sc.beginPath(); sc.moveTo(ox + nx * 130, oy + ny * 130); sc.lineTo(ox - nx * 90, oy - ny * 90); sc.stroke(); sc.setLineDash([]);
      // i raggi
      const rx = -Math.cos(2 * th), ry = Math.sin(2 * th);
      const tx = Math.cos(tt) * -nx + Math.sin(tt) * fx, ty = Math.cos(tt) * -ny + Math.sin(tt) * fy;
      const ex = ox + tx * (T / Math.cos(tt)), ey = oy + ty * (T / Math.cos(tt));
      const beam = (x0, y0, x1, y1, I, w) => { sc.strokeStyle = `rgba(226,48,32,${0.25 + 0.75 * Math.min(1, I * 4)})`; sc.lineWidth = Math.max(1, w); sc.beginPath(); sc.moveTo(x0, y0); sc.lineTo(x1, y1); sc.stroke(); };
      beam(ox - L, oy, ox, oy, 1, 5);
      arrow(ox - L * 0.6, oy, ox - L * 0.45, oy, '#e2301f', 3, 14);
      if (d.R > 0.0005) { beam(ox, oy, ox + rx * L, oy + ry * L, d.R, 5 * Math.sqrt(d.R / 0.1)); arrow(ox + rx * L * 0.5, oy + ry * L * 0.5, ox + rx * L * 0.62, oy + ry * L * 0.62, '#e2301f', 3, 12); }
      beam(ox, oy, ex, ey, 1 - d.R, 4); beam(ex, ey, ex + 150, ey, 1 - d.R, 4);
      // gli angoli
      const arc = (a0, a1, r, col) => { sc.strokeStyle = col; sc.lineWidth = 2; sc.beginPath(); sc.arc(ox, oy, r, Math.min(a0, a1), Math.max(a0, a1)); sc.stroke(); };
      const aN = Math.atan2(ny, nx), aI = Math.PI, aR = Math.atan2(ry, rx);
      arc(aN, aI, 58, red); arc(aN, aR, 72, '#2c67dc');
      text(`θ ${deg(d.th, 1)}`, ox - 150, oy + 40, { size: 21, col: red });
      text(`θt ${deg(d.tt, 1)}`, ex + 16, ey + 34, { size: 21, col: '#3d7a74' });
      // la polarizzazione sui raggi: s (punti) e p (trattini perpendicolari al raggio, nel piano)
      const marks = (x0, y0, ux, uy, as, ap, k) => {
        for (let i = 1; i <= 3; i++) {
          const x = x0 + ux * i * 42, y = y0 + uy * i * 42;
          if (as * k > 0.04) { sc.fillStyle = '#2a2f36'; sc.beginPath(); sc.arc(x, y, 2 + 5 * Math.min(1, as * k), 0, Math.PI * 2); sc.fill(); }
          const l = 16 * Math.min(1, ap * k);
          if (l > 1) { sc.strokeStyle = '#2a2f36'; sc.lineWidth = 2.5; sc.beginPath(); sc.moveTo(x - uy * l + ux * 10, y + ux * l + uy * 10); sc.lineTo(x + uy * l + ux * 10, y - ux * l + uy * 10); sc.stroke(); }
        }
      };
      const cb = Math.cos(d.bp * D2R), sb = Math.sin(d.bp * D2R);
      marks(ox - L + 10, oy - 22, 1, 0, Math.abs(cb), Math.abs(sb), 1);
      marks(ox + rx * 8 + ry * 22, oy + ry * 8 - rx * 22, rx, ry, Math.abs(d.rs * cb), Math.abs(d.rp * sb), 3.5);
      text('dall\'alto', 18, 24, { size: 19, col: mute, weight: 500 });
      text('• s, verticale  ⟂ p, nel piano', 18, Hh - 44, { size: 18, col: mute, weight: 500 });
      text('sul riflesso × 3,5', 18, Hh - 18, { size: 17, col: '#9aa1ab', weight: 500 });
      // le formule
      const x0 = 500;
      text(`n = ${num(d.n, 2)}`, x0, 36, { size: 24 });
      text('tan θB = n', x0, 76, { size: 24, weight: 700 });
      text(`θB = ${deg(d.thB, 1)}`, x0, 112, { size: 24, col: red });
      text(`θ + θt = ${deg(d.th + d.tt, 1)}`, x0, 148, { size: 20, col: mute });
      // le barre di Rs e Rp
      const bars = [['Rs', d.Rs, '#2a2f36'], ['Rp', d.Rp, '#2c67dc'], ['R', d.R, red]];
      bars.forEach(([k, v, c], i) => {
        const y = 206 + i * 50, w = 110 * Math.min(1, v / 0.3);
        text(k, x0, y, { size: 21, col: c });
        sc.fillStyle = 'rgba(42,47,54,0.08)'; sc.fillRect(x0 + 40, y - 11, 110, 22); sc.fillStyle = c; sc.fillRect(x0 + 40, y - 11, w, 22);
        text(`${num(v * 100, v < 0.01 ? 2 : 1)} %`, x0 + 160, y, { size: 20, col: c });
      });
      sc.textBaseline = 'alphabetic';
    },

    /**
     * La fotoelasticità: la scala dei colori delle frange (ordine N a 550 nm) con il segno dell'ordine al centro, e il
     * disco con il carico. d: { strip: Uint8Array RGBA per N da 0 a maxN, nStrip, maxN, N (al centro), P, ds (MPa), circ, sodium }
     */
    drawPhoto(d) {
      const W = sch.width, Hh = sch.height;
      clear();
      const x0 = 40, x1 = W - 40, y0 = 62, hS = 54, Nmax = 5;
      text(d.sodium ? 'le frange con la luce del sodio' : 'i colori delle frange (Michel-Lévy)', x0, 28, { size: 20, col: mute, weight: 500 });
      const img = sc.createImageData(Math.round(x1 - x0), 1);
      for (let i = 0; i < img.width; i++) {
        const N = (i / (img.width - 1)) * Nmax, k = Math.min(d.nStrip - 1, Math.round((N / d.maxN) * (d.nStrip - 1))) * 4;
        img.data[i * 4] = d.strip[k]; img.data[i * 4 + 1] = d.strip[k + 1]; img.data[i * 4 + 2] = d.strip[k + 2]; img.data[i * 4 + 3] = 255;
      }
      for (let y = 0; y < hS; y++) sc.putImageData(img, x0, y0 + y);
      sc.strokeStyle = 'rgba(42,47,54,0.35)'; sc.lineWidth = 1; sc.strokeRect(x0 - 0.5, y0 - 0.5, x1 - x0 + 1, hS + 1);
      for (let N = 0; N <= Nmax; N++) {
        const x = x0 + ((x1 - x0) * N) / Nmax;
        sc.strokeStyle = ink; sc.lineWidth = 1.5; sc.beginPath(); sc.moveTo(x, y0 + hS); sc.lineTo(x, y0 + hS + 10); sc.stroke();
        text(String(N), x, y0 + hS + 24, { size: 20, align: 'center', col: ink });
      }
      if (d.N <= Nmax) {
        const x = x0 + ((x1 - x0) * d.N) / Nmax;
        sc.fillStyle = red; sc.beginPath(); sc.moveTo(x, y0 - 2); sc.lineTo(x - 10, y0 - 18); sc.lineTo(x + 10, y0 - 18); sc.closePath(); sc.fill();
      }
      text('ordine N', x1, y0 + hS + 50, { size: 18, col: mute, weight: 500, align: 'right' });
      // il disco con il carico
      const cx = 100, cy = 272, r = 40;
      sc.fillStyle = 'rgba(200,210,214,0.35)'; sc.strokeStyle = ink; sc.lineWidth = 2.5; sc.beginPath(); sc.arc(cx, cy, r, 0, Math.PI * 2); sc.fill(); sc.stroke();
      if (d.P > 1) { arrow(cx, cy - r - 40, cx, cy - r - 2, red, 4); arrow(cx, cy + r + 40, cx, cy + r + 2, red, 4); }
      text(`${num(d.P, 0)} N`, cx + 14, cy - r - 28, { size: 20, col: red });
      const xt = 230;
      text(`al centro N = ${num(d.N, 2)}`, xt, 206, { size: 26, weight: 700 });
      text(`σ1 − σ2 = 8P/(πDt) = ${num(d.ds, 2)} MPa`, xt, 248, { size: 20 });
      text('N = (σ1 − σ2) t / fσ', xt, 282, { size: 20 });
      text(d.circ ? 'circolare: solo le frange' : 'piano: frange e isocline', xt, 324, { size: 19, col: mute, weight: 500 });
      sc.textBaseline = 'alphabetic';
    },

    /** Grafico. series: [{x, y, color, width, dash}]; points: [{x, y, color, r, ring}]; vlines: [{x, color}]; spectrum: banda dei colori */
    drawPlot({ series = [], points = [], vlines = [], X0, X1, Y0, Y1, xLabel, yLabel, legend, spectrum }) {
      const W = plot.width, Hh = plot.height, padL = 70, padB = 40, padT = 18, padR = 16;
      pc.clearRect(0, 0, W, Hh); pc.fillStyle = '#f7f7f5'; pc.fillRect(0, 0, W, Hh);
      const xOf = (x) => padL + ((x - X0) / (X1 - X0)) * (W - padL - padR), yOf = (y) => Hh - padB - ((y - Y0) / (Y1 - Y0)) * (Hh - padT - padB);
      if (spectrum) {
        for (let px = Math.ceil(xOf(X0)); px < xOf(X1); px += 2) { const l = X0 + ((px - padL) / (W - padL - padR)) * (X1 - X0); pc.fillStyle = cssRGB(displayRGB(l).map((v) => v * 0.9)); pc.fillRect(px, Hh - padB - 8, 2, 8); }
      }
      pc.font = `500 18px ${MONO}`; pc.fillStyle = mute;
      const xs = niceStep((X1 - X0) / Math.max(3, Math.round((W - padL - padR) / 145))), ys = niceStep((Y1 - Y0) / Math.max(3, Math.round((Hh - padT - padB) / 55)));
      const dec = (s) => (s < 0.01 ? 3 : s < 0.1 ? 2 : s < 1 ? 1 : 0);
      pc.textAlign = 'center';
      const xlw = pc.measureText(xLabel).width + 34;
      for (let x = Math.ceil(X0 / xs) * xs; x <= X1 + 1e-9; x += xs) {
        const p = xOf(x); pc.strokeStyle = Math.abs(x) < xs / 2 ? 'rgba(18,21,26,0.3)' : 'rgba(18,21,26,0.08)'; pc.beginPath(); pc.moveTo(p, padT); pc.lineTo(p, Hh - padB); pc.stroke();
        if (p < W - padR - xlw) pc.fillText(num(Math.abs(x) < xs / 2 ? 0 : x, dec(xs)), p, Hh - 12);
      }
      pc.textAlign = 'right';
      for (let y = Math.ceil(Y0 / ys) * ys; y <= Y1 + 1e-9; y += ys) {
        const p = yOf(y); pc.strokeStyle = Math.abs(y) < ys / 2 ? 'rgba(18,21,26,0.3)' : 'rgba(18,21,26,0.08)'; pc.beginPath(); pc.moveTo(padL, p); pc.lineTo(W - padR, p); pc.stroke();
        pc.fillText(num(Math.abs(y) < ys / 2 ? 0 : y, dec(ys)), padL - 8, p + 6);
      }
      pc.textAlign = 'left'; pc.fillStyle = '#9aa1ab'; pc.fillText(yLabel, padL + 6, padT + 14);
      pc.textAlign = 'right'; pc.fillText(xLabel, W - padR, Hh - 12);
      if (legend) { let lx = W - padR - 8; pc.font = `500 17px ${MONO}`; for (const [t, col] of legend.slice().reverse()) { const tw = pc.measureText(t).width; pc.fillStyle = col; pc.fillText(t, lx, padT + 14); lx -= tw + 22; } }
      pc.save(); pc.beginPath(); pc.rect(padL, padT - 4, W - padL - padR, Hh - padT - padB + 4); pc.clip();
      for (const v of vlines) { pc.strokeStyle = v.color; pc.lineWidth = 2; pc.setLineDash([5, 5]); pc.beginPath(); pc.moveTo(xOf(v.x), padT); pc.lineTo(xOf(v.x), Hh - padB); pc.stroke(); pc.setLineDash([]); }
      for (const s of series) {
        if (s.x.length < 2) continue;
        pc.strokeStyle = s.color; pc.lineWidth = s.width || 3; pc.setLineDash(s.dash || []); pc.lineJoin = 'round';
        pc.beginPath(); let pen = false;
        for (let i = 0; i < s.x.length; i++) { if (!isFinite(s.y[i])) { pen = false; continue; } const x = xOf(s.x[i]), y = yOf(s.y[i]); if (pen) pc.lineTo(x, y); else pc.moveTo(x, y); pen = true; }
        pc.stroke(); pc.setLineDash([]);
      }
      for (const p of points) { pc.beginPath(); pc.arc(xOf(p.x), yOf(p.y), p.r || 6, 0, Math.PI * 2); pc.fillStyle = p.color; pc.fill(); if (p.ring) { pc.strokeStyle = p.ring; pc.lineWidth = 2.5; pc.stroke(); } }
      pc.restore();
      pc.strokeStyle = 'rgba(18,21,26,0.35)'; pc.beginPath(); pc.moveTo(padL - 0.5, padT); pc.lineTo(padL - 0.5, Hh - padB); pc.stroke();
    },
  };
}
