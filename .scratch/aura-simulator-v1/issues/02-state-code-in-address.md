# 02: State code in the address, paste, browser storage

**What to build:** Paste any state code to load it. The page address always holds the current state code, so reload or sharing restores it. The workspace persists in browser storage.

**Blocked by:** 01

**Status:** done

- [x] Paste a state code -> preview shows it
- [x] Address updates on every change; opening the address restores the aura
- [x] Workspace survives closing the tab (storage access guarded)
- [x] Browser test covers paste -> reload -> same aura

## Done

- Address: `/?code=<state code>` (`(`/`)` percent-encoded, `!`/`:` literal), `/?s=<short id>` when the encoded code
  is over 1800 chars (ticket 13), optional `w=<workspace id>` (absent = `default`). Helpers: `src/workspace/address.ts`.
- Restore order: address (`code`, else `s`) → newer of browser storage and the server's snapshot → the sample.
- Storage: `localStorage["aura-simulator:workspace:<id>"]` = `{format: "aura-simulator/workspace", version: 1, updatedAt, items: [{code}]}`.
  `items` is a list so ticket 12 can hold several auras/groups; a group's nesting lives in its state code.
- Page logic: `src/app/workspace/` (`WorkspaceSession`, `useWorkspace`, `WorkspacePanel`); Workbench only mounts it.
