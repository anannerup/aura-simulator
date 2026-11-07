# Aura Simulator

A Next.js web app for building auras for Musca Auras (the WeakAuras fork for WoW Forever):
an agent or the user describes an aura, the app previews it the way the game draws it, and
the user exports the import string and imports it in the game. See
`.scratch/aura-simulator-v1/spec.md`.

## Agent skills

### Issue tracker

Issues and specs are local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root (created when needed). See `docs/agents/domain.md`.

## Layout and conventions

Parallel agents work on this repo; keep to these boundaries so work merges cleanly.

- `src/core/`: the **aura core** (spec seam A). Loads an addon version's Lua in wasmoon-lua5.1,
  encodes/decodes state codes (`state-code.ts` is the one pattern: `!WA:<n>!`, n ≥ 2, as the addon's decoder
  reads them), fills defaults, validates. No React, no DOM. Runs in browser and Node.
  It also holds the situation model (`situation/`) and the trigger/condition evaluation per game (`conditions/`):
  what an aura shows in a situation. `auraRules(game)` gives a game's rules (trigger kinds, `setInCombat`,
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
  `num`); core tests cache addon files in `.cache/addon` (gitignored).
  wago JSON (`wago-json.ts`, `toWagoJson`/`fromWagoJson`) is the third form of an aura: byte-identical to wago.io's
  JSON, with wago's own rules both ways (`.scratch/tbc-anniversary/wago-json.md`); pure and shared by every game.
  `fillDefaults`/`validate`/`registries` run the whole addon in a lazily loaded second VM (`src/core/addon-vm/`,
  a Web Worker in the browser). To add a full-VM call, add the method to `AddonVM` (`vm.ts`) and `AuraCore`
  (`aura-core.ts`); the worker and its host (`host.ts`) forward any `AddonVM` method by name. Both VMs share `lua-stdlib.ts`; answers to the page
  are one JSON (`B.json` in `lua/bridge.ts`, aura documents inside marked with `B.doc`). A core that is replaced
  must be `dispose()`d (its worker holds a whole Lua heap). `loadAddon(ref, { game })` picks the game's client:
  `"forever"` (default: Musca Auras, `<Addon>.toc`) or `"tbc"` (WeakAuras2 from its release zip, `<Addon>_TBC.toc`;
  needs a `fetchSource`); per game the full VM takes a client profile, a contract and its own extractors
  (`addon-vm/games.ts`). Client answers belong in the game's client profile (Forever: `profile.ts`; TBC:
  `profile-tbc.ts`, every answer marked UNVERIFIED until checked in game). Every addon internal the extractors use is
  in the contract (`contract.ts`): `COMMON_CONTRACT` for what every WeakAuras has (`lua/extract.ts`, `lua/options.ts`),
  `FOREVER_CONTRACT` for Musca's own (Aura (Modern), combat warnings, packs: `lua/extract-forever.ts`, `lua/new-aura.ts`).
  The options editor (`options`/`setOption`) builds the in-game options tabs in that VM with WeakAurasOptions' own
  generators and applies edits through each option's own `set()` (`addon-vm/options.ts`, `lua/options.ts`, dialogs in
  `lua/dialogs.ts`); its form is `src/components/options-editor/`. Tabs are the addon's keys (`region` is Display,
  `action` is Actions); validation pointers use the same keys, so `options({tab: pointer.tab})` opens the right tab. Buttons that open a game dialog (icon/texture/model picker, code editor,
  confirmation popups) return `edit.dialog`; the page shows its own and answers with the same button. The New Aura
  page (`newAuraPage`/`newAura`/`packs`; `addon-vm/new-aura.ts`, `lua/new-aura.ts`) comes from the addon too. Forever client data the profile answers (classes,
  difficulties, item types, talents) is `addon-vm/client-data.json`; TBC's, same shape, is `addon-vm/client-data-tbc.json`. Both are
  generated by `node scripts/client-data.ts <wago product> <output.json>` (`wowf`, `wow_anniversary`).
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
  Each game has its own spell database (`server/spells`: a `SpellSource` names the wago product, the Wowhead
  environment and the file; `FOREVER_SPELLS` is `data/spells.sqlite`, `TBC_SPELLS` `data/spells-tbc.sqlite`, gitignored). The addon source cache (`server/addon/source-cache.ts`) is the only
  place the server reads addon files; the server's aura core (`server/addon/core.ts`, one per resolved ref) and the
  agent-docs loader (`server/agent-docs.ts`) use it. Push, docs and diff follow `?ref=` (default: newest release).
  WeakAuras2 (TBC) comes from GitHub release zips instead (`server/addon/weakauras2-releases.ts`: tags from 5.21.0
  with a `WeakAuras-<tag>.zip`, checked against GitHub's sha256, unpacked once per version; `unzip.ts`). Its tests
  use a recorded release list (`tests/fixtures/weakauras2`) and download the 5.22.1 zip once into
  `.cache/weakauras2` (`tests/support/weakauras2.ts`), skipping when offline.
- `src/api/`: wire types and limits of the HTTP API shared by server and page (`addon.ts`, `spells.ts`, with
  `iconNameUrl`). No server code: client code imports these, never `@/server/*`.
- `src/workspace/`: the workspace model (`tree.ts`: top-level auras as nodes, groups nest their `items`; pure operations keep ids unique and
  `controlledChildren`/`parent` in step), its storage/file format (`workspace.ts`, v2 JSON; v1 still read), import/export
  files (`files.ts`: aura `.txt` = exactly one state code; text with several codes; workspace `.json`), undo/redo
  (`history.ts`), the restore decision (`restore.ts`), the push/SSE wire protocol (`protocol.ts`: header, event names,
  notice/snapshot types, URLs, push input; used by page and server) and the page address (`address.ts`: only `?w=`).
  **Auras never go in the address**: they can be megabytes, so they travel as files, over the push API, or by
  clipboard (an old `?code=` link is imported once; every other parameter is dropped). New auras come only from the
  addon's New Aura (`placeNewAura` places them). Pure, shared by page and server.
- `src/client/`: page-side libraries (browser only, no routes). `client/workspace/`: `WorkspaceSession` (one page's
  workspace per aura core) over `StateCodes` (`codes.ts`), `ServerLink` (`server-link.ts`: the push/SSE protocol) and
  the write-behind `WorkspaceStore` (`storage.ts`, IndexedDB via `src/lib/idb.ts`, migrating old localStorage
  copies); `useWorkspace`/`useUndo` hooks; `window.auraSimulator` (`page-api.ts`, documented in the agent docs).
  `client/addon-client.ts`: the page's side of `/api/addon/*` (versions, the bundle fetcher the aura core loads
  through, client spells, diff).
- `src/server/workspaces/`: push API (bodies up to 32 MB) and the hub of recent pushes per workspace, in memory.
  Every top-level aura a page changes is pushed there too, so agents read the player's current aura with
  `GET /api/workspaces/<id>`; it holds the latest few pushes, not workspaces (those live in the browser).
- `src/docs/`: the agent docs (one Markdown source, served at `/docs/agents`, `/llms.txt`, `/docs/agents.md`).
  Update it when an API or format changes; `agent-docs.ts` has one function per section. Lists of types, triggers, condition variables and defaults are generated
  from the addon version (`addon-facts.ts`); the worked examples (`worked-examples.ts`) are the documents in
  `src/render/examples.ts` (the browser tests push them to the window) and tests push every example block of the served docs.
- `src/app/`: Next.js routes and pages. Thin; delegates to the modules above (page logic goes in `src/client/`).
  `AuraSimulator.tsx` is the page's composition root: it fills `src/components/shell`'s `AppShell` (the window
  and the game screen pane) with the features (`components/aura-list`, `components/options-editor`, `app/addon`
  for the version picker, `app/screen` for the game screen pane). `components/ui` is the generic UI kit (no game code). `/lua/liblua5.1.wasm` serves wasmoon's
  Lua binary from `node_modules`, so the browser's aura core loads no CDN. Links the server writes into answers use
  `requestOrigin` (`src/server/request-origin.ts`: honours `X-Forwarded-*`), not `request.nextUrl.origin`.
- `src/lib/`: small generic helpers with no project knowledge; any layer may import them and they import nothing
  from `src` (`errors.ts`: `errorMessage`; `fetch-json.ts`: `fetchJson`, the one way page code fetches JSON, and
  `HttpError`; `idb.ts`: one IndexedDB object store, used by the workspace storage and the screenshot store).
- Tests: unit/seam A with Vitest (`npm test`), browser/HTTP seam B with Playwright (`npm run test:e2e`,
  `E2E_PORT` picks the port so parallel worktrees don't clash). Network-dependent tests use recorded
  fixtures in `tests/fixtures/`. The e2e dev server gets addon versions/refs from recorded GitHub/jsDelivr
  answers (`ADDON_UPSTREAM_FIXTURES`; addon files are cached in `.cache/addon`, the source cache's layout, shared with
  the unit tests); `LIVE=1 npm test -- addon-live`
  checks the real upstream.
- Musca Auras source: GitHub `dldvlpr-addons-wow/Musca-Auras`, per file via
  `https://cdn.jsdelivr.net/gh/dldvlpr-addons-wow/Musca-Auras@<ref>/<path>`. A local install of v1.15.0 is at
  `~/Games/battlenet/drive_c/Program Files (x86)/World of Warcraft/_forever_/Interface/AddOns/WeakAuras*` (read only).
- Ticket files: `.scratch/aura-simulator-v1/issues/`. Tick acceptance boxes and set `Status:` when done.
- Blizzard art (icons, glow textures) is fetched at runtime and never committed.
<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
