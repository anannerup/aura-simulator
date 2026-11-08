# Handoff: the architecture refactor (2026-11-08)

Read this, then `.scratch/architecture/design.md` (approved), `.scratch/architecture/spec.md` and the tickets in
`.scratch/architecture/issues/`.

## How we work

- **The process** is in `~/.config/agents/AGENTS.md` ("How we build"): goal → grill → research → prototype → spec →
  design → tickets → build → review per ticket → verify → retro. The user invokes each step himself. When a step is
  done, name the next one and wait.
- **Agents implement** tickets in their own git worktrees. Tickets may run in parallel when they don't touch the same
  code.
- **Codex reviews:** the coordinator doesn't review code. Codex reviews every ticket read-only with the `code-review`
  skill: `codex exec -m gpt-6.1-sol -c model_reasoning_effort=max -s read-only -C <worktree> -o <report> "<brief>" <
  /dev/null`. Without `< /dev/null` it waits on stdin forever; check that the log grows after starting. Use
  `codex --search exec` (flag before `exec`) when it needs the web. A ticket is merged only when Codex has no must-fix
  findings. Codex has a usage limit; on "You've hit your usage limit … try again at HH:MM", wait and rerun.
- **Merging:** done in a separate worktree, with `npm run fixtures`, typecheck, lint and `npm run test:all` green. Then
  main fast-forwards and is pushed.
- **The user's server** on :3000 is a production build of main (`npx next build && npx next start -p 3000`), rebuilt
  after each merge. `next dev` in the main checkout causes a reload loop while agents work.
- **Rules:** `AGENTS.md` (Naming, Writing tests) and `~/.config/agents/AGENTS.md` (Code, Tests, How we build).
- **Talking to the user:** short, plain words, no jargon, and no mapping of things onto models he already knows.
  Decide what's yours to decide; ask only what's his. Recommend only from real knowledge; otherwise propose how to
  find out.
- **Committing:** commit only the files of the current change (never `git commit -a` in a repo with the user's own
  uncommitted work).

## Where things stand

- **Design: approved.** `.scratch/architecture/design.md` is Codex's design (`design-proposal.md`) compared with an
  independent Opus design (`design-proposal-opus.md`). They largely agree. The user chose:
  - game data as three modules (`spells`, `items`, `game-files`), as Codex;
  - three call levels (pages and routes → operations → rules and storage), as Codex;
  - enforcement with the installed ESLint import rules, `server-only`/`client-only` and bulk suppressions, as Opus;
  - generic controls in `ui`, as Codex.
- **Next step: tickets** (`/to-tickets`, the user starts it). Adjust tickets 02–07 in `.scratch/architecture/issues/`
  to the approved design and its six-step order.
- **Step 01 (trustworthy tests):** done on branch `worktree-agent-a25f2ce5d1dadaac9`, not merged. Codex's review hit
  the usage limit before it finished; rerun it after the limit resets with the brief
  `.scratch/architecture/codex/codex-step01-brief.md` in that worktree (fixed point `main`).
- **Bugs step 01 found** (for the bugs ticket): intermittent Lua heap corruption on Merfin's T5 pack, wago JSON not
  byte-identical after import, item fields always "invalid" (the simulated game knows no items), Lua errors from the
  frame-chooser buttons. Plus Codex's four: an edit landing on the wrong aura, the editor freezing on a version switch,
  a failed push that already saved, an open page that stops receiving pushes after a reset.
- **Naming round** (with the vocabulary step): "seam" goes; say "integration tests" (the aura logic called directly)
  and "end-to-end tests" (HTTP and the browser). "option reference" becomes "table map".
- **The screenshot test** (rebuild wago `6N_i-H6uI` from its picture; protocol in
  `.scratch/architecture/codex/PROTOCOL.md`) resumes after the refactor: two passing rounds on TBC, then on Forever.
