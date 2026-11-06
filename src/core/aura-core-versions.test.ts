import { beforeAll, describe, expect, test } from "vitest";
import { loadAddon, sampleIconAura, type AuraCore } from "@/core";
import { cachedAddonFetcher } from "../../tests/support/addon-source";

/**
 * The aura core against several real addon versions, so an addon update that breaks loading or
 * encoding is caught. Tag names are as in the repo: "1.13.0" has no "v" prefix; v1.10.0 predates
 * internalVersion 92.
 */
const VERSIONS = [
  { ref: "v1.15.0", addonVersion: "5.22.0", internalVersion: 92 },
  { ref: "1.13.0", addonVersion: "5.22.0", internalVersion: 92 },
  { ref: "v1.10.0", addonVersion: "5.22.0", internalVersion: 91 },
];

const cores = new Map<string, AuraCore>();
beforeAll(async () => {
  for (const v of VERSIONS) cores.set(v.ref, await loadAddon(v.ref, { fetchSource: cachedAddonFetcher(v.ref) }));
});

describe.each(VERSIONS)("Musca Auras $ref", ({ ref, addonVersion, internalVersion }) => {
  test("detects the addon version and internal version", () => {
    const core = cores.get(ref)!;
    expect(core.ref).toBe(ref);
    expect(core.addonVersion).toBe(addonVersion);
    expect(core.internalVersion).toBe(internalVersion);
  });

  test("round trips the sample aura", () => {
    const core = cores.get(ref)!;
    const aura = sampleIconAura(core.internalVersion);
    const decoded = core.decode(core.encode({ aura, children: [] }));
    expect(decoded.aura).toStrictEqual(aura);
    expect(decoded.senderVersion).toBe(addonVersion);
  });
});

test("a state code made with one version decodes with another", () => {
  const newest = cores.get("v1.15.0")!;
  const oldest = cores.get("v1.10.0")!;
  const aura = sampleIconAura(newest.internalVersion);
  expect(oldest.decode(newest.encode({ aura, children: [] })).aura).toStrictEqual(aura);
  const older = sampleIconAura(oldest.internalVersion);
  expect(newest.decode(oldest.encode({ aura: older, children: [] })).aura).toStrictEqual(older);
});
