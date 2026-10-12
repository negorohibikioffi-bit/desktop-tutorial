"""Glow beat generator — dreamy trap instrumental (~2 min, 140 BPM, A minor).

Usage: python3 generate.py  -> writes glow_beat.wav (and glow_beat.mp3 if ffmpeg exists)
Only depends on numpy.
"""
import shutil
import subprocess
import wave

import numpy as np

SR = 44100
BPM = 140
BEAT = 60 / BPM
BAR = BEAT * 4
STEP = BEAT / 4  # 16th note
rng = np.random.default_rng(7)

# Structure (bars): intro, verse A, hook B, break, hook B', outro
SECTIONS = [("intro", 8), ("a", 16), ("b", 16), ("break", 8), ("b2", 16), ("outro", 6)]
N_BARS = sum(n for _, n in SECTIONS)
TOTAL = int(N_BARS * BAR * SR) + SR * 3  # tail for reverb

# Chord loop (2 bars each would be slow; 1 bar each, 4-bar loop)
# Fmaj7 - G6 - Em7 - Am9  (midi)
CHORDS = [
    [53, 57, 60, 64, 69],
    [55, 59, 62, 64, 71],
    [52, 55, 59, 62, 67],
    [57, 60, 64, 67, 71],
]
BASS_ROOTS = [29, 31, 28, 33]  # F1 G1 E1 A1


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def env_adsr(n, a, d, s, r, sr=SR):
    a, d, r = int(a * sr), int(d * sr), int(r * sr)
    e = np.full(n, s, dtype=np.float64)
    a = min(a, n)
    e[:a] = np.linspace(0, 1, a, endpoint=False)
    d = min(d, n - a)
    e[a:a + d] = np.linspace(1, s, d, endpoint=False)
    if r > 0:
        r = min(r, n)
        e[-r:] *= np.linspace(1, 0, r)
    return e


def lowpass(x, cutoff):
    """Zero-phase-ish FFT lowpass with a soft (2nd order-like) slope."""
    n = len(x)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    X *= 1 / np.sqrt(1 + (f / cutoff) ** 4)
    return np.fft.irfft(X, n)


def highpass(x, cutoff):
    n = len(x)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    X *= 1 - 1 / np.sqrt(1 + (f / cutoff) ** 4)
    return np.fft.irfft(X, n)


def fft_convolve(x, h):
    n = len(x) + len(h) - 1
    N = 1 << (n - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, N) * np.fft.rfft(h, N), N)[: len(x)]
    return y


def make_ir(seconds, decay, seed):
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = r.standard_normal(n) * np.exp(-t * decay)
    ir = lowpass(ir, 6000)
    ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))  # predelay-ish fade
    return ir / np.sqrt(np.sum(ir ** 2))


IR_L = make_ir(3.2, 2.2, 1)
IR_R = make_ir(3.2, 2.2, 2)


def reverb(x, wet):
    return x * (1 - wet) + fft_convolve(x, IR_L) * wet, x * (1 - wet) + fft_convolve(x, IR_R) * wet


def place(buf, sig, t):
    i = int(t * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i]


# ---------------- instruments ----------------

def bell(freq, dur):
    """FM bell / glassy pluck — the 'glow'."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    mod_env = np.exp(-t * 6)
    mod = np.sin(2 * np.pi * freq * 3.5 * t) * 2.2 * mod_env
    car = np.sin(2 * np.pi * freq * t + mod)
    shimmer = 0.25 * np.sin(2 * np.pi * freq * 2.0 * t + 0.5 * mod) * np.exp(-t * 4)
    return (car + shimmer) * np.exp(-t * 2.8) * env_adsr(n, 0.002, 0.0, 1, 0.05)


def pluck(freq, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    saw = sum(np.sin(2 * np.pi * freq * k * t) / k * np.exp(-t * (3 + k * 1.5)) for k in range(1, 9))
    return saw * env_adsr(n, 0.003, 0.0, 1, 0.04)


def pad(freqs, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.0, 0.13):
            ff = f * 2 ** (det / 12)
            ph = rng.uniform(0, 2 * np.pi)
            # soft saw (few harmonics)
            for k in range(1, 6):
                out += np.sin(2 * np.pi * ff * k * t + ph * k) / (k ** 1.6)
    out *= env_adsr(n, 0.6, 0.3, 0.8, 0.7)
    return out / (len(freqs) * 3)


def kick(dur=0.35):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 50 + 110 * np.exp(-t * 35)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 9)
    click = rng.standard_normal(n) * np.exp(-t * 300) * 0.3
    return np.tanh((body + click) * 1.6)


def bass808(freq, dur, glide_from=None):
    n = int(dur * SR)
    t = np.arange(n) / SR
    if glide_from:
        f = freq + (glide_from - freq) * np.exp(-t * 18)
    else:
        f = freq * (1 + 0.6 * np.exp(-t * 40))
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) + 0.15 * np.sin(2 * ph)
    s = np.tanh(s * 1.8) * env_adsr(n, 0.004, 0.0, 1, 0.08) * np.exp(-t * 0.9)
    return s


def snare(dur=0.3):
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = highpass(rng.standard_normal(n), 1800) * np.exp(-t * 18)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30)
    return np.tanh((noise * 0.8 + tone * 0.7) * 1.3)


def clap(dur=0.35):
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = highpass(rng.standard_normal(n), 1200)
    e = np.zeros(n)
    for off in (0.0, 0.011, 0.022):
        i = int(off * SR)
        e[i:] += np.exp(-(t[: n - i]) * 70)
    e += np.exp(-t * 14) * 0.5
    return noise * e * 0.6


def hat(dur=0.06, open_=False):
    if open_:
        dur = 0.3
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = highpass(rng.standard_normal(n), 7500)
    return x * np.exp(-t * (12 if open_ else 70))


def riser(dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = highpass(rng.standard_normal(n), 3000) * (t / dur) ** 2
    return x * 0.25


# ---------------- arrangement ----------------
L = np.zeros(TOTAL)
R = np.zeros(TOTAL)
drums = np.zeros(TOTAL)
bass = np.zeros(TOTAL)
pads = np.zeros(TOTAL)
bells = np.zeros(TOTAL)
lead = np.zeros(TOTAL)
fx = np.zeros(TOTAL)
kick_times = []

# Arp pattern for bells (16th steps, index into chord tones, -1 = rest)
ARP = [4, -1, 2, 3, -1, 4, 2, -1, 3, -1, 4, 2, -1, 3, 1, -1]
# Hook lead melody per 4-bar loop: (step, midi, length in steps)
HOOK = [
    (0, 81, 3), (3, 79, 3), (6, 76, 2), (8, 79, 4), (12, 76, 4),
    (16, 79, 3), (19, 81, 3), (22, 83, 2), (24, 81, 6), (30, 79, 2),
    (32, 76, 3), (35, 74, 3), (38, 76, 2), (40, 79, 4), (44, 76, 4),
    (48, 81, 3), (51, 79, 3), (54, 76, 2), (56, 72, 4), (60, 76, 4),
]

bar_i = 0
for name, nbars in SECTIONS:
    for b in range(nbars):
        t0 = bar_i * BAR
        ci = bar_i % 4
        chord = CHORDS[ci]
        last_of_section = b == nbars - 1
        prog = b / max(1, nbars - 1)

        # Pads everywhere
        place(pads, pad([mtof(m) for m in chord], BAR + 0.6), t0)

        # Bell arp: all except outro tail half
        if not (name == "outro" and b >= 4):
            for s, idx in enumerate(ARP):
                if idx < 0:
                    continue
                m = chord[idx] + 12
                vel = 0.55 if s % 4 == 0 else 0.4
                place(bells, bell(mtof(m), 1.2) * vel, t0 + s * STEP)

        # Hook lead in B sections (pluck an octave + bell double)
        if name in ("b", "b2"):
            loop_step = (b % 4) * 16
            for st, m, ln in HOOK:
                if loop_step <= st < loop_step + 16:
                    tt = t0 + (st - loop_step) * STEP
                    place(lead, pluck(mtof(m), ln * STEP + 0.3) * 0.5, tt)
                    place(lead, bell(mtof(m + 12), 0.8) * 0.18, tt)

        drums_on = name in ("a", "b", "b2") or (name == "outro" and b < 4)
        if drums_on:
            # Kick pattern (16 steps)
            kpat = [0, 7, 10] if b % 2 == 0 else [0, 3, 10, 14]
            if name == "outro":
                kpat = [0]
            for s in kpat:
                place(drums, kick() * 0.9, t0 + s * STEP)
                kick_times.append(t0 + s * STEP)
            # Snare+clap on 3 (half-time feel)
            place(drums, snare() * 0.55 + 0, t0 + 8 * STEP)
            place(drums, clap() * 0.6, t0 + 8 * STEP + 0.004)
            if b % 4 == 3 and name != "outro":
                place(drums, snare() * 0.25, t0 + 15 * STEP)
            # Hats: 8ths with 16th/triplet rolls
            s = 0.0
            while s < 16:
                tt = t0 + s * STEP
                roll = (b % 2 == 1 and 12 <= s < 16) or (name.startswith("b") and b % 4 == 2 and 6 <= s < 8)
                if roll:
                    # 32nd / triplet roll
                    sub = 1 / 3 if (b % 4 == 3) else 0.5
                    place(drums, hat() * (0.25 + 0.1 * ((s * 7) % 2)), tt)
                    s += sub
                    continue
                place(drums, hat() * (0.38 if int(s) % 4 == 0 else 0.28), tt)
                s += 2 if name == "a" and b < 2 else 1 if name.startswith("b") else 2
            if name.startswith("b") and b % 2 == 0:
                place(drums, hat(open_=True) * 0.2, t0 + 6 * STEP)

            # 808 bass
            root = mtof(BASS_ROOTS[ci])
            if name != "outro":
                place(bass, bass808(root, 6 * STEP) * 0.85, t0)
                prev = mtof(BASS_ROOTS[(ci - 1) % 4])
                place(bass, bass808(root, 3 * STEP, glide_from=root * 2) * 0.75, t0 + 7 * STEP)
                place(bass, bass808(root * (2 ** (7 / 12)) if b % 2 else root, 6 * STEP,
                                    glide_from=prev) * 0.8, t0 + 10 * STEP)
            else:
                place(bass, bass808(root, BAR) * 0.8, t0)

        # Break: filtered kicks building up in the last 4 bars
        if name == "break" and b >= 4:
            for s in range(0, 16, 4 if b < 6 else 2 if b < 7 else 1):
                place(drums, kick() * 0.35, t0 + s * STEP)
            if b == nbars - 1:
                place(fx, riser(BAR), t0)

        # Riser into hooks
        if name in ("a", "intro") and last_of_section:
            place(fx, riser(BAR), t0)

        bar_i += 1

# Sidechain envelope from kicks (glow pump)
sc = np.ones(TOTAL)
dur = int(0.22 * SR)
curve = 1 - 0.55 * np.exp(-np.arange(dur) / SR * 14)
for kt in kick_times:
    i = int(kt * SR)
    j = min(TOTAL, i + dur)
    sc[i:j] = np.minimum(sc[i:j], curve[: j - i])

# Break section filtering on melodic stuff
break_start = sum(n for _, n in SECTIONS[:3]) * BAR
break_end = break_start + 8 * BAR
mask = np.zeros(TOTAL)
i0, i1 = int(break_start * SR), int(break_end * SR)
mask[i0:i1] = 1
xf = int(0.05 * SR)
mask[i0 - xf:i0] = np.linspace(0, 1, xf)

def apply_break_filter(x, cutoff):
    return x * (1 - mask) + lowpass(x, cutoff) * mask

pads = apply_break_filter(lowpass(pads, 2500), 700)
bells = apply_break_filter(bells, 1200)
bass = lowpass(bass, 400)

# Stereo placement + reverb
padL, padR = reverb(pads * sc, 0.5)
bellL, bellR = reverb(bells * sc, 0.45)
leadL, leadR = reverb(lead, 0.35)
fxL, fxR = reverb(fx, 0.6)
drumL, drumR = reverb(drums, 0.08)

# Bell ping-pong delay (dotted 8th)
d = int(BEAT * 0.75 * SR)
bell_dl = np.zeros(TOTAL); bell_dr = np.zeros(TOTAL)
bell_dl[d:] = bells[:-d] * 0.28
bell_dr[2 * d:] = bells[:-2 * d] * 0.2
bell_dl = lowpass(bell_dl, 4000)
bell_dr = lowpass(bell_dr, 4000)

L = 0.32 * padL + 0.30 * bellL + 0.12 * bell_dl + 0.38 * leadL + 0.5 * fxL + 0.8 * drumL + 0.75 * bass
R = 0.32 * padR + 0.30 * bellR + 0.12 * bell_dr + 0.38 * leadR + 0.5 * fxR + 0.8 * drumR + 0.75 * bass

# Lo-fi glow: gentle tape saturation + vinyl-ish noise bed
noise = lowpass(rng.standard_normal(TOTAL), 5000) * 0.004
L, R = L + noise, R + noise

st = np.stack([L, R])
st = np.tanh(st * 1.15) / np.tanh(1.15)
st /= np.max(np.abs(st)) / 0.95

# Fade in/out
fi = int(1.5 * SR)
st[:, :fi] *= np.linspace(0, 1, fi)
end = int(N_BARS * BAR * SR) + int(2.5 * SR)
st = st[:, :end]
fo = int(5 * SR)
st[:, -fo:] *= np.linspace(1, 0, fo) ** 1.5

pcm = (st.T * 32767).astype(np.int16)
with wave.open("glow_beat.wav", "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"wrote glow_beat.wav  {end / SR:.1f}s  {BPM}BPM  {N_BARS} bars")

if shutil.which("ffmpeg"):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", "glow_beat.wav",
                    "-b:a", "256k", "glow_beat.mp3"], check=True)
    print("wrote glow_beat.mp3")
