# Glossary

Terms the project uses. Use them in code, tickets, docs and messages to the user.

- **Window**: the app's editor UI, modelled on the in-game options window (title bar, toolbar, aura list,
  tabs). Say "window", not "WeakAuras window" or "options frame".
- **Tabs**: the window's Display, Trigger, Conditions, Actions, Animations, Load, Custom Options and
  Information pages, with Group first for a group. Built from the addon's own options code (the list is read from
  `OptionsFrame.lua`, so it follows the addon version).
- **Aura**: one display (icon, bar, text, …) or a group of them, as the addon stores it.
- **Aura document**: an aura as a Lua table in canonical JSON (`src/core/lua-value.ts`).
- **State code**: an aura's `!WA:2!` import string, the encoded aura document. Moved as files, not links.
- **Workspace**: the auras being worked on in one session, identified by `?w=<id>`.
- **Game screen**: the mock screen that previews auras at their real position and size.
- **Situation**: the simulated game state the game screen shows (time left, present/missing, stacks,
  target, in combat).
- **Push**: an agent sending an aura to a workspace over HTTP.
