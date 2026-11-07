# 16: Full agent docs

**What to build:** Agent docs generated from the addon's options and combat rules, with worked examples of the four v1 auras.

**Blocked by:** 05, 10, 12

**Status:** done

- [x] Docs reflect the selected addon version
- [x] Combat rules documented in plain words
- [x] Worked examples for the four v1 auras
- [x] An agent with only the docs can build v1 aura 1

## Notes

- `src/docs/addon-facts.ts` reads the generated parts from the loaded addon version: region and sub-element types
  (`registries()`), defaults (`fillDefaults`), the Aura (Modern) units, filters, Show On values, condition variables
  and the properties each may change, and a combat verdict per trigger type and per spell cooldown condition
  variable (the addon's own `validate` on a probe aura). The server reads them once per process (~0.4 s).
- `src/docs/agent-docs.ts` is the Markdown: workflow (push to `?w=<id>` → player checks the game screen and tabs →
  exports a file → imports in game), document rules, field reference, triggers, conditions, combat rules,
  validation and how to act on it, spells, push API with merge rules, worked examples, troubleshooting. It
  documents the file-based model only (no `?code=`/`?s=`/short links).
- Worked examples (`src/docs/worked-examples.ts`) use the documents in `src/render/examples.ts`, which the browser
  tests push to the window too: 1a buff running low, 1b buff missing, 2 cooldown icon, 3 target debuff bar, 4 a group of them,
  plus a counter-example (time check driving desaturate → `broken`). Each JSON block is tagged
  `json example=<key> combat=<status>`.
- Tests: `tests/unit/agent-docs.test.ts` (examples in the docs equal the shared documents and validate to the
  promised status; generated lists present; every API endpoint the docs mention has a route with that method; no
  address codes or short links), `tests/e2e/agent-docs.spec.ts` (fetches `/docs/agents.md`, pushes each example
  block as written and checks `validation.combat.status`).
- The v1 aura 1a (2026-11-07, after the code review) does what the player asked: shown only under 3 minutes (the
  trigger's Remaining Time window, `secretUseRem`/`secretRem: 180`), desaturated (`desaturate: true`), glowing in its last
  30 seconds (`faAuraRemaining < 30` → `sub.2.glow`), `%p` red under 10 s. The core validates it "ok" (the earlier "no
  slot" error from the simulated client is gone), so the always-shown alternative was dropped.
