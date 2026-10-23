// CPU equivalent of mask rasterization, edge extraction and glow dilation
import { Zone, DEFAULT_BLOCK_COLOR } from './BlockSimple';

export function zoneFromArea(area: any, time: number, aspect: number): Zone | null {
  if (!area.visible) return null;
  const trCenter = area.chartCenter || { x: 0, y: 0 };
  const trSize = area.chartSize || { x: 0, y: 0 };
  const halfX = Math.abs(trSize.x) * 0.5;
  const halfY = Math.abs(trSize.y) * 0.5;
  if (halfX <= 0 || halfY <= 0) return null;

  let active = false;
  let ready = false;
  if (area.rpeArea?.getPhase) {
    const phase = area.rpeArea.getPhase(time);
    active = phase === 2;
    ready = phase === 1;
  } else {
    active = area.activeIntervals && area.activeIntervals.length > 0
      ? area.activeIntervals.some((i: any) => time >= i.start && time < i.end)
      : time >= area.enableTime && time < area.disableTime;
    ready = !active && (
      area.activeIntervals && area.activeIntervals.length > 0
        ? area.activeIntervals.some((i: any) => (i.readyFlash ?? 0.5) > 0 && time >= i.start - (i.readyFlash ?? 0.5) && time < i.start)
        : time >= area.enableTime - 0.5 && time < area.enableTime
    );
  }
  const angle = -(area.chartRotation || 0) * Math.PI / 180;
  const fadesIn = area.appearTime < area.enableTime;
  const opacity = (!area.rpeCanvas && !active && fadesIn)
    ? Math.max(0, Math.min(1, (time - area.appearTime) / 0.5))
    : 1.0;

  return {
    line2area: !!area.rpeCanvas,
    y_scale: area.rpeCanvas ? 1.5 / aspect : 1.0,
    color: DEFAULT_BLOCK_COLOR,
    center: trCenter,
    half: { x: halfX, y: halfY },
    angle,
    invert: !!area.isSubtract,
    active,
    ready,
    opacity
  };
}

export function rasterRows(
  width: number,
  height: number,
  aspect: number,
  zone: Zone,
  write: (y: number, first: number, last: number) => void
) {
  if (zone.half.x <= 0 || zone.half.y <= 0) return;
  const s = Math.sin(zone.angle);
  const c = Math.cos(zone.angle);
  const yHalf = (Math.abs(s) * zone.half.x + Math.abs(c) * zone.half.y) * zone.y_scale;
  const start = Math.max(0, Math.min(height, Math.ceil(((zone.center.y - yHalf) * aspect + 1) * height * 0.5 - 0.5)));
  const end = Math.max(0, Math.min(height, Math.floor(((zone.center.y + yHalf) * aspect + 1) * height * 0.5 - 0.5) + 1));

  for (let y = start; y < end; y++) {
    const dy = (((y + 0.5) * 2 / height - 1) / aspect - zone.center.y) / zone.y_scale;
    let lo = -1.0;
    let hi = 1.0;

    for (const [a, b, half] of [
      [c, s * dy, zone.half.x],
      [-s, c * dy, zone.half.y]
    ]) {
      if (Math.abs(a) < 1e-7) {
        if (Math.abs(b) > half) {
          hi = lo - 1;
          break;
        }
      } else {
        const a0 = (-half - b) / a + zone.center.x;
        const a1 = (half - b) / a + zone.center.x;
        lo = Math.max(lo, Math.min(a0, a1));
        hi = Math.min(hi, Math.max(a0, a1));
      }
    }

    if (lo > hi) continue;
    const first = Math.max(0, Math.min(width, Math.ceil((lo + 1) * width * 0.5 - 0.5)));
    const last = Math.max(0, Math.min(width, Math.floor((hi + 1) * width * 0.5 - 0.5) + 1));
    if (first < last) {
      write(y, first, last);
    }
  }
}

// 6 passes of dilation weights: ((6 - pass)^2.65) / sum
const GLOW_WEIGHTS: number[] = (() => {
  let sum = 0;
  for (let k = 1; k <= 6; k++) sum += Math.pow(k, 2.65);
  const w: number[] = [];
  for (let pass = 0; pass < 6; pass++) {
    w.push(Math.pow(6 - pass, 2.65) / sum);
  }
  return w;
})();

export class BlockMasks {
  public width = 0;
  public height = 0;

  // Output buffers uploaded to WebGL textures
  // uMasks: RGBA = (active Compose, Edge, Glow, disabled Compose)
  public rgba: Uint8Array = new Uint8Array(0);
  // uAuxMasks: RGB = (ready-only Normal, ready-only Subtract, disabled Compose), A = hover mask
  public auxRgba: Uint8Array = new Uint8Array(0);

  // Scratch planes for scanline coverage
  private activeNormal: Uint8Array = new Uint8Array(0);
  private activeSubtract: Uint8Array = new Uint8Array(0);
  private disabledNormal: Uint8Array = new Uint8Array(0);
  private disabledSubtract: Uint8Array = new Uint8Array(0);
  private readyNormal: Uint8Array = new Uint8Array(0);
  private readySubtract: Uint8Array = new Uint8Array(0);

  // Ring dilation scratch buffers
  private ping: Uint8Array = new Uint8Array(0);
  private pong: Uint8Array = new Uint8Array(0);
  private horiz: Uint8Array = new Uint8Array(0);

  // Noise displacement texture pixels for compose_uv
  private displacePixels: Uint8Array | null = null;
  private displaceWidth = 0;
  private displaceHeight = 0;

  public setDisplaceImage(img: HTMLImageElement) {
    if (!img.complete || img.naturalWidth === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    this.displacePixels = new Uint8Array(data.data.buffer);
    this.displaceWidth = canvas.width;
    this.displaceHeight = canvas.height;
  }

  public resize(width: number, height: number) {
    // Half-res matching EffectRT dimensions (e.g. 480x270 for 1080p)
    const bw = Math.max(1, Math.floor(width / 8)) * 2;
    const bh = Math.max(1, Math.floor(height / 8)) * 2;

    if (this.width === bw && this.height === bh) return;

    this.width = bw;
    this.height = bh;
    const size = bw * bh;

    this.rgba = new Uint8Array(size * 4);
    this.auxRgba = new Uint8Array(size * 4);

    this.activeNormal = new Uint8Array(size);
    this.activeSubtract = new Uint8Array(size);
    this.disabledNormal = new Uint8Array(size);
    this.disabledSubtract = new Uint8Array(size);
    this.readyNormal = new Uint8Array(size);
    this.readySubtract = new Uint8Array(size);

    this.ping = new Uint8Array(size);
    this.pong = new Uint8Array(size);
    this.horiz = new Uint8Array(size);
  }

  // Noise warp uses precomputed separable lookups (see render): same math as
  // sampling the displace texture at (d*t + u*2.13, d*t + v*1.02) and
  // (-d*t + u*2.13, d*t + v*1.02), then rotating by 45deg * 0.1.

  // Frame cache: disabled and active passes share identical zone masks within a frame
  private cacheKey: unknown = null;
  private cacheTime = NaN;
  private cacheW = 0;
  private cacheH = 0;
  private cacheAspect = 0;
  private hoverDirty = false;
  private ringRegion = { x0: 0, y0: 0, x1: 0, y1: 0, valid: false };

  // Warp lookup tables (separable)
  private colA: Int32Array = new Int32Array(0);
  private colB: Int32Array = new Int32Array(0);
  private colU: Float32Array = new Float32Array(0);

  private mirrorIndex(c: number, n: number): number {
    let r = ((c % 2) + 2) % 2;
    if (r > 1) r = 2 - r;
    const i = Math.floor(r * n);
    return i < 0 ? 0 : i > n - 1 ? n - 1 : i;
  }

  public render(
    canvasWidth: number,
    canvasHeight: number,
    aspect: number,
    zones: Zone[],
    time: number,
    touches: Array<{ x: number; y: number; scale: number }>,
    cacheKey?: unknown
  ) {
    this.resize(canvasWidth, canvasHeight);
    const bw = this.width;
    const bh = this.height;
    const size = bw * bh;

    if (
      cacheKey !== undefined &&
      this.cacheKey === cacheKey &&
      this.cacheTime === time &&
      this.cacheW === canvasWidth &&
      this.cacheH === canvasHeight &&
      this.cacheAspect === aspect
    ) {
      this.renderHover(canvasWidth, canvasHeight, aspect, touches);
      return;
    }
    this.cacheKey = cacheKey === undefined ? null : cacheKey;
    this.cacheTime = time;
    this.cacheW = canvasWidth;
    this.cacheH = canvasHeight;
    this.cacheAspect = aspect;
    this.hoverDirty = false;
    this.ringRegion.valid = false;

    // Reset scratch planes
    this.activeNormal.fill(0);
    this.activeSubtract.fill(0);
    this.disabledNormal.fill(0);
    this.disabledSubtract.fill(0);
    this.readyNormal.fill(0);
    this.readySubtract.fill(0);
    this.rgba.fill(0);
    this.auxRgba.fill(0);

    // Rasterize all zone spans into coverage planes
    for (const z of zones) {
      if (z.half.x <= 0 || z.half.y <= 0) continue;

      if (z.active) {
        if (z.invert) {
          rasterRows(bw, bh, aspect, z, (y, first, last) => {
            const rowOffset = y * bw;
            for (let x = first; x < last; x++) this.activeSubtract[rowOffset + x] = 255;
          });
        } else {
          rasterRows(bw, bh, aspect, z, (y, first, last) => {
            const rowOffset = y * bw;
            for (let x = first; x < last; x++) this.activeNormal[rowOffset + x] = 255;
          });
        }
      } else {
        const opByte = Math.round(z.opacity * 255);
        if (z.invert) {
          rasterRows(bw, bh, aspect, z, (y, first, last) => {
            const rowOffset = y * bw;
            for (let x = first; x < last; x++) this.disabledSubtract[rowOffset + x] = opByte;
          });
        } else {
          rasterRows(bw, bh, aspect, z, (y, first, last) => {
            const rowOffset = y * bw;
            for (let x = first; x < last; x++) this.disabledNormal[rowOffset + x] = opByte;
          });
        }

        if (z.ready) {
          if (z.invert) {
            rasterRows(bw, bh, aspect, z, (y, first, last) => {
              const rowOffset = y * bw;
              for (let x = first; x < last; x++) this.readySubtract[rowOffset + x] = 255;
            });
          } else {
            rasterRows(bw, bh, aspect, z, (y, first, last) => {
              const rowOffset = y * bw;
              for (let x = first; x < last; x++) this.readyNormal[rowOffset + x] = 255;
            });
          }
        }
      }
    }

    // Compose Base Planes
    // Active compose: normal XOR subtract
    const rawActive = this.ping;
    let minX = bw;
    let minY = bh;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < bh; y++) {
      const rowOffset = y * bw;
      for (let x = 0; x < bw; x++) {
        const i = rowOffset + x;
        const isAct = (this.activeNormal[i] > 0) !== (this.activeSubtract[i] > 0);
        const val = isAct ? 255 : 0;
        rawActive[i] = val;
        if (val > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // Apply noise warping to Active Compose plane within bounds + padding
    if (maxX >= minX && maxY >= minY) {
      const padX = Math.ceil(bw * 0.072) + 1;
      const padY = Math.ceil(bh * 0.072) + 1;
      const x0 = Math.max(0, minX - padX);
      const y0 = Math.max(0, minY - padY);
      const x1 = Math.min(bw, maxX + padX + 1);
      const y1 = Math.min(bh, maxY + padY + 1);

      const px = this.displacePixels;
      const dw = this.displaceWidth;
      const dh = this.displaceHeight;
      const d = 0.70710678;
      const t = (time / 20.0) * 2.59;
      const dt = d * t;

      if (this.colA.length < bw) {
        this.colA = new Int32Array(bw);
        this.colB = new Int32Array(bw);
        this.colU = new Float32Array(bw);
      }
      const colA = this.colA;
      const colB = this.colB;
      const colU = this.colU;
      const hasNoise = !!px && dw > 0;

      if (hasNoise) {
        for (let x = x0; x < x1; x++) {
          const u = (x + 0.5) / bw;
          const st0 = u * 2.13;
          colU[x] = u;
          colA[x] = this.mirrorIndex(dt + st0, dw) * 4;
          colB[x] = this.mirrorIndex(-dt + st0, dw) * 4;
        }
      }

      const rgba = this.rgba;
      const k = d * 0.1 / 255.0;
      for (let y = y0; y < y1; y++) {
        const v = (y + 0.5) / bh;
        const rowOffset = y * bw;
        const rowN = hasNoise ? this.mirrorIndex(dt + v * 1.02, dh) * dw * 4 : 0;
        for (let x = x0; x < x1; x++) {
          let wu = (x + 0.5) / bw;
          let wv = v;
          if (hasNoise) {
            const a = px![rowN + colA[x]] - 127.5;
            const b = px![rowN + colB[x]] - 127.5;
            wu += (a - b) * k;
            wv += (a + b) * k;
          }
          if (wu < 0 || wu >= 1 || wv < 0 || wv >= 1) {
            rgba[(rowOffset + x) * 4] = 0;
          } else {
            let sx = Math.floor(wu * bw);
            let sy = Math.floor(wv * bh);
            if (sx > bw - 1) sx = bw - 1;
            if (sy > bh - 1) sy = bh - 1;
            rgba[(rowOffset + x) * 4] = rawActive[sy * bw + sx];
          }
        }
      }

      this.ringRegion.x0 = Math.max(0, x0 - 6);
      this.ringRegion.y0 = Math.max(0, y0 - 6);
      this.ringRegion.x1 = Math.min(bw, x1 + 6);
      this.ringRegion.y1 = Math.min(bh, y1 + 6);
      this.ringRegion.valid = true;
    }

    // Disabled compose (masked by !active) and Aux Mask: R=readyNormal, G=readySubtract, B=disabledCompose
    {
      const rgba = this.rgba;
      const aux = this.auxRgba;
      const dN = this.disabledNormal;
      const dS = this.disabledSubtract;
      const rN = this.readyNormal;
      const rS = this.readySubtract;
      for (let i = 0, j = 0; i < size; i++, j += 4) {
        const dVal = rgba[j] > 0 ? 0 : (dS[i] > 0 ? 0 : dN[i]);
        rgba[j + 3] = dVal;
        aux[j] = rN[i];
        aux[j + 1] = rS[i];
        aux[j + 2] = dVal;
      }
    }

    // Render Rings (Edge & Glow Dilation) on Active Compose
    this.renderRings();

    this.renderHover(canvasWidth, canvasHeight, aspect, touches);
  }

  /** Touch hover footprint into uAuxMasks.a, limited to each touch's bounds. */
  private renderHover(
    canvasWidth: number,
    canvasHeight: number,
    aspect: number,
    touches: Array<{ x: number; y: number; scale: number }>
  ) {
    const bw = this.width;
    const bh = this.height;
    const aux = this.auxRgba;

    if (this.hoverDirty) {
      for (let j = 3, n = bw * bh * 4; j < n; j += 4) aux[j] = 0;
      this.hoverDirty = false;
    }
    if (touches.length === 0) return;

    const radius = 0.25; // ~25% screen height
    const rSq = radius * radius;

    for (const t of touches) {
      if (t.scale <= 0) continue;
      const cx = t.x / canvasWidth;
      const cy = 1.0 - t.y / canvasHeight;
      const rx = radius / aspect;
      const xa = Math.max(0, Math.floor((cx - rx) * bw - 0.5));
      const xb = Math.min(bw, Math.ceil((cx + rx) * bw + 0.5));
      const ya = Math.max(0, Math.floor((cy - radius) * bh - 0.5));
      const yb = Math.min(bh, Math.ceil((cy + radius) * bh + 0.5));

      for (let y = ya; y < yb; y++) {
        const dy = (y + 0.5) / bh - cy;
        const dy2 = dy * dy;
        if (dy2 >= rSq) continue;
        const rowOffset = y * bw;
        for (let x = xa; x < xb; x++) {
          const dx = ((x + 0.5) / bw - cx) * aspect;
          const distSq = dx * dx + dy2;
          if (distSq < rSq) {
            const falloff = Math.max(0, 1.0 - Math.sqrt(distSq) / radius);
            const val = Math.round(falloff * falloff * (3 - 2 * falloff) * t.scale * 255);
            const idx = (rowOffset + x) * 4 + 3;
            if (val > aux[idx]) aux[idx] = val;
          }
        }
      }
      this.hoverDirty = true;
    }
  }

  private renderRings() {
    const w = this.width;
    const reg = this.ringRegion;
    // No active pixels: edge and glow stay zero (buffer already cleared)
    if (!reg.valid) return;
    const { x0, y0, x1, y1 } = reg;
    const rgba = this.rgba;
    let ping = this.ping;
    let pong = this.pong;
    const horiz = this.horiz;

    for (let y = y0; y < y1; y++) {
      const row = y * w;
      for (let x = x0; x < x1; x++) ping[row + x] = rgba[(row + x) * 4];
    }

    for (let pass = 0; pass < GLOW_WEIGHTS.length; pass++) {
      const weight = GLOW_WEIGHTS[pass];
      if (weight < 0.01) break;

      // Separable 3x3 max filter (clamped to the active region; outside is empty)
      for (let y = y0; y < y1; y++) {
        const row = y * w;
        for (let x = x0; x < x1; x++) {
          const l = x > x0 ? ping[row + x - 1] : ping[row + x];
          const r = x < x1 - 1 ? ping[row + x + 1] : ping[row + x];
          const c = ping[row + x];
          horiz[row + x] = l > c ? (l > r ? l : r) : (c > r ? c : r);
        }
      }

      for (let y = y0; y < y1; y++) {
        const above = (y > y0 ? y - 1 : y) * w;
        const current = y * w;
        const below = (y < y1 - 1 ? y + 1 : y) * w;

        for (let x = x0; x < x1; x++) {
          const a = horiz[above + x];
          const b = horiz[current + x];
          const c = horiz[below + x];
          const maximum = a > b ? (a > c ? a : c) : (b > c ? b : c);
          pong[current + x] = maximum;

          const delta = maximum - ping[current + x];
          const dst = (current + x) * 4;

          if (pass === 0) {
            rgba[dst + 1] = delta; // Edge channel
          }

          if (delta > 0 && rgba[dst] < 255) {
            const outside = 1.0 - rgba[dst] / 255.0;
            const glowDelta = weight * (outside * (delta / 255.0)) * 255.0;
            const g = rgba[dst + 2] + Math.round(glowDelta);
            rgba[dst + 2] = g > 255 ? 255 : g;
          }
        }
      }

      const tmp = ping;
      ping = pong;
      pong = tmp;
    }

    this.ping = ping;
    this.pong = pong;
  }
}
