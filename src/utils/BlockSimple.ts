export interface Zone {
  line2area: boolean;
  y_scale: number;
  color: [number, number, number];
  center: { x: number; y: number };
  half: { x: number; y: number };
  angle: number; // in radians
  invert: boolean;
  active: boolean;
  ready: boolean;
  opacity: number;
}

export const DEFAULT_BLOCK_COLOR: [number, number, number] = [1.0, 84 / 255, 84 / 255];

interface Boundary {
  slope: number;
  intercept: number;
  bottom: number;
  top: number;
  delta: number;
  invert: boolean;
  opacity: number;
  zone: number;
  x(y: number): number;
}

interface TessellatedQuad {
  p: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
  opacity: number;
  rgb: [number, number, number];
}

export function tessellate(aspect: number, zones: Zone[], disabled: boolean): TessellatedQuad[] {
  if (!isFinite(aspect) || aspect <= 0) return [];

  const halfHeight = 1.0 / aspect;
  const cuts: number[] = [-halfHeight, halfHeight];
  const edges: Boundary[] = [];

  for (let id = 0; id < zones.length; id++) {
    const z = zones[id];
    if (z.active === disabled || z.opacity <= 0) continue;

    const s = Math.sin(z.angle);
    const c = Math.cos(z.angle);
    const corners = [
      { x: -1, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 1 },
      { x: -1, y: 1 }
    ].map(pt => {
      const x = pt.x * z.half.x;
      const y = pt.y * z.half.y;
      return {
        x: z.center.x + c * x - s * y,
        y: z.center.y + (s * x + c * y) * z.y_scale
      };
    });

    if (corners.some(pt => !isFinite(pt.x) || !isFinite(pt.y))) continue;

    for (let i = 0; i < 4; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      if (a.y === b.y) continue;

      const bottom = Math.max(-halfHeight, Math.min(a.y, b.y));
      const top = Math.min(halfHeight, Math.max(a.y, b.y));
      if (bottom >= top) continue;

      const slope = (b.x - a.x) / (b.y - a.y);
      const intercept = a.x - slope * a.y;
      const edge: Boundary = {
        slope,
        intercept,
        bottom,
        top,
        delta: b.y > a.y ? -1 : 1,
        invert: z.invert,
        opacity: z.opacity,
        zone: id,
        x(y: number) {
          return this.slope * y + this.intercept;
        }
      };

      cuts.push(bottom, top);
      if (slope !== 0) {
        for (const x of [-1, 1]) {
          const y = (x - intercept) / slope;
          if (y > bottom && y < top) {
            cuts.push(y);
          }
        }
      }
      edges.push(edge);
    }
  }

  // Split at crossings so the left-to-right order is constant in each band
  for (let i = 0; i < edges.length; i++) {
    const a = edges[i];
    for (let j = 0; j < i; j++) {
      const b = edges[j];
      const divisor = a.slope - b.slope;
      if (divisor === 0) continue;
      const y = (b.intercept - a.intercept) / divisor;
      if (y > Math.max(a.bottom, b.bottom) && y < Math.min(a.top, b.top)) {
        cuts.push(y);
      }
    }
  }

  cuts.sort((a, b) => a - b);
  // Dedup cuts with epsilon
  const dedupCuts: number[] = [];
  for (const c of cuts) {
    if (dedupCuts.length === 0 || Math.abs(c - dedupCuts[dedupCuts.length - 1]) > 1e-7) {
      dedupCuts.push(c);
    }
  }

  const result: TessellatedQuad[] = [];
  const colored = zones.some(
    z => Math.abs(z.color[0] - DEFAULT_BLOCK_COLOR[0]) > 0.01 ||
      Math.abs(z.color[1] - DEFAULT_BLOCK_COLOR[1]) > 0.01 ||
      Math.abs(z.color[2] - DEFAULT_BLOCK_COLOR[2]) > 0.01
  );

  const owners: [Set<number>, Set<number>] = [new Set(), new Set()];

  for (let bandIdx = 0; bandIdx < dedupCuts.length - 1; bandIdx++) {
    const lo = dedupCuts[bandIdx];
    const hi = dedupCuts[bandIdx + 1];
    const mid = (lo + hi) * 0.5;
    if (mid === lo || mid === hi) continue;

    const crossings = edges.filter(e => e.bottom < mid && mid < e.top);
    crossings.sort((a, b) => a.x(mid) - b.x(mid));

    let normal = 0;
    let subtract = 0;
    let subtractOpacity = 0;
    owners[0].clear();
    owners[1].clear();

    for (let pIdx = 0; pIdx < crossings.length - 1; pIdx++) {
      const left = crossings[pIdx];
      const right = crossings[pIdx + 1];

      if (colored) {
        const ownerSet = owners[left.invert ? 1 : 0];
        if (left.delta > 0) {
          ownerSet.add(left.zone);
        } else {
          ownerSet.delete(left.zone);
        }
      }

      if (left.invert) {
        subtract += left.delta;
        subtractOpacity += left.delta * left.opacity;
      } else {
        normal += left.delta * left.opacity;
      }

      const inverted = Math.abs(subtract - 1) < 0.5;
      let inverse = 0;
      if (disabled) {
        const green = Math.max(0, Math.min(1, subtractOpacity * 0.1));
        const t = Math.max(0, Math.min(1, (green - 0.2) * -10));
        const r = (inverted ? 1 : 0) + t * t * (3 - 2 * t);
        inverse = Math.max(0, Math.min(1, r)) * Math.max(0, Math.min(1, green * r * 10));
      } else {
        inverse = inverted ? 1 : 0;
      }

      const opacity = Math.abs(Math.max(0, Math.min(1, normal)) - inverse);
      if (opacity < 1e-6 || Math.max(-1, left.x(mid)) >= Math.min(1, right.x(mid))) {
        continue;
      }

      const p: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }] = [
        { x: Math.max(-1, Math.min(1, left.x(lo))), y: lo },
        { x: Math.max(-1, Math.min(1, right.x(lo))), y: lo },
        { x: Math.max(-1, Math.min(1, right.x(hi))), y: hi },
        { x: Math.max(-1, Math.min(1, left.x(hi))), y: hi }
      ];

      const kind = normal < inverse ? 1 : 0;
      let ownerId: number | undefined;
      const primaryOwners = Array.from(owners[kind]);
      const secondaryOwners = Array.from(owners[1 - kind]);
      if (primaryOwners.length > 0) {
        ownerId = primaryOwners[primaryOwners.length - 1];
      } else if (secondaryOwners.length > 0) {
        ownerId = secondaryOwners[secondaryOwners.length - 1];
      }

      let rgb = ownerId != null ? zones[ownerId].color : DEFAULT_BLOCK_COLOR;
      if (
        Math.abs(rgb[0] - DEFAULT_BLOCK_COLOR[0]) < 0.001 &&
        Math.abs(rgb[1] - DEFAULT_BLOCK_COLOR[1]) < 0.001 &&
        Math.abs(rgb[2] - DEFAULT_BLOCK_COLOR[2]) < 0.001
      ) {
        rgb = [1.0, 0.0, 0.0];
      }

      result.push({ p, opacity, rgb });
    }
  }

  return result;
}

export function drawBlockSimple(
  ctx: CanvasRenderingContext2D,
  aspect: number,
  zones: Zone[],
  disabled: boolean
) {
  const quads = tessellate(aspect, zones, disabled);
  if (quads.length === 0) return;

  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const toCanvasX = (x: number) => (x + 1) * 0.5 * W;
  const toCanvasY = (y: number) => (1 - y * aspect) * 0.5 * H;

  const fillMultiplier = disabled ? 0.12 : 0.40;

  ctx.save();
  ctx.resetTransform();
  ctx.globalCompositeOperation = 'source-over';

  for (const quad of quads) {
    const alpha = quad.opacity * fillMultiplier;
    if (alpha <= 0.001) continue;

    ctx.fillStyle = `rgba(${Math.round(quad.rgb[0] * 255)}, ${Math.round(quad.rgb[1] * 255)}, ${Math.round(quad.rgb[2] * 255)}, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(toCanvasX(quad.p[0].x), toCanvasY(quad.p[0].y));
    ctx.lineTo(toCanvasX(quad.p[1].x), toCanvasY(quad.p[1].y));
    ctx.lineTo(toCanvasX(quad.p[2].x), toCanvasY(quad.p[2].y));
    ctx.lineTo(toCanvasX(quad.p[3].x), toCanvasY(quad.p[3].y));
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}
