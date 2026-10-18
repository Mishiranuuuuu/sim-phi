import { PRESET_SHADERS } from '../shaders/presets';
import { RPETempo, parseBeat, rpeCurve, BeatFraction, BpmEntry } from './rpeBlock';

export interface RawExtKeyframe<T = number | [number, number] | [number, number, number, number]> {
  startTime: BeatFraction;
  endTime: BeatFraction;
  start: T;
  end: T;
  easingType?: number;
  easingLeft?: number;
  easingRight?: number;
  bezier?: boolean | number;
  bezierPoints?: [number, number, number, number];
}

export type RawExtVariable = number | number[] | RawExtKeyframe<any>[];

export interface RawExtEffect {
  start: BeatFraction;
  end: BeatFraction;
  shader: string;
  vars?: Record<string, RawExtVariable>;
  global?: boolean;
  order?: number;
}

export interface RawExtraJson {
  bpm?: number | Array<{ bpm: number; time?: BeatFraction; startTime?: BeatFraction }>;
  effects?: RawExtEffect[];
}

export interface ParsedUniform {
  name: string;
  type: 'float' | 'vec2' | 'vec4';
  defaultValue: number | number[];
  track?: RawExtVariable;
}

export interface ParsedEffect {
  startSec: number;
  endSec: number;
  shaderName: string;
  shaderCode: string;
  program: WebGLProgram | null;
  uniforms: ParsedUniform[];
  global: boolean;
  order: number;
}

function sampleTrackFloat(
  events: RawExtVariable | undefined,
  defaultVal: number,
  time: number,
  tempo: RPETempo
): number {
  if (events == null) return defaultVal;
  if (typeof events === 'number') return events;
  if (!Array.isArray(events) || events.length === 0) return Number(events) || defaultVal;
  if (typeof events[0] === 'number') return events[0];

  const kfs = events as RawExtKeyframe<number>[];
  const first = kfs[0];
  const firstStartSec = tempo.seconds(parseBeat(first.startTime));
  if (time < firstStartSec) return defaultVal;

  let lo = 0;
  let hi = kfs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const startSec = tempo.seconds(parseBeat(kfs[mid].startTime));
    if (startSec <= time + 1e-9) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return defaultVal;

  const kf = kfs[lo - 1];
  const startSec = tempo.seconds(parseBeat(kf.startTime));
  const endSec = tempo.seconds(parseBeat(kf.endTime));
  const startVal = Number(kf.start) || 0;
  const endVal = Number(kf.end) || 0;

  if (time >= endSec) return endVal;
  if (endSec <= startSec) return endVal;

  const p = Math.max(0, Math.min(1, (time - startSec) / (endSec - startSec)));
  const easingType = Math.max(1, Math.min(29, Number(kf.easingType) || 1));
  const easingLeft = Math.max(0, Math.min(1, Number(kf.easingLeft) || 0));
  const easingRight = Math.max(0, Math.min(1, kf.easingRight != null ? Number(kf.easingRight) : 1));

  let eased = p;
  if (kf.bezier && kf.bezierPoints) {
    const [x1, y1, x2, y2] = kf.bezierPoints;
    const component = (t: number, a: number, b: number) =>
      3 * t * Math.pow(1 - t, 2) * a + 3 * t * t * (1 - t) * b + Math.pow(t, 3);
    let blo = 0;
    let bhi = 1;
    for (let step = 0; step < 40; step++) {
      const mid = (blo + bhi) * 0.5;
      if (component(mid, x1, x2) < p) blo = mid;
      else bhi = mid;
    }
    eased = component((blo + bhi) * 0.5, y1, y2);
  } else {
    const base = rpeCurve(easingType, easingLeft);
    const range = rpeCurve(easingType, easingRight) - base;
    if (Math.abs(range) < 1e-12) {
      eased = p;
    } else {
      const clipped = easingLeft + (easingRight - easingLeft) * p;
      eased = (rpeCurve(easingType, clipped) - base) / range;
    }
  }
  return startVal + (endVal - startVal) * eased;
}

function sampleTrackVec2(
  events: RawExtVariable | undefined,
  defaultVal: [number, number],
  time: number,
  tempo: RPETempo
): [number, number] {
  if (events == null) return defaultVal;
  if (Array.isArray(events) && typeof events[0] === 'number') {
    const numArr = events as number[];
    return [numArr[0] || defaultVal[0], numArr[1] || defaultVal[1]];
  }
  if (!Array.isArray(events) || events.length === 0) return defaultVal;

  const kfs = events as RawExtKeyframe<[number, number]>[];
  const xKfs = kfs.map(k => ({
    ...k,
    start: Array.isArray(k.start) ? k.start[0] : Number(k.start),
    end: Array.isArray(k.end) ? k.end[0] : Number(k.end)
  }));
  const yKfs = kfs.map(k => ({
    ...k,
    start: Array.isArray(k.start) ? k.start[1] : Number(k.start),
    end: Array.isArray(k.end) ? k.end[1] : Number(k.end)
  }));
  return [
    sampleTrackFloat(xKfs, defaultVal[0], time, tempo),
    sampleTrackFloat(yKfs, defaultVal[1], time, tempo)
  ];
}

function sampleTrackVec4(
  events: RawExtVariable | undefined,
  defaultVal: [number, number, number, number],
  time: number,
  tempo: RPETempo
): [number, number, number, number] {
  if (events == null) return defaultVal;
  if (Array.isArray(events) && typeof events[0] === 'number') {
    const raw = events as number[];
    const is255 = raw.some(v => v > 1);
    const scale = is255 ? 1 / 255 : 1;
    return [
      (raw[0] ?? defaultVal[0]) * scale,
      (raw[1] ?? defaultVal[1]) * scale,
      (raw[2] ?? defaultVal[2]) * scale,
      (raw[3] ?? defaultVal[3]) * scale
    ];
  }
  if (!Array.isArray(events) || events.length === 0) return defaultVal;

  const kfs = events as RawExtKeyframe<any>[];
  let is255 = false;
  for (const k of kfs) {
    if (Array.isArray(k.start) && k.start.some((v: number) => v > 1)) is255 = true;
    if (Array.isArray(k.end) && k.end.some((v: number) => v > 1)) is255 = true;
  }
  const scale = is255 ? 1 / 255 : 1;

  const channels: [number, number, number, number] = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const cKfs = kfs.map(k => ({
      ...k,
      start: (Array.isArray(k.start) ? k.start[c] ?? defaultVal[c] : Number(k.start)) * scale,
      end: (Array.isArray(k.end) ? k.end[c] ?? defaultVal[c] : Number(k.end)) * scale
    }));
    channels[c] = sampleTrackFloat(cKfs, defaultVal[c], time, tempo);
  }
  return channels;
}

/**
 * WebGL 1 requires loop indices and bounds to be compile-time constants.  A
 * number of Phira chart packages use uniforms for particle counts or blur
 * radii instead (for example, `i < density`), which works in desktop GLSL but
 * fails to compile in ANGLE/WebGL.  Convert those common forms to bounded
 * loops and retain the original run-time limit inside the loop.
 */
function makeLoopsWebGL1Compatible(source: string): string {
  const maxParticleCount = 512;
  const maxBlurRadius = 16;

  // `for (float i = 0.0; i < density; i += 1.0)`
  // becomes a constant loop with the original uniform as an early exit.
  let result = source.replace(
    /for\s*\(\s*float\s+(\w+)\s*=\s*0(?:\.0)?\s*;\s*\1\s*<\s*([A-Za-z_]\w*)\s*;\s*(?:\1\s*\+=\s*1(?:\.0)?|\1\s*\+\+)\s*\)\s*\{/g,
    (_match, variable: string, limit: string) =>
      `for (int ${variable}Index = 0; ${variable}Index < ${maxParticleCount}; ++${variable}Index) { float ${variable} = float(${variable}Index); if (${variable} >= ${limit}) break;`
  );

  // `for (float x = -radius; x <= radius; x++)` is used by the bokeh shader.
  // Its packaged default radius is 10, so a fixed radius of 16 preserves it
  // while keeping the resulting shader practical on WebGL 1 implementations.
  result = result.replace(
    /for\s*\(\s*float\s+(\w+)\s*=\s*-\s*([A-Za-z_]\w*)\s*;\s*\1\s*<=\s*\2\s*;\s*\1\s*\+\+\s*\)\s*\{/g,
    (_match, variable: string, radius: string) =>
      `for (int ${variable}Index = -${maxBlurRadius}; ${variable}Index <= ${maxBlurRadius}; ++${variable}Index) { float ${variable} = float(${variable}Index); if (abs(${variable}) > ${radius}) continue;`
  );

  return result;
}

export class EffectManager {
  private extras = new Map<string, string>();
  private customShaders = new Map<string, string>();

  private glCanvas: HTMLCanvasElement | null = null;
  private gl: WebGLRenderingContext | null = null;
  private quadPosBuffer: WebGLBuffer | null = null;
  private quadTexBuffer: WebGLBuffer | null = null;

  private srcTex: WebGLTexture | null = null;
  private texA: WebGLTexture | null = null;
  private fboA: WebGLFramebuffer | null = null;
  private texB: WebGLTexture | null = null;
  private fboB: WebGLFramebuffer | null = null;

  private currentWidth = 0;
  private currentHeight = 0;

  private programCache = new Map<string, WebGLProgram>();
  private activeParsedEffects: ParsedEffect[] = [];
  private currentTempo: RPETempo | null = null;

  public constructor() {
    this.initGL();
  }

  private initGL(): void {
    if (typeof document === 'undefined') return;
    try {
      this.glCanvas = document.createElement('canvas');
      const gl = (this.glCanvas.getContext('webgl', {
        alpha: false,
        premultipliedAlpha: false,
        antialias: false,
        depth: false,
        stencil: false
      }) ||
        this.glCanvas.getContext('experimental-webgl', {
          alpha: false,
          premultipliedAlpha: false,
          antialias: false,
          depth: false,
          stencil: false
        })) as WebGLRenderingContext | null;

      if (!gl) {
        console.warn('WebGL not available for EffectManager');
        return;
      }
      this.gl = gl;

      // Create Quad geometry
      this.quadPosBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadPosBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([
          -1,  1,
          -1, -1,
           1,  1,
           1,  1,
          -1, -1,
           1, -1
        ]),
        gl.STATIC_DRAW
      );

      this.quadTexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadTexBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([
          0, 0,
          0, 1,
          1, 0,
          1, 0,
          0, 1,
          1, 1
        ]),
        gl.STATIC_DRAW
      );
    } catch (e) {
      console.warn('Failed to initialize WebGL for EffectManager:', e);
    }
  }

  private ensureFBOs(width: number, height: number): boolean {
    const { gl, glCanvas } = this;
    if (!gl || !glCanvas) return false;
    if (this.currentWidth === width && this.currentHeight === height && this.texA && this.texB && this.srcTex) {
      return true;
    }

    this.currentWidth = width;
    this.currentHeight = height;
    glCanvas.width = width;
    glCanvas.height = height;

    // Helper for texture creation
    const makeTex = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      return tex;
    };

    if (this.srcTex) gl.deleteTexture(this.srcTex);
    if (this.texA) gl.deleteTexture(this.texA);
    if (this.texB) gl.deleteTexture(this.texB);
    if (this.fboA) gl.deleteFramebuffer(this.fboA);
    if (this.fboB) gl.deleteFramebuffer(this.fboB);

    this.srcTex = makeTex();
    this.texA = makeTex();
    this.texB = makeTex();

    this.fboA = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboA);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texA, 0);

    this.fboB = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texB, 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return true;
  }

  public addExtra(pathname: string, content: string): void {
    this.extras.set(pathname, content);
    const filename = pathname.split('/').pop() || pathname;
    this.extras.set(filename, content);
  }

  public addShader(pathname: string, content: string): void {
    this.customShaders.set(pathname, content);
    const clean = pathname.replace(/^\/+/, '');
    this.customShaders.set(clean, content);
    const filename = clean.split('/').pop() || clean;
    this.customShaders.set(filename, content);
  }

  private resolveShader(name: string): string | null {
    const clean = name.replace(/^\/+/, '');
    if (this.customShaders.has(clean)) return this.customShaders.get(clean)!;
    if (this.customShaders.has(name)) return this.customShaders.get(name)!;
    const base = clean.split('/').pop() || clean;
    if (this.customShaders.has(base)) return this.customShaders.get(base)!;

    if (PRESET_SHADERS[clean]) return PRESET_SHADERS[clean];
    if (PRESET_SHADERS[base]) return PRESET_SHADERS[base];
    const lower = base.toLowerCase();
    for (const key of Object.keys(PRESET_SHADERS)) {
      if (key.toLowerCase() === lower) return PRESET_SHADERS[key];
    }
    return null;
  }

  private compileProgram(shaderName: string, fragSource: string): WebGLProgram | null {
    if (this.programCache.has(shaderName)) {
      return this.programCache.get(shaderName)!;
    }
    const { gl } = this;
    if (!gl) return null;

    // Detect precision of varying lowp/mediump/highp vec2 uv in fragment
    let uvPrecision = 'lowp';
    const uvMatch = fragSource.match(/varying\s+(lowp|mediump|highp)?\s*vec2\s+uv;/);
    if (uvMatch && uvMatch[1]) {
      uvPrecision = uvMatch[1];
    }

    const vertSource = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying ${uvPrecision} vec2 uv;
uniform vec2 UVScale;
uniform float u_flipY;

void main() {
  gl_Position = vec4(a_position.x, a_position.y * u_flipY, 0.0, 1.0);
  uv = (a_texCoord - vec2(0.5)) * UVScale + vec2(0.5);
}
`;

    // Preprocess fragment source (strip #version 100)
    let processedFrag = makeLoopsWebGL1Compatible(fragSource.replace(/#\s*version\s+100;?/g, ''));
    if (!/precision\s+(lowp|mediump|highp)\s+float;/.test(processedFrag)) {
      processedFrag = 'precision mediump float;\n' + processedFrag;
    }

    const vertShader = gl.createShader(gl.VERTEX_SHADER);
    if (!vertShader) return null;
    gl.shaderSource(vertShader, vertSource);
    gl.compileShader(vertShader);
    if (!gl.getShaderParameter(vertShader, gl.COMPILE_STATUS)) {
      console.error('Vertex compile error:', gl.getShaderInfoLog(vertShader));
      gl.deleteShader(vertShader);
      return null;
    }

    const fragShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fragShader) {
      gl.deleteShader(vertShader);
      return null;
    }
    gl.shaderSource(fragShader, processedFrag);
    gl.compileShader(fragShader);
    if (!gl.getShaderParameter(fragShader, gl.COMPILE_STATUS)) {
      console.error(`Fragment compile error for [${shaderName}]:`, gl.getShaderInfoLog(fragShader));
      gl.deleteShader(vertShader);
      gl.deleteShader(fragShader);
      return null;
    }

    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vertShader);
      gl.deleteShader(fragShader);
      return null;
    }
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.bindAttribLocation(program, 0, 'a_position');
    gl.bindAttribLocation(program, 1, 'a_texCoord');
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(`Program link error for [${shaderName}]:`, gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      gl.deleteShader(vertShader);
      gl.deleteShader(fragShader);
      return null;
    }

    this.programCache.set(shaderName, program);
    return program;
  }

  public setChart(chartKey: string, fallbackBpmList?: BpmEntry[]): void {
    this.activeParsedEffects = [];
    this.currentTempo = null;

    // Look for matching extra.json
    let extraStr: string | undefined;
    if (this.extras.has(chartKey)) {
      extraStr = this.extras.get(chartKey);
    } else {
      // Find extra.json in same dir or any extra.json
      const dir = chartKey.includes('/') ? chartKey.substring(0, chartKey.lastIndexOf('/') + 1) : '';
      for (const [k, v] of this.extras.entries()) {
        if (dir && k.startsWith(dir)) {
          extraStr = v;
          break;
        }
      }
      if (!extraStr && this.extras.size > 0) {
        extraStr = this.extras.values().next().value;
      }
    }

    if (!extraStr) return;

    let extra: RawExtraJson;
    try {
      extra = typeof extraStr === 'string' ? JSON.parse(extraStr) : extraStr;
    } catch (e) {
      console.warn('Failed to parse extra.json:', e);
      return;
    }

    // Build RPETempo
    let bpmEntries: BpmEntry[] = [];
    if (typeof extra.bpm === 'number') {
      bpmEntries = [{ startTime: [0, 0, 1], bpm: extra.bpm }];
    } else if (Array.isArray(extra.bpm)) {
      bpmEntries = extra.bpm.map(it => ({
        startTime: (it.time ?? it.startTime ?? [0, 0, 1]) as BeatFraction,
        bpm: it.bpm
      }));
    } else if (fallbackBpmList && fallbackBpmList.length > 0) {
      bpmEntries = fallbackBpmList;
    } else {
      bpmEntries = [{ startTime: [0, 0, 1], bpm: 120 }];
    }

    const tempo = new RPETempo(bpmEntries);
    this.currentTempo = tempo;

    if (!extra.effects || !Array.isArray(extra.effects)) return;

    const DEF_REGEX = /uniform\s+(\w+)\s+(\w+);\s*\/\/\s*%([^%]+)%/g;

    const parsed: ParsedEffect[] = [];
    for (let i = 0; i < extra.effects.length; i++) {
      const ext = extra.effects[i];
      const shaderCode = this.resolveShader(ext.shader);
      if (!shaderCode) {
        console.warn(`Shader [${ext.shader}] not found, skipping effect ${i}`);
        continue;
      }

      const startSec = tempo.seconds(parseBeat(ext.start));
      const endSec = tempo.seconds(parseBeat(ext.end));
      const program = this.compileProgram(ext.shader, shaderCode);

      // Extract default uniforms from comments
      const uniforms: ParsedUniform[] = [];
      let match: RegExpExecArray | null;
      DEF_REGEX.lastIndex = 0;
      while ((match = DEF_REGEX.exec(shaderCode)) !== null) {
        const typeName = match[1];
        const uName = match[2];
        const rawDef = match[3].trim();

        let defVal: number | number[] = 0;
        if (typeName === 'float') {
          defVal = parseFloat(rawDef) || 0;
        } else if (typeName === 'vec2') {
          const parts = rawDef.split(',').map(s => parseFloat(s.trim()));
          defVal = [parts[0] || 0, parts[1] || 0];
        } else if (typeName === 'vec4') {
          const parts = rawDef.split(',').map(s => parseFloat(s.trim()));
          defVal = [parts[0] || 0, parts[1] || 0, parts[2] || 0, parts[3] || 1];
        }

        const userTrack = ext.vars ? ext.vars[uName] : undefined;
        uniforms.push({
          name: uName,
          type: typeName as 'float' | 'vec2' | 'vec4',
          defaultValue: defVal,
          track: userTrack
        });
      }

      // Check if ext.vars has uniforms not in comment defaults
      if (ext.vars) {
        for (const [vName, vVal] of Object.entries(ext.vars)) {
          if (!uniforms.some(u => u.name === vName)) {
            // Determine type from value
            let type: 'float' | 'vec2' | 'vec4' = 'float';
            let defVal: number | number[] = 0;
            if (Array.isArray(vVal) && vVal.length > 0 && typeof vVal[0] === 'number') {
              const numArr = vVal as number[];
              if (numArr.length === 2) {
                type = 'vec2';
                defVal = [numArr[0], numArr[1]];
              } else if (numArr.length === 4) {
                type = 'vec4';
                defVal = [numArr[0], numArr[1], numArr[2], numArr[3]];
              }
            }
            uniforms.push({
              name: vName,
              type,
              defaultValue: defVal,
              track: vVal
            });
          }
        }
      }

      parsed.push({
        startSec,
        endSec,
        shaderName: ext.shader,
        shaderCode,
        program,
        uniforms,
        global: ext.global ?? false,
        order: ext.order ?? i
      });
    }

    parsed.sort((a, b) => a.order - b.order);
    this.activeParsedEffects = parsed;
    console.log(`Loaded ${parsed.length} post-processing effects from extra.json`);
  }

  public render(canvasfg: HTMLCanvasElement, ctxfg: CanvasRenderingContext2D, time: number): void {
    if (this.activeParsedEffects.length === 0 || !this.currentTempo) return;
    const { gl, glCanvas } = this;
    if (!gl || !glCanvas) return;

    // Filter active effects
    const active = this.activeParsedEffects.filter(e => time >= e.startSec && time <= e.endSec && e.program != null);
    if (active.length === 0) return;

    const width = canvasfg.width;
    const height = canvasfg.height;
    if (!this.ensureFBOs(width, height)) return;

    // Upload canvasfg to srcTex (UNPACK_FLIP_Y_WEBGL = false preserves top-left origin)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvasfg);

    // Setup vertex attributes
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadPosBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadTexBuffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

    const N = active.length;
    let readTex = this.srcTex;

    for (let i = 0; i < N; i++) {
      const effect = active[i];
      const isLast = (i === N - 1);
      const program = effect.program!;
      gl.useProgram(program);

      // Bind destination
      let writeFbo: WebGLFramebuffer | null = null;
      let nextReadTex: WebGLTexture | null = null;
      let flipY = 1.0;

      if (!isLast) {
        if (i % 2 === 0) {
          writeFbo = this.fboA;
          nextReadTex = this.texA;
        } else {
          writeFbo = this.fboB;
          nextReadTex = this.texB;
        }
        flipY = -1.0; // Invert Y when rendering into intermediate FBO so next pass reads upright
      } else {
        writeFbo = null; // Final pass to glCanvas backbuffer
        flipY = 1.0;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);
      gl.viewport(0, 0, width, height);

      // Bind input texture
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, readTex);
      const uScreenTex = gl.getUniformLocation(program, 'screenTexture');
      if (uScreenTex) gl.uniform1i(uScreenTex, 0);

      // Standard uniforms
      const uTime = gl.getUniformLocation(program, 'time');
      if (uTime) gl.uniform1f(uTime, time);

      const uScreenSize = gl.getUniformLocation(program, 'screenSize');
      if (uScreenSize) gl.uniform2f(uScreenSize, width, height);

      const uUVScale = gl.getUniformLocation(program, 'UVScale');
      if (uUVScale) gl.uniform2f(uUVScale, 1.0, 1.0);

      const uFlipY = gl.getUniformLocation(program, 'u_flipY');
      if (uFlipY) gl.uniform1f(uFlipY, flipY);

      // Effect specific uniforms
      for (const u of effect.uniforms) {
        const loc = gl.getUniformLocation(program, u.name);
        if (!loc) continue;

        if (u.type === 'float') {
          const val = sampleTrackFloat(u.track, u.defaultValue as number, time, this.currentTempo);
          gl.uniform1f(loc, val);
        } else if (u.type === 'vec2') {
          const val = sampleTrackVec2(u.track, u.defaultValue as [number, number], time, this.currentTempo);
          gl.uniform2f(loc, val[0], val[1]);
        } else if (u.type === 'vec4') {
          const val = sampleTrackVec4(u.track, u.defaultValue as [number, number, number, number], time, this.currentTempo);
          gl.uniform4f(loc, val[0], val[1], val[2], val[3]);
        }
      }

      // Draw quad
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // Advance ping-pong
      readTex = nextReadTex;
    }

    // Unbind and draw result back to 2D canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    ctxfg.clearRect(0, 0, width, height);
    ctxfg.drawImage(glCanvas, 0, 0);
  }

  public reset(): void {
    this.activeParsedEffects = [];
    this.currentTempo = null;
  }

  public clearAll(): void {
    this.reset();
    this.extras.clear();
    this.customShaders.clear();
    const { gl } = this;
    if (gl) {
      for (const prog of this.programCache.values()) {
        gl.deleteProgram(prog);
      }
      this.programCache.clear();
      if (this.srcTex) gl.deleteTexture(this.srcTex);
      if (this.texA) gl.deleteTexture(this.texA);
      if (this.texB) gl.deleteTexture(this.texB);
      if (this.fboA) gl.deleteFramebuffer(this.fboA);
      if (this.fboB) gl.deleteFramebuffer(this.fboB);
      this.srcTex = null;
      this.texA = null;
      this.texB = null;
      this.fboA = null;
      this.fboB = null;
    }
  }
}

export const effectManager = new EffectManager();
