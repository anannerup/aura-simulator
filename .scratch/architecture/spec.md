# Spec: a well-built aura simulator (layers, names, tests)

Status: ready-for-agent

Input: the Codex review `.scratch/codex-review.md` (gpt-6.1-sol, ultra, of main `bdad7a2`) and a grilling session with
the user (2026-11-07). The user is a backend engineer who doesn't read JavaScript; his words: "I want this to be a
beautifully written piece of software with appropriate layers in the selected language. Idiomatic, using business
language terms. Reduce the number of indirection calls. Abstractions must be earned: 1, 2, many."

## Problem Statement

The app works, but its code grew feature by feature through many parallel agents. Folders describe where code runs, not
what it is responsible for; nothing decides which part may use which, so dependencies run both ways (game definitions ↔
server code, drawing → game definitions). One use case (e.g. pushing an aura) is spread over four folders. Names describe
code mechanics (core, vm, glue, option reference, items-for-auras) instead of the product. Some abstractions have one or
two users. The test suite overstates its coverage: TBC tests silently skip and the run stays green, "every field" sweeps
don't check outcomes, tests lock down private details, and still four user-visible bugs got through (an edit landing on
the wrong aura, the editor freezing on a version switch, a failed push that already saved, an open page that stops
receiving pushes after a workspace reset).

## Solution

The same product, rebuilt in place, one step at a time, each step green and merged before the next:
1. Tests the user can trust.
2. The four bugs fixed.
3. Idiomatic layers for TypeScript/Next.js with dependencies flowing one way, enforced by the build.
4. Business-language names, agreed with the user.
5. Dead code and unearned abstractions removed.
6. The agent docs as small topic files behind a front file that works as a lookup table.
Afterwards Codex reviews again (read-only) and gives its verdict.

## User Stories

1. As the owner, I want a green test run to mean everything required was tested, so that I can trust "green".
2. As the owner, I want a missing or corrupt TBC fixture to fail the run instead of skipping TBC, so that a game never silently drops out of the tests.
3. As the owner, I want live checks against GitHub, wago and Wowhead to be a separate, explicit command, so that ordinary runs need no network.
4. As the owner, I want tests named "every …" to account for every case (assigned = tested + explained exemptions), so that coverage claims are true.
5. As the owner, I want the field sweeps to prove each edit reached the aura and the export, so that "every option works" means it.
6. As the owner, I want the browser tests to start a fresh server of the current code by default, so that a full run never tests an old build.
7. As the owner, I want picture tests to use recorded media and fail on unexpected outbound requests, so that they are deterministic.
8. As the owner, I want tests written as player and agent promises (what you see, what you can export), not as checks of private details, so that the suite reads as a specification and survives refactoring.
9. As a player, I want a quick edit in a tab to land on the aura I edited, even if I click another aura before it's saved, so that my auras don't change behind my back.
10. As a player, I want a push or undo during an edit not to be overwritten by that edit, so that the newest change wins.
11. As a player, I want switching the addon version mid-edit never to freeze the window, so that I can keep working.
12. As an agent, I want a failed push to leave the workspace unchanged (or to say plainly it was accepted without validation), so that I know what state the user sees.
13. As an agent, I want an open page to keep receiving my pushes after a workspace is deleted, reset or the server restarts, so that the user sees my work.
14. As a player, I want deleting the last aura to be undoable, so that I can recover it.
15. As a player, I want pushes from my page to be validated with the addon version I chose, and to see when publishing failed, so that "saved here" and "published for the agent" are not confused.
16. As a player, I want JSON Apply to run the same import check as every other import, so that an aura the game would refuse can't sneak in.
17. As a player, I want an aura imported as wago JSON to stay byte-identical to wago's until I change it, so that its JSON matches wago's.
18. As the owner, I want the code arranged in layers idiomatic for TypeScript/Next.js (plain modules and functions, not Java-style classes), with calls going only downward, so that I can tell what may depend on what.
19. As the owner, I want the build to fail when a module breaks the dependency direction, so that the architecture can't drift again.
20. As the owner, I want each use case (push an aura, set the situation, build the docs, take a picture, refresh spells) to live in one place, so that I can read it start to finish.
21. As the owner, I want the routes only to translate HTTP to a use case and back, so that business decisions aren't in the web layer.
22. As the owner, I want the game definitions (Forever, TBC) to be plain descriptions, with the server assembled separately, so that games don't depend on server code and vice versa.
23. As the owner, I want the drawing code to be handed the selected game's textures and fonts, never to pick a game itself, so that drawing doesn't reach upward.
24. As the owner, I want the page's features out of the routes folder, so that the routes folder holds only routes and the page composition.
25. As the owner, I want fewer pass-through layers between a request and the work, so that a flow can be followed in a few hops.
26. As the owner, I want names in business language a WeakAuras player recognises, so that the model makes sense to someone who doesn't code.
27. As the owner, I want to approve the vocabulary before code is renamed, so that the words are mine.
28. As the owner, I want "items" to mean game items only (workspaces hold auras), so that one word means one thing.
29. As the owner, I want the aura module called `auras`, the fake game answers called the "simulated game", the setting-to-table lookup called the "table map", and the things in a tab called "options", so that names match what I decided.
30. As the owner, I want dead code deleted and abstractions used in only one or two places written concretely (with judgement where duplication is clearly worse), so that every abstraction is earned.
31. As the owner, I want the three catalog caches (spells, items, game files) to share their one real repeated policy and nothing more, so that real repetition is removed without a framework.
32. As the owner, I want the addon's results typed at the boundary, so that the rest of the code doesn't guess at shapes.
33. As an agent, I want the agent docs as a short front file that works as a lookup table, pointing to small topic files, so that I read only what I need and keep my context small.
34. As an agent, I want each game's docs to keep the requested addon version in every link, so that I never land on another version's docs.
35. As the owner, I want old saved workspaces dropped rather than converted, so that no conversion code lingers.
36. As the owner, I want Codex to review the result read-only and give a verdict, so that I get an independent judgement.

## Implementation Decisions

- **Order and pace (user):** tests first, then the four bugs, then layers, then names, then cleanup, then the docs split.
  Strictly one step at a time; each step passes typecheck, lint and `npm run test:all` and is merged before the next.
- **Layers (user: "whatever is idiomatic for the language"):** Codex's target, as plain modules and functions:
  - server: HTTP routes (translate only) → application operations (one per use case; own sequencing and side effects)
    → domain (auras, workspaces, games, situation rules; no HTTP, database, React or Next) and storage/upstream access
    (may depend on domain types, never on routes, pages or operations) → the addon's Lua as a private detail behind one
    aura-facing boundary;
  - browser: page composition → window / game screen / picture features → workspace operations → domain, plus browser
    storage and HTTP connections; drawing receives game-specific resources;
  - composition is explicit (one server composition, one browser composition); game definitions are pure.
- **Enforcement:** import-direction rules in lint, checking resolved imports (relative too); Node-only entry modules
  marked server-only; runtime cycles checked separately from type-only ones. Existing violations start in a baseline that
  only shrinks; new ones fail immediately.
- **Abstractions (user: "1, 2, many, with judgement"):** one or two uses → concrete code, unless duplicating is clearly
  worse; three or more → one shared piece. Codex's list is the starting point (e.g. one-use generics, single-file
  barrels, the unused upcoming-games model, dead Lua); keep what Codex shows earning its place (e.g. id-list parsing,
  atomic writes, region drawing).
- **Vocabulary (user decisions):** module `auras`; "simulated game" for the fake game answers; "table map" for the
  setting ↔ table-key lookup; "option" stays for a thing set in a tab; workspaces hold "auras" (not items). Every other
  rename comes from a vocabulary proposal the user approves first, then goes into the glossary, then into code, routes
  and docs together.
- **Data:** the workspace file and browser storage change format; old saved workspaces are dropped, no conversion.
- **Agent docs:** one front file per game that is a lookup table of topics with one-line descriptions, linking to small
  topic files (workflow, wago JSON, triggers, conditions, situation and preview, pictures and compare, media and items,
  push API, troubleshooting) and to the table map parts. `/<game>/llms.txt` is that front file (the name agents look for);
  the HTML docs page renders the same set. Every link carries the requested addon version.
- **Bugs:** edits are bound to the aura, top-level aura and document generation they came from; disposing the addon
  rejects all pending requests and invalidates the editing generation; pushes and situation changes commit only after
  they succeed (or answer "accepted, validation unavailable"); the live stream has an identity/epoch so resets and
  restarts aren't mistaken for old events; an empty workspace is a real undo step.

## Testing Decisions

- **Good tests** check what a player or agent can observe (the aura, the export, the window, the HTTP answer, the
  picture), never private details; they read as promises about the product.
- **Seam A (in memory):** given an addon release, an aura and a situation: import acceptance, defaults, warnings, import
  strings, wago JSON, options and edits, what the preview shows. Exhaustive addon compatibility lives here: every option
  and table-map entry accounted for, the recorded real packs, pinned mirrored addon files.
- **Seam B (from outside):** HTTP (accepted/refused pushes, release selection, ordering, live notices, reset and restart,
  docs, catalog searches) and the browser (complete player stories ending in something visible or exported), plus a
  bounded set of deterministic pictures with fixed time and recorded media.
- **Outside the ordinary run:** live upstream checks (explicit command) and the user's in-game checks.
- Fixtures are provisioned and checksummed before the run; required suites fail when they're missing. No silent skips.
- Keep the speed tiers: `npm test` (fast), `npm run test:e2e` (representative browser/HTTP), `npm run test:all`
  (everything, exhaustive, no unexplained skips).
- Prior art: the wago golden tests, the real TBC packs, the multi-version Forever tests, the production e2e server, the
  sharded exhaustive suites and the generated-cache keyed by source.

## Out of Scope

- New product features (beyond fixing the listed bugs).
- Running custom Lua in the preview (the user chose option A).
- Converting old saved workspaces.
- Codex writing code (Codex only reviews).

## Further Notes

- The round-3 screenshot fixes (compare per element, icon search zoom, texture search, docs) land before step 1.
- After the refactor, the screenshot test continues (round 4 on TBC, then Forever) as an end-to-end check that nothing broke.
- Both in-game tickets stay `ready-for-human`.
