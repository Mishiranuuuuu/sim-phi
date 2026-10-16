// CPU equivalent of mask rasterization, edge extraction and glow dilation
import { Zone, DEFAULT_BLOCK_COLOR } from './BlockSimple';

export function zoneFromArea(area: any, time: number, aspect: number): Zone | null {
  if (!area.visible) return null;
  const trCenter = area.chartCenter || { x: 0, y: 0 };
  const trSize = area.chartSize || { x: 0, y: 0 };
  const halfX = Math.abs(trSize.x) * 0.5;
  const halfY = Math.abs(trSize.y) * 0.5;
  if (halfX <= 0 || halfY <= 0) return null;

  const active = time >= area.enableTime && time < area.disableTime;
  const ready = !active && time >= area.enableTime - 0.5 && time < area.enableTime;
  const angle = (area.chartRotation || 0) * Math.PI / 180;
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

  private sampleNoise(u: number, v: number): number {
    if (!this.displacePixels || this.displaceWidth === 0) return 0.5;
    const w = this.displaceWidth;
    const h = this.displaceHeight;

    let ru = ((u % 2) + 2) % 2;
    if (ru > 1) ru = 2 - ru;
    let rv = ((v % 2) + 2) % 2;
    if (rv > 1) rv = 2 - rv;

    const x = Math.min(w - 1, Math.max(0, Math.floor(ru * w)));
    const y = Math.min(h - 1, Math.max(0, Math.floor(rv * h)));
    return this.displacePixels[(y * w + x) * 4] / 255.0;
  }

  private composeUv(u: number, v: number, time: number): [number, number] {
    const d = 0.70710678;
    const t = (time / 20.0) * 2.59;
    const st0 = u * 2.13;
    const st1 = v * 1.02;

    const a = this.sampleNoise(d * t + st0, d * t + st1) - 0.5;
    const b = this.sampleNoise(-d * t + st0, d * t + st1) - 0.5;

    return [(d * a - b * d) * 0.1 + u, (d * a + b * d) * 0.1 + v];
  }

  public render(
    canvasWidth: number,
    canvasHeight: number,
    aspect: number,
    zones: Zone[],
    time: number,
    touches: Array<{ x: number; y: number; scale: number }>
  ) {
    this.resize(canvasWidth, canvasHeight);
    const bw = this.width;
    const bh = this.height;
    const size = bw * bh;

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

      for (let y = y0; y < y1; y++) {
        const v = (y + 0.5) / bh;
        const rowOffset = y * bw;
        for (let x = x0; x < x1; x++) {
          const u = (x + 0.5) / bw;
          const [wu, wv] = this.composeUv(u, v, time);
          if (wu < 0 || wu >= 1 || wv < 0 || wv >= 1) {
            this.rgba[(rowOffset + x) * 4 + 0] = 0;
          } else {
            const sx = Math.min(bw - 1, Math.max(0, Math.floor(wu * bw)));
            const sy = Math.min(bh - 1, Math.max(0, Math.floor(wv * bh)));
            this.rgba[(rowOffset + x) * 4 + 0] = rawActive[sy * bw + sx];
          }
        }
      }
    }

    // Disabled compose: normal - subtract (masked by !active)
    for (let i = 0; i < size; i++) {
      if (this.rgba[i * 4 + 0] > 0) {
        this.rgba[i * 4 + 3] = 0;
      } else {
        const dNorm = this.disabledNormal[i];
        const dSub = this.disabledSubtract[i];
        const dVal = dSub > 0 ? 0 : dNorm;
        this.rgba[i * 4 + 3] = dVal;
      }
    }

    // Populate Aux Mask: R=readyNormal, G=readySubtract, B=disabledCompose
    for (let i = 0; i < size; i++) {
      this.auxRgba[i * 4 + 0] = this.readyNormal[i];
      this.auxRgba[i * 4 + 1] = this.readySubtract[i];
      this.auxRgba[i * 4 + 2] = this.rgba[i * 4 + 3];
    }

    // Render Rings (Edge & Glow Dilation) on Active Compose
    this.renderRings();

    // Render Touch Hover footprint into uAuxMasks.a
    if (touches.length > 0) {
      const radius = 0.25; // ~25% screen height
      const rSq = radius * radius;

      for (let y = 0; y < bh; y++) {
        const py = (y + 0.5) / bh;
        const rowOffset = y * bw;

        for (let x = 0; x < bw; x++) {
          const px = (x + 0.5) / bw;
          let maxHover = 0;

          for (const t of touches) {
            if (t.scale <= 0) continue;
            const dx = (px - t.x / canvasWidth) * aspect;
            const dy = py - (1.0 - t.y / canvasHeight);
            const distSq = dx * dx + dy * dy;

            if (distSq < rSq) {
              const d = Math.sqrt(distSq);
              const falloff = Math.max(0, 1.0 - d / radius);
              const val = falloff * falloff * (3 - 2 * falloff) * t.scale;
              if (val > maxHover) maxHover = val;
            }
          }

          this.auxRgba[(rowOffset + x) * 4 + 3] = Math.round(maxHover * 255);
        }
      }
    }
  }

  private renderRings() {
    const w = this.width;
    const h = this.height;

    // Copy initial active mask to ping buffer
    for (let i = 0; i < w * h; i++) {
      this.ping[i] = this.rgba[i * 4 + 0];
    }

    for (let pass = 0; pass < GLOW_WEIGHTS.length; pass++) {
      const weight = GLOW_WEIGHTS[pass];
      if (weight < 0.01) break;

      // Fast separable 3x3 max filter
      // 1. Horizontal pass
      for (let y = 0; y < h; y++) {
        const row = y * w;
        this.horiz[row] = Math.max(this.ping[row], this.ping[row + Math.min(w - 1, 1)]);
        for (let x = 1; x < w - 1; x++) {
          this.horiz[row + x] = Math.max(this.ping[row + x - 1], this.ping[row + x], this.ping[row + x + 1]);
        }
        if (w > 1) {
          this.horiz[row + w - 1] = Math.max(this.ping[row + w - 1], this.ping[row + w - 2]);
        }
      }

      // 2. Vertical pass & accumulate Edge + Glow
      for (let y = 0; y < h; y++) {
        const above = Math.max(0, y - 1) * w;
        const current = y * w;
        const below = Math.min(h - 1, y + 1) * w;

        for (let x = 0; x < w; x++) {
          const maximum = Math.max(this.horiz[above + x], this.horiz[current + x], this.horiz[below + x]);
          this.pong[current + x] = maximum;

          const delta = maximum - this.ping[current + x];
          const dst = (current + x) * 4;

          if (pass === 0) {
            this.rgba[dst + 1] = delta; // Edge channel
          }

          if (delta > 0 && this.rgba[dst + 0] < 255) {
            const outside = 1.0 - this.rgba[dst + 0] / 255.0;
            const glowDelta = weight * (outside * (delta / 255.0)) * 255.0;
            this.rgba[dst + 2] = Math.min(255, this.rgba[dst + 2] + Math.round(glowDelta));
          }
        }
      }

      // Swap ping and pong
      const tmp = this.ping;
      this.ping = this.pong;
      this.pong = tmp;
    }
  }
}
