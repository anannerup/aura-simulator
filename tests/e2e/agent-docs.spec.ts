import { expect, test } from "@playwright/test";

const uniqueId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * An agent with only the docs: read /docs/agents.md, take each worked example's JSON block as written, push it,
 * and get the combat status the docs promise.
 */
test("every worked example in the docs pushes and validates with the combat status the docs claim", async ({ request }) => {
  test.setTimeout(180_000);
  const md = await (await request.get("/forever/docs/agents.md")).text();
  const blocks = [...md.matchAll(/^```json example=(\S+) combat=(\S+)\n([\s\S]*?)\n```$/gm)].map((m) => ({
    key: m[1],
    combat: m[2],
    body: m[3],
  }));
  expect(blocks.map((b) => b.key)).toEqual(
    expect.arrayContaining(["buff-under-3-min", "buff-missing", "cooldown-icon", "target-debuff-bar", "v1-group"]),
  );
  for (const block of blocks) {
    const workspace = uniqueId(`docs-${block.key}`);
    const res = await request.post(`/api/forever/workspaces/${workspace}/aura`, {
      headers: { "Content-Type": "application/json" },
      data: block.body,
    });
    expect(res.status(), `${block.key}: ${await res.text()}`).toBe(200);
    const answer = await res.json();
    expect({ key: block.key, status: answer.validation.combat.status }).toEqual({ key: block.key, status: block.combat });
    if (block.combat === "ok") expect(answer.validation.errors, block.key).toEqual([]);
  }
});

test("the docs are generated from the server's addon version", async ({ request }) => {
  const md = await (await request.get("/forever/llms.txt")).text();
  expect(md).toMatch(/This server follows Musca Auras \S+ \(WeakAuras [\d.]+, internalVersion \d+\)/);
  expect(md).toContain("### Defaults (generated)");
  expect(md).toContain("`faAuraRemaining` (Seconds left)");
});
