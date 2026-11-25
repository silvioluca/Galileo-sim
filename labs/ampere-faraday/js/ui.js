// ui.js — pannello dei controlli, riquadro (lo schema dell'esperienza, il grafico), fascia delle misure. Nessuna fisica qui.
import { createControls } from '../../../shared/js/controls.js';

const NF = [];
const num = (v, d = 1) => (NF[d] || (NF[d] = new Intl.NumberFormat('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }))).format(v);
export const fmt = { num };
const niceStep = (v) => { const p = 10 ** Math.floor(Math.log10(v)), f = v / p; return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p; };
const MONO = '"Geist Mono Variable", Consolas, monospace';

export function createUI(state, ctx, on) {
  const $ = (s, r = document) => r.querySelector(s);
  const { slider, toggle, seg, refresh } = createControls(state, on);
  const T = ctx.text;

  seg('exp', 'Esperienza', [['faraday', 'Faraday', 'un magnete spinge una corrente: l\'altalena fra i poli'], ['ampere', 'Ampère', 'due correnti si attraggono o si respingono: le strisce di alluminio']]);
  toggle('on', 'Alimentatore acceso', 'corrente continua');
  slider('I', { range: () => [0, 10, 0.05], read: () => state.I, write: (v) => { state.I = v; }, label: () => 'Corrente', text: T.I });
  toggle('rev', 'Corrente invertita', 'i due cavi scambiati ai morsetti dell\'alimentatore');
  seg('nMag', 'Magneti affiancati', [[1, '1'], [2, '2'], [3, '3']]);
  toggle('flip', 'Magneti capovolti', 'il polo nord in basso: il campo fra i poli va verso l\'alto');
  slider('Ia', { range: () => [0, 40, 0.1], read: () => state.Ia, write: (v) => { state.Ia = v; }, label: () => 'Corrente dell\'alimentatore', text: T.Ia });
  seg('mode', 'Le strisce', [['opp', 'In serie', 'la corrente scende in una e sale nell\'altra: versi opposti'], ['same', 'In parallelo', 'la corrente scende in tutte e due: stesso verso, metà per ciascuna']]);
  toggle('vectors', 'Frecce di I, B e F', 'la corrente (giallo), il campo (blu), la forza (rosso)');
  toggle('lines', 'Il campo a metà altezza', 'le linee di campo delle due strisce su un foglio orizzontale');
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
  const ink = '#2a2f36';
  const arrow = (x0, y0, x1, y1, col, w = 4) => {
    const L = Math.hypot(x1 - x0, y1 - y0); if (L < 3) return;
    const ux = (x1 - x0) / L, uy = (y1 - y0) / L, h = Math.min(16, L * 0.5);
    sc.strokeStyle = sc.fillStyle = col; sc.lineWidth = w; sc.beginPath(); sc.moveTo(x0, y0); sc.lineTo(x1 - ux * h * 0.8, y1 - uy * h * 0.8); sc.stroke();
    sc.beginPath(); sc.moveTo(x1, y1); sc.lineTo(x1 - ux * h - uy * h * 0.45, y1 - uy * h + ux * h * 0.45); sc.lineTo(x1 - ux * h + uy * h * 0.45, y1 - uy * h - ux * h * 0.45); sc.closePath(); sc.fill();
  };
  const text = (t, x, y, { size = 22, col = ink, align = 'left', weight = 600 } = {}) => { sc.font = `${weight} ${size}px ${MONO}`; sc.fillStyle = col; sc.textAlign = align; sc.textBaseline = 'middle'; sc.fillText(t, x, y); };
  const dotCross = (x, y, r, out) => {
    sc.fillStyle = '#ffffff'; sc.strokeStyle = ink; sc.lineWidth = 3; sc.beginPath(); sc.arc(x, y, r, 0, Math.PI * 2); sc.fill(); sc.stroke();
    sc.fillStyle = sc.strokeStyle = ink;
    if (out) { sc.beginPath(); sc.arc(x, y, r * 0.3, 0, Math.PI * 2); sc.fill(); } else { const k = r * 0.55; sc.lineWidth = 3; sc.beginPath(); sc.moveTo(x - k, y - k); sc.lineTo(x + k, y + k); sc.moveTo(x - k, y + k); sc.lineTo(x + k, y - k); sc.stroke(); }
  };

  return {
    refresh,
    sync() {
      const f = state.exp === 'faraday';
      document.querySelectorAll('.only-f').forEach((e) => { e.hidden = !f; });
      document.querySelectorAll('.only-a').forEach((e) => { e.hidden = f; });
      chips($('#views'), ctx.views(), 'view');
      $('#live-title').textContent = f ? 'L\'esperienza di Faraday' : 'L\'esperienza di Ampère';
      const list = f ? [['FI', 'F e corrente'], ['FL', 'F e lunghezza']] : [['gap', 'distanza e corrente'], ['shape', 'forma delle strisce']];
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
     * Faraday, visto di lato (lungo il filo): il perno, il filo che regge l'altalena, il tratto orizzontale in sezione
     * (⊙ la corrente viene verso di noi), i poli, il campo, la forza, l'angolo. d: { th, I, flip, F, mg, Fscale }
     */
    drawFaraday(d) {
      const W = sch.width, H = sch.height;
      sc.fillStyle = '#f7f7f5'; sc.fillRect(0, 0, W, H);
      // guardando lungo il filo, con la corrente positiva verso di noi, lo spostamento verso z positivo va a sinistra
      const px = 230, py = 30, Lp = 215, k = Lp / 0.2;
      const rx = px - Lp * Math.sin(d.th), ry = py + Lp * Math.cos(d.th);
      // i poli (la profondità delle espansioni, ±5 cm) sopra e sotto il filo a riposo
      const gy = py + Lp, half = 0.05 * k, gap = 34;
      const nTop = !d.flip;
      sc.globalAlpha = 0.85;
      sc.fillStyle = nTop ? '#c62a1e' : '#2a56b8'; sc.fillRect(px - half, gy - gap - 26, 2 * half, 26);
      sc.fillStyle = nTop ? '#2a56b8' : '#c62a1e'; sc.fillRect(px - half, gy + gap, 2 * half, 26);
      sc.globalAlpha = 1;
      text(nTop ? 'N' : 'S', px - half - 12, gy - gap - 13, { size: 24, weight: 700, col: nTop ? '#c62a1e' : '#2a56b8', align: 'right' });
      text(nTop ? 'S' : 'N', px - half - 12, gy + gap + 13, { size: 24, weight: 700, col: nTop ? '#2a56b8' : '#c62a1e', align: 'right' });
      // il campo fra i poli
      for (const x of [-0.8, -0.4, 0.4, 0.8]) { const X = px + x * half; if (nTop) arrow(X, gy - gap + 4, X, gy + gap - 4, 'rgba(42,86,184,0.6)', 3); else arrow(X, gy + gap - 4, X, gy - gap + 4, 'rgba(42,86,184,0.6)', 3); }
      // il goniometro
      sc.strokeStyle = 'rgba(42,47,54,0.35)'; sc.lineWidth = 1.5;
      for (let deg = -20; deg <= 20; deg += 5) { const a = (deg * Math.PI) / 180; sc.beginPath(); sc.moveTo(px + Math.sin(a) * (Lp - 26), py + Math.cos(a) * (Lp - 26)); sc.lineTo(px + Math.sin(a) * (Lp - 12), py + Math.cos(a) * (Lp - 12)); sc.stroke(); }
      sc.setLineDash([6, 6]); sc.beginPath(); sc.moveTo(px, py); sc.lineTo(px, py + Lp + 20); sc.stroke(); sc.setLineDash([]);
      // l'altalena
      sc.strokeStyle = '#a8552c'; sc.lineWidth = 3; sc.beginPath(); sc.moveTo(px, py); sc.lineTo(rx, ry); sc.stroke();
      sc.fillStyle = ink; sc.beginPath(); sc.arc(px, py, 6, 0, Math.PI * 2); sc.fill();
      if (Math.abs(d.th) > 0.002) {
        sc.strokeStyle = '#d2402a'; sc.lineWidth = 2.5; sc.beginPath(); sc.arc(px, py, 70, Math.PI / 2, Math.PI / 2 + d.th, d.th < 0); sc.stroke();
        text(`θ = ${num(Math.abs((d.th * 180) / Math.PI), 1)}°`, px + (d.th > 0 ? -18 : 18), py + 92, { align: d.th > 0 ? 'right' : 'left', col: '#d2402a', size: 22 });
      }
      dotCross(rx, ry, 13, d.I >= 0);
      // la forza magnetica e il peso
      if (Math.abs(d.F) > 1e-4) arrow(rx, ry, rx - Math.sign(d.F) * Math.min(150, 20 + Math.abs(d.F) * d.Fscale), ry, '#d2402a', 5);
      arrow(rx, ry + 14, rx, ry + 52, 'rgba(42,47,54,0.7)', 3);
      text('mg', rx + 10, ry + 40, { size: 18, col: '#3a3f46' });
      // le formule
      const x0 = 470;
      text('visto lungo il filo', x0, 30, { size: 18, col: '#6b7380', weight: 500 });
      text('F = B · I · L', x0, 80, { size: 30, weight: 700 });
      text(`B = ${num(d.B * 1000, 0)} mT`, x0, 128, { size: 22 });
      text(`I = ${num(Math.abs(d.I), 2)} A`, x0, 160, { size: 22 });
      text(`L = ${num(d.L * 100, 0)} cm`, x0, 192, { size: 22 });
      text(`F = ${num(Math.abs(d.F) * 1000, 1)} mN`, x0, 232, { size: 24, col: '#d2402a' });
      text('tan θ = F / mg', x0, 280, { size: 22, col: '#6b7380' });
      text(`= ${num(Math.tan(Math.abs(d.th)), 3)}`, x0, 312, { size: 22, col: '#6b7380' });
      text(d.I >= 0 ? '⊙ la corrente viene verso di noi' : '⊗ la corrente si allontana', 18, H - 18, { size: 16, col: '#6b7380', weight: 500 });
      sc.textBaseline = 'alphabetic';
    },

    /**
     * Ampère: a sinistra le strisce viste di fronte (le distanze orizzontali × 5), a destra la sezione a metà altezza con
     * le linee di campo e le forze. d: { u (spostamenti), d0, L, same, Ip, gap, f }
     */
    drawAmpere(d) {
      const W = sch.width, H = sch.height;
      sc.fillStyle = '#f7f7f5'; sc.fillRect(0, 0, W, H);
      // le strisce di fronte
      const cx = 170, top = 40, bot = H - 40, kx = 5 * (bot - top) / d.L;
      sc.strokeStyle = '#2a2f36'; sc.lineWidth = 3;
      sc.beginPath(); sc.moveTo(cx - 110, top); sc.lineTo(cx + 110, top); sc.moveTo(cx - 110, bot); sc.lineTo(cx + 110, bot); sc.stroke();
      const n = d.u.length - 1;
      for (const s of [-1, 1]) {
        sc.strokeStyle = '#8f96a0'; sc.lineWidth = 6; sc.beginPath();
        for (let i = 0; i <= n; i++) { const y = top + ((bot - top) * i) / n, x = cx + s * (d.d0 / 2 + d.u[i]) * kx; if (i) sc.lineTo(x, y); else sc.moveTo(x, y); }
        sc.stroke();
        const down = s < 0 || d.same;
        if (d.Ip > 0.05) { const x = cx + s * (d.d0 / 2 + d.u[Math.round(n * 0.2)]) * kx + s * 18, y = top + (bot - top) * 0.2; arrow(x, down ? y - 22 : y + 22, x, down ? y + 22 : y - 22, '#e2a400', 4); }
      }
      text('di fronte', 18, 20, { size: 18, col: '#6b7380', weight: 500 });
      text('distanze orizzontali × 5', 18, H - 14, { size: 15, col: '#9aa1ab', weight: 500 });
      // la sezione a metà altezza: le linee di campo (curve di livello di ψ)
      const ox = 560, oy = H / 2, R = 150, sx = R / 0.06, xa = -d.gap / 2, xb = d.gap / 2, sb = d.same ? 1 : -1;
      // le linee si ridisegnano solo quando la distanza cambia di qualche decimo di millimetro
      const key = `${Math.round(d.gap * 5000)}|${d.same}`;
      if (key === this._secKey && this._sec) { sc.drawImage(this._sec, 0, 0); }
      else {
      this._secKey = key;
      sc.save(); sc.beginPath(); sc.rect(ox - R - 30, 30, 2 * R + 60, H - 60); sc.clip();
      sc.fillStyle = '#ffffff'; sc.fillRect(ox - R - 30, 30, 2 * R + 60, H - 60);
      const nx = 120, nz = 90, X = (R + 30) / sx, Z = (H / 2 - 30) / sx, hx = (2 * X) / (nx - 1), hz = (2 * Z) / (nz - 1), psi = new Float32Array(nx * nz);
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = -X + i * hx, z = -Z + j * hz; psi[j * nx + i] = 0.5 * Math.log((x - xa) ** 2 + z * z + 1e-8) + sb * 0.5 * Math.log((x - xb) ** 2 + z * z + 1e-8); }
      const vals = Array.from(psi).sort((a, b) => a - b), lo = vals[Math.floor(vals.length * 0.02)], hi = vals[Math.floor(vals.length * 0.995)];
      sc.strokeStyle = 'rgba(31,95,176,0.8)'; sc.lineWidth = 1.6; sc.beginPath();
      for (let l = 1; l < 24; l++) {
        const lev = lo + ((hi - lo) * l) / 24;
        for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
          const a = psi[j * nx + i], b = psi[j * nx + i + 1], c = psi[(j + 1) * nx + i + 1], e = psi[(j + 1) * nx + i], pts = [];
          const x0 = -X + i * hx, z0 = -Z + j * hz;
          const edge = (p, q, x1, z1, x2, z2) => { if ((p - lev) * (q - lev) < 0) { const t = (lev - p) / (q - p); pts.push([x1 + (x2 - x1) * t, z1 + (z2 - z1) * t]); } };
          edge(a, b, x0, z0, x0 + hx, z0); edge(b, c, x0 + hx, z0, x0 + hx, z0 + hz); edge(c, e, x0 + hx, z0 + hz, x0, z0 + hz); edge(e, a, x0, z0 + hz, x0, z0);
          for (let q = 0; q + 1 < pts.length; q += 2) { sc.moveTo(ox + pts[q][0] * sx, oy + pts[q][1] * sx); sc.lineTo(ox + pts[q + 1][0] * sx, oy + pts[q + 1][1] * sx); }
        }
      }
      sc.stroke(); sc.restore();
      if (!this._sec) { this._sec = document.createElement('canvas'); this._sec.width = W; this._sec.height = H; }
      const cc = this._sec.getContext('2d'); cc.clearRect(0, 0, W, H); cc.drawImage(sch, ox - R - 30, 30, 2 * R + 60, H - 60, ox - R - 30, 30, 2 * R + 60, H - 60);
      }
      // le strisce in sezione (⊗ la corrente scende, vista dall'alto) e le forze
      for (const [x, down] of [[xa, true], [xb, d.same]]) {
        sc.fillStyle = '#8f96a0'; sc.fillRect(ox + x * sx - 4, oy - 0.006 * sx, 8, 0.012 * sx);
        dotCross(ox + x * sx, oy - 0.006 * sx - 18, 11, !down);
      }
      if (d.Ip > 0.05) {
        // si attraggono: la striscia di sinistra va a destra e viceversa
        const fl = Math.min(90, 14 + d.f * 6000), dir = d.same ? 1 : -1;
        arrow(ox + xa * sx, oy + 0.006 * sx + 14, ox + xa * sx + dir * fl, oy + 0.006 * sx + 14, '#d2402a', 4);
        arrow(ox + xb * sx, oy + 0.006 * sx + 14, ox + xb * sx - dir * fl, oy + 0.006 * sx + 14, '#d2402a', 4);
      }
      text('a metà altezza, dall\'alto', ox - R - 26, 20, { size: 18, col: '#6b7380', weight: 500 });
      text(d.same ? 'stesso verso: si attraggono' : 'versi opposti: si respingono', ox, H - 14, { size: 17, col: '#d2402a', align: 'center' });
      sc.textBaseline = 'alphabetic';
    },

    /** Grafico. series: [{x, y, color, width, dash}]; points: [{x, y, color, r, ring}] */
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
