# TERRITORY: A
"""PACE OF PLAY — the study. Preregistered 2026-08-16, graded here.

Preregistration: `draft/audit/pace_of_play_prereg_2026-08-16.md`, committed
before `fetch_team_pace.py` and before this file. Verdict:
`draft/audit/pace_of_play_2026-08-16.md`.

Four questions, in the order the prereg fixes, and the FIRST ONE CAN END THE
STUDY:

  §3 GATE — is pace persistent year over year? At draft time all we have is
     last year. If pace(Y) does not predict pace(Y+1) then pace is useless for
     a draft board however well it explains the past. Pooled Spearman CI
     including 0 ⇒ STOP, and that is the finding.
  §4 — is it orthogonal to `implied_team_totals`, the tilt already in the
     model? A pace measure that restates "good offences score more" adds
     nothing over what v5 already tilts on.
  §5 — does a pace tilt beat `own_v6` leak-free, on `model_accuracy_v6.json`'s
     own cells, with ordering reported separately from MAE?
  §6 — which real players does it move, and by how much?

NOTHING IN THE MODEL IS TOUCHED. `own_model_v5.py`, `own_model_v6.py`,
`fetch_component_stats.py`, `build.py`, `own_projections.py`, `vorp.py`,
`projections.py` are imported READ-ONLY. The candidate arm is built by
multiplying v5's returned component opinion — arithmetically identical to
applying the tilt inside v5's own loop, because the tilt is the last
multiplicative step before a clamp on a non-negative quantity, and that
identity is asserted by a test rather than assumed.

Run: python draft/backtest/pace_study.py
Writes draft/backtest/pace_study.json.
"""
from __future__ import annotations

import json
import math
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

import fetch_component_stats as FCS  # noqa: E402
import fetch_team_pace as TP  # noqa: E402

OUT = HERE / "pace_study.json"

#: Prereg §3 — every metric whose persistence is measured.
METRICS = ("plays_per_game", "neutral_plays_per_game", "lax_plays_per_game",
           "neutral_sec_per_play", "neutral_sec_per_play_clockrunning",
           "neutral_pass_rate", "proe", "neutral_share")

#: Prereg §3 — the four transitions.
TRANSITIONS = ((2021, 2022), (2022, 2023), (2023, 2024), (2024, 2025))

#: Prereg §4 — the target seasons whose week-1 implied totals are read.
TARGET_SEASONS = (2022, 2023, 2024, 2025)

#: Prereg §3 — persistence bands.
PERSISTENCE_FLOOR = 0.30

#: Prereg §4 — orthogonality bands.
RESTATEMENT_BAND = 0.70
OVERLAP_BAND = 0.40

BOOTSTRAP_DRAWS = 10000
BOOTSTRAP_SEED = 20260816


# ── statistics (no scipy in this environment; written out, tested) ───────────

def _ranks(xs: list) -> list:
    """Average ranks, ties shared — the only tie rule that leaves Spearman
    equal to Pearson-on-ranks."""
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    out = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        r = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            out[order[k]] = r
        i = j + 1
    return out


def pearson(xs: list, ys: list):
    n = len(xs)
    if n < 3:
        return None
    mx, my = sum(xs) / n, sum(ys) / n
    sxy = sum((a - mx) * (b - my) for a, b in zip(xs, ys))
    sxx = sum((a - mx) ** 2 for a in xs)
    syy = sum((b - my) ** 2 for b in ys)
    if sxx <= 0 or syy <= 0:
        return None
    return sxy / math.sqrt(sxx * syy)


def spearman(xs: list, ys: list):
    return pearson(_ranks(xs), _ranks(ys))


def fisher_ci(r, n, conf=1.96):
    """95% CI for one correlation. Reported WIDE rather than described as
    tight: n is 32 teams and nothing makes that bigger."""
    if r is None or n < 4 or abs(r) >= 1.0:
        return None
    z = 0.5 * math.log((1 + r) / (1 - r))
    se = 1.0 / math.sqrt(n - 3)
    lo, hi = z - conf * se, z + conf * se
    return [round(math.tanh(lo), 4), round(math.tanh(hi), 4)]


def _atanh(r):
    r = max(-0.999999, min(0.999999, r))
    return 0.5 * math.log((1 + r) / (1 - r))


def cluster_bootstrap(pairs_by_unit: dict, stat, draws=BOOTSTRAP_DRAWS,
                      seed=BOOTSTRAP_SEED):
    """Pooled estimate + 95% CI, RESAMPLING FRANCHISES, not observations.

    A franchise contributes up to four transitions. Treating those as
    independent narrows the CI on a sample that is really 32 wide, not 128 —
    the species of overconfidence that makes a small-n finding look settled.
    """
    units = sorted(pairs_by_unit)
    if len(units) < 4:
        return None
    point = stat([p for u in units for p in pairs_by_unit[u]])
    if point is None:
        return None
    rng = random.Random(seed)
    vals = []
    for _ in range(draws):
        drawn = [rng.choice(units) for _ in units]
        sample = [p for u in drawn for p in pairs_by_unit[u]]
        v = stat(sample)
        if v is not None:
            vals.append(v)
    if len(vals) < draws // 2:
        return None
    vals.sort()
    lo = vals[int(0.025 * len(vals))]
    hi = vals[min(len(vals) - 1, int(0.975 * len(vals)))]
    return {"point": round(point, 4), "ci95": [round(lo, 4), round(hi, 4)],
            "draws": len(vals), "units": len(units)}


def _pooled_stat(kind):
    """Mean Fisher-z over transitions, back-transformed — the prereg's pooled
    estimator. Pooling the raw r's instead would weight a transition by
    nothing in particular and is not what was registered."""
    fn = spearman if kind == "spearman" else pearson

    def stat(sample):
        by_t: dict = {}
        for tr, x, y in sample:
            by_t.setdefault(tr, ([], []))
            by_t[tr][0].append(x)
            by_t[tr][1].append(y)
        zs = []
        for tr, (xs, ys) in by_t.items():
            r = fn(xs, ys)
            if r is not None:
                zs.append(_atanh(r))
        if not zs:
            return None
        return math.tanh(sum(zs) / len(zs))
    return stat


# ── §3 the persistence gate ──────────────────────────────────────────────────

def _implied_series(season: int) -> dict:
    """Week-1 implied team total — used ONLY as the persistence instrument's
    positive control (§3a). Never as a pace metric."""
    return FCS.implied_team_totals(season, 1, 1)


def persistence(metrics=METRICS, transitions=TRANSITIONS,
                extra: dict | None = None) -> dict:
    """`extra` maps a control name to a `season -> {team: value}` callable, so
    the SAME estimator that reports a null can be shown reporting a positive.

    SESSION-A clause 13f, and the trigger that enforces it: when a result is an
    ABSENCE, state what the instrument would have shown if the thing were
    present. A pooled-CI-includes-zero on team volume is worth nothing until
    this same estimator, on this same 32 teams and these same four
    transitions, is shown finding persistence where persistence is known to
    live.
    """
    out = {}
    sources = {m: (lambda y, m=m: TP.team_pace(y, m)) for m in metrics}
    sources.update(extra or {})
    for m in sources:
        per_t, by_team = [], {}
        for y0, y1 in transitions:
            a, b = sources[m](y0), sources[m](y1)
            teams = sorted(set(a) & set(b))
            xs = [a[t] for t in teams]
            ys = [b[t] for t in teams]
            rp, rs = pearson(xs, ys), spearman(xs, ys)
            per_t.append({
                "transition": f"{y0}->{y1}", "n": len(teams),
                "pearson": None if rp is None else round(rp, 4),
                "pearson_ci95": fisher_ci(rp, len(teams)),
                "spearman": None if rs is None else round(rs, 4),
                "spearman_ci95": fisher_ci(rs, len(teams)),
            })
            for t in teams:
                by_team.setdefault(t, []).append((f"{y0}->{y1}", a[t], b[t]))
        pooled_s = cluster_bootstrap(by_team, _pooled_stat("spearman"))
        pooled_p = cluster_bootstrap(by_team, _pooled_stat("pearson"))
        verdict = "unmeasurable"
        if pooled_s:
            lo, hi = pooled_s["ci95"]
            if lo <= 0 <= hi:
                verdict = "NOT PERSISTENT"
            elif abs(pooled_s["point"]) < PERSISTENCE_FLOOR:
                verdict = "WEAKLY PERSISTENT"
            else:
                verdict = "PERSISTENT"
        out[m] = {"per_transition": per_t, "pooled_spearman": pooled_s,
                  "pooled_pearson": pooled_p, "verdict": verdict}
    return out


# ── §4 orthogonality to the implied team total ───────────────────────────────

def orthogonality(metrics=METRICS, targets=TARGET_SEASONS) -> dict:
    out = {}
    for m in metrics:
        per_s, by_team = [], {}
        for y in targets:
            pace = TP.team_pace(y - 1, m)
            imp = FCS.implied_team_totals(y, 1, 1)
            teams = sorted(set(pace) & set(imp))
            xs = [pace[t] for t in teams]
            ys = [imp[t] for t in teams]
            rp, rs = pearson(xs, ys), spearman(xs, ys)
            per_s.append({
                "target_season": y, "pace_from": y - 1, "n": len(teams),
                "pearson": None if rp is None else round(rp, 4),
                "pearson_ci95": fisher_ci(rp, len(teams)),
                "spearman": None if rs is None else round(rs, 4),
            })
            for t in teams:
                by_team.setdefault(t, []).append((y, pace[t], imp[t]))
        pooled_p = cluster_bootstrap(by_team, _pooled_stat("pearson"))
        pooled_s = cluster_bootstrap(by_team, _pooled_stat("spearman"))
        band = "unmeasurable"
        if pooled_p:
            a = abs(pooled_p["point"])
            band = ("RESTATEMENT" if a >= RESTATEMENT_BAND else
                    "SUBSTANTIAL OVERLAP" if a >= OVERLAP_BAND else
                    "SUBSTANTIALLY ORTHOGONAL")
        out[m] = {"per_season": per_s, "pooled_pearson": pooled_p,
                  "pooled_spearman": pooled_s, "band": band}
    return out


# ── §4b the mechanism chain ──────────────────────────────────────────────────

#: Prereg §2's causal story, stated as two links that must BOTH hold:
#: faster tempo ⇒ more plays (within a season), and last season's tempo ⇒ this
#: season's plays. Both are computed from pace alone — NO fantasy outcome is
#: read here, so nothing in this section can be tuned toward a result.
MECHANISM_VOLUME = ("neutral_plays_per_game", "plays_per_game")


def mechanism(tempo="neutral_sec_per_play", volumes=MECHANISM_VOLUME) -> dict:
    """Does tempo actually buy plays — same season, and NEXT season?

    The chain a draft board needs is `tempo(Y-1) -> plays(Y)`. Tempo
    persisting is necessary and NOT sufficient: a perfectly persistent
    coaching habit that does not move next year's snap count is a fact about
    coaches, not an edge. This link is measured BEFORE any fantasy point is
    touched, so a break here ends the causal story on its own evidence.
    """
    out = {}
    for vol in volumes:
        same, ahead = {}, {}
        for y in (2021, 2022, 2023, 2024, 2025):
            t, v = TP.team_pace(y, tempo), TP.team_pace(y, vol)
            for team in sorted(set(t) & set(v)):
                same.setdefault(team, []).append((y, t[team], v[team]))
        for y0, y1 in TRANSITIONS:
            t, v = TP.team_pace(y0, tempo), TP.team_pace(y1, vol)
            for team in sorted(set(t) & set(v)):
                ahead.setdefault(team, []).append((f"{y0}->{y1}", t[team], v[team]))
        out[vol] = {
            "same_season": cluster_bootstrap(same, _pooled_stat("pearson")),
            "next_season": cluster_bootstrap(ahead, _pooled_stat("pearson")),
            "expected_sign": ("NEGATIVE — fewer seconds per play means faster, "
                              "and faster must mean more plays or the whole "
                              "causal story is wrong"),
        }
    return out


def run() -> dict:
    """The whole artifact, no arguments — the shape
    `draft/data/artifact_registry.json` requires so
    `draft/tools/check_artifact_freshness.py` can regenerate it. Split out of
    `main()` after the checker refused this module by name for not having it."""
    return {
        "_territory": "TERRITORY: A — produced by draft/backtest/pace_study.py",
        "_note": ("Pace of play, preregistered in "
                  "draft/audit/pace_of_play_prereg_2026-08-16.md (committed "
                  "before the store and before this file). §3 is a GATE: a "
                  "pooled persistence CI including 0 ends the study, because a "
                  "draft board can only ever read last season."),
        "preregistration": "draft/audit/pace_of_play_prereg_2026-08-16.md",
        "bands": {"persistence_floor": PERSISTENCE_FLOOR,
                  "restatement": RESTATEMENT_BAND, "overlap": OVERLAP_BAND},
        "bootstrap": {"draws": BOOTSTRAP_DRAWS, "seed": BOOTSTRAP_SEED,
                      "unit": "franchise (team code), so a franchise's four "
                              "transitions move together and the CI is not "
                              "narrowed by treating them as independent"},
        "instrument_control": ("SESSION-A 13f — `implied_team_total_wk1` is "
                               "NOT a pace metric. It is the positive control: "
                               "the same estimator, the same 32 franchises, the "
                               "same four transitions, on a quantity whose "
                               "year-over-year persistence nobody disputes. A "
                               "null on team volume means nothing unless this "
                               "row is clearly positive."),
        "persistence": persistence(
            extra={"implied_team_total_wk1 (CONTROL, not pace)": _implied_series}),
        "orthogonality": orthogonality(),
        "mechanism": mechanism(),
    }


def main() -> None:
    doc = run()
    OUT.write_text(json.dumps(doc, indent=1))
    print(f"wrote {OUT.name}")
    print("\n§3 PERSISTENCE (pooled Spearman, cluster-bootstrap 95% CI):")
    for m, r in doc["persistence"].items():
        p = r["pooled_spearman"]
        s = f"{p['point']:+.3f}  CI [{p['ci95'][0]:+.3f}, {p['ci95'][1]:+.3f}]" if p else "—"
        print(f"  {m:44s} {s}   {r['verdict']}")
        print("      per transition: " + "  ".join(
            f"{t['transition']}={t['spearman']:+.2f}" for t in r["per_transition"]))
    print("\n§4 ORTHOGONALITY vs week-1 implied team total (pooled Pearson):")
    for m, r in doc["orthogonality"].items():
        p = r["pooled_pearson"]
        s = f"{p['point']:+.3f}  CI [{p['ci95'][0]:+.3f}, {p['ci95'][1]:+.3f}]" if p else "—"
        print(f"  {m:38s} {s}   {r['band']}")
    print("\n§4b MECHANISM — does tempo (neutral_sec_per_play) buy plays?"
          "  (expected sign NEGATIVE)")
    for vol, r in doc["mechanism"].items():
        for when in ("same_season", "next_season"):
            p = r[when]
            s = (f"{p['point']:+.3f}  CI [{p['ci95'][0]:+.3f}, {p['ci95'][1]:+.3f}]"
                 if p else "—")
            print(f"  tempo(Y) vs {vol:24s} [{when:12s}] {s}")


if __name__ == "__main__":
    main()
