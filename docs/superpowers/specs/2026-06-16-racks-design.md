# Racks (Ableton-style) — Design

**Date:** 2026-06-16
**Status:** Approved (brainstorm) — ready for implementation plan
**Supersedes for now:** R13-P1/P2 "preset model + trap fix" is **parked**. The
preset/look concept is reframed as a far-future **"Templates"** idea (a saved
bundle of *specific racks + colour grade/effects*) and is **not** scheduled.

---

## Purpose

Replace the single global macro **quartet** with **multiple named,
purpose-built Racks** — Ableton-style reusable units that each "do a thing".
A Rack groups a subset of the device chain and exposes macro knobs that control
the params inside it. Racks are saveable to a library and droppable onto any
project.

This is the build-out of the backlog item **R2-P4** ("generative rack library"),
but scoped to a lean first version.

## Scope

**v1 = framework + build-your-own.**

In scope:
- The Rack data model (named container over a device-chain subset + up to 8
  macro knobs mapping into those devices' params).
- Create / name / edit a rack; map params to macros (reusing Map-mode + the
  range editor); assign device membership.
- **Automatable** macro knobs (draw a lane on a macro), via dynamic per-rack
  macro keys.
- A **Racks library**: save a rack to disk, list saved racks, apply one to a
  project (adds its devices + sets params + installs its macros).
- Undo coverage extended to chain + racks.

Explicitly **deferred** (each a later phase):
- Curated/starter library racks shipped with the app.
- Re-homing the old looks (`packs.js`) as racks.
- Waveform **automation recipes** (the generative `riseOver`/`slamAt`/
  `followEnergy`/… part of the old R2-P4).
- **Parallel chains / chain-selector zones / nesting** (the "full Ableton rack")
  — collides with the still-fixed render pipeline; this is the natural
  convergence point with Rounds 12 (image layers) + 15 (modular pipeline).

## Governing principles (unchanged, must not regress)

- **Determinism:** rendering stays a pure function of `(t, params, racks)`;
  preview == export, bit-identical.
- **Per-frame resolution order:** base params → lanes (beats domain) →
  **macros (now rack-aware)** → modulation → Device On + Mix → uniforms.
- **`Mix 0 == device absent`, bit-exact** — untouched (racks don't change the
  chain's render math, only which params get set).
- Compatibility is **dropped** (prototype): breaking old saved
  projects/autosaves is acceptable — prefer a clean model over shims.
- Run all four suites (`smoke_backend`, `smoke_server`, `check_shaders`,
  `smoke_browser`) + `check_schema` after each phase.

---

## Architecture (chosen approach)

**Racks as a persistent control/grouping layer over the existing fixed chain.**
A rack is metadata that logically groups existing devices and exposes macro
knobs that *own* their mapped params — exactly today's macro mechanism, just
scoped per-rack and named. The fixed render pipeline and chain order are
**untouched**.

Rejected alternatives:
- *Racks as true render containers* (a rack owns a contiguous sub-pipeline) —
  requires the modular pass graph (Round 15); deferred, the future merge target.
- *Racks as apply-once preset fragments* (dissolve into the chain on apply, no
  living rack object) — loses the per-rack macro grouping and the Ableton feel;
  it is just the parked preset idea.

## Data model

### Rack instance (lives in a project)

Replaces today's `state.macros` / `state.macroCount`.

```js
{
  id: 'rk1',                              // unique per project, assigned on create
  name: 'Psychedelia',
  deviceIds: ['warp', 'feedback', 'hue'], // subset of state.chain (device-type ids)
  macros: [                               // up to 8 slots; only assigned ones shown
    { name: 'Swirl', mappings: [ { key: 'warpAmount', min: 0, max: 0.5 },
                                 { key: 'fbRotate',  min: 0, max: 10 } ] },
    // …
  ],
}
```

`state.racks = []` is the project's rack list.

### Macro values are params (not stored in the rack object)

So macro knobs stay automatable and flow through the existing pure resolution.
Each macro gets a per-instance key `` `${rackId}.m${n}` `` (e.g. `rk1.m1`),
replacing the old global `macro1..macro8`. Value range 0..1, def 0.

### Saved / library rack (server JSON, portable)

```js
{
  name,
  deviceIds: [ … ],
  params: { /* unmapped device params only */ },     // mapped params are macro-driven
  macros: [ { name, value: 0..1, mappings: [ { key, min, max } ] } ], // value = default knob pos
}
```

The "look" of mapped params is encoded by the **macro's default value** scanning
its range (consistent with how `buildQuartet` derives a starting position).
Unmapped device params store literal values. Note the shape difference: an
*instance* macro is `{ name, mappings }` (its live value lives in
`params['rkN.mM']`), whereas a *saved* macro adds `value` — **saving** captures
the current `params['rkN.mM']` into `value`, and **applying** seeds it back.

**Applying a rack:** add `deviceIds` to the chain → set the unmapped params →
create an instance with a fresh `id` → seed `params['rkN.mM'] = macro.value` →
install mappings. Mapped param keys (`bloomAmount`) are global, so no remapping
is needed when moving a rack between projects.

### Rules

- A device belongs to **≤ 1 rack**; devices may be loose (in the chain, in no
  rack). Adding a device to a rack moves it out of any other.
- A param is mapped by **≤ 1 macro** across all racks (exclusive ownership —
  mirrors today's "macro owns the param, direct lanes on it are ignored").
- **Render order is untouched.** A rack is a logical grouping + macro-control
  unit, never a render-order container in v1.

## Resolution & determinism

Per-frame order is unchanged; racks slot exactly where macros do:

```
base params → lanes → applyMacros(params, state.racks) → modulation → Device On + Mix → uniforms
```

`applyMacros(params, racks)` becomes rack-aware but stays a **pure function**:
it walks every rack's macros, reads `params['rk1.m1']`, and scans each mapping's
`[min, max]` — identical math to today. A mapped param is overridden after lanes
run (existing rule). Determinism invariants preserved: same `(t, params, racks)`
→ same frame.

## Automatable macro keys (dynamic paramIndex)

`paramIndex()` becomes rack-aware: instead of statically emitting `macro1..8`,
it emits one entry per `` `${rackId}.m${n}` `` for the project's current racks,
labelled **"<RackName> · <MacroName>"** so lanes/chips read naturally.

Because racks come and go:
- `paramIndex(racks)` takes the current rack list (it is already a function).
- A `rebuildParamIndex()` call in `main.js` fires whenever racks change
  (create / delete / rename / remap), which **invalidates the cached
  `MACRO_SCHEMA`** in `params.js` and re-points the automation/lane-editor index.
- When a rack or macro is **deleted**, drop any automation lanes on its now-dead
  macro keys (no orphan lanes).

Drawing a lane on `rk1.m1` sets the knob over time; `applyMacros` (after lanes)
reads that value and drives the owned params — the same two-step the global
macros use today.

## UI

The current macro-rack strip (`buildMacroRack` / `refreshMacroRack`) becomes the
**Racks area** — a list of **rack cards** reusing the existing macro-knob
rendering, Map-mode, and range editor.

**Rack card:**
- **Header:** rack name (click to rename), collapse toggle, `⋯` menu —
  *Save to library · Delete · Auto-generate*.
- **Macro grid:** one knob per assigned macro (label = macro name, 0–1,
  automatable; right-click → fade/pulse quick-actions like other params), plus a
  **`＋ macro`** affordance. Each knob has the existing **Map** button → param
  rows light up → click a param to map it (default range = full), with the
  range-editor list of mappings underneath.
- **Devices row:** chips for the rack's member devices + a **`＋ devices`**
  control entering an *assign mode* (mirrors Map mode): device panel headers
  light up, click to add/remove membership. A device shows a small rack badge in
  its panel header.

**Top-level controls:**
- **`＋ Rack`** → a new empty named rack.
- **`Auto rack`** → today's `buildQuartet` repurposed: generate an
  Energy/Motion/Texture/Colour rack from the current chain as a one-click start.
- **Empty state** (no project / no racks): a single prompt card, not idle knobs.

**Library (left panel):** the hidden `#looksSection` slot becomes a **Racks**
section — a *Yours* list of saved racks (click to apply → `applyRack`; `×` to
delete) + a **Save current rack** entry. The parked **Preset** UI (top-right
"Save as preset" + Library→Presets list) is **hidden** for now. **Snapshots stay
unchanged** (whole-session checkpoints).

> The user prefers to interact with the live UI and iterate; exact layout is
> open to refinement during implementation.

## Undo, migration, storage

**Undo:** `historySnapshot()` / `restoreHistory()` gain `state.chain` and
`state.racks` alongside `state.params`. Rack create/delete, membership changes,
mapping edits, device add/remove, and rack-apply all become Ctrl+Z-undoable
(closing the known gap where only params were on the stack). `commitHistory()`
fires at each gesture boundary.

**Migration (prototype mode):** drop `macro1..macro8`, `state.macros`,
`state.macroCount` entirely. Old sessions/presets carrying them are ignored → a
restored project starts with `state.racks = []`. `defaultParams()` stops seeding
`macro1..8`; macro-value params are seeded per-rack on create. The quartet is
regenerated on demand via **Auto rack**.

**Storage / API:** mirror the presets pattern — user racks as JSON in
`data/racks/<slug>.json` with `GET / POST / DELETE /api/racks` (new `store.py`
functions + `server.py` routes). Rack instances live in the session payload
(`buildSessionPayload` / `applySessionData` swap `macros`/`macroCount` →
`racks`). Parked preset endpoints stay on disk but unused by the UI.

## Testing

Run all four suites + `check_schema` after each phase. Keep test step names
ASCII (cp1252 console gotcha).

- **smoke_browser:** create a rack; map a param → macro value scans `[min,max]`
  and drives it; `applyMacros` pure/deterministic; macro overrides a direct
  value; a dynamic macro key appears in `paramIndex` and a lane on it drives the
  macro over time; undo reverts a rack-create and a mapping; save → apply
  round-trips a rack (devices added, params set, macros installed).
- **smoke_server:** `/api/racks` save / list / delete round-trip.
- **check_shaders / smoke_backend:** unaffected — run to confirm no regression.
- **check_schema:** racks aren't devices; verify dynamic macro keys don't trip
  the lint.

## Proposed implementation phasing

1. **P1 — model + resolution + migration:** `state.racks`, rack-aware
   `applyMacros`, drop the global quartet/`macro1..8`, session payload swap.
2. **P2 — dynamic automatable macro keys:** rack-aware `paramIndex` +
   `rebuildParamIndex()` + orphan-lane cleanup.
3. **P3 — rack-card UI:** card container, macro grid (reusing Map-mode + range
   editor), devices-assign mode, rack badges, Auto rack, empty state.
4. **P4 — library + API:** `/api/racks` (store + routes), *Yours* list, save /
   apply / delete.
5. **P5 — undo extension:** chain + racks in the history snapshot, gesture-
   boundary commits.

(Final ordering/granularity to be set by the implementation plan.)

## Open / deferred questions

- Exact rack-card layout and the devices-assign interaction (iterate on the live
  UI).
- Whether `Auto rack` should also seed sensible macro ranges per axis (likely
  reuse `buildQuartet`'s `dry → sweet-hi` ranges verbatim).
- Curated library racks, re-homing looks, waveform recipes, and the "Templates"
  bundle — all later phases, out of this spec.
