# 03: Layers and the dependency direction

**What to build:** the idiomatic layering from the spec.
- Routes only translate HTTP.
- One application operation per use case (push, situation, docs, picture, spells).
- A pure domain.
- Storage and upstream access below it.
- Addon execution private behind the aura boundary.
- Explicit server and browser composition.
- Pure game definitions.
- Drawing is handed its game resources.
- Page features move out of the routes folder.

Lint rules enforce the direction, with a baseline that only shrinks; runtime cycles are checked. Fewer pass-through hops in the main flows.

**Blocked by:** 02, 02b

**Status:** ready-for-agent

- [ ] Dependency rules in lint; baseline empty or justified
- [ ] Each use case readable in one place
- [ ] No cycles between folders
- [ ] All tiers green
