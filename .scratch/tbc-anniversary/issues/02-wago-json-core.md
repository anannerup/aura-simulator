# 02: wago JSON in the core

**What to build:** a pure, shared core module that converts both ways:
- **Aura → wago JSON:** a decoded aura (aura + children + addon version) becomes wago.io's JSON, byte-identical to wago's (pretty editor form and compact form).
- **wago JSON → aura:** uses wago's own rebuild rules.

All rules are in `../wago-json.md` (with a reference port). It covers:
- top-level `wagoID`;
- key order;
- arrays, null padding and the 1000 limit;
- `[]` for empty tables;
- `%.14g` round-half-even numbers;
- fixed number-key paths on the way back;
- refusing boolean keys.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Golden test: https://wago.io/LEPRolmHn's import string → JSON equal byte for byte to wago's stored JSON (recorded fixtures, pretty and compact)
- [ ] Unit tests for every rule, including the sparse tables, keys above 1000, `-0`, inf, the 1e14 tie and the boolean-key refusal
- [ ] JSON → aura → import string equals what wago would rebuild for that JSON (wago's paths)
