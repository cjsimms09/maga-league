# TERRITORY: A
"""A WEEK REQUEST MUST NEVER COME BACK WITH A SEASON PAYLOAD.

C found this by hand, running weekly-projection-archive for real for the first
time. It reported `status: captured`, its own positive control green, 591
players joined -- and Josh Allen's committed "week 1" row carried `gp: 18.0`
and `scored: 405.5`, his full-SEASON number. It was already on main.

TWO CAUSES, BOTH IN MY FILE:

  1. `_PROJECTION_PATHS[0]` is "/projections/nfl/regular/{season}" -- no {week}
     in it at all, so it is structurally season-shaped whatever week is asked
     for. `_STATS_PATHS[0]` is identical, so fetch_stats(season, week=N) had the
     same exposure and nobody had looked.
  2. `_best_payload` ranked candidates purely by row-count-with-stats, never
     asking whether the winning SHAPE answered the QUESTION.

⚠️ THE FAILURE MODE APPEARS EXACTLY WHEN THE DATA DOES NOT EXIST YET. Before
kickoff the real per-week endpoints legitimately return 0 rows, so the season
endpoint wins by default -- which is precisely when nobody is checking, and
precisely why this reached main with a clean status.

C guarded their own consumer, which was right and is a workaround. This tests
the fix at the source, because C also established that EVERY caller of
fetch_projections(season, week=N) was exposed and they could only check theirs.

Run: python3 draft/tests/test_sleeper_import_week_shape.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))

import sleeper_import as SI  # noqa: E402

_fails = []


def ck(name, cond, detail=None):
    if cond:
        print("PASS  " + name)
    else:
        _fails.append(name)
        print("FAIL  " + name + ("  — " + repr(detail)[:260] if detail is not None else ""))


# ── 1. THE STRUCTURAL HALF: a URL with no {week} cannot answer a week ────────
ck("CONTROL — a season-shaped template really is in the projection paths, so "
   "this test has something to catch",
   any("{week}" not in t for t in SI._PROJECTION_PATHS), SI._PROJECTION_PATHS)
ck("CONTROL — and in the stats paths too (the exposure nobody had looked at)",
   any("{week}" not in t for t in SI._STATS_PATHS), SI._STATS_PATHS)

calls = []


# The real capture carried 591 players, so a realistic season payload is a
# POPULATION, not one row. My first fixture was a single row and the guard
# correctly ABSTAINED on it -- `_is_season_shaped` refuses to judge under 10
# rows rather than accuse on thin evidence. That was my test being
# under-specified, not the guard being wrong, and it is worth keeping the real
# Josh Allen row inside a realistic population rather than shrinking the
# population to fit the fixture.
SEASON_PAYLOAD = {"4984": {"gp": 18.0, "pts_half_ppr": 405.5}}     # C's actual row
SEASON_PAYLOAD.update({str(9000 + i): {"gp": 17.0, "pts_half_ppr": 120.0} for i in range(30)})


def fake_get(path, ttl=None):
    calls.append(path)
    # every endpoint returns SOMETHING, so the guard cannot pass by accident
    return dict(SEASON_PAYLOAD)


_real_get = SI._get
SI._get = fake_get
try:
    calls.clear()
    SI._best_payload(SI._PROJECTION_PATHS, "2026", 1, "projections", 1)
    tried_seasonish = [p for p in calls if "/regular/2026" in p]
    ck("a week-1 request never even REQUESTS the season endpoint",
       not tried_seasonish, tried_seasonish)

    # ── 2. THE SHAPE HALF: even a {week} URL may return the wrong thing ──────
    calls.clear()
    got = SI._best_payload(["/projections/nfl/{season}/{week}"], "2026", 1, "projections", 1)
    ck("KNOWN POSITIVE — a season-SHAPED payload (gp 18) returned for a week "
       "request is REFUSED, using the exact row C found committed",
       got == {}, got)

    # ── 3. THE FAIL ARM: it must still accept a genuine weekly payload ───────
    def weekly_get(path, ttl=None):
        return {str(i): {"gp": 1.0, "pts_half_ppr": 12.5} for i in range(20)}

    SI._get = weekly_get
    got2 = SI._best_payload(["/projections/nfl/{season}/{week}"], "2026", 1, "projections", 1)
    ck("KNOWN NEGATIVE — a real weekly payload (gp 1) is accepted, so the guard "
       "is reading shape and not refusing everything",
       len(got2) == 20, len(got2))

    # ── 4. and a SEASON request must still get the season endpoint ───────────
    SI._get = fake_get
    calls.clear()
    got3 = SI._best_payload(SI._PROJECTION_PATHS, "2026", "season", "projections", 1)
    ck("a SEASON request still uses the season endpoint and is not refused",
       any("/regular/2026" in p for p in calls) and got3 != {},
       {"tried": calls, "empty": got3 == {}})
finally:
    SI._get = _real_get

# ── 5. the shape helper itself, both directions ─────────────────────────────
ck("_is_season_shaped says YES to season rows",
   SI._is_season_shaped({str(i): {"gp": 17.0} for i in range(20)}), None)
ck("_is_season_shaped says NO to weekly rows",
   not SI._is_season_shaped({str(i): {"gp": 1.0} for i in range(20)}), None)
ck("_is_season_shaped ABSTAINS on too little data rather than accusing",
   not SI._is_season_shaped({"1": {"gp": 17.0}}), None)

# ── PYTEST ENTRY POINT, ADDED 2026-08-20 ────────────────────────────────────
#
# ⚠️ THIS FILE COLLECTED **ZERO** TESTS UNDER PYTEST AND HAD BEEN READING AS
# GREEN. It is named test_*.py, so the gate's `pytest draft/tests` imports it —
# the checks above run at IMPORT and the old tail called sys.exit(1) on failure.
# pytest reports that as a collection ERROR, not a FAILED line. The board gate
# greps for "^FAILED" to decide what broke, found nothing, and refused to
# publish with "no FAILED lines parsed — treating as BLOCKING". That is the gate
# behaving correctly on a file I wrote badly, and it cost Cory a board rebuild
# the night before keeper lock.
#
# Found by test_ci_loop_integrity, which exists for exactly this: "a test_*.py
# that collects zero tests is a silent no-op — pytest passes it."
#
# The checks still run at import, so the standalone `python3 <file>` output is
# unchanged. This just gives pytest something to collect and fail on.


def test_all_checks_pass():
    assert not _fails, "%d check(s) failed: " % len(_fails) + "; ".join(_fails)


if __name__ == "__main__":
    print("\n%d checks, %d failed" % (9, len(_fails)))
    if _fails:
        print("FAILED")
        sys.exit(1)
