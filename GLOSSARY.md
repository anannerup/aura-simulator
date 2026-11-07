# Glossary

Terms the project uses. Use them in code, tickets, docs and messages to the user.

## The page

- **Window**: the app's editor UI, modelled on the in-game options window (title bar, toolbar, aura list,
  tabs).
  _Avoid_: WeakAuras window, options frame, workbench.
- **Aura list**: the window's left pane: the workspace's auras, groups with their auras nested.
  _Avoid_: workspace tree, tree.
- **Tabs**: the window's Display, Trigger, Conditions, Actions, Animations, Load, Custom Options and
  Information pages, with Group first for a group. Built from the addon's own options code, so they follow the
  addon version. Each has the addon's key, which is not always its label: `region` is Display, `action` is Actions.
- **Game screen**: the simulated game client's screen beside the window. It draws every aura of the workspace at
  its real position and size, over an optional screenshot.
  _Avoid_: stage, mock screen, canvas.
- **Situation**: the simulated game state the game screen shows (time left, present/missing, stacks,
  target, in combat).

## Auras

- **Aura**: one display (icon, bar, text, …) or a group of them, as the addon stores it.
  _Avoid_: item, node (a node is only a place in the workspace's tree structure).
- **Top-level aura**: an aura that is in no group. Pushes, files and the server work per top-level aura (a group
  with everything in it).
- **Aura document**: an aura as a Lua table in canonical JSON.
- **State code**: an aura's `!WA:2!` import string, the encoded aura document. Moved as files, not links.
  _Avoid_: import string (except when talking to the player about the game's import dialog).

## Sessions

- **Workspace**: the auras being worked on in one session, identified by `?w=<id>`.
- **Push**: an agent sending an aura to a workspace over HTTP. The server keeps only the latest few pushes per
  workspace, never the workspace itself.
