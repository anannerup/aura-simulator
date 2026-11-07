The repository has a useful aura boundary and substantial tests. It also has blurred ownership, unenforced dependency rules, and tests that overstate their coverage. Several resulting defects are observable: edits can affect the wrong aura, disposing an addon can stall editing, and resetting a workspace can stop live pushes reaching an open page.

The central problem is that folders describe responsibilities without consistently containing them.

## Target architecture

```text
                         SERVER

[Next HTTP routes]
        |
        v
[Application operations]
 Push aura · Set situation · Build agent docs · Take picture · Refresh spells
        |                                      |
        v                                      v
[Aura / Workspace / Game domain]       [Storage and upstream access]
 Documents · Import decisions          Addon releases · Wago · Wowhead
 Window fields · Situation rules       Recent pushes · SQLite · Disk
        |
        v
[Private addon execution]
 Real addon Lua · Simulated game answers · Worker transport


                         BROWSER

[Next page]
        |
        v
[Window / Game screen / Picture]
        |
        v
[Workspace operations]
 Import · Edit · Select · Undo · Export
        |                         |
        v                         v
[Aura / Workspace domain]   [Browser storage and HTTP connections]
```

These should be modules and functions, not a hierarchy of controller, service and repository classes.

The dependency rules should be:

1. **Routes translate HTTP.** They parse requests, invoke one application operation, and translate its result into a response.
2. **Application operations own sequencing and side effects.** Import checks, validation, committing a push and notifying pages belong together.
3. **The domain owns aura meaning.** Aura documents, groups, situations, import decisions and window-field behavior know nothing about HTTP, IndexedDB, SQLite, React or Next.
4. **Addon execution stays behind one aura-facing boundary.** Lua, WASM, workers and simulated WoW functions are private implementation details.
5. **Storage and upstream modules own access and caching.** They may depend on domain types; they must not import routes, page components or application operations.
6. **The page is a client.** Browser features depend on domain operations and browser adapters, never server implementation.
7. **Drawing receives its game-specific dependencies.** A renderer must not choose Forever or construct HTTP endpoints.
8. **Composition is explicit.** The server composition module and browser composition component may assemble these pieces. Ordinary feature modules must not become composition roots.
9. **Game definitions remain pure.** Server assembly, release downloads and documentation loading do not belong in the same dependency layer as game names and rules.

I reviewed `bdad7a2` against `c238b1b`, including the requested instructions and specs. Standards and Spec were reviewed independently; below, **Standards** identifies rule/design findings and **Spec** identifies behavior or acceptance failures. The full suite was not run. Three defects were reproduced using the original TypeScript in memory, without writing files. Next behavior was checked against the matching installed **16.4.5** documentation. The checkout remains unchanged.

## 1. Layers and dependency direction

### P1 — A failed push can already have changed the workspace

**Spec — `src/server/workspaces/push.ts:192`, `src/server/workspaces/push.ts:194`, `src/app/api/[game]/workspaces/[id]/aura/route.ts:31`.**

`pushToWorkspace` records the code and notifies listeners **before** awaiting validation. If validation throws, the caller receives 503 even though the page may already have adopted the aura. Retrying creates another revision.

The situation operation has the same ordering problem: `src/server/workspaces/situation.ts:35` publishes the situation before generating its answer.

**Fix:** make the application operation explicitly prepare, check, evaluate, then commit. If accepting an aura despite unavailable validation is intended, return an accepted result that says validation was unavailable. Do not return an ordinary failure after committing it.

`pushToWorkspace` is already the beginning of the right application operation. Move HTTP body reading/parsing out of its module rather than adding another forwarding layer around it.

### P1 — Stream revision identity is incorrectly owned by retained storage

**Spec — `src/server/workspaces/hub.ts:119`, `src/server/workspaces/hub.ts:145`, `src/client/workspace/server-link.ts:90`.**

A revision is calculated from the last retained entry. Deleting or evicting that entry resets subsequent revisions. An existing page continues rejecting notices whose revision is below its previous maximum.

Reproduction:

```text
Page has received revision 2
DELETE workspace
Push another aura → server revision 1
Page ignores it
```

The original hub and connection reproduced this: the server held the new code, and the page received no push.

**Fix:** give the stream an explicit identity/epoch and compare revisions within that identity. Reset the page’s revision state when the stream changes. Retention, deletion and server restart must not silently masquerade as older events. Cover all three cases through HTTP and an already open page.

### P2 — Release selection is lost between the browser and server

**Spec — `src/client/workspace/server-link.ts:123`, `src/workspace/protocol.ts:106`, `src/client/workspace/session.ts:146`.**

The browser loads a chosen addon release, but its outgoing push URL supplies only `validate=false`. The server consequently chooses its own default release for the import check.

A page following an older release is therefore publishing through a different addon than the one used for its edits and exports. Non-2xx push responses are also ignored: `ServerLink.push` catches network errors but never checks `res.ok`.

**Fix:** carry the resolved addon release with the workspace connection and include it in outgoing pushes. Inspect the response and expose unsuccessful publication separately from local saving. “Saved in this browser” and “published for the agent” are different outcomes.

### P2 — The game layer also assembles server infrastructure

**Standards — the following imports form a folder-level dependency cycle:**

| Location | Dependency problem | Concrete fix |
|---|---|---|
| `src/games/server.ts:2` | Game selection depends on `ServerGame`; `routeGame` also manufactures HTTP responses. | Put server assembly and HTTP game lookup at the server/HTTP boundary. |
| `src/server/game.ts:6` | Server assembly depends back on `games/game`. | Keep the pure game definition; move server assembly out of `games`. |
| `src/games/forever/server.ts:3` and `src/games/tbc/server.ts:3` | Game modules construct caches, connections, fixture fetches and documentation loaders. | Assemble these in server composition, separately for each game. |
| `src/games/forever/sources.ts:11` and `src/games/tbc/sources.ts:9` | Pure game-source descriptions obtain their type from server spell implementation. | Own the game’s upstream description outside the SQLite implementation. |
| `src/games/forever/docs/load.ts:2` and `src/games/tbc/docs/load.ts:2` | Documentation modules retrieve server addon instances and start background generation. | Separate loading/generation from pure documentation writing. |

This is an architectural cycle, including type dependencies—not evidence that all these modules form a failing JavaScript initialization cycle.

`src/server/game.ts:13` compounds it: `ServerGame` combines addon files, spells, game files, items, icon search and a documentation operation. `createClientCaches` and environment/fixture directory decisions live beside that contract.

**Fix:** have composition construct the concrete dependencies each application operation needs. An operation that builds docs should not receive an object exposing unrelated item and icon stores.

### P2 — Rendering reaches into game composition and transport

**Standards — `src/render/textures/loader.ts:2`, `:86`, `:184`.**

The texture module:

- Imports the concrete Forever game.
- Defaults to Forever’s addon files.
- Constructs `/api/<game>/files`.
- Performs HTTP fetching, persistent caching, decoding and image transformation.
- Supplies React context.

That is several boundaries in one module. A missing provider silently selects another game’s resources.

There are further misplaced dependencies:

| Location | Problem | Fix |
|---|---|---|
| `src/render/textures/files.ts:6` | Rendering imports the HTTP file contract. | Put the browser file lookup beside the HTTP connection; inject path lookup into drawing. |
| `src/render/textures/icons.ts:11` | Icon drawing also owns transport-facing lookup behavior. | Separate icon selection/drawing from fetching icon names. |
| `src/render/textures/paths.ts:1` | The game-path normalization rule is owned by `api/files`. | Put the pure game-file rule with game files. |
| `src/server/icon-index/icon-index.ts:14` | Server icon search imports decoding from the rendering layer. | Move BLP/TGA decoding to a shared game-texture module with no React or HTTP. |
| `src/server/icon-index/icon-index.ts:15` | Server downloading imports an upstream URL from rendering. | Own wago download addresses in upstream access. |

**Fix:** separate game-texture identity and decoding, browser resource access, and drawing. Require the selected game’s resource access at composition; remove the implicit Forever fallback from ordinary game rendering.

### P2 — There is a genuine runtime cycle within drawing

**Standards — `src/render/subregions/SubTextures.tsx:9`, `:11`; `src/render/ModelRegion.tsx:6`; `src/render/StopMotionRegion.tsx:17`; `src/render/subregions/SubRegions.tsx:10`.**

```text
SubTextures
    → ModelRegion / StopMotionRegion
    → SubRegions
    → SubTextures
```

Sub-regions import reusable drawing pieces from complete parent-region components. Those parent components import the sub-region drawer.

**Fix:** move the model placeholder and stop-motion frame drawing into their own lower-level modules. Both full regions and sub-regions can depend on them.

There is no demonstrated initialization failure here. The defect is inverted ownership.

### P2 — Fetching, persistence and product decisions share the same modules

**Standards — `src/server/spells/spell-cache.ts:91`, `src/server/game-files/game-files.ts:74`, `src/server/items/item-cache.ts:93`, `src/server/icon-index/icon-index.ts:68`.**

Examples:

- The spell cache downloads upstream tables, interprets them, stores them, ranks names, fetches tooltips and creates response-shaped results.
- Icon search decides whether to start a background build, downloads textures, decodes them, persists features and ranks matches.
- `src/server/addon/source-cache.ts:98` combines release acceptance policy with cache access and upstream fallback.

The problem is not that caching downloads requires both disk and network access. It is that the same public object also decides application behavior.

**Fix:** separate the concrete responsibilities where they change independently:

- Download and interpret a game build.
- Persist/query its catalog.
- Refresh or search that catalog.
- Resolve an addon release under the product’s release rules.

Keep immutable release-file caching together. Do not turn these separations into a generic cache framework.

### P2 — `app` contains substantial features despite its documented boundary

**Standards — `AGENTS.md` says routes/pages are thin; page logic goes elsewhere.**

Feature implementations currently include:

- `src/app/NewAuraChooser.tsx:1`
- `src/app/SituationControls.tsx:1`
- `src/app/import-export/ImportExport.tsx:1`
- `src/app/screen/ScreenSettingsPanel.tsx:1`
- `src/app/screen/screenshot-store.ts:1`
- `src/app/addon/useAddonCore.ts:1`
- `src/app/validation/useConditionProblems.ts:1`
- `src/app/render/AuraRender.tsx:1`

`AuraSimulator.tsx` is legitimate composition, but these are reusable behavior and persistence modules.

**Fix:** move them into their owning features—window, addon releases, game screen and pictures. Leave route files and page composition in `app`. Avoid maintaining two parallel feature locations, `app/*` and `components/*`.

### P2 — Dependency rules are not enforced

**Standards — `eslint.config.mjs:5`, `tsconfig.json:22`.**

ESLint configures Next/TypeScript rules and ignores. The unrestricted `@/*` alias permits every module to import every other module. There are no project import restrictions or server-only fences.

**Fix:**

- Add ESLint boundary rules for the dependency directions above.
- Check resolved imports, including relative paths—not only `@/server/*` spelling.
- Mark Node-only entry modules with `server-only`.
- Restrict aura consumers to its deliberate public surface.
- Check runtime cycles separately from type-only cycles.
- Make lint, typecheck and the full suite required integration checks.

Initially baseline the existing violations, then remove that baseline feature by feature. New violations should fail immediately.

## 2. Naming in business language

### P2 — “Items” means both game items and auras

**Standards — `src/workspace/workspace.ts:21`, `src/workspace/tree.ts:19`, `src/client/workspace/session.ts:51`.**

These public models call auras `items`, directly violating the instruction reserving “item” for a game item. The ambiguity reaches the workspace file format at `src/workspace/workspace.ts:9`.

**Fix:** use `workspace.auras` and a group’s `children`. Rename related operations consistently. Treat the serialized property change as a deliberate file-format decision.

### P2/P3 — The public vocabulary describes implementation rather than the product

The following inventory covers the identified project-owned naming families. Framework names and addon-owned raw keys should retain their required spellings.

Some existing names are explicitly endorsed by the current glossary. The user’s newer instruction supersedes those entries; update the glossary with the selected replacements before implementing them.

| Existing name and location | Problem | Proposed business-language name |
|---|---|---|
| `src/core/`, `AuraCore` — `aura-core.ts:26` | “Core” identifies importance, not capability. | `src/auras/`, `AuraAddon` |
| `AuraState`, `DecodedState` — `aura-core.ts:17`, `:19` | Obscures the top-level aura, descendants and import metadata. | `TopLevelAura`, `ImportedAura` |
| `addon-vm/`, `AddonVM` — `addon-vm/vm.ts:53` | Execution machinery leaks into the aura-facing vocabulary. | `auras/addon/`, `LoadedAddon`; keep VM terminology private |
| `AddonVMGame` — `addon-vm/games.ts:13` | Mixes game answers and addon requirements under machinery. | `SimulatedGame` |
| `profile.ts`, `profile-tbc.ts` | Does not identify what is profiled. | `forever-game-answers.ts`, `tbc-game-answers.ts` |
| `lua-glue.ts`, `AURA_CORE` — `lua-glue.ts:63` | “Glue” conceals serialization responsibilities. | `state-code-lua.ts`, `AURA_SERIALIZATION_LUA` |
| `Registries`, `registries()` — `addon-vm/vm.ts:37` | Callers must discover which facts it contains. | Typed addon facts: display types, trigger types and media |
| `src/client/` | Groups unrelated features by execution environment. | Workspace behavior under `workspaces/browser/`; picture behavior under `pictures/`; release selection beside addon releases |
| `src/api/` | An ownerless collection of response models and domain rules. | Feature-owned messages and HTTP contracts |
| `src/lib/` | Becomes a destination for abstractions without an owner. | Feature ownership; retain genuinely shared technical primitives |
| `VersionList` — `src/api/addon.ts:22` | Generic collection name. | `AddonReleases` |
| `Resolution` — `src/api/addon.ts:31` | Ambiguous in an app that also has screen resolution. | `ResolvedAddonRelease` |
| `FileListing` — `src/api/addon.ts:44` | Describes collection mechanics. | `AddonFiles` |
| `OptionTable`, `OptionTables` — `src/api/addon.ts:53`, `:60` | These are display defaults and condition properties, not window contents. | `DisplayDefaultsAndProperties`, `DisplayTypes` |
| `TypeChange` — `src/api/addon.ts:65` | Which type? What changes? | `DisplayTypeChanges` |
| `options-editor/`, `OptionsEditor` | Uses the prohibited generic “option.” | `aura-tabs/`, `AuraTabs` |
| `OptionsRequest` — `addon-vm/options.ts:15` | Transport/mechanics name. | `SelectedAuraTab` |
| `OptionAddress` — `addon-vm/options.ts:21` | An address to what? | `WindowFieldAddress` |
| `OptionNode`, `OptionsTree` — `addon-vm/options.ts:28`, `:87` | Exposes the tree implementation. | `WindowField`, `AuraTabContents` |
| `OptionEdit`, `OptionDialog` — `addon-vm/options.ts:106`, `:128` | Generic editing vocabulary. | `WindowFieldEdit`, `AuraDialog` |
| `OptionEdits`, `Draft` — `components/options-editor/option-edits.ts:49`, `:9` | Public names omit what is being edited. | `WindowFieldEdits`, `WindowFieldDraft` |
| `OptionTarget`, `OptionPointer` — `addon-vm/validation.ts:6`, `:13` | Mechanical pointer names. | `WindowFieldLocation`, `AuraProblemLocation` |
| `option-reference`, `OptionReference` — `addon-vm/option-reference.ts:235` | Fails to say that it maps window fields to aura-table paths. | `window-field-reference`, `WindowFieldReference`; title: **Window fields ↔ aura table** |
| `OptionReferenceEntry` — `option-reference.ts:105` | Generic reference entry. | `WindowFieldReferenceEntry` |
| `OptionScope`, `OptionMode`, `OptionSetting` — `option-reference.ts:64`, `:76`, `:91` | Conceals availability, label changes and prerequisites. | `FieldAvailability`, `FieldLabelVariation`, `RequiredFieldValue` |
| `ReferenceSource` — `option-reference.ts:262` | Abstract provider vocabulary with one implementation. | A private narrow view of `LoadedAddon` |
| `WorkspaceNode`, `tree.ts` | The public aura-list vocabulary follows a data structure. | `WorkspaceAura`, `aura-list.ts` |
| `findNode`, `moveNode`, `renameNode`, `duplicateNode`, `updateNode` — `workspace/tree.ts` | Operations describe nodes rather than auras. | `findAura`, `moveAura`, `renameAura`, `duplicateAura`, `updateAura` |
| `Located`, `Target`, `TreeError` — `workspace/tree.ts:86`, `:173`, `:170` | Meaning requires reading their fields. | `LocatedAura`, `AuraPlacement`, `AuraPlacementError` |
| `SessionDeps`, `LinkEnv`, `ServerLink` — `session.ts:110`, `server-link.ts:18`, `:36` | Exposes wiring rather than workspace behavior. | Private construction arguments; public `WorkspaceConnection` |
| `RenderScene`, `RenderOptions`, `render-address.ts` — `src/api/render.ts:9`, `workspace/render-address.ts:8` | Names the mechanism rather than the exported artifact. | `AuraPicture`, `PictureSettings`, `picture-address.ts` |
| `captureRenderPage`, `ScreenshotUnavailable` — `server/screenshot.ts:80`, `:11` | Confuses a generated picture with the player’s screenshot. | `captureAuraPicture`, `PictureUnavailable` |
| `RegionTypeInfo`, `regionInfo` — `render/region-types.ts:9`, `:83` | Generic “info.” | `DisplayType`, `displayType` |
| `BarInfo`, `SubRegionHost` — `render/subregions/host.ts:20`, `:32` | Conceals progress and anchor geometry. | `BarProgress`, `SubRegionAnchors` |
| `IconIndex`, `features.ts` — `server/icon-index/` | Exposes indexing implementation. | `IconAppearanceSearch`, `icon-appearance.ts` |

### P2 — The routes give the same concepts several names

**Standards — `src/app/[game]/docs/agents.md/route.ts:2`, `src/app/[game]/llms.txt/route.ts:5`, `src/app/[game]/docs/agents/page.tsx:31`.**

The three documentation addresses currently have one implementation, so this is not three independent documentation systems. It is still fragmented product vocabulary.

Use one canonical HTML document and one Markdown representation:

```text
/<game>/docs/agents
/<game>/docs/agents.md
```

If `llms.txt` is retained for discovery, make that role explicit and point to the canonical document.

Other route names should follow the same language:

| Current route | Proposed route |
|---|---|
| `docs/agents/options.json`, `options.md`, `options/<part>` | `docs/agents/fields.json`, `fields.md`, `fields/<part>` |
| `/<game>/render` | `/<game>/picture` |
| `.../screenshot.png` | `.../picture.png` |
| `addon/resolve`, `addon/diff` | Release lookup and release `changes` |
| `/files` | `/game-files` |

There is also a behavior defect: `docs/agents/page.tsx:38` constructs Markdown links without the requested `ref`. Following them from version-specific HTML docs opens default-version Markdown. Preserve the release query in every representation link.

## 3. Idiomatic TypeScript, React and Next.js

### P1 — A debounced field edit can change another aura

**Spec — `src/components/options-editor/option-edits.ts:75`, `:96`, `:128`.**

The timer retains the field and value, but reads the target document only when it eventually executes. Selecting another aura changes that target.

Reproduced with the original implementation:

```text
A has width 40
Start continuous edit to width 70
Select B, whose width is 100
Timer fires
B becomes width 70
```

In-flight results also lack protection against a newer document arriving through push or undo.

**Fix:** bind each edit to its originating aura, top-level aura and document generation. Cancel or finish pending edits before changing that source. Accept completion only against the generation it edited. `WorkspaceSession.updateTopLevel` at `session.ts:282` should receive the source identity rather than infer the destination from current selection.

### P1 — Worker disposal can permanently block the editing queue

**Spec — `src/core/addon-vm/host.ts:110`, `src/components/options-editor/option-edits.ts:129`, `src/app/addon/useAddonCore.ts:73`.**

Disposal terminates the worker but never rejects its pending requests. The error callback at `host.ts:86` does reject them.

Switching addon versions during an edit can leave `setOption` unresolved forever. Later edits wait behind it.

An in-memory reproduction with the original host confirmed:

```text
terminated: true
request outcome: still pending after dispose
```

**Fix:** disposal must reject and clear all pending requests, then terminate the worker. Reset or invalidate the corresponding edit generation when the addon changes. Make disposal an explicit terminal state for every outstanding call.

### P2 — JSON Apply bypasses the addon's import decision

**Spec — `src/client/workspace/session.ts:303`.**

`applyWagoJson` replaces and commits the decoded document without awaiting `assertImportable`, unlike the other import paths. Its own comment promises that check.

A newer `internalVersion` rejected by Import can therefore enter through the JSON drawer.

**Fix:** make Apply asynchronous and run the same addon import decision before committing. Carry that asynchronous outcome through the JSON editor, preserving the existing document on refusal.

### P2 — Wago JSON import changes the JSON before the user edits it

**Spec — `src/client/workspace/session.ts:489`, `src/server/workspaces/push.ts:128`, `src/core/aura-core.ts:229`.**

JSON import re-encodes the packet, and encoding replaces sender/transmission metadata with the loaded addon’s values.

The test actually blesses this mismatch: `tests/e2e/wago.spec.ts:19` changes the golden fixture’s sender from `5.21.9` to `5.22.0`. Importing the equivalent wago link preserves the original packet.

That contradicts the TBC spec’s requirement that an imported aura’s JSON remain byte-identical to wago’s.

**Fix:** retain imported packet metadata for unchanged auras. Define when a real edit produces newly authored metadata. Test the unmodified golden through JSON file import, HTTP push, link import and export.

### P2 — Deleting the final aura is missing from undo history

**Spec — `src/client/workspace/useUndo.ts:46`.**

The `items.length` guard excludes the empty workspace from history. With only the initial aura, deleting it leaves Undo disabled. With earlier history, Undo can jump over the state immediately preceding deletion.

**Fix:** distinguish uninitialized state from a ready, empty workspace. Record empty workspace changes after initialization. Prefer recording changes where workspace operations commit them, rather than inferring all history transitions during rendering.

### P2 — TypeScript loses useful guarantees at the addon boundary

**Standards — `src/core/addon-vm/options.ts:28`, `src/core/addon-vm/vm.ts:37`.**

`OptionNode` has `type: string`, dozens of optional properties and `value?: unknown`. Its consumers repeatedly cast values based on control type. `Registries` is essentially `Record<string, unknown>`; documentation, diff and media code each interpret its structure.

**Fix:** validate the raw addon result once, then expose:

- A discriminated union of supported window fields, including an explicit unsupported field.
- Typed display, trigger and media facts.
- Success/failure variants for tab contents instead of independently optional `tree` and `error`.

Keep unknown values at the Lua boundary. Do not force the actual aura document into an invented schema; its open Lua-table model is intentional.

### P2 — Extractor dependencies are missing from the addon contract

**Standards — `src/core/addon-vm/lua/extract-forever.ts:162`, `:163`, `src/core/addon-vm/contract.ts:84`.**

The extractor reads `WeakAuras.L` and `TriggerSecretWarnings.casterText`, but neither dependency is declared in the contract. The latter becomes user-facing warning text at `validation.ts:280`.

An upstream change can therefore degrade a warning without producing the promised contract error.

**Fix:** declare these required dependencies, or explicitly identify and handle them as optional. Add a boundary-level regression for the resulting diagnostic.

### Next.js assessment

The current asynchronous route parameters, `connection()`, `ensureStatic = "navigation"` and `instant = false` are supported by the installed 16.4.5 guides. They should not be “corrected” using older Next conventions.

The substantive React problems are ownership and lifetime: edits outlive their source, worker requests outlive disposal, and empty workspace changes disappear from history.

## 4. Indirections and call hops

Counts below are **edges in the stated representative path**, excluding framework/native internals. They are not totals of every helper called during a request. Asynchronous boundaries and component composition are distinguished from synchronous calls.

| Flow | Representative path and count |
|---|---|
| **HTTP push: addon import decision** | `POST` → `pushToWorkspace` → generated aura-facing method → proxy method → inline dispatch callback → addon implementation’s `importCheck` → JSON bridge → `runLua`: **7 TypeScript/JavaScript hops**, then the Lua import wrapper and addon import call. See route `:14`, push `:179`, aura-core `:192`, host `:41`, `:50`, vm `:302`, `:121`. |
| **Window field: checkbox to queue** | `fields.tsx:47` → `OptionsEditor.tsx:222` → `OptionsEditor.tsx:85` → `OptionEdits.edit:86` → `commit:123`: **4 synchronous hops**, followed by queue scheduling at `:126`. |
| **Completed field edit to workspace publication** | Edit callback → `AuraSimulator.tsx:73` → `session.updateTopLevel:282` → `attempt:447` → edit callback → `commit:525` → `show:519`: **6 synchronous hops**, then subscribers. |
| **Game-screen evaluation, Forever leaf** | Memo callback → `evaluateScreen` → `layoutScreen` → `place` → `placeLeaf` → visibility callback → `evaluateAura`: **6 synchronous hops**. See `GameScreenAuras.tsx:109`, `:52`, `group/layout.ts:118`, `:140`, `:132`, `GameScreenAuras.tsx:65`, `conditions/forever.ts:140`. TBC adds one forwarding wrapper: **7**. |
| **Warm agent-doc text generation** | Markdown GET → `ServerGame.agentDocs` callback → `loadAgentDocs` → `agentDocsMarkdown` → section function: **4 hops**. See `llms.txt/route.ts:10`, `forever/server.ts:39`, `docs/load.ts:26`, `agent-docs.ts:163`, `:190`. Cold generation additionally retrieves addon facts and the field reference. |

The ordinary icon also passes through eight application components: screen pane, screen surface, screen auras, animation wrapper, aura frame, icon region, sub-region ordering and icon texture. Those are **component layers**, not one synchronous stack.

### P2 — Documentation generation repeatedly resolves the same release

**Standards — `src/games/forever/docs/load.ts:31`, `:15`, `src/server/addon/core.ts:27`, `src/server/option-reference.ts:34`, `:40`.**

The operation resolves a release, then passes strings into other functions that resolve it again. A cold documentation request can perform four independent resolution steps across facts and reference generation. Caching often avoids extra network access, but ownership remains scattered.

**Fix:** resolve once at the application boundary and pass the resolved release through the operation. Keep the per-game prose writers pure.

### P2/P3 — Remove forwarding structures that add no meaning

| Location | Indirection | Fix |
|---|---|---|
| `src/server/game.ts:26`, `src/games/forever/server.ts:39`, `src/games/tbc/server.ts:44` | Documentation is a callback hanging off the aggregate game object. | Invoke the game’s documentation operation from server composition directly. |
| `src/components/options-editor/OptionsEditor.tsx:48` | `(...args) => core.setOption(...args)` only forwards arguments. | Pass the method directly. |
| `src/core/conditions/index.ts:58` | TBC’s evaluator wrapper only forwards arguments. | Store the evaluator directly. |
| `src/render/regions.tsx:24` | A lookup wraps its component in a new `{ Region }` object for one consumer. | Return the component directly. |
| `src/server/spells/index.ts:1`, `game-files/index.ts:1`, `items/index.ts:1` | Single-file forwarding barrels obscure the actual owner. | Import the owning module directly. |
| `src/workspace/index.ts:5` | One barrel exposes model, file format, history, HTTP protocol and picture addresses together. | Separate public surfaces by responsibility. |

Re-exports add **zero runtime call hops**. Their cost is discoverability and accidental dependency breadth.

### Keep the indirections that perform real work

`OptionEdits` owns drafts, serialization and rollback. `fullFor` preloads spells. The worker boundary moves execution off the page. `runLua` restores the Lua stack. The animation wrapper owns start/main/finish lifetime.

Likewise, most drawing layers have distinct responsibilities. Flattening them would move complexity into larger components.

The broad `src/core/index.ts:1` boundary is useful, but currently exports implementation tools such as `changedPaths`, `pathPattern` and VM report types. Narrow it to capabilities consumers actually need.

## 5. Earned abstractions: one, two, many

The counts below exclude tests and barrel re-exports. These are abstraction-policy findings, not claims that each declaration causes a bug.

### P2 — There is unused Lua implementation to delete

**Standards — `src/core/addon-vm/lua/bridge.ts:215`, `:93`.**

`B.evalOptions` has no callers in source or tests. The live evaluator is `evalNode` in `lua/options.ts`. `B.result` also has no callers.

**Fix:** delete the obsolete evaluator and its exclusive helpers. Do not extract common traversal from a live implementation and a dead one.

### P3 — These abstractions have fewer than three actual users

| Abstraction | Actual use | Concrete action under the requested rule |
|---|---|---|
| `History<T>` — `workspace/history.ts:12` | One production type, `Step` in `useUndo.ts:44`. | Make workspace history concrete. |
| `newerWorkspace<T>` — `workspace/workspace.ts:126` | One caller, `restore.ts:30`, using `Workspace`. | Remove the generic or inline the comparison into restoration. |
| `PendingWork` — `lib/pending.ts:5` | One feature; instantiated at `app/render/AuraRender.tsx:41`. | Put it inside picture readiness and expose that operation. |
| `tracked<A,R>` — `client/render/settled.ts:20` | One call, `AuraRender.tsx:46`. | Inline concrete icon-load tracking. |
| `queued<T>` — `server/option-reference.ts:19` | One reference-generation operation. | Make the queue specific to reference generation. |
| `joinContracts` — `addon-vm/contract.ts:98` | One call, `addon-vm/games.ts:36`. | Compose the actual requirements there. |
| `ReferenceSource` — `addon-vm/option-reference.ts:262` | One implementation, the loaded addon. | Keep a private narrow type; remove the suggestion of a provider family. |
| `idbStore` — `lib/idb.ts:18` | Two consumers: workspace storage and screenshot storage. | Under the explicit numerical rule, keep persistence setup local until a third need. |
| `jsDelivrUrl` — `lib/jsdelivr.ts:2` | Two consumers. | Inline the small URL construction. |
| `nameQuery` — `server/name-search.ts:27` | Two search features: game files and items. | Keep their SQL construction local. |
| `createClientCaches` — `server/game.ts:39` | Two games. | Write their composition explicitly rather than defining a cache family. |
| `UpcomingGame` / `UPCOMING_GAMES` — `games/game.ts:35`, `games/index.ts:11` | Zero actual upcoming games. | Remove the unused future-game model and picker branch. |

The clock contexts also fall below the requested threshold:

- `FixedTimeContext`, `src/render/clock.ts:17`: one consuming component, `Glow`.
- `RegionClockContext`, `src/render/clock.ts:9`: two consuming modules, stop-motion regions and sub-textures.
- `PixelGridContext`, `src/render/pixel-grid.tsx:26`: two consuming modules, aura frames and borders.

These have real scope semantics, so they are a tradeoff rather than evidence of imaginary requirements. Under the strict rule, pass time/grid values to the relevant drawing pieces after extracting the shared primitives. Do not replace them with repeated global lookups.

### P2 — Three catalog implementations repeat a real persistence policy

**Standards — `src/server/spells/spell-cache.ts:101`, `src/server/game-files/game-files.ts:83`, `src/server/items/item-cache.ts:102`.**

All three implement:

- Stored product identity and refusal of another product.
- Build and synchronization metadata.
- Transactional replacement.
- A successful-build timestamp.
- In-flight synchronization.

**Fix:** extract that narrow cached-build policy. Keep different CSV interpretation, schemas and searches separate. A configurable “catalog engine” would exceed what the repetition earns.

Name normalization is another earned consolidation: spells duplicate the same normalization used by game files and items. Move that precise rule to their common owner.

### Preserve abstractions with demonstrated or explicit justification

- `parseIdList`: three route modules.
- `writeAtomic`: three addon-cache modules.
- Pagination semantics: game files, items and icon similarity.
- `fetchJson` and `errorMessage`: many production consumers.
- Region drawing: many actual display types.
- Shared Lua execution, aura documents, workspace storage/push, window frame, wago JSON and compatible renderers: explicitly required by the spec.

The two games are not, by themselves, grounds to duplicate these explicitly shared concepts. Conversely, two similar documentation loaders do not yet justify a generic documentation framework.

## 6. Test strategy and test suite

There is a test strategy: an aura boundary with Vitest and the running product with Playwright. The implementation weakens it through fail-open fixture setup, incomplete assertions and additional implementation-shaped seams.

### P2 — Required TBC coverage can disappear while the run stays green

**Spec — `tests/support/weakauras2.ts:32`, `:38`, `tests/unit/tbc-v1-auras.test.ts:42`, `:77`.**

The TBC spec requires a recorded release fixture with no network access during tests. Instead, the helper downloads the release asset and catches every failure—including checksum or extraction failures—as “unavailable.”

Suites then skip. Some acceptance tests simply return, reporting successful tests with no assertions.

**Fix:** provision the verified release fixture explicitly before the test run. Required suites must fail when it is missing or corrupt. Put live upstream checks behind an explicit command. Offline operation should use fixtures, not remove a game from coverage.

### P2 — “Every field works” is stronger than what the sweeps assert

**Spec — `src/core/options-sweep.test.ts:67`, `:113`; `tests/e2e/tab-sweep.spec.ts:177`.**

The aura sweep:

- Counts an edit before checking whether it changed anything.
- Skips unchanged results.
- Does not compare input-field values in `shownAgain`.
- Accepts disappearance of the field without checking its resulting document.

The browser sweep counts interactions and checks for alerts, without proving the intended edit reached the exported aura.

**Fix:** count successful outcomes. Choose a deliberate changed value, assert the document/exported result, then check the rebuilt field. Account explicitly for normalization, action-like fields and controls whose edits intentionally remove them.

### P2 — The reference replay silently excludes parts of its advertised coverage

**Spec — `src/core/option-reference.test.ts:190`, `:344`, `:375`, `:382`, `:596`.**

Unreconstructable scopes, missing probes and entries already marked as errors can be skipped. The final replay assertion only requires `replayed > 0`.

That proves some generated entries replay, not that every assigned entry does.

**Fix:** every shard must report:

```text
assigned = replayed + explicitly justified exemptions
unexplained omissions = 0
```

Include error entries in the accounting. A generated list of entries is not evidence that those entries were successfully tested.

### P2 — Local full runs can test an older server

**Standards — `playwright.config.ts:24`, `:26`.**

The configuration defines a production build/start command, then permits reusing an existing server outside CI. A local full run can bypass both the build and fixture environment and exercise an older tree.

**Fix:** disable reuse by default. Make testing an external server explicit, and verify its build and fixture identity. Tests requiring a fresh server should get one.

### P2 — Screenshot tests are not fully isolated from the network

**Spec — `tests/e2e/render.spec.ts:68`, `:133`, `tests/e2e/texts.spec.ts:80`, `src/server/screenshot.ts:105`.**

Some visual tests leave art/fonts live. The screenshot endpoint creates its own browser context, which would not inherit a test page’s request interception anyway.

Repeated PNG equality can therefore compare successful live resources with fallback output after a network failure.

**Fix:** supply deterministic media to both the ordinary test page and the server-owned screenshot browser. Fail unexpected outbound requests. Keep fixture generation separate from the test run.

### P2/P3 — Several tests lock down private mechanics

**Standards / Spec — `src/core/options.test.ts:82`, `tests/unit/addon-vm-spells.test.ts:48`, `tests/unit/option-edits.test.ts:31`.**

These test private tab parsing, spell-preloader implementation, draft records, counters and rebuild bookkeeping. The v1 spec explicitly says “No tests of internals.”

They did not prevent the demonstrated wrong-aura edit or disposal hang.

**Fix:** test the consequences at the owning boundary:

- Loaded addon produces the correct tabs.
- Known spells appear in fields and validation.
- Rapid edits affect the originating aura.
- Push/undo during an edit cannot be overwritten.
- Switching addon versions cannot stall subsequent edits.
- Export contains the accepted result.

Retain small pure tests for stable mathematical contracts—serialization rounding, geometry and image comparison. Those are valuable specifications, unlike private bookkeeping snapshots.

### P3 — Fixed waits and unseeded input reduce reproducibility

**Standards — `tests/e2e/tab-sweep.spec.ts:37`, `tests/e2e/glows.spec.ts:74`, `tests/e2e/workspace.spec.ts:283`.**

The suite waits 80 ms around a 50 ms debounce, samples animation after a fixed interval, and creates random large input.

**Fix:** wait for committed observable state, poll an animation change, and seed generated input. These are identified flakiness sources, not claims that these tests failed during this review.

### What should remain

The following coverage has clear value:

- The unmodified wago golden and numeric/key edge cases.
- Real recorded TBC packs with nested auras.
- Multiple real Forever addon versions.
- Browser assertions on dimensions, CSS and pixels.
- Production-mode e2e execution.
- Deterministic exhaustive sharding.
- Generated-reference caching keyed by source inputs, followed by replay on fresh addons.

I found no demonstrated shard-assignment or generated-cache invalidation bug. The weak point is what counts as a successful assertion.

### The strategy the suite should follow

| Boundary | What it should specify |
|---|---|
| **A: Aura behavior** | Given an addon release, aura and situation: import acceptance, defaults, diagnostics, state codes, wago JSON, window fields, accepted edits and preview results. |
| **A: Exhaustive addon compatibility** | Every supported field and reference entry accounted for; recorded real packs; pinned mirrored behavior; explicit expected addon failures. |
| **B: HTTP** | Accepted/refused pushes, release selection, mutation ordering, live notices, reset/restart behavior, docs representations and catalog searches. |
| **B: Browser** | Complete player stories ending in observable/exported results: edit, import, JSON Apply, undo to/from empty, switch versions, receive pushes, save and restore. |
| **B: Drawing** | A bounded set of deterministic visual examples for each meaningful drawing behavior, using fixed time and recorded media. |
| **Optional live checks** | Upstream availability and changes, explicitly separate from required deterministic tests. |
| **Human acceptance** | Import the acceptance auras in both actual games and verify the simulated game answers. |

Keep the speed tiers:

- `npm test`: fast, deterministic behavior tests and representative addon cases.
- `npm run test:e2e`: representative browser/HTTP stories.
- `npm run test:all`: all exhaustive aura cases and production e2e, with required fixtures and no unexplained skips.

The suite should read as player and agent promises. Names containing “every” must include complete outcome accounting.

Both in-game acceptance tickets remain `ready-for-human` with unchecked requirements: `.scratch/aura-simulator-v1/issues/17-v1-in-game-check.md` and `.scratch/tbc-anniversary/issues/09-tbc-in-game-check.md`. Automated success cannot establish that acceptance.

## Sequenced refactor plan

Each step should be independently reviewable and leave the required checks green.

1. **Make test results trustworthy.** Provision verified addon fixtures, remove fail-open returns/skips, disable implicit server reuse, isolate screenshot media, and add exhaustive accounting. Establish the baseline before moving code.

2. **Fix edit ownership.** Bind debounced and in-flight edits to their source aura/document generation. Add behavioral regressions for selection changes, pushes and undo during editing.

3. **Fix addon lifetime.** Reject pending worker requests on disposal and invalidate the old editing generation on release changes. Verify that editing continues after switching versions during an outstanding edit.

4. **Unify import acceptance and preserve imported representation.** Make JSON Apply await the addon decision. Preserve untouched wago packet metadata. Test every import route against the same original golden.

5. **Repair workspace transitions.** Record empty workspaces in undo history. Separate stream identity from retained revisions. Test deletion, eviction and restart against an already open page.

6. **Make server operations coherent.** Move HTTP parsing/response construction to the edge. Resolve releases once, carry the browser’s release on publication, check publication responses, and commit pushes/situations only under a defined success policy.

7. **Separate composition from game definitions.** Move server assembly out of `games`; keep per-game assembly explicit. Separate documentation loading from writing. Introduce dependency checks and remove the corresponding baseline violations.

8. **Separate browser features and resource access.** Move features out of `app`. Separate game-texture decoding, browser fetching/caching and drawing. Remove the implicit Forever dependency and the runtime region/sub-region cycle.

9. **Apply the vocabulary changes by feature.** Start with auras versus items, window fields and their table reference, addon releases, and pictures. Update glossary, public methods, docs and routes together; handle file-format changes explicitly.

10. **Remove unearned machinery and narrow the public aura surface.** Delete dead Lua, remove one-use generics and forwarding envelopes, and extract only the demonstrated three-catalog persistence policy. Replace unknown addon-result bags with typed boundary answers.

11. **Finish acceptance against the real games.** Run lint, typecheck and the deterministic full suite on the integrated tree, then complete the documented in-game checks for both addons.