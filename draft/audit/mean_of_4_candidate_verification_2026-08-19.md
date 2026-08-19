# E's verification of the mean-of-4 board candidate

**Session E (red team), 2026-08-19.** Cory: *"Mean is coming! This is where
our attention needs to be! Finding best model for draft! Good roster
building (normal), extract max value, find upside late!!!"* — direct
priority instruction. `draft/data/board_mean_candidate.json` (commit
`4cd9a24e`, territory A, candidate-only, writes nothing live) is the
artifact this points at: Sleeper + 2-or-more of CBS/ESPN/FFToday, real
cross-source ceiling/floor instead of a per-band constant, and a measured
fix for register 59's RB-heavy roster shape (RB10/WR1 → RB8/WR3) from
better data alone, no weight change.

## What checks out clean

- **Floor/ceiling/mean ordering**: 0 violations across all 388 candidate
  players (`floor ≤ mean ≤ ceiling` holds everywhere).
- **No negative `cross_source_sd`** anywhere.
- **Source-count distribution** is sane: 274 players with all 4 sources, 114
  with 3 — no suspicious clustering.
- **Coverage of the players that matter**: of the CURRENT top 100 (by
  `overall_rank`), only 1 is absent from the candidate (Chig Okonkwo, ADP
  157, a legitimate low-coverage case, not a bug).
- **No crosswalk mismatch signature**: checked the players with the highest
  cross-source disagreement ratio (`sd/mean`) against the live board by
  `player_id` — every `name` matches across both files. The high-ratio cases
  are all deep bench/waiver names (proj 20-50 range) where wide disagreement
  between sources on a committee/role battle is plausible, not evidence of
  two different players averaged together.
- **Within the top 100 specifically**, disagreement is small and sane — max
  ratio 0.197 (Oronde Gadsden, TE), median 0.056. Nothing implausible.
- **Cross-confirms an earlier finding this session (E32)**: several RBs move
  meaningfully UP under the mean (Jeremiyah Love 188.3→220.0, Breece Hall
  192.5→217.3) — the exact direction and rough magnitude E32 already
  measured for the Sleeper-vs-FantasyPros RB gap (row 21's source-policy
  question). Two independent methods pointing at the same lever.

## The one real gap found

**No producing script was committed — only the JSON output.** `git show
4cd9a24e --stat` shows exactly one file: the artifact itself. The
methodology (crosswalk rule, ceiling/floor formula, source-count threshold)
is described in prose in the commit message, not as reproducible code.
For a candidate about to potentially replace the board's single-source
projection three days before a real draft, that is a real gap: nobody can
re-run this, verify the crosswalk logic line-by-line, or regenerate it when
sources refresh, without reverse-engineering the JSON's own shape. This is
exactly the class of risk Rule 3f names — a probe (here, a full board
rebuild) whose logic exists only in prose is a probe nobody can check.

**Not something I am fixing myself** — the crosswalk and merge logic belong
to whoever built this (A's territory), and reconstructing it from the
output alone risks introducing a DIFFERENT bug while trying to match one
that already works. Flagging so the script gets committed alongside
whatever ships, not before.

## A forward-looking gap, found after the above — not a bug in what exists today

Cory's three actual keepers (Chase, Henry, Walker) are entirely absent from
`board_mean_candidate.json`. **Verified this matches the live board's own
existing, correct behavior** — `kept_players` is a separate array, deliberately
excluded from `players[]` on `public/draft_data.json` too, same as this
candidate. Not a defect.

**But it is a real question for WHEN this ships.** `kept_players` currently
carries `proj_mean == proj_sleeper` for all three (Chase 256.6, Henry 238.4,
Walker 225.5) — and FantasyPros already disagrees meaningfully in the same
direction the mean-of-4 candidate moves the pool (Chase 275.44, Henry 264.64,
both higher). **If `players[]` switches to the 4-source mean while
`kept_players` stays Sleeper-only, the board's headline projection number
will mean two different things depending on whether a player is currently on
Cory's roster or in the pool** — his own keepers would read systematically
lower than a same-caliber undrafted player, right at the exact comparison
(keeper value vs. the pool) his own roster decisions depend on most. Whoever
builds the merge needs to re-price `kept_players` from the same 4-source data
in the same pass, not just `players[]`. Flagging now, before it ships, rather
than after.

## UPDATE, same day — it shipped, and I independently re-verified the live wiring

`53814c46`/`f297e7f3`/`6d585e95` wired the blend into `build.py` for real
(`multisource_blend.py`), fixed a genuine coherence bug found by measuring
against the real board instead of the candidate (a 34x Sleeper-vs-scraper
spread on role-uncertain players — "does he play at all" not "how well" —
was moving late-board names up to 80 slots while barely touching the top 12;
gated at `max/min ≤ 2.0`, argued a priori, not swept), and caught a near-miss
where a test `--offline` run almost overwrote the real 697-player board with
a 233-player fixture and nearly destroyed irreplaceable daily archive data
(now refused with two independent guards, one overridable, one not).

**Independently re-verified before the live board rebuilds on it:**
- **The reproducibility gap I flagged is fixed** — `multisource_blend.py` is
  a real, committed, readable module, not just commit-message prose.
- **The keeper-repricing gap I flagged is correctly handled** — traced
  `build.py` directly: `apply_multisource(players)` runs immediately after
  `load_players`, *before* the `kept_players` split (`dict(p)` copies), so
  keepers inherit the new `proj_mean`/`proj_ceiling`/`proj_floor` for free.
  `vorp` for `kept_players` is derived fresh from the (now-updated)
  `proj_mean` at the same point that fixed my earlier E17 finding — the same
  mechanism transparently covers both.
- **No Sleeper double-count**: `by_source` in `multisource_projections.json`
  holds only CBS/ESPN/FFToday; `proj_mean` (Sleeper) is appended separately.
  Checked directly against the store, not assumed.
- **8/8 `test_multisource_blend.py`, 176/176 of the broader
  vorp/keeper/multisource-tagged suite** (pytest not preinstalled in my
  sandbox; installed it to actually run these rather than reading and
  assuming green). One unrelated failure found in a wider sweep —
  `A-DRAFT-DAY-DECISIONS.md` stating a stale "51 open rows" against today's
  actual 70 — a document-staleness gap from today's high filing volume
  across sessions, nothing to do with the blend.
- **The `.gitignore`/offline-fixture guard**: read the write-site code
  directly (`build.py:2294-2309`) — refuses the board overwrite unless
  `--allow-fixture-write`, and the archive suppression (`_fixture_run`) has
  no override at all, exactly as the commit describes.

**No defects found in the shipped wiring.** The live board (`built_at`
2026-08-19T00:54Z at last check) has not yet rebuilt with this — it applies
on the next real `draft-data.yml` run. Will re-check the actual live
artifact once that happens, same as every other shipped change this session.

## What this does not check

- Whether CBS/ESPN/FFToday's own scrapers are individually correct — that
  is upstream of this artifact and outside what I can verify from the
  output alone.
- Whether shipping this to `public/draft_data.json` three days out is the
  right call — that is explicitly Cory's, per the commit's own framing.
