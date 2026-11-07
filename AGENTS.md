# Aura Simulator

A Next.js web app for building WeakAuras auras per **game** (WoW Forever with Musca Auras; TBC Anniversary with
official WeakAuras2): an agent or the user describes an aura, the app previews it the way the game draws it,
and the user exports the import string and imports it in the game. `/` is the game picker; each game is its own site
(`/<game>`, `/<game>/docs/agents`, `/api/<game>/...`). See `.scratch/aura-simulator-v1/spec.md` and
`.scratch/tbc-anniversary/spec.md`.

## Agent skills

### Issue tracker

Issues and specs are local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root (created when needed). See `docs/agents/domain.md`.

## Naming

Name things after what they are in the domain, in words a WeakAuras player who doesn't code would recognise: aura,
trigger, condition, tab, table, game, game screen, situation, spell, item. Avoid names that only describe the code's
mechanics and say nothing about the business: option, handler, engine, traverser, manager, processor, helper, util,
service, data, info, item (for something that isn't a game item). If a concept has no domain word yet, find one with
the user and put it in `GLOSSARY.md` before using it. The test: someone who doesn't code reads the model and the logic
and says "yes, those words make sense".

## Writing tests

Follow "Writing tests" in the shared agent memory (`~/.config/agents/AGENTS.md`): green means tested, every test
asserts its outcome, names are promises the test keeps, test what a player or agent can observe, golden fixtures are
the truth, deterministic or it's a bug. Here the seams are the aura logic in memory (Vitest) and the app from outside
(HTTP and the browser, Playwright).

## Layout and conventions

Parallel agents work on this repo; keep to these boundaries so work merges cleanly.

- `src/games/`: what differs per game, one folder each (`forever/`, `tbc/`). Share only what is truly the same
  concept (the Lua engine, the aura document, wago JSON, workspace storage and push, the window frame, renderers by
  the hash rule); code that merely looks alike stays per game.
  - `game.ts`: `Game` (page-safe: id, name, addon name, fallback release); `index.ts`: the picker's `GAMES` and
    `UPCOMING_GAMES`, `findGame`. The id is the URL segment, the storage namespace and the aura core's game
    (`loadAddon(ref, { game })`, whose per-game client profile, contract and extractors live in
    `src/core/addon-vm/games.ts`).
  - `server.ts`: `findServerGame`/`routeGame` over each game's `ServerGame` (`src/server/game.ts`: its addon source
    cache, spell cache and agent docs). Routes under `src/app/[game]` and `src/app/api/[game]` take the game from the
    URL, so a new game needs no new routes.
  - `forever/`: `index.ts` (the `Game`), `sources.ts` (Musca's repo, `FOREVER_SPELLS`, `muscaFileUrl`), `server.ts`
    (`foreverServer`), `docs/` (agent docs, addon facts, worked examples, `load.ts`), `examples.ts` (the example
    auras the docs and browser tests push), `v1-auras/` (the in-game check's import strings). Fixtures:
    `tests/fixtures/forever/`.
  - `tbc/`: `index.ts` (the `Game`), `sources.ts` (`TBC_SPELLS`), `server.ts` (`tbcServer`: the WeakAuras2 release
    cache as its addon source), `docs/` (agent docs: plain WeakAuras2, no combat rules, generated lists, worked
    examples in `worked-examples.ts`), `examples.ts` (the docs' and tests' auras, the TBC v1 auras among them; their
    `.txt`/`.json` files are in `.scratch/tbc-anniversary/v1-auras/`, checked by `tests/unit/tbc-v1-auras.test.ts`,
    `WRITE_V1_AURAS=1` rewrites them). Fixtures: `tests/fixtures/tbc/` (`addon/github-releases.json`, `spells/`).
    Real TBC auras from wago.io (raid packs, class packs, custom Lua): `tests/fixtures/wago/tbc/` with `manifest.json`,
    run by `src/core/wago-tbc.test.ts`; findings in `.scratch/tbc-anniversary/stress-test.md`.
  - `docs/shared.ts`: agent-doc sections that are the same concept in every game (wago JSON, push API with driving
    the page, the situation, the spell API, wago links),
    used by each game's docs with its id.
  - Per-game rules (`auraRules(game)`, `TRIGGER_KINDS[game]`) live in the aura core by the same id; the page passes
    `game.id` (e.g. `GameScreenAuras`' `game`, `SituationControls`, `useConditionProblems`). The page-safe `Game`
    also names its addon's media (`addon.fileUrl`, `addon.logo`: Musca's repo on jsDelivr; WeakAuras2's zip through
    `/api/tbc/addon/<ref>/file`, since release downloads send no CORS headers) and its words (`shortName`, `wowhead`
    for the spell picker). The renderers load addon media through the page's `TextureLoaderContext`
    (`render/textures/loader.ts`).

- `src/core/`: the **aura core** (spec seam A). Loads an addon version's Lua in wasmoon-lua5.1,
  encodes/decodes state codes (`state-code.ts` is the one pattern: `!WA:<n>!`, n ≥ 2, as the addon's decoder
  reads them), fills defaults, validates. No React, no DOM. Runs in browser and Node.
  It also holds the situation model (`situation/`, with `readSituation`/`situationJson`: the JSON form agents send)
  and the trigger/condition evaluation per game (`conditions/`): what an aura shows in a situation
  (`previewSituation`, `conditions/preview.ts`, is that in words for agents: the push answer's `preview`). What texts
  draw (placeholders replaced, custom text `%c` marked as not evaluated) is part of that evaluation
  (`conditions/text.ts`, `AuraRenderState.texts`), so the game screen and `preview` can't disagree. No custom Lua runs: what
  of an aura is custom code is listed (`conditions/custom-code.ts`, `customCode`; `preview`'s `notEvaluated`, a "Lua"
  badge on the game screen). Each aura
  evaluates in its own situation (`situationForAura`: the workspace-wide triggers with its `auras` override). `auraRules(game)` gives a game's rules (trigger kinds, `setInCombat`,
  `evaluate`, `combatRestricted`). Forever (`evaluateAura`, `conditions/forever.ts` + `secret-aura-rules.ts`) adds
  Aura (Modern), freezing and held properties to plain WeakAuras; TBC (`evaluateTbcAura`, `conditions/tbc.ts`) is
  plain WeakAuras2, nothing changes in combat. Only what both addons do the same is shared (`conditions/evaluate.ts`,
  `triggers.ts`, `region-defaults.ts`). Validation's `combat` verdict exists only for Forever (`AddonVMGame.combatCheck`);
  on TBC `ValidationResult` has just the addon's errors and warnings.
  Rules and renderers restate addon files; `src/core/mirrored.ts` pins them per game by hash at the game's default
  version (Forever: Musca tag; TBC: WeakAuras2 5.22.1 from the release zip) and lists every module both games share
  with the files it ports (`SHARED_PORTS`): a test fails when a pinned file changes, when a game's version moves, or
  when a ported file's sameness between the addons changes. A module stays shared while the Lua it ports does the
  same in both; each differing file says why (or which part is per game, e.g. `layoutScreen(…, game)`'s group border).
  Whether Aura (Modern) conditions are valid is never restated: the preview takes `conditionProblem(validate(...))`.
  Import it via `@/core` only. The aura document (a Lua table as JSON: arrays for sequences, `"[1]"`-style keys
  for number/boolean keys) is defined in `src/core/lua-value.ts`, with its readers (`getField`, `field`, `list`,
  `num`); core tests cache addon files in `.cache/addon/<game>` (gitignored).
  wago JSON (`wago-json.ts`, `toWagoJson`/`fromWagoJson`) is the third form of an aura: byte-identical to wago.io's
  JSON, with wago's own rules both ways (`.scratch/tbc-anniversary/wago-json.md`); pure and shared by every game.
  `fillDefaults`/`validate`/`registries` run the whole addon in a lazily loaded second VM (`src/core/addon-vm/`,
  a Web Worker in the browser). To add a full-VM call, add the method to `AddonVM` (`vm.ts`) and `AuraCore`
  (`aura-core.ts`); the worker and its host (`host.ts`) forward any `AddonVM` method by name. Both VMs share `lua-stdlib.ts`; answers to the page
  are one JSON (`B.json` in `lua/bridge.ts`, aura documents inside marked with `B.doc`). A core that is replaced
  must be `dispose()`d (its worker holds a whole Lua heap). `loadAddon(ref, { game, fetchSource })` picks the game's
  client: `"forever"` (default: Musca Auras, `<Addon>.toc`) or `"tbc"` (WeakAuras2 from its release zip,
  `<Addon>_TBC.toc`); the core never fetches on its own. Per game the full VM takes a client profile, a contract and its own extractors
  (`addon-vm/games.ts`). Client answers belong in the game's client profile (Forever: `profile.ts`; TBC:
  `profile-tbc.ts`, every answer marked UNVERIFIED until checked in game). Every addon internal the extractors use is
  in the contract (`contract.ts`): `COMMON_CONTRACT` for what every WeakAuras has (`lua/extract.ts`, `lua/options.ts`),
  `FOREVER_CONTRACT` for Musca's own (Aura (Modern), combat warnings, packs: `lua/extract-forever.ts`, `lua/new-aura.ts`).
  The options editor (`options`/`setOption`) builds the in-game options tabs in that VM with WeakAurasOptions' own
  generators and applies edits through each option's own `set()` (`addon-vm/options.ts`, `lua/options.ts`, dialogs in
  `lua/dialogs.ts`); its form is `src/components/options-editor/`. Like the game's window it works on a whole top-level
  aura and selects one aura in it: `options(topLevel, { selected, tab })`, `setOption(topLevel, { selected, tab, path },
  value)`; an edit returns the whole top-level aura (`edit.state`: any of its auras may change, e.g. a group's tabs edit
  its children) and the page takes it back with `updateTopLevel`. The top-level aura stays loaded in the VM until a
  different one comes, so tabs and other auras of it cost no load. Tabs are the addon's keys (`region` is Display,
  `action` is Actions); validation pointers use the same keys, so `options({tab: pointer.tab})` opens the right tab. Buttons that open a game dialog (icon/texture/model picker, code editor,
  confirmation popups) return `edit.dialog`; the page shows its own and answers with the same button. The New Aura
  page (`newAuraPage`/`newAura`/`packs`; `addon-vm/new-aura.ts`, `lua/new-aura.ts`) comes from the addon too; the
  Modern Aura Group and Packs are Musca's own (`lua/new-aura-forever.ts`, `AddonVMGame.newAuraLua`), absent on TBC.
  `importCheck` is the game's import (story 7): the addon's own WeakAuras.Import opens its import dialog on a
  stand-in window (`lua/import.ts`), and the dialog's Import button decides (e.g. a newer internalVersion is refused
  with the dialog's message). Every way into a workspace asks it: push, paste, files, `auraSimulator.load`. Forever client data the profile answers (classes,
  difficulties, item types, talents) is `addon-vm/client-data.json`; TBC's, same shape, is `addon-vm/client-data-tbc.json`. Both are
  generated by `node scripts/client-data.ts <wago product> <output.json>` (`wowf`, `wow_anniversary`).
  The option reference (`optionReference`, `addon-vm/option-reference.ts`) probes every option through its own `set()`
  on a fresh aura and records the table paths (wago JSON keys) it writes, with the reverse index; path form documented
  there. It also records what shows each hidden option (`shownBy`: a section opened or another option's value), the
  names an option takes in other modes (`modes`), and every choice's writes for selects that write more than their key
  (`choices`: Grow → selfPoint). It takes about two minutes per game and version (more in the background), so the server caches it per game and
  version (`server/option-reference.ts`; served at `/<game>/docs/agents/options.json`, and as Markdown from
  `src/games/docs/option-reference.ts`: `options.md` is an index of parts, `options/<part>.md` each part in full: key
  → options, each tab, the Display tab per display type, the Trigger tab per trigger type, the Conditions tab's checks per trigger type and event (`conditions-trigger-<type>`, on an icon, with checks other Trigger options offer) and its properties per display type with one sub element of each kind (`conditions-display-<type>`); the JSON's `conditions`), and `option-reference.test.ts` replays every probe, check and property for each game (on
  the reference from the generated cache, see Tests). Bump `OPTION_REFERENCE_FORMAT` when the generator's output
  changes.
  The tab sweeps (`src/core/options-sweep.test.ts`, `tests/e2e/tab-sweep.spec.ts`) walk every tab of every display
  type generically (the e2e one: a few representative types per run, all of them in `npm run test:all`); keep them
  green when the editor or the profile changes.
- `src/render/`: hand-written renderers (React components + CSS) per region and sub-region type.
  Pure props in (aura document + evaluated state), nothing fetched inside except game files (textures, fonts) via the
  loader in `src/render/textures` (`GameTexture` draws one as an image; `media.ts` names the addon's media,
  `media.test.ts` checks it against each game's LibSharedMedia lists). Any game texture path loads by the FileDataID the
  game's file list gives (the loader's `resolvePath`: `gameFilesFromApi("/api/<game>/files")`); every page gets its
  game's loader from `gameTextureLoader(game, ref)`, so a path draws the same on the game screen and in pictures. A
  texture that can't be drawn shows `MissingTexture` (`MappedTexture.tsx`), never nothing. What the game snaps to the
  pixel grid (border edges) is placed in whole pixels: the surface gives its grid (`PixelGridContext`,
  `pixel-grid.tsx`), each region its frame's, and `PixelSpace`/`pixelBox` draw on it. To add
  a region type, add its facts to `REGION_TYPES` (`region-types.ts`) and its component to `RENDERERS`
  (`regions.tsx`); both are keyed by the addon's `regionType`. The game screen is `screen/GameScreen.tsx` (the
  surface) and `screen/GameScreenAuras.tsx` (every aura of the workspace on it, laid out by `group/layout.ts`);
  positions are `Box`es (`screen/geometry.ts`: CSS left/top/width/height). Colours: `color.ts`.
  `GameScreenAuras`' `still` draws a still picture (every animation at one moment, `FixedTimeContext` in `clock.ts`)
  and `standIns={false}` leaves out the anchor stand-ins; `evaluateScreen` is its evaluation and layout, pure.
- `src/server/`: server-only code (SQLite via built-in `node:sqlite`, wago/Wowhead sync, addon source cache).
  Server data is per game under `DATA_DIR` (default `data/`, gitignored): `data/<game>/spells.sqlite` (a
  `SpellSource` names the wago product and Wowhead environment: `FOREVER_SPELLS`, `TBC_SPELLS`),
  `data/<game>/files.sqlite` (`server/game-files/`: the game's file list, wago's ManifestInterfaceData: path ↔
  FileDataID, icon search), `data/<game>/items.sqlite` (`server/items/`: ItemSparse + Item, searchable by icon), both
  for the same `SpellSource` and downloaded on first use (`createClientCaches`; `ServerGame.files`/`.items`; both
  searches page through `parseSearchPage` in `server/name-search.ts`), `data/<game>/icon-features.sqlite`
  (`server/icon-index/`, `ServerGame.iconIndex`: icons, and with `kind=texture` every other texture file of the game
  and the addon's own media (`addonTextureFiles` in `server/media.ts`), by how they look,
  `POST /api/<game>/icons/similar`, its progress `GET` there; a small colour-and-opacity grid per file from wago.tools
  (or the addon's files), filled on demand, after each file-list download (icons) or in the background with retries
  and an ETA; an icon's zoom is measured by Icon.lua's crop model, `artInset` in `features.ts`; uploads decoded with
  `sharp`; tests serve synthetic TGAs through an injected fetch, `tests/unit/icon-index.test.ts`;
  `server/texture-picture.ts` draws any texture as a PNG, `GET /api/<game>/textures/picture.png`), and
  `data/<game>/addon/` (or `ADDON_CACHE_DIR/<game>`). `server/media.ts` reads the addon's LibSharedMedia lists from
  the server's aura core (`registries().media`; `/api/<game>/media`, the `/<game>/fonts` sample page);
  the font sample picture `/<game>/fonts/sample` (`app/fonts/FontSample.tsx`) and `GET /api/<game>/fonts/sample.png`
  (`captureFontSample`) draw one font as the game screen draws a text;
  `server/media-check.ts` adds `media.texture` infos to push answers for texture paths the game can't draw. The test
  fixtures for all three are the recorded wago rows in `tests/fixtures/<game>/spells/`. The addon source cache (`server/addon/source-cache.ts`: a repo's
  released tags via jsDelivr/GitHub, no branches or commits) is the only place the server reads Forever's addon files;
  the server's aura core (`server/addon/core.ts`, one per game and release) and the game's agent docs use it. Push,
  docs and diff follow `?ref=` (a release; default: the newest).
  WeakAuras2 (TBC) comes from GitHub release zips instead (`server/addon/weakauras2-releases.ts`: tags from 5.21.0
  with a `WeakAuras-<tag>.zip`, checked against GitHub's sha256, unpacked once per version; `unzip.ts`);
  `weakAuras2AddonSource` makes it TBC's `ServerGame.addon` (the same `AddonSourceCache` interface: versions,
  resolve, files, listings, memo). Bundles follow the game's .toc files (`buildAddonBundle(…, game)`). Its tests
  use a recorded release list (`tests/fixtures/tbc/addon`) and download the 5.22.1 zip once into
  `.cache/weakauras2` (`tests/support/weakauras2.ts`), skipping when offline.
- `src/api/`: wire types and limits of the HTTP API shared by server and page (`addon.ts`, `spells.ts`, with
  `iconNameUrl`; `files.ts`, with `gameFileKey`, the game's path rule; `items.ts`; `media.ts`; `render.ts`: the
  `RenderScene` the server hands the render page). No server code: client code imports these, never `@/server/*`.
- `src/workspace/`: the workspace model (`tree.ts`: top-level auras as nodes, groups nest their `items`; pure operations keep ids unique and
  `controlledChildren`/`parent` in step), its storage/file format (`workspace.ts`, v3 JSON recording its game; older
  versions and other games' files are refused), import/export files (`files.ts`: aura `.txt` = exactly one state code;
  text with several codes; wago JSON `.json`; workspace `.aura-workspace.json`), undo/redo (`history.ts`), the restore
  decision (`restore.ts`), the push/SSE wire protocol (`protocol.ts`: header, event names, notice/snapshot types, URLs
  per game and workspace, push input: a state code, wago JSON, a wago link or an aura document; used by page and
  server), wago links (`wago-link.ts`: `https://wago.io/<id>` and ids, wago's data API URL), the page address
  (`address.ts`: `/<game>?w=`) and the render page's and screenshot endpoint's options (`render-address.ts`).
  **Auras never go in the address**: they can be megabytes, so they travel as files, over the push API, or by
  clipboard (every other parameter is dropped). New auras come only from the
  addon's New Aura (`placeNewAura` places them). Pure, shared by page and server.
- `src/client/`: page-side libraries (browser only, no routes). `client/workspace/`: `WorkspaceSession` (one page's
  workspace of a game per aura core) over `StateCodes` (`codes.ts`), `ServerLink` (`server-link.ts`: the push/SSE
  protocol) and the write-behind `WorkspaceStore` (`storage.ts`, IndexedDB via `src/lib/idb.ts`, keyed per game and
  workspace); `useWorkspace`/`useUndo` hooks; `window.auraSimulator` (`page-api.ts`, documented in the agent docs).
  `client/situation.ts`: `PageSituation`, the page's one situation (the Situation panel, an agent's
  `PUT .../situation` followed over the event stream, `auraSimulator.situation`).
  `client/addon-client.ts`: the page's side of `/api/<game>/addon/*` (versions, the bundle fetcher the aura core
  loads through, client spells, diff). The page's game reaches components by context: the spell picker's
  `SpellApiContext` (`components/spell-picker/spell-api.ts`, with the game's words) and the renderers'
  `IconStoreContext` (`render/textures/icons.ts`) and `TextureLoaderContext` (addon media), all provided by
  `AuraSimulator`. `client/render/`: the render page's crop (`crop.ts`: measured from what was drawn) and readiness
  (`settled.ts`: every texture, icon and font in, counted with `src/lib/pending.ts`).
- `src/server/workspaces/`: push API (bodies up to 32 MB) and a hub of recent pushes per game and workspace, in
  memory. Every top-level aura a page changes is pushed there too, so agents read the player's current aura with
  `GET /api/<game>/workspaces/<id>`; it holds the latest few pushes, not workspaces (those live in the browser).
  It also holds the situation an agent set per workspace (`situation.ts`, `PUT/GET /api/<game>/workspaces/<id>/situation`,
  sent to pages as `event: situation`); push answers carry `preview`, what the aura shows in it.
  `DELETE /api/<game>/workspaces/<id>` forgets a workspace's pushes and situation (`WorkspaceHub.delete`).
  Every push form becomes a state code first (wago JSON by `fromWagoJson`, a wago link by fetching it), so answers and
  validation are the same for all. Wago links: `server/wago.ts` fetches `https://data.wago.io/api/raw/encoded?id=`
  (`GET /api/<game>/wago/<id>` for the page's Import box); tests and the e2e server answer from recorded import
  strings (`WAGO_FIXTURES=tests/fixtures/wago`, `<id>.txt`).
  Pictures of an aura (working from a player's screenshot): `/<game>/render?w=&aura=` (`app/[game]/render`,
  `app/render/AuraRender.tsx`) draws one aura of the workspace's recent pushes (`renderScene`, `render.ts`) still,
  cropped to the bounds of what it draws (`client/render/crop.ts`: regions, shown texts, borders, textures; not glows), at `scale` game pixels per UI unit, then marks itself `data-ready`;
  `GET /api/<game>/workspaces/<id>/screenshot.png` takes its picture in a headless Chromium (`server/screenshot.ts`:
  `playwright-core`, a dev dependency; one browser per process, two pictures at a time; 503 saying how to install it
  when missing). It loads the page from the server's own address (`request.nextUrl.origin`).
  `POST /api/<game>/workspaces/<id>/compare` compares the player's screenshot (the body) with the aura's picture
  (`server/compare/`: `compare.ts` is the pure part — background from the edge, scale and offset search, per-region
  boxes, pitch/gaps, colours, per display element (`elements`: texts with rows and outline/shadow, borders, textures;
  their kind and `subRegions` place come from the renderers' `data-subregion`/`data-index`/`data-font-*`), the
  score's noise (`noise.meaningful`), the comparison picture; `image.ts` decodes/resizes/encodes with `sharp`;
  `index.ts` draws the picture through `captureRender`, which also returns where each region and element was drawn).
- Agent docs are per game (`src/games/<game>/docs/`, served at `/<game>/docs/agents`, `/<game>/llms.txt`,
  `/<game>/docs/agents.md` through `ServerGame.agentDocs`). Forever's: update it when an API or format changes;
  `agent-docs.ts` has one function per section. Lists of types, triggers, condition variables and defaults are
  generated from the addon version (`addon-facts.ts`); the worked examples (`worked-examples.ts`) are the documents in
  `src/games/forever/examples.ts` (the browser tests push them to the window) and tests push every example block of
  the served docs (both games, `tests/e2e/agent-docs.spec.ts`). TBC's (`src/games/tbc/docs/`): the same layout, plain
  WeakAuras2 rules (no combat rules), generated lists from WeakAuras2, worked examples (`worked-examples.ts`) that
  validate with no problems; sections the same in every game come from `src/games/docs/shared.ts`. The docs page
  streams the docs in, so its shell links the Markdown (`llms.txt`) for agents without JavaScript.
- `src/app/`: Next.js routes and pages. Thin; delegates to the modules above (page logic goes in `src/client/`).
  `page.tsx` is the game picker; `[game]/page.tsx` a game's site. `AuraSimulator.tsx` is a game site's composition
  root (its title's game name leads back to the picker): it fills `src/components/shell`'s `AppShell` (the window
  and the game screen pane) with the features (`components/aura-list`, `components/options-editor`, `app/addon`
  for the version picker, `app/screen` for the game screen pane). `components/ui` is the generic UI kit (no game code). `/lua/liblua5.1.wasm` serves wasmoon's
  Lua binary from `node_modules`, so the browser's aura core loads no CDN. Links the server writes into answers use
  `requestOrigin` (`src/server/request-origin.ts`: honours `X-Forwarded-*`), not `request.nextUrl.origin`.
  An id that isn't a game is a 404 everywhere under `[game]`, also on a fresh production server: the game page is
  fully prerendered (`ensureStatic = "navigation"`), and a page rendered per request (agent docs, fonts, render) is
  checked in `src/proxy.ts` before its prerendered shell goes out; add a new request-time page under `[game]` to the
  proxy's matcher (`tests/unit/proxy.test.ts` fails until it is).
- The Lua VMs are called only through `runLua` (`src/core/lua-run.ts`), which puts the Lua stack back after each call
  (wasmoon's `doStringSync` leaves results on it, which grew the stack until the VM's heap got corrupted).
- `src/lib/`: small generic helpers with no project knowledge; any layer may import them and they import nothing
  from `src` (`errors.ts`: `errorMessage`; `fetch-json.ts`: `fetchJson`, the one way page code fetches JSON, and
  `HttpError`; `idb.ts`: one IndexedDB object store, used by the workspace storage and the screenshot store).
- The user's server on :3000 runs a production build from the main checkout (`next build` then `next start -p 3000`;
  rebuild after updating main). Never run `next dev` there while agents work: Turbopack watches the whole project
  folder, including agent worktrees under `.claude/worktrees/` (gitignored, still watched; Next has no option to
  exclude them), so every file an agent's own dev server or tests write rebuilds and reloads the user's page in a loop.
  Merge and verify in a separate worktree, then fast-forward main, so the user's checkout never holds a half-merged tree.
- Tests: unit/seam A with Vitest, browser/HTTP seam B with Playwright, in two tiers (`.scratch/test-speed.md` has
  the timings):
  - `npm test`: every Vitest file except the exhaustive suites (the Vitest project `unit`; a few seconds). Run it
    while working, with `npm run typecheck` and `npm run lint`.
  - `npm run test:e2e`: every Playwright spec, with the tab sweep on a few representative display types per game
    (`--grep-invert @exhaustive`; one to two minutes). Run it when a change touches the page, the routes or the server.
  - `npm run test:all`: everything, both seams: the exhaustive Vitest suites (`option-reference`, `options-sweep`,
    `wago-tbc`, each split into shards that run in parallel: `vitest.config.ts`, `tests/support/shards.ts`) and every
    e2e test (the @exhaustive tab sweeps too); about three minutes (two more when the option reference's generator
    changed and it is generated again). Run it before handing work over for merging; the
    coordinator runs it again on the integrated tree. `npx vitest run` alone runs seam A's part;
    `npx vitest run --project 'option-reference*'` one suite's shards.
  A new long suite: add it to `EXHAUSTIVE` in `vitest.config.ts` and split its work with `shardUnits`.
  `E2E_PORT` picks the e2e port so parallel worktrees don't clash. The e2e server is a production build
  (`next build && next start`, type checked like `npm run typecheck`; `E2E_DEV=1` uses `next dev`), and every e2e test
  runs in parallel (`fullyParallel`): a test opens a workspace of its own and doesn't depend on another's state.
  Network-dependent tests use recorded fixtures in `tests/fixtures/<game>/`. The e2e server gets addon versions from
  recorded GitHub/jsDelivr answers (`ADDON_UPSTREAM_FIXTURES=tests/fixtures`, read as `<game>/addon`; addon files are
  cached in `.cache/addon/<game>`, the source cache's layout, shared with the unit tests) and keeps its data in
  `.cache/e2e/<port>` (`DATA_DIR`); its environment is `e2eServerEnv` (`tests/support/e2e-server.ts`).
  `LIVE=1 npm test -- addon-live` checks the real upstream. TBC's WeakAuras2 zip: the e2e global setup unpacks it once
  into `.cache/weakauras2` (the unit tests' folder; downloaded once and checked against the recorded sha256) and both
  the e2e and the unit tests' server read it there (`ADDON_CACHE_DIR_TBC`); it seeds both games' spell databases, file
  lists and items from their fixtures.
  Slow deterministic results are cached on disk by their inputs (`tests/support/generated-cache.ts`, in
  `.cache/generated/`): the option reference per game and addon version, keyed by a hash of every source file the
  generator (`src/core/addon-vm/vm.ts`) imports. A change to that code is a new key, so the next `npm run test:all`
  generates it again and replays it; nothing older code made is reused. The e2e setup gives the e2e server the cached
  reference (when there is none the server generates it during the run, and the teardown caches it). Deleting
  `.cache/generated/` is always safe.
- Ticket files: `.scratch/<feature>/issues/`. Tick acceptance boxes and set `Status:` when done.
- Blizzard art (icons, glow textures) is fetched at runtime and never committed.
<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
