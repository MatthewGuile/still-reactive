// Still Reactive — app state and wiring.

import { Renderer } from './renderer.js';
import { FeatureBank, modValues, applyModulation, detectTriggers, resolveTriggers } from './features.js';
import { Transport } from './audio.js';
import { Timeline } from './timeline.js';
import { WaveformPeaks } from './waveform.js';
import { snapBeats } from './automation.js';
import {
  defaultParams, paramIndex, migrateLegacyParams, RESPONSE_KEYS,
  PARAM_GROUPS, defaultChain, groupById, MOD_SOURCES, MOD_SEP,
  applyMacros, buildQuartet, MACRO_SLOTS, rackMacroKey,
  autoGradeFromStats, rackToSaved, applyRackToState, normalizeMapping,
} from './params.js';
import { STYLE_PACKS, getPack } from './packs.js';
import { ParamPanel, el, toast, formatTime } from './ui.js';
import { runExport, RESOLUTIONS } from './export.js';
import { TempoMap, AutomationSet } from './automation.js';

const ASPECTS = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1 };
const PREVIEW_CAP = 1280; // max preview render dimension; export is full-res
const MAX_RACKS = 4;

const state = {
  project: null,
  bank: null,
  packId: null,           // R11-P0: no look auto-applied — boot from clean defaults
  aspect: '16:9',
  fps: 30,
  params: null,         // the single working parameter set (R8: A/B removed)
  chain: [],            // added device ids, always in pipeline order
  racks: [],            // [{id, name, deviceIds:[], macros:[{name, mappings:[{key,min,max}]}]}]
  mapping: null,        // {rackId, macroIdx} in Map mode, else null
  assign: null,         // rack id in device-Assign mode, else null
  editRack: null,       // rack id whose mapping list is open, else null
  reframe: {
    '16:9': { x: 0, y: 0, scale: 1 },
    '9:16': { x: 0, y: 0, scale: 1 },
    '1:1': { x: 0, y: 0, scale: 1 },
  },
  guides: false,
  lane: null,           // open automation lane param key
  followStructure: false, // R5-P5: Energy macro tracks song sections
  followLocked: false,    // user hand-edited the generated lane → stop regen
  focus: true,            // R7-5: device panel shows one device at a time
  pendingLook: null,      // R9-1: look chosen in the start state, applied on load
  exporting: false,
  abortExport: false,
  serverRendering: false, // a headless server-side render is running for this tab
  serverRenderJob: null,  // its job id (for status polling + cancel)
  pendingImage: null,
  pendingAudio: null,
  clipboard: null,        // R14-P3: copied automation clip (range or whole lane)
  triggerSets: [],        // Slice 1b: detection recipes {id,name,band,selectivity,color,show}
  triggerOverlays: true,  // Slice 1b: show trigger ticks on the timeline (UI pref)
  activeTriggerSet: null, // Reactive-triggers Slice 1: id of the set being tuned/edited
};

const params = () => state.params;
let signalOpen = false; // R8: Signal panel open? (declared early — referenced at init)
const responseOf = (p) => ({
  gain: p.audGain, attackMs: p.audAttack, releaseMs: p.audRelease,
  gamma: p.audGamma, flashLimit: p.flashLimit,
  lowMidHz: p.audLowMid, midHighHz: p.audMidHigh,
});

// ------------------------------------------------- automation + tempo grid

const SCHEMA_INDEX = paramIndex();
const automation = new AutomationSet(SCHEMA_INDEX);

// Rack macro keys are dynamic. Rebuild SCHEMA_INDEX IN PLACE so every holder
// of the reference (this const, automation.schema) sees the change without
// reassigning a const. Call after any rack add/remove/rename/remap.
function rebuildParamIndex() {
  const fresh = paramIndex(state.racks);
  for (const k of Object.keys(SCHEMA_INDEX)) delete SCHEMA_INDEX[k];
  Object.assign(SCHEMA_INDEX, fresh);
}

// Drop automation lanes on a rack's (now dead) macro keys.
function clearRackLanes(rack) {
  for (let j = 0; j < (rack.macros ? rack.macros.length : 0); j++) {
    automation.clear(rackMacroKey(rack.id, j + 1));
  }
}

function rackOwnsLane(rack, key) {
  return !!(rack && key && (rack.macros || []).some((m, j) => key === rackMacroKey(rack.id, j + 1)));
}

function closeLaneIfMissingFromSchema() {
  if (state.lane && !SCHEMA_INDEX[state.lane]) closeLane();
}

function removeMappingsForDevice(rack, deviceId) {
  let changed = false;
  for (const mac of rack.macros || []) {
    const before = mac.mappings ? mac.mappings.length : 0;
    mac.mappings = (mac.mappings || []).filter((mm) => (SCHEMA_INDEX[mm.key] || {}).group !== deviceId);
    changed = changed || mac.mappings.length !== before;
  }
  return changed;
}

function claimDeviceForRack(rack, deviceId) {
  if (!rack || !groupById(deviceId)) return false;
  let changed = false;
  for (const other of state.racks) {
    if (other.id === rack.id) continue;
    const before = other.deviceIds.length;
    other.deviceIds = other.deviceIds.filter((d) => d !== deviceId);
    changed = changed || other.deviceIds.length !== before;
    changed = removeMappingsForDevice(other, deviceId) || changed;
  }
  if (!state.chain.includes(deviceId)) addDevice(deviceId);
  if (!rack.deviceIds.includes(deviceId)) {
    rack.deviceIds.push(deviceId);
    changed = true;
  }
  return changed;
}

// ------------------------------------------------- rack CRUD (Task 3.1)

function nextRackId() {
  let max = 0;
  for (const r of state.racks) {
    const m = /^rk(\d+)$/.exec(r.id);
    if (m) max = Math.max(max, +m[1]);
  }
  return `rk${max + 1}`;
}

function createRack(name = 'Rack') {
  if (state.racks.length >= MAX_RACKS) {
    toast(`A project can have up to ${MAX_RACKS} racks.`, 'error');
    return null;
  }
  const rack = { id: nextRackId(), name: name.slice(0, 24), deviceIds: [],
    macros: [{ name: 'Macro 1', mappings: [] }] };
  state.racks.push(rack);
  params()[rackMacroKey(rack.id, 1)] = 0;
  rebuildParamIndex();
  buildRacksArea();
  autosaveAutomation();
  commitHistory();
  return rack;
}

function deleteRack(id) {
  const i = state.racks.findIndex((r) => r.id === id);
  if (i < 0) return;
  const rack = state.racks[i];
  if (rackOwnsLane(rack, state.lane)) closeLane();
  clearRackLanes(rack);
  for (let j = 0; j < rack.macros.length; j++) delete params()[rackMacroKey(rack.id, j + 1)];
  state.racks.splice(i, 1);
  if (state.editRack === id) state.editRack = null;
  if (state.mapping && state.mapping.rackId === id) exitMapMode();
  if (state.assign === id) exitAssignMode();
  rebuildParamIndex();
  buildRacksArea();
  panel.refreshAutoButtons();
  renderLaneChips();
  timeline.draw();
  autosaveAutomation();
  commitHistory();
}

function renameRack(id, name) {
  const r = state.racks.find((x) => x.id === id);
  if (!r || !name.trim()) return;
  r.name = name.trim().slice(0, 24);
  rebuildParamIndex();
  buildRacksArea();
  autosaveAutomation();
  commitHistory();
}

function addDeviceToRack(rackId, deviceId) {
  const r = state.racks.find((x) => x.id === rackId);
  if (!r || !groupById(deviceId)) return false;
  claimDeviceForRack(r, deviceId);
  buildRacksArea(); panel.refresh(); autosaveAutomation(); commitHistory();
  return true;
}
function removeDeviceFromRack(rackId, deviceId) {
  const r = state.racks.find((x) => x.id === rackId);
  if (!r) return;
  r.deviceIds = r.deviceIds.filter((d) => d !== deviceId);
  removeMappingsForDevice(r, deviceId);
  buildRacksArea(); panel.refresh(); autosaveAutomation(); commitHistory();
}

const tempoMap = new TempoMap();

// Arrangement: loop region + user markers, beats-domain (glued to the grid
// like lanes). Stable object identities — the timeline mutates them in place.
const loopRegion = { startB: 0, endB: 0, on: false };
const songMarkers = [];

function loopValid() {
  return loopRegion.endB > loopRegion.startB + 1e-6;
}

// Push the loop region (converted to seconds) into the transport's native
// sample-accurate looping. Re-run after any tempo-grid change: the region is
// stored in beats, so its second-positions move with BPM corrections.
function syncTransportLoop() {
  transport.setLoop(
    tempoMap.timeAt(loopRegion.startB),
    tempoMap.timeAt(loopRegion.endB),
    loopRegion.on && loopValid(),
  );
  const btn = document.getElementById('loopBtn');
  if (btn) btn.classList.toggle('active', loopRegion.on && loopValid());
}

// Effective params at time t: active slot + enabled automation lanes, then
// macro mappings (modulation + intensity resolve inside the renderer).
// Used identically by the preview loop and the exporter.
function effParams(t) {
  let p = params();
  if (automation.hasLanes()) p = automation.apply(p, tempoMap.beatsAt(t));
  return applyMacros(p, state.racks);
}

function isMappedKey(key) {
  // Phase 3: reads per-rack macro mappings; harmless with state.racks = [].
  return state.racks.some((r) => (r.macros || []).some(
    (m) => (m.mappings || []).some((mm) => mm.key === key)));
}

function laneStateOf(key) {
  if (!automation.isAutomated(key)) return 'none';
  return automation.isEnabled(key) ? 'on' : 'off';
}

// Undo/redo over the automation + tempo state. Snapshots are tiny JSON
// strings, pushed at gesture boundaries (pointer-up, button clicks) — never
// per pointer-move.
const history = { stack: [], index: -1, max: 100 };

function historySnapshot() {
  return JSON.stringify({
    tempo: tempoMap.toJSON(),
    automation: automation.toJSON(),
    markers: songMarkers.map((m) => ({ b: m.b, name: m.name })),
    loop: { startB: loopRegion.startB, endB: loopRegion.endB, on: loopRegion.on },
    // Base param values too, so device-slider / reset / Auto edits undo as
    // well — committed at gesture boundaries (slider release, button click),
    // never per pointer-move. Automation lanes ride on top at render time.
    params: state.params,
    chain: state.chain,
    racks: state.racks,
    triggerSets: state.triggerSets, // Slice 3: trigger edits are undoable
  });
}

function commitHistory() {
  const snap = historySnapshot();
  if (history.stack[history.index] === snap) return;
  history.stack.splice(history.index + 1);
  history.stack.push(snap);
  if (history.stack.length > history.max) history.stack.shift();
  history.index = history.stack.length - 1;
}

function resetHistory() {
  history.stack = [historySnapshot()];
  history.index = 0;
}

function restoreHistory(snap) {
  const s = JSON.parse(snap);
  Object.assign(tempoMap, s.tempo);
  automation.load(s.automation);
  // markers + loop are restored in place — the timeline and transport hold
  // references to these same objects.
  songMarkers.length = 0;
  if (Array.isArray(s.markers)) {
    for (const m of s.markers) songMarkers.push({ b: m.b, name: m.name });
  }
  if (s.loop) Object.assign(loopRegion, s.loop);
  if (s.params) {
    state.params = s.params;
    panel.refresh();
    if (state.bank) state.bank.setResponse(responseOf(params()));
  }
  if (Array.isArray(s.chain)) state.chain = s.chain.slice();
  if (Array.isArray(s.racks)) { state.racks = sanitizeRacks(s.racks); rebuildParamIndex(); }
  if (Array.isArray(s.triggerSets)) {
    // an edited set may be open — if it vanished from the restored state, close.
    state.triggerSets = s.triggerSets;
    state.triggerSets.forEach(normalizeTriggerSet);
    if (state.editTriggerSet && !state.triggerSets.includes(state.editTriggerSet)) {
      const open = state.triggerSets.find((x) => x.id === (state.editTriggerSet || {}).id);
      if (open) { state.editTriggerSet = open; timeline.editTriggers(open); } else closeTriggerEdit();
    }
    refreshTriggerSources();
    buildTriggersSection();
  }
  closeLaneIfMissingFromSchema();
  panel.rebuild();
  if (state.bank) state.bank.setTempo(tempoMap.bpm, tempoMap.offset);
  syncTransportLoop();
  applyTempoUI();
  panel.refreshAutoButtons();
  renderLaneChips();
  updateReenable();
  buildRacksArea();
  timeline.draw();
  autosaveAutomation();
}

function undoAutomation() {
  if (history.index <= 0) return;
  history.index--;
  restoreHistory(history.stack[history.index]);
}

function redoAutomation() {
  if (history.index >= history.stack.length - 1) return;
  history.index++;
  restoreHistory(history.stack[history.index]);
}

// The full editable session as a plain object.
function buildSessionPayload() {
  return {
    tempo: tempoMap.toJSON(),
    automation: automation.toJSON(),
    chain: state.chain,
    racks: state.racks,
    loop: { ...loopRegion },
    markers: songMarkers.map((m) => ({ b: m.b, name: m.name })),
    // R6-P1: the whole look, not just its automation.
    params: state.params,
    packId: state.packId,
    reframe: state.reframe,
    followStructure: state.followStructure,
    followLocked: state.followLocked,
    triggerSets: state.triggerSets,
  };
}

// ----------------------------------------------- local UI preferences (item 3)
// App-global, NOT per-project, NOT in renders. Key is distinct from the
// per-project `sr:${projectId}` autosave key.
const UI_PREFS_DEFAULTS = { focus: true, triggerOverlays: true };
function loadUiPrefs() {
  try {
    const raw = localStorage.getItem('sr:ui-prefs');
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') return { ...UI_PREFS_DEFAULTS, ...parsed };
  } catch (e) { /* corrupt/disabled — fall back to defaults */ }
  return { ...UI_PREFS_DEFAULTS };
}
function saveUiPrefs(prefs) {
  try {
    localStorage.setItem('sr:ui-prefs', JSON.stringify(prefs));
  } catch (e) { /* storage full/disabled — non-fatal */ }
}

let autosaveTimer = 0;
function autosaveAutomation() {
  if (!state.project) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    const payload = JSON.stringify(buildSessionPayload());
    try {
      localStorage.setItem(`sr:${state.project.id}`, payload);
    } catch (e) { /* storage full/disabled — non-fatal */ }
    // mirror into the project dir so the session survives cleared storage
    fetch(`/api/project/${state.project.id}/session`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    }).catch(() => { /* non-fatal */ });
  }, 400);
}

async function restoreAutomation(projectId) {
  let saved = null;
  try {
    const raw = localStorage.getItem(`sr:${projectId}`);
    if (raw) saved = JSON.parse(raw);
  } catch (e) { /* corrupt local copy — try the server */ }
  if (!saved) {
    try {
      const resp = await fetch(`/api/project/${projectId}/session`);
      if (resp.ok) {
        const data = await resp.json();
        if (data && (data.automation || data.tempo)) saved = data;
      }
    } catch (e) { /* server copy unavailable — non-fatal */ }
  }
  if (!saved) return false;
  return applySessionData(saved);
}

// Apply a saved-session object to live state (used by project/session
// restore). songMarkers is reset by the caller before this runs.
function applySessionData(saved) {
  if (!saved) return false;
  try {
    if (saved.tempo) Object.assign(tempoMap, saved.tempo);
    automation.load(saved.automation);
    if (Array.isArray(saved.chain)) {
      state.chain = PARAM_GROUPS
        .filter((g) => g.pinned || saved.chain.includes(g.id))
        .map((g) => g.id);
    }
    state.racks = Array.isArray(saved.racks) ? sanitizeRacks(saved.racks) : [];
    rebuildParamIndex();
    if (saved.loop && Number.isFinite(saved.loop.startB) && Number.isFinite(saved.loop.endB)) {
      loopRegion.startB = Math.max(saved.loop.startB, 0);
      loopRegion.endB = Math.max(saved.loop.endB, 0);
      loopRegion.on = !!saved.loop.on;
    }
    if (Array.isArray(saved.markers)) {
      songMarkers.push(...saved.markers
        .filter((m) => m && Number.isFinite(m.b))
        .map((m) => ({ b: Math.max(m.b, 0), name: String(m.name || 'M').slice(0, 24) })));
      songMarkers.sort((a, z) => a.b - z.b);
    }
    // R8: single working param set (no A/B; old slots-based saves are ignored)
    if (saved.params && typeof saved.params === 'object') {
      state.params = { ...defaultParams(), ...saved.params };
    }
    if (STYLE_PACKS.some((p) => p.id === saved.packId)) state.packId = saved.packId;
    state.followStructure = !!saved.followStructure;
    state.followLocked = !!saved.followLocked;
    state.triggerSets = Array.isArray(saved.triggerSets) ? saved.triggerSets : [];
    state.triggerSets.forEach(normalizeTriggerSet); // Reactive S2: migrate to auto+pinned
    state.activeTriggerSet = null;
    if (saved.reframe) {
      for (const k of Object.keys(state.reframe)) {
        const r = saved.reframe[k];
        if (r && Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.scale)) {
          Object.assign(state.reframe[k], r);
        }
      }
    }
    return true;
  } catch (e) {
    return false;
  }
}

// ------------------------------------------------------------ device chain

// All param keys belonging to a device (toggle + params + mod depths).
function deviceKeys(group) {
  const keys = [];
  if (group.toggle) keys.push(group.toggle);
  for (const p of group.params) {
    keys.push(p.key);
    if (!group.noAuto && !p.type) {
      for (const src of MOD_SOURCES) keys.push(`${p.key}${MOD_SEP}${src}`);
    }
  }
  return keys;
}

// Make sure every device whose toggle is on is present in the chain
// (packs/presets/A-B slots can enable devices the chain doesn't show yet).
function syncChainToParams() {
  const p = params();
  const ids = new Set(state.chain);
  for (const g of PARAM_GROUPS) {
    if (g.pinned || (g.toggle && p[g.toggle] === true)) ids.add(g.id);
  }
  state.chain = PARAM_GROUPS.filter((g) => ids.has(g.id)).map((g) => g.id);
}

function addDevice(id) {
  const group = groupById(id);
  if (!group) return;
  if (!state.chain.includes(id)) {
    state.chain = PARAM_GROUPS
      .filter((g) => state.chain.includes(g.id) || g.id === id)
      .map((g) => g.id);
  }
  if (group.toggle) params()[group.toggle] = true; // adding a device turns it on
  if (group.id === 'feedback') renderer.resetFeedback();
  panel.rebuild();
  autosaveAutomation();
}

// Drop sparse modulation-config keys (`param~src@th` / `@gate`) belonging
// to a device from one slot.
function clearModConfig(slot, group) {
  const paramKeys = new Set(group.params.map((p) => p.key));
  for (const key of Object.keys(slot)) {
    const sep = key.indexOf(MOD_SEP);
    if (sep > 0 && key.includes('@') && paramKeys.has(key.slice(0, sep))) {
      delete slot[key];
    }
  }
}

// Per-device reset: params (incl. depths/thresholds) back to defaults,
// keeping the On/Off state and any automation lanes.
function resetDevice(id) {
  const group = groupById(id);
  if (!group) return;
  const defaults = defaultParams();
  const slot = state.params;
  for (const key of deviceKeys(group)) {
    if (key === group.toggle) continue;
    if (key in defaults) slot[key] = defaults[key];
    else delete slot[key];
  }
  clearModConfig(slot, group);
  panel.refresh();
  commitHistory();
  toast(`${group.label} reset to defaults`);
}

// ---- Auto colour-grade (Master Grade "Auto" button) --------------------
// One-shot: render a handful of representative frames offscreen with Grade
// neutralised (so we measure the *pre-grade* image and re-running never
// compounds), build a weighted luma histogram + channel means, derive a
// balanced grade (params.autoGradeFromStats — pure), and write it as static
// params. Determinism holds: the analysis only picks values; the live render
// stays a pure function of (t, params). Reversibility is the Grade ↺ (param
// edits are not in the timeline undo stack).
let autoGradeRenderer = null;

function autoGradeSize() {
  return state.aspect === '9:16' ? [144, 256]
    : state.aspect === '1:1' ? [200, 200] : [256, 144];
}

function autoGradeSampleTimes() {
  const bank = state.bank;
  const dur = bank ? bank.duration : 0;
  const secs = bank && bank.sections && bank.sections.length ? bank.sections : null;
  const times = [];
  if (secs) {
    for (let k = 0; k < secs.length; k++) {
      const t1 = k + 1 < secs.length ? secs[k + 1] : dur;
      times.push((secs[k] + t1) / 2);
    }
  } else {
    for (let i = 1; i <= 6; i++) times.push((dur * i) / 7);
  }
  times.push(loudestTime());
  const uniq = [];
  for (const t of times.sort((a, b) => a - b)) {
    if (!uniq.length || t - uniq[uniq.length - 1] > 0.25) uniq.push(t);
  }
  return uniq.slice(0, 8);
}

function runAutoGrade() {
  if (!state.project || !state.bank) { toast('Load a project first to auto-grade'); return; }
  const [aw, ah] = autoGradeSize();
  if (!autoGradeRenderer) autoGradeRenderer = new Renderer(document.createElement('canvas'));
  const r = autoGradeRenderer;
  r.setImage(state.imgBitmap);
  r.setDepth(state.depthBitmap);
  r.setSize(aw, ah);
  const hist = new Float32Array(256);
  let sumR = 0, sumG = 0, sumB = 0, sumSat = 0, wsum = 0;
  const reframe = { x: 0, y: 0, scale: 1 };
  for (const t of autoGradeSampleTimes()) {
    const feat = state.bank.sample(t);
    const p = { ...effParams(t), gradeOn: false }; // measure the ungraded image
    r.render(t, 1 / 30, feat, p, reframe, { toTexture: true });
    const px = r.readPixels();
    for (let i = 0; i < px.length; i += 4) {
      const a = px[i + 3] / 255;
      if (a <= 0) continue;
      const R = px[i] / 255, G = px[i + 1] / 255, B = px[i + 2] / 255;
      const luma = 0.2126 * R + 0.7152 * G + 0.0722 * B;
      hist[Math.min(255, Math.round(luma * 255))] += a;
      sumR += R * a; sumG += G * a; sumB += B * a;
      sumSat += (Math.max(R, G, B) - Math.min(R, G, B)) * a;
      wsum += a;
    }
  }
  if (!(wsum > 1e-6)) { toast('Nothing opaque to auto-grade (transparent base?)'); return; }
  const grade = autoGradeFromStats({
    hist, meanR: sumR / wsum, meanG: sumG / wsum, meanB: sumB / wsum, meanSat: sumSat / wsum,
  });
  if (!grade) { toast('Auto-grade: could not analyse the image'); return; }
  const slot = state.params;
  slot.gradeOn = true;
  for (const [k, v] of Object.entries(grade)) slot[k] = v;
  panel.refresh();
  autosaveAutomation();
  commitHistory(); // undoable (base-value edit)
  toast('Auto grade applied — tweak the Grade sliders, undo, or ↺ to revert');
}

function removeDevice(id) {
  const group = groupById(id);
  if (!group || group.pinned) return;
  if (state.lane && (SCHEMA_INDEX[state.lane] || {}).group === id) closeLane();
  state.chain = state.chain.filter((g) => g !== id);
  let touchedRacks = false;
  for (const rack of state.racks) {
    const before = rack.deviceIds.length;
    rack.deviceIds = rack.deviceIds.filter((d) => d !== id);
    touchedRacks = touchedRacks || rack.deviceIds.length !== before;
    touchedRacks = removeMappingsForDevice(rack, id) || touchedRacks;
  }
  const defaults = defaultParams();
  const slot = state.params;
  for (const key of deviceKeys(group)) {
    if (key in defaults) slot[key] = defaults[key];
    else delete slot[key];
  }
  clearModConfig(slot, group);
  if (group.toggle) slot[group.toggle] = false;
  let hadLanes = false;
  for (const key of deviceKeys(group)) {
    if (automation.isAutomated(key)) {
      automation.clear(key);
      hadLanes = true;
    }
  }
  panel.rebuild();
  if (touchedRacks) buildRacksArea();
  renderLaneChips();
  updateReenable();
  timeline.draw();
  autosaveAutomation();
  commitHistory();
  toast(`Removed ${group.label}${hadLanes ? ' (and its automation lanes)' : ''}`);
}

// ----------------------------------------------------------------- setup

const canvas = document.getElementById('glCanvas');
const guidesCanvas = document.getElementById('guides');
const stage = document.getElementById('stage');
const renderer = new Renderer(canvas);
const transport = new Transport();
const timeline = new Timeline(document.getElementById('timeline'), {
  onSeek: (t) => transport.seek(t),
  onLaneEdit: () => {
    panel.refreshAutoButtons();
    autosaveAutomation();
  },
  onLaneCommit: () => {
    // Hand-editing the generated Energy lane stops Follow-structure regen
    // (Live-style override latch). The Energy lane now lives on the first
    // rack's first macro key (firstMacroKey()), not the retired 'macro1'.
    const fmk = firstMacroKey();
    if (state.followStructure && fmk && state.lane === fmk) state.followLocked = true;
    commitHistory();
    renderLaneChips();
    updateReenable();
  },
  onTempoChange: (committed) => {
    if (state.bank) state.bank.setTempo(tempoMap.bpm, tempoMap.offset);
    syncTransportLoop();
    autosaveAutomation();
    if (committed) {
      commitHistory();
      toast(`Bar 1 anchored at ${formatTime(tempoMap.offset)} — automation stays glued to beats`);
    }
  },
  onArrange: (committed) => {
    syncTransportLoop();
    if (committed) {
      autosaveAutomation();
      commitHistory(); // loop + marker drags are undoable
    }
  },
  onMarkerMenu: (index, e) => showMarkerMenu(index, e.clientX, e.clientY),
  onRulerMenu: (beat, e) => showRulerMenu(beat, e.clientX, e.clientY),
  onLaneMenu: (e) => showLaneMenu(e.clientX, e.clientY),
  onTriggerEdit: () => { refreshTriggerSources(); autosaveAutomation(); }, // Slice 3: live
  onTriggerCommit: () => commitHistory(),                                  // Slice 3: undo step
  getBaseValue: (key) => {
    const v = params()[key];
    const s = SCHEMA_INDEX[key];
    if (s && s.type === 'enum') return Math.max(s.options.indexOf(v), 0);
    if (s && s.type === 'bool') return v ? 1 : 0;
    if (v === undefined) return s ? s.def || 0 : 0; // sparse mod-depth keys
    return v;
  },
});
timeline.automation = automation;
timeline.tempo = tempoMap;
timeline.loop = loopRegion;
timeline.markers = songMarkers;

state.params = defaultParams();   // R11-P0: clean default start, no look merged in
state.chain = defaultChain();
state.racks = [];                 // Racks v1: built in Phase 3 (no default rack)
syncChainToParams();

// Shared by the device panel and the macro rack.
function setParamValue(key, value, opts = {}) {
  params()[key] = value;
  // Live-style override latch: touching an automated param bypasses its
  // lane until the LED (or its lane editor) re-enables it.
  if (automation.isAutomated(key) && automation.isEnabled(key)) {
    automation.setEnabled(key, false);
    panel.refreshAutoButtons();
    renderLaneChips();
    updateReenable();
    refreshRacks();
    timeline.draw();
    toast(`Automation on "${SCHEMA_INDEX[key]?.label || key}" bypassed — click its ◆ to re-enable`);
    autosaveAutomation();
    commitHistory();
  }
  if (RESPONSE_KEYS.includes(key) && state.bank) {
    state.bank.setResponse(responseOf(params()));
  }
  if (key === 'feedbackOn' && value) renderer.resetFeedback();
  if (opts.refreshInput) panel.refresh();
  if (signalOpen && key.indexOf(MOD_SEP) >= 0) refreshSignalMapping();
  // R6-P1: slots are session-persisted — every edit autosaves (debounced)
  autosaveAutomation();
}

const panel = new ParamPanel(document.getElementById('paramPanels'), {
  getParams: params,
  getChain: () => state.chain,
  onAddDevice: (id) => addDevice(id),
  onRemoveDevice: (id) => removeDevice(id),
  onResetDevice: (id) => resetDevice(id),
  onAutoGrade: () => runAutoGrade(),
  setParam: setParamValue,
  onCommit: () => commitHistory(), // base-value edit gesture boundary → undoable
  onAutomation: (key) => openLane(key),
  onAutomationMenu: (key, e) => showQuickMenu(key, e.clientX, e.clientY),
  laneState: laneStateOf,
  isMapped: (key) => isMappedKey(key),
  getModSources: () => modSourceList(),
});
state.focus = loadUiPrefs().focus;   // app-global UI pref, not project state
state.triggerOverlays = loadUiPrefs().triggerOverlays;  // Slice 1b: overlay default
panel.focusMode = state.focus;

window.onerror = (msg, src, line) => {
  toast(`Error: ${msg} (${src ? src.split('/').pop() : '?'}:${line})`, 'error', 12000);
  document.title = `ERR: ${msg}`;
};

// ------------------------------------------------------------- macro rack

// WIP: racks are parked (2026-06-21). The rack ENGINE stays live but dormant
// (applyMacros/normalizeMapping/state.racks/persistence/undo all intact; with
// no racks created, applyMacros is a no-op and determinism is unaffected). Only
// the rack UI is hidden from the frontend. To revive racks, flip this to true —
// buildRacksArea() and refreshRackLibrary() gate on it. Parking it because the
// rack UX was adding complexity that got in the way; revisit once the desired
// rack feel is clearer.
const RACKS_ENABLED = false;

const macroRack = document.getElementById('macroRack');
const paramPanelsEl = document.getElementById('paramPanels');
let rackCells = [];   // [{rackId, macroIdx, key, slider, value, led, mapBtn}]

function sanitizeRacks(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter((r) => r && typeof r.id === 'string' && Array.isArray(r.macros)).slice(0, MAX_RACKS).map((r) => ({
    id: r.id, name: String(r.name || 'Rack').slice(0, 24),
    deviceIds: Array.isArray(r.deviceIds) ? r.deviceIds.filter((d) => groupById(d)) : [],
    macros: r.macros.filter(Boolean).slice(0, MACRO_SLOTS).map((m) => ({ name: String(m.name || 'Macro').slice(0, 24),
      mappings: Array.isArray(m.mappings)
        ? m.mappings.filter((mm) => mm && SCHEMA_INDEX[mm.key]).map((mm) => normalizeMapping(mm, SCHEMA_INDEX[mm.key]))
        : [] })),
  }));
}

function mapParamToMacro(rackId, macroIdx, key) {
  const s = SCHEMA_INDEX[key];
  if (!s || s.automatable === false || /^rk\d+\.m\d+$/.test(key)) {
    toast('That control cannot be macro-mapped.', 'error'); return;
  }
  const rack = state.racks.find((x) => x.id === rackId);
  if (!rack || !rack.macros[macroIdx]) return;
  // exclusive: a param belongs to one macro across all racks
  for (const r of state.racks)
    for (const mac of r.macros) mac.mappings = mac.mappings.filter((mm) => mm.key !== key);
  claimDeviceForRack(rack, s.group);
  rack.macros[macroIdx].mappings.push(normalizeMapping({ key }, s));
  if (automation.isAutomated(key))
    toast(`Note: the existing lane on "${s.label}" is ignored while macro-mapped`);
  panel.refresh(); buildRacksArea(); autosaveAutomation(); commitHistory();
  toast(`Mapped ${s.groupLabel} · ${s.label} → "${rack.macros[macroIdx].name}"`);
}

function removeMapping(rackId, macroIdx, j) {
  const rack = state.racks.find((x) => x.id === rackId);
  if (!rack || !rack.macros[macroIdx]) return;
  rack.macros[macroIdx].mappings.splice(j, 1);
  panel.refresh(); buildRacksArea(); autosaveAutomation(); commitHistory();
}

// Item 1: edit a single mapping's bounds/threshold/invert. Merges `patch`,
// re-normalizes against the live schema (clamp + min<max), and commits like
// removeMapping. No buildRacksArea() so the open disclosure + focus survive.
function updateMapping(rackId, macroIdx, j, patch) {
  const rack = state.racks.find((x) => x.id === rackId);
  if (!rack || !rack.macros[macroIdx]) return null;
  const mm = rack.macros[macroIdx].mappings[j];
  if (!mm) return null;
  const s = SCHEMA_INDEX[mm.key];
  if (!s) return null;
  const next = normalizeMapping({ ...mm, ...patch, key: mm.key }, s);
  rack.macros[macroIdx].mappings[j] = next;
  panel.refresh(); autosaveAutomation(); commitHistory();
  return next;
}

// Item 1: reset a mapping back to its schema default range/threshold. Unlike
// updateMapping, this calls buildRacksArea() (rebuilds the rack area, closing
// the disclosure) since it changes multiple fields at once.
function resetMapping(rackId, macroIdx, j) {
  const rack = state.racks.find((x) => x.id === rackId);
  if (!rack || !rack.macros[macroIdx]) return;
  const mm = rack.macros[macroIdx].mappings[j];
  if (!mm) return;
  const s = SCHEMA_INDEX[mm.key];
  if (!s) return;
  rack.macros[macroIdx].mappings[j] = normalizeMapping({ key: mm.key }, s);
  panel.refresh(); buildRacksArea(); autosaveAutomation(); commitHistory();
}

function addMacro(rackId) {
  const r = state.racks.find((x) => x.id === rackId);
  if (!r || r.macros.length >= MACRO_SLOTS) return;
  r.macros.push({ name: `Macro ${r.macros.length + 1}`, mappings: [] });
  params()[rackMacroKey(r.id, r.macros.length)] = 0;
  rebuildParamIndex(); buildRacksArea(); autosaveAutomation(); commitHistory();
}

function toggleMapMode(rackId, macroIdx) {
  const same = state.mapping && state.mapping.rackId === rackId && state.mapping.macroIdx === macroIdx;
  if (!same && state.assign != null) {
    state.assign = null;
    paramPanelsEl.classList.remove('assign-mode');
  }
  state.mapping = same ? null : { rackId, macroIdx };
  paramPanelsEl.classList.toggle('map-mode', state.mapping !== null);
  buildRacksArea();
  if (state.mapping) toast('Map mode: click any parameter to map it (Esc to exit)');
}

// Map mode exits to "no mapping". Live call sites: Escape key, applyPreset.
// state.mapping is now {rackId, macroIdx} | null (set by the Phase-3 rack UI).
function exitMapMode() {
  state.mapping = null;
  paramPanelsEl.classList.remove('map-mode');
  buildRacksArea();
}

paramPanelsEl.addEventListener('click', (e) => {
  if (!state.mapping) return;
  const rowEl = e.target.closest('[data-key]');
  if (!rowEl) return;
  e.preventDefault(); e.stopPropagation();
  mapParamToMacro(state.mapping.rackId, state.mapping.macroIdx, rowEl.getAttribute('data-key'));
}, true);

// Task 3.5: Assign mode mirrors Map mode but adds a whole device to a rack.
// Clicking any device header (or any of its params) resolves to the device
// group and adds it as rack membership. Toggle re-entry exits.
function enterAssignMode(rackId) {
  const same = state.assign === rackId;
  if (!same && state.mapping) {
    state.mapping = null;
    paramPanelsEl.classList.remove('map-mode');
  }
  state.assign = same ? null : rackId;
  paramPanelsEl.classList.toggle('assign-mode', state.assign != null);
  buildRacksArea();
  if (state.assign != null) toast('Assign mode: click a device (or any of its params) to add it to the rack — Esc to exit');
}
function exitAssignMode() {
  state.assign = null;
  paramPanelsEl.classList.remove('assign-mode');
  buildRacksArea();
}

paramPanelsEl.addEventListener('click', (e) => {
  if (state.assign == null) return;
  const row = e.target.closest('[data-key]');
  if (!row) return;
  e.preventDefault(); e.stopPropagation();
  const s = SCHEMA_INDEX[row.getAttribute('data-key')];
  if (!s || !s.group) toast('That control is not part of a device.', 'error');
  else if (!addDeviceToRack(state.assign, s.group)) toast('That rack no longer exists.', 'error');
  exitAssignMode();
}, true);

// Task 3.4: Build the standard quartet into a new rack in one click.
function autoRack() {
  if (state.racks.length >= MAX_RACKS) {
    toast(`A project can have up to ${MAX_RACKS} racks.`, 'error');
    return null;
  }
  const q = buildQuartet(state.chain, params());      // [{name,value,mappings}]
  const rack = { id: nextRackId(), name: 'Auto', deviceIds: [],
    macros: q.map((m) => ({ name: m.name, mappings: m.mappings })) };
  // membership = every device a mapping touches
  const groups = new Set();
  for (const m of q) for (const mm of m.mappings) {
    const s = paramIndex()[mm.key]; if (s) groups.add(s.group);
  }
  rack.deviceIds = [...groups];
  state.racks.push(rack);
  q.forEach((m, j) => { params()[rackMacroKey(rack.id, j + 1)] = m.value; });
  rebuildParamIndex(); buildRacksArea(); panel.refresh();
  autosaveAutomation(); commitHistory();
  return rack;
}

// Task 3.4: Key of the first rack's first macro, or null if no rack exists.
function firstMacroKey() {
  return state.racks[0] ? rackMacroKey(state.racks[0].id, 1) : null;
}

// R5-P5: Follow song structure. Writes a visible, editable lane on the
// Energy macro (rack macro 1) that ramps with each section's mean loudness —
// builds lift, drops hit — using detected sections, refined by user
// markers when present. Honest: it's an ordinary lane, not hidden magic.
function sectionBoundaries() {
  if (!state.bank) return [0];
  if (songMarkers.length) {
    const ts = songMarkers
      .map((m) => tempoMap.timeAt(m.b))
      .filter((t) => t > 0.05 && t < state.bank.duration);
    return [0, ...ts.sort((a, z) => a - z)];
  }
  return (state.bank.sections || [0]).slice();
}

function buildFollowStructure() {
  if (!state.bank) return;
  const energyKey = firstMacroKey();
  if (!energyKey) { toast('Add a rack first to follow song structure', 'error'); return; }
  const rms = state.bank.smoothed.rms;
  const fr = state.bank.frameRate;
  const dur = state.bank.duration;
  const bnd = sectionBoundaries();
  const means = bnd.map((t0, k) => {
    const t1 = k + 1 < bnd.length ? bnd[k + 1] : dur;
    const i0 = Math.max(Math.floor(t0 * fr), 0);
    const i1 = Math.min(Math.ceil(t1 * fr), rms.length);
    let s = 0;
    let n = 0;
    for (let i = i0; i < i1; i++) { s += rms[i]; n++; }
    return n ? s / n : 0;
  });
  const lo = Math.min(...means);
  const hi = Math.max(...means);
  const span = hi - lo;
  automation.clear(energyKey);
  bnd.forEach((t0, k) => {
    const v = span < 1e-4 ? 0.6 : 0.15 + 0.85 * (means[k] - lo) / span;
    automation.addPoint(energyKey, Math.max(tempoMap.beatsAt(t0), 0), v);
  });
  panel.refreshAutoButtons();
  renderLaneChips();
  updateReenable();
  refreshRacks();
  timeline.draw();
  autosaveAutomation();
}

function setFollowStructure(on) {
  state.followStructure = on;
  if (on) {
    // TODO Phase 3: ensure an Energy macro exists on a rack before ramping.
    state.followLocked = false;
    buildFollowStructure();
    commitHistory();
    const n = sectionBoundaries().length;
    toast(n > 1
      ? `Follow structure on — Energy ramps across ${n} sections (edit the Energy macro lane to customise)`
      : 'Follow structure on, but no sections detected — add markers to shape the build');
  } else {
    const k = firstMacroKey(); if (k) automation.clear(k);
    panel.refreshAutoButtons();
    renderLaneChips();
    updateReenable();
    timeline.draw();
    commitHistory();
    autosaveAutomation();
    toast('Follow structure off — Energy lane cleared');
  }
}

// Task 3.5: the Racks area. Renders state.racks as rack cards inside #macroRack:
// the header + add controls render unconditionally (so the UI is reachable even
// with no project); the empty hint only shows when there are no racks.
function buildRacksArea() {
  if (!RACKS_ENABLED) {           // WIP: rack UI parked — render nothing, stay hidden
    macroRack.textContent = '';
    rackCells = [];
    macroRack.hidden = true;
    return;
  }
  macroRack.hidden = false;
  macroRack.textContent = '';
  rackCells = [];
  const canAddRack = state.racks.length < MAX_RACKS;
  macroRack.append(el('div', { class: 'rack-header' },
    el('span', { text: 'RACKS' }),
    canAddRack ? el('button', { class: 'ctl-btn ctl-mini rack-add', 'data-add-rack': '1',
      text: '+ Rack', onclick: () => createRack(`Rack ${state.racks.length + 1}`) }) : null,
    canAddRack ? el('button', { class: 'ctl-btn ctl-mini', text: 'Load rack',
      title: 'Browse saved rack presets', onclick: () => focusRackLibrary() }) : null));
  if (!state.racks.length) {
    macroRack.append(el('div', { class: 'macro-empty' },
      el('div', { class: 'macro-empty-h', text: 'No racks yet' }),
      el('div', { class: 'hint', text: 'Add a rack to build macro knobs over your devices.' })));
  }
  for (const rack of state.racks) macroRack.append(buildRackCard(rack));
  refreshRacks();
}

function buildRackCard(rack) {
  const card = el('div', { class: 'rack-card', 'data-rack-id': rack.id });
  const title = el('div', { class: 'rack-title', text: rack.name, title: 'double-click to rename',
    ondblclick: () => { const n = prompt('Rack name', rack.name); if (n) renameRack(rack.id, n); } });
  const meta = el('div', { class: 'rack-meta',
    text: `${rack.macros.length}/${MACRO_SLOTS} macros · ${rack.deviceIds.length} devices` });
  const del = el('button', { class: 'mini-del', text: '×', title: 'delete rack',
    onclick: () => deleteRack(rack.id) });
  const save = el('button', { class: 'ctl-btn ctl-mini', text: 'Save', title: 'save to library',
    onclick: () => saveRack(rack.id) });
  card.append(el('div', { class: 'rack-card-head' },
    el('div', { class: 'rack-title-stack' }, title, meta),
    save,
    del));
  const grid = el('div', { class: 'rack-macro-list' });
  rack.macros.forEach((m, j) => grid.append(buildMacroCell(rack, j)));
  card.append(grid);
  if (rack.macros.length < MACRO_SLOTS) {
    card.append(el('button', { class: 'ctl-btn ctl-mini rack-add-macro', 'data-add-macro': rack.id,
      text: '+ macro', onclick: () => addMacro(rack.id) }));
  }
  // Device membership is rack-level metadata, not per-macro ownership.
  const devList = el('div', { class: 'rack-devices-list' });
  if (rack.deviceIds.length) {
    rack.deviceIds.forEach((d) => devList.append(el('button', { class: 'rack-dev-chip',
      title: 'remove from rack',
      text: (groupById(d) || { label: d }).label,
      onclick: () => removeDeviceFromRack(rack.id, d) })));
  } else {
    devList.append(el('span', { class: 'rack-empty-inline', text: 'No devices assigned' }));
  }
  devList.append(el('button', { class: 'ctl-btn ctl-mini', text: '+ devices',
    onclick: () => enterAssignMode(rack.id) }));
  const dev = el('details', { class: 'rack-devices' },
    el('summary', { class: 'rack-devices-summary' },
      el('span', { text: 'Devices in rack' }),
      el('span', { class: 'rack-dev-count', text: `${rack.deviceIds.length}` })),
    devList);
  card.append(dev);
  return card;
}

function mappingLabel(mm) {
  const s = SCHEMA_INDEX[mm.key];
  return s ? `${s.groupLabel} · ${s.label}` : mm.key;
}

function formatMappingValue(v) {
  return Number.isInteger(v) ? String(v) : (+v).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function mappingPreview(mappings) {
  if (!mappings.length) return 'No mapped parameters';
  const labels = mappings.slice(0, 2).map(mappingLabel).join(', ');
  return mappings.length > 2 ? `${labels}, +${mappings.length - 2}` : labels;
}

function buildMacroCell(rack, j) {
  const key = rackMacroKey(rack.id, j + 1);
  const macro = rack.macros[j];
  const name = el('div', { class: 'macro-name', text: rack.macros[j].name, title: 'double-click to rename',
    ondblclick: () => { const n = prompt('Macro name', rack.macros[j].name);
      if (n && n.trim()) { rack.macros[j].name = n.trim().slice(0, 24); rebuildParamIndex(); buildRacksArea(); autosaveAutomation(); } } });
  const value = el('span', { class: 'macro-value', text: '0.00' });
  const slider = el('input', { type: 'range', min: 0, max: 1, step: 0.01,
    oninput: (e) => { const v = parseFloat(e.target.value); value.textContent = v.toFixed(2); setParamValue(key, v); },
    ondblclick: () => { value.textContent = '0.00'; setParamValue(key, 0, { refreshInput: false }); slider.value = 0; } });
  slider.addEventListener('pointerdown', () => { slider._held = true; });
  const rel = () => { slider._held = false; };
  slider.addEventListener('pointerup', rel); slider.addEventListener('pointercancel', rel);
  const led = el('button', { class: 'auto-btn', text: '◆', title: 'automate this macro',
    onclick: () => openLane(key),
    oncontextmenu: (e) => { e.preventDefault(); showQuickMenu(key, e.clientX, e.clientY); } });
  const mapBtn = el('button', { class: 'macro-map', text: 'Map', title: 'Map a parameter to this macro',
    onclick: () => toggleMapMode(rack.id, j) });
  const maps = el('details', { class: 'macro-mappings', 'data-macro-mappings': key },
    el('summary', { class: 'macro-map-summary' },
      el('span', { class: 'macro-map-count', text: `${macro.mappings.length}` }),
      el('span', { class: 'macro-map-preview', text: mappingPreview(macro.mappings) })));
  macro.mappings.forEach((mm, idx) => {
    const s = SCHEMA_INDEX[mm.key] || {};
    const eff = el('span', { class: 'map-eff', text: '' });
    let editor;
    if (s.type === 'bool') {
      const thrIn = el('input', { class: 'map-threshold', type: 'number',
        min: 0, max: 1, step: 0.05, value: Number.isFinite(mm.threshold) ? mm.threshold : 0.5,
        title: 'macro position where this turns on',
        onchange: (e) => { const r = updateMapping(rack.id, j, idx, { threshold: parseFloat(e.target.value) });
          if (r) e.target.value = r.threshold; } });
      const invBtn = el('button', { class: 'map-invert' + (mm.invert ? ' active' : ''),
        text: 'invert', title: 'turn on below the threshold instead',
        onclick: () => { updateMapping(rack.id, j, idx, { invert: !mm.invert }); buildRacksArea(); } });
      editor = el('span', { class: 'map-ctl' }, el('span', { class: 'map-thr-label', text: 'thr' }), thrIn, invBtn);
    } else if (s.type === 'enum') {
      const mkSel = (cls, val) => {
        const sel = el('select', { class: cls });
        (s.options || []).forEach((opt, oi) => sel.append(el('option', { value: oi, text: String(opt) })));
        sel.value = String(val);
        return sel;
      };
      const loSel = mkSel('map-enum-lo', mm.min);
      const hiSel = mkSel('map-enum-hi', mm.max);
      loSel.onchange = (e) => { const r = updateMapping(rack.id, j, idx, { min: parseInt(e.target.value, 10) }); if (r) buildRacksArea(); };
      hiSel.onchange = (e) => { const r = updateMapping(rack.id, j, idx, { max: parseInt(e.target.value, 10) }); if (r) buildRacksArea(); };
      editor = el('span', { class: 'map-ctl' }, loSel, el('span', { class: 'map-arrow', text: '->' }), hiSel);
    } else {
      const mkNum = (cls, val) => el('input', { class: cls, type: 'number',
        min: s.min, max: s.max, step: s.step, value: val });
      const loIn = mkNum('map-min', mm.min);
      const hiIn = mkNum('map-max', mm.max);
      loIn.onchange = (e) => { const r = updateMapping(rack.id, j, idx, { min: parseFloat(e.target.value) }); if (r) { loIn.value = r.min; hiIn.value = r.max; } };
      hiIn.onchange = (e) => { const r = updateMapping(rack.id, j, idx, { max: parseFloat(e.target.value) }); if (r) { loIn.value = r.min; hiIn.value = r.max; } };
      editor = el('span', { class: 'map-ctl' }, loIn, el('span', { class: 'map-dash', text: '-' }), hiIn);
    }
    maps.append(el('div', { class: 'map-row', 'data-map-idx': idx },
      el('span', { class: 'map-label', title: mappingLabel(mm), text: mappingLabel(mm) }),
      editor, eff,
      el('button', { class: 'map-reset', text: 'reset', title: 'reset to default range',
        onclick: () => resetMapping(rack.id, j, idx) }),
      el('button', { class: 'mini-del', text: '×', title: 'remove mapping',
        onclick: () => removeMapping(rack.id, j, idx) })));
  });
  const cell = el('div', { class: 'macro-cell' },
    el('div', { class: 'macro-head' }, name, value),
    slider,
    el('div', { class: 'macro-foot' }, led, mapBtn),
    maps);
  rackCells.push({ rackId: rack.id, macroIdx: j, key, slider, value, led, mapBtn, mapsEl: maps });
  return cell;
}

// Item 1: when a macro's mapping disclosure is open, show each mapped param's
// resolved value at the macro's current position. Cheap: only open <details>.
function refreshMapEffective(c) {
  if (!c.mapsEl || !c.mapsEl.open) return;
  const rack = state.racks.find((x) => x.id === c.rackId);
  const macro = rack && rack.macros[c.macroIdx];
  if (!macro) return;
  const v = params()[c.key] === undefined ? 0 : params()[c.key];
  const rows = c.mapsEl.querySelectorAll('.map-row');
  macro.mappings.forEach((mm, idx) => {
    const cell = rows[idx] && rows[idx].querySelector('.map-eff');
    if (!cell) return;
    const s = SCHEMA_INDEX[mm.key];
    if (!s) { cell.textContent = ''; return; }
    if (s.type === 'bool') {
      const thr = Number.isFinite(mm.threshold) ? mm.threshold : 0.5;
      cell.textContent = (mm.invert ? v < thr : v >= thr) ? 'on' : 'off';
    } else if (s.type === 'enum') {
      const val = mm.min + (mm.max - mm.min) * v;
      const oi = Math.round(Math.min(Math.max(val, 0), s.options.length - 1));
      cell.textContent = String(s.options[oi]);
    } else {
      cell.textContent = formatMappingValue(mm.min + (mm.max - mm.min) * v);
    }
  });
}

function refreshRacks() {
  const p = params();
  for (const c of rackCells) {
    const v = p[c.key] === undefined ? 0 : p[c.key];
    if (!c.slider._held) c.slider.value = v;
    c.value.textContent = (+v).toFixed(2);
    const s = laneStateOf(c.key);
    c.led.classList.toggle('lane-on', s === 'on');
    c.led.classList.toggle('lane-off', s === 'off');
    const active = state.mapping && state.mapping.rackId === c.rackId && state.mapping.macroIdx === c.macroIdx;
    c.mapBtn.classList.toggle('active', !!active);
    refreshMapEffective(c);
  }
  if (signalOpen) refreshSignalMapping();
}

buildRacksArea();

// R11 terminology pass: context mode is now binary — start (no project, the
// Audio drop / source-preview surface) vs edit (a project is loaded, the
// device chain is always visible). The Simple/Devices toggle was retired;
// progressive disclosure now lives in the macro rack + Focus mode + More…
// folds, so the device chain is never hidden behind a mode.
function applyMode() {
  document.body.classList.toggle('mode-start', !state.project);
  document.body.classList.toggle('mode-edit', !!state.project);
}

// L2 → L3 thread: jump to a mapped parameter inside its device, highlighted.
function revealParam(key) {
  const s = SCHEMA_INDEX[key];
  if (!s || s.group === 'macros') return;
  if (!state.chain.includes(s.group)) {
    state.chain = PARAM_GROUPS.filter((g) => state.chain.includes(g.id) || g.id === s.group)
      .map((g) => g.id);
  }
  panel.openDevices.add(s.group);
  panel.rebuild();
  panel.highlight(key);
  const row = paramPanelsEl.querySelector(`[data-key="${CSS.escape(key)}"]`);
  if (row) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// ------------------------------------------------------------ top bar UI

// R7-3: the Style dropdown is gone — the Look browser (left sidebar) is the
// single entry for picking a look. applyPack stays, driven by the tiles.
function applyPack(packId) {
  state.packId = packId;
  state.params = { ...defaultParams(), ...getPack(packId).overrides };
  syncChainToParams();
  panel.rebuild();
  refreshRacks();
  renderer.resetFeedback();
  if (state.bank) state.bank.setResponse(responseOf(params()));
  autosaveAutomation();
}

const aspectSeg = document.getElementById('aspectSeg');
for (const a of Object.keys(ASPECTS)) {
  const btn = el('button', {
    text: a,
    class: a === state.aspect ? 'active' : '',
    onclick: () => {
      state.aspect = a;
      for (const b of aspectSeg.children) b.classList.toggle('active', b.textContent === a);
      layoutCanvas();
      refreshLooks(); // thumbnails are aspect-specific
    },
  });
  aspectSeg.append(btn);
}

const fpsSelect = document.getElementById('fpsSelect');
fpsSelect.addEventListener('change', () => { state.fps = parseInt(fpsSelect.value, 10); });

document.getElementById('guidesBtn').addEventListener('click', (e) => {
  state.guides = !state.guides;
  e.target.classList.toggle('active', state.guides);
  drawGuides();
});

// ------------------------------------------- lane editor + tempo controls

const laneCluster = document.getElementById('laneCluster');
const laneInfo = document.getElementById('laneInfo');
const bottomBar = document.getElementById('bottom');
const laneChips = document.getElementById('laneChips');
const reenableBtn = document.getElementById('reenableBtn');

function anyLaneBypassed() {
  for (const [, lane] of automation.lanes) {
    if (lane.points.length && !lane.enabled) return true;
  }
  return false;
}

// Live's orange button: visible whenever any lane is override-bypassed.
function updateReenable() {
  reenableBtn.hidden = !anyLaneBypassed();
}

reenableBtn.addEventListener('click', () => {
  for (const key of automation.lanes.keys()) automation.setEnabled(key, true);
  panel.refreshAutoButtons();
  renderLaneChips();
  updateReenable();
  timeline.draw();
  autosaveAutomation();
  commitHistory();
  toast('All automation re-enabled');
});

// Chips strip: one chip per automated lane — fast switching across the
// hundreds of possible targets (params × mod depths × device toggles).
function renderLaneChips() {
  laneChips.hidden = !state.lane;
  laneChips.textContent = '';
  if (!state.lane) return;
  const keys = [...automation.lanes.keys()];
  if (!keys.length) {
    laneChips.append(el('span', {
      class: 'hint',
      text: 'no automation lanes yet — click and drag in the lane below ([ and ] cycle lanes)',
    }));
    return;
  }
  for (const key of keys) {
    const s = SCHEMA_INDEX[key] || { label: key, groupLabel: '?' };
    const lane = automation.lane(key);
    const chip = el('div', {
      class: 'lane-chip'
        + (key === state.lane ? ' active' : '')
        + (lane && !lane.enabled ? ' bypassed' : ''),
      onclick: () => openLane(key),
    },
    el('span', { class: 'chip-dot' }),
    el('span', { class: 'chip-label', text: `${s.groupLabel} · ${s.label}` }));
    chip.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showQuickMenu(key, e.clientX, e.clientY);
    });
    chip.append(
    el('span', {
      class: 'chip-del', text: '×', title: 'delete this lane',
      onclick: (e) => {
        e.stopPropagation();
        automation.clear(key);
        panel.refreshAutoButtons();
        renderLaneChips();
        updateReenable();
        timeline.draw();
        autosaveAutomation();
        commitHistory();
      },
    }));
    laneChips.append(chip);
  }
}

function cycleLane(dir) {
  const keys = [...automation.lanes.keys()];
  if (!keys.length || !state.lane) return;
  let i = keys.indexOf(state.lane);
  if (i < 0) i = 0;
  else i = (i + dir + keys.length) % keys.length;
  openLane(keys[i]);
}

function openLane(key) {
  if (!state.project) {
    toast('Load a project first — automation lives on the song timeline.', 'error');
    return;
  }
  if (!SCHEMA_INDEX[key]) {
    toast('That automation target no longer exists.', 'error');
    closeLane();
    return;
  }
  if (isMappedKey(key)) {
    toast('This parameter is macro-mapped — automate the macro instead.', 'error');
    return;
  }
  if (automation.isAutomated(key) && !automation.isEnabled(key)) {
    automation.setEnabled(key, true);
    toast(`Automation on "${SCHEMA_INDEX[key].label}" re-enabled`);
    autosaveAutomation();
    commitHistory();
  }
  state.lane = key;
  if (state.editTriggerSet) { state.editTriggerSet = null; buildTriggersSection(); } // Slice 3: exclusive
  const s = SCHEMA_INDEX[key];
  laneInfo.textContent = `${s.groupLabel} · ${s.label}`;
  laneCluster.hidden = false;
  bottomBar.classList.add('lane-open');
  applyStoredBarHeight();
  timeline.openLane(key);
  panel.refreshAutoButtons();
  panel.highlight(key);
  renderLaneChips();
  updateReenable();
  refreshRacks();
}

function closeLane() {
  state.lane = null;
  const wasEditingTriggers = !!state.editTriggerSet;
  state.editTriggerSet = null;
  laneCluster.hidden = true;
  bottomBar.classList.remove('lane-open');
  applyStoredBarHeight();
  timeline.closeLane();
  panel.highlight(null);
  renderLaneChips();
  if (wasEditingTriggers) buildTriggersSection();
}

// Resizable timeline: drag the strip above the bottom bar. The closed bar
// and the open lane editor remember independent heights.
const bottomResize = document.getElementById('bottomResize');
const barHeightKey = () => (bottomBar.classList.contains('lane-open') ? 'sr:laneHeight' : 'sr:barHeight');
function applyStoredBarHeight() {
  const open = bottomBar.classList.contains('lane-open');
  const stored = parseInt(localStorage.getItem(barHeightKey()) || '', 10);
  const min = open ? 160 : 100;
  if (stored >= min && stored <= window.innerHeight * 0.7) {
    bottomBar.style.height = `${stored}px`;
  } else {
    bottomBar.style.height = '';
  }
}
applyStoredBarHeight();
let resizeDrag = null;
bottomResize.addEventListener('pointerdown', (e) => {
  resizeDrag = { y: e.clientY, h: bottomBar.getBoundingClientRect().height };
  bottomBar.classList.add('resizing');
  bottomResize.setPointerCapture(e.pointerId);
});
bottomResize.addEventListener('pointermove', (e) => {
  if (!resizeDrag) return;
  const min = bottomBar.classList.contains('lane-open') ? 160 : 100;
  const h = clamp(resizeDrag.h + (resizeDrag.y - e.clientY), min, window.innerHeight * 0.7);
  bottomBar.style.height = `${Math.round(h)}px`;
});
bottomResize.addEventListener('pointerup', (e) => {
  if (!resizeDrag) return;
  resizeDrag = null;
  bottomBar.classList.remove('resizing');
  try {
    localStorage.setItem(barHeightKey(), String(Math.round(bottomBar.getBoundingClientRect().height)));
  } catch (err) { /* storage disabled — non-fatal */ }
  try { bottomResize.releasePointerCapture(e.pointerId); } catch (err) { /* released */ }
});

// Resizable device panel: drag the strip on its left edge. The stage
// reflows through its existing ResizeObserver.
const rightPanel = document.getElementById('right');
const rightResize = document.getElementById('rightResize');
{
  const stored = parseInt(localStorage.getItem('sr:panelWidth') || '', 10);
  if (stored >= 240 && stored <= 560) rightPanel.style.width = `${stored}px`;
}
let panelDrag = null;
rightResize.addEventListener('pointerdown', (e) => {
  panelDrag = { x: e.clientX, w: rightPanel.getBoundingClientRect().width };
  rightResize.setPointerCapture(e.pointerId);
});
rightResize.addEventListener('pointermove', (e) => {
  if (!panelDrag) return;
  const w = clamp(panelDrag.w + (panelDrag.x - e.clientX), 240, 560);
  rightPanel.style.width = `${Math.round(w)}px`;
});
rightResize.addEventListener('pointerup', (e) => {
  if (!panelDrag) return;
  panelDrag = null;
  try {
    localStorage.setItem('sr:panelWidth', String(Math.round(rightPanel.getBoundingClientRect().width)));
  } catch (err) { /* storage disabled — non-fatal */ }
  try { rightResize.releasePointerCapture(e.pointerId); } catch (err) { /* released */ }
});

// Left (Inputs) panel resize — mirror of the right handle.
const leftPanel = document.getElementById('left');
const leftResize = document.getElementById('leftResize');
{
  const stored = parseInt(localStorage.getItem('sr:leftWidth') || '', 10);
  if (stored >= 180 && stored <= 420) leftPanel.style.width = `${stored}px`;
}
let leftDrag = null;
leftResize.addEventListener('pointerdown', (e) => {
  leftDrag = { x: e.clientX, w: leftPanel.getBoundingClientRect().width };
  leftResize.setPointerCapture(e.pointerId);
});
leftResize.addEventListener('pointermove', (e) => {
  if (!leftDrag) return;
  leftPanel.style.width = `${Math.round(clamp(leftDrag.w + (e.clientX - leftDrag.x), 180, 420))}px`;
});
leftResize.addEventListener('pointerup', (e) => {
  if (!leftDrag) return;
  leftDrag = null;
  try {
    localStorage.setItem('sr:leftWidth', String(Math.round(leftPanel.getBoundingClientRect().width)));
  } catch (err) { /* storage disabled — non-fatal */ }
  try { leftResize.releasePointerCapture(e.pointerId); } catch (err) { /* released */ }
});

// ----------------------------------------------- lane quick-action menu

let quickMenu = null;
function closeQuickMenu() {
  if (quickMenu) {
    quickMenu.remove();
    quickMenu = null;
  }
}

// Template point patterns written at the playhead (right-click a ◆ or chip).
function quickAction(key, action) {
  const s = SCHEMA_INDEX[key];
  if (!s || s.type === 'enum' || s.type === 'bool') return;
  const bpb = tempoMap.beatsPerBar;
  const b0 = Math.max(snapBeats(tempoMap.beatsAt(transport.time), 'bar', bpb), 0);
  const baseRaw = params()[key];
  const base = baseRaw === undefined ? (s.def || 0) : baseRaw;
  const lo = s.min;
  if (action === 'fadeIn') {
    automation.addPoint(key, b0, lo);
    automation.addPoint(key, b0 + 4 * bpb, base);
  } else if (action === 'fadeOut') {
    automation.addPoint(key, b0, base);
    automation.addPoint(key, b0 + 4 * bpb, lo);
  } else if (action === 'pulse') {
    for (let k = 0; k < 4; k++) {
      automation.addPoint(key, b0 + k * bpb, base);
      automation.addPoint(key, b0 + (k + 0.5) * bpb, lo);
    }
    automation.addPoint(key, b0 + 4 * bpb, base);
  }
  automation.setEnabled(key, true);
  openLane(key);
  panel.refreshAutoButtons();
  renderLaneChips();
  timeline.draw();
  autosaveAutomation();
  commitHistory();
  toast(`${s.label}: ${action === 'pulse' ? 'pulse ×4 bars' : action} written at the playhead — Ctrl+Z undoes`);
}

// Generic small context menu (shared by quick actions, markers, the ruler).
function showMenu(title, items, cx, cy) {
  closeQuickMenu();
  quickMenu = el('div', { class: 'quick-menu' },
    title ? el('div', { class: 'quick-title', text: title }) : null,
    ...items.map(([label, fn]) => el('button', {
      class: 'quick-item', text: label,
      onclick: () => {
        closeQuickMenu();
        fn();
      },
    })));
  document.body.append(quickMenu);
  const rect = quickMenu.getBoundingClientRect();
  quickMenu.style.left = `${Math.min(cx, window.innerWidth - rect.width - 8)}px`;
  quickMenu.style.top = `${Math.min(cy, window.innerHeight - rect.height - 8)}px`;
  setTimeout(() => {
    document.addEventListener('pointerdown', (e) => {
      if (quickMenu && !quickMenu.contains(e.target)) closeQuickMenu();
    }, { once: true });
  }, 0);
}

// R11 terminology pass: the always-visible timeline help row became a `?`
// popover in the transport. Same dismissal model as the quick menu
// (outside-click / Esc); anchored above the button since the row is at the
// bottom of the window.
const shortcutsBtn = document.getElementById('shortcutsBtn');
let shortcutsPop = null;
function onShortcutsDown(e) {
  if (shortcutsPop && !shortcutsPop.contains(e.target) && e.target !== shortcutsBtn) closeShortcuts();
}
function onShortcutsKey(e) {
  if (e.key === 'Escape') closeShortcuts();
}
function closeShortcuts() {
  if (!shortcutsPop) return;
  shortcutsPop.remove();
  shortcutsPop = null;
  document.removeEventListener('pointerdown', onShortcutsDown);
  document.removeEventListener('keydown', onShortcutsKey);
}
function openShortcuts() {
  closeShortcuts();
  const group = (title, rows) => el('div', { class: 'sc-group' },
    el('h4', { text: title }),
    el('dl', {}, ...rows.flatMap(([k, v]) => [
      el('dt', { text: k }), el('dd', { text: v }),
    ])));
  shortcutsPop = el('div',
    { class: 'shortcuts-pop', role: 'dialog', 'aria-label': 'Keyboard and mouse shortcuts' },
    group('Transport', [
      ['Space', 'play / pause'],
      ['Ctrl+Z', 'undo'],
    ]),
    group('Timeline — mouse', [
      ['Wheel', 'zoom'],
      ['Shift+wheel / middle-drag', 'pan'],
      ['Drag to edge', 'scroll'],
      ['Double-click ruler', 'add marker'],
      ['Drag ⚑1', 'set the downbeat'],
    ]),
    group('Timeline — keys', [
      ['F', 'fit the whole song'],
      ['← / →', 'jump'],
      ['D', 'toggle Draw / Move'],
      ['Esc', 'close the open lane'],
    ]));
  document.body.append(shortcutsPop);
  const b = shortcutsBtn.getBoundingClientRect();
  const r = shortcutsPop.getBoundingClientRect();
  shortcutsPop.style.left = `${Math.max(8, Math.min(b.left, window.innerWidth - r.width - 8))}px`;
  shortcutsPop.style.top = `${Math.max(8, b.top - r.height - 8)}px`;
  setTimeout(() => {
    document.addEventListener('pointerdown', onShortcutsDown);
    document.addEventListener('keydown', onShortcutsKey);
  }, 0);
}
shortcutsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (shortcutsPop) closeShortcuts(); else openShortcuts();
});

// ----------------------------------------------- UI settings popover (item 3)
const settingsBtn = document.getElementById('settingsBtn');
let settingsPop = null;
function onSettingsDown(e) {
  if (settingsPop && !settingsPop.contains(e.target) && e.target !== settingsBtn) closeSettings();
}
function onSettingsKey(e) {
  if (e.key === 'Escape') closeSettings();
}
function closeSettings() {
  if (!settingsPop) return;
  settingsPop.remove();
  settingsPop = null;
  document.removeEventListener('pointerdown', onSettingsDown);
  document.removeEventListener('keydown', onSettingsKey);
}
function openSettings() {
  closeSettings();
  const saveBoth = () => saveUiPrefs({ focus: state.focus, triggerOverlays: state.triggerOverlays });
  const focusCb = el('input', {
    type: 'checkbox',
    onchange: (e) => {
      state.focus = e.target.checked;
      panel.setFocusMode(state.focus);
      saveBoth();
    },
  });
  focusCb.checked = state.focus; // property, not attribute (el routes unknowns to setAttribute)
  const ovCb = el('input', {
    type: 'checkbox',
    onchange: (e) => { state.triggerOverlays = e.target.checked; saveBoth(); pushTriggerOverlays(); },
  });
  ovCb.checked = state.triggerOverlays !== false;
  settingsPop = el('div',
    { class: 'settings-pop', role: 'dialog', 'aria-label': 'UI settings' },
    el('h4', { text: 'UI settings' }),
    el('label', { class: 'settings-row' },
      focusCb,
      el('span', { class: 'settings-text' },
        el('strong', { text: 'Focus mode' }),
        el('span', { class: 'hint', text: 'work on one device at a time' }))),
    el('label', { class: 'settings-row' },
      ovCb,
      el('span', { class: 'settings-text' },
        el('strong', { text: 'Show trigger overlays' }),
        el('span', { class: 'hint', text: 'colored trigger ticks on the timeline' }))));
  document.body.append(settingsPop);
  const b = settingsBtn.getBoundingClientRect();
  const r = settingsPop.getBoundingClientRect();
  // right-align the popover under the gear (it now sits near the right edge)
  settingsPop.style.left = `${Math.max(8, Math.min(b.right - r.width, window.innerWidth - r.width - 8))}px`;
  settingsPop.style.top = `${Math.min(window.innerHeight - r.height - 8, b.bottom + 6)}px`;
  setTimeout(() => {
    document.addEventListener('pointerdown', onSettingsDown);
    document.addEventListener('keydown', onSettingsKey);
  }, 0);
}
settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (settingsPop) closeSettings(); else openSettings();
});

function showQuickMenu(key, cx, cy) {
  const s = SCHEMA_INDEX[key];
  if (!s || s.type === 'enum' || s.type === 'bool') {
    toast('Quick actions need a continuous parameter.', 'error');
    return;
  }
  if (!state.project) {
    toast('Load a project first — automation lives on the song timeline.', 'error');
    return;
  }
  if (isMappedKey(key)) {
    toast('This parameter is macro-mapped — use quick actions on the macro instead.', 'error');
    return;
  }
  showMenu(`${s.groupLabel} · ${s.label}`, [
    ['Fade in over 4 bars', () => quickAction(key, 'fadeIn')],
    ['Fade out over 4 bars', () => quickAction(key, 'fadeOut')],
    ['Pulse every bar ×4', () => quickAction(key, 'pulse')],
  ], cx, cy);
}

// --------------------------------------------------- loop + marker menus

function arrangeChanged() {
  syncTransportLoop();
  // markers refine Follow-structure sections — regenerate unless the user
  // has hand-edited the generated lane.
  if (state.followStructure && !state.followLocked) buildFollowStructure();
  timeline.draw();
  autosaveAutomation();
  commitHistory(); // marker/loop edits are undoable too
}

function importSectionMarkers() {
  if (!state.bank) return;
  const letters = 'ABCDEFGHIJKLMNOP';
  let added = 0;
  state.bank.sections.forEach((t, i) => {
    if (t <= 0) return;
    const b = tempoMap.beatsAt(t);
    if (b <= 0 || songMarkers.some((m) => Math.abs(m.b - b) < 0.5)) return;
    songMarkers.push({ b, name: `Section ${letters[Math.min(i, letters.length - 1)]}` });
    added++;
  });
  songMarkers.sort((a, z) => a.b - z.b);
  arrangeChanged();
  toast(added ? `Imported ${added} section marker(s) — drag/rename to taste` : 'No new sections to import');
}

function showMarkerMenu(index, cx, cy) {
  const m = songMarkers[index];
  if (!m) return;
  showMenu(`Marker · ${m.name}`, [
    ['Rename…', () => {
      const n = prompt('Marker name', m.name);
      if (n && n.trim()) {
        m.name = n.trim().slice(0, 24);
        arrangeChanged();
      }
    }],
    ['Loop to next marker', () => {
      const next = songMarkers[index + 1];
      loopRegion.startB = m.b;
      loopRegion.endB = next ? next.b
        : tempoMap.beatsAt(state.bank ? state.bank.duration : 0) || m.b + 16;
      loopRegion.on = true;
      arrangeChanged();
    }],
    ['Delete marker', () => {
      songMarkers.splice(index, 1);
      arrangeChanged();
    }],
  ], cx, cy);
}

function showRulerMenu(beat, cx, cy) {
  const items = [
    ['Add marker here', () => {
      songMarkers.push({ b: Math.max(beat, 0), name: `M${songMarkers.length + 1}` });
      songMarkers.sort((a, z) => a.b - z.b);
      arrangeChanged();
    }],
  ];
  if (state.bank && state.bank.sections && state.bank.sections.length > 1) {
    items.push(['Import detected sections', importSectionMarkers]);
  }
  if (loopValid()) {
    items.push([loopRegion.on ? 'Disable loop' : 'Enable loop', () => {
      loopRegion.on = !loopRegion.on;
      arrangeChanged();
    }]);
    items.push(['Clear loop region', () => {
      loopRegion.startB = 0;
      loopRegion.endB = 0;
      loopRegion.on = false;
      arrangeChanged();
    }]);
  }
  showMenu('Timeline', items, cx, cy);
}

document.getElementById('laneClose').addEventListener('click', closeLane);
document.getElementById('laneClear').addEventListener('click', () => {
  if (!state.lane) return;
  automation.clear(state.lane);
  panel.refreshAutoButtons();
  renderLaneChips();
  updateReenable();
  timeline.draw();
  autosaveAutomation();
  commitHistory();
});
document.getElementById('snapSelect').addEventListener('change', (e) => {
  timeline.snap = e.target.value;
});

// ----------------------------------------------------- R14: timeline UX

const modeMoveBtn = document.getElementById('modeMoveBtn');
const modeDrawBtn = document.getElementById('modeDrawBtn');

function setTimelineMode(mode, announce = false) {
  timeline.setMode(mode);
  localStorage.setItem('sr:tlMode', timeline.mode);
  modeMoveBtn.classList.toggle('active', timeline.mode === 'move');
  modeDrawBtn.classList.toggle('active', timeline.mode === 'draw');
  if (announce) {
    toast(timeline.mode === 'draw'
      ? 'Draw mode — click the lane to add points'
      : 'Move mode — drag to select a range, click to seek');
  }
}
function toggleTimelineMode() {
  setTimelineMode(timeline.mode === 'draw' ? 'move' : 'draw', true);
}
modeMoveBtn.addEventListener('click', () => setTimelineMode('move', true));
modeDrawBtn.addEventListener('click', () => setTimelineMode('draw', true));
setTimelineMode(localStorage.getItem('sr:tlMode') === 'draw' ? 'draw' : 'move');

document.getElementById('fitBtn').addEventListener('click', () => timeline.zoomToFit());

function seekTo(t) {
  const dur = state.bank ? state.bank.duration : 0;
  transport.seek(Math.min(Math.max(t, 0), dur));
  timeline.setTime(transport.time);
  timeline.revealTime(transport.time);
}

// Every timeline position worth jumping between (ends, bar 1, user markers,
// detected sections, loop edges), deduped and sorted.
function navPoints() {
  const dur = state.bank ? state.bank.duration : 0;
  const set = new Set([0, dur]);
  if (tempoMap.offset > 0) set.add(tempoMap.offset);
  for (const m of songMarkers) set.add(tempoMap.timeAt(m.b));
  if (state.bank && state.bank.sections) {
    for (const t of state.bank.sections) if (t > 0) set.add(t);
  }
  if (loopValid()) {
    set.add(tempoMap.timeAt(loopRegion.startB));
    set.add(tempoMap.timeAt(loopRegion.endB));
  }
  return [...set].filter((t) => t >= 0 && t <= dur).sort((a, b) => a - b);
}
function jumpNav(dir) {
  const pts = navPoints();
  if (!pts.length) return;
  const cur = transport.time;
  const eps = 1e-3;
  let target;
  if (dir > 0) target = pts.find((t) => t > cur + eps);
  else for (let i = pts.length - 1; i >= 0; i--) { if (pts[i] < cur - eps) { target = pts[i]; break; } }
  if (target === undefined) target = dir > 0 ? pts[pts.length - 1] : pts[0];
  seekTo(target);
}

// ---- copy / paste automation (R14-P3) ----

function laneKind(key) {
  const s = SCHEMA_INDEX[key];
  return (s && (s.type === 'enum' || s.type === 'bool')) ? 'discrete' : 'continuous';
}
function afterAutomationEdit() {
  panel.refreshAutoButtons();
  renderLaneChips();
  updateReenable();
  timeline.draw();
  autosaveAutomation();
  commitHistory();
}
function copyAutomation() {
  if (!state.lane) return;
  const sel = timeline.getSelection();
  if (sel) {
    const clip = automation.copyRange(state.lane, sel.startB, sel.endB);
    if (!clip) { toast('No breakpoints in the selection to copy.', 'error'); return; }
    state.clipboard = clip;
    toast(`Copied ${clip.points.length} point(s) — Ctrl+V pastes at the playhead`);
  } else {
    const clip = automation.copyLane(state.lane);
    if (!clip) { toast('This lane has no points to copy.', 'error'); return; }
    state.clipboard = clip;
    toast(`Copied the whole "${SCHEMA_INDEX[state.lane].label}" lane — open another parameter's lane and Ctrl+V`);
  }
}
function cutAutomation() {
  if (!state.lane) return;
  const sel = timeline.getSelection();
  copyAutomation();
  if (!state.clipboard) return;
  if (sel) automation.deleteRange(state.lane, sel.startB, sel.endB);
  else automation.clear(state.lane);
  timeline.clearSelection();
  afterAutomationEdit();
}
function pasteAutomation() {
  if (!state.lane) return;
  if (!state.clipboard) {
    toast('Nothing copied yet — select automation and Ctrl+C first.', 'error');
    return;
  }
  if (isMappedKey(state.lane)) {
    toast('This parameter is macro-mapped — automate the macro instead.', 'error');
    return;
  }
  const clip = state.clipboard;
  const srcKind = (clip.srcType === 'enum' || clip.srcType === 'bool') ? 'discrete' : 'continuous';
  if (srcKind !== laneKind(state.lane)) {
    toast(`Can't paste a ${srcKind} clip onto a ${laneKind(state.lane)} parameter.`, 'error');
    return;
  }
  if (clip.kind === 'lane') {
    automation.pasteLane(state.lane, clip);
    toast(`Pasted lane onto "${SCHEMA_INDEX[state.lane].label}" (clamped to its range)`);
  } else {
    const atB = Math.max(snapBeats(tempoMap.beatsAt(transport.time), timeline.snap, tempoMap.beatsPerBar), 0);
    automation.pasteRange(state.lane, clip, atB);
    toast(`Pasted ${clip.points.length} point(s) at the playhead`);
  }
  automation.setEnabled(state.lane, true);
  afterAutomationEdit();
}
function showLaneMenu(cx, cy) {
  if (!state.lane) return;
  const s = SCHEMA_INDEX[state.lane];
  const sel = timeline.getSelection();
  const items = [];
  if (sel) items.push(['Copy selection', copyAutomation]);
  items.push([sel ? 'Copy whole lane' : 'Copy lane', () => { timeline.clearSelection(); copyAutomation(); }]);
  if (state.clipboard) items.push(['Paste at playhead', pasteAutomation]);
  if (sel) {
    items.push(['Delete selection', () => {
      automation.deleteRange(state.lane, sel.startB, sel.endB);
      timeline.clearSelection();
      afterAutomationEdit();
    }]);
  }
  showMenu(s ? `${s.groupLabel} · ${s.label}` : 'Lane', items, cx, cy);
}

document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && state.mapping !== null) {
    exitMapMode();
    return;
  }
  if (e.code === 'Escape' && state.assign != null) {
    exitAssignMode();
    return;
  }
  if (e.code === 'Escape' && state.lane) closeLane();
  if (e.code === 'Escape' && state.editTriggerSet) closeTriggerEdit();
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.code === 'KeyZ') {
    e.preventDefault();
    if (e.shiftKey) redoAutomation();
    else undoAutomation();
  } else if (mod && e.code === 'KeyY') {
    e.preventDefault();
    redoAutomation();
  } else if (mod && e.code === 'KeyC' && state.lane) {
    e.preventDefault();
    copyAutomation();
  } else if (mod && e.code === 'KeyX' && state.lane) {
    e.preventDefault();
    cutAutomation();
  } else if (mod && e.code === 'KeyV' && state.lane) {
    e.preventDefault();
    pasteAutomation();
  } else if (mod) {
    // leave other ctrl/cmd combos to the browser
  } else if (state.lane && e.code === 'BracketLeft') {
    cycleLane(-1);
  } else if (state.lane && e.code === 'BracketRight') {
    cycleLane(1);
  } else if (!state.project) {
    // single-key timeline shortcuts need a loaded project
  } else if (e.code === 'KeyD') {
    toggleTimelineMode();
  } else if (e.code === 'KeyF') {
    timeline.zoomToFit();
  } else if (e.code === 'Home') {
    e.preventDefault();
    seekTo(0);
  } else if (e.code === 'End') {
    e.preventDefault();
    seekTo(state.bank ? state.bank.duration : 0);
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault();
    jumpNav(-1);
  } else if (e.code === 'ArrowRight') {
    e.preventDefault();
    jumpNav(1);
  }
});

const bpmInput = document.getElementById('bpmInput');
const sigSelect = document.getElementById('sigSelect');

function applyTempoUI() {
  bpmInput.value = tempoMap.bpm ? tempoMap.bpm.toFixed(2) : '';
  sigSelect.value = String(tempoMap.beatsPerBar);
}

function tempoChanged() {
  if (state.bank) state.bank.setTempo(tempoMap.bpm, tempoMap.offset);
  syncTransportLoop();
  timeline.draw();
  autosaveAutomation();
  commitHistory();
}

bpmInput.addEventListener('change', () => {
  const bpm = parseFloat(bpmInput.value);
  if (bpm >= 20 && bpm <= 300) {
    tempoMap.bpm = bpm;
    tempoChanged();
  } else {
    applyTempoUI();
  }
});
sigSelect.addEventListener('change', () => {
  tempoMap.beatsPerBar = parseInt(sigSelect.value, 10);
  tempoChanged();
});
document.getElementById('barOneBtn').addEventListener('click', () => {
  tempoMap.offset = transport.time;
  tempoChanged();
  toast(`Bar 1 set to ${formatTime(tempoMap.offset)} — automation stays glued to beats`);
});

// Nudge the bar-1 anchor by a beat (Shift = half a beat); fix octave errors.
function nudgeOffset(beats) {
  if (!(tempoMap.bpm > 0)) return;
  tempoMap.offset = Math.max(tempoMap.offset + (beats * 60) / tempoMap.bpm, 0);
  tempoChanged();
}
document.getElementById('nudgeL').addEventListener('click', (e) => {
  nudgeOffset(e.shiftKey ? -0.5 : -1);
});
document.getElementById('nudgeR').addEventListener('click', (e) => {
  nudgeOffset(e.shiftKey ? 0.5 : 1);
});
function scaleBpm(factor) {
  const bpm = tempoMap.bpm * factor;
  if (bpm < 20 || bpm > 300) {
    toast('BPM out of range (20–300)', 'error');
    return;
  }
  tempoMap.bpm = +bpm.toFixed(2);
  applyTempoUI();
  tempoChanged();
}
document.getElementById('bpmHalf').addEventListener('click', () => scaleBpm(0.5));
document.getElementById('bpmDouble').addEventListener('click', () => scaleBpm(2));

// -------------------------------------------------------- canvas layout

function layoutCanvas() {
  const ar = ASPECTS[state.aspect];
  const box = stage.getBoundingClientRect();
  const pad = 24;
  let cssW = box.width - pad * 2;
  let cssH = box.height - pad * 2;
  if (cssW / cssH > ar) cssW = cssH * ar;
  else cssH = cssW / ar;
  for (const c of [canvas, guidesCanvas]) {
    c.style.width = `${Math.round(cssW)}px`;
    c.style.height = `${Math.round(cssH)}px`;
  }
  if (!state.exporting) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let rw = Math.round(cssW * dpr);
    let rh = Math.round(rw / ar);
    const cap = Math.max(rw, rh) / PREVIEW_CAP;
    if (cap > 1) { rw = Math.round(rw / cap); rh = Math.round(rh / cap); }
    canvas.width = Math.max(rw, 16);
    canvas.height = Math.max(rh, 16);
    renderer.setSize(canvas.width, canvas.height);
  }
  guidesCanvas.width = Math.round(cssW);
  guidesCanvas.height = Math.round(cssH);
  drawGuides();
}
new ResizeObserver(layoutCanvas).observe(stage);

function drawGuides() { drawOverlay(); }

function drawOverlay() {
  const ctx = guidesCanvas.getContext('2d');
  const w = guidesCanvas.width;
  const h = guidesCanvas.height;
  ctx.clearRect(0, 0, w, h);
  if (state.guides) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    for (const f of [1 / 3, 2 / 3]) {
      ctx.beginPath(); ctx.moveTo(w * f, 0); ctx.lineTo(w * f, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, h * f); ctx.lineTo(w, h * f); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(120,200,255,0.45)';
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(w * 0.05, h * 0.05, w * 0.9, h * 0.9); // title-safe
    ctx.setLineDash([]);
  }
  drawGizmos(ctx, w, h);
}

// ----------------------------------------------- R4-4: Gen placement gizmo

const GEN_IDS = ['shape', 'fractal', 'flow', 'spectrum'];

// Gen devices whose card is expanded in the panel and switched on — these
// get a draggable region outline on the canvas. Frame space maps to canvas
// pixels isotropically (guides canvas keeps the render aspect), so the
// region centre is simply (X·w, (1−Y)·h) with radius Size·h.
function activeGizmos() {
  if (!state.project || state.exporting || state.mapping !== null) return [];
  const out = [];
  for (const id of GEN_IDS) {
    if (panel.openDevices.has(id) && params()[`${id}On`]) out.push(id);
  }
  return out;
}

function gizmoGeom(id, w, h) {
  const p = params();
  const cx = (p[`${id}X`] ?? 0.5) * w;
  const cy = (1 - (p[`${id}Y`] ?? 0.5)) * h;
  const r = Math.max((p[`${id}Size`] ?? 0.6) * h, 6);
  const rad = (p[`${id}Rotate`] ?? 0) * Math.PI / 180;
  return { cx, cy, r, hx: cx + r * Math.cos(rad), hy: cy + r * Math.sin(rad) };
}

function drawGizmos(ctx, w, h) {
  const ids = activeGizmos();
  for (const id of ids) {
    const g = gizmoGeom(id, w, h);
    ctx.strokeStyle = 'rgba(120,220,160,0.9)';
    ctx.fillStyle = 'rgba(120,220,160,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(g.cx, g.cy, g.r, 0, 6.2831853); ctx.stroke();
    ctx.beginPath(); ctx.arc(g.cx, g.cy, 3, 0, 6.2831853); ctx.fill();
    ctx.beginPath(); ctx.moveTo(g.cx, g.cy); ctx.lineTo(g.hx, g.hy); ctx.stroke();
    ctx.beginPath(); ctx.arc(g.hx, g.hy, 5, 0, 6.2831853); ctx.fill();
    ctx.font = '11px monospace';
    ctx.fillText((groupById(id) || {}).label || id, g.cx + 6, g.cy - g.r - 4);
  }
}

// Pointer → gizmo target. Returns {id, mode} for the topmost hit, else null.
function gizmoHit(mx, my, alt) {
  const ids = activeGizmos();
  const w = guidesCanvas.width;
  const h = guidesCanvas.height;
  for (let i = ids.length - 1; i >= 0; i--) {
    const g = gizmoGeom(ids[i], w, h);
    if (Math.hypot(mx - g.hx, my - g.hy) < 9) return { id: ids[i], mode: 'rotate' };
    const d = Math.hypot(mx - g.cx, my - g.cy);
    if (alt && d < g.r + 10) return { id: ids[i], mode: 'rotate' };
    if (Math.abs(d - g.r) < 9) return { id: ids[i], mode: 'resize' };
    if (d < g.r) return { id: ids[i], mode: 'move' };
  }
  return null;
}

// Pointer position in guides-canvas pixels (CSS px scaled to the buffer).
function canvasPx(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    mx: (e.clientX - rect.left) / rect.width * guidesCanvas.width,
    my: (e.clientY - rect.top) / rect.height * guidesCanvas.height,
  };
}

// ----------------------------------------------- reframe: drag + wheel

function baseRect() {
  const ai = renderer.imageAspect;
  const ao = ASPECTS[state.aspect];
  let rx, ry;
  if (ai >= ao) { ry = 1; rx = ao / ai; } else { rx = 1; ry = ai / ao; }
  const zoom = params().camZoom * state.reframe[state.aspect].scale;
  return { rx: rx / zoom, ry: ry / zoom };
}

let dragState = null;
let gizmoDrag = null;
canvas.addEventListener('pointerdown', (e) => {
  if (!state.project || state.exporting) return;
  const { mx, my } = canvasPx(e);
  const hit = gizmoHit(mx, my, e.altKey);
  if (hit) {                       // place a generator region instead of reframing
    gizmoDrag = hit;
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  dragState = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (gizmoDrag) {
    const { mx, my } = canvasPx(e);
    const w = guidesCanvas.width;
    const h = guidesCanvas.height;
    const id = gizmoDrag.id;
    if (gizmoDrag.mode === 'move') {
      setParamValue(`${id}X`, clamp(mx / w, 0, 1));
      setParamValue(`${id}Y`, clamp(1 - my / h, 0, 1));
    } else if (gizmoDrag.mode === 'resize') {
      const c = gizmoGeom(id, w, h);
      setParamValue(`${id}Size`, clamp(Math.hypot(mx - c.cx, my - c.cy) / h, 0.05, 1.5));
    } else {
      const c = gizmoGeom(id, w, h);
      const deg = Math.round(Math.atan2(my - c.cy, mx - c.cx) * 180 / Math.PI);
      setParamValue(`${id}Rotate`, clamp(deg, -180, 180));
    }
    panel.refresh(); // keep the device sliders in sync with the drag
    return;
  }
  if (dragState) {
    const rect = canvas.getBoundingClientRect();
    const { rx, ry } = baseRect();
    const slackX = (1 - rx) / 2;
    const slackY = (1 - ry) / 2;
    const rf = state.reframe[state.aspect];
    const dx = (e.clientX - dragState.x) / rect.width * rx;
    const dy = (e.clientY - dragState.y) / rect.height * ry;
    if (slackX > 0.001) rf.x = clamp(rf.x - dx / slackX, -1, 1);
    if (slackY > 0.001) rf.y = clamp(rf.y + dy / slackY, -1, 1); // screen y is flipped vs uv
    dragState = { x: e.clientX, y: e.clientY };
    return;
  }
  // hover affordance: show the move cursor over a region
  if (state.project && !state.exporting) {
    const { mx, my } = canvasPx(e);
    canvas.style.cursor = gizmoHit(mx, my, e.altKey) ? 'move' : '';
  }
});
canvas.addEventListener('pointerup', (e) => {
  dragState = null;
  gizmoDrag = null;
  canvas.releasePointerCapture(e.pointerId);
});
canvas.addEventListener('wheel', (e) => {
  if (!state.project || state.exporting) return;
  e.preventDefault();
  const rf = state.reframe[state.aspect];
  rf.scale = clamp(rf.scale * Math.exp(-e.deltaY * 0.0012), 1, 3);
}, { passive: false });

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// ------------------------------------------------------------ transport

const playBtn = document.getElementById('playBtn');
const timeLabel = document.getElementById('timeLabel');
playBtn.addEventListener('click', async () => {
  if (!state.bank) return;
  if (transport.playing) transport.pause();
  else await transport.play();
  playBtn.textContent = transport.playing ? '❚❚' : '▶';
});

document.getElementById('loopBtn').addEventListener('click', () => {
  // Ableton-style: if a range is highlighted (Move-mode marquee), loop it.
  const sel = timeline.getSelection();
  if (sel) {
    loopRegion.startB = sel.startB;
    loopRegion.endB = sel.endB;
    loopRegion.on = true;
    timeline.clearSelection();
    arrangeChanged();
    return;
  }
  if (!loopValid()) {
    toast('Highlight a range in the timeline (Move mode), or shift+drag the ruler, to set a loop first.');
    return;
  }
  loopRegion.on = !loopRegion.on;
  arrangeChanged();
});
transport.onEnded = () => { playBtn.textContent = '▶'; };

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) {
    e.preventDefault();
    playBtn.click();
  }
});

// ------------------------------------------------- R10-1/2: input model
// Audio + a Canvas base layer. A new project is audio + a canvas (blank by
// default); the canvas fill is image / colour / gradient / pattern /
// transparent. The preview holds no controls — setup lives here.

const imageInput = document.getElementById('imageInput');
const audioInput = document.getElementById('audioInput');
const inputStatus = document.getElementById('inputStatus');
const blankColor = document.getElementById('blankColor');
const blankColor2 = document.getElementById('blankColor2');
const canvasFillSel = document.getElementById('canvasFill');
const canvasImageBtn = document.getElementById('canvasImageBtn');

function syncCanvasFillUI() {
  const f = state.canvasFill;
  canvasImageBtn.hidden = f !== 'image';
  document.getElementById('canvasColorRow').hidden = !(f === 'colour' || f === 'gradient' || f === 'pattern');
  document.getElementById('colorField2').hidden = f !== 'gradient';
  document.getElementById('colorLabel1').textContent = f === 'gradient' ? 'Bottom colour' : 'Colour';
  updateSourcePreview();
}

// Reflect the chosen visual source in the preview *before* a project/audio
// exists — so picking a colour/gradient/image gives instant feedback (the GL
// renderer only runs once audio is loaded). Shown only in the start state
// (CSS gates #sourcePreview on body.mode-start).
function updateSourcePreview() {
  const el2 = document.getElementById('sourcePreview');
  if (!el2) return;
  const f = state.canvasFill;
  el2.style.backgroundImage = '';
  el2.style.backgroundColor = '';
  if (f === 'gradient') {
    el2.style.backgroundImage = `linear-gradient(to top, ${blankColor.value}, ${blankColor2.value})`;
  } else if (f === 'transparent') {
    // checkerboard = "transparent" base
    el2.style.backgroundImage =
      'repeating-conic-gradient(#2a2d36 0% 25%, #1a1c22 0% 50%)';
    el2.style.backgroundSize = '24px 24px';
  } else if (f === 'image' && state.pendingImage) {
    el2.style.backgroundImage = `url(${URL.createObjectURL(state.pendingImage)})`;
    el2.style.backgroundSize = 'cover';
    el2.style.backgroundPosition = 'center';
  } else {
    el2.style.backgroundColor = blankColor.value; // colour + pattern base
  }
}

// R10-1: a modern swatch palette (curated presets + a custom picker) instead
// of the bare native colour input. Writes to the hidden <input type=color>
// so the rest of the pipeline (renderFillPNG / applyCanvasFill) is unchanged.
const CANVAS_SWATCHES = ['#0e1014', '#12131a', '#1b2233', '#2a1a3a', '#0a2a2e',
  '#3a2a5a', '#5a2438', '#234d2e', '#b9c2d6', '#ffffff'];
const hexInputs = {};
function buildSwatches(containerId, hiddenInput) {
  const box = document.getElementById(containerId);
  box.textContent = '';
  const hex = el('input', {
    type: 'text', class: 'hex-input', maxlength: '7', value: hiddenInput.value,
    title: 'hex colour',
  });
  hexInputs[hiddenInput.id] = hex;
  const mark = () => {
    for (const s of box.querySelectorAll('.swatch')) {
      s.classList.toggle('sel', s.dataset.hex && s.dataset.hex.toLowerCase() === hiddenInput.value.toLowerCase());
    }
  };
  for (const c of CANVAS_SWATCHES) {
    const sw = el('button', { class: 'swatch', title: c });
    sw.dataset.hex = c;
    sw.style.background = c;
    sw.addEventListener('click', () => {
      hiddenInput.value = c; hex.value = c;
      hiddenInput.dispatchEvent(new Event('input'));
      mark();
    });
    box.append(sw);
  }
  box.append(el('label', { class: 'swatch swatch-custom', title: 'custom colour' }, hiddenInput, el('span', { text: '+' })));
  hex.addEventListener('change', () => {
    const v = hex.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) { hiddenInput.value = v; hiddenInput.dispatchEvent(new Event('input')); mark(); }
    else hex.value = hiddenInput.value;
  });
  box.append(hex);
  hiddenInput.addEventListener('input', mark);
  mark();
}

canvasFillSel.addEventListener('change', () => {
  state.canvasFill = canvasFillSel.value;
  syncCanvasFillUI();
  if (state.project) {
    // change the base layer live on an existing project
    if (state.canvasFill === 'image') swapImageInput.click();
    else applyCanvasFill();
  } else if (state.canvasFill === 'image') {
    inputStatus.textContent = 'choose an image, then add audio';
  } else {
    inputStatus.textContent = 'add audio to begin — base layer ready';
    tryCreateProject();
  }
});
state.canvasFill = canvasFillSel.value;
syncCanvasFillUI();
buildSwatches('swatches1', blankColor);
buildSwatches('swatches2', blankColor2);

imageInput.addEventListener('change', () => {
  state.pendingImage = imageInput.files[0] || null;
  if (state.pendingImage) { state.canvasFill = 'image'; canvasFillSel.value = 'image'; syncCanvasFillUI(); }
  tryCreateProject();
});
audioInput.addEventListener('change', () => {
  state.pendingAudio = audioInput.files[0] || null;
  tryCreateProject();
});
// canvas colour(s): live preview before a project, live device-edit after.
for (const c of [blankColor, blankColor2]) {
  c.addEventListener('input', () => {
    if (state.project) applyCanvasFill();
    else updateSourcePreview();
    if (hexInputs[c.id]) hexInputs[c.id].value = c.value;
  });
}

function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (d > 1e-6) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [Math.round(h), +s.toFixed(3), +l.toFixed(3)];
}

// Configure the Canvas device for the chosen fill (after a project loads,
// or live when the colour changes). Transparent = device off (black base).
function applyCanvasFill() {
  const p = params();
  const f = state.canvasFill;
  if (f === 'image' || f === 'transparent') {
    p.canvasOn = false;
  } else {
    p.canvasOn = true; p.canvasMix = 1;
    const [hh, ss, ll] = hexToHsl(blankColor.value);
    p.canvasHue = hh; p.canvasSat = ss; p.canvasLight = ll;
    p.canvasMode = f === 'gradient' ? 'gradient' : 'flat';
    if (f === 'gradient') {
      const [h2, s2, l2] = hexToHsl(blankColor2.value);
      p.canvasHue2 = h2; p.canvasSat2 = s2; p.canvasLight2 = l2;
    }
    if (f === 'pattern') { p.flowOn = true; p.flowMix = 1; p.flowSize = 1.5; p.flowKind = 'clouds'; }
  }
  syncChainToParams();
  panel.rebuild();
  if (state.bank) state.bank.setResponse(responseOf(p));
  autosaveAutomation();
}

// Render the base PNG for a non-image fill (small; the Canvas device draws
// the real fill — this is just the seed the project is keyed on).
async function renderFillPNG() {
  const [w, h] = state.aspect === '9:16' ? [108, 192]
    : state.aspect === '1:1' ? [144, 144] : [192, 108];
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const cx = cv.getContext('2d');
  if (state.canvasFill === 'gradient') {
    const g = cx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, blankColor2.value); g.addColorStop(1, blankColor.value);
    cx.fillStyle = g;
  } else {
    cx.fillStyle = state.canvasFill === 'transparent' ? '#000000' : blankColor.value;
  }
  cx.fillRect(0, 0, w, h);
  return new Promise((r) => cv.toBlob(r, 'image/png'));
}

// Create a project once we have audio + a resolved visual source.
let creating = false;
async function tryCreateProject() {
  if (state.project || creating || !state.pendingAudio) {
    if (!state.project && !creating && !state.pendingAudio) {
      inputStatus.textContent = 'add audio to begin — the canvas is blank by default';
    }
    return;
  }
  let imageFile = state.pendingImage;
  if (state.canvasFill === 'image' && !imageFile) {
    inputStatus.textContent = 'choose an image, or switch the base layer to Solid colour';
    return;
  }
  if (state.canvasFill !== 'image') {
    imageFile = new File([await renderFillPNG()], 'canvas.png', { type: 'image/png' });
  }
  creating = true;
  inputStatus.textContent = 'creating project…';
  try {
    const form = new FormData();
    form.append('image', imageFile);
    form.append('audio', state.pendingAudio);
    const resp = await fetch('/api/project', { method: 'POST', body: form });
    if (!resp.ok) throw new Error((await resp.json()).detail || resp.statusText);
    const meta = await resp.json();
    state.pendingImage = null;
    state.pendingAudio = null;
    await loadProject(meta);
    if (state.canvasFill !== 'image') applyCanvasFill();
    if (state.pendingLook) { applyPack(state.pendingLook); state.pendingLook = null; }
    refreshProjects();
  } catch (err) {
    inputStatus.textContent = 'failed';
    toast(`Could not create project: ${err.message}`, 'error');
  } finally {
    creating = false;
  }
}

for (const evt of ['dragover', 'drop']) {
  stage.addEventListener(evt, (e) => e.preventDefault());
}
stage.addEventListener('drop', (e) => {
  for (const file of e.dataTransfer.files) {
    if (file.type.startsWith('image/')) {
      state.pendingImage = file;
      state.canvasFill = 'image'; canvasFillSel.value = 'image'; syncCanvasFillUI();
    } else { state.pendingAudio = file; }
  }
  tryCreateProject();
});

// Build the timeline waveform from the decoded audio (client-side, zoom-adaptive).
function setTimelineWaveform() {
  const buf = transport.buffer;
  if (!buf) { timeline.setWaveform(null); return; }
  const chans = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
  timeline.setWaveform(new WaveformPeaks(chans, buf.sampleRate));
}

async function loadProject(meta) {
  inputStatus.textContent = 'loading assets…';
  const id = meta.id;
  const [imgBlob, depthBlob, analysisResp] = await Promise.all([
    fetch(`/api/project/${id}/image`).then((r) => r.blob()),
    fetch(`/api/project/${id}/depth`).then((r) => r.blob()),
    fetch(`/api/project/${id}/analysis`).then((r) => r.json()),
  ]);
  const [imgBitmap, depthBitmap] = await Promise.all([
    createImageBitmap(imgBlob, { imageOrientation: 'flipY' }),
    createImageBitmap(depthBlob, { imageOrientation: 'flipY' }),
  ]);
  renderer.setImage(imgBitmap);
  renderer.setDepth(depthBitmap);
  state.imgBitmap = imgBitmap;     // kept for the look-audition thumbnails
  state.depthBitmap = depthBitmap;
  state.bank = new FeatureBank(analysisResp);
  state.bank.setResponse(responseOf(params()));
  await transport.load(`/api/project/${id}/audio`);
  state.project = meta;

  // Tempo grid: detected values as defaults, then any per-project autosave
  // (user-corrected BPM / downbeat / drawn lanes / chain) on top.
  closeLane();
  automation.load(null);
  tempoMap.bpm = state.bank.tempo > 0 ? +state.bank.tempo.toFixed(2) : 120;
  tempoMap.beatsPerBar = 4;
  tempoMap.offset = state.bank.beatOffset || 0;
  state.chain = defaultChain();
  state.racks = [];               // Racks v1: no default rack (Phase 3 builds UI)
  rebuildParamIndex();
  loopRegion.startB = 0;
  loopRegion.endB = 0;
  loopRegion.on = false;
  songMarkers.length = 0;
  const restored = await restoreAutomation(id);
  // R10: a fresh project starts from a clean slate — the look comes from the
  // canvas fill / a chosen Look, not leftover params from the last project.
  if (!restored) state.params = defaultParams();
  syncChainToParams();
  syncTransportLoop();
  state.bank.setTempo(tempoMap.bpm, tempoMap.offset);
  // restored params may carry different response/crossover settings
  state.bank.setResponse(responseOf(params()));
  applyTempoUI();
  panel.rebuild();
  buildRacksArea();
  resetHistory();

  timeline.setBank(state.bank);
  setTimelineWaveform();
  refreshTriggerSources();
  document.getElementById('dropHint').style.display = 'none';
  inputStatus.textContent = '';
  updateMediaCard(meta);
  refreshLooks();
  applyMode();
  renderer.resetFeedback();
  playBtn.textContent = '▶';
}

// R6-2: the "now loaded" card — the single answer to "what am I looking at?"
function updateMediaCard(meta) {
  const card = document.getElementById('mediaCard');
  card.hidden = false;
  document.getElementById('mediaThumb').src = `/api/project/${meta.id}/image`;
  document.getElementById('mediaImageName').textContent = meta.imageName || meta.id;
  document.getElementById('mediaAudioName').textContent = meta.audioName || '';
  const dur = state.bank ? formatTime(state.bank.duration) : '';
  document.getElementById('mediaInfo').textContent =
    `${dur}${tempoMap.bpm ? ` · ${tempoMap.bpm.toFixed(tempoMap.bpm % 1 ? 1 : 0)} BPM` : ''}`;
}

// R6-1: new image, same song — analysis + session carry over server-side;
// the live state (slots/lanes/macros/grid) never leaves memory.
const swapImageInput = document.getElementById('swapImageInput');
document.getElementById('swapImageBtn').addEventListener('click', () => {
  if (!state.project) return;
  swapImageInput.click();
});
swapImageInput.addEventListener('change', async () => {
  const file = swapImageInput.files[0];
  swapImageInput.value = '';
  if (!file || !state.project) return;
  inputStatus.textContent = 'swapping image…';
  try {
    const form = new FormData();
    form.append('image', file);
    const resp = await fetch(`/api/project/${state.project.id}/image`, {
      method: 'POST', body: form,
    });
    if (!resp.ok) throw new Error((await resp.json()).detail || resp.statusText);
    const meta = await resp.json();
    const [imgBlob, depthBlob] = await Promise.all([
      fetch(`/api/project/${meta.id}/image`).then((r) => r.blob()),
      fetch(`/api/project/${meta.id}/depth`).then((r) => r.blob()),
    ]);
    const [ib, db] = await Promise.all([
      createImageBitmap(imgBlob, { imageOrientation: 'flipY' }),
      createImageBitmap(depthBlob, { imageOrientation: 'flipY' }),
    ]);
    renderer.setImage(ib);
    renderer.setDepth(db);
    state.imgBitmap = ib;
    state.depthBitmap = db;
    state.project = meta;
    renderer.resetFeedback();
    updateMediaCard(meta);
    refreshLooks();
    inputStatus.textContent = '';
    autosaveAutomation(); // mirror the carried-over session under the new id
    refreshProjects();
    toast(`Image swapped — same song, every parameter kept (${meta.imageName})`);
  } catch (err) {
    inputStatus.textContent = '';
    toast(`Image swap failed: ${err.message}`, 'error');
  }
});

// Replace audio — new song bounce, same visual build. Mints a content-addressed
// sibling server-side (creative state copied, analysis recomputed); the old
// project stays in the Library for rollback. Project timing is kept (the copied
// session restores tempoMap over the new analysis in loadProject).
const replaceAudioInput = document.getElementById('replaceAudioInput');
document.getElementById('replaceAudioBtn').addEventListener('click', () => {
  if (!state.project) return;
  replaceAudioInput.click();
});
replaceAudioInput.addEventListener('change', async () => {
  const file = replaceAudioInput.files[0];
  replaceAudioInput.value = '';
  if (!file || !state.project) return;
  inputStatus.textContent = 'replacing audio…';
  try {
    await saveSessionNow();                 // flush current build into the old session
    const form = new FormData();
    form.append('audio', file);
    const resp = await fetch(`/api/project/${state.project.id}/audio`, {
      method: 'POST', body: form,
    });
    if (!resp.ok) throw new Error((await resp.json()).detail || resp.statusText);
    const data = await resp.json();
    if (data.id === state.project.id) {
      inputStatus.textContent = '';
      toast("That's the same audio file — nothing changed.");
      return;
    }
    await loadProject(data);                 // new audio + analysis; copied session keeps build + timing
    toast(replaceAudioMessage(data.comparison), 'info', 9000);
  } catch (err) {
    inputStatus.textContent = '';
    toast(`Replace audio failed: ${err.message}`, 'error');
  }
});

// Apply-then-warn message built from the server's old-vs-new comparison.
function replaceAudioMessage(cmp) {
  if (!cmp || !cmp.warnings || !cmp.warnings.length) {
    return 'Audio replaced — same song, timing kept. Devices, racks, params, automation, markers and loop are unchanged.';
  }
  const o = cmp.old || {}, n = cmp.new || {};
  const parts = ['Audio replaced (timing kept). Review:'];
  for (const w of cmp.warnings) {
    if (w === 'duration') {
      const d = (n.duration || 0) - (o.duration || 0);
      parts.push(`new file is ${Math.abs(d).toFixed(1)}s ${d > 0 ? 'longer' : 'shorter'} — check loop & end markers`);
    } else if (w === 'tempo') {
      parts.push(`detected tempo ${(o.tempo || 0).toFixed(1)}->${(n.tempo || 0).toFixed(1)} BPM — beat grid may not line up; adjust BPM if needed`);
    } else if (w === 'downbeat') {
      parts.push(`downbeat/leading silence shifted ~${Math.abs((n.beatOffset || 0) - (o.beatOffset || 0)).toFixed(2)}s — check Bar 1`);
    }
  }
  parts.push('the previous version is still in your Library');
  return parts.join(' · ');
}

// ------------------------------------------------------------ left panel

// R6-3: the project library — thumbnails, rename, delete.
async function refreshProjects() {
  const list = document.getElementById('projectList');
  list.textContent = '';
  const projects = await fetch('/api/projects').then((r) => r.json());
  for (const p of projects.slice(0, 20)) {
    const label = p.name || `${p.imageName ?? p.id} + ${p.audioName ?? ''}`;
    const li = el('li', {
      class: 'proj-row',
      title: p.id,
      onclick: async () => {
        const meta = await fetch(`/api/project/${p.id}`).then((r) => r.json());
        await loadProject(meta);
      },
    });
    li.append(
      el('img', { class: 'proj-thumb', src: `/api/project/${p.id}/image`, loading: 'lazy', alt: '' }),
      el('span', { class: 'proj-name', text: label }),
      el('button', {
        class: 'mini-del', text: '✎', title: 'rename project',
        onclick: async (e) => {
          e.stopPropagation();
          const name = prompt('Project name', p.name || '');
          if (name === null) return;
          await fetch(`/api/project/${p.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          });
          refreshProjects();
        },
      }),
      el('button', {
        class: 'mini-del', text: '×', title: 'delete project (its session dies with it; exports are kept)',
        onclick: async (e) => {
          e.stopPropagation();
          if (!confirm(`Delete "${label}"?\n\nIts saved session (look + automation) is deleted with it. `
            + 'Finished exports are kept. Re-dropping the same files recreates the project '
            + '(without the session).')) return;
          const resp = await fetch(`/api/project/${p.id}`, { method: 'DELETE' });
          if (!resp.ok) {
            toast((await resp.json()).detail || 'Delete failed', 'error');
            return;
          }
          try { localStorage.removeItem(`sr:${p.id}`); } catch (err) { /* non-fatal */ }
          if (state.project && state.project.id === p.id) {
            toast('Deleted the loaded project — preview still runs, but export needs you to '
              + 're-drop the image + audio first.', 'info', 7000);
          }
          refreshProjects();
        },
      }),
    );
    list.append(li);
  }
}

// ------------------------------------------------ R5-P4: look audition

// The loudest analysis section's midpoint — the most representative moment
// of the track to render a look thumbnail at.
function loudestTime() {
  if (!state.bank) return 0;
  const rms = state.bank.smoothed.rms;
  const fr = state.bank.frameRate;
  const dur = state.bank.duration;
  const secs = state.bank.sections && state.bank.sections.length ? state.bank.sections : [0];
  let best = 0;
  let bestMean = -1;
  for (let k = 0; k < secs.length; k++) {
    const t0 = secs[k];
    const t1 = k + 1 < secs.length ? secs[k + 1] : dur;
    const i0 = Math.max(Math.floor(t0 * fr), 0);
    const i1 = Math.min(Math.ceil(t1 * fr), rms.length);
    let s = 0;
    let n = 0;
    for (let i = i0; i < i1; i++) { s += rms[i]; n++; }
    const mean = n ? s / n : 0;
    if (mean > bestMean) { bestMean = mean; best = (t0 + t1) / 2; }
  }
  return best;
}

let thumbRenderer = null;
let thumbCanvas = null;
let thumbQueue = [];
let lookPreviewParams = null;

function thumbSize() {
  return state.aspect === '9:16' ? [90, 160]
    : state.aspect === '1:1' ? [120, 120] : [160, 90];
}

// Build the look browser: one tile per style pack, each a thumbnail of the
// current image with that pack applied at the loudest moment. Tiles render
// round-robin (one per frame) so populating never hitches the preview.
// R11-P0: the Look browser is hidden. The R7-3 looks are stale and the model
// traps the user — there was no clean-default entry and boot auto-applied
// `cinematic`, so picking a look only ever swapped one pack for another. Looks
// return as factory presets in Round 13. This stays a no-op that keeps the
// section hidden so every caller (aspect switch, project load, …) is safe.
function refreshLooks() {
  const section = document.getElementById('looksSection');
  if (section) section.hidden = true;
}

function resolveLookParams(packId) {
  return { ...defaultParams(), ...migrateLegacyParams(getPack(packId).overrides) };
}

// Render one queued thumbnail (called once per frame). Uses a dedicated
// small renderer so the live preview's targets/feedback are never touched.
function processThumbQueue() {
  if (!thumbQueue.length || !state.imgBitmap || !state.bank) return;
  const job = thumbQueue.shift();
  if (!thumbRenderer) {
    thumbCanvas = document.createElement('canvas');
    thumbRenderer = new Renderer(thumbCanvas);
  }
  const [tw, th] = thumbSize();
  thumbRenderer.setImage(state.imgBitmap);
  thumbRenderer.setDepth(state.depthBitmap);
  thumbRenderer.setSize(tw, th);
  const t = loudestTime();
  const feat = state.bank.sample(t);
  const p = resolveLookParams(job.packId);
  thumbRenderer.render(t, 1 / 30, feat, p, { x: 0, y: 0, scale: 1 }, { toTexture: true });
  const px = thumbRenderer.readPixels();
  const ctx = job.tile.getContext('2d');
  const img = ctx.createImageData(tw, th);
  for (let y = 0; y < th; y++) {            // readPixels is bottom-up; flip
    const src = (th - 1 - y) * tw * 4;
    img.data.set(px.subarray(src, src + tw * 4), y * tw * 4);
  }
  ctx.putImageData(img, 0, 0);
}

// ------------------------------------------------ R8-2/3: Signal panel
// Audio Response as a global signal panel (not a device): live spectrum,
// modulation-source meters, tempo/grid, response shaping, mapping summary.

const NAMED_BANDS = [
  ['Sub', 20, 60], ['Bass', 60, 120], ['Low Mid', 120, 300], ['Mid', 300, 800],
  ['High Mid', 800, 2500], ['Presence', 2500, 6000], ['Air', 6000, 22000],
];
// Map the analysis' 16 log bins into the 7 named display bands (by centre Hz).
function namedBandValues(bands16, edges) {
  const out = new Float32Array(NAMED_BANDS.length);
  if (!bands16 || !edges) return out;
  for (let bi = 0; bi < bands16.length && bi + 1 < edges.length; bi++) {
    const center = Math.sqrt(edges[bi] * edges[bi + 1]);
    for (let n = 0; n < NAMED_BANDS.length; n++) {
      if (center >= NAMED_BANDS[n][1] && center < NAMED_BANDS[n][2]) {
        out[n] = Math.max(out[n], bands16[bi]); // peak of member bins
        break;
      }
    }
  }
  return out;
}

const signalPanel = document.getElementById('signalPanel');
const spectrumCanvas = document.getElementById('spectrumCanvas');
const sourceMeters = [];     // {key, label, fill, val}
// Crossovers (audLowMid/audMidHigh) are edited on the spectrum, not here.
const RESP_KEYS = ['audReact', 'audGain', 'audAttack', 'audRelease', 'audGamma', 'audSmoothness'];
const SPEC_F0 = 20;        // spectrum x-axis: log frequency range
const SPEC_F1 = 20000;

document.getElementById('signalBtn').addEventListener('click', () => {
  signalOpen = !signalOpen;
  signalPanel.hidden = !signalOpen;
  document.getElementById('signalBtn').classList.toggle('active', signalOpen);
  if (signalOpen) {
    // anchor the drawer just below the top bar (overlay, not in flow)
    signalPanel.style.top = `${document.getElementById('topbar').offsetHeight}px`;
    buildSignalPanel();
    refreshSignalMapping();
  }
});
document.getElementById('signalClose').addEventListener('click', () => {
  signalOpen = false;
  signalPanel.hidden = true;
  document.getElementById('signalBtn').classList.remove('active');
});

function buildSignalPanel() {
  // Crisp spectrum: size the canvas buffer to its displayed size × dpr so
  // text/bars aren't stretched or blurred (panel is visible here).
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = spectrumCanvas.clientWidth || 620;
  spectrumCanvas.width = Math.round(cw * dpr);
  spectrumCanvas.height = Math.round(150 * dpr);
  spectrumCanvas._dpr = dpr;
  // Modulation-source meters — the six sources the matrix actually uses.
  const srcBox = document.getElementById('signalSources');
  srcBox.textContent = '';
  sourceMeters.length = 0;
  const labels = { low: 'Low', mid: 'Mid', high: 'High', loud: 'Loud (RMS)', onset: 'Transient', beat: 'Beat' };
  for (const key of MOD_SOURCES) {
    const fill = el('div', { class: 'sig-meter-fill' });
    const val = el('span', { class: 'sig-meter-val', text: '0.00' });
    srcBox.append(el('div', { class: 'sig-meter-row' },
      el('span', { class: 'sig-meter-lbl', text: labels[key] }),
      el('div', { class: 'sig-meter' }, fill), val));
    sourceMeters.push({ key, fill, val });
  }

  // Tempo & grid: detected vs project BPM, grid feel, Bar 1.
  const bpmBox = document.getElementById('signalBpm');
  bpmBox.textContent = '';
  const detected = state.bank && state.bank.tempo ? state.bank.tempo.toFixed(1) : '—';
  const proj = tempoMap.bpm ? tempoMap.bpm.toFixed(1) : '—';
  let feel = 'manual';
  if (state.bank && state.bank.tempo > 0 && tempoMap.bpm > 0) {
    const r = tempoMap.bpm / state.bank.tempo;
    feel = Math.abs(r - 1) < 0.04 ? 'normal' : Math.abs(r - 0.5) < 0.04 ? 'half-time'
      : Math.abs(r - 2) < 0.04 ? 'double-time' : 'manual';
  }
  bpmBox.append(
    el('div', { class: 'sig-stat' }, el('span', { text: 'Detected' }), el('b', { text: `${detected} BPM` })),
    el('div', { class: 'sig-stat' }, el('span', { text: 'Project' }), el('b', { id: 'sigProjBpm', text: `${proj} BPM` })),
    el('div', { class: 'sig-stat' }, el('span', { text: 'Grid feel' }), el('b', { id: 'sigFeel', text: feel })),
    el('div', { class: 'sig-stat' }, el('span', { text: 'Bar 1' }), el('b', { id: 'sigBar1', text: formatTime(tempoMap.offset) })),
    el('div', { class: 'sig-btn-row' },
      el('button', { class: 'ctl-btn ctl-mini', text: '÷2', title: 'halve project BPM', onclick: () => { scaleBpm(0.5); buildSignalPanel(); } }),
      el('button', { class: 'ctl-btn ctl-mini', text: '×2', title: 'double project BPM', onclick: () => { scaleBpm(2); buildSignalPanel(); } }),
      el('button', { class: 'ctl-btn ctl-mini', text: 'Bar 1 here', title: 'anchor bar 1 to the playhead', onclick: () => { tempoMap.offset = transport.time; tempoChanged(); buildSignalPanel(); } })),
  );

  // Response shaping: the former Audio-response device params, as sliders.
  const ctlBox = document.getElementById('signalControls');
  ctlBox.textContent = '';
  for (const key of RESP_KEYS) {
    const s = SCHEMA_INDEX[key];
    if (!s) continue;
    const val = el('span', { class: 'sig-ctl-val', text: formatNum(params()[key], s) });
    const input = el('input', {
      type: 'range', min: s.min, max: s.max, step: s.step, value: params()[key],
      oninput: (e) => {
        const v = parseFloat(e.target.value);
        setParamValue(key, v);
        if (state.bank && RESPONSE_KEYS.includes(key)) state.bank.setResponse(responseOf(params()));
        val.textContent = formatNum(v, s);
      },
    });
    ctlBox.append(el('div', { class: 'sig-ctl-row', title: s.hint || s.label },
      el('span', { class: 'sig-ctl-lbl', text: s.label }), input, val));
  }
  // flash limiter toggle
  const fl = SCHEMA_INDEX.flashLimit;
  if (fl) {
    const cb = el('input', { type: 'checkbox', onchange: (e) => setParamValue('flashLimit', e.target.checked) });
    cb.checked = !!params().flashLimit;
    ctlBox.append(el('label', { class: 'sig-ctl-row', title: fl.hint || 'Flash limiter' },
      el('span', { class: 'sig-ctl-lbl', text: 'Flash limiter' }), cb));
  }
  buildTriggersSection();
}

// Slice 1b: trigger sets are detection "recipes" — band + selectivity — whose
// triggers are derived live from the cached per-band candidates. (Editing +
// modulation are later slices.)
const TRIGGER_BANDS = [
  { band: 'overall', label: 'Overall' }, { band: 'low', label: 'Low (kick)' },
  { band: 'mid', label: 'Mid (snare)' }, { band: 'high', label: 'High (hats)' },
];
const TRIGGER_COLORS = ['#7fd6e6', '#ffb45a', '#9b8cff', '#6ce6a0'];

function deriveTriggerSet(set, bank) {
  if (!set || !bank) return [];
  return detectTriggers((bank.triggerCandidates || {})[set.band] || [], set.selectivity);
}

// Reactive S2: bring a set to the auto+pinned shape. Legacy Slice-3 sets carry a
// frozen `triggers[]` → migrate to `pins` (lossless) with auto OFF (selectivity
// null) so old projects keep exactly their markers; re-tuning turns auto on.
function normalizeTriggerSet(set) {
  if (!set) return set;
  if (!Array.isArray(set.pins)) {
    if (Array.isArray(set.triggers)) {
      set.pins = set.triggers.map((t) => ({ t: t.t, s: t.s }));
      set.selectivity = null; // auto off — preserve the migrated look
      delete set.triggers;
    } else {
      set.pins = [];
    }
  }
  if (!Array.isArray(set.suppress)) set.suppress = [];
  if (!set.dynamics) set.dynamics = 'detected';
  return set;
}

// Slice 3: pure edit ops on a set's stored trigger list (sorted by t, s 0..1).
function addTrigger(set, t, s = 0.8) {
  const trg = { t: +(+t).toFixed(3), s: Math.min(Math.max(s, 0), 1) };
  set.triggers.push(trg);
  set.triggers.sort((a, b) => a.t - b.t);
  return set.triggers.indexOf(trg);
}
function moveTrigger(set, i, t) {
  if (set.triggers[i]) { set.triggers[i].t = +(+t).toFixed(3); set.triggers.sort((a, b) => a.t - b.t); }
}
function setTriggerStrength(set, i, s) {
  if (set.triggers[i]) set.triggers[i].s = Math.min(Math.max(s, 0), 1);
}
function deleteTrigger(set, i) { if (i >= 0) set.triggers.splice(i, 1); }
function reDetectSet(set, bank) { set.triggers = deriveTriggerSet(set, bank); }
// Reactive S1/S2: live-tune a set's Selectivity (numeric ⇒ auto layer ON), then
// resolve markers from the auto+pinned model (edits preserved). Returns markers.
function retuneSet(set, bank, sel) {
  set.selectivity = sel;
  return resolveTriggers(normalizeTriggerSet(set), bank);
}
// Reactive S2: clear a set's manual edits back to pure auto.
function resetTriggerEdits(set) { set.pins = []; set.suppress = []; }

// Reactive S2: Decay legibility — the modulation pulse is an exponential fall
// exp(-t/decay). `decayCurve` samples it (y 0..1, 1=instant peak) over a fixed
// 1s window; `decayShapePoints` formats it as SVG polyline points for the inline
// preview beside the slider. Both pure.
function decayCurve(decay, n = 24, maxT = 1.0) {
  const d = Math.max(decay, 0.01);
  const ys = [];
  for (let i = 0; i <= n; i++) ys.push(Math.exp(-((i / n) * maxT) / d));
  return ys;
}
function decayShapePoints(decay, w = 30, h = 14) {
  const ys = decayCurve(decay);
  const n = ys.length - 1;
  return ys.map((y, i) => `${((i / n) * w).toFixed(1)},${(h - y * (h - 1) - 0.5).toFixed(1)}`).join(' ');
}
const SVG_NS = 'http://www.w3.org/2000/svg';
function decayShapeSvg(set) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'trg-shape');
  svg.setAttribute('viewBox', '0 0 30 14');
  svg.setAttribute('width', '30'); svg.setAttribute('height', '14');
  const line = document.createElementNS(SVG_NS, 'polyline');
  line.setAttribute('points', decayShapePoints(set.decay ?? 0.18));
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', set.color || 'currentColor');
  line.setAttribute('stroke-width', '1.5');
  svg.appendChild(line);
  svg._line = line;
  return svg;
}

// Slice 2: routable modulation sources = the fixed audio sources + one per
// trigger set (value `trg:<id>`, labeled by name).
function modSourceList() {
  return [
    ...MOD_SOURCES.map((s) => ({ value: s, label: s })),
    ...state.triggerSets.map((ts) => ({ value: `trg:${ts.id}`, label: ts.name })),
  ];
}

function buildTriggersSection() {
  const box = document.getElementById('signalTriggers');
  if (!box) return;
  box.textContent = '';
  let pendBand = 'low', pendSel = 0.5;
  const bandSeg = el('div', { class: 'seg trg-bands' });
  for (const { band, label } of TRIGGER_BANDS) {
    const b = el('button', {
      type: 'button', text: label,
      onclick: () => { pendBand = band; for (const c of bandSeg.children) c.classList.toggle('active', c === b); },
    });
    if (band === pendBand) b.classList.add('active');
    bandSeg.append(b);
  }
  const sel = el('input', {
    type: 'range', min: 0, max: 1, step: 0.05, value: pendSel,
    oninput: (e) => { pendSel = parseFloat(e.target.value); },
  });
  box.append(el('div', { class: 'trg-detect' },
    el('span', { class: 'sig-ctl-lbl', text: 'Detect' }), bandSeg,
    el('span', { class: 'sig-ctl-lbl', text: 'Selectivity' }), sel,
    el('button', {
      class: 'ctl-btn ctl-mini', text: '+ Set', title: 'create an auto-detected trigger set from this band',
      onclick: () => {
        const set = newTriggerSet({
          name: TRIGGER_BANDS.find((b) => b.band === pendBand).label,
          band: pendBand, selectivity: pendSel, // auto on
        });
        setActiveTrigger(set.id);
      },
    }),
    el('button', {
      class: 'ctl-btn ctl-mini', text: '+ Empty', title: 'create an empty set (auto off) — tune Selectivity to fill it',
      onclick: () => {
        const set = newTriggerSet({ name: 'Custom', band: pendBand, selectivity: null }); // auto off
        setActiveTrigger(set.id);
      },
    })));
  const list = el('div', { class: 'trg-list' });
  for (const set of state.triggerSets) {
    normalizeTriggerSet(set);
    const isActive = state.activeTriggerSet === set.id;
    const count = state.bank ? resolveTriggers(set, state.bank).length : (set.pins || []).length;
    const countEl = el('span', { class: 'trg-count', text: `${count}` });
    const hasEdits = (set.pins || []).length || (set.suppress || []).length;
    const dynSel = el('select', {
      class: 'trg-dyn',
      title: 'Dynamics — Detected: punch from the music · Uniform: every hit equal · Manual: hand-edit strengths',
      onchange: (e) => { set.dynamics = e.target.value; autosaveAutomation(); commitHistory(); refreshTriggers(); },
    },
      el('option', { value: 'detected', text: 'Detected' }),
      el('option', { value: 'uniform', text: 'Uniform' }),
      el('option', { value: 'manual', text: 'Manual' }));
    dynSel.value = set.dynamics || 'detected';
    const shapeSvg = decayShapeSvg(set);
    const decayWrap = el('span', { class: 'trg-decay-wrap', title: 'Decay — how long each hit lingers: snappy flick ↔ smooth swell' },
      el('input', {
        type: 'range', min: 0.02, max: 1, step: 0.01, value: set.decay ?? 0.18, class: 'trg-decay',
        oninput: (e) => {
          set.decay = parseFloat(e.target.value);
          shapeSvg._line.setAttribute('points', decayShapePoints(set.decay));
          refreshTriggerSources();
        },
        onchange: () => { autosaveAutomation(); commitHistory(); },
      }), shapeSvg);
    list.append(el('div', { class: `trg-row${isActive ? ' active' : ''}` },
      el('span', {
        class: 'trg-swatch', style: `background:${set.color}`,
        title: 'select to tune / emphasise on the timeline',
        onclick: () => setActiveTrigger(set.id),
      }),
      el('input', {
        type: 'text', class: 'trg-name-input', value: set.name, title: 'rename set',
        onchange: (e) => { set.name = e.target.value.trim() || set.name; e.target.value = set.name; autosaveAutomation(); refreshTriggerSources(); panel.rebuild(); },
      }),
      countEl,
      el('input', {
        type: 'range', min: 0, max: 1, step: 0.05, value: set.selectivity ?? 0.5,
        class: 'trg-sel', title: 'selectivity — fewer ⇄ more auto markers (live)',
        oninput: (e) => {
          const markers = retuneSet(set, state.bank, parseFloat(e.target.value));
          countEl.textContent = `${markers.length}`;
          refreshTriggerSources();
        },
        onchange: () => { autosaveAutomation(); commitHistory(); },
      }),
      dynSel,
      el('button', {
        class: 'ctl-btn ctl-mini', text: 'Reset', title: 'clear manual edits (pins + deletions) back to pure auto',
        disabled: !hasEdits,
        onclick: () => { resetTriggerEdits(set); autosaveAutomation(); commitHistory(); refreshTriggers(); },
      }),
      decayWrap,
      el('button', {
        class: 'ctl-btn ctl-mini', text: set.show ? 'Shown' : 'Hidden', title: 'show on the timeline',
        onclick: () => { set.show = !set.show; autosaveAutomation(); refreshTriggers(); },
      }),
      el('button', {
        class: 'ctl-btn ctl-mini', text: '×', title: 'delete set',
        onclick: () => {
          if (state.editTriggerSet === set) closeTriggerEdit();
          sweepDeletedSource(set.id); state.triggerSets = state.triggerSets.filter((s) => s !== set);
          autosaveAutomation(); refreshTriggers();
        },
      })));
  }
  box.append(list);
}

// Reactive S2: create + register a trigger set (auto+pinned shape).
function newTriggerSet(props) {
  const n = state.triggerSets.length;
  const set = normalizeTriggerSet({
    id: `trg${Date.now().toString(36)}`, name: 'Set',
    band: 'low', selectivity: 0.5, decay: 0.18, show: true,
    color: TRIGGER_COLORS[n % TRIGGER_COLORS.length],
    pins: [], suppress: [], dynamics: 'detected',
    ...props,
  });
  state.triggerSets.push(set);
  autosaveAutomation(); commitHistory(); refreshTriggers();
  return set;
}

// Slice 3: open/close a trigger set in the timeline lane editor (reuses the
// lane chrome; mutually exclusive with a param automation lane).
function openTriggerEdit(set) {
  state.lane = null;
  state.editTriggerSet = set;
  laneInfo.textContent = `Triggers · ${set.name}`;
  laneCluster.hidden = false;
  bottomBar.classList.add('lane-open');
  applyStoredBarHeight();
  timeline.editTriggers(set);
  panel.highlight(null);
  renderLaneChips();
  buildTriggersSection();
}

function closeTriggerEdit() {
  state.editTriggerSet = null;
  laneCluster.hidden = true;
  bottomBar.classList.remove('lane-open');
  applyStoredBarHeight();
  timeline.editTriggers(null);
  buildTriggersSection();
}

function refreshTriggers() {
  buildTriggersSection();
  refreshTriggerSources();
}

// Reactive S2: recompute the bank's trigger modulation sources from the
// auto+pinned model (resolveTriggers) + the timeline overlay.
function refreshTriggerSources() {
  if (state.bank) {
    for (const s of state.triggerSets) normalizeTriggerSet(s);
    state.bank.setTriggerSources(state.triggerSets.map((s) => ({
      id: s.id, decay: s.decay,
      triggers: resolveTriggers(s, state.bank).map((m) => ({ t: m.t, s: m.s })),
    })));
  }
  pushTriggerOverlays();
}

// Slice 2: drop a deleted set's stale `<param>~trg:<id>` depth/config keys.
function sweepDeletedSource(id) {
  const suffix = `${MOD_SEP}trg:${id}`;
  for (const k of Object.keys(state.params || {})) {
    if (k.includes(suffix)) delete state.params[k];
  }
}

// Slice 1b: push shown trigger sets (derived ticks) to the timeline overlay.
// Reactive S1: each carries an `active` flag so the timeline emphasises the set
// being tuned and dims the rest.
function triggerOverlayPayload() {
  const on = state.triggerOverlays !== false;
  if (!(on && state.bank)) return [];
  return state.triggerSets.filter((s) => s.show).map((s) => ({
    id: s.id, color: s.color, markers: resolveTriggers(normalizeTriggerSet(s), state.bank),
    active: s.id === state.activeTriggerSet,
  }));
}
function pushTriggerOverlays() {
  if (timeline.setTriggerSets) timeline.setTriggerSets(triggerOverlayPayload());
}

// Reactive S1: select (or toggle off) the active set — the one tuned/emphasised.
function setActiveTrigger(id) {
  state.activeTriggerSet = (state.activeTriggerSet === id) ? null : id;
  buildTriggersSection();
  pushTriggerOverlays();
}

function formatNum(v, s) {
  const d = s.step >= 1 ? 0 : s.step >= 0.1 ? 1 : 2;
  return Number(v).toFixed(d);
}

// R8-4: mapping summary — what each audio source is currently driving, read
// from direct modulation depths on `target~src` keys (rack-macro routing is
// parked, see TODO below). Answers "Bass -> Shape Pulse amount, Beat ->
// Camera bump, Highs -> Particle shimmer".
function refreshSignalMapping() {
  const box = document.getElementById('signalMapping');
  if (!box) return;
  // Nothing to drive until a project is loaded — don't surface the baked-in
  // default reactivity as if it were user-configured on an empty screen.
  if (!state.project) {
    box.textContent = '';
    box.append(el('span', { class: 'hint', text: 'load a project and play to see what the music is driving' }));
    return;
  }
  const srcLabel = { low: 'Low', mid: 'Mid', high: 'High', loud: 'Loud', onset: 'Transient', beat: 'Beat' };
  const bySrc = {};
  const add = (src, text) => { (bySrc[src] = bySrc[src] || []).push(text); };
  const p = params();
  // direct modulation depths: `target~src`
  for (const k in p) {
    const sep = k.indexOf(MOD_SEP);
    if (sep < 0 || k.indexOf('@') >= 0 || !p[k]) continue;
    const src = k.slice(sep + 1);
    if (!MOD_SOURCES.includes(src)) continue;
    const s = SCHEMA_INDEX[k.slice(0, sep)];
    if (s) add(src, `${s.groupLabel} · ${s.label}`);
  }
  // TODO Phase 3: list rack macros (state.racks) modulated by a source then
  // driving mapped params. Parked while the rack UI is absent.
  box.textContent = '';
  const active = MOD_SOURCES.filter((s) => bySrc[s]);
  if (!active.length) {
    box.append(el('span', { class: 'hint', text: 'nothing routed yet — open a device’s ∿ to map a source' }));
    return;
  }
  for (const src of active) {
    box.append(el('div', { class: 'sig-map-row' },
      el('span', { class: 'sig-map-src', text: srcLabel[src] }),
      el('span', { class: 'sig-map-tgt', text: [...new Set(bySrc[src])].slice(0, 6).join(' · ') })));
  }
}

// Log-frequency x mapping for the spectrum editing surface (R9-8).
const specXOf = (f, w) => Math.log(Math.max(f, SPEC_F0) / SPEC_F0) / Math.log(SPEC_F1 / SPEC_F0) * w;
const specFOf = (x, w) => SPEC_F0 * Math.pow(SPEC_F1 / SPEC_F0, Math.min(Math.max(x / w, 0), 1));

// Per-frame spectrum (log-frequency bins + draggable Low/Mid/High crossover
// regions) + source meters. Called from the render loop when the panel is open.
function drawSignal(feat) {
  if (!signalOpen) return;
  const ctx = spectrumCanvas.getContext('2d');
  const w = spectrumCanvas.width;
  const h = spectrumCanvas.height;
  const dpr = spectrumCanvas._dpr || 1;
  const base = h - 18 * dpr;
  const p = params();
  const xLow = specXOf(p.audLowMid ?? 160, w);
  const xHigh = specXOf(p.audMidHigh ?? 2000, w);
  ctx.clearRect(0, 0, w, h);
  // region shades = the Low / Mid / High the modulation actually derives
  const regions = [[0, xLow, 'rgba(122,162,255,0.10)'], [xLow, xHigh, 'rgba(140,230,160,0.10)'], [xHigh, w, 'rgba(255,180,90,0.10)']];
  for (const [x0, x1, c] of regions) { ctx.fillStyle = c; ctx.fillRect(x0, 0, x1 - x0, base); }
  // live spectrum bins (16-band analysis), placed by log frequency
  const edges = state.bank && state.bank.bandEdges;
  const b = feat.bands16;
  if (edges && b) {
    for (let i = 0; i < b.length && i + 1 < edges.length; i++) {
      const x0 = specXOf(edges[i], w);
      const x1 = specXOf(edges[i + 1], w);
      const v = Math.min(b[i], 1);
      const center = Math.sqrt(edges[i] * edges[i + 1]);
      ctx.fillStyle = center < (p.audLowMid ?? 160) ? '#7aa2ff'
        : center < (p.audMidHigh ?? 2000) ? '#8ce6a0' : '#ffb45a';
      ctx.fillRect(x0 + 1, base - v * base, Math.max(x1 - x0 - 1, 1), v * base);
    }
  }
  // a label with a dark backing so it stays legible over the bars
  const tag = (text, x, y, col) => {
    ctx.font = `600 ${11 * dpr}px system-ui, sans-serif`;
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(8,9,12,0.7)';
    ctx.fillRect(x - 3 * dpr, y - 11 * dpr, tw + 6 * dpr, 14 * dpr);
    ctx.fillStyle = col;
    ctx.fillText(text, x, y);
  };
  // crossover handles + Hz readouts
  for (const [x, f] of [[xLow, p.audLowMid ?? 160], [xHigh, p.audMidHigh ?? 2000]]) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(x - dpr, 0, 2 * dpr, base);
    ctx.fillRect(x - 5 * dpr, base * 0.5 - 9 * dpr, 10 * dpr, 18 * dpr); // grab handle
    const hz = f >= 1000 ? `${(f / 1000).toFixed(1)}kHz` : `${Math.round(f)}Hz`;
    tag(hz, Math.min(x + 5 * dpr, w - 52 * dpr), 13 * dpr, '#fff');
  }
  // region labels along the bottom
  tag('LOW', 4 * dpr, h - 4 * dpr, '#9db8ff');
  tag('MID', (xLow + xHigh) / 2 - 12 * dpr, h - 4 * dpr, '#a6e8b8');
  tag('HIGH', Math.min(xHigh + 8 * dpr, w - 40 * dpr), h - 4 * dpr, '#ffc888');

  const sv = modValues(feat);
  for (let i = 0; i < sourceMeters.length; i++) {
    const m = sourceMeters[i];
    const v = Math.min(sv[i], 1);
    m.fill.style.width = `${v * 100}%`;
    m.val.textContent = `${Math.round(v * 100)}%`;
  }
}

// R9-8: drag the crossover handles directly on the spectrum.
let specDrag = null;
function specCrossAt(e) {
  const rect = spectrumCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width * spectrumCanvas.width;
  const w = spectrumCanvas.width;
  const p = params();
  if (Math.abs(x - specXOf(p.audLowMid ?? 160, w)) < 8) return 'audLowMid';
  if (Math.abs(x - specXOf(p.audMidHigh ?? 2000, w)) < 8) return 'audMidHigh';
  return null;
}
if (spectrumCanvas) {
  spectrumCanvas.addEventListener('pointerdown', (e) => {
    specDrag = specCrossAt(e);
    if (specDrag) spectrumCanvas.setPointerCapture(e.pointerId);
  });
  spectrumCanvas.addEventListener('pointermove', (e) => {
    if (!specDrag) { spectrumCanvas.style.cursor = specCrossAt(e) ? 'ew-resize' : ''; return; }
    const rect = spectrumCanvas.getBoundingClientRect();
    const w = spectrumCanvas.width;
    const x = (e.clientX - rect.left) / rect.width * w;
    let f = specFOf(x, w);
    const s = SCHEMA_INDEX[specDrag];
    // keep the two crossovers ordered and within their schema ranges
    f = Math.min(Math.max(f, s.min), s.max);
    if (specDrag === 'audLowMid') f = Math.min(f, (params().audMidHigh ?? 2000) - 20);
    else f = Math.max(f, (params().audLowMid ?? 160) + 20);
    setParamValue(specDrag, Math.round(f));
    if (state.bank) state.bank.setResponse(responseOf(params()));
  });
  spectrumCanvas.addEventListener('pointerup', (e) => {
    if (specDrag) { specDrag = null; autosaveAutomation(); }
    try { spectrumCanvas.releasePointerCapture(e.pointerId); } catch (err) { /* not captured */ }
  });
}

async function refreshPresets() {
  const list = document.getElementById('presetList');
  list.textContent = '';
  const presets = await fetch('/api/presets').then((r) => r.json());
  for (const p of presets) {
    const li = el('li', { text: p.name, onclick: () => applyPreset(p) });
    li.append(el('button', {
      class: 'mini-del', text: '×', title: 'delete preset',
      onclick: async (e) => {
        e.stopPropagation();
        await fetch(`/api/presets/${p.slug}`, { method: 'DELETE' });
        refreshPresets();
      },
    }));
    list.append(li);
  }
}

function applyPreset(p) {
  // migrate converts pre-matrix presets (xxxAudio/xxxSrc) to mod depths
  state.params = { ...defaultParams(), ...migrateLegacyParams(p.params) };
  if (p.pack) state.packId = p.pack;
  if (p.reframe) Object.assign(state.reframe, p.reframe);
  // Presets may carry a tempo grid + automation (drawn against this song's
  // bars); ones saved without automation clear the lanes for predictability.
  if (p.tempo) Object.assign(tempoMap, p.tempo);
  automation.load(p.automation || null);
  if (Array.isArray(p.chain)) {
    state.chain = PARAM_GROUPS
      .filter((g) => g.pinned || p.chain.includes(g.id))
      .map((g) => g.id);
  }
  state.racks = Array.isArray(p.racks) ? sanitizeRacks(p.racks) : [];
  rebuildParamIndex();   // rack macro keys (rkN.mM) into SCHEMA_INDEX before UI/lane rebuild
  state.editRack = null;
  exitMapMode();
  buildRacksArea();
  syncChainToParams();
  if (state.bank) state.bank.setTempo(tempoMap.bpm, tempoMap.offset);
  applyTempoUI();
  closeLane();
  autosaveAutomation();
  commitHistory();
  if (p.aspect && ASPECTS[p.aspect]) {
    state.aspect = p.aspect;
    for (const b of aspectSeg.children) b.classList.toggle('active', b.textContent === p.aspect);
  }
  if (p.fps) { state.fps = p.fps; fpsSelect.value = String(p.fps); }
  panel.rebuild();
  layoutCanvas();
  renderer.resetFeedback();
  if (state.bank) state.bank.setResponse(responseOf(params()));
  toast(`Preset "${p.name}" loaded`);
}

document.getElementById('savePresetBtn').addEventListener('click', async () => {
  const nameInput = document.getElementById('presetName');
  const name = nameInput.value.trim() || `preset ${new Date().toLocaleString()}`;
  await fetch('/api/presets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name, pack: state.packId, aspect: state.aspect, fps: state.fps,
      params: params(), reframe: state.reframe, chain: state.chain,
      racks: state.racks, // Racks v1: matches applyPreset's p.racks restore
      tempo: tempoMap.toJSON(), automation: automation.toJSON(),
    }),
  });
  nameInput.value = '';
  refreshPresets();
  toast(`Preset "${name}" saved`);
});

// ---------------------------------------------------------- Racks library
// Task 4.4: save a live rack to the library, apply a saved rack onto the
// project, and refresh the saved-racks list (mirrors the preset CRUD above).
function saveRack(rackId) {
  const r = state.racks.find((x) => x.id === rackId);
  if (!r) return;
  const name = prompt('Save rack as', r.name);
  if (!name || !name.trim()) return;
  fetch('/api/racks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...rackToSaved(r, params()), name: name.trim() }),
  })
    .then((resp) => {
      if (!resp.ok) throw new Error('save failed');
      refreshRackLibrary();
      toast(`Rack "${name.trim()}" saved`);
    })
    .catch(() => toast('Could not save rack.', 'error'));
}

function applyRackToProject(saved) {
  if (state.racks.length >= MAX_RACKS) {
    toast(`A project can have up to ${MAX_RACKS} racks.`, 'error');
    return;
  }
  const snap = applyRackToState(
    saved,
    { chain: state.chain, params: params(), racks: state.racks },
    nextRackId(),
  );
  state.chain = PARAM_GROUPS
    .filter((g) => g.pinned || snap.chain.includes(g.id))
    .map((g) => g.id);
  state.params = snap.params;
  state.racks = snap.racks;
  rebuildParamIndex();
  syncChainToParams();
  panel.rebuild();
  buildRacksArea();
  if (state.bank) state.bank.setResponse(responseOf(params()));
  autosaveAutomation();
  commitHistory();
  toast(`Rack "${saved.name}" added`);
}

async function refreshRackLibrary() {
  const section = document.getElementById('rackLibrary');
  if (!RACKS_ENABLED) {           // WIP: rack-presets library parked — hide the section
    if (section) section.hidden = true;
    return;
  }
  if (section) section.hidden = false;
  const list = document.getElementById('rackList');
  if (!list) return;
  list.textContent = '';
  let racks = [];
  try {
    const resp = await fetch('/api/racks');
    if (!resp.ok) throw new Error('list failed');
    racks = await resp.json();
  } catch (e) {
    list.append(el('li', { class: 'hint', text: 'Rack library unavailable' }));
    return;
  }
  if (!racks.length) {
    list.append(el('li', { class: 'hint', text: 'No rack presets saved yet' }));
    return;
  }
  for (const s of racks) {
    const li = el('li', { text: s.name, onclick: () => applyRackToProject(s) });
    li.append(el('button', {
      class: 'mini-del', text: '×', title: 'delete saved rack',
      onclick: async (e) => {
        e.stopPropagation();
        try {
          const resp = await fetch(`/api/racks/${s.slug}`, { method: 'DELETE' });
          if (!resp.ok) throw new Error('delete failed');
          refreshRackLibrary();
        } catch (err) {
          toast('Could not delete saved rack.', 'error');
        }
      },
    }));
    list.append(li);
  }
}

function focusRackLibrary() {
  const section = document.getElementById('rackLibrary');
  if (!section) return;
  section.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  section.classList.add('library-focus');
  setTimeout(() => section.classList.remove('library-focus'), 900);
}

async function refreshExports() {
  const list = document.getElementById('exportList');
  list.textContent = '';
  const files = await fetch('/api/exports').then((r) => r.json());
  for (const f of files.slice(0, 10)) {
    const mb = (f.size / 1048576).toFixed(1);
    list.append(el('li', {}, el('a', {
      href: `/api/exports/${f.name}`, text: `${f.name} (${mb} MB)`, target: '_blank',
    })));
  }
}

// --------------------------------------------------------------- export

const exportModal = document.getElementById('exportModal');
const exportResolution = document.getElementById('exportResolution');
const exportProgress = document.getElementById('exportProgress');
const exportStatus = document.getElementById('exportStatus');

// R6-5: export visibility outside the modal — a top-bar pill (click to
// reopen), Hide-while-exporting, and progress in the tab title.
const exportPill = document.getElementById('exportPill');
const exportHideBtn = document.getElementById('exportHide');
exportHideBtn.addEventListener('click', () => { exportModal.hidden = true; });
exportPill.addEventListener('click', () => {
  exportModal.hidden = false;
  if (!state.exporting) { // terminal pill state: acknowledge + clear
    exportPill.hidden = true;
    exportPill.classList.remove('pill-ok', 'pill-err');
  }
});
function setPill(text, cls = '') {
  exportPill.hidden = false;
  exportPill.textContent = text;
  exportPill.classList.remove('pill-ok', 'pill-err');
  if (cls) exportPill.classList.add(cls);
}

const exportRange = document.getElementById('exportRange');
const exportRangeHint = document.getElementById('exportRangeHint');
const exportSummary = document.getElementById('exportSummary');
exportRange.addEventListener('change', () => {
  exportRangeHint.hidden = exportRange.value !== 'loop';
  updateExportSummary();
});
exportResolution.addEventListener('change', updateExportSummary);
document.getElementById('exportBatch').addEventListener('change', updateExportSummary);

// R10-5: tell the user exactly what file they're about to make.
function updateExportSummary() {
  if (!state.project || !state.bank) { exportSummary.textContent = ''; return; }
  const batch = document.getElementById('exportBatch').checked;
  const res = RESOLUTIONS[state.aspect][parseInt(exportResolution.value || '0', 10)] || RESOLUTIONS[state.aspect][0];
  let dur = state.bank.duration;
  if (exportRange.value === 'loop' && loopValid()) {
    dur = clamp(tempoMap.timeAt(loopRegion.endB), 0, state.bank.duration)
      - clamp(tempoMap.timeAt(loopRegion.startB), 0, state.bank.duration);
  }
  const parts = batch
    ? ['All 3 aspects', `${state.fps} fps`, formatTime(dur), 'AAC 320k', 'MP4 (H.264)']
    : [state.aspect, `${res.w}×${res.h}`, `${state.fps} fps`, formatTime(dur), 'AAC 320k', 'MP4 (H.264)'];
  exportSummary.textContent = parts.join('  ·  ');
}

document.getElementById('exportBtn').addEventListener('click', () => {
  if (!state.project) { toast('Load audio + a base layer first.', 'error'); return; }
  exportResolution.textContent = '';
  for (const [i, r] of RESOLUTIONS[state.aspect].entries()) {
    exportResolution.append(el('option', { value: String(i), text: r.label }));
  }
  // range option mirrors the loop region
  const loopOpt = exportRange.options[1];
  if (loopValid()) {
    const bpb = tempoMap.beatsPerBar;
    loopOpt.disabled = false;
    loopOpt.text = `Loop region (bars ${(loopRegion.startB / bpb + 1).toFixed(1)}–${(loopRegion.endB / bpb + 1).toFixed(1)})`;
    if (loopRegion.on) exportRange.value = 'loop';
  } else {
    loopOpt.disabled = true;
    loopOpt.text = 'Loop region (none set)';
    exportRange.value = 'all';
  }
  exportRangeHint.hidden = exportRange.value !== 'loop';
  exportProgress.value = 0;
  exportStatus.textContent = '';
  updateExportSummary();
  exportModal.hidden = false;
});
document.getElementById('exportCancel').addEventListener('click', () => {
  if (state.exporting || state.serverRendering) state.abortExport = true;
  else exportModal.hidden = true;
});

// Force the current edits into the server session NOW (the headless renderer
// reads the saved session to reproduce this exact state), bypassing the
// debounced autosave.
async function saveSessionNow() {
  if (!state.project) return;
  try {
    await fetch(`/api/project/${state.project.id}/session`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildSessionPayload(true)),
    });
  } catch (e) { /* non-fatal — headless falls back to the last autosave */ }
}

// Kick off a server-side (headless) render of the current project and poll it
// to completion. The user can keep editing or close the tab — the job keeps
// running on the server and lands in the Exports list either way.
async function startServerRender({ quality, motionBlur }) {
  const res = RESOLUTIONS[state.aspect][parseInt(exportResolution.value || '0', 10)]
    || RESOLUTIONS[state.aspect][0];
  let start = 0;
  let duration = 0;
  if (exportRange.value === 'loop' && loopValid() && state.bank) {
    const t0r = clamp(tempoMap.timeAt(loopRegion.startB), 0, state.bank.duration);
    const t1r = clamp(tempoMap.timeAt(loopRegion.endB), 0, state.bank.duration);
    if (t1r - t0r > 0.05) { start = t0r; duration = t1r - t0r; }
  }
  state.serverRendering = true;
  state.abortExport = false;
  exportHideBtn.hidden = false;
  exportProgress.value = 0;
  exportStatus.textContent = 'saving state + starting server render…';
  setPill('Server render… 0%');
  try {
    await saveSessionNow();
    const { id } = await fetch('/api/render-jobs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: state.project.id, aspect: state.aspect,
        width: res.w, height: res.h, fps: state.fps, quality, motionBlur,
        start, duration,
      }),
    }).then((r) => {
      if (!r.ok) throw new Error('could not start server render (no Chrome/Edge?)');
      return r.json();
    });
    state.serverRenderJob = id;
    while (true) {
      if (state.abortExport) {
        await fetch(`/api/render-jobs/${id}`, { method: 'DELETE' }).catch(() => {});
        throw new Error('Server render cancelled.');
      }
      await new Promise((r) => setTimeout(r, 1000));
      const job = await fetch(`/api/render-jobs/${id}`).then((r) => r.json());
      const pct = Math.round((job.progress || 0) * 100);
      exportProgress.value = job.progress || 0;
      exportStatus.textContent = `server render… ${pct}% (you can close this tab)`;
      setPill(`Server render… ${pct}%`);
      if (job.status === 'done') {
        exportProgress.value = 1;
        exportStatus.textContent = `✓ server render ready: ${job.file}`;
        setPill('✓ server render ready', 'pill-ok');
        toast(`Server render complete: ${job.file}`, 'ok', 8000);
        break;
      }
      if (job.status === 'error') throw new Error(job.message || 'server render failed');
      if (job.status === 'cancelled') throw new Error('Server render cancelled.');
    }
  } catch (err) {
    exportStatus.textContent = `✗ ${err.message}`;
    setPill('✗ server render failed', 'pill-err');
    toast(err.message, 'error');
  } finally {
    state.serverRendering = false;
    state.abortExport = false;
    state.serverRenderJob = null;
    exportHideBtn.hidden = true;
    refreshExports();
  }
}

// Headless entry point: when the server opens /?headlessJob=ID in a headless
// browser, reproduce the saved project state and run the export through the
// same path the UI uses, then report the outcome back to the job.
async function runHeadlessJob(jobId) {
  const report = (body) =>
    fetch(`/api/render-jobs/${jobId}/result`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {});
  try {
    const job = await fetch(`/api/render-jobs/${jobId}`).then((r) => r.json());
    const spec = job.spec || {};
    const projects = await fetch('/api/projects').then((r) => r.json());
    const meta = projects.find((p) => p.id === spec.projectId);
    if (!meta) throw new Error('project not found for render job');
    await loadProject(meta);
    if (spec.aspect && state.reframe[spec.aspect]) state.aspect = spec.aspect;
    if (spec.fps) state.fps = spec.fps;
    let lastPct = -1;
    state.exporting = true; // keep the preview frame loop off the renderer
    let summary;
    try {
      summary = await runExport({
        renderer, bank: state.bank, getParams: (t) => effParams(t),
        reframe: state.reframe[state.aspect],
        projectId: meta.id,
        start: spec.start || 0, duration: spec.duration || undefined,
        width: spec.width, height: spec.height, fps: spec.fps, quality: spec.quality,
        motionBlur: !!spec.motionBlur,
        onProgress: (frac) => {
          const pct = Math.floor(frac * 100);
          if (pct !== lastPct && pct % 2 === 0) {
            lastPct = pct;
            fetch(`/api/render-jobs/${jobId}/progress`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ progress: frac }),
            }).catch(() => {});
          }
        },
        shouldAbort: () => false,
      });
    } finally {
      state.exporting = false;
    }
    await report({ ok: true, file: summary.file, size: summary.size });
  } catch (e) {
    await report({ ok: false, message: String((e && e.message) || e) });
  }
}

document.getElementById('exportGo').addEventListener('click', async () => {
  if (state.exporting || state.serverRendering) return;
  const batch = document.getElementById('exportBatch').checked;
  const quality = document.getElementById('exportQuality').value;
  const motionBlur = document.getElementById('exportMotionBlur').checked;
  if (document.getElementById('exportServer').checked) {
    await startServerRender({ quality, motionBlur });
    return;
  }
  const aspects = batch ? Object.keys(ASPECTS) : [state.aspect];

  state.exporting = true;
  state.abortExport = false;
  transport.pause();
  playBtn.textContent = '▶';
  exportHideBtn.hidden = false;
  setPill('Exporting… 0%');

  const exportedFiles = [];
  try {
    for (const aspect of aspects) {
      const res = batch
        ? RESOLUTIONS[aspect][0]
        : RESOLUTIONS[aspect][parseInt(exportResolution.value || '0', 10)];
      exportStatus.textContent = `rendering ${aspect} @ ${res.w}×${res.h}, ${state.fps} fps…`;
      // optional range: render + audio-trim the loop region only
      let rangeStart = 0;
      let rangeDur = 0;
      if (exportRange.value === 'loop' && loopValid() && state.bank) {
        const t0r = clamp(tempoMap.timeAt(loopRegion.startB), 0, state.bank.duration);
        const t1r = clamp(tempoMap.timeAt(loopRegion.endB), 0, state.bank.duration);
        if (t1r - t0r > 0.05) {
          rangeStart = t0r;
          rangeDur = t1r - t0r;
        }
      }
      const t0 = performance.now();
      const summary = await runExport({
        renderer, bank: state.bank, getParams: (t) => effParams(t),
        reframe: state.reframe[aspect],
        projectId: state.project.id,
        start: rangeStart, duration: rangeDur || undefined,
        width: res.w, height: res.h, fps: state.fps, quality, motionBlur,
        onProgress: (frac, frame, total) => {
          exportProgress.value = frac;
          const fps = frame / ((performance.now() - t0) / 1000);
          exportStatus.textContent =
            `${aspect}: frame ${frame}/${total} (${fps.toFixed(1)} fps render)`;
          const pct = Math.round(frac * 100);
          setPill(`Exporting… ${pct}%`);
          document.title = `${pct}% — Still Reactive`;
        },
        onStatus: (text) => { exportStatus.textContent = `${aspect}: ${text}`; },
        shouldAbort: () => state.abortExport,
      });
      exportedFiles.push(`${summary.file} (${(summary.size / 1048576).toFixed(1)} MB)`);
      toast(`Exported ${summary.file}`, 'ok', 8000);
    }
    // Stay open with an unmissable terminal state — a transient toast is
    // not enough certainty for a 20-minute export.
    exportProgress.value = 1;
    exportStatus.textContent = `✓ saved: ${exportedFiles.join(' · ')} — see EXPORTS in the sidebar`;
    setPill('✓ exported', 'pill-ok');
    clearTimeout(exportPill._t);
    exportPill._t = setTimeout(() => {
      if (!state.exporting && exportPill.classList.contains('pill-ok')) {
        exportPill.hidden = true;
        exportPill.classList.remove('pill-ok');
      }
    }, 60000);
  } catch (err) {
    exportStatus.textContent = `✗ export FAILED: ${err.message}`;
    setPill('✗ export failed', 'pill-err'); // stays until clicked
    toast(err.message, 'error');
  } finally {
    state.exporting = false;
    state.abortExport = false;
    exportHideBtn.hidden = true;
    document.title = 'Still Reactive';
    layoutCanvas();
    refreshExports();
  }
});

window.addEventListener('beforeunload', (e) => {
  if (state.exporting) e.preventDefault();
});

// ------------------------------------------------------------ main loop

let lastNow = performance.now();
let liveTickFrame = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastNow) / 1000, 0.1);
  lastNow = now;
  if (state.exporting) return;     // exporter drives the renderer itself
  if (!renderer.ready || !state.bank) return;
  const t = transport.time;
  const feat = state.bank.sample(t);
  // hovering a look in the browser previews it live (no commit)
  const ep = lookPreviewParams || effParams(t);
  renderer.render(t, dt, feat, ep, state.reframe[state.aspect]);
  drawOverlay(); // guides + live Gen placement gizmo (cheap 2D ops)
  processThumbQueue();             // populate look thumbnails, one per frame
  timeline.setTime(t, transport.playing);
  timeLabel.textContent = `${formatTime(t)} / ${formatTime(state.bank.duration)}`;
  if (transport.playing && playBtn.textContent === '▶') playBtn.textContent = '❚❚';
  liveTickFrame = (liveTickFrame + 1) % 3;
  if (liveTickFrame === 0) {       // ~20 Hz is plenty for the displays
    const eff = applyModulation(ep, feat);
    panel.updateLiveValues(eff, modValues(feat), feat.trg);
    drawSignal(feat);
  }
}

layoutCanvas();
applyMode();
refreshProjects();
refreshPresets();
refreshRackLibrary();
refreshExports();
requestAnimationFrame(frame);

// Server-side render: the backend opens /?headlessJob=ID in a headless browser
// to run an export without depending on the user's foreground tab.
const headlessJobId = new URLSearchParams(location.search).get('headlessJob');
if (headlessJobId) runHeadlessJob(headlessJobId);

// Task 2.2 test hook: real rebuildParamIndex + shared SCHEMA_INDEX reference.
// Task 2.3: extended with clearRackLanes + automation for orphan-lane tests.
window.__rebuild = {
  run: rebuildParamIndex,
  schema: SCHEMA_INDEX,                 // the live shared object
  autoSchema: () => automation.schema,  // same reference the automation holds
  state,
  clearRackLanes,                       // Task 2.3: orphan-lane cleanup helper
  automation,                           // Task 2.3: live AutomationSet instance
};

// Timeline waveform test hook (Spec 1).
window.__timeline = timeline;
window.__triggers = { state, deriveTriggerSet, sweepDeletedSource,
  addTrigger, moveTrigger, setTriggerStrength, deleteTrigger, reDetectSet }; // Slice 1b/2/3 hook
window.__getModSources = () => modSourceList();
window.__panelRebuild = () => panel.rebuild();

// Task 3.1 test hook: rack CRUD. Later tasks Object.assign() their own fns.
// ADDITIVE ONLY — do not reference functions that don't exist yet (Tasks 3.2+).
window.__racks = { createRack, deleteRack, renameRack, state };
// Task 3.2: device membership ops.
Object.assign(window.__racks, { addDeviceToRack, removeDeviceFromRack });
// Task 3.3: rack-scoped mapping.
Object.assign(window.__racks, { mapParamToMacro });
// Task 3.4: auto rack.
Object.assign(window.__racks, { autoRack });
// Task 4.4: apply saved rack to project.
Object.assign(window.__racks, { applyRackToProject });
// Item 1: mapping correctness test hooks.
Object.assign(window.__racks, { sanitizeRacks, updateMapping, resetMapping, removeMapping });
// Task 5.1: session payload test hook.
window.__buildSessionPayload = () => JSON.stringify(buildSessionPayload());
window.__commitHistory = commitHistory; // Slice 3 undo test
window.__setActiveTrigger = setActiveTrigger;          // Reactive S1
window.__triggerOverlayPayload = triggerOverlayPayload; // Reactive S1
window.__retune = retuneSet;                            // Reactive S1
window.__normalizeTriggerSet = normalizeTriggerSet;     // Reactive S2
window.__decayCurve = decayCurve;                       // Reactive S2
// Task 5.2: undo test hook.
window.__undo = () => undoAutomation();
