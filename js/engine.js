// The performance engine: a real-time sequencer that turns a score (note list) plus the current
// positions of the seven faders into sound -- the role pDM played in the original experiment.
//
//   * Notes are scheduled ~120 ms ahead on the audio clock (sample-accurate) from a worker-driven
//     25 ms tick, so fader moves are heard within a tenth of a second and timing never wobbles
//     with UI load.
//   * The playhead is integrated from the *current* tempo every tick, so tempo and phrasing changes
//     are smooth even in the middle of a note sequence.

import { INSTRUMENTS } from './paper.js';

export const LOOKAHEAD = 0.12;       // s of audio scheduled ahead
const TICK_MS = 25;
const TAIL_BEATS = 1;                // silent gap at the end of each loop
const PHRASE_TEMPO = 0.40;           // [ours] at full phrasing the tempo swings 40 % between phrase edge and phrase middle
const PHRASE_DB = 8;                 // [ours] ... and the level by 8 dB.  The arch averages to zero, so the tempo and level faders keep their meaning.
const ARCH_MEAN = 2 / Math.PI;       // mean of sin(pi x) over a phrase
const PIANO_RANGE = [21, 108];
const SOLO_RANGE = [36, 105];

// ---- rules shared by real-time playback and the offline renderer ---------------------------------

/** Phrase arch at a beat, centred on zero: slow/soft at phrase edges (< 0), fast/loud in the middle (> 0). */
export function phraseShape(score, beat) {
  for (const [a, b] of score.phrases) {
    if (beat >= a && beat < b) return Math.sin(Math.PI * (beat - a) / (b - a)) - ARCH_MEAN;
  }
  return 0;
}

/** Tempo in beats per second at a (loop-local) beat, given fader values `v`. */
export function rateAt(score, v, beat) {
  return (score.bpm0 / 60) * v.tempo * (1 + PHRASE_TEMPO * v.phrasing * phraseShape(score, beat));
}

function fold(key, [lo, hi]) {
  while (key < lo) key += 12;
  while (key > hi) key -= 12;
  return key;
}

/** How one written note is actually played, for fader values `v`.  Returns sampler.play() arguments. */
export function performNote(score, v, n, rate) {
  const [on, written, midi, role] = n;
  const solo = role === 0;
  const instr = solo ? INSTRUMENTS[v.timbre - 1] : 'piano';
  const key = fold(midi + v.register, solo ? SOLO_RANGE : PIANO_RANGE);

  // articulation: sounding length is a fraction of the written length (legato 100 % .. staccatissimo 25 %)
  const duty = 1 - 0.25 * v.artic;
  let dur = (written / rate) * duty;
  if (duty > 0.97) dur += 0.02;               // legato: let the next note's attack sit on the previous one
  dur = Math.max(dur, 0.045);

  const attack = solo ? Math.min(v.attack / 1000, 0.75 * dur, 1.0) : 0.003;   // [paper] <= 75 % of the note, <= 1000 ms
  const release = Math.min(solo ? 0.14 : 0.32, 0.1 + 0.5 * dur);
  const phraseDb = PHRASE_DB * v.phrasing * phraseShape(score, on);
  const pan = solo ? 0 : Math.max(-0.45, Math.min(0.45, (key - 64) / 70));
  return { instr, key, dur, opts: { levelDb: v.level, phraseDb, attack, release, pan } };
}

// ---- real-time engine ----------------------------------------------------------------------------

export class Engine {
  constructor(ctx, sampler, scores) {
    this.ctx = ctx;
    this.sampler = sampler;
    this.scores = scores;
    this.scoreId = Object.keys(scores)[0];
    this.v = { tempo: 1, level: 0, artic: 1.34, phrasing: 0, register: 0, timbre: 2, attack: 100 };   // physical fader values
    this.loop = true;
    this.playing = false;
    this.onstate = () => {};

    const code = `let id=null;onmessage=e=>{if(e.data==='start'){clearInterval(id);id=setInterval(()=>postMessage(0),${TICK_MS});}else{clearInterval(id);id=null;}};`;
    this.timer = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    this.timer.onmessage = () => this.tick();
  }

  get score() { return this.scores[this.scoreId]; }
  get loopLen() { return this.score.beats + TAIL_BEATS; }

  setScore(id) {
    const was = this.playing;
    this.stop();
    this.scoreId = id;
    this.resumeBeat = 0;
    if (was) this.play();
  }

  /** Set a fader's physical value (see PARAMS in paper.js). */
  set(id, value) {
    this.v[id] = value;
    if (id === 'level') this.sampler.setLiveLevel(value);
  }

  // -- transport --
  async play() {
    if (this.ctx.state !== 'running') await this.ctx.resume();
    if (this.playing) return;
    this.seek(this.resumeBeat || 0);
    this.playing = true;
    this.lastTick = this.ctx.currentTime;
    this.timer.postMessage('start');
    this.onstate('play');
  }

  /** Pause: remember the start of the current bar so playing resumes musically. */
  pause() {
    if (!this.playing) return;
    this.resumeBeat = this.currentBarStart();
    this.halt();
    this.onstate('pause');
  }

  stop() {
    const was = this.playing || this.resumeBeat;
    this.resumeBeat = 0;
    if (this.playing) this.halt();
    this.pos = 0;
    if (was) this.onstate('stop');
  }

  halt() {
    this.playing = false;
    this.timer.postMessage('stop');
    this.sampler.stopAll();
  }

  seek(localBeat) {
    const notes = this.score.notes;
    let i = 0;
    while (i < notes.length && notes[i][0] < localBeat - 1e-6) i++;
    this.idx = i;
    this.loopIdx = 0;
    const r = rateAt(this.score, this.v, localBeat);
    this.pos = localBeat - 0.12 * r;                  // short pre-roll so the first note is scheduled in time
  }

  /** Current loop-local playhead in beats (for the UI), smoothed between ticks. */
  get beat() {
    if (!this.playing) return this.resumeBeat || 0;
    const r = rateAt(this.score, this.v, Math.max(0, this.local(this.pos)));
    const abs = this.pos + (this.ctx.currentTime - this.lastTick) * r;
    return Math.max(0, this.local(abs));
  }

  local(abs) { return abs - Math.floor(abs / this.loopLen) * this.loopLen; }

  currentBarStart() {
    const b = this.beat;
    let start = 0;
    for (const x of this.score.bars) if (x <= b + 1e-6) start = x;
    return start >= this.score.beats ? 0 : start;
  }

  tick() {
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    const dt = Math.min(now - this.lastTick, 0.3);
    this.lastTick = now;
    const sc = this.score;
    const notes = sc.notes;
    const loopLen = this.loopLen;

    let rate = rateAt(sc, this.v, Math.max(0, this.local(this.pos)));
    this.pos += dt * rate;
    rate = rateAt(sc, this.v, Math.max(0, this.local(this.pos)));
    const horizon = this.pos + LOOKAHEAD * rate;

    for (;;) {
      if (this.idx >= notes.length) {
        if (!this.loop) {
          if (this.pos > this.loopIdx * loopLen + sc.beats + 0.5) { this.halt(); this.resumeBeat = 0; this.onstate('stop'); }
          return;
        }
        this.idx = 0;
        this.loopIdx++;
      }
      const n = notes[this.idx];
      const abs = this.loopIdx * loopLen + n[0];
      if (abs >= horizon) break;
      this.idx++;
      if (abs < this.pos - 0.3 * rate) continue;                          // hopelessly late (tab was throttled)
      const when = now + Math.max(0.004, (abs - this.pos) / rate);
      const p = performNote(sc, this.v, n, rateAt(sc, this.v, n[0]));
      this.sampler.play(p.instr, p.key, when, p.dur, p.opts);
    }
  }
}

// ---- offline rendering (WAV export and tests) ----------------------------------------------------

/**
 * Render `loops` passes of a score with fixed fader values `v` into an AudioBuffer, using the
 * same performance rules as the live engine.  `sampler` must be bound to an OfflineAudioContext.
 * Returns { onsets: [{t, beat, key, instr, role}] } so tests can check timing.
 */
export function scheduleOffline(sampler, score, v, loops = 1, startAt = 0.05) {
  const loopLen = score.beats + TAIL_BEATS;
  const events = [];
  const step = 1 / 96;
  // integrate beat -> time through the tempo curve (phrasing makes the rate vary)
  const total = loopLen * loops;
  const times = new Float64Array(Math.ceil(total / step) + 2);
  let t = startAt;
  for (let i = 0; i < times.length; i++) {
    times[i] = t;
    const beat = i * step;
    t += step / rateAt(score, v, beat - Math.floor(beat / loopLen) * loopLen);
  }
  const timeAt = (beat) => {
    const i = Math.floor(beat / step);
    const f = beat / step - i;
    return times[i] + (times[i + 1] - times[i]) * f;
  };
  for (let L = 0; L < loops; L++) {
    for (const n of score.notes) {
      const abs = L * loopLen + n[0];
      const p = performNote(score, v, n, rateAt(score, v, n[0]));
      const when = timeAt(abs);
      sampler.play(p.instr, p.key, when, p.dur, p.opts);
      events.push({ t: when, beat: abs, key: p.key, instr: p.instr, role: n[3], dur: p.dur });
    }
  }
  return { events, endTime: timeAt(total) };
}
