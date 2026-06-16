// Minimal WebGL2 runtime: program wrapper with cached uniforms, fullscreen
// quad, and render-target helpers.

export function createGL(canvas) {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    premultipliedAlpha: false,
  });
  if (!gl) throw new Error('WebGL2 is not available in this browser.');
  return gl;
}

export class Program {
  constructor(gl, vsSrc, fsSrc, name) {
    this.name = name;
    this.prog = linkProgram(gl, vsSrc, fsSrc, name);
    this.uniforms = new Map();
    const count = gl.getProgramParameter(this.prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(this.prog, i);
      const loc = gl.getUniformLocation(this.prog, info.name);
      // array uniforms report as "name[0]" — register under the bare name
      const name = info.name.endsWith('[0]') ? info.name.slice(0, -3) : info.name;
      this.uniforms.set(name, { loc, type: info.type, size: info.size });
    }
  }

  use(gl) {
    gl.useProgram(this.prog);
  }

  // Sets every entry of `values` that exists as a uniform in this program;
  // unknown keys are silently skipped so all passes can share one big object.
  setAll(gl, values) {
    for (const [key, value] of Object.entries(values)) {
      const u = this.uniforms.get(key);
      if (!u) continue;
      switch (u.type) {
        case gl.FLOAT:
          if (u.size > 1) gl.uniform1fv(u.loc, value);
          else gl.uniform1f(u.loc, value);
          break;
        case gl.FLOAT_VEC2: gl.uniform2fv(u.loc, value); break;
        case gl.FLOAT_VEC3: gl.uniform3fv(u.loc, value); break;
        case gl.FLOAT_VEC4: gl.uniform4fv(u.loc, value); break;
        case gl.INT:
        case gl.BOOL:
          if (u.size > 1) gl.uniform1iv(u.loc, value);
          else gl.uniform1i(u.loc, value);
          break;
        default: break; // samplers are bound via bindTextures
      }
    }
  }

  bindTextures(gl, textures) {
    let unit = 0;
    for (const [key, tex] of Object.entries(textures)) {
      const u = this.uniforms.get(key);
      if (!u || !tex) continue;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(u.loc, unit);
      unit++;
    }
  }
}

function compileShader(gl, type, src, name) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    throw new Error(`Shader compile failed (${name}): ${log}`);
  }
  return sh;
}

function linkProgram(gl, vsSrc, fsSrc, name) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc, name + '.vert');
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc, name + '.frag');
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`Program link failed (${name}): ${gl.getProgramInfoLog(prog)}`);
  }
  return prog;
}

export class Quad {
  constructor(gl) {
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]), // single oversized triangle
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  draw(gl) {
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }
}

// NOTE: callers must pass an ImageBitmap created with
// {imageOrientation: 'flipY'} — the engine's texture convention is v=0 at the
// image bottom, and UNPACK_FLIP_Y_WEBGL is ignored for ImageBitmap sources
// per the WebGL spec, so the flip has to happen at createImageBitmap time.
export function createImageTexture(gl, source, { mirror = true } = {}) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
  const wrap = mirror ? gl.MIRRORED_REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

export function createTarget(gl, width, height) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return { fb, tex, width, height };
}

export function destroyTarget(gl, target) {
  if (!target) return;
  gl.deleteFramebuffer(target.fb);
  gl.deleteTexture(target.tex);
}
