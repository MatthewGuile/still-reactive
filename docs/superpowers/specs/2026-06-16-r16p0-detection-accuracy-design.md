# R16-P0 — Onset & Tempo Detection Accuracy — Design

**Date:** 2026-06-16
**Status:** Draft for review
**Roadmap:** ROADMAP.md Round 16 → R16-P0 (the tempo half is a pull-forward;
"tempo handling bit in real use"). Independent of the Racks work.

---

## Problem

A timeline-legibility complaint ("the onset ticks look random") was investigated
with a **phase-lock metric R** — the resultant-vector length of onset phases at a
given tempo (R = 1 → onsets sit exactly on the beat grid; R ≈ 0 → uniform /
drifting). Findings:

- A synthetic click locks at **R ≈ 0.92** (the pipeline is sound), but real
  tracks score **R ≈ 0.02 against the *stored* tempo** — displayed onsets are
  statistically unrelated to the grid.
- Two independent root causes, plus a UI legibility issue.

### RC1 — the tempo estimate is ~1% off

`_estimate_tempo` ([analysis.py:149](../../../still_reactive/analysis.py))
autocorrelates the 50 fps flux envelope. Near 145 BPM one frame-lag ≈ **7 BPM**,
so even the parabolic refinement leaves ~1% error. Example: a track whose onsets
lock hard at **146.0 BPM (R 0.65)** is stored as **144.74** — a 1.3-BPM error
drifts the grid ~4 beats over 3 minutes, collapsing R 0.65 → 0.03. Harmless on a
12 s clip; fatal over minutes.

> Why the current backend test never catches it: the synthetic fixture is a
> clean **120 BPM** click, and at 50 fps that is **exactly 25 frames/beat** — it
> lands on an integer autocorrelation lag, so there is no sub-frame error to
> expose. The bug only appears at tempos that don't divide the frame grid.

### RC2 — full-band onset flux is noisy on busy tracks

Displayed onsets come from **full-band** spectral flux
([analysis.py:264](../../../still_reactive/analysis.py),
[:271](../../../still_reactive/analysis.py)) — which the code itself notes
"over-weights broadband noise (hats)". It already reserves the cleaner
**bass flux** (`bass_flux`, low band only) for the downbeat/phase anchor, but
*displayed* onsets still use full-band. So pads/vocals/cymbals/reverb all fire,
then the 2 s adaptive threshold + 120 ms-gap greedy peak-pick thin survivors by
*amplitude*, not metrical position → a steady pulse renders as a scatter
(Song B locks at no tempo, max R 0.12).

### RC3 — UI / legibility (ties to R11)

The onset ticks read as clutter, mimic the beat grid, and their purpose is hidden
(the "Onset — detected transient" hover at `timeline.js` is undiscoverable).

## Goals / non-goals

**Goals:** raise phase-lock R against the *stored* tempo on real tracks from
~0.02 toward ~0.65; make displayed onsets metrically meaningful; make the marks
legible. **Determinism is unaffected** — analysis feeds reactivity, not the
render's `(t, params)` purity.

**Non-goals (deferred to R16-P1/P2):** the meter map (time signatures) and tempo
automation (piecewise BPM). This spec is detection *accuracy* only, on the
existing single-value `TempoMap`.

---

## The phase-lock metric R (shared definition)

For a candidate tempo `bpm` (period `P = 60/bpm`) and a set of onset times
`{tᵢ}`, the phase of each onset is `φᵢ = 2π·(tᵢ mod P)/P`. The resultant length
is `R = |(1/N)·Σ e^{iφᵢ}| ∈ [0,1]`. R is used three ways:

1. as the **objective** RC1 maximises when refining the tempo,
2. as the **verification** for tests (before/after),
3. (optionally) surfaced in the Signal panel later as a "grid confidence"
   readout (out of scope here).

A small pure helper `phase_lock_R(onsets, bpm, offset=0.0) -> float` lives in
`analysis.py` and is unit-tested directly.

## RC1 fix — refine tempo on the onset train

After the existing autocorrelation seed + octave correction in
`_estimate_tempo` (which gives a coarse BPM within ~1%), **refine** before
returning:

- **Chosen method — fine R sweep (recommended).** Sweep BPM over a narrow window
  around the seed (e.g. **±4 %**, step **~0.05 BPM**), computing `phase_lock_R`
  at each candidate against the **anchor (bass) onset times** (cleaner than
  full-band — see RC2), and pick the BPM that maximises R. Then re-derive the
  comb-phase `offset` at the refined BPM. Pure and deterministic: same analysis
  in → identical tempo out.
- **Alternative considered — least-squares fit** of the onset train to
  `tᵢ ≈ offset + nᵢ·P` (solve for P). Comparable accuracy; the R sweep is
  preferred because it *is* the diagnostic and degrades gracefully (it just
  returns the seed when no candidate beats it).

Guard rails: only refine when there are enough anchor onsets (≥ ~8) and the best
R clears a small floor; otherwise keep the autocorrelation seed unchanged (a weak
/ arrhythmic track must not be pulled to a spurious peak). The octave-correction
and 105-BPM prior stay as-is — refinement only *fine-tunes* the chosen octave.

## RC2 fix — percussive / low-mid-weighted displayed onsets

Derive the **displayed** `onsets` from a percussive-weighted flux instead of
full-band:

- Build `perc_flux` as a band-weighted spectral flux that emphasises
  low + low-mid and **down-weights the high band** (hats/air/cymbals). The band
  masks already exist (`band_masks["low"]`, `["mid"]`, `["high"]`; `BANDS = low
  20–160, mid 160–2000, high 2000–9000`). Concretely a weighted sum, e.g.
  `flux_low + 0.6·flux_mid + 0.15·flux_high` (weights tunable during
  implementation), keeping the existing `np.log1p` compression + half-wave
  rectification.
- Normalise + smooth as today, then **raise selectivity** on the peak-pick
  (higher adaptive floor / wider min-gap) so a steady pulse survives and reverb
  tails don't.
- **Keep the full-band `onset_env`** for the tempo autocorrelation seed
  (broadband periodicity helps the coarse estimate); the **anchor/bass onsets**
  remain the basis for the RC1 R-refinement and the downbeat phase. So three
  flux roles stay distinct and intentional: autocorr seed (full-band), tempo
  refine + phase (bass/anchor), display (perc-weighted).

`onsetEnv` exported to the frontend switches to the perc-weighted envelope so the
timeline ticks and the envelope agree.

## RC3 fix — legibility (small frontend slice)

- **Hide onset ticks by default**, reveal them **while dragging the ⚑1 downbeat
  flag** (when snapping actually matters).
- Give onsets a **visual language distinct from the beat grid** (e.g. a different
  weight/shape/baseline — not another vertical line that mimics bars/beats).
- Add a **"what the marks mean"** line to the `?` shortcuts popover
  (`openShortcuts()` in main.js), since the per-tick hover is undiscoverable.

This slice may be split into its own small frontend change if convenient; the
RC1/RC2 backend fixes are the core and ship independently.

## Cache version bump

Any analysis change **bumps the cache version v3 → v4** so existing
`analysis.json` recomputes:

- write `"version": 4` in `analyze_audio`'s result
  ([analysis.py:316](../../../still_reactive/analysis.py)),
- change the recompute gate `cached.get("version", 1) < 3` → `< 4`
  ([analysis.py:374](../../../still_reactive/analysis.py)),
- update the backend test assertion `a["version"] == 3` → `== 4`.

## Testing

Run all four suites after each phase. Keep test step names ASCII.

**smoke_backend (`tests/smoke_backend.py`):**
- New fixture at an **awkward, longer tempo** that does *not* divide the frame
  grid — e.g. a **~146 BPM, ~60–90 s** synthetic kick track (add a `bpm=` /
  `seconds=` call to the existing `make_audio`). Assert the **refined** tempo is
  within tight tolerance (e.g. `|tempo − 146.0| < 0.3 BPM`) — this fails on the
  pre-refinement code (≈1 % off) and passes after RC1.
- Assert `phase_lock_R(onsets, stored_tempo, offset)` is **high** (e.g. > 0.5)
  on that fixture, and unit-test `phase_lock_R` directly (a perfectly on-grid
  set → R ≈ 1; a uniform-random set → R ≈ 0).
- For RC2: a synthetic track with a steady kick + heavy broadband hat/noise —
  assert the perc-weighted displayed onsets lock (R high) where full-band would
  scatter; assert onset count is sane (not flooded).
- Keep the existing leading-silence / kick-aligned-bar-1 assertions; bump the
  `version == 4` assertion.

**smoke_browser:** if `onsetEnv` shape/semantics change, confirm the timeline
still renders; add a minimal check that onset ticks are hidden by default and
shown while dragging ⚑1 (RC3).

**check_shaders / smoke_server:** unaffected — run to confirm no regression.

## Proposed phasing

1. **P1 — RC1 tempo refinement** + `phase_lock_R` helper + version bump +
   backend test (awkward-tempo fixture + R assertions).
2. **P2 — RC2 perc-weighted displayed onsets** + selectivity + `onsetEnv` swap +
   backend test (busy-track fixture).
3. **P3 — RC3 timeline legibility** (hide-by-default, reveal-on-⚑1-drag, distinct
   marks, `?`-popover line). May ship separately.

## Open questions / decisions to confirm

- **RC1 method:** fine R sweep (recommended) vs least-squares fit. Spec assumes
  the R sweep.
- **RC2 weights / selectivity:** exact band weights and threshold are tuned
  during implementation against real tracks; the spec fixes the *approach*
  (low + low-mid weighted, high down-weighted, higher selectivity), not the
  numbers.
- **RC3 scope:** include in this spec's P3, or fold the timeline legibility into
  the R11 chrome work? (Listed under R16-P0 in the roadmap but explicitly "ties
  to R11".)
