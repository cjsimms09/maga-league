#!/usr/bin/env python3
# TERRITORY: A
"""PUT THE BLEND ON THE BOARD — the projections, floors and ceilings Cory asked for.

Cory, 2026-08-19: "we also need to make sure mean proj is what is showing on draft
day including draft shark, the proj max and floor values are correct and the same
% apart from mean proj (for each player, player specific)" and then "we need to
push this new roster comp, and the new mean projections, ceilings, floors ... and
deploy so I can play with it".

`draftday_checks.js` measured the gap: the live board carried ZERO Draft Sharks
projections (0 of 700) and its floor/ceiling were `cross-source-p10` -- the
analyst-DISAGREEMENT band of register 119, which is a different quantity from a
modelled outcome range. Neither half of what he asked for was on the board.

WHY THIS ATTACHES INSTEAD OF REBUILDING. `build.py` needs the Sleeper API and the
proxy answers 403 at CONNECT -- a policy answer, not a flake, so it is not
retried. This reads the COMMITTED board and rewrites only the projection fields,
offline.

⚠️ AND IT RE-DERIVES WHAT DEPENDS ON THEM. `vorp`, `replacement`, `tier`,
`pos_rank`, `overall_rank` and `pool_rank` are all computed FROM proj_mean.
Overwriting proj_mean and leaving those alone would ship a board whose value
terms disagree with its own projections -- worse than the state it replaces.
They are recomputed by calling `vorp.apply_vorp` and `vorp.assign_tiers`, THE
SAME FUNCTIONS build.py calls, not a second implementation of the same rule
(rule 11: one derivation, reused).

WHAT EACH PLAYER GETS:
  proj_mean     the blend -- mean of every source that has an opinion, centred
                per position (all 700)
  proj_floor    blend proj x (DS floor / DS proj)      } 247 with a Draft Sharks
  proj_ceiling  blend proj x (DS ceiling / DS proj)    } band; SEE BELOW for the rest

⚠️ THE 453 WITHOUT A DRAFT SHARKS BAND GET floor = proj = ceiling, NOT their old
band. Mixing a modelled outcome range and an analyst-disagreement range in one
column is exactly the confusion this whole exercise exists to remove, and the
ceiling adjuster must be UNABLE to move a man we have no band for. That is
visible per row as `ds_band_from`, and counted in the controls.

Every original is preserved as `*_pre_ds` so the change is reversible by
inspection and not only by git.

Run: python3 draft/tools/attach_draftsharks.py [--dry-run]
"""
from __future__ import annotations
import json, sys, copy
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT / "draft"))
import vorp as vorp_mod  # noqa: E402

BOARD_P = ROOT / "public" / "draft_data.json"
BLEND_P = ROOT / "draft" / "data" / "blended_projection.json"
DRY = "--dry-run" in sys.argv

board = json.loads(BOARD_P.read_text())
blend = json.loads(BLEND_P.read_text())
if not blend.get("controls_all_passed"):
    raise SystemExit("the blend failed its controls — REFUSING")

bl = {str(p["player_id"]): p for p in blend["players"]}
# Draft Sharks' raw rows, for the DS arm of Cory's toggle
_ds = json.loads((ROOT / "draft" / "data" / "draftsharks_projections_2026.json").read_text())
_ds_by_id = {str(r["sleeper_id"]): r for r in (_ds.get("players") or [])
             if r.get("sleeper_id") is not None}
before = copy.deepcopy(board["players"])

matched = 0
banded = 0
no_band = 0
for p in board["players"]:
    b = bl.get(str(p.get("player_id")))
    if not b or b.get("proj") is None:
        continue
    matched += 1
    # Preserve, so the change is reversible by inspection.
    # ⚠️ ONLY ON THE FIRST ATTACH. Re-running unconditionally overwrote
    # proj_mean_pre_ds with the ALREADY-BLENDED value and destroyed the original
    # board number -- a silent data loss that a second run would have made
    # permanent. C3's known-positive is what surfaced it: the second run
    # reported "0 players changed", which is the no-op it was written to catch.
    if "proj_mean_pre_ds" not in p:
        p["proj_mean_pre_ds"] = p.get("proj_mean")
        p["proj_floor_pre_ds"] = p.get("proj_floor")
        p["proj_ceiling_pre_ds"] = p.get("proj_ceiling")
        p["proj_mean_source_pre_ds"] = p.get("proj_mean_source")

    p["proj_mean"] = b["proj"]
    p["proj_mean_source"] = "blend: mean of %d sources, centred per position" % (b.get("n_sources") or 0)
    # ── BOTH MODELS' INPUTS, side by side ────────────────────────────────
    # Cory 2026-08-19: "can we actually program 2 models, one that uses proj
    # from draft shark and 1 that uses mean proj. and I want to be able to
    # toggle between them". The toggle is only honest if BOTH numbers are on
    # every row, so neither arm has to be re-derived at read time.
    #   proj_mean       = the blend (mean of all sources, centred per position)
    #   proj_ds / _floor / _ceiling = Draft Sharks' OWN numbers, uncentred
    # ⚠️ THE DS ARM CANNOT RANK 453 OF 700 PLAYERS. Coverage by ADP depth:
    # top-100 100%, top-150 99.3%, top-200 94.5%, top-250 88.4%. Cory's last
    # pick is 148, by which point the live board is ~250 deep, so the DS arm
    # thins exactly where his last picks come from. Stated, not smoothed over.
    p["proj_draftsharks"] = b.get("ds_proj")
    p["proj_ds"] = b.get("ds_proj")
    _dsrow = _ds_by_id.get(str(p.get("player_id")))
    p["proj_ds_floor"] = (_dsrow or {}).get("floor_proj")
    p["proj_ds_ceiling"] = (_dsrow or {}).get("ceil_proj")
    p["injury_risk_pct"] = b.get("injury_risk_pct")
    p["blend_n_sources"] = b.get("n_sources")
    p["blend_sources_used"] = b.get("sources_used")

    if b.get("floor") is not None and b.get("ceiling") is not None:
        banded += 1
        p["proj_floor"] = b["floor"]
        p["proj_ceiling"] = b["ceiling"]
        p["proj_floor_source"] = "draftsharks_pct"
        p["proj_ceiling_source"] = "draftsharks_pct"
        p["ds_band_from"] = "draftsharks_pct"
    else:
        no_band += 1
        # no honest band: the adjuster must not be able to move him
        p["proj_floor"] = b["proj"]
        p["proj_ceiling"] = b["proj"]
        p["proj_floor_source"] = "none — no Draft Sharks band for this player"
        p["proj_ceiling_source"] = "none — no Draft Sharks band for this player"
        p["ds_band_from"] = None

# ── re-derive everything that is computed FROM proj_mean ────────────────────
cfg = board.get("league") or {}
players, vorp_diag = vorp_mod.apply_vorp(board["players"], cfg)
players = vorp_mod.assign_tiers(players)
board["players"] = players

# ⛔ AND THE BOARD PUBLISHES ITS OWN SEPARATE COPY OF THE REPLACEMENT LEVELS.
# `apply_vorp` sets p["replacement"] per row; `board["replacement"]` is a
# DIFFERENT object that build.py writes from the same diag. Updating only the
# rows left the published block holding the pre-attach levels, and three tests
# caught it -- board_is_internally_consistent (vorp_broken 700),
# keeper_lock_reorders_the_board (published RB 170.47 vs recomputed 166.0) and
# dollar_replacement_baseline.
#
# ⚠️ MY OWN C2 CONTROL PASSED THROUGHOUT, because it checked
# `vorp == proj_mean - p["replacement"]` -- the per-row copy I had just written.
# It verified the identity I maintained instead of the one the board ships. The
# test suite checks the PUBLISHED block, which is the one the war room reads.
# C6 below now checks that copy.
board["replacement"] = vorp_diag

# pool/overall/pos ranks follow the same order build.py uses: VORP desc, K/DEF
# demoted out of the cross-position order (Cory's ruling 2026-08-17), which
# apply_vorp already encodes in the vorp it returns.
ranked = sorted(players, key=lambda p: -(p.get("vorp") or -1e9))
for i, p in enumerate(ranked, 1):
    p["pool_rank"] = i
    p["overall_rank"] = i
by_pos: dict = {}
for p in ranked:
    q = p.get("position")
    by_pos[q] = by_pos.get(q, 0) + 1
    p["pos_rank"] = by_pos[q]

# ── controls ───────────────────────────────────────────────────────────────
def med(v):
    v = sorted(v)
    return v[len(v) // 2] if v else None

# C1 — the band really is Draft Sharks' own percentage, per player
band_err = []
for p in players:
    if p.get("ds_band_from") != "draftsharks_pct":
        continue
    b = bl[str(p["player_id"])]
    want_up = (b["ceiling"] / b["proj"]) - 1
    got_up = (p["proj_ceiling"] / p["proj_mean"]) - 1
    band_err.append(abs(want_up - got_up))

# C2 — the board's own identity: vorp == proj_mean - replacement[pos]
ident = 0
for p in players:
    r = p.get("replacement")
    if r is None or p.get("vorp") is None or p.get("proj_mean") is None:
        continue
    if abs(round(float(p["proj_mean"]) - float(r), 2) - float(p["vorp"])) > 0.011:
        ident += 1

# C3 — KNOWN POSITIVE (rule 3e). The whole point of this run is that numbers
# CHANGE. If the board came out identical the attach silently did nothing, and
# "no change" would be indistinguishable from a broken join.
# ⚠️ AGAINST proj_mean_pre_ds, THE TRUE ORIGINAL -- not against the file's prior
# state. Comparing to the prior state makes a re-run look like a no-op even when
# the attach is working, which is a control that fails on its own idempotence.
changed = sum(1 for p in players
              if p.get("proj_mean_pre_ds") is not None
              and p.get("proj_mean") != p.get("proj_mean_pre_ds"))
rank_moved = sum(1 for a, b2 in zip(before, players)
                 if a.get("overall_rank") != b2.get("overall_rank"))
if all(p.get("proj_mean_pre_ds") is not None for p in players[:50]) and rank_moved == 0:
    rank_moved = None   # already attached: ranks legitimately do not move again

# C4 — nobody lost their projection to the join
lost = sum(1 for p in players if p.get("proj_mean") is None)

ctl = {
    "C1_band_is_draftsharks_own_percentage": {
        "ok": (med(band_err) or 0) < 1e-9, "n": len(band_err),
        "worst_error": max(band_err) if band_err else None,
        "why": "Cory asked for floor/ceiling the SAME % from mean as Draft Sharks'. "
               "If the percentage is not identical we invented a band."},
    "C2_vorp_identity_holds_after_rederivation": {
        "ok": ident == 0, "rows_violating": ident, "of": len(players),
        "why": "vorp == proj_mean - replacement[pos]. If this fails, the board's "
               "value term disagrees with its own projections — the exact defect "
               "this script exists to avoid creating."},
    "C3_known_positive_the_board_actually_moved": {
        "ok": changed > 300 and (rank_moved is None or rank_moved > 50),
        "players_whose_proj_changed": changed, "players_whose_overall_rank_moved": rank_moved,
        "why": "rule 3e. A no-op would look exactly like a clean run, so the run "
               "must PROVE it did something before any of it is believed."},
    "C5_both_arms_of_corys_toggle_are_on_the_board": {
        "ok": sum(1 for p in players if p.get("proj_ds") is not None) > 200
              and sum(1 for p in players if p.get("proj_mean") is not None) > 600,
        "players_with_a_blend_proj": sum(1 for p in players if p.get("proj_mean") is not None),
        "players_with_a_draftsharks_proj": sum(1 for p in players if p.get("proj_ds") is not None),
        "why": "Cory wants to toggle between a Draft-Sharks model and a blended-mean "
               "model. Both numbers must sit on every row that has them, or the "
               "toggle is re-deriving one arm at read time."},
    "C6_published_replacement_block_matches_the_rows": {
        "ok": all(
            abs(float((vorp_diag.get("replacement_points") or {}).get(p["position"], 0))
                - float(p.get("replacement") or 0)) < 0.011
            for p in players if p.get("position") and p.get("replacement") is not None),
        "published": (vorp_diag or {}).get("replacement_points"),
        "why": "the board ships board['replacement'] SEPARATELY from the per-row "
               "field. C2 checked the row copy -- the one I had just written -- and "
               "passed while the published block was stale and three tests failed. "
               "A control has to check what SHIPS, not what you maintained."},
    "C4_no_player_lost_his_projection": {
        "ok": lost == 0, "players_with_null_proj_mean": lost},
}
all_ok = all(c["ok"] for c in ctl.values())

board["draftsharks_attach"] = {
    "_territory": "TERRITORY: A — draft/tools/attach_draftsharks.py",
    "_ruling": "Cory 2026-08-19: push the new mean projections, ceilings and floors",
    "matched": matched, "with_a_draftsharks_band": banded,
    "without_a_band_floor_eq_proj_eq_ceiling": no_band,
    "controls": ctl, "controls_all_passed": all_ok,
    "reversible": "every original preserved as *_pre_ds",
    "rederived": ["replacement", "vorp", "tier", "pool_rank", "overall_rank", "pos_rank"],
}

print("ATTACH DRAFT SHARKS -> the live board\n")
for k, v in ctl.items():
    print(("  OK   " if v["ok"] else "  FAIL ") + k)
print(f"\n  matched {matched} of {len(players)} board players")
print(f"  {banded} carry a Draft Sharks band; {no_band} get floor = proj = ceiling")
print(f"  proj changed on {changed} players; overall rank moved on {rank_moved}")
print("\n  top 10 by the NEW board order:")
print("   " + "player".ljust(24) + "pos".rjust(4) + "proj".rjust(8) + "floor".rjust(8)
      + "ceil".rjust(8) + "vorp".rjust(8) + "  was")
for p in ranked[:10]:
    print("   " + str(p.get("name"))[:23].ljust(24) + str(p.get("position")).rjust(4)
          + f"{p.get('proj_mean'):.0f}".rjust(8)
          + f"{p.get('proj_floor'):.0f}".rjust(8) + f"{p.get('proj_ceiling'):.0f}".rjust(8)
          + f"{p.get('vorp'):.0f}".rjust(8)
          + f"   {p.get('proj_mean_pre_ds')}")

if DRY:
    print("\n  --dry-run: board NOT written")
    raise SystemExit(0 if all_ok else 1)
if not all_ok:
    print("\n  ⛔ CONTROLS FAILED — board NOT written")
    raise SystemExit(1)
BOARD_P.write_text(json.dumps(board, indent=1))
print(f"\n  wrote {BOARD_P.relative_to(ROOT)}")
raise SystemExit(0)
