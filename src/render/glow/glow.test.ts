import { readFileSync } from "node:fs";
import path from "node:path";
import { Lua } from "wasmoon-lua5.1";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { antsFrameAt, antsTexCoord, buttonGlowOutState, buttonGlowState, createAntsAnimator } from "./buttonGlow";
import { autoCastSparkles, autoCastTimers } from "./autoCast";
import { GLOW_DEFAULTS, LCG_DEFAULT_COLOR, glowParams, offsetFrameRect } from "./params";
import { pixelGlowLines, pixelProgress } from "./pixelGlow";
import { flipbookCell, procFrame, procGlowState, procStartSize } from "./procGlow";

describe("glowParams (Glow.lua options → LibCustomGlow arguments)", () => {
  it("buttonOverlay: no colour unless useGlowColor, throttle from frequency", () => {
    expect(glowParams("buttonOverlay", {}, 40, 40)).toEqual({ type: "buttonOverlay", color: null, throttle: 0.01 });
    const p = glowParams("buttonOverlay", { useGlowColor: true, glowColor: [1, 0, 0, 0.5], glowFrequency: 0.5 }, 40, 40);
    expect(p).toEqual({ type: "buttonOverlay", color: [1, 0, 0, 0.5], throttle: 0.005 });
    expect(glowParams("buttonOverlay", { glowFrequency: -1 }, 40, 40)).toMatchObject({ throttle: 0.01 });
  });

  it("Pixel: defaults to LCG's yellow, period = 1/frequency, length clamped to the short side", () => {
    expect(glowParams("Pixel", {}, 40, 40)).toEqual({
      type: "Pixel",
      color: LCG_DEFAULT_COLOR,
      lines: 8,
      period: 4,
      length: 10,
      thickness: 1,
      xOffset: 0,
      yOffset: 0,
      border: false,
    });
    expect(glowParams("Pixel", { glowLength: 50, glowFrequency: 0 }, 200, 20)).toMatchObject({ length: 20, period: 4 });
    expect(glowParams("Pixel", { glowFrequency: -0.5, glowBorder: true }, 40, 40)).toMatchObject({ period: -2, border: true });
    // glowLength missing from an old aura: LibCustomGlow derives it from the size and line count
    expect(glowParams("Pixel", { glowLength: undefined, glowLines: 4 }, 40, 40)).toMatchObject({ length: 32 });
  });

  it("ACShine: lines → particles per ring, period default 8 for frequency 0", () => {
    expect(glowParams("ACShine", { glowLines: 3, glowScale: 2, glowFrequency: 0 }, 40, 40)).toEqual({
      type: "ACShine",
      color: LCG_DEFAULT_COLOR,
      particles: 3,
      period: 8,
      scale: 2,
      xOffset: 0,
      yOffset: 0,
    });
  });

  it("Proc: start animation only when glowStartAnim is set, duration and offsets passed through", () => {
    expect(glowParams("Proc", {}, 40, 40)).toEqual({ type: "Proc", color: null, startAnim: false, duration: 1, xOffset: 0, yOffset: 0 });
    expect(glowParams("Proc", { glowStartAnim: true, glowDuration: 2, glowXOffset: 3 }, 40, 40)).toMatchObject({
      startAnim: true,
      duration: 2,
      xOffset: 3,
    });
  });

  it("defaults are Glow.lua's", () => {
    expect(GLOW_DEFAULTS).toMatchObject({ glowLines: 8, glowFrequency: 0.25, glowLength: 10, glowThickness: 1, glowScale: 1 });
  });
});

describe("ButtonGlow animation", () => {
  it("starts with the spark appearing and big inner / outer glows", () => {
    const s = buttonGlowState(0, null);
    expect(s.spark).toEqual({ size: 1, scale: 1, alpha: 0 });
    expect(s.innerGlow).toMatchObject({ size: 0.5, alpha: 1 });
    expect(s.outerGlow).toMatchObject({ size: 2, alpha: 1 });
    expect(s.ants.alpha).toBe(0);
  });

  it("spark scales 1 → 1.5 → 1 and fades in then out", () => {
    expect(buttonGlowState(0.1, null).spark.scale).toBeCloseTo(1.25);
    expect(buttonGlowState(0.2, null).spark).toMatchObject({ alpha: 1 });
    expect(buttonGlowState(0.2, null).spark.scale).toBeCloseTo(1.5);
    expect(buttonGlowState(0.3, null).spark.alpha).toBeCloseTo(0.5);
    expect(buttonGlowState(0.4, null).spark.scale).toBeCloseTo(1);
    expect(buttonGlowState(0.4, null).spark.alpha).toBeCloseTo(0);
  });

  it("inner glow grows and outer glow shrinks to the frame size by 0.3 s, then ants fade in", () => {
    const s = buttonGlowState(0.3, null);
    expect(s.innerGlow.size * s.innerGlow.scale).toBeCloseTo(1);
    expect(s.outerGlow.size * s.outerGlow.scale).toBeCloseTo(1);
    expect(s.innerGlowOver.alpha).toBeCloseTo(0);
    expect(buttonGlowState(0.4, null).ants.alpha).toBeCloseTo(0.5);
    expect(buttonGlowState(0.4, null).innerGlow.alpha).toBeCloseTo(0.5);
  });

  it("rests with the outer glow and ants at the colour alpha", () => {
    const s = buttonGlowState(5, 0.6);
    expect(s.outerGlow).toEqual({ size: 1, scale: 1, alpha: 0.6 });
    expect(s.ants).toEqual({ size: 0.85, scale: 1, alpha: 0.6 });
    expect(s.spark.alpha + s.innerGlow.alpha + s.innerGlowOver.alpha + s.outerGlowOver.alpha).toBe(0);
    // with a colour the spark starts from 0.3 × alpha only until its appear animation starts
    expect(buttonGlowState(0.1, 0.6).spark.alpha).toBeCloseTo(0.3);
  });

  it("fades out: ants away and outer glow flash in 0.2 s, everything gone by 0.4 s", () => {
    const mid = buttonGlowOutState(0.2, null)!;
    expect(mid.ants.alpha).toBeCloseTo(0);
    expect(mid.outerGlowOver.alpha).toBeCloseTo(1);
    expect(buttonGlowOutState(0.3, null)!.outerGlow.alpha).toBeCloseTo(0.5);
    expect(buttonGlowOutState(0.4, null)).toBeNull();
  });

  it("ants follow AnimateTexCoords: one frame per two updates at 60 fps with throttle 0.01", () => {
    const a = createAntsAnimator(0.01);
    const frames = Array.from({ length: 8 }, () => a.step(1 / 60));
    // first call initialises (throttle pre-filled), second jumps 2 frames, then 1 frame every other update
    expect(frames).toEqual([0, 3, 3, 4, 4, 5, 5, 6]);
    expect(antsFrameAt(1, 0.01, 60)).toBe(32 - 22); // frame 32 after 1 s, wrapped at 22
  });

  it("ants advance several frames per update when the throttle is shorter than a frame, wrapping at 22", () => {
    const a = createAntsAnimator(0.001);
    a.step(1 / 60); // init + accumulate
    expect(a.step(1 / 60)).toBe(18); // 1 + floor((0.001 + 1/60) / 0.001)
    const b = createAntsAnimator(0.0005);
    b.step(1 / 60);
    expect(b.step(1 / 60)).toBe(13); // 1 + 34 advances, wrapped

  });

  it("ants texcoords walk the 5-column, 48 px grid of the 256 px texture", () => {
    const cell = 48 / 256;
    expect(antsTexCoord(1)).toEqual([0, cell, 0, cell]);
    expect(antsTexCoord(6)).toEqual([0, cell, cell, 2 * cell]);
    expect(antsTexCoord(22)).toEqual([cell, 2 * cell, 4 * cell, 5 * cell]);
  });
});

describe("Proc glow", () => {
  it("loops the 30-frame flipbook over glowDuration", () => {
    expect(procGlowState(0, false, 1)).toEqual({ startFrame: null, loopFrame: 0 });
    expect(procGlowState(0.5, false, 1).loopFrame).toBe(15);
    expect(procGlowState(2.5, false, 2).loopFrame).toBe(7);
  });

  it("plays the start flipbook first when enabled", () => {
    expect(procGlowState(0.351, true, 1)).toEqual({ startFrame: 15, loopFrame: null });
    expect(procGlowState(0.702, true, 1)).toEqual({ startFrame: null, loopFrame: 0 });
  });

  it("frame geometry follows ProcGlow_Start and the OnShow constants", () => {
    expect(procFrame(40, 40, 2, 0)).toEqual({ left: -10, top: -8, width: 60, height: 56 });
    expect(procStartSize(56, 56).width).toBeCloseTo(((56 / 42) * 150) / 1.4);
    expect(flipbookCell(7)).toEqual([0.4, 0.6, 1 / 6, 2 / 6]);
  });
});

// --- Cross-check the pixel and autocast geometry against the real Lua (excerpt in tests/fixtures/lcg).

const LUA_HARNESS = `
local function tex() local t={pts={}}; function t:SetPoint(p,rel,rp,x,y) self.pts[p]={rp,x,y} end; return t end
local function mask() local m={shown=false}; function m:IsShown() return self.shown end; function m:Show() self.shown=true end; function m:SetPoint() end; return m end

function runPixel(w,h,th,len,N,period,dt,steps)
  local f={timer=0, info={step=1/N, period=period, th=th, length=len}, masks={mask()}, textures={}}
  for i=1,N do f.textures[i]=tex() end
  function f:GetSize() return w,h end
  function f:IsShown() return true end
  local out={}
  for s=1,steps do
    pUpdate(f, dt)
    local row={f.timer}
    for k=1,N do
      local tl=f.textures[k].pts.TOPLEFT; local br=f.textures[k].pts.BOTTOMRIGHT
      row[#row+1]=tl[2]; row[#row+1]=tl[3]; row[#row+1]=br[2]; row[#row+1]=br[3]
    end
    out[#out+1]=table.concat(row, ",")
  end
  return table.concat(out, ";")
end

function runAutoCast(w,h,N,period,dt,steps)
  local f={timer={0,0,0,0}, info={N=N, period=period}, textures={}}
  for i=1,N*4 do f.textures[i]=tex() end
  function f:GetSize() return w,h end
  local out={}
  for s=1,steps do
    acUpdate(f, dt)
    local row={f.timer[1],f.timer[2],f.timer[3],f.timer[4]}
    for i=1,N*4 do
      local c=f.textures[i].pts.CENTER
      local rp,x,y=c[1],c[2],c[3]
      local cx=(rp=="BOTTOMRIGHT" or rp=="TOPRIGHT") and (w+x) or x
      local cy=(rp=="BOTTOMRIGHT" or rp=="BOTTOMLEFT") and (h-y) or -y
      row[#row+1]=cx; row[#row+1]=cy
    end
    out[#out+1]=table.concat(row, ",")
  end
  return table.concat(out, ";")
end
`;

describe("pixel and autocast geometry match LibCustomGlow's Lua", () => {
  let lua: Lua;
  beforeAll(async () => {
    lua = await Lua.create();
    const src = readFileSync(path.resolve(__dirname, "../../../tests/fixtures/lcg/pixel-autocast.lua"), "utf8");
    await lua.doString(src + "\n" + LUA_HARNESS);
  });
  afterAll(() => lua?.global.close());

  async function call(expr: string): Promise<number[][]> {
    const s = (await lua.doString(`return ${expr}`)) as string;
    return s.split(";").map((row) => row.split(",").map(Number));
  }

  const cases = [
    { w: 40, h: 40, th: 1, len: 10, n: 8, period: 4 },
    { w: 120.95, h: 18, th: 2, len: 18, n: 5, period: -2.5 },
    { w: 64, h: 30, th: 3, len: 25, n: 13, period: 1.3 },
  ];

  for (const c of cases) {
    it(`pixel lines ${c.w}×${c.h} th=${c.th} len=${c.len} N=${c.n} period=${c.period}`, async () => {
      const rows = await call(`runPixel(${c.w},${c.h},${c.th},${c.len},${c.n},${c.period},0.0371,150)`);
      for (const row of rows) {
        const [timer, ...pts] = row;
        const lines = pixelGlowLines(timer, c.w, c.h, c.th, c.len, c.n);
        lines.forEach((l, k) => {
          const [x1, y1, x2, y2] = pts.slice(k * 4, k * 4 + 4);
          expect([l.left, l.top, l.left + l.width, l.top + l.height]).toEqual([x1, -y1, x2, -y2]);
        });
      }
    });
  }

  it("pixel lap progress equals the accumulated Lua timer (incl. negative periods)", async () => {
    const rows = await call(`runPixel(40,40,1,10,8,-3,0.05,90)`);
    rows.forEach((row, i) => {
      expect(pixelProgress((i + 1) * 0.05, -3)).toBeCloseTo(((row[0] % 1) + 1) % 1, 9);
    });
  });

  for (const c of cases) {
    it(`autocast sparkles ${c.w}×${c.h} N=${c.n} period=${c.period}`, async () => {
      const rows = await call(`runAutoCast(${c.w},${c.h},${c.n},${c.period},0.0371,120)`);
      rows.forEach((row, step) => {
        const timers = row.slice(0, 4);
        const sparkles = autoCastSparkles(timers, c.w, c.h, c.n, 1.5);
        expect(sparkles).toHaveLength(c.n * 4);
        sparkles.forEach((sp, i) => {
          const [x, y] = row.slice(4 + i * 2, 6 + i * 2);
          expect(sp.x).toBeCloseTo(x, 9);
          expect(sp.y).toBeCloseTo(y, 9);
          expect(sp.size).toBe([7, 6, 5, 4][Math.floor(i / c.n)] * 1.5);
        });
        const t = timers;
        const lt = autoCastTimers((step + 1) * 0.0371, c.period);
        lt.forEach((v, k) => expect(v).toBeCloseTo(((t[k] % 1) + 1) % 1, 6));
      });
    });
  }
});

describe("offsetFrameRect", () => {
  it("applies addFrameAndTex's offsets and 0.05 nudges", () => {
    const r = offsetFrameRect(40, 30, 2, 3);
    expect(r.left).toBeCloseTo(-1.95);
    expect(r.top).toBeCloseTo(-3.05);
    expect(r.width).toBeCloseTo(43.95);
    expect(r.height).toBeCloseTo(36);
  });
});
