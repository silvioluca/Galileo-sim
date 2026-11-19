// ui.js — pannello dei controlli, oculare, grafico della luce in funzione della velocità, misure. Nessuna fisica qui.
import { createControls } from '../../../shared/js/controls.js';

const num = (v, d = 1) => v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmt = {
  num,
  km(m) { return m >= 1000 ? `${num(m / 1000, 3)} km` : `${num(m, 0)} m`; },
  c(v) { return `${num(Math.round(v / 1000), 0)} km/s`; },
  us(t) { return `${num(t * 1e6, t < 1e-5 ? 2 : 1)} µs`; },
  pct(x) { return `${num(x * 100, x < 0.1 ? 1 : 0)} %`; },
};
const niceStep = (v) => { const p = 10 ** Math.floor(Math.log10(v)), f = v / p; return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p; };

export function createUI(state, ctx, on) {
  const $ = (s, r = document) => r.querySelector(s);
  const { slider, toggle, seg, refresh } = createControls(state, on);

  const modern = () => state.app === 'moderno';
  seg('app', '', [['storico', 'Fizeau, 1849', 'Legno e ottone, lampada a olio, contagiri meccanico, l\'occhio all\'oculare'], ['moderno', 'Versione moderna', 'Metallo, laser verde, telecamera, motore elettrico e tachimetro laser']]);
  slider('f', {
    range: () => [0, ctx.fMax(), modern() ? 0.001 : 0.01], read: () => state.f,
    write: (v) => { state.f = modern() ? Math.round(v * 1000) / 1000 : Math.round(v * 100) / 100; },
    label: () => 'Velocità della ruota',
    text: () => (state.f ? `${num(state.f, modern() ? 3 : 2)} giri/s <small>· ${num(state.N * state.f, 0)} vani al secondo</small>` : 'ferma, un vano sul fascio'),
  });
  seg('N', 'Denti della ruota', [[180, '180'], [360, '360'], [720, '720', 'La ruota di Fizeau'], [1440, '1440']]);
  slider('spot', {
    range: () => [0.02, 0.4, 0.01], read: () => state.spot, write: (v) => { state.spot = v; },
    label: () => 'Immagine della sorgente sulla ruota',
    text: () => `${Math.round(state.spot * 100)} % del dente <small>· ${num(ctx.pitch() * state.spot * 1e6, 0)} µm</small>`,
  });
  slider('d', {
    range: () => [1, 25, 0.001], read: () => state.d, write: (v) => { state.d = v; },
    label: () => 'Distanza dello specchio', text: () => `${num(state.d, 3)} km <small>· ${ctx.where()}</small>`,
    button: { text: '8 633 m', title: 'Suresnes–Montmartre, come Fizeau', click: () => { state.d = 8.633; refresh('d'); on('d'); } },
  });
  toggle('air', 'Aria lungo il percorso', 'la luce rallenta dello 0,03 %');
  seg('slow', 'Tempo', [[1, 'Reale'], [1e-4, '100 µs/s', 'Ogni secondo sullo schermo passano 100 µs'], [1e-5, '10 µs/s', 'Ogni secondo sullo schermo passano 10 µs'], [1e-6, '1 µs/s', 'Ogni secondo sullo schermo passa 1 µs']]);
  slider('ambient', {
    range: () => [0, 1, 0.01], read: () => state.ambient, write: (v) => { state.ambient = v; },
    label: () => 'Luce ambiente', text: () => (state.ambient < 0.03 ? 'buio' : `${Math.round(state.ambient * 100)} %`),
  });
  toggle('beam', 'Fascio di luce', 'al rallentatore: gli impulsi tagliati dalla ruota');
  toggle('theory', 'Curva teorica nel grafico');
  toggle('outline', 'Contorno della ruota', 'evidenzia l\'oggetto in moto');
  toggle('labels', 'Etichette');
  seg('quality', 'Qualità di calcolo', [['low', 'Fluida'], ['medium', 'Bilanciata'], ['high', 'Massima']]);

  const chips = (host, list, key) => {
    host.innerHTML = '';
    for (const [id, text, title] of list) {
      const b = document.createElement('button');
      b.className = 'btn'; b.innerHTML = text; if (title) b.title = title;
      b.addEventListener('click', () => on(key, id));
      host.appendChild(b);
    }
  };
  chips($('#presets'), ctx.presets, 'preset');
  chips($('#views'), ctx.views, 'view');
  $('#scan').addEventListener('click', () => on('scan'));
  $('#mark').addEventListener('click', () => on('mark'));
  $('#pause').addEventListener('click', () => on('pause'));
  $('#clear').addEventListener('click', () => on('clear'));
  $('#fullscreen').addEventListener('click', () => on('fullscreen'));
  const setPanel = (show) => {
    $('#panel').classList.toggle('collapsed', !show);
    document.body.classList.toggle('panel-off', !show);
    on('layout');
  };
  $('#hide-panel').addEventListener('click', () => setPanel($('#panel').classList.contains('collapsed')));
  $('#panel-toggle').addEventListener('click', () => setPanel(true));
  $('#scrim').addEventListener('click', () => setPanel(false));

  const eye = $('#eye'), ec = eye.getContext('2d');
  const plot = $('#plot'), pc = plot.getContext('2d');

  /** Barra verticale della luce, percentuale e didascalia, a partire da x = bx. */
  function meter(bx, I, lit, [c0, c1]) {
    const H = eye.height, bw = 26, by0 = 26, by1 = H - 26;
    ec.fillStyle = '#e4e5e8'; ec.fillRect(bx, by0, bw, by1 - by0);
    const h = (by1 - by0) * Math.min(1, I);
    const lg = ec.createLinearGradient(0, by1, 0, by0); lg.addColorStop(0, c0); lg.addColorStop(1, c1);
    ec.fillStyle = lg; ec.fillRect(bx, by1 - h, bw, h);
    ec.strokeStyle = 'rgba(18,21,26,0.35)'; ec.lineWidth = 1.5; ec.strokeRect(bx, by0, bw, by1 - by0);
    ec.font = '500 18px "Geist Mono Variable", Consolas, monospace'; ec.fillStyle = '#6b7380'; ec.textAlign = 'left'; ec.textBaseline = 'middle';
    for (const v of [0, 0.5, 1]) { const y = by1 - (by1 - by0) * v; ec.fillText(`${Math.round(v * 100)}`, bx + bw + 8, y); }
    ec.fillStyle = '#15181c'; ec.font = '600 44px "Geist Mono Variable", Consolas, monospace';
    ec.fillText(`${num(I * 100, I < 0.1 ? 1 : 0)} %`, bx + bw + 64, H / 2 - 18);
    ec.font = '500 19px "Geist Variable", sans-serif'; ec.fillStyle = '#6b7380';
    ec.fillText(lit, bx + bw + 64, H / 2 + 26);
  }

  /** L'immagine della telecamera: sensore rettangolare, denti della ruota, punto verde del laser, profilo d'intensità. */
  function drawCamera(u, blur, I, lit) {
    const H = eye.height, x0 = 22, y0 = 14, w = 304, h = H - 28, cx = x0 + w / 2, cy = y0 + h / 2;
    ec.save();
    ec.beginPath(); ec.rect(x0, y0, w, h); ec.clip();
    ec.fillStyle = '#040605'; ec.fillRect(x0, y0, w, h);
    // denti (grigi, illuminati appena dalla luce diffusa)
    const pitch = h * 0.52, base = cy + h * 0.14, tip = cy - h * 0.18, frac = u - Math.round(u);
    if (blur > 0.6) { ec.fillStyle = 'rgba(120,130,135,0.42)'; ec.fillRect(x0, tip, w, base - tip); } else {
      ec.fillStyle = '#3c4246'; ec.fillRect(x0, base, w, y0 + h - base);
      for (let k = -4; k <= 4; k++) ec.fillRect(cx + (k + 0.25 - frac) * pitch, tip, pitch * 0.5, base - tip + 1);
    }
    // punto del laser con alone (saturato al centro)
    if (I > 0.002) {
      const r = 6 + 40 * Math.sqrt(I);
      const g = ec.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(235,255,240,${Math.min(1, I * 1.7)})`); g.addColorStop(0.3, `rgba(90,255,140,${Math.min(1, I * 1.2)})`); g.addColorStop(1, 'rgba(40,200,90,0)');
      ec.fillStyle = g; ec.beginPath(); ec.arc(cx, cy, r, 0, Math.PI * 2); ec.fill();
    }
    // profilo d'intensità lungo la riga centrale
    ec.strokeStyle = 'rgba(93,255,147,0.85)'; ec.lineWidth = 2; ec.beginPath();
    for (let i = 0; i <= 120; i++) { const x = x0 + (w * i) / 120, d = (x - cx) / 22, y = y0 + h - 8 - (h * 0.32) * I * Math.exp(-d * d); if (i) ec.lineTo(x, y); else ec.moveTo(x, y); }
    ec.stroke();
    // sovrimpressioni
    ec.strokeStyle = 'rgba(93,255,147,0.5)'; ec.lineWidth = 1.5;
    ec.beginPath(); ec.moveTo(cx - 14, cy); ec.lineTo(cx - 5, cy); ec.moveTo(cx + 5, cy); ec.lineTo(cx + 14, cy); ec.moveTo(cx, cy - 14); ec.lineTo(cx, cy - 5); ec.moveTo(cx, cy + 5); ec.lineTo(cx, cy + 14); ec.stroke();
    ec.font = '500 15px "Geist Mono Variable", Consolas, monospace'; ec.fillStyle = 'rgba(93,255,147,0.85)'; ec.textAlign = 'left'; ec.textBaseline = 'top';
    ec.fillText('CAM 1 · 30 fps', x0 + 10, y0 + 8);
    ec.textAlign = 'right'; ec.fillText(`I = ${I.toFixed(3)}`, x0 + w - 10, y0 + 8);
    ec.restore();
    ec.strokeStyle = '#1b1d21'; ec.lineWidth = 5; ec.strokeRect(x0 - 2, y0 - 2, w + 4, h + 4);
    meter(x0 + w + 40, I, lit, ['#1f9e52', '#a6ffbe']);
  }

  return {
    refresh,
    sync() {
      refresh('f'); refresh('spot');
      const m = modern();
      $('#live-title').innerHTML = m ? '<b>Telecamera</b><span class="wide"> · il segnale sul monitor</span>' : '<b>Oculare</b><span class="wide"> · ciò che vede Fizeau</span>';
      $('#mark').textContent = m ? 'Trova il minimo' : 'Segna eclissi';
      $('#mark').title = m ? 'Il computer cerca il minimo del segnale della telecamera vicino a questa velocità e ricava c (M)' : 'Questa velocità è un\'eclissi: ricava c (M)';
    },
    togglePanel() { setPanel($('#panel').classList.contains('collapsed')); },
    setNote(id, html) { const el = $(id); el.innerHTML = html; el.hidden = !html; },
    setStatus(text, busy) { const s = $('#status'); s.textContent = text; s.classList.toggle('busy', !!busy); },
    setFps(v) { $('#fps').textContent = v; },
    setClock(f, running) { $('#clock').textContent = num(f, modern() ? 3 : 2); $('.clock').classList.toggle('run', running); },
    setSide(a, b) { $('#side1').innerHTML = a; $('#side2').innerHTML = b; },
    setScan(label) { $('#scan span').textContent = label; },
    /** Qui la riga dei pulsanti è piena: la pausa è un'icona (due barre; un triangolo per riprendere). */
    setPause(label, enabled) {
      const b = $('#pause'), k = label === 'Pausa' ? 'pause' : 'play';
      if (b.dataset.k !== k) {
        b.dataset.k = k;
        b.innerHTML = k === 'pause'
          ? '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';
        b.title = `${label} (P)`; b.setAttribute('aria-label', label);
      }
      b.disabled = !enabled; b.classList.toggle('on', k === 'play');
    },
    setMetrics(cells) {
      const m = $('#metrics');
      if (m.children.length !== cells.length) m.innerHTML = cells.map(() => '<div class="cell"><div class="k"></div><div class="v"></div><div class="s"></div></div>').join('');
      cells.forEach((c, i) => {
        const el = m.children[i];
        el.children[0].textContent = c.k; el.children[1].innerHTML = c.v; el.children[2].innerHTML = c.s || '&nbsp;';
        el.title = c.title || ''; el.dataset.p = c.p || 1;
      });
    },
    setRows(rows, empty) {
      const box = $('#rows');
      const key = rows.map((r) => r.key).join() + '|' + empty;
      if (box.dataset.key !== key) {
        box.dataset.key = key;
        box.innerHTML = rows.length ? rows.map((r) => `<div class="obj${r.ref ? ' ref' : ''}"><i></i><span class="n"></span><span class="t"></span><span class="v"></span></div>`).join('') : `<p class="empty">${empty}</p>`;
      }
      rows.forEach((r, i) => { const el = box.children[i]; if (!el || !el.children[1]) return; el.children[1].innerHTML = r.name; el.children[2].textContent = r.t; el.children[3].textContent = r.v; });
    },

    /**
     * L'oculare: il bordo della ruota nel fuoco, con i denti (fermi, in moto lento o sfumati) e il punto
     * luminoso della luce tornata da Montmartre. u: fase della ruota; blur: denti per fotogramma; I: luce (0–1).
     */
    drawEye({ u, blur, I, lit }) {
      const W = eye.width, H = eye.height, cx = H / 2 + 34, cy = H / 2, R = H / 2 - 14, m = modern();
      ec.clearRect(0, 0, W, H);
      ec.fillStyle = '#f7f7f5'; ec.fillRect(0, 0, W, H);
      if (m) { drawCamera(u, blur, I, lit); return; }
      ec.save();
      ec.beginPath(); ec.arc(cx, cy, R, 0, Math.PI * 2); ec.clip();
      ec.fillStyle = '#07080a'; ec.fillRect(cx - R, cy - R, 2 * R, 2 * R);
      // denti: verso l'alto, con il vano centrato sul punto quando u è intero
      const pitch = R * 0.62, base = cy + R * 0.16, tip = cy - R * 0.2, frac = u - Math.round(u);
      if (blur > 0.6) {
        ec.fillStyle = 'rgba(120,96,52,0.55)'; ec.fillRect(cx - R, tip, 2 * R, base - tip);
      } else {
        const gr = ec.createLinearGradient(0, tip, 0, cy + R);
        gr.addColorStop(0, '#7a6234'); gr.addColorStop(1, '#2e2414');
        ec.fillStyle = gr;
        ec.fillRect(cx - R, base, 2 * R, R);
        for (let k = -4; k <= 4; k++) {
          const x0 = cx + (k + 0.25 - frac) * pitch;
          ec.globalAlpha = blur > 0.15 ? 1 - Math.min(1, (blur - 0.15) * 1.6) * 0.5 : 1;
          ec.fillRect(x0, tip, pitch * 0.5, base - tip + 1);
        }
        ec.globalAlpha = 1;
      }
      // luce di ritorno: un punto con alone
      if (I > 0.002) {
        const r = 6 + 34 * Math.sqrt(I);
        const g = ec.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(255,250,236,${Math.min(1, I * 1.6)})`); g.addColorStop(0.25, `rgba(255,232,190,${Math.min(1, I * 1.1)})`); g.addColorStop(1, 'rgba(255,220,170,0)');
        ec.fillStyle = g; ec.beginPath(); ec.arc(cx, cy, r, 0, Math.PI * 2); ec.fill();
      }
      // reticolo
      ec.strokeStyle = 'rgba(200,190,160,0.22)'; ec.lineWidth = 1.2;
      ec.beginPath(); ec.moveTo(cx - R, cy); ec.lineTo(cx + R, cy); ec.moveTo(cx, cy - R); ec.lineTo(cx, cy + R); ec.stroke();
      ec.restore();
      ec.strokeStyle = '#1b1d21'; ec.lineWidth = 6; ec.beginPath(); ec.arc(cx, cy, R + 3, 0, Math.PI * 2); ec.stroke();
      meter(cx + R + 60, I, lit, ['#d99a12', '#ffe8b8']);
    },

    /** Luce all'oculare in funzione della velocità: curva teorica, punti visti, posizione attuale, eclissi segnate. */
    drawPlot({ fMax, trace, theory, cur, marks, eclipses }) {
      const W = plot.width, Hh = plot.height, padL = 64, padB = 40, padT = 18, padR = 16;
      pc.clearRect(0, 0, W, Hh); pc.fillStyle = '#f7f7f5'; pc.fillRect(0, 0, W, Hh);
      // con l'immagine della lampada larga la luce con la ruota in moto può superare il 50 %
      let top = 0.5;
      for (const p of theory || []) top = Math.max(top, p[1]);
      for (const p of trace) top = Math.max(top, p[1]);
      const X1 = fMax, Y1 = Math.min(1, top * 1.1);
      const xOf = (x) => padL + (x / X1) * (W - padL - padR), yOf = (y) => Hh - padB - (y / Y1) * (Hh - padT - padB);
      pc.font = '500 18px "Geist Mono Variable", Consolas, monospace'; pc.fillStyle = '#6b7380';
      const xs = niceStep(X1 / 6);
      pc.textAlign = 'center';
      for (let x = 0; x <= X1 + 1e-9; x += xs) {
        const px = xOf(x);
        pc.strokeStyle = 'rgba(18,21,26,0.08)'; pc.beginPath(); pc.moveTo(px, padT); pc.lineTo(px, Hh - padB); pc.stroke();
        if (px < W - padR - 175) pc.fillText(num(x, xs < 1 ? 1 : 0), px, Hh - 12);
      }
      pc.textAlign = 'right';
      for (let y = 0; y <= Y1 + 1e-9; y += 0.1) {
        const py = yOf(y);
        pc.strokeStyle = y === 0 ? 'rgba(18,21,26,0.3)' : 'rgba(18,21,26,0.08)';
        pc.beginPath(); pc.moveTo(padL, py); pc.lineTo(W - padR, py); pc.stroke();
        pc.fillText(String(Math.round(y * 100)), padL - 8, py + 6);
      }
      pc.textAlign = 'left'; pc.fillStyle = '#9aa1ab'; pc.fillText('luce (%)', padL + 6, padT + 14);
      pc.textAlign = 'right'; pc.fillText('giri al secondo', W - padR, Hh - 12);
      pc.save(); pc.beginPath(); pc.rect(padL, padT - 4, W - padL - padR, Hh - padT - padB + 4); pc.clip();
      for (const f of eclipses || []) { pc.strokeStyle = 'rgba(18,21,26,0.12)'; pc.setLineDash([3, 5]); pc.lineWidth = 1.5; pc.beginPath(); pc.moveTo(xOf(f), padT); pc.lineTo(xOf(f), Hh - padB); pc.stroke(); pc.setLineDash([]); }
      if (theory) {
        pc.strokeStyle = '#15181c'; pc.globalAlpha = 0.55; pc.lineWidth = 1.8; pc.setLineDash([7, 6]);
        pc.beginPath(); theory.forEach(([x, y], i) => (i ? pc.lineTo(xOf(x), yOf(y)) : pc.moveTo(xOf(x), yOf(y)))); pc.stroke();
        pc.setLineDash([]); pc.globalAlpha = 1;
      }
      pc.fillStyle = '#d99a12';
      for (const [x, y] of trace) { pc.beginPath(); pc.arc(xOf(x), yOf(y), 2.6, 0, Math.PI * 2); pc.fill(); }
      for (const m of marks) {
        pc.strokeStyle = '#c2331d'; pc.lineWidth = 2.5; pc.beginPath(); pc.moveTo(xOf(m.f), padT); pc.lineTo(xOf(m.f), Hh - padB); pc.stroke();
      }
      if (cur) { pc.fillStyle = '#c2331d'; pc.beginPath(); pc.arc(xOf(cur.f), yOf(cur.I), 7, 0, Math.PI * 2); pc.fill(); }
      pc.restore();
      pc.strokeStyle = 'rgba(18,21,26,0.35)'; pc.beginPath(); pc.moveTo(padL - 0.5, padT); pc.lineTo(padL - 0.5, Hh - padB); pc.stroke();
    },
    layout() {
      const panel = $('#panel');
      const left = panel.classList.contains('collapsed') ? 0 : panel.getBoundingClientRect().right;
      const metrics = $('#metrics').getBoundingClientRect();
      return { left, metricsTop: metrics.height ? metrics.top : innerHeight };
    },
  };
}
