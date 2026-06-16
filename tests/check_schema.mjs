// Schema-contract lint (R5-P1/P1b): every device follows the same contract,
// so the fifth device costs nothing to learn. Checks layout (Mix fader
// first), the one-fader rule, fader resolution paths, naming vocabulary,
// tooltip coverage, the 6-visible-param budget, and the axis/sweet tags
// that generate the macro quartet.
//
// Run from repo root: node tests/check_schema.mjs

import {
  PARAM_GROUPS, FAMILY_ORDER, QUARTET, buildQuartet, defaultChain, MIX_SCALE,
} from '../web/js/params.js';

const AXES = new Set(QUARTET.map((q) => q.axis));
// Utility groups that legitimately have no Device On toggle / Mix fader.
const NO_TOGGLE_EXEMPT = new Set(['audio']);
// One word per concept: these are synonyms of Amount/Mix and are banned
// as labels. 'Mix' is reserved for the device fader itself.
const BANNED_LABELS = new Set(['Depth', 'Drive', 'Push', 'Strength', 'Level', 'Power', 'Wet', 'Dry', 'Intensity', 'Dry/Wet']);
const VISIBLE_BUDGET = 6;
// Faders implemented as shader-level crossfades (a UV remap / generated
// layer has no zero point in its params — the blend must happen on colours).
const CROSSFADE_FADERS = new Set(['kaleidoMix', 'fbMix', 'htMix', 'edgeMix', 'shapeMix', 'fractalMix', 'flowMix', 'spectrumMix', 'canvasMix', 'sharpMix', 'outputMix', 'washMix', 'clarityMix', 'tunnelMix', 'starfieldMix', 'voronoiMix', 'waveformMix']);
// Faders resolved by fading params toward a neutral (not zero) in
// resolveParams: the grade fades to the no-op grade; camera also fades its
// base zoom toward 1.
const NEUTRAL_FADERS = new Set(['gradeMix']);

const errors = [];
const fail = (msg) => errors.push(msg);

const seenKeys = new Set();
let paramCount = 0;
let taggedCount = 0;

for (const g of PARAM_GROUPS) {
  const where = `[${g.id}]`;
  if (!g.label) fail(`${where} missing label`);
  if (!FAMILY_ORDER.includes(g.family)) fail(`${where} family "${g.family}" not in FAMILY_ORDER`);
  if (!g.params || !g.params.length) fail(`${where} has no params`);

  if (!g.toggle && !NO_TOGGLE_EXEMPT.has(g.id)) {
    fail(`${where} has no Device On toggle and is not exempt`);
  }
  if (g.toggle) {
    const first = g.params[0];
    if (first.label !== 'Mix' || !first.key.endsWith('Mix') || first.def !== 1) {
      fail(`${where} first param must be the Mix fader (label 'Mix', key *Mix, def 1) — got "${first.label}"`);
    }
    // Every fader needs a resolution path: MIX_SCALE, a shader crossfade,
    // or neutral-fade handling — otherwise Mix 0 cannot equal absent.
    const targets = MIX_SCALE[first.key];
    if (!targets && !CROSSFADE_FADERS.has(first.key) && !NEUTRAL_FADERS.has(first.key)) {
      fail(`${where} fader ${first.key} has no resolution path (MIX_SCALE / crossfade / neutral)`);
    }
    // One fader per device: a single-target MIX_SCALE means the target is a
    // duplicate of the fader — it must fold under More… (adv).
    if (targets && targets.length === 1) {
      const dup = g.params.find((p) => p.key === targets[0]);
      if (dup && !dup.adv) {
        fail(`${where} "${dup.label}" duplicates the Dry/Wet fader and must be adv (one visible fader per device)`);
      }
    }
  }

  let sawAdv = false;
  for (const [pi, p] of g.params.entries()) {
    paramCount++;
    const pw = `${where} ${p.key}`;
    if (seenKeys.has(p.key)) fail(`${pw} duplicate key`);
    seenKeys.add(p.key);

    if (!p.hint) fail(`${pw} missing hint (tooltips are mandatory)`);
    if (pi !== 0 && BANNED_LABELS.has(p.label)) fail(`${pw} banned label "${p.label}" — use the standard vocabulary`);
    if (p.label === 'Mix' && pi !== 0) fail(`${pw} 'Mix' is reserved for the device fader`);

    if (p.adv) sawAdv = true;
    else if (sawAdv) fail(`${pw} visible param after an adv param — the More… tail must come last`);

    if (p.type === 'enum') {
      if (!p.options || !p.options.length) fail(`${pw} enum without options`);
      else if (!p.options.includes(p.def)) fail(`${pw} enum def not in options`);
    } else if (p.type === 'bool') {
      if (typeof p.def !== 'boolean') fail(`${pw} bool def must be boolean`);
    } else {
      if (!(p.min < p.max)) fail(`${pw} min must be < max`);
      if (!(p.step > 0)) fail(`${pw} step must be > 0`);
      if (p.def < p.min || p.def > p.max) fail(`${pw} def outside [min, max]`);
    }

    if (p.axis !== undefined) {
      taggedCount++;
      if (!AXES.has(p.axis)) fail(`${pw} unknown axis "${p.axis}"`);
      if (p.type) fail(`${pw} axis tags are for continuous params only`);
    }
    if (p.sweet !== undefined) {
      if (p.axis === undefined) fail(`${pw} sweet without axis`);
      if (!Array.isArray(p.sweet) || p.sweet.length !== 2
          || !Number.isFinite(p.sweet[0]) || !Number.isFinite(p.sweet[1])) {
        fail(`${pw} sweet must be [lo, hi]`);
      } else {
        if (!(p.sweet[0] < p.sweet[1])) fail(`${pw} sweet lo must be < hi`);
        if (p.sweet[0] < p.min || p.sweet[1] > p.max) fail(`${pw} sweet outside [min, max]`);
      }
    }
    if (p.axis !== undefined && p.sweet === undefined) fail(`${pw} axis without sweet`);
    if (p.weight !== undefined && !(p.weight > 0 && p.weight <= 1)) fail(`${pw} weight must be in (0, 1]`);
    if (p.dry !== undefined) {
      if (!Number.isFinite(p.dry) || p.dry < p.min || p.dry > p.max) fail(`${pw} dry outside [min, max]`);
      if (p.sweet && !(p.dry < p.sweet[1])) fail(`${pw} dry must be below sweet-hi (0 = no effect, up = more)`);
    }
  }

  const visible = g.params.filter((p) => !p.adv).length;
  if (visible > VISIBLE_BUDGET) {
    fail(`${where} ${visible} visible params (budget ${VISIBLE_BUDGET}) — fold the tail behind adv: true`);
  }
}

// The generated quartet must be viable on the default chain: every knob has
// at least one target (Energy via the pinned Audio response device, etc.).
const quartet = buildQuartet(defaultChain(), {});
for (const m of quartet) {
  if (!m.mappings.length) fail(`quartet knob "${m.name}" has no targets on the default chain`);
}

if (errors.length) {
  for (const e of errors) console.error(`FAIL ${e}`);
  console.error(`RESULT: FAIL (${errors.length} violation(s))`);
  process.exit(1);
}
console.log(`devices         : ${PARAM_GROUPS.length}`);
console.log(`params          : ${paramCount} (${taggedCount} axis-tagged)`);
console.log(`default quartet : ${quartet.map((m) => `${m.name}=${m.mappings.length}`).join(' ')}`);
console.log('RESULT: PASS');
