// Holds the position of each of the seven faders and converts to physical values.
// Everything that changes a fader -- mouse, keyboard, "reset", a new experiment trial -- goes through here,
// so the engine, the on-screen faders and the experiment log can never disagree.

import { PARAMS, PARAM_BY_ID, clampPos } from './paper.js';

export class ParamStore {
  constructor() {
    this.pos = {};
    this.listeners = new Set();
    this.log = null;                       // when an array: [{t, id, value}] slider-movement log
    this.logStart = 0;
    this.lastLogged = {};
    this.resetAll('init');
  }

  value(id) { return PARAM_BY_ID[id].value(this.pos[id]); }
  values() { return Object.fromEntries(PARAMS.map((p) => [p.id, this.value(p.id)])); }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /** Set a fader by position 0..1. `source` is 'user' | 'reset' | 'trial' | 'init'. */
  setPos(id, u, source = 'user') {
    const p = PARAM_BY_ID[id];
    let value = p.value(clampPos(u));
    // discrete faders (register, timbre) snap to their value
    this.pos[id] = p.discrete ? p.pos(value) : clampPos(u);
    value = p.value(this.pos[id]);
    this.record(id, value, source);
    for (const fn of this.listeners) fn(id, value, source);
  }

  setValue(id, value, source = 'user') { this.setPos(id, PARAM_BY_ID[id].pos(value), source); }

  resetAll(source = 'reset') { for (const p of PARAMS) this.setValue(p.id, p.defaultValue, source); }

  startLog() { this.log = []; this.logStart = performance.now(); this.lastLogged = {}; }
  stopLog() { const l = this.log; this.log = null; return l; }

  record(id, value, source) {
    if (!this.log || source !== 'user') return;
    const t = Math.round(performance.now() - this.logStart);
    const last = this.lastLogged[id];
    if (last && t - last.t < 60) { last.entry.value = value; last.entry.t = t; return; }   // thin out drags
    const entry = { t, id, value };
    this.log.push(entry);
    this.lastLogged[id] = { t, entry };
  }
}
