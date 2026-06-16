"""Run the Still Reactive app: `python -m still_reactive` then open the browser."""
from __future__ import annotations

import argparse
import threading
import webbrowser

import uvicorn

from .server import app
from .store import init_dirs


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="still-reactive",
        description="Local audio-reactive music video tool (one still + one track).",
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true", help="don't open a browser tab")
    args = parser.parse_args()

    init_dirs()
    if not args.no_browser:
        url = f"http://{args.host}:{args.port}"
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    # ws_per_message_deflate=False: the export streams raw RGBA frames, which
    # are ~incompressible — compressing them wastes CPU on both ends and, on
    # long exports, overflowed the server's zlib decompressor (MemoryError).
    uvicorn.run(
        app, host=args.host, port=args.port, log_level="info",
        ws_per_message_deflate=False,
    )


if __name__ == "__main__":
    main()
