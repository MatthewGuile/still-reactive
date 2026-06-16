"""ffmpeg helpers: locate the binary, decode audio to PCM.

The audio master is never modified — decoding here is analysis-only (read).
The only write that ever touches audio is the AAC encode inside the MP4 mux
at export time (see server.py).
"""
from __future__ import annotations

import shutil
import subprocess

import numpy as np


def ffmpeg_exe() -> str:
    """Prefer the bundled imageio-ffmpeg binary, fall back to PATH."""
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        exe = shutil.which("ffmpeg")
        if exe:
            return exe
        raise RuntimeError(
            "ffmpeg not found. Install it or `pip install imageio-ffmpeg`."
        )


def decode_audio_mono(path: str, sr: int = 22050) -> np.ndarray:
    """Decode any audio file to mono float32 PCM at the given sample rate."""
    cmd = [
        ffmpeg_exe(), "-v", "error",
        "-i", str(path),
        "-f", "f32le", "-ac", "1", "-ar", str(sr),
        "-",
    ]
    proc = subprocess.run(cmd, capture_output=True, check=False)
    if proc.returncode != 0 or len(proc.stdout) < 1024:
        err = proc.stderr.decode(errors="replace")[-500:]
        raise RuntimeError(f"ffmpeg could not decode audio: {err}")
    return np.frombuffer(proc.stdout, dtype=np.float32).copy()


def probe_duration(path: str, sr: int = 22050) -> float:
    return len(decode_audio_mono(path, sr)) / sr
