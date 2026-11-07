import { beforeAll, describe, expect, test } from "vitest";
import { canonicalize, loadAddon, sampleIconAura, type AuraCore, type AuraDocument } from "@/core";
import { cachedAddonFetcher } from "../../tests/support/addon-source";
import { plainDecoder } from "../../tests/support/plain-decode";

const REF = "v1.15.0";
const fetchSource = cachedAddonFetcher(REF);
let core: AuraCore;

beforeAll(async () => {
  core = await loadAddon(REF, { fetchSource });
});

/** Import strings the addon itself ships in its Forever tutorial. */
async function tutorialImports(): Promise<string[]> {
  const src = await fetchSource("WeakAuras/ForeverTutorial.lua");
  return [...src.matchAll(/import = "(!WA:2![^"]+)"/g)].map((m) => m[1]);
}

describe("loading an addon version", () => {
  test("reads the addon's version string and internal version", () => {
    expect(core.ref).toBe(REF);
    expect(core.addonVersion).toBe("5.22.0");
    expect(core.internalVersion).toBe(92);
  });

  test("a ref that doesn't exist fails with a clear error", async () => {
    await expect(
      loadAddon("no-such-ref", {
        fetchSource: async (p) => {
          throw new Error(`Could not load ${p} of Musca Auras no-such-ref: HTTP 404`);
        },
      }),
    ).rejects.toThrow(/Could not load .* no-such-ref/);
  });
});

describe("state codes", () => {
  test("the sample aura round trips losslessly", () => {
    const aura = sampleIconAura(core.internalVersion);
    const code = core.encode({ aura, children: [] });
    expect(code.startsWith("!WA:2!")).toBe(true);
    const decoded = core.decode(code);
    expect(decoded.aura).toStrictEqual(aura);
    expect(decoded.children).toStrictEqual([]);
    expect(decoded.senderVersion).toBe("5.22.0");
    expect(decoded.transmissionVersion).toBe(1421);
  });

  test("Lua table semantics survive the round trip", () => {
    const aura: AuraDocument = {
      id: "Ætherisk ✓ \"quoted\" \\ back\nslash",
      "1": "string key one",
      "[1]": "number key one",
      "[2.5]": "float key",
      "[-3]": "negative key",
      "[true]": "boolean key",
      '["[odd"]': "string key starting with a bracket",
      flags: { yes: true, no: false },
      numbers: [0, 1, -1, 0.1, 2 ** 53 - 1, -(2 ** 40), 123456789.125, -0.000001, 1.25e-300],
      sparse: { "[1]": "a", "[3]": "c" },
      mixed: { "[1]": "first", "[2]": "second", disjunctive: "any" },
      nested: [[1, 2], { a: [{}] }],
      empty: {},
      // Escapes followed by digits (custom code: a newline before a number, a tab before one, "—" before one).
      code: "local a = {\n100,\n\t9,\n\t255 }\n-- —1 \"2\" \\3 \r\n0",
    };
    const decoded = core.decode(core.encode({ aura, children: [] }));
    expect(decoded.aura).toStrictEqual(aura);
  });

  test("whole numbers LibSerialize can't store are refused instead of garbled", () => {
    expect(() => core.encode({ aura: { id: "x", big: 1e21 }, children: [] })).toThrow(/2\^53/);
  });

  test("decoding yields the canonical form", () => {
    const aura = { id: "x", seq: { "[1]": "a", "[2]": "b" }, emptyArray: [], keyForm: { "[1.0]": true } };
    const decoded = core.decode(core.encode({ aura: aura as unknown as AuraDocument, children: [] }));
    expect(decoded.aura).toStrictEqual({ id: "x", seq: ["a", "b"], emptyArray: {}, keyForm: [true] });
    expect(decoded.aura).toStrictEqual(canonicalize(aura as unknown as AuraDocument));
  });

  test("the state code is plain: upstream's decode path reads it without decryption", async () => {
    const aura = sampleIconAura(core.internalVersion);
    const code = core.encode({ aura, children: [] });
    const decodeEquals = await plainDecoder(fetchSource);
    expect(decodeEquals(code, { m: "d", d: aura, v: 1421, s: "5.22.0" })).toBe("ok");
  });

  test("garbage is rejected", () => {
    expect(() => core.decode("hello")).toThrow();
    expect(() => core.decode("!WA:2!notreallyacode")).toThrow();
  });
});

describe("fixtures: the import strings shipped in the addon", () => {
  test("ForeverTutorial ships plain strings that decode to auras", async () => {
    const codes = await tutorialImports();
    expect(codes.length).toBeGreaterThanOrEqual(3);
    const decodeEquals = await plainDecoder(fetchSource);
    for (const code of codes) {
      const decoded = core.decode(code);
      expect(typeof decoded.aura.id).toBe("string");
      expect(typeof decoded.aura.regionType).toBe("string");
      const transmit: AuraDocument = { m: "d", d: decoded.aura, v: decoded.transmissionVersion!, s: decoded.senderVersion! };
      if (decoded.children.length > 0) transmit.c = decoded.children;
      expect(decodeEquals(code, transmit)).toBe("ok");
    }
  });

  test("the tutorial groups carry their children", async () => {
    const decoded = (await tutorialImports()).map((c) => core.decode(c));
    const groups = decoded.filter((d) => d.aura.regionType === "dynamicgroup");
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      expect(g.children.length).toBeGreaterThan(0);
      expect(g.children.map((c) => c.id)).toStrictEqual(g.aura.controlledChildren);
    }
  });

  test("re-encoding a tutorial aura round trips", async () => {
    for (const code of await tutorialImports()) {
      const decoded = core.decode(code);
      const again = core.decode(core.encode({ aura: decoded.aura, children: decoded.children }));
      expect(again.aura).toStrictEqual(decoded.aura);
      expect(again.children).toStrictEqual(decoded.children);
    }
  });
});

test("dispose frees the core: later full-VM calls fail instead of loading another VM", async () => {
  const doomed = await loadAddon(REF, { fetchSource });
  await doomed.loadFullAddon();
  doomed.dispose();
  await expect(doomed.registries()).rejects.toThrow(/disposed/);
});
