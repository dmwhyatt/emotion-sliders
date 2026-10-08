#!/usr/bin/env python3
"""Build the browser sample bank (audio/) from a General-MIDI SoundFont (.sf2 / .sf3).

    python3 tools/build_bank.py [path/to/font.sf3]

Default font: the one bundled with MuseScore 4 ("MS Basic.sf3", MuseScore_General, MIT licence).
Any GM SoundFont whose bank-0 presets 0 (piano), 56 (trumpet), 60 (French horn) and 73 (flute)
hold real samples will work -- e.g. to try a different font, just pass its path.

Output (all mono, 16-bit FLAC, sample-accurate so loop points are exact):
    audio/<instrument>_<n>.flac   one file per SoundFont zone
    audio/manifest.json           key ranges, root keys, loop points and level-equalising gains
    audio/NOTICE.md               attribution (required by the font's licence)
"""
import json
import shutil
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).parent))
from sf2 import SF2  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "audio"
DEFAULT_FONT = Path("/Applications/MuseScore 4.app/Contents/Resources/sound/MS Basic.sf3")

# Per-instrument recipe.  `target_db` is the median RMS level (dBFS) of an instrument's zones, so
# that 0 dB on the "sound level" fader means the same loudness for all three solo instruments --
# the paper calibrated each instrument in dB for the same reason.  Levels *within* an instrument
# keep the SoundFont author's own per-zone attenuation (a flat-RMS keyboard would sound wrong).
INSTRUMENTS = {
    "piano":   dict(program=0,  target_db=-29.0, max_sec=6.0),
    "horn":    dict(program=60, target_db=-26.0, max_sec=None),
    "flute":   dict(program=73, target_db=-26.0, max_sec=None),
    "trumpet": dict(program=56, target_db=-26.0, max_sec=None),
}


def rms_db(x):
    return 20 * np.log10(np.sqrt(np.mean(x.astype(np.float64) ** 2)) + 1e-12)


def zone_info(font, g):
    s = font.samples[g["sampleID"]]
    root = g["overridingRootKey"] if g.get("overridingRootKey", -1) >= 0 else s.root
    tune = g["coarseTune"] * 100 + g["fineTune"] + s.correction
    return s, root, tune, g["initialAttenuation"] / 10.0


def piano_zones(font):
    """One velocity layer ("Piano MF", velocity 64-107) -- L/R halves summed to mono."""
    _, zones = font.preset_zones(0)
    wanted = [g for g in zones if font.samples[g["sampleID"]].name.startswith("Piano MF")
              and g["velRange"] == (64, 107)]
    by_key = {}
    for g in wanted:
        by_key.setdefault(g["keyRange"], []).append(g)
    out = []
    for key_range, pair in sorted(by_key.items()):
        chans, rate = [], None
        for g in pair:
            pcm, ls, le, rate = font.sample_pcm(g["sampleID"], g)
            chans.append(pcm.astype(np.float32) / 32768)
        n = min(len(c) for c in chans)
        mono = sum(c[:n] for c in chans) / len(chans)
        s, root, tune, att = zone_info(font, pair[0])
        out.append(dict(key_range=key_range, pcm=mono, rate=rate, root=root, tune=tune, att=att, loop=None))
    return out


def wind_zones(font, program):
    _, zones = font.preset_zones(program)
    out = []
    for g in sorted(zones, key=lambda z: z["keyRange"]):
        pcm, ls, le, rate = font.sample_pcm(g["sampleID"], g)
        s, root, tune, att = zone_info(font, g)
        loop = (ls / rate, le / rate) if g["sampleModes"] in (1, 3) and le > ls else None
        out.append(dict(key_range=g["keyRange"], pcm=pcm.astype(np.float32) / 32768, rate=rate,
                        root=root, tune=tune, att=att, loop=loop))
    return out


def main():
    font_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_FONT
    if not font_path.exists():
        sys.exit(f"SoundFont not found: {font_path}\nPass a GM .sf2/.sf3 path as the first argument.")
    print(f"reading {font_path} ...")
    font = SF2(str(font_path))
    shutil.rmtree(OUT, ignore_errors=True)
    OUT.mkdir()
    manifest = {"font": font.info.get("INAM", font_path.name), "instruments": {}}
    total = 0
    for name, spec in INSTRUMENTS.items():
        zones = piano_zones(font) if name == "piano" else wind_zones(font, spec["program"])
        # make the key ranges contiguous across the whole MIDI range
        zones.sort(key=lambda z: z["key_range"])
        zones[0]["key_range"] = (0, zones[0]["key_range"][1])
        zones[-1]["key_range"] = (zones[-1]["key_range"][0], 127)
        entries = []
        for z in zones:
            x, rate = z["pcm"], z["rate"]
            if spec["max_sec"] and len(x) > spec["max_sec"] * rate:
                n = int(spec["max_sec"] * rate)
                x = x[:n].copy()
                fade = int(0.5 * rate)
                x[-fade:] *= np.cos(np.linspace(0, np.pi / 2, fade)) ** 2
            z["pcm"] = x
            # level when played at the SoundFont's own zone attenuation: sustained part for winds,
            # first second after the onset for piano
            if z["loop"]:
                seg = x[int(z["loop"][0] * rate):int(z["loop"][1] * rate)]
            else:
                seg = x[int(0.05 * rate):int(1.05 * rate)]
            z["level_db"] = rms_db(seg) - z["att"]
        offset = spec["target_db"] - float(np.median([z["level_db"] for z in zones]))
        for i, z in enumerate(zones):
            x, rate, loop = z["pcm"], z["rate"], z["loop"]
            gain_db = offset - z["att"]
            fn = f"{name}_{i:02d}.flac"
            sf.write(OUT / fn, x, rate, format="FLAC", subtype="PCM_16")
            total += (OUT / fn).stat().st_size
            entries.append(dict(file=fn, lo=int(z["key_range"][0]), hi=int(z["key_range"][1]),
                                root=int(z["root"]), tune=int(z["tune"]), gainDb=round(float(gain_db), 2),
                                loop=[round(loop[0], 5), round(loop[1], 5)] if loop else None,
                                seconds=round(len(x) / rate, 3)))
        manifest["instruments"][name] = entries
        print(f"  {name:8s} {len(entries):3d} zones")
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))
    lic = font_path.with_name(font_path.stem + "_License.md")
    if lic.exists():
        shutil.copy(lic, OUT / "SoundFont_License.md")
    (OUT / "NOTICE.md").write_text(
        f"# Sample attribution\n\nThe samples in this folder were extracted from the SoundFont "
        f"**{manifest['font']}** (`{font_path.name}`), shipped with MuseScore 4 and released under the "
        f"MIT licence -- see `SoundFont_License.md`.\n\nOnly four presets were used (grand piano, French horn, "
        f"flute, trumpet), converted to mono FLAC. Generated by `tools/build_bank.py`.\n")
    print(f"done: {total/1e6:.1f} MB of FLAC in {OUT}")


if __name__ == "__main__":
    main()
