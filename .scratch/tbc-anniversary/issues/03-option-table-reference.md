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
- `core.optionReference()` (`src/core/addon-vm/option-reference.ts`, path form documented there). About a minute
  for v1.15.0 (~4000 entries, ~2 MB JSON); on the server it runs in the background (`{ background: true }`: half the
  thread, about two minutes) so other requests stay fast.
- The server caches it per game and resolved ref in memory and on disk, in the game's addon source cache
  (`<ref>/option-reference-v<format>.json`; `src/server/option-reference.ts`).
- Paths are wago JSON keys; the reference's `arrays` lists the tables that are JSON arrays, and the test checks every
  replayed path against the aura's wago JSON.
- The main docs carry a short section (path rules, generated examples in both directions with their wago JSON,
  links); the whole reference in both directions is Markdown at `/<game>/docs/agents/options.md` (~640 KB, too big
  for the main docs agents read whole) and JSON at `/<game>/docs/agents/options.json`
  (`src/games/option-reference-docs.ts` renders both for any game). TBC gets its routes once it has a `ServerGame`
  (ticket 04); its reference is generated and tested at seam A already.
- Edits now always start from the document as given: evaluating a tab marks the VM's copy stale (its get()s can
  write defaults into it), so the next call reloads the document.
