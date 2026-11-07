import { describe, expect, it } from "vitest";
import type { AuraDocument } from "@/core";
import { TBC_SPELLS } from "@/games/tbc/sources";
import { createGameFiles } from "@/server/game-files";
import { textureProblems } from "@/server/media-check";
import { createTbcFixtureFetch } from "../fixtures/tbc/spells/fixture-fetch";

const files = () => createGameFiles({ source: TBC_SPELLS, dbPath: ":memory:", fetch: createTbcFixtureFetch().fetch });

describe("texture check", () => {
  it("passes game files, Interface\\Icons paths and the addon's own media", async () => {
    const aura: AuraDocument = {
      id: "Ok",
      regionType: "icon",
      displayIcon: "Interface\\Icons\\INV_Misc_Food_86_Basilisk",
      subRegions: [
        { type: "subtexture", textureTexture: "Interface\\Cursor\\Cast" },
        { type: "subtexture", textureTexture: "Interface\\AddOns\\WeakAuras\\Media\\Textures\\Square_White" },
        { type: "subtext", text_text: "Interface is a word, not a path" },
      ],
    };
    expect(await textureProblems(files(), { aura, children: [] }, "tbc")).toEqual([]);
  });

  it("reports paths the game can't draw, with where they are and which aura of a group", async () => {
    const group: AuraDocument = { id: "G", regionType: "group", controlledChildren: ["A"] };
    const child: AuraDocument = {
      id: "A",
      regionType: "icon",
      parent: "G",
      subRegions: [
        { type: "subtexture", textureTexture: "Interface\\Nope\\Nothing" },
        { type: "subtexture", textureTexture: "Interface\\AddOns\\ElvUI\\Media\\Textures\\Glow" },
      ],
      conditions: [{ check: {}, changes: [{ property: "sub.1.textureTexture", value: "Interface/Nope/Other.blp" }] }],
    };
    const problems = await textureProblems(files(), { aura: group, children: [child] }, "tbc");
    expect(problems.map((p) => [p.code, p.severity, p.auraId, p.pointer?.tab, p.pointer?.path])).toEqual([
      ["media.texture", "info", "A", "region", ["subRegions", 1, "textureTexture"]],
      ["media.texture", "info", "A", "region", ["subRegions", 2, "textureTexture"]],
      ["media.texture", "info", "A", "conditions", ["conditions", 1, "changes", 1, "value"]],
    ]);
    expect(problems[0].message).toMatch(/"Interface\\Nope\\Nothing".*game has no such file.*\/api\/tbc\/icons\/search/);
    expect(problems[1].message).toMatch(/another addon \("elvui"\)/);
  });
});
