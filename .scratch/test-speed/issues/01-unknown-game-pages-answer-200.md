# An unknown game's page answers 200 on a fresh production server

Status: needs-triage

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

## Test

The page half of the test is `test.fixme` in `tests/e2e/games.spec.ts` ("an unknown game's page answers 404"); turn it
back on with the fix.
