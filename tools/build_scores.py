#!/usr/bin/env python3
"""Build data/scores.json, data/midi/*.mid and tools/scores/png/*.png from tools/scores/*.ly.

    python3 tools/build_scores.py          (needs `lilypond` on the PATH)

The .ly files are the single source of truth for the four scores (hand-transcribed from Fig. 1 of
Bresin & Friberg, 2011).  LilyPond renders them back to notation (png/) so the transcription can be
proof-read against the paper, and writes the MIDI that this script turns into the app's note lists.

Each note becomes  [onset_beats, duration_beats, midi_pitch, role, ioi_beats]  with role
    0 = solo line (highest note of the treble staff at each onset -> horn / flute / trumpet)
    1 = piano, right hand (the other treble-staff notes)
    2 = piano, left hand (bass staff)
and ioi_beats the inter-onset interval: beats from this note's onset to the next onset on the same
staff (its own duration for the last one).  The paper defines articulation relative to this interval.

The score marked  practice=True  is not one of the paper's four stimuli (see tools/scores/PRAC.ly).
"""
import collections
import json
import shutil
import statistics
import subprocess
import tempfile
from pathlib import Path

import mido

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "scores"
PNG = SRC / "png"
DATA = ROOT / "data"

# The paper (Sec. 2.2) gives each score's original tempo in notes/sec.  We count a "note" as one
# onset instant (simultaneous notes in both hands count once) and set the nominal BPM so the score
# plays at exactly that rate at tempo x1.0.
SCORES = {
    "A02": dict(emotion="peaceful", notes_per_sec=2.4, phrases=[[0, 6], [6, 12], [12, 18]],
                bars=[0, 3, 6, 9, 12, 15, 18]),
    "G04": dict(emotion="happy", notes_per_sec=5.7, phrases=[[0, 8], [8, 16], [16, 24], [24, 32]],
                bars=[0, 4, 8, 12, 16, 20, 24, 28, 32]),
    "P02": dict(emotion="scary", notes_per_sec=5.4, phrases=[[0, 6], [6, 12], [12, 20], [20, 26]],
                bars=[0, 3, 6, 9, 12, 16, 20, 24, 26]),
    # T01 is only three bars long, so the whole piece is one phrase (the others use two-bar phrases)
    "T01": dict(emotion="sad", notes_per_sec=1.3, phrases=[[0, 9]], bars=[0, 3, 6, 9]),
    # practice piece: an original neutral tune, NOT one of the paper's stimuli
    "PRAC": dict(emotion="neutral", notes_per_sec=1.8, phrases=[[0, 8], [8, 16], [16, 24]],
                 bars=[0, 4, 8, 12, 16, 20, 24], practice=True),
}


def read_midi(path):
    mid = mido.MidiFile(path)
    ppq = mid.ticks_per_beat
    tracks = []
    for tr in mid.tracks:
        t, on, notes = 0, {}, []
        for m in tr:
            t += m.time
            if m.type == "note_on" and m.velocity > 0:
                on[m.note] = t
            elif m.type in ("note_off", "note_on") and m.note in on:
                notes.append((on.pop(m.note) / ppq, t / ppq, m.note))
        if notes:
            tracks.append(sorted(notes))
    assert len(tracks) == 2, f"expected treble + bass tracks, got {len(tracks)}"
    return tracks


def assign_roles(rh, lh):
    top = {}
    for on, off, p in rh:
        top[on] = max(top.get(on, 0), p)
    notes = []
    for on, off, p in rh:
        notes.append([round(on, 5), round(off - on, 5), p, 0 if top[on] == p else 1])
    for on, off, p in lh:
        notes.append([round(on, 5), round(off - on, 5), p, 2])
    notes.sort(key=lambda n: (n[0], -n[2]))
    add_ioi(notes)
    return notes


def add_ioi(notes):
    """Append each note's inter-onset interval: beats to the next onset on the same staff
    (treble = roles 0/1, bass = role 2), or the note's own length if nothing follows."""
    def staff(role):
        return 1 if role == 2 else 0

    onsets = {0: sorted({n[0] for n in notes if staff(n[3]) == 0}),
              1: sorted({n[0] for n in notes if staff(n[3]) == 1})}
    for n in notes:
        later = [t for t in onsets[staff(n[3])] if t > n[0] + 1e-6]
        n.append(round(later[0] - n[0], 5) if later else n[1])


def write_split_midi(path, name, notes, bpm):
    ppq = 480
    mid = mido.MidiFile(ticks_per_beat=ppq)
    names = {0: ("Solo melody (top note of treble staff)", 73, 0, 84),
             1: ("Piano right hand (other treble notes)", 0, 1, 64),
             2: ("Piano left hand", 0, 2, 64)}
    for role, (tname, prog, ch, vel) in names.items():
        tr = mido.MidiTrack()
        mid.tracks.append(tr)
        tr.append(mido.MetaMessage("track_name", name=tname, time=0))
        if role == 0:
            tr.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(bpm), time=0))
            tr.append(mido.MetaMessage("text", text=f"{name}: transcribed from Bresin & Friberg (2011) Fig. 1; "
                                                     f"nominal tempo {bpm:.1f} BPM", time=0))
        tr.append(mido.Message("program_change", program=prog, channel=ch, time=0))
        ev = []
        for on, dur, p, r, _ioi in notes:
            if r == role:
                ev.append((round(on * ppq), 1, p))
                ev.append((round((on + dur) * ppq), 0, p))
        ev.sort(key=lambda e: (e[0], e[1]))  # note-offs before note-ons at the same tick
        last = 0
        for tick, is_on, p in ev:
            tr.append(mido.Message("note_on" if is_on else "note_off", note=p, velocity=vel if is_on else 0,
                                   channel=ch, time=tick - last))
            last = tick
    mid.save(path)


def main():
    PNG.mkdir(exist_ok=True)
    (DATA / "midi").mkdir(parents=True, exist_ok=True)
    out = {}
    with tempfile.TemporaryDirectory() as tmp:
        for sid, meta in SCORES.items():
            ly = SRC / f"{sid}.ly"
            subprocess.run(["lilypond", "-dno-point-and-click", "--png", "-dresolution=130", "-o",
                            str(Path(tmp) / sid), str(ly)], check=True, capture_output=True)
            shutil.copy(Path(tmp) / f"{sid}.png", PNG / f"{sid}.png")
            rh, lh = read_midi(Path(tmp) / f"{sid}.midi")
            notes = assign_roles(rh, lh)
            beats = max(n[0] + n[1] for n in notes)
            onsets = len({n[0] for n in notes})
            duration_s = onsets / meta["notes_per_sec"]
            bpm0 = beats * 60 / duration_s
            melody = [n[2] for n in notes if n[3] == 0]
            mean_mel = statistics.fmean(melody)
            out[sid] = dict(
                id=sid, composedEmotion=meta["emotion"], practice=bool(meta.get("practice")), beats=beats, bpm0=round(bpm0, 2),
                notesPerSec=meta["notes_per_sec"], onsetCount=onsets, phrases=meta["phrases"], bars=meta["bars"],
                meanMelodyPitch=round(mean_mel, 2), sdMelodyPitch=round(statistics.pstdev(melody), 2),
                notes=notes)
            write_split_midi(DATA / "midi" / f"{sid}.mid", sid, notes, bpm0)
            print(f"{sid}: {len(notes)} notes ({sum(1 for n in notes if n[3]==0)} solo), {beats:g} beats, "
                  f"{onsets} onsets -> {bpm0:.1f} BPM at {meta['notes_per_sec']} notes/s; "
                  f"melody mean MIDI {mean_mel:.1f} (sd {statistics.pstdev(melody):.1f})")
    (DATA / "scores.json").write_text(json.dumps(out, separators=(",", ":")))
    print(f"wrote {DATA/'scores.json'}")


if __name__ == "__main__":
    main()
