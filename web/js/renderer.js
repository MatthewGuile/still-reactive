// The render engine: pure function of (t, dt, features, params, reframe).
// Identical passes drive the live preview and the exporter.

import { createGL, Program, Quad, createImageTexture, createTarget, destroyTarget } from './gl.js';
import { VERTEX_SRC, SCENE_SRC, FEEDBACK_SRC, COPY_SRC, BRIGHT_SRC, BLUR_SRC, POST_SRC } from './shaders.js';
import { applyModulation } from './features.js';
import { resolveParams } from './params.js';

const PART_TYPES = { dust: 0, snow: 1, embers: 2, bokeh: 3, stars: 4 };

// Generate family (R4-P6): each generator is its own named device; the
// active ones are packed into the scene shader's fixed slots here. Scratch
// arrays are module-level so the per-frame build allocates nothing.
const GEN_SLOTS = 6;             // max simultaneous generator layers
const GEN_FLOATS = ['Mix', 'Speed', 'X', 'Y', 'Size', 'Feather', 'Rotate', 'Hue', 'Detail',
  'DepthGate', 'Inherit', 'BeatSync'];
const GEN_ENUMS = {
  Blend: { add: 0, screen: 1, over: 2, multiply: 3, displace: 4 },
  Palette: { spectral: 0, neon: 1, fire: 2, mono: 3 },
  Mask: { full: 0, ellipse: 1, box: 2, band: 3 },
  Emerge: { off: 0, shadows: 1, highlights: 2 },
  Anchor: { screen: 0, image: 1 },
};
// Each named generator device → its base shader renderer + kind list. The
// kind enum either selects the renderer (Fractal: julia/kifs → type 3/4) or
// a sub-variant within one renderer (uGenKind, e.g. Shape Pulse rings/…).
const GEN_DEVICES = [
  { id: 'shape', type: 0, kinds: ['rings', 'polygons', 'bars'] },
  { id: 'flow', type: 1, kinds: ['clouds', 'marble'] },
  { id: 'spectrum', type: 2, kinds: ['bars', 'radial'] },
  { id: 'fractal', kinds: ['julia', 'kifs'], typeByKind: { julia: 3, kifs: 4 } },
  // R4-P7: four more renderers (types 5-8); kind selects a sub-variant.
  { id: 'tunnel', type: 5, kinds: ['round', 'square', 'hex'] },
  { id: 'starfield', type: 6, kinds: ['stars', 'warp'] },
  { id: 'voronoi', type: 7, kinds: ['cells', 'edges', 'cracks'] },
  { id: 'waveform', type: 8, kinds: ['line', 'filled', 'lissajous'] },
];
const genF = Object.fromEntries(
  ['On', ...GEN_FLOATS].map((s) => [`uGen${s}`, new Float32Array(GEN_SLOTS)]),
);
const genI = Object.fromEntries(
  ['Type', 'Kind', ...Object.keys(GEN_ENUMS)].map((s) => [`uGen${s}`, new Int32Array(GEN_SLOTS)]),
);
const ZERO_BANDS = new Float32Array(16);

// HSL → RGB for the Canvas device colour (computed CPU-side; the shader
// takes a plain vec3). h in degrees, s/l in 0..1.
function hslToRgbInto(out, h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  out[0] = f(0); out[1] = f(8); out[2] = f(4);
  return out;
}
const CANVAS_RGB = new Float32Array(3);
const CANVAS_RGB2 = new Float32Array(3);   // gradient second stop (separate buffer)
const hslToRgb = (h, s, l) => hslToRgbInto(CANVAS_RGB, h, s, l);
const hslToRgb2 = (h, s, l) => hslToRgbInto(CANVAS_RGB2, h, s, l);

// Map the active generator devices (in GEN_DEVICES order) onto the shader's
// fixed slots — each device owns its own key namespace.
function genUniforms(params) {
  let slot = 0;
  for (let i = 0; i < GEN_SLOTS; i++) genF.uGenOn[i] = 0;
  for (const d of GEN_DEVICES) {
    if (slot >= GEN_SLOTS || !params[`${d.id}On`]) continue;
    const i = slot++;
    genF.uGenOn[i] = 1;
    for (const s of GEN_FLOATS) {
      const v = params[`${d.id}${s}`];
      genF[`uGen${s}`][i] = v === undefined ? (s === 'DepthGate' ? 1 : 0) : v;
    }
    for (const [s, map] of Object.entries(GEN_ENUMS)) {
      genI[`uGen${s}`][i] = map[params[`${d.id}${s}`]] || 0;
    }
    const kind = params[`${d.id}Kind`];
    const ki = Math.max(d.kinds.indexOf(kind), 0);
    genI.uGenType[i] = d.typeByKind ? (d.typeByKind[kind] ?? d.type ?? 0) : d.type;
    genI.uGenKind[i] = d.typeByKind ? 0 : ki;
  }
  return { ...genF, ...genI };
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = (this.gl = createGL(canvas));
    this.quad = new Quad(gl);
    this.programs = {
      scene: new Program(gl, VERTEX_SRC, SCENE_SRC, 'scene'),
      feedback: new Program(gl, VERTEX_SRC, FEEDBACK_SRC, 'feedback'),
      copy: new Program(gl, VERTEX_SRC, COPY_SRC, 'copy'),
      bright: new Program(gl, VERTEX_SRC, BRIGHT_SRC, 'bright'),
      blur: new Program(gl, VERTEX_SRC, BLUR_SRC, 'blur'),
      post: new Program(gl, VERTEX_SRC, POST_SRC, 'post'),
    };
    this.width = 0;
    this.height = 0;
    this.imageTex = null;
    this.depthTex = null;
    this.imageAspect = 16 / 9;
    this.fbIndex = 0;
    this.targets = null;
    this.readBuffer = null;
  }

  setImage(bitmap) {
    if (this.imageTex) this.gl.deleteTexture(this.imageTex);
    this.imageTex = createImageTexture(this.gl, bitmap, { mirror: true });
    this.imageAspect = bitmap.width / bitmap.height;
  }

  setDepth(bitmap) {
    if (this.depthTex) this.gl.deleteTexture(this.depthTex);
    this.depthTex = createImageTexture(this.gl, bitmap, { mirror: true });
  }

  setSize(width, height) {
    width = Math.max(16, Math.round(width));
    height = Math.max(16, Math.round(height));
    if (this.width === width && this.height === height) return;
    const gl = this.gl;
    if (this.targets) {
      for (const t of Object.values(this.targets)) destroyTarget(gl, t);
    }
    this.width = width;
    this.height = height;
    const qw = Math.max(8, Math.round(width / 4));
    const qh = Math.max(8, Math.round(height / 4));
    this.targets = {
      scene: createTarget(gl, width, height),
      fbA: createTarget(gl, width, height),
      fbB: createTarget(gl, width, height),
      post: createTarget(gl, width, height),
      bright: createTarget(gl, qw, qh),
      blurA: createTarget(gl, qw, qh),
      blurB: createTarget(gl, qw, qh),
      // full-image blur for depth of field (only rendered when DOF is on)
      dofA: createTarget(gl, qw, qh),
      dofB: createTarget(gl, qw, qh),
    };
    this.readBuffer = new Uint8Array(width * height * 4);
    this.resetFeedback();
  }

  resetFeedback() {
    const gl = this.gl;
    if (!this.targets) return;
    for (const key of ['fbA', 'fbB']) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets[key].fb);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  get ready() {
    return !!(this.imageTex && this.depthTex && this.targets);
  }

  // Cover-fit crop + camera motion, computed on the CPU so the clamping logic
  // exists exactly once and is shared by the scene and post passes. Audio
  // reactivity (zoom pulse, shake swell) arrives pre-baked in the params via
  // the modulation matrix — this is a pure function of (t, params, reframe).
  computeFrame(t, params, reframe) {
    const ai = this.imageAspect;
    const ao = this.width / this.height;
    let rx, ry;
    if (ai >= ao) {
      ry = 1;
      rx = ao / ai;
    } else {
      rx = 1;
      ry = ai / ao;
    }
    const zoom = Math.max(params.camZoom * reframe.scale, 1.0001);
    rx /= zoom;
    ry /= zoom;

    const slackX = (1 - rx) / 2;
    const slackY = (1 - ry) / 2;
    let cx = 0.5 + reframe.x * slackX;
    let cy = 0.5 + reframe.y * slackY;

    const ds = 0.03 + params.driftSpeed * 0.12;
    cx += Math.sin(t * ds * 2.1 + 1.7) * params.driftAmount * 0.35 * slackX;
    cy += Math.cos(t * ds * 1.37) * params.driftAmount * 0.35 * slackY;

    const sh = params.shake * 0.002;
    cx += (Math.sin(t * 12.9) * 0.6 + Math.sin(t * 23.7 + 1.3) * 0.4) * sh;
    cy += (Math.sin(t * 14.3 + 4.1) * 0.6 + Math.sin(t * 27.1 + 0.7) * 0.4) * sh;

    cx = Math.min(Math.max(cx, rx / 2), 1 - rx / 2);
    cy = Math.min(Math.max(cy, ry / 2), 1 - ry / 2);
    return { center: [cx, cy], rect: [rx, ry] };
  }

  buildUniforms(t, dt, feat, params, frame) {
    return {
      uTime: t,
      uDt: Math.max(dt, 1 / 240),
      uOutAspect: this.width / this.height,
      uRes: [this.width, this.height],
      uCenter: frame.center,
      uRect: frame.rect,
      uBeats: feat.beats,

      ...genUniforms(params),
      uBands: feat.bands16 || ZERO_BANDS,
      uCanvasOn: params.canvasOn ? 1 : 0,
      uCanvasMix: params.canvasMix === undefined ? 1 : params.canvasMix,
      uCanvasMode: params.canvasMode === 'gradient' ? 1 : 0,
      uCanvasColor: hslToRgb(params.canvasHue || 0, params.canvasSat || 0,
        params.canvasLight === undefined ? 1 : params.canvasLight),
      uCanvasColor2: hslToRgb2(params.canvasHue2 || 0, params.canvasSat2 || 0,
        params.canvasLight2 === undefined ? 0.3 : params.canvasLight2),

      uKaleidoOn: params.kaleidoOn ? 1 : 0,
      uKaleidoMix: params.kaleidoMix === undefined ? 1 : params.kaleidoMix,
      uKaleidoSeg: params.kaleidoSeg,
      uKaleidoSpin: params.kaleidoSpin,
      uKaleidoKick: params.kaleidoKick,
      uWarpOn: params.warpOn ? 1 : 0,
      uWarpAmount: params.warpAmount,
      uWarpScale: params.warpScale,
      uWarpSpeed: params.warpSpeed,
      uParallaxOn: params.parallaxOn ? 1 : 0,
      uParallaxAmount: params.parallaxAmount,

      uOn: params.feedbackOn ? 1 : 0,
      uFbMix: params.fbMix === undefined ? 1 : params.fbMix,
      uFbTrail: params.fbTrail,
      uFbZoom: params.fbZoom,
      uFbRotate: params.fbRotate,
      uFbHue: params.fbHue,
      uFbInject: params.fbInject,

      uThreshold: params.bloomThreshold,

      uLensOn: params.lensOn ? 1 : 0,
      uLensFish: params.lensFish,
      uLensTwirl: params.lensTwirl,
      uRippleOn: params.rippleOn ? 1 : 0,
      uRipAmount: params.ripAmount,
      uRipWidth: params.ripWidth,
      uRipSpeed: params.ripSpeed,
      uGlitchOn: params.glitchOn ? 1 : 0,
      uGlBlock: params.glBlock,
      uGlSlice: params.glSlice,
      uGlStreak: params.glStreak,
      uGlScale: params.glScale,
      uGlRate: params.glRate,
      uZbOn: params.zbOn ? 1 : 0,
      uZbAmount: params.zbAmount,
      uDofOn: params.dofOn ? 1 : 0,
      uDofAmount: params.dofAmount,
      uDofFocus: params.dofFocus,
      uDofRange: params.dofRange,
      uPixelOn: params.pixelOn ? 1 : 0,
      uPxAmount: params.pxAmount,
      uPxPosterize: params.pxPosterize,
      uPxDither: params.pxDither,
      uHtOn: params.htOn ? 1 : 0,
      uHtMix: params.htMix === undefined ? 1 : params.htMix,
      uHtScale: params.htScale,
      uHtAngle: params.htAngle,
      uEdgeOn: params.edgeOn ? 1 : 0,
      uEdgeMix: params.edgeMix === undefined ? 1 : params.edgeMix,
      uEdgeHue: params.edgeHue,
      uStrobeOn: params.strobeOn ? 1 : 0,
      uStrAmount: params.strAmount,
      uStrFlash: params.strFlash,

      uVhsOn: params.vhsOn ? 1 : 0,
      uVhsScan: params.vhsScan,
      uVhsBleed: params.vhsBleed,
      uVhsJitter: params.vhsJitter,
      uVhsWobble: params.vhsWobble,
      uRainOn: params.rainOn ? 1 : 0,
      uRainAmount: params.rainAmount,
      uRainSpeed: params.rainSpeed,
      uRainRefract: params.rainRefract,
      uCaAmount: params.caAmount,
      uFogOn: params.fogOn ? 1 : 0,
      uFogDensity: params.fogDensity,
      uFogSpeed: params.fogSpeed,
      uFogScale: params.fogScale,
      uFogWarmth: params.fogWarmth,
      uRaysOn: params.raysOn ? 1 : 0,
      uRaysAmount: params.raysAmount,
      uRaysAngle: params.raysAngle,
      uPlasmaOn: params.plasmaOn ? 1 : 0,
      uPlasmaAmount: params.plasmaAmount,
      uPlasmaScale: params.plasmaScale,
      uPlasmaSpeed: params.plasmaSpeed,
      uPartOn: params.partOn ? 1 : 0,
      uPartType: PART_TYPES[params.partType] ?? 0,
      uPartDensity: params.partDensity,
      uPartSize: params.partSize,
      uPartSpeed: params.partSpeed,
      uPartFlicker: params.partFlicker,
      uLeakOn: params.leakOn ? 1 : 0,
      uLeakAmount: params.leakAmount,
      uLeakSpeed: params.leakSpeed,
      uLeakHue: params.leakHue,
      uBloomOn: params.bloomOn ? 1 : 0,
      uBloomAmount: params.bloomAmount,
      uExposure: params.exposure,
      uContrast: params.contrast,
      uSaturation: params.saturation,
      uTemperature: params.temperature,
      uTint: params.tint,
      uGamma: params.gamma,
      uFade: params.fade,
      uVibrance: params.vibrance || 0,
      uHighlights: params.highlights || 0,
      uShadows: params.shadows || 0,
      uSharpOn: params.sharpOn ? 1 : 0,
      uSharpMix: params.sharpMix === undefined ? 1 : params.sharpMix,
      uSharpRadius: params.sharpRadius === undefined ? 1 : params.sharpRadius,
      uOutputOn: params.outputOn ? 1 : 0,
      uOutputMix: params.outputMix === undefined ? 1 : params.outputMix,
      uOutputCeiling: params.outputCeiling === undefined ? 0.85 : params.outputCeiling,
      uWashOn: params.washOn ? 1 : 0,
      uWashMix: params.washMix === undefined ? 1 : params.washMix,
      uWashShadowHue: params.washShadowHue || 0,
      uWashHighHue: params.washHighHue || 0,
      uWashBalance: params.washBalance || 0,
      uClarityOn: params.clarityOn ? 1 : 0,
      uClarityMix: params.clarityMix === undefined ? 1 : params.clarityMix,
      uClarityRadius: params.clarityRadius === undefined ? 4 : params.clarityRadius,
      uHueOn: params.hueOn ? 1 : 0,
      uHueSpeed: params.hueSpeed,
      uHueAmount: params.hueAmount,
      uHueBeat: params.hueBeat,
      uDuoOn: params.duoOn ? 1 : 0,
      uDuoAmount: params.duoAmount,
      uDuoHueA: params.duoHueA,
      uDuoHueB: params.duoHueB,
      uVigAmount: params.vigAmount,
      uVigSize: params.vigSize,
      uVigSoft: params.vigSoft,
      uGrainAmount: params.grainAmount,
      uGrainSize: params.grainSize,
    };
  }

  _pass(prog, target, textures, uniforms) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    gl.viewport(0, 0, target ? target.width : this.canvas.width, target ? target.height : this.canvas.height);
    prog.use(gl);
    prog.setAll(gl, uniforms);
    prog.bindTextures(gl, textures);
    this.quad.draw(gl);
  }

  // Renders one frame. opts.toTexture: render the final image into the post
  // FBO (export path / preview blit source) instead of straight to screen.
  render(t, dt, feat, params, reframe, opts = {}) {
    if (!this.ready) return;
    // Modulation, then Device On + Intensity, resolve to effective params
    // here — the preview and the exporter both land in this call, so they
    // cannot disagree. (Lane automation is applied upstream; macros will
    // slot between lanes and modulation.)
    params = resolveParams(applyModulation(params, feat));
    const gl = this.gl;
    const T = this.targets;
    const frame = this.computeFrame(t, params, reframe);
    const u = this.buildUniforms(t, dt, feat, params, frame);
    const P = this.programs;

    this._pass(P.scene, T.scene, { uImage: this.imageTex, uDepth: this.depthTex }, u);

    const prev = this.fbIndex === 0 ? T.fbB : T.fbA;
    const cur = this.fbIndex === 0 ? T.fbA : T.fbB;
    this._pass(P.feedback, cur, { uScene: T.scene.tex, uPrev: prev.tex }, u);
    this.fbIndex = 1 - this.fbIndex;

    this._pass(P.bright, T.bright, { uTex: cur.tex }, u);
    const px = 1 / T.bright.width;
    const py = 1 / T.bright.height;
    this._pass(P.blur, T.blurA, { uTex: T.bright.tex }, { uDir: [px, 0] });
    this._pass(P.blur, T.blurB, { uTex: T.blurA.tex }, { uDir: [0, py] });
    this._pass(P.blur, T.blurA, { uTex: T.blurB.tex }, { uDir: [px * 2.2, 0] });
    this._pass(P.blur, T.blurB, { uTex: T.blurA.tex }, { uDir: [0, py * 2.2] });

    // DOF wants the whole image blurred (not just the brights) — skip the
    // extra passes entirely while the device is off.
    if (params.dofOn) {
      this._pass(P.blur, T.dofA, { uTex: cur.tex }, { uDir: [px, 0] });
      this._pass(P.blur, T.dofB, { uTex: T.dofA.tex }, { uDir: [0, py] });
      this._pass(P.blur, T.dofA, { uTex: T.dofB.tex }, { uDir: [px * 2.2, 0] });
      this._pass(P.blur, T.dofB, { uTex: T.dofA.tex }, { uDir: [0, py * 2.2] });
    }

    const textures = {
      uBase: cur.tex,
      uBloom: T.blurB.tex,
      uDepth: this.depthTex,
      uDofBlur: params.dofOn ? T.dofB.tex : T.blurB.tex,
    };
    if (opts.toTexture) {
      this._pass(P.post, T.post, textures, u);
      // also blit to the canvas so the user can watch the export live; the
      // exporter throttles this (opts.blit) since it is pure overhead per frame
      if (opts.blit !== false) this._pass(P.copy, null, { uTex: T.post.tex }, {});
    } else {
      this._pass(P.post, null, textures, u);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // Build an async PBO readback pipeline sized to the current output target.
  // The exporter uses it to overlap one frame's GPU→CPU readback + transfer
  // with the next frame's render (see Readback below). The live preview and
  // thumbnails keep the simple synchronous readPixels() above.
  createReadback(depth = 3) {
    return new Readback(this.gl, depth);
  }

  // Read back the last frame rendered with {toTexture: true}. Rows come out
  // bottom-up (GL convention); the exporter's ffmpeg command vflips.
  readPixels() {
    const gl = this.gl;
    const T = this.targets.post;
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.fb);
    gl.readPixels(0, 0, T.width, T.height, gl.RGBA, gl.UNSIGNED_BYTE, this.readBuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this.readBuffer;
  }
}

// Async GPU→CPU pixel readback for the export path (WebGL2). A plain
// gl.readPixels into a CPU array stalls: the CPU blocks until the GPU drains
// and the transfer finishes. Targeting a PIXEL_PACK_BUFFER instead makes
// readPixels return immediately; a fence records when the copy lands, and the
// bytes are pulled a couple of frames later (getBufferSubData) once resident —
// so frame N's readback + WebSocket transfer overlaps frame N+1's render. The
// pipeline keeps `depth` PBOs so that many frames may be in flight; the export
// loop drains the oldest once it is `full`. Each readPixels reads bottom-up
// (GL convention) exactly like readPixels(), so ffmpeg's vflip still applies.
class Readback {
  constructor(gl, depth = 3) {
    this.gl = gl;
    this.depth = Math.max(2, depth);
    this.slots = [];   // { pbo, sync, cpu }
    this.queue = [];   // FIFO of slot indices with a pending readback
    this.head = 0;     // next slot to fill
    this.bytes = 0;
  }

  _ensure(bytes) {
    if (this.bytes === bytes && this.slots.length) return;
    this.dispose();
    const gl = this.gl;
    for (let i = 0; i < this.depth; i++) {
      const pbo = gl.createBuffer();
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, bytes, gl.STREAM_READ);
      this.slots.push({ pbo, sync: null, cpu: new Uint8Array(bytes) });
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.bytes = bytes;
  }

  get pending() { return this.queue.length; }
  get full() { return this.queue.length >= this.slots.length; }

  // Kick off an async readback of `target`'s framebuffer into the next PBO.
  enqueue(target) {
    const gl = this.gl;
    this._ensure(target.width * target.height * 4);
    const idx = this.head;
    this.head = (this.head + 1) % this.slots.length;
    const slot = this.slots[idx];
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.pbo);
    gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);   // leave it unbound for sync reads
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (slot.sync) gl.deleteSync(slot.sync);
    slot.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush(); // ensure the readback + fence are submitted to the GPU
    this.queue.push(idx);
  }

  // Copy the oldest pending readback into its CPU buffer and return it. By now
  // a frame has elapsed so the data is almost always already resident; the
  // clientWaitSync nudge plus getBufferSubData guarantee correctness either way.
  dequeue() {
    const gl = this.gl;
    const idx = this.queue.shift();
    const slot = this.slots[idx];
    if (slot.sync) {
      gl.clientWaitSync(slot.sync, gl.SYNC_FLUSH_COMMANDS_BIT, 0);
      gl.deleteSync(slot.sync);
      slot.sync = null;
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.pbo);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, slot.cpu);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    return slot.cpu;
  }

  dispose() {
    const gl = this.gl;
    for (const s of this.slots) {
      gl.deleteBuffer(s.pbo);
      if (s.sync) gl.deleteSync(s.sync);
    }
    this.slots = [];
    this.queue = [];
    this.head = 0;
    this.bytes = 0;
  }
}
