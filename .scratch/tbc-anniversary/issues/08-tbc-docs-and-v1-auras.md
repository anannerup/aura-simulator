# 08: TBC docs, worked examples and v1 auras

**What to build:** `/tbc/docs/agents` generated from WeakAuras2's facts and reference: plain rules, no combat restrictions, and worked examples as wago JSON. The four v1 auras are rebuilt for TBC on the regular Aura trigger:
- 1a: desaturated, shown under 3 minutes, glowing as it runs low;
- 1b: missing buff;
- 2: cooldown;
- 3: target debuff bar;
- 4: a group.

Write them as `.txt` and `.json` files in this folder, validated by the core.

**Blocked by:** 05, 06, 07

**Status:** ready-for-agent

- [ ] Docs served per game; a test pushes every example
- [ ] v1 TBC auras validate with no problems; files written
