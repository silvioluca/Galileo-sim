// tags.js — etichette HTML agganciate a punti della scena 3D.
import * as THREE from 'three';

export class Tags {
  /** @param {HTMLElement} root contenitore a tutto schermo (pointer-events: none) */
  constructor(root) {
    this.root = root;
    this.items = [];
    this._v = new THREE.Vector3();
  }

  /**
   * @param {string} text  @param {string} cls classi aggiuntive ('floor', 'floor alt')
   * @param {(out:THREE.Vector3)=>void} getPos scrive la posizione di mondo
   * @param {()=>boolean} [isVisible]
   */
  add(text, cls, getPos, isVisible) {
    const el = document.createElement('div');
    el.className = `tag hidden ${cls || ''}`;
    el.innerHTML = '<span></span>';
    el.firstChild.textContent = text;
    this.root.appendChild(el);
    const tag = { el, span: el.firstChild, getPos, isVisible, text, shown: false };
    this.items.push(tag);
    return tag;
  }

  setText(tag, text) { if (tag.text !== text) { tag.text = text; tag.span.textContent = text; } }

  update(camera, width, height, enabled = true) {
    const v = this._v;
    for (const t of this.items) {
      let show = enabled && (!t.isVisible || t.isVisible());
      if (show) {
        t.getPos(v);
        v.project(camera);
        if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) show = false;
        else t.el.style.transform = `translate(${((v.x * 0.5 + 0.5) * width).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * height).toFixed(1)}px)`;
      }
      if (show !== t.shown) { t.el.classList.toggle('hidden', !show); t.shown = show; }
    }
  }
}
