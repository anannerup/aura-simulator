import { expect, test } from "vitest";
import { validateCode } from "@/server/validation";
import { getServerAuraCore } from "@/server/workspaces/aura-core";
import { modernDesaturateBad } from "../fixtures/auras";

test("validateCode returns machine-readable combat warnings for a state code", async () => {
  const core = await getServerAuraCore("v1.15.0");
  const code = core.encode({ aura: modernDesaturateBad, children: [] });
  const result = await validateCode(code, { ref: "v1.15.0" });
  expect(result.combat.status).toBe("broken");
  expect(result.errors[0]).toMatchObject({
    code: "modern.invalid",
    severity: "error",
    pointer: { tab: "conditions", condition: 1, change: 1, property: "desaturate" },
  });
}, 120_000);
