// Constants taken from Bresin & Friberg (2011), "Emotion rendering in music: Range and
// characteristic values of seven musical variables", Cortex 47, 1068-1081.
//
// Everything that is a *choice of ours* rather than a number from the paper is marked  [ours].

export const EMOTIONS = ['neutral', 'happy', 'scary', 'peaceful', 'sad'];

// Table 1: mean, 95 % confidence interval lower and upper bound of the participants' final slider
// settings, per emotion: [mean, lower, upper].  (No values were reported for phrasing: no significant
// effects.)  Attack is in ms on the longest note of each score (Sec. 3.7).  For timbre the paper's two
// descriptions of "which instrument does a mean correspond to" disagree (Table 1 caption: horn < 1.83,
// trumpet > 2.17; Sec. 3.6: horn < 1.5, trumpet > 2.5), so no cut-offs are used here.
export const TABLE1 = {
  tempo:    { unit: 'notes/s', happy: [4.984, 4.279, 5.688], scary: [4.446, 2.697, 6.196], neutral: [3.172, 2.773, 3.572], peaceful: [2.227, 1.871, 2.583], sad: [1.333, 1.112, 1.554] },
  level:    { unit: 'dB',      happy: [7.790, 0.480, 15.101], scary: [4.742, -6.005, 15.489], neutral: [-3.657, -10.032, 2.717], peaceful: [-8.508, -15.793, -1.224], sad: [-13.443, -20.546, -6.339] },
  artic:    { unit: 'a.u.',    happy: [2.234, 1.757, 2.710], scary: [1.976, 1.256, 2.696], neutral: [1.341, 0.978, 1.704], peaceful: [0.687, 0.300, 1.073], sad: [0.647, 0.342, 0.952] },
  register: { unit: 'MIDI',    happy: [80, 77, 82], scary: [64, 60, 69], neutral: [73, 71, 75], peaceful: [75, 72, 77], sad: [70, 65, 74] },
  timbre:   { unit: '1=horn 2=flute 3=trumpet', happy: [2.456, 2.219, 2.693], scary: [1.824, 1.580, 2.067], neutral: [2.162, 1.905, 2.419], peaceful: [1.985, 1.795, 2.175], sad: [1.912, 1.676, 2.148] },
  attack:   { unit: 'ms',      happy: [60.509, 25.458, 95.559], scary: [317.344, 171.074, 463.615], neutral: [111.360, 60.574, 162.146], peaceful: [294.997, 206.797, 383.198], sad: [370.483, 232.289, 508.677] },
};

export const INSTRUMENTS = ['horn', 'flute', 'trumpet'];          // lowest -> highest position
export const INSTRUMENT_LABELS = { horn: 'French horn', flute: 'Flute', trumpet: 'Trumpet' };
export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const midiName = (m) => `${NOTE_NAMES[((Math.round(m) % 12) + 12) % 12]}${Math.floor(Math.round(m) / 12) - 1}`;

const clamp01 = (u) => Math.min(1, Math.max(0, u));
const fmt = (v, d = 1) => (Object.is(Math.round(v * 10 ** d), -0) ? 0 : v).toFixed(d);
const signed = (v, d = 1) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d);

// ---------------------------------------------------------------------------------------------
// The seven variables, in the order of the paper's gesture controller (Fig. 2).
//
// A fader position u runs 0 (bottom) .. 1 (top).  `value(u)` converts it to the physical value,
// `pos(value)` goes back.  `describe(v, score)` returns the readout.
// ---------------------------------------------------------------------------------------------
export const GROUPS = {
  performance: { label: 'Performance', note: 'how the notes are played', color: 'var(--c-perf)' },
  structure:   { label: 'Structure',   note: 'what is played',           color: 'var(--c-struct)' },
  instrument:  { label: 'Instrument',  note: 'the sound of the soloist', color: 'var(--c-instr)' },
};

export const PARAMS = [
  {
    id: 'tempo', group: 'performance', name: 'Tempo',
    help: 'How fast the music goes, measured as notes per second (a note density, as in the paper). The fader is logarithmic: from 10× slower to 4× faster than the written tempo.',
    caption: 'speed: notes per second',
    top: 'FAST', bottom: 'SLOW', topSub: '× 4', bottomSub: '× 0.1',
    // [paper] 10x slower .. 4x faster, logarithmic slider
    value: (u) => 0.1 * Math.pow(40, u),
    pos: (v) => Math.log(v / 0.1) / Math.log(40),
    defaultValue: 1,
    ticks: [0.1, 0.25, 0.5, 1, 2, 4].map((v) => ({ value: v, label: v === 1 ? 'original' : `×${v}` })),
    read: (v, s) => ({ main: fmt(v * s.notesPerSec, 2), unit: 'notes/s', sub: `× ${fmt(v, 2)} the original tempo` }),
    record: (v, s) => v * s.notesPerSec,
  },
  {
    id: 'level', group: 'performance', name: 'Sound level',
    help: 'How loud the music is, in decibels relative to the nominal level (0 dB ≈ between mp and mf). In the paper −10 dB is pp and +10 dB is f; the fader goes further, to ±20 dB, because the paper\'s own Table 1 means reach −13 dB. Louder notes are also a little brighter, as on real instruments.',
    caption: 'loudness in dB',
    top: 'LOUD', bottom: 'SOFT', topSub: '+20 dB', bottomSub: '−20 dB',
    // [paper] says ±10 dB (−10 = pp, 0 = between mp and mf, +10 = f), but its own Table 1 means reach −13.4 dB (CI to −20.5)
    // and +7.8 dB (CI to +15.1).  [ours] ±20 dB; the paper's anchors are labelled on the scale and in the readout.
    value: (u) => -20 + 40 * u,
    pos: (v) => (v + 20) / 40,
    defaultValue: 0,
    ticks: [-20, -10, 0, 10, 20].map((v) => ({ value: v, label: v === 0 ? '0 dB' : v === -10 ? '−10 pp' : v === 10 ? '+10 f' : signed(v, 0) })),
    read: (v) => ({ main: signed(v, 1), unit: 'dB', sub: v < -15 ? 'softer than pp' : v < -7.5 ? 'pp' : v < -2.5 ? 'p – mp' : v < 2.5 ? 'mp – mf' : v < 7.5 ? 'mf – f' : v < 15 ? 'f' : 'louder than f' }),
    record: (v) => v,
  },
  {
    id: 'artic', group: 'performance', name: 'Articulation',
    help: 'How long each note lasts, as a share of the time from its start to the start of the next note. Legato: notes joined with no gap. Staccatissimo: a quarter of that time. As in the paper\'s Table 1, values above 1 are in the staccato range and values below 1 are legato.',
    caption: 'legato ↔ staccato',
    top: 'STACCATISSIMO', bottom: 'LEGATO', topSub: 'short, detached', bottomSub: 'smooth, joined',
    // [paper] legato .. staccatissimo (25 % of the inter-onset interval); Table 1's unit is arbitrary, with >1 = staccato, <1 = legato.
    // [ours] scale 0..3, sounding length = (1 − a/4) × inter-onset interval   (a = 0 → 100 %, a = 3 → 25 %), never longer
    // than the written note.  a = 1 is the paper's legato / staccato boundary.
    value: (u) => 3 * u,
    pos: (v) => v / 3,
    defaultValue: 1,
    ticks: [0, 1, 2, 3].map((v) => ({ value: v, label: `${v}` })),
    read: (v) => ({ main: fmt(v, 2), unit: 'a.u.', sub: v < 0.5 ? 'legato' : v < 1 ? 'legato–portato' : v < 1.8 ? 'detached / non-legato' : v < 2.5 ? 'staccato' : 'staccatissimo' }),
    record: (v) => v,
  },
  {
    id: 'phrasing', group: 'performance', name: 'Phrasing',
    help: 'Shaping each phrase with an arch in speed and loudness. Forward: speed up and get louder towards the middle of the phrase, then relax. Reverse: the opposite. Middle = none.',
    caption: 'forward ↔ reverse arch',
    top: 'FORWARD', bottom: 'REVERSE', topSub: 'accel. + cresc.', bottomSub: 'rall. + decresc.',
    // [paper] reverse .. forward, centre = no effect, range ~2x that of Bresin & Friberg (2000).  [ours] at the extremes the arch swings the tempo by 40 % and the level by 8 dB
    value: (u) => -1 + 2 * u,
    pos: (v) => (v + 1) / 2,
    defaultValue: 0,
    ticks: [-1, 0, 1].map((v) => ({ value: v, label: v === 0 ? 'none' : v > 0 ? 'fwd' : 'rev' })),
    read: (v) => ({ main: signed(v, 2), unit: '', sub: Math.abs(v) < 0.05 ? 'no phrasing' : v > 0 ? 'forward phrasing' : 'reverse phrasing' }),
    record: (v) => v,
  },
  {
    id: 'register', group: 'structure', name: 'Register',
    help: 'Transposes the whole piece up or down, in semitones from the original register (±24 = ±2 octaves). Every note moves by the same amount. The readout also gives the resulting average pitch of the melody.',
    caption: 'pitch: transposition',
    top: 'HIGH', bottom: 'LOW', topSub: '+24 semitones', bottomSub: '−24 semitones',
    // [paper] −24 .. +24 semitones relative to the original register
    value: (u) => Math.round(-24 + 48 * u),
    pos: (v) => (v + 24) / 48,
    defaultValue: 0,
    ticks: [-24, -12, 0, 12, 24].map((v) => ({ value: v, label: v === 0 ? 'original' : signed(v, 0) })),
    read: (v, s) => ({ main: signed(v, 0), unit: 'semitones', sub: `melody centred on ${midiName(s.meanMelodyPitch + v)} (MIDI ${Math.round(s.meanMelodyPitch + v)})` }),
    record: (v, s) => s.meanMelodyPitch + v,
    discrete: true,
  },
  {
    id: 'timbre', group: 'instrument', name: 'Timbre',
    help: 'Which instrument plays the melody (the accompaniment stays on piano): French horn (dark), flute (medium), trumpet (bright), as in the paper.',
    caption: 'soloist: horn · flute · trumpet',
    top: 'TRUMPET', bottom: 'FRENCH HORN', topSub: 'brightest', bottomSub: 'darkest',
    // [paper] 3 zones of equal length: horn [0,1], flute (1,2], trumpet (2,3] (closed at the top).  Fader snaps to the middle of each zone.
    value: (u) => (u <= 1 / 3 ? 1 : u <= 2 / 3 ? 2 : 3),
    pos: (v) => (v - 0.5) / 3,
    defaultValue: 2,
    ticks: [{ value: 1, label: 'horn' }, { value: 2, label: 'flute' }, { value: 3, label: 'trumpet' }],
    read: (v) => ({ main: INSTRUMENT_LABELS[INSTRUMENTS[v - 1]], unit: '', sub: ['dark · warm', 'medium brightness', 'bright · brassy'][v - 1] }),
    record: (v) => v,
    discrete: true,
  },
  {
    id: 'attack', group: 'instrument', name: 'Attack speed',
    help: 'How quickly each solo note reaches full volume, as a share of that note\'s length (never more than 75 % of the note, or 1 second). Up = instant. Down = a slow swell. Short notes therefore get short attacks and long notes long ones, as in the paper.',
    caption: 'note onset: sharp ↔ slow',
    top: 'INSTANT', bottom: 'VERY SLOW', topSub: '0 % of the note', bottomSub: '75 % of the note',
    // [paper] "very slow .. instantaneous".  The attack is a PERCENTAGE of the performed duration of each note, at most 75 %
    // of it and at most 1000 ms.  Table 1 reports it in ms for the longest notes of each score (see effectiveAttackMs in engine.js).
    // [ours] curved scale for resolution at short attacks
    value: (u) => 75 * Math.pow(1 - u, 2),
    pos: (v) => 1 - Math.sqrt(v / 75),
    defaultValue: 10,
    ticks: [0, 5, 10, 20, 40, 75].map((v) => ({ value: v, label: v === 0 ? '0' : `${v} %` })),
    read: (v) => ({ main: fmt(v, v < 10 ? 1 : 0), unit: '% of note', sub: v < 3 ? 'sharp attack' : v < 12 ? 'medium attack' : v < 30 ? 'soft attack' : 'very slow swell' }),
    record: (v) => v,
  },
];

export const PARAM_BY_ID = Object.fromEntries(PARAMS.map((p) => [p.id, p]));

export const clampPos = clamp01;
