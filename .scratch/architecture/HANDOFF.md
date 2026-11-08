# Handoff: the architecture refactor (2026-11-08)

Read this, then `.scratch/architecture/spec.md` and the tickets in `.scratch/architecture/issues/`.

## How we work

- **Agents implement** each ticket in their own git worktree, one ticket at a time, never two on the same code.
- **Codex reviews:** the coordinator doesn't review code. Codex reviews every step read-only with the `code-review`
  skill (`codex exec -m gpt-6.1-sol -c model_reasoning_effort=max -s read-only ... < /dev/null`; without `< /dev/null` it waits on stdin forever. Use `codex --search exec` when it
  needs the web). A step is merged only when Codex has no must-fix findings.
- **Merging:** done in a separate worktree, with `npm run fixtures`, typecheck, lint and `npm run test:all` green. Then
  main fast-forwards and is pushed.
- **The user's server** on :3000 is a production build of main (`npx next build && npx next start -p 3000`), rebuilt
  after each merge. `next dev` in the main checkout causes a reload loop while agents work.
- **Rules:** `AGENTS.md` (Naming, Writing tests) and `~/.config/agents/AGENTS.md` (Code, Tests).
- **Talking to the user:** short, plain words, no jargon, and no mapping of things onto models he already knows.
  Decide what's yours to decide; ask only what's his.

## Where things stand

- **Step 01 (trustworthy tests):** done on branch `worktree-agent-a25f2ce5d1dadaac9`, not merged. Codex is reviewing
  it. The prompt is `.scratch/architecture/codex/codex-step01-brief.md`, the report goes to `/tmp/claude-1000/-home-anders/bc5ded01-b4ca-49bf-9444-74401bf48283/scratchpad/codex-step01-report.md`.
- **Step 02b (module design):** Codex is researching how Next.js/React/TypeScript apps are idiomatically structured
  (framework docs, reputable GitHub repos, blogs; nothing prescribed), then designing the modules with
  `codebase-design`. Output: `/tmp/claude-1000/-home-anders/bc5ded01-b4ca-49bf-9444-74401bf48283/scratchpad/codex-design.md` (brief: `.scratch/architecture/codex/codex-design-brief.md`). It goes to the user for approval, then into the spec
  as `.scratch/architecture/design.md`. If the research says Next.js is the wrong fit, bring that to the user first.
- **Next:** merge 01 after Codex approves; then 02 (the bugs, including the ones step 01 found: intermittent Lua heap
  corruption on Merfin's T5 pack, wago JSON not byte-identical, item fields always "invalid", Lua errors from the
  frame-chooser buttons), 02b approval, 03 layers, 04 names (the user approves the vocabulary first), 05 cleanup,
  06 agent docs split, 07 Codex re-review.
- **The screenshot test** (rebuild wago `6N_i-H6uI` from its picture; protocol in
  `.scratch/architecture/codex/PROTOCOL.md`) resumes after the refactor: two passing rounds on TBC, then on Forever.

Both Codex runs were started by the previous session; their reports land in the files above when they finish
(check the file exists and is non-empty, or rerun the brief with the command above).
