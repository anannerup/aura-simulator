# Spec: Aura Simulator v1

Status: ready-for-agent

## Problem Statement

Building auras in WoW Forever is cumbersome. The official WeakAuras addon does not run on
Forever; the community fork Musca Auras does, but configuring it in-game means clicking through
dozens of option panels, and Forever's addon restrictions mean many auras silently stop updating
in combat. The player can't see whether an aura will look and behave right until they've built it
in the game and tried it in a fight.

The player wants to describe an aura in plain language to a coding agent ("remind me when my buff
has under 3 minutes left, desaturated, and make it glow when it expires"), see it rendered
faithfully in a browser, adjust it, and only then take it into the game.

## Solution

A Next.js web app that runs locally first (a public domain later). It holds a **workspace** of
**auras** and groups. Each aura is a document (the same Lua table the addon stores), and its
**state code** is the addon's own `!WA:2!` import string, the way a FEN string is the state of a
chess position: paste or import a state code and the preview shows that aura; edit the aura and the
state code updates; copy the state code into the game's import dialog. Auras (historically up to megabytes)
travel as **files**: an aura's state code as a `.txt` file, the whole workspace as a `.json` file. The page
address only names the workspace, never holds auras.

- An agent (Claude, Codex, ...) reads the app's **agent docs page**, builds an aura, and either
  **pushes** it to the running app over HTTP (the open page updates live) or drives the page in
  a browser tab.
- The user sees the aura on a **mock game screen** at its real position and size, scrubs the
  **situation** (time left, aura present or missing, stacks, target exists, in combat), adjusts it
  in an editor that mirrors the in-game options window, and exports.
- The data side runs the **real Musca Auras Lua** in the browser, fetched for a chosen **addon
  version** (release tag, branch, or commit), so defaults, options, validation and encoding follow
  addon updates without code changes. Rendering is hand-written HTML/CSS/JS.
- The app warns when an aura won't work in combat and suggests the closest version that does,
  but never blocks export.
- The server keeps a **spell cache** (SQLite): Forever's spell list from wago.tools for name
  search, icons and tooltips from Wowhead, refreshed by a **sync** action.

## User Stories

### Describing auras through an agent

1. As a player, I want to describe an aura in plain language to my coding agent, so that I don't have to click through option panels.
2. As an agent, I want a docs page written for agents that explains the aura document, the state code, the push API and the combat rules, so that I can build correct auras without reading the addon source.
3. As an agent, I want to push an aura or group to the running app over HTTP, so that I can deliver it without browser automation.
4. As a player, I want the open page to update live when my agent pushes an aura, so that I see the result immediately.
5. As an agent attached to a browser tab, I want a documented in-page command to load an aura document or state code, so that I don't have to click through forms.
6. As an agent without a running app connection, I want to hand the player a `.txt` file with the state code, so that they can drop it on the page or paste it into the game.
7. As an agent, I want to look up spells by name through the app's API, so that I use Forever's real spell IDs.
8. As an agent, I want the app to return validation results and combat warnings for an aura I push, so that I can fix problems before the player looks at it.
9. As an agent, I want the agent docs to include worked examples (buff reminder, cooldown icon, debuff bar, group), so that I can pattern-match common requests.

### Seeing and checking the aura

10. As a player, I want the aura drawn the way the game draws it (icon, cooldown swipe, bars, text, borders, glows), so that what I approve is what I'll get.
11. As a player, I want the aura shown on a mock game screen at its real anchor, offset and size, so that I can judge position.
12. As a player, I want to set my screen resolution and UI scale for the mock screen, so that sizes match my game.
13. As a player, I want to put an in-game screenshot behind the mock screen, so that I can see the aura against my real UI.
14. As a player, I want a slider for the aura's time left, so that I can see how it looks as it runs down.
15. As a player, I want to toggle whether the aura is present or missing, so that I can see both states.
16. As a player, I want to set stacks, so that stack text and stack conditions can be checked.
17. As a player, I want to toggle whether a target exists, so that target-based auras can be checked.
18. As a player, I want an in-combat switch that shows what freezes or stops working in combat (e.g. a padlock on frozen auras), so that I trust it in a fight.
19. As a player, I want conditions (desaturate, glow, colour, alpha, text) to visibly react to the situation controls, so that I can confirm the logic.
20. As a player, I want glow types (button overlay, pixel, autocast shine, proc) animated as in the game, so that I can pick the one I like.
21. As a player, I want animations (start, main, finish) previewed, so that I can see them before importing.
22. As a player, I want real spell icons in the preview, so that it looks like my game.

### Adjusting the aura

23. As a player, I want an editor with the same tabs and option names as the in-game options window (Display, Trigger, Conditions, Actions, Animations, Load, Custom Options, Information; a group gets Group first), so that what I learn transfers to the game.
24. As a player, I want every option the addon supports to be editable, so that I'm never forced back into the game to finish an aura.
25. As a player, I want an editable view of the aura's raw table, so that I can make precise changes or paste one in.
26. As a player, I want edits in the forms, the raw table and agent pushes to stay in sync, so that there's one truth.
27. As a player, I want to search spells by name and pick one, so that I don't have to know spell IDs.
28. As a player, I want to enter a spell ID by hand, so that I can use a spell the cache doesn't know.
29. As a player, I want to undo and redo edits, so that I can experiment safely.

### Combat warnings

30. As a player, I want a warning on any aura that won't fully work in combat, with the reason in plain words, so that I'm not surprised in a fight.
31. As a player, I want the warning to point at the option that causes it, so that I know what to change.
32. As a player, I want to export an aura even when it has combat warnings, so that I stay in control.
33. As an agent, I want the warnings in machine-readable form, so that I can propose the closest version that does work.

### Workspace, groups, saving and exporting

34. As a player, I want a workspace holding several auras, so that related auras (like a two-aura buff reminder) live together.
35. As a player, I want to create groups and dynamic groups and nest auras in them, so that I can build full setups.
36. As a player, I want to copy one aura's or one group's state code to the clipboard, so that I can paste it into the game's import dialog.
37. As a player, I want the state code to be accepted by Musca Auras' import dialog, so that import just works.
38. As a player, I want to export one aura or group as a `.txt` file named after it that holds exactly its state code, so that I can keep or share it however large it is, and open it to paste into the game.
39. As a player, I want to import `.txt` files (one or several state codes each) by picking or dropping them on the page, so that auras from others or from agents join my workspace.
40. As a player, I want to paste any state code into the app, so that I can open auras from others or from agents.
41. As a player, I want to export the whole workspace (auras, groups, nesting, spell IDs and icon IDs) as a JSON file, so that I can keep it or hand it over.
42. As a player, I want to load a workspace JSON file back in (replacing the workspace or adding to it), so that I can continue later.
43. As a player, I want my current workspace kept in the browser, even when it is megabytes, so that closing the tab doesn't lose work.

### Addon versions

44. As a player, I want to pick the Musca Auras version the app follows, defaulting to the newest release, so that previews and exports match my installed addon.
45. As a player, I want to enter a branch or commit instead of a release, so that I can follow pre-release builds.
46. As a player, I want the app to tell me what changed in the options list when I switch versions, so that I know whether my auras are affected.
47. As a player, I want a clear error if an addon version can't be loaded or something the app relies on is gone, so that I don't get silently wrong output.

### Spell cache

48. As a player, I want spell names and icons to come from Forever's own data, so that spell IDs match my game.
49. As a player, I want a sync action that refreshes the spell list from wago.tools and fills icons and tooltips from Wowhead, so that the cache follows Forever patches.
50. As a player, I want lookups to be fast and work after one sync without hitting the internet each time, so that the editor is responsive.
51. As a player, I want spells that weren't found, or whose data looks unclear, flagged, so that I double-check them in the game.

### Running it

52. As a player, I want to run the app on localhost with one command, so that I can use it before it's hosted.
53. As a player, I want it deployable to my domain later without a redesign, so that I can share it.

## Implementation Decisions

- **One Next.js app.** Pages for the editor and preview; server routes for the push API, spell search, sync, and addon source caching. Runs on localhost first.
- **Aura document and state code.** The aura document is the addon's own aura table (as the addon stores it), represented in JS. The state code is the addon's import string. Encoding and decoding use the addon's own LibSerialize and LibDeflate, run in the Lua engine, producing plain (unencrypted) `!WA:2!` strings, which Musca Auras' import accepts. Musca's own exports are deliberately encrypted; the app doesn't decode them.
- **Lua engine.** Real Lua 5.1 compiled to WASM (`wasmoon-lua5.1`), chosen because the addon depends on 5.1 features (`setfenv`, `loadstring`, global `unpack`). A thin shim supplies the WoW globals the loaded files need (string aliases, `bit`, `LibStub`, build info, frame stubs). Research verified a full encode/decode round trip with the addon's libraries.
- **Aura core module (deep module, primary seam).** One interface, roughly: load an addon version; encode a document to a state code; decode a state code to a document; fill defaults; validate (including combat rules); describe the options schema. Everything Lua-related hides behind it.
- **Following the addon.** Source is fetched per file from GitHub (`dldvlpr-addons-wow/Musca-Auras`) via jsDelivr, which sends CORS headers and lists versions without rate limits. The server caches fetched versions. The version picker lists release tags (some prefixed `v`, some not) and accepts a branch or commit.
- **Validation is the addon's own.** Default tables, migrations (`internalVersion`, currently 92) and the fork's validation (the "Aura (Modern)" `secretAura` checks, condition rules and allowed sub-elements) come from running the addon's Lua where feasible. Rules the app must restate are kept in one place and flagged if the addon file they mirror changes.
- **Combat model.** For the player's own buffs and debuffs, the fork's "Aura (Modern)" trigger is the one that works in combat. Its remaining-time check can only drive glow or `%p` text colour and visibility. Desaturate and colour are allowed on the "missing" state, and a remaining-time check only applies while the aura is active. The combat warnings and the in-combat switch are built on these rules.
- **Rendering is hand-written.** HTML/CSS/JS renderers per region type (icon, aura bar, text, texture, progress texture, stop motion, model placeholder, group, dynamic group) and sub-region type (text, border, glow, background, tick, texture, ...). LibCustomGlow's glow styles are reproduced with its Blizzard textures. Textures shipped in the addon are decoded in the browser (TGA via `tga-js`, BLP via `@wowserhq/format`).
- **Blizzard art is loaded at runtime, never stored in the repo.** Spell icons come from Wowhead's image server; glow and UI textures come from wago.tools file downloads by FileDataID. Both are cached in the browser.
- **Spell cache on the server, SQLite.** Sync downloads Forever's spell list (build product `wowf`) from wago.tools for name search and IDs, and fills icons and tooltips from Wowhead's tooltip endpoint. Searching by name is served from SQLite.
- **Push API (contract sketch).**
  - Send a document or state code to a workspace; the response returns the state code, validation results and combat warnings.
  - Open pages subscribed to that workspace update live (server-sent events announce a revision; pages fetch it, so megabyte codes aren't broadcast).
  - Pages push every top-level item the player changes too, so an agent reads the player's current aura from the workspace's latest push. The server keeps only the last few pushes per workspace, in memory; a page restores from browser storage and merges in a push newer than its last save.
  - Bodies up to tens of megabytes (auras have historically been MB).
  - Spell search by name; spell lookup by ID; trigger a sync.
- **Workspace.** Held in the browser (IndexedDB; localStorage's ~5 MB is too small) and never mirrored to the page address, which only names the workspace (`?w=`). Exported and imported as JSON: auras, groups, nesting, spell IDs and icon IDs (no embedded images). Single auras or groups are exported as `.txt` files holding exactly the state code, and any text file with state codes imports. No links carry auras and there are no short links (decided 2026-11-06: auras can be megabytes).
- **Editor.** Mirrors the in-game options tabs and names. Form fields are driven by the options schema from the aura core, so new addon options appear automatically; the raw-table view and agent pushes share the same document state.
- **Agent docs page.** Generated where possible from the same schema and validation rules, so it stays current with the addon version.

## Testing Decisions

- Good tests exercise external behaviour only: given documents, state codes and situations, check what comes out (strings, warnings, what's visible). No tests of internals (the Lua bridge, React components, SQLite queries).
- **Seam A, the aura core:**
  - Round trip: a document encodes and decodes back to the same document.
  - Defaults are filled; validation and combat warnings are produced for known-good and known-bad auras.
  - Known-good fixtures: the import strings shipped inside the addon itself (the Forever tutorial auras).
  - Run against more than one real addon version, so an addon update that breaks something is caught.
- **Seam B, the running app from outside:**
  - In the browser (Playwright): open the page with a state code and a situation, then assert what the preview shows (desaturated, glow on, hidden, bar width) and what the export yields. *Superseded (2026-11-06): auras never go in the address; tests put the aura on the page by push, file import or `window.auraSimulator.load`.*
  - Over HTTP: pushing an aura updates an open page; spell search returns Forever spells; sync fills the cache.
  - wago.tools and Wowhead responses are recorded fixtures, so tests don't hit the internet.
- **Final acceptance is manual, in the game.** The player imports and checks the v1 acceptance auras listed under Further Notes.
- **Prior art:** none yet; this is a new repo.

## Out of Scope

- Editing or reading auras already in the player's game (no reading the saved settings file, no decrypting Musca exports).
- Writing to the game's saved settings. The player always imports the state code by hand.
- Running the addon's rendering code in an emulated WoW in the browser (option (a)); rendering is hand-written.
- Accounts, server-side workspace storage (the server only keeps recent pushes in memory), share links, and multi-user features.
- Custom Lua code in auras beyond preserving and exporting it (no executing custom triggers in the preview).
- Hosting on the public domain (planned later; v1 must not prevent it).
- Other addons, and WeakAuras for retail or Classic clients.

## Further Notes

- **v1 is done when** the player has imported each of these into the game and confirmed it works:
  1. The buff reminder as two auras that work in combat: one shows the icon permanently desaturated and glowing as it runs low when under 3 minutes are left; the other shows it desaturated and glowing when the buff is missing.
  2. A cooldown icon that desaturates while on cooldown.
  3. A bar showing a debuff's time left on the target.
  4. A group holding these.
- Wowhead has no Forever data environment; wago.tools' `wowf` build is the authoritative Forever source.
- wago.tools' CSV exports have no CORS headers, which is one reason the spell cache lives on the server.
- Musca Auras is GPL-2.0; the repo is public.
