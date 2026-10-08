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
| 2 | **Sound level** | performance | −20 … +20 dB | Loudness re. the nominal level; louder notes are slightly brighter. |
| 3 | **Articulation** | performance | 0 (legato) … 3 (staccatissimo) | Sounding length of each note: 100 % of its written length down to 25 %. |
| 4 | **Phrasing** | performance | reverse … forward | Arch in tempo and loudness over each phrase. Middle = none. |
| 5 | **Register** | structure | −24 … +24 semitones | Transposes the whole piece. |
| 6 | **Timbre** | instrument | horn · flute · trumpet | Which instrument plays the melody (accompaniment stays on piano). |
| 7 | **Attack speed** | instrument | instant … 1000 ms | How fast each solo note swells in; capped at 75 % of the note. |

Other controls: score picker, play/pause/stop, loop, volume (not one of the seven variables), *Reset faders*, and *Save WAV* (renders the current setting to a file, handy for comparing renderings side by side).

## Modes

**Explore** – free play with any score. Space bar = play/pause.

**Experiment** – replicates the task of the paper: 4 scores × 5 emotions in random order, the piece starts playing automatically and loops, the faders stay where you left them when you press *Next*, and the final fader positions are recorded (plus a thinned log of slider movements). An optional practice piece comes first. By default the numeric readouts are hidden during the task, as the original participants only had physical sliders (and the numbers would give away which score is playing); untick the box on the set-up screen to show them.

At the end you get six small charts (tempo, sound level, articulation, register, instrument, attack time): the paper's mean ± 95 % CI for each emotion as a band, the participant as dots. Finished sessions are kept in the browser's local storage so a whole supervision group can be **pooled** ("Everyone on this computer"). Download as **CSV** (one row per piece) or **JSON** (adds the slider movements). Nothing is uploaded anywhere.

## The scores

`tools/scores/*.ly` are LilyPond transcriptions of the four scores in Fig. 1 (A02 peaceful, G04 happy, P02 scary, T01 sad), made by reading the figure at high zoom. They are the single source of truth: `python3 tools/build_scores.py` (needs `lilypond`) regenerates

* `data/scores.json` – what the app plays;
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

* **Sound level range ±20 dB.** The paper says ±10 dB, but its own Table 1 has a mean of −13.4 dB (CI to −20.5) and +7.8 dB (CI to +15.1), so the real range must have been wider.
* **Articulation** has an "arbitrary unit" in Table 1 (>1 staccato, <1 legato). We use a 0–3 scale and sounding length = (1 − a/4) × written length, which gives legato = 100 % and staccatissimo = 25 % as the paper describes.
* **Phrasing:** the paper gives no numbers (and found no effect of emotion or score on it). We use a sine arch over each phrase, centred so the average tempo and level are unchanged, swinging tempo by 40 % and level by 8 dB at the extremes. Phrase boundaries are per-score (2-bar groups, defined in `tools/build_scores.py`).
* **Attack speed** is applied to the solo instrument only; the fader is curved so the 60–370 ms range of Table 1 is easy to hit.
* **Timbre** snaps to three stops (the paper split the slider into three equal zones).
* **Register** is the transposition of the whole piece; Table 1's MIDI numbers are the resulting mean melody pitch, which is what the readout shows. Notes pushed out of an instrument's range are folded by octaves.
* **Louder = brighter:** a gentle low-pass follows the level, as on real instruments.

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
```

## Possible next steps

* Higher-quality samples (the sampler takes any bank built by `tools/build_bank.py`).
* More scores from the original BRAMS battery: add a `.ly` file and an entry in `tools/build_scores.py`.
* A physical MIDI fader box via Web MIDI (Chrome/Edge): `ParamStore.setPos(id, u)` is the only entry point needed.
