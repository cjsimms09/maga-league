#!/usr/bin/env python3
"""OPENING-SCRIPT MACHINERY — the first-picks script, generated, never typed.

The script I read on draft night for my early live picks: for each pick, the
primary target, the fallbacks with survival percentages, and the NAMED
contingency branches. PRIMARY is the EFFECTIVE keeper board: real Sleeper
designations supersede predicted slates wholesale wherever a team has
designated (the 2026-08-15 data audit caught the old predicted-only PRIMARY
asserting a contradicted slate — Marian's designation freed Bowers into the
pool while two unpredicted keeps stayed draftable-looking); the CONTINGENCY
is the facts-only board, for when the remaining predicted slates bust.

MACHINERY, not prose: everything derives from the inputs (the board artifact,
the predicted keeper slates, my slot), so ANY input rebuild regenerates the
script — that IS the regeneration hook. The output stamps a PROVENANCE
FINGERPRINT (board built_at, slot + its provenance, keeper-slate hashes); the
staleness check compares fingerprints, so a script generated against an old
board or a superseded slate announces itself instead of impersonating fresh
advice. Real-event hooks: slot assignment (Sleeper draft order), keeper designations
landing, and every artifact rebuild all change a fingerprint → regenerate.

THE MECHANISM, NAMED CORRECTLY. This used to say designations land "via
keeper-watch". No such process exists. It was specced, never built, and the name
outlived the plan across five files — documentation describing a plausible
mechanism reads exactly like documentation describing a real one, which is why
rule 6 catches this shape last. What actually runs is the NIGHTLY draft-data
workflow (08:00 UTC daily, plus Tue 11:00 and Sun 13:00): it re-reads live
Sleeper designations through gen_keepers_json.py, rebuilds, and runs this
script. Escalation is site-check.yml's draft_week_alarm — warn at 7 days out,
alarm at 3 — not a watcher.

Doctrine framing: the tournament's first CI verdicts parked every doctrine
(edges under the null; the clear-board finding) — so the enrolled plan is
Balanced Value (the control) until experiment 19's Cory-conditional race says
otherwise, and the script says so honestly rather than inventing a conviction.

Run: python draft/opening_script.py   → draft/data/opening_script.{md,json}
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
BOARD = HERE.parent / "public" / "draft_data.json"
PREDICTED = HERE / "data" / "predicted_keepers.json"
# REAL designations, straight from Sleeper via gen_keepers_json.py. Added
# 2026-08-15 after the data audit caught the script re-asserting a contradicted
# prediction (Marian's designated slate has no Bowers; a predicted-zero team
# designated two): a slate that HAS a designation is a fact and supersedes its
# prediction entirely — the house rule verbatim (Cory, 2026-08-11: "a
# prediction rendered indistinguishably from a fact IS a fact as far as
# behaviour is concerned"). Teams without a designation keep their predicted
# slate, labeled as prediction.
REAL = HERE / "config" / "keepers.json"
SETTINGS = HERE / "data" / "sleeper_league_settings.json"   # owner_id → roster_id join
OUT_MD = HERE / "data" / "opening_script.md"
OUT_JSON = HERE / "data" / "opening_script.json"

import sys
sys.path.insert(0, str(HERE))
from keepers import survival_probability  # noqa: E402

PICKS_TO_SCRIPT = 3          # my first N live picks get full treatment
CANDIDATES_PER_PICK = 5
SURVIVAL_FLOOR = 0.25        # below this a name is a prayer, not a plan


def _hash(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True).encode()).hexdigest()[:12]


def load_real() -> dict:
    """Real designations + the owner→roster join, tolerating absence (early
    August, before anyone designates) by returning empty — the script then
    runs predictions-only exactly as it did before designations existed."""
    real = json.loads(REAL.read_text()) if REAL.exists() else {}
    settings = json.loads(SETTINGS.read_text()) if SETTINGS.exists() else {}
    o2r = {str(k): str(v) for k, v in (settings.get("owner_to_roster") or {}).items()}
    by_roster = {}
    for t in (real.get("teams") or []):
        rid = o2r.get(str(t.get("owner_id")))
        if rid is not None:
            by_roster[rid] = sorted(str(k.get("player_id")) for k in t.get("keepers", [])
                                    if k.get("player_id") is not None)
    return by_roster            # {roster_id: [player_ids]} — designated teams only


def effective_slates(predicted: dict, real_by_roster: dict) -> dict:
    """Per roster: the slate the script should treat as GONE, with provenance.

    A designated team's REAL slate replaces its prediction wholesale — not
    merged: designation is the owner's actual answer, and keeping the
    prediction's extras would re-remove a player the owner demonstrably chose
    NOT to keep (the exact Bowers failure the audit caught).
    @returns {roster_id: {"ids": [...], "source": "designated"|"predicted", "handle": str}}
    """
    out = {}
    for handle, v in (predicted.get("predictions") or {}).items():
        rid = str(v.get("roster_id"))
        pred_ids = sorted(str(k.get("player_id")) for k in v.get("predicted_keepers", [])
                          if k.get("player_id") is not None)
        if rid in real_by_roster:
            out[rid] = {"ids": real_by_roster[rid], "source": "designated", "handle": handle}
        else:
            out[rid] = {"ids": pred_ids, "source": "predicted", "handle": handle}
    # A designated team with no prediction row at all still supersedes.
    for rid, ids in real_by_roster.items():
        if rid not in out:
            out[rid] = {"ids": ids, "source": "designated", "handle": f"roster-{rid}"}
    return out


def supersessions(board: dict, predicted: dict, slates: dict) -> list[dict]:
    """Where a real designation OVERRULED the prediction, in names — the list
    the branch notes print, derived rather than typed so it can never assert
    yesterday's intel (the failure this whole change removes)."""
    name_of = {str(p.get("player_id")): p.get("name") for p in board.get("players", [])}
    pred_by_roster = {
        str(v.get("roster_id")): {str(k.get("player_id")): k.get("name")
                                  for k in v.get("predicted_keepers", [])
                                  if k.get("player_id") is not None}
        for v in (predicted.get("predictions") or {}).values()}
    out = []
    for rid, s in sorted(slates.items()):
        if s["source"] != "designated":
            continue
        pred = pred_by_roster.get(rid, {})
        freed = [pred[i] for i in pred if i not in set(s["ids"])]
        unpredicted = [name_of.get(i, f"id {i}") for i in s["ids"] if i not in pred]
        if freed or unpredicted:
            out.append({"handle": s["handle"], "freed": sorted(filter(None, freed)),
                        "kept_unpredicted": sorted(filter(None, unpredicted))})
    return out


def top_by_vorp(board: dict, ids: set[str], n: int = 2) -> set[str]:
    """The strongest names in a set, by board VORP — the contingency's pins."""
    ranked = sorted((p for p in board.get("players", [])
                     if str(p.get("player_id")) in ids),
                    key=lambda p: -(p.get("vorp") or 0))
    return {str(p["player_id"]) for p in ranked[:n]}


def fingerprint(board: dict, predicted: dict, real_by_roster: dict | None = None) -> dict:
    """What the script was generated FROM. Any change here = regenerate.

    board_content_hash ADDED 2026-08-15, same fix as freeze_baseline.js's
    boardIdentity() and from the same routed evidence (ROUTES.md TO:A,
    2026-08-14): built_at is stamped by the REBUILD and survives in-place
    edits, so a fingerprint carrying only board_built_at called two boards
    31KB apart identical — C reproduced three different boards from git all
    sharing one built_at. The content hash is the identity; built_at stays
    as provenance about the build event (and a rebuild moving it still
    correctly marks the script stale)."""
    return {
        "board_built_at": board.get("built_at"),
        "board_content_hash": _hash(board),
        "my_slot": (board.get("league") or {}).get("my_draft_slot"),
        "my_keepers_hash": _hash(sorted(str(k.get("player_id"))
                                        for k in board.get("kept_players", []))),
        "predicted_slates_hash": _hash({
            o: sorted(str(k.get("player_id")) for k in v.get("predicted_keepers", []))
            for o, v in (predicted.get("predictions") or {}).items()}),
        # A new designation landing (or changing) marks every older script
        # stale even when the predictions file never moved — the audit's exact
        # gap: staleness could see a changed input but not a contradicted one.
        # Designations ARE an input now, so the contradiction becomes a
        # changed input and the existing staleness mechanism catches it.
        # None means "load the committed designations yourself" so two-arg
        # callers (the verify script's freshness check) fingerprint the same
        # inputs generation does; pass {} explicitly to mean "none designated".
        "designated_slates_hash": _hash(load_real() if real_by_roster is None
                                        else real_by_roster),
    }


def is_stale(script_meta: dict, current: dict) -> list[str]:
    """Which fingerprint fields moved since generation. Empty = fresh."""
    old = (script_meta or {}).get("fingerprint") or {}
    return [k for k in current if old.get(k) != current[k]]


def predicted_kept_ids(predicted: dict) -> set[str]:
    out = set()
    for v in (predicted.get("predictions") or {}).values():
        for k in v.get("predicted_keepers", []):
            if k.get("player_id") is not None:
                out.add(str(k["player_id"]))
    return out


def scripted_candidates(board: dict, removed_ids: set[str], my_picks: list[int],
                        pin_ids: set[str] | None = None) -> list[dict]:
    """Per scripted pick: the survival-ranked candidate slate on that board.

    `pin_ids` are the SUBJECT of the branch (e.g. Bowers in the "Bowers available"
    contingency): a pinned player who is eligible and survives to a pick is surfaced
    in that pick's slate even when raw VORP ranks him below the display cap — a branch
    named for a player must show him. The slate length stays within the cap (the pin
    takes the weakest non-pinned slot), so the length contract is preserved."""
    pin_ids = pin_ids or set()
    pool = [p for p in board.get("players", [])
            if str(p.get("player_id")) not in removed_ids and (p.get("proj_mean") or 0) > 0]
    picks_out = []
    for pick in my_picks[:PICKS_TO_SCRIPT]:
        cands = []
        for p in pool:
            adp = p.get("adjusted_adp") or p.get("raw_adp")
            if adp is None:
                continue
            surv = survival_probability(float(adp), pick, p.get("adp_sd"))
            if surv < SURVIVAL_FLOOR:
                continue
            cands.append({"player_id": str(p["player_id"]), "name": p.get("name"),
                          "position": p.get("position"), "vorp": round(p.get("vorp") or 0, 1),
                          "survival": round(surv, 2),
                          "adp": float(adp)})
        # ⚠️ RAW VORP IS NOT COMPARABLE ACROSS POSITIONS WITH SHALLOW POOLS,
        # AND THIS SCRIPT WAS RANKING ON IT ALONE (A, 2026-08-19, three days
        # before the draft; found by reading what the script would actually
        # tell Cory to do).
        #
        # MEASURED: at pick 48 this file made **Los Angeles Rams DEF the
        # TARGET** — VORP 29.0, above Drake Maye 26.0 and Mike Evans 24.6.
        # The war room's own engine, scoring the same board with
        # MEASURED_WEIGHTS, ranks that defense FIFTH: Maye 375.8, Evans
        # 192.8, LaPorta 163.6, Rams DEF 135.5. The market drafts that
        # defense at ADP 128. So the script was scripting an EIGHTY-PICK
        # REACH that the tool it claims to script would never make — the
        # surface-disagrees-with-the-engine class, in the one document read
        # at pick speed.
        #
        # WHY VORP DOES IT: replacement level for DEF/K is computed over a
        # pool ~10 deep, so DEF1 shows a big margin over DEF-replacement
        # while being worth ~14 points over the defense available 80 picks
        # later (Rams 132.0 vs Texans 118.0, ADP 126). A cross-position
        # number that shallow is a scarcity artifact, not value.
        #
        # NOT AN ONESIE CAP. Cory ruled those deleted 2026-08-14 ("delete
        # them, do not fix them") and this does NOT reinstate one: nothing
        # is capped, no roster rule changes, the engine is untouched. This
        # only stops a SCRIPT that cannot see the engine's score from
        # promoting a onesie into a TARGET slot on a number the engine
        # disagrees with — and only while the market says the player is
        # still ~a round away or more.
        ONESIE_POS = {"K", "DEF"}
        REACH_ROUNDS = 1.5           # tolerate ~1.5 rounds of reach, not eight
        teams = int(((board.get("league") or {}).get("teams")) or 10)
        for c in cands:
            reach = c["adp"] - pick            # picks EARLY vs the market
            c["_onesie_reach"] = (c["position"] in ONESIE_POS
                                  and reach > REACH_ROUNDS * teams)
        cands.sort(key=lambda c: (c["_onesie_reach"], -c["vorp"], -c["survival"]))
        slate = cands[:CANDIDATES_PER_PICK]
        if pin_ids:
            ids = {c["player_id"] for c in slate}
            for c in cands:                     # cands is survival-eligible + VORP-sorted
                if c["player_id"] in pin_ids and c["player_id"] not in ids:
                    if len(slate) < CANDIDATES_PER_PICK:
                        slate.append(c)
                    else:
                        slate[-1] = c           # surface the branch's subject in the weakest slot
                    ids.add(c["player_id"])
        picks_out.append({"pick": pick, "candidates": slate})
    return picks_out


def generate(board: dict, predicted: dict, real_by_roster: dict | None = None) -> dict:
    my_picks = (board.get("pick_order") or {}).get("my_picks") or []
    my_kept = {str(k.get("player_id")) for k in board.get("kept_players", [])}
    real_by_roster = real_by_roster if real_by_roster is not None else load_real()
    slates = effective_slates(predicted, real_by_roster)

    # The EFFECTIVE removal set: real designations where they exist (facts),
    # predictions elsewhere (labeled). This is the branch restructure the data
    # audit's §1 demanded: the old PRIMARY removed every PREDICTED keeper, so a
    # contradicted prediction (Marian's Bowers) stayed removed even after the
    # real designation said otherwise, and real designations the predictions
    # missed (Jeanty, Chase Brown) stayed draftable-looking.
    designated_ids = {i for s in slates.values() if s["source"] == "designated" for i in s["ids"]}
    predicted_only_ids = {i for s in slates.values() if s["source"] == "predicted" for i in s["ids"]}
    superseded = supersessions(board, predicted, slates)

    # PRIMARY: the effective board — designations honored, remaining
    # predictions honored, my own keepers out.
    primary = scripted_candidates(board, designated_ids | predicted_only_ids | my_kept, my_picks)
    # CONTINGENCY: predictions bust — only FACTS removed (designations + mine),
    # every predicted-only keeper back in the pool. The branch's subjects are
    # the strongest predicted-only names, pinned so the branch shows the
    # players it exists for.
    pin = top_by_vorp(board, predicted_only_ids, n=2)
    contingency = scripted_candidates(board, designated_ids | my_kept, my_picks,
                                      pin_ids=pin or None)

    # Doctrine enrollment: experiment 19b's Cory-conditional verdict, when it
    # exists, IS the plan (the doctrine-banner spec: winner feeds banner +
    # script + Paths in one pass). Falls back to Balanced when no verdict.
    DOCTRINE_NAMES = {"wr_anchor": "WR Feast", "early_qb": "Early-QB Strike",
                      "elite_te": "Elite-TE Anchor", "zero_rb": "Zero-RB",
                      "hero_rb": "Hero-RB Continuation", "robust_rb": "Robust-RB",
                      "late_qb": "Late-QB", "balanced": "Balanced Value"}
    doctrine = {"enrolled": "Balanced Value (the control)",
                "why": "no Cory-conditional verdict on file; league-general run "
                       "parked every doctrine under the null"}
    cc_path = HERE / "backtest" / "cory-conditional.json"
    if cc_path.exists():
        try:
            cc = json.loads(cc_path.read_text())
            winner = next((r for r in cc.get("leaderboard", [])
                           if r["verdict"].startswith("WINNER")), None)
            if winner:
                nm = DOCTRINE_NAMES.get(winner["archetype"], winner["archetype"])
                runner = next((r for r in cc.get("leaderboard", [])
                               if r is not winner), None)
                doctrine = {"enrolled": nm,
                            "why": f"19b Cory-conditional race: +${winner['mean_edge']:.0f}/season "
                                   f"vs control (CI [{winner['ci95'][0]}, {winner['ci95'][1]}], "
                                   f"{winner['mean_divergence']} contested decisions/draft; v1 money "
                                   f"proxy, Sept quantile re-run pre-registered)"
                                   + (f"; runner-up {DOCTRINE_NAMES.get(runner['archetype'], runner['archetype'])} "
                                      f"+${runner['mean_edge']:.0f}" if runner else "")}
            else:
                doctrine = {"enrolled": "Balanced Value (the control)",
                            "why": "19b race ran; no archetype cleared the paired CI + even-money band"}
        except Exception:
            pass
    designated_n = sum(1 for s in slates.values() if s["source"] == "designated")
    predicted_n = sum(1 for s in slates.values() if s["source"] == "predicted" and s["ids"])
    meta = {
        "generated_from": "opening_script.py — derives from board + REAL designations "
                          "(supersede) + predicted slates (fill); regenerate on any input change",
        "fingerprint": fingerprint(board, predicted, real_by_roster),
        "slot_provenance": "site-claimed — Sleeper draft order pending (regenerates on assignment)",
        "doctrine": doctrine,
        "keeper_basis": {
            "designated_teams": designated_n,
            "predicted_slate_teams": predicted_n,
            "supersessions": superseded,
        },
    }
    return {"meta": meta, "my_picks": my_picks,
            "branches": {
                "primary_effective_board": primary,
                "contingency_predictions_bust": contingency,
            }}


def render_md(script: dict) -> str:
    m = script["meta"]
    fp = m["fingerprint"]
    L = ["# OPENING SCRIPT — generated, never typed", "",
         f"_board `{fp['board_built_at']}` · slot **{fp['my_slot']}** "
         f"({m['slot_provenance']}) · doctrine: **{m['doctrine']['enrolled']}** "
         f"({m['doctrine']['why']})_", "",
         f"My live picks: **{', '.join(str(p) for p in script['my_picks'][:6])}…**", ""]

    def branch(title, note, picks):
        L.append(f"## {title}")
        L.append(f"_{note}_")
        L.append("")
        for entry in picks:
            L.append(f"### Pick {entry['pick']}")
            for i, c in enumerate(entry["candidates"]):
                tag = "**TARGET**" if i == 0 else f"fallback {i}"
                L.append(f"- {tag}: {c['name']} ({c['position']}, VORP {c['vorp']}, "
                         f"{int(c['survival'] * 100)}% survives)")
            L.append("")

    kb = m.get("keeper_basis") or {}
    sup = kb.get("supersessions") or []
    sup_lines = "; ".join(
        f"{s['handle']}: " + " · ".join(
            ([f"freed {', '.join(s['freed'])} (predicted kept — actually in the pool)"] if s['freed'] else [])
            + ([f"designated {', '.join(s['kept_unpredicted'])} (prediction missed)"] if s['kept_unpredicted'] else []))
        for s in sup) or "none — every designation matched its prediction"
    branch("PRIMARY — the effective board (designations are facts, predictions fill the rest)",
           f"{kb.get('designated_teams', 0)} teams designated on Sleeper (their real slates "
           f"supersede intel wholesale), {kb.get('predicted_slate_teams', 0)} still run on "
           f"predicted slates. Supersessions: {sup_lines}.",
           script["branches"]["primary_effective_board"])
    branch("CONTINGENCY — the predicted-only slates bust",
           "Only FACTS removed here (real designations + my three): every keeper we merely "
           "predict returns to the pool. If an undesignated team keeps less than predicted, "
           "this branch is the board you're actually looking at.",
           script["branches"]["contingency_predictions_bust"])

    L.append("_Regenerates on: slot assignment · keeper designations landing "
             "(picked up by the nightly draft-data rebuild) · every board rebuild. "
             "A stale fingerprint announces itself — never trust a script whose "
             "board hash is old._")
    return "\n".join(L)


def main():
    board = json.loads(BOARD.read_text())
    predicted = json.loads(PREDICTED.read_text())
    script = generate(board, predicted)
    OUT_JSON.write_text(json.dumps(script, indent=1))
    OUT_MD.write_text(render_md(script))
    fp = script['meta']['fingerprint']
    print(f"opening script: picks {script['my_picks'][:3]} scripted, "
          f"2 branches, board {fp['board_content_hash']} (built {fp['board_built_at']})")
    print(f"wrote {OUT_MD} + {OUT_JSON}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
