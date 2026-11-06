# 02: State code in the address, paste, browser storage

**What to build:** Paste any state code to load it. The page address always holds the current state code, so reload or sharing restores it. The workspace persists in browser storage.

**Blocked by:** 01

**Status:** done (address part replaced by files on 2026-11-06, see below)

- [x] Paste a state code -> preview shows it
- [x] ~~Address updates on every change; opening the address restores the aura~~ replaced: the address only names the workspace; auras travel as files
- [x] Workspace survives closing the tab (storage access guarded)
- [x] Browser test covers paste -> reload -> same aura

## Decision (2026-11-06): no state in the address, files instead

Auras have historically been megabytes, too big for any address (and short links, ticket 13, are gone too).

- Address: only `?w=<workspace id>` (absent = `default`), `src/workspace/address.ts`. Compatibility kept small: an old
  `?code=` link is imported once (merged like a push: same uid/id replaces, else added) and then stripped; an old
  `?s=` short link only gets a notice and is stripped.
- Files (`src/workspace/files.ts`): `exportAura(id)` downloads `<aura name>.txt` holding exactly the `!WA:2!` string
  (UTF-8, nothing else); `exportWorkspace()` downloads the v2 JSON; `importFiles(files)` takes any text with one or
  more `!WA:` strings (each added) and workspace `.json` (replaces an empty workspace, else returns it as `pending`
  for a replace/merge choice). Picked through "Import files" or dropped anywhere on the page (`useFileDrop`).
  `copyCode(id)` keeps the clipboard path for the game's import box. All exposed by `useWorkspace`.
- Storage: IndexedDB database `aura-simulator-workspaces`, store `workspaces`, key
  `aura-simulator:workspace:<id>`, value the v2 JSON string (`src/app/workspace/storage.ts`). A localStorage copy from
  earlier versions is moved over on first read and removed. Without IndexedDB it falls back to localStorage. Writes
  are latest-wins (one in flight); failures (quota, private mode) set the view's `warning`, shown but non-blocking.
- Restore order: newer of browser storage and the server's snapshot → (old `?code=` merged in) → the sample.
- Page logic: `src/app/workspace/` (`WorkspaceSession`, `useWorkspace`, `WorkspacePanel` as fallback UI); Workbench only mounts it.
