"""Browser smoke test: serves the app, loads web/test.html in headless Chrome
(real WebGL2 + WebSocket), and reads the report the page posts back.

Run from repo root: python tests/smoke_browser.py
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import uvicorn  # noqa: E402

from still_reactive import store  # noqa: E402
from still_reactive.server import app  # noqa: E402

PORT = 8799
CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]
RESULT = store.PRESETS / "smoke-result.json"


def wait_for_server():
    for _ in range(60):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/projects", timeout=5):
                return
        except OSError:
            time.sleep(0.25)
    raise RuntimeError("server did not come up")


def main():
    chrome = next((c for c in CHROME_CANDIDATES if Path(c).exists()), None)
    if not chrome:
        print("SKIP: no Chrome/Edge found for headless test")
        return

    RESULT.unlink(missing_ok=True)

    config = uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="warning",
                            ws_per_message_deflate=False)
    server = uvicorn.Server(config)
    threading.Thread(target=server.run, daemon=True).start()
    wait_for_server()

    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as profile:
        proc = subprocess.Popen(
            [
                chrome, "--headless=new", "--window-size=1400,1000",
                f"--user-data-dir={profile}", "--no-first-run", "--mute-audio",
                "--autoplay-policy=no-user-gesture-required",
                f"http://127.0.0.1:{PORT}/test.html",
            ],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        try:
            deadline = time.time() + 120
            while time.time() < deadline and not RESULT.exists():
                time.sleep(1)
        finally:
            proc.kill()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                pass
            time.sleep(1)  # let Chrome release profile file locks

    server.should_exit = True
    if not RESULT.exists():
        print("FAIL: browser test produced no report (timeout)")
        sys.exit(1)

    report = json.loads(RESULT.read_text(encoding="utf-8"))["params"]
    for line in report["report"]:
        print(line)
    RESULT.unlink(missing_ok=True)
    if report["failed"]:
        print("RESULT: FAIL")
        sys.exit(1)
    print("RESULT: PASS")


if __name__ == "__main__":
    main()
