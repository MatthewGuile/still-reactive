"""End-to-end test for the server-side (headless) render path.

Starts the app, asks it to render a short clip via POST /api/render-jobs (which
spawns a headless browser running the real export through the same loadProject +
runExport path the UI uses), polls the job to completion, and verifies a
playable MP4. Skips cleanly if no Chrome/Edge is installed.

Run from repo root: python tests/smoke_headless.py
"""
from __future__ import annotations

import json
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import uvicorn  # noqa: E402

from still_reactive import store  # noqa: E402
from still_reactive.media import ffmpeg_exe  # noqa: E402
from still_reactive.server import app, find_chrome  # noqa: E402

PORT = 8801
BASE = f"http://127.0.0.1:{PORT}"


def get_json(path):
    with urllib.request.urlopen(f"{BASE}{path}", timeout=10) as r:
        return json.loads(r.read())


def post_json(path, obj):
    req = urllib.request.Request(
        f"{BASE}{path}", data=json.dumps(obj).encode(),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def delete(path):
    req = urllib.request.Request(f"{BASE}{path}", method="DELETE")
    try:
        with urllib.request.urlopen(req, timeout=10):
            pass
    except Exception:
        pass


def wait_for_server():
    for _ in range(60):
        try:
            get_json("/api/projects")
            return
        except OSError:
            time.sleep(0.25)
    raise RuntimeError("server did not come up")


def probe(path: Path) -> str:
    out = subprocess.run([ffmpeg_exe(), "-i", str(path), "-f", "null", "-"],
                         capture_output=True, text=True)
    return out.stderr


def main():
    if not find_chrome():
        print("SKIP: no Chrome/Edge found for headless render")
        return

    config = uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="warning",
                            ws_per_message_deflate=False)
    server = uvicorn.Server(config)
    threading.Thread(target=server.run, daemon=True).start()
    wait_for_server()

    projects = get_json("/api/projects")
    assert projects, "no projects — run tests/smoke_backend.py first"
    pid = projects[0]["id"]
    print(f"project         : {pid}")

    spec = {
        "projectId": pid, "aspect": "16:9", "width": 256, "height": 144,
        "fps": 24, "quality": "draft", "start": 0, "duration": 1.0,
        "motionBlur": False,
    }
    job_id = post_json("/api/render-jobs", spec)["id"]
    print(f"render job      : {job_id} launched (headless browser)")

    try:
        deadline = time.time() + 150
        job = {"status": "running", "progress": 0}
        while time.time() < deadline:
            time.sleep(2)
            job = get_json(f"/api/render-jobs/{job_id}")
            if job["status"] != "running":
                break
            print(f"  … {int(job.get('progress', 0) * 100)}%")
        assert job["status"] == "done", f"job ended '{job['status']}': {job.get('message')}"

        path = store.EXPORTS / job["file"]
        assert path.exists() and path.stat().st_size > 5000, f"bad output {path}"
        info = probe(path)
        assert "Duration:" in info, info
        print(f"output          : {path.name} ({path.stat().st_size} bytes)")
        print("ffprobe         : "
              + next(l.strip() for l in info.splitlines() if "Duration:" in l))
        print("OK")
    finally:
        delete(f"/api/render-jobs/{job_id}")  # kill the headless browser if still up
        server.should_exit = True


if __name__ == "__main__":
    main()
