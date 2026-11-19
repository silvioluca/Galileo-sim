// controls.js — costruttori dei controlli del pannello (cursori, interruttori, selettori a segmenti).
// Ogni controllo vive in un elemento [data-ctl="chiave"], legge e scrive `state` e avvisa con on(chiave).

export function createControls(state, on, root = document) {
  const $ = (s, r = root) => r.querySelector(s);
  const host = (k) => $(`[data-ctl="${k}"]`);
  const ctl = {};

  function slider(key, spec) {
    const el = host(key);
    el.innerHTML = '<div class="row-head"><label></label><output></output></div><div class="inline"><input type="range"></div>';
    const label = $('label', el), out = $('output', el), input = $('input', el);
    const id = `ctl-${key}`;
    input.id = id; label.htmlFor = id;
    if (spec.button) {
      const b = document.createElement('button');
      b.className = 'btn small'; b.textContent = spec.button.text; b.title = spec.button.title;
      b.addEventListener('click', spec.button.click);
      $('.inline', el).appendChild(b);
    }
    const refresh = () => {
      const [min, max, step] = spec.range();
      input.min = min; input.max = max; input.step = step;
      const v = spec.read();
      input.value = v;
      input.style.setProperty('--p', `${((v - min) / (max - min)) * 100}%`);
      label.textContent = spec.label();
      out.innerHTML = spec.text();
      el.classList.toggle('disabled', !!(spec.disabled && spec.disabled()));
    };
    input.addEventListener('input', () => { spec.write(Number(input.value)); refresh(); on(key); });
    ctl[key] = { refresh };
  }

  function toggle(key, text, sub) {
    const el = host(key);
    const b = document.createElement('button');
    b.className = 'toggle'; b.type = 'button'; b.setAttribute('role', 'switch');
    b.innerHTML = `<span>${text}${sub ? `<small>${sub}</small>` : ''}</span><i></i>`;
    el.appendChild(b);
    const refresh = () => { b.classList.toggle('on', !!state[key]); b.setAttribute('aria-checked', !!state[key]); };
    b.addEventListener('click', () => { state[key] = !state[key]; refresh(); on(key); });
    ctl[key] = { refresh };
  }

  /** cols: se indicato, i pulsanti vanno a capo su una griglia con quel numero di colonne. */
  function seg(key, label, options, cols = 0) {
    const el = host(key);
    el.innerHTML = `${label ? `<span class="seg-label">${label}</span>` : ''}<div class="seg" role="radiogroup"></div>`;
    const box = $('.seg', el);
    if (cols) { box.style.gridAutoFlow = 'row'; box.style.gridTemplateColumns = `repeat(${cols}, 1fr)`; }
    const btns = options.map(([v, text, title]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = text; if (title) b.title = title;
      b.addEventListener('click', () => { if (state[key] === v) return; state[key] = v; refresh(); on(key); });
      box.appendChild(b);
      return [v, b];
    });
    const refresh = () => btns.forEach(([v, b]) => { b.classList.toggle('on', state[key] === v); b.setAttribute('aria-checked', state[key] === v); });
    ctl[key] = { refresh };
  }

  /** Riallinea un controllo (o tutti) allo stato corrente. */
  const refresh = (key) => { if (key) { if (ctl[key]) ctl[key].refresh(); } else Object.values(ctl).forEach((c) => c.refresh()); };
  return { slider, toggle, seg, refresh };
}
