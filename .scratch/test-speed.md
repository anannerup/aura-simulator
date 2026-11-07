# Test speed

Measured 2026-11-07 on the 20-core desktop while other agents ran their own suites (load average 3–15 throughout),
so wall times are noisy. CPU is each run's cgroup total (`systemd-run --user --scope`): dev server, build and browsers
included. CPU per unit of work also rises when the machine is busy (hyperthreads share cores), so a busy run costs
more CPU for the same work.

## Before (main at c94be8e)

| Run | Wall | CPU | Load |
| --- | --- | --- | --- |
| `npm test` (all 48 Vitest files) | 654 s, 672 s | ~960 s (bash `time`, idle) | 2–4 |
| same, cgroup | 910 s | 1290 s | 9→5 |
| `npm run test:e2e` (`next dev`, nothing cached) | 404 s | – | 2–4 |
| same, option references already kept by the server | 303 s | 1514 s | 6 |

Where the Vitest time went (654 s run):

- `option-reference.test.ts`: 550 s on one worker. Per game: generating the reference (beforeAll, ~40–100 s), then
  "every option has an entry" (~80 s) and the replay (~115–145 s). Both games ran one after the other.
- `wago-tbc.test.ts`: 183 s (one pack, Merfin's T5, takes 43 s on its own).
- `options-sweep.test.ts`: 72 s.
- The other 45 files: under 10 s together.
- Booting an aura core is cheap (light VM ~50–300 ms, full addon VM ~200–300 ms) and so are the addon facts (~0.2 s),
  so caching them wasn't worth it.

Where the e2e time went (404 s run): `agent-docs.spec.ts` ran 400 s on one worker, waiting while the dev server
generated both option references in the background (258 s + 119 s). `tab-sweep.spec.ts` ran 247 s on one worker,
because the tests of a file ran one after the other. The rest ran in parallel in the meantime.

### Per probe (the option reference replay)

One forever shard (a third of its units) did about 3,100 probes in about 150 s of test time. Behind them were 23,035
`setOption` and 17,243 `options()` calls (447 MB of tab trees as JSON), so about 48 ms per probe. Most of that was the
test settling a display type's new aura again for every tab it probed (`baseFor`, once per scope and tab): about 7×
the edits needed. Per call:

- a probe edit: load the base (2.8 ms) + the edit (3.5 ms). The edit is the addon's own `set()`, and its
  `WeakAuras.Add` running in wasm Lua.
- a tab tree: about 8 ms, mostly the addon's AceConfig generator and its get()/hidden() calls. A top-level group's
  tab with hundreds of children takes 0.3–5 s.

After the fix (settle each display type once): 4,825 edits and 1,658 trees for the same shard, 51 s of test time, so
about 16 ms per probe including the bases. A bare replay probe is about 6.8 ms: the addon's `WeakAuras.Add` twice
(once to reload the base, once inside `set()`). Making that cheaper would mean changing how the addon runs, not the
tests.

## After (this branch, main merged)

| Run | Wall | CPU | Load |
| --- | --- | --- | --- |
| `npm test` (fast tier: project `unit`, 56 files) | 2.5–5 s | 36–52 s | 2–10 |
| `npx vitest run` (all Vitest, references cached) | 89–99 s | 850–925 s | 8–13 |
| same, references generated (generator code changed) | 220–240 s | 965–1030 s | 3–10 |
| `npm run test:e2e` (production build, representative tab sweeps) | 72–105 s | 466–690 s | 8–16 |
| `npx playwright test` (all e2e, the test:all part) | 95–100 s | 680–690 s | 7–14 |
| same tests on `next dev` (`E2E_DEV=1`), for comparison | 158 s | 1238 s | 14–19 |

`npm run test:all` = all Vitest + all e2e: about 3 minutes warm (before: 650–910 s + 300–400 s, about 16–20
minutes).

## What changed

1. Tiers: `npm test` runs every Vitest file but the three exhaustive suites (`option-reference`, `options-sweep`,
   `wago-tbc`). `npm run test:all` runs everything. The exhaustive suites are Vitest projects split into shards that run
   in parallel (`vitest.config.ts` `EXHAUSTIVE`, `tests/support/shards.ts` `shardUnits`).
2. The option reference is cached on disk (`tests/support/generated-cache.ts`, `.cache/generated/`). The key is the
   game, the addon ref and a hash of every source file `src/core/addon-vm/vm.ts` reaches through its imports, plus
   package versions. A code change is a new key: the reference is generated fresh, timed, and replayed. Shards share one
   generation through a lock. The e2e server gets the same cached reference (identical apart from `generatedMs`).
3. Settling each display type's new aura once instead of once per tab (`settledTabs`): see "Per probe".
4. e2e against a production build with `fullyParallel` (all tests spread over the workers). The tab sweep runs 3
   display types per game by default; the other 14 are tagged `@exhaustive` and run in `test:all`.
5. Two bugs found by running tests in isolation and in production, both fixed test-first:
   - wasmoon's `doStringSync` leaves results on the Lua stack, so every call into a VM grew it until the heap got
     corrupted. A 155-aura pack failed to load into the editor after being validated. Fix: `runLua`
     (`src/core/lua-run.ts`), regression test `src/core/lua-stack.test.ts`.
     (.scratch/test-speed/issues/02-validate-before-first-options-breaks-editor.md)
   - On a fresh production server an unknown game's pages answered 200. Fix: `ensureStatic` on the game page,
     `src/proxy.ts` for the request-time pages.
     (.scratch/test-speed/issues/01-unknown-game-pages-answer-200.md)

## Coverage across the full tier

Every assertion still runs in `test:all`. What moved:

- `option-reference.test.ts`: the checks of the whole reference (plain JSON, trigger types have entries, reverse index,
  the condition checks agents asked for) run in each game's first shard. The per-unit checks (entries, replays,
  condition checks and properties) are dealt out by display and trigger type, so every unit runs in exactly one shard.
  The totals (`replayed > 3000`, `> 300` checks and properties) are now asserted on the reference's own counts; each
  shard asserts it replayed what it was dealt. The generation-time limit is asserted when the reference is generated
  in that run.
- The e2e tab sweep's 14 non-representative display types run only in `test:all`. Seam A's sweep covers every option of
  every display type in every run of the full tier anyway.
- `games.spec.ts` now also checks `/classic/docs/agents`, `/classic/fonts` and `/classic/render`.
- Waits that a parallel run exposed got the timeouts their work needs: the import into a fresh page (60 s, it loads the
  full addon VM) and the option reference's first request when the server has to generate it (900 s).
- Not explained: `/api/forever/addon/resolve?ref=main` answered 500 in 2 of about 7 parallel runs (both dev and
  production). It hasn't come back since; the test now prints the body, so the next failure shows the cause.
