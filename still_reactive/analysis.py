"""Audio analysis + pseudo-depth, cached to disk per project.

All features are *reads* of the audio — nothing is ever written back to it.
Features are sampled on a fixed 50 fps analysis grid and normalized to 0..1
so the frontend can interpolate them at any render time t.

DSP is plain numpy over an ffmpeg decode — no librosa dependency.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from .media import decode_audio_mono

SR = 22050
HOP = 441            # 50 analysis frames per second
NFFT = 2048
FRAME_RATE = SR / HOP  # 50.0

# Band edges in Hz (low drives parallax/zoom, mid drives warp/fog, high drives
# grain/particles/jitter). These defaults stay for compatibility; the frontend
# can re-derive low/mid/high from the multiband set with user crossovers.
BANDS = {"low": (20.0, 160.0), "mid": (160.0, 2000.0), "high": (2000.0, 9000.0)}

# Log-spaced multiband envelopes (analysis v3): shipped alongside the classic
# three bands so the frontend can move the low/mid/high crossovers without
# re-analysis.
N_MULTI = 16
MULTI_EDGES = np.geomspace(30.0, 10000.0, N_MULTI + 1)


def _norm01(x: np.ndarray, lo_pct: float = 5.0, hi_pct: float = 97.0) -> np.ndarray:
    lo, hi = np.percentile(x, [lo_pct, hi_pct])
    if hi - lo < 1e-9:
        return np.zeros_like(x)
    return np.clip((x - lo) / (hi - lo), 0.0, 1.0)


def _smooth(x: np.ndarray, win_frames: int) -> np.ndarray:
    if win_frames <= 1:
        return x
    kernel = np.ones(win_frames) / win_frames
    return np.convolve(x, kernel, mode="same")


def _a_weight_gain(freqs: np.ndarray) -> np.ndarray:
    """Linear A-weighting gain per frequency (IEC 61672), normalized to peak 1."""
    f2 = freqs.astype(np.float64) ** 2
    num = (12194.0**2) * f2**2
    den = (
        (f2 + 20.6**2)
        * np.sqrt((f2 + 107.7**2) * (f2 + 737.9**2))
        * (f2 + 12194.0**2)
    )
    ra = np.where(den > 0, num / np.maximum(den, 1e-30), 0.0)
    peak = ra.max()
    return (ra / peak) if peak > 0 else ra


def _frame_signal(y: np.ndarray) -> np.ndarray:
    """Centered frames of length NFFT every HOP samples (view, no copy)."""
    pad = NFFT // 2
    yp = np.pad(y, (pad, pad))
    n_frames = 1 + (len(yp) - NFFT) // HOP
    frames = np.lib.stride_tricks.sliding_window_view(yp, NFFT)[::HOP]
    return frames[:n_frames]


def _pick_peaks(env: np.ndarray, min_gap_frames: int, floor: float) -> list[int]:
    """Greedy local-maxima peak picking with a minimum gap."""
    n = len(env)
    cand = [
        i for i in range(1, n - 1)
        if env[i] >= env[i - 1] and env[i] > env[i + 1] and env[i] > floor[i]
    ]
    cand.sort(key=lambda i: -env[i])
    chosen: list[int] = []
    for i in cand:
        if all(abs(i - j) >= min_gap_frames for j in chosen):
            chosen.append(i)
    chosen.sort()
    return chosen


def _candidates(flux_env: np.ndarray) -> list[list[float]]:
    """Generous onset candidates [[t_seconds, strength_0_1], ...] from a flux
    envelope. The threshold is deliberately low — the frontend selectivity
    slider filters these further, so analysis never has to be re-run to change
    how many triggers a set keeps."""
    env = _norm01(_smooth(flux_env, 3))
    local = _smooth(env, int(2 * FRAME_RATE))
    peaks = _pick_peaks(env, int(0.06 * FRAME_RATE), np.maximum(local * 0.5, 0.08))
    return [[round(p / FRAME_RATE, 3), round(float(env[p]), 3)] for p in peaks]


def _detect_audio_bounds(y: np.ndarray) -> tuple[float, float]:
    """First/last time (s) where a 50 ms window exceeds -45 dBFS.

    Audio files routinely carry random-length silence at the head; the
    frontend uses this to anchor the default bar-1 / downbeat to the music
    rather than the file start.
    """
    win = int(0.05 * SR)
    n = len(y) // win
    if n == 0:
        return 0.0, len(y) / SR
    rms = np.sqrt((y[: n * win].astype(np.float64).reshape(n, win) ** 2).mean(axis=1))
    above = np.nonzero(rms > 10 ** (-45.0 / 20.0))[0]
    if len(above) == 0:
        return 0.0, len(y) / SR
    start = above[0] * win / SR
    end = min((above[-1] + 1) * win / SR, len(y) / SR)
    return round(start, 3), round(end, 3)


def _anchor_downbeat(
    anchor_env: np.ndarray,
    anchor_onsets: list[float],
    tempo: float,
    phase_offset: float,
    audio_start: float,
) -> float:
    """Anchor bar 1 onto the first strong anchor onset near the music start.

    The comb phase from _estimate_tempo is only a within-one-beat phase, so
    with leading silence bar 1 lands inside the silence. The anchor envelope/
    onsets are bass flux when available (the downbeat is almost always a
    bass/kick event). If the chosen hit sits close to the existing grid, only
    the anchor slides (whole beats, phase kept); otherwise the grid is
    re-phased onto the hit itself.
    """
    if tempo <= 0:
        return phase_offset
    beat = 60.0 / tempo
    cands = [t for t in anchor_onsets if audio_start - 0.05 <= t <= audio_start + 8.0]
    if not cands:
        return phase_offset

    def strength(t: float) -> float:
        i = int(round(t * FRAME_RATE))
        return float(anchor_env[i]) if 0 <= i < len(anchor_env) else 0.0

    # Earliest hit that is competitive with the strongest in the window —
    # "strongest overall" gets dragged toward later, denser sections.
    scores = [strength(t) for t in cands]
    mx = max(scores)
    if mx <= 0:
        return phase_offset
    best = next(t for t, s in zip(cands, scores) if s >= 0.6 * mx)
    beats_from = (best - phase_offset) / beat
    k = round(beats_from)
    if abs(beats_from - k) <= 0.12:
        return round(max(phase_offset + k * beat, 0.0), 3)
    return round(best, 3)


def _estimate_tempo(
    onset_env: np.ndarray, phase_env: np.ndarray | None = None
) -> tuple[float, float]:
    """Tempo (BPM) via FFT autocorrelation + comb phase for the beat offset.

    phase_env, when given, is used only for the phase comb — pass the bass
    onset flux so the grid phase locks to kicks rather than off-beat hats.
    """
    env = onset_env - onset_env.mean()
    n = len(env)
    if n < int(8 * FRAME_RATE):
        return 0.0, 0.0
    size = int(2 ** np.ceil(np.log2(2 * n)))
    spec = np.fft.rfft(env, size)
    ac = np.fft.irfft(spec * np.conj(spec), size)[: n // 2]
    ac = ac / max(ac[0], 1e-9)

    lag_min = int(round(FRAME_RATE * 60.0 / 186.0))  # 186 BPM
    lag_max = int(round(FRAME_RATE * 60.0 / 60.0))   # 60 BPM
    lag_max = min(lag_max, len(ac) - 2)
    if lag_max <= lag_min + 2:
        return 0.0, 0.0
    lags = np.arange(lag_min, lag_max + 1)
    bpms = 60.0 * FRAME_RATE / lags
    # Log-normal prior centered near 105 BPM to dodge octave errors.
    prior = np.exp(-0.5 * (np.log2(bpms / 105.0) / 0.85) ** 2)
    score = ac[lags] * prior
    best = int(np.argmax(score))
    lag = float(lags[best])
    # Parabolic refinement for sub-frame lag precision.
    if 0 < best < len(lags) - 1:
        a, b, c = score[best - 1], score[best], score[best + 1]
        denom = a - 2 * b + c
        if abs(denom) > 1e-12:
            lag = lag + 0.5 * (a - c) / denom
    # Octave correction: a 2-beat pattern repeat makes the double lag win the
    # autocorrelation even when the perceived pulse is twice as fast. Prefer
    # the half lag whenever it is nearly as strong.
    while lag / 2.0 >= lag_min:
        half = int(round(lag / 2.0))
        if ac[half] >= 0.55 * ac[int(round(lag))]:
            lag = lag / 2.0
        else:
            break
    tempo = 60.0 * FRAME_RATE / lag

    # Beat phase: comb sum over integer offsets of the rounded lag.
    ilag = max(2, int(round(lag)))
    env_for_phase = phase_env if phase_env is not None else onset_env
    phases = [env_for_phase[off::ilag].mean() for off in range(ilag)]
    offset_s = float(np.argmax(phases)) / FRAME_RATE
    return float(tempo), offset_s


def _find_sections(features: np.ndarray, n_frames: int) -> list[float]:
    """Coarse structural boundaries via a sliding past-vs-future novelty curve."""
    w = int(8 * FRAME_RATE)
    if n_frames < 4 * w:
        return [0.0]
    feats = np.stack([_smooth(f, int(FRAME_RATE)) for f in features], axis=1)
    cum = np.cumsum(np.vstack([np.zeros((1, feats.shape[1])), feats]), axis=0)

    def window_mean(a: int, b: int) -> np.ndarray:
        return (cum[b] - cum[a]) / max(b - a, 1)

    novelty = np.zeros(n_frames)
    for t in range(w, n_frames - w):
        novelty[t] = np.linalg.norm(window_mean(t - w, t) - window_mean(t, t + w))
    novelty = _norm01(novelty)
    floor = np.full(n_frames, 0.35)
    peaks = _pick_peaks(novelty, int(15 * FRAME_RATE), floor)
    return [0.0] + [round(p / FRAME_RATE, 3) for p in peaks]


def analyze_audio(path: str | Path) -> dict:
    y = decode_audio_mono(path, SR)
    duration = len(y) / SR
    frames = _frame_signal(y)
    n = len(frames)
    win = np.hanning(NFFT).astype(np.float32)
    freqs = np.fft.rfftfreq(NFFT, 1.0 / SR)

    band_masks = {
        name: (freqs >= lo) & (freqs < hi) for name, (lo, hi) in BANDS.items()
    }
    multi_masks = [
        (freqs >= MULTI_EDGES[i]) & (freqs < MULTI_EDGES[i + 1])
        for i in range(N_MULTI)
    ]
    a_gain2 = (_a_weight_gain(freqs) ** 2).astype(np.float32)

    band_energy = {name: np.zeros(n, dtype=np.float64) for name in BANDS}
    multi_energy = np.zeros((N_MULTI, n), dtype=np.float64)
    loudness = np.zeros(n, dtype=np.float64)
    flux = np.zeros(n, dtype=np.float64)
    bass_flux = np.zeros(n, dtype=np.float64)  # low-band-only onset flux
    mid_flux = np.zeros(n, dtype=np.float64)
    high_flux = np.zeros(n, dtype=np.float64)
    prev_log = None

    chunk = 2048
    for start in range(0, n, chunk):
        f = frames[start : start + chunk].astype(np.float32) * win
        mag = np.abs(np.fft.rfft(f, axis=1)).astype(np.float32)
        power = mag * mag
        for name, mask in band_masks.items():
            band_energy[name][start : start + len(f)] = power[:, mask].mean(axis=1)
        for bi, mask in enumerate(multi_masks):
            if mask.any():
                multi_energy[bi, start : start + len(f)] = power[:, mask].mean(axis=1)
        loudness[start : start + len(f)] = (power * a_gain2).sum(axis=1)
        log_mag = np.log1p(mag)
        if prev_log is None:
            ref = np.vstack([log_mag[:1], log_mag[:-1]])
        else:
            ref = np.vstack([prev_log, log_mag[:-1]])
        diff = np.maximum(log_mag - ref, 0.0)
        flux[start : start + len(f)] = diff.sum(axis=1)
        bass_flux[start : start + len(f)] = diff[:, band_masks["low"]].sum(axis=1)
        mid_flux[start : start + len(f)] = diff[:, band_masks["mid"]].sum(axis=1)
        high_flux[start : start + len(f)] = diff[:, band_masks["high"]].sum(axis=1)
        prev_log = log_mag[-1:]

    bands_n = {name: _norm01(np.log1p(e)) for name, e in band_energy.items()}
    multi_n = [_norm01(np.log1p(e)) for e in multi_energy]
    loud_n = _norm01(np.log1p(loudness))
    onset_env = _norm01(_smooth(flux, 3))

    local_mean = _smooth(onset_env, int(2 * FRAME_RATE))
    onset_peaks = _pick_peaks(
        onset_env, int(0.12 * FRAME_RATE), np.maximum(local_mean + 0.07, 0.18)
    )
    onsets = [round(p / FRAME_RATE, 3) for p in onset_peaks]

    audio_start, audio_end = _detect_audio_bounds(y)

    # Bass-band onset flux: kick/bass events define the downbeat. Full-band
    # flux over-weights broadband noise (hats), so the comb phase and the
    # bar-1 anchor use the bass flux whenever the track has meaningful bass.
    bass_onset = _norm01(_smooth(bass_flux, 3))
    bass_local = _smooth(bass_onset, int(2 * FRAME_RATE))
    bass_peaks = _pick_peaks(
        bass_onset, int(0.12 * FRAME_RATE), np.maximum(bass_local + 0.07, 0.18)
    )
    has_bass = len(bass_peaks) >= 4 and bass_flux.max() > 0.05 * max(flux.max(), 1e-9)
    anchor_env = bass_onset if has_bass else onset_env
    anchor_onsets = (
        [round(p / FRAME_RATE, 3) for p in bass_peaks] if has_bass else onsets
    )

    triggers = {
        "overall": _candidates(flux),
        "low": _candidates(bass_flux),
        "mid": _candidates(mid_flux),
        "high": _candidates(high_flux),
    }

    tempo, beat_offset = _estimate_tempo(onset_env, anchor_env)
    beat_offset = _anchor_downbeat(
        anchor_env, anchor_onsets, tempo, beat_offset, audio_start
    )
    sections = _find_sections(
        np.stack([bands_n["low"], bands_n["mid"], bands_n["high"], loud_n]), n
    )

    def arr(x: np.ndarray) -> list:
        return np.round(x, 3).tolist()

    return {
        "version": 4,
        "frameRate": FRAME_RATE,
        "frames": n,
        "duration": round(duration, 3),
        "tempo": round(tempo, 2),
        "beatOffset": round(beat_offset, 3),
        "audioStart": audio_start,
        "audioEnd": audio_end,
        "firstOnset": onsets[0] if onsets else 0.0,
        "rms": arr(loud_n),  # A-weighted perceptual loudness (read-only analysis)
        "low": arr(bands_n["low"]),
        "mid": arr(bands_n["mid"]),
        "high": arr(bands_n["high"]),
        "onsetEnv": arr(onset_env),
        "onsets": onsets,
        "triggers": triggers,
        "sections": sections,
        # multiband set for user-defined low/mid/high crossovers (per-band
        # percentile-normalized; the frontend averages member bands and
        # re-normalizes)
        "bands": [arr(b) for b in multi_n],
        "bandEdges": [round(float(x), 1) for x in MULTI_EDGES],
    }


def make_pseudo_depth(image_path: str | Path, out_path: str | Path) -> None:
    """Cheap monocular depth stand-in: vertical gradient + blurred inverse luma.

    Encodes *nearness* (1 = near / bottom-of-frame, 0 = far / sky). Good enough
    to sell gentle 2.5D parallax on typical landscape stills; swappable for a
    real model (Depth-Anything / MiDaS) later without touching the shaders.
    """
    from PIL import Image, ImageFilter

    img = Image.open(image_path).convert("L")
    img.thumbnail((512, 512))
    blurred = img.filter(ImageFilter.GaussianBlur(radius=16))
    lum = np.asarray(blurred, dtype=np.float64) / 255.0
    h, w = lum.shape
    vertical = np.linspace(0.0, 1.0, h)[:, None] * np.ones((1, w))
    near = 0.65 * vertical + 0.35 * (1.0 - lum)
    near = (near - near.min()) / max(near.max() - near.min(), 1e-9)
    out = Image.fromarray((near * 255).astype(np.uint8), mode="L")
    out = out.filter(ImageFilter.GaussianBlur(radius=4))
    out.save(out_path)


def ensure_analysis(project_dir: str | Path) -> dict:
    """Compute and cache analysis.json + depth.png for a project directory."""
    pdir = Path(project_dir)
    meta_path = pdir / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))

    analysis_path = pdir / "analysis.json"
    if analysis_path.exists():
        # Recompute caches written by older analysis versions.
        try:
            cached = json.loads(analysis_path.read_text(encoding="utf-8"))
            if cached.get("version", 1) < 4:
                analysis_path.unlink()
        except (ValueError, OSError):
            analysis_path.unlink(missing_ok=True)
    if not analysis_path.exists():
        result = analyze_audio(pdir / meta["audioFile"])
        analysis_path.write_text(json.dumps(result), encoding="utf-8")
        meta["duration"] = result["duration"]
        meta["tempo"] = result["tempo"]
        meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    depth_path = pdir / "depth.png"
    if not depth_path.exists():
        make_pseudo_depth(pdir / meta["imageFile"], depth_path)

    meta["analysisReady"] = True
    return meta


# Replace-audio comparison: a project's audio is swapped for a (usually
# mastered) version of the same song. Warn when the new analysis drifts enough
# to need a timing review; project timing is kept regardless.
REPLACE_TOL = {"duration": 0.5, "tempo": 1.0, "beatOffset": 0.1}


def read_analysis(project_dir: str | Path) -> dict | None:
    """Read a project's cached analysis.json, or None if missing/invalid."""
    path = Path(project_dir) / "analysis.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return None


def compare_audio(old: dict, new: dict) -> dict:
    """Old-vs-new audio comparison for the Replace-audio review. `old`/`new` are
    analysis dicts (use duration/tempo/beatOffset). Returns
    {old, new, warnings}; warnings is a list of codes:
    "duration", "tempo", "downbeat"."""
    keys = ("duration", "tempo", "beatOffset")
    o = {k: float((old or {}).get(k, 0) or 0) for k in keys}
    n = {k: float((new or {}).get(k, 0) or 0) for k in keys}
    warnings = []
    if abs(n["duration"] - o["duration"]) > REPLACE_TOL["duration"]:
        warnings.append("duration")
    if abs(n["tempo"] - o["tempo"]) > REPLACE_TOL["tempo"]:
        warnings.append("tempo")
    if abs(n["beatOffset"] - o["beatOffset"]) > REPLACE_TOL["beatOffset"]:
        warnings.append("downbeat")
    return {"old": o, "new": n, "warnings": warnings}
