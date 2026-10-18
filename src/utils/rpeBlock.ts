// RPE noise field converter: supports both rpe-next blockAreaList and Line2Area marker textures.

export type BeatFraction = [number, number, number] | number;

export function parseBeat(b: BeatFraction): number {
  if (Array.isArray(b)) {
    const [bar, num, den] = b;
    return bar + (den !== 0 ? num / den : 0);
  }
  return Number(b) || 0;
}

export interface BpmEntry {
  startTime: BeatFraction;
  bpm: number;
}

export class RPETempo {
  // Entries of [beat, bpm, startSeconds]
  private entries: [number, number, number][] = [];

  public constructor(bpmList: BpmEntry[]) {
    if (!bpmList || bpmList.length === 0) {
      this.entries = [[0, 120, 0]];
      return;
    }
    const sorted = bpmList
      .map(e => ({ beat: parseBeat(e.startTime), bpm: Number(e.bpm) || 120 }))
      .sort((a, b) => a.beat - b.beat);

    let sec = (sorted[0].beat * 60) / sorted[0].bpm;
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0) {
        sec += ((sorted[i].beat - sorted[i - 1].beat) * 60) / sorted[i - 1].bpm;
      }
      this.entries.push([sorted[i].beat, sorted[i].bpm, sec]);
    }
  }

  public seconds(beat: number): number {
    if (this.entries.length === 0) return (beat * 60) / 120;
    let lo = 0;
    let hi = this.entries.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.entries[mid][0] <= beat) lo = mid + 1;
      else hi = mid;
    }
    const idx = Math.max(0, lo - 1);
    const [b, bpm, sec] = this.entries[idx];
    return sec + ((beat - b) * 60) / bpm;
  }
}

// Robert Penner easing equations (1..29) matching rpe-next
function bounceOut(x: number): number {
  let shift = 0;
  let offset = 0;
  if (x < 4 / 11) {
    shift = 0;
    offset = 0;
  } else if (x < 8 / 11) {
    shift = 6 / 11;
    offset = 0.75;
  } else if (x < 10 / 11) {
    shift = 9 / 11;
    offset = 0.9375;
  } else {
    shift = 21 / 22;
    offset = 0.984375;
  }
  return (121 / 16) * (x - shift) * (x - shift) + offset;
}

function curveInside(family: number, x: number): number {
  switch (family) {
    case 1:
      return 1 - Math.cos((x * Math.PI) / 2);
    case 2:
      return x * x;
    case 3:
      return x * x * x;
    case 4:
      return x * x * x * x;
    case 5:
      return x * x * x * x * x;
    case 6:
      return x === 0 ? 0 : Math.pow(2, 10 * (x - 1));
    case 7:
      return 1 - Math.sqrt(Math.abs(1 - x * x));
    case 8:
      return x * x * ((1.70158 + 1) * x - 1.70158);
    case 9:
      if (x === 0 || x === 1) return x;
      return -Math.pow(2, 10 * x - 10) * Math.sin(((10 * x - 10.75) * 2 * Math.PI) / 3);
    case 10:
      return 1 - bounceOut(1 - x);
    default:
      return x;
  }
}

export function rpeCurve(id: number, p: number): number {
  let family = 0;
  let direction = 0;
  switch (id) {
    case 1:
      return p;
    case 2: family = 1; direction = 1; break;
    case 3: family = 1; direction = 0; break;
    case 4: family = 2; direction = 1; break;
    case 5: family = 2; direction = 0; break;
    case 6: family = 1; direction = 2; break;
    case 7: family = 2; direction = 2; break;
    case 8: family = 3; direction = 1; break;
    case 9: family = 3; direction = 0; break;
    case 10: family = 4; direction = 1; break;
    case 11: family = 4; direction = 0; break;
    case 12: family = 3; direction = 2; break;
    case 13: family = 4; direction = 2; break;
    case 14: family = 5; direction = 1; break;
    case 15: family = 5; direction = 0; break;
    case 16: family = 6; direction = 1; break;
    case 17: family = 6; direction = 0; break;
    case 18: family = 7; direction = 1; break;
    case 19: family = 7; direction = 0; break;
    case 20: family = 8; direction = 1; break;
    case 21: family = 8; direction = 0; break;
    case 22: family = 7; direction = 2; break;
    case 23: family = 8; direction = 2; break;
    case 24: family = 9; direction = 1; break;
    case 25: family = 9; direction = 0; break;
    case 26: family = 10; direction = 1; break;
    case 27: family = 10; direction = 0; break;
    case 28: family = 10; direction = 2; break;
    case 29: family = 9; direction = 2; break;
    default:
      return p;
  }

  if (direction === 0) {
    return curveInside(family, p);
  } else if (direction === 1) {
    return 1 - curveInside(family, 1 - p);
  } else {
    if (family === 8) {
      const k = 1.70158 * 1.525;
      if (p < 0.5) {
        const x = 2 * p;
        return (x * x * ((k + 1) * x - k)) / 2;
      } else {
        const x = 2 * p - 2;
        return (x * x * ((k + 1) * x + k) + 2) / 2;
      }
    } else if (family === 9) {
      if (p === 0 || p === 1) return p;
      const wave = Math.sin(((20 * p - 11.125) * 2 * Math.PI) / 4.5) / 2;
      if (p < 0.5) {
        return -Math.pow(2, 20 * p - 10) * wave;
      } else {
        return Math.pow(2, 10 - 20 * p) * wave + 1;
      }
    } else {
      if (p < 0.5) {
        return curveInside(family, 2 * p) / 2;
      } else {
        return 1 - curveInside(family, 2 - 2 * p) / 2;
      }
    }
  }
}

// 3x3 Affine matrix:
// [ m[0] m[1] m[2] ]
// [ m[3] m[4] m[5] ]
// [  0    0    1   ]
type Affine2D = [number, number, number, number, number, number];

function affineIdentity(): Affine2D {
  return [1, 0, 0, 0, 1, 0];
}

function affineMul(a: Affine2D, b: Affine2D): Affine2D {
  return [
    a[0] * b[0] + a[1] * b[3],
    a[0] * b[1] + a[1] * b[4],
    a[0] * b[2] + a[1] * b[5] + a[2],
    a[3] * b[0] + a[4] * b[3],
    a[3] * b[1] + a[4] * b[4],
    a[3] * b[2] + a[4] * b[5] + a[5]
  ];
}

function affineApply(m: Affine2D, x: number, y: number): { x: number; y: number } {
  return {
    x: m[0] * x + m[1] * y + m[2],
    y: m[3] * x + m[4] * y + m[5]
  };
}

export type AxisKind = 'Move' | 'X' | 'Y' | 'Rotate';

function makeRelativeAffine(axis: AxisKind, from: number, to: number, anchor: { x: number; y: number }): Affine2D {
  const m = affineIdentity();
  if (axis === 'Rotate') {
    const rad = ((to - from) * Math.PI) / 180;
    const s = Math.sin(rad);
    const c = Math.cos(rad);
    m[0] = c;
    m[1] = s;
    m[3] = -s;
    m[4] = c;
    m[2] = anchor.x - c * anchor.x - s * anchor.y;
    m[5] = anchor.y + s * anchor.x - c * anchor.y;
  } else if (axis === 'X') {
    const scale = from === 0 || !isFinite(to / from) ? 1 : to / from;
    m[0] = scale;
    m[2] = anchor.x * (1 - scale);
  } else if (axis === 'Y') {
    const scale = from === 0 || !isFinite(to / from) ? 1 : to / from;
    m[4] = scale;
    m[5] = anchor.y * (1 - scale);
  }
  return m;
}

export interface RawRpeEvent {
  startTime: BeatFraction;
  endTime: BeatFraction;
  start: number;
  end: number;
  easingType?: number;
  easingLeft?: number;
  easingRight?: number;
  bezier?: boolean | number;
  bezierPoints?: [number, number, number, number];
  anchor?: { x: number; y: number };
  transformStart?: number;
  transformEnd?: number;
  transformStep?: boolean;
}

interface TimedTrackEvent {
  startSec: number;
  endSec: number;
  startVal: number;
  endVal: number;
  easingType: number;
  easingLeft: number;
  easingRight: number;
  bezier: boolean;
  bezierPoints: [number, number, number, number];
  anchor: { x: number; y: number };
  transformStart?: number;
  transformEnd?: number;
  prefix: Affine2D;
}

export class RpeTrack {
  private events: TimedTrackEvent[] = [];
  public axis: AxisKind;
  public fallback: number;

  public constructor(
    rawEvents: RawRpeEvent[] | undefined,
    axis: AxisKind,
    fallback: number,
    center: { x: number; y: number },
    tempo: RPETempo
  ) {
    this.axis = axis;
    this.fallback = fallback;
    if (!rawEvents || rawEvents.length === 0) return;

    for (const raw of rawEvents) {
      const startSec = tempo.seconds(parseBeat(raw.startTime));
      const endSec = tempo.seconds(parseBeat(raw.endTime));
      const startVal = Number(raw.start) || 0;
      const endVal = Number(raw.end) || 0;
      const easingType = Math.max(1, Math.min(29, Number(raw.easingType) || 1));
      const easingLeft = Math.max(0, Math.min(1, Number(raw.easingLeft) || 0));
      const easingRight = Math.max(0, Math.min(1, raw.easingRight != null ? Number(raw.easingRight) : 1));
      const bezier = !!raw.bezier;
      const bezierPoints = raw.bezierPoints || [0, 0, 1, 1];
      const anchor = raw.anchor ? { x: Number(raw.anchor.x) || 0, y: Number(raw.anchor.y) || 0 } : center;

      this.events.push({
        startSec,
        endSec,
        startVal,
        endVal,
        easingType,
        easingLeft,
        easingRight,
        bezier,
        bezierPoints,
        anchor,
        transformStart: raw.transformStart != null ? Number(raw.transformStart) : undefined,
        transformEnd: raw.transformEnd != null ? Number(raw.transformEnd) : undefined,
        prefix: affineIdentity()
      });
    }

    this.events.sort((a, b) => a.startSec - b.startSec);

    // Build cumulative prefix affine transforms
    if (axis !== 'Move') {
      for (let i = 1; i < this.events.length; i++) {
        const prev = this.events[i - 1];
        const next = this.events[i];
        const anchor = prev.anchor || center;
        const from = prev.transformStart != null ? prev.transformStart : prev.startVal;
        const end = prev.transformEnd != null ? prev.transformEnd : prev.endVal;
        const nextFrom = next.transformStart != null ? next.transformStart : next.startVal;
        const step1 = makeRelativeAffine(axis, from, end, anchor);
        const step2 = makeRelativeAffine(axis, end, nextFrom, anchor);
        next.prefix = affineMul(affineMul(step2, step1), prev.prefix);
      }
    }
  }

  public sample(time: number): [number, TimedTrackEvent | null] {
    if (this.events.length === 0) return [this.fallback, null];
    let lo = 0;
    let hi = this.events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.events[mid].startSec <= time + 1e-9) lo = mid + 1;
      else hi = mid;
    }
    if (lo === 0) return [this.fallback, null];
    const entry = this.events[lo - 1];
    if (entry.startVal === entry.endVal) {
      return [entry.startVal, entry];
    }
    const p = entry.endSec <= entry.startSec
      ? 1
      : Math.max(0, Math.min(1, (time - entry.startSec) / (entry.endSec - entry.startSec)));

    let eased = p;
    if (entry.bezier) {
      const [x1, y1, x2, y2] = entry.bezierPoints;
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
      const base = rpeCurve(entry.easingType, entry.easingLeft);
      const range = rpeCurve(entry.easingType, entry.easingRight) - base;
      if (Math.abs(range) < 1e-12) {
        eased = p;
      } else {
        const clipped = entry.easingLeft + (entry.easingRight - entry.easingLeft) * p;
        eased = (rpeCurve(entry.easingType, clipped) - base) / range;
      }
    }
    return [entry.startVal + (entry.endVal - entry.startVal) * eased, entry];
  }

  public transformPoint(pt: { x: number; y: number }, sampleRes: [number, TimedTrackEvent | null], center: { x: number; y: number }): { x: number; y: number } {
    const [val, event] = sampleRes;
    if (!event || this.axis === 'Move') return pt;
    const from = event.transformStart != null ? event.transformStart : event.startVal;
    const rel = makeRelativeAffine(this.axis, from, val, event.anchor || center);
    const combined = affineMul(rel, event.prefix);
    return affineApply(combined, pt.x, pt.y);
  }
}

export class RpeColorTrack {
  private rTrack: RpeTrack;
  private gTrack: RpeTrack;
  private bTrack: RpeTrack;

  public constructor(
    rawEvents: any[] | undefined,
    defaultColor: [number, number, number] = [255, 255, 255],
    tempo: RPETempo
  ) {
    const getChannel = (val: any, idx: number, fallback: number) => {
      if (Array.isArray(val)) {
        const n = Number(val[idx]);
        return Number.isFinite(n) ? n : fallback;
      }
      if (typeof val === 'string') {
        const hex = val.replace(/^#/, '');
        if (hex.length === 6) {
          const n = parseInt(hex.substring(idx * 2, idx * 2 + 2), 16);
          return Number.isFinite(n) ? n : fallback;
        }
      }
      if (val && typeof val === 'object') {
        const keys = ['r', 'g', 'b'];
        const n = Number(val[keys[idx]]);
        return Number.isFinite(n) ? n : fallback;
      }
      if (typeof val === 'number') {
        return Number.isFinite(val) ? val : fallback;
      }
      return fallback;
    };

    const rEvents = rawEvents?.map(e => ({
      ...e,
      start: getChannel(e.start, 0, defaultColor[0]),
      end: getChannel(e.end, 0, defaultColor[0])
    }));
    const gEvents = rawEvents?.map(e => ({
      ...e,
      start: getChannel(e.start, 1, defaultColor[1]),
      end: getChannel(e.end, 1, defaultColor[1])
    }));
    const bEvents = rawEvents?.map(e => ({
      ...e,
      start: getChannel(e.start, 2, defaultColor[2]),
      end: getChannel(e.end, 2, defaultColor[2])
    }));

    this.rTrack = new RpeTrack(rEvents, 'Move', defaultColor[0], { x: 0, y: 0 }, tempo);
    this.gTrack = new RpeTrack(gEvents, 'Move', defaultColor[1], { x: 0, y: 0 }, tempo);
    this.bTrack = new RpeTrack(bEvents, 'Move', defaultColor[2], { x: 0, y: 0 }, tempo);
  }

  public sample(time: number): [number, number, number] {
    return [
      Math.max(0, Math.min(255, Math.round(this.rTrack.sample(time)[0]))),
      Math.max(0, Math.min(255, Math.round(this.gTrack.sample(time)[0]))),
      Math.max(0, Math.min(255, Math.round(this.bTrack.sample(time)[0])))
    ];
  }
}

export interface RawRpeTextEvent {
  startTime: BeatFraction;
  endTime: BeatFraction;
  start: string | number;
  end: string | number;
  easingType?: number;
  easingLeft?: number;
  easingRight?: number;
  bezier?: boolean | number;
  bezierPoints?: [number, number, number, number];
}

interface TimedTextEntry {
  startSec: number;
  endSec: number;
  startRaw: string;
  endRaw: string;
  easingType: number;
  easingLeft: number;
  easingRight: number;
  bezier: boolean;
  bezierPoints: [number, number, number, number];
  numericTween?: {
    prefix: string;
    suffix: string;
    startNum: number;
    endNum: number;
    decimals: number;
  };
}

export class RpeTextTrack {
  private events: TimedTextEntry[] = [];
  public fallback: string;

  public constructor(
    rawEvents: RawRpeTextEvent[] | undefined,
    fallback = '',
    tempo: RPETempo
  ) {
    this.fallback = fallback;
    if (!rawEvents || rawEvents.length === 0) return;

    for (const raw of rawEvents) {
      if (raw.start == null && raw.end == null) continue;
      const startSec = tempo.seconds(parseBeat(raw.startTime));
      const endSec = tempo.seconds(parseBeat(raw.endTime));
      const startRaw = raw.start != null ? String(raw.start) : '';
      const endRaw = raw.end != null ? String(raw.end) : '';
      const easingType = Math.max(1, Math.min(29, Number(raw.easingType) || 1));
      const easingLeft = Math.max(0, Math.min(1, Number(raw.easingLeft) || 0));
      const easingRight = Math.max(0, Math.min(1, raw.easingRight != null ? Number(raw.easingRight) : 1));
      const bezier = !!raw.bezier;
      const bezierPoints = raw.bezierPoints || [0, 0, 1, 1];

      let numericTween: TimedTextEntry['numericTween'];
      if (startRaw !== endRaw) {
        // 1. Check for %P% placeholder
        const pRegex = /(.*)%P%([+-]?\d+(?:\.\d+)?)(.*)/s;
        const mStart = startRaw.match(pRegex);
        const mEnd = endRaw.match(pRegex);
        if (mStart && mEnd) {
          const sNum = parseFloat(mStart[2]);
          const eNum = parseFloat(mEnd[2]);
          const decStart = (mStart[2].split('.')[1] || '').length;
          const decEnd = (mEnd[2].split('.')[1] || '').length;
          numericTween = {
            prefix: mStart[1],
            suffix: mStart[3],
            startNum: sNum,
            endNum: eNum,
            decimals: Math.max(decStart, decEnd)
          };
        } else {
          // 2. Check if both strings are pure numbers
          const trimmedS = startRaw.trim();
          const trimmedE = endRaw.trim();
          if (trimmedS !== '' && trimmedE !== '' && !isNaN(Number(trimmedS)) && !isNaN(Number(trimmedE))) {
            const sNum = Number(trimmedS);
            const eNum = Number(trimmedE);
            const decStart = (trimmedS.split('.')[1] || '').length;
            const decEnd = (trimmedE.split('.')[1] || '').length;
            numericTween = {
              prefix: '',
              suffix: '',
              startNum: sNum,
              endNum: eNum,
              decimals: Math.max(decStart, decEnd)
            };
          }
        }
      }

      this.events.push({
        startSec,
        endSec,
        startRaw,
        endRaw,
        easingType,
        easingLeft,
        easingRight,
        bezier,
        bezierPoints,
        numericTween
      });
    }

    this.events.sort((a, b) => a.startSec - b.startSec);
  }

  public sample(time: number): string {
    if (this.events.length === 0) return this.fallback;
    let lo = 0;
    let hi = this.events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.events[mid].startSec <= time + 1e-9) lo = mid + 1;
      else hi = mid;
    }
    if (lo === 0) return this.fallback;
    const entry = this.events[lo - 1];

    if (entry.startRaw === entry.endRaw) {
      return entry.startRaw;
    }

    if (time >= entry.endSec) {
      if (entry.numericTween) {
        const numStr = entry.numericTween.decimals > 0
          ? entry.numericTween.endNum.toFixed(entry.numericTween.decimals)
          : Math.round(entry.numericTween.endNum).toString();
        return entry.numericTween.prefix + numStr + entry.numericTween.suffix;
      }
      return entry.endRaw;
    }

    const p = entry.endSec <= entry.startSec
      ? 1
      : Math.max(0, Math.min(1, (time - entry.startSec) / (entry.endSec - entry.startSec)));

    let eased = p;
    if (entry.bezier) {
      const [x1, y1, x2, y2] = entry.bezierPoints;
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
      const base = rpeCurve(entry.easingType, entry.easingLeft);
      const range = rpeCurve(entry.easingType, entry.easingRight) - base;
      if (Math.abs(range) < 1e-12) {
        eased = p;
      } else {
        const clipped = entry.easingLeft + (entry.easingRight - entry.easingLeft) * p;
        eased = (rpeCurve(entry.easingType, clipped) - base) / range;
      }
    }

    if (entry.numericTween) {
      const val = entry.numericTween.startNum + (entry.numericTween.endNum - entry.numericTween.startNum) * eased;
      const numStr = entry.numericTween.decimals > 0
        ? val.toFixed(entry.numericTween.decimals)
        : Math.round(val).toString();
      return entry.numericTween.prefix + numStr + entry.numericTween.suffix;
    }

    return eased < 1 ? entry.startRaw : entry.endRaw;
  }
}


const RPE_UNIT = 2 / 1350;

export interface ActiveIntervalSeconds {
  start: number;
  end: number;
  readyFlash: number;
}

export class RpeNextAreaEvaluator {
  public center: { x: number; y: number };
  public half: { x: number; y: number };
  public appearTime: number;
  public disappearTime: number;
  public intervals: ActiveIntervalSeconds[] = [];
  public isSubtract: boolean;
  public tracks: [RpeTrack, RpeTrack, RpeTrack, RpeTrack, RpeTrack]; // MoveX, MoveY, Rotate, ScaleX, ScaleY

  public constructor(rawArea: any, tempo: RPETempo) {
    const bl = { x: Number(rawArea.bottomLeft?.x) || 0, y: Number(rawArea.bottomLeft?.y) || 0 };
    const tr = { x: Number(rawArea.topRight?.x) || 0, y: Number(rawArea.topRight?.y) || 0 };
    this.center = { x: (bl.x + tr.x) / 2, y: (bl.y + tr.y) / 2 };
    this.half = { x: Math.abs(tr.x - bl.x) / 2, y: Math.abs(tr.y - bl.y) / 2 };

    this.appearTime = tempo.seconds(parseBeat(rawArea.appearTime));
    this.disappearTime = tempo.seconds(parseBeat(rawArea.disappearTime));
    this.isSubtract = !!(rawArea.isInvert || rawArea.isSubtract);

    if (Array.isArray(rawArea.activeIntervals)) {
      for (const inv of rawArea.activeIntervals) {
        const start = tempo.seconds(parseBeat(inv.startTime));
        const end = tempo.seconds(parseBeat(inv.endTime));
        let readyFlash = 0.5;
        if (inv.readyFlash === false) readyFlash = 0;
        else if (typeof inv.readyFlash === 'number') readyFlash = Math.max(0, inv.readyFlash);
        if (start < end) {
          this.intervals.push({
            start: Math.max(this.appearTime, start),
            end: Math.min(this.disappearTime, end),
            readyFlash
          });
        }
      }
      this.intervals.sort((a, b) => a.start - b.start);
    }

    this.tracks = [
      new RpeTrack(rawArea.moveXEvents, 'Move', this.center.x, this.center, tempo),
      new RpeTrack(rawArea.moveYEvents, 'Move', this.center.y, this.center, tempo),
      new RpeTrack(rawArea.rotateEvents, 'Rotate', 0, this.center, tempo),
      new RpeTrack(rawArea.scaleXEvents, 'X', 1, this.center, tempo),
      new RpeTrack(rawArea.scaleYEvents, 'Y', 1, this.center, tempo)
    ];
  }

  public isVisible(time: number): boolean {
    return time + 1e-9 >= this.appearTime && time + 1e-9 < this.disappearTime;
  }

  public computeTransform(time: number, aspect: number): {
    center: { x: number; y: number };
    size: { x: number; y: number };
    rotation: number;
    scale: { x: number; y: number };
  } {
    const valMoveX = this.tracks[0].sample(time);
    const valMoveY = this.tracks[1].sample(time);
    const valRot = this.tracks[2].sample(time);
    const valScaleX = this.tracks[3].sample(time);
    const valScaleY = this.tracks[4].sample(time);

    let p = { x: this.center.x, y: this.center.y };
    // Order: ScaleX -> ScaleY -> Rotate
    p = this.tracks[3].transformPoint(p, valScaleX, this.center);
    p = this.tracks[4].transformPoint(p, valScaleY, this.center);
    p = this.tracks[2].transformPoint(p, valRot, this.center);

    // Apply Move delta
    p.x += valMoveX[0] - this.center.x;
    p.y += valMoveY[0] - this.center.y;

    const yScale = 1.5 / aspect;
    const center = {
      x: p.x * RPE_UNIT,
      y: p.y * RPE_UNIT * yScale
    };
    const size = {
      x: 2 * Math.abs(this.half.x * valScaleX[0]) * RPE_UNIT,
      y: 2 * Math.abs(this.half.y * valScaleY[0]) * RPE_UNIT
    };

    return {
      center,
      size,
      rotation: valRot[0],
      scale: { x: valScaleX[0], y: valScaleY[0] }
    };
  }
}

// Line2Area evaluator: wraps an RPE JudgeLine that acts as a noise field marker
export class RpeLine2AreaEvaluator {
  public lineIndex: number;
  public isSubtract: boolean;
  public anchor: { x: number; y: number };
  public textureSize: { x: number; y: number };
  public spans: { start: number; end: number; phase: number }[] = []; // 0=Hidden, 1=Disabled, 2=Active
  public intervals: ActiveIntervalSeconds[] = [];
  public appearTime = 0;
  public disappearTime = Infinity;
  public scaleXTrack?: RpeTrack;
  public scaleYTrack?: RpeTrack;

  public constructor(
    lineData: any,
    invert: boolean,
    tempo: RPETempo,
    lineIndex: number,
    textureSize?: { x: number; y: number }
  ) {
    this.lineIndex = lineIndex;
    this.isSubtract = invert;
    this.anchor = lineData.anchor
      ? { x: Number(lineData.anchor[0]) || 0.5, y: Number(lineData.anchor[1]) || 0.5 }
      : { x: 0.5, y: 0.5 };
    this.textureSize = textureSize || { x: 256, y: 256 };

    if (lineData.extended?.scaleXEvents?.length) {
      this.scaleXTrack = new RpeTrack(lineData.extended.scaleXEvents, 'X', 1, { x: 0, y: 0 }, tempo);
    }
    if (lineData.extended?.scaleYEvents?.length) {
      this.scaleYTrack = new RpeTrack(lineData.extended.scaleYEvents, 'Y', 1, { x: 0, y: 0 }, tempo);
    }

    this.buildLifecycle(lineData, tempo);
  }

  private buildLifecycle(lineData: any, tempo: RPETempo): void {
    // 1. Check speed events for 1=appear, 2=enable, 3=disable, 4=disappear
    const speedEvents: { time: number; code: number }[] = [];
    if (Array.isArray(lineData.eventLayers)) {
      for (const layer of lineData.eventLayers) {
        if (!layer || !Array.isArray(layer.speedEvents)) continue;
        for (const e of layer.speedEvents) {
          const t = tempo.seconds(parseBeat(e.startTime));
          const code = Math.round(Number(e.start));
          if ([1, 2, 3, 4].includes(code)) {
            speedEvents.push({ time: t, code });
          }
        }
      }
    }

    if (speedEvents.length > 0) {
      speedEvents.sort((a, b) => a.time - b.time);
      let previousCode = 0;
      let firstIdx = 0;
      let appearTime = Infinity;

      const finishSpan = (endTime: number) => {
        for (let k = firstIdx; k < this.spans.length; k++) {
          this.spans[k].end = Math.min(this.spans[k].end, endTime);
        }
        appearTime = Infinity;
      };

      for (const { time, code } of speedEvents) {
        if (code <= previousCode && isFinite(appearTime)) {
          finishSpan(time);
          firstIdx = this.spans.length;
        }
        if (this.spans.length > 0) {
          this.spans[this.spans.length - 1].end = Math.min(this.spans[this.spans.length - 1].end, time);
        }
        if (code === 4) {
          finishSpan(time);
          firstIdx = this.spans.length;
        } else {
          appearTime = Math.min(appearTime, time);
          this.spans.push({
            start: time,
            end: Infinity,
            phase: code === 2 ? 2 : 1 // 2 = Active, 1 = Disabled
          });
        }
        previousCode = code;
      }
      finishSpan(Infinity);
    } else {
      // 2. Alpha fallback: <= 0: Hidden, <= 128: Disabled, > 128: Active
      const alphaEvents: { start: number; end: number; startAlpha: number; endAlpha: number }[] = [];
      if (Array.isArray(lineData.eventLayers)) {
        for (const layer of lineData.eventLayers) {
          if (!layer || !Array.isArray(layer.alphaEvents)) continue;
          for (const e of layer.alphaEvents) {
            const t1 = tempo.seconds(parseBeat(e.startTime));
            const t2 = tempo.seconds(parseBeat(e.endTime));
            alphaEvents.push({
              start: t1,
              end: t2,
              startAlpha: Number(e.start) || 0,
              endAlpha: Number(e.end) || 0
            });
          }
        }
      }

      if (alphaEvents.length === 0) {
        this.spans.push({ start: 0, end: Infinity, phase: 2 });
      } else {
        const boundaries = new Set<number>([0]);
        for (const e of alphaEvents) {
          boundaries.add(e.start);
          boundaries.add(e.end);
        }
        const sortedTimes = Array.from(boundaries).sort((a, b) => a - b);

        for (let i = 0; i < sortedTimes.length - 1; i++) {
          const start = sortedTimes[i];
          const end = sortedTimes[i + 1];
          const mid = (start + end) / 2;
          let currentAlpha = 0;
          for (const e of alphaEvents) {
            if (mid >= e.start && mid < e.end) {
              const dt = e.end > e.start ? (mid - e.start) / (e.end - e.start) : 0;
              currentAlpha = e.startAlpha + (e.endAlpha - e.startAlpha) * dt;
              break;
            } else if (mid >= e.end) {
              currentAlpha = e.endAlpha;
            }
          }
          let phase = 0;
          if (currentAlpha <= 0) phase = 0;
          else if (currentAlpha <= 128) phase = 1;
          else phase = 2;

          if (this.spans.length > 0 && this.spans[this.spans.length - 1].phase === phase) {
            this.spans[this.spans.length - 1].end = end;
          } else {
            this.spans.push({ start, end, phase });
          }
        }
      }
    }

    this.intervals = this.spans
      .filter(s => s.phase === 2)
      .map(s => ({ start: s.start, end: s.end, readyFlash: 0.5 }));
    const visibleSpans = this.spans.filter(s => s.phase > 0);
    this.appearTime = visibleSpans.length > 0 ? visibleSpans[0].start : 0;
    this.disappearTime = visibleSpans.length > 0 ? visibleSpans[visibleSpans.length - 1].end : Infinity;
  }

  public getPhase(time: number): number {
    for (const s of this.spans) {
      if (time >= s.start && time < s.end) {
        return s.phase;
      }
    }
    return 0; // Hidden
  }

  public isVisible(time: number): boolean {
    return this.getPhase(time) > 0;
  }

  public computeTransform(
    time: number,
    aspect: number,
    line?: any,
    canvasWidth = 1350,
    canvasHeight = 900
  ): {
    center: { x: number; y: number };
    size: { x: number; y: number };
    rotation: number;
    scale: { x: number; y: number };
  } {
    const scaleX = this.scaleXTrack ? this.scaleXTrack.sample(time)[0] : 1;
    const scaleY = this.scaleYTrack ? this.scaleYTrack.sample(time)[0] : 1;

    const imgW = (line?.imageW && line.imageW > 0) ? line.imageW : this.textureSize.x;
    const imgH = (line?.imageH && line.imageH > 0) ? line.imageH : this.textureSize.y;

    const signedSize = {
      x: imgW * scaleX,
      y: imgH * scaleY
    };

    // Center offset from anchor in RPE canvas units (1350x900)
    const localCenterRpe = {
      x: (0.5 - this.anchor.x) * signedSize.x,
      y: (0.5 - this.anchor.y) * signedSize.y
    };

    const lineRot = line ? line.rotation : 0; // in radians
    const rotDeg = -lineRot * 180 / Math.PI;

    // Line center in chart coordinates [-1, 1] x [-1/aspect, 1/aspect]
    const chartPos = line
      ? {
          x: (line.offsetX / (0.5 * canvasWidth)) - 1,
          y: (1 - (line.offsetY / (0.5 * canvasHeight))) / aspect
        }
      : { x: 0, y: 0 };

    // Offset in chart space
    const offsetChartX = localCenterRpe.x * RPE_UNIT;
    const offsetChartY = localCenterRpe.y * RPE_UNIT * (1.5 / aspect);

    // Rotate offset around anchor in chart space (chart angle = -lineRot)
    const chartAngle = -lineRot;
    const cosA = Math.cos(chartAngle);
    const sinA = Math.sin(chartAngle);
    const rotChartX = cosA * offsetChartX - sinA * offsetChartY;
    const rotChartY = sinA * offsetChartX + cosA * offsetChartY;

    const center = {
      x: chartPos.x + rotChartX,
      y: chartPos.y + rotChartY
    };

    const size = {
      x: Math.abs(signedSize.x) * RPE_UNIT,
      y: Math.abs(signedSize.y) * RPE_UNIT
    };

    return {
      center,
      size,
      rotation: rotDeg,
      scale: { x: scaleX, y: scaleY }
    };
  }
}

// Convert rpe-next blockAreaList (supporting both rpe-next canvas coordinates and native percentage coordinates)
export function parseBlockAreaList(rawList: any[], bpmList: BpmEntry[]): {
  nextBlocks: any[];
  nativeBlocks: any[];
} {
  const nextBlocks: any[] = [];
  const nativeBlocks: any[] = [];
  if (!Array.isArray(rawList)) return { nextBlocks, nativeBlocks };

  const tempo = new RPETempo(bpmList);

  for (let idx = 0; idx < rawList.length; idx++) {
    const raw = rawList[idx];
    const isNext = raw.bottomLeft != null || raw.topRight != null;
    const isNative = raw.bottomLeftPercentage != null || raw.topRightPercentage != null;

    if (isNext && !isNative) {
      const evaluator = new RpeNextAreaEvaluator(raw, tempo);

      const bl = {
        x: (Math.min(evaluator.center.x - evaluator.half.x, evaluator.center.x + evaluator.half.x) + 675) / 1350,
        y: (Math.min(evaluator.center.y - evaluator.half.y, evaluator.center.y + evaluator.half.y) + 450) / 900
      };
      const tr = {
        x: (Math.max(evaluator.center.x - evaluator.half.x, evaluator.center.x + evaluator.half.x) + 675) / 1350,
        y: (Math.max(evaluator.center.y - evaluator.half.y, evaluator.center.y + evaluator.half.y) + 450) / 900
      };

      const firstActive = evaluator.intervals[0];
      const lastActive = evaluator.intervals[evaluator.intervals.length - 1];

      nextBlocks.push({
        rpeCanvas: true,
        rpeArea: evaluator,
        bottomLeftPercentage: bl,
        topRightPercentage: tr,
        appearTime: evaluator.appearTime,
        enableTime: firstActive ? firstActive.start : evaluator.disappearTime,
        disableTime: lastActive ? lastActive.end : evaluator.disappearTime,
        disappearTime: evaluator.disappearTime,
        activeIntervals: evaluator.intervals,
        isSubtract: evaluator.isSubtract,
        rotateEvents: [],
        moveEvents: [],
        scaleEvents: []
      });
    } else if (isNative && !isNext) {
      nativeBlocks.push({
        bottomLeftPercentage: raw.bottomLeftPercentage,
        topRightPercentage: raw.topRightPercentage,
        appearTime: Number(raw.appearTime) || 0,
        enableTime: Number(raw.enableTime) || 0,
        disableTime: Number(raw.disableTime) || 0,
        disappearTime: Number(raw.disappearTime) || 0,
        isSubtract: !!(raw.isSubtract || raw.isInvert),
        rotateEvents: raw.rotateEvents || [],
        moveEvents: raw.moveEvents || [],
        scaleEvents: raw.scaleEvents || []
      });
    } else {
      console.warn(`[blockAreaList] Ambiguous or unrecognized blockArea schema at index ${idx}`);
    }
  }

  return { nextBlocks, nativeBlocks };
}

// Convert rpe-next blockAreaList to BlockArea descriptors (backwards compatibility wrapper)
export function parseRpeNextBlocks(rawList: any[], bpmList: BpmEntry[]): any[] {
  return parseBlockAreaList(rawList, bpmList).nextBlocks;
}

// Convert Line2Area lines to BlockArea descriptors
export function parseLine2Area(
  judgeLineList: any[],
  bpmList: BpmEntry[],
  formattedJudgeLines?: any[]
): any[] {
  if (!Array.isArray(judgeLineList)) return [];
  const tempo = new RPETempo(bpmList);
  const result: any[] = [];

  for (let idx = 0; idx < judgeLineList.length; idx++) {
    const line = judgeLineList[idx];
    const texture = String(line.Texture || '').replace(/\0/g, '').trim();
    const isSub0 = /isSubtract0\.(png|jpg|jpeg|webp)$/i.test(texture);
    const isSub1 = /isSubtract1\.(png|jpg|jpeg|webp)$/i.test(texture);
    if (!isSub0 && !isSub1) continue;

    // Mark as block area marker so drawLine skips rendering it as a line
    line.isBlockMarker = true;
    if (formattedJudgeLines && formattedJudgeLines[idx]) {
      formattedJudgeLines[idx].isBlockMarker = true;
    }

    const invert = isSub1;
    const evaluator = new RpeLine2AreaEvaluator(line, invert, tempo, idx);

    const firstActive = evaluator.intervals[0];
    const lastActive = evaluator.intervals[evaluator.intervals.length - 1];

    result.push({
      lineIndex: idx,
      rpeCanvas: true,
      rpeArea: evaluator,
      bottomLeftPercentage: { x: 0.5, y: 0.5 },
      topRightPercentage: { x: 0.5, y: 0.5 },
      appearTime: evaluator.appearTime,
      enableTime: firstActive ? firstActive.start : evaluator.disappearTime,
      disableTime: lastActive ? lastActive.end : evaluator.disappearTime,
      disappearTime: evaluator.disappearTime,
      activeIntervals: evaluator.intervals,
      isSubtract: invert,
      rotateEvents: [],
      moveEvents: [],
      scaleEvents: []
    });
  }

  return result;
}

export function parseNoiseAreaOptions(data: any): { ignoreTripleInversion: boolean } {
  if (data?.noiseAreaOptions && typeof data.noiseAreaOptions === 'object') {
    return {
      ignoreTripleInversion: !!data.noiseAreaOptions.ignoreTripleInversion
    };
  }
  return { ignoreTripleInversion: false };
}

