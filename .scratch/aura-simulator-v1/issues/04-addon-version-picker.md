# 04: Addon version picker

**What to build:** Pick the Musca Auras version (releases listed via jsDelivr, newest default) or enter a branch/commit. The server caches fetched addon source. Switching shows what changed in the options.

**Blocked by:** 01

**Status:** done

- [x] Version list from jsDelivr, newest release default, tag prefix normalised
- [x] Branch/commit entry works
- [x] Server caches addon files per version
- [x] Switching version reports changed options; load failures show a clear error
- [x] Aura core tests run against two real versions

## Notes (implementation)

- Server: `src/server/addon/` (refs, remote sources, disk cache in `data/addon/<version or sha>/`, the server's aura
  core per resolved ref (`core.ts`), diff). Routes: `/api/addon/versions`, `/api/addon/resolve?ref=`,
  `/api/addon/<ref>/file?path=` (also `/api/addon/<ref>/files/<path>`), `/api/addon/diff?from=&to=`. UI:
  `src/app/_addon/`. Wire types: `src/api/addon.ts`.
- Tag names: jsDelivr normalizes them (`1.15.0`); the real tags are `v1.15.0`, `1.13.0`, `1.15.0-beta2`,
  `v1.15.0-beta1`. GitHub's tag list maps them back (saved on disk as a rate-limit fallback).
- The "what changed" diff compares each version's region and sub-region `default` tables and condition
  `properties` from the aura core's `registries()` (the addon's own, in the full addon VM), plus file lists (GitHub
  tree; jsDelivr's flat listing stops at 1000 files) and new CHANGELOG sections. Versions whose full addon VM doesn't
  load (v1.10.0 and older: their .toc names files the repo lacks) still get the file and changelog diff, with a note
  that their options couldn't be read.
