# 01: Games: picker, Forever as its own site, tags only

**What to build:** `/` becomes the game picker (every visit). Today's app moves to `/forever` as the first game, with no other behaviour change:
- docs at `/forever/docs/agents` and `/forever/llms.txt`;
- push API at `/api/forever/...`;
- workspaces namespaced per game in IndexedDB and on the server;
- the workspace file records its game and is renamed `.aura-workspace.json`.

The other changes:
- Delete the old unscoped routes and existing data, with no redirects.
- The version picker offers only released tags (Musca's branch and commit refs are removed).
- Introduce "game" in GLOSSARY.md.
- Per-game things (addon source, client profile, spell DB, rules, docs, examples, fixtures) live in a per-game place. Only true shared concepts are shared (spec: abstraction rule).
- `/tbc` shows "coming soon" in the picker until ticket 04.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `/` shows the picker; picking Forever opens `/forever`; the title leads back to the picker
- [x] All existing features work under `/forever`, and all tests pass on the new routes
- [x] Old routes are gone; storage keys and server workspaces are per game
- [x] Version picker lists tags only
- [x] GLOSSARY.md and AGENTS.md describe games and where per-game code lives
