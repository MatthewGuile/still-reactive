"""Server smoke test: REST endpoints + the export WebSocket end-to-end.

Starts uvicorn in-process on a test port, hits the API, then streams
synthetic RGBA frames through /api/export and verifies a playable MP4 with
both video and audio comes out. Run from repo root:

    python tests/smoke_server.py
"""
from __future__ import annotations

import asyncio
import json
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import uvicorn  # noqa: E402
import websockets  # noqa: E402

from still_reactive import store  # noqa: E402
from still_reactive.media import ffmpeg_exe  # noqa: E402
from still_reactive.server import app  # noqa: E402

PORT = 8799
BASE = f"http://127.0.0.1:{PORT}"


def get(path: str):
    with urllib.request.urlopen(BASE + path, timeout=10) as r:
        body = r.read()
        return r.status, body


def wait_for_server():
    for _ in range(60):
        try:
            status, _ = get("/api/projects")
            if status == 200:
                return
        except OSError:
            time.sleep(0.25)
    raise RuntimeError("server did not come up")


async def test_export(pid: str) -> Path:
    w, h, fps, seconds = 320, 180, 24, 2.0
    frames = int(seconds * fps)
    frame_bytes = w * h * 4

    async with websockets.connect(
        f"ws://127.0.0.1:{PORT}/api/export", max_size=None
    ) as ws:
        await ws.send(json.dumps({
            "projectId": pid, "width": w, "height": h, "fps": fps, "quality": "standard",
        }))
        started = json.loads(await ws.recv())
        assert started["type"] == "started", started

        for i in range(frames):
            shade = int(255 * i / frames)
            frame = bytes([shade, 64, 255 - shade, 255]) * (w * h)
            assert len(frame) == frame_bytes
            await ws.send(frame)
        await ws.send(json.dumps({"end": True}))
        # consumption acks stream back interleaved — skip to the terminal reply
        done = json.loads(await ws.recv())
        acks = 0
        while done.get("type") == "ack":
            acks += 1
            done = json.loads(await ws.recv())
        assert done["type"] == "done", done
        assert acks > 0, "server sent no consumption acks"
        print(f"export reply    : {done['file']} ({done['size']} bytes)")
        return store.EXPORTS / done["file"]


async def test_export_missing_project() -> None:
    """Exporting a project whose files are gone must report a clear error,
    not crash with a raw FileNotFoundError (regression: deleting the loaded
    project then exporting)."""
    async with websockets.connect(
        f"ws://127.0.0.1:{PORT}/api/export", max_size=None
    ) as ws:
        await ws.send(json.dumps({
            "projectId": "deadbeef0000", "width": 320, "height": 180,
            "fps": 24, "quality": "standard",
        }))
        msg = json.loads(await ws.recv())
        assert msg["type"] == "error", msg
        assert "no longer on disk" in msg["message"], msg
    print("missing project   : ok (clean error, no crash)")


def probe(path: Path) -> str:
    out = subprocess.run(
        [ffmpeg_exe(), "-i", str(path), "-f", "null", "-"],
        capture_output=True, text=True,
    )
    return out.stderr


def main():
    # ws_per_message_deflate=False mirrors the real launcher: never compress
    # the raw-RGBA export stream (incompressible; crashed the decompressor).
    config = uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="warning",
                            ws_per_message_deflate=False)
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    wait_for_server()

    status, body = get("/")
    assert status == 200 and b"Still Reactive" in body, "index.html not served"
    print("GET /           : ok (index.html)")

    status, body = get("/api/projects")
    projects = json.loads(body)
    assert projects, "no projects found — run tests/smoke_backend.py first"
    pid = projects[0]["id"]
    print(f"GET /api/projects: ok ({len(projects)} project(s), using {pid})")

    for path in (f"/api/project/{pid}/analysis", f"/api/project/{pid}/depth",
                 f"/api/project/{pid}/image", f"/api/project/{pid}/audio"):
        status, _ = get(path)
        assert status == 200, f"{path} -> {status}"
    print("project assets  : ok (analysis/depth/image/audio)")

    # session persistence roundtrip (tempo/automation/chain/macros mirror)
    session = {"tempo": {"bpm": 99.5}, "automation": {"warpMix": {
        "enabled": True, "points": [{"b": 0, "v": 0}, {"b": 4, "v": 1}]}}}
    req = urllib.request.Request(
        f"{BASE}/api/project/{pid}/session",
        data=json.dumps(session).encode(),
        headers={"Content-Type": "application/json"}, method="PUT",
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        assert r.status == 200
    status, body = get(f"/api/project/{pid}/session")
    roundtrip = json.loads(body)
    assert roundtrip.get("tempo", {}).get("bpm") == 99.5, roundtrip
    assert "warpMix" in roundtrip.get("automation", {}), roundtrip
    print("session         : ok (PUT/GET roundtrip)")

    # R6: image swap (same audio — analysis + session carry over), rename,
    # delete. Use a synthetic PNG so the sibling project id is new.
    png = (Path(__file__).parent / "fixtures" / "export_frame.png").read_bytes()
    boundary = "smokeswapboundary"
    body = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="image"; filename="swap.png"\r\n'
        "Content-Type: image/png\r\n\r\n"
    ).encode() + png + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        f"{BASE}/api/project/{pid}/image", data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        swapped = json.loads(r.read())
    assert swapped["id"] != pid, "swap should mint a sibling project"
    assert swapped["analysisReady"], swapped
    assert swapped["audioName"] == projects[0]["audioName"], swapped
    status, body2 = get(f"/api/project/{swapped['id']}/session")
    carried = json.loads(body2)
    assert carried.get("tempo", {}).get("bpm") == 99.5, "session must carry over"
    status, _ = get(f"/api/project/{swapped['id']}/depth")
    assert status == 200, "depth must regenerate for the new image"
    print(f"image swap      : ok ({pid} -> {swapped['id']}, session carried)")

    req = urllib.request.Request(
        f"{BASE}/api/project/{swapped['id']}",
        data=json.dumps({"name": "Smoke Renamed"}).encode(),
        headers={"Content-Type": "application/json"}, method="PATCH",
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        renamed = json.loads(r.read())
    assert renamed.get("name") == "Smoke Renamed", renamed
    req = urllib.request.Request(
        f"{BASE}/api/project/{swapped['id']}", method="DELETE")
    with urllib.request.urlopen(req, timeout=10) as r:
        assert r.status == 200
    try:
        get(f"/api/project/{swapped['id']}")
        raise AssertionError("deleted project still served")
    except urllib.error.HTTPError as exc:
        assert exc.code == 404, exc.code
    print("rename + delete : ok (sibling cleaned up, 404 after delete)")

    # rack round-trip (POST → GET → DELETE)
    rack = {"name": "My Rack", "deviceIds": ["bloom"],
            "params": {"bloomThreshold": 0.5},
            "macros": [{"name": "Glow", "value": 0.4,
                        "mappings": [{"key": "bloomAmount", "min": 0.0, "max": 0.8}]}]}
    req = urllib.request.Request(
        f"{BASE}/api/racks",
        data=json.dumps(rack).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        assert r.status == 200
        saved = json.loads(r.read())
    slug = saved["slug"]
    status, body = get("/api/racks")
    assert status == 200
    racks = json.loads(body)
    assert any(x["slug"] == slug for x in racks), f"rack {slug!r} not in list"
    req = urllib.request.Request(f"{BASE}/api/racks/{slug}", method="DELETE")
    with urllib.request.urlopen(req, timeout=10) as r:
        assert r.status in (200, 204)
    print(f"racks           : ok (POST/GET/DELETE roundtrip, slug={slug!r})")

    asyncio.run(test_export_missing_project())

    out_path = asyncio.run(test_export(pid))
    assert out_path.exists() and out_path.stat().st_size > 10_000
    info = probe(out_path)
    assert "Video: h264" in info and "Audio: aac" in info, info[-600:]
    dur_line = [l for l in info.splitlines() if "Duration" in l][0].strip()
    print(f"ffprobe         : {dur_line}")
    assert "00:00:0" in dur_line
    print("OK")

    server.should_exit = True
    thread.join(timeout=5)


if __name__ == "__main__":
    main()
