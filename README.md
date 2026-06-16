# Still Reactive

Turn **one still image + one audio file** into an audio-reactive music video —
locally, offline, and free. Real-time WebGL preview, ten tunable style packs,
three aspect ratios (16:9 / 9:16 / 1:1), three frame rates (24 / 30 / 60), and
MP4 export where **what you preview is exactly what you render**.

Implements `plan/VISUALIZER_V2_PLAN.md` (v2) plus the Ableton-style device /
automation / rack system from `plan/AUTOMATION_TIMELINE_UX_PLAN.md`, with a
few deliberate improvements noted below.

## Quick start

```
pip install -r requirements.txt
python -m still_reactive
```

A browser tab opens at `http://127.0.0.1:8765`. Drop one image and one audio
file onto the preview (or use the Inputs buttons). Analysis runs once and is
cached — reopening the same pair is instant ("Recent projects" in the left
panel).

Requires Python 3.10+ and a WebGL2-capable browser (Chrome, Edge, or Firefox).
ffmpeg is bundled via `imageio-ffmpeg` — no separate install.

## Using it

| Where | What |
|---|---|
| Top bar | Style pack, aspect (16:9 / 9:16 / 1:1), FPS, A/B compare, guides, presets, **Export** |
| Center | Live preview — **drag** to reframe the crop, **scroll** to zoom it |
| Right | **Macro rack** + the **device chain**: every effect is an Ableton-style device with Device On (⏻, automatable), an Intensity fader, per-param ∿ modulation strips and ◆ automation LEDs. "+ Add device" browses the unused devices by family. |
| Bottom | Waveform timeline with onset ticks (orange), section boundaries (green) and the draggable **⚑1 downbeat flag** — click/drag to scrub, **space** to play; lane editor opens via any ◆ |
| Left | Inputs, recent projects, saved presets (racks), finished exports |

**Devices (Ableton-style):** each effect behaves like a Live device. The
header checkbox is *Device On* (automatable as a stepped lane via its ◆); the
Intensity slider fades the whole effect absent→present; removing a device
resets it. The chain shows only devices you've added, in fixed pipeline order.

**Modulation matrix:** every continuous parameter has a ∿ editor — pick a
source (low / mid / high / loud / onset / beat), set a bipolar depth, and
optionally a **threshold**: in ramp mode the source must exceed it before
modulating (re-scaled above), in **gate** mode it's a binary trigger — put a
gated depth on a device's Intensity with the base at 0 and the effect becomes
audio-switched. A live meter with a threshold marker shows the source in real
time; driven sliders turn amber and follow their effective value (grab one to
override, Live-style), and every depth is itself automatable. Shaders are
pure functions of params; all reactivity is resolved CPU-side, identically
for preview and export.

**Automation:** click a ◆ to open that parameter's lane on the timeline
(right-click it for quick actions: fade in/out over 4 bars, pulse every bar).
Points snap to the bar/beat grid (Alt = free); drag a segment's apex dot to
bend the curve — vertically for the amount, horizontally to make it turn
early or late — right-/double-click straightens. Lanes are stored in *beats*,
so correcting the BPM keeps everything glued to the bars. Touching an
automated control bypasses its lane (Live's override latch) — re-enable per
lane or with the global *Re-enable automation* button. Ctrl+Z / Ctrl+Shift+Z
undo/redo; `[` `]` cycle lanes; chips above the timeline list every lane.

**Macros (one global rack):** up to eight knobs above the chain (− / + sets
how many are shown; hidden ones keep working). Press `M` on a macro, click
any parameter to map it (with editable min→max range — inverted ranges fine).
Mapped params are owned by the macro, exactly like Live; macros are
themselves automatable. Saving a preset saves the whole rack (devices +
params + macros + automation + tempo grid).

**Tempo grid:** BPM/beats-per-bar come from detection (bass-flux comb, so the
downbeat locks to kicks, not hi-hats, and leading silence is skipped); fix
octave errors with ÷2/×2, nudge bar 1 by a beat with ‹ ›, or drag the blue ⚑1
flag — it snaps to onsets.

**A/B compare:** the `A` button flips between two independent parameter slots;
`⇆` copies the current slot to the other one. Tweak B, flip back and forth.

**Reframe per aspect:** each aspect remembers its own crop position/zoom, so
one project can be tuned for YouTube, Shorts, and square simultaneously
("Batch: export all three aspects" in the export dialog).

**Style packs** (all are starting points, everything stays tunable):
Cinematic/Noir, Dreamy, Psychedelic (Mellow / Full trip), Lo-Fi Tape/VHS,
Ethereal/Ambient, Rainy Window, Glitch Club, Shallow Focus, Cosmic/Drift.

## Audio is never processed

The tool reads the audio to drive visuals (band energy, A-weighted loudness,
onsets, tempo, sections) and plays/muxes the master untouched. The only thing
that ever happens to it is the **AAC 320k format encode** required by the MP4
container at export — no loudness normalization, no EQ, no dynamics, ever.

## Architecture

```
ANALYSIS  (Python, once per input pair, cached to data/projects/<hash>/)
  ffmpeg decode → numpy DSP: low/mid/high bands, A-weighted loudness,
  spectral-flux onsets, tempo + beat phase, section boundaries, waveform
  peaks → analysis.json     · pseudo-depth map → depth.png
            │
PARAMS    (per frame, all CPU, pure functions of (state, t))
  base slot → automation lanes (beats domain) → macro mappings
  → modulation matrix (six features × any param) → Device On + Intensity
            │
RENDER    (browser, WebGL2, pure function of (t, params))
  scene (cover-fit camera, kaleidoscope, domain warp, depth parallax)
  → feedback ping-pong (trails/tunnels) → bright/blur chain (bloom + DOF)
  → post (lens/twirl, ripple, glitch, pixel art, VHS, rain refraction,
     zoom blur, depth of field, fog, god rays, plasma, particles, leaks,
     halftone, neon edge, grade, hue cycle, duotone, posterize, strobe,
     vignette, grain, CA, dither)
            │
EXPORT    (same browser pipeline at full res)
  raw RGBA frames → WebSocket → ffmpeg pipe → H.264 yuv420p + AAC 320k MP4
```

All motion is a function of `t` seconds (fps changes smoothness, never speed),
particles/noise are procedural in `t` (deterministic), and feature smoothing is
precomputed over the whole track — so preview and export are pixel-identical
by construction, not by porting.

### Deliberate deviations from the plan

* **Export renders in the browser**, not in a Python `moderngl` re-implementation.
  The plan's core principle is "share the exact render code between preview and
  export" — running the *same* WebGL context for both is the strongest possible
  version of that guarantee, and it removes an entire duplicate GL stack.
* **No librosa** — ffmpeg decodes, numpy does the DSP. Lighter install, same
  features (incl. A-weighted loudness instead of raw RMS).
* **Zero-build frontend** — vanilla ES modules, no node/TS toolchain needed to run.
* **Flash limiter ships on by default** (the §13 open decision): onset/high-band
  envelopes are rate-limited to ≤3 rises/sec; disable under *Audio response*.
* **Pseudo-depth** (vertical gradient + blurred inverse luminance) instead of a
  depth model: zero downloads, fine for gentle 2.5D parallax. The shaders read
  a depth texture, so dropping in Depth-Anything/MiDaS later only means writing
  a better `depth.png`.

### Not yet built (future work)

HPSS (percussive/harmonic split as extra modulation sources), multiple
coexisting macro racks, a reorderable device chain (the renderer is a fused
fixed-order pipeline), real depth/segmentation models, seamless loop builder,
.cube LUT loading, H.265.

## Export settings

* **High** quality = CRF 16 with 24 Mb/s cap — intentionally generous because
  dark lofi gradients band badly on YouTube re-encodes; grain + the always-on
  dither help too. **Standard** = CRF 19.
* Synthetic motion blur (optional, 24/30 fps): averages 3 sub-frames across a
  ~180° shutter for buttery slow pans.
* Files land in `data/exports/` and are listed in the left panel.

## Development

```
python tests/smoke_backend.py    # synthesizes fixtures, runs analysis, asserts tempo/onsets
python tests/smoke_server.py     # REST + export WebSocket → verifies a real MP4
python tests/check_shaders.py    # compiles all GLSL headlessly via moderngl (pip install moderngl)
python tests/smoke_browser.py    # headless Chrome: boots the app, renders, exports end-to-end
node tests/check_schema.mjs      # device-contract lint: naming, hints, budgets, axis/sweet tags
```

Layout: `still_reactive/` (FastAPI server, analysis, storage) · `web/` (SPA:
`js/shaders.js` GLSL, `js/renderer.js` pass orchestration, `js/main.js`
wiring) · `data/` (projects / presets / exports, all disposable cache).
