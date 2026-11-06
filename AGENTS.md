# Aura Simulator

A Next.js web app for building auras for Musca Auras (the WeakAuras fork for WoW Forever):
an agent or the user describes an aura, the app previews it the way the game draws it, and
the user exports the import string and imports it in the game. See
`.scratch/aura-simulator-v1/spec.md`.

## Agent skills

### Issue tracker

Issues and specs are local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root (created when needed). See `docs/agents/domain.md`.

## Layout and conventions

Parallel agents work on this repo; keep to these boundaries so work merges cleanly.

- `src/core/`: the **aura core** (spec seam A). Loads an addon version's Lua in wasmoon-lua5.1,
  encodes/decodes state codes, fills defaults, validates. No React, no DOM. Runs in browser and Node.
  Import it via `@/core` only. The aura document (a Lua table as JSON: arrays for sequences, `"[1]"`-style keys
  for number/boolean keys) is defined in `src/core/lua-value.ts`; core tests cache addon files in `.cache/` (gitignored).
- `src/render/`: hand-written renderers (React components + CSS) per region and sub-region type.
  Pure props in (aura document + situation), nothing fetched inside except textures via `src/render/textures`.
- `src/server/`: server-only code (SQLite via built-in `node:sqlite`, wago/Wowhead sync, addon source cache).
  Database file lives in `/data/` (gitignored).
- `src/workspace/`: the workspace model (`tree.ts`: top-level items, groups nest; pure operations keep ids unique and
  `controlledChildren`/`parent` in step), its storage/file format (`workspace.ts`, v2 JSON; v1 still read) and the page
  address format (`?code=`, `?s=`, `?w=`; several items are a short link to a bundle of codes).
  Group layout maths (Group.lua/DynamicGroup.lua ports) and the all-items stage are in `src/render/group/`.
  Pure, shared by page and server. The page's restore/sync logic is in `src/app/workspace/`; push API, SSE hub,
  short links (SQLite) and the server-side aura core are in `src/server/workspaces/`.
- `src/docs/`: the agent docs (one Markdown source, served at `/docs/agents`, `/llms.txt`, `/docs/agents.md`).
  Update it when an API or format changes.
- `src/app/`: Next.js routes and pages. Thin; delegates to the modules above.
- Tests: unit/seam A with Vitest (`npm test`), browser/HTTP seam B with Playwright (`npm run test:e2e`,
  `E2E_PORT` picks the port so parallel worktrees don't clash). Network-dependent tests use recorded
  fixtures in `tests/fixtures/`.
- Musca Auras source: GitHub `dldvlpr-addons-wow/Musca-Auras`, per file via
  `https://cdn.jsdelivr.net/gh/dldvlpr-addons-wow/Musca-Auras@<ref>/<path>`. A local install of v1.15.0 is at
  `~/Games/battlenet/drive_c/Program Files (x86)/World of Warcraft/_forever_/Interface/AddOns/WeakAuras*` (read only).
- Ticket files: `.scratch/aura-simulator-v1/issues/`. Tick acceptance boxes and set `Status:` when done.
- Blizzard art (icons, glow textures) is fetched at runtime and never committed.
<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
