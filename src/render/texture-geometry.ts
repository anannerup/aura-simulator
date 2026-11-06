/**
 * Texture coordinate maths of the texture-based regions, ported from Musca Auras v1.15.0:
 * BaseRegions/Texture.lua (rotated/mirrored texcoords), BaseRegions/TextureCoords.lua (TransformPoint, the
 * circular wedge corners), BaseRegions/LinearProgressTexture.lua (fill quads, slant, compress) and
 * Progress/CircularProgressTexture angles. Pure; no React.
 *
 * Conventions: normalized coordinates run 0..1 over a box, x right, y down (WoW texcoords are y down too).
 * A texture is drawn by a {@link Affine} map from box coordinates `s` to texcoords `t` (WoW gives the texcoord of
 * each vertex; every shape here has texcoords that are an affine function of the vertex position), and optionally
 * clipped to a polygon in box coordinates (the vertex positions moved by SetVertexOffset).
 */

export type Pt = readonly [number, number];

/** Texcoords of a quad's corners, in SetTexCoord(ULx,ULy, LLx,LLy, URx,URy, LRx,LRy) terms. */
export interface Corners {
  ul: Pt;
  ll: Pt;
  ur: Pt;
  lr: Pt;
}

/** (x, y) → (a·x + c·y + e, b·x + d·y + f), as CSS matrix(a, b, c, d, e, f). */
export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;
/** Lua's `%`: the result has the divisor's sign. */
export const luaMod = (a: number, b: number) => a - Math.floor(a / b) * b;

export function apply(m: Affine, [x, y]: Pt): Pt {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

/** The affine map that sends the box corners (0,0), (1,0), (0,1) to the quad's UL, UR, LL texcoords. */
export function affineFromCorners(c: Corners): Affine {
  return { a: c.ur[0] - c.ul[0], b: c.ur[1] - c.ul[1], c: c.ll[0] - c.ul[0], d: c.ll[1] - c.ul[1], e: c.ul[0], f: c.ul[1] };
}

/** The affine map that agrees with `f` (assumed affine) at (0,0), (1,0), (0,1). */
export function affineOf(f: (p: Pt) => Pt): Affine {
  const o = f([0, 0]);
  const x = f([1, 0]);
  const y = f([0, 1]);
  return { a: x[0] - o[0], b: x[1] - o[1], c: y[0] - o[0], d: y[1] - o[1], e: o[0], f: o[1] };
}

export const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/**
 * Where to draw the whole texture (an element `w`×`h` px showing texcoords 0..1 stretched) so that box pixel
 * `p = (w·s.x, h·s.y)` shows texcoord `map(s)`: the CSS transform (origin 0 0) of that element. Null when the map
 * is degenerate (nothing visible).
 */
export function textureElementMatrix(map: Affine, w: number, h: number): Affine | null {
  const det = map.a * map.d - map.b * map.c;
  if (!(Math.abs(det) > 1e-9) || w <= 0 || h <= 0) return null;
  // N = M⁻¹ (columns (a,b), (c,d)).
  const n11 = map.d / det;
  const n12 = -map.c / det;
  const n21 = -map.b / det;
  const n22 = map.a / det;
  const ox = n11 * map.e + n12 * map.f;
  const oy = n21 * map.e + n22 * map.f;
  return { a: n11, b: (n21 * h) / w, c: (n12 * w) / h, d: n22, e: -w * ox, f: -h * oy };
}

export const cssMatrix = (m: Affine) =>
  `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map((v) => +v.toFixed(6)).join(", ")})`;

// ---------------------------------------------------------------------------------------------------------------
// Texture region: BaseRegions/Texture.lua

/** Texture.lua:30-37 GetRotatedPoints: UL, LL, UR, LR texcoords for a rotation in degrees (counter-clockwise). */
export function rotatedPoints(degrees: number, scaleForFullRotate: boolean): Corners {
  const angle = rad(135 - degrees);
  const factor = scaleForFullRotate ? 1 : Math.SQRT2;
  const vx = Math.cos(angle) / factor;
  const vy = Math.sin(angle) / factor;
  return { ul: [0.5 + vx, 0.5 - vy], ll: [0.5 - vy, 0.5 - vx], ur: [0.5 + vy, 0.5 + vx], lr: [0.5 - vx, 0.5 + vy] };
}

/**
 * Texture.lua:60-80 DoTexCoord: the rotated points, with corners swapped for mirroring. `mirror` is the option,
 * `mirrorH`/`mirrorV` come from a negative animation scale (SetMirrorFromScale). "Allow full rotation"
 * (`canRotate`) shrinks the texture by √2 so it fits when turned.
 */
export function textureCorners(o: { rotation: number; canRotate: boolean; mirror: boolean; mirrorH?: boolean; mirrorV?: boolean }): Corners {
  const p = rotatedPoints(o.rotation, o.canRotate);
  const h = o.mirror !== (o.mirrorH === true);
  const v = o.mirrorV === true;
  if (h && v) return { ul: p.lr, ll: p.ur, ur: p.ll, lr: p.ul };
  if (h) return { ul: p.ur, ll: p.lr, ur: p.ul, lr: p.ll };
  if (v) return { ul: p.ll, ll: p.ul, ur: p.lr, lr: p.ur };
  return p;
}

// ---------------------------------------------------------------------------------------------------------------
// TextureCoords.lua

/**
 * TextureCoords.lua:63-99 TransformPoint: centre, scale by √2 / crop, mirror, rotate by `texRotation` degrees (WoW's
 * `cos`/`sin` take degrees), move back and shift by the user offset.
 */
export function transformPoint(
  [x0, y0]: Pt,
  o: { scaleX: number; scaleY: number; texRotation: number; mirrorH: boolean; mirrorV: boolean; userX?: number; userY?: number },
): Pt {
  let x = (x0 - 0.5) * 1.4142;
  let y = (y0 - 0.5) * 1.4142;
  x /= o.scaleX;
  y /= o.scaleY;
  if (o.mirrorH) x = -x;
  if (o.mirrorV) y = -y;
  const c = Math.cos(rad(o.texRotation));
  const s = Math.sin(rad(o.texRotation));
  [x, y] = [c * x - s * y, s * x + c * y];
  return [x + 0.5 + (o.userX ?? 0), y + 0.5 + (o.userY ?? 0)];
}

/** The texcoord map of a progress texture layer (TextureCoords Transform), as box → texcoord. */
export function progressTexMap(o: Parameters<typeof transformPoint>[1]): Affine {
  return affineOf((p) => transformPoint(p, o));
}

const EXACT_ANGLES: Pt[] = [
  [0.5, 0],
  [1, 0],
  [1, 0.5],
  [1, 1],
  [0.5, 1],
  [0, 1],
  [0, 0.5],
  [0, 0],
];

/** TextureCoords.lua:36-55 angleToCoord: where a ray from the centre at `angle` (0 = up, clockwise) leaves the box. */
export function angleToCoord(angle: number): Pt {
  angle = luaMod(angle, 360);
  if (luaMod(angle, 45) === 0) return EXACT_ANGLES[Math.floor(angle / 45)];
  const tan = (deg: number) => Math.tan(rad(deg));
  if (angle < 45) return [0.5 + tan(angle) / 2, 0];
  if (angle < 135) return [1, 0.5 + tan(angle - 90) / 2];
  if (angle < 225) return [0.5 - tan(angle) / 2, 1];
  if (angle < 315) return [0, 0.5 - tan(angle - 90) / 2];
  return [0.5 + tan(angle) / 2, 0];
}

export type Wedge = { kind: "full" } | { kind: "none" } | { kind: "wedge"; points: Pt[] };

/**
 * CircularProgressTexture.lua:133-213 UpdateTextures + TextureCoords.lua:177-200 SetAngle: the part of the box
 * between the angles is drawn by up to three quads, each from the centre to the box edge. Their union is the
 * "square pie" polygon: centre, the edge point at `angle1`, the box corners passed (at 45° + k·90°), the edge point
 * at `angle2`.
 */
export function circularWedge(angle1: number, angle2: number): Wedge {
  if (angle2 - angle1 >= 360) return { kind: "full" };
  if (angle1 === angle2) return { kind: "none" };
  const points: Pt[] = [[0.5, 0.5], angleToCoord(angle1)];
  for (let k = Math.ceil((angle1 - 45) / 90); 45 + 90 * k < angle2; k++) {
    const corner = 45 + 90 * k;
    if (corner > angle1) points.push(angleToCoord(corner));
  }
  points.push(angleToCoord(angle2));
  return { kind: "wedge", points };
}

/**
 * ProgressTexture.lua:897-901: the region's angles are taken modulo 360 and the end lies after the start
 * (a full turn when they are equal).
 */
export function regionAngles(startAngle: number, endAngle: number): [number, number] {
  const start = luaMod(startAngle, 360);
  let end = luaMod(endAngle, 360);
  if (end <= start) end += 360;
  return [start, end];
}

/**
 * ProgressTexture.lua:204-240 CircularSetValueFunctions (and the sub-element's ProgressToAngles,
 * CircularProgressTexture sub-region): clockwise fills from the start angle, anticlockwise ends at the end angle.
 */
export function circularProgressAngles(clockwise: boolean, startAngle: number, endAngle: number, progress: number): [number, number] {
  let p = Math.min(1, Math.max(0, progress));
  if (clockwise) return [startAngle, (endAngle - startAngle) * p + startAngle];
  p = 1 - p;
  return [(endAngle - startAngle) * p + startAngle, endAngle];
}

// ---------------------------------------------------------------------------------------------------------------
// LinearProgressTexture.lua

export type LinearOrientation = "HORIZONTAL" | "HORIZONTAL_INVERSE" | "VERTICAL" | "VERTICAL_INVERSE";

export function linearOrientationOf(v: unknown): LinearOrientation {
  return v === "HORIZONTAL" || v === "HORIZONTAL_INVERSE" || v === "VERTICAL_INVERSE" ? v : "VERTICAL";
}

export interface Slant {
  slant: number;
  slantFirst: boolean;
  /** "INSIDE" (default) or "EXTEND". */
  mode: string;
}

/**
 * LinearProgressTexture.lua:71-186 ApplyProgressToCoordFunctions(Slanted): the vertex positions (= texcoords
 * before the transform) of the fill between `start` and `end` progress, as a quad UL, LL, UR, LR in box coordinates.
 */
export function linearQuad(orientation: LinearOrientation, start: number, end: number, slant?: Slant): Corners {
  if (!slant) {
    switch (orientation) {
      case "HORIZONTAL":
        return { ul: [start, 0], ll: [start, 1], ur: [end, 0], lr: [end, 1] };
      case "HORIZONTAL_INVERSE":
        return { ul: [1 - end, 0], ll: [1 - end, 1], ur: [1 - start, 0], lr: [1 - start, 1] };
      case "VERTICAL":
        return { ul: [0, 1 - end], ur: [1, 1 - end], ll: [0, 1 - start], lr: [1, 1 - start] };
      case "VERTICAL_INVERSE":
        return { ul: [0, start], ur: [1, start], ll: [0, end], lr: [1, end] };
    }
  }
  const s = slant.slant;
  if (slant.mode === "EXTEND") {
    start = start * (1 + s) - s;
    end = end * (1 + s) - s;
  } else {
    start *= 1 - s;
    end *= 1 - s;
  }
  switch (orientation) {
    case "HORIZONTAL": {
      const s1 = slant.slantFirst ? 0 : s;
      const s2 = slant.slantFirst ? s : 0;
      return { ul: [start + s1, 0], ll: [start + s2, 1], ur: [end + s1, 0], lr: [end + s2, 1] };
    }
    case "HORIZONTAL_INVERSE": {
      const s1 = slant.slantFirst ? s : 0;
      const s2 = slant.slantFirst ? 0 : s;
      return { ul: [1 - end - s1, 0], ll: [1 - end - s2, 1], ur: [1 - start - s1, 0], lr: [1 - start - s2, 1] };
    }
    case "VERTICAL": {
      const s1 = slant.slantFirst ? s : 0;
      const s2 = slant.slantFirst ? 0 : s;
      return { ul: [0, 1 - end - s1], ur: [1, 1 - end - s2], ll: [0, 1 - start - s1], lr: [1, 1 - start - s2] };
    }
    case "VERTICAL_INVERSE": {
      const s1 = slant.slantFirst ? 0 : s;
      const s2 = slant.slantFirst ? s : 0;
      return { ul: [0, start + s1], ur: [1, start + s2], ll: [0, end + s1], lr: [1, end + s2] };
    }
  }
}

/** A quad as a clip polygon (clockwise: UL, UR, LR, LL). */
export const quadPolygon = (q: Corners): Pt[] => [q.ul, q.ur, q.lr, q.ll];

/**
 * Compress (LinearProgressTexture.lua:190-235): the texture is anchored at the orientation's start edge and only
 * `progress` of the region long, and the whole image is squeezed into it. Returns that box in region-normalized
 * coordinates; the fill inside it then runs 0..1 (nothing below 10 % progress).
 */
export function compressBox(orientation: LinearOrientation, progress: number): { x: number; y: number; w: number; h: number } {
  const p = Math.min(1, Math.max(0, progress));
  switch (orientation) {
    case "HORIZONTAL":
      return { x: 0, y: 0, w: p, h: 1 };
    case "HORIZONTAL_INVERSE":
      return { x: 1 - p, y: 0, w: p, h: 1 };
    case "VERTICAL":
      return { x: 0, y: 1 - p, w: 1, h: p };
    case "VERTICAL_INVERSE":
      return { x: 0, y: 0, w: 1, h: p };
  }
}

/** CSS clip-path for a polygon in box coordinates. */
export const clipPolygon = (points: readonly Pt[]) =>
  `polygon(${points.map(([x, y]) => `${+(x * 100).toFixed(4)}% ${+(y * 100).toFixed(4)}%`).join(", ")})`;
