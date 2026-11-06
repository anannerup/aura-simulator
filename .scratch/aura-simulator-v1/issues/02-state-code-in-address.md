# 02: State code in the address, paste, browser storage

**What to build:** Paste any state code to load it. The page address always holds the current state code, so reload or sharing restores it. The workspace persists in browser storage.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Paste a state code -> preview shows it
- [ ] Address updates on every change; opening the address restores the aura
- [ ] Workspace survives closing the tab (storage access guarded)
- [ ] Browser test covers paste -> reload -> same aura
