# How the aura simulator should be built

## The shape

The app is two programs that share one domain. The server is a long-running Node process (`next start`). It holds what must outlive a page: downloaded addon releases, the spell and item data, recent pushes, and a headless browser that takes pictures. The browser holds the player's workspace and runs the addon's Lua in a Web Worker, so the window responds without a server round trip. The aura logic (state codes, wago JSON, the addon's import, defaults, validation, tabs, what an aura shows in a situation) runs unchanged on both sides. Everything else in the design follows from keeping that shared logic pure and putting each side's input and output at the edges.

The page uses the same public HTTP API that agents use. It doesn't use Server Actions, because the push API has to be public anyway and one API means agents see what the player sees. Server Components render only the static shells: the game picker, the docs page, and the frame around the window. Everything below `app/[game]/page.tsx` is client components.

## Layers

Business folders sit in five ranks. A folder may import only from ranks below it, never from its own rank or above:

1. `app/`: routes and pages.
2. `window/`, `pictures/`, `agent-docs/`: the features a player or agent uses.
3. `game-screen/`, `workspaces/`.
4. `auras/`, `catalog/`.
5. `games/`, `lib/`.

Inside a folder, the root files are pure TypeScript that runs on both sides. A `server/` subfolder holds what needs Node: the disk, SQLite, upstream downloads, Chromium, `sharp`. Each of those files starts with `import 'server-only'`. A `browser/` subfolder holds what needs the browser: IndexedDB, the worker, the event stream, React hooks. Each of those files starts with `import 'client-only'`. Root files never import from either subfolder. `server/` files are imported only by routes and other `server/` files, and `browser/` files only by client components and other `browser/` files. `auras/addon/` (the Lua) is private to `auras/`.

The build enforces all of this. The `server-only` and `client-only` markers make Next fail the build when a file is imported into the wrong side. ESLint's `import/no-restricted-paths` (already installed through `eslint-config-next`, and it resolves `@/` and relative paths) gets one zone per rank, one for the subfolder rules and one for addon privacy. `import/no-cycle` catches runtime cycles. Calls stay short: a route calls one function in a feature or domain folder, and that function does the work.

## Folders

```
src/
  app/           routes and pages only
  games/         forever/, tbc/: plain descriptions of each game
  auras/         the aura and the addon
  catalog/       spells, items, game files, icons by look
  workspaces/    a workspace's auras, pushes, live notices, situation
  game-screen/   drawing auras where the game draws them
  window/        the options window
  pictures/      picture, comparison, font sample, texture picture
  agent-docs/    llms.txt and its topic files, per game
  lib/           small helpers with no project knowledge (3+ users)
tests/           the app from outside, fixtures, live checks
```

Names come from the glossary. Two words are new, "catalog" and "media" (below), and go into the glossary before they go into code.

## Where the main things live

**The aura and the addon (`auras/`).** The root defines the aura document (the addon's table as JSON) and its readers, the state code, wago JSON in both directions, table paths, and the situation with its evaluation. That evaluation answers what each display shows, which conditions are active, what its texts draw and which custom code wasn't run. The game screen draws from that answer, and a push answer's `preview` puts it in words, so the two can't disagree. Forever's combat rules (Aura (Modern), freezing) sit next to the plain WeakAuras rules as one more file. The one entry point to the addon is `loadAddon(game, release, files, spells)`. It returns an addon with these functions: `decode`, `encode`, `importCheck`, `withDefaults`, `validate`, `tabs`, `setOption`, `newAura`, `media`, `tableMap`, and `dispose`. The caller supplies the files and the spell answers, so `auras` never fetches anything and never imports `catalog`. Behind that entry point, `auras/addon/` loads the Lua VM, supplies the simulated game, and checks every answer from the Lua into a TypeScript type before returning it. Whether it keeps a small second VM for fast encoding is its own business. `auras/browser/` runs the addon in a worker behind the same functions. Disposing the addon rejects every call still waiting. `auras/server/` downloads releases and keeps them on disk: Musca by tag through jsDelivr, WeakAuras2 as GitHub release zips checked against GitHub's sha256. It keeps one loaded addon per game and release, caches the table map on disk by game, release and generator hash (it takes minutes to generate), and fetches wago links. Every file that restates addon Lua names the addon file it ports and that file's hash, and one test per game checks those hashes.

**The two games (`games/`).** Each game is a plain record: id and names, its addon (repository, how releases are found, the `.toc` it reads, the first supported release), its simulated game (build info, project id, and the client data JSON that `scripts/` generates from wago.tools), and its catalog source (wago product, Wowhead environment). The record also has the few facts that change behaviour, such as `combatRestricted`. `games/` imports nothing. With two games, a difference is a field in the record plus one branch in the single module that acts on it. Per-game strategy interfaces are added only if a third game makes the same branches repeat.

**Workspaces and the agent API (`workspaces/`).** The root holds the workspace (its auras, groups nested, operations that keep ids and parents consistent), undo history (an empty workspace counts as an undo step), the three file forms (`.txt` state codes, `.json` wago JSON, `.aura-workspace.json`), and the live protocol: push input and answer, and notices that carry the server's start id, so a page notices a restart or a reset. `server/` holds the use cases agents call. `pushAura` turns any input (state code, wago JSON, wago link, aura document) into a state code, runs the import check and validation with the release the caller asked for, attaches the preview, and stores the push only once all of that has succeeded. It also holds `setSituation`, `forgetWorkspace`, the event stream, and the recent pushes kept in memory. `browser/` holds the open workspace: the one writer of the player's auras. It is a store outside React that hands out immutable snapshots through `useSyncExternalStore`. It talks to the addon worker, IndexedDB and the server link, and it handles the `window.auraSimulator` commands. Every edit carries the aura, top-level aura and generation it was made against, and a result whose generation has moved on is dropped. That rule is what prevents the "edit lands on the wrong aura" bugs.

**The window (`window/`).** It is client components only: title bar, aura list, tabs (forms built from `addon.tabs()`), the JSON tab, import and export, version picker, Situation panel, New Aura, the spell, icon and texture pickers, and the addon's problems. Components read and change auras only through the open workspace, and search only through `catalog/browser/`. They never call the worker or `fetch` directly. Its generic controls live in `window/` until a second feature needs them.

**The game screen (`game-screen/`).** This folder holds the surface (resolution, UI scale, an optional screenshot behind it), pure layout (anchors, groups and dynamic groups placed as boxes on the pixel grid), and one component per region and display element type, with the glows, textures and fonts. It takes the auras, their evaluation from `auras` and a `media` object as props. `media` tells it how to load a texture path, a spell icon or a font, and the page builds it for the selected game. The screen never picks a game and never fetches except through `media`. A still mode freezes animations for pictures.

**Pictures (`pictures/`).** The root holds the still aura (the game screen in still mode, cropped to what it drew) and the comparison math, which is pure functions over pixels. `server/` holds the camera: one headless Chromium per process, two pictures at a time, loading `app/[game]/render`. It also holds image decoding with `sharp`, the font sample and the texture picture.

**Spell and item data (`catalog/`).** This folder holds spells, items, the game's file list (path to FileDataID) and icons searched by how they look. The root holds their types and the search-page rules that page and server share. `server/` keeps one SQLite file per game and kind under `DATA_DIR`. Each is downloaded on first use and replaced as a whole on refresh. That download-and-replace policy is the one thing the three caches share, so it is the only code they share. Refreshing spells from wago.tools and Wowhead is a use case here. `browser/` holds the lookup functions the window and `media` call.

**Agent docs (`agent-docs/`).** For each game, `/<game>/llms.txt` is a front file: a list of topics with one line each, linking to small Markdown topic files. Topics that are the same in both games (wago JSON, push API, situation, pictures, catalog) are written once and filled in with the game's words. Per-game topics (combat rules, worked examples) live in `agent-docs/forever/` and `agent-docs/tbc/`. Lists of types, triggers and defaults come from `addon.media()`, the addon's facts and the table map, so they follow the release. Every link carries `?ref=`. The HTML docs page renders the same set. Worked examples are aura files that the tests push.

**Routes (`app/`).** There is one route folder per URL, as Next wants. `app/api/[game]/…` route handlers read the game and parameters, parse the body with the owning module's parser, call one function, and turn its result into a response. A refusal (the addon's import message, a bad release) becomes a 4xx. A thrown error is a bug. `proxy.ts` sends a 404 for any game id that isn't in `GAMES`, in one place: Cache Components rules out `dynamicParams`, and a prerendered shell must not go out for a game that doesn't exist. `app/[game]/simulator.tsx` is the browser composition. It opens the workspace and the addon for the chosen release, builds `media`, and lays out the window beside the game screen. Environment variables are read only in `lib/config.ts`.

**State on the server.** In-memory state lives in module scope of `server/` files, kept on `globalThis` so development reloads don't duplicate it: recent pushes, live subscribers, loaded addons, Chromium. Durable caches live on disk under `DATA_DIR`. The app is self-hosted on purpose. It doesn't fit serverless hosting, and the design doesn't pretend it does.

## Tests

The tests have two seams, and both test promises a player or agent can observe.

**Seam A, in memory (Vitest).** These tests sit next to the code they promise about, mostly in `auras/`: import acceptance, defaults, warnings, state codes and wago JSON byte for byte, tabs and edits, what an aura shows in a situation, the table map replayed, the mirrored-file hashes. Each suite runs `describe.each(GAMES)`, so a game can't silently drop out. The pure parts of `workspaces/` (history, files), `game-screen/` layout and `pictures/` comparison get colocated tests of the same kind. React components get no unit tests; the player stories cover them.

**Seam B, from outside (Playwright).** These tests live under `tests/` and run against a fresh production build. `tests/agent-api/` covers HTTP: pushes accepted and refused, release selection, ordering, live notices across reset and restart, docs, catalog searches. `tests/player/` holds complete player stories that end in something visible or exported. `tests/pictures/` holds a bounded set of pictures with fixed time and recorded media. Outbound requests fail those tests.

**Fixtures and tiers.** `tests/fixtures/` holds recorded upstream answers and a manifest with checksums. Global setup fails the run when a fixture is missing or wrong; nothing skips. `tests/live/` runs only through `npm run test:live`. The tiers stay: `npm test` (fast), `npm run test:e2e` (representative), and `npm run test:all` (everything, with the sharded exhaustive suites tagged).

## Getting there, each step green and merged

1. **Guard first.** Add the zones, the subfolder rules, addon privacy and `import/no-cycle`, naming the target folders. Run `eslint --suppress-all`, so today's violations are recorded in `eslint-suppressions.json` and any new one fails. Mark the Node-only entry files `server-only`.
2. **Bottom rank.** Make `games/` plain records that import nothing. Move per-game code to the module that acts on it. Delete the upcoming games. Keep `lib/` only for helpers with three or more users.
3. **`auras/`.** Merge the aura core, the addon VM, conditions and situation, wago JSON and the addon release cache into it behind `loadAddon`, with Lua answers typed at the boundary. Its tests move with it and run per game.
4. **`catalog/` and `workspaces/`.** The server's use cases move here and routes shrink to translating. The browser's session, storage and server link become the open workspace.
5. **The features.** Move the renderers into `game-screen/` (fed `media` by the page), page features out of `app/` into `window/`, picture code into `pictures/`, and the docs into `agent-docs/` as a front file plus topics.
6. **Finish.** Delete the emptied folders. The suppressions file should now be empty; delete it so the rules are absolute. Sort the e2e specs into `tests/agent-api/`, `tests/player/`, `tests/pictures/` and `tests/live/`. Hand over for Codex's review.

Sources: [Next.js data security guide](https://nextjs.org/docs/app/guides/data-security) · [bulletproof-react project structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) · [React `useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore)
