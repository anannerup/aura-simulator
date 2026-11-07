# 02: The four bugs, test-first

**What to build:**
- **Wrong aura:** an edit lands on the aura it came from even if the selection changes; pushes and undo during an edit win.
- **Version switch:** switching the addon version mid-edit never freezes the window.
- **Failed push:** a failed push leaves the workspace unchanged, or says "accepted, validation unavailable". The same goes for situation changes.
- **Reset and restart:** an open page keeps receiving pushes after a workspace delete, reset or server restart.
- **Undo:** deleting the last aura can be undone.
- **Pushes from the page:** they carry the chosen addon version and report publishing failures.
- **JSON Apply:** it runs the import check.
- **Wago JSON:** an imported wago JSON stays byte-identical until edited.

Each one gets a test at the outermost seam that fails first.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Each bug has a failing-then-passing test at seam A or B
- [ ] All tiers green
