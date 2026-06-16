// GLSL ES 3.00 sources for the render pipeline.
//
// The same programs render the live preview and the exported frames — this is
// the "what you see is what you render" guarantee from the plan.
//
// Pipeline:  scene -> feedback (ping-pong) -> bright -> blur x4 -> post
//
// Conventions:
//  * vUv (0,0) is bottom-left; uploaded textures are Y-flipped so images are
//    upright in this space. Export vflips in ffmpeg.
//  * p = (vUv - 0.5) * vec2(aspect, 1) is the aspect-corrected frame space all
//    effects are authored in, so looks stay consistent across 16:9/9:16/1:1.
//  * uAudio = (low, mid, high, loudness), 0..1, smoothed/curved on the JS
//    side — used only for fixed texture-level accents. Modules with a
//    routable drive get a dedicated u<Module>Drive scalar instead, resolved
//    from the user-selected source (and its automation) on the CPU.

export const VERTEX_SRC = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const HEADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
`;

const NOISE = `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i),               hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + 17.13;
    a *= 0.5;
  }
  return v;
}
`;

const COLOR = `
vec3 hueRotate(vec3 c, float a) {
  const vec3 k = vec3(0.57735026919);
  float ca = cos(a), sa = sin(a);
  return c * ca + cross(k, c) * sa + k * dot(k, c) * (1.0 - ca);
}
vec3 hsv2rgb(vec3 c) {
  vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return c.z * mix(vec3(1.0), rgb, c.y);
}
`;

// ---------------------------------------------------------------- scene

export const SCENE_SRC = HEADER + NOISE + COLOR + `
uniform sampler2D uImage;
uniform sampler2D uDepth;
uniform float uTime;
uniform float uBeats;        // absolute fractional beat count (for generator beat-sync)
uniform float uOutAspect;
uniform vec2 uCenter;        // cover-fit crop center in image uv (clamped in JS)
uniform vec2 uRect;          // visible sub-rect size in image uv

// Audio reactivity arrives pre-baked in the params (CPU modulation matrix:
// features.applyModulation) — every uniform here is a pure param value.
uniform float uKaleidoOn, uKaleidoMix, uKaleidoSeg, uKaleidoSpin, uKaleidoKick;
uniform float uWarpOn, uWarpAmount, uWarpScale, uWarpSpeed;
uniform float uParallaxOn, uParallaxAmount;
// Canvas (R4-1 / R10-6): replace/tint the image with a flat colour or a
// vertical two-stop gradient — the blank canvas / base layer.
uniform float uCanvasOn, uCanvasMix, uCanvasMode;
uniform vec3 uCanvasColor, uCanvasColor2;

// --- Generate family (R4-P6): up to 6 generator layers as uniform arrays,
// so a single const-bounded loop renders all of them (D3D/ANGLE-safe). The
// active named generator devices are mapped onto these slots CPU-side.
#define GEN_N 6
uniform float uGenOn[GEN_N];
uniform float uGenMix[GEN_N];
uniform float uGenSpeed[GEN_N];
uniform float uGenX[GEN_N];
uniform float uGenY[GEN_N];
uniform float uGenSize[GEN_N];
uniform float uGenFeather[GEN_N];
uniform float uGenRotate[GEN_N];
uniform float uGenHue[GEN_N];
uniform float uGenDetail[GEN_N];
uniform float uGenBeatSync[GEN_N]; // R4-P7: 0 free clock, 1 steps on the beat grid
uniform int uGenType[GEN_N];   // 0 shapes 1 flow 2 spectrum 3 julia 4 kifs 5 tunnel 6 starfield 7 voronoi 8 waveform
uniform int uGenKind[GEN_N];   // sub-variant within the renderer (shape/flow/spectrum)
uniform int uGenBlend[GEN_N];  // 0 add, 1 screen, 2 over, 3 multiply, 4 displace
uniform int uGenPalette[GEN_N]; // 0 spectral, 1 neon, 2 fire, 3 mono
uniform int uGenMask[GEN_N];   // 0 full, 1 ellipse, 2 box, 3 band
// Integrate (R4-2b): emerge from the image instead of overlaying it.
uniform float uGenDepthGate[GEN_N]; // 1 = in front of everything (overlay)
uniform float uGenInherit[GEN_N];   // tint with the image's own colours
uniform int uGenEmerge[GEN_N];      // 0 off, 1 shadows, 2 highlights
uniform int uGenAnchor[GEN_N];      // 0 screen, 1 image (glued to the photo)
uniform float uBands[16];    // analysis v3 multiband envelopes, sampled at t

// Cosine palettes (IQ-style), hue-shiftable. u is the pattern's own 0..1
// colour coordinate.
vec3 genPalette(float u, int pal, float hueDeg) {
  vec3 c;
  if (pal == 0)      c = 0.5 + 0.5 * cos(6.2831853 * (u + vec3(0.0, 0.33, 0.67)));
  else if (pal == 1) c = 0.55 + 0.45 * cos(6.2831853 * (0.8 * u + vec3(0.55, 0.3, 0.1)));
  else if (pal == 2) c = clamp(vec3(1.45, 0.85, 0.45) * vec3(u, u * u, u * u * u), 0.0, 1.0);
  else               c = vec3(u);
  return hueRotate(c, hueDeg * 0.0174533);
}

// Region mask in local space q (region spans |q| <= 1). 1 inside, feathered
// to 0 at the edge; 'full' is unmasked.
float genMaskShape(vec2 q, int mask, float feather) {
  if (mask == 0) return 1.0;
  float d;
  if (mask == 1) d = length(q);
  else if (mask == 2) d = max(abs(q.x), abs(q.y));
  else d = abs(q.y);
  return 1.0 - smoothstep(max(1.0 - feather, 0.0), 1.0, d);
}

// Each generator returns vec2(paletteCoord, alpha) — pure in (q, t, detail,
// kind). kind selects a sub-variant of the renderer (R4-P6).
vec2 genShapes(vec2 q, float t, float detail, int kind) {
  float r = length(q);
  float a = atan(q.y, q.x);
  if (kind == 1) {                    // polygons: concentric n-gon outlines
    float sides = floor(3.0 + detail * 6.0);
    float seg = 6.2831853 / sides;
    float poly = cos(seg * 0.5) / max(cos(mod(a + t * 0.2, seg) - seg * 0.5), 0.05);
    float outline = smoothstep(0.04, 0.0, abs(r - poly * 0.62));
    return vec2(fract(t * 0.25), outline);
  }
  if (kind == 2) {                    // bars: vertical strips, count by detail
    float n = floor(3.0 + detail * 9.0);
    float bar = abs(fract(q.x * n + t * 0.1) - 0.5);
    float v = smoothstep(0.34, 0.16, bar) * smoothstep(1.0, 0.55, r);
    return vec2(fract(q.x * 0.5 + 0.5), v);
  }
  // kind 0 — rings: staggered expanding beat rings
  float v = 0.0;
  float u = 0.0;
  for (int i = 0; i < 3; i++) {
    float ph = fract(t * 0.5 + float(i) / 3.0);
    float w = smoothstep(0.06, 0.0, abs(r - ph * 1.25)) * (1.0 - ph);
    v += w;
    u += w * ph;
  }
  v = clamp(v, 0.0, 1.0);
  return vec2(v > 0.001 ? u / max(v, 0.2) : 0.0, v);
}

vec2 genFlow(vec2 q, float t, float detail, int kind) {
  float sc = 1.5 + detail * 4.0;
  vec2 w = vec2(fbm(q * sc + vec2(t * 0.32, 7.7)),
                fbm(q * sc + vec2(3.1, -t * 0.27)));
  float v = fbm(q * sc + (w - 0.5) * 2.4);
  if (kind == 1) {                    // marble: fold the field into veins
    v = abs(sin(v * 6.2831853 + length(q) * 3.0));
    return vec2(fract(v + t * 0.02), smoothstep(0.15, 0.7, v));
  }
  return vec2(fract(v * 1.6 + t * 0.02), smoothstep(0.3, 0.85, v));
}

vec2 genSpectrum(vec2 q, float detail, int kind) {
  if (kind == 1) {                    // radial analyser (ring of bins)
    float a = atan(q.y, q.x) / 6.2831853 + 0.5;
    int bi = int(clamp(a, 0.0, 0.999) * 16.0);
    float h = uBands[bi];
    float rr = length(q);
    float bar = step(0.18, rr) * step(rr, 0.18 + h * (0.4 + 0.5 * detail));
    return vec2(a, bar * (0.35 + 0.65 * h));
  }
  float x = clamp(q.x * 0.5 + 0.5, 0.0, 0.999);
  int bi = int(x * 16.0);
  float h = uBands[bi];
  float y = clamp(q.y * 0.5 + 0.5, 0.0, 1.0);
  float cell = fract(x * 16.0);
  float gap = smoothstep(0.0, 0.10, cell) * smoothstep(1.0, 0.90, cell);
  float bar = step(y, h * (0.25 + 0.75 * detail + 0.25)) * gap;
  return vec2(x, bar * (0.35 + 0.65 * h));
}

vec2 genJulia(vec2 q, float t, float detail) {
  float ca = t * 0.11;
  vec2 c = vec2(-0.745 + 0.11 * cos(ca), 0.186 + 0.09 * sin(ca * 1.31));
  vec2 z = q * (1.7 - detail * 1.0);
  float m = 0.0;
  for (int i = 0; i < 64; i++) {
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    if (dot(z, z) > 16.0) break;
    m += 1.0;
  }
  if (m >= 63.5) return vec2(0.0, 0.0);  // inside the set: transparent
  float u = (m - log2(max(log2(max(dot(z, z), 1.01)), 1.0))) / 64.0;
  u = clamp(u, 0.0, 1.0);
  return vec2(fract(u * 3.0 + t * 0.015), smoothstep(0.02, 0.3, u));
}

vec2 genKifs(vec2 q, float t, float detail) {
  vec2 z = q;
  float ang = 0.7 + t * 0.13;
  float caK = cos(ang), saK = sin(ang);
  mat2 R = mat2(caK, -saK, saK, caK);
  float sc = 1.28 + detail * 0.45;
  float d = 1e9;
  float fold = 0.0;
  for (int i = 0; i < 9; i++) {
    z = abs(z) - vec2(0.92, 0.58);
    z = R * z * sc;
    float ring = abs(length(z) - 0.34);
    if (ring < d) { d = ring; fold = float(i); }
  }
  float v = exp(-3.0 * d);
  return vec2(fract(fold / 9.0 + length(q) * 0.4 + t * 0.02),
              smoothstep(0.12, 0.85, v));
}

// R4-P7 generators ---------------------------------------------------------

// Receding tunnel: 1/r maps screen distance to depth, so concentric stripes
// rush toward the centre. kind picks the cross-section metric.
vec2 genTunnel(vec2 q, float t, float detail, int kind) {
  float m;
  if (kind == 1) m = max(abs(q.x), abs(q.y));                 // square
  else if (kind == 2) {                                       // hex
    vec2 aq = abs(q);
    m = max(aq.x * 0.8660254 + aq.y * 0.5, aq.y);
  } else m = length(q);                                       // round
  float depth = 0.32 / (m + 0.07) + t * 0.6;
  float ring = abs(fract(depth * (2.0 + detail * 6.0)) - 0.5);
  float v = smoothstep(0.5, 0.4, ring) * smoothstep(0.02, 0.14, m);
  return vec2(fract(depth * 0.15), v);
}

// Starfield: hashed points per grid cell. kind 1 evaluates in (angle,
// log-radius) space so the dots smear into radial warp-speed streaks.
vec2 genStarfield(vec2 q, float t, float detail, int kind) {
  float dens = 0.9 - detail * 0.12;
  float n = 5.0 + detail * 13.0;
  vec2 p;
  if (kind == 1) {                                            // warp streaks
    float a = atan(q.y, q.x);
    float r = length(q);
    p = vec2(a * 1.2, log(r + 0.04) * 2.2 - t);
  } else {                                                    // drifting stars
    p = q * 2.0 + vec2(t * 0.05, t * 0.12);
  }
  vec2 cell = floor(p * n);
  vec2 f = fract(p * n);
  float rnd = hash12(cell);
  if (rnd < dens) return vec2(0.0);
  vec2 pos = 0.25 + 0.5 * hash22(cell);
  float d = length(f - pos);
  float twinkle = 0.5 + 0.5 * sin(t * 3.0 + rnd * 40.0);
  float star = smoothstep(0.16, 0.0, d) * (0.4 + 0.6 * twinkle);
  if (kind == 1) star *= smoothstep(0.0, 0.15, length(q));    // hollow centre
  return vec2(fract(rnd * 3.1), star);
}

// Voronoi (F1/F2) over a 3x3 neighbourhood with animated feature points.
vec2 genVoronoi(vec2 q, float t, float detail, int kind) {
  vec2 p = q * (2.0 + detail * 5.0);
  vec2 ip = floor(p);
  vec2 fp = fract(p);
  float d1 = 9.0, d2 = 9.0, id = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = 0.5 + 0.45 * sin(t + 6.2831853 * hash22(ip + g));
      float d = length(g + o - fp);
      if (d < d1) { d2 = d1; d1 = d; id = hash12(ip + g); }
      else if (d < d2) { d2 = d; }
    }
  }
  float border = d2 - d1;
  if (kind == 1) return vec2(id, smoothstep(0.10, 0.0, border));               // edges
  if (kind == 2) return vec2(fract(id + 0.5), smoothstep(0.05, 0.0, border));  // cracks
  return vec2(id, smoothstep(1.1, 0.1, d1));                                   // filled cells
}

// Oscilloscope: the 16-band analyser as a trace across x. kind 2 is a true
// Lissajous curve sampled along a const loop (distance-to-curve).
vec2 genWaveform(vec2 q, float t, float detail, int kind) {
  if (kind == 2) {                                            // lissajous
    float fa = 2.0 + floor(detail * 4.0);
    float fb = 3.0 + floor(detail * 3.0);
    float d = 9.0;
    for (int i = 0; i < 48; i++) {
      float tt = float(i) / 48.0 * 6.2831853;
      vec2 cp = vec2(sin(tt * fa + t), sin(tt * fb + t * 0.7)) * 0.72;
      d = min(d, length(q - cp));
    }
    return vec2(fract(t * 0.1 + d), smoothstep(0.06, 0.0, d));
  }
  float x = clamp(q.x * 0.5 + 0.5, 0.0, 0.999);
  int bi = int(x * 16.0);
  float amp = (uBands[bi] - 0.5) * (0.7 + detail * 0.9);      // centred trace
  float line = smoothstep(0.05, 0.0, abs(q.y - amp));
  float v = (kind == 1) ? max(line, step(q.y, amp)) : line;   // filled below
  return vec2(fract(x + t * 0.05), v);
}

// Pattern field for instance gi at fragment uv → vec2(paletteCoord,
// alpha·mask·depthGate). Anchor 1 evaluates in image space (the region is
// glued to the photo, so it travels with drift/parallax); the depth gate
// hides the layer behind image content nearer than its plane.
vec2 genField(int gi, vec2 uv) {
  vec2 duv = uCenter + (uv - 0.5) * uRect;
  vec2 q;
  if (uGenAnchor[gi] == 1) {
    float imgAspect = uOutAspect * uRect.y / max(uRect.x, 1e-6);
    q = (duv - vec2(uGenX[gi], uGenY[gi])) * vec2(imgAspect, 1.0);
  } else {
    q = (uv - 0.5) * vec2(uOutAspect, 1.0)
      - (vec2(uGenX[gi], uGenY[gi]) - 0.5) * vec2(uOutAspect, 1.0);
  }
  float gra = uGenRotate[gi] * 0.0174533;
  float gca = cos(gra), gsa = sin(gra);
  q = mat2(gca, -gsa, gsa, gca) * (q / max(uGenSize[gi], 0.05));
  float m = genMaskShape(q, uGenMask[gi], uGenFeather[gi]);
  if (uGenDepthGate[gi] < 0.999) { // gate disabled at 1: overlay, bit-exact
    float near = texture(uDepth, duv).r;
    m *= 1.0 - smoothstep(uGenDepthGate[gi], uGenDepthGate[gi] + 0.08, near);
  }
  if (m < 0.001) return vec2(0.0);
  // R4-P7 beat-sync: crossfade the pattern clock from continuous (uTime) to a
  // beat-quantised one that steps once per beat. floor(uBeats) holds between
  // beats, so motion snaps to the grid. uGenBeatSync 0 = bit-exact free clock.
  float spd = 0.1 + uGenSpeed[gi] * 1.6;
  float gt = mix(uTime * spd,
                 floor(uBeats) * (0.25 + uGenSpeed[gi] * 0.75),
                 clamp(uGenBeatSync[gi], 0.0, 1.0));
  vec2 ga;
  int kind = uGenKind[gi];
  if (uGenType[gi] == 0)      ga = genShapes(q, gt, uGenDetail[gi], kind);
  else if (uGenType[gi] == 1) ga = genFlow(q, gt, uGenDetail[gi], kind);
  else if (uGenType[gi] == 2) ga = genSpectrum(q, uGenDetail[gi], kind);
  else if (uGenType[gi] == 3) ga = genJulia(q, gt, uGenDetail[gi]);
  else if (uGenType[gi] == 4) ga = genKifs(q, gt, uGenDetail[gi]);
  else if (uGenType[gi] == 5) ga = genTunnel(q, gt, uGenDetail[gi], kind);
  else if (uGenType[gi] == 6) ga = genStarfield(q, gt, uGenDetail[gi], kind);
  else if (uGenType[gi] == 7) ga = genVoronoi(q, gt, uGenDetail[gi], kind);
  else                        ga = genWaveform(q, gt, uGenDetail[gi], kind);
  return vec2(ga.x, clamp(ga.y, 0.0, 1.0) * m);
}

// Warp + parallax + image fetch for one source uv. Factored out so the
// kaleidoscope Intensity can crossfade between the folded and unfolded image
// (a UV remap has no zero point, so intensity must mix colors).
vec3 sampleScene(vec2 uv) {
  vec2 imgUv = uCenter + (uv - 0.5) * uRect;

  if (uWarpOn > 0.5) {
    float amt = pow(uWarpAmount, 1.5) * 0.09;
    vec2 wp = imgUv * uWarpScale * 6.0;
    float tt = uTime * (0.1 + uWarpSpeed * 0.55);
    vec2 w = vec2(fbm(wp + vec2(tt, tt * 0.7)),
                  fbm(wp + vec2(31.7 - tt * 0.8, 11.3 + tt * 0.6))) - 0.5;
    imgUv += w * amt;
  }

  if (uParallaxOn > 0.5) {
    float near = texture(uDepth, imgUv).r;          // 1 = near
    vec2 pv = vec2(sin(uTime * 0.21), cos(uTime * 0.16)) * 0.6;
    imgUv += pv * (near - 0.5) * uParallaxAmount * 0.03 * uRect;
  }

  vec3 src = texture(uImage, imgUv).rgb;
  // Crossfade toward the canvas colour / gradient (mix 0 = image, bit-exact).
  if (uCanvasOn > 0.5 && uCanvasMix > 0.001) {
    vec3 fill = uCanvasMode > 0.5
      ? mix(uCanvasColor, uCanvasColor2, clamp(uv.y, 0.0, 1.0))  // bottom→top
      : uCanvasColor;
    src = mix(src, fill, clamp(uCanvasMix, 0.0, 1.0));
  }
  return src;
}

void main() {
  // Displace-blend generators warp the sampling uv — the image itself
  // ripples in the pattern's shape ("from within", not an overlay).
  // Evaluated first, before the kaleido fold (the fold sees the warped
  // image, so reflections stay coherent).
  vec2 sUv = vUv;
  for (int gi = 0; gi < GEN_N; gi++) {
    if (uGenOn[gi] < 0.5 || uGenBlend[gi] != 4 || uGenMix[gi] < 0.001) continue;
    vec2 gd = genField(gi, vUv);
    if (gd.y < 0.001) continue;
    float da = gd.x * 6.2831853;
    sUv += vec2(cos(da), sin(da)) * gd.y * clamp(uGenMix[gi], 0.0, 1.0) * 0.025;
  }

  vec3 col;
  if (uKaleidoOn > 0.5) {
    vec2 p = (sUv - 0.5) * vec2(uOutAspect, 1.0);
    float ang = uTime * uKaleidoSpin * 1.5 + uKaleidoKick;
    float ca = cos(ang), sa = sin(ang);
    p = mat2(ca, -sa, sa, ca) * p;
    float seg = 6.2831853 / max(uKaleidoSeg, 2.0);
    float a = atan(p.y, p.x);
    float r = length(p);
    a = mod(a, seg);
    a = abs(a - seg * 0.5);
    p = r * vec2(cos(a), sin(a));
    vec2 uvK = p / vec2(uOutAspect, 1.0) + 0.5;
    if (uKaleidoMix >= 0.999) {
      col = sampleScene(uvK);
    } else {
      col = mix(sampleScene(sUv), sampleScene(uvK), clamp(uKaleidoMix, 0.0, 1.0));
    }
  } else {
    col = sampleScene(sUv);
  }

  // --- Generate colour layers (after the fold, before feedback — they
  // feed trails, bloom, DOF and grading like image content). Mix 0 or
  // an off toggle skips the layer entirely: bit-exact absence.
  for (int gi = 0; gi < GEN_N; gi++) {
    if (uGenOn[gi] < 0.5 || uGenMix[gi] < 0.001 || uGenBlend[gi] == 4) continue;
    vec2 ga = genField(gi, vUv);
    if (ga.y < 0.001) continue;
    vec3 gcol = genPalette(ga.x, uGenPalette[gi], uGenHue[gi]);
    if (uGenInherit[gi] > 0.001) {
      // tint with the image's own colour, shaped by the pattern's luma
      float gl = dot(gcol, vec3(0.299, 0.587, 0.114));
      gcol = mix(gcol, col * (0.35 + 1.3 * gl), clamp(uGenInherit[gi], 0.0, 1.0));
    }
    float w = clamp(uGenMix[gi], 0.0, 1.0) * ga.y;
    if (uGenEmerge[gi] == 1) {
      w *= 1.0 - smoothstep(0.25, 0.65, dot(col, vec3(0.299, 0.587, 0.114)));
    } else if (uGenEmerge[gi] == 2) {
      w *= smoothstep(0.2, 0.6, dot(col, vec3(0.299, 0.587, 0.114)));
    }
    if (uGenBlend[gi] == 0)      col += gcol * w;
    else if (uGenBlend[gi] == 1) col = 1.0 - (1.0 - clamp(col, 0.0, 1.0)) * (1.0 - gcol * w);
    else if (uGenBlend[gi] == 2) col = mix(col, gcol, w);
    else                         col *= mix(vec3(1.0), gcol, w);
  }

  outColor = vec4(col, 1.0);
}
`;

// -------------------------------------------------------------- feedback

export const FEEDBACK_SRC = HEADER + COLOR + `
uniform sampler2D uScene;
uniform sampler2D uPrev;
uniform float uOn;
uniform float uDt;
uniform float uOutAspect;
uniform float uFbTrail;      // seconds for a trail to fade to 5%
uniform float uFbZoom;       // outward zoom per second
uniform float uFbRotate;     // degrees per second
uniform float uFbHue;        // degrees per second of trail hue drift
uniform float uFbInject;     // injection boost (base-0 param, audio-modulated)
uniform float uFbMix;        // Intensity: wet/dry on the displayed result

void main() {
  vec3 scene = texture(uScene, vUv).rgb;
  if (uOn < 0.5) {
    outColor = vec4(scene, 1.0);
    return;
  }
  vec2 p = (vUv - 0.5) * vec2(uOutAspect, 1.0);
  float ang = -uFbRotate * 0.0174533 * uDt;
  float zm = exp(-uFbZoom * uDt);
  float ca = cos(ang), sa = sin(ang);
  p = mat2(ca, -sa, sa, ca) * p * zm;
  vec2 puv = p / vec2(uOutAspect, 1.0) + 0.5;
  vec3 prev = hueRotate(texture(uPrev, puv).rgb, uFbHue * 0.0174533 * uDt);
  float keep = pow(0.05, uDt / max(uFbTrail, 0.05));
  float inject = 1.0 + uFbInject;
  vec3 full = max(scene * inject, prev * keep);
  // The mixed value re-feeds the trail buffer, so trails also die out faster
  // at low intensity — intended (and keeps the buffer = displayed result).
  outColor = vec4(mix(scene, full, clamp(uFbMix, 0.0, 1.0)), 1.0);
}
`;

// ------------------------------------------------------- bloom + utility

export const COPY_SRC = HEADER + `
uniform sampler2D uTex;
void main() { outColor = vec4(texture(uTex, vUv).rgb, 1.0); }
`;

export const BRIGHT_SRC = HEADER + `
uniform sampler2D uTex;
uniform float uThreshold;
void main() {
  vec3 c = texture(uTex, vUv).rgb;
  vec3 b = max(c - uThreshold, 0.0) / max(1.0 - uThreshold, 0.05);
  outColor = vec4(b, 1.0);
}
`;

export const BLUR_SRC = HEADER + `
uniform sampler2D uTex;
uniform vec2 uDir;           // texel step * radius, along one axis
void main() {
  vec3 c = texture(uTex, vUv).rgb * 0.2270270;
  c += (texture(uTex, vUv + uDir * 1.3846154).rgb +
        texture(uTex, vUv - uDir * 1.3846154).rgb) * 0.3162162;
  c += (texture(uTex, vUv + uDir * 3.2307692).rgb +
        texture(uTex, vUv - uDir * 3.2307692).rgb) * 0.0702703;
  outColor = vec4(c, 1.0);
}
`;

// ------------------------------------------------------------------ post

const PARTICLES = `
vec3 particleColor(float type) {
  if (type < 0.5) return vec3(0.75, 0.72, 0.65);   // dust
  if (type < 1.5) return vec3(0.85, 0.92, 1.00);   // snow
  if (type < 2.5) return vec3(1.00, 0.55, 0.22);   // embers
  if (type < 3.5) return vec3(1.00, 0.85, 0.60);   // bokeh
  return vec3(0.90, 0.95, 1.00);                   // stars
}

vec3 particleLayer(vec2 p, float t, float n, float type,
                   float dens, float size, float speed, float seed) {
  vec2 q = p;
  if (type < 0.5) {
    q += vec2(t * speed * 0.025, sin(t * 0.21 + seed) * 0.03);
  } else if (type < 1.5) {
    q += vec2(sin(t * 0.4 + seed) * 0.04, t * speed * 0.12);
  } else if (type < 2.5) {
    q += vec2(sin(t * 0.6 + seed + p.y * 2.0) * 0.03, -t * speed * 0.09);
  } else if (type < 3.5) {
    q += vec2(t * speed * 0.018, t * speed * 0.011);
  } else {
    q += vec2(t * 0.0015, 0.0);
  }
  if (dens <= 0.001) return vec3(0.0);  // Mix 0 == absent, bit-exact
  vec2 cell = floor(q * n);
  vec2 f = fract(q * n);
  if (hash12(cell + seed + 7.31) > dens * 0.85 + 0.05) return vec3(0.0);
  vec2 rnd = hash22(cell + seed);
  vec2 pos = 0.2 + 0.6 * rnd;
  bool bokeh = (type >= 2.5 && type < 3.5);
  float rad = bokeh ? (0.12 + 0.30 * size) : (0.03 + 0.16 * size);
  float d = length(f - pos);
  float b;
  if (bokeh) {
    b = smoothstep(rad, rad * 0.82, d) * (0.4 + 0.6 * smoothstep(rad * 0.45, rad * 0.8, d));
  } else {
    b = smoothstep(rad, rad * 0.25, d);
  }
  float tw = 0.55 + 0.45 * sin(t * (1.0 + rnd.x * 3.0) + rnd.y * 6.2831);
  return particleColor(type) * b * tw * 0.5;
}
`;

const RAIN = `
void rainField(vec2 p, float t, float amount, float speed,
               out vec2 off, out float shade) {
  off = vec2(0.0);
  shade = 0.0;
  if (amount <= 0.001) return;          // Mix 0 == absent, bit-exact
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float n = 14.0 + fi * 9.0;
    vec2 q = p * vec2(1.0, 0.55);          // stretch cells vertically
    q.x += fi * 0.37;
    vec2 cell = floor(q * n);
    vec2 f = fract(q * n);
    vec2 rnd = hash22(cell + fi * 13.7);
    if (rnd.x > amount * 0.8 + 0.1) continue;
    float fall = fract(rnd.y - t * (0.04 + speed * 0.12) * (0.5 + rnd.x));
    vec2 pos = vec2(0.25 + 0.5 * rnd.x, 0.1 + 0.8 * fall);
    vec2 d = f - pos;
    d.y *= 0.7;
    float dist = length(d);
    float rad = 0.08 + 0.10 * rnd.y;
    float m = smoothstep(rad, rad * 0.5, dist);
    off += -(d / max(rad, 1e-4)) * m * 0.05;
    shade += m * 0.5;
  }
  shade = clamp(shade, 0.0, 1.0);
}
`;

export const POST_SRC = HEADER + NOISE + COLOR + PARTICLES + RAIN + `
uniform sampler2D uBase;
uniform sampler2D uBloom;
uniform sampler2D uDepth;
uniform sampler2D uDofBlur;  // whole-image blur (rendered only when DOF on)
uniform float uTime;
uniform float uOutAspect;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform vec2 uRect;
uniform float uBeats;        // absolute beat count, for stepped hue jumps

// Audio reactivity arrives pre-baked in the params (CPU modulation matrix) —
// every uniform below is a pure param value. Old audio baselines are folded
// into the constants at each use site.
uniform float uLensOn, uLensFish, uLensTwirl;
uniform float uRippleOn, uRipAmount, uRipWidth, uRipSpeed;
uniform float uGlitchOn, uGlBlock, uGlSlice, uGlStreak, uGlScale, uGlRate;
uniform float uZbOn, uZbAmount;
uniform float uDofOn, uDofAmount, uDofFocus, uDofRange;
uniform float uPixelOn, uPxAmount, uPxPosterize, uPxDither;
uniform float uHtOn, uHtMix, uHtScale, uHtAngle;
uniform float uEdgeOn, uEdgeMix, uEdgeHue;
uniform float uStrobeOn, uStrAmount, uStrFlash;
uniform float uVhsOn, uVhsScan, uVhsBleed, uVhsJitter, uVhsWobble;
uniform float uRainOn, uRainAmount, uRainSpeed, uRainRefract;
uniform float uCaAmount;
uniform float uFogOn, uFogDensity, uFogSpeed, uFogScale, uFogWarmth;
uniform float uRaysOn, uRaysAmount, uRaysAngle;
uniform float uPlasmaOn, uPlasmaAmount, uPlasmaScale, uPlasmaSpeed;
uniform float uPartOn, uPartType, uPartDensity, uPartSize, uPartSpeed, uPartFlicker;
uniform float uLeakOn, uLeakAmount, uLeakSpeed, uLeakHue;
uniform float uBloomOn, uBloomAmount;
uniform float uExposure, uContrast, uSaturation, uTemperature, uTint, uGamma, uFade;
uniform float uVibrance, uHighlights, uShadows;          // R7-1 grade extensions
uniform float uSharpOn, uSharpMix, uSharpRadius;          // R7-1 sharpen (master)
uniform float uOutputOn, uOutputMix, uOutputCeiling;      // R7-1 output soft-clip
uniform float uWashOn, uWashMix, uWashShadowHue, uWashHighHue, uWashBalance; // R8-5
uniform float uClarityOn, uClarityMix, uClarityRadius;    // R8-5 local contrast
uniform float uHueOn, uHueSpeed, uHueAmount, uHueBeat;
uniform float uDuoOn, uDuoAmount, uDuoHueA, uDuoHueB;
uniform float uVigAmount, uVigSize, uVigSoft;
uniform float uGrainAmount, uGrainSize;

void main() {
  vec2 uv = vUv;
  vec2 p = (vUv - 0.5) * vec2(uOutAspect, 1.0);

  // --- lens: fisheye / twirl (pre-sample uv op)
  if (uLensOn > 0.5) {
    vec2 q = p;
    float r = length(q);
    q *= 1.0 + uLensFish * 0.35 * (r * r - 0.5);
    float tw = uLensTwirl * 2.2 * exp(-r * 1.4);
    float ct = cos(tw), st = sin(tw);
    q = mat2(ct, -st, st, ct) * q;
    uv = q / vec2(uOutAspect, 1.0) + 0.5;
    p = q;
  }

  // --- ripple: ring expanding once per beat from the centre (tempo-locked)
  if (uRippleOn > 0.5) {
    float phase = uBeats > 0.0 ? fract(uBeats) : fract(uTime);
    float radius = phase * (0.4 + uRipSpeed * 1.1);
    float r = length(p);
    float band = (r - radius) / max(uRipWidth * 0.35, 1e-3);
    float g = exp(-band * band) * (1.0 - phase);
    uv += normalize(p + vec2(1e-5)) * g * uRipAmount * 0.05;
  }

  // --- glitch: block displacement, slice shuffle, streak columns
  if (uGlitchOn > 0.5) {
    float seed = floor(uTime * (2.0 + uGlRate * 16.0));
    if (uGlBlock > 0.001) {
      vec2 cell = floor(uv * (3.0 + uGlScale));
      vec2 rnd = hash22(cell * 0.731 + seed);
      if (rnd.x < uGlBlock * 0.35) uv += (rnd - 0.5) * 0.1 * uGlBlock;
    }
    if (uGlSlice > 0.001) {
      float row = floor(uv.y * (14.0 + uGlScale * 2.0));
      float r = hash12(vec2(row, seed));
      if (r < uGlSlice * 0.4) {
        uv.x += (hash12(vec2(row, seed + 31.7)) - 0.5) * 0.3 * uGlSlice;
      }
    }
    if (uGlStreak > 0.001) {
      // pixel-sort-style vertical smear in random columns
      float colId = floor(uv.x * 110.0);
      float r = hash12(vec2(colId, seed * 0.37 + 11.0));
      if (r < uGlStreak * 0.3) {
        float anchor = hash12(vec2(colId, seed + 7.7));
        uv.y = mix(uv.y, anchor, 0.45 + 0.5 * hash12(vec2(colId, seed + 3.1)));
      }
    }
  }

  // --- pixelate (uv quantization; posterize/dither happen post-grade)
  if (uPixelOn > 0.5 && uPxAmount > 0.001) {
    float cells = mix(220.0, 24.0, uPxAmount);
    vec2 grid = vec2(cells * uOutAspect, cells);
    uv = (floor(uv * grid) + 0.5) / grid;
  }

  // --- VHS uv distortions (before sampling)
  if (uVhsOn > 0.5) {
    float line = floor(vUv.y * uRes.y);
    float jit = hash12(vec2(line, floor(uTime * 47.0))) - 0.5;
    uv.x += jit * uVhsJitter * 0.0014;
    uv.x += sin(vUv.y * 9.0 + uTime * 0.9) * uVhsWobble * 0.0025;
    uv.y += sin(uTime * 0.31) * uVhsWobble * 0.0008;
  }

  // --- rain droplet refraction (before sampling)
  float rainShade = 0.0;
  if (uRainOn > 0.5) {
    vec2 roff;
    float shade;
    rainField(p, uTime, uRainAmount, uRainSpeed, roff, shade);
    uv += roff * uRainRefract;
    rainShade = shade;
  }

  // --- base sample with chromatic aberration (modulate uCaAmount for kicks)
  float ca = uCaAmount * 0.006;
  vec2 cd = p * ca;
  vec3 col;
  if (uZbOn > 0.5 && uZbAmount > 0.001) {
    // zoom/radial blur: 8 taps toward the centre (modulate uZbAmount on hits)
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      vec2 suv = mix(uv, vec2(0.5), float(i) / 8.0 * uZbAmount * 0.12);
      acc.r += texture(uBase, suv + cd).r;
      acc.g += texture(uBase, suv).g;
      acc.b += texture(uBase, suv - cd).b;
    }
    col = acc / 8.0;
  } else {
    col.r = texture(uBase, uv + cd).r;
    col.g = texture(uBase, uv).g;
    col.b = texture(uBase, uv - cd).b;
  }

  // --- depth of field: blend toward the blurred copy outside the focus band
  if (uDofOn > 0.5) {
    vec2 dofDuv = uCenter + (vUv - 0.5) * uRect;
    float dofNear = texture(uDepth, dofDuv).r; // 1 = near
    float oof = clamp((abs(dofNear - uDofFocus) - uDofRange * 0.5)
                      / max(uDofRange * 0.5, 0.02), 0.0, 1.0);
    col = mix(col, texture(uDofBlur, uv).rgb, oof * uDofAmount);
  }

  // --- VHS chroma bleed
  if (uVhsOn > 0.5 && uVhsBleed > 0.001) {
    vec2 dx = vec2(3.0 / uRes.x, 0.0);
    vec3 side = (texture(uBase, uv - dx).rgb + texture(uBase, uv + dx).rgb) * 0.5;
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 chroma = side - dot(side, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(lum) + chroma * 1.2, uVhsBleed * 0.7);
  }

  // --- bloom
  if (uBloomOn > 0.5) {
    vec3 bl = texture(uBloom, vUv).rgb;
    col += bl * uBloomAmount * 0.7;
  }

  // --- volumetric-ish fog (depth-aware: thicker far away)
  if (uFogOn > 0.5) {
    vec2 duv = uCenter + (vUv - 0.5) * uRect;
    float near = texture(uDepth, duv).r;
    float drift = uTime * (0.02 + uFogSpeed * 0.12);
    float f = fbm(p * uFogScale + vec2(drift, drift * 0.3)) * 0.65
            + fbm(p * uFogScale * 2.3 - vec2(drift * 1.6, drift * 0.5) + 7.7) * 0.35;
    float density = uFogDensity * (0.34 + 0.41 * (1.0 - near));
    float fogAmt = clamp(density * smoothstep(0.3, 0.85, f) * 1.4, 0.0, 0.85);
    vec3 fogCol = mix(vec3(0.52, 0.58, 0.68), vec3(0.78, 0.66, 0.52),
                      uFogWarmth * 0.5 + 0.5);
    col = mix(col, fogCol * 0.62, fogAmt);
  }

  // --- god rays (cheap directional shafts, stronger toward the top)
  if (uRaysOn > 0.5) {
    float ra = uRaysAngle * 0.0174533;
    float x = p.x * cos(ra) - (vUv.y - 1.0) * sin(ra);
    float shaft = smoothstep(0.45, 0.85, fbm(vec2(x * 5.0 - uTime * 0.07, 0.37)));
    float w = mix(0.15, 1.0, pow(clamp(vUv.y, 0.0, 1.0), 1.8));
    col += vec3(1.0, 0.95, 0.85) * shaft * w * uRaysAmount * 0.21;
  }

  // --- plasma interference
  if (uPlasmaOn > 0.5) {
    float s = uPlasmaScale * 3.0;
    float tt = uTime * (0.2 + uPlasmaSpeed * 1.4);
    float v = sin(p.x * s + tt) + sin(p.y * s * 1.3 - tt * 1.2)
            + sin((p.x + p.y) * s * 0.7 + tt * 0.8)
            + sin(length(p) * s * 1.6 - tt * 1.1);
    vec3 pc = hsv2rgb(vec3(fract(v * 0.075 + uTime * 0.02), 0.65, 1.0));
    col += pc * uPlasmaAmount * 0.165;
  }

  // --- particles, three parallax layers (fully procedural in t: deterministic)
  if (uPartOn > 0.5) {
    vec3 acc = particleLayer(p, uTime,  7.0, uPartType, uPartDensity,        uPartSize,        uPartSpeed,        0.0)
             + particleLayer(p, uTime, 11.0, uPartType, uPartDensity * 0.8, uPartSize * 0.75, uPartSpeed * 1.35, 19.7)
             + particleLayer(p, uTime, 17.0, uPartType, uPartDensity * 0.6, uPartSize * 0.55, uPartSpeed * 1.8,  41.3);
    col += acc * (0.8 + uPartFlicker);
  }

  // --- light leaks
  if (uLeakOn > 0.5) {
    float lt = uTime * (0.05 + uLeakSpeed * 0.18);
    vec2 c1 = vec2(sin(lt * 1.3 + 1.0) * 0.7, cos(lt * 0.9) * 0.45);
    vec2 c2 = vec2(cos(lt * 0.7 + 3.1) * 0.8, sin(lt * 1.1 + 0.6) * 0.5);
    float g1 = exp(-2.6 * dot(p - c1, p - c1));
    float g2 = exp(-3.4 * dot(p - c2, p - c2));
    vec3 lc1 = hsv2rgb(vec3(fract(uLeakHue / 360.0), 0.6, 1.0));
    vec3 lc2 = hsv2rgb(vec3(fract(uLeakHue / 360.0 + 0.12), 0.5, 1.0));
    col += (lc1 * g1 + lc2 * g2 * 0.7) * uLeakAmount * 0.21;
  }

  // --- rain droplet rim shading
  col *= 1.0 - rainShade * 0.25;

  // --- halftone (rotated dot screen sized by luminance)
  if (uHtOn > 0.5) {
    float ra = uHtAngle * 0.0174533;
    mat2 rot = mat2(cos(ra), -sin(ra), sin(ra), cos(ra));
    vec2 hp = rot * p * (40.0 + uHtScale * 160.0);
    float hl = dot(col, vec3(0.2126, 0.7152, 0.0722));
    float dotR = sqrt(clamp(hl, 0.0, 1.0)) * 0.7;
    float d = length(fract(hp) - 0.5);
    float ink = smoothstep(dotR, dotR - 0.12, d);
    vec3 ht = ink * mix(vec3(1.0), col / max(hl, 1e-3), 0.35);
    col = mix(col, ht, clamp(uHtMix, 0.0, 1.0));
  }

  // --- neon edge (sobel outline in a chosen hue)
  if (uEdgeOn > 0.5) {
    vec2 e = 1.5 / uRes;
    float gx = dot(texture(uBase, uv + vec2(e.x, 0.0)).rgb
                 - texture(uBase, uv - vec2(e.x, 0.0)).rgb, vec3(0.333));
    float gy = dot(texture(uBase, uv + vec2(0.0, e.y)).rgb
                 - texture(uBase, uv - vec2(0.0, e.y)).rgb, vec3(0.333));
    float mag = clamp(length(vec2(gx, gy)) * 4.0, 0.0, 1.0);
    vec3 neon = hsv2rgb(vec3(fract(uEdgeHue / 360.0), 0.9, 1.0)) * mag;
    col = mix(col, neon + col * 0.15, clamp(uEdgeMix, 0.0, 1.0) * 0.9);
  }

  // --- grade
  col *= exp2(uExposure);
  col = (col - 0.5) * uContrast + 0.5;
  col *= vec3(1.0 + 0.14 * uTemperature, 1.0 - 0.06 * uTint, 1.0 - 0.14 * uTemperature);
  col = max(col, 0.0);
  col = pow(col, vec3(1.0 / max(uGamma, 0.2)));
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, uSaturation);
  // R7-1 highlights / shadows: luma-masked gain (neutral at 0).
  float gl = dot(max(col, 0.0), vec3(0.2126, 0.7152, 0.0722));
  col *= 1.0 + uHighlights * 0.6 * smoothstep(0.5, 1.0, gl);
  col *= 1.0 + uShadows * 0.6 * smoothstep(0.5, 0.0, gl);
  // R7-1 vibrance: boost muted colours more than already-vivid ones.
  float mxc = max(max(col.r, col.g), col.b);
  float mnc = min(min(col.r, col.g), col.b);
  float vL = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(vL), col, 1.0 + uVibrance * (1.0 - (mxc - mnc)));
  col = col * (1.0 - uFade * 0.22) + uFade * 0.055;

  // --- R8-5 Colour wash: expressive split-tone (shadows vs highlights).
  if (uWashOn > 0.5 && uWashMix > 0.001) {
    float wl = dot(clamp(col, 0.0, 1.0), vec3(0.2126, 0.7152, 0.0722));
    float split = smoothstep(0.0, 1.0, clamp(wl + uWashBalance * 0.5, 0.0, 1.0));
    vec3 shT = hsv2rgb(vec3(uWashShadowHue / 360.0, 0.55, 0.6)) * 2.0;
    vec3 hiT = hsv2rgb(vec3(uWashHighHue / 360.0, 0.55, 0.6)) * 2.0;
    col = mix(col, col * mix(shT, hiT, split), clamp(uWashMix, 0.0, 1.0));
  }

  // --- hue cycle (continuous + optional per-beat steps)
  if (uHueOn > 0.5) {
    float theta = uTime * uHueSpeed * 0.0174533 + floor(uBeats) * uHueBeat * 0.55;
    col = mix(col, hueRotate(col, theta), uHueAmount);
  }

  // --- duotone / gradient map
  if (uDuoOn > 0.5) {
    float l2 = dot(col, vec3(0.2126, 0.7152, 0.0722));
    vec3 dark = hsv2rgb(vec3(uDuoHueA / 360.0, 0.75, 0.32));
    vec3 lite = hsv2rgb(vec3(uDuoHueB / 360.0, 0.45, 1.0));
    col = mix(col, mix(dark, lite, smoothstep(0.0, 1.0, l2)), uDuoAmount);
  }

  // --- posterize + ordered-ish dither (second half of the Pixel art device)
  if (uPixelOn > 0.5 && uPxPosterize > 0.001) {
    float levels = mix(24.0, 3.0, uPxPosterize);
    float dn = (hash12(floor(vUv * uRes * 0.5)) - 0.5) * uPxDither / levels;
    col = floor((col + dn) * levels + 0.5) / levels;
  }

  // --- strobe: flash toward white, driven by the modulated uStrFlash.
  // Safety: onset/high sources pass the photosensitivity limiter upstream,
  // 'beat' is tempo-bounded; the contribution is hard-capped below full white.
  if (uStrobeOn > 0.5) {
    col = mix(col, vec3(1.0), min(clamp(uStrFlash, 0.0, 1.0) * uStrAmount, 0.85));
  }

  // --- R8-5 Clarity: local-contrast structure (broad-radius unsharp on the
  // base luma; a creative look, separate from the master Sharpen).
  if (uClarityOn > 0.5 && uClarityMix > 0.001) {
    vec2 ctx2 = uClarityRadius / uRes;
    vec3 c0 = texture(uBase, vUv).rgb;
    vec3 blur = (texture(uBase, vUv + vec2(ctx2.x, 0.0)).rgb
               + texture(uBase, vUv - vec2(ctx2.x, 0.0)).rgb
               + texture(uBase, vUv + vec2(0.0, ctx2.y)).rgb
               + texture(uBase, vUv - vec2(0.0, ctx2.y)).rgb
               + texture(uBase, vUv + ctx2).rgb
               + texture(uBase, vUv - ctx2).rgb) * (1.0 / 6.0);
    float lc = dot(c0 - blur, vec3(0.2126, 0.7152, 0.0722));
    col += lc * clamp(uClarityMix, 0.0, 1.0) * 1.3;
  }

  // --- sharpen (master): unsharp mask from neighbour taps of the base.
  if (uSharpOn > 0.5 && uSharpMix > 0.001) {
    vec2 tx = uSharpRadius / uRes;
    vec3 c0 = texture(uBase, vUv).rgb;
    vec3 blur = (texture(uBase, vUv + vec2(tx.x, 0.0)).rgb
               + texture(uBase, vUv - vec2(tx.x, 0.0)).rgb
               + texture(uBase, vUv + vec2(0.0, tx.y)).rgb
               + texture(uBase, vUv - vec2(0.0, tx.y)).rgb) * 0.25;
    col += (c0 - blur) * uSharpMix * 1.6;
  }

  // --- vignette (modulate uVigAmount from 'loud' for the breathe effect)
  float vr = length(p) / 0.9;
  float vig = smoothstep(uVigSize, uVigSize + max(uVigSoft, 0.05), vr);
  col *= 1.0 - clamp(vig * uVigAmount, 0.0, 0.95);

  // --- scanlines
  if (uVhsOn > 0.5) {
    float sl = sin(vUv.y * uRes.y * 3.14159265);
    col *= 1.0 - uVhsScan * 0.22 * sl * sl;
  }

  // --- film grain + always-on anti-banding dither
  vec2 gp = floor(vUv * uRes / max(uGrainSize, 1.0));
  float g = hash12(gp + vec2(fract(uTime * 13.37) * 91.7, fract(uTime * 7.13) * 33.3)) - 0.5;
  col += g * uGrainAmount * 0.064;
  col += (hash12(vUv * uRes + fract(uTime * 17.0) * 7.7) - 0.5) * 0.006;

  // --- output soft-clip (master, last): roll highlights off smoothly above
  // the ceiling instead of hard-clipping to flat white. Mix 0 = passthrough.
  if (uOutputOn > 0.5 && uOutputMix > 0.001) {
    float knee = clamp(uOutputCeiling, 0.5, 0.999);
    vec3 over = max(col - knee, 0.0);
    vec3 soft = min(col, vec3(knee)) + (1.0 - knee) * tanh(over / (1.0 - knee));
    col = mix(col, soft, clamp(uOutputMix, 0.0, 1.0));
  }

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
