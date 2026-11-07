# 02: Paste, browser storage (the address part was replaced by files)

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
  `?code=` link is imported once (merged like a push: same uid/id replaces, else added) and then stripped; every
  other parameter (an old `?s=` short link included) is dropped silently (the notice was removed on 2026-11-07).
- Files (`src/workspace/files.ts`, applied by `WorkspaceSession`): `auraFile(id)` is `<aura name>.txt` holding exactly
  the `!WA:2!` string (UTF-8, nothing else); `workspaceFile()` the v2 JSON; `importFiles(files)` takes any text with
  one or more `!WA:` strings (each added) and workspace `.json` (replaces an empty workspace, else returns it as
  `pending` for `applyWorkspaceFile(file, "replace" | "merge")`). Picked in the Import dialog or dropped anywhere on
  the window (the app shell's `onDropFiles`). The Export dialog saves the file or copies the code for the game.
- Storage: IndexedDB database `aura-simulator-workspaces`, store `workspaces`, key
  `aura-simulator:workspace:<id>`, value the v2 JSON string (`src/client/workspace/storage.ts`). A localStorage copy from
  earlier versions is moved over on first read and removed. Without IndexedDB it falls back to localStorage. Writes
  are latest-wins (one in flight); failures (quota, private mode) set the view's `warning`, shown but non-blocking.
- Restore order (`chooseRestore`, `src/workspace/restore.ts`): browser storage, with the server's latest push merged
  in when it is newer → (old `?code=` merged in) → the sample.
- Page logic: `src/client/workspace/` (`WorkspaceSession`, `useWorkspace`); Workbench only wires it.
