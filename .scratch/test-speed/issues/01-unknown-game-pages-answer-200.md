# An unknown game's page answers 200 on a fresh production server

Status: resolved

Found while moving the e2e tests to a production build (`next build` + `next start`, as the user's server runs).

## What happens

On a freshly started production server, `GET /llms.txt` and `GET /classic` (any first segment that isn't a game)
answer **200** (the prerendered shell, with a `noindex` tag). Once such a page has been rendered once, the same
requests answer 404. `next dev` always answers 404, so the e2e test "the old unscoped routes are gone, and unknown games
are not found" passed against the dev server.

Reproduce: `npx next build`, start it with the e2e environment, request `/llms.txt` twice concurrently right after
start (first answers 200), then again (404).

## Why

`src/app/[game]/layout.tsx` calls `notFound()` for unknown ids, but with Cache Components and Partial Prefetching the
response starts streaming from the shell before `notFound()` runs, so it keeps its 200 status
(`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/not-found.md`, "Calling notFound() after streaming
has started"). `dynamicParams = false` is not available with Cache Components; the docs point to a request-time check
in Proxy (`proxy.ts`).

Not only the game page: `/classic/docs/agents`, `/classic/fonts` and `/classic/render` answered 200 too (and rendered
with no game: "Cannot read properties of undefined (reading 'agentDocs')" in the server log).

## Fix

- `src/app/[game]/page.tsx` is fully prerendered for every game (`ensureStatic = "navigation"`): a request for an id
  `generateStaticParams` doesn't list waits for its render, so the layout's `notFound()` answers 404.
- The request-time pages under `[game]` (agent docs, fonts, render) can't be static; `src/proxy.ts` answers 404 for them
  before they render. `tests/unit/proxy.test.ts` checks that its matcher lists every such page.
- `tests/e2e/games.spec.ts` checks all of them on the fresh e2e server (a production build).
