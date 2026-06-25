"""Backend smoke test: synthesize an image + a beat track, run the full
project-create + analysis path, and print a summary. Run from repo root:

    python tests/smoke_backend.py
"""
from __future__ import annotations

import sys
import wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from still_reactive import analysis, store  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def make_image(path: Path) -> None:
    from PIL import Image

    w, h = 960, 540
    x = np.linspace(0, 1, w)[None, :]
    y = np.linspace(0, 1, h)[:, None]
    r = 0.25 + 0.5 * y + 0.1 * np.sin(x * 9)
    g = 0.2 + 0.3 * x
    b = 0.45 + 0.4 * (1 - y)
    full = np.ones((h, w))
    img = np.clip(np.stack([r * full, g * full, b * full], -1), 0, 1)
    # a "moon" highlight so bloom has something to bite on
    cx, cy = 0.72, 0.28
    d2 = ((x - cx) * (w / h)) ** 2 + (y - cy) ** 2
    img += np.clip(0.05 / (d2 + 0.003), 0, 0.9)[..., None]
    Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(path)


def make_audio(path: Path, seconds: float = 12.0, bpm: float = 120.0,
               lead_silence: float = 0.0) -> None:
    sr = 44100
    n = int(seconds * sr)
    t = np.arange(n) / sr
    out = np.zeros(n)

    beat_period = 60.0 / bpm
    for k in range(int(seconds / beat_period)):
        start = int(k * beat_period * sr)
        dur = int(0.18 * sr)
        seg = np.arange(min(dur, n - start)) / sr
        kick = np.sin(2 * np.pi * (55 + 40 * np.exp(-seg * 30)) * seg) * np.exp(-seg * 18)
        out[start : start + len(seg)] += 0.9 * kick
        if True:  # offbeat hat every beat
            hstart = start + int(0.5 * beat_period * sr)
            hdur = int(0.05 * sr)
            if hstart + hdur < n:
                rng = np.random.default_rng(k)
                out[hstart : hstart + hdur] += 0.25 * rng.standard_normal(hdur) * np.exp(
                    -np.arange(hdur) / sr * 80
                )
    # pad chord that swells in the second half (gives sections something to find)
    pad = 0.12 * (np.sin(2 * np.pi * 220 * t) + np.sin(2 * np.pi * 277.2 * t) + np.sin(2 * np.pi * 329.6 * t))
    swell = np.clip((t - seconds * 0.5) / (seconds * 0.2), 0, 1)
    out += pad * swell

    out = np.clip(out / max(np.abs(out).max(), 1e-9) * 0.9, -1, 1)
    if lead_silence > 0:
        out = np.concatenate([np.zeros(int(lead_silence * sr)), out])
    pcm = (out * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(sr)
        f.writeframes(pcm.tobytes())


def main() -> None:
    FIXTURES.mkdir(parents=True, exist_ok=True)
    img_path = FIXTURES / "test.png"
    wav_path = FIXTURES / "test.wav"
    if not img_path.exists():
        make_image(img_path)
    if not wav_path.exists():
        make_audio(wav_path)

    meta = store.create_project(
        "test.png", img_path.read_bytes(), "test.wav", wav_path.read_bytes()
    )
    meta = analysis.ensure_analysis(store.project_dir(meta["id"]))
    import json

    a = json.loads((store.project_dir(meta["id"]) / "analysis.json").read_text())
    trg = a["triggers"]
    print(f"project id      : {meta['id']}")
    print(f"duration        : {a['duration']} s ({a['frames']} analysis frames)")
    print(f"tempo           : {a['tempo']} BPM (expect ~120), offset {a['beatOffset']} s")
    print(f"onsets          : {len(a['onsets'])} (kicks+hats ~ 36 raw events)")
    print(f"triggers        : overall={len(trg['overall'])} low={len(trg['low'])} "
          f"mid={len(trg['mid'])} high={len(trg['high'])}")
    print(f"sections        : {a['sections']}")
    print(f"env ranges      : low [{min(a['low'])},{max(a['low'])}] high [{min(a['high'])},{max(a['high'])}]")
    print(f"depth.png       : {(store.project_dir(meta['id']) / 'depth.png').exists()}")
    assert 100 < a["tempo"] < 140, "tempo estimate out of range"
    assert len(a["onsets"]) >= 20, "too few onsets detected"
    assert "wavePeaks" not in a, "wavePeaks should be dropped in v4"
    assert a["version"] == 4, "analysis version not bumped to 4"
    assert set(trg) == {"overall", "low", "mid", "high"}, f"trigger bands: {set(trg)}"
    assert all(len(c) == 2 and 0.0 <= c[1] <= 1.0 for band in trg.values() for c in band), \
        "each trigger candidate is [t_seconds, strength_0_1]"
    assert len(trg["low"]) >= 15, f"too few low (kick) candidates: {len(trg['low'])}"
    assert len(trg["overall"]) >= 15, f"too few overall candidates: {len(trg['overall'])}"
    assert a["audioStart"] < 0.2, f"audioStart {a['audioStart']} on a no-silence file"
    assert len(a["bands"]) == 16, "multiband set missing"
    assert all(len(b) == a["frames"] for b in a["bands"]), "band length mismatch"
    assert len(a["bandEdges"]) == 17 and a["bandEdges"][0] == 30.0
    # the kick (55-95 Hz sweep) must dominate the low multibands
    lowband_peak = max(max(b) for b in a["bands"][:4])
    assert lowband_peak > 0.5, "low multibands silent on a kick track"

    # Leading-silence handling: bar 1 must land on the music, not the file
    # start, and the silence boundary must be detected.
    lead = 1.7
    sil_path = FIXTURES / "test_silence.wav"
    if not sil_path.exists():
        make_audio(sil_path, lead_silence=lead)
    meta2 = store.create_project(
        "test.png", img_path.read_bytes(), "test_silence.wav", sil_path.read_bytes()
    )
    meta2 = analysis.ensure_analysis(store.project_dir(meta2["id"]))
    a2 = json.loads((store.project_dir(meta2["id"]) / "analysis.json").read_text())
    beat = 60.0 / a2["tempo"]
    phase = abs((a2["beatOffset"] - lead + beat / 2) % beat - beat / 2)
    print(f"silence fixture : audioStart={a2['audioStart']} (expect ~{lead}), "
          f"beatOffset={a2['beatOffset']} (kick phase err {phase * 1000:.0f} ms)")
    assert abs(a2["audioStart"] - lead) < 0.15, "leading silence not detected"
    assert a2["beatOffset"] >= lead - 0.25, "bar 1 still inside the leading silence"
    assert phase < 0.045, "bar 1 not aligned to the kick grid"

    # Replace-audio comparison helper (pure): duration/tempo/downbeat tolerances.
    base = {"duration": 180.0, "tempo": 120.0, "beatOffset": 0.20}
    assert analysis.compare_audio(base, dict(base))["warnings"] == [], "identical -> no warnings"
    assert analysis.compare_audio(base, {**base, "duration": 181.0})["warnings"] == ["duration"]
    assert analysis.compare_audio(base, {**base, "tempo": 122.0})["warnings"] == ["tempo"]
    assert analysis.compare_audio(base, {**base, "beatOffset": 0.40})["warnings"] == ["downbeat"]
    within = analysis.compare_audio(base, {"duration": 180.3, "tempo": 120.5, "beatOffset": 0.25})
    assert within["warnings"] == [], f"within tolerance must not warn: {within}"
    cmp_full = analysis.compare_audio(base, {"duration": 200.0, "tempo": 90.0, "beatOffset": 1.0})
    assert cmp_full["warnings"] == ["duration", "tempo", "downbeat"], cmp_full
    assert cmp_full["old"]["tempo"] == 120.0 and cmp_full["new"]["tempo"] == 90.0, cmp_full
    print("compare_audio   : ok (duration/tempo/downbeat tolerances)")
    print("OK")


if __name__ == "__main__":
    main()
