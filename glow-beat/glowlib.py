"""Shared synth / DSP helpers for the glow beat generators (numpy only)."""
import numpy as np

SR = 44100
rng = np.random.default_rng(2026)


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


