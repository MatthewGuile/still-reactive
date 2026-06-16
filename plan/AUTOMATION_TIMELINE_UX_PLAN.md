# Automation, Devices & Racks — UX Plan  ·  ARCHIVE

> **📦 ARCHIVED (2026-06-14): historical record of Rounds 1–10 (all
> implemented) plus the full design rationale for every round, including the
> detail behind still-pending rounds.** Active forward-looking work — what's
> next and the backlog — now lives in [ROADMAP.md](ROADMAP.md). This file is
> kept for history and for the `§N` detail the roadmap points back to; when a
> planned round here ships, its status is updated and it stays as record.
> Don't add new planning here — add it to the roadmap.

> **⚠ Compatibility policy (from 2026-06-13, Round 8 on):** the app is in
> active prototype mode. Backward compatibility is **dropped** — breaking
> existing saved projects / autosaves / old project JSON is acceptable.
> Prefer a clean state model; delete old concepts fully rather than build
> shims. This **supersedes** the "no migrations / old projects must still
> load" notes in Rounds 5–6 (kept as historical record only).
>
> **Round 8 (COMPLETE — see §12): IMPLEMENTED 2026-06-13.** A/B removed
> (single `state.params`; old slots-based saves ignored), **Audio Response
> → global `Signal ▾` panel** (live 7-band spectrum + 6 source meters +
> detected-vs-project BPM/grid + response shaping + mapping summary, out
> of the device stack), **Master** a distinct pinned final-output strip
> (divider + styling + "Master …" automation labels), and two creative
> devices (**Colour wash** split-tone, **Clarity** local contrast). All
> suites pass.
>
> **Round 9 (COMPLETE — see §13): IMPLEMENTED 2026-06-13.** Onboarding & UI
> hierarchy + the second feedback batch: product-led start state,
> Inputs+Looks-led left panel with a compact Library, contextual right
> panel (no idle macros) + `mode` (start → create → edit), device product
> names, **timeline marker clarity** (colour-by-origin + hover labels),
> **Signal spectrum as a draggable editing surface** (log-freq spectrum +
> draggable crossovers + progressive disclosure), the **active-button
> readability fix**, **macro simplification** (Quartet/Follow → ⋯ menu),
> and **macro mapping clarity**. All suites pass.
>
> **Round 10 (COMPLETE — see §14): IMPLEMENTED 2026-06-13.** Input model &
> polish: preview is now guidance-only (fixed the dead start-buttons
> regression); Inputs restructured into **Audio + a Canvas base layer**
> (fill: colour / gradient / pattern / transparent / image, blank by
> default — like an image editor's background); device **disabled-state**
> styling (dimmed + OFF, never collapsed); an **export confidence
> summary**; top-bar **workspace tabs**; "Kind" → product labels; and
> **value units** (%, °, ×, ms, Hz). All suites pass.
>
> **Round 11 (planned — see §15):** UI consistency foundation & visual QA —
> a **style guide + design-token refactor** (collapse the ad-hoc
> radius/type/spacing/colour literals into named tokens; codify the
> emergent semantic colour language) and a **golden-frame visual-regression
> test** that pixel-diffs representative looks against committed references.
> Recommended **before** image layers so the new layer UI is built on the
> token system. **Round 12:** image layers — a layer stack on top of the
> canvas base (multiple images/generators, per-layer devices).
>
> **Product note (2026-06-14):** this is a **personal tool** — the user is
> the target user, refining requirements through use; "validate with
> external users" does not apply. Reactivity confirmed good via the user's
> own test videos. Agreed directions: real depth model (edge library) is
> worth adding; device/pack **curation** comes once the UI feels
> user-friendly.
>
> **Status (2026-06-11): Round 1 IMPLEMENTED.** All nine phases landed,
> including the optional Phase 9 (server-side session mirror). All four test
> suites pass (smoke_backend incl. the leading-silence fixture, smoke_server
> incl. the session roundtrip, check_shaders, smoke_browser incl. intensity/
> modulation/macro/curve/determinism assertions).
>
> **Round 2 (user feedback — see §6):** R2-P1..P3 IMPLEMENTED (curve symmetry
> + movable apex, ∿ reliability, variable macro count, resizable panel,
> per-source modulation editor with thresholds/gating + live meters,
> driven sliders, numeric type-in, per-device reset, browser search,
> tooltips, lane quick-actions). Remaining: R2-P4 — the generative rack
> library (deferred as a larger piece of work).
>
> **Round 3 (in progress — see §7):** R3-P1 (loop region + native loop
> playback + range export + markers) and R3-P2 (analysis v3 multiband +
> user crossovers) IMPLEMENTED 2026-06-11, all suites pass. Remaining:
> grading suite (R3-P3) and the creative-device waves (R3-P4/P5).
>
> **Round 4 (in progress — see §8):** R4-P2/P3 IMPLEMENTED 2026-06-12 —
> the Generate family (Gen 1–3: shapes / noise flow / 16-band spectrum /
> Julia / KIFS, with region masks, blends, palettes), all suites pass.
> R4-P3b (integrated generators) IMPLEMENTED 2026-06-13; R4-P1 (blank
> canvas + Canvas device), R4-P4 (gizmo) and **R4-P6 (generators split
> into named output devices — Shape Pulse / Fractal / Noise Flow /
> Spectrum, each with Kind sub-options, over 6 shader slots)** IMPLEMENTED
> 2026-06-13. **R4-P7 (four more generator devices — Tunnel / Starfield /
> Voronoi / Waveform, shader types 5-8) + generator beat-sync (every
> generator gets a `BeatSync` fader; the pattern clock crossfades from the
> free `uTime` run to a beat-quantised `floor(uBeats)` step) IMPLEMENTED
> 2026-06-14** — eight generators total; all suites pass. Remaining:
> playground pack + generator racks (R4-P5).
>
> **Round 5 (COMPLETE — see §9):** the simplicity architecture. R5-P1
> (device contract + schema-lint), R5-P2 (axis/sweet tagging,
> `buildQuartet`, master Reactivity), R5-P1b (one-fader Dry/Wet),
> R5-P3 (simple view + macro→device thread), R5-P4 (look audition),
> R5-P5 (Follow song structure) all IMPLEMENTED 2026-06-11..13. All
> suites pass.
> Theme: one-knob simple at the surface, Ozone-deep on intent — intuitive
> means *no surprises*, at every layer.
>
> **Round 6 (see §10): IMPLEMENTED 2026-06-13** — image swap keeping
> every parameter, the "now loaded" media card, the project library
> (rename / delete / thumbnails), full-session persistence (slots now
> survive reload), and the export pill / hide / title-progress states.
> All suites pass.
>
> **Round 7 (COMPLETE — see §11): IMPLEMENTED 2026-06-13.** Pinned
> **Master section** (Sharpen + expanded Grade with Vibrance/Highlights/
> Shadows + Output soft-clip + regrouped finishing devices); a **gentle
> Dry/Wet fade curve** (`audSmoothness`) so effects bloom in; **one Look
> browser** (Style dropdown removed) with **10 rebuilt packs** on the
> current devices; **named snapshots** of a whole look; and a **focus
> mode** that shows one device at a time. All suites pass.

Evaluation of the automation/timeline implementation and the effects panel,
plus a phased plan to evolve both. The governing metaphor (user-confirmed):
**every effect is an Ableton Live device**. Goals, in the user's words:

1. Simple to use, Ableton-Live-inspired automation, with lots of
   customisability.
2. Cope with audio files that have random-length silence at the start
   (lining the music up with the bar grid).
3. The **intensity of every effect is automatable** — absent → fully present,
   like a channel fader.
4. **Every parameter of every device is separately automatable and separately
   audio-reactive** — any param can react to its own blend of transients,
   lows, mids, highs, loudness, beat.
5. **Device On/Off is automatable** (Ableton "Device On" parity).
6. **Racks with macro knobs**: preset combinations of devices with macros
   mapped (with ranges) to many params at once, savable/loadable.

Decisions taken with the user (2026-06-10):

- Audio-reactivity is **per-parameter** (full modulation matrix), not a
  per-device drive bus. The per-device `xxxSrc`/`xxxAudio` system dissolves.
- **One global rack** of macros for now; multiple coexisting racks → Future.
- Device chain order is **fixed** (pipeline order, shown honestly in the UI);
  reorderable chain → Future.
- New device packs to add: **Blur/DOF, Glitch, Stylize, Impact** (all four).

---

## 1. Evaluation — automation + timeline

### What already works well (keep)

- **Beats-domain envelope storage** (`automation.js`): points stored in beats,
  so lanes stay glued to bars when the user corrects BPM. Pure
  `valueAt(lane, beats)` keeps preview and export pixel-identical. Nothing
  below changes this foundation.
- **Live-style override latch**: touching an automated slider bypasses its lane
  (amber LED), the ◆ re-enables.
- **Stepped enum lanes** with labeled level guides.
- **Grid/snap system**: bar/beat/½/¼/off, Alt bypass, zoom-adaptive labels.
- **Per-project autosave** of tempo grid + lanes to localStorage; presets can
  carry automation.

### Gaps and friction

| # | Problem | Severity |
|---|---------|----------|
| G1 | **No undo.** A stray click inserts a point permanently; "Clear" is the only recovery. | High |
| G2 | **Dragging a point across a neighbour deletes the neighbour** (`movePoint` = delete + re-insert; coincident insert replaces). | High |
| G3 | **Effects can't be faded in/out**: toggles are `bool` (excluded from automation), kaleido is binary, feedback/VHS have no wet-dry, "Amount" semantics differ per effect. | High (ask #3) |
| G4 | **Audio routing is one source per device** and only some params react at all; nothing like per-param modulation. | High (ask #4) |
| G5 | **Grid vs leading silence**: `beatOffset` is a within-one-beat phase only; bar 1 lands in silence; correction = precision scrub + "Bar 1 here". No nudge, no ×2/÷2 BPM, no onset snapping. | High (ask #2) |
| G6 | **Single-lane modality**: no overview of automated params; switching lanes = hunting tiny ◆ buttons. Worsens as per-param mod multiplies lane targets. | Medium |
| G7 | **Linear segments only** — no curve shaping. | Medium |
| G8 | No value readout while dragging; no live-value indicator at the playhead. | Medium |
| G9 | No global "re-enable all automation" (Live's orange button). | Low |
| G10 | Lane editor height fixed at 280px. | Low |

## 2. Evaluation — effects panel

### User-friendliness today

Good: schema-driven consistency (every group renders the same way), toggles
visible in collapsed headers, double-click-to-reset on sliders, A/B slots,
style packs as starting points.

Friction:

- **A wall of 19 always-present groups (~80 sliders)** with no hierarchy of
  purpose — utility groups (Camera, Grade, Audio response) interleaved with
  creative effects; users see every device whether or not they use it.
- **No sense of signal flow.** Groups are listed roughly in pipeline order but
  nothing says so; users can't reason about why fog sits over bloom.
- **Inconsistent reactivity vocabulary**: "Kick", "Swell", "Inject drive",
  "Flicker", "Audio push" all mean "audio depth", each routed by a separate
  Source dropdown; some params react to hardwired bands (VHS jitter → highs,
  plasma → mids) that the user can't see or change.
- No per-group reset, no numeric type-in, no tooltips, no search.
- Sliders are static while the picture pumps — no live feedback that a value
  is being modulated.

### Effect coverage vs similar tools (Resolume/VJ apps, AE templates, visualizer builders)

Present and standard: bloom, film grain, chromatic aberration, vignette, color
grade, duotone, hue cycle, VHS, kaleidoscope, feedback trails, particles,
light leaks, fog, god rays, 2.5D depth parallax, plasma, rain-on-glass,
camera drift/shake/zoom-pulse. This is a solid, tasteful core set.

Missing relative to the norm (and confirmed to add — see D7):

- **Blur family** — gaussian, zoom/radial burst, tilt-shift, and especially
  **depth-of-field**: the app already ships a depth map per project, so DOF
  with an automatable focus plane is uniquely cheap value here.
- **Glitch family** — block glitch, slice shuffle, pixel-sort-style streaks,
  datamosh-style smear; the staple transient-reactive effect class in music
  visuals.
- **Stylize family** — pixelate/mosaic, posterize+dither, halftone, neon edge
  outline.
- **Impact family** — strobe/flash (must integrate the existing
  photosensitivity limiter), ripple/shockwave displacement on hits,
  twirl/fisheye lens.

Out of scope for this product (different product class, listed for clarity):
spectrum-bar/waveform overlays, text/lyrics, freeform masking.

---

## 3. Design

### D1 — Devices: every effect behaves like an Ableton device

The right panel becomes a **device chain**, not a list of all groups:

- A device **card** per effect with an Ableton-style title bar:
  `[⏻ Device On] [Name] [Intensity fader] [∿ mod] [◆ automation] [▾ collapse]`.
- **Device On/Off is a real param and automatable** (G3/ask #5): bools become
  automatable as stepped 0/1 lanes (rendered like a 2-level enum lane). The
  schema's `automatable` flag stops excluding `bool`; `apply()` maps
  `v ≥ 0.5 → true`. Toggling off still hard-skips the shader branch.
- Devices the user hasn't added are **not shown** — an **Add device** button
  opens a small browser grouped by family (Motion, Distort, Atmosphere,
  Texture, Color, Stylize, Utility). The chain shows only added devices, in
  **fixed pipeline order** (kaleido → warp → parallax → feedback → … → grade →
  grain), which the UI states explicitly. Removing a device resets it to
  defaults + off.
- Pinned utility devices: Camera, Color grade, Vignette, Grain, Audio response
  are always in the chain (they get On toggles too — Grade off = neutral —
  so even these can be automated on/off).
- State: `state.chain = [deviceIds…]` (ordered subset), saved in presets and
  the per-project autosave.

**Intensity** (the device fader, ask #3): every device gets `<prefix>Mix`
("Intensity", 0..1, def 1, automatable), first-class in the title bar.
Implemented as CPU scaling toward each device's neutral state in one pure
`resolveParams()` (multiplicative for amount-like keys; lerp-to-neutral for
grade: exposure→0, contrast→1, saturation→1, temperature→0, tint→0, gamma→1,
fade→0). Only two GLSL-level mixes are required:

- `uKaleidoMix` — kaleido is a UV remap, so crossfade *colors*: sample
  `uImage` at folded and unfolded UVs and `mix()` (one extra fetch, gated).
- `uFbMix` — feedback output becomes
  `mix(scene, max(scene*inject, prev*keep), uFbMix)`. The ping-pong stores the
  mixed value, so trails decay faster at low intensity — acceptable, document.

### D2 — Per-parameter modulation matrix (replaces the per-device drive bus)

Every continuous param can be wiggled by its own blend of the six features
(`low, mid, high, loud, onset, beat`), each with a **bipolar depth** ∈ [−1, 1]
(negative = duck on energy):

```
effective(key, t) = clamp(base + Σ_s depth[key][s] × feat_s(t) × (max−min), min, max)
```

- **Mod depths are real schema params**, generated for every moddable key
  (key form `warpAmount~low`), so they are *automatable lanes* like everything
  else — "automate different lanes of the same effect to different elements"
  is the existing lane machinery pointed at depth params. Generated lazily in
  `paramIndex()`; `defaultParams()` emits them only when non-zero is needed
  (sparse: presets omit zero depths on save).
- **The shader stops doing reactivity.** All `u<Module>Drive` uniforms, all
  `xxxAudio` depth sliders, all `xxxSrc` dropdowns, and the hardwired `uAudio`
  accents (VHS jitter → highs, plasma → mids, leak/fog → loudness, grain →
  highs) are removed. Shaders become pure functions of params; *all*
  reactivity, automation and macros shape params on the CPU. `uBeats` stays
  (tempo, not audio — hue beat-steps).
- A few formulas need a param to land on after their audio term dissolves:
  feedback gains `fbInject` (0..1, the old `1 + fbAudio·drive·0.7` boost);
  camera zoom-pulse becomes mod on `camZoom` (drop `zoomPulse`/`zoomPulseSrc`);
  vignette breathe becomes mod on `vigAmount` (drop `vigBreathe`).
- **Migration / look parity**: a one-time mapping table converts each old
  `(xxxSrc, xxxAudio)` pair and each hardwired accent into equivalent default
  mod depths (e.g. `warpSrc: mid, warpAudio: 0.4` → `warpAmount~mid ≈ 0.25`).
  Packs are re-tuned through the same table and eyeballed against before/after
  exports. Visual character may shift slightly; called out as a risk.
- **UI**: each param row gains a small `∿` button → expands an inline strip of
  six mini-faders (low/mid/high/loud/ons/beat), each with its own automation
  LED. The row's slider gets a thin **live-value tick** showing the modulated
  value riding over the base (only painted for visible rows; polish tier).

### D3 — One global rack with macro knobs (ask #6)

- **8 macros**, each: name + value 0..1. Macro values are schema params
  (`macro1..macro8`) → **automatable** like any param, and they get the same
  override-latch behaviour.
- Each macro holds **mappings**: `[{key, min, max}]` in param units
  (inverted ranges allowed; bool/enum maps by threshold/step like Live).
  Effective value of a mapped param = macro position scanned across its range.
- **Ableton's control rule**: a macro-mapped param is *owned* by the macro —
  its slider renders disabled with a macro badge (click badge → edit range or
  unmap); direct lanes on a mapped param are ignored with a toast. Automate
  the macro instead.
- **Map mode**: press `Map` on a macro → param rows light up → click one to
  map (default range = full), range editor lists mappings under the macro.
- **Rack presets**: the existing preset system is extended to carry
  `{chain, params (sparse), macros + mappings, automation, tempo}` — saving a
  preset saves the rack; loading one swaps devices + macros wholesale, exactly
  like dropping an Audio Effect Rack on a track. The macro strip lives above
  the device chain.
- Resolution order per frame at time t (each step pure):
  `base slot params → automation lanes (incl. macro + depth + on/off lanes) →
  macro mappings → per-param modulation → intensity scaling → uniforms`.

### D4 — Grid alignment + leading-silence handling (ask #2)

Backend (`analysis.py`, bump `version` to 2; `ensure_analysis` recomputes when
older):

- Detect `audioStart` / `audioEnd`: first/last 50 ms window above −45 dBFS.
- Better default downbeat: keep the comb-phase beat grid, then slide the bar-1
  anchor in whole beats so it lands on the *strongest onset near `audioStart`*
  (score onsets in the first ~8 s by strength; pick the beat-grid time closest
  to the winner). Expose `beatOffset`, `audioStart`, `firstOnset`.

Frontend:

- **Draggable Bar-1 flag** in the ruler at `tempo.offset`; drag snaps to
  nearby onsets (~8 px) and the snap grid; Alt = free. "Bar 1 here" stays.
- **Dim the pre-roll** before `tempo.offset` so leading silence visibly sits
  before bar 1.
- **Nudge cluster** by the BPM input: `‹ ½ ›` beat-nudge for the offset and
  `×2 / ÷2` BPM buttons (octave errors are the common detection failure).

### D5 — Lane editor usability

- **Undo/redo** (G1): snapshot stack of `{automation, tempo}` JSON in main.js,
  pushed on commit (pointerup, not per move) and tempo changes; Ctrl+Z /
  Ctrl+Shift+Z / Ctrl+Y; cap 100.
- **Fix point-crossing** (G2): clamp dragged `b` to
  `(prev.b + ε, next.b − ε)` — Live behaviour, nothing silently deleted.
- **Lane chips strip** (G6 — now essential, since devices × params × depths
  multiply targets): when the editor is open, chips list every automated lane
  (`Bloom · Intensity`, `Warp · Amount ~ low`, `Macro 3`, …) — click to
  switch, LED dot for enabled/bypassed, × to delete; `[` / `]` cycle. Open
  lane's chip + param row highlighted.
- **Drag readout** (G8): `bar 3.2 · 0.45` tooltip while dragging; a dot rides
  the envelope at the playhead.
- **Curved segments** (G7): per-point curvature `c ∈ [−1, 1]` (default 0)
  on the left point; vertical drag on a segment bends it
  (`f' = f^(2^(2c))`); serialized only when ≠ 0 so old saves load unchanged.
- **Re-enable all** button (G9) in the transport row when ≥ 1 lane bypassed.
- **Resizable editor** (G10): drag handle, height persisted.
- Stretch: quick-actions on a chip/LED right-click — *Fade in 4 bars,
  Fade out 4 bars, Pulse every bar* — template patterns at the playhead.

### D6 — Panel ergonomics (independent of the device rework)

- Tooltips (one line per param, from schema `hint` strings).
- Numeric type-in: click the value readout to edit; double-click reset stays.
- Per-device reset (title-bar menu).
- Device family grouping + search in the Add-device browser.

### D7 — New device packs (all four confirmed)

Fixed pipeline slots noted per device; all branch-gated so unused = free.

| Family | Devices | Notes |
|--------|---------|-------|
| Blur | **Depth-of-field** (focus distance + aperture; focus automatable/moddable — rack the focus to the beat), **Zoom/radial blur**, tilt-shift as a DOF mode | Reuses depth map; needs one extra blur chain of the base at half res. Slot: after feedback, before post sampling. |
| Glitch | **Block glitch** (cell shuffle), **Slice shuffle** (scanline strips), **Pixel-sort streaks** (directional luma-threshold smear approximation), datamosh-style smear (feedback-buffer displacement) | UV/displacement ops early in post, before grade. Transient-friendly defaults (mod from `onset`). |
| Stylize | **Pixelate/mosaic**, **Posterize + dither**, **Halftone**, **Neon edge** (sobel) | Color-space ops late in post, before grade. |
| Impact | **Strobe/flash** (hard-gated through the existing flash limiter — never bypassable), **Ripple/shockwave** (radial displacement, decaying, retriggered by beat/onset envelope), **Twirl/fisheye lens** | Ripple/lens are pre-sample UV ops; strobe just before vignette. |

Each ships as a normal device: On/Off, Intensity, moddable params — no special
cases. Add 1–2 new style packs that showcase them (e.g. "Glitch club",
"Shallow focus").

### Non-goals / Future features

- **Multiple coexisting racks** (user-requested future feature): several named
  racks active at once, each with its own macro set; needs conflict rules for
  overlapping mappings. The single-rack data model (macros as params,
  mappings list) is designed so this extends without migration.
- **Reorderable device chain**: requires splitting the fused post shader into
  per-device passes — significant renderer + export-performance rework.
- Tempo ramps / multiple tempo regions.
- Editing audio itself (trim/offset) — alignment is purely a grid concern.
- Ghost curves (showing other lanes faintly behind the active one).
- HPSS percussive/harmonic split as extra mod sources (slots cleanly into the
  six-source list later; README already tracks it).
- Spectrum/waveform overlays, text, masking (different product class).

---

## 4. Implementation phases

Each phase is shippable and independently testable. Run all four scripts in
`tests/` after each phase (smoke_backend, smoke_server, check_shaders,
smoke_browser).

### Phase 1 — Safety + small fixes (small)

1. Undo/redo stack in `main.js` (D5); `Timeline` gains `onLaneCommit`
   (pointerup) alongside `onLaneEdit` (live repaint + autosave debounce).
2. Neighbour-clamped drag in `AutomationSet.movePoint` (G2).
3. Drag readout tooltip + playhead value dot in `timeline.js` (G8).

Files: `web/js/automation.js`, `web/js/timeline.js`, `web/js/main.js`,
`web/style.css`.

### Phase 2 — Device core: On/Off automation + Intensity (medium)

1. `params.js`: bools become automatable (drop the `p.type !== 'bool'`
   exclusion); add `<prefix>Mix` Intensity to every device; export
   `resolveParams()` with the per-device neutral-scaling table; give Camera /
   Grade / Grain / CA / Vignette proper On toggles (default on).
2. `automation.js` / `timeline.js`: bool lanes as stepped 0/1 (reuse the enum
   path with options `[off, on]`); `apply()` maps `v ≥ 0.5`.
3. `renderer.js`: call `resolveParams()` once at the top of `render()`; add
   `uKaleidoMix`, `uFbMix`.
4. `shaders.js`: kaleido color crossfade; feedback output mix.
5. Tests: `check_shaders.py` recompile; `smoke_browser.py` asserts
   `warpMix = 0` frame == warp-off frame, and an On/Off lane flips a device
   mid-song deterministically.

Files: `web/js/params.js`, `web/js/automation.js`, `web/js/timeline.js`,
`web/js/renderer.js`, `web/js/shaders.js`, `tests/check_shaders.py`,
`tests/smoke_browser.py`.

### Phase 3 — Per-parameter modulation matrix (large)

1. `params.js`: synthetic depth params (`<key>~<src>`, −1..1, sparse in
   presets); remove `xxxSrc`/`xxxAudio`/`zoomPulse*`/`vigBreathe`; add
   `fbInject`. `paramIndex()` exposes depth keys as automatable.
2. `features.js`: `modulate(base, key, feat, params)` (the clamped weighted
   sum); keep the beat-pulse helper.
3. `renderer.js` / `shaders.js`: delete all `u<Module>Drive` + `xxxAudio`
   uniforms and the hardwired `uAudio` accents; shaders become pure in params
   (keep `uBeats`). Modulated values are baked into plain uniforms on CPU.
4. `ui.js`: `∿` disclosure per param row → six mini-faders with per-depth
   automation LEDs; live-value tick on modulated sliders (polish tier).
5. Migration: `migrateParams()` mapping table — old `(xxxSrc, xxxAudio)` and
   hardwired accents → default depths; `packs.js` re-tuned through it; legacy
   preset/autosave shim; lanes on removed keys dropped with a toast.
6. Tests: depth-modulated render deterministic across repeated renders at the
   same t; preset roundtrip keeps sparse depths; pack before/after eyeball
   exports (manual checklist in the PR).

Files: `web/js/params.js`, `web/js/features.js`, `web/js/renderer.js`,
`web/js/shaders.js`, `web/js/ui.js`, `web/js/packs.js`, `web/js/main.js`,
`tests/check_shaders.py`, `tests/smoke_browser.py`.

### Phase 4 — Device chain UI (medium)

1. Chain view: device cards (title bar per D1), only added devices rendered,
   fixed-order note, Add-device browser grouped by family with search;
   pinned utility devices; remove = reset + off.
2. `state.chain` in autosave + presets; per-device reset; tooltips + numeric
   type-in (D6).
3. Tests: smoke_browser — add device via browser, toggle, export still byte-
   deterministic.

Files: `web/js/ui.js`, `web/js/main.js`, `web/index.html`, `web/style.css`.

### Phase 5 — Grid alignment & silence (medium)

1. `analysis.py`: `audioStart`/`audioEnd`; onset-anchored downbeat;
   `"version": 2` + recompute-on-stale.
2. Bar-1 flag drag with onset snapping; pre-roll dimming; nudge `‹ ½ ›` and
   `×2/÷2` BPM buttons.
3. Tests: `smoke_backend.py` fixture wav with 1.7 s leading silence + click
   track → `audioStart ≈ 1.7`, `beatOffset` on a click (±30 ms); browser test
   drags the flag and asserts lanes shift with the grid.

Files: `still_reactive/analysis.py`, `web/js/timeline.js`, `web/js/main.js`,
`web/index.html`, `web/style.css`, `tests/smoke_backend.py`.

### Phase 6 — Lane management & curves (medium)

1. Lane chips strip + `[`/`]` cycling + row highlight (D5).
2. Curved segments (`c`, segment-drag bend, power ease, subdivided draw).
3. Global "Re-enable automation" button; resizable editor height.
4. Stretch: quick-action templates.

Files: `web/js/automation.js`, `web/js/timeline.js`, `web/js/main.js`,
`web/js/ui.js`, `web/index.html`, `web/style.css`.

### Phase 7 — Rack & macros (large)

1. Model: `macro1..8` as schema params (automatable); mappings
   `[{key, min, max}]`; resolution step between automation and modulation
   (D3 order); Ableton control rule (mapped params owned by macro, disabled
   slider + badge, direct lanes ignored with toast).
2. UI: macro strip above the chain (8 knobs, rename via double-click), Map
   mode, per-macro range editor.
3. Presets extended to full rack payloads `{chain, params, macros, automation,
   tempo}`; left-panel section renamed "Racks".
4. Tests: macro mapping roundtrip; automated macro drives mapped params in
   export deterministically; mapped-param lane ignored.

Files: `web/js/params.js`, `web/js/main.js`, `web/js/ui.js`,
`web/index.html`, `web/style.css`, `still_reactive/server.py` (preset payload
is schemaless JSON — likely no change, verify), `tests/smoke_browser.py`.

### Phase 8 — New device packs (large, parallelizable per family)

1. Blur/DOF (extra half-res blur chain of the base; depth-mixed; focus +
   aperture params).
2. Glitch (block, slice, pixel-sort streak, datamosh smear).
3. Stylize (pixelate, posterize+dither, halftone, neon edge).
4. Impact (strobe behind the flash limiter — limiter not bypassable; ripple
   with beat-retriggered decay; twirl/fisheye).
5. 1–2 new showcase packs; `check_shaders.py` + browser determinism per
   device; flash-limiter unit check for strobe.

Files: `web/js/shaders.js`, `web/js/renderer.js`, `web/js/params.js`,
`web/js/packs.js`, `tests/check_shaders.py`, `tests/smoke_browser.py`.

### Phase 9 — Persistence polish (small, optional)

1. Mirror the localStorage autosave (chain + tempo + automation + macros) into
   the project dir via `PUT /api/project/{id}/automation`; localStorage stays
   the fast path.

Files: `still_reactive/server.py`, `still_reactive/store.py`,
`web/js/main.js`, `tests/smoke_server.py`.

---

## 5. Compatibility & risk notes

- **Determinism**: every layer (lanes → macros → modulation → intensity) is a
  pure function of `(state, t)` evaluated on the CPU per frame; the
  preview/export guarantee is untouched. Shaders get *simpler* (pure in
  params).
- **Saved presets / autosaves**: `AutomationSet.load()` drops unknown keys, so
  old data can't crash. The Phase 3 mapping table preserves the *intent* of
  old `xxxSrc`/`xxxAudio` presets; hardwired-accent looks shift slightly —
  re-tune packs and note in the changelog.
- **Param-count explosion**: depth params are synthetic and sparse (only
  non-zero saved); `apply()` iterates only existing lanes; per-frame cost is
  a few hundred adds worst-case.
- **Biggest risk = Phase 3 look parity.** Mitigate with the mapping table +
  side-by-side exports of every pack before/after.
- **Strobe safety**: the flash limiter must gate strobe unconditionally (not
  a user toggle for that path).
- **Analysis cache**: version bump forces one-time re-analysis per project.

---

## 6. Round 2 — user feedback & follow-ups (planned)

Feedback from first hands-on use of Round 1 (2026-06-11). Two bugs with
confirmed root causes, four improvements.

### R2-B1 — Curve bend is asymmetric (bug)

**Report:** "The curve is much sharper on the left side of the middle dot
compared to the right side. I want both sides to behave in the same way."

**Root cause:** `shapeSegment` uses a power ease `f^(2^(2c))`. A power curve
concentrates all of its curvature at one endpoint — flat near one point,
steep near the other — so the bend is inherently lopsided, and which side is
sharp flips with the drag direction.

**Fix:** replace it with a **quadratic Bézier bow**, which has *constant
second derivative* — the bend is distributed evenly on both sides of the
midpoint by construction:

```
v(f) = f² + 2m·f(1−f)        m ∈ [0,1], stored c = 2m − 1 ∈ [−1,1]
```

- `m = 0.5` (`c = 0`) is exactly linear; monotone for all `m ∈ [0,1]`.
- Midpoint travel is `v(0.5) ∈ [0.25, 0.75]` — a deliberately tasteful throw
  (matches Live's limited handle range). If harder bends are wanted later,
  apply the bow twice for `|c|` beyond a knee — *not* in this round.
- Drag mapping becomes trivial: `m = clamp(2·(pointer−a.v)/(z.v−a.v) − 0.5)`.
- **Compatibility:** existing saved `c` values are reinterpreted by the new
  formula — same sign convention (direction of bow), slightly different
  shape. Acceptable; no migration.
- Update the `curved segment eases` browser-test expectation
  (`v(2 beats of 4)` with `c = 0.5` is now `0.25 + 2·0.75·0.5·0.5 = 0.625`…
  recompute in the test from the formula, and add the symmetry assertion:
  `v(0.5−d) + v(0.5+d) == 2·v(0.5)` for a few `d`).

Files: `web/js/automation.js` (shapeSegment), `web/js/timeline.js`
(curve-drag solve simplifies), `web/test.html`.

*Done 2026-06-11. Extended by R2-5 below (movable apex).*

### R2-5 — Movable curve apex (skew the bend left/right)

**Request:** "adjust the middle dot between two points of the automation
line so it doesn't have to be in the middle, to manipulate speed / angle of
the curve."

Today the handle is pinned at the segment's horizontal midpoint and only
bends vertically. This adds a second per-segment degree of freedom: the
handle also slides **horizontally** between the two breakpoints, moving the
curve's turning point — apex near the left point = turn early (fast attack,
long tail); apex near the right = turn late (slow start, sharp finish).

**Math — full quadratic Bézier with a free control point.** Endpoints stay
(0,0)→(1,1) in segment space; the control point becomes `(h, k)` instead of
the implicit `(0.5, m)`:

```
x(t) = 2t(1−t)·h + t²          y(t) = 2t(1−t)·k + t²        t ∈ [0,1]
```

- **Monotone & bounded** for h, k ∈ [0,1]: both x'(t) and y'(t) are linear
  in t with non-negative endpoints, so time never reverses and the value
  stays inside the segment's range — no overshoot, no clamping needed.
- **Drawing** subdivides in `t` (16 steps), plotting `(x(t), y(t))` — even
  simpler than today (no f-space solve while drawing).
- **valueAt(f)** needs `t` from `f` once per evaluation: solve
  `t²(1−2h) + 2ht − f = 0` →
  `t = (−h + √(h² + (1−2h)f)) / (1−2h)` (closed form, deterministic;
  use `t = f` when `|h − 0.5| < ε` — the current behaviour, divide-by-zero
  safe). Then `v = y(t)`.
- **Handle ↔ parameters** is a clean linear inverse. The handle is drawn at
  the curve point `t = 0.5`, which sits at
  `(0.25 + h/2, 0.25 + k/2)` — so a drag maps back as `h = 2·px − 0.5`,
  `k = 2·py − 0.5` (px, py = pointer in segment space, clamped to [0,1]
  each). Handle travel spans the middle half of the segment, matching the
  existing limited-throw feel.

**Interaction:**

- Drag the dot **vertically** → bend (k), exactly as now.
- Drag it **horizontally** → skew (h). Both at once in a single drag.
- Soft-snap `h` back to 0.5 within a small radius so plain vertical drags
  keep producing symmetric bows; Alt bypasses the snap.
- Right-/double-click the handle resets both bend and skew (today it resets
  bend only).

**Storage & compatibility:** the segment's left point gains an optional
`h` (omitted when 0.5) next to the existing `c` (which stays `2k − 1`).
Old saves load unchanged (`h` absent = centred apex = exactly the R2-B1
quadratic). `setCurve(key, index, c)` grows to `setCurve(key, index, c, h)`.

**Tests:** t-from-f solve roundtrip (endpoints exact, monotone across
h ∈ {0.1, 0.5, 0.9}); skewed curve passes through the dragged apex point;
`h = 0.5` matches the R2-B1 formula bit-for-bit; serialization roundtrip
with and without `h`.

Files: `web/js/automation.js` (shapeSegment → segment evaluator with h,
setCurve, toJSON/load), `web/js/timeline.js` (handle draw at t=0.5,
2-axis drag, snap, reset), `web/test.html`.

### R2-B2 — ∿ modulation strips "sometimes work" (bug)

**Report:** "The ~ option sometimes works and sometimes doesn't."

**Root cause (confirmed in CSS):** the `hidden` attribute is implemented by
the *browser* stylesheet (`[hidden] { display: none }`), and **any author
`display` wins over UA rules regardless of specificity**. `.mod-strip` sets
`display: grid` and `#laneChips` sets `display: flex`, so their `hidden`
attribute is silently ignored — mod strips render permanently expanded and
the ∿ toggle appears dead. Elements without an author `display`
(`.device-pop`, `.macro-mappings`) honour `hidden` fine — hence "sometimes
works". The original stylesheet even contains the tell:
`#exportModal[hidden] { display: none; }` line for exactly this trap.

**Fix:** one global rule near the top of `style.css`:

```css
[hidden] { display: none !important; }
```

and delete the now-redundant `#exportModal[hidden]` special case. Add a
browser-test assertion that a fresh boot has zero visible `.mod-strip`
elements and that toggling ∿ changes visibility.

**Follow-up affordances** (the other half of "is it working?"): the strip
gets a live **source meter** (current low/mid/high/loud/onset/beat value)
and the parameter slider gets the live-value tick from the Round-1 polish
list, so an active modulation is *visible* even when the device's output is
subtle, the device is off, or the source is momentarily silent.

Files: `web/style.css`, `web/js/ui.js`, `web/test.html`.

### R2-1 — Optional macro count (1–8)

The rack shows a configurable number of macros (default **4** for a cleaner
panel; "+" / "−" buttons in the rack header grow/shrink up to 8, Live 11
style), and the rack grid reflows (2 columns when ≤ 4, 4 columns above).

- `state.macroCount` persisted in the session and in presets; curated rack
  presets specify their own count.
- All eight `macro1..8` schema params continue to exist — hidden macros keep
  their values, lanes, and mappings functioning (shrinking is a *view*
  change, not a destructive one). Shrinking below a macro that has mappings
  warns via toast and offers the mapping editor.

Files: `web/js/main.js` (rack build/refresh, sanitize, persistence),
`web/style.css`, `web/test.html`.

### R2-2 — Resizable device panel

The right panel gets a drag handle on its left edge (same pattern as the
lane-editor height handle): width clamped to ~240–560 px, persisted to
localStorage (`sr:panelWidth`). The macro grid and param rows already flex;
`layoutCanvas()` reflows the stage via the existing ResizeObserver.

Files: `web/index.html`, `web/style.css`, `web/js/main.js`.

### R2-3 — Modulation editor redesign: per-source dropdown + thresholds

**Report:** "more like a drop down, where you switch between each
sub-parameter instead of having them all lined up next to each other…
configure thresholds, i.e. trigger only if mid reaches above X dB."

The six-wide mini-fader strip is cramped and hard to read. Replace it with a
**one-source-at-a-time editor** under each param row:

```
[∿2]  Source: [ mid ▾ ]   Depth ──●──── +0.45   Thresh ──●── 0.30  [gate ☐]
      meter:  ▁▂▅▇▅▂ ────────┃──────────          (┃ = threshold marker)
```

- **Source dropdown** lists the six sources; entries carrying a non-zero
  depth (or an automated depth) show a dot. The ∿ button shows a count badge
  of active sources. Switching sources edits that source's settings; depths
  for all sources still sum exactly as today.
- **Threshold** (per param × source): the source must exceed it before any
  modulation happens. Two response modes:
  - **ramp** (default): `s' = max(0, (s − th) / (1 − th))` — re-scaled so
    the effective source still spans 0..1 above the threshold (smooth).
  - **gate**: `s' = s ≥ th ? 1 : 0` — binary trigger, with a small fixed
    hysteresis (release at `th − 0.05`) computed *statelessly* by testing
    the smoothed envelope (it's precomputed over the whole song, so
    hysteresis can be resolved deterministically per `t`).
- **Semantics (user-confirmed):** the threshold shapes the *modulation
  signal*, not the effect directly — so it covers trigger-only, intensity-
  following, or both, depending on the target:
  - ramp + base slider > 0 → effect always present; threshold controls when
    the *extra* movement kicks in, and the signal above it controls how much
    (compressor-sidechain feel);
  - ramp on the device's **Intensity** fader with base 0 → the whole effect
    is absent until the source crosses the threshold, then fades in with it;
  - gate on Intensity with base 0 → binary, audio-driven Device On.
  The modulation editor should surface this: when the targeted param's base
  is 0, hint "effect appears only above the threshold".
- **Units honesty:** features are percentile-normalized 0..1 envelopes, not
  calibrated dBFS — a "dB" threshold would be fiction. Expose threshold on
  the 0–1 scale **with the live meter + threshold marker**, so it's set
  visually against the actual signal rather than numerically. (If true dB
  gating is ever wanted, the analysis would need to also ship unnormalized
  band levels — noted as future work.)
- **Data model:** stay with the one-mechanism rule — sparse params:
  - `key~src` — depth (unchanged, automatable as today)
  - `key~src@th` — threshold 0..1, default 0 (= off, current behaviour)
  - `key~src@gate` — 0/1, default 0
  Threshold/gate keys are **not automatable** (keeps the lane-target space
  sane) and not moddable; they ride through presets/A-B/session like any
  param. `features.applyModulation` reads them in the same pass — still a
  pure function, preview == export.
- Migration: none needed — defaults reproduce current behaviour exactly.

Files: `web/js/params.js` (schema for `@th`/`@gate`), `web/js/features.js`
(threshold/gate math), `web/js/ui.js` (editor + meter), `web/style.css`,
`web/test.html` (ramp/gate math assertions + determinism).

### R2-4 — Generative rack presets: automation drafted from the waveform

**Report:** "replace the presets with preset macro racks, configured to
bolster creativity… with pre-drawn automations based on the waveform.
Consider a framework to apply automations based on the waveform."

**Concept:** a curated library of **rack presets** = device chain + params +
macro mappings + macro count + a list of **automation recipes**. Applying
one to a project loads the rack *and runs its recipes against this song's
analysis*, drafting real automation lanes (beats-domain points through the
existing `AutomationSet`) that the user then edits like any hand-drawn lane.
One undo step removes the whole draft.

**Recipe framework** (`web/js/recipes.js`, pure functions of
`(analysis-derived context) → lane points`):

Context handed to every recipe: `{ tempo map, duration, sections[],
audioStart, bars[], energy(bar) (mean loudness per bar), peaks (onset
density per bar), highEnergyRegions[] }` — the last derived by thresholding
per-bar energy at its 70th percentile (chorus-ish detection; cheap frontend
derivation from the existing analysis arrays, no backend change).

Primitives (each emits `{key, points[]}` sets, snapped to the bar grid):

| Primitive | Sketch | Typical target |
|---|---|---|
| `riseOver(key, span, lo→hi, curve)` | ramp across each section / the whole song | a "Build" macro |
| `slamAt(key, where, hi, decayBars)` | jump at section boundaries, decay back | impact macro, zoom blur |
| `pulseEvery(key, bars, lo, hi, curve)` | periodic bow per N bars | bloom/zoom breathing |
| `followEnergy(key, lo, hi, smoothBars)` | per-bar loudness sampled into points — the literal "drawn from the waveform" shape | master Intensity macro |
| `switchPer(key, values[], unit)` | stepped value per section (enum/bool/macro) | duotone palettes, Device On |
| `gateRegions(key, regions, on, off)` | hold `on` inside high-energy regions, `off` outside | strobe/glitch only in choruses |

Recipes target **macros first** (so one knob re-performs the whole arc after
drafting), raw params second. Drafted lanes are ordinary lanes: editable,
bypassable, undoable (`commitHistory` once per apply).

**Library (ship 5, replacing the stock preset list):**

1. **Build & Drop** — `followEnergy` on a master-intensity macro +
   `slamAt(sections)` on an impact macro (zoom blur + CA + strobe burst).
2. **Verse / Chorus** — `gateRegions` flips glitch+strobe on only in
   high-energy regions; `switchPer(section)` alternates duotone palettes.
3. **Slow Bloom** — whole-song `riseOver` on fog→bloom→DOF-focus macro;
   ends wide open.
4. **Pulse** — `pulseEvery(1 bar)` bowed zoom/bloom breathing, +
   `pulseEvery(8 bars)` slower warp swell.
5. **Strobe Chorus** — Impact-family showcase, strobe + ripple gated to
   regions, kick-synced via the existing `~beat` depths.

**Presets UI:** the left-panel section becomes **Racks** with two groups:
*Library* (curated, read-only, with a one-line description) and *Yours*
(saved via the existing save flow — which captures chain/params/macros but
not recipes; a saved rack is a snapshot, a library rack is a generator).
Applying a library rack toasts "Drafted N lanes from this song's waveform —
Ctrl+Z removes them".

Files: new `web/js/recipes.js`; `web/js/main.js` (apply path, Racks UI),
`web/index.html`, `web/style.css`, `web/test.html` (recipe determinism: same
analysis in → identical points out; lane counts; undo removes all).

### Round 2 phases

| Phase | Scope | Size |
|---|---|---|
| R2-P1 | B1 curve symmetry + B2 `[hidden]` fix (+ test updates) | small — **DONE 2026-06-11** |
| R2-P2 | Macro count + resizable panel (R2-1, R2-2) + movable curve apex (R2-5) | small — **DONE 2026-06-11** |
| R2-P3 | Modulation editor redesign + thresholds/gating (R2-3, includes the live meters from B2's follow-up), plus the deferred Round-1 polish: live-value ticks, numeric type-in, per-device reset, device-browser search, param tooltips, lane quick-actions | medium — **DONE 2026-06-11** |
| R2-P4 | Recipe framework + 5 library racks + Racks UI (R2-4) | large |

Run all four test suites after each phase, as before.

**Post-P3 feedback (done 2026-06-11):** the separate live-value tick was
replaced per user request — driven sliders now move their own thumb to the
effective value and turn amber (grabbing one overrides via the existing
latch; the loop never fights a held pointer). The timeline resize handle now
works in both states (the closed bar and the open lane editor remember
independent heights) — previously it only functioned with a lane open while
always showing the resize affordance.

### Round 2 compatibility notes

- R2-B1 reinterprets stored curve `c` values (same direction, evenly
  distributed bend) — visual change to existing curves, no data migration.
- R2-3 changes only the *editor* for depths; existing `key~src` values and
  lanes carry over untouched; thresholds default to 0 = today's behaviour.
- R2-4 replaces the stock preset list but not the preset mechanism; user
  presets load exactly as before.
- Recipes must be pure functions of the analysis so the same song + same
  rack always drafts identical lanes (testable, undoable, deterministic).

---

## 7. Round 3 — arrangement tools, grading suite, custom bands (in progress)

User requests, 2026-06-11: Ableton-style loop region with range export,
timeline markers, a proper colour-grading device suite, user-definable
frequency bands, and more creative devices.

### R3-1 — Loop region: playback looping + range export

Ableton's loop brace, on the song timeline:

- **Model:** `state.loop = { startB, endB, on }` stored in **beats** (glued
  to the grid like lanes, so it survives BPM/downbeat corrections). Session-
  persisted; not part of presets (it's an arrangement choice, not a look).
- **Timeline UI:** a brace drawn in the ruler. **Shift+drag** in the ruler
  creates/replaces the region (snapped to the snap setting, Alt free); drag
  either edge handle to resize; drag the brace body to move it whole;
  double-click the brace toggles loop on/off. Marker positions (R3-2) and
  onsets are snap targets for the edges. A transport **Loop** button mirrors
  the on/off state.
- **Playback looping — native, not polled:** `AudioBufferSourceNode` already
  supports sample-accurate `loop/loopStart/loopEnd`. Transport sets them
  from the region; the reported `time` maps elapsed time through a modulo
  once the playhead passes loopEnd, so the visuals follow the loop exactly
  (render stays a pure function of the mapped `t`). Editing the region
  mid-play reseeds the source via the existing seek path.
- **Range export:** the export modal gains
  `Range: ◉ whole song · ○ loop region (bars X–Y)` when a region exists.
  - Frontend: `runExport` renders `t = tStart + i/fps` for
    `ceil((tEnd − tStart)·fps)` frames — identical pixels to the same `t`s
    in a full export, since rendering is pure in `t`.
  - Backend: the export WS header gains `{start, duration}`; ffmpeg gets
    `-ss <start> -t <duration>` *before* the audio `-i` (decode-trim only —
    still zero audio processing).
  - **Caveat (documented in the modal):** range exports start with cleared
    feedback/trail buffers, same as the preview does after a seek — a
    mid-song range won't carry trails that began before its start.

### R3-2 — User markers on the timeline

Named locators, Ableton-style:

- **Model:** `state.markers = [{ b, name }]`, beats-domain,
  session-persisted.
- **UI:** double-click in the ruler creates a marker at the snapped beat;
  drag to move; right-click opens a small menu (reusing the quick-menu
  styling): *Rename*, *Delete*, *Loop to next marker* (sets the R3-1 region
  from this marker to the next). Drawn as green flags with truncated labels
  (the blue ⚑1 downbeat flag keeps its distinct colour).
- **Sections → markers:** one button imports the analysis' detected section
  boundaries as markers ("Import detected sections"), giving rough labels
  (`A`, `B`, …) the user renames. The faint auto-section lines remain as
  hints either way. Markers also become candidates for the R2-P4 recipe
  framework (`switchPer(marker)` instead of detected sections).

### R3-3 — Colour-grading device suite

Replace the single "Color grade" device with a five-device grading family
(family: **Grade**), in conventional grading order. Fixed pipeline slots:
after DOF/atmosphere overlays, before the creative colour devices (hue
cycle / duotone); Finishing stays at the end of the chain.

| Device | Params | Notes |
|---|---|---|
| **Basic** | Exposure, Contrast, Highlights, Shadows, Whites, Blacks, Temperature, Tint, Saturation, Vibrance | Highlights/Shadows = luma-masked gain (smoothstep bands); Whites/Blacks = white/black point; Vibrance = saturation boost weighted toward muted colours. Absorbs the old grade's exposure/contrast/sat/temp/tint. |
| **Tone** | Lift, Gamma, Gain, Black Fade, Highlight Roll-off | Classic LGG trio; Roll-off = soft shoulder compressing highlights; Black Fade absorbs the old `fade`. |
| **Colour Wheels** | Shadows tint (hue + amount), Midtones tint (hue + amount), Highlights tint (hue + amount), Balance | Implemented as hue+amount slider pairs first (each automatable/moddable); Balance shifts the shadow/mid/high crossover points. A true 2D wheel widget is a polish item, not a blocker. |
| **Look** | LUT (enum: built-ins + uploads), LUT Amount, Faded Film, Gamma, Glow Bias | See LUT infrastructure below. Glow Bias blends whether the bloom add happens before (neutral glow) or after (the look colours the glow) the Look stage. |
| **Finishing** | Sharpen (new), Dehaze (new) + the existing Vignette, Grain, Chromatic aberration regrouped under the family | Sharpen = unsharp mask (reuses neighbour taps); Dehaze = depth-weighted local-contrast/saturation recovery using the existing depth map (cheap haze proxy, slotted before fog so it doesn't eat our own fog). Vignette/Grain/CA stay separate devices — no preset breakage. |

**LUT infrastructure** (also closes the README's ".cube LUT loading"):

- Backend: `POST /api/luts` accepts a `.cube` file, parses to a N³ RGB
  array (N ≤ 33), caches as binary; `GET /api/luts` lists.
- Frontend: 3D texture (WebGL2 `TEXTURE_3D`, trilinear) sampled in the
  Look device; `LUT Amount` mixes. Ship 4–6 procedurally generated
  built-ins (teal-orange, bleach bypass, warm film, cool matte, mono…) so
  the device is useful with zero uploads.
- check_shaders note: `sampler3D` compiles fine under GLSL 330.

**Migration:** old `grade` keys map via `migrateLegacyParams`:
exposure/contrast/saturation/temperature/tint → Basic, gamma → Tone Gamma,
fade → Tone Black Fade. Packs re-run through the migration; lanes on old
keys carry over because the key names are preserved where possible (keep
the same param keys when the meaning is unchanged — only the grouping
moves). `gradeMix`/`gradeOn` become Basic's Mix/On.

### R3-4 — User-definable frequency bands

The low/mid/high crossovers are currently baked into the analysis
(20–160–2000–9000 Hz). Make them user-tunable **without re-analysis**:

- **Analysis v3:** in addition to today's envelopes, ship a **multiband
  set** — 16 log-spaced band envelopes (50 fps, same grid; ~0.5–1.5 MB JSON
  for a typical song, rounded to 3 decimals). Existing fields stay for
  compatibility. Version bump → stale caches recompute (existing
  mechanism).
- **Frontend derivation:** `low/mid/high` become *derived* envelopes — sum
  the multiband bins between two crossover params, then percentile-
  normalise and attack/release-smooth exactly like `setResponse` does
  today. Pure function of (cached analysis, params) → determinism and
  preview/export identity hold.
- **UI:** two log-scaled sliders in the *Audio response* device —
  `Low / Mid crossover` (40 Hz–1 kHz) and `Mid / High crossover`
  (400 Hz–8 kHz), readouts in Hz. They join `RESPONSE_KEYS` (changing them
  re-derives the envelopes, same as gain/attack/release). The modulation
  editors' live meters make the effect immediately visible. Stretch: a
  mini spectrum strip behind the two sliders.
- Bass-flux downbeat anchoring keeps using the *analysis* low band (fixed)
  — the user's crossovers shape reactivity, not beat detection.

### R3-5 — Creative device candidates (next wave)

Ordered by value-for-effort; the first three are cheap and very musical:

| Device | Idea | Cost |
|---|---|---|
| **Camera rotate** | The camera has no rotation today — add base angle + per-beat dutch-angle kicks (a moddable `camRotate`/`camTilt`). Fills a genuine gap. | small |
| **Stutter / freeze** | Quantise render time: `t' = floor(t·n)/n`, or hold the frame for a fraction of each beat. Pure function of `t` → deterministic by construction, and modulating the hold amount from `beat` gives instant rhythmic freezes. | small |
| **Mirror / symmetry** | Simple X/Y/quad mirror with seam offset — cheaper and more usable day-to-day than full kaleidoscope. | small |
| **Projector / old film** | Luma flicker, gate weave, dust & hair, splice jumps — completes the grain/leak vintage set. | small-medium |
| **Starburst** | Cross-screen sparkle streaks on highlights (reuses the bright pass) — quintessential music-video glint, pairs with bloom. | medium |
| **Pixel stretch** | Smear the image from a draggable line outward (classic editorial look); onset-modulated stretch length. | medium |
| **Echo / slit-scan** | True time effects need a frame ring buffer (N delayed frames): video echo, slit-scan, time-displacement by depth. Memory cost at 4K export needs care — gate the buffer allocation on the device being in the chain. | large |
| **Texture overlay** | Paper/film-scan overlays with blend modes — rides the LUT upload infrastructure (user assets). | medium |

### Round 3 phases

| Phase | Scope | Size |
|---|---|---|
| R3-P1 | Loop region + native loop playback + range export + markers (R3-1, R3-2) | medium — **DONE 2026-06-11** |
| R3-P2 | User-definable frequency bands (R3-4: analysis v3 multiband, frontend derivation, crossover UI) | medium — **DONE 2026-06-11** |
| R3-P3 | Grading suite + LUT infrastructure + migration (R3-3) | large |
| R3-P4 | Creative devices, first wave: camera rotate, stutter/freeze, mirror, projector flicker, starburst (R3-5) | medium |
| R3-P5 | Creative devices, second wave: pixel stretch, echo/slit-scan ring buffer, texture overlays | large / future |

R2-P4 (generative rack library) remains queued and benefits from R3-2:
recipes can target user markers instead of detected sections.

### Round 3 compatibility & risk notes

- **Range export + feedback devices:** trails start clean at the range
  start (same as seeking in preview) — stated in the export modal rather
  than hidden.
- **Loop + export determinism:** looping affects only the *transport's*
  time mapping; rendering stays pure in `t`, so loops cannot desync
  preview from export.
- **Analysis v3** grows analysis.json (~1 MB typical). If that bites,
  quantise multiband values to 2 decimals or gzip the endpoint.
- **Grading migration is the risky part** (echoes Phase 3 of Round 1):
  preserve param keys wherever semantics are unchanged, route the rest
  through `migrateLegacyParams`, and eyeball every pack before/after.
- **LUT uploads** are user assets on disk — size-cap and validate `.cube`
  parsing server-side.

---

## 8. Round 4 — blank canvas + generative layers (planned)

User request, 2026-06-11: automate **generative shapes appearing in
specific areas of the image** (fractals etc.), and let the user **start
from a blank canvas** (default white, selectable colour). Governing theme:
the app should feel like a **creative playground for making visualisers**
— a photo is one possible starting point, not a prerequisite.

The architecture is already most of the way there: the scene shader
composites fully procedural, deterministic overlays (plasma, particles,
fog, leaks) over the image sample, and every continuous param is
automatable + per-param audio-reactive for free. Generators are "more of
that", plus a placement system; blank canvas is "less of the photo".

### R4-1 — Blank canvas projects

- **Entry point:** a "Blank canvas" button beside the drop hint: pick a
  colour (default **white**) and aspect (16:9 / 9:16 / 1:1), then add
  audio as usual — audio stays required (it is the clock and the signal).
- **Implementation — no new project model:** the frontend renders a
  solid-colour PNG at the chosen aspect in an offscreen canvas and uploads
  it through the existing `POST /api/project` path. Content-hash keying,
  caching, depth generation and every downstream endpoint work unchanged.
  (`make_pseudo_depth` on a flat image degrades to its vertical ramp —
  parallax/DOF/fog still get usable depth.)
- **Canvas device (family: Utility, pinned like Camera):** `Canvas colour`
  (hue/sat/lightness sliders) + `Use canvas colour` toggle that replaces
  the image sample with the flat colour in the scene pass. Two birds:
  the colour is changeable *after* creation (the uploaded PNG is just a
  seed, so the content-hash "colour is frozen" problem dissolves), and —
  being ordinary params — the colour is **automatable and
  audio-reactive** (lightness ducked by lows, hue stepped per bar…).
  On photo projects the same device doubles as a "solid background"
  switch, so it ships for everyone with `def: off`.

### R4-2 — Generate device family (shapes, fractals, spectrum)

New family **Generate** (added to `FAMILY_ORDER`), composited **in the
scene pass** alongside plasma/particles — that slot is load-bearing:
generators painted there feed feedback trails, bloom, DOF and the whole
grading chain exactly like image content does. All generators are pure
functions of `(uv, t, params)` — no RNG state, no history — so preview /
export identity holds by construction.

**Three identical instances** ship as devices **Gen 1 / Gen 2 / Gen 3**
(one schema factory, three ids, adjacent fixed pipeline slots) so layers
can stack with different types and placements without breaking the
single-instance device-chain model.

Shared schema per instance:

| Group | Params | Notes |
|---|---|---|
| **What** | Type (enum), Amount, Blend (Add / Screen / Over / Multiply), Palette (enum), Colour shift | Amount is the intensity fader (ask #3 convention: 0 = absent). |
| **Where** | Center X, Center Y, Size, Feather, Rotation, Mask (Ellipse / Box / Band / Full), Depth gate near/far | The "specific areas" ask. All continuous → every one automatable + moddable, so a fractal can *travel* across the image over bars, or bloom out of a corner on the chorus. Depth gate masks by the depth map (e.g. sky only). |
| **Motion** | Speed, Evolve, Beat sync (0..1) | Beat sync crossfades the time input toward quantised beat time, so pattern motion can lock to the grid. |

Generator types, first wave (cost-ordered):

| Type | Idea | Cost |
|---|---|---|
| **Shapes** | Beat-friendly rings / regular n-gons / bars with count, stroke width, radial repeat — the bread-and-butter VJ layer. | small |
| **Noise flow** | FBM domain-warp clouds (`fbm()` already in the shader) — organic colour fields for blank canvases. | small |
| **Spectrum** | Draws the cached **analysis v3 multiband set** (16 envelopes — already shipped by R3-P2) as bars or a radial analyser; band values are 16 floats/frame via a uniform array. Deterministic because the analysis is cached. | small-medium |
| **Julia** | Orbit-zoom Julia set; `c` orbits slowly in `t` and is moddable (lows wobble the set). Iterations capped (~64–96), escape-time coloured through the palette. | medium |
| **KIFS** | Kaleidoscopic IFS folds — maximal "fractal" payoff per GLSL line, pairs beautifully with feedback trails. | medium |

### R4-2b — Integrated generators: emerging from the image, not over it

User request, 2026-06-13: make generators feel like they **emerge out of
the image** rather than sit on it as an overlay — switchable, so the
overlay style remains available.

Generators already composite before feedback/bloom/DOF/grading (they
trail, glow, defocus and grade like image content), and the scene pass
already has `uImage`/`uDepth` bound — so integration is parameters + a
few lines of GLSL per trick, not architecture. The overlay feel is four
specific disconnects; each gets a control in a new **Integrate** group
per Gen instance (all under *More…*, all defaulting to today's overlay
behaviour — zero breakage, and as continuous params they're automatable
and audio-reactive for free):

| Param | What it does | Cost |
|---|---|---|
| **Depth** (0 far → 1 near) | The R4-2 depth gate, now the headline: the layer renders only where the image's depth is *farther* than the layer's plane (soft threshold). Fractals sit behind the tree line, in the sky, cut off by the subject. Automate Depth to make a layer *rise out of* the image on the drop. | small — depth is already sampled |
| **Inherit** (0..1) | Tints the generator with the image's own colour at that pixel (the shader's `col`, already in registers): noise flow becomes the image's pixels swirling loose; a Julia set looks etched from the photo's palette. | small — one `mix()` |
| **Emerge** (off / shadows / highlights) | Gates layer alpha by image luma so patterns grow out of the parts of the image that can host them, instead of painting evenly across faces and skies. | small |
| **Anchor** (screen / image) | Evaluates the region through the image's crop rect, so the pattern travels with the photo under camera drift/parallax — kills the "stuck to the glass" tell. | small — coordinate substitution |

**Displace blend (medium, the strongest read):** a fifth Blend option
where the generator's field *warps the image's sampling UVs* instead of
adding colour — fractal-shaped heat shimmer, the image itself rippling
as a Julia set. Needs the gen field evaluated *before* the image sample
(today it runs after), so it restructures the scene pass slightly:
evaluate displace-mode gen fields first, fold their offsets into
`sampleScene`'s uv, then run the remaining gens as colour layers after.
Determinism is unaffected (still pure in `t`); the kaleido fold order
needs care (displace before or after the fold — pick *before*, document).

### R4-3 — On-canvas placement gizmo

Dragging four sliders to position a region is the wrong interface for
"appearing in specific areas". When a Gen device's panel is expanded, draw
its mask outline on the existing `guides` overlay canvas; **drag** the
region to move it, **drag the edge** to resize, **Alt+drag** to rotate.
Writes go through `setParamValue`, so the Live-style override latch,
undo history and automation lanes behave exactly as if the sliders moved.
(Reuses the reframe-drag plumbing — same hit-testing pattern, same
canvas.)

### R4-5 — Generators as named, output-specific devices (+ type expansion)

User direction, 2026-06-13: generators should be **separate named devices
named for what they output**, each holding its own sub-options (the way
Shapes already has shape variants) — **not** one generic "Gen" device with
a Type dropdown. Plus more types/options. So the `gen(n)` Gen 1/2/3 model
is replaced by a family of distinctly-named generator devices.

**New device family** (each owns the shared placement/integrate machinery
— Dry/Wet, Speed, X/Y/Size/Mask/Feather/Rotate, Blend/Palette/Hue,
DepthGate/Inherit/Emerge/Anchor — plus a device-specific *kind* enum and a
couple of device-specific params):

| Device | Outputs / kinds | Device-specific |
|---|---|---|
| **Shape Pulse** | rings · polygons · bars · grid · cross | count, stroke, radial repeat |
| **Fractal** | Julia · KIFS · Mandelbrot-orbit · Apollonian | iterations, zoom, c-orbit |
| **Noise Flow** | clouds · marble · fibre | scale, warp depth |
| **Spectrum** | bars · radial · mirror · waveform | (uses the 16-band set) |
| **Tunnel** *(new)* | round · square · hex | depth speed, twist |
| **Starfield** *(new)* | stars · warp-streaks | density, parallax |
| **Voronoi** *(new)* | cells · edges · cracks | scale, jitter |
| **Waveform** *(new)* | line · filled · lissajous | thickness, source |

**Architecture (keep the slot machinery, present named devices over it):**
- The scene-pass shader already composites N generator layers via uniform
  arrays + one const loop (feeds trails/bloom/grade). Keep it; **bump the
  slot count 3 → 6** so several named generators can stack (per-pixel cost
  still gated by masks + the `uGenOn` skip; fractal iteration caps apply).
- **Device → slot allocation:** each named generator is its own schema
  device with its own key namespace (`shapeMix`, `shapeKind`, `shapeX`…;
  `fractalMix`, `fractalKind`…). At uniform-build time, collect the active
  generator devices in chain order, assign them to slots 0..N−1, and pack
  their params into the slot arrays; `uGenType` per slot is set from the
  device's kind. Adding more than N generators → toast, extra ones idle.
- `genField`'s type switch stays and grows with the new kinds. Determinism
  / export identity unchanged (pure in `t`).
- **No migration** (prototype): the old `gen1*/gen2*/gen3*` keys are
  dropped; the two generator packs (neon-fractal, spectrum-pulse) are
  re-authored onto the **Fractal** and **Spectrum** devices.

**Decisions to confirm in build:** max simultaneous generators (recommend
6); the final device list + kind enums above.

**Phasing:** R4-P6 = the split (Shape Pulse / Fractal / Noise Flow /
Spectrum as named devices + slot allocation + 6 slots + re-authored packs);
R4-P7 = the new devices (Tunnel / Starfield / Voronoi / Waveform).

### R4-4 — Playground glue

- **"Playground" style pack:** blank-canvas-friendly defaults (Canvas
  colour on, two generators enabled, camera drift off) so "blank canvas →
  pick pack → press play" already moves.
- **Generator racks:** R2-P4's recipe/rack library gains generator-heavy
  racks with macros like *Chaos*, *Travel*, *Palette* mapped across the
  Gen devices — the playground's front panel.
- Blank-canvas button copy sells the theme: *"start from nothing —
  generators + audio"*.

### Round 4 phases

| Phase | Scope | Size |
|---|---|---|
| R4-P1 | Blank canvas: entry UI + solid PNG upload + Canvas device (R4-1) | small — **DONE 2026-06-13** (Canvas pinned Utility device, HSL→RGB crossfade in sampleScene; blank-canvas button renders a solid PNG and seeds the device colour) |
| R4-P2 | Generate framework: mask/blend/motion plumbing in the scene pass, Gen 1–3 slots, Shapes + Noise flow types (R4-2) | medium — **DONE 2026-06-12** |
| R4-P3 | Fractals (Julia, KIFS) + palettes + Spectrum type (R4-2) | medium — **DONE 2026-06-12** |
| R4-P3b | Integrated generators: Integrate group (Depth gate, Inherit, Emerge, Anchor) + Displace blend mode (R4-2b) | small-medium — **DONE 2026-06-13** (genField factored once, displace pre-pass warps the sampling uv before the kaleido fold; defaults bit-exact to overlay) |

R4-P2/P3 implementation notes (2026-06-12): the three instances are packed
into **uniform arrays + one const-bounded GLSL loop** (avoids template
interpolation, which `check_shaders.py`'s extractor can't evaluate, and
keeps ANGLE/D3D happy); patterns live in region space, so they travel and
scale with the mask region; `FeatureBank.sample()` now returns `bands16`
(reused Float32Array) feeding the Spectrum type identically in preview and
export. **Trimmed from v1** (still planned): the depth gate, Beat-sync time
quantisation, and the R4-P4 on-canvas gizmo.
| R4-P4 | On-canvas placement gizmo (R4-3) | small-medium — **DONE 2026-06-13** (region outline + drag-move / edge-resize / Alt-or-handle-rotate for any expanded+on Gen device; writes via setParamValue; frame space maps isotropically so centre = X·w,(1−Y)·h, radius = Size·h) |
| R4-P5 | Playground pack + generator racks — rides R2-P4 (R4-4) | small |
| R4-P6 | Generators → named output devices (Shape Pulse / Fractal / Noise Flow / Spectrum) + 6 slots + device→slot allocation + re-authored packs (R4-5) | medium — **DONE 2026-06-13** (genDevice factory + GEN_KINDS; renderer GEN_DEVICES maps active devices → 6 shader slots; uGenKind sub-variant; Shape rings/polygons/bars, Flow clouds/marble, Spectrum bars/radial, Fractal julia/kifs; no migration — gen1*/gen2*/gen3* dropped) |
| R4-P7 | New generator devices: Tunnel / Starfield / Voronoi / Waveform (R4-5) | medium — **DONE 2026-06-14** (shader types 5-8 added to genField dispatch + four genDevice entries / GEN_DEVICES rows; genTunnel/genStarfield/genVoronoi/genWaveform are pure `(q,t,detail,kind)` fns, ANGLE-safe const loops; Waveform reads `uBands`; **plus generator beat-sync**: a `BeatSync` adv fader on every generator + `uGenBeatSync[]` uniform + `uBeats` added to SCENE_SRC; `gt = mix(uTime·spd, floor(uBeats)·step, beatSync)` in genField — 0 = bit-exact free clock. All four suites pass) |

### Round 4 compatibility & risk notes

- **Old projects/presets are untouched:** every new param defaults to
  off/0 and loads via schema defaults when absent — the same guard that
  kept pre-R3 sessions loading. No migration needed.
- **check_shaders must cover the new GLSL:** fractal loops need constant
  upper bounds (ANGLE/D3D unrolling) — cap iterations with a `const int`
  and early-out on escape.
- **Fractal cost at 4K export:** ~96 iterations × 3 instances is real
  work; export is offline (WS backpressure absorbs slow frames) but
  preview perf gates the iteration budget. If needed: per-type iteration
  caps, or evaluate Gen layers at half res and upsample (they're soft
  content; bloom already lives at quarter res).
- **Scene-pass uniform growth:** three Gen instances ≈ 60 new uniforms in
  `SCENE_SRC`. Fine under GL limits, but if it gets unwieldy, pack each
  instance into a `vec4[]` uniform block rather than splitting passes —
  keeping generators in the scene pass is what makes trails/bloom/grade
  apply to them.
- **Photosensitivity:** generator Amount modulated from smoothed envelopes
  inherits the existing flash limiter; the only new strobe vector is Beat
  sync at extreme Speed — clamp pattern flash rate the same way the
  envelope guard does (≤3 rises/sec).

---

## 9. Round 5 — simplicity architecture & device standardization (planned)

User direction, 2026-06-11: the product goal is **music producers easily
creating compelling visuals from still images for their music**. The
tension to resolve: infinite possibility vs. simple-to-use — the one-knob
mastering plugin vs. Ozone Advanced. Decision: **the sweet spot leans
toward simplicity**, delivered as layers. And the key reframe (user's):
**intuitive doesn't mean few controls — it means no surprises.** A fifth
device costs nothing to learn if it behaves exactly like the first four.

The architecture follows the proven DAW pattern: Ableton's racks were
layered *over* existing devices years after they shipped, and won because
they curated rather than replaced. Devices stay honest, orthogonal
primitives (the deep layer's trustworthiness depends on it); simplicity is
added as **contract + metadata + curation**, never by making params
secretly do three things. **This round is standardization, not a rebuild**
— no param-key migrations, no preset/pack/session breakage.

### The ladder

Every session starts at the top; nothing below the current rung is
visible until invoked. Success metric for L0–L2:
**time-to-first-export-they'd-actually-post.**

| Rung | Decisions | Surface | Status |
|---|---|---|---|
| **L0** | zero | drop image + audio → a good look is already playing | exists (default pack) — strengthen |
| **L1** | one | look browser: ~10 curated racks, auditioned live on the user's own content (R5-4) | packs exist; audition new |
| **L2** | 4–8 | the macro quartet + master Reactivity + Follow structure — where most users live | macros exist; quartet/reactivity/follow new |
| **L3** | dozens | the device chain (today's main UI), one click away | exists |
| **L4** | hundreds | modulation matrix, lanes, loop/markers — the Ozone Advanced floor | exists |

### R5-1 — The device contract (standardization pass)

A written contract every device follows, so the panel is predictable
everywhere. Applied as a light audit over the existing schema (labels,
ordering, defaults, hints) — param *keys* are preserved.

- **Layout invariant:** On toggle, then the **Dry/Wet** fader (the
  Round-1 "0 = absent" param — already universal, renamed from
  "Intensity" for Ableton parity), then character params, then rate/size
  params, in that order, every device.
- **Naming vocabulary:** one word per concept across all devices —
  `Dry/Wet` (the device fader), `Amount` (a character strength that is
  *not* the fader), `Speed` (temporal rate), `Scale` (spatial size),
  `Hue`/`Colour` (chromatic), device-specific character names after. No
  synonyms ("Drive", "Push", "Kick", "Intensity" as fader names are out —
  Round 1 already dissolved most of these).

**One fader — Dry/Wet (audit findings 2026-06-11, user report):**

Two contract violations surfaced in use and a schema review confirmed
their extent:

1. **Redundant double fader.** In 16 devices the device fader scales
   exactly one scalar (`resolveParams`' MIX_SCALE has a single entry:
   parallax, warp, zoom blur, DOF, fog, rays, bloom, leaks, hue cycle,
   duotone, plasma, strobe, grain, CA, vignette, ripple) — so "Intensity"
   and "Amount" are two multiplying knobs on the same quantity. Confusing
   and a wasted row. **Rule:** a device shows ONE fader. For these
   devices the duplicate `Amount` moves under *More…* (`adv: true`) with
   the hint "patched depth — Dry/Wet is the fader"; packs keep authoring
   Amount (no key migration, no pack/preset breakage), users see one
   Dry/Wet knob. Devices whose fader legitimately macro-scales several
   params (camera, glitch, rain, pixel, VHS) and the true shader
   crossfades (kaleido, feedback, halftone, edge) keep their character
   params visible — those aren't duplicates.
2. **Dry/Wet 0 must equal device-absent, bit-exact, for every device.**
   Camera fails today: `camMix` scales drift + shake but not the base
   zoom, so Dry/Wet 0 still crops 1.06×. Fix: Dry/Wet scales `camZoom`
   toward its neutral 1 (GRADE_NEUTRAL pattern, scale-toward-neutral not
   toward-zero). The smoke suite currently asserts 0 == absent for only
   8 of 24 toggled devices — **extend the matrix to every device** so any
   other offender is caught empirically, and lint-require a MIX_SCALE /
   crossfade / neutral entry for every device fader.
- **Producer language, not implementation language:** labels and hints
  say what it does to the picture ("how hard the image dances"), not how
  ("modulation depth"). DAW metaphors preferred (devices, racks,
  "reacts to"); compositor jargon (LUT, passes) allowed only at L3+.
- **Tooltip coverage is mandatory:** every param ships a `hint` (HINTS
  already covers most — close the gaps).
- **Visible-param budget:** soft cap of ~6 params per device; beyond
  that, the tail collapses behind a per-device "More…" disclosure
  (esoteric params stay reachable, never confronted). The R3-3 grading
  suite is the test case — Basic shows 10, so Whites/Blacks/Vibrance
  fold under More by default.
- **Enforced by test, not discipline:** a schema-lint check in
  smoke_browser (or a new tests/check_schema.py) asserts the contract —
  intensity-param-first, vocabulary compliance, hint coverage, `sweet`
  within `[min,max]`, every param `axis`-tagged or explicitly exempt.
  New devices (R3-P4/P5, R4) inherit the contract for free.

### R5-2 — Semantic axis tagging

Two optional schema fields per param — pure metadata, fully additive:

```js
{ key: 'grainAmount', label: 'Amount', min: 0, max: 1, def: 0.4,
  axis: 'texture', sweet: [0.1, 0.55] }
```

- **`axis`**: which perceptual knob the param belongs to — `energy`
  (reactivity depths, impact amounts), `motion` (camera family, drift,
  feedback zoom), `texture` (grain, fog, VHS, particles), `colour`
  (grade, hue, duotone, leak hue) — or none. The macro vocabulary
  becomes *data* the app can act on.
- **`sweet`**: the curated good range, distinct from the honest full
  range. Sliders at L3 keep `[min,max]`; macros map across `sweet`, so
  the Energy knob at 100% is intense but never broken. This is the
  one-knob trick: the knob exposes the *good* range, not the full range.
- Optional **`weight`** (0..1) where a param should contribute more or
  less than its siblings to a generated mapping.

### R5-3 — The standard quartet + master Reactivity

- **Generated quartet:** `buildQuartet(chain)` collects the axis-tagged
  params of the devices in the current chain and maps four macros —
  **Energy · Motion · Texture · Colour** — from each param's no-effect
  value (`dry`, default 0-in-range; e.g. saturation declares `dry: 1`) up
  to sweet-hi. **Knob at 0 = fully dry** (user decision 2026-06-11: 0
  must always mean no effect, matching the Intensity convention); the
  knobs *start* at positions matching the current look, so building the
  quartet doesn't jolt the picture. Consistency is the payoff: the same
  four knobs, in the same order, meaning the same thing, on every pack —
  muscle memory transfers.
  Hand-tuned racks (R2-P4) start from the generated baseline instead of
  from nothing; pack authors then add 1–2 named character macros (slots
  5–6) per look.
- **Master Reactivity:** one global knob scaling every modulation depth
  (a single multiplier where `applyModulation` reads depths) — "how hard
  does the picture dance to my track." The most producer-shaped control
  the app can have; also the cheapest. Session-persisted, automatable
  like a macro.

### R5-4 — Ladder UI: simple view + look audition

- **Simple view is the default surface:** transport, look browser, the
  quartet + Reactivity + Follow structure, and Export. The device chain
  collapses behind one "Devices" toggle (state remembered per project).
  First-run = L0/L1/L2 only.
- **Look audition on the user's content:** the renderer is a pure
  function of (t, params), so the look browser renders small live
  thumbnails — each pack applied to *this* image, sampled at a hot
  section of *this* track (pick the loudest analysis section). Hovering
  a look plays it on the main canvas (preview-apply, revert on
  mouse-out); clicking commits. Choosing a look becomes recognition, not
  decision. Thumbnails render at ~192px in the existing GL context
  round-robin (one thumb per rAF tick) — no second context needed.
- **The thread between layers:** every macro gets a "show mapped params"
  action that opens the owning devices with the mapped sliders
  highlighted — the guided path from L2 into L3. (The reverse exists
  already: the override latch + ◆.)

### R5-5 — Follow song structure

One checkbox: **"Follow song structure."** Ramps the Energy macro per
section using the analysis' detected sections (refined by R3-2 user
markers when present), scaled by each section's mean loudness — builds
lift, drops hit, outros breathe, with zero user effort. Implementation:
a generated automation lane on the Energy macro (visible, editable,
deletable at L4 like any lane — honest, not magic). Re-runs when markers
change; user edits to the lane disable auto-regeneration (Live-style
latch semantics, same as param override).

### Round 5 phases

| Phase | Scope | Size |
|---|---|---|
| R5-P1 | Device contract audit (labels/order/hints/More… disclosure) + schema-lint test (R5-1) | small-medium — **DONE 2026-06-11** |
| R5-P1b | One-fader pass: rename Intensity → Dry/Wet, fold the 16 duplicate Amounts under More…, camera zoom-neutral fix, 0 == absent test matrix over all devices + lint rule (R5-1 audit findings). The matrix caught two more offenders beyond camera: particles (5% cell floor at density 0) and rain (10% droplet floor at amount 0) — both gated to bit-exact zero. | small-medium — **DONE 2026-06-12** |
| R5-P2 | Axis + sweet tagging across all params; `buildQuartet`; master Reactivity (R5-2, R5-3) | medium — **DONE 2026-06-11** |
| R5-P3 | Simple view + ladder defaults + macro→device thread (R5-4) | medium — **DONE 2026-06-13** (body.simple-view hides the device chain; Devices/Simple toggle, session-persisted; mapping-editor rows reveal+highlight their param at L3; simple is the first-run default) |
| R5-P4 | Look audition thumbnails + hover preview-apply (R5-4) | medium — **DONE 2026-06-13** (dedicated small Renderer, one thumb per frame at the loudest section; hover previews the pack live via lookPreviewParams, click commits) |
| R5-P5 | Follow song structure (R5-5) | small-medium — **DONE 2026-06-13** (checkbox writes a visible, editable lane on the Energy macro from per-section mean loudness; auto-builds the quartet if needed; regenerates on marker change unless the lane was hand-edited) |

Ordering note: R5-P1/P2 should land **before** R2-P4 (rack library) and
the R3/R4 device waves where possible — racks built on tags are cheaper
to author, and new devices written to the contract avoid re-audit.

### Round 5 compatibility & risk notes

- **No migrations:** param keys are untouched; tagging is additive;
  label/hint changes don't affect stored data. Packs/presets/sessions
  load unchanged.
- **Simple view must not strand existing users:** projects saved with
  the device panel open reopen at L3; the ladder constrains *defaults*,
  never capabilities.
- **Sweet-range curation is per-image-content risky** (a sweet grain
  range on a bright photo may differ on a dark one): tune against the
  test fixtures + several real photos, and keep `sweet` conservative —
  the full range is one click deeper.
- **Generated quartet quality varies by chain:** a chain with no
  colour-axis devices yields a dead Colour knob — grey out unmappable
  quartet knobs with a hint ("add a Color device") rather than mapping
  junk.
- **Follow-structure must stay honest:** it writes a visible lane, never
  a hidden multiplier — preview/export identity and the existing
  undo/history model then cover it for free.
- **Thumbnail audition costs GPU:** round-robin one thumb per frame and
  pause thumb rendering while the transport plays at L3+ or during
  export.

### Decision — build vs. VFX library (2026-06-11)

Evaluated adopting three.js (+ EffectComposer / pmndrs postprocessing) or
Seriously.js for the effect pipeline. **Decision: keep the bespoke
renderer.** Rationale: Seriously.js is abandoned (no WebGL2, last real
activity ~2016); three.js is a 3D scene-graph engine wrapped around the
same WebGL2 we call directly — for a 2D fullscreen-quad pipeline it adds
a dependency, not capability. The app's actual value lives in what no
library ships: bit-exact preview/export identity (pure function of `t`),
the schema-driven device/modulation/automation system, and ~20 effects
folded into 3 full-res passes (a naive composer chain is one FBO
round-trip per effect). Off-the-shelf passes would need forking to accept
per-frame music-reactive params anyway, and re-matching 25 tuned devices
pixel-for-pixel would break every pack and preset for zero user-visible
gain. Revisit only if a future round needs true 3D (meshes/lighting) —
not the case for the R4 generators, which are procedural 2D. Libraries
*are* welcome at the edges: e.g. a real depth model (Depth-Anything via
onnxruntime) to replace the pseudo-depth, or a `.cube` LUT parser.

---

## 10. Round 6 — project & session management, export visibility (planned)

User requests, 2026-06-12: swap the image under the same song without
losing any work; make it obvious which image + song are loaded; a real
project library (add/remove); and export progress/completion that can't
be missed.

Background facts that shape the design: a project id is
`sha1(image + audio)` — content-addressed, so "changing the image" is
necessarily a *new* project id. The audio analysis is a pure function of
the audio, so it can be copied, not recomputed; `depth.png` is derived
from the image, so it must regenerate. And the per-project session
autosave currently carries tempo/lanes/chain/macros/loop/markers but
**not the param slots** — looks survive only as explicit presets. R6-4
closes that gap; R6-1 rides on it.

### R6-1 — Change image, keep everything

- **Backend:** `POST /api/project/{pid}/image` with the new image file.
  Creates the sibling project (`sha1(newImage + sameAudio)`): writes the
  new image, **hard-copies the existing audio + analysis.json** (same
  audio ⇒ identical analysis, no recompute), regenerates `depth.png`,
  copies `session.json`, returns the new meta. Re-swapping back to a
  previous image lands on the existing id — content addressing gives
  undo for free.
- **Frontend:** a *Change image* button (in the R6-2 media card). On
  success, only the image/depth textures and `state.project` are
  replaced — slots, chain, macros, lanes, tempo grid, loop, markers all
  stay live in memory untouched. No reload, no re-analysis wait; the new
  look is one texture upload away.
- **Change audio** (the symmetric case) is *deliberately not* in scope:
  new audio = new analysis, new tempo grid, new beat positions — lanes
  glued to beats of a different song is a footgun. Offer it later, with
  an explicit "automation will re-map to the new grid" warning, only if
  asked for.

### R6-2 — "Now loaded" media card

Replace the one-line `inputStatus` text with a compact card at the top
of the INPUTS section: image thumbnail (the project image itself,
~64px), image filename, song filename, duration + detected/corrected
BPM, and two actions — *Change image* (R6-1) and *Reanalyze*. The card
is the single answer to "what am I looking at?"; the drop hint remains
for the empty state only.

### R6-3 — Project library

The RECENT PROJECTS list becomes a managed library:

- **Thumbnails + names:** each row shows the project image thumbnail
  (served straight from the existing image endpoint, CSS-sized),
  image + song names, and duration. An optional user **rename** (`name`
  field in meta.json, `PATCH /api/project/{pid}`) displays in place of
  the filename pair.
- **Delete:** an × per row → `DELETE /api/project/{pid}` removes the
  project directory after a confirm dialog naming what will be lost
  (the session autosave dies with it; exports are *not* deleted — they
  live in `data/exports/`). The server refuses to delete the currently
  loaded project's id if an export websocket for it is active.
- **Add** stays as-is (drop image + audio anywhere) — the library is
  about finding and pruning, not a new creation flow.

### R6-4 — Full-session persistence (the params gap)

Extend the autosave payload (localStorage + `session.json` mirror) with
`slots` (A and B), `active`, `packId`, and `reframe`. On project load,
restore them before the chain/macros (same precedence as today: defaults
→ pack → saved session). Result: reopening a project restores the exact
look — not just its automation — and R6-1's swap inherits a complete
session. Old sessions without the new fields load unchanged (defaults
apply, same guard pattern as loop/markers).

### R6-5 — Export visibility (in progress + finished)

The modal terminal states (✓ saved … / ✗ export FAILED … / "finalizing
encode…") landed 2026-06-12, as did **ack-based export transport**: two
long Firefox exports died because `ws.bufferedAmount` is unreliable under
sustained multi-GB sends (it under-reported, so backpressure never
engaged, Firefox queued gigabytes and its socket gave up mid-stream —
ffmpeg starved at frame 2778/3439 and 569/1184). The server now acks
every chunk *after* writing it to ffmpeg; the client paces against
unacked bytes (48 MB cap, end-to-end truth on any browser) and fails
fast with a clear error if acks stall for 60 s. Remaining:

- **Minimizable export:** closing the modal during an export should
  *hide it, not abort* (Cancel keeps aborting; add a separate Hide
  action). While hidden, a **progress pill** in the top bar shows
  `Exporting… 43%` and reopens the modal on click.
- **Tab title progress:** `document.title = "⏳ 43% — Still Reactive"`
  during export, restored after — visible even from another tab during
  a 25-minute 1080p60 export.
- **Finished state outside the modal:** on success the pill flips to
  `✓ exported` for one minute and the new file briefly highlights at the
  top of the EXPORTS list; on failure the pill goes red and stays until
  clicked (reopening the modal with the error text).
- **Guard rails stay:** `beforeunload` warning while exporting, and the
  background-tab caveat (rAF throttling pauses rendering) gets a hint in
  the modal: "keep this tab visible — background tabs render slowly".

### Round 6 phases

| Phase | Scope | Size |
|---|---|---|
| R6-P1 | Full-session persistence: slots/active/packId/reframe in autosave + restore (R6-4) | small — **DONE 2026-06-13** |
| R6-P2 | Media card + image swap endpoint & flow (R6-1, R6-2) | small-medium — **DONE 2026-06-13** |
| R6-P3 | Project library: thumbnails, rename, delete + confirm (R6-3) | small-medium — **DONE 2026-06-13** |
| R6-P4 | Export pill, hide-while-exporting, title progress, finished/failed states (R6-5) | small-medium — **DONE 2026-06-13** |

R6-P1 goes first: both the swap (R6-P2) and honest library deletes
(R6-P3's "what will be lost" confirm) depend on the session actually
containing the whole look.

### Round 6 compatibility & risk notes

- **Session payload grows** (~tens of KB with two full slots + sparse
  mod keys) — trivial for localStorage and `session.json`; keep the
  400 ms debounce.
- **Restore precedence must stay deterministic:** defaults → pack →
  session slots → lanes → macros — same pipeline as today, new fields
  slot in before chain restore. A/B identity (`active`) restores last.
- **Image swap + packs:** `state.packId` follows the session, not the
  image — a noir look on a beach photo is the user's call, never
  auto-reset.
- **Delete is destructive:** confirm dialog must name the session loss;
  no soft-delete/trash in v1 (the project dirs are content-addressed —
  re-dropping the same files resurrects the project, minus its session).
- **Sibling-project proliferation:** every image swap mints a new
  project dir sharing the same audio bytes (hard copies). Acceptable at
  this scale; if it ever bites, de-duplicate audio via a content-hashed
  `data/assets/` store — future, not now.

---

## 11. Round 7 — output polish & focus UX (planned)

User feedback, 2026-06-13: image quality needs a **master-bus stage**
(sharpen + grade) — "colours feel flat" and "exports lack detail";
effect onsets are **too abrupt** (rain at 0 vs 1 is a cliff); the
**Style dropdown and Look browser are redundant** and the packs are
dated; wants **named snapshots** of a look; and the device panel, while
full of genuinely useful controls, would feel more intuitive if it let
you **work one device at a time**. Decisions taken with the user via the
question flow (answers in brackets).

### R7-1 — Master section (the output bus) [Dedicated Master section]

A fixed finishing stage, pinned at the **end** of the chain, that you
can't remove or reorder — the DAW master channel. Render order is set in
the GLSL (the post pass), so grouping is a UI/family change plus two new
shader stages; `PARAM_GROUPS` order only drives the panel, not execution.

- **New family `Master`** (added to `FAMILY_ORDER`, rendered as a
  visually distinct locked cluster at the bottom of the panel) containing:
  **Sharpen** (new), **Grade** (the existing `grade` device, expanded),
  **Vignette**, **Film grain**, **Chromatic aberration** (the existing
  finishing devices, regrouped — keys unchanged, no preset breakage), and
  **Output** (new). This also declutters the creative area by moving the
  always-on finishing devices out of it.
- **Sharpen** (targets "exports lack detail"): unsharp mask in the post
  pass — a few neighbour taps of the graded image, high-passed and added
  back. `sharpAmount` + `sharpRadius`. Cheap; `check_shaders`-safe (fixed
  taps). Runs after Grade, before grain.
- **Grade** (targets "colours feel flat"): extend the current grade with
  **Highlights**, **Shadows** (luma-masked gain) and **Vibrance**
  (saturation weighted toward muted colours) — the high-value subset of
  the R3-3 Basic device. Existing keys (exposure/contrast/saturation/
  temperature/tint/gamma/fade) stay; new keys default to neutral, so
  every old preset/pack renders identically. Whites/Blacks/LUTs remain
  future (R3-3 full suite).
- **Output**: a gentle **soft-clip / highlight roll-off** as the very
  last step, so additive effects (bloom, generators, leaks) compress into
  highlights instead of hard-clipping to flat white — recovers perceived
  detail in bright areas. `outputCeiling` (soft knee), neutral default =
  no-op (bit-exact passthrough at the default).

### R7-2 — Gentle Dry/Wet fade curve [Gentle fade curve on Dry/Wet]

Every device fader gets a **perceptual response curve** so low values
bloom in gently instead of popping. In `resolveParams`, each `*Mix` is
shaped by `m' = m^γ` (γ ≈ 1.6) before it scales its targets (MIX_SCALE)
or is written back for the shader crossfades (kaleido/feedback/canvas/
gen/halftone/edge). Endpoints are exact (`0^γ=0`, `1^γ=1`), so **Dry/Wet
0 stays bit-exact-absent and 1 stays fully wet** — only the mid-range
eases. Fully-on effects (mix 1, the common case and what the smoke
matrix tests) are unchanged; only partial/automated fades smooth out.

- The curve is global and built-in; expose one **`Smoothness`** control
  (Audio response or Master, automatable, default = the γ≈1.6 curve, 0 =
  linear) so it's tunable, not hidden.
- **Caveat the user accepted:** a global curve smooths *perceived* onset
  but won't fully fix effects whose elements appear discretely (rain
  droplets, glitch blocks spawn at a hash threshold). Per-effect ramp
  smoothing of the worst offenders is a follow-up if the curve alone
  isn't enough — deferred per the user's "global only" choice.

### R7-3 — One Look browser + rebuilt packs [Merge + rebuild packs]

- **Remove the topbar Style dropdown** and its handler; the **Look
  browser (R5-P4) is the single entry** for looks. `applyPack` stays
  (driven by the look tiles).
- **Rebuild `STYLE_PACKS`** on the current schema so looks showcase what
  the app does now: generators, the Master grade/sharpen, sensible
  quartet-friendly device combos, integrated-generator settings. Author
  ~6–8 fresh looks (keep 1–2 classics). Packs are still plain override
  maps — `migrateLegacyParams` keeps any old saved preset working.
- Because looks now drop in on the user's image and auto-derive the
  quartet, "drop image+audio → pick a Look → press play" is the L0→L1
  path made real.

### R7-4 — Named snapshots [Named snapshots]

Checkpoints of a whole look, beyond the two A/B slots.

- **Model:** `session.snapshots = [{ name, ts, data }]`, where `data` is
  the same full-session JSON the autosave already builds (slots, chain,
  macros, tempo, automation, loop, markers, follow…). Stored per project
  (localStorage + `session.json` mirror); capped (~12) to bound size.
- **UI:** a Snapshots section (left sidebar) — "Save snapshot" (prompts a
  name, captures current state), a list with restore-on-click and a ×
  delete. Restoring loads `data` through the existing restore path (the
  same code that loads a session), then rebuilds panel/macros/timeline.
- Distinct from presets: a **preset/Look is portable** across projects; a
  **snapshot is a version of *this* project** you can return to. Distinct
  from A/B: A/B is a live two-way compare; snapshots are an unbounded
  named history you opt into.

### R7-5 — Focus mode: one device at a time [user's UX idea]

The panel has many genuinely-useful controls; the friction is seeing them
all at once. **Focus mode** (default on, toggleable): expanding a device
collapses the others, so you work one device at a time.

- Single-open accordion in `ParamPanel`: when a device `<details>` opens,
  close the others (respecting pinned-open only for the focused one).
  `openDevices` becomes effectively single-element in focus mode.
- A small **Focus** toggle in the panel header for power users who want
  several open at once (off = today's free-expand behaviour). Persisted
  per project in the session.
- Pairs with the simple/advanced ladder: simple view hides the chain
  entirely; advanced + focus shows one device's controls at a time.

### Round 7 phases

| Phase | Scope | Size |
|---|---|---|
| R7-P1 | Focus mode accordion + toggle (R7-5) | small — **DONE 2026-06-13** (single-open `<details>` accordion in ParamPanel; Focus toggle in the panel bar; session-persisted) |
| R7-P2 | Gentle Dry/Wet fade curve + Smoothness control (R7-2) | small — **DONE 2026-06-13** (`audSmoothness`→γ=1+s curve on every `*Mix` in resolveParams; endpoints exact; tested fully-wet bit-identical) |
| R7-P3 | Master section: Sharpen + Output shaders, Grade expansion, Master family regroup/lock (R7-1) | medium — **DONE 2026-06-13** (Sharpen unsharp + Output tanh soft-clip in POST_SRC; grade gains Vibrance/Highlights/Shadows; Master family via MASTER_ORDER reorder) |
| R7-P4 | Look consolidation: remove Style dropdown + rebuild packs (R7-3) | small-medium — **DONE 2026-06-13** (Style dropdown removed; 10 packs rebuilt on current devices incl. 2 generator looks + shared master FINISH) |
| R7-P5 | Named snapshots: model + sidebar UI + restore (R7-4) | small-medium — **DONE 2026-06-13** (`session.snapshots`, capped 12; buildSessionPayload/applySessionData factored and shared with autosave/restore) |

Suggested order: the two small UX wins first (focus mode, fade curve) for
immediate feel, then the Master section (the headline quality fix), then
looks and snapshots. R7-P3 should reuse the schema-lint contract so the
new Master devices inherit the Dry/Wet/axis rules for free.

### Round 7 compatibility & risk notes

- **No preset/pack breakage:** new params (sharpen, vibrance, highlights,
  shadows, output) default to neutral/no-op → old looks render
  identically; the fade curve preserves both endpoints; family regroup is
  UI-only (render order lives in GLSL). The 0==absent smoke matrix must
  still pass for every Master device.
- **Render order is GLSL, not panel order:** moving devices into a Master
  family at the end of `PARAM_GROUPS` must NOT be assumed to change
  execution — Sharpen/Output are placed deliberately in `POST_SRC`
  (Grade → Sharpen → Vignette/Grain → Output, with Output last).
- **Fade curve changes mid-range looks slightly:** acceptable (we're
  rebuilding packs anyway), and full-on effects are unchanged. Pack
  authoring happens *after* the curve lands so looks are tuned to it.
- **Snapshot size:** cap the count and reuse the autosave JSON shape; no
  new serialization path to keep in sync.
- **Focus mode must not hide work:** collapsing a device never changes its
  params or automation — purely view state; lane editing still targets
  whatever lane is open regardless of which card is expanded.

---

## 12. Round 8 — clean schema, Signal panel, Master strip, hierarchy (planned)

User direction, 2026-06-13. **Compatibility policy change (supersedes the
"no migrations / old projects must still load" notes in Rounds 5–6):** the
app is in active prototype mode. **Breaking existing saved projects,
autosaves and old project JSON is acceptable.** Prefer a clean state model
over backwards compatibility — delete old concepts fully instead of
building shims. Old files may fail to load or be ignored. Internal keys are
kept only when still useful for implementation, never for old saves.

### The intended product model (canonical)

| Concept | Role |
|---|---|
| **Looks** | curated starting points / packs |
| **Presets** | portable looks across projects |
| **Snapshots** | project-local checkpoints (replace A/B) |
| **Autosave** | current working state |
| **Automation** | bar/beat timeline parameter changes |
| **Macros** | high-level controls that can also be automated |
| **Devices** | modular visual/effect units in the chain |
| **Audio Response / Signal** | global analysis + modulation-source layer (NOT a device) |
| **Master** | pinned finishing chain at the end |
| **A/B testing** | **removed entirely** |

### R8-1 — Schema cleanup & A/B removal

Remove the A/B comparison model everywhere — it predates snapshots, which
now own project-local comparison/checkpoints.

- **State:** drop `state.slots {A,B}` + `state.active`; replace with a
  single `state.params`. `params()` returns `state.params`. Remove the
  A/B button, the copy-to-other button, their handlers, the `abBtn`/
  `abCopy` DOM, and the keyboard paths.
- **Persistence:** autosave/session writes `params` (not `slots`/
  `active`); `buildSessionPayload`/`applySessionData` and snapshot `data`
  switch to the single set. Presets save/load `params`. **No migration**
  for old `slots`/`active` — old sessions that carry them are ignored
  (the loader reads `params`; absent → defaults).
- **Tests:** delete A/B assertions; assert A/B is fully absent from the
  DOM and current state.
- **Naming pass** (do it now, since we're breaking schema anyway): prefer
  explicit product-facing names. Reorganize/rename state fields where it
  clarifies architecture (e.g. `state.params`, `state.devices` for the
  chain if clearer than `state.chain`, `state.snapshots`, `state.looks`).
  Keep internal param *keys* where they still serve the implementation.
  Candidate device label refresh (confirm during build): Shapes→**Shape
  Pulse**, Fog→**Fractal Fog**, Rain→**Rainy Window**, etc. — product
  names over technical ones, keys unchanged.

### R8-2 — Audio Response → global Signal panel

**Product decision:** Audio Response is a global signal-analysis +
modulation-source layer, **not a device**. It analyses the audio (spectral
energy, beats, transients, envelopes, timing) and feeds macros, devices
and automation. It must sit outside the visual device chain.

- **Remove it from the right-side device stack** (it's currently a pinned
  Utility device in `PARAM_GROUPS`). Do not style it as a device card.
- **Top-bar entry:** a compact **`Signal ▾`** (a.k.a. Audio Response)
  control opens a dedicated panel/drawer (across the top above preview/
  timeline, or a focused overlay) — accessible without permanent
  right-panel clutter.
- **Live multiband spectrum / EQ-style visualisation** — the headline.
  Named bands derived from the analysis-v3 16-band set (`bands16`):
  **Sub · Bass · Low Mid · Mid · High Mid · Presence · Air**. Each band
  shows a live meter / spectrum bar while playback runs; show raw and
  smoothed response so band activity is obvious ("what is the music
  driving?"). Closer to a spectrum analyser than a settings form.
- **BPM & grid clarity** (natural home for the long-pending BPM work):
  Detected BPM (analysis) vs Project BPM (tempo grid); **grid feel**
  (half-time / normal / double-time / manual, i.e. the ÷2/×2 controls);
  downbeat / Bar 1 offset. Explains the analysis↔visual relationship.
- **Feature readouts:** RMS/loudness, Peak, Sub/Bass/Mid/High energy,
  Transient strength, Beat pulse.
- **Mapping summary (simple, not full routing):** show which bands/
  features currently drive which macros/devices, scanned from macro
  mappings + modulation depths — e.g. "Bass → Shape Pulse amount,
  Beat → Camera bump, Highs → Particle shimmer."
- **Already shipped (keep working — NOT what's deferred):** the per-param
  **modulation matrix** (the ∿ strips) already routes any source → any
  param, stacks multiple sources on one param (`applyModulation` sums all
  `param~src` depths), and supports per-routing **bipolar depth** (negative
  = invert/duck), **threshold** (`@th`), and **gate** (`@gate`). The Signal
  panel must not regress this.
- **What R8 actually defers** (three narrower things, scoped out to avoid
  blowup):
  1. **Finer bands as routable *sources*.** `MOD_SOURCES` today is only
     `low/mid/high/loud/onset/beat` — just 3 frequency bands. The 7 named
     bands (Sub→Air) are *display-only* this round; promoting them (or
     arbitrary user bands) to selectable modulation sources is later.
  2. **Per-band signal conditioning.** `audGain/audAttack/audRelease/
     audGamma` are **global** (shape every envelope identically). Per-band
     gain / sensitivity / attack / release / smoothing (e.g. slow-release
     bass, snappy highs) does not exist yet. (Threshold/gate/invert already
     exist *per routing* — not deferred; only per-*band* shaping is.)
  3. **Assigning from the Signal panel.** Routing is created device-side
     today (a param's ∿ strip). R8 ships only a **read-only** mapping
     summary; making the panel interactive (drag a band → target) is later.
- The existing global controls (`audGain`/`audAttack`/`audRelease`/
  `audGamma`/`audReact`/`audSmoothness`/`audLowMid`/`audMidHigh`/
  `flashLimit`) move into this panel; the crossovers become the visible
  band boundaries.
- **Constraints:** not another device; no permanent right-panel clutter;
  prioritise visual clarity over exposing every parameter.

### R8-3 — Master as a distinct pinned final-output strip

Master (R7) must not read as another device group. Mental model:
"Everything above creates the look; Master finishes the output."

- **Distinct visual treatment:** a pinned footer/card at the bottom of the
  right panel with a divider above it, a clear label (**Master Output**),
  and a subtly different background/border/header from creative devices.
- **Contents:** Grade (Highlights/Shadows/Vibrance/Contrast/Exposure),
  Sharpen, Vignette, Chromatic aberration, Grain, Output soft-clip.
- **Locked:** always last, not draggable into the creative chain, not in
  the add-device browser, not removable, single instance only.
- **Behaviour:** collapsible/expandable; participates in Focus mode but
  stays visually identifiable as the final section.
- **Automation labels make the role explicit:** "Master Grade · Vibrance",
  "Master Grade · Shadows", "Master Sharpen · Amount", "Master Output ·
  Soft Clip", "Master Grain · Amount".

### R8-4 — Right-panel visual hierarchy pass

One coherent hierarchy: **Creative devices** (one group) → divider →
**Master Output** (distinct pinned finishing group). Audio Response is
gone from the stack (now the Signal panel); Snapshots replace A/B as the
project-local checkpoint workflow. Macros + mappings stay in the right
panel above the device chain.

### R8-5 — Creative colour & image-detail devices (new)

User wants creative colour and image-detail devices (beyond the Master's
corrective grade). Candidates for this round or the next wave: a creative
**colour device** (gradient map / colour-cycle / split-tone that is
expressive rather than corrective — distinct from Master Grade), and a
creative **detail/texture device** (clarity / local-contrast / structure
that's a *look*, not output sharpening). Scope to 1–2 here; the rest queue.

### Round 8 phasing

| Phase | Scope | Size |
|---|---|---|
| R8-P1 | Schema cleanup: remove A/B (state/UI/store/autosave/tests); single `state.params`; naming pass (R8-1) | medium — **DONE 2026-06-13** (slots{A,B}/active → `state.params`; abBtn/abCopy removed; autosave/restore/snapshots/presets read `params`; old slots saves ignored) |
| R8-P2 | Master strip: distinct pinned footer + divider + locked styling + automation label prefixes (R8-3, R8-4) | small-medium — **DONE 2026-06-13** (`.master-divider` + `details.group.master` styling; paramIndex prefixes Master groupLabel → "Master Grade · Vibrance") |
| R8-P3 | Signal panel: move Audio Response out of the stack; top-bar `Signal ▾`; live multiband spectrum; BPM/grid/downbeat; feature readouts (R8-2) | medium-large — **DONE 2026-06-13** (audio device `signal:true`, skipped by ParamPanel; `#signalPanel` drawer with 7-band spectrum, 6 source meters, detected-vs-project BPM + ÷2/×2 + Bar 1, response sliders) |
| R8-P4 | Mapping summary in the Signal panel (bands/features → macros/devices) (R8-2) | small — **DONE 2026-06-13** (scans mod depths + macro source-routing → "Low → … / Beat → …") |
| R8-P5 | Creative colour + image-detail device(s) (R8-5) | small-medium — **DONE 2026-06-13** (Colour wash split-tone + Clarity local-contrast; both crossfade faders, 0==absent) |

Suggested order: schema cleanup first (everything else builds on the
single param set), then the Master strip (cheap, high-clarity), then the
Signal panel (the big visual piece), then mapping summary and creative
devices.

### Round 8 regression scope (current app only — no legacy)

New projects initialize correctly · new autosave works · new snapshots
save/restore · Looks load · Presets save/load under the new schema ·
automation lanes still bind · macro mappings still work · Focus mode
works · Master stays pinned/locked and renders last/export-safe ·
**A/B fully absent from UI and state** · audio modulation still drives
devices/macros after the Signal-panel move · export still works.

### Round 8 risk notes

- **A/B removal touches many call sites** (`params()`, presets, snapshots,
  autosave, panel refresh, macro live, reframe). Do it as one sweep, lean
  on the suites, and accept that old saved projects break (intended).
- **Signal panel is the largest piece:** keep the analysis/modulation math
  untouched (it already works) — this is a UI relocation + visualisation,
  not a DSP change. The 7 named bands are a *display grouping* of the
  existing 16-band set; reactivity still uses `audLowMid`/`audMidHigh`.
- **Don't regress determinism:** moving Audio Response out of the device
  list must not change the render — its params are read the same way.
- **Master automation relabel is cosmetic** (lane display names); keys and
  lane bindings are unchanged.

### Future (Round 12) — layer stack (image-editor model)

(Now Round 12 — Round 11 is the UI-consistency/visual-QA foundation, §15,
which should land first.) Building directly on R10's Canvas base layer:
**a layer stack like a normal image editor.** The bottom is the R10 **Canvas base layer** (transparent /
colour / gradient / pattern / image); the user then **adds layers on top** —
more images, generators, or effects — each with its own opacity/blend and,
ideally, **its own devices**. Background/foreground falls out naturally
(a foreground layer over a background canvas, separated by user cut-outs or
auto depth/segmentation), as do **multiple images** (potentially per-layer
on the timeline) and **per-layer devices**. R10's Canvas-as-base-layer is
deliberately designed so this stacks on top without re-modelling. It's a
substantial architecture step (the renderer is single-image today) but
pairs with the Generate family (already composites N layers in the scene
pass) and the per-project depth map.

---

## 13. Round 9 — onboarding & UI hierarchy (planned)

User feedback, 2026-06-13: the direction feels like a focused creative
tool, but the **hierarchy isn't clear in the empty/start state** — Inputs,
Projects, Presets, Exports, Macros, Devices and Signal all compete for
attention before the user has made anything. Core principle to apply:

> **Before media: guide. After media: expose creative controls. During
> detailed editing: show devices, mappings, automation, signal.**

This refines (doesn't replace) the L0–L4 ladder from Round 5: the ladder
is about *depth*; this round is about *what's visible when*, keyed to
whether a project is loaded. Three zones to separate cleanly:
**Start/Create · Edit/Control · Manage previous work.**

### R9-1 — Product-led start state

Replace the single "drop one image + one audio file here" hint with two
clearly labelled paths:

- **Start with media** — Drop image + audio · Upload image · Upload audio.
- **Or start from nothing** — Blank canvas · Choose a look.

Make the two upload buttons explicit (not just a drop zone), keep
drag-drop working, and keep the colour picker with Blank canvas.
*"Choose a look"* opens the Look browser; since looks need an image to
thumbnail, in the no-media state it either (a) prompts for media first, or
(b) stashes the chosen look as pending and applies it once media loads —
pick (b) so the path flows. (Decision to confirm in build.)

### R9-2 — Left panel: Inputs + Looks primary, the rest into a Library

- **Primary:** Inputs (the media card / start paths) and **Looks** sit at
  the top, full attention.
- **De-emphasised:** Projects, Presets, Exports collapse into one compact
  **Library / Recent** area (collapsible sections or tabs), visually
  quieter — they're "manage previous work", not "create".
- Looks should be reachable early (it's an L1 starting point), so it
  ranks above the Library.

### R9-3 — Right panel: contextual, no empty macros as first impression

- **No project/audio active:** don't show four empty macro cells. Show an
  empty state: *"No active look yet. Upload media or choose a look to
  start controlling Energy, Motion and effects."* (or collapse the macro
  rack until there's something to control).
- **After media:** expose the creative controls (macros/quartet, looks).
- **Detailed editing:** the device chain, mappings, automation (today's
  advanced view) — reached via the Devices toggle.

### R9-4 — Top-bar "Devices" clarity

The `Devices` button currently toggles simple↔advanced (it shows/hides the
device chain via `body.simple-view`). Make that unambiguous: clarify the
label/tooltip and active-state so it's obvious it reveals the **device
chain / advanced editing**, distinct from `Signal` (global audio) and the
macro view. Consider labelling the two states explicitly (e.g. "Simple ⇄
Devices" or an Edit/Advanced toggle).

### R9-5 — Three-mode visibility (the glue)

A single `state.mode` derived from context drives what each panel shows:
`start` (no project) → guided start state, Library quiet, right panel empty
state; `create` (project loaded, simple) → looks + macros + Signal;
`edit` (advanced) → full device chain + mappings + automation. Persisted
per project where it makes sense; never hides capability, only defaults
visibility (existing-user safety from Round 5 still applies).

### R9-6 — Device product-name pass (carried over from R8-1)

The R8 naming pass renamed state fields but **not** most device labels.
The generators already got product names in R4-P6 (Shape Pulse / Fractal /
Noise Flow / Spectrum). Audit the remaining devices for plain-language
names (keys unchanged) — e.g. Rain → **Rainy Window**, Living warp →
something clearer — and confirm the mapping with the user.

---

*Second feedback batch (2026-06-13) — timeline, Signal editing surface,
button states, macros. Folded into Round 9 below.*

### R9-7 — Timeline marker clarity

Audit finding: the timeline overloads colour. **Orange** is used for both
**onsets** (detected transients — faint `rgba(255,190,90,0.55)` 9%-height
ticks, unlabelled) *and* **automation** points/lines (`#ffb45a`).
**Green** is used for both **section** lines *and* **user markers**. So the
user can't tell "the app detected this" from "I made this."

Full inventory of timeline indicators (each needs a clear, distinct
identity): **playhead** (white), **bar-1 / downbeat flag** (blue ⚑),
**loop brace** (blue, top band), **user markers** (green flags),
**onsets/transients** (amber ticks), **section boundaries** (green lines),
**automation lane line + points** (amber, when a lane is open), enum level
guides. (There are no separate beat / macro / modulation markers today.)

Redesign:
- **A colour language by origin, not coincidence:** analysis/detected
  (onsets, sections) get one muted treatment; user-created (markers, loop,
  bar-1, automation) get a distinct, stronger treatment; the playhead is
  unmistakable. Stop sharing orange between onsets and automation, and
  green between sections and user markers.
- **Visual weight hierarchy:** playhead > downbeat > section/marker >
  automation points > onsets (faint, supporting).
- **Hover labels/tooltips:** hovering any marker says what it is and what
  created it ("Onset · detected transient", "Section B · marker",
  "Automation point · Master Grade · Vibrance"). A small legend/key is a
  fallback.
- **Goal:** a user immediately understands why each marker exists.

### R9-8 — Signal panel: spectrum as the editing surface (FabFilter-style)

The Signal panel is still a readout, not an instrument. Make the
**spectrum the primary editing surface** (FabFilter Pro-MB workflow):
- Bands, **band boundaries, and overlap/crossover regions are visible** on
  the spectrum.
- **Drag crossover points directly** on the spectrum (replaces the
  `audLowMid`/`audMidHigh` sliders); reshape bands visually.
- Live audio **animates inside the bands** while playing.
- The feel: *sculpting how the signal is interpreted*, not editing a list.
- This pulls forward the R8-deferred crossover/per-band UI: the draggable
  crossovers ARE the deferred "finer band control"; per-band **response
  curves** become the deferred per-band shaping, surfaced here.

**Progressive disclosure** (the panel is too busy — spectrum, sources,
tempo, response shaping, mapping all at once). Three tiers:
1. **Signal** — live spectrum · BPM · beat detection (first impression:
   visual + musical, not technical).
2. **Band shaping** — band boundaries · crossovers · response curves.
3. **Advanced** — routing · modulation diagnostics · detailed mappings.

Surface tier 1 by default; tiers 2–3 behind expandable sections.

### R9-9 — Active button states (bug + restyle)

**Root cause:** `.ctl-btn.active { background: var(--accent); color: #0b0d12 }`
is a solid fill; the per-button overrides (`#signalBtn.active`,
`#viewToggle.active`) only change border/text colour, not the background —
so an active toggle becomes an accent fill with accent-coloured text =
an unreadable solid block that reads as disabled. Fix: an active state
that's clearly *selected* but legible — outline / highlight border /
underline / glow / selected-tab treatment — never a large solid fill that
swallows the label. Apply consistently to Signal, Devices, Guides, and the
aspect/segment buttons.

### R9-10 — Macro section simplification

Audit every macro-section control against "would a music producer get this
without docs?" — **Follow Structure**, **◇ Quartet**, the macro-count
±, map-mode **M**, the mapping badge all fail that test as first-class
controls. Make macros feel simple, with the core workflow front-and-centre:
**1. Create macro · 2. Name it · 3. Map controls · 4. Automate it.**
Everything else is secondary — move Quartet / Follow Structure / count
into an **advanced** affordance (a "…" menu or the advanced tier), rename
where a plainer word exists, or hide by default. Don't show power-features
as the first impression of the macro rack.

### R9-11 — Macro mapping clarity

A mapping should instantly answer: **what** is this macro controlling,
**how much** influence (range/depth), is it **additive or multiplicative**,
and is **audio also driving the same target** (macro + modulation on one
param). The R8 mapping summary is the right direction but must be more
prominent and scannable — per-macro, show its targets with range bars and
an "also reacting to <source>" note when modulation shares the target.
Goal: macros feel intentional, not mysterious.

### Round 9 phasing

| Phase | Scope | Size |
|---|---|---|
| R9-P1 | Product-led start state: two paths + explicit upload buttons (R9-1) | small-medium — **DONE 2026-06-13** (two start cards: upload image/audio · blank canvas + Choose a look → pending-look applied on load) |
| R9-P2 | Left panel: Inputs + Looks primary; Projects/Presets/Exports → compact Library (R9-2) | small-medium — **DONE 2026-06-13** (`#librarySection` collapsible `<details>`) |
| R9-P3 | Right panel empty state + contextual macro visibility; `state.mode` glue (R9-3, R9-5) | medium — **DONE 2026-06-13** (macro empty state when no project; body mode-start/create/edit classes; Devices toggle disabled in start) |
| R9-P4 | Active-button restyle (R9-9, the readability bug) + top-bar Devices/Signal clarity (R9-4) | small — **DONE 2026-06-13** (`.ctl-btn.active` → outline+tint+inset glow; Devices tooltip/label) |
| R9-P5 | Device product-name pass (R9-6) | small — **DONE 2026-06-13** (generators already named in R4-P6; Living warp → Liquid warp; rest already plain-language) |
| R9-P6 | Timeline marker clarity: colour-by-origin language + weight hierarchy + hover labels (R9-7) | medium — **DONE 2026-06-13** (onsets cool-grey, sections teal-grey — analysis; user/automation keep green/blue/amber; `_labelAt` hover tooltips via canvas.title) |
| R9-P7 | Macro simplification: core create→name→map→automate; Quartet/Follow/count → advanced (R9-10) | small-medium — **DONE 2026-06-13** (Quartet/Follow/count behind a ⋯ advanced menu) |
| R9-P8 | Macro mapping clarity: prominent per-macro summary w/ range + shared-audio note (R9-11) | small-medium — **DONE 2026-06-13** (per-cell "→ targets ♪ audio too" summary + range tooltip) |
| R9-P9 | Signal spectrum as editing surface (draggable crossovers, band/overlap viz, live-in-band animation) + progressive disclosure (R9-8) | large — **DONE 2026-06-13** (log-freq spectrum from bands16; Low/Mid/High region shades; draggable crossover handles set audLowMid/audMidHigh; tiers Signal / Band shaping / Advanced) |

### Round 9 risk notes

- **Visibility, not capability:** every zone change defaults what's *shown*;
  nothing becomes unreachable. Advanced users land in `edit` if their saved
  session was advanced.
- **"Choose a look" before media** needs the pending-look path (R9-1b) so
  it doesn't try to thumbnail a non-existent image.
- **Naming pass is label-only:** device `id`s and param keys stay; only
  display labels + the add-device browser change. The schema-lint contract
  still holds.

---

## 14. Round 10 — input model, device states & export confidence (planned)

User feedback, 2026-06-13 (after Round 9 shipped). Theme: **the preview is
the output, the Inputs panel is the source of truth.** Plus device-state
clarity, an export confidence summary, a top-bar tab model, plain-language
control labels, and value units.

### R10-1 — Preview = guidance, not controls (fixes a regression)

**Regression:** the Round-9 start cards (Upload image/audio, Blank canvas,
Choose a look) sit inside `#dropHint`, which has `pointer-events: none` (so
drops fall through to the canvas) — the buttons render but **can't be
clicked**. Don't make them clickable in place; per the user, **remove
controls from the preview entirely.** The preview shows a clean guided
empty state only:
- *"Add an audio track and choose a visual source to begin — use the
  Inputs panel on the left, or drag files onto the preview."*
- Drag-and-drop still works (the canvas keeps the drop handler).
- No fake/inactive buttons in the preview, ever (principle: the preview
  shows output + guidance; it is never the setup form).
- Optional: a callout arrow pointing at the Inputs panel.

### R10-2 — Input model: Audio + a Canvas base layer

**Decision (user, 2026-06-13): the project starts from a Canvas base
layer, like an image editor's background layer** — not "pick one of N
start paths." Every project is **audio + a base canvas**; the canvas is
always present and configurable, and (in Round 11) the user stacks layers
on top of it. Two Inputs groups:
- **Audio** — Upload audio · drag audio here. (Always required — the clock
  + signal.)
- **Canvas** (the base layer) — its **fill** is one of: **Transparent ·
  Solid colour · Gradient · Pattern · Image (upload)**. Default = a blank
  canvas (no image required to begin). An uploaded image simply fills the
  base layer; it's no longer a separate "start path".

So a new project is a blank canvas + (pending) audio; the user fills the
canvas (colour/gradient/pattern) or drops an image into it, and reaches a
playable visual without ever uploading an image. **Looks** sits below,
gated: *"Choose a look once audio + a canvas are ready."* Workflow:
audio → canvas fill → (Round 11: layers) → look → devices/macros → export.

### R10-3 — Canvas fills (transparent / colour / gradient / pattern / image)

The Canvas base layer's fill modes map onto / extend existing machinery
(the shipped Canvas device + the blank-PNG flow):
- **Image** — drop/upload; fills the base layer (today's image path).
- **Solid colour** — the shipped Canvas device flat colour.
- **Transparent** — base renders to the export/preview background (black
  today); meaningful as the floor under stacked layers (Round 11) and for
  alpha-aware export later.
- **Gradient** — a new Canvas-device mode (two-stop gradient) — small
  shader add to the Canvas branch.
- **Pattern** — a built-in generated fill (e.g. a Noise Flow / Fractal
  full-frame) baked as the base — leans on R4-P6's named generators.

These are *fills of one base layer*, chosen in the Canvas input group;
they are not separate top-level start paths. The full **layer stack**
(adding images/generators as layers above the base) is Round 11.

### R10-4 — Device disabled state should look inactive

An unchecked device still shows full, editable-looking controls. Make
"off" read as off — but **not collapsed/hidden** (user decision
2026-06-13: don't be so drastic that the device disappears; just clearly
disabled, and no opt-in toggle — this is the default behaviour):
- Lower opacity / muted sliders on a device whose toggle is off.
- A clear **Off** indicator in the device header (beyond the checkbox).
- Controls stay visible and editable; the card does not collapse.

Goal: at a glance, which devices are actually affecting the output, while
keeping every device's controls reachable.

### R10-5 — Export confidence summary

Before rendering, show exactly what file will be produced:
**Aspect 16:9 · 1920×1080 · 30 fps · 3:01 · AAC · MP4** (derived from the
current aspect/resolution/fps + the track duration or loop range). A clear
summary line in the export modal so there are no surprises.

### R10-6 — Top-bar tab model for Devices / Signal

Devices and Signal are workspace drawers — treat them as **selectable
tabs**, not push-buttons. Build on the R9-9 outline fix with a clearer
selected-tab treatment (border + subtle bg + visible text + small
underline). Make it obvious which view is active without a solid fill.

### R10-7 — "Kind" → product-facing labels

Rename the generator/particle sub-type labels from the internal-sounding
"Kind"/"Type": **Shape type · Fractal type · Noise type · Particle type**
(and "Pattern" where it fits). Labels only — enum keys unchanged.

### R10-8 — Parameter value units

Values render as bare numbers; standardise display by parameter type via a
schema `unit`/`format` hint read in `ui.js` formatValue:
- Mix/intensity → **67%** · Hue → **321°** · Speed → **0.48×** ·
  Attack/Release → **45 ms** · Crossover → **160 Hz / 2.0 kHz** ·
  Exposure/Temperature → **+0.09 / −14** (signed).
Goal: no inferring units from raw numbers. Additive `unit` field per param;
formatValue picks the renderer; defaults to today's plain number.

### Round 10 phasing

| Phase | Scope | Size |
|---|---|---|
| R10-P1 | Preview → guided empty state (remove dead controls) + Inputs becomes Audio + Canvas base layer, relocating the start controls; blank canvas is the default base (R10-1, R10-2) | medium — **DONE 2026-06-13** (preview is guidance-only; Inputs = Audio + Canvas `Source` selector; `tryCreateProject()` builds audio + fill-PNG; `.start-only` hides setup once a project exists) |
| R10-P2 | Device disabled-state styling — dimmed/Off, never collapsed (R10-4) | small — **DONE 2026-06-13** (`details.group.device-off` dims body + OFF badge; refresh() toggles by `_toggleKey`) |
| R10-P3 | Export confidence summary (R10-5) | small — **DONE 2026-06-13** (`updateExportSummary` → aspect · WxH · fps · duration · AAC · MP4, live on res/range/batch change) |
| R10-P4 | Top-bar tab model (R10-6) + "Kind" → product labels (R10-7) | small — **DONE 2026-06-13** (`.workspace-tab` underline; Shape/Fractal/Noise type + Display + Particle type) |
| R10-P5 | Parameter value units (R10-8) | small-medium — **DONE 2026-06-13** (additive `unit`: pct/deg/ms/hz/x/signed in formatValue; Dry/Wet %, hues °, grade signed) |
| R10-P6 | Canvas fills: gradient + pattern + transparent (R10-3) | medium — **DONE 2026-06-13** (Canvas `canvasMode` flat/gradient two-stop in sampleScene; fills image/colour/gradient/pattern(Noise Flow)/transparent) |

### Round 10 risk notes

- **Don't strand features:** R10-P1 must move Blank canvas + Choose a look
  into Inputs in the same change that removes them from the preview.
- **Canvas-base-layer is the foundation for Round 11 layers:** design the
  R10 Canvas input as "the base layer's fill" so the Round 11 layer stack
  slots on top without re-modelling. Default new project = blank canvas
  base (no image upload required); audio still required.
- **Value units are additive:** a missing `unit` falls back to the current
  numeric format — no mass reformat, no test churn beyond the formatter.
- **"Kind"/canvas-fill renames are labels only:** enum option keys, device
  ids and param keys are unchanged; the schema-lint contract holds.
- **Gradient/pattern fills** reuse the Canvas device + generators; avoid a
  parallel code path.

### R10 follow-up (feedback 2026-06-13) — DONE + deferred

User feedback after R10 shipped. **Done:**
- **Signal panel is now a drawer overlay** (was in-flow, pushed preview/
  timeline down) — `position:absolute`, anchored below the topbar, z-index
  under the export modal.
- **Left (Inputs) panel is resizable** (`#leftResize`, persisted) — mirrors
  the right handle.
- **Preview reflects the visual source pre-audio** (`#sourcePreview` CSS
  layer: colour/gradient/image/transparent-checkerboard) — audio is only
  required for reactivity, not to show the base. Empty state is now a slim
  floating callout (`#startCallout`) pointing at Inputs, not a big block.
- **"Canvas" → "Visual source"**; copy clarified (audio = reactivity;
  visual source = the base). Colour UI gained a **hex input** alongside the
  swatches.
- **Signal legibility:** spectrum canvas sized to displayed×dpr (crisp);
  labels bold with dark backing; **modulation-source meters show % not
  0.00–1.00**.
- **dB question (answered):** the source values are *normalised* 0..1
  reactivity envelopes (percentile-normalised, smoothed), not calibrated
  dB/SPL — true dB would be misleading, so % is the honest, clearer
  display. (A pseudo-dBFS `20·log10` view is possible later if wanted.)

**Deferred (design-heavier, plan for a later pass):**
- **Coachmark guide sequence** — the callout is static; a dynamic step
  sequence ("1 choose source → 2 add audio") that re-points as state
  changes is future.
- **Full inline colour popover** — recent colours, larger gradient preview
  strip, gradient **direction** (vertical / horizontal / radial), add/remove
  stops. (Swatches + hex + live source-preview shipped; the rest is later.)

### R10 follow-up #2 (feedback 2026-06-14) — DONE

- **Device disabled state revised:** dropped the "OFF" badge (user disliked
  it); a disabled device just reads dimmer. **Bug fixed:** the dimmed state
  stuck "off" even after switching a device on — the checkbox `onchange`
  didn't refresh the `device-off` class; now it toggles it immediately
  (regression-tested).
- **"Visual source" → "Base layer"** (header + callout + copy + toasts).

---

## 15. Round 11 — UI consistency foundation & visual QA (planned)

From the product-evaluation discussion (2026-06-14). Context: the tool is a
**personal product** — the user is the target user and refines requirements
through use, so external-user validation doesn't apply; reactivity is
confirmed good via the user's own test videos. The user prioritises UI/UX
tonal consistency, and wants a style guide. Do this **before Round 12
(image layers)** so the layer UI is built on the system, not added as more
ad-hoc styling.

### R11-1 — Style guide + design-token refactor

The CSS has drifted across 11 rounds (audit 2026-06-14): **9 distinct
`border-radius` values** (2–20px), **8 `font-size` values** (9–22px),
~**157 raw colour/size literals** with hand-repeated one-off `rgba()`s
(e.g. the active-tint `rgba(122,162,255,0.14)`). The `--bg/--panel/--accent`
tokens exist but most values bypass them.

- **Token layer** (`:root` custom properties), then refactor the CSS to use
  it: surfaces (bg / panel / panel-2 / border), text (text / dim), accent +
  accent-tint, accent-2, status (ok-green / warn-amber / err-red); a
  **spacing scale** (4/8/12/16), a **radius scale** (sm 4 / md 6 / lg 10 —
  collapsing the 9 values to 3), a **type scale** (10/11/12/13/15), and
  shadow tokens.
- **`STYLE_GUIDE.md`** documenting the tokens, component conventions
  (buttons / device cards / sliders / meters / modal / swatches and their
  hover-active-disabled states), the **semantic colour language already in
  use** (blue accent = interactive, amber = automation, the timeline
  "origin" language: muted = analysis, saturated = user), and the
  affordance glyphs (◆ automate, ∿ modulate, ⋯ advanced).
- The refactor is **behaviour-preserving** — no intended visual change,
  just consolidation; the R11-2 golden test verifies that.
- Pays off twice: keeps the UI tonally consistent for the user, and
  constrains *assistant-made* edits to the token vocabulary (drift was
  partly from each round picking a plausible shade). A later lint rule
  ("no raw hex/px outside tokens") could enforce it, like the schema lint.

### R11-2 — Golden-frame visual-regression test

Rendering is pure in `(t, params)`, so a deterministic look-regression test
is feasible (most graphics tools can't do this reliably):

- Render ~4–5 representative looks (packs) on the fixed fixture
  (`test.png` + `test.wav`) at a couple of fixed `t` values; commit the
  results as reference PNGs in `tests/fixtures/golden/`.
- The test re-renders and **pixel-diffs against the goldens** with a
  tolerance (mean-abs-diff, small frames e.g. 192×108), failing on drift.
- Catches what structural tests miss: a shader/param change that alters the
  *look* while still passing determinism + 0==absent. It's a tripwire, not
  a quality judge — flags that a look *changed*, then the user eyeballs
  intent; a "bless" flag regenerates the goldens for intended changes.
- **Caveat:** exact pixel-match is GPU/driver-fragile, so run on the
  existing headless Chrome and use a tolerance — a regression guard for the
  user's machine, which is all a personal tool needs.

### Round 11 phasing

| Phase | Scope | Size |
|---|---|---|
| R11-P1 | `STYLE_GUIDE.md` + token layer in `:root` (R11-1) | small-medium |
| R11-P2 | Behaviour-preserving CSS refactor onto tokens (R11-1) | medium |
| R11-P3 | Golden-frame visual-regression test + initial references (R11-2) | small-medium |

Order: token layer + style guide first; then the CSS refactor; then capture
goldens against the consolidated look so they lock the intended baseline.

### Also agreed (queued, not scheduled into a round yet)

- **Real depth model** (Depth-Anything via onnxruntime-web) to replace the
  pseudo-depth — lifts parallax / DOF / depth-gate quality. Edge library,
  not a core rewrite.
- **Curation pass** on devices + packs — after the UI feels user-friendly.

## 16. Round 14 — timeline editing & navigation UX — DONE 2026-06-15

From user feedback after making a full end-to-end video: editing and
navigating automation felt clunky. Shipped ahead of Round 11 as the immediate
priority. All four suites pass (+ five new `smoke_browser` clip-op assertions).
Everything is pure data on the beats-domain model — **determinism untouched**.

### R14-P1 — Draw / Move mode toggle (default Move), hotkey D
- `timeline.mode` (`'move'` default | `'draw'`); `setMode()` sets the mode +
  cursor (`default` vs `crosshair`). The root cause of the friction: with a
  lane open, clicking empty lane space always added a breakpoint (`_down`), so
  you couldn't move around without drawing. In **Move**: existing point +
  curve-handle drags still work (hit-test first); a plain click seeks; a
  click-drag past a 3px threshold opens a **marquee** (`this.selection =
  {startB,endB}`, beats-domain, snapped) resolved on `pointerup` (no move →
  seek + clear; moved → keep). In **Draw**: the prior add/edit behaviour.
  Ruler gestures (scrub / loop / bar-1 flag / markers) unchanged.
- UI: a `.seg` Move/Draw toggle (`#modeToggle`) in `#laneCluster`; hotkey **D**
  toggles. Persisted to `localStorage['sr:tlMode']` (editor preference, not
  project data — kept out of the session for determinism). `_down` now also
  ignores right-click (`button===2`, context menu only — no stray scrub/point)
  and treats middle-button as pan (see P2).

### R14-P2 — Navigation: move through + jump to spots
- Wheel-zoom / shift+wheel-pan kept. Added **middle-mouse-drag pan**
  (`drag.type==='pan'`, works any mode). Keys (guarded by a loaded project, not
  in an input): **F** `zoomToFit()`, **Home/End** seek to start/end, **←/→**
  `jumpNav(±1)` to the previous/next *nav point* — `navPoints()` = ends + bar 1
  + user markers + detected sections + loop edges, deduped/sorted; `seekTo()`
  seeks + `revealTime()` pans so the playhead stays on-screen while paused.
  Small **Fit** button by the snap selector. Lane switching (`[` `]` + chips)
  left as-is per the user. (Zoom-to-loop was built then removed — see follow-up.)

### R14-P3 — Copy / paste automation (range + whole lane)
- `AutomationSet` clip ops (pure, serialisable): `copyRange(key,startB,endB)`
  (beats relative to the range start) and `copyLane(key)` (relative to the
  first point, carries `anchorB`); `pasteRange(key,clip,atB)` overwrites the
  destination span then splices, `pasteLane(key,clip)` replaces the lane
  re-anchored to `anchorB` — both clamp values via `clampValue` so copying
  across params of different ranges stays in-bounds; `deleteRange()` for cut.
- `main.js`: `state.clipboard`; **Ctrl+C** (selection → range clip, else whole
  lane), **Ctrl+V** (range → paste at the snapped playhead; lane → replace the
  open param's lane), **Ctrl+X** = cut. Type-compat guard
  (discrete↔discrete / continuous↔continuous, else a toast); macro-mapped
  target rejected. Right-click empty lane area → `onLaneMenu` → showMenu
  (Copy selection / Copy [whole] lane / Paste at playhead / Delete selection).
  Every paste/cut = `commitHistory()` (undoable) + autosave.
- Tests (`web/test.html` §3c2c): copy-range→paste reproduces the shape at a new
  anchor; paste overwrites the destination span and keeps outside points; paste
  is deterministic (identical JSON); whole-lane paste clamps to the target
  range (verified canvasHue max 360 → canvasMix max 1); deleteRange removes
  only in-band points. Plus a DOM-presence check for the new controls.

### R14 follow-up (user feedback 2026-06-15)

- **Drag edge-scroll (new).** *"While paused, dragging to the left/right end of
  the timeline should keep moving in that direction."* It didn't — a drag
  stopped at the view edge. `timeline.js` now auto-scrolls during any drag
  except `pan`: `_move` was split into `_move` → `_applyDrag(e)` +
  `_updateEdgeScroll(e)`; within `28px` of either edge of a zoomed-in view it
  sets `_edgeDir` and runs `_edgeTick()` (rAF) which pans `viewStart` ~1.2% of
  the view per frame and re-applies the held drag via `_applyDrag(this._dragEvt)`
  so the marquee/scrub extends into the newly revealed area. Stops on
  `pointerup` (`_stopEdgeScroll`), when the pointer leaves the edge, or when the
  view clamps at the song ends.
- **Zoom-to-loop removed (not wanted).** Deleted the **L** key, the **Loop ⤢**
  button (`#zoomLoopBtn`), `main.js` `zoomToLoop()`, and `timeline.zoomToRange()`.
  Plain **F** zoom-to-fit stays.
- **Loop the highlighted range (Ableton-style).** Move-mode marquee now also
  works with **no lane open** (the no-lane `_down` branch marquees in Move,
  scrubs in Draw; `_drawSelection` draws regardless of an open lane). The Loop
  button: if a range is highlighted (`timeline.getSelection()`), it sets the
  loop region to that range, turns looping on, and clears the selection; with no
  selection it toggles looping as before.
- **Undo/redo now covers markers (and loop).** `historySnapshot()` /
  `restoreHistory()` gained `markers` + `loop` (restored *in place* — the
  timeline and transport hold references to `songMarkers`/`loopRegion`).
  `commitHistory()` added to the committed arrange paths: `arrangeChanged()`
  (menu/button marker + loop edits) and the timeline `onArrange(committed)`
  callback (loop/marker drags). Marker add/move/rename/delete and loop
  set/toggle/clear are undoable; the snapshot dedup means a no-op change adds no
  entry. Tempo (bar-1 flag) and automation were already covered, so the whole
  timeline arrange state now undoes as one.
