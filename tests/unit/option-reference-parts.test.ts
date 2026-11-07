/** The option reference's Markdown parts, on a small hand-made reference. */
import { describe, expect, it } from "vitest";
import type { OptionReference } from "@/core";
import { optionReferencePartMarkdown } from "@/games/docs/option-reference";

/** A reference with only the Conditions tab and an icon's Then properties, probed with a background, a text and a border. */
const reference = {
  ref: "5.22.1",
  tabs: [{ key: "conditions", label: "Conditions" }],
  regionTypes: [],
  triggerTypes: [],
  entries: [],
  byPath: {},
  byChildPath: {},
  conditions: {
    regionType: "icon",
    global: [],
    checks: [],
    properties: [
      {
        regionType: "icon",
        added: { option: [], name: "Add Condition" },
        subRegions: [
          { index: 1, type: "subbackground" },
          { index: 2, type: "subtext" },
          { index: 3, type: "subtext" },
          { index: 4, type: "subborder" },
        ],
        properties: [
          { label: "Alpha", property: "alpha", wrote: {}, fields: [] },
          { label: "Text 2 Color", property: "sub.3.text_color", wrote: {}, fields: [] },
          { label: "Border 1 Color", property: "sub.4.border_color", wrote: {}, fields: [] },
        ],
      },
    ],
  },
} as unknown as OptionReference;

describe("the conditions-display parts", () => {
  it("say plainly that their sub.N numbers are the probe's, and which element each one is", () => {
    const md = optionReferencePartMarkdown("http://x", "tbc", "WeakAuras", reference, "conditions-display-icon")!;
    expect(md).toContain("**The numbers in `sub.N` below are this reference's, not your aura's.**");
    expect(md).toContain("`sub.1` = the 1st `subbackground`, `sub.2` = the 1st `subtext`, `sub.3` = the 2nd `subtext`, `sub.4` = the 1st `subborder`");
    expect(md).toContain('- **Text 2 Color** → `property` "sub.3.text_color" (on the 2nd `subtext`: use its number in your aura)');
    expect(md).toContain('- **Alpha** → `property` "alpha"\n');
  });
});
