# Code review: aura-simulator `main` (whole codebase)

Date: 2026-11-07. Read-only review; no source changed.

- Fixed point: first commit `c238b1b` (`git diff c238b1b...HEAD`, 72 commits), so all of `main` is in scope.
- Method: `codebase-design` vocabulary (module, interface, depth, seam, adapter, leverage, locality) and the `code-review` skill. Two axes, kept apart:
  - **Standards** = `AGENTS.md` module boundaries and conventions, `GLOSSARY.md`, plus the Fowler smell baseline. Smells are judgement calls, labelled "possible X".
  - **Spec** = `.scratch/aura-simulator-v1/spec.md` plus tickets.
- The Standards axis was split across four parallel reviewers by area: core + server/addon; render; app + workspace + server/workspaces; components + docs + server/spells + API routes. The Spec axis had its own reviewer.
- I checked the highest-impact claims myself (grep and reads).

Category tags: **[A]** architecture, **[S]** separation of concerns, **[N]** naming, **[C]** conciseness. Line numbers were checked against `main` at the time of review.

---

## Part 1: Cross-cutting findings, ranked by impact

These span several areas, so no single area section owns them. The area sections refer back to them as T1…T12.

### T1 [A] Addon semantics (Situation model, condition evaluation, combat rules) live in `src/render`, and partly duplicate the core

- `src/render/conditions/evaluate.ts` (418 lines), `forever-rules.ts` (453), `triggers.ts`, `region-defaults.ts` and `src/render/situation.ts` contain no React. They model the addon's trigger, condition and combat semantics.
- `forever-rules.ts:1-4` hand-ports the Aura (Modern) rules, pinned to v1.15.0.
- `forever-rules.ts:357` `validateSecretConditions` (used at `evaluate.ts:213`) is a second validator beside the core's addon-Lua validation in `src/core/addon-vm/validation.ts`. The preview and the validation panel can therefore disagree.
- `src/docs/agent-docs.ts:2,70` imports the hand-ported `MISSING_ROOT` (`forever-rules.ts:256`). The addon VM already extracts the real `MISSING_ROOT_NAMES` (`src/core/addon-vm/lua/extract.ts:216`). This breaks AGENTS.md's rule that docs lists are "generated from the addon version", and makes `docs` depend on `render`.
- The spec asks that restated rules be "flagged if the addon file they mirror changes". The only flag is a comment.

**Fix:**
- Move the pure simulation (Situation, trigger/condition evaluation, region defaults, the secret-aura rules) into its own module (`src/simulation/`, or under `src/core` if seam A may grow). Render then takes `AuraRenderState` in.
- Feed `MISSING_ROOT` from `registries()` / `AddonFacts`.
- Add a test that hashes the mirrored Lua files.

### T2 [A] Seam A ("everything Lua-related hides behind the aura core") leaks: three Lua runtimes and three Lua→JSON writers

- `src/server/addon/option-tables.ts:12,15-202` imports `wasmoon-lua5.1` directly. It runs RegionTypes/*.lua in its own "magic stub" sandbox for the version diff (`diff.ts:151`). `AddonVM.registries()` (`lua/extract.ts:144-190`) already returns the same region and sub-region `default`/`properties` from the real addon. Ticket 04 itself says the core "should replace it".
- `src/core/lua-glue.ts` (light VM) duplicates the bootstrap in `addon-vm/lua/shim.ts`:
  - `bit` library: `lua-glue.ts:39` vs `shim.ts:228`
  - string aliases and `wipe`
  - `stub()` at `lua-glue.ts:66` vs `makeStub` at `shim.ts:46`
- `normalizeNewlines` is defined twice (`aura-core.ts:111`, `addon-vm/vm.ts:81`).
- There are three Lua→JSON writers: `AuraCore.toJSON` (`lua-glue.ts:154-201`), `B.json` (`lua/bridge.ts:118`) and `toJSON` in `option-tables.ts:114`.
- `lua/options.ts:693-696,758,787` embed `AuraCore.toJSON` strings inside a `B.json` result, so `vm.ts:245-248,265,279` parse twice. Because `B.json` writes empty tables as `{}`, four JS normalisers patch arrays back (`options.ts:122,167-176`, `vm.ts:273`, `validation.ts:143-152`).

**Fix:**
- Delete `option-tables.ts` and have `diffAddonVersions` diff two cores' `registries()`.
- Extract a shared `lua/stdlib.ts` loaded by both VMs.
- Give `B.json` a canonical (arrays) mode and delete the nested strings and the four normalisers.

### T3 [A] Addon source on the server: three disk caches, two `DEFAULT_ADDON_REF` values, four jsDelivr URL builders, and the server ignores the chosen version

- **Disk caches.**
  - `src/server/workspaces/aura-core.ts:12-27` (`diskCachedFetcher`, `.cache/addon/<ref>`) caches branch names forever and writes non-atomically.
  - `src/server/addon/source-cache.ts` (`data/addon`) resolves refs and writes atomically.
  - `tests/support/addon-source.ts:9-23` copies the first one.
  - The comment at `aura-core.ts:10`, "Ticket 04's addon cache can replace this fetcher", is stale: ticket 04 is done.
- **`DEFAULT_ADDON_REF`.** `src/core/addon-source.ts:6` has `"v1.15.0"`, while `src/render/textures/loader.ts:35` has `"1.15.0"`. `fonts.ts:10` uses the render one.
- **jsDelivr URLs.** They are built in `core/addon-source.ts:9-10`, `server/addon/remote.ts:52`, `render/textures/paths.ts:19,42` and `render/fonts.ts:32-36`.
- **Version ignored on the server.** Push validation (`server/validation.ts:13`), the agent docs (`server/workspaces/docs.ts:11-28`) and the server core (`aura-core.ts:32`) are all pinned to `DEFAULT_ADDON_REF`. Ticket 16 ticks "Docs reflect the selected addon version".
- **wasm path.** The literal is written three times (`server/workspaces/aura-core.ts:38`, `option-tables.ts:212`, `app/lua/liblua5.1.wasm/route.ts:6`).

**Fix:**
- Build the server core's fetcher from `getAddonSourceCache()` and key cores by resolved ref.
- Keep one `DEFAULT_ADDON_REF` (core's) and one `jsDelivrUrl`; render imports both.
- Thread `ref` through push, validation and docs.
- Keep one wasm path constant in server.

### T4 [A] The full-VM interface is written out 4 times, and the worker is never stopped

- **Shotgun Surgery: adding one VM call touches 7 places.**
  - `AuraCore` and its implementation (`core/aura-core.ts:28-80,159-198`)
  - `AsyncAddonVM` and `Method` (`addon-vm/remote.ts:9-25`)
  - the inline adapter (`remote.ts:39-58`) and the worker adapter (`remote.ts:119-131`)
  - the worker `switch` (`addon-vm/worker.ts:30-49`)
  - `AddonVM` (`vm.ts:53-71`)
- `VMState` (`vm.ts:31-34`) duplicates `AuraState`. `OptionEdit<Doc>` (`options.ts:89`) is generic only to avoid an import cycle.
- **Bug.** `AsyncAddonVM.dispose()` exists (`remote.ts:22,130`), but `AuraCore` has no `dispose`. When `useAddonCore.ts:90-91` swaps cores on a version change, the old Web Worker and its full Lua heap stay alive.

**Fix:**
- Derive `AsyncAddonVM` with a mapped type over `AddonVM`, build both adapters with one generic proxy, and replace the worker switch with `loaded[msg.method](...msg.args)`.
- Move `AuraDocument`/`AuraState` into `lua-value.ts` (or a new `document.ts`) and delete `VMState` and the generic.
- Add `AuraCore.dispose()`.

### T5 [A][S] The page's workspace module is a god class behind a Middle Man, and the composition root does tree surgery

- **`src/app/workspace/session.ts:123-584`, one class with six concerns:**
  - restore policy (`147-203`)
  - code cache (`136-139`, `363-394`)
  - storage write-behind with the module-global `writesInFlight` (`110`, `441-466`)
  - address handling (`window.location` at `148`, `469-475`)
  - the server sync protocol (`477-583`)
  - file-import orchestration (`308-340`)

  It has no unit test because `start` reads `window` directly.
- **`useWorkspace.ts:85-125`** holds 14 `useCallback` forwarders (`session.current?.x() ?? NOT_READY`) and a 14-entry dependency array. Four members have no consumers: `selected` (a duplicate of `aura`), `codeOf`, `exportFile`, `checkFile`/`FileCheck`.
- **`src/app/Workbench.tsx`:**
  - `58-75` `changeOptions` walks the tree, compares with `JSON.stringify` and calls `updateNode` per child. That is a tree operation.
  - `77-85` snapshots the whole tree as JSON for undo, up to 200 snapshots (`workspace/history.ts:18`), each possibly megabytes.
  - `45-49` encodes the sample aura only so the session can decode it again.
- **Stale undo docs.** `useUndo.ts:25-31` and `history.ts:1-8` still say "state codes" and "address follows".

**Fix:**
- Move the pure restore decision to `src/workspace` (`chooseRestore(...)`, from `session.ts:161-200`).
- Split out `ServerLink`, `StorageWriter` and `CodeCache`.
- Add `updateNodeWithDescendants` to `tree.ts`.
- Make undo hold `{items, selectedId}` by reference (nodes are immutable).
- Expose the session via `useSyncExternalStore` and delete the forwarders.

### T6 [A] Wire protocols are hand-copied on both ends and have already drifted (one real data bug)

- **Page↔workspace server.**
  - `CLIENT_HEADER` is `"X-Aura-Client"` at `app/workspace/session.ts:91` and `"x-aura-client"` at `app/api/workspaces/[id]/aura/route.ts:6`.
  - `ChangeNotice`/`ServerSnapshot` (`session.ts:97-105`) duplicate `WorkspaceNotice`/`WorkspaceSnapshot` (`server/workspaces/hub.ts:10-22`).
  - The SSE event names (`events/route.ts:30,43` vs `session.ts:566-567`) and the API paths (`session.ts:492,493,534,575`) are hard-coded on both sides.
- **Addon API.** `app/_addon/addon-client.ts:15-40` hand-copies `VersionList`/`Resolution`/`AddonDiff` as `*Info` types. They already lack `tagConfirmed`, `key` and `options`.
- **Spells.**
  - `components/spell-picker/spell-api.ts:2,4` imports and re-exports types from `@/server/spells`, whose barrel imports `node:path`. That is client code depending on a server barrel.
  - **Bug.** The core collects up to `MAX_IDS = 1000` spell IDs (`core/addon-vm/spells.ts:23`). `server/addon/client-spells.ts:5,15` truncates to 500. On the server path, IDs 501 and above come back missing and `spells.ts:83` caches them as `null` permanently. The browser re-chunks with a literal `500` (`addon-client.ts:151-152`).

**Fix:**
- Add one pure `src/workspace/protocol.ts` (header, notice/snapshot types, event names, URL builders).
- Add one server-free API-types module (e.g. `src/api/types.ts`) for addon and spell wire types and limits; delete the `*Info` copies.
- Use one shared spell-ID limit everywhere, and never cache truncated IDs as unknown.

### T7 [A] Region-type knowledge is scattered, and there are three drawing paths with a circular import and a likely placement bug

- **Circular import.** `render/AuraPreview.tsx:3` imports `AnimatedAuraRegion`, and `AnimatedAuraRegion.tsx:5` imports `AuraRegion` back from `./AuraPreview`.
- **Three drawing paths:**
  - `AuraPreview` (only `/lab`)
  - `group/WorkspaceStage` (the window)
  - bare `AuraRegion` (`app/NewAuraChooser.tsx:186`)
- **Likely bug.** `AuraPreview.tsx:38-39` places auto-sized (text) regions as a point. `group/layout.ts:115` always uses `num(aura.width, 64)` and never reads `autoSize` (grep: `autoSize` appears only in `regions.tsx`). So text auras on the game screen are likely offset compared with `/lab`.
- **Duplication between the two.** `AuraPreview` and `WorkspaceStage` duplicate `DEFAULT_SCREEN` (`AuraPreview.tsx:24`, `WorkspaceStage.tsx:23`), the screen/stand-in markup and `data-testid="aura-preview"`. `WorkspaceStage` borrows `AuraPreview.module.css`.
- **Repeated Switches on region type, at least 8 sites:**
  - `regions.tsx:37`
  - `AnimatedAuraRegion.tsx:19`
  - `animations.ts:195`
  - `conditions/region-defaults.ts:83`
  - `forever-rules.ts:256,421`
  - `SubText.tsx:36,53`
  - `subregions/host.ts:50,73`, plus `regionType === "aurabar"` checks in `SubGlow.tsx:15,40`, `Border.tsx:48`, `SubTextures.tsx:51,188,230` and `SubRegions.tsx:30`
- **Leaky `AuraRenderState.properties`.** It covers only keys listed in `region-defaults.ts`, so each renderer adds `?? aura.x` (`AuraBarRegion.tsx:36,37,40`, `TextureRegion.tsx:23`, `ProgressTextureRegion.tsx:35,45`, `TextRegion.tsx:3`), and sub-regions re-key paths by hand (`SubText.tsx:80-90`, `Ticks.tsx:27`, `Border.tsx:44`, `SubTextures.tsx:72`).

**Fix:**
- Move `AuraRegion` into its own file.
- Make `AuraPreview` a one-item game screen and honour `autoSize` in `placeLeaf`.
- Extend the `RegionType` record (`colorProperty`, `caps`, `host`, `subTextDefaults`, `defaultArea`) and read it everywhere.
- Give the state a `get(path)` backed by `baseProperty` (`evaluate.ts:66`).

### T8 [A] Modules sit in the wrong folders, and `src/app` is not thin

- `src/server/workspaces/aura-core.ts` (the server's aura core) and `src/server/workspaces/docs.ts` (the agent-docs loader) have nothing to do with workspaces.
- `src/server/validation.ts` is a 15-line Middle Man (`validateCode`) with one production caller (`server/workspaces/index.ts:59`), which already passes `core`. It also creates the cycle `workspaces/index` → `../validation` → `workspaces/aura-core`.
- `server/workspaces/index.ts:20-23` `pageUrlFor` is a pass-through to `buildPageUrl`.
- `src/app/_addon/addon-client.ts` (179 lines: Cache Storage, gzip inflate, bundle validation, a three-level fallback, localStorage) and `src/app/workspace/session.ts` (584 lines) are client libraries. AGENTS.md says `src/app` is "Thin; delegates". The `src/app/workspace` vs `src/workspace` name pair also confuses.
- `server/addon/client-spells.ts:13-28` only reshapes `SpellCache.lookup` (possible Feature Envy). Its route has to import two server modules.
- `render/screen/settings.ts` is app-state persistence used only by `app/screen/*`.
- `render/fonts.ts:44-66` (`ensureFont`) fetches and keeps a global store. That breaks AGENTS.md's "nothing fetched inside [render] except textures via `src/render/textures`".

**Fix:**
- Move the server core to `src/server/addon/core.ts` and the docs loader to `src/server/agent-docs.ts`.
- Inline `validateCode` and `pageUrlFor`.
- Move `addon-client.ts` and the session to a client module outside `app/` (e.g. `src/client/`).
- Make `clientSpells` a `SpellCache` method.
- Move `screen/settings.ts` to `app/screen/`.
- Move font loading next to textures (or amend AGENTS.md).

### T9 [S][C] Duplicated small helpers across layers (the parallel-agents tax)

| Concept | Copies | Locations |
|---|---|---|
| `const num = ` | 15 files | IconRegion, AuraBarRegion, TextRegion, TextureRegion, ProgressTextureRegion, StopMotionRegion (different signature), AnimatedAuraRegion, AuraPreview, progress-texture, group/layout, group/grow, SubText, Ticks, SubTextures, Border; plus `finite` in `forever-rules.ts:25` |
| Lua colour → Rgba | 4 | `IconRegion.tsx:14`, `SubText.tsx:30` (imported by 9 files), `WorkspaceStage.tsx:29`, `AnimatedAuraRegion.tsx:99` |
| Rgba → CSS | 5 | `IconRegion.tsx:24`, `TurnedTexture.tsx:10`, `glow/Glow.tsx:207`, `ColorPicker.tsx:21`, `WorkspaceStage.tsx:31` |
| `Rgba` type | 5 | `TurnedTexture.tsx:8`, `MappedTexture.tsx:9`, `animations.ts:11`, `glow/params.ts:9`, `ColorPicker.tsx:10` |
| RGB↔HSV | 2 | `render/animations.ts:113-134`, `components/options-editor/ColorPicker.tsx:24-45` |
| `e instanceof Error ? e.message : String(e)` | about 27 | e.g. `Workbench.tsx:71`, `NewAuraChooser.tsx:48,73,219,235`, `OptionsEditor.tsx:36`, `push.ts:91,101`; `errorText` in `session.ts:107` is private, and `addon-client.ts:42-48` has another |
| State-code pattern | 3, and they disagree | `workspace/files.ts:22` `/!WA:\d+!…/`, `workspace/workspace.ts:31` `/^!WA:2!…$/`, `server/workspaces/push.ts:57` `startsWith("!WA:")` |
| WoW colour-code stripping | 3 | `docs/addon-facts.ts:98`, `core/addon-vm/validation.ts:165`, `components/options-editor/wow-text.ts:2-11` |
| zamimg icon URL | 2, with clashing names | `server/spells/sources.ts:18-25` `iconUrl(name)`, `render/textures/icons.ts:11-16` `iconNameUrl`; `icons.ts:180` defines a different `iconUrl(fileDataId)` |
| `Interface\Icons\` path / icon name normalising | 2 + 3 | `OptionDialogs.tsx:100`, `client-spells.ts:18`; `spell-cache.ts:168`, `wow-text.ts:24`, `icons.ts:24` |
| Debounced, abortable spell search effect | 3 | `options-editor/fields.tsx:122-136`, `OptionDialogs.tsx:108-126`, `spell-picker/SpellPicker.tsx:54-66` |
| IndexedDB open/run wrapper | 2 | `app/screen/screenshot-store.ts:13-37` (not hardened), `app/workspace/storage.ts:70-109` |
| Atomic tmp-and-rename write | 2 | `server/addon/source-cache.ts:102-107`, `server/addon/bundle.ts:89-101` |
| `{ok:boolean; error?:string}` result | 4 names | `LoadResult` (`session.ts:62`), `ApplyResult` (`RawEditor.tsx:19`), inline in `OptionsEditor.tsx:30` and `NewAuraChooser.tsx:19` |
| `spellId` parsing | 2 | `core/trigger-spell.ts:13`, `core/addon-vm/spells.ts:28` (they differ only in the 2^31 cap) |
| Lua number literal | 2 | `core/lua-literal.ts:60-69`, `core/lua-value.ts:138-143` |
| Request origin | 2, and they disagree behind a proxy | `app/docs/agents/page.tsx:10-15` (reads `x-forwarded-*`), `app/llms.txt/route.ts:7` (`nextUrl.origin`) |
| Bad-workspace-id 400 response | 3 | `api/workspaces/[id]/route.ts:13`, `aura/route.ts:16`, `events/route.ts:16` |
| ID / ID-list parsing in routes | 2 + 2 | `api/spells/[id]/route.ts:9`, `api/icons/[fileDataId]/route.ts:9`; `api/icons/route.ts:6-11`, `api/addon/spells/route.ts:14-15` |

**Fix:**
- `num`/`finite`/`list`/`field` go next to `getField` in `core/lua-value.ts`. (`forever-rules.ts:13-23` "Small readers" are imported by `AnimatedAuraRegion.tsx` and `SubRegions.tsx`.)
- Add one `render/color.ts`.
- Add one `errorMessage(e)` and one `fetchJson`.
- Add one `STATE_CODE` pattern in `workspace/files.ts`.
- Add `useSpellSearch`, a shared `idb.ts`, and a shared server `http.ts` for ID parsing.

### T10 [S] Two "new aura" paths build different documents

- `app/NewAuraChooser.tsx:59-75` uses the addon's `core.newAura` and computes placement inline (`insertionTarget`, sibling count, `xOffset = siblings*(width+4)`, a group node at line 69).
- `components/workspace-tree/WorkspaceTree.tsx:117-134` does the same placement through `tree.ts:377-380` (`newAuraNode`, the same offset formula) and `newGroupNode` (`384-438`). Those use hand-written defaults (`sampleIconAura`, Group.lua defaults).
- So a "new" aura depends on which button made it.

**Fix:** add one `placeNewItem(items, selectedId, aura)` to `tree.ts`, and decide whether `newAuraNode`/`newGroupNode` go now that the addon's New Aura page exists.

### T11 [C] Dead code and dead files (each verified by grep over `src`, `tests`, `scripts`)

- **`src/core/index.ts`.** These exports have no consumer outside core: `keyFromString`, `keyToString`, `jsDelivrUrl`, `ADDON_CONTRACT`, `AddonContractError`, `FOREVER_CLIENT_PROFILE`, `ProfileEntry`, `OptionEditError`, `getTrigger`. Unused type exports include `LoadAddonOptions`, `LuaArray`, `OptionPath`, `OptionTab`, `OptionTarget`, `OptionPointer`, `CombatReport`, `AuraPack`, `AuraPackBlock`, `NewAuraButton`, `NewAuraType`. `sampleIconAura` makes sample data part of seam A.
- **`FOREVER_CLIENT_PROFILE`** (`core/addon-vm/profile.ts:20-~165`) is about 130 lines of hand-written prose describing `PROFILE_LUA` (line 170). Nothing reads it, and nothing ties it to the Lua, so it will drift.
- **Lua:**
  - `S.fire` (`shim.ts:633-642`) is never called.
  - `O.setupErrors()` (`lua/options.ts:796`) has no caller, so the collected errors are never reported.
  - `shim.ts:656-657` is a dangling comment.
- **UI kit:**
  - `Section`/`SubHeading` (`ui/Section.tsx` plus CSS)
  - `Tabs` (`ui/Tabs.tsx`; `OptionsEditor.tsx:200-213` hand-builds its own tablist instead)
  - `Segmented` (`ui/Form.tsx:119-168`)
  - 14 of 23 icons in `ui/icons.tsx` (`CopyIcon`, `ChevronUpIcon`, `PanelLeftIcon`, `PanelRightIcon`, `CloseIcon`, `BookIcon`, `CodeIcon`, `MonitorIcon`, `SparkIcon`, `LayersIcon`, `UndoIcon`, `RedoIcon`, `BracesIcon`, `ShieldIcon`)
- **Shell.** `Brand`, `LogoMark`, `TopBarGroup`, `TopBarSpacer`, `TopBarDivider`, `TopBarChip` (`shell/parts.tsx:10-60`, with their CSS), and `useShell`/`ShellContext` (`AppShell.tsx:37-51,87`).
- **CSS:**
  - `src/app/page.module.css`: only `lab/page.tsx` imports it, and it uses only `.page`, `.header` and `.status`; the rest is the old home page.
  - `OptionsEditor.module.css:305-325`: native colour-input rules left over from before `ColorPicker`.
- **Workspace:**
  - `topLevelOf` (`workspace/tree.ts:131`)
  - `parseWorkspace` (`workspace.ts:163-166`, tests only)
  - `ReadResult.skipped` (`workspace.ts:76`, never read)
  - `useWorkspace`'s four unused members (T5)
- **Render:**
  - `SPELL_COOLDOWN_WORKS_IN_COMBAT` (`forever-rules.ts:175`) and `GENERIC_CONDITIONS_RUN_IN_COMBAT` (`:450`) are constant `true`s with no reader.
  - `texCoordWithin` (`textures/pixels.ts:75`).
  - `regions.tsx:16` `RegionProps` has no consumer, while every region re-declares its props inline.
- **Routes:**
  - `GET /api/addon/[ref]/files/[...path]` has no caller in `src` or `tests`.
  - `GET /api/icons/[fileDataId]` duplicates the batch route and is used only by tests.
- **Speculative.** The `"light"` bundle set (`core/addon-bundle.ts:7-9`) is used only by tests; the app always asks for `"full"`.
- **`prototypes/headless-addon/`** (884 KB committed, including `out/*.json` run outputs) has been superseded by `src/core/addon-vm/lua/*`. Four source headers still cite it (`bridge.ts:2`, `extract.ts:2`, `shim.ts:2`, `lua/options.ts:5`). Delete the folder (git history keeps it) and the provenance comments.
- **Over-exporting.** About 150 exports are used only in their own file (e.g. most of `animations.ts`, `glow/procGlow.ts`, `glow/buttonGlow.ts`, `examples.ts` builders, `ColorPicker.tsx` helpers). Un-exporting them shrinks every module's apparent interface.

### T12 [N] Glossary drift on the three most-used concepts, one of which is a functional mismatch

- **Game screen.** The glossary term appears in code as `MockScreen` (`render/screen/MockScreen.tsx`), `GameScreenStage` (`app/screen/GameScreen.tsx:35`), shell `Stage`/`StageToolbar`/`StageMessage` (`shell/parts.tsx:90-131`), `WorkspaceStage`, and "mock (game) screen" in comments. Pick `GameScreen` for the frame and `GameScreenAuras` (or similar) for the content, or add "stage" to the glossary.
- **Window.** `Workbench.tsx:29` calls itself "the window". `InspectorSection` (`shell/parts.tsx:63`) names a pane that no longer exists, and `shell/index.ts:2-3` lists stale slots ("brand, topBar, left, stage, inspector, drawer"). `WorkspaceTree` is called "the aura list" everywhere else (`AppShell.tsx:24`).
- **Aura / item / node.** `WorkspaceNode`, `nodeId` and `findNode` sit beside `items`, `codeOfItem` and `auraFile(itemId)`, and the UI says "Add items" (`ImportExport.tsx:101`). Use "aura" in public names and UI, and keep `node` for tree structure.
- **Tabs (functional).** `OptionTarget.tab` uses `"display"`/`"actions"` (`core/addon-vm/validation.ts:4-9`), while `OptionTab.key`/`OptionAddress.tab` use the window keys `"region"`/`"action"` (`options.ts:71`). A validation pointer cannot be passed straight to `options({tab})`.
- **State code.**
  - `lua-glue.ts:209` shows users "Not an import string".
  - Packs say "import data" (`options.ts:214`, `aura-core.ts:78`).
  - The server "workspace" (`hub.ts:13` `WorkspaceSnapshot.code`) is one pushed aura, not a Workspace; `session.ts:164` wraps it into a one-item workspace. Rename it `PushRevision.auraCode`, or say in the glossary that the server keeps only the latest push.

---

## Part 2: Standards axis, by area

These are findings not already covered above (or the area-specific detail of them).

### 2.1 `src/core` and `src/server/addon`

1. [A] **The addon contract is not kept (AGENTS.md: "every addon internal it uses in its contract").**
   - `lua/extract.ts:3-4` claims full coverage, but it uses `D.approximateUnits`, `D.dispelTypes`, `D.missingTypes`, `D.processingOptions`, `D.sortMethods`, `D.STACK_LIMIT`, `P.event_categories`, `P.AuraSingleShared` and `P.AuraDisplayShared`, none of which are in `contract.ts:18-56`.
   - `lua/options.ts` (lines 31, 41, 61, 101, 246, 295, 771-783) uses `P.GetDataByUID`, `P.ValueFromPath`, `P.TraverseLeafsOrAura`, `OP.registerRegions`, `OP.ClearOptions`, `OP.IsCollapsed`, `OP.classPacks`, `OP.GetClassPackBlocks` and `OP.BuildClassPackBlockImport` behind `and`/`or {}` guards, so a rename degrades silently instead of raising `AddonContractError`.
   - Fix: list them (as `optional` if needed) and drop the guards.
2. [S] **`lua/options.ts` (797 lines) mixes five concerns:** dialogs (49-288), session load (289-347), tree evaluation (348-546), edits (547-698) and New Aura/Packs (699-796). The New Aura types also sit in `addon-vm/options.ts:186-234`. Fix: split into `lua/dialogs.ts`, `lua/options.ts` and `lua/new-aura.ts`, mirrored in JS by `addon-vm/new-aura.ts`.
3. [S] **The OptionsPrivate wiring is done twice:** `vm.ts:152` and `lua/options.ts:39`. Keep only the Lua one.
4. [S] **`lua-literal.ts` (426 lines) holds the Lua printer, the lexer/parser and canonical JSON (`387-426`).** Move the canonical JSON to `lua-value.ts` (or a new `canonical-json.ts`), share number formatting with `lua-value.ts:138-143`, and un-export `luaString` (`:45`).
5. [N] **Two unrelated `remote.ts` files:** `core/addon-vm/remote.ts` (VM host) and `server/addon/remote.ts` (upstream HTTP). Rename them `addon-vm/host.ts` and `server/addon/upstream.ts`.
6. [N] **`ValidationMessage.code` docs (`validation.ts:20-28`)** omit `defaults.message` (`:162`) and `addon.LuaError` (`:228`).
7. [N] **Mixed spelling:** `normalise`/`summarise` in server (`refs.ts:32`, `diff.ts:116`) vs `normalize` in core (`options.ts:120,170`, `aura-core.ts:111`).
8. [C] **Stale or false comments:**
   - `shim.ts:334` says timers are "never fired", but `bridge.ts:49` `S.tick` fires them.
   - `lua/options.ts:22` refers to a non-existent "tabs.ts".
9. [C] **Hand-rebuilt state.** `aura-core.ts:165,169,181,185` rebuild `{aura, children}` by hand instead of passing `state` through.
10. [S] **Barrel self-import.** `server/addon/http.ts:4` imports `getAddonSourceCache` from its own barrel (`./index`); import `./source-cache`.

### 2.2 `src/render`

1. [A] **`WorkspaceStage` lives in `group/` but draws the whole workspace,** and it evaluates every aura twice per render (inside the layout memo at `:54`, and unmemoised at `:81`). Fix: move it to `screen/`, evaluate once and pass the states into `layoutStage`.
2. [A] **Every region repeats the same scaffolding,** and `IconRegion.tsx` serves as the shared-helpers file. The frame + `SubRegions` + `FrozenMarker` shell appears in `TextureRegion.tsx:61-65`, `ProgressTextureRegion.tsx:74-78`, `ModelRegion.tsx:32-36,42-46`, `StopMotionRegion.tsx:156-160` and `AuraBarRegion.tsx:134-138`; all of them import `FrozenMarker`/`textValues` from `IconRegion`. Fix: a shared `<RegionFrame>` (or `AuraRegion` adds them), with regions typed as `ComponentType<RegionProps>`.
3. [S] **`RegionAnim` and `color()` live in the wrong files (possible Feature Envy).** `RegionAnim` is defined in `TextureRegion.tsx:16` but used by `regions.tsx`, `AuraPreview.tsx` and `ProgressTextureRegion.tsx`. `color()` lives in `SubText.tsx:30`. Move them to `regions.tsx` and `color.ts`.
4. [S] **Timer progress is derived six ways:**
   - `IconRegion.tsx:120`
   - `StopMotionRegion.tsx:121`
   - `SubTextures.tsx:61,185`
   - `bar-geometry.barProgress`
   - `progress-texture.progressTextureProgress`

   `ProgressTextureRegion.tsx:36` calls `barProgress` only for min/max. Fix: one `timerProgress(dynamic, opts)`.
5. [S] **Stop motion is written twice:** `StopMotionRegion.tsx:99-161` and `SubStopMotion` (`SubTextures.tsx:162-215`). Share `stopMotionFrameFor(...)`.
6. [S] **Icon zoom-crop and tint are duplicated** (`IconRegion.tsx:47-58,72-75` vs `AuraBarRegion.tsx:156-175`), as is the text wrap/elide style (`TextRegion.tsx:47-51` vs `SubText.tsx:110-114`).
   - The `POINTS` set is copied in `SubText.tsx:13` and `SubTextures.tsx:27`, and it is a no-op because `anchorFraction` (`anchor.ts:16`) already maps unknown names to CENTER.
   - The point-anchoring maths is repeated in `SubText.tsx:86-102`, `SubTextures.tsx:41-50` and `anchor.placeRegion`.
7. [S] **Ad hoc Lua-table reads instead of `getField`/`isLuaTable`:** `group/layout.ts:132-133` (`information.groupOffset`) and `StopMotionRegion.tsx:104-110`.
8. [A] **Possibly many frame loops:** one `requestAnimationFrame` loop per `AnimatedAuraRegion` (`:86`) and one per glow (`glow/useGlowClock.ts:35`), beside `clock.ts`'s context. Consider one shared frame clock.
9. [N] **`barFrame` CSS class** is used by non-bar regions (Texture, ProgressTexture, StopMotion, Model, Empty). Rename it `regionFrame`.
10. [N] **`forever-rules.ts` is a misleading module name.** It holds generic readers, comparison, native-variable tables, `frozenMarkerSize` (imported by all 7 regions) and `MISSING_ROOT`. Split it into readers (→ core), `frozen-marker.ts` and `secret-aura-rules.ts`.
11. [N] **Two box shapes (possible Data Clump):** `Box{left,top}` in `bar-geometry.ts:9` (imported by 7 non-bar files) and `Rect{x,y}` in `screen/geometry.ts:18`. Move `Box` to a shared geometry file, or unify them.
12. [C] **Barrels that don't match use.**
    - `conditions/index.ts` re-exports `canFreeze`, `evaluateCheck`, `baseProperty`, `textKind` and `validateSecretConditions`, which nothing imports through it, while 9 files deep-import `./conditions/forever-rules`.
    - `textures/index.ts` omits `useTexture`, so `StopMotionRegion.tsx:23`, `glow/Glow.tsx:5` and `components/ui/GameTexture.tsx:4` deep-import it.

    Trim the barrels or remove them.
13. [C] **Tiny files to merge:**
    - `clock.ts` (11 lines) → `AnimatedAuraRegion.tsx`
    - `anchor.ts` (34) + `screen/geometry.ts` → one placement module
    - `animatedRect` (`AnimatedAuraRegion.tsx:32`) is pure geometry → `screen/geometry`
14. [C] **Stale or wrong comments:**
    - `regions.tsx:2-3`: "new region types (groups, textures, …) register themselves".
    - `AuraPreview.tsx:23`: the component's doc comment sits above `DEFAULT_SCREEN`.
    - `evaluate.ts:61`: "ticket 08's glow renderer".
    - `AnimatedAuraRegion.tsx:54`: garbled sentence.
    - AGENTS.md: the group layout is "Pure, shared by page and server", but nothing in `src/server` imports `render/group`.
15. [A] **`components/ui/GameTexture.tsx` and `ADDON_MEDIA` (`:8`) are game code in the generic UI kit,** and `ADDON_MEDIA` duplicates `render/media.ts:11`. Move them to `render/textures`.

### 2.3 `src/app`, `src/workspace`, `src/server/workspaces`

1. [S] **Browser-storage key in the pure model.** `workspace.ts:37-39` `storageKey` is used only by `session.ts:18,429,445,452`. Move it into `app/workspace/storage.ts`.
2. [S] **Test hooks in the UI.**
   - `Workbench.tsx:188-193` mounts a hidden `ExportPanel` when nothing is selected. But `withSelection` (`session.ts:398`) always selects `items[0]`, so that branch can only hold an empty code. Delete it.
   - `ImportExport.tsx:175-176` adds a hidden textarea "for agents and tests". A `data-` attribute would do.
3. [S] **`GameScreen` reaches into another component's DOM.** `GameScreen.tsx:18,74` calls `document.getElementById(...).click()` on an input inside `ScreenSettingsPanel` (`:34,166`). It only works because `Popover` keeps hidden content mounted (`Popover.tsx:70`). Expose `chooseFile()` from `useScreenshot`.
4. [N] **Ambiguous import verbs:** `load(code)`, `importCode(code)`, `importFile(text, mode)` (which actually applies a workspace file) and `importFiles(files)`. Suggested names: `openCode`, `addCode`, `applyWorkspaceFile`, `importFiles`.
5. [N] **`LoadResult` (`session.ts:62`)** is the result of every mutation and of undo. Rename it `EditResult` and share it (T9).
6. [N] **Mismatched "still loading" strings:** `NOT_READY` says "Still loading" (`useWorkspace.ts:51`), while `session.ts:221,288,350` says "The workspace is still loading". Use one constant.
7. [C] **Repeated work and side-effect reads.**
   - `session.ts:330,333→289`: `importFiles` parses each workspace file twice (`checkFile`, then `importFile` checks again). On a multi-MB file that is real cost.
   - `session.ts:326` reads the new id from the side effect `this.view.selectedId!`. Have `importCode` return it.
   - `Workbench.tsx:54-55` `changeAura` is an identical wrapper around `workspace.updateSelected`.
8. [C] **Redundant checks in `push.ts`.** `push.ts:55` re-checks `text.length > MAX_PUSH_BYTES` after `readBodyText` has already enforced the byte limit. `push.ts:86-102` nests a try that wraps the error twice.
9. [C] **`hub.ts` repeats size and eviction logic.** The size `reduce` appears at `:81` and `:108`, and eviction happens in both `set` (`106-110`) and `dropOldest` (`75-85`). Use one `evict(id)`.
10. [C] **`server/workspaces/index.ts` is half barrel, half implementation.** The re-exports at `8-10` exist only for one test file. Either make it a pure barrel, or move `getWorkspaceHub`/`pushToWorkspace` into `push.ts`.
11. [C] **Four legacy migration paths** (judgement call; AGENTS.md documents them):
    - `?s=` parsing (`address.ts:7-8,23,35`), only to show a notice (`session.ts:151-153`)
    - the `?code=` import (`session.ts:181-196`)
    - v1 workspace reading (`workspace.ts:102-122`)
    - the localStorage migration (`storage.ts:142-151`)

    At least `?s=` can go, since AGENTS.md says "`?s=` short links are gone" and dropping it loses no data. Set an end date for the rest.
12. [C] **`/lab` styling.** `lab/page.tsx:15` uses an inline style object while borrowing the root `page.module.css`. Give `/lab` its own small CSS module (see T11).

### 2.4 `src/components`, `src/docs`, `src/server/spells`, `src/app/_addon`, API routes

1. [S] **`OptionsEditor.tsx:48-196` keeps a 150-line edit state machine in the component:** the queue, drafts, slider debounce timers, the multiselect pair merge (`:150-158`) and rollback on reject (`:120-128`). This is the riskiest logic in the editor, and it can't be tested without React. Extract `useOptionEdits(...)` (or a plain controller). The node-type switch (`:271-340`) is fine.
2. [S] **`spell-api.ts` mixes three jobs:** the HTTP client, UI copy (`FLAG_TEXT`, `:43-77`) and HTML-to-text (`tooltipLines`, `:80-106`). The last two are used only by `SpellPicker.tsx`; move them there. Also, `searchSpells` is reached into by other features (`fields.tsx:9`, `OptionDialogs.tsx:11`).
3. [S] **Client fetch helpers behave differently.**
   - `spell-api.ts:6-10` throws only if the body has `error`, so a 500 without one comes back as data.
   - `syncSpells` (`:36-37`) checks `res.ok` after parsing.

   Use one `fetchJson` (T9).
4. [S] **`connection()` is used inconsistently across routes.** It is called in `spells/[id]`, `spells/status` and `icons/[fileDataId]`, but not in their siblings `spells/search`, `icons` and `spells/sync`.
5. [C] **`agent-docs.ts` is 512 lines, about 400 of them one Markdown template literal (`:119-511`),** with nested ternaries (`:238-256`, `:318-341`, `:347-361`).
   - The region list at `:242` is hard-coded, duplicating `DOCUMENTED_REGION_TYPES` (`addon-facts.ts:71`).
   - The field reference at `:192-232` restates generated defaults.
   - `variableMayChange` (`:59`) hard-codes the highlight properties, while `modern.highlightProperties` (`addon-facts.ts:61,237`) is collected and never read.
   - `compactJson` (`:32`) is exported for no one.

   Fix: put the prose in `src/docs/agents.md` with named placeholders for generated sections, or at least one function per section.
6. [N] **`_addon` underscore folder** is unlike its siblings (`workspace/`, `screen/`, `validation/`). It goes away if T8's move is done.
7. [C] **Redundant comments:** `api/icons/route.ts:16-17` restates the zamimg URL scheme that `sources.ts` owns, and `docs/worked-examples.ts:1-5` repeats AGENTS.md.

---

## Part 3: Spec axis

Source: `.scratch/aura-simulator-v1/spec.md` and tickets 01–17. AGENTS.md is treated as the latest decision where it deliberately supersedes the spec.

### Implemented, but looks wrong

- **Restated rules aren't flagged on change.** Spec: "Rules the app must restate are kept in one place and flagged if the addon file they mirror changes." There is no flag, and the rules exist in two places (T1).
- **Docs and push ignore the chosen addon version.** Ticket 16 ticks "[x] Docs reflect the selected addon version", but the docs, push validation and the server core are all pinned to `DEFAULT_ADDON_REF` (T3).
- **Seam A.** Spec: "Everything Lua-related hides behind it." `server/addon/option-tables.ts` runs its own Lua (T2).
- **v1 aura 1a.**
  - Spec: "shows the icon permanently desaturated and glowing as it runs low when under 3 minutes are left".
  - The primary example `buffUnderThreeMinutes` (`render/examples.ts:55-69`, docs title "1a" at `worked-examples.ts:34`, and the group-4 child at `:108`) hides the icon outside a Remaining Time window, with no desaturate and no glow. The conforming version is demoted to "alternative" (`examples.ts:72`).
  - Ticket 16's notes say the opposite.
  - Decide which is right, then align the spec, ticket 16 and `examples.ts`.

### Missing or partial

- **Story 5: "a documented in-page command to load an aura document or state code".** There is no page-global command in `src/`, and nothing about one in the agent docs.
- **Seam B tests.** The spec says to "open the page with a state code and a situation, then assert what the preview shows". The situation, bars and textures e2e tests use `/lab?example=…` instead (`tests/e2e/situation.spec.ts:9`, `bars.spec.ts:35`, `textures-animations.spec.ts:39`). `/lab` renders hand-written documents without the aura core, so most preview assertions skip decode → defaults → render. Combined with T7's `/lab` vs game-screen drift, the tests can pass while the real page is wrong.
- **Story 6 (agent hands over a `.txt`).** The agent docs give no guidance for agents writing the `.txt` themselves.
- **Story 49: "sync … fills icons and tooltips from Wowhead".** Tooltips are fetched lazily, one per lookup (`server/spells/sources.ts:9-10`). That is defensible, but ticket 06 ticks the box as worded.

### Scope creep

- `/dev/glows` (`src/app/dev/glows/`) is used only by `tests/e2e/glows.spec.ts:43` and isn't mentioned in AGENTS.md.
- `/lab` is a second preview app beside the window.
- Unused route aliases (T11).
- **Server snapshot of the page's own edits** (restore picks "newer of browser storage and the server's snapshot"). This edges toward the "server-side workspace storage" the spec rules out ("the server only keeps recent pushes").

### Doc drift

- **Ticket 05:** Status says "done except the push-response merge", but the merge exists (`server/workspaces/index.ts:59`).
- **Ticket 13:** `wontfix`, yet all three boxes are ticked.
- **Ticket 02:** still titled "State code in the address". Its notes name `WorkspacePanel` and `useFileDrop`, which no longer exist.
- **Ticket 04:** its "should replace it" plan was never acted on.
- **Spec line 150** (seam B "open the page with a state code") contradicts AGENTS.md ("Auras never go in the address"). Mark it as superseded.
- **Tabs:** the spec's six-tab list vs the glossary's eight tabs.
- **AGENTS.md** omits `src/workspace/history.ts` (also not exported from `src/workspace/index.ts`) and the `/lua/liblua5.1.wasm` route.
- **`core/aura-core.ts:85`** says the wasm default is "unpkg in the browser", but the page always passes the local route.

---

## Counts

Each numbered item and each T-section counts once, under its primary tag. T9 and T11 bundle many instances.

| Category | Cross-cutting (T) | Area findings | Total |
|---|---|---|---|
| Architecture | 7 (T1–T4, T6–T8) | 5 | 12 |
| Separation of concerns | 3 (T5, T9, T10) | 16 | 19 |
| Naming | 1 (T12) | 10 | 11 |
| Conciseness | 1 (T11) | 13 | 14 |
| **Standards total** | **12** | **44** | **56** |
| Spec | 4 wrong, 4 missing/partial, 4 scope creep, 8 doc drift | | **20** |

Confirmed or likely **bugs** that came out of the review:

1. Spell IDs 501–1000 are cached as permanently unknown on the server path (T6).
2. Text auras are likely misplaced on the game screen compared with `/lab`, because `layout.ts` ignores `autoSize` (T7).
3. The Web Worker leaks on every addon-version switch (T4).
4. Agent-docs origin differs between `/docs/agents` and `/llms.txt` behind a proxy (T9).
5. The three state-code patterns disagree on `!WA:1!` (T9).
6. A validation pointer's `tab` doesn't match the options editor's tab keys (T12).

Worst per axis:

- **Standards:** T1, addon semantics in `src/render` duplicating the core, which also breaks the docs-generated-from-addon rule.
- **Spec:** the server, docs and push are pinned to one addon version despite the ticked ticket 16 box, together with the unflagged restated rules.
