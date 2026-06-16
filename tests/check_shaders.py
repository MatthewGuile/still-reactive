"""Compile-check the WebGL2 (GLSL ES 3.00) shaders in web/js/shaders.js using
a headless desktop GL context via moderngl.

ES 3.00 and desktop GLSL 3.30 are close enough that swapping the version line
and stripping `precision` statements catches virtually all syntax/type errors
before they ever hit a browser. Run: python tests/check_shaders.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import moderngl

SHADERS_JS = Path(__file__).resolve().parent.parent / "web" / "js" / "shaders.js"


def extract_shaders(src: str) -> dict[str, str]:
    """Evaluate the template-literal exports of shaders.js in Python."""
    consts: dict[str, str] = {}
    # const NAME = `...`;  and  export const NAME = HEADER + NOISE + `...`;
    pattern = re.compile(
        r"(?:export\s+)?const\s+(\w+)\s*=\s*(.+?);\n(?=\n|(?:export\s+)?const|$)",
        re.DOTALL,
    )
    for name, expr in pattern.findall(src):
        parts = []
        for token in re.split(r"\s*\+\s*(?![^`]*`[^`+]*$)", expr.strip()):
            token = token.strip()
            if token.startswith("`"):
                parts.append(token[1:-1] if token.endswith("`") else token[1:])
            elif token in consts:
                parts.append(consts[token])
        consts[name] = "".join(parts)
    return consts


def to_desktop(src: str) -> str:
    src = src.replace("#version 300 es", "#version 330")
    src = re.sub(r"precision\s+\w+\s+float\s*;", "", src)
    return src


def main() -> None:
    js = SHADERS_JS.read_text(encoding="utf-8")
    consts = extract_shaders(js)
    frag_names = [n for n in consts if n.endswith("_SRC") and n != "VERTEX_SRC"]
    if "VERTEX_SRC" not in consts or not frag_names:
        print("FATAL: could not extract shaders from shaders.js")
        print("found:", sorted(consts))
        sys.exit(2)

    ctx = moderngl.create_context(standalone=True)
    vs = to_desktop(consts["VERTEX_SRC"])
    failures = 0
    for name in frag_names:
        fs = to_desktop(consts[name])
        try:
            ctx.program(vertex_shader=vs, fragment_shader=fs)
            print(f"OK   {name}")
        except Exception as exc:
            failures += 1
            print(f"FAIL {name}\n{exc}\n")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
