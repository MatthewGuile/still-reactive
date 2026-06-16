"""On-disk state: projects (inputs + cached analysis), presets, exports.

A project is keyed by a content hash of its image+audio pair, so re-opening
the same inputs reuses the cached analysis instantly.
"""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
PROJECTS = DATA / "projects"
PRESETS = DATA / "presets"
EXPORTS = DATA / "exports"

_SAFE_EXT = re.compile(r"[^A-Za-z0-9]")
_SAFE_NAME = re.compile(r"[^A-Za-z0-9 _.\-]")


def init_dirs() -> None:
    for d in (PROJECTS, PRESETS, EXPORTS):
        d.mkdir(parents=True, exist_ok=True)


def _ext(filename: str, default: str) -> str:
    ext = Path(filename or "").suffix.lstrip(".").lower()
    ext = _SAFE_EXT.sub("", ext)[:5]
    return ext or default


def project_dir(pid: str) -> Path:
    pid = _SAFE_EXT.sub("", pid)[:16]
    return PROJECTS / pid


def read_meta(pid: str) -> dict:
    return json.loads((project_dir(pid) / "meta.json").read_text(encoding="utf-8"))


def create_project(
    image_name: str, image_bytes: bytes, audio_name: str, audio_bytes: bytes
) -> dict:
    init_dirs()
    pid = hashlib.sha1(image_bytes + b"\x00" + audio_bytes).hexdigest()[:12]
    pdir = PROJECTS / pid
    meta_path = pdir / "meta.json"
    if meta_path.exists():
        return json.loads(meta_path.read_text(encoding="utf-8"))

    pdir.mkdir(parents=True, exist_ok=True)
    image_file = f"image.{_ext(image_name, 'png')}"
    audio_file = f"audio.{_ext(audio_name, 'wav')}"
    (pdir / image_file).write_bytes(image_bytes)
    (pdir / audio_file).write_bytes(audio_bytes)
    meta = {
        "id": pid,
        "imageName": image_name,
        "audioName": audio_name,
        "imageFile": image_file,
        "audioFile": audio_file,
        "created": time.time(),
    }
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta


def list_projects() -> list[dict]:
    init_dirs()
    metas = []
    for meta_path in PROJECTS.glob("*/meta.json"):
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            meta["analysisReady"] = (meta_path.parent / "analysis.json").exists()
            metas.append(meta)
        except (json.JSONDecodeError, OSError):
            continue
    metas.sort(key=lambda m: m.get("created", 0), reverse=True)
    return metas


def swap_image(pid: str, image_name: str, image_bytes: bytes) -> dict:
    """New project with a different image over the SAME audio (R6-1).

    Copies the audio + analysis.json (the analysis is a pure function of the
    audio) and session.json, so the whole look/automation carries over; the
    depth map regenerates from the new image. Content addressing means
    swapping back to a previous image lands on the existing project.
    """
    old_dir = project_dir(pid)
    old_meta = read_meta(pid)
    audio_bytes = (old_dir / old_meta["audioFile"]).read_bytes()
    new_pid = hashlib.sha1(image_bytes + b"\x00" + audio_bytes).hexdigest()[:12]
    if new_pid == pid:
        return old_meta
    new_dir = PROJECTS / new_pid
    meta_path = new_dir / "meta.json"
    if meta_path.exists():
        return json.loads(meta_path.read_text(encoding="utf-8"))

    new_dir.mkdir(parents=True, exist_ok=True)
    image_file = f"image.{_ext(image_name, 'png')}"
    (new_dir / image_file).write_bytes(image_bytes)
    (new_dir / old_meta["audioFile"]).write_bytes(audio_bytes)
    for extra in ("analysis.json", "session.json"):
        src = old_dir / extra
        if src.exists():
            shutil.copyfile(src, new_dir / extra)
    meta = {
        "id": new_pid,
        "imageName": image_name,
        "audioName": old_meta.get("audioName", ""),
        "imageFile": image_file,
        "audioFile": old_meta["audioFile"],
        "created": time.time(),
    }
    for key in ("duration", "tempo", "name"):
        if key in old_meta:
            meta[key] = old_meta[key]
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta


def rename_project(pid: str, name: str) -> dict:
    meta = read_meta(pid)
    name = _SAFE_NAME.sub("", str(name or "")).strip()[:60]
    if name:
        meta["name"] = name
    else:
        meta.pop("name", None)
    (project_dir(pid) / "meta.json").write_text(
        json.dumps(meta, indent=2), encoding="utf-8")
    return meta


def delete_project(pid: str) -> bool:
    """Remove a project directory (inputs + analysis + session). Exports are
    untouched — they live in data/exports/."""
    pdir = project_dir(pid)
    if not (pdir / "meta.json").exists():
        return False
    shutil.rmtree(pdir)
    return True


def save_session(pid: str, payload: dict) -> dict:
    """Per-project editing session (tempo grid, automation, chain, macros).

    Mirrors the browser's localStorage autosave so work survives cleared
    browser storage; the frontend prefers localStorage when both exist.
    """
    pdir = project_dir(pid)
    if not (pdir / "meta.json").exists():
        raise FileNotFoundError(pid)
    (pdir / "session.json").write_text(json.dumps(payload), encoding="utf-8")
    return {"saved": True, "id": pid}


def read_session(pid: str) -> dict | None:
    path = project_dir(pid) / "session.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def preset_slug(name: str) -> str:
    slug = _SAFE_NAME.sub("", name).strip().replace(" ", "-").lower()[:60]
    return slug or "preset"


def save_preset(payload: dict) -> dict:
    init_dirs()
    name = str(payload.get("name") or "preset")[:80]
    slug = preset_slug(name)
    payload = {**payload, "name": name, "slug": slug, "saved": time.time()}
    (PRESETS / f"{slug}.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def list_presets() -> list[dict]:
    init_dirs()
    presets = []
    for p in sorted(PRESETS.glob("*.json")):
        try:
            presets.append(json.loads(p.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, OSError):
            continue
    return presets


def delete_preset(slug: str) -> bool:
    path = PRESETS / f"{preset_slug(slug)}.json"
    if path.exists():
        path.unlink()
        return True
    return False


def export_filename(meta: dict, width: int, height: int, fps: int) -> str:
    stem = _SAFE_NAME.sub("", Path(meta.get("imageName", "video")).stem)[:40] or "video"
    stamp = time.strftime("%Y%m%d-%H%M%S")
    return f"{stem}_{width}x{height}_{fps}fps_{stamp}.mp4"


def list_exports() -> list[dict]:
    init_dirs()
    files = []
    for p in EXPORTS.glob("*.mp4"):
        stat = p.stat()
        files.append({"name": p.name, "size": stat.st_size, "mtime": stat.st_mtime})
    files.sort(key=lambda f: f["mtime"], reverse=True)
    return files
