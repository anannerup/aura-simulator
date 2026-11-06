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
