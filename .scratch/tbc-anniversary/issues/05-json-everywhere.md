# 05: wago JSON in the window, files, push and docs

**What to build:** the JSON form wherever the import string goes, on both sites:
- **Window:** a JSON tab in the drawer (replacing "Raw table"), editable.
- **Files:** export `.json` next to `.txt`; import and drop `.json`.
- **Push:** agents push JSON (pretty or compact).
- **Wago links:** pasting a wago link imports it (the server fetches from wago's API).
- **Agent docs:** writing wago JSON is the primary authoring path; they include the option ↔ table reference (03) in Markdown and at `/<game>/docs/agents/options.json`, and the worked examples as JSON.

**Blocked by:** 01, 02, 03

**Status:** ready-for-agent

- [ ] e2e: JSON tab shows and edits; `.json` export, import and drop; JSON push; wago link import (recorded wago answer)
- [ ] Docs show the reference both ways for the selected game and version; a test pushes every JSON example in the served docs
