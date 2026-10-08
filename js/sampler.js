// A small sample-based synth on top of the Web Audio API.
//
// Loads the bank written by tools/build_bank.py (audio/manifest.json + FLAC zones) and plays
// notes at exact audio-clock times.  Each note is   BufferSource -> [lowpass] -> envelope -> level -> pan -> bus.
//   * envelope : attack ramp (the "attack speed" fader, solo instruments only) and release
//   * level    : sound level in dB; kept per voice so the fader can change notes that are already ringing
//   * lowpass  : louder notes are a little brighter, quieter ones darker (as on real instruments)

const REVERB_SECONDS = 1.7;
const MAX_VOICES = 110;
const dbToGain = (db) => Math.pow(10, db / 20);

export class Sampler {
  constructor(ctx) {
    this.ctx = ctx;
    this.banks = {};                // instrument -> [{lo, hi, root, tune, gain, loop, buffer}]
    this.voices = new Set();
    this.brightness = true;         // loudness-dependent lowpass

    // signal path:  voices -> bus[instrument] -> dry/wet -> master -> limiter -> speakers
    this.master = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -4;
    this.limiter.knee.value = 3;
    this.limiter.ratio.value = 14;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.12;
    // final soft clipper: linear below 0.7, smoothly saturating to +/-1, so extreme settings can never clip the DAC
    this.clip = ctx.createWaveShaper();
    const N = 4096, curve = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * 2 - 1, a = Math.abs(x);
      curve[i] = Math.sign(x) * (a < 0.7 ? a : 0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3));
    }
    this.clip.curve = curve;
    this.clip.oversample = '2x';
    this.master.connect(this.limiter).connect(this.clip).connect(ctx.destination);

    this.dry = ctx.createGain();
    this.dry.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(REVERB_SECONDS);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.16;
    this.reverb.connect(this.wet).connect(this.master);

    this.buses = {};
    for (const name of ['piano', 'horn', 'flute', 'trumpet']) {
      const b = ctx.createGain();
      b.connect(this.dry);
      b.connect(this.reverb);
      this.buses[name] = b;
    }
  }

  makeImpulse(seconds) {
    const { ctx } = this;
    const n = Math.floor(ctx.sampleRate * seconds);
    const ir = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / ctx.sampleRate;
        const env = Math.exp(-t / 0.38) * (1 - Math.exp(-t / 0.004));
        lp += 0.35 * ((Math.random() * 2 - 1) - lp);          // darker tail
        d[i] = lp * env;
      }
    }
    return ir;
  }

  setMasterVolume(v) { this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02); }

  async load(base = 'audio/', onProgress = () => {}) {
    const manifest = await (await fetch(`${base}manifest.json`)).json();
    this.fontName = manifest.font;
    const jobs = [];
    for (const [name, zones] of Object.entries(manifest.instruments)) {
      this.banks[name] = zones.map((z) => ({ lo: z.lo, hi: z.hi, root: z.root, tune: z.tune, gain: dbToGain(z.gainDb), loop: z.loop, buffer: null }));
      zones.forEach((z, i) => jobs.push({ name, i, url: base + z.file }));
    }
    let done = 0;
    await Promise.all(jobs.map(async (j) => {
      const data = await (await fetch(j.url)).arrayBuffer();
      this.banks[j.name][j.i].buffer = await this.ctx.decodeAudioData(data);
      onProgress(++done / jobs.length);
    }));
  }

  zoneFor(instr, key) {
    const zones = this.banks[instr];
    for (const z of zones) if (key >= z.lo && key <= z.hi) return z;
    return zones[key < zones[0].lo ? 0 : zones.length - 1];
  }

  /**
   * Schedule one note.
   *   instr   'piano' | 'horn' | 'flute' | 'trumpet'
   *   key     MIDI note number (already transposed/folded)
   *   when    audio-clock start time
   *   dur     sounding length in seconds (gate), release follows
   *   o       { levelDb, phraseDb, attack (s), release (s), pan }   (phraseDb is the phrasing arch's share of the level)
   */
  play(instr, key, when, dur, o) {
    const { ctx } = this;
    const zone = this.zoneFor(instr, key);
    if (!zone || !zone.buffer) return null;
    if (this.voices.size >= MAX_VOICES) this.steal();

    const src = ctx.createBufferSource();
    src.buffer = zone.buffer;
    src.playbackRate.value = Math.pow(2, ((key - zone.root) * 100 + zone.tune) / 1200);
    if (zone.loop) { src.loop = true; src.loopStart = zone.loop[0]; src.loopEnd = zone.loop[1]; }

    let node = src;
    let filter = null;
    if (this.brightness) {
      const f0 = 440 * Math.pow(2, (key - 69) / 12);
      const fc = Math.min(22000, Math.max(700, 8000 * Math.pow(2, (o.levelDb + o.phraseDb) / 9) * Math.sqrt(f0 / 440)));
      if (fc < 17000) {
        filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = fc;
        filter.Q.value = 0.5;
        node.connect(filter);
        node = filter;
      }
    }

    const env = ctx.createGain();
    const level = ctx.createGain();
    level.gain.value = zone.gain * dbToGain(o.levelDb + o.phraseDb);
    node.connect(env);
    env.connect(level);
    let tail = level;
    if (o.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = o.pan;
      level.connect(p);
      tail = p;
    }
    tail.connect(this.buses[instr]);

    const atk = Math.max(0.002, o.attack);
    const rel = Math.max(0.03, o.release);
    const off = when + Math.max(dur, atk + 0.005);
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(1, when + atk);
    env.gain.setValueAtTime(1, off);
    env.gain.setTargetAtTime(0, off, rel / 4);
    const stopAt = off + rel * 1.6;
    src.start(when);
    src.stop(stopAt);

    const voice = { src, env, level, gain: zone.gain, phraseDb: o.phraseDb, tail, filter, end: stopAt, start: when };
    this.voices.add(voice);
    src.onended = () => {
      this.voices.delete(voice);
      try { tail.disconnect(); level.disconnect(); env.disconnect(); filter && filter.disconnect(); } catch (e) { /* already gone */ }
    };
    return voice;
  }

  /** Move the level of every voice already scheduled or ringing, so the fader is felt on held notes. */
  setLiveLevel(levelDb) {
    const t = this.ctx.currentTime;
    for (const v of this.voices) v.level.gain.setTargetAtTime(v.gain * dbToGain(levelDb + v.phraseDb), t, 0.03);
  }

  steal() {
    const t = this.ctx.currentTime;
    let oldest = null;
    for (const v of this.voices) if (!oldest || v.start < oldest.start) oldest = v;
    if (oldest) {
      oldest.env.gain.cancelScheduledValues(t);
      oldest.env.gain.setTargetAtTime(0, t, 0.01);
      try { oldest.src.stop(t + 0.08); } catch (e) { /* ignore */ }
    }
  }

  stopAll(fade = 0.05) {
    const t = this.ctx.currentTime;
    for (const v of this.voices) {
      v.env.gain.cancelScheduledValues(t);
      v.env.gain.setTargetAtTime(0, t, fade / 4);
      try { v.src.stop(t + fade * 2); } catch (e) { /* ignore */ }
    }
  }
}
