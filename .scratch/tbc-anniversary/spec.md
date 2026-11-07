# Spec: Games (WoW Forever and TBC Anniversary) and wago JSON

Status: ready-for-agent

Research: `research.md` (WeakAuras2 on TBC Anniversary), `wago-json.md` (wago.io's JSON form, verified byte for byte on https://wago.io/LEPRolmHn).

## Problem Statement

The app only builds auras for one game: Musca Auras on WoW Forever. The user also plays TBC Anniversary, where players run official WeakAuras2. The user also wants agents to build auras by writing the aura's table directly ("I give intent and rules, the agent produces the table, I import it, the aura works"), in the JSON form wago.io shows. Today that form doesn't exist in the app, and nothing documents how window options map to table keys.

## Solution

- **Game picker.** `/` is a picker shown on every visit. Each game is its own site:
  - `/forever`: Musca Auras on WoW Forever.
  - `/tbc`: official WeakAuras2 on TBC Anniversary.
  - Each site has its own window, workspaces, agent docs (`/<game>/docs/agents`) and push API (`/api/<game>/...`).
- **Three forms of an aura.** The window, the import string (`.txt`), and the wago JSON (`.json`) all describe the same aura and convert into each other.
  - The JSON is byte-identical to what wago.io produces.
  - JSON goes back into an aura by wago's own rules.
- **Option ↔ table reference.** Every game version's agent docs include a reference generated from the addon. It maps every window option to the JSON paths it writes, and every JSON key back to its option. An agent can then write a correct table from intent.

## User Stories

1. As a user, I see a game picker every time I open the site, so I choose Forever or TBC Anniversary.
2. As a user, I can go back to the picker from the window's title and pick the other game.
3. As a user on `/tbc`, I build auras with official WeakAuras2's own tabs and options, generated from its Lua like Forever's are.
4. As a user, I pick the addon version from released GitHub tags only. This holds for both games: Musca's branch and commit refs go away.
5. As a user on `/tbc`, versions are WeakAuras2 tags that have a release zip, from 5.21.0 on. The app loads that zip, exactly what players run.
6. As a user, each game has its own workspaces; auras for different games never mix.
7. As a user, importing or pushing a code made for another addon version behaves exactly as the game's import does, with the addon's own message (the addon's import code decides).
8. As a user on `/tbc`, there is no combat check and no in-combat freezing, because TBC Anniversary has no combat restrictions. The addon's own warnings are still shown.
9. As a user on `/tbc`, the spell picker searches TBC Anniversary spells (wago product `wow_anniversary`) with TBC tooltips from Wowhead (`/tbc/`, `dataEnv=5`).
10. As a user on `/tbc`, the Load tab shows TBC data: classes, talents, difficulties, item types.
11. As a user on `/tbc`, the situation controls show TBC's trigger kinds, without Aura (Modern).
12. As a user, New Aura on `/forever` keeps Packs and the Modern Aura Group. `/tbc` shows only what WeakAuras2 offers.
13. As a user, I export an aura as `.txt` (the in-game import string) and `.json` (wago JSON) side by side.
14. As a user, I import or drop a wago `.json` and get the same aura wago would give.
15. As a user, I paste a wago link (e.g. `https://wago.io/LEPRolmHn`) into Import and the aura loads; the server fetches it from wago's API.
16. As a user, the window's drawer has a JSON tab, replacing "Raw table". It shows the selected aura as wago JSON, can be edited, and edits apply to the aura.
17. As a user, the JSON for an aura that came from wago is byte-identical to wago's, including `wagoID`, `url`, `version` and `semver`.
18. As a user, a new aura's JSON is in wago's format without wago's fields.
19. As a user, the whole-workspace export is named `.aura-workspace.json`, so `.json` always means wago JSON.
20. As an agent, I push wago JSON (pretty or compact) as well as import strings.
21. As an agent, I read `/<game>/docs/agents` and find, for every tab and option of that game's version, the JSON paths it writes, the type, allowed values and default.
22. As an agent, I find for every JSON key which option sets it and what it does.
23. As an agent, the docs give me the game's rules (Forever's combat rules; TBC's plain rules) and worked examples as wago JSON.
24. As an agent, validation tells me what's wrong with a table I wrote, using that game's addon.
25. As an agent, docs, push and validation use the addon version I name (`?ref=`), defaulting to the newest release.
26. As the user, I import the TBC v1 auras in game and confirm they work (human ticket).
27. As a developer, the TBC client profile marks every answer it assumes as unverified until checked in game.
28. As a developer, renderers are shared between games only while the Lua file they port is byte-identical in both addons. Each game records hashes of the files it mirrors, and a test fails when they diverge.

## Implementation Decisions

- **Game** (glossary term) = an addon (repo, version rules, how source is fetched) plus a game client (client profile, client data, spell database, Wowhead environment) plus its rules, docs and examples. Two games: `forever` and `tbc`.
- **Abstraction rule (user's):** share only what is truly the same concept. Shared:
  - the Lua engine (wasmoon running an addon);
  - the aura document model;
  - workspace storage and the push mechanism;
  - the window frame;
  - wago JSON;
  - renderers, but only by the hash rule (story 28).

  Per game:
  - addon source and versions;
  - client profile and client data;
  - spell database;
  - condition/combat rules and validation presentation;
  - situation controls;
  - New Aura extras;
  - docs, worked examples, v1 auras and test fixtures.

  Code that merely looks alike today stays separate.
- **Addon source per game:**
  - Forever reads Musca's tagged source from jsDelivr/GitHub, as today, restricted to tags.
  - TBC: the server downloads each tag's GitHub release zip (CORS blocks the browser), unpacks it, and serves the `_TBC.toc` file sets through the same bundle mechanism, cached on disk per game and version.
- **Client profiles:**
  - Forever's stays.
  - TBC gets its own:
    - `GetBuildInfo` "2.5.6", 70577, interface 20506;
    - `WOW_PROJECT_BURNING_CRUSADE_CLASSIC`;
    - flavor from the TOC (`X-Flavor: TBC`);
    - client data generated from `wow_anniversary`;
    - no 12.0 APIs.
- **Addon contract and extractors** split into a common WeakAuras part and per-game parts. Musca-only internals (BlizzardAuraDisplay, secret conditions, packs) are Forever's.
- **Spell databases:** one per game (separate SQLite files), each with its own sync.
- **Storage:** workspaces are namespaced per game in IndexedDB and on the server. Existing data is deleted, with no migration and no redirects. The workspace file format records its game.
- **wago JSON** (shared module in the core, pure). The rules are in `wago-json.md`:
  - Packet: `{c?, d, m:"d", s, v}`, plus top-level `wagoID` when `d.wagoID` is set.
  - Key order: number-like keys numeric first, then the rest by UTF-16 code unit.
  - Tables:
    - number keys become strings;
    - tables keyed 1..n with n ≤ 1000 become arrays, null-padded where sparse;
    - any other number key forces an object;
    - empty tables become `[]`.
  - Numbers: `%.14g` with round-half-even; `-0` becomes `0`; NaN and inf become `null`.
  - Pretty output: 2-space indent, LF, no trailing newline.
  - JSON → aura uses wago's rebuild rules: number keys are restored only on wago's fixed paths (`triggers`, their `.multi` sets, `load.*.multi`), and numbers stay as given.
  - Boolean keys can't be represented: export refuses with a clear message.
- **Wago link import:** the server fetches `https://data.wago.io/api/raw/encoded?id=<id>` (and the JSON lookup if needed). It is the same import path as a pasted string.
- **Option ↔ table reference:** generated per game version in the addon VM.
  - For each option, the generator applies a probe edit through the option's own `set()` and records which document paths change. Each entry records the tab key, the option path and name, the JSON paths, the type (from the option's control), allowed values, the default from `NewAura` defaults, and the description.
  - The reverse index is built from the same data.
  - Served in the agent docs (Markdown) and as JSON (`/<game>/docs/agents/options.json`).
  - It is cached per game and version on the server.
- **Agent docs per game:** generated from that game's addon facts and reference. Writing wago JSON is the primary authoring path; the docs include worked examples as JSON.

## Testing Decisions

- Test external behaviour at the seams already in use: seam A (the aura core, Vitest) and seam B (the app from outside, Playwright).
- **wago JSON:**
  - Golden test with `LEPRolmHn`'s import string and wago's stored JSON (recorded fixtures): byte-identical output.
  - Unit tests for each rule in `wago-json.md`, including the untested edge cases (sparse tables, keys above 1000, `-0`, inf, the 1e14 rounding tie, boolean keys).
  - A round trip on wago's paths.
- **Option reference:** seam-A test that every option in every tab of every display type has an entry, and that an entry's paths are exactly what its `set()` changes. This reuses the tab-sweep helpers.
- **TBC:**
  - The core loads a recorded WeakAuras2 5.22.1 release zip fixture (no network in tests).
  - Encode and decode round-trip.
  - Every tab builds for every display type (tab sweep per game).
  - Validation follows the addon.
  - The spell database uses recorded `wow_anniversary` CSVs.
- **Games in e2e:** the picker, both sites, per-game workspaces, push per game, JSON export/import/drop, JSON tab edits, wago link import (recorded wago answer).
- Prior art: `src/core/options-sweep.test.ts`, `tests/e2e/tab-sweep.spec.ts`, `ADDON_UPSTREAM_FIXTURES`, the spell fixtures.

## Out of Scope

- Other Classic flavours (Era, Wrath/Titan, Cata, Mists), even though WeakAuras2's zip covers them.
- Branch or commit refs for either game.
- Migrating existing workspaces.
- Uploading to wago.io.
- Editing in-game auras (unchanged from v1).

## Further Notes

- The TBC client profile is unverified until the user imports the TBC v1 auras in game.
- Musca 1.15.0 is at internal version 92 and WeakAuras2 5.22.1 at 90. Story 7 makes the app behave exactly like each addon's import.
