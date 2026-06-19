# Still Reactive — Roadmap (active)

Forward-looking plan: what's **next** and what's **queued**. Implemented
history (Rounds 1–10) and full design rationale live in the archive:
[AUTOMATION_TIMELINE_UX_PLAN.md](AUTOMATION_TIMELINE_UX_PLAN.md) — section
references below (e.g. "archive §15") point there.

---

## Current state (2026-06-14)

Local web app: FastAPI backend + zero-build WebGL2 frontend; a still image
*or* a Canvas base layer (colour / gradient / pattern / transparent) +
audio → an audio-reactive video, with deterministic browser-side MP4
export. Rounds 1–10 shipped: device chain + per-param modulation matrix,
beats-domain automation, macros + quartet, Master finishing strip, the
Signal analyser panel, eight named generators (Shape Pulse / Fractal /
Noise Flow / Spectrum / Tunnel / Starfield / Voronoi / Waveform, each with a
beat-sync clock), Canvas base layer, snapshots, project library,
progressive-disclosure UI. All four test suites pass.

**Personal tool:** the user is the target user, refining requirements
through use. No external-user validation. Reactivity confirmed via the
user's own test videos.

## Governing principles (don't regress these)

- **Compatibility dropped** (prototype): breaking old saved projects /
  autosaves is acceptable; prefer a clean model over shims.
- **Determinism:** rendering is a pure function of `(t, params)` — preview
  and export are bit-identical. Never break this.
- **Per-frame resolution order:** base params → lanes (beats domain) →
  macros → modulation → Device On + Mix → uniforms.
- **Schema-lint contract** (`tests/check_schema.mjs`): every device — Mix
  fader first, one fader per device, vocabulary, mandatory hints,
  axis/sweet tags, a fader resolution path, ≤6 visible params (rest under
  More…). New devices inherit it for free.
- **Run all four suites after each phase:** `smoke_backend`, `smoke_server`,
  `check_shaders`, `smoke_browser` (+ `check_schema`).
- **Gotchas:** ImageBitmap needs `{imageOrientation:'flipY'}`; no literal
  backticks in GLSL inside `shaders.js` template literals; keep non-ASCII
  out of test step strings (cp1252 console); static files serve
  `Cache-Control: no-cache`; generators map onto 6 uniform shader slots.

---

## Next up

> **STATUS 2026-06-16 (pivot + pause).** Step 3 changed direction: the preset
> model (R13-P1/P2) is **PARKED** in favour of **Ableton-style Racks** (was
> backlog R2-P4). A Rack = a named container over a subset of the device chain +
> up to 8 automatable macro knobs that own their mapped params; it replaces the
> single global macro quartet, and is saveable to a library + droppable onto any
> project. **v1 = framework + build-your-own** (curated racks, re-homing looks,
> and waveform recipes all deferred). The old preset/look idea is reframed as a
> far-future **"Templates"** concept (a bundle of *specific racks + colour grade/
> effects*) — not scheduled. Artifacts written this session:
> - Spec: [docs/superpowers/specs/2026-06-16-racks-design.md](../docs/superpowers/specs/2026-06-16-racks-design.md) (approved)
> - Plan: [docs/superpowers/plans/2026-06-16-racks-v1.md](../docs/superpowers/plans/2026-06-16-racks-v1.md) (5 phases, ~22 TDD tasks)
> - Also banked, ready to plan: [R16-P0 detection-accuracy spec](../docs/superpowers/specs/2026-06-16-r16p0-detection-accuracy-design.md).
>
> **Repo is now under git** (`git init`; work branch **`feat/racks-v1`**;
> `.claude/` git-ignored with a local test/git permission allowlist).
> **Implementation IN PROGRESS (2026-06-19) via subagent-driven-development.**
> Done & reviewed-clean: **Phase 1 (Tasks 1.1–1.5), Phase 2 (2.1–2.3), Phase 3
> Task 3.1** — HEAD `417ac02` on `feat/racks-v1`, all suites green, app boots on
> `state.racks=[]`. **NEXT = Task 3.2.** Full resume guide + per-task loop +
> carried decisions live in **`.sdd/RESUME.md`** (with `.sdd/progress.md`, the SDD
> ledger). Note: SDD working files are in gitignored `.sdd/`, and a test/CI
> permission setup is in `.claude/settings.json`.

**Working sequence (agreed 2026-06-16)** — reordered around the product-eval
feedback: clarity first, then the big architecture on a guarded base. The
detailed round write-ups below keep their original numbers; **this list is the
authority on _order_** (Round 11 and Round 13 are each split across two steps).

1. ~~**Auto colour-grade (Master)**~~ — **DONE 2026-06-16** (all suites pass).
2. ~~**Terminology & labels pass** + **R11-P4 a11y floor**~~ — **DONE
   2026-06-16** (all four suites + check_schema pass). Mix rename, Soft-Clip
   Highlights, Simple toggle dropped, header/timeline tidy, *and* the pulled-
   forward accessibility floor shipped together as one frontend-hygiene pass.
3. ~~**R13-P1/P2 — preset model + "trap" fix**~~ — **PARKED 2026-06-16**,
   superseded by **Racks v1** (see STATUS block above). Spec + plan written;
   implementation paused at baseline on `feat/racks-v1`. The preset/look idea
   moves to the far-future "Templates" concept. *(Original intent: one
   starting-point concept, a real "Default / clean start" entry, undoable apply —
   the undoable-apply + chain/macro undo work survives inside the Racks plan.)*
4. **R11-P3 — golden-frame visual-regression test** (pulled ahead of the token
   refactor): the safety net that guards every later rendering change.
5. **R11-P1/P2 (design tokens + CSS refactor) + R11-P5/P6 (frontend design eval:
   instrument typography, "Live" legibility) → R12 + R15 together** (R11-P4 a11y
   floor already shipped in step 2): refactor onto a *voiced* token system
   *immediately before* the layer UI — the design-eval items ride P1/P2 so the
   new layer UI is built on the identity, not just deduped literals — then build
   **image layers on the modular render pipeline** as one co-designed block (a
   per-pass pipeline is the substrate for per-layer devices).
6. **R13-P3+ (re-author factory presets, mastering presets) + R16 (tempo / meter
   map)** — after the device set settles; R16 can jump earlier if tempo handling
   bites in real use.

> ~~Round 14 — Timeline editing & navigation UX~~ **DONE 2026-06-15** (all four
> suites pass). Draw/Move mode toggle (hotkey **D**, default Move), middle-drag
> pan + F/L/Home/End/←→ navigation, and copy/paste automation (range + whole
> lane). Summary in [archive §16](AUTOMATION_TIMELINE_UX_PLAN.md).

### Auto colour-grade (Master) — **DONE 2026-06-16** (first slice of R3-P3)

Shipped. A one-shot **Auto** button on the Master **Grade** device header
(`ui.js` `group.autoGrade`): `runAutoGrade()` (main.js) renders ~6–8
representative frames offscreen with Grade neutralised (`gradeOn:false` →
`resolveParams` zeroes the grade, so it measures the pre-grade image and
re-running never compounds), builds a weighted (by alpha) luma histogram +
channel means, and the **pure `autoGradeFromStats()` (params.js, unit-tested)**
derives exposure / contrast / temperature / tint / vibrance / highlights /
shadows mapped to the real grade shader math, each a neutral nudged toward its
target by a STRENGTH factor (conservative). Applied as static params (sets
`gradeOn:true` + writes the values + `panel.refresh()` + autosave + toast) so
render determinism is untouched.

**Base-value undo — added 2026-06-16 (originally a spec gap).** The original
auto-grade note said param edits weren't undoable; that was true (the undo stack
covered only automation/tempo/markers/loop) so it got fixed: `historySnapshot()`
now also snapshots `state.params`, committed at **gesture boundaries** — a
delegated `change` listener on the param panel (slider release / checkbox / enum)
plus explicit commits on the programmatic paths (slider + mod double-click resets,
numeric type-in, device ↺, and Auto). So **sliders, reset, and Auto all respond
to Ctrl+Z now**, alongside automation; `restoreHistory()` restores params +
`panel.refresh()` + re-syncs the analyser response. Auto is still also revertible
via the Grade ↺. (Macros and device chain add/remove remain outside the undo
stack — possible later.) `smoke_browser` proves two committed slider edits undo
between each other. Tests: `smoke_browser` asserts dark→exposure↑,
flat→contrast↑, warm-cast→temperature↓, empty→null, plus the Auto button renders.

_Original design notes (kept for reference):_

- **One-shot, not live.** It writes static param values; it is **not** a
  per-frame auto-exposure. A grade that reacted to its own output each frame
  would break the `(t, params)` determinism invariant (preview == export).
  Analyse once → write values → rendering stays a pure function.
- **Sampling** reuses the thumbnail-renderer pattern (offscreen renderer, never
  touches the live preview targets): render ~6–8 representative frames (section
  midpoints + `loudestTime()`, deduped) at ~192×108 **with Grade neutralised**
  (`GRADE_NEUTRAL`, rest of the chain intact) — so it measures the *pre-grade*
  image and re-running never compounds — and accumulate a 256-bin luma histogram
  + per-channel R/G/B means via `readPixels()`.
- **Derivation maps to the real Grade shader math** (`shaders.js` grade block):
  exposure from median→mid target (`exp2(uExposure)`); contrast from histogram
  spread (clamped 0.5–1.6, leaves an already-punchy frame alone); temperature/
  tint from grey-world channel means (`1+0.14·temp` R / `1−0.14·temp` B /
  `1−0.06·tint` G), conservatively capped; vibrance from mean saturation;
  highlights/shadows only as clip recovery (− highlights if blown, + shadows if
  crushed).
- **Apply** through `setParamValue` + one `commitHistory()` (single undo); toast
  confirms. **v1 = one conservative Auto button** (levels + WB + gentle vibrance
  + clip recovery); split into "Auto Levels" / "Auto Colour" later only if it
  feels too aggressive.
- **Tests:** `smoke_browser` — a dark/flat synthetic frame raises exposure +
  contrast within range; determinism unchanged (same params → same frame). Run
  all four suites + `check_schema`.
- Front half of **R3-P3** (full grading suite) and feeds **R13-P5** mastering
  presets — an auto-grade result is a savable mastering preset.

### Terminology & labels pass — **DONE 2026-06-16**

From the same product-eval feedback. Param *keys* preserved (label-only churn)
— no determinism / save impact. **Shipped** (all four suites + check_schema
pass): device fader `'Dry/Wet'` → **Mix** (factory label + the `check_schema`
contract flipped: `'Mix'` moved out of `BANNED_LABELS` and reserved for the
fader, `first.label` assertion + messages updated; `audSmoothness` hint + the
patched-depth hint + comments + `web/test.html` step labels + shader invariant
comments all reworded); **Output** device → **Soft-Clip Highlights**; the
**Simple/Devices view toggle retired** (`state.simple` removed from state /
payload / load, `applySimpleView` → `applyMode` with a binary start/edit mode,
the `simple-view` CSS + `#viewToggle` markup + the test assertion gone — devices
are now always visible); header **"Save preset" → "Save as preset"** with a
Snapshot-vs-Preset clarifying tooltip on both buttons; the always-visible
timeline mouse-help row replaced by a **`?` shortcuts popover** (`#shortcutsBtn`
→ `openShortcuts()`, outside-click / Esc dismissal mirroring the quick menu).

_Original decisions (kept for reference):_

- **Output device → "Soft-Clip Highlights".** "Output" reads as the export
  stage; it is actually a `tanh` highlight soft-clip (the last POST step,
  `shaders.js:954`). Keep "Highlights" in the name so an audio-centric user
  doesn't read "Soft Clip" as affecting the *sound*.
- **Drop the Simple/Devices view toggle — devices always visible.** The device
  chain is core to the workflow, but the "Simple" view hid `#paramPanels`
  entirely and new projects defaulted into it. Retire the binary toggle; rely on
  the macro rack + Focus mode + `More…` folds for progressive disclosure.
  (Removes the ambiguous "Simple" button.)
- **Keep "Base Layer"** (not Canvas / Visual source) — DAW/layer language that
  pays off when the Round 12 layer-stack lands.
- **Rename the device fader "Dry/Wet" → "Mix"** (decided 2026-06-16, reversing
  the earlier "keep Dry/Wet"). The fader *label* becomes **"Mix"**. Everywhere it
  is *referenced* the device is already auto-prefixed via `groupLabel`
  (`params.paramIndex` → `${groupLabel} · ${label}`), so automation lanes / chips
  / modulation pickers / mapping summaries read **"Bloom · Mix"**, **"Master
  Grade · Mix"** — i.e. "<Device> Mix" — while the device panel (already under the
  device header) shows just **"Mix"**, no redundancy. Do **not** bake the device
  name into the label itself (that double-prints as "Bloom · Bloom Mix").
  **Implementation:** `mix()` factory label `'Dry/Wet'` → `'Mix'` + its hint
  (params.js); the `audSmoothness` hint + comments that say "Dry/Wet"; flip
  `tests/check_schema.mjs` (it hardcodes `first.label === 'Dry/Wet'` and reserves
  the string — both → `'Mix'`, and the banned-synonyms comment); `web/test.html`
  if it asserts the label. Keys (`<prefix>Mix`) are unchanged → **no save /
  determinism impact**; it is a pure label/lint rename.
- **Header:** "Save preset" → "Save as preset"; clarify Snapshot (full session,
  left panel) vs Preset (params + chain only, per R13).
- **Timeline:** move the mouse-control help text into a `?` / shortcuts overlay
  (declutters the always-visible row).

### Round 11 — UI consistency foundation & visual QA  (archive §15)

**Split across the sequence:** R11-P0 done; **R11-P3 (golden frames) → step 4**
(safety net, ahead of any rendering rewrite); **R11-P1/P2 (tokens + CSS) → step
5**, immediately before Round 12 so the new layer UI is built on the tokens.

- **R11-P0** — hide the Look browser + boot from clean defaults. The R7-3
  looks are stale/half-broken and they trap the user: the app auto-applies
  `cinematic` at boot (`state.packId` default + `defaultParams()` merged with
  pack overrides), the browser lists only `STYLE_PACKS` with no "default"
  tile, and `applyPack` only ever swaps one pack for another — so there is no
  clean starting point and no way back to one. Hide `#looksSection` and stop
  auto-applying a pack at startup (`state.packId` default → none; boot params
  = `defaultParams()`), so both the visual-QA baseline and the user start from
  the true default. Looks return, revamped, in Round 13.
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
- **R11-P4 — accessibility & input floor — DONE 2026-06-16** (pulled forward to
  ride with the terminology pass; all suites pass). Added a `--focus` token +
  global `:focus-visible` ring (with a double-ring halo for range thumbs), a
  blanket `prefers-reduced-motion` reset, dark scrollbar styling, bumped the 9px
  dim readouts (`.macro-value` / `.macro-map` / `.macro-badge`) to the 10px
  floor, and `aria-label`s on the icon-only buttons (`×` ▶ `÷2`/`×2` `‹›` `?`).
  Pure chrome — no determinism / render impact. _Deferred to the later token
  work:_ a full contrast audit of dim text on the darkest surfaces (`#0c0d11`
  meters / spectrum) belongs with R11-P1's colour-token decisions.
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

**Split across the sequence:** **R13-P1/P2 (preset model + trap fix) → step 3**,
pulled forward to answer the save-model confusion early; **R13-P3/P4/P5
(re-author factory presets, gallery UX, mastering presets) → step 6**, after the
device set matures post-layers.

Looks were hidden in R11-P0. **Decision locked:** whole-chain Looks are
redundant with Presets, so they fold into the Preset system rather than
returning as a separate subsystem. The Macro quartet stays as the live layer.
The grade/finish half of a "look" is reborn as a *separate, composable*
concept (mastering presets).

- **R13-P1 — Looks become factory presets.** Re-home the curated looks as
  factory presets shipped with the app, listed alongside user presets (with a
  "factory" tag); retire the separate `packs.js` / Look-browser path. One
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
  drop), not auto-applied at boot. Reconcile with the Library / snapshot entry
  points so there is one obvious path in (and drop the dead `pendingLook`
  start-state hook).
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
piecewise. Natural extension of the Round 14 timeline work. **R16-P0 (below) is a
pull-forward candidate** — tempo handling bit in real use (2026-06-16), so the
detection-accuracy slice can ship ahead of the map UI.

- **R16-P0 — onset & tempo *detection* accuracy (diagnosed 2026-06-16; tempo half
  is a pull-forward).** A timeline-legibility complaint ("the onset ticks look
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
- Drag-to-assign routing from the Signal panel (mapping summary is
  read-only today).
- **Onset-detection selectivity (RC2, diagnosed 2026-06-16 — see R16-P0).**
  Displayed onsets come from full-band spectral flux, which fires on
  pads/vocals/cymbals/reverb; on busy tracks they lock to no tempo (R≤0.12).
  Re-derive them from a percussive / low-mid-weighted flux. Pairs with R16-P0's
  tempo-accuracy fix.


**Grading & creative devices** (archive §7, R3)
- R3-P3 — full grading suite: LUT infrastructure (`.cube` upload) + colour
  wheels (Master grade already has exposure/contrast/tone/vibrance/
  highlights/shadows). Its **auto colour-grade slice is pulled forward** — see
  "Auto colour-grade (Master)" in Next up. Pairs with R13-P5 mastering presets
  (a LUT is essentially a mastering preset) — design the two together.
- R3-P4/P5 — creative-device waves: camera rotate, stutter/freeze, mirror,
  projector flicker, starburst; then pixel stretch, echo/slit-scan ring
  buffer, texture overlays.

**Racks** — **now the active step (pivot 2026-06-16); see STATUS block in "Next up".**
- **Racks v1 (build-your-own)** — the framework half of R2-P4, pulled forward to
  replace the macro quartet. Spec + plan written; paused at baseline on
  `feat/racks-v1`. Ableton-style: named container over a chain subset + up to 8
  automatable macro knobs; saveable library; `/api/racks`. Deferred to follow-ons:
- R2-P4 (rest) — curated/library racks + waveform **recipe framework** (drafts
  automation from the song) — design after v1 is used.
- R4-P5 — "Playground" pack + generator-heavy racks (rides R2-P4).
- "Templates" (far future) — a bundle of *specific racks + colour grade/effects*;
  the reframed home for the parked preset/look idea.

**UI polish** (deferred from R10)
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
  - **DONE — Async readback pipeline (the top win, no quality cost).** Speeds
    up *every* resolution including Master. `Readback` in `renderer.js` reads
    each frame into a WebGL2 PBO (3 deep) with a fence; the export loop drains
    the oldest a couple of frames later, so frame N's readback + WebSocket
    transfer overlaps frame N+1's render — replacing the per-frame
    `gl.readPixels` stall. Motion blur keeps the sync read (it averages
    sub-frames on the CPU).
  - **DONE — Throttled live export blit.** `render(..., {blit})` gates the
    canvas copy pass; the exporter blits every 5th frame (preview freezes
    between blits — the MP4 comes from the readback, never the canvas).
  - **DONE — Resolution picker (480/720/1080/1440 per aspect); fps stays
    user-set.** 480p added as the fast-test tier; fps remains a user-controlled
    setting, independent of resolution. Draft speed comes from pixel count ×
    fps × motion-blur-off — *not* from CRF.
  - **DONE — Encoder preset per quality + Draft tier.** `-preset` now follows
    the quality choice (was hardcoded `medium`); new **Draft** quality =
    CRF 23 + `veryfast`. Motion-blur checkbox relabelled final-only (3× slower).
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
  - **DONE — Cancellation + partial-file cleanup.** Aborted/disconnected/errored
    exports now delete the unplayable partial `.mp4` (and the `.log`, kept only
    when ffmpeg itself errored) instead of leaving litter on disk.
  - **DONE — Server-side / headless render (foreground-tab-independent).** A
    "Render on server" export option: the backend spawns a headless browser at
    `/?headlessJob=<id>` that runs the *same* `loadProject` + `runExport` path
    (bit-identical — same engine, same local GPU) and streams to `/api/export`.
    The user's tab polls job status and can be closed; cancelling kills the
    headless tab, which drops its export WS into the cleanup above. Determinism
    holds *because server == client machine* (local tool) — a cloud render on
    other hardware would not be pixel-identical to the preview.
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
  and why. When a round ships, move its summary to the archive and strike
  it here.
- Plan first, implement on go (the established loop). Keep memory
  (`still-reactive-project.md`) in sync with shipped state.


