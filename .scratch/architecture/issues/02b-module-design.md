# 02b: Module design before the layers (codebase-design, by Codex)

**What to build:** before step 03, Codex runs the `codebase-design` skill on Codex's target architecture in
`.scratch/codex-review.md`. It decides the modules inside each layer and their interfaces:
- deep modules (much behaviour behind a small interface);
- where each interface sits;
- an interface only where something actually varies.

It produces a design document in plain language: modules, their interfaces, what moves where, and which current
modules merge or disappear. The user approves it, and it goes into the spec before step 03 starts. Codex only
writes the design; it doesn't change code.

**Blocked by:** None (Codex reads main; it doesn't change code)

**Status:** in progress (Codex)

- [ ] Design document delivered
- [ ] Approved by the user
- [ ] Spec updated; step 03 implements it
