# 03: Agents push auras; first agent docs

**What to build:** An HTTP endpoint accepts an aura document or state code for a workspace; open pages on that workspace update live. An agent docs page documents the document format and the endpoint.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] POST endpoint accepts document or state code, returns state code
- [ ] Open page updates live after a push
- [ ] Agent docs page explains document, state code, endpoint with a curl example
- [ ] HTTP + browser test: push -> page shows it
