import { describe, expect, it } from "vitest";
import { progressTextureLayers, progressTextureProgress, progressTextureSettings } from "./progress-texture";
import {
  affineFromCorners,
  angleToCoord,
  apply,
  circularProgressAngles,
  circularWedge,
  compressBox,
  IDENTITY,
  linearQuad,
  progressTexMap,
  regionAngles,
  rotatedPoints,
  textureCorners,
  textureElementMatrix,
  transformPoint,
  type Pt,
} from "./texture-geometry";

const close = (a: readonly number[], b: readonly number[], digits = 6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits));
const tan = (deg: number) => Math.tan((deg * Math.PI) / 180);

describe("texture region texcoords (BaseRegions/Texture.lua)", () => {
  it("unrotated: the plain 0..1 corners", () => {
    const c = rotatedPoints(0, false);
    close(c.ul, [0, 0]);
    close(c.ll, [0, 1]);
    close(c.ur, [1, 0]);
    close(c.lr, [1, 1]);
  });

  it("rotation turns the image counter-clockwise; full rotation shrinks it by √2", () => {
    // 90°, full rotation: the screen's top left samples the texture's top right corner (outside 0..1 on y).
    const c = rotatedPoints(90, true);
    close(c.ul, [0.5 + Math.SQRT1_2, 0.5 - Math.SQRT1_2]);
    // Without full rotation the image keeps its size: corners sit on the √2/2 circle at 45°.
    const d = rotatedPoints(45, false);
    close(d.ul, [0.5, 0.5 - Math.SQRT1_2]);
    // The CSS placement of the texture element: texcoord (1, 0) lands on the box's top left at 90° (no shrink).
    const m = textureElementMatrix(affineFromCorners(rotatedPoints(90, false)), 100, 100)!;
    close(apply(m, [100, 0]), [0, 0]);
    close(apply(m, [0, 0]), [0, 100]);
  });

  it("mirroring swaps corners, and a negative scale mirrors again (DoTexCoord)", () => {
    const m = textureCorners({ rotation: 0, canRotate: false, mirror: true });
    close(m.ul, [1, 0]);
    close(m.lr, [0, 1]);
    const back = textureCorners({ rotation: 0, canRotate: false, mirror: true, mirrorH: true });
    close(back.ul, [0, 0]);
    const v = textureCorners({ rotation: 0, canRotate: false, mirror: false, mirrorV: true });
    close(v.ul, [0, 1]);
  });

  it("the identity map draws the element untransformed; degenerate maps draw nothing", () => {
    close(Object.values(textureElementMatrix(IDENTITY, 64, 32)!), [1, 0, 0, 1, 0, 0]);
    expect(textureElementMatrix({ a: 0, b: 0, c: 0, d: 1, e: 0, f: 0 }, 64, 64)).toBeNull();
  });
});

describe("TransformPoint (TextureCoords.lua:63-99)", () => {
  it("default crop (0.41) is almost the plain texture", () => {
    const o = { scaleX: 1.41, scaleY: 1.41, texRotation: 0, mirrorH: false, mirrorV: false };
    close(transformPoint([0, 0], o), [0.5 - (0.5 * 1.4142) / 1.41, 0.5 - (0.5 * 1.4142) / 1.41]);
    close(transformPoint([0.5, 0.5], o), [0.5, 0.5]);
  });

  it("crop 0 shows the whole texture shrunk by √2; rotation is in degrees; the user offset shifts texcoords", () => {
    const o = { scaleX: 1, scaleY: 1, texRotation: 90, mirrorH: false, mirrorV: false, userX: 0.1, userY: -0.2 };
    // (1, 0.5): x = 0.7071 → rotated 90° → (0, 0.7071) → (0.5, 1.2071) + shift.
    close(transformPoint([1, 0.5], o), [0.6, 1.0071], 4);
    const map = progressTexMap(o);
    close(apply(map, [1, 0.5]), transformPoint([1, 0.5], o));
  });
});

describe("circular progress (TextureCoords.lua angleToCoord, CircularProgressTexture.lua)", () => {
  it("angles run clockwise from the top, onto the box edge", () => {
    close(angleToCoord(0), [0.5, 0]);
    close(angleToCoord(45), [1, 0]);
    close(angleToCoord(90), [1, 0.5]);
    close(angleToCoord(30), [0.5 + tan(30) / 2, 0]);
    close(angleToCoord(100), [1, 0.5 + tan(10) / 2]);
    close(angleToCoord(200), [0.5 - tan(200) / 2, 1]);
    close(angleToCoord(300), [0, 0.5 - tan(210) / 2]);
    close(angleToCoord(-90), [0, 0.5]);
    close(angleToCoord(405), [1, 0]);
  });

  it("the wedge is the square pie between the angles", () => {
    const quarter = circularWedge(0, 90);
    expect(quarter.kind).toBe("wedge");
    (quarter as { points: Pt[] }).points.forEach((p, i) => close(p, [[0.5, 0.5], [0.5, 0], [1, 0], [1, 0.5]][i]));
    const big = circularWedge(30, 300) as { points: Pt[] };
    expect(big.points).toHaveLength(6); // centre, start, corners 45/135/225, end
    close(big.points[2], [1, 0]);
    close(big.points[4], [0, 1]);
    expect(circularWedge(0, 360).kind).toBe("full");
    expect(circularWedge(120, 120).kind).toBe("none");
    // Starting exactly on a corner doesn't add it twice.
    expect((circularWedge(45, 100) as { points: Pt[] }).points).toHaveLength(3);
  });

  it("region angles are taken modulo 360 with the end after the start", () => {
    expect(regionAngles(0, 360)).toEqual([0, 360]);
    expect(regionAngles(-90, 0)).toEqual([270, 360]);
    expect(regionAngles(270, 90)).toEqual([270, 450]);
  });

  it("clockwise grows from the start, anticlockwise ends at the end angle", () => {
    expect(circularProgressAngles(true, 0, 360, 0.25)).toEqual([0, 90]);
    expect(circularProgressAngles(false, 0, 360, 0.25)).toEqual([270, 360]);
    expect(circularProgressAngles(true, 270, 450, 0.5)).toEqual([270, 360]);
    expect(circularProgressAngles(true, 0, 360, 2)).toEqual([0, 360]);
  });
});

describe("linear progress (LinearProgressTexture.lua)", () => {
  it("fills from the orientation's start edge", () => {
    expect(linearQuad("HORIZONTAL", 0, 0.25)).toEqual({ ul: [0, 0], ll: [0, 1], ur: [0.25, 0], lr: [0.25, 1] });
    expect(linearQuad("HORIZONTAL_INVERSE", 0, 0.25)).toEqual({ ul: [0.75, 0], ll: [0.75, 1], ur: [1, 0], lr: [1, 1] });
    expect(linearQuad("VERTICAL", 0, 0.25)).toEqual({ ul: [0, 0.75], ur: [1, 0.75], ll: [0, 1], lr: [1, 1] });
    expect(linearQuad("VERTICAL_INVERSE", 0, 0.25)).toEqual({ ul: [0, 0], ur: [1, 0], ll: [0, 0.25], lr: [1, 0.25] });
  });

  it("slant: INSIDE scales by 1 - slant, EXTEND reaches past the edges", () => {
    const q = linearQuad("HORIZONTAL", 0, 1, { slant: 0.2, slantFirst: false, mode: "INSIDE" });
    close([...q.ul, ...q.ll, ...q.ur, ...q.lr], [0.2, 0, 0, 1, 1, 0, 0.8, 1]);
    const e = linearQuad("HORIZONTAL", 0, 1, { slant: 0.2, slantFirst: true, mode: "EXTEND" });
    close([...e.ul, ...e.ll, ...e.ur, ...e.lr], [-0.2, 0, 0, 1, 1, 0, 1.2, 1]);
  });

  it("compress squeezes the image into the filled part", () => {
    expect(compressBox("HORIZONTAL_INVERSE", 0.4)).toEqual({ x: 0.6, y: 0, w: 0.4, h: 1 });
    expect(compressBox("VERTICAL", 0.4)).toEqual({ x: 0, y: 0.6, w: 1, h: 0.4 });
  });
});

describe("progress texture region (ProgressTexture.lua)", () => {
  it("progress is remaining / duration, inverse flips it, at least 0.0001, 1 without a timer", () => {
    expect(progressTextureProgress({ remaining: 45, duration: 60, inverse: false })).toBe(0.75);
    expect(progressTextureProgress({ remaining: 45, duration: 60, inverse: true })).toBe(0.25);
    expect(progressTextureProgress({ remaining: 0, duration: 60, inverse: false })).toBe(0.0001);
    expect(progressTextureProgress({ duration: 0, inverse: false })).toBe(1);
  });

  const settings = (aura: Record<string, unknown>, progress: number, native = false) =>
    progressTextureSettings(aura as never, {}, { width: 100, height: 50, progress, native });

  it("circular: the background spans the angles, the foreground the progress", () => {
    const [bg, fg] = progressTextureLayers(settings({ orientation: "ANTICLOCKWISE", startAngle: 0, endAngle: 180, backgroundOffset: 2 }, 0.5));
    expect(bg.box).toEqual({ left: -2, top: -2, width: 104, height: 54 });
    expect(bg.polygon).toHaveLength(5); // centre, top, the corners at 45° and 135°, bottom
    expect(fg.box).toEqual({ left: 0, top: 0, width: 100, height: 50 });
    close(fg.polygon![1], angleToCoord(90));
    close(fg.polygon!.at(-1)!, angleToCoord(180));
  });

  it("linear: slanted fill, but natively a plain rectangle mask", () => {
    const aura = { orientation: "HORIZONTAL", slanted: true, slant: 0.2, backgroundOffset: 0 };
    const [, fg] = progressTextureLayers(settings(aura, 0.5));
    close(fg.polygon![0], [0.2, 0]);
    close(fg.polygon![1], [0.6, 0]);
    close(fg.polygon![2], [0.4, 1]);
    const [, native] = progressTextureLayers(settings(aura, 0.5, true));
    expect(native.polygon).toEqual([[0, 0], [0.5, 0], [0.5, 1], [0, 1]]);
  });

  it("the user x offset is negated (ProgressTexture.lua:895)", () => {
    const s = settings({ user_x: 0.1, user_y: 0.2 }, 1);
    expect(s.userX).toBe(-0.1);
    expect(s.userY).toBe(0.2);
    expect(s.cropX).toBeCloseTo(1.41);
  });
});
