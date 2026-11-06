# 04: Addon version picker

**What to build:** Pick the Musca Auras version (releases listed via jsDelivr, newest default) or enter a branch/commit. The server caches fetched addon source. Switching shows what changed in the options.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Version list from jsDelivr, newest release default, tag prefix normalised
- [ ] Branch/commit entry works
- [ ] Server caches addon files per version
- [ ] Switching version reports changed options; load failures show a clear error
- [ ] Aura core tests run against two real versions
