"""One gsis_id -> sleeper_id crosswalk, behind one function.

WHY THIS EXISTS, STATED AS THE FAILURE IT ENDS. On 2026-08-21 the 00:22Z board
build succeeded with `opportunity_coverage 1.0`; the 08:49Z build hit
`AttributeError: module 'nfl_data_py' has no attribute 'import_ids'`. Upstream
moved between those two runs, under a requirement that pins only
`nfl_data_py>=0.3.2`. The repo had **33 flat `nfl.import_ids()` calls across 18
product-path files** and exactly one of them — `practice_participation.py` —
was hardened, because it is the only one that fails loudly. `build.py` catches
the same exception and keeps building on Sleeper's own `gsis_id` field, which
covers 221 of 761 keys.

Three sources, tried in order, and the third is the one that cannot be renamed:

1. `nfl_data_py.import_ids()` — the maintained call, when it exists.
2. `nfl_data_py.import_players()` — the rename candidate. **MEASURED
   2026-08-21 on 0.3.3: 25,049 rows carrying `gsis_id` and NO `sleeper_id`.**
   So it is tried, not trusted: the column check below rejects it and falls
   through rather than returning a crosswalk with a missing half.
3. `DYNASTYPROCESS_IDS_URL` read directly. This is not a guess about what the
   package does — `import_ids` in 0.3.3 IS a `pandas.read_csv` of this exact
   URL. Fetched directly 2026-08-21: **12,480 rows, both id columns present,
   6,188 carrying both.** No package API in the path, so an upstream rename
   cannot reach it.

`crosswalk()` returns {gsis_id: sleeper_id} and raises only when all three
fail; `attempts()` on the raised error says which shapes were tried and why
each was rejected, so a future rename reads as a list rather than a mystery.
"""

from __future__ import annotations

#: The file `nfl_data_py.import_ids()` itself reads. Kept as a constant so the
#: last resort is greppable and so a test can assert the two agree.
DYNASTYPROCESS_IDS_URL = (
    "https://raw.githubusercontent.com/dynastyprocess/data/master/files/"
    "db_playerids.csv"
)

REQUIRED_COLUMNS = ("gsis_id", "sleeper_id")


class CrosswalkUnavailable(RuntimeError):
    """Every source failed. Carries the per-source reason, not just a message."""

    def __init__(self, tried: list):
        self.tried = list(tried)
        super().__init__(
            "no usable gsis->sleeper crosswalk — tried " + "; ".join(self.tried)
            + ". Add the new shape to id_crosswalk._SOURCES rather than pinning "
              "nfl_data_py backwards."
        )


def _missing(frame) -> list:
    cols = set(map(str, getattr(frame, "columns", [])))
    return [c for c in REQUIRED_COLUMNS if c not in cols]


def frame(tried: list | None = None):  # pragma: no cover  (egress)
    """The raw crosswalk frame, from whichever source answers first."""
    tried = tried if tried is not None else []

    try:
        import nfl_data_py as nfl
    except Exception as exc:                                # noqa: BLE001
        nfl = None
        tried.append("nfl_data_py (%s: %s)" % (type(exc).__name__, exc))

    if nfl is not None:
        for name in ("import_ids", "import_players"):
            fn = getattr(nfl, name, None)
            if fn is None:
                tried.append(name + " (absent)")
                continue
            try:
                df = fn()
            except Exception as exc:                        # noqa: BLE001
                tried.append("%s (%s: %s)" % (name, type(exc).__name__, exc))
                continue
            gaps = _missing(df)
            if gaps:
                # MEASURED, not defensive: import_players() really does lack
                # sleeper_id. Falling through is the point of this branch.
                tried.append("%s (no %s)" % (name, ",".join(gaps)))
                continue
            return df, name

    try:
        import pandas
        df = pandas.read_csv(DYNASTYPROCESS_IDS_URL, low_memory=False)
    except Exception as exc:                                # noqa: BLE001
        tried.append("dynastyprocess csv (%s: %s)" % (type(exc).__name__, exc))
        raise CrosswalkUnavailable(tried) from exc

    gaps = _missing(df)
    if gaps:
        tried.append("dynastyprocess csv (no %s)" % ",".join(gaps))
        raise CrosswalkUnavailable(tried)
    return df, "dynastyprocess_csv"


def to_mapping(df) -> dict:
    """gsis_id -> sleeper_id, dropping either-side blanks and float tails.

    Sleeper ids arrive from CSV as floats ("4046.0"); the board keys by the
    integer string, so the tail is stripped here rather than at each caller.
    """
    out = {}
    for g, sid in zip(df["gsis_id"], df["sleeper_id"]):
        g, sid = str(g).strip(), str(sid).strip()
        if not g or not sid or g.lower() == "nan" or sid.lower() == "nan":
            continue
        out[g] = sid.split(".")[0]
    return out


def crosswalk() -> dict:  # pragma: no cover  (egress)
    tried: list = []
    df, source = frame(tried)
    mapping = to_mapping(df)
    if not mapping:
        tried.append("%s (0 usable pairs)" % source)
        raise CrosswalkUnavailable(tried)
    return mapping


def crosswalk_with_source() -> tuple:  # pragma: no cover  (egress)
    """Same, but says which source answered — so a degraded run is visible."""
    tried: list = []
    df, source = frame(tried)
    mapping = to_mapping(df)
    if not mapping:
        tried.append("%s (0 usable pairs)" % source)
        raise CrosswalkUnavailable(tried)
    return mapping, source, tried
