// Timeline: waveform + onsets + sections + playhead, with
//  * horizontal zoom (wheel) and pan (shift+wheel)
//  * a bar/beat grid driven by the TempoMap (BPM, beats/bar, downbeat)
//  * an Ableton-style envelope lane editor for parameter automation:
//    click/drag to add and move breakpoints (snapped to the grid, Alt
//    bypasses), right-click or double-click to delete. Enum lanes edit as
//    stepped levels. When a lane is open the top ruler strip still scrubs.

import { snapBeats, shapeSegment } from './automation.js';

const RULER_H = 26;   // css px (top band: loop brace · bottom: bars/markers)
const LOOP_BAND = 9;  // css px — the brace strip at the top of the ruler
const HIT_R = 9;      // css px point hit radius

export class Timeline {
  constructor(canvas, {
    onSeek, onLaneEdit = () => {}, onLaneCommit = () => {}, getBaseValue = () => 0,
    onTempoChange = () => {}, onArrange = () => {},
    onMarkerMenu = () => {}, onRulerMenu = () => {}, onLaneMenu = () => {},
    onTriggerEdit = () => {}, onTriggerCommit = () => {},
  }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onSeek = onSeek;
    this.onLaneEdit = onLaneEdit;
    this.onLaneCommit = onLaneCommit; // end of a gesture — undo checkpoint
    this.onTempoChange = onTempoChange; // (committed) — bar-1 flag drags
    this.onArrange = onArrange;       // (committed) — loop/marker edits
    this.onMarkerMenu = onMarkerMenu; // (index, event)
    this.onRulerMenu = onRulerMenu;   // (beat, event)
    this.onLaneMenu = onLaneMenu;     // (event) — right-click empty lane area
    this.onTriggerEdit = onTriggerEdit;   // Slice 3: live edit (refresh, no checkpoint)
    this.onTriggerCommit = onTriggerCommit; // Slice 3: gesture end — undo checkpoint
    this.getBaseValue = getBaseValue;
    this.editSet = null;              // Slice 3: trigger set open for editing

    this.bank = null;
    this.tempo = null;       // TempoMap (set by main)
    this.automation = null;  // AutomationSet (set by main)
    this.loop = null;        // {startB, endB, on} (set by main, beats domain)
    this.markers = null;     // [{b, name}] (set by main, beats domain)
    this.laneKey = null;     // open lane param key
    this.snap = 'beat';
    // R14-P1: 'move' (default) navigates/selects, 'draw' adds breakpoints.
    this.mode = 'move';
    this.selection = null;   // {startB, endB} beats-domain marquee, or null
    // R14 follow-up: auto-scroll when a drag reaches the view's left/right edge.
    this._edgeDir = 0;       // -1 left, +1 right, 0 off
    this._edgeRAF = 0;       // requestAnimationFrame id while edge-scrolling
    this._dragEvt = null;    // last pointer event of the active drag

    this.time = 0;
    this.duration = 0;
    this.viewStart = 0;      // seconds at the left edge
    this.wave = null;        // WaveformPeaks (set by main when audio decodes)
    this.triggerSets = [];   // Slice 1b: [{color, triggers:[{t,s}]}] shown overlays
    this.pxPerSec = 0;       // css px per second; 0 = fit whole song
    this.drag = null;

    canvas.addEventListener('pointerdown', (e) => this._down(e));
    canvas.addEventListener('pointermove', (e) => this._move(e));
    canvas.addEventListener('pointerup', (e) => this._up(e));
    canvas.addEventListener('dblclick', (e) => {
      const { x, y } = this._local(e);
      if (this.bank && y < RULER_H * this.dpr) this._rulerDblClick(x, y);
      else this._deleteAt(e);
    });
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const { x, y } = this._local(e);
      if (this.bank && y < RULER_H * this.dpr) {
        const mi = this._hitMarker(x);
        if (mi >= 0) this.onMarkerMenu(mi, e);
        else this.onRulerMenu(this._eventBeat(x, e.altKey), e);
        return;
      }
      // In an open lane: right-click on a point/handle deletes it (quick
      // gesture); right-click on empty lane area opens the copy/paste menu.
      if (this.laneKey) {
        if (this._hitPoint(x, y) >= 0 || this._hitCurveHandle(x, y) >= 0) {
          this._deleteAt(e);
        } else {
          this.onLaneMenu(e);
        }
        return;
      }
      this._deleteAt(e);
    });
    canvas.addEventListener('wheel', (e) => this._wheel(e), { passive: false });

    new ResizeObserver(() => this.resize()).observe(canvas.parentElement || canvas);
    this.resize();
  }

  // ------------------------------------------------------------ geometry

  get dpr() {
    return window.devicePixelRatio || 1;
  }

  _fitPps() {
    return this.duration > 0 ? this.canvas.width / this.duration : 1;
  }

  _pps() {
    // device px per second
    return this.pxPerSec > 0 ? this.pxPerSec * this.dpr : this._fitPps();
  }

  _viewSeconds() {
    return this.canvas.width / this._pps();
  }

  xOf(t) {
    return (t - this.viewStart) * this._pps();
  }

  tOf(x) {
    return this.viewStart + x / this._pps();
  }

  _clampView() {
    const max = Math.max(this.duration - this._viewSeconds(), 0);
    this.viewStart = Math.min(Math.max(this.viewStart, 0), max);
  }

  _local(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * this.dpr,
      y: (e.clientY - rect.top) * this.dpr,
    };
  }

  _laneArea() {
    const top = (RULER_H + 7) * this.dpr;
    const bottom = this.canvas.height - 7 * this.dpr;
    return { top, bottom };
  }

  // Slice 3: strength 0..1 <-> y within the lane band.
  _editYofS(s) { const { top, bottom } = this._laneArea(); return bottom - Math.min(Math.max(s, 0), 1) * (bottom - top); }
  _editSofY(y) { const { top, bottom } = this._laneArea(); return Math.min(Math.max((bottom - y) / (bottom - top), 0), 1); }

  // Hit-test the edited set's triggers (index, or -1).
  _hitEditTrigger(x, y) {
    if (!this.editSet) return -1;
    const { top, bottom } = this._laneArea();
    if (y < top || y > bottom) return -1;
    const r = HIT_R * this.dpr;
    let best = -1, bestD = r;
    const trg = this.editSet.triggers;
    for (let i = 0; i < trg.length; i++) {
      const d = Math.abs(this.xOf(trg[i].t) - x);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  _drawEditTriggers(w, h, dpr) {
    const { ctx } = this;
    const { top, bottom } = this._laneArea();
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(0, top, w, bottom - top);
    for (const trg of this.editSet.triggers) {
      const x = this.xOf(trg.t);
      if (x < -4 || x > w + 4) continue;
      const yTop = this._editYofS(trg.s);
      ctx.fillStyle = this.editSet.color;
      ctx.fillRect(x - dpr, yTop, 2 * dpr, bottom - yTop);
      ctx.beginPath();
      ctx.arc(x, yTop, 3.5 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _laneRange() {
    const s = this.automation.schema[this.laneKey];
    if (s.type === 'enum') return { min: 0, max: s.options.length - 1, schema: s };
    if (s.type === 'bool') return { min: 0, max: 1, schema: s };
    return { min: s.min, max: s.max, schema: s };
  }

  _isDiscrete(s) {
    return s.type === 'enum' || s.type === 'bool';
  }

  yOf(v) {
    const { top, bottom } = this._laneArea();
    const { min, max } = this._laneRange();
    const norm = (v - min) / Math.max(max - min, 1e-9);
    return bottom - norm * (bottom - top);
  }

  vOf(y) {
    const { top, bottom } = this._laneArea();
    const { min, max } = this._laneRange();
    const norm = (bottom - y) / Math.max(bottom - top, 1);
    const v = min + Math.min(Math.max(norm, 0), 1) * (max - min);
    const s = this._laneRange().schema;
    return this._isDiscrete(s) ? Math.round(v) : v;
  }

  // ---------------------------------------------------------- public API

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this._clampView();
    this.draw();
  }

  setBank(bank) {
    this.bank = bank;
    this.duration = bank ? bank.duration : 0;
    this.viewStart = 0;
    this.pxPerSec = 0;
    this.editSet = null;
    this.draw();
  }

  // Slice 3: open a trigger set for editing (mutually exclusive with a lane).
  editTriggers(set) {
    this.laneKey = null;
    this.editSet = set || null;
    this.draw();
  }

  setWaveform(wave) {
    this.wave = wave;
    this.draw();
  }

  setTriggerSets(sets) {
    this.triggerSets = Array.isArray(sets) ? sets : [];
    this.draw();
  }

  setTime(t, playing = false) {
    this.time = t;
    if (playing && this.pxPerSec > 0) {
      const x = this.xOf(t);
      if (x > this.canvas.width * 0.98 || x < 0) {
        this.viewStart = t - this._viewSeconds() * 0.02;
        this._clampView();
      }
    }
    this.draw();
  }

  openLane(key) {
    this.laneKey = key;
    this.editSet = null;
    this.draw();
  }

  closeLane() {
    this.laneKey = null;
    this.editSet = null;
    this.drag = null;
    this.selection = null;
    this.draw();
  }

  // ----------------------------------------------- R14-P1/P2: mode + view

  setMode(mode) {
    this.mode = mode === 'draw' ? 'draw' : 'move';
    this.canvas.style.cursor = this.mode === 'draw' ? 'crosshair' : 'default';
    this.draw();
  }

  getSelection() {
    return this.selection && this.selection.endB - this.selection.startB > 1e-4
      ? this.selection : null;
  }

  clearSelection() {
    this.selection = null;
    this.draw();
  }

  // Zoom out so the whole song fits (pxPerSec 0 = fit-to-width).
  zoomToFit() {
    this.pxPerSec = 0;
    this.viewStart = 0;
    this.draw();
  }

  // Pan the view so time `t` is on-screen (used by keyboard jumps when paused).
  revealTime(t) {
    if (this.pxPerSec > 0) {
      const x = this.xOf(t);
      if (x < 0 || x > this.canvas.width) {
        this.viewStart = t - this._viewSeconds() * 0.5;
        this._clampView();
      }
    }
    this.draw();
  }

  // -------------------------------------------------------- interaction

  _seekFrom(x) {
    if (!this.bank) return;
    this.onSeek(Math.min(Math.max(this.tOf(x), 0), this.duration));
  }

  _hitPoint(x, y) {
    if (!this.laneKey || !this.automation) return -1;
    const lane = this.automation.lane(this.laneKey);
    if (!lane) return -1;
    const r = HIT_R * this.dpr;
    let best = -1;
    let bestD = r;
    for (let i = 0; i < lane.points.length; i++) {
      const p = lane.points[i];
      const px = this.xOf(this.tempo.timeAt(p.b));
      const py = this.yOf(p.v);
      const d = Math.hypot(px - x, py - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  // Apex handle position of the segment starting at point `index` — the
  // Bézier curve point at t = 0.5, i.e. (0.25 + h/2, 0.25 + k/2) in segment
  // space (null when the lane is discrete or the segment is too short).
  _segmentHandle(index) {
    const lane = this.automation.lane(this.laneKey);
    if (!lane) return null;
    const a = lane.points[index];
    const z = lane.points[index + 1];
    if (!a || !z) return null;
    const xa = this.xOf(this.tempo.timeAt(a.b));
    const xz = this.xOf(this.tempo.timeAt(z.b));
    if (xz - xa < 16 * this.dpr) return null;
    const h = a.h === undefined ? 0.5 : a.h;
    const k = ((a.c || 0) + 1) / 2;
    const bm = a.b + (z.b - a.b) * (0.25 + h / 2);
    const vm = a.v + (z.v - a.v) * (0.25 + k / 2);
    return { x: this.xOf(this.tempo.timeAt(bm)), y: this.yOf(vm) };
  }

  _hitCurveHandle(x, y) {
    if (!this.laneKey || !this.automation) return -1;
    const s = this._laneRange().schema;
    if (this._isDiscrete(s)) return -1;
    const lane = this.automation.lane(this.laneKey);
    if (!lane) return -1;
    const r = HIT_R * this.dpr;
    for (let i = 0; i + 1 < lane.points.length; i++) {
      const m = this._segmentHandle(i);
      if (m && Math.hypot(m.x - x, m.y - y) < r) return i;
    }
    return -1;
  }

  _eventBeat(x, alt) {
    let b = this.tempo.beatsAt(this.tOf(x));
    if (!alt) b = snapBeats(b, this.snap, this.tempo.beatsPerBar);
    const maxB = this.tempo.beatsAt(this.duration);
    return Math.min(Math.max(b, 0), Math.max(maxB, 0));
  }

  // Slice 3: pointer x -> trigger time in seconds (grid-snapped unless Alt /
  // no tempo). Works without a tempo map (raw, clamped).
  _snappedTime(x, alt) {
    let t = this.tOf(x);
    if (this.tempo && !alt) {
      const b = snapBeats(this.tempo.beatsAt(t), this.snap, this.tempo.beatsPerBar);
      t = this.tempo.timeAt(b);
    }
    return Math.min(Math.max(t, 0), this.duration || 0);
  }

  _flagX() {
    return this.tempo ? this.xOf(this.tempo.offset) : -1e9;
  }

  _loopValid() {
    return !!(this.loop && this.loop.endB > this.loop.startB + 1e-6);
  }

  _hitMarker(x) {
    if (!this.markers || !this.tempo) return -1;
    let best = -1;
    let bestD = 8 * this.dpr;
    for (let i = 0; i < this.markers.length; i++) {
      const d = Math.abs(this.xOf(this.tempo.timeAt(this.markers[i].b)) - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  _rulerDblClick(x, y) {
    if (!this.tempo) return;
    const dpr = this.dpr;
    // double-click the brace toggles looping
    if (y < LOOP_BAND * dpr && this._loopValid()) {
      const x0 = this.xOf(this.tempo.timeAt(this.loop.startB));
      const x1 = this.xOf(this.tempo.timeAt(this.loop.endB));
      if (x >= x0 - 6 * dpr && x <= x1 + 6 * dpr) {
        this.loop.on = !this.loop.on;
        this.onArrange(true);
        this.draw();
        return;
      }
    }
    // on a marker: leave it alone (right-click opens its menu)
    if (this._hitMarker(x) >= 0) return;
    // double-click empty ruler: create a marker at the snapped beat
    if (this.markers) {
      const b = this._eventBeat(x, false);
      this.markers.push({ b, name: `M${this.markers.length + 1}` });
      this.markers.sort((a, z) => a.b - z.b);
      this.onArrange(true);
      this.draw();
    }
  }

  // Snap a flag-drag time to a nearby onset (within ~8 css px), else leave.
  _snapToOnset(t, x) {
    let best = t;
    let bestD = 8 * this.dpr;
    for (const o of this.bank.onsets) {
      const d = Math.abs(this.xOf(o) - x);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  _down(e) {
    if (!this.bank) return;
    this.canvas.setPointerCapture(e.pointerId);
    const { x, y } = this._local(e);
    const dpr = this.dpr;
    // Middle-drag pans the view (works anywhere, any mode).
    if (e.button === 1) {
      e.preventDefault();
      this.drag = { type: 'pan', x0: x, vs0: this.viewStart };
      return;
    }
    // Right-click is the context menu (handled in contextmenu) — never scrub
    // or draw on it.
    if (e.button === 2) return;
    const inRuler = y < RULER_H * dpr;
    if (inRuler && this.tempo) {
      // shift+drag: create/replace the loop region
      if (e.shiftKey && this.loop) {
        const b = this._eventBeat(x, e.altKey);
        this.loop.startB = b;
        this.loop.endB = b;
        this.drag = { type: 'loopCreate', anchorB: b };
        return;
      }
      // bar-1 flag drag takes precedence over everything else
      if (Math.abs(x - this._flagX()) < 9 * dpr) {
        this.drag = { type: 'flag' };
        return;
      }
      // loop brace (top band): edges resize, body moves
      if (y < LOOP_BAND * dpr && this._loopValid()) {
        const x0 = this.xOf(this.tempo.timeAt(this.loop.startB));
        const x1 = this.xOf(this.tempo.timeAt(this.loop.endB));
        if (Math.abs(x - x0) < 6 * dpr) {
          this.drag = { type: 'loopEdge', edge: 'startB' };
          return;
        }
        if (Math.abs(x - x1) < 6 * dpr) {
          this.drag = { type: 'loopEdge', edge: 'endB' };
          return;
        }
        if (x > x0 && x < x1) {
          this.drag = { type: 'loopMove', grab: this.tempo.beatsAt(this.tOf(x)) - this.loop.startB };
          return;
        }
      }
      const mi = this._hitMarker(x);
      if (mi >= 0 && y >= LOOP_BAND * dpr) {
        this.drag = { type: 'marker', index: mi };
        return;
      }
      this.drag = { type: 'scrub' };
      this._seekFrom(x);
      return;
    }
    // Slice 3: editing a trigger set — Move drags a tick (x=time, y=strength),
    // Draw adds one, right-click/double-click deletes.
    if (this.editSet) {
      const ti = this._hitEditTrigger(x, y);
      if (ti >= 0) {
        this.drag = { type: 'trg', index: ti };
      } else if (this.mode === 'draw') {
        const trg = { t: +this._snappedTime(x, e.altKey).toFixed(3), s: this._editSofY(y) };
        this.editSet.triggers.push(trg);
        this.editSet.triggers.sort((a, b) => a.t - b.t);
        this.drag = { type: 'trg', index: this.editSet.triggers.indexOf(trg) };
        this.onTriggerEdit(this.editSet);
      } else {
        this.drag = { type: 'scrub' };
        this._seekFrom(x);
      }
      this.draw();
      return;
    }
    if (!this.laneKey) {
      // No lane open: Move mode marquees a beats range (drag) / seeks (click)
      // so a range can be highlighted for the loop button; Draw mode scrubs.
      if (this.mode === 'move') {
        const b = this._eventBeat(x, e.altKey);
        this.drag = { type: 'marquee', anchorB: b, x0: x, moved: false };
      } else {
        this.drag = { type: 'scrub' };
        this._seekFrom(x);
      }
      this.draw();
      return;
    }
    const hit = this._hitPoint(x, y);
    if (hit >= 0) {
      this.drag = { type: 'point', index: hit };
    } else {
      const curveHit = this._hitCurveHandle(x, y);
      if (curveHit >= 0) {
        this.drag = { type: 'curve', index: curveHit };
      } else if (this.mode === 'draw') {
        const b = this._eventBeat(x, e.altKey);
        const idx = this.automation.addPoint(this.laneKey, b, this.vOf(y));
        this.drag = { type: 'point', index: idx };
        this.onLaneEdit();
      } else {
        // Move mode: begin a marquee/seek gesture — drag selects a beats
        // range (for copy/paste), a plain click seeks (resolved on pointerup).
        const b = this._eventBeat(x, e.altKey);
        this.drag = { type: 'marquee', anchorB: b, x0: x, moved: false };
      }
    }
    this.draw();
  }

  _move(e) {
    if (!this.drag) {
      // R9-7: hover tooltip — name the marker under the cursor.
      const { x, y } = this._local(e);
      this.canvas.title = this._labelAt(x, y);
      return;
    }
    this._dragEvt = e;          // remembered so edge-scroll can re-apply it
    this._applyDrag(e);
    this._updateEdgeScroll(e);
  }

  // Start/keep an auto-scroll when a drag (not a pan) reaches the left/right
  // edge of a zoomed-in view — lets a marquee or scrub extend past what's
  // currently on-screen by holding the pointer at the edge.
  _updateEdgeScroll(e) {
    let dir = 0;
    if (this.pxPerSec > 0 && this.drag && this.drag.type !== 'pan') {
      const { x } = this._local(e);
      const margin = 28 * this.dpr;
      if (x < margin) dir = -1;
      else if (x > this.canvas.width - margin) dir = 1;
    }
    this._edgeDir = dir;
    if (dir && !this._edgeRAF) {
      this._edgeRAF = requestAnimationFrame(() => this._edgeTick());
    }
  }

  _edgeTick() {
    this._edgeRAF = 0;
    if (!this._edgeDir || !this.drag) return;
    const before = this.viewStart;
    this.viewStart += this._viewSeconds() * 0.012 * this._edgeDir;
    this._clampView();
    if (this.viewStart === before) return; // hit the start/end — nothing to do
    if (this._dragEvt) this._applyDrag(this._dragEvt); // extend the drag
    this._edgeRAF = requestAnimationFrame(() => this._edgeTick());
  }

  _stopEdgeScroll() {
    this._edgeDir = 0;
    if (this._edgeRAF) {
      cancelAnimationFrame(this._edgeRAF);
      this._edgeRAF = 0;
    }
  }

  // Apply the active drag for the pointer event `e` (called live by _move and
  // by the edge-scroll loop with the held pointer after the view has panned).
  _applyDrag(e) {
    const { x, y } = this._local(e);
    if (this.drag.type === 'trg') {
      const set = this.editSet;
      const trg = set && set.triggers[this.drag.index];
      if (trg) {
        trg.s = this._editSofY(y);
        trg.t = +this._snappedTime(x, e.altKey).toFixed(3);
        set.triggers.sort((a, b) => a.t - b.t);
        this.drag.index = set.triggers.indexOf(trg);
        this.onTriggerEdit(set);
        this.draw();
      }
      return;
    }
    if (this.drag.type === 'pan') {
      this.viewStart = this.drag.vs0 - (x - this.drag.x0) / this._pps();
      this._clampView();
      this.draw();
      return;
    }
    if (this.drag.type === 'marquee') {
      if (Math.abs(x - this.drag.x0) > 3 * this.dpr) this.drag.moved = true;
      const b = this._eventBeat(x, e.altKey);
      this.selection = {
        startB: Math.min(this.drag.anchorB, b),
        endB: Math.max(this.drag.anchorB, b),
      };
      this.draw();
      return;
    }
    if (this.drag.type === 'scrub') {
      this._seekFrom(x);
      return;
    }
    if (this.drag.type === 'flag') {
      let t = Math.min(Math.max(this.tOf(x), 0), this.duration);
      if (!e.altKey) t = this._snapToOnset(t, x);
      this.tempo.offset = t;
      this.onTempoChange(false);
      this.draw();
      return;
    }
    if (this.drag.type === 'loopCreate') {
      const b = this._eventBeat(x, e.altKey);
      this.loop.startB = Math.min(this.drag.anchorB, b);
      this.loop.endB = Math.max(this.drag.anchorB, b);
      this.onArrange(false);
      this.draw();
      return;
    }
    if (this.drag.type === 'loopEdge') {
      const b = this._eventBeat(x, e.altKey);
      const lp = this.loop;
      if (this.drag.edge === 'startB') lp.startB = Math.min(b, lp.endB - 0.25);
      else lp.endB = Math.max(b, lp.startB + 0.25);
      this.onArrange(false);
      this.draw();
      return;
    }
    if (this.drag.type === 'loopMove') {
      const lp = this.loop;
      const len = lp.endB - lp.startB;
      let b = this.tempo.beatsAt(this.tOf(x)) - this.drag.grab;
      if (!e.altKey) b = snapBeats(b, this.snap, this.tempo.beatsPerBar);
      lp.startB = Math.max(b, 0);
      lp.endB = lp.startB + len;
      this.onArrange(false);
      this.draw();
      return;
    }
    if (this.drag.type === 'marker') {
      const m = this.markers[this.drag.index];
      if (m) {
        m.b = this._eventBeat(x, e.altKey);
        this.onArrange(false);
        this.draw();
      }
      return;
    }
    if (this.drag.type === 'curve') {
      // the handle is the Bézier point at t = 0.5 = (0.25 + h/2, 0.25 + k/2)
      // in segment space, so the inverse from the pointer is linear:
      // h = 2px − 0.5 (apex skew), k = 2py − 0.5 (bend).
      const lane = this.automation.lane(this.laneKey);
      const a = lane && lane.points[this.drag.index];
      const z = lane && lane.points[this.drag.index + 1];
      if (a && z && Math.abs(z.v - a.v) > 1e-6 && z.b - a.b > 1e-6) {
        const px = (this.tempo.beatsAt(this.tOf(x)) - a.b) / (z.b - a.b);
        const py = (this.vOf(y) - a.v) / (z.v - a.v);
        let h = Math.min(Math.max(2 * px - 0.5, 0), 1);
        const k = Math.min(Math.max(2 * py - 0.5, 0), 1);
        // soft-snap the apex back to centre so plain vertical drags keep
        // producing symmetric bows (Alt bypasses)
        if (!e.altKey && Math.abs(h - 0.5) < 0.06) h = 0.5;
        this.automation.setCurve(this.laneKey, this.drag.index, 2 * k - 1, h);
        this.onLaneEdit();
        this.draw();
      }
      return;
    }
    const b = this._eventBeat(x, e.altKey);
    this.drag.index = this.automation.movePoint(this.laneKey, this.drag.index, b, this.vOf(y));
    this.onLaneEdit();
    this.draw();
  }

  _up(e) {
    this._stopEdgeScroll();
    const drag = this.drag;
    const dragType = drag && drag.type;
    this.drag = null;
    try { this.canvas.releasePointerCapture(e.pointerId); } catch (err) { /* released */ }
    if (dragType === 'marquee') {
      if (!drag.moved) {
        // a plain click in move mode seeks and clears any selection
        this.selection = null;
        this._seekFrom(drag.x0);
      } else if (!this.getSelection()) {
        this.selection = null; // degenerate (collapsed) marquee
      }
      this.draw();
      return;
    }
    if (dragType === 'pan') return;
    if (dragType === 'point' || dragType === 'curve') {
      this.onLaneCommit();
      this.draw();
    } else if (dragType === 'flag') {
      this.onTempoChange(true);
      this.draw();
    } else if (dragType === 'loopCreate') {
      // too small = treat as a click: clear the region
      if (this.loop.endB - this.loop.startB < 0.05) {
        this.loop.startB = 0;
        this.loop.endB = 0;
        this.loop.on = false;
      } else {
        this.loop.on = true; // a fresh brace starts looping immediately
      }
      this.onArrange(true);
      this.draw();
    } else if (dragType === 'loopEdge' || dragType === 'loopMove') {
      this.onArrange(true);
      this.draw();
    } else if (dragType === 'marker') {
      if (this.markers) this.markers.sort((a, z) => a.b - z.b);
      this.onArrange(true);
      this.draw();
    } else if (dragType === 'trg') {
      this.onTriggerCommit(); // checkpoint once at the end of the gesture
      this.draw();
    }
  }

  _deleteAt(e) {
    const { x, y } = this._local(e);
    if (this.editSet) {
      const ti = this._hitEditTrigger(x, y);
      if (ti >= 0) {
        this.editSet.triggers.splice(ti, 1);
        this.onTriggerEdit(this.editSet);
        this.onTriggerCommit();
        this.draw();
      }
      return;
    }
    if (!this.laneKey) return;
    const hit = this._hitPoint(x, y);
    if (hit >= 0) {
      this.automation.deletePoint(this.laneKey, hit);
      this.onLaneEdit();
      this.onLaneCommit();
      this.draw();
      return;
    }
    const curveHit = this._hitCurveHandle(x, y);
    if (curveHit >= 0) {
      this.automation.setCurve(this.laneKey, curveHit, 0, 0.5); // straighten + recentre
      this.onLaneEdit();
      this.onLaneCommit();
      this.draw();
    }
  }

  _wheel(e) {
    if (!this.bank) return;
    e.preventDefault();
    const { x } = this._local(e);
    if (e.shiftKey) {
      this.viewStart += (e.deltaY || e.deltaX) / this._pps() * this.dpr;
      this._clampView();
      this.draw();
      return;
    }
    const fitCss = this._fitPps() / this.dpr;
    const curCss = this.pxPerSec > 0 ? this.pxPerSec : fitCss;
    const anchorT = this.tOf(x);
    let next = curCss * Math.exp(-e.deltaY * 0.0016);
    next = Math.min(Math.max(next, fitCss), 1200);
    this.pxPerSec = next <= fitCss * 1.001 ? 0 : next;
    this.viewStart = anchorT - x / this._pps();
    this._clampView();
    this.draw();
  }

  // ------------------------------------------------------------- drawing

  draw() {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    if (w === 0 || h === 0) return;
    const dpr = this.dpr;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#15171c';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#101216';
    ctx.fillRect(0, 0, w, RULER_H * dpr);

    if (!this.bank) {
      ctx.fillStyle = '#3a3f4a';
      ctx.font = `${12 * dpr}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText('timeline — load a project to see the waveform', w / 2, h / 2 + 4);
      return;
    }

    this._drawGrid(w, h, dpr);
    this._drawWave(w, h, dpr);
    this._drawMarkers(w, h, dpr);
    this._drawPreRoll(w, h, dpr);
    this._drawFlag(w, h, dpr);
    this._drawLoop(w, h, dpr);
    this._drawUserMarkers(w, h, dpr);
    this._drawSelection(w, h, dpr);   // shows with or without an open lane
    if (this.laneKey) this._drawLane(w, h, dpr);
    if (this.editSet) this._drawEditTriggers(w, h, dpr);

    // playhead
    const px = this.xOf(this.time);
    if (px >= -2 && px <= w + 2) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px - dpr * 0.75, 0, dpr * 1.5, h);
    }
  }

  _drawGrid(w, h, dpr) {
    const { ctx, tempo } = this;
    if (!tempo || tempo.bpm <= 0) {
      this._drawTimeRuler(w, dpr);
      return;
    }
    const pps = this._pps();
    const beatPx = (60 / tempo.bpm) * pps;
    const barPx = beatPx * tempo.beatsPerBar;
    if (barPx < 3 * dpr) return;

    const bStart = Math.floor(tempo.beatsAt(this.viewStart));
    const bEnd = Math.ceil(tempo.beatsAt(this.viewStart + this._viewSeconds()));
    const drawBeats = beatPx >= 7 * dpr;

    // label every 1/2/4/8... bars so labels stay ~>=60px apart
    let labelEvery = 1;
    while (barPx * labelEvery < 60 * dpr) labelEvery *= 2;

    ctx.font = `${10 * dpr}px system-ui`;
    ctx.textAlign = 'left';
    for (let b = bStart; b <= bEnd; b++) {
      const x = this.xOf(tempo.timeAt(b));
      if (x < 0 || x > w) continue;
      const isBar = ((b % tempo.beatsPerBar) + tempo.beatsPerBar) % tempo.beatsPerBar === 0;
      if (isBar) {
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(x, 0, dpr, h);
        const bar = Math.floor(b / tempo.beatsPerBar) + 1;
        if (bar >= 1 && (bar - 1) % labelEvery === 0) {
          ctx.fillStyle = '#717a8c';
          ctx.fillText(String(bar), x + 3 * dpr, (RULER_H - 4) * dpr);
        }
      } else if (drawBeats) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(x, RULER_H * dpr, dpr, h - RULER_H * dpr);
      }
    }
  }

  _drawTimeRuler(w, dpr) {
    const { ctx } = this;
    const pps = this._pps();
    const steps = [0.5, 1, 2, 5, 10, 30, 60];
    const step = steps.find((s) => s * pps >= 70 * dpr) || 60;
    ctx.font = `${10 * dpr}px system-ui`;
    ctx.textAlign = 'left';
    const start = Math.floor(this.viewStart / step) * step;
    for (let t = start; t <= this.viewStart + this._viewSeconds(); t += step) {
      const x = this.xOf(t);
      if (x < 0) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x, 0, dpr, this.canvas.height);
      ctx.fillStyle = '#717a8c';
      const m = Math.floor(t / 60);
      const s = Math.round(t % 60);
      ctx.fillText(`${m}:${String(s).padStart(2, '0')}`, x + 3 * dpr, (RULER_H - 4) * dpr);
    }
  }

  _drawWave(w, h, dpr) {
    const { ctx, wave } = this;
    if (!wave) return; // no decoded audio yet → grid/playhead still draw
    const top = RULER_H * dpr;
    const mid = top + (h - top) * 0.5;
    const cols = wave.columns(this.viewStart, this.viewStart + this._viewSeconds(), w);
    // FIXED vertical scale from the song-wide normalization reference, so the
    // waveform height is stable across zoom — zooming changes horizontal detail,
    // not the vertical scale. (A per-view scale made the wave expand as you
    // zoomed in and blow past the pane.) The loudest buckets clip at the band
    // edge (the pass clip rects below flat-top them).
    const amp = (h - top) * 0.46 * (0.92 / Math.max(wave.normRef, 0.02));
    const playedX = this.xOf(this.time);
    const alpha = this.laneKey ? 0.3 : 1;

    const fillEnv = (yTop, yBot, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, yTop(0));
      for (let x = 1; x < w; x++) ctx.lineTo(x, yTop(x));
      for (let x = w - 1; x >= 0; x--) ctx.lineTo(x, yBot(x));
      ctx.closePath();
      ctx.fill();
    };
    const pass = (played) => {
      ctx.save();
      ctx.beginPath();
      if (played) ctx.rect(0, top, playedX, h - top);
      else ctx.rect(playedX, top, w - playedX, h - top);
      ctx.clip();
      // dim peak (min/max) envelope
      fillEnv(
        (x) => mid - cols.max[x] * amp,
        (x) => mid - cols.min[x] * amp,
        played ? `rgba(73,97,153,${alpha})` : `rgba(45,50,64,${alpha})`);
      // bright RMS core
      fillEnv(
        (x) => mid - cols.rms[x] * amp,
        (x) => mid + cols.rms[x] * amp,
        played ? `rgba(122,162,255,${alpha})` : `rgba(70,88,106,${alpha})`);
      ctx.restore();
    };
    pass(true);
    pass(false);
  }

  // Dim everything before bar 1 so leading silence reads as "pre-roll".
  _drawPreRoll(w, h, dpr) {
    if (!this.tempo || this.tempo.offset <= 0) return;
    const x = this.xOf(this.tempo.offset);
    if (x <= 0) return;
    this.ctx.fillStyle = 'rgba(8, 9, 12, 0.45)';
    this.ctx.fillRect(0, RULER_H * dpr, Math.min(x, w), h - RULER_H * dpr);
  }

  // Draggable bar-1 anchor flag in the ruler (snaps to onsets; Alt = free).
  // Lives in the lower ruler band; the top band belongs to the loop brace.
  _drawFlag(w, h, dpr) {
    if (!this.tempo) return;
    const { ctx } = this;
    const x = this._flagX();
    if (x < -16 * dpr || x > w + 16 * dpr) return;
    const top = LOOP_BAND * dpr;
    const fh = (RULER_H - LOOP_BAND - 2) * dpr;
    ctx.fillStyle = '#7aa2ff';
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + 11 * dpr, top);
    ctx.lineTo(x + 11 * dpr, top + fh * 0.62);
    ctx.lineTo(x, top + fh);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x, top, dpr, h - top);
    ctx.fillStyle = '#0b0d12';
    ctx.font = `bold ${9 * dpr}px system-ui`;
    ctx.textAlign = 'left';
    ctx.fillText('1', x + 2.5 * dpr, top + 8.5 * dpr);
  }

  // Ableton-style loop brace in the top ruler band (+ region shading below).
  _drawLoop(w, h, dpr) {
    if (!this._loopValid() || !this.tempo) return;
    const { ctx } = this;
    const lp = this.loop;
    const x0 = this.xOf(this.tempo.timeAt(lp.startB));
    const x1 = this.xOf(this.tempo.timeAt(lp.endB));
    if (x1 < -8 * dpr || x0 > w + 8 * dpr) return;
    const bh = (LOOP_BAND - 2) * dpr;
    ctx.fillStyle = lp.on ? 'rgba(122,162,255,0.9)' : 'rgba(122,162,255,0.32)';
    ctx.fillRect(x0, dpr, Math.max(x1 - x0, dpr), bh);
    // edge handles
    ctx.fillRect(x0 - 1.5 * dpr, 0, 3 * dpr, (LOOP_BAND + 2) * dpr);
    ctx.fillRect(x1 - 1.5 * dpr, 0, 3 * dpr, (LOOP_BAND + 2) * dpr);
    if (lp.on) {
      ctx.fillStyle = 'rgba(122,162,255,0.07)';
      ctx.fillRect(x0, RULER_H * dpr, x1 - x0, h - RULER_H * dpr);
    }
  }

  // User markers (named locators) in the lower ruler band.
  _drawUserMarkers(w, h, dpr) {
    if (!this.markers || !this.markers.length || !this.tempo) return;
    const { ctx } = this;
    const top = LOOP_BAND * dpr;
    ctx.font = `${9 * dpr}px system-ui`;
    ctx.textAlign = 'left';
    for (const m of this.markers) {
      const x = this.xOf(this.tempo.timeAt(m.b));
      if (x < -60 * dpr || x > w + 8 * dpr) continue;
      ctx.fillStyle = 'rgba(140,230,160,0.35)';
      ctx.fillRect(x, RULER_H * dpr, dpr, h - RULER_H * dpr);
      ctx.fillStyle = '#8ce6a0';
      ctx.beginPath();
      ctx.moveTo(x, top + 2 * dpr);
      ctx.lineTo(x + 7 * dpr, top + 6 * dpr);
      ctx.lineTo(x, top + 10 * dpr);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#9befac';
      ctx.fillText(m.name.slice(0, 14), x + 9 * dpr, top + 9.5 * dpr);
    }
  }

  _drawMarkers(w, h, dpr) {
    const { ctx, bank } = this;
    const top = RULER_H * dpr;
    const faint = this.laneKey ? 0.2 : 0.4;
    // R9-7 colour-by-origin: analysis-detected markers use a cool, muted
    // neutral language (onsets cool-grey, sections teal-grey) so they read as
    // "the app found this" — distinct from user-created green/blue/amber and
    // never sharing amber with automation or green with user markers.
    ctx.fillStyle = `rgba(150,162,184,${faint})`;          // onsets (transients)
    for (const t of bank.onsets) {
      const x = this.xOf(t);
      if (x < 0 || x > w) continue;
      ctx.fillRect(x, top, dpr, (h - top) * 0.07);
    }
    ctx.fillStyle = `rgba(110,165,180,${this.laneKey ? 0.16 : 0.28})`; // sections
    for (const t of bank.sections) {
      if (t <= 0) continue;
      const x = this.xOf(t);
      if (x < 0 || x > w) continue;
      ctx.fillRect(x, top, 2 * dpr, h - top);
    }
    // Slice 1b / Reactive S1: user trigger sets — color-coded ticks, height grows
    // with strength. When a set is active (being tuned) it renders brighter +
    // taller and the rest dim to context; with nothing active all render normally.
    // Draw context first so the active set sits on top.
    const anyActive = this.triggerSets.some((s) => s.active);
    const normal = this.laneKey ? 0.45 : 0.8;
    const dim = this.laneKey ? 0.22 : 0.32;
    const ordered = anyActive
      ? [...this.triggerSets].sort((a, b) => (a.active === b.active ? 0 : a.active ? 1 : -1))
      : this.triggerSets;
    for (const set of ordered) {
      const hi = !!set.active;
      ctx.globalAlpha = hi ? 0.97 : (anyActive ? dim : normal);
      ctx.fillStyle = set.color;
      for (const trg of set.triggers) {
        const x = this.xOf(trg.t);
        if (x < 0 || x > w) continue;
        const frac = hi ? (0.18 + 0.5 * trg.s) : (0.12 + 0.28 * trg.s);
        ctx.fillRect(x, top, Math.max((hi ? 2 : 1) * dpr, 1), (h - top) * frac);
      }
    }
    ctx.globalAlpha = 1;
  }

  // R9-7: what marker is under the cursor (for the hover tooltip). Returns a
  // plain-language label naming the marker and what created it, or ''.
  _labelAt(x, y) {
    if (!this.bank || !this.tempo) return '';
    const dpr = this.dpr;
    const hr = HIT_R * dpr;
    const inRuler = y < RULER_H * dpr;
    if (Math.abs(x - this._flagX()) < hr) return 'Bar 1 — downbeat anchor (you set this; drag to align)';
    const mi = this._hitMarker(x);
    if (mi >= 0 && this.markers[mi]) return `Marker “${this.markers[mi].name}” — you placed this`;
    if (this.loop && this.loop.endB > this.loop.startB) {
      const x0 = this.xOf(this.tempo.timeAt(this.loop.startB));
      const x1 = this.xOf(this.tempo.timeAt(this.loop.endB));
      if (inRuler && x >= x0 - hr && x <= x1 + hr) {
        const bpb = this.tempo.beatsPerBar;
        return `Loop region${this.loop.on ? ' (on)' : ''} — bars ${(this.loop.startB / bpb + 1).toFixed(1)}–${(this.loop.endB / bpb + 1).toFixed(1)}`;
      }
    }
    if (inRuler) return '';
    if (this.laneKey) {
      const lane = this.automation.lane(this.laneKey);
      if (lane) {
        for (const p of lane.points) {
          const px = this.xOf(this.tempo.timeAt(p.b));
          const py = this.yOf(p.v);
          if (Math.hypot(px - x, py - y) < hr) return 'Automation breakpoint — you drew this';
        }
      }
    }
    for (const t of this.bank.sections) {
      if (t > 0 && Math.abs(this.xOf(t) - x) < hr) return 'Section boundary — detected by analysis';
    }
    for (const o of this.bank.onsets) {
      if (Math.abs(this.xOf(o) - x) < hr) return 'Onset — detected transient (analysis)';
    }
    return '';
  }

  // R14-P3: marquee selection band (amber = automation language) under the
  // lane line, with edge ticks at the snapped boundaries.
  _drawSelection(w, h, dpr) {
    if (!this.selection || !this.tempo) return;
    const { ctx } = this;
    const x0 = this.xOf(this.tempo.timeAt(this.selection.startB));
    const x1 = this.xOf(this.tempo.timeAt(this.selection.endB));
    const top = RULER_H * dpr;
    if (x1 < 0 || x0 > w) return;
    ctx.fillStyle = 'rgba(255,180,90,0.12)';
    ctx.fillRect(x0, top, Math.max(x1 - x0, dpr), h - top);
    ctx.fillStyle = 'rgba(255,180,90,0.55)';
    ctx.fillRect(x0 - dpr, top, 2 * dpr, h - top);
    ctx.fillRect(x1 - dpr, top, 2 * dpr, h - top);
  }

  _drawLane(w, h, dpr) {
    const { ctx } = this;
    const lane = this.automation.lane(this.laneKey);
    const { schema } = this._laneRange();
    const discrete = this._isDiscrete(schema);
    const enabled = !lane || lane.enabled;
    const color = enabled ? '#ffb45a' : '#6f7480';

    // enum level guides
    if (discrete) {
      ctx.font = `${9 * dpr}px system-ui`;
      ctx.textAlign = 'left';
      for (let i = 0; i < schema.options.length; i++) {
        const y = this.yOf(i);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(0, y, w, dpr);
        ctx.fillStyle = '#5a6171';
        ctx.fillText(schema.options[i], 4 * dpr, y - 3 * dpr);
      }
    }

    if (!lane || !lane.points.length) {
      // reference line at the current base value
      const y = this.yOf(this.getBaseValue(this.laneKey));
      ctx.strokeStyle = 'rgba(255,180,90,0.5)';
      ctx.setLineDash([5 * dpr, 5 * dpr]);
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }

    const pts = lane.points;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    let prevY = this.yOf(pts[0].v);
    ctx.moveTo(0, prevY);
    for (let i = 0; i < pts.length; i++) {
      const x = this.xOf(this.tempo.timeAt(pts[i].b));
      const y = this.yOf(pts[i].v);
      if (discrete) {
        ctx.lineTo(x, prevY); // hold previous level until this point
        ctx.lineTo(x, y);
      } else if (i > 0 && (pts[i - 1].c || pts[i - 1].h !== undefined)) {
        // curved segment: subdivide through the Bézier evaluator
        const a = pts[i - 1];
        const ah = a.h === undefined ? 0.5 : a.h;
        const xa = this.xOf(this.tempo.timeAt(a.b));
        for (let s = 1; s <= 16; s++) {
          const f = s / 16;
          const vs = a.v + (pts[i].v - a.v) * shapeSegment(f, a.c, ah);
          ctx.lineTo(xa + (x - xa) * f, this.yOf(vs));
        }
      } else {
        ctx.lineTo(x, y);
      }
      prevY = y;
    }
    ctx.lineTo(w, prevY);
    ctx.stroke();

    // midpoint curvature handles (drag vertically to bend; dbl-click resets)
    if (!discrete && enabled) {
      for (let i = 0; i + 1 < pts.length; i++) {
        const m = this._segmentHandle(i);
        if (!m) continue;
        ctx.strokeStyle = color;
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 3 * dpr, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    for (const p of pts) {
      const x = this.xOf(this.tempo.timeAt(p.b));
      const y = this.yOf(p.v);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 4 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#15171c';
      ctx.lineWidth = dpr;
      ctx.stroke();
    }

    // current value riding the envelope at the playhead
    if (enabled) {
      const v = this.automation.valueAt(this.laneKey, this.tempo.beatsAt(this.time));
      if (v !== undefined) {
        const x = this.xOf(this.time);
        if (x >= 0 && x <= w) {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(x, this.yOf(v), 3 * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // readout for the point being dragged: "bar 3 · beat 2.5 · 0.45"
    if (this.drag && this.drag.type === 'point' && pts[this.drag.index]) {
      const p = pts[this.drag.index];
      const x = this.xOf(this.tempo.timeAt(p.b));
      const y = this.yOf(p.v);
      this._drawReadout(x, y, this._formatPoint(p, schema), dpr, w);
    }

    if (!enabled) {
      ctx.fillStyle = '#8a90a0';
      ctx.font = `${11 * dpr}px system-ui`;
      ctx.textAlign = 'right';
      ctx.fillText('automation bypassed (slider override)', w - 8 * dpr, (RULER_H + 14) * dpr);
    }
  }

  _formatPoint(p, schema) {
    const bpb = this.tempo.beatsPerBar;
    const bar = Math.floor(p.b / bpb) + 1;
    const beat = (p.b - (bar - 1) * bpb) + 1;
    const beatStr = Math.abs(beat - Math.round(beat)) < 1e-3
      ? String(Math.round(beat)) : beat.toFixed(2);
    let val;
    if (this._isDiscrete(schema)) {
      val = schema.options[Math.round(p.v)];
    } else {
      const decimals = schema.step >= 1 ? 0 : schema.step >= 0.1 ? 1 : 2;
      val = p.v.toFixed(decimals);
    }
    return `${bar}.${beatStr} · ${val}`;
  }

  _drawReadout(x, y, text, dpr, w) {
    const { ctx } = this;
    ctx.font = `${11 * dpr}px system-ui`;
    const pad = 5 * dpr;
    const tw = ctx.measureText(text).width;
    let bx = x + 10 * dpr;
    let by = y - 24 * dpr;
    if (bx + tw + pad * 2 > w) bx = x - tw - pad * 2 - 10 * dpr;
    if (by < RULER_H * dpr) by = y + 12 * dpr;
    ctx.fillStyle = 'rgba(10,12,16,0.92)';
    ctx.fillRect(bx, by, tw + pad * 2, 18 * dpr);
    ctx.strokeStyle = 'rgba(255,180,90,0.5)';
    ctx.lineWidth = dpr;
    ctx.strokeRect(bx, by, tw + pad * 2, 18 * dpr);
    ctx.fillStyle = '#ffcf96';
    ctx.textAlign = 'left';
    ctx.fillText(text, bx + pad, by + 13 * dpr);
  }
}
