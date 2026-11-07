# 01: Tests you can trust

**What to build:** a green run means everything required was tested.
- The TBC fixture is provisioned and checksummed before the run; required suites fail, not skip, when it is missing.
- Live upstream checks are a separate explicit command.
- "Every …" tests account for every case (assigned = tested + explained exemptions, unexplained = 0).
- Field sweeps prove each edit reached the aura and the export.
- Browser tests start a fresh server of the current code by default.
- Picture tests use recorded media and fail on unexpected outbound requests.
- Fixed waits are replaced by waits on observable state, and generated input is seeded.
- Tests of private details are rewritten as outcomes.

See spec stories 1–8 and the Codex review §6.

**Blocked by:** None (can start immediately; after the round-3 screenshot fixes land)

**Status:** ready-for-agent

- [ ] No silent skips anywhere; a missing fixture fails the run
- [ ] Exhaustive suites report full accounting
- [ ] Sweeps assert outcomes; private-detail tests rewritten
- [ ] Fresh server by default; deterministic pictures
