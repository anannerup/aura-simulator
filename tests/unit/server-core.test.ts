import { expect, test } from "vitest";
import { getServerAuraCore } from "@/server/addon/core";
import { loadAgentDocs } from "@/server/agent-docs";
import { pushToWorkspace } from "@/server/workspaces";
import { modernDesaturateBad } from "../fixtures/auras";

test("a push answers with the addon's machine-readable combat warnings", async () => {
  const result = await pushToWorkspace("server-core-test", { aura: modernDesaturateBad, children: [] }, "http://x", {
    ref: "v1.15.0",
  });
  expect(result.validation?.combat.status).toBe("broken");
  expect(result.validation?.errors[0]).toMatchObject({
    code: "modern.invalid",
    severity: "error",
    pointer: { tab: "conditions", condition: 1, change: 1, property: "desaturate" },
  });
}, 120_000);

test("the server core follows the requested addon version, one core per resolved ref", async () => {
  const [byTag, byVersion, older] = await Promise.all([
    getServerAuraCore("v1.15.0"),
    getServerAuraCore("1.15.0"),
    getServerAuraCore("v1.10.0"),
  ]);
  expect(byVersion).toBe(byTag);
  expect(byTag.ref).toBe("v1.15.0");
  expect(older.internalVersion).toBe(91);
}, 120_000);

test("the agent docs follow the requested addon version", async () => {
  expect(await loadAgentDocs("http://x", "1.15.0")).toContain("This server follows Musca Auras v1.15.0 (WeakAuras 5.22.0");
  // v1.10.0's full addon VM doesn't load (its .toc names files the repo lacks): served without the generated lists.
  expect(await loadAgentDocs("http://x", "v1.10.0")).toContain("This server follows Musca Auras v1.10.0 (it could not be loaded");
}, 120_000);
