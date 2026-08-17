"""AsOfDataStore — the only data the replay engine is allowed to see.

WHY THIS IS AN OBJECT AND NOT A CONVENTION

A backtest that peeks at the future does not fail. It succeeds, spectacularly,
and reports an edge nobody can collect. One leaked end-of-season stat is enough
to make the whole exercise flattering and worthless, and the leak is invisible
in the output — a 40-point-per-draft gain looks like a triumph whether it came
from insight or from knowing the answer.

So the rule is enforced structurally. The replay engine is handed exactly one
object and has no other data access. Asking it for anything that did not exist
before the replayed draft raises TimeTravelError rather than returning a value.
Discipline is not a control; a raise is.

WHAT IT WILL SERVE, and why each is safe for season S:

  league_config()     the config as it stood in S — scoring and roster shape are
                      set before a draft, not after it
  draft_picks()       the pick sequence of S's own draft. Serving it is safe
                      because the replay consumes it strictly in order: at
                      simulated pick N the engine sees picks 1..N-1 only, which
                      is what a drafter at that moment saw. take_until() is the
                      only accessor and it enforces that.
  keepers()           S's keeper slate, derived from is_keeper on S's own picks.
                      Known before the draft; that is what a keeper IS.
  adp(teams)          FFC's contemporaneous ADP for S via the year parameter.
                      This is the market's pre-draft opinion, published before
                      the draft happened.
  prior_pbp()         play-by-play for seasons STRICTLY BEFORE S.

WHAT IT WILL NEVER SERVE for season S: S's weekly stats, S's final standings,
S's brackets or final rosters, and any artifact built from them. Grading needs
exactly those, which is why grading lives in a SEPARATE object (GradingStore)
that the replay engine is never given a reference to.
"""
from __future__ import annotations


class TimeTravelError(RuntimeError):
    """Raised when the replay asks for something that did not exist yet."""


class AsOfDataStore:
    def __init__(self, season: int, history: dict, *, adp_loader=None, pbp_loader=None):
        self.season = int(season)
        self._history = history
        self._adp_loader = adp_loader
        self._pbp_loader = pbp_loader
        self._season_row = self._find_season(self.season)

    # -- internals -----------------------------------------------------------
    def _find_season(self, year: int) -> dict:
        for s in (self._history.get("seasons") or []):
            if int(s.get("season", -1)) == int(year):
                return s
        raise KeyError(f"season {year} is not in the history export")

    def _forbid(self, what: str, detail: str = "") -> None:
        raise TimeTravelError(
            f"{what} for {self.season} is not knowable before the {self.season} draft. "
            + (detail or "Grading data belongs in GradingStore, which the replay "
                         "engine is deliberately not given.")
        )

    # -- allowed -------------------------------------------------------------
    def league_config(self) -> dict:
        """Scoring and roster shape as they stood that year."""
        row = self._season_row
        return {
            "season": self.season,
            "scoring": dict(row.get("scoring_settings") or {}),
            "roster_positions": list(row.get("roster_positions") or []),
            "teams": len(row.get("owners") or []) or None,
        }

    def draft(self) -> dict:
        drafts = self._season_row.get("drafts") or []
        real = [d for d in drafts if (d.get("picks") or [])]
        if not real:
            raise KeyError(f"no draft with picks recorded for {self.season}")
        return real[0]

    def take_until(self, pick_no: int) -> list:
        """Picks 1..pick_no-1 — exactly what a drafter at pick_no had seen.

        The ONLY way to read the draft. Returning the whole list and trusting
        callers to slice it correctly is the same class of mistake this file
        exists to prevent, one layer down.
        """
        if pick_no < 1:
            raise ValueError("pick numbers are 1-indexed")
        picks = sorted(self.draft().get("picks") or [], key=lambda p: p.get("pick_no") or 0)
        return [p for p in picks if (p.get("pick_no") or 0) < pick_no]

    def pick_at(self, pick_no: int) -> dict | None:
        """What was ACTUALLY taken at pick_no.

        Allowed, and load-bearing: the replay must remove the real pick from the
        board to advance the draft, or it diverges from history after one pick
        and stops being a replay. It reveals nothing about outcomes — only that
        this manager took this player, which the next drafter also saw.
        """
        for p in (self.draft().get("picks") or []):
            if (p.get("pick_no") or 0) == pick_no:
                return p
        return None

    def keepers(self) -> list:
        """Keeper picks, unioned across ALL the season's draft records.

        NOT just the main draft's flags: 2023 keeps its keepers in a
        SEPARATE 30-pick ledger draft whose picks all carry is_keeper, while
        the 150-pick main draft carries none — so reading only draft() gave
        2023 an empty keeper slate and every 2023 replay decided keeper
        slots as if they were live picks (found by the live-edge engine
        replay's keeper-consistency pin, 2026-08-17). The union covers both
        shapes, exactly as draft_replay_2025.season_draft already does.
        Knowable pre-draft either way — that is what a keeper IS."""
        out, seen = [], set()
        for d in (self._season_row.get("drafts") or []):
            for p in (d.get("picks") or []):
                pid = str(p.get("player_id"))
                if p.get("is_keeper") and pid not in seen:
                    seen.add(pid)
                    out.append(p)
        return out

    def adp(self, teams: int, fmt: str = "half-ppr") -> dict:
        """FFC's ADP as published for THIS season — the year parameter."""
        if self._adp_loader is None:
            raise TimeTravelError(
                "no adp_loader was supplied; refusing to fall back to current-year "
                "ADP, which would be the exact leak this class exists to prevent")
        return self._adp_loader(fmt=fmt, teams=teams, year=self.season)

    def prior_pbp(self, seasons: list) -> object:
        """Play-by-play, strictly before the replayed season."""
        bad = [s for s in seasons if int(s) >= self.season]
        if bad:
            self._forbid(f"play-by-play for {bad}",
                         "prior_pbp only serves seasons strictly before the replay season.")
        if self._pbp_loader is None:
            raise TimeTravelError("no pbp_loader was supplied")
        return self._pbp_loader(seasons)

    # -- forbidden, explicitly and by name -----------------------------------
    # Named methods rather than a catch-all, so the refusal shows up in an IDE
    # and in dir(), and so the error explains WHY rather than just failing.
    def weekly_stats(self, season: int | None = None):
        yr = self.season if season is None else int(season)
        if yr >= self.season:
            self._forbid(f"weekly stats for {yr}")
        raise TimeTravelError(
            "prior-season stats are legitimate, but must come through a "
            "walk-forward projection fitted only on seasons before the replay "
            "season — not read here ad hoc.")

    def final_rosters(self):
        self._forbid("final rosters")

    def brackets(self):
        self._forbid("playoff brackets")

    def standings(self):
        self._forbid("standings")

    def actual_points(self, *_a, **_k):
        self._forbid("actual fantasy points")

    def outcomes(self, *_a, **_k):
        self._forbid("season outcomes")


class GradingStore:
    """Everything the replay may NOT see, for scoring the replay afterwards.

    Deliberately a separate class with no reference held by the replay engine.
    If grading and replay shared an object, the only thing standing between the
    backtest and a leak would be which method somebody happened to call.
    """

    def __init__(self, season: int, weekly_loader=None, scoring: dict | None = None):
        self.season = int(season)
        self._weekly_loader = weekly_loader
        self.scoring = dict(scoring or {})

    def rest_of_season_points(self, player_ids, from_week: int = 1) -> dict:
        if self._weekly_loader is None:
            raise RuntimeError("GradingStore needs a weekly_loader to grade anything")
        return self._weekly_loader(self.season, player_ids, from_week, self.scoring)
