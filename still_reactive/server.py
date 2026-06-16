"""Still Reactive backend.

Serves the SPA, manages projects/presets, and hosts the export WebSocket:
the browser renders every frame with the *same* WebGL pipeline used for
preview and streams raw RGBA frames here, where they are piped into ffmpeg
and muxed with the untouched audio master (AAC 320k encode only — no signal
processing of any kind).
"""
from __future__ import annotations

import asyncio
import json
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from . import analysis, store
from .media import ffmpeg_exe

WEB_DIR = Path(__file__).resolve().parent.parent / "web"

app = FastAPI(title="Still Reactive", docs_url=None, redoc_url=None)


@app.middleware("http")
async def revalidate_static(request, call_next):
    # The SPA's ES modules must never mix versions across an update: force
    # revalidation (ETag/304 keeps it cheap) instead of silent cache reuse.
    response = await call_next(request)
    if not request.url.path.startswith("/api"):
        response.headers["Cache-Control"] = "no-cache"
    return response


# ---------------------------------------------------------------- projects

@app.post("/api/project")
async def create_project(image: UploadFile = File(...), audio: UploadFile = File(...)):
    image_bytes = await image.read()
    audio_bytes = await audio.read()
    if not image_bytes or not audio_bytes:
        raise HTTPException(400, "Both an image and an audio file are required.")
    meta = await run_in_threadpool(
        store.create_project, image.filename, image_bytes, audio.filename, audio_bytes
    )
    try:
        meta = await run_in_threadpool(
            analysis.ensure_analysis, store.project_dir(meta["id"])
        )
    except RuntimeError as exc:
        raise HTTPException(422, str(exc))
    return meta


@app.get("/api/projects")
async def get_projects():
    return await run_in_threadpool(store.list_projects)


def _project_file(pid: str, name: str) -> Path:
    path = store.project_dir(pid) / name
    if not path.exists():
        raise HTTPException(404, f"{name} not found for project {pid}")
    return path


@app.get("/api/project/{pid}")
async def get_project(pid: str):
    try:
        meta = await run_in_threadpool(store.read_meta, pid)
    except FileNotFoundError:
        raise HTTPException(404, "Project not found")
    meta["analysisReady"] = (store.project_dir(pid) / "analysis.json").exists()
    return meta


@app.post("/api/project/{pid}/image")
async def swap_project_image(pid: str, image: UploadFile = File(...)):
    """R6-1: same audio, new image — analysis + session carry over, the
    depth map regenerates. Returns the (possibly pre-existing) sibling."""
    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(400, "An image file is required.")
    try:
        meta = await run_in_threadpool(
            store.swap_image, pid, image.filename, image_bytes)
    except FileNotFoundError:
        raise HTTPException(404, "Project not found")
    try:
        meta = await run_in_threadpool(
            analysis.ensure_analysis, store.project_dir(meta["id"]))
    except RuntimeError as exc:
        raise HTTPException(422, str(exc))
    return meta


@app.patch("/api/project/{pid}")
async def rename_project(pid: str, payload: dict):
    try:
        return await run_in_threadpool(
            store.rename_project, pid, payload.get("name", ""))
    except FileNotFoundError:
        raise HTTPException(404, "Project not found")


@app.delete("/api/project/{pid}")
async def delete_project(pid: str):
    if pid in EXPORTING_PIDS:
        raise HTTPException(409, "An export for this project is running.")
    ok = await run_in_threadpool(store.delete_project, pid)
    if not ok:
        raise HTTPException(404, "Project not found")
    return {"deleted": pid}


@app.get("/api/project/{pid}/analysis")
async def get_analysis(pid: str):
    # Recompute stale (older-version) caches on read, not just on upload.
    try:
        await run_in_threadpool(analysis.ensure_analysis, store.project_dir(pid))
    except Exception:
        pass  # serve whatever exists; missing file 404s below
    return FileResponse(_project_file(pid, "analysis.json"), media_type="application/json")


@app.get("/api/project/{pid}/depth")
async def get_depth(pid: str):
    return FileResponse(_project_file(pid, "depth.png"), media_type="image/png")


@app.get("/api/project/{pid}/image")
async def get_image(pid: str):
    meta = await run_in_threadpool(store.read_meta, pid)
    return FileResponse(_project_file(pid, meta["imageFile"]))


@app.get("/api/project/{pid}/audio")
async def get_audio(pid: str):
    meta = await run_in_threadpool(store.read_meta, pid)
    return FileResponse(_project_file(pid, meta["audioFile"]))


@app.get("/api/project/{pid}/session")
async def get_session(pid: str):
    data = await run_in_threadpool(store.read_session, pid)
    return data or {}


@app.put("/api/project/{pid}/session")
async def put_session(pid: str, payload: dict):
    if not isinstance(payload, dict):
        raise HTTPException(400, "Session payload must be an object.")
    try:
        return await run_in_threadpool(store.save_session, pid, payload)
    except FileNotFoundError:
        raise HTTPException(404, "Project not found")


# ----------------------------------------------------------------- presets

@app.get("/api/presets")
async def get_presets():
    return await run_in_threadpool(store.list_presets)


@app.post("/api/presets")
async def post_preset(payload: dict):
    if not isinstance(payload.get("params"), dict):
        raise HTTPException(400, "Preset payload must include a params object.")
    return await run_in_threadpool(store.save_preset, payload)


@app.delete("/api/presets/{slug}")
async def remove_preset(slug: str):
    ok = await run_in_threadpool(store.delete_preset, slug)
    if not ok:
        raise HTTPException(404, "Preset not found")
    return {"deleted": slug}


# ----------------------------------------------------------------- exports

@app.get("/api/exports")
async def get_exports():
    return await run_in_threadpool(store.list_exports)


@app.get("/api/exports/{name}")
async def get_export(name: str):
    path = store.EXPORTS / Path(name).name
    if not path.exists() or path.suffix != ".mp4":
        raise HTTPException(404, "Export not found")
    return FileResponse(path, media_type="video/mp4", filename=path.name)


QUALITY = {
    # crf, maxrate, x264 preset. High bitrates on purpose: dark lofi gradients
    # band easily. Draft trades size + a faster preset for quick test renders;
    # the preset only affects encode CPU, not the browser's render time.
    "high": ("16", "24M", "medium"),
    "standard": ("19", "14M", "medium"),
    "draft": ("23", "8M", "veryfast"),
}

# Project ids with a live export stream — guards DELETE /api/project/{pid}.
EXPORTING_PIDS: set[str] = set()


def _build_encode_cmd(
    audio_path: Path, w: int, h: int, fps: int, quality: str, out: Path,
    start: float = 0.0, duration: float = 0.0,
):
    crf, maxrate, preset = QUALITY.get(quality, QUALITY["high"])
    # Range export: decode-trim the audio input (-ss/-t before -i) — still
    # zero audio processing, just a different slice of the master.
    audio_trim = []
    if start > 0:
        audio_trim += ["-ss", f"{start:.3f}"]
    if duration > 0:
        audio_trim += ["-t", f"{duration:.3f}"]
    return [
        ffmpeg_exe(), "-y",
        # raw frames from the browser's WebGL readback (bottom-up, hence vflip)
        "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{w}x{h}", "-r", str(fps),
        "-i", "pipe:0",
        # the untouched audio master
        *audio_trim,
        "-i", str(audio_path),
        "-map", "0:v", "-map", "1:a",
        "-vf", "vflip,format=yuv420p",
        "-c:v", "libx264", "-preset", preset, "-crf", crf,
        "-maxrate", maxrate, "-bufsize", "48M", "-profile:v", "high",
        "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
        # AAC format encode only — no loudness/EQ/dynamics processing, ever.
        "-c:a", "aac", "-b:a", "320k",
        "-movflags", "+faststart", "-shortest",
        str(out),
    ]


@app.websocket("/api/export")
async def export_ws(ws: WebSocket):
    await ws.accept()
    proc: subprocess.Popen | None = None
    log_file = None
    pid = None
    out_path: Path | None = None
    log_path: Path | None = None
    completed = False
    ffmpeg_errored = False
    loop = asyncio.get_running_loop()
    try:
        header = json.loads(await ws.receive_text())
        pid = str(header["projectId"])
        EXPORTING_PIDS.add(pid)
        w, h, fps = int(header["width"]), int(header["height"]), int(header["fps"])
        quality = str(header.get("quality", "high"))
        start = max(float(header.get("start", 0) or 0), 0.0)
        duration = max(float(header.get("duration", 0) or 0), 0.0)
        if not (16 <= w <= 4096 and 16 <= h <= 4096 and fps in (24, 30, 60)):
            raise ValueError("Unsupported export geometry")

        try:
            meta = store.read_meta(pid)
        except FileNotFoundError:
            raise ValueError(
                "This project's files are no longer on disk (was it deleted?). "
                "Re-drop the image + audio to recreate it, then export.")
        audio_path = store.project_dir(pid) / meta["audioFile"]
        if not audio_path.exists():
            raise ValueError("The project's audio file is missing on disk — cannot mux export.")
        store.init_dirs()
        out_name = store.export_filename(meta, w, h, fps)
        out_path = store.EXPORTS / out_name
        log_path = store.EXPORTS / (out_name + ".log")

        log_file = open(log_path, "wb")
        proc = subprocess.Popen(
            _build_encode_cmd(audio_path, w, h, fps, quality, out_path,
                              start=start, duration=duration),
            stdin=subprocess.PIPE, stdout=log_file, stderr=log_file,
        )
        print(f"[export] start {out_name} {w}x{h}@{fps} "
              f"range={start:.2f}+{duration:.2f}s", flush=True)
        await ws.send_text(json.dumps({"type": "started", "file": out_name}))

        bytes_received = 0
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                raise WebSocketDisconnect(msg.get("code", 1006))
            data = msg.get("bytes")
            if data:
                bytes_received += len(data)
                # Blocking write in a thread = natural backpressure into ffmpeg.
                await loop.run_in_executor(None, proc.stdin.write, data)
                # Ack actual consumption — the client paces against these
                # (browser bufferedAmount proved unreliable for multi-GB
                # streams) and detects stalls fast.
                await ws.send_text(json.dumps({"type": "ack", "bytes": bytes_received}))
            elif msg.get("text"):
                control = json.loads(msg["text"])
                if control.get("end"):
                    break
                if control.get("abort"):
                    raise WebSocketDisconnect(1000)

        frame_bytes = w * h * 4
        print(f"[export] end signal: {bytes_received} bytes received "
              f"(~{bytes_received // frame_bytes} frames) — finalizing ffmpeg",
              flush=True)
        await loop.run_in_executor(None, proc.stdin.close)
        rc = await loop.run_in_executor(None, proc.wait)
        print(f"[export] ffmpeg exited rc={rc}", flush=True)
        log_file.close()
        log_file = None
        if rc != 0:
            ffmpeg_errored = True
            tail = log_path.read_bytes()[-800:].decode(errors="replace")
            await ws.send_text(json.dumps({"type": "error", "message": f"ffmpeg exited {rc}: {tail}"}))
        else:
            completed = True
            log_path.unlink(missing_ok=True)
            await ws.send_text(json.dumps({
                "type": "done",
                "file": out_name,
                "url": f"/api/exports/{out_name}",
                "size": out_path.stat().st_size,
                "bytesReceived": bytes_received,
            }))
    except WebSocketDisconnect as exc:
        print(f"[export] websocket disconnected mid-export (code={exc.code}) — "
              "ffmpeg will be killed, partial file is unplayable", flush=True)
    except Exception as exc:  # report anything else back to the client
        print(f"[export] FAILED: {exc!r}", flush=True)
        try:
            await ws.send_text(json.dumps({"type": "error", "message": str(exc)}))
        except Exception:
            pass
    finally:
        if pid is not None:
            EXPORTING_PIDS.discard(pid)
        if proc is not None and proc.poll() is None:
            try:
                proc.stdin.close()
            except Exception:
                pass
            try:
                proc.kill()
                proc.wait(timeout=5)  # release the file handle before unlink
            except Exception:
                pass
        if log_file is not None:
            log_file.close()
        # A partial/aborted export leaves an unplayable .mp4 (and, on a clean
        # cancel, a useless .log) — remove them. Keep the .log only when ffmpeg
        # itself errored, so a real failure stays inspectable.
        if not completed and out_path is not None:
            out_path.unlink(missing_ok=True)
        if log_path is not None and not ffmpeg_errored:
            log_path.unlink(missing_ok=True)


# ------------------------------------------------- server-side render jobs
#
# Foreground-independent export: instead of the user's tab driving the render
# (where backgrounding the tab throttles requestAnimationFrame to a crawl), the
# server spawns a *headless* browser at /?headlessJob=<id>. That instance runs
# the SAME loadProject + runExport path — bit-identical because it's the same
# engine on the same machine/GPU — and streams to /api/export like any export.
# The user's tab just polls job status and can be closed.

_CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]

# job_id -> {id, spec, status, progress, file, message, _proc, _profile}
RENDER_JOBS: dict[str, dict] = {}


def find_chrome() -> str | None:
    for c in _CHROME_CANDIDATES:
        if Path(c).exists():
            return c
    for name in ("chrome", "google-chrome", "chromium", "msedge"):
        exe = shutil.which(name)
        if exe:
            return exe
    return None


def _public(job: dict) -> dict:
    return {k: v for k, v in job.items() if not k.startswith("_")}


def _cleanup_job_proc(job: dict) -> None:
    proc = job.pop("_proc", None)
    if proc is not None and proc.poll() is None:
        try:
            proc.kill()
        except Exception:
            pass
    profile = job.pop("_profile", None)
    if profile:
        shutil.rmtree(profile, ignore_errors=True)


@app.post("/api/render-jobs")
async def create_render_job(spec: dict, request: Request):
    chrome = find_chrome()
    if not chrome:
        raise HTTPException(501, "No Chrome/Edge found for server-side rendering.")
    pid = str(spec.get("projectId") or "")
    try:
        store.read_meta(pid)
    except FileNotFoundError:
        raise HTTPException(404, "Project not found for render job.")
    job_id = uuid.uuid4().hex[:12]
    profile = tempfile.mkdtemp(prefix="sr-headless-")
    # Always reach the server over loopback (the headless browser runs here).
    port = request.url.port or 80
    url = f"http://127.0.0.1:{port}/?headlessJob={job_id}"
    proc = subprocess.Popen(
        [
            chrome, "--headless=new", "--window-size=1400,1000",
            f"--user-data-dir={profile}", "--no-first-run", "--mute-audio",
            "--autoplay-policy=no-user-gesture-required",
            "--disable-dev-shm-usage",
            url,
        ],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    RENDER_JOBS[job_id] = {
        "id": job_id, "spec": spec, "status": "running",
        "progress": 0.0, "file": None, "message": None,
        "_proc": proc, "_profile": profile,
    }
    print(f"[render-job] {job_id} launched headless for project {pid}", flush=True)
    return {"id": job_id}


@app.get("/api/render-jobs/{job_id}")
async def get_render_job(job_id: str):
    job = RENDER_JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Render job not found.")
    # A crashed/closed headless browser would otherwise leave the job 'running'
    # forever — if its process is gone before reporting a result, surface that.
    if job["status"] == "running":
        proc = job.get("_proc")
        if proc is not None and proc.poll() is not None:
            job["status"] = "error"
            job["message"] = "headless renderer exited before finishing"
            _cleanup_job_proc(job)
    return _public(job)


@app.post("/api/render-jobs/{job_id}/progress")
async def render_job_progress(job_id: str, body: dict):
    job = RENDER_JOBS.get(job_id)
    if job and job["status"] == "running":
        job["progress"] = float(body.get("progress", job["progress"]))
    return {"ok": True}


@app.post("/api/render-jobs/{job_id}/result")
async def render_job_result(job_id: str, body: dict):
    job = RENDER_JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Render job not found.")
    if body.get("ok"):
        job["status"] = "done"
        job["file"] = body.get("file")
        job["progress"] = 1.0
    else:
        job["status"] = "error"
        job["message"] = body.get("message") or "server render failed"
    _cleanup_job_proc(job)
    print(f"[render-job] {job_id} {job['status']} "
          f"{job.get('file') or job.get('message')}", flush=True)
    return {"ok": True}


@app.delete("/api/render-jobs/{job_id}")
async def cancel_render_job(job_id: str):
    job = RENDER_JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Render job not found.")
    if job["status"] == "running":
        job["status"] = "cancelled"
    _cleanup_job_proc(job)  # killing the headless tab drops its export WS → ffmpeg cleanup
    print(f"[render-job] {job_id} cancelled", flush=True)
    return {"ok": True}


# ------------------------------------------------------------------ static

app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
