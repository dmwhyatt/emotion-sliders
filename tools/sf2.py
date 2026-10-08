"""Minimal SoundFont 2 reader -- just enough to pull samples + zone data for a few presets.

Used by build_bank.py to turn a GM .sf2 into a small set of WAV files and a JSON manifest that
the browser sampler (js/sampler.js) plays directly. Not a general-purpose SF2 library: modulators
are ignored, and only the generators the sampler uses are resolved.
"""
import io
import struct
from dataclasses import dataclass, field

GEN = {
    0: "startAddrsOffset", 1: "endAddrsOffset", 2: "startloopAddrsOffset", 3: "endloopAddrsOffset",
    4: "startAddrsCoarse", 8: "initialFilterFc", 9: "initialFilterQ", 12: "endAddrsCoarse",
    17: "pan", 33: "delayVolEnv", 34: "attackVolEnv", 35: "holdVolEnv", 36: "decayVolEnv",
    37: "sustainVolEnv", 38: "releaseVolEnv", 41: "instrument", 43: "keyRange", 44: "velRange",
    45: "startloopAddrsCoarse", 48: "initialAttenuation", 50: "endloopAddrsCoarse",
    51: "coarseTune", 52: "fineTune", 53: "sampleID", 54: "sampleModes", 56: "scaleTuning",
    57: "exclusiveClass", 58: "overridingRootKey",
}
# Spec defaults for generators we care about (used when a zone does not set them).
DEFAULTS = {
    "delayVolEnv": -12000, "attackVolEnv": -12000, "holdVolEnv": -12000, "decayVolEnv": -12000,
    "sustainVolEnv": 0, "releaseVolEnv": -12000, "initialFilterFc": 13500, "initialFilterQ": 0,
    "pan": 0, "initialAttenuation": 0, "coarseTune": 0, "fineTune": 0, "scaleTuning": 100,
    "sampleModes": 0,
}


@dataclass
class Sample:
    name: str
    start: int
    end: int
    loop_start: int
    loop_end: int
    rate: int
    root: int
    correction: int
    kind: int


@dataclass
class Zone:
    gens: dict = field(default_factory=dict)


def _chunks(buf, pos, end):
    while pos + 8 <= end:
        cid = buf[pos:pos + 4].decode("latin1")
        size = struct.unpack_from("<I", buf, pos + 4)[0]
        yield cid, pos + 8, size
        pos += 8 + size + (size & 1)


class SF2:
    def __init__(self, path):
        buf = open(path, "rb").read()
        assert buf[:4] == b"RIFF" and buf[8:12] == b"sfbk", "not an SF2 file"
        self.smpl = None
        self.version = (2, 0)
        self.info = {}
        pd = {}
        for cid, p, size in _chunks(buf, 12, len(buf)):
            if cid != "LIST":
                continue
            kind = buf[p:p + 4].decode("latin1")
            if kind == "INFO":
                for c2, p2, s2 in _chunks(buf, p + 4, p + size):
                    if c2 == "ifil":
                        self.version = struct.unpack_from("<HH", buf, p2)
                    else:
                        self.info[c2] = buf[p2:p2 + s2].split(b"\0")[0].decode("latin1", "replace")
            elif kind == "sdta":
                for c2, p2, s2 in _chunks(buf, p + 4, p + size):
                    if c2 == "smpl":
                        mv = memoryview(buf)[p2:p2 + s2]
                        # SF3: smpl holds Ogg Vorbis streams (byte offsets); SF2: int16 PCM frames.
                        self.smpl = mv if self.version[0] >= 3 else mv.cast("h")
            elif kind == "pdta":
                for c2, p2, s2 in _chunks(buf, p + 4, p + size):
                    pd[c2] = (p2, s2)
        self._buf = buf
        self.phdr = self._records(pd["phdr"], 38, "<20sHHHIII")
        self.pbag = self._records(pd["pbag"], 4, "<HH")
        self.pgen = self._records(pd["pgen"], 4, "<Hh")
        self.pgen_raw = self._records(pd["pgen"], 4, "<HBB")
        self.inst = self._records(pd["inst"], 22, "<20sH")
        self.ibag = self._records(pd["ibag"], 4, "<HH")
        self.igen = self._records(pd["igen"], 4, "<Hh")
        self.igen_raw = self._records(pd["igen"], 4, "<HBB")
        self.samples = []
        for r in self._records(pd["shdr"], 46, "<20sIIIIIBbHH"):
            name, st, en, ls, le, rate, root, corr, link, kind = r
            self.samples.append(Sample(name.split(b"\0")[0].decode("latin1"), st, en, ls, le, rate, root, corr, kind))

    def _records(self, loc, size, fmt):
        p, n = loc
        return [struct.unpack_from(fmt, self._buf, p + i * size) for i in range(n // size)]

    # -- zone resolution -------------------------------------------------------------------
    def _zone_gens(self, bags, gens, raw, i):
        """Generator dicts for each zone (bag) of record i in a bag list given by bag index range."""
        out = []
        b0, b1 = bags
        for b in range(b0, b1):
            g0 = self._bag_list[b][0]
            g1 = self._bag_list[b + 1][0]
            z = {}
            for gi in range(g0, g1):
                oper = gens[gi][0]
                name = GEN.get(oper)
                if name is None:
                    continue
                if name in ("keyRange", "velRange"):
                    z[name] = (raw[gi][1], raw[gi][2])
                elif name in ("instrument", "sampleID"):
                    z[name] = struct.unpack("<H", struct.pack("<h", gens[gi][1]))[0]
                else:
                    z[name] = gens[gi][1]
            out.append(z)
        return out

    def preset_zones(self, program, bank=0):
        """Return resolved zones (preset gens merged onto instrument gens) for a preset."""
        for pi, ph in enumerate(self.phdr[:-1]):
            if ph[1] == program and ph[2] == bank:
                break
        else:
            raise KeyError(f"preset {bank}:{program} not found")
        name = ph[0].split(b"\0")[0].decode("latin1")
        self._bag_list = self.pbag
        pzones = self._zone_gens((ph[3], self.phdr[pi + 1][3]), self.pgen, self.pgen_raw, pi)
        global_p = pzones[0] if pzones and "instrument" not in pzones[0] else {}
        resolved = []
        for pz in pzones:
            if "instrument" not in pz:
                continue
            ii = pz["instrument"]
            self._bag_list = self.ibag
            izones = self._zone_gens((self.inst[ii][1], self.inst[ii + 1][1]), self.igen, self.igen_raw, ii)
            global_i = izones[0] if izones and "sampleID" not in izones[0] else {}
            for iz in izones:
                if "sampleID" not in iz:
                    continue
                g = dict(DEFAULTS)
                g.update(global_i)
                g.update(iz)
                # preset-level generators are additive for the ones we use
                for src in (global_p, pz):
                    for k in ("coarseTune", "fineTune", "initialAttenuation", "pan"):
                        if k in src:
                            g[k] = g.get(k, 0) + src[k]
                kr = iz.get("keyRange", global_i.get("keyRange", (0, 127)))
                vr = iz.get("velRange", global_i.get("velRange", (0, 127)))
                pk = pz.get("keyRange", global_p.get("keyRange", (0, 127)))
                pv = pz.get("velRange", global_p.get("velRange", (0, 127)))
                g["keyRange"] = (max(kr[0], pk[0]), min(kr[1], pk[1]))
                g["velRange"] = (max(vr[0], pv[0]), min(vr[1], pv[1]))
                if g["keyRange"][0] > g["keyRange"][1] or g["velRange"][0] > g["velRange"][1]:
                    continue
                resolved.append(g)
        return name, resolved

    def sample_pcm(self, sid, g=None):
        """Return (int16 samples, loop_start, loop_end, rate) for a sample with zone offsets applied.

        Loop points are in frames relative to the first returned sample.
        """
        s = self.samples[sid]
        g = g or {}
        if s.kind & 0x10:  # SF3 / Ogg-compressed: start/end are byte offsets, loops are relative
            import soundfile as sf
            data, rate = sf.read(io.BytesIO(bytes(self.smpl[s.start:s.end])), dtype="int16", always_2d=True)
            return data[:, 0], s.loop_start, s.loop_end, rate
        start = s.start + g.get("startAddrsOffset", 0) + 32768 * g.get("startAddrsCoarse", 0)
        end = s.end + g.get("endAddrsOffset", 0) + 32768 * g.get("endAddrsCoarse", 0)
        ls = s.loop_start + g.get("startloopAddrsOffset", 0) + 32768 * g.get("startloopAddrsCoarse", 0)
        le = s.loop_end + g.get("endloopAddrsOffset", 0) + 32768 * g.get("endloopAddrsCoarse", 0)
        return self.smpl[start:end], ls - start, le - start, s.rate
