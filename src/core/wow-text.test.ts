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

  test("anything else after | stays as written; non-strings read as text", () => {
    expect(plainText("50|x |")).toBe("50|x |");
    expect(plainText(undefined)).toBe("");
    expect(plainText(5)).toBe("5");
  });
});
