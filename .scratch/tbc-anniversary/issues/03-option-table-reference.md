# 03: Option ↔ table reference in the agent docs

**What to build:** in the addon VM, generate a reference for an addon version.

For each tab key and display type, every option gets an entry:
- option path and name;
- the exact document (JSON) paths its `set()` writes, found by probe edits as in the tab sweep;
- type and control;
- allowed values;
- the default (from the addon's NewAura defaults);
- the description text.

Triggers are covered per trigger type and event subtype, and so are sub-elements and conditions.

Also build the reverse index (JSON path → options), and expose both from the aura core.

Serve it in the agent docs: a Markdown section (both directions) and `options.json` next to the docs, cached per version on the server.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Core API returns the reference and reverse index for the loaded version
- [x] Test: every option of every tab for every display type has an entry, and its paths equal exactly what its `set()` changes
- [x] Docs page and `options.json` show the reference for the requested version; e2e checks a known option ↔ path pair
- [x] Generation time is acceptable for serving (cache per version on the server)

Notes (implementation):
- `core.optionReference()` (`src/core/addon-vm/option-reference.ts`, path form documented there). Seam A, inline:
  Forever v1.15.0 3983 entries in ~74 s, TBC WeakAuras2 5.22.1 3844 entries in ~51 s (~2 MB JSON each). On the
  server it runs in the background (`{ background: true }`: half the thread, about two to three minutes), one
  generation at a time.
- The server caches it per game and release in memory and on disk, in the game's addon source cache
  (`<ref>/option-reference-v<format>.json`; `src/server/option-reference.ts`). Served at
  `/<game>/docs/agents/options.json` and `options.md` for both games.
- Paths are wago JSON keys (a table with only number keys is a JSON array, n its n-th element; otherwise n is the
  key `"n"`); the reference's `lists` names the tables that always are arrays, and the test checks every replayed
  path against the aura's wago JSON.
- Both games' docs carry a short section (path rules, generated examples in both directions with their wago JSON,
  links); the whole reference in both directions is Markdown at `options.md` (~640 KB, too big for the main docs
  agents read whole). `src/games/docs/option-reference.ts` renders both for any game.
- Edits start from the document as given: after a tab was evaluated (its get()s can write defaults into the VM's
  copy), the next edit loads the document again.
