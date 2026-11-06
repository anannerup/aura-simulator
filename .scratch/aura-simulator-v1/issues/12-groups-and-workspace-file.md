# 12: Several auras, groups and workspace file

**What to build:** A tree of auras, groups and dynamic groups, drawn with their layouts. Export one aura's or a group's state code; export/import the whole workspace as JSON (spell and icon IDs only).

**Blocked by:** 02

**Status:** ready-for-human (in-game check of a group import left)

- [x] Workspace tree with add/remove/nest
- [x] Group and dynamic group layouts drawn
- [ ] Group state code imports in game as a group (encoded like Private.DisplayToString, v2000 with sub groups; needs the in-game check)
- [x] Workspace JSON export and import round trip
- [ ] Completes v1 aura 4 (in game, with ticket 17)

## Notes

- Model: `src/workspace/tree.ts` (pure operations; ids unique, `controlledChildren`/`parent` derived from the
  tree). Formats: `src/workspace/workspace.ts` (v2 file/storage, v1 migrated by decoding), `src/workspace/address.ts`
  (bundles). Layout: `src/render/group/` (grow.ts, layout.ts, WorkspaceStage.tsx). Tree UI:
  `src/components/workspace-tree/`. Page sync: `src/app/workspace/session.ts`.
- Address: a one-item workspace stays `?code=`; several items are `?s=` pointing at a bundle (each top-level item's
  code, one per line), so every line is still a code the game imports.
- Pushes merge into the top level (same uid, else same id, replaces; otherwise appended).
- Approximations: modern aura groups (`blizzardFlow`) chain icons/bars without native containers; anchor-per-unit,
  custom grow/sort and text-region measured sizes are not simulated; time-based sorts fall back to index order.
