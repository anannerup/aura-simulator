Design the module structure of the aura-simulator refactor. DESIGN ONLY: change no files in the repository; your final message is the design document.

First research how this stack is meant to be structured, thoroughly and from several kinds of sources, with live web search:
- the framework's own docs for the installed version in `node_modules/next/dist/docs/` (project structure, route handlers, server actions, data security, backend-for-frontend, server and client components) and nextjs.org, react.dev;
- reputable open-source Next.js App Router codebases on GitHub (e.g. Vercel's own apps and examples, well-known production projects and starters), how they actually layer and organise code, where business logic, data access, route handlers, server actions, components and hooks live, and how they enforce boundaries;
- respected blog posts and talks by the framework's authors and recognised practitioners on architecture for Next.js/React/TypeScript apps.
Summarise the conventions you find, where sources agree and disagree, and cite them (links). Base the layers and conventions on that. Nothing is prescribed or ruled out; use whatever is idiomatic for this framework and language.

Then use the `codebase-design` skill (`~/.agents/skills/codebase-design/SKILL.md`, and its DEEPENING.md where relevant) to design the modules. Inputs: your earlier review `.scratch/codex-review.md`, the spec `.scratch/architecture/spec.md` and tickets `.scratch/architecture/issues/`, `AGENTS.md`, `GLOSSARY.md`, and the shared rules in `~/.config/agents/AGENTS.md`.

The owner's decisions: calls go one way; names in business language (the aura module is `auras`; "simulated game" for the fake game answers; "table map" for the option-to-table-key lookup; "option" stays for a thing set in a tab; workspaces hold "auras", not items); abstractions earned ("1, 2, many", with judgement); fewer indirections; a beautiful, idiomatic codebase.

Decide, for the server and the browser:
1. The layers and conventions this stack uses, with your sources.
2. The modules in each layer: business-language name, what it owns, its small public interface, what's behind it, who calls it. Prefer deep modules.
3. Each use case (push an aura, set the situation, build the agent docs, take a picture, compare, refresh spells/items/files, the window's edit/import/export/undo) and its call path in hops.
4. Where an interface exists because something varies (the two games; the addon in the browser vs on the server; storage), and today's interfaces with one adapter that should go.
5. What moves where (point to current files), what merges, splits or disappears, and the dependency rules to enforce in lint.
6. An order for step 03 that keeps every step green.

Output: one Markdown document, starting with a box-and-arrow diagram and a module table. Keep it as short as the design allows.
