# 05: JSON in, everywhere

**What to build:** on both sites:
- **Window:** a JSON tab in the drawer (replacing "Raw table") shows the selected aura as wago JSON and applies edits by wago's rules.
- **Files:** import and drop of `.json`.
- **Push:** agents push JSON (pretty or compact).
- **Wago links:** pasting a wago link imports it (the server fetches it from wago's API).
- **Docs:** the worked examples in the agent docs as JSON.

**Blocked by:** 01, 02

**Status:** done

- [x] e2e: JSON tab shows and edits; `.json` import and drop; JSON push; wago link import (recorded wago answer)
- [x] A test pushes every JSON example in the served docs
