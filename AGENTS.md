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
  (`previewSituation`, `conditions/preview.ts`, is that in words for agents: the push answer's `preview`). `auraRules(game)` gives a game's rules (trigger kinds, `setInCombat`,
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
  `lua/dialogs.ts`); its form is `src/components/options-editor/`. Tabs are the addon's keys (`region` is Display,
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
  there. It takes about a minute per game and version (two in the background), so the server caches it per game and
  version (`server/option-reference.ts`; served at `/<game>/docs/agents/options.json`, and as Markdown from
  `src/games/docs/option-reference.ts`: `options.md` is an index of parts, `options/<part>.md` each part in full: key
  → options, each tab, the Display tab per display type, the Trigger tab per trigger type, the Conditions tab's checks per trigger type and event (`conditions-trigger-<type>`, on an icon, with checks other Trigger options offer) and its properties per display type with one sub element of each kind (`conditions-display-<type>`); the JSON's `conditions`), and `option-reference.test.ts` replays every probe, check and property for each game. Bump
  `OPTION_REFERENCE_FORMAT` when the generator's output changes.
  The tab sweeps (`src/core/options-sweep.test.ts`, `tests/e2e/tab-sweep.spec.ts`) walk every tab of every display
  type generically; keep them green when the editor or the profile changes.
- `src/render/`: hand-written renderers (React components + CSS) per region and sub-region type.
  Pure props in (aura document + evaluated state), nothing fetched inside except game files (textures, fonts) via the
  loader in `src/render/textures` (`GameTexture` draws one as an image; `media.ts` names the addon's media). To add
  a region type, add its facts to `REGION_TYPES` (`region-types.ts`) and its component to `RENDERERS`
  (`regions.tsx`); both are keyed by the addon's `regionType`. The game screen is `screen/GameScreen.tsx` (the
  surface) and `screen/GameScreenAuras.tsx` (every aura of the workspace on it, laid out by `group/layout.ts`);
  positions are `Box`es (`screen/geometry.ts`: CSS left/top/width/height). Colours: `color.ts`.
- `src/server/`: server-only code (SQLite via built-in `node:sqlite`, wago/Wowhead sync, addon source cache).
  Server data is per game under `DATA_DIR` (default `data/`, gitignored): `data/<game>/spells.sqlite` (a
  `SpellSource` names the wago product and Wowhead environment: `FOREVER_SPELLS`, `TBC_SPELLS`) and
  `data/<game>/addon/` (or `ADDON_CACHE_DIR/<game>`). The addon source cache (`server/addon/source-cache.ts`: a repo's
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
  `iconNameUrl`). No server code: client code imports these, never `@/server/*`.
- `src/workspace/`: the workspace model (`tree.ts`: top-level auras as nodes, groups nest their `items`; pure operations keep ids unique and
  `controlledChildren`/`parent` in step), its storage/file format (`workspace.ts`, v3 JSON recording its game; older
  versions and other games' files are refused), import/export files (`files.ts`: aura `.txt` = exactly one state code;
  text with several codes; wago JSON `.json`; workspace `.aura-workspace.json`), undo/redo (`history.ts`), the restore
  decision (`restore.ts`), the push/SSE wire protocol (`protocol.ts`: header, event names, notice/snapshot types, URLs
  per game and workspace, push input: a state code, wago JSON, a wago link or an aura document; used by page and
  server), wago links (`wago-link.ts`: `https://wago.io/<id>` and ids, wago's data API URL) and the page address
  (`address.ts`: `/<game>?w=`).
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
  `AuraSimulator`.
- `src/server/workspaces/`: push API (bodies up to 32 MB) and a hub of recent pushes per game and workspace, in
  memory. Every top-level aura a page changes is pushed there too, so agents read the player's current aura with
  `GET /api/<game>/workspaces/<id>`; it holds the latest few pushes, not workspaces (those live in the browser).
  It also holds the situation an agent set per workspace (`situation.ts`, `PUT/GET /api/<game>/workspaces/<id>/situation`,
  sent to pages as `event: situation`); push answers carry `preview`, what the aura shows in it.
  Every push form becomes a state code first (wago JSON by `fromWagoJson`, a wago link by fetching it), so answers and
  validation are the same for all. Wago links: `server/wago.ts` fetches `https://data.wago.io/api/raw/encoded?id=`
  (`GET /api/<game>/wago/<id>` for the page's Import box); tests and the e2e server answer from recorded import
  strings (`WAGO_FIXTURES=tests/fixtures/wago`, `<id>.txt`).
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
- `src/lib/`: small generic helpers with no project knowledge; any layer may import them and they import nothing
  from `src` (`errors.ts`: `errorMessage`; `fetch-json.ts`: `fetchJson`, the one way page code fetches JSON, and
  `HttpError`; `idb.ts`: one IndexedDB object store, used by the workspace storage and the screenshot store).
- Tests: unit/seam A with Vitest (`npm test`), browser/HTTP seam B with Playwright (`npm run test:e2e`,
  `E2E_PORT` picks the port so parallel worktrees don't clash). Network-dependent tests use recorded
  fixtures in `tests/fixtures/<game>/`. The e2e dev server gets addon versions from recorded GitHub/jsDelivr
  answers (`ADDON_UPSTREAM_FIXTURES=tests/fixtures`, read as `<game>/addon`; addon files are cached in
  `.cache/addon/<game>`, the source cache's layout, shared with the unit tests) and keeps its data in
  `.cache/e2e/<port>` (`DATA_DIR`); `LIVE=1 npm test -- addon-live` checks the real upstream. TBC's WeakAuras2 zip:
  the e2e global setup unpacks it once into `.cache/weakauras2` (the unit tests' folder; downloaded once and checked
  against the recorded sha256) and the dev server reads it there (`ADDON_CACHE_DIR_TBC`); it seeds both games' spell
  databases from their fixtures. The e2e tab sweep runs per game.
- Ticket files: `.scratch/<feature>/issues/`. Tick acceptance boxes and set `Status:` when done.
- Blizzard art (icons, glow textures) is fetched at runtime and never committed.
<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
