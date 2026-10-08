// Checks that the app still says what Bresin & Friberg (2011), Cortex 47, 1068-1081, says.
//   npm test        (Node 20+; no dependencies)
//
// The numbers below are typed in again from the paper on purpose: they are the reference, so a slip in
// js/paper.js or js/engine.js shows up as a failure rather than being copied along.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PARAM_BY_ID, TABLE1, EMOTIONS, INSTRUMENTS, PARAMS } from '../js/paper.js';
import {
  gateSeconds, attackSeconds, effectiveAttackMs, performNote, offlineLength, scheduleOffline,
} from '../js/engine.js';
import { csvCell, makeTrials, stimulusIds, practiceId, toCSV } from '../js/experiment.js';

const scores = JSON.parse(readFileSync(new URL('../data/scores.json', import.meta.url), 'utf8'));
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);
const fadersAt = (over = {}) => ({ ...Object.fromEntries(PARAMS.map((p) => [p.id, p.defaultValue])), ...over });

// ---- Table 1 (mean, lower 95 % bound, upper 95 % bound) ------------------------------------------------
const PAPER_TABLE1 = {
  tempo:    { happy: [4.984, 4.279, 5.688], scary: [4.446, 2.697, 6.196], neutral: [3.172, 2.773, 3.572], peaceful: [2.227, 1.871, 2.583], sad: [1.333, 1.112, 1.554] },
  level:    { happy: [7.790, 0.480, 15.101], scary: [4.742, -6.005, 15.489], neutral: [-3.657, -10.032, 2.717], peaceful: [-8.508, -15.793, -1.224], sad: [-13.443, -20.546, -6.339] },
  artic:    { happy: [2.234, 1.757, 2.710], scary: [1.976, 1.256, 2.696], neutral: [1.341, 0.978, 1.704], peaceful: [0.687, 0.300, 1.073], sad: [0.647, 0.342, 0.952] },
  register: { happy: [80, 77, 82], scary: [64, 60, 69], neutral: [73, 71, 75], peaceful: [75, 72, 77], sad: [70, 65, 74] },
  timbre:   { happy: [2.456, 2.219, 2.693], scary: [1.824, 1.580, 2.067], neutral: [2.162, 1.905, 2.419], peaceful: [1.985, 1.795, 2.175], sad: [1.912, 1.676, 2.148] },
  attack:   { happy: [60.509, 25.458, 95.559], scary: [317.344, 171.074, 463.615], neutral: [111.360, 60.574, 162.146], peaceful: [294.997, 206.797, 383.198], sad: [370.483, 232.289, 508.677] },
};

test('TABLE1 matches the paper', () => {
  assert.deepEqual(Object.keys(TABLE1).sort(), Object.keys(PAPER_TABLE1).sort());
  for (const [variable, rows] of Object.entries(PAPER_TABLE1)) {
    for (const [emotion, values] of Object.entries(rows)) assert.deepEqual(TABLE1[variable][emotion], values, `${variable}/${emotion}`);
  }
  assert.deepEqual([...EMOTIONS].sort(), ['happy', 'neutral', 'peaceful', 'sad', 'scary']);
});

// ---- the seven faders --------------------------------------------------------------------------------
test('the seven faders are in the order of the paper\'s gesture controller', () => {
  assert.deepEqual(PARAMS.map((p) => p.id), ['tempo', 'level', 'artic', 'phrasing', 'register', 'timbre', 'attack']);
  assert.deepEqual(PARAMS.map((p) => p.group), ['performance', 'performance', 'performance', 'performance', 'structure', 'instrument', 'instrument']);
});

test('tempo runs from 10x slower to 4x faster on a log scale', () => {
  near(PARAM_BY_ID.tempo.value(0), 0.1);
  near(PARAM_BY_ID.tempo.value(1), 4);
  const mid = PARAM_BY_ID.tempo.value(0.5);
  near(mid, Math.sqrt(0.1 * 4), 1e-9);                       // geometric midpoint = logarithmic scale
});

test('register runs from -24 to +24 semitones; timbre has three zones, closed at the top', () => {
  assert.equal(PARAM_BY_ID.register.value(0), -24);
  assert.equal(PARAM_BY_ID.register.value(1), 24);
  const t = PARAM_BY_ID.timbre;
  assert.deepEqual([0, 1 / 3, 0.34, 2 / 3, 0.67, 1].map((u) => t.value(u)), [1, 1, 2, 2, 3, 3]);
  assert.deepEqual(INSTRUMENTS, ['horn', 'flute', 'trumpet']);
});

test('sound level: documented +-20 dB range, with the paper\'s -10 dB = pp and +10 dB = f labelled', () => {
  const l = PARAM_BY_ID.level;
  assert.equal(l.value(0), -20);
  assert.equal(l.value(1), 20);
  assert.equal(l.read(-10).sub, 'pp');
  assert.equal(l.read(10).sub, 'f');
  assert.equal(l.read(0).sub, 'mp – mf');
});

test('attack is a percentage of the note, at most 75 %', () => {
  const a = PARAM_BY_ID.attack;
  near(a.value(1), 0);
  near(a.value(0), 75);
  near(a.pos(a.value(0.3)), 0.3, 1e-12);
});

test('every default is on its fader and round-trips', () => {
  for (const p of PARAMS) {
    const u = p.pos(p.defaultValue);
    assert.ok(u >= 0 && u <= 1, `${p.id} default off the fader`);
    near(p.value(u), p.defaultValue, 1e-9);
  }
});

// ---- performance rules ---------------------------------------------------------------------------------
test('articulation: legato joins notes, staccatissimo is 25 % of the inter-onset interval', () => {
  const rate = 2;                                            // beats per second
  const contiguous = [0, 1, 60, 0, 1];                      // [onset, written, pitch, role, ioi]
  near(gateSeconds(contiguous, 0, rate), 1 / rate + 0.02);   // legato: sounds to the next onset (+ small overlap)
  near(gateSeconds(contiguous, 3, rate), 0.25 / rate);
  const beforeRest = [0, 1, 60, 0, 2];                       // one beat of sound, then one beat of rest
  near(gateSeconds(beforeRest, 3, rate), 0.25 * 2 / rate);   // 25 % of the IOI, not of the written length
  near(gateSeconds(beforeRest, 0, rate), 1 / rate + 0.02);   // legato does not hold the note through the rest
  const held = [0, 4, 60, 0, 1];                             // held past the next onset
  near(gateSeconds(held, 0, rate), 4 / rate + 0.02);
});

test('attack time is a share of the note: scales with its length, <= 75 % of it, <= 1000 ms', () => {
  near(attackSeconds(10, 1), 0.1);
  near(attackSeconds(10, 0.5), 0.05);
  near(attackSeconds(75, 0.4), 0.3);
  near(attackSeconds(75, 100), 1.0);
  assert.ok(attackSeconds(1000, 2) <= 0.75 * 2 + 1e-12);
});

test('Table 1 attack time is measured on the longest note, so it follows tempo', () => {
  for (const id of ['A02', 'G04', 'P02', 'T01']) {
    const s = scores[id];
    const slow = effectiveAttackMs(s, fadersAt({ attack: 8, tempo: 1 }));
    const fast = effectiveAttackMs(s, fadersAt({ attack: 8, tempo: 2 }));
    assert.ok(slow > 0);
    near(slow / fast, 2, 1e-6);
    near(effectiveAttackMs(s, fadersAt({ attack: 0 })), 0);
  }
});

test('register is a plain transposition: no note is folded or dropped', () => {
  for (const id of ['A02', 'G04', 'P02', 'T01']) {
    const s = scores[id];
    for (const reg of [-24, -12, 0, 12, 24]) {
      for (const n of s.notes) {
        const p = performNote(s, fadersAt({ register: reg }), n, 1);
        assert.equal(p.key, n[2] + reg, `${id} note at beat ${n[0]}`);
      }
    }
  }
});

test('the melody goes to the chosen instrument, everything else to piano', () => {
  const s = scores.G04;
  for (const [timbre, name] of [[1, 'horn'], [2, 'flute'], [3, 'trumpet']]) {
    for (const n of s.notes.slice(0, 40)) {
      assert.equal(performNote(s, fadersAt({ timbre }), n, 1).instr, n[3] === 0 ? name : 'piano');
    }
  }
});

test('offline render length follows the tempo curve all the way down to x0.1 (no 90 s cut-off)', () => {
  const s = scores.A02;
  const v = fadersAt({ tempo: 0.1 });
  const len = offlineLength(s, v);
  assert.ok(len > 150, `A02 at x0.1 should run for minutes, got ${len}s`);
  const events = [];
  const { endTime } = scheduleOffline({ play: (...a) => events.push(a) }, s, v);
  near(endTime, len, 1e-9);
  assert.equal(events.length, s.notes.length);
});

// ---- the scores ---------------------------------------------------------------------------------------
test('the four stimulus scores play at the paper\'s notes/s at x1 tempo', () => {
  const paper = { G04: 5.7, P02: 5.4, A02: 2.4, T01: 1.3 };
  assert.deepEqual(stimulusIds(scores).sort(), ['A02', 'G04', 'P02', 'T01']);
  for (const [id, nps] of Object.entries(paper)) {
    const s = scores[id];
    assert.equal(s.notesPerSec, nps);
    const seconds = (s.beats * 60) / s.bpm0;
    near(s.onsetCount / seconds, nps, 0.01);
  }
  assert.deepEqual(['G04', 'P02', 'A02', 'T01'].map((id) => scores[id].composedEmotion), ['happy', 'scary', 'peaceful', 'sad']);
});

test('every note carries its inter-onset interval', () => {
  for (const s of Object.values(scores)) {
    for (const n of s.notes) {
      assert.equal(n.length, 5);
      assert.ok(n[4] > 0);
    }
  }
});

// ---- experiment protocol ----------------------------------------------------------------------------------
test('a session is 4 scores x 5 emotions in random order; the practice piece is not one of the stimuli', () => {
  const ids = stimulusIds(scores);
  const trials = makeTrials(ids, practiceId(scores));
  const practice = trials.filter((t) => t.practice);
  assert.equal(practice.length, 1);
  assert.equal(trials[0].practice, true);
  assert.ok(!ids.includes(practice[0].score), 'the practice score must not be a stimulus');
  const real = trials.filter((t) => !t.practice);
  assert.equal(real.length, 20);
  assert.equal(new Set(real.map((t) => `${t.score}/${t.emotion}`)).size, 20);
  assert.deepEqual(real.map((t) => t.index), [...Array(20).keys()].map((i) => i + 1));
});

test('CSV: text is quoted and spreadsheet formulas are defused', () => {
  assert.equal(csvCell('Sam'), '"Sam"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('=HYPERLINK("http://x","y")'), '"\'=HYPERLINK(""http://x"",""y"")"');
  for (const bad of ['+1', '-1', '@x', '\tx']) assert.ok(csvCell(bad).startsWith('"\''), bad);
  assert.equal(csvCell(1.234567), 1.2346);
  assert.equal(csvCell(null), '""');
  const csv = toCSV([{ participant: '=1+1', id: '1', trials: [] }]);
  assert.ok(csv.startsWith('participant,session,trial,score'));
});
