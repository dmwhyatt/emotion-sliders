// The seven on-screen faders.  Each strip shows: number + name, what the top and bottom mean,
// a scale, the draggable cap, the current value in real units and a one-line plain-English caption.

import { PARAMS, GROUPS } from './paper.js';

const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export class Mixer {
  /**
   * @param root      container element
   * @param store     ParamStore
   * @param getScore  () => { notesPerSec, meanMelodyPitch }   (readouts depend on the current score)
   * @param onHelp    (param | null) => void    hover / focus -> info bar
   */
  constructor(root, store, getScore, onHelp) {
    this.root = root;
    this.store = store;
    this.getScore = getScore;
    this.onHelp = onHelp;
    this.strips = {};
    this.build();
    store.onChange((id) => this.update(id));
  }

  build() {
    this.root.textContent = '';
    this.root.classList.add('mixer');
    let lastGroup = null;
    let groupEl = null;
    PARAMS.forEach((p, i) => {
      if (p.group !== lastGroup) {
        const g = GROUPS[p.group];
        groupEl = h('div', 'group');
        groupEl.style.setProperty('--accent', g.color);
        groupEl.style.setProperty('--n', String(PARAMS.filter((q) => q.group === p.group).length));
        const head = h('div', 'group-head');
        head.append(h('b', null, g.label), h('span', null, g.note));
        groupEl.append(head, h('div', 'group-strips'));
        this.root.append(groupEl);
        lastGroup = p.group;
      }
      groupEl.querySelector('.group-strips').append(this.buildStrip(p, i + 1));
    });
    this.refresh();
  }

  buildStrip(p, n) {
    const el = h('div', 'strip');
    el.dataset.param = p.id;

    const title = h('div', 'strip-title');
    title.append(h('span', 'badge', String(n)), h('span', 'name', p.name));

    const top = h('div', 'end top');
    top.append(h('b', null, p.top), h('small', null, p.topSub));
    const bottom = h('div', 'end bottom');
    bottom.append(h('b', null, p.bottom), h('small', null, p.bottomSub));

    const track = h('div', 'track');
    track.tabIndex = 0;
    track.setAttribute('role', 'slider');
    track.setAttribute('aria-label', `${p.name}: ${p.caption}`);
    track.setAttribute('aria-orientation', 'vertical');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    const rail = h('div', 'rail');
    const fill = h('div', 'fill');
    const knob = h('div', 'knob');
    knob.append(h('i'));
    const ticks = h('div', 'ticks');
    for (const t of p.ticks) {
      const tk = h('div', `tick${t.value === p.nominalValue ? ' nominal' : ''}`);
      tk.style.bottom = `${p.pos(t.value) * 100}%`;
      tk.append(h('span', null, t.label));
      ticks.append(tk);
    }
    const slot = h('div', 'slot');
    slot.append(ticks, rail, fill, knob);
    track.append(slot);

    const value = h('div', 'value');
    const main = h('span', 'main');
    const unit = h('span', 'unit');
    value.append(main, unit);
    const sub = h('div', 'sub');
    const caption = h('div', 'caption', p.caption);

    el.append(title, top, track, bottom, value, sub, caption);
    this.strips[p.id] = { el, track, knob, fill, main, unit, sub, p };

    this.bindPointer(p, track);
    this.bindKeys(p, track);
    track.addEventListener('dblclick', () => this.store.setValue(p.id, p.defaultValue, 'user'));
    for (const ev of ['pointerenter', 'focus']) el.addEventListener(ev, () => this.onHelp(p), true);
    for (const ev of ['pointerleave', 'blur']) el.addEventListener(ev, () => this.onHelp(null), true);
    return el;
  }

  bindPointer(p, track) {
    const slot = track.querySelector('.slot');
    const toPos = (e) => {
      const r = slot.getBoundingClientRect();
      return 1 - (e.clientY - r.top) / r.height;
    };
    track.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      track.setPointerCapture(e.pointerId);
      track.classList.add('dragging');
      this.store.setPos(p.id, toPos(e), 'user');
      e.preventDefault();
    });
    track.addEventListener('pointermove', (e) => {
      if (track.hasPointerCapture(e.pointerId)) this.store.setPos(p.id, toPos(e), 'user');
    });
    const end = (e) => { track.classList.remove('dragging'); if (track.hasPointerCapture(e.pointerId)) track.releasePointerCapture(e.pointerId); };
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
  }

  bindKeys(p, track) {
    track.addEventListener('keydown', (e) => {
      const big = e.shiftKey ? 5 : 1;
      let step = 0;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') step = 1;
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') step = -1;
      else if (e.key === 'PageUp') step = 10;
      else if (e.key === 'PageDown') step = -10;
      else if (e.key === 'Home') { this.store.setPos(p.id, 1, 'user'); e.preventDefault(); return; }
      else if (e.key === 'End') { this.store.setPos(p.id, 0, 'user'); e.preventDefault(); return; }
      else if (e.key === 'Enter' || e.key === '0') { this.store.setValue(p.id, p.defaultValue, 'user'); e.preventDefault(); return; }
      else return;
      e.preventDefault();
      if (p.discrete) this.store.setValue(p.id, this.store.value(p.id) + Math.sign(step) * (p.id === 'register' ? big : 1), 'user');
      else this.store.setPos(p.id, this.store.pos[p.id] + step * big * 0.01, 'user');
    });
  }

  update(id) {
    const s = this.strips[id];
    if (!s) return;
    const v = this.store.value(id);
    const u = this.store.pos[id];
    s.knob.style.bottom = `${u * 100}%`;
    s.fill.style.height = `${u * 100}%`;
    const r = s.p.read(v, this.getScore());
    s.main.textContent = r.main;
    s.unit.textContent = r.unit;
    s.sub.textContent = r.sub;
    s.track.setAttribute('aria-valuenow', String(Math.round(u * 100)));
    s.track.setAttribute('aria-valuetext', `${r.main} ${r.unit} — ${r.sub}`);
  }

  refresh() { for (const p of PARAMS) this.update(p.id); }
}
