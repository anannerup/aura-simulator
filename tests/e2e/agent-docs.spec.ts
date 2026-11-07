import { expect, test } from "@playwright/test";

const uniqueId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * An agent with only the docs, per game: read /<game>/docs/agents.md, take each worked example's wago JSON block as
 * written, push it, and get what the docs promise: Forever's combat status; on TBC, no problems at all.
 */
test("every worked example in both games' docs pushes and validates as the docs claim", async ({ request }) => {
  test.setTimeout(240_000);
  const forever = await (await request.get("/forever/docs/agents.md")).text();
  const foreverBlocks = [...forever.matchAll(/^```json example=(\S+) combat=(\S+)\n([\s\S]*?)\n```$/gm)].map((m) => ({
    game: "forever",
    key: m[1],
    combat: m[2] as string | undefined,
    body: m[3],
  }));
  expect(foreverBlocks.map((b) => b.key)).toEqual(
    expect.arrayContaining(["buff-under-3-min", "buff-missing", "cooldown-icon", "target-debuff-bar", "v1-group"]),
  );
  const tbc = await (await request.get("/tbc/docs/agents.md")).text();
  const tbcBlocks = [...tbc.matchAll(/^```json example=(\S+)\n([\s\S]*?)\n```$/gm)].map((m) => ({
    game: "tbc",
    key: m[1],
    combat: undefined,
    body: m[2],
  }));
  expect(tbcBlocks.map((b) => b.key)).toEqual(["buff-under-3-min", "buff-missing", "cooldown-icon", "target-debuff-bar", "v1-group"]);
  for (const block of [...foreverBlocks, ...tbcBlocks]) {
    const label = `${block.game} ${block.key}`;
    expect(JSON.parse(block.body).d, `${label}: wago JSON, the aura in "d"`).toBeTruthy();
    const workspace = uniqueId(`docs-${block.game}-${block.key}`);
    const res = await request.post(`/api/${block.game}/workspaces/${workspace}/aura`, {
      headers: { "Content-Type": "application/json" },
      data: block.body,
    });
    expect(res.status(), `${label}: ${await res.text()}`).toBe(200);
    const answer = await res.json();
    expect(answer.code, label).toMatch(/^!WA:2!/);
    expect(answer.preview.displays.length, label).toBeGreaterThan(0);
    if (block.combat) {
      expect({ label, status: answer.validation.combat.status }).toEqual({ label, status: block.combat });
      if (block.combat === "ok") expect(answer.validation.errors, label).toEqual([]);
    } else {
      expect({ label, errors: answer.validation.errors, warnings: answer.validation.warnings, combat: answer.validation.combat }).toEqual({
        label,
        errors: [],
        warnings: [],
        combat: undefined,
      });
    }
  }
});

test("the docs page's HTML points agents to the plain Markdown before any script runs", async ({ request }) => {
  for (const game of ["forever", "tbc"]) {
    const html = await (await request.get(`/${game}/docs/agents`)).text();
    const shell = html.slice(0, html.indexOf("Loading"));
    expect(shell, game).toContain(`href="/${game}/llms.txt"`);
    expect(html, game).toMatch(new RegExp(`<link rel="alternate" type="text/markdown" href="[^"]*/${game}/llms.txt"`));
  }
});

test("the docs are generated from the server's addon version", async ({ request }) => {
  const md = await (await request.get("/forever/llms.txt")).text();
  expect(md).toMatch(/This server follows Musca Auras \S+ \(WeakAuras [\d.]+, internalVersion \d+\)/);
  expect(md).toContain("### Defaults (generated)");
  expect(md).toContain("`faAuraRemaining` (Seconds left)");
});

test("the option ↔ table reference maps a known option and table key both ways, as JSON and Markdown", async ({ request }) => {
  // The first request for a version waits while the server generates the reference (about a minute).
  test.setTimeout(420_000);
  const res = await request.get("/forever/docs/agents/options.json", { timeout: 400_000 });
  expect(res.status()).toBe(200);
  const reference = (await res.json()) as {
    entries: { tab: string; option: string[]; writes: string[]; scopes: { regionType: string }[] }[];
    byPath: Record<string, number[]>;
  };
  const desaturate = reference.entries.find(
    (e) => e.tab === "region" && e.option.join("/") === "icon.desaturate" && e.scopes.some((s) => s.regionType === "icon"),
  );
  expect(desaturate?.writes).toEqual(["desaturate"]);
  expect(reference.byPath["desaturate"].map((i) => reference.entries[i].option)).toContainEqual(["icon.desaturate"]);
  expect((reference as unknown as { lists: string[] }).lists).toContain("subRegions");
  expect((await request.get("/nogame/docs/agents/options.json")).status()).toBe(404);

  // The Markdown is an index of parts, each fetched on its own and listing everything (nothing shortened).
  const md = await (await request.get("/forever/docs/agents/options.md")).text();
  expect(md).toContain("/forever/docs/agents/options/region-icon.md?ref=");
  expect(md).not.toMatch(/… \(\d+/);
  const icon = await (await request.get("/forever/docs/agents/options/region-icon.md")).text();
  expect(icon).toContain("- **Desaturate** (`icon.desaturate`, toggle) → `desaturate`");
  expect(await (await request.get("/forever/docs/agents/options/keys.md")).text()).toContain("- `desaturate` ← Display › Desaturate");
  expect((await request.get("/forever/docs/agents/options/nothing.md")).status()).toBe(404);

  const docs = await (await request.get("/forever/llms.txt")).text();
  expect(docs).toContain("## Option ↔ table reference");
  expect(docs).toContain("/forever/docs/agents/options.json?ref=");
  expect(docs).toContain("- **Desaturate** (`icon.desaturate`, toggle) → `desaturate`");
});

test("TBC's option ↔ table reference comes from WeakAuras2: a known option and key, as JSON and Markdown", async ({ request }) => {
  test.setTimeout(420_000);
  const res = await request.get("/tbc/docs/agents/options.json", { timeout: 400_000 });
  expect(res.status()).toBe(200);
  const reference = (await res.json()) as {
    ref: string;
    entries: { tab: string; option: string[]; writes: string[]; scopes: { regionType: string; triggerType?: string }[] }[];
  };
  expect(reference.ref).toMatch(/^5\./);
  const unit = reference.entries.find(
    (e) =>
      e.tab === "trigger" &&
      e.option.join("/") === "trigger.1.aura_options.unit" &&
      e.scopes.some((s) => s.regionType === "icon" && !s.triggerType),
  );
  expect(unit?.writes).toEqual(["triggers.1.trigger.unit"]);
  const md = await (await request.get("/tbc/docs/agents/options.md")).text();
  expect(md).toContain("# Option ↔ table reference: WeakAuras 5.");
  const keys = await (await request.get("/tbc/docs/agents/options/keys.md")).text();
  expect(keys).toContain("- `triggers.#.trigger.unit` ← Trigger › Unit");
  // The Load tab's Alive writes only its own key (not every text's formats), under its own name.
  expect(keys).toMatch(/^- `load\.use_alive` ← Load › Alive$/m);
  const aura2 = await (await request.get("/tbc/docs/agents/options/trigger-aura2.md")).text();
  expect(aura2).toContain("`triggers.#.trigger.matchesShowOn`");
  expect(await (await request.get("/tbc/llms.txt")).text()).toContain("/tbc/docs/agents/options.json?ref=");
});
