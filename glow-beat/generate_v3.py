"""Beat v3 — rage-style: distorted supersaw riff + heavy distorted 808 (~2 min, 160 BPM, D minor).

Direction: hard, distorted synth lead over a heavy bass, half-time drums,
sparse verses for rap space and full hooks. Original riff/melody.

Usage: python3 generate_v3.py  -> beat_v3.wav / beat_v3.mp3   (numpy + ffmpeg)
"""
import shutil
import subprocess
import wave

import numpy as np

from glowlib import (SR, HALL, ROOM, rng, mtof, lowpass, highpass, adsr, saw_blep,
                     supersaw, e808, kick, snare, clap, hat, crash, riser, verb, pingpong, place)

BPM = 160
BEAT = 60 / BPM
BAR = BEAT * 4
STEP = BEAT / 4

SECTIONS = [("intro", 8), ("hook", 16), ("verse", 16), ("hook", 16),
            ("verse2", 8), ("hook2", 12), ("outro", 4)]
N_BARS = sum(n for _, n in SECTIONS)
LEN = int(N_BARS * BAR * SR) + SR * 4

# Dm - Bb - Gm - A (harmonic minor turnaround)
CHORDS = [[62, 65, 69], [58, 62, 65], [55, 58, 62], [57, 61, 64]]
ROOTS = [38, 34, 31, 33]  # D2 Bb1 G1 A1

# Riff: per bar list of (step, midi, len16)
RIFF = [
    [(0, 74, 2), (2, 77, 1), (3, 81, 2), (5, 77, 1), (6, 74, 2), (8, 69, 2), (10, 72, 1), (11, 74, 2), (13, 77, 1), (14, 76, 2)],
    [(0, 74, 2), (2, 77, 1), (3, 82, 2), (5, 77, 1), (6, 74, 2), (8, 70, 2), (10, 72, 1), (11, 74, 2), (13, 77, 1), (14, 79, 2)],
    [(0, 74, 2), (2, 79, 1), (3, 82, 2), (5, 79, 1), (6, 74, 2), (8, 70, 2), (10, 74, 1), (11, 79, 2), (13, 82, 1), (14, 81, 2)],
    [(0, 73, 2), (2, 76, 1), (3, 81, 2), (5, 76, 1), (6, 73, 2), (8, 69, 2), (10, 73, 1), (11, 76, 2), (13, 79, 1), (14, 81, 2)],
]


def crush(x, factor=4, bits=7):
    """Sample-rate + bit reduction."""
    y = np.repeat(x[::factor], factor)[: len(x)]
    q = 2 ** (bits - 1)
    return np.round(y * q) / q


def rage_lead(freq, dur, bright=1.0):
    L, R = supersaw(freq, dur, voices=9, spread=0.32, cutoff=9000, a=0.002, r=0.05)
    n = len(L)
    sub = np.sign(np.sin(2 * np.pi * freq / 2 * np.arange(n) / SR)) * 0.25 * adsr(n, 0.002, 0, 1, 0.05)
    out = []
    for ch in (L, R):
        x = (ch * 3 + sub) * 1.0
        x = np.tanh(x * 4.0 * bright)              # hard saturation
        x = 0.75 * x + 0.25 * crush(x, 3, 8)       # a little grit
        out.append(x)
    return out[0], out[1]


def stab(notes, dur):
    n = int(dur * SR)
    x = sum(saw_blep(mtof(m) * 2 ** (d / 12), n, rng.uniform()) for m in notes for d in (-0.1, 0.1))
    x = np.tanh(x * 1.5) * adsr(n, 0.003, 0.12, 0.3, 0.08)
    return lowpass(x, 3000) / len(notes)


def dirty808(freq, dur, glide_from=None):
    x = e808(freq, dur, glide_from=glide_from, glide_time=0.09)
    x = np.tanh(x * 3.5)
    return x


buses = {k: np.zeros(LEN) for k in ("kick", "drums", "bass", "lead_l", "lead_r", "hi_l", "hi_r", "stab", "fx")}
kick_times = []
gaps = []  # (start, end) times muted on drums/bass/lead for drops

bar = 0
for name, nb in SECTIONS:
    for b in range(nb):
        t0 = bar * BAR
        ci = bar % 4
        last = b == nb - 1
        hook = name in ("hook", "hook2")
        verse = name in ("verse", "verse2")

        # ---- riff
        if name != "outro" or b < 2:
            for st, m, ln in RIFF[ci]:
                if verse and st not in (0, 3, 6, 8, 11):
                    continue
                mm = m - 12 if verse else m
                L_, R_ = rage_lead(mtof(mm), ln * STEP + 0.04, bright=0.7 if verse else 1.0)
                g = 0.5 if verse else 0.6
                place(buses["lead_l"], L_ * g, t0 + st * STEP)
                place(buses["lead_r"], R_ * g, t0 + st * STEP)
                if hook and (b >= 8 or name == "hook2"):  # octave-up layer in the 2nd half of hooks
                    L2, R2 = supersaw(mtof(m + 12), ln * STEP + 0.04, voices=5, spread=0.2, cutoff=7000)
                    place(buses["hi_l"], np.tanh(L2 * 4) * 0.25, t0 + st * STEP)
                    place(buses["hi_r"], np.tanh(R2 * 4) * 0.25, t0 + st * STEP)

        # ---- chord stabs on the downbeat (hooks)
        if hook:
            place(buses["stab"], stab(CHORDS[ci], BEAT * 1.5) * 0.6, t0)
            if b % 2:
                place(buses["stab"], stab(CHORDS[ci], BEAT * 0.75) * 0.45, t0 + 10 * STEP)

        # ---- drums
        if hook or verse:
            kpat = [0, 10] if b % 2 == 0 else [0, 7, 10, 14]
            if verse and b % 4 == 3:
                kpat = [0, 3, 10]
            for s in kpat:
                place(buses["kick"], kick(), t0 + s * STEP)
                kick_times.append(t0 + s * STEP)
            place(buses["drums"], snare() * 0.6, t0 + 8 * STEP)
            place(buses["drums"], clap() * 0.9, t0 + 8 * STEP + 0.002)
            if b % 8 == 7:
                for s in (13, 14, 15):
                    place(buses["drums"], snare() * (0.2 + 0.08 * (s - 13)), t0 + s * STEP)
            # hats: 8ths with 16th bursts and triplet rolls
            s = 0.0
            while s < 16 - 1e-6:
                tt = t0 + s * STEP + rng.normal(0, 0.0015)
                zone = None
                if b % 4 == 1 and 12 <= s < 16:
                    zone = 0.5
                elif b % 4 == 3 and 4 <= s < 8:
                    zone = 1 / 3
                elif hook and b % 4 == 2 and 14 <= s < 16:
                    zone = 0.25
                if zone:
                    place(buses["drums"], hat(tone=9000) * 0.3, tt)
                    s += zone
                    continue
                place(buses["drums"], hat() * (0.42 if int(s) % 4 == 0 else 0.3) * rng.uniform(0.85, 1), tt)
                s += 1 if (hook and int(s) % 4 == 2) else 2
            if hook and b % 2:
                place(buses["drums"], hat(open_=True) * 0.25, t0 + 6 * STEP)

        # ---- 808
        if hook or verse:
            r = mtof(ROOTS[ci])
            prev = mtof(ROOTS[(ci - 1) % 4])
            if hook:
                notes = [(0, 6, r, prev), (6, 2, r * 2, r), (8, 4, r, r * 2), (12, 2, r * 2, r), (14, 2, r * 1.5, r * 2)]
            else:
                notes = [(0, 8, r, prev), (10, 6, r, None)]
            for st, ln, f, gl in notes:
                place(buses["bass"], dirty808(f, ln * STEP + 0.02, glide_from=gl), t0 + st * STEP)
        if name == "outro" and b < 2:
            place(buses["bass"], dirty808(mtof(ROOTS[ci]), BAR * 0.95), t0)

        # ---- FX + drops
        if last and name != "outro":
            place(buses["fx"], riser(BAR), t0)
            nxt = SECTIONS[[n for n, _ in SECTIONS].index(name) + 1][0] if name != "hook2" else "outro"
            if nxt in ("hook", "hook2"):
                gaps.append((t0 + 3 * BEAT, t0 + BAR))   # last beat silent -> slam into the hook
        if b == 0 and (hook or verse):
            place(buses["fx"], crash(), t0)
        bar += 1


# ---------------------------------------------------------------- mix
def sidechain(depth, rel):
    sc = np.ones(LEN)
    n = int(0.3 * SR)
    curve = 1 - depth * np.exp(-np.arange(n) / SR / rel * 3)
    for kt in kick_times:
        i = int(kt * SR)
        j = min(LEN, i + n)
        sc[i:j] = np.minimum(sc[i:j], curve[: j - i])
    return sc


def gap_mask():
    m = np.ones(LEN)
    xf = int(0.01 * SR)
    for a, b in gaps:
        i, j = int(a * SR), int(b * SR)
        m[i:j] = 0
        m[i - xf:i] = np.linspace(1, 0, xf)
    return m


tt = np.arange(LEN) / SR
intro_end = SECTIONS[0][1] * BAR
end_t = N_BARS * BAR
# intro: lead through a "phone speaker" band-pass, opening up into the hook
lp_mix = np.clip(np.interp(tt, [0, intro_end - BAR, intro_end - 0.01, intro_end], [0, 0.3, 0.6, 1]), 0, 1)

gm = gap_mask()
sc = sidechain(0.45, 0.12)

lead_l = buses["lead_l"] + buses["hi_l"]
lead_r = buses["lead_r"] + buses["hi_r"]
phone_l = highpass(lowpass(lead_l, 2500), 600) * 1.6
phone_r = highpass(lowpass(lead_r, 2500), 600) * 1.6
lead_l = (lead_l * lp_mix + phone_l * (1 - lp_mix))
lead_r = (lead_r * lp_mix + phone_r * (1 - lp_mix))
lead_l = highpass(lead_l, 180) * sc * gm
lead_r = highpass(lead_r, 180) * sc * gm
vl, _ = verb(lead_l, HALL, 0.22)
_, vr = verb(lead_r, HALL, 0.22)
dl, dr = pingpong((lead_l + lead_r) * 0.5, BEAT * 0.75, 0.3, taps=3, tone=3000)
lead_l, lead_r = vl + dl * 0.25, vr + dr * 0.25

stab_l, stab_r = verb(buses["stab"] * sc * gm, HALL, 0.35)
bass = lowpass(buses["bass"], 2200) * sidechain(0.5, 0.05) * gm
kickb = buses["kick"] * gm
dr_l, dr_r = verb(buses["drums"] * gm, ROOM, 0.1)
fx_l, fx_r = verb(buses["fx"], HALL, 0.5)

mix = [
    (kickb, kickb, 0.75),
    (bass, bass, 0.48),
    (dr_l, dr_r, 0.95),
    (lead_l, lead_r, 1.0),
    (stab_l, stab_r, 0.35),
    (fx_l, fx_r, 0.45),
]
L = sum(g * l for l, r, g in mix)
R = sum(g * r for l, r, g in mix)

end = int((end_t + 3.0) * SR)
L, R = L[:end], R[:end]
fo = int(5 * SR)
L[-fo:] *= np.linspace(1, 0, fo) ** 2
R[-fo:] *= np.linspace(1, 0, fo) ** 2
st = np.stack([highpass(L, 28, 2), highpass(R, 28, 2)])
st /= np.max(np.abs(st)) / 0.9

raw = "beat_v3_premaster.wav"
with wave.open(raw, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((st.T * 32767).astype(np.int16).tobytes())
print(f"premaster: {end / SR:.1f}s, {BPM} BPM, {N_BARS} bars")

if shutil.which("ffmpeg"):
    chain = ("acompressor=threshold=-15dB:ratio=3:attack=10:release=120:makeup=2,"
             "equalizer=f=55:t=q:w=1:g=2,equalizer=f=10000:t=q:w=0.8:g=1,"
             "loudnorm=I=-8.5:TP=-1.0:LRA=7,alimiter=limit=0.89:level=false")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-af", chain, "-ar", "44100", "beat_v3.wav"], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", "beat_v3.wav", "-b:a", "320k", "beat_v3.mp3"], check=True)
    print("mastered: beat_v3.wav / beat_v3.mp3")
