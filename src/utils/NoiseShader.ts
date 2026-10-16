import {
  NOISE_VERTEX_SHADER,
  NOISE_FRAGMENT_SHADER
} from './NoiseShaderSource';
import { Zone, drawBlockSimple } from './BlockSimple';
import { BlockMasks, zoneFromArea } from './BlockMask';

export interface TouchPoint {
  id: number | string;
  x: number;
  y: number;
}

export class NoiseShaderRenderer {
  public glCanvas: HTMLCanvasElement;
  public gl: WebGLRenderingContext | null;

  // Mask rasterizer
  private masks = new BlockMasks();

  // WebGL programs
  private mainProgram: WebGLProgram | null = null;

  // Textures
  private displaceTex: WebGLTexture | null = null;
  private sparkTex: WebGLTexture | null = null;
  private noiseTex: WebGLTexture | null = null;
  private emptyTex: WebGLTexture | null = null;
  private sceneTex: WebGLTexture | null = null;
  private masksTex: WebGLTexture | null = null;
  private auxMaskTex: WebGLTexture | null = null;

  // Quad buffer
  private quadBuffer: WebGLBuffer | null = null;

  // Uniform locations cache
  private uLocs: Record<string, WebGLUniformLocation | null> = {};

  // Touch tracking for hover dissolution
  private touches = new Map<number | string, { x: number; y: number; scale: number; startTime: number }>();

  // Width and height
  private width = 0;
  private height = 0;

  public constructor() {
    this.glCanvas = document.createElement('canvas');
    this.gl = this.glCanvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false
    }) as WebGLRenderingContext | null;

    if (!this.gl) {
      console.warn('[NoiseShader] WebGL 1.0 context is not available, falling back to 2D BlockSimple.');
      return;
    }

    try {
      this.initGL();
    } catch (e) {
      console.warn('[NoiseShader] Error initializing WebGL pipeline:', e);
      this.gl = null;
    }
  }

  private initGL() {
    const gl = this.gl;
    if (!gl) return;

    this.mainProgram = this.createProgram(NOISE_VERTEX_SHADER, NOISE_FRAGMENT_SHADER);
    if (!this.mainProgram) return;

    const p = this.mainProgram;
    const getU = (name: string) => gl.getUniformLocation(p, name);

    this.uLocs.uView = getU('uView');
    this.uLocs.uUnityTime = getU('uUnityTime');
    this.uLocs._ScreenParams = getU('_ScreenParams');
    this.uLocs._EffectRT_TexelSize = getU('_EffectRT_TexelSize');
    this.uLocs.uLayer = getU('uLayer');
    this.uLocs.uColored = getU('uColored');
    this.uLocs.uReadyExtra = getU('uReadyExtra');

    // Samplers
    this.uLocs.uDisplaceTex = getU('uDisplaceTex');
    this.uLocs.uSparkTex = getU('uSparkTex');
    this.uLocs.uNoiseTex = getU('uNoiseTex');
    this.uLocs.uScene = getU('uScene');
    this.uLocs.uMasks = getU('uMasks');
    this.uLocs.uAuxMasks = getU('uAuxMasks');
    this.uLocs.uActiveColors = getU('uActiveColors');
    this.uLocs.uDisabledColors = getU('uDisabledColors');

    // Floats
    const floatUniforms = [
      '_EdgeOpacity', '_FillStrength', '_FillOpacity', '_GlowIntensity',
      '_SparkMapOpacity', '_SparkHueShiftAmount', '_SparkDisplaceIntensity',
      '_DisplaceBlendIntensity', '_DisplaceSpeed', '_DisplaceStrength',
      '_TouchPosShine', '_TouchPosRadius', '_TouchPosSDFSmoothness',
      '_TouchPosSDFFalloff', '_BackgroundPixelScale', 'uDisabledFillOpacity',
      'uDisabledSparkOpacity', 'uDisabledSparkIntensity', 'uDisabledSpeed',
      '_ShineSpeed', '_ShineBrightness', '_TouchDisplaceSpeed',
      '_TouchDisplaceStrength', '_NoiseEvoSpeed', '_NoiseDirChangeSpeed',
      '_NoiseDisplaceStrength', '_NoiseRadius', '_NoiseSmoothness',
      '_SDFCellSize', '_SDFSmoothness', '_SDFFalloff', '_SDFMoveSpeed',
      '_TouchBackgroundPixelScale'
    ];
    for (const name of floatUniforms) {
      this.uLocs[name] = getU(name);
    }

    // Colors
    const colorUniforms = [
      '_EdgeColor', '_FillColor', '_GlowColor', '_DisplaceDirection',
      'uDisabledFillColor', '_ShineColor', '_TouchDisplaceDirection',
      '_NoiseTint', '_TouchGlowColor', '_SparkTint', 'uDisabledSparkTint'
    ];
    for (const name of colorUniforms) {
      this.uLocs[name] = getU(name);
    }

    // Touch positions
    this.uLocs._TouchPosCount = getU('_TouchPosCount');
    for (let i = 0; i < 10; i++) {
      this.uLocs[`_TouchPos[${i}]`] = getU(`_TouchPos[${i}]`);
    }

    // Quad buffer covering [-1, -1] to [1, 1]
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1
      ]),
      gl.STATIC_DRAW
    );

    // 1x1 empty black texture
    this.emptyTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.emptyTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));

    // Dynamic textures
    this.sceneTex = gl.createTexture();
    this.masksTex = gl.createTexture();
    this.auxMaskTex = gl.createTexture();

    for (const tex of [this.sceneTex, this.masksTex, this.auxMaskTex]) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }

    // Static textures (initialized empty, populated via loadTexturesFromPack)
    this.displaceTex = this.createEmptyTexture();
    this.sparkTex = this.createEmptyTexture();
    this.noiseTex = this.createEmptyTexture();
  }

  private createProgram(vsSource: string, fsSource: string): WebGLProgram | null {
    const gl = this.gl;
    if (!gl) return null;

    const vs = gl.createShader(gl.VERTEX_SHADER);
    if (!vs) return null;
    gl.shaderSource(vs, vsSource);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      console.error('[NoiseShader] Vertex shader compilation error:', gl.getShaderInfoLog(vs));
      gl.deleteShader(vs);
      return null;
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fs) {
      gl.deleteShader(vs);
      return null;
    }
    gl.shaderSource(fs, fsSource);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error('[NoiseShader] Fragment shader compilation error:', gl.getShaderInfoLog(fs));
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return null;
    }

    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return null;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[NoiseShader] Program linking error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return null;
    }

    return program;
  }

  private createEmptyTexture(): WebGLTexture | null {
    const gl = this.gl;
    if (!gl) return null;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    return tex;
  }

  private loadTexture(
    url: string,
    wrapS: number,
    wrapT: number,
    isDisplace: boolean,
    targetTex?: WebGLTexture | null
  ): WebGLTexture | null {
    const gl = this.gl;
    if (!gl) return null;

    const tex = targetTex || this.createEmptyTexture();
    if (!tex) return null;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!this.gl) return;
      this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
      this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
      this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, img);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, wrapS);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, wrapT);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
      this.gl.bindTexture(this.gl.TEXTURE_2D, null);

      if (isDisplace) {
        this.masks.setDisplaceImage(img);
      }
    };
    img.src = url;
    return tex;
  }

  public loadTexturesFromPack(images: Record<string, string>) {
    const gl = this.gl;
    if (!gl || !images) return;
    const getUrl = (val: string | undefined) => (val ? val.split('|')[0] : '');
    const blockNoise = getUrl(images.BlockNoise1);
    const pointNoise = getUrl(images.PointNoise);
    const fdNoise = getUrl(images.FD_Noise_00000);

    if (blockNoise) {
      this.loadTexture(blockNoise, gl.MIRRORED_REPEAT, gl.MIRRORED_REPEAT, true, this.displaceTex);
    }
    if (pointNoise) {
      this.loadTexture(pointNoise, gl.REPEAT, gl.REPEAT, false, this.sparkTex);
    }
    if (fdNoise) {
      this.loadTexture(fdNoise, gl.MIRRORED_REPEAT, gl.MIRRORED_REPEAT, false, this.noiseTex);
    }
  }

  public resize(width: number, height: number) {
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;

    this.glCanvas.width = width;
    this.glCanvas.height = height;

    this.masks.resize(width, height);
  }

  public updateTouches(touchList: TouchPoint[], time: number) {
    const currentIds = new Set<number | string>();
    for (const t of touchList) {
      currentIds.add(t.id);
      const existing = this.touches.get(t.id);
      if (existing) {
        existing.x = t.x;
        existing.y = t.y;
        existing.scale = Math.min(1, existing.scale + 0.1);
      } else {
        this.touches.set(t.id, { x: t.x, y: t.y, scale: 0.1, startTime: time });
      }
    }

    for (const [id, t] of this.touches) {
      if (!currentIds.has(id)) {
        t.scale -= 0.1;
        if (t.scale <= 0) {
          this.touches.delete(id);
        }
      }
    }
  }

  public resetTouches() {
    this.touches.clear();
  }

  private setCommonUniforms(timeChart: number, aspect: number, hasReady: boolean) {
    const gl = this.gl;
    if (!gl) return;

    const W = this.width;
    const H = this.height;
    const maskW = this.masks.width;
    const maskH = this.masks.height;

    gl.uniform3f(this.uLocs.uView, W, H, aspect);
    gl.uniform4f(this.uLocs.uUnityTime, timeChart / 20.0, timeChart, timeChart * 2.0, timeChart * 3.0);
    gl.uniform4f(this.uLocs._ScreenParams, W, H, 1.0 + 1.0 / W, 1.0 + 1.0 / H);
    gl.uniform4f(this.uLocs._EffectRT_TexelSize, 1.0 / maskW, 1.0 / maskH, maskW, maskH);
    gl.uniform1i(this.uLocs.uColored, 0);
    gl.uniform1f(this.uLocs.uReadyExtra, hasReady ? 1.0 : 0.0);

    // Official Phira-Pro constants
    gl.uniform1f(this.uLocs._EdgeOpacity, 0.8);
    gl.uniform1f(this.uLocs._FillStrength, 0.667);
    gl.uniform1f(this.uLocs._FillOpacity, 0.667);
    gl.uniform1f(this.uLocs._GlowIntensity, 0.8);
    gl.uniform1f(this.uLocs._SparkMapOpacity, 5.69);
    gl.uniform1f(this.uLocs._SparkHueShiftAmount, 0.2);
    gl.uniform1f(this.uLocs._SparkDisplaceIntensity, 2.39);
    gl.uniform1f(this.uLocs._DisplaceBlendIntensity, 0.411);
    gl.uniform1f(this.uLocs._DisplaceSpeed, 1.5);
    gl.uniform1f(this.uLocs._DisplaceStrength, 0.15);
    gl.uniform1f(this.uLocs._TouchPosRadius, 0.5);
    gl.uniform1f(this.uLocs._TouchPosSDFSmoothness, 0.47);
    gl.uniform1f(this.uLocs._TouchPosSDFFalloff, 0.41);
    gl.uniform1f(this.uLocs._BackgroundPixelScale, 6.0);
    gl.uniform1f(this.uLocs.uDisabledFillOpacity, 0.4);
    gl.uniform1f(this.uLocs.uDisabledSparkOpacity, 3.5);
    gl.uniform1f(this.uLocs.uDisabledSparkIntensity, 2.29);
    gl.uniform1f(this.uLocs.uDisabledSpeed, 0.3);
    gl.uniform1f(this.uLocs._ShineSpeed, 37.9);
    gl.uniform1f(this.uLocs._ShineBrightness, 0.12);
    gl.uniform1f(this.uLocs._TouchDisplaceSpeed, 2.9);
    gl.uniform1f(this.uLocs._TouchDisplaceStrength, 0.08);
    gl.uniform1f(this.uLocs._NoiseEvoSpeed, 0.03);
    gl.uniform1f(this.uLocs._NoiseDirChangeSpeed, 60.0);
    gl.uniform1f(this.uLocs._NoiseDisplaceStrength, 1.0);
    gl.uniform1f(this.uLocs._NoiseRadius, 0.48);
    gl.uniform1f(this.uLocs._NoiseSmoothness, 1.0);
    gl.uniform1f(this.uLocs._SDFCellSize, 0.11);
    gl.uniform1f(this.uLocs._SDFSmoothness, 0.63);
    gl.uniform1f(this.uLocs._SDFFalloff, 0.34);
    gl.uniform1f(this.uLocs._SDFMoveSpeed, 9.3);
    gl.uniform1f(this.uLocs._TouchBackgroundPixelScale, 8.0);

    const touchShine = (0.63 + 0.37 * (Math.sin(timeChart * 43.0) * 0.5 + 0.5)) * 2.0;
    gl.uniform1f(this.uLocs._TouchPosShine, touchShine);

    gl.uniform4f(this.uLocs._EdgeColor, 1.0, 0.33018857, 0.33018857, 1.0);
    gl.uniform4f(this.uLocs._FillColor, 0.7132075, 0.23549296, 0.23549296, 1.0);
    gl.uniform4f(this.uLocs._GlowColor, 1.0, 0.17924517, 0.17924517, 1.0);
    gl.uniform4f(this.uLocs._DisplaceDirection, 1.0, 1.0, 0.0, 0.0);
    gl.uniform4f(this.uLocs.uDisabledFillColor, 0.497, 0.13766898, 0.13766898, 1.0);
    gl.uniform4f(this.uLocs._ShineColor, 1.0, 1.0, 1.0, 1.0);
    gl.uniform4f(this.uLocs._TouchDisplaceDirection, 1.0, 1.0, 0.0, 0.0);
    gl.uniform4f(this.uLocs._NoiseTint, 1.0, 0.0, 0.0, 1.0);
    gl.uniform4f(this.uLocs._TouchGlowColor, 1.0, 0.0, 0.0, 1.0);
    gl.uniform3f(this.uLocs._SparkTint, 1.0, 0.28490567, 0.28490567);
    gl.uniform3f(this.uLocs.uDisabledSparkTint, 0.31132078, 0.077830195, 0.077830195);

    // Touch array uniforms
    const touchArr = Array.from(this.touches.values());
    const touchCount = Math.min(10, touchArr.length);
    gl.uniform1i(this.uLocs._TouchPosCount, touchCount);
    for (let i = 0; i < 10; i++) {
      const loc = this.uLocs[`_TouchPos[${i}]`];
      if (loc) {
        if (i < touchCount) {
          const t = touchArr[i];
          const u = (t.x / W) * aspect;
          const v = 1.0 - (t.y / H);
          gl.uniform2f(loc, u, v);
        } else {
          gl.uniform2f(loc, 0.0, 0.0);
        }
      }
    }
  }

  private bindTextures() {
    const gl = this.gl;
    if (!gl) return;

    const bind = (unit: number, loc: WebGLUniformLocation | null, tex: WebGLTexture | null) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex || this.emptyTex);
      if (loc) gl.uniform1i(loc, unit);
    };

    bind(0, this.uLocs.uDisplaceTex, this.displaceTex);
    bind(1, this.uLocs.uSparkTex, this.sparkTex);
    bind(2, this.uLocs.uNoiseTex, this.noiseTex);
    bind(3, this.uLocs.uScene, this.sceneTex);
    bind(4, this.uLocs.uMasks, this.masksTex);
    bind(5, this.uLocs.uAuxMasks, this.auxMaskTex);
    bind(6, this.uLocs.uActiveColors, this.emptyTex);
    bind(7, this.uLocs.uDisabledColors, this.emptyTex);
  }

  private uploadMasks() {
    const gl = this.gl;
    if (!gl) return;

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    gl.bindTexture(gl.TEXTURE_2D, this.masksTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.masks.width, this.masks.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.masks.rgba);

    gl.bindTexture(gl.TEXTURE_2D, this.auxMaskTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.masks.width, this.masks.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.masks.auxRgba);
  }

  /**
   * Draw Disabled Block Zones (Pass 1 - Background layer order 2, before lines & notes).
   */
  public drawDisabled(
    ctx: CanvasRenderingContext2D,
    aspect: number,
    blockAreas: any[],
    timeChart: number,
    enabledShader: boolean
  ) {
    if (blockAreas.length === 0) return;

    const zones: Zone[] = [];
    for (const area of blockAreas) {
      const z = zoneFromArea(area, timeChart, aspect);
      if (z) zones.push(z);
    }

    const hasDisabled = zones.some(z => !z.active && z.opacity > 0);
    if (!hasDisabled) return;

    if (!enabledShader || !this.gl || !this.mainProgram) {
      drawBlockSimple(ctx, aspect, zones, true);
      return;
    }

    const gl = this.gl;
    this.resize(ctx.canvas.width, ctx.canvas.height);

    // Rasterize masks (disabled layer doesn't need active touches)
    this.masks.render(this.width, this.height, aspect, zones, timeChart, []);
    this.uploadMasks();

    // Render WebGL Disabled layer (uLayer = 0)
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.mainProgram);
    this.bindTextures();
    this.setCommonUniforms(timeChart, aspect, false);

    gl.uniform1i(this.uLocs.uLayer, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE); // Additive blending for disabled sparkles & glow

    const posLoc = gl.getAttribLocation(this.mainProgram, 'aPosition');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disableVertexAttribArray(posLoc);
    gl.disable(gl.BLEND);

    // Blit to 2D canvas with additive / lighter blend
    ctx.save();
    ctx.resetTransform();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1.0;
    ctx.drawImage(this.glCanvas, 0, 0);
    ctx.restore();
  }

  /**
   * Draw Active Block Zones Overlay (Pass 2 - After notes & hit fx, BEFORE HUD).
   */
  public drawActive(
    ctx: CanvasRenderingContext2D,
    aspect: number,
    blockAreas: any[],
    timeChart: number,
    enabledShader: boolean
  ) {
    if (blockAreas.length === 0) return;

    const zones: Zone[] = [];
    let hasActive = false;
    let hasReady = false;

    for (const area of blockAreas) {
      const z = zoneFromArea(area, timeChart, aspect);
      if (z) {
        zones.push(z);
        if (z.active) hasActive = true;
        if (z.ready) hasReady = true;
      }
    }

    const hoverActive = this.touches.size > 0;
    if (!hasActive && !hasReady && !hoverActive) return;

    if (!enabledShader || !this.gl || !this.mainProgram) {
      drawBlockSimple(ctx, aspect, zones, false);
      return;
    }

    const gl = this.gl;
    this.resize(ctx.canvas.width, ctx.canvas.height);

    // Capture scene canvas BEFORE any HUD or text is rendered!
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, ctx.canvas);

    // Rasterize masks with touch dissolution
    const touchList: Array<{ x: number; y: number; scale: number }> = [];
    for (const t of this.touches.values()) {
      if (t.scale > 0) touchList.push(t);
    }

    this.masks.render(this.width, this.height, aspect, zones, timeChart, touchList);
    this.uploadMasks();

    // Render WebGL Active overlay (uLayer = 3)
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.mainProgram);
    this.bindTextures();
    this.setCommonUniforms(timeChart, aspect, hasReady);

    gl.uniform1i(this.uLocs.uLayer, 3);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // Premultiplied alpha composite

    const posLoc = gl.getAttribLocation(this.mainProgram, 'aPosition');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disableVertexAttribArray(posLoc);
    gl.disable(gl.BLEND);

    // Blit to 2D canvas with source-over
    ctx.save();
    ctx.resetTransform();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1.0;
    ctx.drawImage(this.glCanvas, 0, 0);
    ctx.restore();
  }
}
