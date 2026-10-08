# Seven musical variables

An interactive, real-time version of the production experiment in

> Bresin, R. & Friberg, A. (2011). Emotion rendering in music: Range and characteristic values of seven musical variables. *Cortex, 47*, 1068–1081.

Pick one of the four scores, move seven faders, and hear the music change as you move them. In **Experiment** mode a participant renders all four scores as *happy, sad, scary, peaceful* and *neutral* (20 pieces, random order), and the results are plotted against the paper's Table 1.

Everything runs locally in the browser. No server, no accounts, nothing leaves the laptop.

## Run it

```bash
./start.command        # or double-click it in Finder
```

This starts a tiny static server on `localhost` and opens Chrome. (Opening `index.html` directly does not work: browsers refuse to load audio files from `file://` pages.) Use **Chrome or Edge**; click **Start** once so the browser lets the page make sound.

If you prefer, any static server works: `python3 -m http.server 8765` in this folder, then visit <http://localhost:8765>.

## The seven faders

Left to right, as on the paper's gesture controller (Fig. 2). Each strip shows its name, what the top and bottom mean, a scale, the current value in real units and a one-line caption; hover (or focus) a fader for a longer explanation. Drag, use the arrow keys, or double-click to reset.

| # | Fader | Group | Range | What it does |
|---|-------|-------|-------|--------------|
| 1 | **Tempo** | performance | ×0.1 … ×4 (log) | Speed, shown in notes/s as in the paper. |
| 2 | **Sound level** | performance | −20 … +20 dB (paper: −10 dB = pp, +10 dB = f) | Loudness re. the nominal level (0 dB ≈ between mp and mf); louder notes are slightly brighter. |
| 3 | **Articulation** | performance | 0 (legato) … 3 (staccatissimo) | Sounding length of each note as a share of the time to the next onset: 100 % down to 25 %. Above 1 is the staccato range (Table 1). |
| 4 | **Phrasing** | performance | reverse … forward | Arch in tempo and loudness over each phrase. Middle = none. |
| 5 | **Register** | structure | −24 … +24 semitones | Transposes the whole piece. |
| 6 | **Timbre** | instrument | horn · flute · trumpet | Which instrument plays the melody (accompaniment stays on piano). |
| 7 | **Attack speed** | instrument | instant … 75 % of the note | How fast each solo note swells in, as a share of that note's length (at most 75 % of it and 1000 ms). |

Other controls: score picker, play/pause/stop, loop, volume (not one of the seven variables), *Reset faders*, and *Save WAV* (renders the current setting to a file, handy for comparing renderings side by side).

## Modes

**Explore** – free play with any score. Space bar = play/pause.

**Experiment** – replicates the task of the paper: 4 scores × 5 emotions in random order, the piece starts playing automatically and loops, the faders stay where you left them when you press *Next*, and the final fader positions are recorded (plus a thinned log of slider movements). An optional practice piece comes first; as in the paper it is a separate tune, not one of the four stimulus scores. There is no way back to an earlier piece, and leaving for *Explore* half-way abandons the session (nothing is saved), because Explore shares the faders. By default the numeric readouts are hidden during the task, as the original participants only had physical sliders (and the numbers would give away which score is playing); untick the box on the set-up screen to show them.

At the end you get six small charts (tempo, sound level, articulation, register, instrument, attack time): the paper's mean ± 95 % CI for each emotion as a band, the participant as dots. The attack chart is in ms on the longest solo note of each score, which is how Table 1 reports it (Sec. 3.7); the CSV also has the fader value (% of the note). Finished sessions are kept in the browser's local storage so a whole supervision group can be **pooled** ("Everyone on this computer"). Download as **CSV** (one row per piece) or **JSON** (adds the slider movements). Nothing is uploaded anywhere.

## The scores

`tools/scores/*.ly` are LilyPond transcriptions of the four scores in Fig. 1 (A02 peaceful, G04 happy, P02 scary, T01 sad), made by reading the figure at high zoom. `PRAC.ly` is the practice piece: a short original neutral tune, because the paper's training score came from the same battery as the stimuli and is not available here. They are the single source of truth: `python3 tools/build_scores.py` (needs `lilypond`) regenerates

* `data/scores.json` – what the app plays (each note is `[onset, length, pitch, role, inter-onset interval]`, all in beats);
* `data/midi/*.mid` – MIDI files with three tracks each: *solo melody*, *piano right hand*, *piano left hand*, at the calibrated tempo;
* `tools/scores/png/*.png` – each transcription re-engraved, for proof-reading against the paper's figure.

How it was checked: the re-engraved scores match the figure note for note, with no stray accidentals (any wrong pitch would print one). T01 has **seven** flats, which is easy to miss at this resolution, and it changes every pitch. As a further check, the mean and SD of the top-voice pitch come out at E5 (6.4), E5 (4.3), F♯4 (2.0) and A4 (1.4) semitones for A02, G04, P02 and T01, against the paper's E5 (6.5), E5 (4.4), F♯4 (2) and A4 (1.5) – a close match once you notice the paper's sentence attaches the first three to the wrong score names (it lists them as G04, P02, A02). It is still a hand transcription: if you spot a wrong note, fix the `.ly` and rebuild.

**Who plays what.** As in the paper, the melody goes to a solo instrument and the rest to piano. The paper does not say how the voices were split, so here the **highest note of the treble staff at each onset** is the melody; everything else is piano.

**Tempo calibration.** The paper gives each score's original tempo in notes/s (G04 5.7, P02 5.4, A02 2.4, T01 1.3). We count one "note" per onset instant (simultaneous notes in both hands count once) and set the nominal tempo so each score plays at exactly that rate at ×1.0: 72 BPM (A02), 182 (G04), 140 (P02) and 44 (T01). The tempo fader then reads directly in the units of Table 1.

## The sound

Real-time sampler on the Web Audio API (`js/sampler.js`) with samples of a grand piano, French horn, flute and trumpet taken from the **MuseScore_General** SoundFont that ships with MuseScore 4 (MIT licence, see `audio/NOTICE.md`). Notes are scheduled sample-accurately about 120 ms ahead of the audio clock (`js/engine.js`), so a fader move is heard within a tenth of a second and timing doesn't wobble with UI load. A stress test (G04 at ×4 tempo, legato, faders moving) peaks at 28 simultaneous voices and renders about ten times faster than real time.

This is General-MIDI-class sampling, not the Vienna Symphonic Library the authors used, so don't expect studio realism – the horn, flute and trumpet differ in brightness and attack in the way the paper relies on. To use a different SoundFont (any GM `.sf2`/`.sf3`):

```bash
python3 tools/build_bank.py /path/to/font.sf3     # needs numpy + soundfile; rebuilds audio/
```

## Where the paper left a choice open

Marked `[ours]` in `js/paper.js` / `js/engine.js`:

* **Sound level range ±20 dB.** The paper says ±10 dB (−10 dB = pp, +10 dB = f), but its own Table 1 has a mean of −13.4 dB (CI to −20.5) and +7.8 dB (CI to +15.1), so the real range must have been wider. The scale and readout keep the paper's anchors: pp at −10 dB, between mp and mf at 0 dB, f at +10 dB.
* **Articulation** has an "arbitrary unit" in Table 1 (>1 staccato, <1 legato). We use a 0–3 scale and sounding length = (1 − a/4) × the inter-onset interval, which gives legato = 100 % and staccatissimo = 25 % as the paper describes (the paper defines both against the IOI). A note followed by a rest is never held through the rest, and a note held past the next onset keeps its written length.
* **Phrasing:** the paper gives no numbers (and found no effect of emotion or score on it). We use a sine arch over each phrase, centred so the average tempo and level are unchanged, swinging tempo by 40 % and level by 8 dB at the extremes. Phrase boundaries are per-score (2-bar groups, defined in `tools/build_scores.py`; T01 is only three bars long, so it is a single phrase).
* **Attack speed** is applied to the solo instrument only. As in the paper it is a *percentage* of each note's sounding length (at most 75 % of the note and 1000 ms), so short notes get short attacks and the attack follows tempo. The fader is curved so the typical 5–20 % is easy to hit. Table 1's milliseconds are for the longest note of each score, so that is what the results charts and the CSV report (phrasing is ignored in that conversion).
* **Timbre** snaps to three stops (the paper split the slider into three equal zones: horn [0,1], flute (1,2], trumpet (2,3]).
* **Register** is a plain transposition of the whole piece, as in the paper: every note moves by the same number of semitones. Table 1's MIDI numbers are the resulting mean melody pitch, which is what the readout shows. Notes pushed past the ends of the sampled range are pitch-shifted from the nearest sample, so the extremes (−24, +24) sound artificial, and the lowest piano notes of P02 become inaudible rumbles at −24.
* **Starting positions:** every fader starts at its neutral value (tempo ×1, 0 dB, articulation 1 = the legato/staccato boundary, no phrasing, no transposition, flute, attack 10 % of the note). The paper does not give starting positions for the first piece.
* **Louder = brighter:** a gentle low-pass follows the level, as on real instruments.

## Tests

```bash
npm test        # Node 20+, no dependencies
```

`tests/paper.test.js` pins the app to the paper: Table 1 (re-typed from the paper), the fader ranges and zones, the articulation and attack rules, the tempo calibration of the four scores, the trial structure and the CSV export.

## Layout

```
index.html, css/        the page
js/paper.js             constants: parameter definitions, Table 1
js/params.js            fader state + conversion to physical values
js/mixer.js             the on-screen faders
js/engine.js            real-time sequencer + the performance rules
js/sampler.js           sample playback, envelopes, reverb, limiter
js/experiment.js        experiment mode, CSV/JSON export, results charts
js/app.js               wiring
data/                   scores.json + MIDI files (generated)
audio/                  sample bank (generated; attribution in NOTICE.md)
tools/                  build scripts, LilyPond sources, proofing PNGs
tests/                  `npm test`: checks the app against the paper
```

## Possible next steps

* Higher-quality samples (the sampler takes any bank built by `tools/build_bank.py`).
* More scores from the original BRAMS battery: add a `.ly` file and an entry in `tools/build_scores.py`.
* A physical MIDI fader box via Web MIDI (Chrome/Edge): `ParamStore.setPos(id, u)` is the only entry point needed.
