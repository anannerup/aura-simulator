# 02: Export an aura as wago JSON

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

Then the window's Export offers the `.json` next to the `.txt` (both for the selected aura), in wago's editor form.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Golden test: https://wago.io/LEPRolmHn's import string → JSON equal byte for byte to wago's stored JSON (recorded fixtures, pretty and compact)
- [x] Unit tests for every rule, including the sparse tables, keys above 1000, `-0`, inf, the 1e14 tie and the boolean-key refusal
- [x] e2e: Export downloads a `.json` equal to the converter's pretty output
- [x] JSON → aura → import string equals what wago would rebuild for that JSON (wago's paths)
