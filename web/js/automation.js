// Ableton-style parameter automation — pure model, no DOM.
//
// Lanes are breakpoint envelopes stored in *beats* (not seconds), so curves
// stay glued to the bars if the user corrects the BPM. Continuous params
// interpolate linearly between points; enum params hold the previous value
// (stepped), like drawing clip envelopes on a quantized grid in Live.
//
// Determinism: valueAt() is a pure function of (lane, beats), and beats is a
// pure function of t via TempoMap — so automation is pixel-identical between
// preview and export, same as everything else in the pipeline.

export class TempoMap {
  constructor(bpm = 120, beatsPerBar = 4, offset = 0) {
    this.bpm = bpm;
    this.beatsPerBar = beatsPerBar;
    this.offset = offset; // seconds at which bar 1 / beat 0 lands
  }

  beatsAt(t) {
    return ((t - this.offset) * this.bpm) / 60;
  }

  timeAt(beats) {
    return this.offset + (beats * 60) / this.bpm;
  }

  toJSON() {
    return { bpm: this.bpm, beatsPerBar: this.beatsPerBar, offset: this.offset };
  }
}

// Snap divisions in beats; 'bar' resolves via beatsPerBar, 'off' disables.
const SNAP_BEATS = { beat: 1, half: 0.5, quarter: 0.25 };

export function snapBeats(beats, snap, beatsPerBar) {
  const div = snap === 'bar' ? beatsPerBar : SNAP_BEATS[snap];
  if (!div) return beats;
  return Math.round(beats / div) * div;
}

const EPS = 1e-4;

// Segment shaping: a quadratic Bézier from (0,0) to (1,1) whose control
// point (h, k) is the draggable apex. k = (c+1)/2 bends the curve; h skews
// the turning point left/right (apex near the left point = fast attack,
// near the right = late turn). Both x'(t) and y'(t) are linear in t with
// non-negative endpoints for h, k in [0,1], so the curve is monotone and
// never overshoots. h = 0.5 collapses to v(f) = f² + 2k·f(1−f); c = 0 and
// h = 0.5 is exactly linear.
export function shapeSegment(f, c, h = 0.5) {
  const skewed = Math.abs(h - 0.5) >= 1e-4;
  if (!c && !skewed) return f;
  const k = (Math.min(Math.max(c || 0, -1), 1) + 1) / 2;
  let t;
  if (!skewed) {
    t = f; // x(t) = t when the control x is centred
  } else {
    // solve x(t) = 2t(1−t)h + t² = f  for t
    const A = 1 - 2 * h;
    t = (-h + Math.sqrt(Math.max(h * h + A * f, 0))) / A;
  }
  return t * t + 2 * k * t * (1 - t);
}

export class AutomationSet {
  // schemaIndex: key -> {min, max, step, type, options, label, automatable}
  constructor(schemaIndex) {
    this.schema = schemaIndex;
    this.lanes = new Map(); // key -> {points: [{b, v}] sorted by b, enabled}
  }

  hasLanes() {
    for (const lane of this.lanes.values()) {
      if (lane.enabled && lane.points.length) return true;
    }
    return false;
  }

  lane(key) {
    return this.lanes.get(key);
  }

  isAutomated(key) {
    const lane = this.lanes.get(key);
    return !!(lane && lane.points.length);
  }

  isEnabled(key) {
    const lane = this.lanes.get(key);
    return !!(lane && lane.enabled);
  }

  setEnabled(key, on) {
    const lane = this.lanes.get(key);
    if (lane) lane.enabled = on;
  }

  clear(key) {
    this.lanes.delete(key);
  }

  clampValue(key, v) {
    const s = this.schema[key];
    if (!s) return v;
    if (s.type === 'enum') return Math.min(Math.max(v, 0), s.options.length - 1);
    if (s.type === 'bool') return Math.min(Math.max(v, 0), 1);
    return Math.min(Math.max(v, s.min), s.max);
  }

  // Insert (or replace a coincident) point; returns its index.
  addPoint(key, b, v) {
    let lane = this.lanes.get(key);
    if (!lane) {
      lane = { points: [], enabled: true };
      this.lanes.set(key, lane);
    }
    b = Math.max(b, 0);
    v = this.clampValue(key, v);
    const pts = lane.points;
    const existing = pts.findIndex((p) => Math.abs(p.b - b) < EPS);
    if (existing >= 0) {
      pts[existing].v = v;
      return existing;
    }
    let i = 0;
    while (i < pts.length && pts[i].b < b) i++;
    pts.splice(i, 0, { b, v });
    return i;
  }

  // Move a point to (b, v), clamped between its neighbours (Live-style: a
  // drag can never cross — or silently swallow — another point).
  movePoint(key, index, b, v) {
    const lane = this.lanes.get(key);
    if (!lane || !lane.points[index]) return index;
    const pts = lane.points;
    const prev = pts[index - 1];
    const next = pts[index + 1];
    if (prev) b = Math.max(b, prev.b + EPS * 2);
    if (next) b = Math.min(b, next.b - EPS * 2);
    pts[index].b = Math.max(b, 0);
    pts[index].v = this.clampValue(key, v);
    return index;
  }

  deletePoint(key, index) {
    const lane = this.lanes.get(key);
    if (!lane) return;
    lane.points.splice(index, 1);
    if (!lane.points.length) this.lanes.delete(key);
  }

  // Delete every breakpoint in the beats range [startB, endB] (inclusive).
  deleteRange(key, startB, endB) {
    const lane = this.lanes.get(key);
    if (!lane) return;
    const lo = Math.min(startB, endB) - EPS;
    const hi = Math.max(startB, endB) + EPS;
    lane.points = lane.points.filter((p) => p.b < lo || p.b > hi);
    if (!lane.points.length) this.lanes.delete(key);
  }

  // ----------------------------------------------- R14-P3: copy / paste clips
  // Clips are plain, serialisable snapshots of breakpoints (beats + value +
  // optional curve). A *range* clip stores beats relative to the selection
  // start (anchor 0) so it can be re-anchored anywhere; a *lane* clip keeps
  // absolute beats so a whole lane reproduces at the same musical positions on
  // another parameter. All paste paths clamp values to the target's range, so
  // copying between params of different ranges stays in-bounds — and the result
  // is still a pure function of (lane, beats), so determinism holds.

  _clipPoint(p, anchorB) {
    const o = { b: +(p.b - anchorB).toFixed(6), v: p.v };
    if (p.c) o.c = p.c;
    if (p.h !== undefined) o.h = p.h;
    return o;
  }

  // Breakpoints within [startB, endB], beats relative to the range start.
  copyRange(key, startB, endB) {
    const lane = this.lanes.get(key);
    if (!lane) return null;
    const lo = Math.min(startB, endB);
    const hi = Math.max(startB, endB);
    const s = this.schema[key] || {};
    const points = lane.points
      .filter((p) => p.b >= lo - EPS && p.b <= hi + EPS)
      .map((p) => this._clipPoint(p, lo));
    if (!points.length) return null;
    return { kind: 'range', srcKey: key, srcType: s.type || 'num', length: hi - lo, points };
  }

  // The whole lane, beats made relative to the first point.
  copyLane(key) {
    const lane = this.lanes.get(key);
    if (!lane || !lane.points.length) return null;
    const s = this.schema[key] || {};
    const anchor = lane.points[0].b;
    const points = lane.points.map((p) => this._clipPoint(p, anchor));
    return { kind: 'lane', srcKey: key, srcType: s.type || 'num', anchorB: anchor, points };
  }

  // Splice a clip's points onto `key` anchored at beat `atB`, overwriting any
  // existing points in the pasted span. Values clamp to the target's range.
  pasteRange(key, clip, atB) {
    if (!clip || !clip.points.length) return;
    let lane = this.lanes.get(key);
    if (!lane) { lane = { points: [], enabled: true }; this.lanes.set(key, lane); }
    const lo = Math.max(atB, 0);
    const span = clip.length !== undefined
      ? clip.length : clip.points[clip.points.length - 1].b;
    const hi = lo + span;
    lane.points = lane.points.filter((p) => p.b < lo - EPS || p.b > hi + EPS);
    for (const cp of clip.points) {
      const i = this.addPoint(key, lo + cp.b, cp.v);
      const pt = lane.points[i];
      if (cp.c) pt.c = Math.min(Math.max(cp.c, -1), 1); else delete pt.c;
      if (cp.h !== undefined) pt.h = Math.min(Math.max(cp.h, 0), 1); else delete pt.h;
    }
    lane.enabled = true;
  }

  // Replace lane `key` entirely with a lane clip, re-anchored to its original
  // first-point beat. Values clamp to the target's range.
  pasteLane(key, clip) {
    if (!clip || !clip.points.length) return;
    const anchor = clip.anchorB || 0;
    const points = clip.points
      .map((p) => {
        const pt = { b: Math.max(anchor + p.b, 0), v: this.clampValue(key, p.v) };
        if (p.c) pt.c = Math.min(Math.max(p.c, -1), 1);
        if (p.h !== undefined) pt.h = Math.min(Math.max(p.h, 0), 1);
        return pt;
      })
      .sort((a, z) => a.b - z.b);
    this.lanes.set(key, { points, enabled: true });
  }

  // Set the curvature (and optional apex skew h) of the segment starting at
  // point `index`. Near-neutral values are dropped to keep storage sparse.
  setCurve(key, index, c, h) {
    const lane = this.lanes.get(key);
    if (!lane || !lane.points[index]) return;
    c = Math.min(Math.max(c, -1), 1);
    if (Math.abs(c) < 0.02) delete lane.points[index].c;
    else lane.points[index].c = c;
    if (h !== undefined) {
      h = Math.min(Math.max(h, 0), 1);
      if (Math.abs(h - 0.5) < 0.02) delete lane.points[index].h;
      else lane.points[index].h = h;
    }
  }

  // Envelope value at a beat position (undefined if no lane/points).
  valueAt(key, beats) {
    const lane = this.lanes.get(key);
    if (!lane || !lane.points.length) return undefined;
    const pts = lane.points;
    if (beats <= pts[0].b) return pts[0].v;
    const last = pts[pts.length - 1];
    if (beats >= last.b) return last.v;
    let lo = 0;
    let hi = pts.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].b <= beats) lo = mid;
      else hi = mid;
    }
    const a = pts[lo];
    const z = pts[hi];
    const s = this.schema[key];
    if (s && (s.type === 'enum' || s.type === 'bool')) return a.v; // stepped hold
    const f = (beats - a.b) / Math.max(z.b - a.b, EPS);
    return a.v + (z.v - a.v) * shapeSegment(f, a.c, a.h === undefined ? 0.5 : a.h);
  }

  // Effective params: base + enabled lanes evaluated at `beats`.
  apply(base, beats) {
    if (!this.hasLanes()) return base;
    const out = { ...base };
    for (const [key, lane] of this.lanes) {
      if (!lane.enabled || !lane.points.length) continue;
      const v = this.valueAt(key, beats);
      const s = this.schema[key];
      if (s && s.type === 'enum') {
        out[key] = s.options[Math.round(this.clampValue(key, v))];
      } else if (s && s.type === 'bool') {
        out[key] = v >= 0.5;
      } else if (s && s.step >= 1) {
        out[key] = Math.round(v);
      } else {
        out[key] = v;
      }
    }
    return out;
  }

  toJSON() {
    const obj = {};
    for (const [key, lane] of this.lanes) {
      obj[key] = {
        enabled: lane.enabled,
        points: lane.points.map((p) => {
          const o = { b: +p.b.toFixed(4), v: +p.v.toFixed(4) };
          if (p.c) o.c = +p.c.toFixed(3);              // bend, only when bent
          if (p.h !== undefined) o.h = +p.h.toFixed(3); // apex skew, when off-centre
          return o;
        }),
      };
    }
    return obj;
  }

  // Replace all lanes from a plain object (validating against the schema).
  load(obj) {
    this.lanes.clear();
    if (!obj) return;
    for (const [key, lane] of Object.entries(obj)) {
      if (!this.schema[key] || !this.schema[key].automatable) continue;
      if (!Array.isArray(lane.points) || !lane.points.length) continue;
      const pts = lane.points
        .filter((p) => Number.isFinite(p.b) && Number.isFinite(p.v))
        .map((p) => {
          const pt = { b: Math.max(p.b, 0), v: this.clampValue(key, p.v) };
          if (Number.isFinite(p.c) && p.c) pt.c = Math.min(Math.max(p.c, -1), 1);
          if (Number.isFinite(p.h) && Math.abs(p.h - 0.5) >= 0.02) {
            pt.h = Math.min(Math.max(p.h, 0), 1);
          }
          return pt;
        })
        .sort((a, z) => a.b - z.b);
      if (pts.length) this.lanes.set(key, { points: pts, enabled: lane.enabled !== false });
    }
  }
}
