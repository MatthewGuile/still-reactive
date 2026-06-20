# Still Reactive

Still Reactive is a local tool for making audio-reactive music videos. Start
with an audio track and either a still image or a generated canvas, tune the
look in a live WebGL preview, then export an MP4.

It runs on your machine, stores projects locally, and does not require a cloud
service or a frontend build step.

Please note that it is still a work-in-progress tool.

## Features

- Image, solid colour, gradient, pattern, or transparent canvas as the visual
  base layer.
- Real-time WebGL2 preview with draggable reframing and per-aspect crop memory.
- Audio analysis for low, mid, high, loudness, onset, beat, tempo grid,
  waveform, and section markers.
- Device-style visual effects with automatable on/off controls, intensity
  faders, and per-parameter audio modulation.
- Timeline automation in beat space, including loop regions, markers, downbeat
  adjustment, snapped points, shaped segments, and undo/redo.
- Audio Response panel for live spectrum display, crossover editing, response
  shaping, and routing diagnostics.
- Snapshots for named session checkpoints, plus reusable presets.
- MP4 export in 16:9, 9:16, or 1:1 at 24, 30, or 60 fps.
- Whole-song, loop-region, batch-aspect, motion-blur, and optional headless
  server-side exports.

## Requirements

- Python 3.10 or newer.
- A WebGL2-capable browser such as Chrome, Edge, or Firefox.
- Chrome or Edge if you want to use server-side/headless rendering.

`ffmpeg` is provided through `imageio-ffmpeg`, so a separate ffmpeg install is
not normally needed.

## Quick Start

```bash
pip install -r requirements.txt
python -m still_reactive
```

The app opens at:

```text
http://127.0.0.1:8765
```
## Basic Workflow

1. Choose a base layer in the Inputs panel.
2. Add an audio file, or drop audio and image files onto the preview.
3. Adjust the camera, devices, audio response, and automation.
4. Use the timeline to set the downbeat, markers, loop region, and parameter
   lanes.
5. Export an MP4 from the Export dialog.

Projects, presets, and exports are stored under `data/`. That directory is
ignored by git and is treated as local working data.

## Interface

| Area | Purpose |
| --- | --- |
| Top bar | Aspect ratio, FPS, guides, Audio Response, preset saving, export |
| Left panel | Inputs, base-layer controls, snapshots, project/preset/export library |
| Center preview | Live WebGL preview, drag-and-drop target, crop/reframe surface |
| Right panel | Visual device chain |
| Bottom timeline | Transport, BPM/grid controls, waveform, markers, loops, automation lanes |

## Visual Controls

The right panel is built around a device chain. Each device has a Device On
toggle, an intensity fader, editable parameters, automation access, and audio
modulation depth controls.

Available device families include:

- Motion: camera drift, shake, and depth parallax.
- Generate: shape pulse, fractal, noise flow, spectrum, tunnel, starfield,
  Voronoi, and waveform layers.
- Distort and impact: liquid warp, kaleidoscope, feedback trails, lens/twirl,
  ripple, glitch, strobe, and zoom blur.
- Atmosphere and light: depth of field, fog, particles, rainy window, bloom,
  light rays, and light leaks.
- Colour and style: grade, hue cycle, duotone, colour wash, plasma, pixel art,
  halftone, neon edge, clarity, VHS/tape, film grain, chromatic aberration,
  vignette, sharpen, and highlight soft-clipping.

The Audio Response panel controls the signal that drives modulation. It exposes
the live spectrum, low/mid/high crossover points, response gain, attack,
release, curve, fade smoothness, and flash limiting.

## Automation

Most visual parameters can be automated on the timeline. Automation is stored in
beats, so tempo and downbeat corrections keep lanes aligned to the music.

Snapshots save the full current session state for the loaded project. Presets
save reusable visual settings without bundling media.

## Export

Exports are H.264 MP4 files with AAC 320k audio. The audio track is used for
analysis and muxing only; Still Reactive does not apply EQ, dynamics,
normalization, or loudness processing.

Export options include:

- Aspect: 16:9, 9:16, or 1:1.
- FPS: 24, 30, or 60.
- Resolution presets up to 1440p masters.
- Quality: High, Standard, or Draft.
- Whole song or the current loop region.
- Batch export for all three aspects.
- Optional synthetic motion blur for final renders.
- Optional server-side render using a headless Chrome/Edge instance.

Finished files are written to `data/exports/` and appear in the Library panel.

## Development

Project layout:

```text
still_reactive/   FastAPI server, media handling, project storage, analysis
web/              Vanilla ES-module frontend and WebGL renderer
tests/            Smoke tests, shader checks, browser/export checks
data/             Local projects, presets, exports, and cache files
```

Useful checks:

```bash
python tests/smoke_backend.py
python tests/smoke_server.py
python tests/smoke_headless.py
python tests/smoke_browser.py
python tests/check_shaders.py
node tests/check_schema.mjs
```

The frontend has no build step. `web/package.json` only marks the JavaScript as
ES modules for tooling.
