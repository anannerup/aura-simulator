# 05: Remove dead code and unearned abstractions

**What to build:**
- **Delete dead code,** e.g. the unused Lua evaluator.
- **Apply "1, 2, many" with judgement:** one or two uses become concrete code unless duplicating is clearly worse. Start from the Codex review §5.
- **Extract the one real repeated policy** of the three catalog caches, and nothing more.
- **Type the addon's results at the boundary.**
- **Narrow the aura module's public surface.**
- **Remove forwarding wrappers and single-file barrels.**

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Each remaining abstraction has 3+ users or a written reason
- [ ] All tiers green
