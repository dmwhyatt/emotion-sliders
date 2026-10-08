// Experiment mode: the production task of Bresin & Friberg (2011).
//
// Each participant renders 4 scores x 5 emotions = 20 stimuli in random order.  For every stimulus
// the piece plays (looping) with the faders where the participant left them on the previous one;
// they adjust the faders until the rendering matches the emotion and press "Next".  Only the final
// fader positions are analysed in the paper -- we store those, plus a thinned log of the movements.

import { PARAMS, EMOTIONS, TABLE1, INSTRUMENTS } from './paper.js';

export const SCORE_IDS = ['A02', 'G04', 'P02', 'T01'];
export const EMOTION_COLORS = { neutral: '#9aa7b4', happy: '#f4b53f', scary: '#ef5d5d', peaceful: '#4cc9a0', sad: '#6c8cff' };
const STORE_KEY = 'emotion-sliders.sessions.v1';

// the variables compared with the paper's Table 1 (phrasing is not in the table)
export const COMPARE = [
  { id: 'tempo', name: 'Tempo', unit: 'notes/s', field: 'notesPerSec', digits: 2 },
  { id: 'level', name: 'Sound level', unit: 'dB', field: 'levelDb', digits: 1 },
  { id: 'artic', name: 'Articulation', unit: 'a.u.', field: 'articulation', digits: 2 },
  { id: 'register', name: 'Register', unit: 'MIDI note', field: 'registerMidi', digits: 0 },
  { id: 'timbre', name: 'Instrument', unit: '1 horn · 2 flute · 3 trumpet', field: 'timbre', digits: 2 },
  { id: 'attack', name: 'Attack time', unit: 'ms', field: 'attackMs', digits: 0 },
];

export function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function makeTrials(practice) {
  const t = [];
  for (const score of SCORE_IDS) for (const emotion of EMOTIONS) t.push({ score, emotion });
  const order = shuffle(t).map((x, i) => ({ ...x, index: i + 1, practice: false }));
  if (practice) order.unshift({ score: 'G04', emotion: null, index: 0, practice: true });
  return order;
}

export class Experiment {
  constructor(store, scores) {
    this.store = store;
    this.scores = scores;
    this.session = null;
  }

  begin(participant, practice) {
    this.session = {
      id: `${Date.now()}`,
      participant: participant || 'anonymous',
      startedAt: new Date().toISOString(),
      trials: [],
    };
    this.queue = makeTrials(practice);
    this.i = -1;
    return this.advance();
  }

  get current() { return this.queue[this.i] || null; }
  get total() { return this.queue.filter((t) => !t.practice).length; }

  /** Record the trial that just finished (unless practice), then move to the next one.  Returns it, or null at the end. */
  advance() {
    const cur = this.current;
    if (cur && !cur.practice) this.session.trials.push(this.snapshot(cur));
    this.i++;
    const next = this.current;
    if (next) {
      this.startedAt = performance.now();
      this.store.startLog();
    } else {
      this.finish();
    }
    return next;
  }

  snapshot(trial) {
    const log = this.store.stopLog() || [];
    const v = this.store.values();
    const score = this.scores[trial.score];
    const rec = {};
    for (const p of PARAMS) rec[p.id] = p.record(v[p.id], score);
    return {
      trial: trial.index, score: trial.score, composedEmotion: score.composedEmotion, emotion: trial.emotion,
      seconds: Math.round((performance.now() - this.startedAt) / 100) / 10,
      moves: log.length,
      tempoMultiplier: v.tempo, notesPerSec: rec.tempo, levelDb: rec.level, articulation: rec.artic,
      phrasing: rec.phrasing, transposition: v.register, registerMidi: rec.register,
      timbre: rec.timbre, instrument: INSTRUMENTS[rec.timbre - 1], attackMs: rec.attack,
      log,
    };
  }

  finish() {
    this.session.finishedAt = new Date().toISOString();
    saveSession(this.session);
  }
}

// ---- storage ---------------------------------------------------------------------------------------

export function loadSessions() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch (e) { return []; }
}
export function saveSession(s) {
  try {
    const all = loadSessions();
    all.push(s);
    localStorage.setItem(STORE_KEY, JSON.stringify(all));
  } catch (e) { /* storage full or blocked: downloads still work */ }
}
export function clearSessions() { try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ } }

// ---- export ------------------------------------------------------------------------------------------

export function toCSV(sessions) {
  const cols = ['participant', 'session', 'trial', 'score', 'composed_emotion', 'target_emotion', 'seconds', 'slider_moves',
    'tempo_multiplier', 'tempo_notes_per_sec', 'sound_level_db', 'articulation', 'phrasing', 'transposition_semitones',
    'register_mean_midi', 'timbre_position', 'instrument', 'attack_ms'];
  const rows = [cols.join(',')];
  for (const s of sessions) {
    for (const t of s.trials) {
      const r = [s.participant, s.id, t.trial, t.score, t.composedEmotion, t.emotion, t.seconds, t.moves,
        t.tempoMultiplier, t.notesPerSec, t.levelDb, t.articulation, t.phrasing, t.transposition,
        t.registerMidi, t.timbre, t.instrument, t.attackMs]
        .map((x) => (typeof x === 'number' ? Math.round(x * 1e4) / 1e4 : `"${String(x).replace(/"/g, '""')}"`));
      rows.push(r.join(','));
    }
  }
  return rows.join('\n') + '\n';
}

export function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---- analysis ------------------------------------------------------------------------------------------

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

/** For each variable and emotion: one mean per session (over the scores), plus the grand mean. */
export function summarise(sessions) {
  const out = {};
  for (const c of COMPARE) {
    out[c.id] = {};
    for (const e of EMOTIONS) {
      const perSession = [];
      for (const s of sessions) {
        const vals = s.trials.filter((t) => t.emotion === e).map((t) => t[c.field]);
        if (vals.length) perSession.push({ participant: s.participant, mean: mean(vals), values: vals });
      }
      out[c.id][e] = { perSession, mean: perSession.length ? mean(perSession.map((x) => x.mean)) : null };
    }
  }
  return out;
}

// ---- results view ----------------------------------------------------------------------------------------

const svgEl = (tag, attrs = {}, text) => {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};

/** One small chart per variable: the paper's mean ± 95 % CI (bar) and the participant(s) (dots), per emotion. */
export function renderResults(container, sessions) {
  container.textContent = '';
  const sum = summarise(sessions);
  const many = sessions.length > 1;
  const grid = document.createElement('div');
  grid.className = 'result-grid';
  for (const c of COMPARE) {
    const panel = document.createElement('figure');
    panel.className = 'result-panel';
    const cap = document.createElement('figcaption');
    cap.innerHTML = `<b>${c.name}</b> <span>${c.unit}</span>`;
    panel.append(cap);

    // axis domain
    const paper = TABLE1[c.id];
    let lo = Infinity, hi = -Infinity;
    for (const e of EMOTIONS) {
      lo = Math.min(lo, paper[e][1]); hi = Math.max(hi, paper[e][2]);
      for (const s of sum[c.id][e].perSession) for (const v of s.values) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    }
    if (c.id === 'timbre') { lo = 0.8; hi = 3.2; }
    else if (c.id === 'tempo') { lo = 0; hi *= 1.05; }
    else { const pad = (hi - lo) * 0.06; lo -= pad; hi += pad; }
    const W = 360, rowH = 34, left = 70, right = 12, top = 6, H = top + rowH * 5 + 24;
    const x = (v) => left + ((v - lo) / (hi - lo)) * (W - left - right);
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'rchart', role: 'img', 'aria-label': `${c.name} by emotion` });

    // axis ticks
    const nice = niceTicks(lo, hi, 5);
    for (const t of nice) {
      svg.append(svgEl('line', { x1: x(t), x2: x(t), y1: top, y2: top + rowH * 5, class: 'grid' }));
      svg.append(svgEl('text', { x: x(t), y: top + rowH * 5 + 14, class: 'axis', 'text-anchor': 'middle' }, c.id === 'timbre' ? ({ 1: 'horn', 2: 'flute', 3: 'trumpet' }[t] || '') : fmtTick(t)));
    }
    EMOTIONS.forEach((e, i) => {
      const y = top + rowH * i + rowH / 2;
      const col = EMOTION_COLORS[e];
      svg.append(svgEl('text', { x: left - 8, y: y + 4, class: 'rowlab', 'text-anchor': 'end', fill: col }, e));
      const [m, a, b] = paper[e];
      svg.append(svgEl('rect', { x: x(a), y: y - 8, width: Math.max(2, x(b) - x(a)), height: 16, rx: 3, fill: col, opacity: 0.22 }));
      svg.append(svgEl('line', { x1: x(m), x2: x(m), y1: y - 10, y2: y + 10, stroke: col, 'stroke-width': 2.5 }));
      const cell = sum[c.id][e];
      if (many) for (const s of cell.perSession) svg.append(svgEl('circle', { cx: x(s.mean), cy: y, r: 3, fill: col, opacity: 0.55 }, null));
      else for (const v of (cell.perSession[0]?.values || [])) svg.append(svgEl('circle', { cx: x(v), cy: y, r: 3, fill: 'none', stroke: col, 'stroke-width': 1.5 }));
      if (cell.mean != null) {
        const dot = svgEl('circle', { cx: x(cell.mean), cy: y, r: 6, fill: col, stroke: 'var(--bg)', 'stroke-width': 2 });
        const tip = svgEl('title', {}, `${e}: ${cell.mean.toFixed(c.digits)} (paper ${m.toFixed(c.digits)}, 95% CI ${a.toFixed(c.digits)} to ${b.toFixed(c.digits)})`);
        dot.append(tip);
        svg.append(dot);
      }
    });
    panel.append(svg);
    grid.append(panel);
  }
  container.append(grid);
}

function niceTicks(lo, hi, n) {
  const span = hi - lo;
  const raw = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || mag * 10;
  const out = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(Math.round(t / step) * step);
  return out;
}
const fmtTick = (t) => (Math.abs(t) >= 100 || Number.isInteger(t) ? String(Math.round(t)) : t.toFixed(1));
