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
    const si = MOD_SOURCES.indexOf(k.slice(sep + 1));
    if (si < 0) continue;
    if (!sv) sv = modValues(feat);
    let sig = sv[si];
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
    this.wavePeaks = analysis.wavePeaks || [];
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
    };
  }
}
