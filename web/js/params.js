// Parameter schema: drives the UI panels, the defaults, and preset shape.
// A style pack is simply a partial override map applied on top of defaults.
//
// Device model: every group is an Ableton-style device — its toggle is
// "Device On" (a real, automatable param) and its `<prefix>Mix` param is the
// device's Intensity fader (0 = effect absent, 1 = fully present), applied
// CPU-side in resolveParams() so preview and export resolve identically.
//
// Modulation model: every continuous param can be wiggled by a per-source
// blend of the six audio features. Depths are real (sparse) params with keys
// like `warpAmount~mid`, range -1..1 — which makes every depth automatable
// with the ordinary lane machinery. Shaders are pure functions of params;
// ALL audio reactivity happens on the CPU (features.applyModulation).

// Modulation sources, in depth-strip order. 'loud' is A-weighted loudness,
// 'onset' the transient envelope, 'beat' a decaying pulse on the tempo grid.
export const MOD_SOURCES = ['low', 'mid', 'high', 'loud', 'onset', 'beat'];

export const MOD_SEP = '~';

const mix = (key) => ({
  key, label: 'Mix', min: 0, max: 1, step: 0.01, def: 1, unit: 'pct',
  hint: 'Device fader: 0 = effect absent (bit-exact), 1 = fully wet. Automate (◆) for fades; modulate (∿) to pump with the music.',
});

// Generator device factory (R4-P6): each generator is its own named device,
// named for what it outputs, with a `Kind` sub-option (the way Shape Pulse
// has shape variants). They share placement/look/integrate machinery; the
// renderer maps the active generator devices onto the scene-pass shader's
// uniform slots. `generator: true` marks them for slot allocation + the
// placement gizmo. Pure functions of (uv, t, params) — preview/export
// identity holds. GEN_KINDS is exported for the renderer's type mapping.
export const GEN_KINDS = {
  shape: ['rings', 'polygons', 'bars'],
  fractal: ['julia', 'kifs'],
  flow: ['clouds', 'marble'],
  spectrum: ['bars', 'radial'],
  // R4-P7: four more generator devices.
  tunnel: ['round', 'square', 'hex'],
  starfield: ['stars', 'warp'],
  voronoi: ['cells', 'edges', 'cracks'],
  waveform: ['line', 'filled', 'lissajous'],
};
const GEN_KIND_LABEL = {
  shape: 'Shape type', fractal: 'Fractal type', flow: 'Noise type', spectrum: 'Display',
  tunnel: 'Tunnel shape', starfield: 'Star style', voronoi: 'Cell style', waveform: 'Trace style',
};
const genDevice = (id, label, kindHint) => {
  const k = (s) => `${id}${s}`;
  return {
    id, label, family: 'Generate', toggle: k('On'), defOn: false, generator: true, params: [
      mix(k('Mix')),
      { key: k('Kind'), label: GEN_KIND_LABEL[id] || 'Type', type: 'enum', options: GEN_KINDS[id], def: GEN_KINDS[id][0], hint: kindHint },
      { key: k('Speed'), label: 'Speed', min: 0, max: 1, step: 0.01, def: 0.3, axis: 'motion', sweet: [0.1, 0.6], hint: 'How fast the pattern moves/evolves. Modulate from "low" to push it with the bass.' },
      { key: k('X'), label: 'Center X', min: 0, max: 1, step: 0.01, def: 0.5, hint: 'Region centre, left → right. Automate to travel across the frame.' },
      { key: k('Y'), label: 'Center Y', min: 0, max: 1, step: 0.01, def: 0.5, hint: 'Region centre, bottom → top.' },
      { key: k('Size'), label: 'Size', min: 0.05, max: 1.5, step: 0.01, def: 0.6, hint: 'Region size. Patterns live in region space, so they move and scale with it.' },
      { key: k('Mask'), label: 'Mask', type: 'enum', options: ['full', 'ellipse', 'box', 'band'], def: 'full', adv: true, hint: 'Confine the layer to a region shape ("specific areas of the image").' },
      { key: k('Feather'), label: 'Feather', min: 0.01, max: 1, step: 0.01, def: 0.35, adv: true, hint: 'Soft edge width of the mask.' },
      { key: k('Rotate'), label: 'Rotation (deg)', min: -180, max: 180, step: 1, def: 0, adv: true, hint: 'Region rotation.' },
      { key: k('Blend'), label: 'Blend', type: 'enum', options: ['add', 'screen', 'over', 'multiply', 'displace'], def: 'add', adv: true, hint: 'How the layer combines with the image. Displace warps the image itself in the pattern’s shape (no colour added).' },
      { key: k('Palette'), label: 'Palette', type: 'enum', options: ['spectral', 'neon', 'fire', 'mono'], def: 'spectral', adv: true, hint: 'Colour ramp for the pattern.' },
      { key: k('Hue'), label: 'Hue', min: 0, max: 360, step: 1, def: 0, adv: true, unit: 'deg', hint: 'Rotates the palette colours.' },
      { key: k('Detail'), label: 'Detail', min: 0, max: 1, step: 0.01, def: 0.5, adv: true, hint: 'Pattern complexity: polygon sides, noise scale, fractal zoom/fold depth.' },
      // R4-P7: beat-sync — crossfade the pattern clock toward a beat-quantised
      // one, so motion steps on the tempo grid instead of flowing smoothly.
      { key: k('BeatSync'), label: 'Beat sync', min: 0, max: 1, step: 0.01, def: 0, adv: true, hint: 'Lock the pattern’s motion to the tempo grid: 0 = free/continuous, 1 = advances a step on every beat. Needs a BPM. Automate or modulate (e.g. from "beat") for builds that snap into the grid.' },
      // Integrate group (R4-2b): make the layer emerge from the image
      // instead of sitting on it. Defaults = today's overlay behaviour.
      { key: k('DepthGate'), label: 'Depth gate', min: 0, max: 1, step: 0.01, def: 1, adv: true, hint: 'Hide the layer behind nearer image content: 1 = in front of everything (overlay), lower slides it behind the subject. Automate to rise out of the image.' },
      { key: k('Inherit'), label: 'Inherit', min: 0, max: 1, step: 0.01, def: 0, adv: true, hint: 'Tint the pattern with the image’s own colours — at 1 it reads as the photo’s pixels rearranging.' },
      { key: k('Emerge'), label: 'Emerge', type: 'enum', options: ['off', 'shadows', 'highlights'], def: 'off', adv: true, hint: 'Grow the layer only out of the image’s dark or bright regions.' },
      { key: k('Anchor'), label: 'Anchor', type: 'enum', options: ['screen', 'image'], def: 'screen', adv: true, hint: 'Image anchor glues the region to the photo, so it travels with camera drift/parallax.' },
    ],
  };
};

export const PARAM_GROUPS = [
  {
    // Source replacement (R4-1): a flat colour instead of / blended over the
    // image. The blank canvas, and a solid background for generators.
    id: 'canvas', label: 'Canvas', family: 'Utility', pinned: true, toggle: 'canvasOn', defOn: false, params: [
      mix('canvasMix'),
      { key: 'canvasHue', label: 'Hue', min: 0, max: 360, step: 1, def: 0, axis: 'colour', sweet: [0, 360], unit: 'deg', hint: 'Canvas colour hue (only visible above 0 saturation).' },
      { key: 'canvasSat', label: 'Saturation', min: 0, max: 1, step: 0.01, def: 0, hint: 'Canvas colour saturation — 0 is greyscale (white→black via Lightness).' },
      { key: 'canvasLight', label: 'Lightness', min: 0, max: 1, step: 0.01, def: 1, hint: 'Canvas brightness. Default 1 = white. Modulate from "low" for a flashing backdrop.' },
      // R10-6: gradient mode — a second colour stop, mixed vertically.
      { key: 'canvasMode', label: 'Fill', type: 'enum', options: ['flat', 'gradient'], def: 'flat', adv: true, hint: 'Flat colour or a vertical two-stop gradient.' },
      { key: 'canvasHue2', label: 'Hue 2', min: 0, max: 360, step: 1, def: 260, adv: true, unit: 'deg', hint: 'Gradient second-stop hue (top of frame).' },
      { key: 'canvasSat2', label: 'Saturation 2', min: 0, max: 1, step: 0.01, def: 0.5, adv: true, hint: 'Gradient second-stop saturation.' },
      { key: 'canvasLight2', label: 'Lightness 2', min: 0, max: 1, step: 0.01, def: 0.3, adv: true, hint: 'Gradient second-stop brightness.' },
    ],
  },
  {
    id: 'camera', label: 'Camera', family: 'Motion', pinned: true, open: true, toggle: 'camOn', defOn: true, params: [
      mix('camMix'),
      { key: 'camZoom', label: 'Base zoom', min: 1, max: 1.6, step: 0.01, def: 1.06, axis: 'motion', sweet: [1.03, 1.3] },
      { key: 'driftAmount', label: 'Drift amount', min: 0, max: 1, step: 0.01, def: 0.35, axis: 'motion', sweet: [0.15, 0.7] },
      { key: 'driftSpeed', label: 'Drift speed', min: 0, max: 1, step: 0.01, def: 0.3, axis: 'motion', sweet: [0.15, 0.55] },
      { key: 'shake', label: 'Handheld shake', min: 0, max: 1, step: 0.01, def: 0.1, axis: 'motion', sweet: [0, 0.4] },
    ],
  },
  {
    id: 'parallax', label: 'Depth parallax', family: 'Motion', toggle: 'parallaxOn', defOn: true, params: [
      mix('parallaxMix'),
      { key: 'parallaxAmount', label: 'Amount', min: 0, max: 1, step: 0.01, def: 0.35, axis: 'motion', sweet: [0.15, 0.65] },
    ],
  },
  {
    id: 'warp', label: 'Liquid warp', family: 'Distort', toggle: 'warpOn', defOn: false, params: [
      mix('warpMix'),
      { key: 'warpAmount', label: 'Amount', min: 0, max: 1, step: 0.01, def: 0.15, axis: 'motion', sweet: [0.05, 0.45] },
      { key: 'warpScale', label: 'Scale', min: 0.5, max: 8, step: 0.1, def: 3 },
      { key: 'warpSpeed', label: 'Speed', min: 0, max: 1, step: 0.01, def: 0.25, axis: 'motion', sweet: [0.1, 0.55] },
    ],
  },
  {
    id: 'kaleido', label: 'Kaleidoscope', family: 'Distort', toggle: 'kaleidoOn', defOn: false, params: [
      mix('kaleidoMix'),
      { key: 'kaleidoSeg', label: 'Segments', min: 2, max: 16, step: 1, def: 6 },
      { key: 'kaleidoSpin', label: 'Spin', min: -1, max: 1, step: 0.01, def: 0.08, axis: 'motion', sweet: [0.04, 0.45] },
      // Base-0 angle offset: modulate it (e.g. from 'beat') for the old kick.
      { key: 'kaleidoKick', label: 'Twist', min: -1, max: 1, step: 0.01, def: 0 },
    ],
  },
  // Generators composite at the end of the scene pass (after the kaleido
  // fold, before feedback) — so trails, bloom, DOF and grading treat them
  // exactly like image content. R4-P6: each is its own named device; the
  // renderer maps the active ones onto the shader's generator slots.
  genDevice('shape', 'Shape Pulse', 'Beat-friendly geometry: rings, polygons, or bars.'),
  genDevice('fractal', 'Fractal', 'Escape-time fractal: Julia set or kaleidoscopic IFS folds.'),
  genDevice('flow', 'Noise Flow', 'Organic domain-warp fields: soft clouds or marble veins.'),
  genDevice('spectrum', 'Spectrum', 'The 16-band audio analyser drawn as bars or a radial display.'),
  // R4-P7: four more generators.
  genDevice('tunnel', 'Tunnel', 'A receding tunnel of rings — round, square, or hex cross-section.'),
  genDevice('starfield', 'Starfield', 'Drifting star points, or radial warp-speed streaks.'),
  genDevice('voronoi', 'Voronoi', 'Animated cellular pattern: filled cells, edges, or thin cracks.'),
  genDevice('waveform', 'Waveform', 'An oscilloscope trace from the analyser: line, filled, or a Lissajous curve.'),
  {
    id: 'feedback', label: 'Feedback trails', family: 'Distort', toggle: 'feedbackOn', defOn: false, params: [
      mix('fbMix'),
      { key: 'fbTrail', label: 'Trail length (s)', min: 0.1, max: 4, step: 0.05, def: 0.8, axis: 'texture', sweet: [0.4, 2] },
      { key: 'fbZoom', label: 'Zoom / tunnel', min: -0.6, max: 0.6, step: 0.01, def: 0.12, axis: 'motion', sweet: [0.06, 0.35] },
      { key: 'fbRotate', label: 'Rotate (deg/s)', min: -90, max: 90, step: 0.5, def: 4, axis: 'motion', sweet: [2, 35] },
      { key: 'fbHue', label: 'Hue drift (deg/s)', min: 0, max: 180, step: 1, def: 10, axis: 'colour', sweet: [5, 60] },
      // Base-0 injection boost: modulate from 'onset' for trails on hits.
      { key: 'fbInject', label: 'Inject', min: 0, max: 1, step: 0.01, def: 0 },
    ],
  },
  {
    id: 'lens', label: 'Lens / twirl', family: 'Distort', toggle: 'lensOn', defOn: false, params: [
      mix('lensMix'),
      { key: 'lensFish', label: 'Fisheye', min: -1, max: 1, step: 0.01, def: 0.35 },
      { key: 'lensTwirl', label: 'Twirl', min: -1, max: 1, step: 0.01, def: 0 },
    ],
  },
  {
    id: 'ripple', label: 'Ripple / shockwave', family: 'Impact', toggle: 'rippleOn', defOn: false, params: [
      mix('rippleMix'),
      { key: 'ripAmount', label: 'Amount', min: 0, max: 1, step: 0.01, def: 0.5 },
      { key: 'ripWidth', label: 'Ring width', min: 0.05, max: 1, step: 0.01, def: 0.3 },
      { key: 'ripSpeed', label: 'Speed', min: 0, max: 1, step: 0.01, def: 0.5 },
    ],
  },
  {
    id: 'glitch', label: 'Glitch', family: 'Glitch', toggle: 'glitchOn', defOn: false, params: [
      mix('glitchMix'),
      { key: 'glBlock', label: 'Blocks', min: 0, max: 1, step: 0.01, def: 0.3 },
      { key: 'glSlice', label: 'Slices', min: 0, max: 1, step: 0.01, def: 0.3 },
      { key: 'glStreak', label: 'Streaks', min: 0, max: 1, step: 0.01, def: 0 },
      { key: 'glScale', label: 'Block scale', min: 2, max: 30, step: 1, def: 10 },
      { key: 'glRate', label: 'Reseed rate', min: 0, max: 1, step: 0.01, def: 0.4 },
    ],
  },
  {
    id: 'zoomblur', label: 'Zoom blur', family: 'Blur', toggle: 'zbOn', defOn: false, params: [
      mix('zbMix'),
      { key: 'zbAmount', label: 'Amount', min: 0, max: 1, step: 0.01, def: 0.3 },
    ],
  },
  {
    id: 'dof', label: 'Depth of field', family: 'Blur', toggle: 'dofOn', defOn: false, params: [
      mix('dofMix'),
      { key: 'dofAmount', label: 'Amount', min: 0, max: 1, step: 0.01, def: 0.6 },
      { key: 'dofFocus', label: 'Focus (near 1 / far 0)', min: 0, max: 1, step: 0.01, def: 0.5 },
      { key: 'dofRange', label: 'Focus range', min: 0.05, max: 1, step: 0.01, def: 0.3 },
    ],
  },
  {
    id: 'fog', label: 'Fog / smoke', family: 'Atmosphere', toggle: 'fogOn', defOn: false, params: [
      mix('fogMix'),
      { key: 'fogDensity', label: 'Density', min: 0, max: 1, step: 0.01, def: 0.4, axis: 'texture', sweet: [0.15, 0.65] },
      { key: 'fogSpeed', label: 'Drift speed', min: 0, max: 1, step: 0.01, def: 0.3 },
      { key: 'fogScale', label: 'Scale', min: 0.5, max: 6, step: 0.1, def: 2.2 },
      { key: 'fogWarmth', label: 'Warmth', min: -1, max: 1, step: 0.01, def: 0 },
    ],
  },
  {
    id: 'rays', label: 'Light rays', family: 'Light', toggle: 'raysOn', defOn: false, params: [
      mix('raysMix'),
      { key: 'raysAmount', label: 'Amount', min: 0, max: 1, step: 0.01, def: 0.35 },
      { key: 'raysAngle', label: 'Angle (deg)', min: -45, max: 45, step: 1, def: 18 },
    ],
  },
  {
    id: 'particles', label: 'Particles', family: 'Atmosphere', toggle: 'partOn', defOn: false, params: [
      mix('partMix'),
      { key: 'partType', label: 'Particle type', type: 'enum', options: ['dust', 'snow', 'embers', 'bokeh', 'stars'], def: 'dust' },
      { key: 'partDensity', label: 'Density', min: 0, max: 1, step: 0.01, def: 0.4, axis: 'texture', sweet: [0.15, 0.65] },
      { key: 'partSize', label: 'Size', min: 0, max: 1, step: 0.01, def: 0.35 },
      { key: 'partSpeed', label: 'Speed', min: 0, max: 1, step: 0.01, def: 0.3 },
      // Base-0 brightness boost: modulate from 'high' for sparkle.
      { key: 'partFlicker', label: 'Flicker', min: 0, max: 1, step: 0.01, def: 0 },
    ],
  },
  {
    id: 'rain', label: 'Rainy window', family: 'Atmosphere', toggle: 'rainOn', defOn: false, params: [
      mix('rainMix'),
      { key: 'rainAmount', label: 'Amount', min: 0, max: 1, step: 0.01, def: 0.5, axis: 'texture', sweet: [0.2, 0.7] },
      { key: 'rainSpeed', label: 'Speed', min: 0, max: 1, step: 0.01, def: 0.4 },
      { key: 'rainRefract', label: 'Refraction', min: 0, max: 1, step: 0.01, def: 0.6 },
    ],
  },
  {
    id: 'bloom', label: 'Bloom / glow', family: 'Light', toggle: 'bloomOn', defOn: true, params: [
      mix('bloomMix'),
      { key: 'bloomAmount', label: 'Amount', min: 0, max: 1.5, step: 0.01, def: 0.35 },
      { key: 'bloomThreshold', label: 'Threshold', min: 0, max: 1, step: 0.01, def: 0.6 },
    ],
  },
  {
    id: 'leak', label: 'Light leaks', family: 'Light', toggle: 'leakOn', defOn: false, params: [
      mix('leakMix'),
      { key: 'leakAmount', label: 'Amount', min: 0, max: 1, step: 0.01, def: 0.4, axis: 'texture', sweet: [0.15, 0.55] },
      { key: 'leakSpeed', label: 'Speed', min: 0, max: 1, step: 0.01, def: 0.25 },
      { key: 'leakHue', label: 'Hue', min: 0, max: 360, step: 1, def: 30, unit: 'deg' },
    ],
  },
  {
    id: 'grade', label: 'Grade', family: 'Master', pinned: true, open: true, autoGrade: true, toggle: 'gradeOn', defOn: true, params: [
      mix('gradeMix'),
      { key: 'exposure', label: 'Exposure', min: -1, max: 1, step: 0.01, def: 0, unit: 'signed' },
      { key: 'contrast', label: 'Contrast', min: 0.5, max: 1.6, step: 0.01, def: 1.04 },
      { key: 'saturation', label: 'Saturation', min: 0, max: 2, step: 0.01, def: 1, axis: 'colour', sweet: [1, 1.5], dry: 1 },
      { key: 'vibrance', label: 'Vibrance', min: -1, max: 1, step: 0.01, def: 0, axis: 'colour', sweet: [0, 0.7], unit: 'signed', hint: 'Smart saturation: boosts muted colours more than already-vivid ones — makes flat images pop without over-cooking skin tones.' },
      { key: 'temperature', label: 'Temperature', min: -1, max: 1, step: 0.01, def: 0, unit: 'signed' },
      { key: 'tint', label: 'Tint (G-M)', min: -1, max: 1, step: 0.01, def: 0, adv: true, unit: 'signed' },
      { key: 'highlights', label: 'Highlights', min: -1, max: 1, step: 0.01, def: 0, adv: true, unit: 'signed', hint: 'Brightens (+) or recovers (−) the brightest regions.' },
      { key: 'shadows', label: 'Shadows', min: -1, max: 1, step: 0.01, def: 0, adv: true, unit: 'signed', hint: 'Lifts (+) or deepens (−) the darkest regions.' },
      { key: 'gamma', label: 'Gamma', min: 0.5, max: 1.8, step: 0.01, def: 1, adv: true },
      { key: 'fade', label: 'Faded blacks', min: 0, max: 1, step: 0.01, def: 0.08, adv: true },
    ],
  },
  {
    id: 'hue', label: 'Hue cycle', family: 'Color', toggle: 'hueOn', defOn: false, params: [
      mix('hueMix'),
      { key: 'hueSpeed', label: 'Speed (deg/s)', min: -60, max: 60, step: 0.5, def: 8, axis: 'colour', sweet: [4, 30] },
      { key: 'hueAmount', label: 'Amount', min: 0, max: 1, step: 0.01, def: 0.7, axis: 'colour', sweet: [0.3, 1] },
      { key: 'hueBeat', label: 'Beat steps', min: 0, max: 1, step: 0.01, def: 0 },
    ],
  },
  {
    id: 'duo', label: 'Duotone', family: 'Color', toggle: 'duoOn', defOn: false, params: [
      mix('duoMix'),
      { key: 'duoAmount', label: 'Amount', min: 0, max: 1, step: 0.01, def: 0.7, axis: 'colour', sweet: [0.3, 1] },
      { key: 'duoHueA', label: 'Shadow hue', min: 0, max: 360, step: 1, def: 220, unit: 'deg' },
      { key: 'duoHueB', label: 'Highlight hue', min: 0, max: 360, step: 1, def: 40, unit: 'deg' },
    ],
  },
  {
    id: 'plasma', label: 'Plasma', family: 'Stylize', toggle: 'plasmaOn', defOn: false, params: [
      mix('plasmaMix'),
      { key: 'plasmaAmount', label: 'Amount', min: 0, max: 1, step: 0.01, def: 0.3, axis: 'texture', sweet: [0.1, 0.5] },
      { key: 'plasmaScale', label: 'Scale', min: 0.5, max: 8, step: 0.1, def: 2.5 },
      { key: 'plasmaSpeed', label: 'Speed', min: 0, max: 1, step: 0.01, def: 0.4 },
    ],
  },
  {
    id: 'pixel', label: 'Pixel art', family: 'Stylize', toggle: 'pixelOn', defOn: false, params: [
      mix('pixelMix'),
      { key: 'pxAmount', label: 'Pixelate', min: 0, max: 1, step: 0.01, def: 0.35 },
      { key: 'pxPosterize', label: 'Posterize', min: 0, max: 1, step: 0.01, def: 0.4 },
      { key: 'pxDither', label: 'Dither', min: 0, max: 1, step: 0.01, def: 0.5 },
    ],
  },
  {
    id: 'halftone', label: 'Halftone', family: 'Stylize', toggle: 'htOn', defOn: false, params: [
      mix('htMix'),
      { key: 'htScale', label: 'Dot scale', min: 0, max: 1, step: 0.01, def: 0.35 },
      { key: 'htAngle', label: 'Angle (deg)', min: -90, max: 90, step: 1, def: 25 },
    ],
  },
  {
    id: 'edge', label: 'Neon edge', family: 'Stylize', toggle: 'edgeOn', defOn: false, params: [
      mix('edgeMix'),
      { key: 'edgeHue', label: 'Hue', min: 0, max: 360, step: 1, def: 180, unit: 'deg' },
    ],
  },
  {
    // R8-5 creative colour: expressive split-tone (distinct from the
    // corrective Master Grade) — tints shadows and highlights toward chosen
    // hues for teal-orange / duochrome looks.
    id: 'wash', label: 'Colour wash', family: 'Color', toggle: 'washOn', defOn: false, params: [
      mix('washMix'),
      { key: 'washShadowHue', label: 'Shadow hue', min: 0, max: 360, step: 1, def: 200, axis: 'colour', sweet: [180, 220], unit: 'deg', hint: 'Colour pushed into the shadows.' },
      { key: 'washHighHue', label: 'Highlight hue', min: 0, max: 360, step: 1, def: 38, axis: 'colour', sweet: [20, 55], unit: 'deg', hint: 'Colour pushed into the highlights.' },
      { key: 'washBalance', label: 'Balance', min: -1, max: 1, step: 0.01, def: 0, adv: true, hint: 'Shifts the shadow/highlight split point.' },
    ],
  },
  {
    // R8-5 image detail: local-contrast "clarity" — a creative structure
    // look (not the Master's output sharpen).
    id: 'clarity', label: 'Clarity', family: 'Stylize', toggle: 'clarityOn', defOn: false, params: [
      mix('clarityMix'),
      { key: 'clarityRadius', label: 'Radius', min: 1, max: 8, step: 0.5, def: 4, hint: 'Local-contrast radius in pixels — larger = broader structure punch.' },
    ],
  },
  {
    id: 'strobe', label: 'Strobe', family: 'Impact', toggle: 'strobeOn', defOn: false, params: [
      mix('strobeMix'),
      { key: 'strAmount', label: 'Amount', min: 0, max: 1, step: 0.01, def: 0.6 },
      // Base-0 flash value — modulate it (beat/onset are rate-capped by the
      // flash limiter / tempo grid). The shader hard-caps the flash too.
      { key: 'strFlash', label: 'Flash', min: 0, max: 1, step: 0.01, def: 0 },
    ],
  },
  {
    id: 'vhs', label: 'VHS / tape', family: 'Texture', toggle: 'vhsOn', defOn: false, params: [
      mix('vhsMix'),
      { key: 'vhsScan', label: 'Scanlines', min: 0, max: 1, step: 0.01, def: 0.35, axis: 'texture', sweet: [0.1, 0.55] },
      { key: 'vhsBleed', label: 'Chroma bleed', min: 0, max: 1, step: 0.01, def: 0.5, axis: 'texture', sweet: [0.2, 0.65] },
      { key: 'vhsJitter', label: 'Jitter', min: 0, max: 1, step: 0.01, def: 0.4, axis: 'texture', sweet: [0.1, 0.55] },
      { key: 'vhsWobble', label: 'Tape wobble', min: 0, max: 1, step: 0.01, def: 0.35, axis: 'texture', sweet: [0.1, 0.5] },
    ],
  },
  {
    id: 'grain', label: 'Film grain', family: 'Texture', pinned: true, toggle: 'grainOn', defOn: true, params: [
      mix('grainMix'),
      { key: 'grainAmount', label: 'Amount', min: 0, max: 1, step: 0.01, def: 0.25, axis: 'texture', sweet: [0.1, 0.55] },
      { key: 'grainSize', label: 'Size', min: 1, max: 4, step: 0.1, def: 1.6 },
    ],
  },
  {
    id: 'ca', label: 'Chromatic aberration', family: 'Texture', toggle: 'caOn', defOn: true, params: [
      mix('caMix'),
      { key: 'caAmount', label: 'Amount', min: 0, max: 1, step: 0.01, def: 0.15, axis: 'texture', sweet: [0.05, 0.4] },
    ],
  },
  {
    id: 'vignette', label: 'Vignette', family: 'Utility', pinned: true, toggle: 'vigOn', defOn: true, params: [
      mix('vigMix'),
      { key: 'vigAmount', label: 'Amount', min: 0, max: 1, step: 0.01, def: 0.45 },
      { key: 'vigSize', label: 'Size', min: 0, max: 1.2, step: 0.01, def: 0.55 },
      { key: 'vigSoft', label: 'Softness', min: 0.05, max: 1, step: 0.01, def: 0.5 },
    ],
  },
  {
    // Response shaping re-smooths whole envelopes — too heavy (and too
    // global) to evaluate per-frame, so this group is not automatable.
    // R8-2: not a device — rendered by the global Signal panel, not the
    // device stack. `signal: true` keeps its params in the schema/defaults
    // while ParamPanel skips its card.
    id: 'audio', label: 'Audio response', family: 'Utility', pinned: true, noAuto: true, signal: true, params: [
      // Master modulation depth — the One Knob. Scales every ∿ depth at
      // sample time (features.applyModulation), so it needs no re-smoothing.
      { key: 'audReact', label: 'Reactivity', min: 0, max: 2, step: 0.01, def: 1, axis: 'energy', sweet: [0.6, 1.6] },
      { key: 'audGain', label: 'Gain', min: 0.25, max: 4, step: 0.05, def: 1 },
      { key: 'audAttack', label: 'Attack (ms)', min: 0, max: 400, step: 5, def: 60 },
      { key: 'audRelease', label: 'Release (ms)', min: 20, max: 1500, step: 10, def: 320 },
      { key: 'audLowMid', label: 'Low/Mid xover (Hz)', min: 40, max: 1000, step: 5, def: 160 },
      { key: 'audMidHigh', label: 'Mid/High xover (Hz)', min: 400, max: 8000, step: 25, def: 2000 },
      { key: 'audGamma', label: 'Curve', min: 0.4, max: 2.5, step: 0.05, def: 1, adv: true },
      { key: 'audSmoothness', label: 'Fade smoothness', min: 0, max: 1, step: 0.01, def: 0.6, adv: true, hint: 'Eases the low end of every Mix fader so effects bloom in instead of popping. 0 = linear.' },
      { key: 'flashLimit', label: 'Flash limiter', type: 'bool', def: true, adv: true },
    ],
  },
  // R7-1 Master section: Sharpen + Output are new; Grade/Vignette/Grain/CA
  // are regrouped into 'Master' and moved to the end below. Mix is the
  // strength (read straight by the shader — crossfade faders).
  {
    id: 'sharpen', label: 'Sharpen', family: 'Master', pinned: true, toggle: 'sharpOn', defOn: false, params: [
      mix('sharpMix'),
      { key: 'sharpRadius', label: 'Radius', min: 0.5, max: 3, step: 0.1, def: 1, hint: 'Unsharp-mask sampling radius in pixels — larger = coarser detail.' },
    ],
  },
  {
    id: 'output', label: 'Soft-Clip Highlights', family: 'Master', pinned: true, toggle: 'outputOn', defOn: false, params: [
      mix('outputMix'),
      { key: 'outputCeiling', label: 'Ceiling', min: 0.5, max: 1, step: 0.01, def: 0.85, hint: 'Highlights above this roll off smoothly (soft-clip) instead of hard-clipping to white — recovers perceived detail in bright areas.' },
    ],
  },
];

// R7-1: the Master finishing cluster renders last in the panel. Shader
// execution order is fixed in POST_SRC — this only groups the UI (and the
// add-device browser) so finishing lives in one locked section at the end.
const MASTER_ORDER = ['sharpen', 'grade', 'vignette', 'grain', 'ca', 'output'];
for (const g of PARAM_GROUPS) if (MASTER_ORDER.includes(g.id)) g.family = 'Master';
PARAM_GROUPS.sort((a, z) => {
  const ai = MASTER_ORDER.indexOf(a.id);
  const zi = MASTER_ORDER.indexOf(z.id);
  if (ai < 0 && zi < 0) return 0;     // both non-master: keep original order
  if (ai < 0) return -1;
  if (zi < 0) return 1;
  return ai - zi;                      // master devices in MASTER_ORDER
});

// One-line tooltips for the non-obvious params (rendered as label titles).
const HINTS = {
  camZoom: 'Base crop zoom. Modulate from "low" for a beat-synced zoom pulse.',
  driftAmount: 'How far the camera slowly wanders around the frame.',
  driftSpeed: 'How fast the camera wanders.',
  shake: 'Handheld jitter. Modulate from "loud" to swell with the track.',
  parallaxAmount: '2.5D shift between near and far (uses the depth map).',
  warpAmount: 'Strength of the liquid distortion.',
  warpScale: 'Size of the warp blobs — higher = finer detail.',
  warpSpeed: 'How fast the warp churns.',
  kaleidoSeg: 'Number of mirror segments.',
  kaleidoSpin: 'Continuous rotation speed.',
  kaleidoKick: 'One-shot twist offset. Base 0 — modulate from "beat" or "onset" for kicks.',
  fbTrail: 'Seconds for a trail to fade to 5%.',
  fbZoom: 'Trail zoom per second: + tunnels outward, − pulls inward.',
  fbRotate: 'Trail rotation, degrees per second.',
  fbHue: 'Trail hue drift, degrees per second.',
  fbInject: 'Brightness pushed into the trail. Base 0 — modulate from "onset" for trails on hits.',
  fogDensity: 'Fog thickness (depth-aware: thicker far away).',
  fogSpeed: 'Fog drift speed.',
  fogScale: 'Fog billow size — higher = finer.',
  fogWarmth: 'Cool blue (−) to warm amber (+).',
  raysAmount: 'Strength of the light shafts.',
  raysAngle: 'Shaft angle in degrees.',
  partType: 'What the particles look like and how they move.',
  partDensity: 'How many particles.',
  partSize: 'Particle size.',
  partSpeed: 'Particle motion speed.',
  partFlicker: 'Sparkle boost. Base 0 — modulate from "high" for shimmer.',
  rainAmount: 'How many droplets on the glass.',
  rainSpeed: 'How fast droplets run.',
  rainRefract: 'How strongly droplets bend the image.',
  bloomAmount: 'Glow strength.',
  bloomThreshold: 'How bright a pixel must be before it blooms.',
  leakAmount: 'Light-leak strength.',
  leakSpeed: 'How fast the leaks wander.',
  leakHue: 'Leak colour.',
  exposure: 'Overall brightness, in stops.',
  contrast: 'Tonal punch: <1 flattens, >1 deepens.',
  saturation: 'Colour richness: 0 = mono, 1 = as shot.',
  temperature: 'Cool blue (−) to warm amber (+).',
  tint: 'Green (−) to magenta (+) balance.',
  gamma: 'Midtone lift: <1 brightens mids, >1 darkens them.',
  fade: 'Lifted blacks for a faded film look.',
  hueSpeed: 'Continuous hue rotation, degrees per second.',
  hueAmount: 'How much of the hue rotation is applied.',
  hueBeat: 'Stepped hue jump on every beat of the tempo grid.',
  duoAmount: 'Blend toward the two-colour gradient map.',
  duoHueA: 'Shadow colour.',
  duoHueB: 'Highlight colour.',
  plasmaAmount: 'Interference-pattern overlay strength.',
  plasmaScale: 'Plasma pattern size.',
  plasmaSpeed: 'Plasma motion speed.',
  vhsScan: 'Scanline darkness.',
  vhsBleed: 'Chroma smearing.',
  vhsJitter: 'Per-line horizontal jitter. Modulate from "high" for tape stress.',
  vhsWobble: 'Slow tape wow/flutter.',
  grainAmount: 'Film grain strength.',
  grainSize: 'Grain clump size.',
  caAmount: 'RGB fringe. Modulate from "onset" for kick hits.',
  vigAmount: 'Edge darkening. Modulate from "loud" for breathing.',
  vigSize: 'How far the vignette reaches inward.',
  vigSoft: 'Vignette edge softness.',
  audReact: 'Master depth for ALL audio modulation — how hard the picture dances to the track. 0 = static, 1 = as patched, 2 = double.',
  audGain: 'Pre-gain on every analysis envelope.',
  audAttack: 'How fast envelopes rise.',
  audRelease: 'How slow envelopes fall.',
  audGamma: 'Envelope response curve: <1 lifts quiet detail, >1 emphasises peaks.',
  audLowMid: 'Where "low" ends and "mid" begins. Re-derives the band envelopes instantly (no re-analysis).',
  audMidHigh: 'Where "mid" ends and "high" begins. Watch the ∿ meters react as you move it.',
  flashLimit: 'Photosensitivity guard: caps flash-driving envelopes to ≤3 rises/sec.',
  lensFish: 'Barrel (+) / pincushion (−) lens distortion.',
  lensTwirl: 'Spiral twist around the centre.',
  ripAmount: 'Shockwave displacement. The ring expands once per beat.',
  ripWidth: 'Thickness of the expanding ring.',
  ripSpeed: 'How far the ring travels per beat.',
  glBlock: 'Random block displacement. Modulate from "onset" for hits.',
  glSlice: 'Horizontal slice shuffle.',
  glStreak: 'Pixel-sort-style vertical smears in random columns.',
  glScale: 'Block size — higher = more, smaller blocks.',
  glRate: 'How often the glitch pattern reseeds.',
  zbAmount: 'Radial blur toward the centre. Modulate from "onset" for bursts.',
  dofAmount: 'How strongly out-of-focus regions blur.',
  dofFocus: 'Focus plane in depth: 1 = nearest, 0 = farthest. Automate or modulate to pull focus.',
  dofRange: 'Depth band that stays sharp around the focus plane.',
  pxAmount: 'Mosaic cell size.',
  pxPosterize: 'Reduce colours to fewer levels.',
  pxDither: 'Noise dither that breaks up posterize banding.',
  htScale: 'Halftone dot size.',
  htAngle: 'Halftone screen angle.',
  edgeHue: 'Neon outline colour.',
  strAmount: 'Strobe depth — how far toward white a flash goes (hard-capped).',
  strFlash: 'The flash itself. Base 0 — modulate from "beat" or "onset"; rate-limited sources only.',
};
for (const g of PARAM_GROUPS) {
  for (const p of g.params) {
    if (!p.hint && HINTS[p.key]) p.hint = HINTS[p.key];
  }
}

// Keys whose change requires re-smoothing the feature envelopes.
export const RESPONSE_KEYS = [
  'audGain', 'audAttack', 'audRelease', 'audGamma', 'flashLimit',
  'audLowMid', 'audMidHigh',
];

// Family display order in the Add-device browser.
export const FAMILY_ORDER = [
  'Motion', 'Distort', 'Generate', 'Impact', 'Glitch', 'Blur',
  'Atmosphere', 'Light', 'Color', 'Stylize', 'Texture', 'Utility', 'Master',
];

// The default device chain: pinned utilities + devices that ship enabled.
// Chain order is always pipeline order (PARAM_GROUPS order) — fixed.
export function defaultChain() {
  return PARAM_GROUPS.filter((g) => g.pinned || g.defOn).map((g) => g.id);
}

export function groupById(id) {
  return PARAM_GROUPS.find((g) => g.id === id);
}

// Default mod depths reproducing the pre-matrix audio reactivity (the old
// per-device Source/Audio sliders and the hardwired uAudio shader accents),
// computed through the same formulas as migrateLegacyParams.
const DEFAULT_MODS = {
  'camZoom~low': 0.02,        // old Zoom pulse 0.25 @ low
  'shake~loud': 0.2,          // old shake loudness coupling
  'parallaxAmount~low': 0.21, // old Audio push 0.3 @ low
  'warpAmount~mid': 0.03,     // old Audio drive 0.4 @ mid
  'kaleidoKick~beat': 0.09,   // old Kick 0.3 @ beat
  'fbInject~onset': 0.35,     // old Inject drive 0.5 @ onset
  'fogDensity~low': 0.11,     // old Audio swell 0.4 @ low
  'raysAmount~low': 0.1,      // old Audio drive 0.3 @ low
  'partFlicker~high': 0.45,   // old Flicker 0.5 @ high
  'bloomAmount~loud': 0.11,   // old Swell 0.4 @ loud
  'caAmount~onset': 0.15,     // old Kick 0.4 @ onset
  'vigAmount~loud': 0.04,     // old Breathe 0.3 @ loudness
  'vhsJitter~high': 0.6,      // old hardwired highs accent
  'grainAmount~high': 0.17,   // old hardwired highs accent
  'plasmaAmount~mid': 0.25,   // old hardwired mids accent
  'leakAmount~loud': 0.33,    // old hardwired loudness accent
  // sensible reactivity for the new devices the moment they're added
  'glBlock~onset': 0.25,
  'glSlice~onset': 0.2,
  'zbAmount~onset': 0.12,
  'strFlash~beat': 0.6,
};

// One global rack of macro knobs (Ableton-style). Macro values are ordinary
// params (`macro1..macroN`) — automatable, A/B-switchable, preset-saved.
// Names + mappings live beside the chain in app state.
export const MACRO_COUNT = 8;

// Each rack owns up to MACRO_SLOTS macro knobs. A macro's live value is an
// ordinary (automatable) param keyed per rack instance, e.g. 'rk1.m3'.
export const MACRO_SLOTS = 8;
export function rackMacroKey(rackId, n) {
  return `${rackId}.m${n}`; // n is 1-based; no other key uses '.'
}

export function defaultMacros() {
  return Array.from({ length: MACRO_COUNT }, (_, i) => ({
    name: `Macro ${i + 1}`,
    mappings: [], // [{ key, min, max }] in param units; inverted ranges allowed
  }));
}

// The standard macro quartet — the same four knobs, meaning the same thing,
// on every look. Generated from the schema's `axis`/`sweet` tags.
export const QUARTET = [
  { name: 'Energy', axis: 'energy' },
  { name: 'Motion', axis: 'motion' },
  { name: 'Texture', axis: 'texture' },
  { name: 'Colour', axis: 'colour' },
];

// Build the quartet for the devices in `chainIds`. One-knob contract:
// **0 = fully dry** — every mapping runs from the param's no-effect value
// (`dry`, default 0 clamped into range) up to sweet-hi, so a knob at 0
// silences its whole axis. The returned `value` is each knob's starting
// position: the mean of where the current params sit inside [dry, hi], so
// building the quartet lands near the authored look instead of zeroing it.
export function buildQuartet(chainIds, current = {}) {
  const chain = new Set(chainIds || PARAM_GROUPS.map((g) => g.id));
  return QUARTET.map(({ name, axis }) => {
    const mappings = [];
    let pos = 0;
    for (const g of PARAM_GROUPS) {
      if (!chain.has(g.id)) continue;
      for (const p of g.params) {
        if (p.axis !== axis || !p.sweet) continue;
        const dry = p.dry === undefined ? Math.min(Math.max(0, p.min), p.max) : p.dry;
        const w = p.weight === undefined ? 1 : p.weight;
        const hi = dry + (p.sweet[1] - dry) * w;
        if (hi - dry < (p.step || 0.01)) continue;
        const cur = current[p.key] === undefined ? p.def : current[p.key];
        pos += Math.min(Math.max((cur - dry) / (hi - dry), 0), 1);
        mappings.push({ key: p.key, min: +dry.toFixed(4), max: +hi.toFixed(4) });
      }
    }
    return {
      name,
      value: mappings.length ? +(pos / mappings.length).toFixed(2) : 0,
      mappings,
    };
  });
}

export function defaultParams() {
  const params = {};
  for (const group of PARAM_GROUPS) {
    if (group.toggle) params[group.toggle] = !!group.defOn;
    for (const p of group.params) params[p.key] = p.def;
  }
  for (let i = 1; i <= MACRO_COUNT; i++) params[`macro${i}`] = 0;
  return { ...params, ...DEFAULT_MODS };
}

// Flat key -> schema lookup for the automation system and lane editor.
// Includes: Device On toggles (type 'bool', stepped 0/1 lanes, Ableton
// "Device On" parity) and synthetic mod-depth entries (`key~src`, -1..1) for
// every moddable param — both fully automatable.
export function paramIndex() {
  const index = {};
  for (const group of PARAM_GROUPS) {
    // R8-3: Master device automation reads "Master Grade · Vibrance" etc.,
    // making the final-output role explicit in lanes and mappings.
    const groupLabel = group.family === 'Master' ? `Master ${group.label}` : group.label;
    if (group.toggle && !group.noAuto) {
      index[group.toggle] = {
        key: group.toggle, label: 'Device On', type: 'bool',
        options: ['off', 'on'], def: !!group.defOn,
        group: group.id, groupLabel, automatable: true,
      };
    }
    for (const p of group.params) {
      const moddable = !group.noAuto && !p.type;
      index[p.key] = {
        ...p,
        group: group.id,
        groupLabel,
        automatable: !group.noAuto && p.type !== 'bool',
        moddable,
      };
      if (!moddable) continue;
      for (const src of MOD_SOURCES) {
        const mk = `${p.key}${MOD_SEP}${src}`;
        index[mk] = {
          key: mk, label: `${p.label} ~ ${src}`, type: 'mod',
          min: -1, max: 1, step: 0.01, def: 0,
          group: group.id, groupLabel,
          automatable: true, modTarget: p.key, modSrc: src,
        };
      }
    }
  }
  for (let i = 1; i <= MACRO_COUNT; i++) {
    index[`macro${i}`] = {
      key: `macro${i}`, label: `Macro ${i}`, min: 0, max: 1, step: 0.01, def: 0,
      group: 'macros', groupLabel: 'Macros', automatable: true,
    };
  }
  return index;
}

// Apply macro mappings: each mapped param is *owned* by its macro — the
// macro position scans the mapping's [min, max] range, overriding the
// param's own value (and any direct lane on it, since this runs after lane
// automation). Pure function of (params, macros).
let MACRO_SCHEMA = null;
export function applyMacros(p, macros) {
  if (!macros || !macros.length) return p;
  if (!MACRO_SCHEMA) MACRO_SCHEMA = paramIndex();
  let out = null;
  for (let i = 0; i < macros.length; i++) {
    const maps = macros[i].mappings;
    if (!maps || !maps.length) continue;
    const mk = `macro${i + 1}`;
    const v = p[mk] === undefined ? 0 : p[mk];
    if (!out) out = { ...p };
    for (const m of maps) {
      const s = MACRO_SCHEMA[m.key];
      if (!s) continue;
      const val = m.min + (m.max - m.min) * v;
      if (s.type === 'bool') {
        out[m.key] = val >= 0.5;
      } else if (s.type === 'enum') {
        const idx = Math.round(Math.min(Math.max(val, 0), s.options.length - 1));
        out[m.key] = s.options[idx];
      } else {
        out[m.key] = val;
      }
    }
  }
  return out || p;
}

// ------------------------------------------------- intensity resolution

// Per-device Mix (`<prefix>Mix`) scales these keys toward zero.
// Exported for the schema lint (every fader must have a resolution path).
export const MIX_SCALE = {
  camMix: ['driftAmount', 'shake'],
  parallaxMix: ['parallaxAmount'],
  warpMix: ['warpAmount'],
  lensMix: ['lensFish', 'lensTwirl'],
  rippleMix: ['ripAmount'],
  glitchMix: ['glBlock', 'glSlice', 'glStreak'],
  zbMix: ['zbAmount'],
  dofMix: ['dofAmount'],
  fogMix: ['fogDensity'],
  raysMix: ['raysAmount'],
  partMix: ['partDensity'],
  rainMix: ['rainAmount', 'rainRefract'],
  bloomMix: ['bloomAmount'],
  leakMix: ['leakAmount'],
  hueMix: ['hueAmount'],
  duoMix: ['duoAmount'],
  pixelMix: ['pxAmount', 'pxPosterize', 'pxDither'],
  strobeMix: ['strAmount'],
  plasmaMix: ['plasmaAmount'],
  vhsMix: ['vhsScan', 'vhsBleed', 'vhsJitter', 'vhsWobble'],
  grainMix: ['grainAmount'],
  caMix: ['caAmount'],
  vigMix: ['vigAmount'],
};
// htMix / edgeMix / gen*Mix pass through as shader blend uniforms (like
// kaleidoMix).

// Shader-level crossfade faders (read by the GLSL / genUniforms), curved
// in place by resolveParams so the fade smoothness applies to them too.
const CROSSFADE_MIX = [
  'kaleidoMix', 'fbMix', 'htMix', 'edgeMix', 'canvasMix',
  'shapeMix', 'fractalMix', 'flowMix', 'spectrumMix', 'sharpMix', 'outputMix',
  'washMix', 'clarityMix',
  'tunnelMix', 'starfieldMix', 'voronoiMix', 'waveformMix',
];

// R7-2: gentle Mix fade curve. `audSmoothness` (0..1) → γ = 1 + s, so
// every fader is shaped m^γ before it scales — low values bloom in instead
// of popping. Endpoints exact (0^γ=0, 1^γ=1): 0 stays bit-exact-absent,
// 1 stays fully wet. s=0 is linear (γ=1).
function fadeCurver(p) {
  const s = p.audSmoothness === undefined ? 0.6 : p.audSmoothness;
  const gamma = 1 + Math.max(s, 0);
  if (gamma <= 1.0001) return (m) => m;
  return (m) => (m >= 1 ? 1 : Math.pow(Math.min(Math.max(m, 0), 1), gamma));
}

// One fader per device (R5-P1b): where Mix scales exactly one scalar,
// "Amount" and the fader are two multiplying knobs on the same quantity —
// fold the duplicate under More… as the patched depth packs author.
for (const g of PARAM_GROUPS) {
  const fader = g.params[0];
  const targets = fader && MIX_SCALE[fader.key];
  if (!targets || targets.length !== 1) continue;
  const dup = g.params.find((p) => p.key === targets[0]);
  if (dup) {
    dup.adv = true;
    dup.hint = `${dup.hint || ''} Patched depth — Mix is the fader.`.trim();
    g.params.splice(g.params.indexOf(dup), 1); // adv tail comes last
    g.params.push(dup);
  }
}

// Grade fades toward the neutral (no-op) grade rather than toward zero.
const GRADE_NEUTRAL = {
  exposure: 0, contrast: 1, saturation: 1, temperature: 0, tint: 0, gamma: 1, fade: 0,
  vibrance: 0, highlights: 0, shadows: 0,
};

// Auto colour-grade (Master): derive a balanced Grade from the *ungraded*
// image. `stats` is a 256-bin weighted luma histogram + per-channel means +
// mean saturation, sampled across representative frames in main.js (the GL /
// readPixels half — impure). This half is pure + unit-tested (test.html) and
// maps onto the real grade shader math (shaders.js `--- grade`): exposure
// (exp2), contrast (pivot 0.5), temperature/tint (channel mults 0.14/0.06),
// vibrance, highlights/shadows (luma-masked gain). One-shot: the caller writes
// these as static params, so render determinism is untouched. Conservative —
// every value is the neutral nudged toward its raw target by a STRENGTH factor,
// so Auto never lurches; the user fine-tunes from there. Returns null if there
// is nothing opaque to measure.
export function autoGradeFromStats(stats) {
  const { hist, meanR, meanG, meanB, meanSat } = stats;
  let total = 0;
  for (let i = 0; i < hist.length; i++) total += hist[i];
  if (!(total > 1e-6)) return null;
  const pct = (frac) => {                       // weighted luma percentile → 0..1
    const goal = total * frac;
    let acc = 0;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= goal) return i / 255; }
    return 1;
  };
  const STRENGTH = 0.7, WB_STRENGTH = 0.5;
  const r2 = (v) => Math.round(v * 100) / 100;  // schema step is 0.01
  const toward = (raw, neutral, s, lo, hi) =>
    r2(Math.min(Math.max(neutral + (raw - neutral) * s, lo), hi));

  // Exposure — bring the median luma toward a natural mid.
  const med = Math.max(pct(0.5), 1e-3);
  const exposure = toward(Math.log2(0.46 / med), 0, STRENGTH, -1, 1);

  // Contrast — widen a flat tonal range, leave a full one ~alone.
  const range = Math.max(pct(0.98) - pct(0.02), 0.04);
  const contrast = toward(0.78 / range, 1, STRENGTH * 0.6, 0.5, 1.6);

  // White balance — gentle grey-world: neutralise R-vs-B and green-magenta.
  const mR = Math.max(meanR, 1e-3), mG = Math.max(meanG, 1e-3), mB = Math.max(meanB, 1e-3);
  const temperature = toward((mB - mR) / (0.14 * (mB + mR)), 0, WB_STRENGTH, -1, 1);
  const tint = toward((1 - (mR + mB) / (2 * mG)) / 0.06, 0, WB_STRENGTH, -1, 1);

  // Vibrance — lift muted images only (Auto adds pop, never desaturates).
  const vibrance = r2(Math.min(Math.max(0.28 - meanSat, 0) * 2.2 * STRENGTH, 0.6));

  // Highlights / shadows — recovery only when a tail is genuinely clipped.
  let hiClip = 0, loClip = 0;
  for (let i = 250; i < 256; i++) hiClip += hist[i];
  for (let i = 0; i < 6; i++) loClip += hist[i];
  const highlights = r2(Math.max(-Math.max(hiClip / total - 0.02, 0) * 6 * STRENGTH, -0.5));
  const shadows = r2(Math.min(Math.max(loClip / total - 0.02, 0) * 6 * STRENGTH, 0.5));

  return { exposure, contrast, temperature, tint, vibrance, highlights, shadows };
}

// Device toggles that have no shader branch of their own: off = neutral.
const TOGGLE_NEUTRAL = {
  camOn: { driftAmount: 0, shake: 0, camZoom: 1 },
  grainOn: { grainAmount: 0 },
  caOn: { caAmount: 0 },
  vigOn: { vigAmount: 0 },
};

// Effective render params: applies Device On + Intensity. Pure — called once
// per frame by the renderer (after modulation) for both preview and export.
// kaleidoMix / fbMix pass through untouched (they are shader-level
// crossfades, since those effects have no meaningful zero of their params).
export function resolveParams(p) {
  const out = { ...p };
  const curve = fadeCurver(out);
  for (const [mixKey, keys] of Object.entries(MIX_SCALE)) {
    const m = curve(out[mixKey] === undefined ? 1 : out[mixKey]);
    if (m >= 1) continue;
    for (const k of keys) out[k] *= m;
  }
  for (const mixKey of CROSSFADE_MIX) {
    if (out[mixKey] !== undefined) out[mixKey] = curve(out[mixKey]);
  }
  const gm = curve(out.gradeOn === false ? 0 : (out.gradeMix === undefined ? 1 : out.gradeMix));
  if (gm < 1) {
    for (const [k, n] of Object.entries(GRADE_NEUTRAL)) out[k] = n + (out[k] - n) * gm;
  }
  // Camera Mix 0 == absent: the base zoom's neutral is 1, not 0, so it
  // fades toward 1 alongside the MIX_SCALE'd drift/shake (R5-P1b fix).
  const cm = curve(out.camMix === undefined ? 1 : out.camMix);
  if (cm < 1) out.camZoom = 1 + (out.camZoom - 1) * cm;
  for (const [toggle, neutral] of Object.entries(TOGGLE_NEUTRAL)) {
    if (out[toggle] === false) Object.assign(out, neutral);
  }
  return out;
}

// --------------------------------------------------- legacy migration

// Pre-matrix audio params (`xxxAudio` + `xxxSrc` pairs and friends) and the
// defaults they had, used to convert old packs/presets into mod depths.
const LEGACY_AUDIO_DEFAULTS = {
  zoomPulse: 0.25, zoomPulseSrc: 'low',
  parallaxAudio: 0.3, parallaxSrc: 'low',
  warpAudio: 0.4, warpSrc: 'mid',
  kaleidoAudio: 0.3, kaleidoSrc: 'beat',
  fbAudio: 0.5, fbSrc: 'onset',
  fogAudio: 0.4, fogSrc: 'low',
  raysAudio: 0.3, raysSrc: 'low',
  partAudio: 0.5, partSrc: 'high',
  bloomAudio: 0.4, bloomSrc: 'loud',
  caAudio: 0.4, caSrc: 'onset',
  vigBreathe: 0.3,
};

const NEW_DEFAULTS = (() => {
  const d = {};
  for (const g of PARAM_GROUPS) for (const p of g.params) d[p.key] = p.def;
  return d;
})();

// Converts a partial legacy params object (style pack override or saved
// preset) into the current schema: each old audio-depth/source pair becomes
// the equivalent mod-depth key. Look parity is approximate by design — the
// shader baselines were folded into constants (see shaders.js).
export function migrateLegacyParams(p) {
  if (!p) return p;
  const legacyKeys = Object.keys(p).filter((k) => k in LEGACY_AUDIO_DEFAULTS);
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (!(k in LEGACY_AUDIO_DEFAULTS)) out[k] = v;
  }
  if (!legacyKeys.length) return out;

  const eff = (k) => (p[k] !== undefined ? p[k]
    : (k in LEGACY_AUDIO_DEFAULTS ? LEGACY_AUDIO_DEFAULTS[k] : NEW_DEFAULTS[k]));
  const has = (...ks) => ks.some((k) => p[k] !== undefined);
  const put = (target, src, depth) => {
    out[`${target}${MOD_SEP}${src}`] = +depth.toFixed(3);
  };

  if (has('zoomPulse', 'zoomPulseSrc')) {
    put('camZoom', eff('zoomPulseSrc'), eff('camZoom') * eff('zoomPulse') * 0.05 / 0.6);
  }
  if (has('parallaxAudio', 'parallaxSrc')) {
    put('parallaxAmount', eff('parallaxSrc'), 2 * eff('parallaxAudio') * eff('parallaxAmount'));
  }
  if (has('warpAudio', 'warpSrc')) {
    put('warpAmount', eff('warpSrc'), 0.5 * eff('warpAudio') * eff('warpAmount'));
  }
  if (has('kaleidoAudio', 'kaleidoSrc')) {
    put('kaleidoKick', eff('kaleidoSrc'), 0.3 * eff('kaleidoAudio'));
  }
  if (has('fbAudio', 'fbSrc')) {
    put('fbInject', eff('fbSrc'), 0.7 * eff('fbAudio'));
  }
  if (has('fogAudio', 'fogSrc')) {
    put('fogDensity', eff('fogSrc'), 0.667 * eff('fogAudio') * eff('fogDensity'));
  }
  if (has('raysAudio', 'raysSrc')) {
    put('raysAmount', eff('raysSrc'), eff('raysAudio') * eff('raysAmount'));
  }
  if (has('partAudio', 'partSrc')) {
    put('partFlicker', eff('partSrc'), 0.9 * eff('partAudio'));
  }
  if (has('bloomAudio', 'bloomSrc')) {
    put('bloomAmount', eff('bloomSrc'), 0.762 * eff('bloomAudio') * eff('bloomAmount'));
  }
  if (has('caAudio', 'caSrc')) {
    put('caAmount', eff('caSrc'), 2.5 * eff('caAudio') * eff('caAmount'));
  }
  if (has('vigBreathe')) {
    put('vigAmount', 'loud', 0.3 * eff('vigBreathe') * eff('vigAmount'));
  }
  return out;
}
