# 08: TBC docs, worked examples and v1 auras

**What to build:** `/tbc/docs/agents` generated from WeakAuras2's facts and reference: plain rules, no combat restrictions, and worked examples as wago JSON. The four v1 auras are rebuilt for TBC on the regular Aura trigger:
- 1a: desaturated, shown under 3 minutes, glowing as it runs low;
- 1b: missing buff;
- 2: cooldown;
- 3: target debuff bar;
- 4: a group.

Write them as `.txt` and `.json` files in this folder, validated by the core.

**Blocked by:** 03, 05, 06, 07

**Status:** done

- [x] Docs served per game; a test pushes every example
- [x] v1 TBC auras validate with no problems; files written

## Notes

- The v1 auras are `src/games/tbc/examples.ts` (`TBC_V1_AURAS`), written to `.scratch/tbc-anniversary/v1-auras/`
  (`.txt` import strings, `.json` wago JSON, a README for the in-game check, ticket 09). Spells: Arcane Intellect and
  Arcane Brilliance by name (every rank), Fire Blast 27079 (rank 9; a mage spell, as Forever's v1 used), Corruption by
  name, own casts only. `tests/unit/tbc-v1-auras.test.ts` validates them with WeakAuras 5.22.1 (no errors, no
  warnings), checks their behaviour in situations, and checks the files (`WRITE_V1_AURAS=1` rewrites them).
- `tests/e2e/agent-docs.spec.ts` pushes every worked example of both games' served docs.
- Fixed at the same time, from an outside agent's run (it built `.scratch/tbc-anniversary/food-buff/` from the docs
  alone): the situation can be set over HTTP (`PUT /api/<game>/workspaces/<id>/situation`) and in the page
  (`auraSimulator.situation`), and push answers say what the aura shows in it (`preview`), so no browser is needed;
  the Situation panel is documented; spell search says its limit and how many match (`limit`, `total`) and the spell
  fields are documented; the push answer's `code` is named; the option reference's Load options no longer list other
  keys under "Negator Alive" (the generator's settling set a tristate toggle to "Not"); the reference Markdown is an
  index of parts with nothing shortened; `subRegions` replacing a new aura's elements is documented; the docs page's
  shell links the Markdown; the Situation panel shows "45s", not "45.0s" (read as "450s").
