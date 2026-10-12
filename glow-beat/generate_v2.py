"""Glow beat v2 — emotional melodic trap / glow style (~2 min, 150 BPM, C# minor).

Layers: supersaw lead, formant "vocal chops", FM bells, wide pad, sliding 808,
layered drums with triplet/32nd hat rolls, FX (risers, reverse crash, drop gaps).
Mastering runs through ffmpeg (compressor -> loudnorm -> limiter).

Usage: python3 generate_v2.py  -> glow_beat_v2.wav / glow_beat_v2.mp3
Only depends on numpy (+ ffmpeg for mastering/mp3).
"""
import shutil
import subprocess
import wave

import numpy as np

SR = 44100
BPM = 150
BEAT = 60 / BPM
BAR = BEAT * 4
STEP = BEAT / 4
rng = np.random.default_rng(2026)

SECTIONS = [("intro", 8), ("hook", 16), ("verse", 16), ("hook", 16),
            ("bridge", 8), ("hook2", 8), ("outro", 4)]
N_BARS = sum(n for _, n in SECTIONS)
LEN = int(N_BARS * BAR * SR) + SR * 4

# C# minor: Amaj7 - B6 - G#m7 - C#m9 (VI - VII - v - i)
CHORDS = [[57, 61, 64, 68], [54, 59, 63, 68], [56, 59, 63, 66], [52, 56, 59, 61, 63]]
ROOTS = [33, 35, 32, 37]  # A1 B1 G#1 C#2


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# ---------------------------------------------------------------- DSP helpers
def spectral(x, fn):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X * fn(f), len(x))


def lowpass(x, fc, order=4):
    return spectral(x, lambda f: 1 / np.sqrt(1 + (f / fc) ** order))


def highpass(x, fc, order=4):
    return spectral(x, lambda f: 1 / np.sqrt(1 + (fc / np.maximum(f, 1e-3)) ** order))


def adsr(n, a, d, s, r):
    e = np.full(n, float(s))
    a, d, r = min(int(a * SR), n), int(d * SR), min(int(r * SR), n)
    e[:a] = np.linspace(0, 1, a, endpoint=False)
    d = min(d, n - a)
    e[a:a + d] = np.linspace(1, s, d, endpoint=False)
    if r:
        e[-r:] *= np.linspace(1, 0, r)
    return e


def saw_blep(freq, n, phase=0.0):
    """Band-limited saw (polyBLEP). freq may be scalar or per-sample array."""
    dt = np.broadcast_to(np.asarray(freq, float) / SR, (n,))
    t = (phase + np.cumsum(dt)) % 1.0
    y = 2 * t - 1
    m1 = t < dt
    x = t[m1] / dt[m1]
    y[m1] -= 2 * x - x * x - 1
    m2 = t > 1 - dt
    x = (t[m2] - 1) / dt[m2]
    y[m2] -= x * x + 2 * x + 1
    return y


def fft_conv(x, h):
    n = len(x) + len(h) - 1
    N = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, N) * np.fft.rfft(h, N), N)[: len(x)]


def make_ir(sec, decay, seed, bright=7000):
    r = np.random.default_rng(seed)
    n = int(sec * SR)
    t = np.arange(n) / SR
    ir = r.standard_normal(n) * np.exp(-t * decay)
    ir = lowpass(ir, bright, 2)
    pd = int(0.02 * SR)
    ir = np.concatenate([np.zeros(pd), ir])
    return ir / np.sqrt(np.sum(ir ** 2))


HALL = (make_ir(3.8, 1.7, 11), make_ir(3.8, 1.7, 12))
ROOM = (make_ir(0.9, 7.0, 13, 9000), make_ir(0.9, 7.0, 14, 9000))


def verb(x, ir, wet):
    return (x * (1 - wet) + fft_conv(x, ir[0]) * wet,
            x * (1 - wet) + fft_conv(x, ir[1]) * wet)


def pingpong(x, time, fb=0.35, taps=4, tone=3500):
    d = int(time * SR)
    l, r = np.zeros_like(x), np.zeros_like(x)
    g = 1.0
    for k in range(1, taps + 1):
        g *= fb
        tgt = l if k % 2 else r
        tgt[d * k:] += x[: len(x) - d * k] * g
    return lowpass(l, tone), lowpass(r, tone)


def haas(x, ms):
    d = int(ms / 1000 * SR)
    y = np.zeros_like(x)
    y[d:] = x[:-d]
    return x, y


def place(buf, sig, t):
    i = int(round(t * SR))
    if i >= len(buf) or i < 0:
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i]


# ---------------------------------------------------------------- instruments
def supersaw(freq, dur, voices=7, spread=0.22, cutoff=5500, a=0.005, r=0.12):
    n = int(dur * SR)
    L, R = np.zeros(n), np.zeros(n)
    t = np.arange(n) / SR
    vib = 1 + 0.003 * np.sin(2 * np.pi * 5.2 * t) * np.clip(t / 0.25, 0, 1)
    for v in range(voices):
        det = (v - (voices - 1) / 2) / ((voices - 1) / 2) * spread
        s = saw_blep(freq * 2 ** (det / 12) * vib, n, rng.uniform())
        pan = 0.5 + 0.45 * (det / spread if spread else 0)
        L += s * np.sqrt(1 - pan)
        R += s * np.sqrt(pan)
    env = adsr(n, a, 0.25, 0.7, r)
    # brightness envelope: blend filtered/unfiltered for a plucky attack
    bright = np.exp(-t * 7)
    Lf, Rf = lowpass(L, cutoff * 0.35), lowpass(R, cutoff * 0.35)
    Lb, Rb = lowpass(L, cutoff), lowpass(R, cutoff)
    L = (Lf * (1 - bright) + Lb * bright) * env / voices
    R = (Rf * (1 - bright) + Rb * bright) * env / voices
    return L, R


VOWELS = {  # formant freqs/bandwidths (female-ish)
    "ah": [(850, 90), (1220, 110), (2810, 170), (3900, 250)],
    "oh": [(500, 80), (880, 100), (2830, 170), (3600, 250)],
    "ee": [(310, 60), (2520, 120), (3150, 200), (4100, 250)],
    "uu": [(350, 60), (850, 90), (2600, 170), (3500, 250)],
}


def vox(freq, dur, vowel="ah", rev=False):
    """Formant-filtered saw + breath = pitched vocal chop."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = freq * (1 + 0.006 * np.sin(2 * np.pi * 5.5 * t) * np.clip(t / 0.15, 0, 1))
    f *= 1 - 0.03 * np.exp(-t * 25)  # scoop into the note
    src = saw_blep(f, n, rng.uniform()) + 0.15 * rng.standard_normal(n)
    gains = [1.0, 0.6, 0.35, 0.2]
    form = VOWELS[vowel]
    y = spectral(src, lambda fr: sum(g * np.exp(-0.5 * ((fr - fc) / bw) ** 2)
                                     for g, (fc, bw) in zip(gains, form)) + 0.02)
    y *= adsr(n, 0.008, 0.05, 0.8, min(0.06, dur / 3))
    y /= np.max(np.abs(y)) + 1e-9
    return y[::-1].copy() if rev else y


def bell(freq, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    mod = np.sin(2 * np.pi * freq * 3.5 * t) * 1.8 * np.exp(-t * 7)
    y = np.sin(2 * np.pi * freq * t + mod) + 0.3 * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t * 5)
    return y * np.exp(-t * 3.2) * adsr(n, 0.002, 0, 1, 0.05)


def pad(notes, dur):
    n = int(dur * SR)
    L, R = np.zeros(n), np.zeros(n)
    for m in notes:
        for k, det in enumerate((-0.14, -0.05, 0.06, 0.15)):
            s = saw_blep(mtof(m) * 2 ** (det / 12), n, rng.uniform())
            if k % 2:
                L += s
            else:
                R += s
    env = adsr(n, 0.45, 0.4, 0.75, 0.6)
    g = 1 / (len(notes) * 2)
    return lowpass(L, 1900) * env * g, lowpass(R, 1900) * env * g


def e808(freq, dur, glide_from=None, glide_time=0.07):
    n = int(dur * SR)
    t = np.arange(n) / SR
    if glide_from is not None:
        f = freq + (glide_from - freq) * np.exp(-t / glide_time * 3)
    else:
        f = freq * (1 + 1.2 * np.exp(-t * 45))
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph)
    s = np.tanh(s * 2.6) * 0.8 + 0.2 * s  # saturated so it translates on phones
    return s * adsr(n, 0.003, 0, 1, 0.06) * (0.35 + 0.65 * np.exp(-t * 0.8))


def kick():
    n = int(0.28 * SR)
    t = np.arange(n) / SR
    f = 52 + 160 * np.exp(-t * 45)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14)
    click = highpass(rng.standard_normal(n), 3000) * np.exp(-t * 400) * 0.6
    return np.tanh((body + click) * 2.0)


def snare():
    n = int(0.32 * SR)
    t = np.arange(n) / SR
    noise = lowpass(highpass(rng.standard_normal(n), 1500), 9000) * np.exp(-t * 16)
    tone = (np.sin(2 * np.pi * 185 * t) + 0.5 * np.sin(2 * np.pi * 330 * t)) * np.exp(-t * 28)
    return np.tanh((noise * 0.9 + tone * 0.8) * 1.4)


def clap():
    n = int(0.4 * SR)
    t = np.arange(n) / SR
    noise = lowpass(highpass(rng.standard_normal(n), 1100), 8000)
    e = np.zeros(n)
    for off in (0.0, 0.009, 0.019, 0.027):
        i = int(off * SR)
        e[i:] += np.exp(-t[: n - i] * 90)
    e += np.exp(-t * 11) * 0.45
    return noise * e * 0.55


def hat(open_=False, tone=8000):
    n = int((0.32 if open_ else 0.05) * SR)
    t = np.arange(n) / SR
    x = highpass(rng.standard_normal(n), tone)
    # metallic partials
    for fr in (3400, 5300, 7100, 8800):
        x += 0.15 * np.sign(np.sin(2 * np.pi * fr * t))
    x = highpass(x, tone)
    return x * np.exp(-t * (10 if open_ else 85)) * 0.6


def rim():
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 1700 * t) * 0.6 + np.sin(2 * np.pi * 820 * t)) * np.exp(-t * 60) * 0.5


def crash(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return highpass(rng.standard_normal(n), 5000) * np.exp(-t * 1.6) * 0.35


def riser(dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal(n)
    lo, hi = lowpass(x, 1200), highpass(x, 3500)
    p = (t / dur)
    return (lo * (1 - p) + hi * p) * p ** 2 * 0.35


# ---------------------------------------------------------------- composition
# Hook lead (original), 4-bar loop, (step, midi, len in 16ths)
HOOK = [(0, 80, 2), (2, 83, 2), (4, 85, 3), (7, 83, 1), (8, 80, 3), (11, 78, 1), (12, 80, 4),
        (16, 80, 2), (18, 83, 2), (20, 87, 3), (23, 85, 2), (25, 83, 2), (27, 80, 5),
        (32, 80, 2), (34, 83, 2), (36, 85, 3), (39, 88, 3), (42, 87, 2), (44, 85, 4),
        (48, 83, 3), (51, 85, 3), (54, 83, 2), (56, 80, 3), (59, 78, 2), (61, 80, 3)]
# Vocal chop motif: (step, chord-tone index from top, vowel)
CHOP = [(0, 0, "ah"), (3, 1, "oh"), (6, 0, "ee"), (10, 2, "ah"), (12, 1, "uu"), (14, 0, "oh")]
ARP = [3, -1, 1, 2, -1, 3, 0, 2, -1, 3, 1, -1, 2, 3, -1, 1]

buses = {k: np.zeros(LEN) for k in ("kick", "drums", "bass", "pad_l", "pad_r", "lead_l", "lead_r",
                                     "vox", "bell", "fx")}
kick_times = []
section_at = []  # (start_time, name)

bar = 0
for name, nb in SECTIONS:
    section_at.append((bar * BAR, name))
    for b in range(nb):
        t0 = bar * BAR
        ci = bar % 4
        chord = CHORDS[ci]
        last = b == nb - 1
        full = name in ("hook", "hook2")
        drop_gap = name == "bridge" and last  # last beat silent before the final hook

        # ---- pad
        pl, pr = pad(chord, BAR + 0.5)
        place(buses["pad_l"], pl, t0)
        place(buses["pad_r"], pr, t0)

        # ---- bells
        if name in ("intro", "verse", "hook", "hook2", "outro"):
            for s, idx in enumerate(ARP):
                if idx < 0 or (name == "verse" and s % 2):
                    continue
                m = sorted(chord)[min(idx, len(chord) - 1)] + 12
                place(buses["bell"], bell(mtof(m), 1.0) * (0.5 if s % 4 == 0 else 0.33), t0 + s * STEP)

        # ---- vocal chops
        if name != "verse" or b % 2 == 1:
            top = sorted(chord)[::-1]
            for s, idx, vw in CHOP:
                if name == "verse" and s > 8:
                    continue
                m = top[idx] + 12
                if name == "bridge":
                    m -= 12
                ln = STEP * (3 if s in (0, 3, 6, 10) else 2)
                place(buses["vox"], vox(mtof(m), ln, vw) * 0.55, t0 + s * STEP)
            if b % 4 == 3:  # reversed chop sweeping into the next loop
                place(buses["vox"], vox(mtof(top[0] + 12), BEAT, "ah", rev=True) * 0.45, t0 + 12 * STEP)

        # ---- supersaw lead
        if full or name == "bridge":
            ls = (b % 4) * 16
            for st, m, ln in HOOK:
                if ls <= st < ls + 16:
                    tt = t0 + (st - ls) * STEP
                    if drop_gap and st - ls >= 12:
                        continue
                    cut = 2200 if name == "bridge" else 6000
                    L_, R_ = supersaw(mtof(m), ln * STEP + 0.15, cutoff=cut)
                    g = 0.55
                    place(buses["lead_l"], L_ * g, tt)
                    place(buses["lead_r"], R_ * g, tt)
                    if name == "hook2":  # octave-down double for the last hook
                        L2, R2 = supersaw(mtof(m - 12), ln * STEP + 0.15, voices=5, cutoff=3000)
                        place(buses["lead_l"], L2 * 0.3, tt)
                        place(buses["lead_r"], R2 * 0.3, tt)

        # ---- drums
        if name in ("hook", "verse", "hook2"):
            if full:
                kpat = [0, 6, 10] if b % 2 == 0 else [0, 3, 10, 13]
            else:
                kpat = [0, 7, 11] if b % 2 == 0 else [0, 10, 14]
            for s in kpat:
                place(buses["kick"], kick() * 0.95, t0 + s * STEP)
                kick_times.append(t0 + s * STEP)
            for s in (8,):
                place(buses["drums"], snare() * 0.5, t0 + s * STEP)
                place(buses["drums"], clap() * 0.75, t0 + s * STEP + 0.003)
            if b % 4 == 3:
                place(buses["drums"], snare() * 0.22, t0 + 14 * STEP)
                place(buses["drums"], snare() * 0.3, t0 + 15 * STEP)
            # rim percs on off-beats (bounce)
            for s in (5, 13) if b % 2 else (3, 11):
                place(buses["drums"], rim() * 0.35, t0 + s * STEP)

        if name in ("hook", "verse", "hook2", "bridge"):
            # hats: 16ths in hooks, 8ths+bounce in verse, roll fills
            s = 0.0
            roll_zone = {0: None, 1: (12, 16, 0.5), 2: (6, 8, 1 / 3), 3: (10, 16, 1 / 3)}[b % 4]
            if name == "bridge":
                roll_zone = (12, 16, 0.25) if b >= nb - 2 else None
            while s < 16 - 1e-6:
                if drop_gap and s >= 12:
                    break
                tt = t0 + s * STEP + rng.normal(0, 0.002)
                if roll_zone and roll_zone[0] <= s < roll_zone[1]:
                    prog = (s - roll_zone[0]) / (roll_zone[1] - roll_zone[0])
                    tone = 7000 + 4000 * prog if b % 4 == 3 else 8000
                    place(buses["drums"], hat(tone=tone) * (0.22 + 0.18 * prog), tt)
                    s += roll_zone[2]
                    continue
                accent = 0.42 if int(s) % 4 == 0 else 0.28
                accent *= rng.uniform(0.8, 1.0)
                if name == "bridge" and int(s) % 4:
                    s += 2
                    continue
                place(buses["drums"], hat() * accent, tt)
                s += 1 if full else (2 if int(s) % 4 == 0 else 1) if b % 2 else 2
            if full and b % 2 == 1:
                place(buses["drums"], hat(open_=True) * 0.22, t0 + 14 * STEP)

        # ---- 808 (sliding)
        if name in ("hook", "verse", "hook2"):
            r = mtof(ROOTS[ci])
            prev = mtof(ROOTS[(ci - 1) % 4])
            if full:
                notes = [(0, 6, r, prev), (6, 4, r, None), (10, 3, r * 2, r), (13, 3, r, r * 2)]
            else:
                notes = [(0, 7, r, prev), (7, 3, r, None), (11, 5, r * 2 ** (7 / 12), r)]
            for st, ln, f, gl in notes:
                place(buses["bass"], e808(f, ln * STEP + 0.02, glide_from=gl), t0 + st * STEP)
        if name == "outro" and b < 2:
            place(buses["bass"], e808(mtof(ROOTS[ci]), BAR * 0.9), t0)

        # ---- FX
        next_name = None
        idx_sec = [n for n, _ in SECTIONS].index(name) if name in [n for n, _ in SECTIONS] else 0
        if last:
            place(buses["fx"], riser(BAR), t0)
            rc = crash(BEAT * 2)[::-1].copy()
            place(buses["fx"], rc * 0.8, t0 + BAR - len(rc) / SR)
        if b == 0 and name in ("hook", "verse", "hook2"):
            place(buses["fx"], crash(), t0)
        bar += 1

# ---------------------------------------------------------------- mixing
def sidechain(depth, rel=0.18):
    sc = np.ones(LEN)
    n = int(0.3 * SR)
    curve = 1 - depth * np.exp(-np.arange(n) / SR / rel * 3)
    for kt in kick_times:
        i = int(kt * SR)
        j = min(LEN, i + n)
        sc[i:j] = np.minimum(sc[i:j], curve[: j - i])
    return sc


def ramp(points):
    """Piecewise-linear automation over the timeline: [(time, value), ...]."""
    tt = np.arange(LEN) / SR
    xs, ys = zip(*points)
    return np.interp(tt, xs, ys)


def sweep(x, amount):
    """Filter automation: amount 0 = dark (lp 500), 1 = open."""
    dark, mid = lowpass(x, 500), lowpass(x, 1800)
    a = np.clip(amount, 0, 1)
    return np.where(a < 0.5, dark + (mid - dark) * (a * 2), mid + (x - mid) * (a * 2 - 1))


intro_end = SECTIONS[0][1] * BAR
bridge_start = sum(n for _, n in SECTIONS[:4]) * BAR
bridge_end = bridge_start + SECTIONS[4][1] * BAR
end_t = N_BARS * BAR
filt = ramp([(0, 0.0), (intro_end - BAR, 0.65), (intro_end, 1.0),
             (bridge_start, 1.0), (bridge_start + 0.01, 0.35), (bridge_end - BAR, 0.6),
             (bridge_end, 1.0), (end_t - 4 * BAR, 1.0), (end_t, 0.2), (LEN / SR, 0.2)])

sc_heavy, sc_light = sidechain(0.6), sidechain(0.3)

kick_bus = buses["kick"]
bass_bus = lowpass(buses["bass"], 900) * 0.8
# duck 808 under kick a little so they don't fight
bass_bus *= sidechain(0.35, 0.06)

pad_l = sweep(buses["pad_l"], filt) * sc_heavy
pad_r = sweep(buses["pad_r"], filt) * sc_heavy
pad_l, pad_r = verb(pad_l, HALL, 0.45)[0], verb(pad_r, HALL, 0.45)[1]

lead_l = highpass(buses["lead_l"], 250) * sc_light
lead_r = highpass(buses["lead_r"], 250) * sc_light
dl, dr = pingpong((lead_l + lead_r) * 0.5, BEAT * 0.75, 0.4)
ll, _ = verb(lead_l, HALL, 0.3)
_, lr = verb(lead_r, HALL, 0.3)
lead_l, lead_r = ll + dl * 0.35, lr + dr * 0.35

vx = sweep(highpass(buses["vox"], 200), filt) * sc_light
vl, vr = verb(vx, HALL, 0.4)
vdl, vdr = pingpong(vx, BEAT * 0.5, 0.35)
vl, vr = vl + vdl * 0.3, vr + vdr * 0.3

bl_ = sweep(buses["bell"], filt) * sc_light
bel_l, bel_r = verb(bl_, HALL, 0.4)
bdl, bdr = pingpong(bl_, BEAT * 0.75, 0.3)
bel_l, bel_r = bel_l + 0.25 * bdl, bel_r + 0.25 * bdr

dr_l, dr_r = verb(buses["drums"], ROOM, 0.12)
fx_l, fx_r = verb(buses["fx"], HALL, 0.5)

mix = {
    "kick": (kick_bus, kick_bus, 0.70),
    "bass": (bass_bus, bass_bus, 0.55),
    "drums": (dr_l, dr_r, 0.95),
    "pad": (pad_l, pad_r, 0.50),
    "lead": (lead_l, lead_r, 0.85),
    "vox": (vl, vr, 0.60),
    "bell": (bel_l, bel_r, 0.45),
    "fx": (fx_l, fx_r, 0.50),
}
L = sum(g * l for l, r, g in mix.values())
R = sum(g * r for l, r, g in mix.values())

# outro fade + trim
end = int((end_t + 3.0) * SR)
L, R = L[:end], R[:end]
fo = int(6 * SR)
fade = np.linspace(1, 0, fo) ** 2
L[-fo:] *= fade
R[-fo:] *= fade
fi = int(0.05 * SR)
L[:fi] *= np.linspace(0, 1, fi)
R[:fi] *= np.linspace(0, 1, fi)

st = np.stack([L, R])
st = highpass(st[0], 28, 2), highpass(st[1], 28, 2)
st = np.stack(st)
st /= np.max(np.abs(st)) / 0.9

raw = "glow_beat_v2_premaster.wav"
pcm = (st.T * 32767).astype(np.int16)
with wave.open(raw, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"premaster: {end / SR:.1f}s, {BPM} BPM, {N_BARS} bars")

if shutil.which("ffmpeg"):
    chain = ("acompressor=threshold=-16dB:ratio=2.5:attack=15:release=150:makeup=2,"
             "equalizer=f=60:t=q:w=1:g=1.5,equalizer=f=11000:t=q:w=0.8:g=1.5,"
             "loudnorm=I=-9.5:TP=-1.0:LRA=8,alimiter=limit=0.89:level=false,aresample=44100")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-af", chain,
                    "-ar", "44100", "glow_beat_v2.wav"], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", "glow_beat_v2.wav",
                    "-b:a", "320k", "glow_beat_v2.mp3"], check=True)
    print("mastered: glow_beat_v2.wav / glow_beat_v2.mp3")
