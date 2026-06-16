// Looks: each is a partial param override applied on top of defaults — a
// starting point; every value stays live-tunable. Authored on the CURRENT
// schema (R7-3 rebuild): modulation-matrix depth keys (`target~src`), the
// Master grade/sharpen/output, and the Generate devices. Most looks enable
// the master Sharpen + Output soft-clip so they ship crisp and clip-safe.

import { migrateLegacyParams } from './params.js';

// Shared master finish most looks opt into (crisp + highlight roll-off).
const FINISH = {
  sharpOn: true, sharpMix: 0.3, sharpRadius: 1,
  outputOn: true, outputMix: 0.6, outputCeiling: 0.85,
};

const RAW_PACKS = [
  {
    id: 'cinematic',
    name: 'Cinematic / Noir',
    overrides: {
      ...FINISH,
      temperature: -0.25, saturation: 0.82, vibrance: 0.2, contrast: 1.12,
      highlights: -0.12, fade: 0.12,
      fogOn: true, fogDensity: 0.5, fogWarmth: -0.3, fogSpeed: 0.25, 'fogDensity~low': 0.12,
      partOn: true, partType: 'dust', partDensity: 0.3, partSize: 0.3, partSpeed: 0.2,
      vigAmount: 0.55, grainAmount: 0.3,
      camZoom: 1.08, 'camZoom~low': 0.025, shake: 0.12,
      bloomAmount: 0.25, bloomThreshold: 0.7, caAmount: 0.08,
    },
  },
  {
    id: 'dreamy',
    name: 'Dreamy',
    overrides: {
      ...FINISH, sharpMix: 0.18,
      bloomAmount: 0.8, bloomThreshold: 0.45, 'bloomAmount~loud': 0.3,
      temperature: 0.3, saturation: 1.05, vibrance: 0.3, gamma: 1.08, fade: 0.2, caAmount: 0.2,
      fogOn: true, fogDensity: 0.35, fogWarmth: 0.5, fogSpeed: 0.2,
      partOn: true, partType: 'bokeh', partDensity: 0.45, partSize: 0.7, partSpeed: 0.15,
      leakOn: true, leakAmount: 0.45, leakSpeed: 0.2, leakHue: 28,
      driftAmount: 0.5, driftSpeed: 0.2,
      warpOn: true, warpAmount: 0.12, warpScale: 2, warpSpeed: 0.15,
      vigAmount: 0.3, grainAmount: 0.15,
    },
  },
  {
    id: 'psy-mellow',
    name: 'Psychedelic — Mellow trip',
    overrides: {
      ...FINISH,
      feedbackOn: true, fbTrail: 1.2, fbZoom: 0.08, fbRotate: 2, fbHue: 8, 'fbInject~onset': 0.35,
      hueOn: true, hueSpeed: 6, hueAmount: 0.5,
      warpOn: true, warpAmount: 0.3, warpScale: 3, warpSpeed: 0.3, 'warpAmount~mid': 0.12,
      plasmaOn: true, plasmaAmount: 0.15, plasmaScale: 2, plasmaSpeed: 0.25,
      bloomAmount: 0.5, bloomThreshold: 0.5,
      saturation: 1.25, vibrance: 0.3, caAmount: 0.25, vigAmount: 0.35, grainAmount: 0.2,
    },
  },
  {
    id: 'psy-full',
    name: 'Psychedelic — Full trip',
    overrides: {
      ...FINISH, outputMix: 0.8,
      feedbackOn: true, fbTrail: 2.2, fbZoom: 0.25, fbRotate: 10, fbHue: 25, 'fbInject~onset': 0.5,
      kaleidoOn: true, kaleidoSeg: 6, kaleidoSpin: 0.25, 'kaleidoKick~beat': 0.18,
      warpOn: true, warpAmount: 0.5, warpScale: 4, warpSpeed: 0.5, 'warpAmount~mid': 0.18,
      hueOn: true, hueSpeed: 18, hueAmount: 0.9, hueBeat: 0.3,
      plasmaOn: true, plasmaAmount: 0.35, plasmaScale: 2.5, plasmaSpeed: 0.5,
      saturation: 1.45, vibrance: 0.35, contrast: 1.1, caAmount: 0.4, 'caAmount~onset': 0.3,
      bloomAmount: 0.6, bloomThreshold: 0.5, grainAmount: 0.15, vigAmount: 0.3,
    },
  },
  {
    id: 'lofi-vhs',
    name: 'Lo-Fi Tape / VHS',
    overrides: {
      ...FINISH, sharpMix: 0.2,
      vhsOn: true, vhsScan: 0.45, vhsBleed: 0.6, vhsJitter: 0.5, vhsWobble: 0.5, 'vhsJitter~high': 0.4,
      grainAmount: 0.5, grainSize: 2.2, 'grainAmount~high': 0.15,
      temperature: 0.35, saturation: 0.85, fade: 0.3, gamma: 0.95, caAmount: 0.2,
      vigAmount: 0.5, driftAmount: 0.25, driftSpeed: 0.15,
      bloomAmount: 0.2, partOn: true, partType: 'dust', partDensity: 0.3,
    },
  },
  {
    id: 'ethereal',
    name: 'Ethereal / Ambient',
    overrides: {
      ...FINISH, sharpMix: 0.2,
      fogOn: true, fogDensity: 0.6, fogWarmth: -0.15, fogSpeed: 0.2, fogScale: 1.8,
      raysOn: true, raysAmount: 0.45, raysAngle: 15,
      partOn: true, partType: 'stars', partDensity: 0.5, partSize: 0.3, partSpeed: 0.1, 'partFlicker~high': 0.4,
      temperature: -0.3, saturation: 0.7, vibrance: 0.25, fade: 0.15,
      parallaxAmount: 0.5, driftSpeed: 0.15, driftAmount: 0.45,
      bloomAmount: 0.45, bloomThreshold: 0.55, vigAmount: 0.4,
    },
  },
  {
    id: 'rainy',
    name: 'Rainy Window',
    overrides: {
      ...FINISH,
      rainOn: true, rainAmount: 0.6, rainSpeed: 0.35, rainRefract: 0.7,
      fogOn: true, fogDensity: 0.3, fogWarmth: 0.4,
      leakOn: true, leakAmount: 0.3, leakHue: 35, leakSpeed: 0.15,
      bloomAmount: 0.45, bloomThreshold: 0.5,
      temperature: 0.2, saturation: 0.9, vibrance: 0.2, vigAmount: 0.45, grainAmount: 0.2,
      caAmount: 0.1, driftAmount: 0.15, driftSpeed: 0.1,
    },
  },
  {
    id: 'glitch-club',
    name: 'Glitch Club',
    overrides: {
      ...FINISH, outputMix: 0.7,
      glitchOn: true, glBlock: 0.45, glSlice: 0.4, glScale: 14, glRate: 0.6,
      'glBlock~onset': 0.4, 'glSlice~onset': 0.35,
      strobeOn: true, strAmount: 0.35, 'strFlash~beat': 0.5,
      zbOn: true, zbAmount: 0.1, 'zbAmount~onset': 0.2,
      vhsOn: true, vhsScan: 0.3, vhsBleed: 0.35, vhsJitter: 0.5,
      caAmount: 0.3, 'caAmount~onset': 0.35,
      contrast: 1.15, saturation: 1.2, vibrance: 0.35, fade: 0.05,
      bloomAmount: 0.4, bloomThreshold: 0.55, grainAmount: 0.2, vigAmount: 0.4,
    },
  },
  {
    id: 'shallow-focus',
    name: 'Shallow Focus',
    overrides: {
      ...FINISH, sharpMix: 0.4,
      dofOn: true, dofAmount: 0.75, dofFocus: 0.7, dofRange: 0.25, 'dofFocus~low': 0.12,
      bloomAmount: 0.5, bloomThreshold: 0.55,
      partOn: true, partType: 'bokeh', partDensity: 0.4, partSize: 0.6, partSpeed: 0.15,
      temperature: 0.15, vibrance: 0.25, fade: 0.12, vigAmount: 0.4,
      driftAmount: 0.4, driftSpeed: 0.2, parallaxAmount: 0.45,
      grainAmount: 0.18, caAmount: 0.1,
    },
  },
  {
    id: 'neon-fractal',
    name: 'Neon Fractal',
    overrides: {
      ...FINISH, outputMix: 0.75,
      fractalOn: true, fractalKind: 'kifs', fractalMix: 0.6, fractalPalette: 'neon', fractalBlend: 'screen',
      fractalSpeed: 0.3, fractalSize: 1.1, fractalDetail: 0.55, fractalDepthGate: 0.6, fractalInherit: 0.2,
      'fractalMix~low': 0.25,
      feedbackOn: true, fbTrail: 0.9, fbZoom: 0.06, fbHue: 12,
      hueOn: true, hueSpeed: 4, hueAmount: 0.35,
      saturation: 1.3, vibrance: 0.4, contrast: 1.08,
      bloomAmount: 0.6, bloomThreshold: 0.5, vigAmount: 0.35,
    },
  },
  {
    id: 'spectrum-pulse',
    name: 'Spectrum Pulse',
    overrides: {
      ...FINISH,
      spectrumOn: true, spectrumKind: 'bars', spectrumMix: 0.8, spectrumPalette: 'spectral', spectrumBlend: 'add',
      spectrumY: 0.22, spectrumSize: 0.85, spectrumDetail: 0.6,
      bloomAmount: 0.5, bloomThreshold: 0.5, 'bloomAmount~loud': 0.2,
      contrast: 1.1, saturation: 1.2, vibrance: 0.3, vigAmount: 0.35,
    },
  },
];

export const STYLE_PACKS = RAW_PACKS.map((p) => ({
  ...p,
  overrides: migrateLegacyParams(p.overrides),
}));

export function getPack(id) {
  return STYLE_PACKS.find((p) => p.id === id) || STYLE_PACKS[0];
}
