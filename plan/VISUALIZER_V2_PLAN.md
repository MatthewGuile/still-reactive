# Music Visualizer v2 — Planning Document

A locally-hosted tool that turns **one still image + one audio file** into an
engaging, audio-reactive music video, with a real-time preview UI, multiple
visual *style packs* (cinematic, dreamy, psychedelic, lo-fi, and more), and
flexible export (frame rate + aspect ratio).

This builds on the v1 prototype, which proved the audio→effect pipeline
end-to-end. v2 generalizes that pipeline, makes it fast enough to preview live,
and wraps it in a UI.

---

## 1. Goals

**Primary**
- A **local web UI** to configure, **preview in real time**, and export.
- Multiple **style packs** the user can pick and tune: *Cinematic/Noir* (v1),
  *Dreamy*, *Psychedelic*, plus several others suited to relaxing lofi.
- **Frame rate** selection: 24 / 30 / 60 fps.
- **Aspect ratio** preview + export: **16:9**, **9:16** (vertical/Shorts/Reels),
  **1:1** (square).
- Keep everything **local, offline, and free** (no cloud services).

**Secondary**
- Per-track **variety** from a single image (so a channel doesn't look repetitive).
- **Presets** save/load + A/B compare.
- Export presets tuned for **YouTube / Shorts / Instagram** (resolution, bitrate, banding).

**No audio processing.** Songs are mastered before they reach this tool. The tool
applies **no** signal processing to the audio — no loudness normalization, no EQ,
no dynamics, no limiting. The only thing that ever happens to the audio is a
**format encode to AAC** for the MP4 container (see §10); the mastered signal is
otherwise passed straight through. Audio analysis only *reads* the file to drive
the visuals — it never writes back to the audio.

**Non-goals (for v2)**
- Full AI video generation / frame interpolation models.
- Multi-image timelines / slideshows (possible v3).
- Cloud rendering or hosting.

---

## 2. Core architecture principle

> **Separate (cached, heavy) analysis from (pure, fast) per-frame rendering, and
> share the exact render code between live preview and final export.**

This is the spine of the whole design. Three layers:

```
┌─────────────────────────────────────────────────────────────┐
│  ANALYSIS (run once per input, cached to disk as JSON/PNG)   │
│   • audio features (RMS, bands, onsets, sections, tempo)     │
│   • depth map (monocular depth estimate)                     │
│   • segmentation masks (sky / water / foreground)            │
└─────────────────────────────────────────────────────────────┘
                              │  cached assets
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  RENDER ENGINE  —  pure function: frame(t, params) → pixels  │
│   • a stack of composable EFFECT MODULES                     │
│   • implemented as GLSL shaders (GPU) for preview+export     │
│   • style packs = named presets over this stack              │
└─────────────────────────────────────────────────────────────┘
            │                                   │
   real-time WebGL preview              headless export (ffmpeg)
   (browser, what-you-see)              (same shaders, full res)
```

The "what you see is what you render" guarantee comes from running the **same
GLSL shader graph** in the browser preview and in the offline exporter.

---

## 3. Render engine: composable effect modules

The image is the background; effects are a **stack of modules**, each reading
the cached assets + audio-feature envelopes and the previous module's output.
A **style pack is just a preset** that enables a subset of modules with tuned
parameters. New looks come from recombining modules, not new code.

### Geometry / camera
| Module | What it does | Driven by |
|---|---|---|
| **Depth parallax (2.5D)** | depth-aware zoom/pan so foreground moves more than background — biggest "alive" upgrade for a still | low band + slow auto path |
| **Ken Burns / camera path** | keyframed bezier pan+zoom with easing, optional handheld micro-shake | manual + RMS |
| **Living-photo warp** | flow-field (domain-warped fBm) displacement via remap; subtle region breathing | mid band |
| **Reframe / crop** | aspect-aware crop with repositionable safe-area (see §5) | manual |

### Atmosphere / overlays
| Module | What it does | Driven by |
|---|---|---|
| **Volumetric fog** | layered drifting fBm smoke, depth-aware thickness, optional god-rays/light shafts | low/mid |
| **Particles** | parallaxed dust / embers / snow / bokeh / starfield | high band flicker |
| **Rain / window** | rain streaks + droplet refraction overlay (classic lofi vibe) | optional |
| **Light leaks / bloom** | glow on highlights, halation, lens dirt, light-leak sweeps | RMS swells |

### Color / texture
| Module | What it does | Driven by |
|---|---|---|
| **Grade** | tint, saturation, gamma/lift/gain, **.cube LUT** support | section |
| **Hue cycle / gradient map** | animated hue rotation or duotone/gradient mapping | tempo/manual |
| **Film/tape texture** | grain bank, scanlines, chroma bleed, gate-weave, VHS jitter | high band |
| **Chromatic aberration** | edge color fringing, energy-reactive | RMS/onset |
| **Vignette** | smooth radial darken, breathing | RMS |

### Psychedelic specials
| Module | What it does | Driven by |
|---|---|---|
| **Feedback / trails** | frame-buffer recursion (zoom+rotate+fade) → infinite tunnels & echoes | onset/beat |
| **Kaleidoscope / mirror** | N-fold radial symmetry, optional rotation | tempo |
| **Domain-warp / liquid** | heavy animated UV warping, "melting" flow | mid/low |
| **Plasma / interference** | additive sine-interference overlays, hue-shifted | tempo |

---

## 4. Style packs (presets shipped by default)

Each is a saved configuration of the module stack. All are starting points the
user tunes live.

1. **Cinematic / Noir** — the v1 look: dark cool grade, smoke, vignette,
   restrained breathing. Background-listening friendly.
2. **Dreamy** — soft bloom + diffusion glow, pastel/warm grade, gentle chromatic
   aberration, slow float, bokeh particles, light leaks, hazy depth fog. Airy,
   nostalgic, "study-with-me" energy.
3. **Psychedelic** — feedback trails + kaleidoscope + domain-warp + hue cycling,
   beat-synced. Two intensity tiers: *Mellow trip* (slow, for chill lofi) and
   *Full trip* (assertive). Tasteful by default, not seizure-y.
4. **Lo-Fi Tape / VHS** — warm grain, scanlines, chroma bleed, tape jitter,
   slight wobble. The retro study-beats aesthetic.
5. **Ethereal / Ambient** — depth fog + god-rays + slow parallax + starfield,
   cool desaturated. For drone/ambient/post-rock.
6. **Rainy Window** — rain overlay + droplet refraction + warm interior glow +
   soft blur. Cozy.
7. **Cosmic / Drift** — parallaxed starfield, nebula plasma, slow zoom, hue drift.

> Each pack has a small set of **headline sliders** surfaced first (e.g. Dreamy:
> *Glow*, *Haze*, *Drift speed*, *Warmth*), with full module controls behind an
> "Advanced" panel.

---

## 5. Aspect ratio handling (16:9 / 9:16 / 1:1)

- Output presets: **16:9** (1920×1080, opt. 2560×1440/4K), **9:16** (1080×1920),
  **1:1** (1080×1080).
- The image is **cover-fit** to the target aspect, leaving slack for motion.
- **Reframe control**: because 9:16 and 1:1 crop away a lot of a landscape photo,
  the UI exposes a draggable **safe-area / crop position + scale** so the user
  picks what stays in frame. Depth map lets us bias the crop toward the subject.
- **Composition guides** overlaid in preview (title-safe, rule-of-thirds).
- Switching aspect in the UI **re-previews instantly** (same shader, different
  output rect) so you can tune one project for all three deliverables.
- Effects are authored in **normalized UV space** so they look consistent across
  aspects (fog/vignette scale to the frame, not to fixed pixels).

---

## 6. Frame rate (24 / 30 / 60)

- Selectable per export; preview can run at a capped rate for responsiveness.
- **All motion is time-based** (function of `t` seconds), so changing fps does
  **not** change motion speed — only smoothness. (v1 already does this.)
- Optional **synthetic motion blur** (accumulate sub-frames) for 24/30 to keep
  slow pans buttery; off by default at 60.
- Guidance surfaced in UI: 24 = filmic, 30 = standard/safe, 60 = ultra-smooth
  (best for fast psychedelic motion; larger files).

---

## 7. Audio analysis (upgrades over v1)

Cached to a sidecar JSON so re-opening a project is instant.

- **Bands**: low/mid/high (v1) + configurable band count.
- **Onset / transient detection** → discrete accent events (bloom/shake/flash hits).
- **HPSS** (harmonic vs percussive) → percussive drives punchy modules, harmonic
  drives slow swells. More musical mapping.
- **Beat tracking / tempo** → optional sync for kaleidoscope/feedback/hue cycle.
- **Structural segmentation** (novelty/agglomerative) → section index so the
  visual **builds across the song** (intensity ramps, grade shifts per section).
- **Perceptual loudness** (A-weighted) instead of raw RMS — for driving visuals
  only; this is an analysis read and never modifies the audio.
- Per-feature **smoothing + response curves** (attack/release, gamma) exposed in UI.
- A **mapping matrix** UI: route any feature → any module parameter with gain +
  curve. This is where power users get variety.

---

## 8. UI design

**Stack:** FastAPI (Python) backend + single-page **WebGL** frontend
(TypeScript, minimal framework or vanilla + a small shader runtime). Browser
does preview; Python does analysis + final export.

**Why WebGL preview (not Gradio/Streamlit):** only a GPU shader gives true
real-time scrubbing + slider feedback, and it lets preview and export share code.

### Layout
- **Top bar**: project name, **Style pack** dropdown, **Aspect** toggle
  (16:9 / 9:16 / 1:1), **FPS** select, Save/Load preset, A/B compare, Export.
- **Center**: live preview canvas with composition guides + reframe handles.
- **Bottom**: **timeline** — waveform + band-energy/onset lanes + playhead;
  scrub and the frame updates instantly; play to hear audio synced to visuals.
- **Right panel**: parameter groups (Camera, Atmosphere, Color, Texture,
  Specials), headline sliders first, "Advanced" expanders, per-module enable
  toggles, and the **feature→parameter mapping matrix**.
- **Left panel**: input files, cached-asset status (depth/seg/audio), presets list.

### Workflow
1. Drop image + audio → backend computes & caches analysis (progress shown).
2. Pick a style pack → instant preview.
3. Scrub / play, tune sliders live, switch aspect/fps to check deliverables.
4. Save preset. Click **Export** → background job → progress → output file(s).
   Optional **batch export** of all three aspects at once.

---

## 9. Performance

- **GPU shaders** for the render graph → preview at interactive rates, export
  at many fps. Feedback/trails modules need a ping-pong framebuffer.
- **Cache** depth map, segmentation, audio features, grain banks, fog textures.
- Preview can render at **reduced resolution / capped fps**; export at full.
- Export is a **headless GL render → pipe frames to ffmpeg** (or render PNG
  sequence → encode). Same shaders as preview.
- Fallback **CPU/numba path** for machines without a usable GPU (slower preview,
  identical output).

---

## 10. Export & platform presets

- **Container / codecs**: **MP4** with **H.264** video (yuv420p) + **AAC** audio.
  (Optional H.265 video for smaller files.)
- **YouTube 16:9**: 1080p high bitrate (≥12 Mbps for dark gradients to fight
  banding) or master at 1440p for a better re-encode tier; grain helps mask
  banding.
- **Shorts / Reels / TikTok 9:16**: 1080×1920, ≤60 s option with auto-trim/loop.
- **Square 1:1**: 1080×1080.
- **Audio: AAC, no processing.** Always output **MP4 + AAC**. No loudness/EQ/
  dynamics processing of any kind — only a format encode. Encode AAC at a
  **high-quality transparent setting** (e.g. **320 kb/s** AAC-LC, or higher, at the
  source sample rate) so the master is preserved as faithfully as the codec allows.
  Even if the source is **WAV** (or any non-AAC format), transcode it to
  high-quality AAC during export — no separate container path.
- **Looping**: optional seamless loop builder for "1 hour" style uploads
  (video-side only; audio is repeated, then encoded once to AAC).
- Subtle **dither** on gradients to further reduce banding (video only).

---

## 11. Tech stack

| Concern | Choice |
|---|---|
| Backend | Python + **FastAPI** + uvicorn |
| Render | **WebGL2 / GLSL** (preview) + headless GL (`moderngl`) for export, shared shader source |
| Audio | librosa, soundfile (analysis/read only — never modifies the master) |
| Depth | Depth-Anything / MiDaS (ONNX Runtime, CPU-ok, cached) |
| Segmentation | lightweight sky/seg model or SAM (cached, optional) |
| Encode | ffmpeg (imageio-ffmpeg) |
| Frontend | TypeScript SPA, small shader runtime, Web Audio for synced playback |
| State | project = JSON preset + cached-asset folder |

---

## 12. Milestones

- **M0 — Refactor core.** Turn v1 into the pure `frame(t, params)` engine +
  cached audio analysis. CPU first. (De-risks everything.)
- **M1 — Effect-module system + GLSL port.** Reusable modules; reproduce the
  v1 Cinematic look as a style pack in shaders.
- **M2 — Preview UI.** FastAPI + WebGL canvas, timeline scrub, live sliders,
  preset save/load.
- **M3 — Aspect + FPS.** Reframe handles, three aspects, fps select, export
  presets, batch export.
- **M4 — Style packs.** Dreamy, Psychedelic, Lo-Fi/VHS, Ethereal, Rainy, Cosmic.
- **M5 — Analysis upgrades.** Onsets, HPSS, sections, tempo, mapping matrix.
- **M6 — Depth + segmentation.** 2.5D parallax + region-aware effects.
- **M7 — Polish.** Loudness, banding/dither, looping, platform export presets.

A useful, shippable tool exists at **M3**; M4+ add range and depth.

---

## 13. Open decisions

- **Frontend framework**: vanilla TS + tiny shader runtime (lean) vs React (richer
  panels). Leaning lean for v2.
- **Depth model size**: accuracy vs first-run download/compute time.
- **Preview fidelity**: cap preview at 720p/30 for responsiveness, or adaptive?
- **Psychedelic safety**: ship a default flash/strobe limiter for accessibility?
- **Packaging**: run via `python -m visualizer_ui` opening localhost, or bundle
  as a one-click app later?
```
