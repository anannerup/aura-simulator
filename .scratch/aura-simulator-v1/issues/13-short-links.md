# 13: Short links

**What to build:** The server stores state codes too long for an address under a short ID; opening the short link restores the aura.

**Blocked by:** 02, 03

**Status:** done

- [x] Long codes get a short link automatically
- [x] Short link restores the exact state code
- [x] Stored in SQLite

## Done

- `POST /api/short-links` `{code}` → `{id, url}`; `GET /api/short-links/<id>` → `{id, code}` (404 unknown).
- SQLite `data/workspaces.sqlite` (`WORKSPACE_DB_PATH`), table `short_links`. IDs: 8 base62 chars of the code's SHA-256,
  so the same code always gets the same ID (lengthened only on collision).
- The page and the push API's `url` switch to `?s=` automatically when the encoded code is over 1800 chars.
