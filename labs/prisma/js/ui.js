// ui.js — pannello dei controlli, riquadro dello spettro (schermo srotolato oppure oculare dello
// spettroscopio), profilo d'intensità, curva di dispersione. Nessuna fisica qui.
import { createControls } from '../../../shared/js/controls.js';

const num = (v, d = 1) => v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
const DEG = Math.PI / 180;

export const fmt = {
  num,
  deg(r, d = 2) { return `${num(r / DEG, d)}°`; },
  /** Angolo in gradi, primi e secondi (lettura del cerchio graduato). */
  dms(r) {
    const s = r < 0 ? '−' : '';
    let t = Math.abs(r / DEG), d = Math.floor(t), m = Math.floor((t - d) * 60), sec = Math.round(((t - d) * 60 - m) * 60);
    if (sec === 60) { sec = 0; m++; }
    if (m === 60) { m = 0; d++; }
    return `${s}${d}° ${String(m).padStart(2, '0')}′ ${String(sec).padStart(2, '0')}″`;
  },
  nm(v) { return `${num(v, v < 100 ? 2 : 1)} nm`; },
  pct(v) { return `${num(v * 100, v < 0.1 ? 1 : 0)} %`; },
  len(m) { return m < 0.01 ? `${num(m * 1000, 1)} mm` : m < 1 ? `${num(m * 100, 1)} cm` : `${num(m, 2)} m`; },
};

/** Passo "tondo" (1–2–5) più vicino a v per difetto. */
export function niceStep(v) {
  const p = 10 ** Math.floor(Math.log10(v)), f = v / p;
  return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p;
}

// curva tonale "Khronos PBR Neutral" e codifica sRGB, come nello shader della scena
function tone(r, g, b, out) {
  const x = Math.min(r, g, b), off = x < 0.08 ? x - 6.25 * x * x : 0.04;
  r -= off; g -= off; b -= off;
  const peak = Math.max(r, g, b);
  if (peak >= 0.76) {
    const d = 0.24, np = 1 - (d * d) / (peak + d - 0.76), k = np / peak;
    r *= k; g *= k; b *= k;
    const t = 1 - 1 / (0.15 * (peak - np) + 1);
    r += (np - r) * t; g += (np - g) * t; b += (np - b) * t;
  }
  const enc = (v) => { v = Math.min(Math.max(v, 0), 1); return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055); };
  out[0] = enc(r); out[1] = enc(g); out[2] = enc(b);
  return out;
}
/** Porta nella gamma sRGB un colore con componenti negative, conservando la luminanza. */
function gamut(c) {
  const Y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], m = Math.min(c[0], c[1], c[2]);
  if (m >= 0 || Y <= 0) return [Math.max(c[0], 0), Math.max(c[1], 0), Math.max(c[2], 0)];
  const k = Y / (Y - m);
  return c.map((v) => Math.max(Y + (v - Y) * k, 0));
}

export function createUI(state, ctx, on) {
  const $ = (s, r = document) => r.querySelector(s);
  const { slider, toggle, seg, refresh } = createControls(state, on);

  seg('mode', '', [['screen', 'Prisma e schermo', 'Il prisma su una piattaforma, lo spettro su uno schermo ad arco'], ['spectro', 'Spettroscopio', 'Collimatore, prisma e cannocchiale su un cerchio graduato']]);
  seg('source', '', ctx.sources.map(([k, s]) => [k, s.name, s.long]), 4);
  slider('monoNm', {
    range: () => [380, 780, 1], read: () => state.monoNm, write: (v) => { state.monoNm = v; },
    label: () => 'Lunghezza d\'onda', text: () => `<i class="swatch" style="background:${ctx.cssColor(state.monoNm)}"></i>${state.monoNm} nm`,
  });
  slider('slitScreen', {
    range: () => [0.2, 3, 0.1], read: () => state.slitScreen, write: (v) => { state.slitScreen = v; },
    label: () => 'Larghezza del fascio', text: () => `${num(state.slitScreen, 1)} mm`,
  });
  slider('slitSpectro', {
    range: () => [0, 200, 1],
    read: () => Math.round((200 * Math.log(state.slitSpectro / 5)) / Math.log(100)),
    write: (v) => { const x = 5 * 100 ** (v / 200); state.slitSpectro = x < 20 ? Math.round(x) : Math.round(x / 5) * 5; },
    label: () => 'Larghezza della fenditura', text: () => `${state.slitSpectro} µm`,
  });
  seg('prism', '', ctx.prisms.map(([k, p]) => [k, p.name]), 2);
  slider('apex', {
    range: () => [10, 80, 1], read: () => state.apex, write: (v) => { state.apex = v; },
    label: () => 'Angolo rifrangente A', text: () => `${state.apex}°`,
  });
  slider('side', {
    range: () => [20, 50, 1], read: () => state.side, write: (v) => { state.side = v; },
    label: () => 'Grandezza', text: () => `lato ${state.side} mm`,
  });
  seg('material', '', ctx.materials.map(([k, m]) => [k, m.name, m.note]), 2);
  slider('psi', {
    range: () => [-90, 90, 0.1], read: () => state.psi, write: (v) => { state.psi = v; },
    label: () => 'Rotazione del prisma', text: () => `${state.psi > 0 ? '+' : state.psi < 0 ? '−' : ''}${num(Math.abs(state.psi), 1)}°`,
    button: { text: 'δ min', title: 'Ruota il prisma fino alla deviazione minima', click: () => on('minDev') },
  });
  slider('radius', {
    range: () => [0.35, 0.8, 0.01], read: () => state.radius, write: (v) => { state.radius = v; },
    label: () => 'Raggio dello schermo', text: () => `${num(state.radius * 100, 0)} cm`,
  });
  slider('theta', {
    range: () => [-20, 160, 0.01], read: () => state.theta, write: (v) => { state.theta = v; },
    label: () => 'Angolo del cannocchiale', text: () => fmt.dms(state.theta * DEG),
  });
  slider('ev', {
    range: () => [-4, 6, 0.5], read: () => state.ev, write: (v) => { state.ev = v; },
    label: () => 'Esposizione', text: () => (state.ev === 0 ? 'automatica' : `${state.ev > 0 ? '+' : '−'}${num(Math.abs(state.ev), 1)} stop`),
  });
  slider('ambient', {
    range: () => [0, 1, 0.01], read: () => state.ambient, write: (v) => { state.ambient = v; },
    label: () => 'Luce ambiente', text: () => (state.ambient < 0.03 ? 'buio' : `${Math.round(state.ambient * 100)} %`),
  });
  toggle('air', 'Luce nell\'aria', 'il fascio reso visibile, come nel fumo');
  toggle('notes', 'Linee di costruzione', 'normali alle facce e angolo di deviazione');
  toggle('labels', 'Etichette');
  seg('quality', 'Qualità di calcolo', [['low', 'Fluida'], ['medium', 'Bilanciata'], ['high', 'Massima']]);

  const chips = (host, list, key) => {
    for (const [id, text, title] of list) {
      const b = document.createElement('button');
      b.className = 'btn'; b.textContent = text; if (title) b.title = title;
      b.addEventListener('click', () => on(key, id));
      host.appendChild(b);
    }
  };
  chips($('#presets'), ctx.presets, 'preset');
  chips($('#views'), ctx.views, 'view');

  $('#fullscreen').addEventListener('click', () => on('fullscreen'));
  $('#zoom-in').addEventListener('click', () => on('zoom', 1));
  $('#zoom-out').addEventListener('click', () => on('zoom', -1));
  $('#zoom-auto').addEventListener('click', () => on('zoom', 0));
  $('#plot-log').addEventListener('click', () => on('plotLog'));
  const setPanel = (show) => {
    $('#panel').classList.toggle('collapsed', !show);
    document.body.classList.toggle('panel-off', !show);
    on('layout');
  };
  $('#hide-panel').addEventListener('click', () => setPanel($('#panel').classList.contains('collapsed')));
  $('#panel-toggle').addEventListener('click', () => setPanel(true));
  $('#scrim').addEventListener('click', () => setPanel(false));
  const lb = $('#lightbox');
  lb.addEventListener('click', (e) => { if (e.target.tagName !== 'A') lb.classList.remove('on'); });
  const view = $('#view'), vc = view.getContext('2d');
  view.addEventListener('click', () => {
    $('img', lb).src = view.toDataURL('image/jpeg', 0.94);
    $('#lb-dl').href = $('img', lb).src;
    $('#lb-cap').textContent = ctx.caption();
    lb.classList.add('on');
  });
  const plot = $('#plot'), pc = plot.getContext('2d');
  const disp = $('#disp-view'), dc = disp.getContext('2d');
  const img = vc.createImageData(view.width, view.height);
  const px = [0, 0, 0];

  return {
    refresh,
    sync() {
      document.querySelectorAll('[data-mode]').forEach((el) => { el.hidden = el.dataset.mode !== state.mode; });
      document.querySelectorAll('[data-src]').forEach((el) => { el.hidden = el.dataset.src !== state.source; });
      document.querySelectorAll('[data-prism]').forEach((el) => { el.hidden = el.dataset.prism !== state.prism; });
      const sp = state.mode === 'spectro';
      $('#live-title').textContent = sp ? 'Oculare' : 'Schermo';
      $('#live-sub').textContent = sp ? ' · nel cannocchiale' : ' · srotolato';
      $('#hint-do').textContent = sp ? 'trascina il prisma o il cannocchiale per ruotarli' : 'trascina il prisma per ruotarlo';
      $('#zoom-auto').classList.toggle('on', state.zoomAuto);
      $('#plot-log').classList.toggle('on', state.plotLog);
    },
    togglePanel() { setPanel($('#panel').classList.contains('collapsed')); },
    setStatus(text, busy) { const s = $('#status'); s.textContent = text; s.classList.toggle('busy', !!busy); },
    setFps(v) { $('#fps').textContent = v; },
    setViewInfo(t) { $('#viewinfo').textContent = t; },
    setMetrics(cells) {
      const m = $('#metrics');
      if (m.children.length !== cells.length) m.innerHTML = cells.map(() => '<div class="cell"><div class="k"></div><div class="v"></div><div class="s"></div></div>').join('');
      cells.forEach((c, i) => {
        const el = m.children[i];
        el.children[0].textContent = c.k; el.children[1].innerHTML = c.v; el.children[2].innerHTML = c.s || '&nbsp;';
        el.title = c.title || ''; el.dataset.p = c.p || 1;
      });
    },
    /** Pulsanti per puntare il cannocchiale sulle righe. lines: [{lam, css}] */
    setAim(lines) {
      const box = $('#aim');
      box.hidden = !lines.length;
      const key = lines.map((l) => l.lam).join();
      if (box.dataset.key === key) return;
      box.dataset.key = key;
      box.innerHTML = '<span>Punta su</span>';
      for (const l of lines) {
        const b = document.createElement('button');
        b.className = 'btn small'; b.title = `Porta il crocicchio sulla riga a ${fmt.nm(l.lam)}`;
        b.innerHTML = `<i style="background:${l.css}"></i>${num(l.lam, 1)}`;
        b.addEventListener('click', () => on('aim', l.lam));
        box.appendChild(b);
      }
    },
    layout() {
      const panel = $('#panel');
      const left = panel.classList.contains('collapsed') ? 0 : panel.getBoundingClientRect().right;
      const metrics = $('#metrics').getBoundingClientRect();
      return { left, metricsTop: metrics.height ? metrics.top : innerHeight };
    },

    /**
     * La vista dello spettro.
     * spec: Float32Array (nb × 3) potenza per radiante; phiA, phiB: finestra angolare;
     * exposure: fattore da potenza a radianza; lines: [{phi, lam}] per le etichette.
     */
    drawView({ mode, spec, nb, phiA, phiB, exposure, ambient, lines, theta }) {
      const W = view.width, Hh = view.height, D = img.data;
      const eyepiece = mode === 'spectro';
      const cx = W / 2, cy = Hh / 2, R = Hh * 0.47;
      // nell'oculare la finestra angolare copre il diametro del cerchio; sullo schermo, visto dall'interno
      // dell'arco, gli angoli crescono verso sinistra
      const x0 = eyepiece ? cx - R : 0, x1 = eyepiece ? cx + R : W, flip = !eyepiece;
      const xOf = (phi) => { const u = (phi - phiA) / (phiB - phiA); return x0 + (flip ? 1 - u : u) * (x1 - x0); };
      // colore di ogni colonna (luce che arriva)
      const col = new Float32Array(W * 3);
      for (let x = 0; x < W; x++) {
        let u = (x + 0.5 - x0) / (x1 - x0);
        if (u < 0 || u >= 1) continue;
        if (flip) u = 1 - u;
        const k = Math.min(Math.floor(u * nb), nb - 1);
        const c = gamut([spec[3 * k] * exposure, spec[3 * k + 1] * exposure, spec[3 * k + 2] * exposure]);
        col[3 * x] = c[0]; col[3 * x + 1] = c[1]; col[3 * x + 2] = c[2];
      }
      const paper = (0.03 + 0.3 * ambient);
      for (let y = 0; y < Hh; y++) {
        // profilo verticale: l'immagine della fenditura (oculare) o la fascia illuminata (schermo)
        const v = (y + 0.5 - cy) / (eyepiece ? R * 0.62 : Hh * 0.2);
        const prof = Math.abs(v) < 0.86 ? 1 : Math.abs(v) > 1.14 ? 0 : 0.5 - 0.5 * Math.sin(((Math.abs(v) - 1) / 0.28) * Math.PI);
        for (let x = 0; x < W; x++) {
          const o = 4 * (y * W + x);
          let r, g, b;
          if (eyepiece) {
            const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / R;
            if (d > 1) { D[o] = 11; D[o + 1] = 12; D[o + 2] = 14; D[o + 3] = 255; continue; }
            const bg = 0.0025 * (1 - d * d * 0.6), vig = 1 - 0.35 * d * d * d * d;
            r = bg + col[3 * x] * prof * vig; g = bg + col[3 * x + 1] * prof * vig; b = bg * 1.1 + col[3 * x + 2] * prof * vig;
          } else {
            r = paper * 0.92 + col[3 * x] * prof; g = paper * 0.915 + col[3 * x + 1] * prof; b = paper * 0.9 + col[3 * x + 2] * prof;
          }
          tone(r, g, b, px);
          D[o] = px[0]; D[o + 1] = px[1]; D[o + 2] = px[2]; D[o + 3] = 255;
        }
      }
      vc.putImageData(img, 0, 0);
      vc.font = '500 17px "Geist Mono Variable", Consolas, monospace';
      vc.textAlign = 'center';
      if (eyepiece) {
        // reticolo a croce e scala
        vc.save();
        vc.beginPath(); vc.arc(cx, cy, R, 0, Math.PI * 2); vc.clip();
        vc.strokeStyle = 'rgba(235,238,242,0.55)'; vc.lineWidth = 1.2;
        const a = R * 0.95;
        vc.beginPath(); vc.moveTo(cx - a * 0.7, cy - a * 0.7); vc.lineTo(cx + a * 0.7, cy + a * 0.7); vc.moveTo(cx + a * 0.7, cy - a * 0.7); vc.lineTo(cx - a * 0.7, cy + a * 0.7); vc.stroke();
        vc.strokeStyle = 'rgba(235,238,242,0.35)';
        const step = niceStep(((phiB - phiA) / DEG) / 8);
        for (let d = Math.ceil(phiA / DEG / step) * step; d <= phiB / DEG; d += step) {
          const x = xOf(d * DEG);
          vc.beginPath(); vc.moveTo(x, cy + R * 0.78); vc.lineTo(x, cy + R * 0.86); vc.stroke();
        }
        vc.restore();
        vc.strokeStyle = 'rgba(255,255,255,0.08)'; vc.lineWidth = 2; vc.beginPath(); vc.arc(cx, cy, R, 0, Math.PI * 2); vc.stroke();
        vc.fillStyle = 'rgba(235,238,242,0.9)'; vc.textAlign = 'left';
        vc.font = '500 19px "Geist Mono Variable", Consolas, monospace';
        vc.fillText(`θ = ${fmt.dms(theta)}`, 16, 30);
        vc.textAlign = 'right'; vc.fillStyle = 'rgba(235,238,242,0.55)';
        vc.fillText(`campo ${num((phiB - phiA) / DEG, (phiB - phiA) / DEG < 1 ? 2 : 1)}°`, W - 16, 30);
      } else {
        // scala in gradi lungo il bordo inferiore, come sulla carta dello schermo
        const span = (phiB - phiA) / DEG, step = niceStep(span / 4.5), minor = step / 5;
        vc.fillStyle = 'rgba(25,28,33,0.75)'; vc.strokeStyle = 'rgba(25,28,33,0.7)'; vc.lineWidth = 1;
        for (let d = Math.ceil(phiA / DEG / minor) * minor; d <= phiB / DEG + 1e-9; d += minor) {
          const x = xOf(d * DEG), major = Math.abs(d / step - Math.round(d / step)) < 1e-6;
          vc.beginPath(); vc.moveTo(x, Hh); vc.lineTo(x, Hh - (major ? 16 : 8)); vc.stroke();
          if (major && x > 24 && x < W - 24) vc.fillText(`${num(d, step < 1 ? (step < 0.1 ? 2 : 1) : 0)}°`, x, Hh - 22);
        }
      }
      // nomi delle righe
      if (lines.length && lines.length <= 12) {
        vc.font = '500 15px "Geist Mono Variable", Consolas, monospace'; vc.textAlign = 'center';
        let lastX = -1e9;
        for (const l of [...lines].sort((p, q) => xOf(p.phi) - xOf(q.phi))) {
          const x = xOf(l.phi);
          if (x < 10 || x > W - 10 || x - lastX < 46) continue;
          if (eyepiece && Math.hypot(x - cx, Hh * 0.18 - cy) > R) continue;
          lastX = x;
          vc.fillStyle = eyepiece ? 'rgba(235,238,242,0.75)' : 'rgba(25,28,33,0.8)';
          vc.fillText(num(l.lam, 1), x, eyepiece ? cy - R * 0.7 : 24);
        }
      }
    },

    /** Profilo d'intensità (luminanza) lungo la finestra angolare. */
    drawPlot({ lum, nb, phiA, phiB, peak, log, colorAt, flip = false }) {
      const W = plot.width, Hh = plot.height, padB = 30, padT = 14, h = Hh - padB - padT;
      pc.clearRect(0, 0, W, Hh);
      pc.fillStyle = '#f7f7f5'; pc.fillRect(0, 0, W, Hh);
      const span = (phiB - phiA) / DEG, step = niceStep(span / 4.5);
      pc.font = '500 19px "Geist Mono Variable", Consolas, monospace'; pc.textAlign = 'center';
      for (let d = Math.ceil(phiA / DEG / step) * step; d <= phiB / DEG + 1e-9; d += step) {
        const u = (d * DEG - phiA) / (phiB - phiA), x = (flip ? 1 - u : u) * W;
        pc.strokeStyle = 'rgba(18,21,26,0.09)'; pc.lineWidth = 1;
        pc.beginPath(); pc.moveTo(x, padT - 4); pc.lineTo(x, Hh - padB); pc.stroke();
        pc.fillStyle = '#6b7380';
        if (x > 34 && x < W - 34) pc.fillText(`${num(d, step < 1 ? (step < 0.1 ? 2 : 1) : 0)}°`, x, Hh - 8);
      }
      pc.textAlign = 'left'; pc.fillStyle = '#9aa1ab'; pc.fillText(log ? 'log I' : 'I', 8, padT + 14);
      const yOf = (v) => Hh - padB - (log ? Math.max(0, 1 + Math.log10(Math.max(v / peak, 1e-9)) / 4) : Math.min(v / peak, 1)) * h;
      // riempimento colorato colonna per colonna: il colore di quella parte dello spettro
      const kOf = (x) => { const u = (x + 0.5) / W; return Math.min(Math.floor((flip ? 1 - u : u) * nb), nb - 1); };
      for (let x = 0; x < W; x++) {
        const k = kOf(x);
        const y = yOf(lum[k]);
        if (y >= Hh - padB - 0.5) continue;
        pc.fillStyle = colorAt(k);
        pc.fillRect(x, y, 1, Hh - padB - y);
      }
      pc.beginPath();
      for (let x = 0; x < W; x++) { const y = yOf(lum[kOf(x)]); if (x) pc.lineTo(x, y); else pc.moveTo(x, y); }
      pc.strokeStyle = '#15181c'; pc.lineWidth = 1.4; pc.stroke();
      pc.strokeStyle = 'rgba(18,21,26,0.35)'; pc.beginPath(); pc.moveTo(0, Hh - padB + 0.5); pc.lineTo(W, Hh - padB + 0.5); pc.stroke();
    },

    /** Curva n(λ) del materiale scelto, con le altre in grigio e le righe della sorgente. */
    drawDispersion({ curves, current, lines, refLam, refN }) {
      const W = disp.width, Hh = disp.height, padL = 62, padB = 34, padT = 14, padR = 14;
      dc.clearRect(0, 0, W, Hh); dc.fillStyle = '#f7f7f5'; dc.fillRect(0, 0, W, Hh);
      const L0 = 380, L1 = 780;
      const cur = curves[current];
      let lo = Infinity, hi = -Infinity;
      for (const v of cur) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      const pad = Math.max((hi - lo) * 0.18, 0.004); lo -= pad; hi += pad;
      const xOf = (l) => padL + ((l - L0) / (L1 - L0)) * (W - padL - padR);
      const yOf = (n) => padT + (1 - (n - lo) / (hi - lo)) * (Hh - padT - padB);
      // banda dello spettro visibile sull'asse
      for (let l = L0; l < L1; l += 2) { dc.fillStyle = ctx.cssColor(l); dc.fillRect(xOf(l), Hh - padB + 2, xOf(l + 2) - xOf(l) + 0.5, 7); }
      dc.font = '500 17px "Geist Mono Variable", Consolas, monospace'; dc.fillStyle = '#6b7380'; dc.textAlign = 'center';
      for (let l = 400; l <= 750; l += 50) dc.fillText(String(l), xOf(l), Hh - 8);
      dc.textAlign = 'right';
      const st = niceStep((hi - lo) / 4);
      for (let n = Math.ceil(lo / st) * st; n <= hi; n += st) {
        dc.strokeStyle = 'rgba(18,21,26,0.07)'; dc.beginPath(); dc.moveTo(padL, yOf(n)); dc.lineTo(W - padR, yOf(n)); dc.stroke();
        dc.fillText(num(n, st < 0.01 ? 3 : 2), padL - 8, yOf(n) + 6);
      }
      // righe della sorgente
      for (const l of lines) { dc.strokeStyle = ctx.cssColor(l); dc.globalAlpha = 0.7; dc.lineWidth = 2; dc.beginPath(); dc.moveTo(xOf(l), padT); dc.lineTo(xOf(l), Hh - padB); dc.stroke(); }
      dc.globalAlpha = 1;
      const path = (arr) => { dc.beginPath(); arr.forEach((n, i) => { const l = L0 + ((L1 - L0) * i) / (arr.length - 1); const x = xOf(l), y = yOf(n); if (i) dc.lineTo(x, y); else dc.moveTo(x, y); }); };
      path(cur); dc.strokeStyle = '#15181c'; dc.lineWidth = 2.4; dc.stroke();
      dc.beginPath(); dc.arc(xOf(refLam), yOf(refN), 5, 0, Math.PI * 2); dc.fillStyle = '#c2331d'; dc.fill();
    },
    setDispNote(t) { $('#disp-note').textContent = t; },
  };
}
