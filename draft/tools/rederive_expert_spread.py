# TERRITORY: C
"""Re-derives `expert_spread_2026.json` from the just-captured
`fp_expert_ranks_2026.json`. Register 79: a fresh RAW capture with no fresh
DERIVED artifact is the same staleness one file downstream --
`expert_spread_2026.json` is what `surface_parity.js` checks and what Cory
reads at the table. Network-free -- reads only the file the capture step
already wrote.

Run: python3 draft/tools/rederive_expert_spread.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))


def main() -> None:  # pragma: no cover  (thin CLI wrapper around build())
    import expert_spread_artifact as E

    d = E.build()
    print(f"wrote expert_spread_2026.json: {len(d['players'])} players, "
         f"scraped_at {d['scraped_at']}")


if __name__ == "__main__":
    main()
