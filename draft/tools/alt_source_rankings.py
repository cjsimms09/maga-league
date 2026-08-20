"""Per-source VORP/tier rankings — Cory, live 2026-08-20: "This toggle should
just rearrange the board though and also may change vona calc or recommended
player." The two toggles shipped tonight (position_boards_view.js's ds/blend,
and app.js's #proj-source panel) both only swap which NUMBER a row shows —
neither reorders anything, because VORP and tier are computed exactly once,
server-side, from the blended proj_mean, and every ranked list on the war room
reads those two fields. A toggle that actually re-ranks has to re-run that
exact computation once per source.

REUSE, NOT REIMPLEMENTATION (Rule 11): this calls `vorp.apply_vorp()` and
`vorp.assign_tiers()` UNCHANGED — the same functions build.py's real pipeline
calls — against a SHADOW COPY of the player list with `proj_mean` swapped for
each alternate source. Nothing about those two functions is duplicated or
reimplemented; they simply run four more times, once per source, on a
temporary view of the same data.

COVERAGE GAPS DO NOT ZERO A PLAYER OUT. Draft Sharks covers 247 of 700
players; FantasyPros 429; Sleeper and our own model closer to full. A player
missing from a source falls back to his own blended proj_mean for THAT
source's ranking rather than being priced as replacement-level or worse (the
exact "|| 0 turns absent into a confident zero" failure this codebase has
already been burned by once, register-cited in build.py's own kept-players
comment). `covered_<source>` records which is which so nothing downstream has
to guess.

OUTPUT IS ADDITIVE ONLY. Every new field is suffixed (`vorp_ds`, `tier_ds`,
`pos_rank_ds`, `overall_rank_ds`, `replacement_ds`, `proj_used_ds`,
`covered_ds`, and the same four suffixes for _sleeper/_ownmodel/_fantasypros).
The unsuffixed `vorp`/`tier`/`proj_mean`/... fields the live recommendation
already reads are never touched, so running this script changes nothing about
today's board unless a client explicitly asks for an alternate source.

Run: python3 draft/tools/alt_source_rankings.py [--path public/draft_data.json]
"""
from __future__ import annotations
import argparse
import copy
import json
from pathlib import Path

HERE = Path(__file__).parent.parent
import sys
sys.path.insert(0, str(HERE))
import config_schema  # noqa: E402
import vorp as vorp_mod  # noqa: E402

CONFIG_PATH = HERE / "config" / "league_config.json"

#: source key -> (the field to rank on, the suffix every derived field gets)
SOURCES = {
    "ds": "proj_ds",
    "sleeper": "proj_sleeper",
    "ownmodel": "proj_ownmodel",
    "fantasypros": "proj_fantasypros",
}

#: fields apply_vorp/assign_tiers write onto each player; carried over under
#: the source's suffix after the shadow run.
DERIVED_FIELDS = ("vorp", "tier", "pos_rank", "overall_rank",
                   "replacement", "tier_size", "tier_drop", "tier_rank")


def compute_for_source(players: list[dict], cfg: dict, source_field: str) -> dict[str, dict]:
    """Run the REAL apply_vorp/assign_tiers on a shadow copy priced by
    `source_field` instead of proj_mean. Returns {player_id: {suffixed
    field: value}}, keyed by string player_id so the caller can merge without
    caring about list order (apply_vorp re-sorts its input)."""
    shadow = []
    covered_by_id: dict[str, bool] = {}
    for p in players:
        pid = str(p.get("player_id"))
        raw = p.get(source_field)
        covered = raw is not None
        covered_by_id[pid] = covered
        sp = copy.copy(p)  # shallow: we only ever overwrite proj_mean below
        sp["proj_mean"] = raw if covered else p.get("proj_mean", 0)
        shadow.append(sp)

    shadow, _diag = vorp_mod.apply_vorp(shadow, cfg)
    shadow = vorp_mod.assign_tiers(shadow)

    out: dict[str, dict] = {}
    for sp in shadow:
        pid = str(sp.get("player_id"))
        row = {f: sp.get(f) for f in DERIVED_FIELDS}
        row["proj_used"] = sp.get("proj_mean")
        row["covered"] = covered_by_id.get(pid, False)
        out[pid] = row
    return out


def apply_alt_sources(artifact: dict, cfg: dict) -> dict:
    """Mutates artifact['players'] in place, adding the suffixed fields for
    every source in SOURCES. Returns a small diagnostic dict for logging."""
    players = artifact.get("players") or []
    diag = {}
    for key, field in SOURCES.items():
        computed = compute_for_source(players, cfg, field)
        n_covered = sum(1 for v in computed.values() if v["covered"])
        diag[key] = {"field": field, "covered": n_covered, "total": len(players)}
        for p in players:
            pid = str(p.get("player_id"))
            row = computed.get(pid)
            if not row:
                continue
            for f in DERIVED_FIELDS:
                p[f + "_" + key] = row[f]
            p["proj_used_" + key] = row["proj_used"]
            p["covered_" + key] = row["covered"]
    return diag


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--path", default=str(HERE.parent / "public" / "draft_data.json"))
    args = ap.parse_args()

    path = Path(args.path)
    artifact = json.loads(path.read_text())
    cfg = config_schema.load(CONFIG_PATH)

    diag = apply_alt_sources(artifact, cfg)
    # ⚠️ THIS SAID `indent=1` "matches this artifact's own on-disk format exactly
    # (verified byte-for-byte)" AND THAT DECAYED (A, 2026-08-20). It was true
    # when written; the board is now written COMPACT by `build.py:2438`
    # (`separators=(",", ":")`), so indent=1 reformats all 700 players and turns
    # an additive change into a 92,675-line diff — precisely the noise the old
    # comment was there to prevent, with the sign flipped.
    #
    # Checked rather than assumed: re-serialising the committed board with
    # indent=1 does NOT reproduce its bytes; the compact form does. Matching
    # build.py's own writer keeps this an additive diff and keeps the file the
    # browser downloads at its intended size.
    #
    # It matters more than formatting now: this is no longer a by-hand script.
    # It runs inside `draft-data.yml` on every rebuild, because a derived
    # artifact regenerated by hand is stale by definition — which is what
    # refused the board on 2026-08-20 (run 32415261725, sole failure).
    path.write_text(json.dumps(artifact, separators=(",", ":")))

    print("alt_source_rankings: wrote per-source vorp/tier onto "
          f"{len(artifact.get('players') or [])} players in {path}")
    for key, d in diag.items():
        pct = round(100 * d["covered"] / d["total"]) if d["total"] else 0
        print(f"  {key:12s} ({d['field']}): {d['covered']}/{d['total']} covered ({pct}%)")


if __name__ == "__main__":
    main()
