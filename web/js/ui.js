// DOM helpers + the parameter panel builder (built from the schema).

import { PARAM_GROUPS, MOD_SOURCES, MOD_SEP, FAMILY_ORDER } from './params.js';

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const child of children) {
    if (child != null) node.append(child);
  }
  return node;
}

export function toast(message, kind = 'info', ms = 4200) {
  const box = document.getElementById('toast');
  box.textContent = message;
  box.className = `show ${kind}`;
  clearTimeout(box._timer);
  box._timer = setTimeout(() => { box.className = ''; }, ms);
}

export function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Builds the right-hand parameter panels. getParams/setParam connect to app
// state. onAutomation(key) opens the lane editor for a param; laneState(key)
// returns 'none' | 'on' | 'off' to drive the automation LEDs;
// onAutomationMenu(key, event) opens the quick-action menu (right-click).
// Every continuous param row carries a ∿ disclosure that opens its
// modulation editor: one source at a time (dropdown), bipolar depth,
// threshold + gate, and a live source meter.
export class ParamPanel {
  constructor(container, {
    getParams, setParam, onAutomation = null, laneState = () => 'none',
    getChain = null, onAddDevice = null, onRemoveDevice = null,
    onResetDevice = null, onAutoGrade = null, onAutomationMenu = null,
    onCommit = null, isMapped = () => false,
  }) {
    this.container = container;
    // Base-value edits become undoable: a range slider fires 'change' on
    // release, checkboxes/enums on toggle — commit one history snapshot at
    // that gesture boundary (never per 'input'/pointer-move). The transient
    // numeric type-in editor commits explicitly, so skip it here.
    container.addEventListener('change', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('value-edit')) return;
      if (this.onCommit) this.onCommit();
    });
    this.getParams = getParams;
    this.setParam = setParam;
    this.onAutomation = onAutomation;
    this.onAutomationMenu = onAutomationMenu;
    this.laneState = laneState;
    this.getChain = getChain;
    this.onAddDevice = onAddDevice;
    this.onRemoveDevice = onRemoveDevice;
    this.onResetDevice = onResetDevice;
    this.onAutoGrade = onAutoGrade;
    this.onCommit = onCommit;
    this.isMapped = isMapped;
    this.inputs = new Map();   // key -> input element
    this.autoBtns = new Map(); // key -> automation LED button
    this.modBtns = new Map();  // base key -> ∿ disclosure button
    this.modStrips = new Map(); // base key -> strip controller
    this.live = new Map();     // key -> {input, schema} sliders driven live
    this.openDevices = new Set(PARAM_GROUPS.filter((g) => g.open).map((g) => g.id));
    this.openAdv = new Set(); // devices whose More… tail is unfolded
    this.focusMode = true;    // R7-5: expanding a device collapses the others
    this.build();
  }

  setFocusMode(on) {
    this.focusMode = on;
    if (on) {
      // keep only the first expanded device open
      let kept = false;
      for (const d of this.container.querySelectorAll('details.group')) {
        if (d.open) {
          if (kept) { d.open = false; this.openDevices.delete(d._groupId); }
          else kept = true;
        }
      }
    }
  }

  // Rebuild from scratch (after the chain changes).
  rebuild() {
    // remember which device cards were expanded
    for (const d of this.container.querySelectorAll('details.group')) {
      if (d._groupId) {
        if (d.open) this.openDevices.add(d._groupId);
        else this.openDevices.delete(d._groupId);
      }
    }
    this.build();
  }

  build() {
    this.container.textContent = '';
    this.inputs.clear();
    this.autoBtns.clear();
    this.modBtns.clear();
    this.modStrips.clear();
    this.live.clear();
    const chain = this.getChain ? this.getChain() : PARAM_GROUPS.map((g) => g.id);

    if (this.onAddDevice) this.container.append(this._addDeviceBar(chain));

    let masterHeaderDone = false;
    for (const group of PARAM_GROUPS) {
      if (!chain.includes(group.id)) continue;
      if (group.signal) continue; // Audio Response lives in the Signal panel
      // R8-3: a divider + label introduces the locked Master finishing strip.
      if (group.family === 'Master' && !masterHeaderDone) {
        masterHeaderDone = true;
        this.container.append(el('div', { class: 'master-divider' },
          el('span', { class: 'master-label', text: 'MASTER OUTPUT' }),
          el('span', { class: 'hint', text: 'final polish · always last · locked' })));
      }
      const body = el('div', { class: 'group-body' });
      const details = el('details', { class: group.family === 'Master' ? 'group device master' : 'group device' });
      details._groupId = group.id;
      if (this.openDevices.has(group.id)) details.open = true;
      // Focus mode: opening a device collapses the others (one at a time).
      details.addEventListener('toggle', () => {
        if (details.open) {
          this.openDevices.add(group.id);
          if (this.focusMode) {
            for (const d of this.container.querySelectorAll('details.group')) {
              if (d !== details && d.open) { d.open = false; this.openDevices.delete(d._groupId); }
            }
          }
        } else {
          this.openDevices.delete(group.id);
        }
      });
      const summary = el('summary');

      if (group.toggle) {
        summary.setAttribute('data-key', group.toggle);
        const cb = el('input', {
          type: 'checkbox',
          title: 'Device On',
          onclick: (e) => e.stopPropagation(),
          onchange: (e) => {
            // keep the dimmed-when-off styling in sync immediately (the
            // generic refresh doesn't run on a bare toggle click)
            details.classList.toggle('device-off', !e.target.checked);
            this.setParam(group.toggle, e.target.checked);
          },
        });
        this.inputs.set(group.toggle, cb);
        summary.append(cb);
        details._toggleKey = group.toggle; // refresh() dims it when off
      }
      summary.append(el('span', { text: group.label }));
      // Auto colour-grade: one-shot "Auto" on the Master Grade header.
      if (group.autoGrade && this.onAutoGrade) {
        summary.append(el('button', {
          class: 'device-auto',
          title: 'Auto-balance exposure, contrast & colour from the image (one-shot — the sliders stay editable; ↺ reverts)',
          text: 'Auto',
          onclick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.onAutoGrade(group.id);
          },
        }));
      }
      // Ableton "Device On" parity: the toggle itself is automatable.
      if (group.toggle && !group.noAuto && this.onAutomation) {
        const btn = el('button', {
          class: 'auto-btn auto-btn-summary',
          title: 'automate Device On',
          text: '◆',
          onclick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.onAutomation(group.toggle);
          },
        });
        this.autoBtns.set(group.toggle, btn);
        summary.append(btn);
      }
      if (this.onResetDevice) {
        summary.append(el('button', {
          class: 'device-reset',
          title: 'reset this device to defaults (keeps On/Off and lanes)',
          text: '↺',
          onclick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.onResetDevice(group.id);
          },
        }));
      }
      if (!group.pinned && this.onRemoveDevice) {
        summary.append(el('button', {
          class: 'device-del',
          title: 'remove device (resets its params)',
          text: '×',
          onclick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.onRemoveDevice(group.id);
          },
        }));
      }
      details.append(summary, body);

      for (const p of group.params) {
        if (!p.adv) body.append(this.buildParamRow(p, group));
      }
      // Contract: esoteric params fold behind More… — reachable, never
      // confronted. (Schema `adv: true`, enforced budget of 6 visible.)
      const advParams = group.params.filter((p) => p.adv);
      if (advParams.length) {
        const advBody = el('div', { class: 'adv-body' });
        for (const p of advParams) advBody.append(this.buildParamRow(p, group));
        advBody.hidden = !this.openAdv.has(group.id);
        const moreBtn = el('button', {
          class: 'more-btn',
          text: advBody.hidden ? 'More ▾' : 'Less ▴',
          title: 'fine-tuning parameters',
          onclick: () => {
            advBody.hidden = !advBody.hidden;
            if (advBody.hidden) this.openAdv.delete(group.id);
            else this.openAdv.add(group.id);
            moreBtn.textContent = advBody.hidden ? 'More ▾' : 'Less ▴';
          },
        });
        body.append(moreBtn, advBody);
      }
      this.container.append(details);
    }
    this.refresh();
    this.refreshAutoButtons();
    if (this._hlKey) this.highlight(this._hlKey);
  }

  // "+ Add device" button with a family-grouped, searchable popover.
  _addDeviceBar(chain) {
    const available = PARAM_GROUPS.filter((g) => !chain.includes(g.id));
    const bar = el('div', { class: 'add-device-bar' });
    const pop = el('div', { class: 'device-pop' });
    pop.hidden = true;
    const search = el('input', {
      class: 'dev-search', placeholder: 'search devices…',
      oninput: () => {
        const q = search.value.trim().toLowerCase();
        for (const item of pop.querySelectorAll('.device-pop-item')) {
          item.hidden = !!q && !item.textContent.toLowerCase().includes(q);
        }
        for (const fam of pop.querySelectorAll('.device-pop-family')) {
          let sib = fam.nextElementSibling;
          let any = false;
          while (sib && sib.classList.contains('device-pop-item')) {
            if (!sib.hidden) any = true;
            sib = sib.nextElementSibling;
          }
          fam.hidden = !any;
        }
      },
    });
    const btn = el('button', {
      class: 'ctl-btn add-device-btn',
      text: '+ Add device',
      onclick: () => {
        pop.hidden = !pop.hidden;
        if (!pop.hidden) {
          search.value = '';
          search.dispatchEvent(new Event('input'));
          search.focus();
        }
      },
    });
    if (!available.length) btn.disabled = true;
    pop.append(search);
    for (const fam of FAMILY_ORDER) {
      const devices = available.filter((g) => g.family === fam);
      if (!devices.length) continue;
      pop.append(el('div', { class: 'device-pop-family', text: fam }));
      for (const g of devices) {
        pop.append(el('button', {
          class: 'device-pop-item',
          text: g.label,
          onclick: () => this.onAddDevice(g.id),
        }));
      }
    }
    bar.append(btn, el('span', {
      class: 'hint chain-hint',
      text: 'devices render in this fixed order',
    }), pop);
    return bar;
  }

  _autoButton(p, group) {
    const automatable = !group.noAuto && p.type !== 'bool' && this.onAutomation;
    if (!automatable) return el('span', { class: 'auto-spacer' });
    const btn = el('button', {
      class: 'auto-btn',
      title: 'automation lane (right-click: quick actions)',
      text: '◆',
      onclick: () => this.onAutomation(p.key),
      oncontextmenu: (e) => {
        e.preventDefault();
        if (this.onAutomationMenu) this.onAutomationMenu(p.key, e);
      },
    });
    this.autoBtns.set(p.key, btn);
    return btn;
  }

  // The ∿ disclosure + per-source modulation editor for a moddable param.
  _modCluster(p) {
    const keyFor = (src) => `${p.key}${MOD_SEP}${src}`;
    const ctrl = { src: null };
    const pv = () => this.getParams();

    const select = el('select', { class: 'mod-select', title: 'modulation source' });
    for (const src of MOD_SOURCES) select.append(el('option', { value: src, text: src }));
    const depth = el('input', {
      type: 'range', min: -1, max: 1, step: 0.01, class: 'mod-depth',
      title: 'depth (bipolar — negative ducks on energy; double-click resets)',
    });
    const depthVal = el('span', { class: 'param-value' });
    const led = el('button', { class: 'auto-btn', text: '◆', title: 'automate this depth' });
    const th = el('input', {
      type: 'range', min: 0, max: 0.95, step: 0.01, class: 'mod-th',
      title: 'threshold: the source must exceed this before modulating (double-click resets)',
    });
    const thVal = el('span', { class: 'param-value' });
    const gate = el('input', {
      type: 'checkbox',
      title: 'gate: full depth above the threshold, none below (vs. smooth ramp)',
    });
    const meterFill = el('div', { class: 'meter-fill' });
    const meterTh = el('div', { class: 'meter-th' });
    const meter = el('div', { class: 'mod-meter', title: 'live source level' }, meterFill, meterTh);
    const hintLine = el('div', { class: 'mod-hint hint' });
    hintLine.hidden = true;

    const row1 = el('div', { class: 'mod-row' },
      el('span', { class: 'mod-lbl', text: 'mod' }), select, depth, depthVal, led);
    const row2 = el('div', { class: 'mod-row' },
      el('span', { class: 'mod-lbl', text: 'above' }), th, thVal,
      el('label', { class: 'mod-gate' }, gate, el('span', { text: 'gate' })),
      meter);
    const strip = el('div', { class: 'mod-strip' }, row1, row2, hintLine);
    strip.hidden = true;

    const syncOptions = () => {
      for (const opt of select.options) {
        const active = pv()[keyFor(opt.value)]
          || this.laneState(keyFor(opt.value)) !== 'none';
        opt.text = (active ? '• ' : '') + opt.value;
      }
    };
    const syncHint = () => {
      const baseV = pv()[p.key];
      const base = baseV === undefined ? p.def : baseV;
      const thv = pv()[`${keyFor(ctrl.src)}@th`] || 0;
      const show = thv > 0 && base <= p.min + 1e-9;
      hintLine.textContent = show ? 'base is at minimum — effect appears only above the threshold' : '';
      hintLine.hidden = !show;
    };
    const sync = () => {
      if (!ctrl.src) {
        ctrl.src = MOD_SOURCES.find((s2) => pv()[keyFor(s2)]) || MOD_SOURCES[0];
      }
      select.value = ctrl.src;
      row1.setAttribute('data-key', keyFor(ctrl.src)); // macro Map-mode target
      const d = pv()[keyFor(ctrl.src)] || 0;
      depth.value = d;
      depthVal.textContent = (+d).toFixed(2);
      const t = pv()[`${keyFor(ctrl.src)}@th`] || 0;
      th.value = t;
      thVal.textContent = (+t).toFixed(2);
      meterTh.style.left = `${t * 100}%`;
      gate.checked = !!pv()[`${keyFor(ctrl.src)}@gate`];
      const ls = this.laneState(keyFor(ctrl.src));
      led.classList.toggle('lane-on', ls === 'on');
      led.classList.toggle('lane-off', ls === 'off');
      syncOptions();
      syncHint();
    };

    select.addEventListener('change', () => {
      ctrl.src = select.value;
      sync();
    });
    depth.addEventListener('input', (e) => {
      this.setParam(keyFor(ctrl.src), parseFloat(e.target.value));
      depthVal.textContent = (+e.target.value).toFixed(2);
      this._refreshModBtn(p.key);
      syncOptions();
    });
    depth.addEventListener('dblclick', () => {
      this.setParam(keyFor(ctrl.src), 0);
      this._refreshModBtn(p.key);
      sync();
      if (this.onCommit) this.onCommit();
    });
    led.addEventListener('click', () => {
      if (this.onAutomation) this.onAutomation(keyFor(ctrl.src));
    });
    led.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.onAutomationMenu) this.onAutomationMenu(keyFor(ctrl.src), e);
    });
    th.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      this.setParam(`${keyFor(ctrl.src)}@th`, v);
      thVal.textContent = v.toFixed(2);
      meterTh.style.left = `${v * 100}%`;
      syncHint();
    });
    th.addEventListener('dblclick', () => {
      this.setParam(`${keyFor(ctrl.src)}@th`, 0);
      sync();
      if (this.onCommit) this.onCommit();
    });
    gate.addEventListener('change', (e) => {
      this.setParam(`${keyFor(ctrl.src)}@gate`, e.target.checked ? 1 : 0);
      syncHint();
    });

    ctrl.strip = strip;
    ctrl.sync = sync;
    ctrl.updateMeter = (sources) => {
      const idx = MOD_SOURCES.indexOf(ctrl.src);
      if (idx >= 0) meterFill.style.width = `${Math.min(sources[idx], 1) * 100}%`;
    };
    this.modStrips.set(p.key, ctrl);

    const btn = el('button', {
      class: 'mod-btn',
      title: 'audio modulation: source, depth, threshold, gate',
      text: '∿',
      onclick: () => {
        strip.hidden = !strip.hidden;
        btn.classList.toggle('open', !strip.hidden);
        if (!strip.hidden) sync();
      },
    });
    this.modBtns.set(p.key, btn);
    return { btn, strip };
  }

  _refreshModBtn(key) {
    const btn = this.modBtns.get(key);
    if (!btn) return;
    const params = this.getParams();
    let active = false;
    for (const src of MOD_SOURCES) {
      const v = params[`${key}${MOD_SEP}${src}`];
      if (v) { active = true; break; }
      if (this.laneState(`${key}${MOD_SEP}${src}`) !== 'none') { active = true; break; }
    }
    btn.classList.toggle('mod-active', active);
  }

  buildParamRow(p, group) {
    const row = el('div', { class: 'param-row', 'data-key': p.key });
    const label = el('label', { text: p.label, title: p.hint || p.label });
    if (p.type === 'bool') {
      const input = el('input', {
        type: 'checkbox',
        onchange: (e) => this.setParam(p.key, e.target.checked),
      });
      this.inputs.set(p.key, input);
      row.append(label, input, el('span'), el('span', { class: 'mod-spacer' }), this._autoButton(p, group));
      return row;
    }
    if (p.type === 'enum') {
      const input = el('select', {
        onchange: (e) => this.setParam(p.key, e.target.value),
      });
      for (const opt of p.options) {
        input.append(el('option', { value: opt, text: opt }));
      }
      this.inputs.set(p.key, input);
      row.append(label, input, el('span'), el('span', { class: 'mod-spacer' }), this._autoButton(p, group));
      return row;
    }
    const value = el('span', { class: 'param-value editable', title: 'click to type a value' });
    const input = el('input', {
      type: 'range', min: p.min, max: p.max, step: p.step,
      oninput: (e) => {
        const v = parseFloat(e.target.value);
        value.textContent = formatValue(v, p);
        this.setParam(p.key, v);
      },
      ondblclick: () => { // double-click resets to default
        value.textContent = formatValue(p.def, p);
        this.setParam(p.key, p.def, { refreshInput: true });
        if (this.onCommit) this.onCommit();
      },
    });
    input._valueLabel = value;
    input._schema = p;
    this.inputs.set(p.key, input);

    // numeric type-in: click the readout to edit the exact value
    value.addEventListener('click', () => {
      if (input.disabled) return;
      const editor = el('input', {
        type: 'number', class: 'value-edit',
        min: p.min, max: p.max, step: p.step, value: input.value,
      });
      let done = false;
      const commit = (apply) => {
        if (done) return;
        done = true;
        const v = parseFloat(editor.value);
        editor.replaceWith(value);
        if (apply && Number.isFinite(v)) {
          const cl = Math.min(Math.max(v, p.min), p.max);
          input.value = cl;
          value.textContent = formatValue(cl, p);
          this.setParam(p.key, cl);
          if (this.onCommit) this.onCommit();
        }
      };
      editor.addEventListener('blur', () => commit(true));
      editor.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit(true);
        else if (e.key === 'Escape') commit(false);
      });
      value.replaceWith(editor);
      editor.focus();
      editor.select();
    });

    // While automated/modulated, the slider itself follows the effective
    // value (orange thumb) — grabbing it overrides via the latch, so don't
    // fight the user's pointer.
    const release = () => { input._held = false; };
    input.addEventListener('pointerdown', () => { input._held = true; });
    input.addEventListener('pointerup', release);
    input.addEventListener('pointercancel', release);
    this.live.set(p.key, { input, schema: p });

    const moddable = !group.noAuto;
    if (!moddable) {
      row.append(label, input, value, el('span', { class: 'mod-spacer' }), this._autoButton(p, group));
      return row;
    }
    const { btn, strip } = this._modCluster(p);
    row.append(label, input, value, btn, this._autoButton(p, group));
    const wrap = el('div');
    wrap.append(row, strip);
    return wrap;
  }

  // Highlight the row whose lane is open in the editor (null clears).
  highlight(key) {
    this._hlKey = key;
    if (this._hl) {
      this._hl.classList.remove('lane-edit');
      this._hl = null;
    }
    if (!key) return;
    // mod-depth lanes highlight their base param's row
    const sep = key.indexOf(MOD_SEP);
    const baseKey = sep >= 0 ? key.slice(0, sep) : key;
    const input = this.inputs.get(baseKey) || this.autoBtns.get(baseKey);
    if (!input) return;
    const row = input.closest('.param-row, summary');
    if (row) {
      row.classList.add('lane-edit');
      this._hl = row;
    }
  }

  // Repaint the automation LEDs ('none' dim, 'on' lit, 'off' bypassed-amber).
  refreshAutoButtons() {
    for (const [key, btn] of this.autoBtns) {
      const s = this.laneState(key);
      btn.classList.toggle('lane-on', s === 'on');
      btn.classList.toggle('lane-off', s === 'off');
    }
    for (const key of this.modBtns.keys()) this._refreshModBtn(key);
    for (const ctrl of this.modStrips.values()) {
      if (!ctrl.strip.hidden) ctrl.sync();
    }
  }

  // Push current state into every control (after pack/preset/A-B switches).
  refresh() {
    const params = this.getParams();
    for (const [key, input] of this.inputs) {
      const v = params[key];
      if (input.type === 'checkbox') input.checked = !!v;
      else if (input.tagName === 'SELECT') input.value = v;
      else {
        input.value = v;
        if (input._valueLabel) input._valueLabel.textContent = formatValue(v, input._schema);
      }
      // macro-mapped params are owned by their macro (Ableton rule)
      const mapped = this.isMapped(key);
      input.disabled = mapped;
      const row = input.closest('.param-row, summary');
      if (row) row.classList.toggle('macro-mapped', mapped);
    }
    // R10-4: dim devices whose toggle is off (still expanded + editable).
    for (const d of this.container.querySelectorAll('details.group')) {
      if (!d._toggleKey) continue;
      d.classList.toggle('device-off', params[d._toggleKey] === false);
    }
    for (const key of this.modBtns.keys()) this._refreshModBtn(key);
    for (const ctrl of this.modStrips.values()) {
      if (!ctrl.strip.hidden) ctrl.sync();
    }
  }

  // Per-frame (throttled): sliders whose effective value (lanes + macros +
  // modulation) differs from their base follow it live with an orange thumb;
  // idle sliders show the base. Also feeds the source meters of any open
  // modulation editors. Never touches a slider the user is holding.
  updateLiveValues(eff, sources) {
    const params = this.getParams();
    for (const [key, entry] of this.live) {
      const { input, schema } = entry;
      if (input._held) continue;
      const det = input.closest('details');
      if (det && !det.open) continue;
      const v = eff[key];
      let base = params[key];
      if (base === undefined) base = schema.def;
      const driven = v !== undefined && Number.isFinite(v)
        && Math.abs(v - base) > Math.max((schema.step || 0.01) * 0.5,
          (schema.max - schema.min) * 0.002);
      const show = driven ? v : base;
      if (parseFloat(input.value) !== show) {
        input.value = show;
        if (input._valueLabel) input._valueLabel.textContent = formatValue(show, schema);
      }
      if (input._driven !== driven) {
        input._driven = driven;
        input.classList.toggle('driven', driven);
        if (input._valueLabel) input._valueLabel.classList.toggle('driven-val', driven);
      }
    }
    if (sources) {
      for (const ctrl of this.modStrips.values()) {
        if (!ctrl.strip.hidden) ctrl.updateMeter(sources);
      }
    }
  }
}

// R10-8: render values with their unit so the meaning is obvious. `unit`
// is an optional schema hint; absent → today's plain number.
function formatValue(v, p) {
  v = Number(v);
  switch (p.unit) {
    case 'pct': return `${Math.round(v * 100)}%`;
    case 'deg': return `${Math.round(v)}°`;
    case 'ms': return `${Math.round(v)} ms`;
    case 'hz': return v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${Math.round(v)} Hz`;
    case 'x': return `${v.toFixed(2)}×`;
    case 'signed': return `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
    default: break;
  }
  const decimals = p.step >= 1 ? 0 : p.step >= 0.1 ? 1 : 2;
  return v.toFixed(decimals);
}
