// Loads the cached analysis and turns it into smooth, deterministic
// per-frame feature values. Smoothing is precomputed over the whole 50 fps
// analysis grid whenever the response settings change, so sample(t) is a pure
// interpolation — preview and export read identical values at identical t.

import { paramIndex, MOD_SOURCES, MOD_SEP } from './params.js';

const SMOOTHED_KEYS = ['rms', 'low', 'mid', 'high', 'onsetEnv'];

const SCHEMA = paramIndex();

// The six modulation source values for a sampled feature frame, in
// MOD_SOURCES order. 'beat' is a decaying pulse retriggered on every beat of
// the (possibly user-set) tempo grid. Pure function of the features.
export function modValues(feat) {
  return [
    feat.low, feat.mid, feat.high, feat.rms, feat.onset,
    feat.beats > 0 ? Math.exp(-feat.beatPhase * 4.5) : 0,
  ];
}

// Decaying-pulse envelope of a trigger set at time t: sum of strengthᵢ·e^-(t-tᵢ)/decay
// over triggers within ~5·decay before t, clamped 0..1. `sorted` is ascending by t.
// Pure in (sorted, decay, t) → preview == export; binary-searched window so it is
// correct at any t (seek/export), not only forward playback.
// Curve/tension for a 0..1 segment: c=0 linear, c>0 eases in (slow start),
// c<0 eases out (fast start). Pure, monotonic, maps [0,1]→[0,1].
export function shapeC(x, c) {
  if (!c) return x;
  const k = Math.exp(2.2 * c);
  return (Math.pow(k, x) - 1) / (k - 1);
}

// AD (attack→decay) pulse envelope of a trigger set at time t: each trigger rises
// 0→peak over `attack` (curve `attackCurve`), then falls peak→0 over `decay`
// (curve `decayCurve`), scaled by strengthᵢ and summed over triggers within the
// `attack+decay` window, clamped 0..1. `sorted` ascending by t; `shape` =
// {attack, attackCurve, decay, decayCurve}. Pure in (sorted, shape, t).
export function triggerEnvelope(sorted, shape, t) {
  if (!sorted || !sorted.length) return 0;
  const a = Math.max(shape.attack || 0, 0);
  const d = shape.decay > 0 ? shape.decay : 0.0001;
  const ac = shape.attackCurve || 0, dc = shape.decayCurve || 0;
  const span = a + d, cutoff = t - span;
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m].t < cutoff) lo = m + 1; else hi = m; }
  let v = 0;
  for (let i = lo; i < sorted.length; i++) {
    const tau = t - sorted[i].t;
    if (tau < 0) break;       // trigger is in the future
    if (tau >= span) continue; // pulse already ended
    const e = (a > 0 && tau < a)
      ? shapeC(tau / a, ac)                  // rise
      : shapeC(1 - (tau - a) / d, dc);       // fall
    v += sorted[i].s * e;
  }
  return v > 1 ? 1 : v;
}

// Per-parameter modulation: every `target~src` depth key in `p` adds
// depth × signal × (param range) to its target, clamped to the schema range.
// Optional per-depth config keys shape the signal first:
//   `target~src@th`   threshold 0..0.95 — signal must exceed it
//   `target~src@gate` 0/1 — gate mode: full signal above the threshold,
//                     none below (vs. the default re-scaled ramp)
// Pure function of (p, feat) — preview and export read identically.
export function applyModulation(p, feat) {
  // Master Reactivity: one knob scaling every depth (0 = static picture).
  const react = p.audReact === undefined ? 1 : p.audReact;
  if (react <= 0) return p;
  let out = null;
  let sv = null;
  for (const k in p) {
    const sep = k.indexOf(MOD_SEP);
    if (sep < 0 || k.indexOf('@') >= 0) continue; // skip config keys
    const depth = p[k] * react;
    if (!depth) continue;
    const s = SCHEMA[k.slice(0, sep)];
    if (!s || s.type) continue; // continuous targets only
    const src = k.slice(sep + 1);
    let sig;
    if (src.startsWith('trg:')) {
      sig = (feat.trg && feat.trg[src.slice(4)]) || 0;
    } else {
      const si = MOD_SOURCES.indexOf(src);
      if (si < 0) continue;
      if (!sv) sv = modValues(feat);
      sig = sv[si];
    }
    const th = p[`${k}@th`];
    if (th > 0) {
      sig = p[`${k}@gate`]
        ? (sig >= th ? 1 : 0)
        : Math.max(0, (sig - th) / (1 - th));
    }
    if (!sig) continue;
    if (!out) out = { ...p };
    const v = out[s.key] + depth * sig * (s.max - s.min);
    out[s.key] = Math.min(Math.max(v, s.min), s.max);
  }
  return out || p;
}

// Pure selectivity filter over a band's stored trigger candidates ([[t, s]]).
// selectivity 0..1 raises the strength threshold (0 keeps most, 1 keeps only the
// strongest); a 60 ms minimum gap drops near-coincident weaker candidates.
export function detectTriggers(candidateList, selectivity) {
  if (!Array.isArray(candidateList) || candidateList.length === 0) return [];
  const thr = 0.08 + 0.82 * Math.min(Math.max(selectivity, 0), 1);
  const kept = candidateList
    .filter((c) => c[1] >= thr)
    .map((c) => ({ t: c[0], s: c[1] }))
    .sort((a, b) => a.t - b.t);
  const out = [];
  for (const c of kept) {
    const prev = out[out.length - 1];
    if (prev && c.t - prev.t < 0.06) {
      if (c.s > prev.s) out[out.length - 1] = c; // keep the stronger
    } else {
      out.push(c);
    }
  }
  return out;
}

// Reactive triggers: resolve a set's markers from the auto+pinned model.
// auto = detected from band+selectivity (selectivity == null ⇒ auto OFF);
// minus suppressions; plus pins (pins win on collision). dynamics 'uniform'
// forces strength 1. Returns sorted [{t, s, pinned}] — pure, audio-locked.
const TRG_EPS = 0.04;
export function resolveTriggers(set, bank) {
  if (!set) return [];
  const cands = (bank && bank.triggerCandidates) ? (bank.triggerCandidates[set.band] || []) : [];
  const auto = (set.selectivity == null) ? [] : detectTriggers(cands, set.selectivity);
  const suppress = set.suppress || [];
  const pins = set.pins || [];
  const keptAuto = auto.filter((a) =>
    !suppress.some((sp) => Math.abs(sp - a.t) < TRG_EPS)
    && !pins.some((p) => Math.abs(p.t - a.t) < TRG_EPS));
  const merged = [
    ...keptAuto.map((a) => ({ t: a.t, s: a.s, pinned: false })),
    ...pins.map((p) => ({ t: p.t, s: Math.min(Math.max(p.s, 0), 1), pinned: true })),
  ].sort((a, b) => a.t - b.t);
  if (set.dynamics === 'uniform') for (const m of merged) m.s = 1;
  return merged;
}

// Percentile normalization matching the backend's _norm01 (5th/97th pct).
function norm01(arr) {
  const sorted = Float32Array.from(arr).sort();
  const lo = sorted[Math.floor(0.05 * (sorted.length - 1))];
  const hi = sorted[Math.floor(0.97 * (sorted.length - 1))];
  const span = hi - lo;
  const out = new Float32Array(arr.length);
  if (span < 1e-9) return out;
  for (let i = 0; i < arr.length; i++) {
    out[i] = Math.min(Math.max((arr[i] - lo) / span, 0), 1);
  }
  return out;
}

export class FeatureBank {
  constructor(analysis) {
    this.raw = {};
    for (const key of SMOOTHED_KEYS) this.raw[key] = Float32Array.from(analysis[key]);
    // analysis v3 multiband set: lets the user move the low/mid/high
    // crossovers without re-analysis (v2 files fall back to fixed bands)
    this.bands = Array.isArray(analysis.bands)
      ? analysis.bands.map((b) => Float32Array.from(b))
      : null;
    this.bandEdges = analysis.bandEdges || null;
    this.frameRate = analysis.frameRate;
    this.frames = analysis.frames;
    this.duration = analysis.duration;
    this.tempo = analysis.tempo || 0;
    this.beatOffset = analysis.beatOffset || 0;
    this.audioStart = analysis.audioStart || 0;  // leading-silence boundary
    this.onsets = analysis.onsets || [];
    this.sections = analysis.sections || [0];
    this.triggerCandidates = analysis.triggers || {};
    this.triggerSources = []; // Slice 2: [{id, triggers:[{t,s}] sorted, decay}]
    this.smoothed = {};
    this._b16 = new Float32Array(16); // reused per sample() — Spectrum feed
    this.setResponse({});
  }

  // Override the detected tempo grid (user-entered BPM / downbeat). Drives
  // beatPhase/beats in sample(), i.e. the 'beat' source and hue beat-steps.
  setTempo(bpm, offset) {
    this.tempo = bpm > 0 ? bpm : 0;
    this.beatOffset = offset || 0;
  }

  // Slice 2 / shape: active trigger sets as modulation sources (sorted triggers +
  // AD pulse shape). Accepts `s.shape`, else builds one from a bare `s.decay`.
  setTriggerSources(sources) {
    this.triggerSources = (Array.isArray(sources) ? sources : []).map((s) => ({
      id: s.id,
      shape: s.shape || { attack: 0, attackCurve: 0, decay: s.decay > 0 ? s.decay : 0.18, decayCurve: 0 },
      triggers: (s.triggers || []).slice().sort((a, b) => a.t - b.t),
    }));
  }

  _sampleTriggers(t) {
    const out = {};
    for (const src of this.triggerSources) out[src.id] = triggerEnvelope(src.triggers, src.shape, t);
    return out;
  }

  // Derive low/mid/high from the multiband set for the given crossovers:
  // average the member bands (each already percentile-normalized), then
  // re-normalize. Pure function of (cached analysis, crossovers).
  _deriveBands(lowMidHz, midHighHz) {
    if (!this.bands || !this.bandEdges) return; // pre-v3 analysis: fixed bands
    const e = this.bandEdges;
    const centers = [];
    for (let i = 0; i < this.bands.length; i++) {
      centers.push(Math.sqrt(e[i] * e[i + 1]));
    }
    const hiX = Math.max(midHighHz, lowMidHz * 1.25); // keep crossovers ordered
    const derive = (f1, f2) => {
      let members = [];
      for (let i = 0; i < centers.length; i++) {
        if (centers[i] >= f1 && centers[i] < f2) members.push(i);
      }
      if (!members.length) {
        // empty range: take the band nearest the range centre
        const fc = Math.sqrt(Math.max(f1, 1) * f2);
        let best = 0;
        for (let i = 1; i < centers.length; i++) {
          if (Math.abs(Math.log(centers[i] / fc)) < Math.abs(Math.log(centers[best] / fc))) best = i;
        }
        members = [best];
      }
      const out = new Float32Array(this.frames);
      for (const bi of members) {
        const band = this.bands[bi];
        for (let i = 0; i < out.length; i++) out[i] += band[i];
      }
      for (let i = 0; i < out.length; i++) out[i] /= members.length;
      return norm01(out);
    };
    this.raw.low = derive(0, lowMidHz);
    this.raw.mid = derive(lowMidHz, hiX);
    this.raw.high = derive(hiX, 1e9);
  }

  setResponse({
    gain = 1, attackMs = 60, releaseMs = 320, gamma = 1, flashLimit = true,
    lowMidHz = 160, midHighHz = 2000,
  }) {
    this._deriveBands(lowMidHz, midHighHz);
    const fr = this.frameRate;
    const ka = attackMs <= 0 ? 1 : 1 - Math.exp(-1000 / (attackMs * fr));
    const kr = releaseMs <= 0 ? 1 : 1 - Math.exp(-1000 / (releaseMs * fr));
    for (const key of SMOOTHED_KEYS) {
      const raw = this.raw[key];
      const out = new Float32Array(raw.length);
      let prev = 0;
      for (let i = 0; i < raw.length; i++) {
        let v = Math.min(raw[i] * gain, 1.5);
        v = Math.pow(Math.max(v, 0), gamma);
        prev += (v - prev) * (v > prev ? ka : kr);
        out[i] = prev;
      }
      this.smoothed[key] = out;
    }
    if (flashLimit) {
      // Photosensitivity guard: cap flash-driving envelopes to <= 3 rises/sec.
      // After an envelope crosses 0.5 upward, further crossings are clamped
      // for a 1/3 s refractory window.
      for (const key of ['onsetEnv', 'high']) {
        const env = this.smoothed[key];
        const refractory = Math.round(fr / 3);
        let lastFlash = -refractory;
        let below = true;
        for (let i = 0; i < env.length; i++) {
          if (env[i] >= 0.5) {
            if (below && i - lastFlash < refractory) {
              env[i] = 0.499;
              continue;
            }
            if (below) lastFlash = i;
            below = false;
          } else {
            below = true;
          }
        }
      }
    }
  }

  _lerp(arr, t) {
    const x = t * this.frameRate;
    const i = Math.floor(x);
    if (i < 0) return arr[0] ?? 0;
    if (i >= arr.length - 1) return arr[arr.length - 1] ?? 0;
    const f = x - i;
    return arr[i] * (1 - f) + arr[i + 1] * f;
  }

  sectionIndex(t) {
    let idx = 0;
    for (let i = 0; i < this.sections.length; i++) {
      if (this.sections[i] <= t) idx = i;
      else break;
    }
    return idx;
  }

  sample(t) {
    const s = this.smoothed;
    let beats = 0;
    let beatPhase = 0;
    if (this.tempo > 0) {
      beats = Math.max(0, (t - this.beatOffset) * this.tempo / 60);
      beatPhase = beats - Math.floor(beats);
    }
    // raw multiband set for the Spectrum generator (zeros on pre-v3 analysis)
    if (this.bands) {
      const nb = Math.min(this.bands.length, 16);
      for (let i = 0; i < nb; i++) this._b16[i] = this._lerp(this.bands[i], t);
    }
    return {
      low: this._lerp(s.low, t),
      mid: this._lerp(s.mid, t),
      high: this._lerp(s.high, t),
      rms: this._lerp(s.rms, t),
      onset: this._lerp(s.onsetEnv, t),
      beats,
      beatPhase,
      section: this.sectionIndex(t),
      bands16: this._b16,
      trg: this._sampleTriggers(t),
    };
  }
}
