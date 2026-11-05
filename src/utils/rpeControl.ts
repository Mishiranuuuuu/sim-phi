import { easing } from '../extends/pec/easing.js';
import { cubicBezier } from '../extends/pec/cubicBezier.js';

export interface ControlEvent {
  x: number;
  easing?: number;
  easingType?: number;
  pos?: number;
  size?: number;
  alpha?: number;
  y?: number;
  skew?: number;
  val?: number;
  easingLeft?: number;
  easingRight?: number;
  bezier?: number;
  bezierPoints?: [number, number, number, number];
}

interface ControlSegment {
  x0: number;
  x1: number;
  minX: number;
  maxX: number;
  invDenom: number;
  v0: number;
  v1: number;
  easeFn?: (t: number) => number;
}

export class ControlTrack {
  private segments: ControlSegment[];
  private isMonotonicAsc = true;
  private lastIdx = 0;
  public defaultValue: number;
  public hasEvents: boolean;

  public constructor(rawEvents: ControlEvent[] | undefined, valueKey: string, defaultValue: number) {
    this.defaultValue = defaultValue;
    this.segments = [];
    this.hasEvents = false;

    if (!Array.isArray(rawEvents) || rawEvents.length === 0) return;

    if (rawEvents.length === 1) {
      const v = (rawEvents[0] as any)[valueKey] ?? rawEvents[0].val ?? defaultValue;
      const num = Number(v);
      this.defaultValue = Number.isFinite(num) ? num : defaultValue;
      this.hasEvents = true;
      return;
    }

    this.hasEvents = true;
    for (let i = 0; i < rawEvents.length - 1; i++) {
      const e0 = rawEvents[i];
      const e1 = rawEvents[i + 1];
      const x0 = Number(e0.x) || 0;
      const x1 = Number(e1.x) || 0;
      const rawV0 = (e0 as any)[valueKey] ?? e0.val ?? defaultValue;
      const rawV1 = (e1 as any)[valueKey] ?? e1.val ?? defaultValue;
      const v0 = Number.isFinite(Number(rawV0)) ? Number(rawV0) : defaultValue;
      const v1 = Number.isFinite(Number(rawV1)) ? Number(rawV1) : defaultValue;
      const easeType = Number(e0.easing ?? e0.easingType ?? 1);
      const bezier = Number(e0.bezier ?? 0);

      let easeFn: ((t: number) => number) | undefined;
      if (bezier === 1 && Array.isArray(e0.bezierPoints) && e0.bezierPoints.length === 4) {
        const [p1x, p1y, p2x, p2y] = e0.bezierPoints;
        easeFn = cubicBezier(p1x, p1y, p2x, p2y);
      } else if (easeType > 1) {
        const rawEase = easing(easeType);
        if (rawEase) {
          const eLeft = Number(e0.easingLeft ?? 0);
          const eRight = Number(e0.easingRight ?? 1);
          if (eLeft !== 0 || eRight !== 1) {
            const eHead = rawEase(eLeft);
            const eTail = rawEase(eRight);
            const range = eTail - eHead;
            if (range !== 0 && Number.isFinite(range)) {
              easeFn = t => (rawEase(eLeft + t * (eRight - eLeft)) - eHead) / range;
            } else {
              easeFn = rawEase;
            }
          } else {
            easeFn = rawEase;
          }
        }
      }
      const minX = x0 <= x1 ? x0 : x1;
      const maxX = x0 <= x1 ? x1 : x0;
      const denom = x1 - x0;
      const invDenom = denom === 0 ? 0 : 1 / denom;
      if (x0 > x1 || (i > 0 && x0 < this.segments[i - 1].x1)) {
        this.isMonotonicAsc = false;
      }
      this.segments.push({ x0, x1, minX, maxX, invDenom, v0, v1, easeFn });
    }
  }

  public sample(d: number): number {
    if (!this.hasEvents) return this.defaultValue;
    const segments = this.segments;
    const len = segments.length;
    if (len === 0) return this.defaultValue;

    if (this.isMonotonicAsc) {
      const first = segments[0];
      if (d < first.minX) return first.v0;
      const last = segments[len - 1];
      if (d > last.maxX) return last.v1;

      const cur = this.lastIdx;
      if (cur < len && (cur === 0 || d > segments[cur - 1].maxX)) {
        const seg = segments[cur];
        if (d >= seg.minX && d <= seg.maxX) {
          if (seg.v0 === seg.v1) return seg.v0;
          const t = seg.invDenom === 0 ? 0 : Math.max(0, Math.min(1, (d - seg.x0) * seg.invDenom));
          const p = seg.easeFn ? seg.easeFn(t) : t;
          return seg.v0 + (seg.v1 - seg.v0) * p;
        }
      }

      let lo = 0;
      let hi = len;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (segments[mid].maxX < d) lo = mid + 1;
        else hi = mid;
      }
      if (lo < len) {
        const seg = segments[lo];
        if (d >= seg.minX) {
          this.lastIdx = lo;
          if (seg.v0 === seg.v1) return seg.v0;
          const t = seg.invDenom === 0 ? 0 : Math.max(0, Math.min(1, (d - seg.x0) * seg.invDenom));
          const p = seg.easeFn ? seg.easeFn(t) : t;
          return seg.v0 + (seg.v1 - seg.v0) * p;
        }
      }
    } else {
      for (let i = 0; i < len; i++) {
        const seg = segments[i];
        if (d >= seg.minX && d <= seg.maxX) {
          if (seg.v0 === seg.v1) return seg.v0;
          const t = seg.invDenom === 0 ? 0 : Math.max(0, Math.min(1, (d - seg.x0) * seg.invDenom));
          const p = seg.easeFn ? seg.easeFn(t) : t;
          return seg.v0 + (seg.v1 - seg.v0) * p;
        }
      }
    }

    // Clamp to nearest segment endpoint if outside range
    const first = segments[0];
    const last = segments[len - 1];
    const distFirst = Math.abs(d - first.x0);
    const distLast = Math.abs(d - last.x1);
    return distFirst <= distLast ? first.v0 : last.v1;
  }
}

export interface LineControlTracks {
  pos?: ControlTrack;
  size?: ControlTrack;
  alpha?: ControlTrack;
  y?: ControlTrack;
  skew?: ControlTrack;
  hasAny: boolean;
}

export function createControlTracks(line: {
  posControl?: ControlEvent[];
  sizeControl?: ControlEvent[];
  alphaControl?: ControlEvent[];
  yControl?: ControlEvent[];
  skewControl?: ControlEvent[];
}): LineControlTracks {
  const pos = line.posControl?.length ? new ControlTrack(line.posControl, 'pos', 1.0) : undefined;
  const size = line.sizeControl?.length ? new ControlTrack(line.sizeControl, 'size', 1.0) : undefined;
  const alpha = line.alphaControl?.length ? new ControlTrack(line.alphaControl, 'alpha', 1.0) : undefined;
  const y = line.yControl?.length ? new ControlTrack(line.yControl, 'y', 1.0) : undefined;
  const skew = line.skewControl?.length ? new ControlTrack(line.skewControl, 'skew', 0.0) : undefined;
  const hasAny = !!(pos?.hasEvents || size?.hasEvents || alpha?.hasEvents || y?.hasEvents || skew?.hasEvents);
  return { pos, size, alpha, y, skew, hasAny };
}
