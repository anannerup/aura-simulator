# 13: Short links

**What to build:** The server stores state codes too long for an address under a short ID; opening the short link restores the aura.

**Blocked by:** 02, 03

**Status:** wontfix (built, then removed on 2026-11-06)

- [x] Long codes get a short link automatically
- [x] Short link restores the exact state code
- [x] Stored in SQLite

## Decision (2026-11-06): no links, files instead

The player: "some of these weak auras, at least historically, have been MB of payloads. I think import and export as
files is best. So no linking." Short links were removed with everything that used them:

- Gone: `POST /api/short-links`, `GET /api/short-links/<id>`, the SQLite store (`src/server/workspaces/short-links.ts`,
  `data/workspaces.sqlite`, `WORKSPACE_DB_PATH`), bundles (`encodeBundle`/`parseBundle`), the page's `?s=` handling and
  the push answer's short-link `url` (it is now the `?w=` page URL). Nothing else needed them.
- An old `?s=` link only shows a notice ("Short links are no longer supported") and is stripped from the address.
- Instead: aura `.txt` files (exactly one state code) and workspace `.json` files, imported by picking or dropping
  them; see ticket 02's notes and `src/workspace/files.ts`.
