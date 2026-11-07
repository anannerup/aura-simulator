import { describe, expect, test } from "vitest";
import { plainText, wowTextRuns } from "./wow-text";

describe("WoW text escapes", () => {
  test("colour escapes colour their run up to |r (Fojji's T5 warning text)", () => {
    expect(wowTextRuns("|cFFff0000WARNING|r:\nFojjiCore Addon Missing!")).toEqual([
      { text: "WARNING", color: "#ff0000" },
      { text: ":\nFojjiCore Addon Missing!" },
    ]);
  });

  test("a new |c switches colour without |r; same-coloured runs merge", () => {
    expect(wowTextRuns("|cFF00a2ffFojji|r|cFFffea58T5|r - Check |cFF00ff00Running|r")).toEqual([
      { text: "Fojji", color: "#00a2ff" },
      { text: "T5", color: "#ffea58" },
      { text: " - Check " },
      { text: "Running", color: "#00ff00" },
    ]);
    expect(wowTextRuns("|cff111111a|cff222222b|cff222222c")).toEqual([
      { text: "a", color: "#111111" },
      { text: "bc", color: "#222222" },
    ]);
  });

  test("|| is a literal pipe, so ||c is no colour escape", () => {
    expect(wowTextRuns("a||cFFff0000b")).toEqual([{ text: "a|cFFff0000b" }]);
  });

  test("|n breaks the line, textures and atlases aren't drawn, a link shows its text", () => {
    expect(plainText("a|nb |TInterface\\Icons\\Spell:0|t|A:raidicon:0:0|a |Hspell:133|h[Fireball]|h")).toBe("a\nb  [Fireball]");
  });

  test("an inline texture is an image run: path or FileDataID, size, offsets, texels as texture coordinates, colour", () => {
    expect(wowTextRuns("Cast |TInterface\\Cursor\\Cast:0|t now")).toEqual([
      { text: "Cast " },
      { image: { kind: "texture", file: "Interface\\Cursor\\Cast", height: 0, width: 0, offsetX: 0, offsetY: 0 } },
      { text: " now" },
    ]);
    expect(wowTextRuns("|T135807:16:24:2:-3|t")).toEqual([
      { image: { kind: "texture", file: "135807", height: 16, width: 24, offsetX: 2, offsetY: -3 } },
    ]);
    // The tooltip-style icon crop: 64×64 texels, 5..59 of them, tinted red.
    expect(wowTextRuns("|cFF00ff00a|TInterface\\Icons\\Spell_Fire_Fireball:14:14:0:0:64:64:5:59:5:59:255:0:0|tb|r")).toEqual([
      { text: "a", color: "#00ff00" },
      {
        image: {
          kind: "texture",
          file: "Interface\\Icons\\Spell_Fire_Fireball",
          height: 14,
          width: 14,
          offsetX: 0,
          offsetY: 0,
          texCoord: [5 / 64, 59 / 64, 5 / 64, 59 / 64],
          color: [1, 0, 0],
        },
      },
      { text: "b", color: "#00ff00" },
    ]);
  });

  test("an inline atlas is an image run by its atlas name", () => {
    expect(wowTextRuns("|A:raidicon-star:20:20:1:2|a!")).toEqual([
      { image: { kind: "atlas", name: "raidicon-star", height: 20, width: 20, offsetX: 1, offsetY: 2 } },
      { text: "!" },
    ]);
  });

  test("anything else after | stays as written; non-strings read as text", () => {
    expect(plainText("50|x |")).toBe("50|x |");
    expect(plainText(undefined)).toBe("");
    expect(plainText(5)).toBe("5");
  });
});
