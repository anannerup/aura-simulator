# 03: Agents push auras; first agent docs

**What to build:** An HTTP endpoint accepts an aura document or state code for a workspace; open pages on that workspace update live. An agent docs page documents the document format and the endpoint.

**Blocked by:** 01

**Status:** done

- [x] POST endpoint accepts document or state code, returns state code
- [x] Open page updates live after a push
- [x] Agent docs page explains document, state code, endpoint with a curl example
- [x] HTTP + browser test: push -> page shows it

## Done

- `POST /api/workspaces/<id>/aura` with `{code}`, `{aura, children?}` or a bare state code → `{workspace, code, url, updatedAt, revision}`;
  400/413/422/503 `{error}`. Validated/encoded by the aura core in Node (`src/server/workspaces/aura-core.ts`, addon files cached in `.cache/addon/<ref>/`).
- `GET /api/workspaces/<id>` → `{id, code, updatedAt, revision, url}`; `GET /api/workspaces/<id>/events` → SSE (`snapshot` on connect, `state` on change).
- Workspace state on the server is in memory (spec: no server-side workspace storage); pages post their own changes so agents can read them.
- 2026-11-06 (no links, MB auras): push bodies up to 32 MB, read as a stream with an early 413; `url` in answers is
  the `?w=` page; `?validate=false` skips validation. SSE events are notices `{id, revision, updatedAt, source}`
  without the code; pages fetch `GET /api/workspaces/<id>?revision=<n>` (the hub keeps the last 8 revisions, capped
  at 256 MB in total). Pages tag their own pushes with `X-Aura-Client` so they skip their own echo.
- Pages follow `?w=<id>`, else `default`. Docs: `/docs/agents` (rendered), `/llms.txt` and `/docs/agents.md` (Markdown),
  one source in `src/docs/agent-docs.ts`; the sample and its state code come from the loaded addon.
