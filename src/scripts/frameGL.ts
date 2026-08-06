/**
 * The approach frame's WebGL layer.
 *
 * A shape sliding into a static frame and simply stopping there is the flattest
 * moment on the page — nothing happens at the one point the eye is on. This
 * paints the framed shape itself, on a canvas that fills the frame's well, and
 * resolves it out of a field of blocks: each block arrives on its own beat,
 * from its own small offset, with its own brightness, and settles into the
 * image. It is the same pixel language the rest of the site uses for its
 * handovers, done per-fragment instead of per-div.
 *
 * Raw WebGL, no library: one quad, one program, two textures at most. Adding a
 * 3D engine to draw a rectangle would cost more than the whole page.
 *
 * Everything here is optional. If the context can't be created — old hardware,
 * a blocked GPU, a headless browser without a rasteriser — `createFrameGL`
 * returns null and the caller keeps showing the plain DOM shape, which is the
 * same picture without the entrance.
 */

const VERTEX = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

/*
 * uProgress drives the whole entrance. Every block reads a stable hash of its
 * own cell, which gives it a start time inside the first 60% of the run, a
 * direction to arrive from, and a brightness offset that decays as it lands —
 * that last one is what keeps the effect legible on a flat placeholder, where
 * a pure displacement would be invisible.
 */
const FRAGMENT = `
precision mediump float;

uniform sampler2D uTex;
uniform vec2 uBlocks;
uniform float uProgress;
uniform float uTime;
uniform float uHasTexture;
uniform vec3 uFallback;

varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  /* A breath, not a wobble: a hundredth of the frame, once every ten seconds
     or so, so a parked shape is never perfectly dead. */
  vec2 uv = (vUv - 0.5) * (1.0 - 0.012 * sin(uTime * 0.55)) + 0.5;

  vec2 cell = floor(uv * uBlocks);
  float r = hash(cell);
  float r2 = hash(cell + 7.71);

  float start = r * 0.6;
  float p = clamp((uProgress - start) / 0.4, 0.0, 1.0);
  p = p * p * (3.0 - 2.0 * p);

  vec2 offset = vec2((r - 0.5) * 0.07, (r2 - 0.5) * 0.07) * (1.0 - p);
  vec2 sampled = clamp(uv + offset, 0.0, 1.0);

  vec4 tex = texture2D(uTex, sampled);
  vec3 colour = mix(uFallback, tex.rgb, uHasTexture);
  float alpha = mix(1.0, tex.a, uHasTexture);

  colour += (1.0 - p) * (r - 0.5) * 0.4;

  gl_FragColor = vec4(colour, alpha * p);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export interface FrameGL {
  /** Paint this element's image and run the entrance. */
  enter(item: HTMLElement): void;
  /** Clear the frame — the shape is leaving, the DOM takes it back. */
  leave(): void;
  destroy(): void;
}

export function createFrameGL(well: HTMLElement): FrameGL | null {
  const canvas = document.createElement('canvas');
  canvas.className = 'cs-ap__gl';

  const gl = (canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
  }) ?? canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
  if (!gl) return null;

  const program = gl.createProgram();
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  if (!program || !vertex || !fragment) return null;

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {
    tex: gl.getUniformLocation(program, 'uTex'),
    blocks: gl.getUniformLocation(program, 'uBlocks'),
    progress: gl.getUniformLocation(program, 'uProgress'),
    time: gl.getUniformLocation(program, 'uTime'),
    hasTexture: gl.getUniformLocation(program, 'uHasTexture'),
    fallback: gl.getUniformLocation(program, 'uFallback'),
  };

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  // One grey pixel until a real image is bound, so the first draw is never a
  // black flash.
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([213, 213, 213, 255]),
  );

  gl.enable(gl.BLEND);
  // Non-premultiplied source, which is what the shader writes.
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  gl.uniform1i(uniforms.tex, 0);
  gl.uniform2f(uniforms.blocks, 14, 17);
  gl.uniform3f(uniforms.fallback, 213 / 255, 213 / 255, 213 / 255);
  gl.uniform1f(uniforms.hasTexture, 0);
  gl.uniform1f(uniforms.progress, 0);

  well.appendChild(canvas);

  let progress = 0;
  let target = 0;
  let raf = 0;
  let running = false;
  const started = performance.now();

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(well.clientWidth * dpr);
    const height = Math.round(well.clientHeight * dpr);
    if (!width || !height) return;
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
  };

  const draw = () => {
    resize();
    gl.uniform1f(uniforms.progress, progress);
    gl.uniform1f(uniforms.time, (performance.now() - started) / 1000);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const tick = () => {
    // Ease towards the target rather than tweening it: entrances and exits are
    // interrupted constantly here (a drag can arrive mid-entrance), and a
    // chase has nothing to cancel.
    progress += (target - progress) * 0.12;
    if (Math.abs(target - progress) < 0.001) progress = target;

    draw();

    const idle = progress === target && target === 0;
    if (idle) {
      running = false;
      canvas.removeAttribute('data-on');
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  const start = () => {
    if (running) return;
    running = true;
    raf = requestAnimationFrame(tick);
  };

  const bind = (item: HTMLElement) => {
    const img = item.querySelector<HTMLImageElement>('img');
    gl.bindTexture(gl.TEXTURE_2D, texture);

    if (img?.complete && img.naturalWidth > 0) {
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.uniform1f(uniforms.hasTexture, 1);
        return;
      } catch {
        // A tainted or undecoded image: fall through to the flat colour rather
        // than tearing down the effect.
      }
    }

    gl.uniform1f(uniforms.hasTexture, 0);
  };

  return {
    enter(item: HTMLElement) {
      bind(item);
      canvas.setAttribute('data-on', '');
      progress = 0;
      target = 1;
      start();
    },
    leave() {
      /* Snapped, not faded: the DOM copy becomes visible again the moment the
         shape starts travelling, and a canvas still fading out over the top of
         it would show the same shape twice. The entrance is where the effect
         belongs; the exit only has to get out of the way. */
      target = 0;
      progress = 0;
      canvas.removeAttribute('data-on');
      draw();
    },
    destroy() {
      cancelAnimationFrame(raf);
      canvas.remove();
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    },
  };
}
