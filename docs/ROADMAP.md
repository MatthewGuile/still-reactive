# Still Reactive — Roadmap (active)

Forward-looking plan: what's **next** and what's **queued**. Implemented
history (Rounds 1–10) and full design rationale live in the archive:
[AUTOMATION_TIMELINE_UX_PLAN.md](AUTOMATION_TIMELINE_UX_PLAN.md) — section
references below (e.g. "archive §15") point there.

---

## Current state (2026-06-20)

Local web app: FastAPI backend + zero-build WebGL2 frontend; a still image
*or* a Canvas base layer (colour / gradient / pattern / transparent) +
audio → an audio-reactive video, with deterministic browser-side MP4
export. Rounds 1–10 shipped: device chain + per-param modulation matrix,
beats-domain automation, Master finishing strip, the Signal analyser panel,
eight named generators (Shape Pulse / Fractal / Noise Flow / Spectrum /
Tunnel / Starfield / Voronoi / Waveform, each with a beat-sync clock), Canvas
base layer, snapshots, project library, progressive-disclosure UI.

**Racks v1 shipped 2026-06-20** and is merged to `main` (`ffa1352`): the old
global macro quartet is replaced by rack-scoped macro controls (`state.racks`,
dynamic `rkN.mM` macro keys, rack-aware `applyMacros`, rack-card UI, Map /
Assign flows, macro automation, rack save/apply/delete, rack persistence in
sessions/snapshots/undo). The public entry point is **Load rack** / **Rack
presets**; curated starter presets are still future work. Last full regression
before merge: `smoke_backend`, `smoke_server`, `check_shaders`,
`smoke_browser`, and `check_schema`.

**Rack mapping correctness shipped 2026-06-21** (branch `feat/rack-mapping`):
the non-curation half of item 1. Mapping shapes are now type-discriminated —
numeric `{key,min,max}` (min<max), enum `{key,min,max}` option-index sub-range,
bool `{key,threshold,invert}`. A pure `normalizeMapping(mm, s)` is the single
funnel for migration (legacy bool `{min,max}`→threshold), creation defaults, and
edit validation; it runs on every rack-restore path (`sanitizeRacks`,
`applyRackToState`, undo `restoreHistory`). Each macro's disclosure now has an
inline editor: numeric bounds, enum lo/hi selects, bool threshold + invert,
reset-to-default, and a live effective-value readout. `applyMacros` stays a pure
function of `(params, racks)` — determinism untouched; migration is lazy/in-memory
(no cache bump). Curated starter presets remain future work (item 9 below).

**Racks PARKED 2026-06-21** (branch `chore/park-racks`): the rack UX was adding
complexity that got in the way of creativity, so the **entire rack UI is hidden
from the frontend** behind a `RACKS_ENABLED = false` flag (`web/js/main.js`) —
`buildRacksArea()` and `refreshRackLibrary()` gate on it, so the rack cards,
+ Rack / Load rack / Map / Assign / Save controls, and the Rack-presets library
section all render nothing and stay hidden. **The engine stays live but dormant**
(`applyMacros`, `normalizeMapping`, `state.racks`, persistence, undo, the
`/api/racks` endpoints, and `paramIndex` rack keys are all intact; with no racks
created, `applyMacros` is a no-op and determinism is unaffected). Engine
behaviour stays covered by the pure/state-level rack tests. **To revive:** flip
`RACKS_ENABLED` to `true`; revisit the rack model/feel first. Items 1 and 9 are
therefore on hold (the threshold + invert mapping model is preserved in the
dormant code).

**Snapshots RETIRED 2026-06-21** (branch `chore/retire-snapshots`) — roadmap
item 2 **sub-project A** (save-model cleanup). The user-facing Snapshots feature
is gone (UI, `state.snapshots`, `refreshSnapshots`/`saveSnapshot`/
`restoreSnapshot`, `sanitizeSnapshots`, and the `buildSessionPayload`
`includeSnapshots` branch). **Projects + autosave are now the entire save
model** — a Project is the canonical saved work; per-project autosave/session
restore is the invisible safety net. Undo/redo (`historySnapshot`/`history.stack`)
is a separate system and untouched. Old sessions carrying a `snapshots` key are
silently ignored (compatibility dropped). Frontend-only; determinism unaffected.

**Replace audio SHIPPED 2026-06-21** (branch `feat/replace-audio`) — roadmap
item 2 **sub-project B**, which completes item 2. Mirrors the content-addressed
image-swap: `store.swap_audio` mints a **sibling** project
`sha1(image+new_audio)`, copies `session.json` (creative state) but NOT
`analysis.json`, records `replacedFrom`; `POST /api/project/{pid}/audio` runs
`ensure_analysis` on the sibling and returns `{...meta, comparison}` where
`analysis.compare_audio` flags duration/tempo/downbeat drift (tol 0.5s / 1.0bpm
/ 0.1s). The media-card **"Replace audio"** button flushes the session, POSTs the
file, and `loadProject`s the sibling — **project timing is kept** automatically
(the copied session restores `tempoMap` over the new analysis), with an
**apply-then-warn** toast on drift. The **old project stays in the Library =
free rollback**; identical audio dedupes. No checksum, no modal, no
accept-new-timing. Determinism unaffected. **Item 2 (project model cleanup +
replace audio) is COMPLETE.**

**UI settings + Focus default SHIPPED 2026-06-23** (branch
`feat/ui-settings-focus`) — roadmap item 3. Focus mode is now an **app-global UI
preference**, not per-project state: a new `sr:ui-prefs` localStorage store
(`loadUiPrefs`/`saveUiPrefs`/`UI_PREFS_DEFAULTS`, default `focus:true`) is read
into `state.focus` at boot, and `focus` is removed from `buildSessionPayload`,
`applySessionData`, and the project-load re-sync. The **inline Focus toggle is
gone** from the Devices add-bar (the `ParamPanel.setFocusMode` collapse mechanism
stays). A topbar **`⚙` gear** opens a shortcuts-style **Settings popover**
(`.settings-pop`, outside-click/Esc/re-click to dismiss) housing the single Focus
checkbox — the escape hatch (uncheck for the full-detail surface), wired to
`state.focus` + `panel.setFocusMode` + `saveUiPrefs`. Local UI pref only;
**render determinism unaffected** (Focus was never a render input). Old saves
carrying a `focus` key are silently ignored (compatibility dropped).

**Timeline waveform SHIPPED 2026-06-24** (branch `feat/timeline-waveform`) — the
first half of roadmap item 4, split out as an independent precursor. The timeline
waveform is now drawn **client-side from the decoded `AudioBuffer`** via a pure
`WaveformPeaks` cache (`web/js/waveform.js`): a min/max/RMS bucket cache
(`BUCKET=512`) that serves per-pixel-column data, aggregating buckets when zoomed
out and reading raw samples when deep-zoomed — so it stays crisp at any zoom
instead of the old blocky 1200-bin `wavePeaks`. Rendered in **style B** (dim peak
envelope + bright RMS core), preserving the played/unplayed split and lane
dimming; built/set in `loadProject` (Replace audio inherits it). Determinism
unaffected (timeline chrome, never a render input); no analysis change — the now
unused `wavePeaks` field is dropped later by the onsets/tempo spec, which owns the
v3→v4 cache bump. Next roadmap item: **4 — R16-P0 onset & tempo detection
accuracy (RC1/RC2/RC3)**, the second half of item 4.

**Personal tool:** the user is the target user, refining requirements
through use. No external-user validation. Reactivity confirmed via the
user's own test videos.

## Governing principles (don't regress these)

- **Compatibility dropped** (prototype): breaking old saved projects /
  autosaves is acceptable; prefer a clean model over shims.
- **Determinism:** rendering is a pure function of `(t, params, racks)` — preview
  and export are bit-identical. Never break this.
- **Per-frame resolution order:** base params → lanes (beats domain) →
  rack macros → modulation → Device On + Mix → uniforms.
- **Schema-lint contract** (`tests/check_schema.mjs`): every device — Mix
  fader first, one fader per device, vocabulary, mandatory hints,
  axis/sweet tags, a fader resolution path, ≤6 visible params (rest under
  More…). New devices inherit it for free.
- **Run the full regression pass after each phase:** `smoke_backend`,
  `smoke_server`, `check_shaders`, `smoke_browser`, and `check_schema`.
- **Gotchas:** ImageBitmap needs `{imageOrientation:'flipY'}`; no literal
  backticks in GLSL inside `shaders.js` template literals; keep non-ASCII
  out of test step strings (cp1252 console); static files serve
  `Cache-Control: no-cache`; generators map onto 6 uniform shader slots.

---

## Next up

**Recommended sequence (updated 2026-06-20).** This is the authority on order;
round numbers below are historical labels, not priority.

1. **Rack Improvements: mapping control correctness.** ✅ **SHIPPED 2026-06-21**
   (branch `feat/rack-mapping`; see "Current state"). Editable continuous
   lower/upper bounds, bool/device-on trigger thresholds + invert, enum
   sub-range handling, per-macro mapping editor, undo, persistence, and
   saved-rack round-trips. The curated-presets half is item 9 below.
2. **Project model cleanup + replace audio** — ✅ **SHIPPED 2026-06-21**
   (see "Current state"). Sub-project A retired Snapshots (Projects + autosave
   are the save model); sub-project B added Replace audio (content-addressed
   swap-audio sibling, re-analysis, keep-timing/apply-then-warn, free rollback).
3. **UI settings + Focus default.** ✅ **SHIPPED 2026-06-23** (branch
   `feat/ui-settings-focus`; see "Current state"). Focus is now an app-global UI
   preference (`sr:ui-prefs` localStorage, default on), off the per-project
   session payload; the inline Focus toggle is gone from the Devices add-bar; a
   topbar `⚙` gear opens a shortcuts-style Settings popover housing the Focus
   checkbox (the escape hatch). Local UI pref only — render determinism
   unaffected.
4. **Custom modulation triggers** (was R16-P0 — re-scoped 2026-06-25 into a
   multi-slice feature; vision spec
   `docs/superpowers/specs/2026-06-25-custom-modulation-triggers-design.md`).
   User-editable **"trigger sets"** — points in time detected per band
   (Overall/Low/Mid/High), user-facing term *Trigger* (internally *onset*) —
   viewable/editable on the timeline and routable as **modulation sources**.
   **Slice 1a SHIPPED 2026-06-25** (branch `feat/trigger-detection-foundation`):
   phase-lock tempo refit (RC1) + multiband trigger candidates in `analysis.json`
   (v4, `wavePeaks` dropped) + the frontend `detectTriggers` selectivity filter.
   **Slice 1b SHIPPED 2026-06-25** (branch `feat/triggers-signal-viewing`): a
   **Triggers** section in the Signal panel — detect per-band recipe sets
   (band + selectivity) — shown as color-coded ticks on the timeline, with a
   per-set show toggle and a Settings "Show trigger overlays" default.
   **Slice 2 SHIPPED 2026-06-25** (branch `feat/trigger-modulation`): trigger
   sets are now **deterministic modulation sources** — each fires a decaying
   pulse (`triggerEnvelope`, pure in t) routed via the mod matrix (`trg:<id>`
   sources in every param's mod menu), with a per-set decay control.
   **Slice 3 SHIPPED 2026-06-25** (branch `feat/trigger-editing`; spec
   `docs/superpowers/specs/2026-06-25-trigger-editing-design.md`): the vision is
   **complete (detect → edit → route)**. Sets now store an editable, sorted
   `triggers:[{t,s}]` array (detect bakes it; legacy sets migrate on load).
   An **Edit** button opens a set in the timeline lane editor (mutually exclusive
   with a param lane): **Draw** adds, **Move** drags (x = time snapped, y =
   strength), right-click/double-click deletes — modulation + overlay update
   live, and edits are undoable via the history snapshot. Plus **Re-detect**
   (confirm-gated), **+ Empty** (hand-placed) sets, and inline **rename**.
   **⚠ NEEDS REFINEMENT (user, 2026-06-25):** the trigger system is *functionally*
   complete but rough — treat it as a working prototype, not finished. A dedicated
   refinement pass is needed across: **detection quality** (per-band selectivity/
   thresholds, what counts as a trigger, octave/tempo-refit robustness on real
   tracks), the **Triggers UI/UX** (the Signal section + detect/edit flow are
   minimal; set management, live selectivity preview, edit-lane affordances —
   incl. **dragging trigger markers in Move mode** directly on the timeline
   without first opening a set's Edit mode), **overlay legibility** on the
   timeline, and the **modulation feel** (decay/attack shaping, per-trigger
   strength response). Gather specifics from real use before the polish pass. Restores trust in the timeline/audio analysis and is
   the foundation for the trigger-modulation system.
5. **R11-P3 — golden-frame visual-regression test.** Add this before any shader,
   render-pipeline, or image-layer work. It is less urgent than the two known
   user-facing issues above, but it should gate the architectural rounds.
6. **R11-P1/P2 + R11-P5/P6 — design-system and live-chrome pass.** Tokenise the
   UI, settle typography, and make audio-driven state visibly legible before
   building larger layer/rack/preset surfaces.
7. **R16-P1/P2 — meter map + tempo automation.** Once R16-P0 proves the time
   analysis is reliable, generalise the timeline's time model before more preset
   and template work depends on automation semantics.
8. **R12 + R15 — image layers on a modular render pipeline.** Design these as
   one architecture block: layers need the pass graph, and the pass graph should
   be shaped around per-layer devices.
9. **Rack Improvements: curated starter Rack presets.** Add bundled starter Rack
   presets behind **Load rack** after mapping bounds/thresholds are real, so
   presets do not encode hidden behavior the user cannot inspect or tune.
10. **R13-P3/P4/P5 — factory presets, gallery UX, and mastering presets.** Do
   this after the device/render model is stable, otherwise factory content will
   be re-authored twice.

### Project model cleanup + replace audio

Plan:
[docs/superpowers/plans/2026-06-20-project-model-replace-audio.md](superpowers/plans/2026-06-20-project-model-replace-audio.md).

The save model should separate **Projects** from transient recovery/versioning.
The current Snapshot concept overlaps with Projects and makes the Library model
harder to explain; default direction is to **remove Snapshots** unless a later
design finds a clearly separate role for them, such as hidden autosave restore
points or explicit project versions.

- **Project = canonical saved work.** It owns the visual build: audio reference,
  analysis metadata, base layer, devices, racks, params, automation lanes,
  markers, loop, aspect/export settings, and any future layer stack.
- **Snapshots likely removed from the primary UI.** If retained, they must not
  compete with Projects; they should be framed as restore points / versions, not
  another thing a user must choose between when saving work.
- **Replace audio in an existing project.** Let the user load a new audio file
  into the current project, intended for cases like replacing an unmastered song
  bounce with the latest mastered version while keeping the same automation and
  visual design.
- **Preserve creative state.** Replacing audio keeps devices, racks, macro
  mappings, params, automation, markers, loop, base layer, and export settings.
  It re-runs analysis for the new file and updates waveform/onsets/tempo data.
- **Timing guard rails.** Beat-domain automation should remain attached to bars
  and beats. If the new audio has a different duration, detected tempo, downbeat,
  or leading silence, show a review warning and offer obvious follow-up actions
  rather than silently shifting the project.
- **Project metadata.** Store enough audio identity to make replacement
  inspectable: filename, duration, analysis version, detected tempo/downbeat,
  and optionally a checksum or content id.

### UI settings + Focus default

Focus mode should become the default way to work with Devices. The Focus control
should not sit inline in the Devices area; it reads like another device workflow
choice when it is really a UI preference.

- **Default to Focus mode.** New sessions should open with focused/progressive
  device controls by default, keeping the device surface quieter.
- **Remove the inline Focus toggle from Devices.** Do not make the user choose
  Focus mode from inside the main device workflow.
- **Add a Settings button.** A small app-level settings button opens a modal /
  popover for UI preferences, including Focus mode and future chrome density /
  disclosure options.
- **Persist locally, not in renders.** UI preferences should be user-local app
  settings unless there is a strong reason to store them in a Project. They must
  not affect render determinism or exported output.
- **Keep an escape hatch.** Users should still be able to disable Focus mode
  from Settings when they want a full-detail editing surface.

### Round 11 — UI consistency foundation & visual QA  (archive §15)

Remaining Round 11 work is no longer the immediate next step, but it should land
before the layer/render architecture. Golden frames are the render safety net;
tokens, typography, and live-state legibility are the UI foundation.

- **R11-P1 (re-scoped 2026-06-16, frontend design eval)** — `STYLE_GUIDE.md`
  + design-token layer in `:root`. **Not just a literal-dedupe — a voiced
  system.** Open the guide by naming the design thesis (an *instrument for
  turning sound into light*) and the **semantic colour contract**: amber
  (`--accent-2`) = automation / beats domain (driven sliders, lane chips, Bar-1
  cluster), blue (`--accent`) = modulation / structure. Then collapse the ad-hoc
  literals onto tokens: 9 radii → sm/md/lg, 8 font-sizes → a type scale, a
  spacing scale, surface/text colours, and **status colours tokenised** (the
  scattered `#ff7a7a` danger / `#3f9b58` ok / `#b04a4a`/`#b3403f` err →
  `--danger` / `--ok` / `--warn`). **Accent identity — DECIDED 2026-06-16
  (design-lead call, iterate freely):** retune off the default cornflower
  `#7aa2ff` to a **two-temperature, subject-derived palette** — warm
  `--accent-2` amber `#ffb45a` stays the *live / audio-driven / time* colour (it
  already glows = light/energy), and the cool `--accent` becomes a clean
  **teal-cyan (~`#4fc3d4`, tune to taste)** for *control / structure / static*.
  Rationale: the tool **is** a colour grader, so the cinematic **teal-&-orange**
  complementary grade as the chrome's own identity is apt and witty rather than
  the default dark-tool blue — and it's none of the three generic AI looks. Keep
  both moderate-saturation (instrument, not neon). Net change is small: swap one
  token hue + retune the few amber/blue literals onto the two tokens.
- **R11-P2** — behaviour-preserving CSS refactor onto the tokens.
- **R11-P3** — golden-frame visual-regression test (render the clean default
  plus representative device/effect combinations at fixed `t` — not the stale
  packs, now hidden — pixel-diff vs committed `tests/fixtures/golden/` PNGs
  with tolerance, on headless Chrome; "bless" flag to regen).
- **R11-P5 — instrument typography (new 2026-06-16).** Today it is `system-ui`
  13px for everything, with uppercase + letter-spacing labels as the *only*
  typographic device. Give type a voice: a numeric / mono face for **all
  readouts** (time, BPM, param values, meters — already `tabular-nums`) to unify
  the instrument feel, a characterful **display face used with restraint** (brand,
  empty / start state, section heads), `system-ui` kept for body. Folds the
  R11-P1 "8 sizes → scale" work into a voiced type scale rather than a flat
  dedupe. Zero-build constraint: prefer self-hosted `woff2` or a system stack,
  no FOIT.
- **R11-P6 — "Live" legibility, the signature (new 2026-06-16).** Make
  audio-reactivity visible in the chrome itself — the one place to spend
  boldness, everything else stays quiet. Generalise the existing driven-amber
  one-off (`input.driven`, `style.css:551`) into a **system**: a consistent
  "this value is being driven, and by how much" treatment across sliders, macros
  and lane chips; plus a calm armed / playing affordance so the tool *feels*
  live while audio runs. Pure chrome — no render / determinism impact.
- **R11-P7 — timeline marker legibility (RC3, diagnosed 2026-06-16 — full
  write-up in R16-P0).** The onset ticks read as clutter, mimic the beat grid,
  and their purpose is hidden. Hide onsets by default + reveal while dragging the
  ⚑1 flag, give them a language distinct from the grid, and add a "what the marks
  mean" line to the `?` shortcuts popover. Pure chrome.

### Round 12 — image layers  (archive §, "Future — layer stack")

A layer stack on the Canvas base layer: add images / generators / effects
as layers on top, each with opacity/blend and ideally **per-layer
devices**. Background/foreground (user cut-outs or auto depth/segmentation),
multiple images (potentially per-layer on the timeline). The large
architectural round; the Canvas-base-layer model was built to carry it.

### Round 13 — Looks → presets (factory presets + mastering presets)

**Split across the sequence:** **R13-P1/P2 (preset model + trap fix)** is
parked after Racks v1; the "starting point" path now runs through rack presets /
Load rack and, much later, Templates. **R13-P3/P4/P5 (re-author factory presets,
gallery UX, mastering presets)** remains later, after the device set matures
post-layers.

Looks are currently hidden. **Decision locked:** whole-chain Looks are redundant
with Presets, so they fold into the Preset system rather than returning as a
separate subsystem. Rack-scoped macros are now the live layer. The grade/finish
half of a "look" is reborn as a *separate, composable* concept (mastering
presets).

- **R13-P1 — Looks become factory presets.** Re-home the curated looks as
  bundled factory presets, listed alongside user presets (with a "factory" tag);
  retire the separate `packs.js` / Look-browser path. One
  "starting point" concept instead of three (Looks / Presets / Macros).
- **R13-P2 — preset scope + reversibility (fix the trap).** Presets carry
  **params + device chain only — no automation baked in** (for now). **Tempo
  is inherited from the song** (the user-defined tempo if present, else the
  estimated one), never from the preset. Add an explicit **"Default / clean
  start"** entry and make applying a preset undoable back to clean defaults.
  Decouple `state.packId` so "no look" is a real, selectable state, not an
  implicit `cinematic`.
- **R13-P3 — re-author the factory presets on the current schema.** Rebuild on
  today's 42-device chain: the new generators (Tunnel / Starfield / Voronoi /
  Waveform), the Master finishing strip, and the modulation matrix — the R7-3
  set predates much of this and underuses it. Each should read as a strong,
  distinct starting point and stay fully live-tunable. Feeds the R11-P3 golden
  frames once stable.
- **R13-P4 — UX of choosing a starting point.** Surface the factory-preset
  gallery as a deliberate step **after** the startup phase (audio + base-layer
  drop), not auto-applied at boot. Reconcile with the Project / Library entry
  points so there is one obvious path in; if project versions exist, keep them
  subordinate to Projects rather than reviving Snapshots as a parallel save
  model. Drop the dead `pendingLook` start-state hook.
- **R13-P5 — Mastering presets (new concept).** A Master-strip-scoped recall —
  grade / sharpen / output / wash / clarity only — applied **on top of** the
  current build without touching generators or effects: the composable film
  "look" / mastering-chain analog that a full preset can't be. Design together
  with the queued LUT + colour-wheel grading suite (a LUT is essentially a
  mastering preset) — see R3-P3.

### Round 15 — Modular render pipeline (user-ordered effects)

**The ask (2026-06-16):** make the effect *render order* user-controlled —
the order a device sits in the chain is the order it processes — so reordering
the chain reorders the look. Worth doing "creatively". Big architectural round;
sequence it **with Round 12 (image layers)** — a per-pass pipeline is the
natural substrate for per-layer devices, so design the two together.

**Where we are.** Effect order is hard-baked into two monolithic fragment
shaders (`SCENE_SRC`, `POST_SRC`) plus a fixed pass sequence in
`renderer.render()` (scene → feedback → bloom → DOF → post). The device chain is
**UI-only** — it never reaches the renderer (`params.js`: "chain order is always
pipeline order … fixed"). The renderer gets a flat resolved `params`, not the
chain. **The existing proof-of-concept:** generators already map active devices
onto 6 shader slots in array order (`genUniforms`) — the data-driven dispatch
model, just not yet user-reorderable or generalised.

**The crux — effects are three classes, each reorders differently:**
1. *Pointwise colour* (grade, hue/sat, vibrance, vignette, grain, output,
   wash, clarity): operate on the sampled pixel → **reorder freely** in a fused
   register loop. Cheapest, highest creative payoff (grade-before-vs-after-bloom,
   sharpen-before-vs-after-grade).
2. *UV / spatial remaps* (warp, kaleido, lens, ripple, glitch, pixelate, VHS,
   rain, parallax, displace): transform the *sampling coordinate before
   texturing* → compose as a chain of coordinate transforms, must run pre-sample;
   can't live in a post-colour loop.
3. *Neighbour-tap / stateful / multi-pass* (sharpen, CA, bloom, blur, DOF,
   feedback): need texture neighbourhoods / their own targets / the previous
   frame → must be their own passes (bloom/feedback/DOF already are).

**Creative approach — a fused modular pass graph (not one pass per device).**
- **R15-P1 — reorderable colour stage (ships value first, ~zero perf cost).**
  Refactor `POST_SRC`'s pointwise ops into `applyColourOp(kind, col, …)` driven
  by a `uColourOrder[N]` uniform in chain order — the generator model applied to
  colour. Single pass, no recompiles, pure in `(t, params, order)` so
  preview==export holds. Drag-to-reorder the colour devices.
- **R15-P2 — pass-graph framework.** A small pass manager: ping-pong full-res
  targets + a builder that walks the active chain and **fuses runs of pointwise
  ops into one pass**, breaking a new pass only at a spatial/neighbour-tap
  boundary. So a 12-device chain is ~5–6 real passes, not 12. Off devices skip
  their pass entirely (the `dofOn` precedent) → cost scales with the *active*
  chain, never all 42.
- **R15-P3 — migrate spatial + neighbour-tap effects onto the graph.** Split the
  UV-remap and neighbour-tap effects out of the monoliths into standalone pass
  shaders with a uniform I/O contract (`uBase`, uv, params). This is where the
  full generality (warp/kaleido/glitch reorderable) lands — and the bulk of the
  rewrite.
- **R15-P4 — precision + guard rails + UI.** Banding fix (RGBA16F chain
  intermediates *or* inter-pass ordered dither — see perf); ordering guard rails
  (canvas/base pinned first, Master strip last, sensible grouping) so users can't
  build broken/incoherent frames; drag-to-reorder on the device chain wired to
  `uColourOrder` / the pass builder. **Preserve the "Dry/Wet 0 == device absent,
  bit-exact" invariant** by skipping a device's pass when its fader is 0 (a
  per-pass model makes this cleaner, not harder).
- **R15-P5 — perf instrumentation.** A before/after FPS counter + per-frame
  render-ms + `UNMASKED_RENDERER` log, so the cost is measured on real hardware,
  not estimated. Feeds the adaptive preview cap.

**Performance (analysed 2026-06-16; verified against a GTX 1650).** Not
hardware-gated. Bandwidth is the *non*-issue: targets are RGBA8, preview is
capped at 1280 with no motion blur, and only ~3 passes are full-res today
(bloom/DOF run at 1/16 res). +8 full-res passes ≈ 59 MB/frame at preview
(~3% of a 1650's 128 GB/s) and ~21 GB/s worst-case at 1440p+motion-blur export
(~16%). Realistic limiters, in order: (1) **WebGL per-draw CPU overhead** ×
pass count (the true first wall, small); (2) memory bandwidth, only on
integrated GPUs at 1440p+mblur; (3) VRAM for extra ping-pong targets (tens of
MB; RGBA16F doubles it — still fine on 4 GB); (4) export wall-clock grows ~linear
in passes (already readback-bound; server-render absorbs it); (5) laptop
thermals on long exports. Net felt effect: **preview essentially unchanged,
exports modestly slower (1440p+mblur the one noticeable case) — not "previews
impossible."** Mitigations are baked into the phasing: off-devices-skip, pass
fusion, adaptive preview cap, float-or-dither. Determinism is untouched in every
option — order is just another input — so preview==export never breaks; the only
*quality* risk is RGBA8 banding across many passes, which R15-P4 fixes.

**Rejected:** shader codegen + recompile-on-reorder (compile stalls on every
drag; can't reorder class-2 within one pass anyway; breaks `check_shaders.py`,
whose regex extractor can't evaluate interpolated GLSL).

### Round 16 — Tempo & meter map (time signatures + BPM automation)

Generalise the single-value `TempoMap` (constant `bpm`, `beatsPerBar`, `offset`)
into a **tempo + meter map** edited on the timeline. The beats-domain automation
model was *built* for this — lanes store positions in beats so "curves stay glued
to the bars if the user corrects the BPM" (`automation.js`); a tempo/meter map is
that promise paid off. Determinism holds: beats↔time stays a pure function, just
piecewise. Natural extension of the timeline editing/navigation model. **R16-P0
ships before the full map UI** because tempo handling bit in real use
(2026-06-16); P1/P2 follow once the single-tempo analysis is trustworthy.

- **R16-P0 — onset & tempo *detection* accuracy (diagnosed 2026-06-16).** A
  timeline-legibility complaint ("the onset ticks look
  random") was investigated with a phase-lock metric **R** (resultant-vector
  length of onset phases at a given tempo; 1 = locked to the grid, ~0 =
  uniform/drift). **Evidence:** a synthetic click locks at R 0.92 (pipeline is
  sound), but real tracks score **R≈0.02 against the *stored* tempo** — onsets
  statistically unrelated to the grid. Two separate root causes + a UI fix:
  - **RC1 — the tempo estimate is ~1% off.** Song A's onsets lock hard at
    **146.0 bpm (R 0.65)** but analysis stored **144.74**; a 1.3-bpm error drifts
    the grid ~4 beats over 3 min, collapsing R 0.65→0.03 — *that* is why the ticks
    never sit on the grid. Mechanism: `_estimate_tempo` (`analysis.py`)
    autocorrelates the 50 fps flux envelope, where one frame-lag ≈ **7 bpm** near
    145 bpm, so even the parabolic refinement leaves ~1% error (harmless on a 12 s
    clip, fatal over minutes). **Fix:** after the autocorrelation seed, refine on
    the actual onset *times* — a fine BPM sweep maximising phase-lock R (exactly
    the diagnostic), or a least-squares fit of the onset train. Verify by
    re-running R before/after (target 0.03 → ~0.65). For Song A the onset
    *detection* is fine — this is purely tempo estimation.
  - **RC2 — full-band onset flux is noisy on busy tracks.** Song B's onsets lock
    at *no* tempo (max R 0.12). Displayed onsets use **full-band** spectral flux
    (`analysis.py:264,271`) — which the code itself notes "over-weights broadband
    noise (hats)"; it reserves the cleaner **bass flux** only for the
    downbeat/phase. So pads/vocals/cymbals/reverb all fire, then the 2 s adaptive
    threshold + global-greedy 120 ms min-gap thin survivors by *amplitude*, not
    metrical position → a steady pulse renders as a scatter. **Fix:** derive
    displayed onsets from a percussive / low-mid-weighted (or multi-band) flux and
    raise selectivity. (Also listed under Signal/reactivity-depth backlog.)
  - **RC3 — UI/legibility (ties to R11).** The onset ticks read as clutter, mimic
    the beat grid, and their purpose is hidden (the "Onset — detected transient"
    hover at `timeline.js:951` is undiscoverable). Hide onsets by default, reveal
    while dragging the ⚑1 downbeat flag (when snapping actually matters), give them
    a visual language clearly distinct from the grid, and add a "what the marks
    mean" line to the new `?` shortcuts popover.
  Any analysis change **bumps the cache version (v3→v4)** so `analysis.json`
  recomputes (`ensure_analysis` already does this). Determinism unaffected —
  analysis feeds reactivity, not the render's `(t, params)` purity.
- **R16-P1 — Meter map (time signatures on the timeline).** Replace the single
  global `beatsPerBar` (the transport-row `#sigSelect`) with a list of
  time-signature changes placed at bars on the timeline (add/drag/delete like
  markers, with a ruler affordance). **Contained:** a meter change regroups
  beats into bars but does *not* change beat duration, so `beatsAt`/`timeAt` are
  untouched — only the bar grid, snap-to-bar, loop/marker readouts, and
  "bar N · beat M" labels follow the map. Lanes (beats-domain) are unaffected.
- **R16-P2 — Tempo automation (BPM changes along the timeline).** `TempoMap`
  becomes a piecewise tempo curve (anchored tempo nodes; linear ramps first,
  curved later). `beatsAt`/`timeAt` integrate across tempo segments instead of
  the current linear form; the bar-1 flag (`offset`) is the map's first anchor.
  Recompute the transport's native `AudioBufferSourceNode` loop points (stored in
  beats → seconds) on any tempo edit. Edit either as draggable tempo nodes in the
  ruler or as a dedicated tempo lane reusing the breakpoint editor. Bigger than
  P1 because it changes the beats↔time integral — but lanes still ride it for
  free (the whole point of beats-domain storage). Sequence **after** R16-P1.

---

## Backlog (queued, not scheduled)

**Signal / reactivity depth** (deferred from R8)
- Per-band signal conditioning (gain / attack / release per band).
- **Stereo-width modulator.** Add a modulation source driven by stereo width /
  image movement, derived from mid/side energy or left-right correlation. Expose
  it in the Signal panel and modulation matrix so effects/rack macros can react
  to moments where the mix opens up, collapses to mono, or moves wider. Keep it
  analysis-derived and deterministic like the existing audio bands.
- Drag-to-assign routing from the Signal panel (mapping summary is
  read-only today).
- **Onset-detection selectivity (RC2, diagnosed 2026-06-16 — see R16-P0).**
  Displayed onsets come from full-band spectral flux, which fires on
  pads/vocals/cymbals/reverb; on busy tracks they lock to no tempo (R≤0.12).
  Re-derive them from a percussive / low-mid-weighted flux. Pairs with R16-P0's
  tempo-accuracy fix.

**Timeline / waveform** (from the 2026-06-24 waveform spec)
- **Colored multiband waveform mode.** Low/mid/high bands as separate colours on
  the timeline waveform, aligned to the Signal UI crossovers (from `bank.bands` +
  `bandEdges`), shown as a **toggleable mode** (messy if always-on). The
  `_drawWave` two-tone renderer is shaped to accept a per-band column source as an
  additive branch; `WaveformPeaks` retains the per-channel arrays for any future
  per-channel/stereo-emphasis view.
- **Scrolling-waveform device.** A render-output visual device that draws a
  waveform scrolling in sync with the song — a creative device, not timeline
  chrome.

**Grading & creative devices** (archive §7, R3)
- R3-P3 — remaining full grading suite: LUT infrastructure (`.cube` upload) +
  colour wheels. Pairs with R13-P5 mastering presets (a LUT is essentially a
  mastering preset) — design the two together.
- R3-P4/P5 — creative-device waves: camera rotate, stutter/freeze, mirror,
  projector flicker, starburst; then pixel stretch, echo/slit-scan ring
  buffer, texture overlays.

**Racks**
- **Rack Improvements** — planned follow-up:
  [docs/superpowers/plans/2026-06-20-rack-improvements.md](superpowers/plans/2026-06-20-rack-improvements.md).
  Scope: editable continuous mapping lower/upper bounds, bool/device-on trigger
  thresholds, enum mapping handling, a polished per-macro mapping editor,
  undo/persistence/saved-rack round-trips for mapping edits, and curated starter
  Rack presets behind **Load rack**.
- R2-P4 (rest) — waveform **recipe framework** (drafts automation from the song)
  — design after rack editing has been used on real projects.
- R4-P5 — "Playground" pack + generator-heavy racks (rides R2-P4).
- "Templates" (far future) — a bundle of *specific racks + colour grade/effects*;
  the reframed home for the parked preset/look idea.

**UI polish** (deferred from R10)
- Settings button + UI preferences modal: Focus mode default/on-off, future
  chrome density and disclosure preferences. Remove the inline Focus toggle from
  the Devices area.
- Dynamic coachmark guide sequence (the start callout is static today).
- Full inline colour popover: recent colours, gradient direction
  (vertical / horizontal / radial), add/remove stops.

**Engine / quality**
- Real depth model (Depth-Anything via onnxruntime-web) to replace the
  pseudo-depth — lifts parallax / DOF / depth-gate. Edge library, not a
  core rewrite.
- Export performance + content-quality workflow. **Where the time goes:**
  per frame the loop renders at export resolution then reads back the GPU
  pixels before streaming raw RGBA — that render+readback stall dominates,
  **not** the encoder (libx264 runs server-side in parallel, ACK-paced).
  Motion blur triples it (3× render + 3× readback). Encoder CRF is a
  file-size/banding knob, nearly orthogonal to render time. Tackle in payoff
  order, diagnostics first:
  - **Diagnose** (still worthwhile to confirm the win + find the next stall):
    report render FPS, GPU readback time, raw transfer/backpressure,
    encode/finalize time, raw MiB transferred, with/without motion blur.
  - **Motion blur as a knob.** It's off by default and flagged final-only; the
    hardcoded 3-subframe count could become a quality knob.
  - **Encoder depth:** evaluate CRF/maxrate defaults for YouTube/social, an
    optional hardware-encoder path, and a near-lossless archival-master option
    (lower CRF than today's high = crf 16). Reduce raw-frame WebSocket
    bottlenecks / smarter frame pacing if diagnostics point there.
  - **Decouple interactive-preview resolution from export resolution.**
    Determinism is a pure function of (t, params) — resolution is just a
    parameter, so a capped/lower-res preview stays deterministic and never
    threatens the export's bit-identity. Caveat: resolution-relative effects
    (pixel-scale noise / feedback) won't be pixel-identical across
    resolutions, so a 480/720p draft is for checking motion / timing /
    reactivity, not final grading.
  - **Preserve determinism as the default path:** any faster path must share
    the renderer or clearly label itself as non-identical.
  - **Make server render the default — the win is large enough to flip it.**
    In use this was *profoundly* successful: significant speed gains, because
    the headless tab renders unthrottled and doesn't contend with the live
    preview (and the user keeps working, or closes the tab, while it runs).
    Flip `#exportServer` from an opt-in checkbox to the default path — default
    it checked, or invert it to an opt-out "render in this tab instead" toggle —
    and rewrite the copy accordingly. Reconcile with **Batch**, the one option
    the server path doesn't cover: `startServerRender` already handles
    resolution + loop-range but only the single `state.aspect`, so either teach
    `/api/render-jobs` to enqueue all three aspects or have ticking Batch fall
    back to the in-tab path. Keep the in-tab renderer as the labelled fallback
    for machines with no Chrome/Edge (the job POST already fails clearly there).
    Determinism is unaffected — same engine, same local GPU.
  - **Resumable exports (nice-to-have).** Resume an interrupted long export
    instead of restarting. Enabled by determinism (frames are pure in `t`), but
    needs a *segmented* encode (keyframe-aligned chunk MP4s + a manifest +
    `ffmpeg concat -c copy`, audio muxed at the end) since a single libx264
    stream can't resume mid-encode. Most new machinery, only pays off for very
    long renders — deferred.
- Device + pack **curation** pass — once the UI feels user-friendly.

---

## Working agreement

- This roadmap holds **what's left**; the archive holds **what was built**
  and why. When a round ships, move its summary to the archive if useful, then
  remove it from this active roadmap.
- Plan first, implement on go (the established loop). Keep memory
  (`still-reactive-project.md`) in sync with shipped state.
