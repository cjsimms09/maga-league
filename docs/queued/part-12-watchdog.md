# Part 12 — The Rule-Change Watchdog (slim spec)

**Status:** authored 2026-08-08 from the in-season-master §4 and the
EVIDENCE-BUNDLE references (items 26–27, which record that "no ruleset hash
exists anywhere in the codebase"). This is the slim, buildable spec that closes
that gap. Not draft-critical; Phase-4 / September-class, but the hash primitive
is cheap enough to land earlier if convenient.

## The failure it prevents
A commissioner changes half-PPR to full PPR, adds a roster slot, or edits the
keeper cost model mid-season. Every projection, VORP baseline, replacement
level and recommendation silently becomes a coherent, confident analysis of a
league that no longer exists. Nothing in the pipeline can currently tell — the
`site-check.yml` Sleeper-drift check is the only thing that would catch it, and
only for the deployed board, only when that workflow runs.

## The primitive: a ruleset hash
A stable hash over the fields that, if changed, invalidate the board:
- scoring settings (every scored key)
- roster slots / roster shape
- team count
- playoff week start
- **keeper rules INCLUDING the cost model** (top_picks_flat, count, max_years)

Requirements:
- **Stable/canonical:** sort keys, normalize numbers, so an unordered re-serialize
  produces the same hash. (Reuse `rawarchive.stableStringify` / a shared helper.)
- **🚨 ROUND FLOAT-NOISE BEFORE HASHING (chat-Claude, 2026-08-08).** 2023's stored
  scoring carries float noise — `pass_yd = 0.03999999910593033` which is
  functionally `0.04`. Sleeper's own values drift in the last bits across
  seasons. **The hash MUST round every numeric to a fixed precision (e.g. 4
  decimals) before comparing**, or the very first cross-season hash check
  false-positives a "rule change" that never happened and the watchdog cries
  wolf on day one. Byte-for-byte across 2024/25/26 held (chat-Claude); only 2023
  needs the rounding — but round unconditionally, it is free insurance. Test:
  `hash({pass_yd: 0.03999999910593033}) == hash({pass_yd: 0.04})`.
- **Stamped into the artifact** provenance at build time (`provenance.ruleset_hash`)
  — this is the missing field EVIDENCE-BUNDLE item 26/27 names.
- **Recorded** as the "known-good" hash when the config is confirmed (alongside
  `config_confirmed`, from the same authority — the Blob, per the SSOT fix).

## The checks (fail loud, never silent)
1. **Every pipeline run:** recompute the hash from the live Sleeper league and
   from the committed config; if they differ, the build **warns loudly** in
   provenance and the War Room renders a red banner — never a silent rebuild on
   changed rules.
2. **Every session start (War Room load):** compare the artifact's `ruleset_hash`
   against the confirmed known-good; mismatch → red banner "the league's rules
   changed since this board was built — reconfirm League Setup and rebuild."
3. **The mid-season mini-cycle** (see `annual-button.md` §4) verifies the hash
   check itself still fires — a watchdog for the watchdog.

## Grading / ledger
A rule-change detection is itself an event worth recording: append a `watchdog`
entry to the prediction ledger (kind `watchdog`, method `ruleset-hash-v1`) with
the before/after hashes and the diffed fields, so the season review can show
when rules moved and what it invalidated.

## Robot scenario (before its gate)
A fixture config + a mutated copy (one scoring key changed) flowing through the
hash + check code path must produce: identical hash before, different hash after,
and the mismatch surfaced — never swallowed.
