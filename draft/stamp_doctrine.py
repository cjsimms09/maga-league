#!/usr/bin/env python3
"""Re-stamp the ENROLLED DOCTRINE into the built board artifact.

WHY THIS EXISTS, given build.py already stamps it
-------------------------------------------------
The two facts move on different clocks. The board artifact is rebuilt from
nflverse/FFC egress (CI-only, nightly-ish); the doctrine verdict is re-raced by
the Lab on every harness change. Without this, a new verdict would sit in
`cory-conditional.json` waiting for an unrelated projection rebuild to carry it
to the War Room — the banner would render a stale plan and nobody would know.

It is deliberately NOT a second implementation: it calls build.py's own
`_load_doctrine`, so there is exactly one place that decides what "enrolled"
means. It touches ONE key and rewrites the file; every other byte is passed
through untouched. Idempotent — running it twice changes nothing the second
time, and running it with no verdict file clears the block to null (the banner
then honestly reports that nothing is enrolled).

Usage:  python draft/stamp_doctrine.py [--artifact public/draft_data.json]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build import OUT, _load_doctrine, _load_predicted_keepers  # noqa: E402


def stamp(artifact_path: Path) -> tuple[bool, dict | None]:
    """Write the current doctrine verdict into the artifact.

    Returns (changed, block). Missing artifact is not fatal — there is simply
    nothing to stamp yet, which is the normal state before the first build.
    """
    if not artifact_path.exists():
        print(f"  ! {artifact_path} not built yet — nothing to stamp")
        return False, None
    data = json.loads(artifact_path.read_text())
    block = _load_doctrine()
    # The rehearsal keeper slate rides along: same problem, same clock mismatch —
    # it changes when intel lands, not when projections rebuild.
    predicted = _load_predicted_keepers()
    if data.get("doctrine") == block and data.get("predicted_keepers") == predicted:
        print("  doctrine + predicted-keeper blocks already current — no write")
        return False, block
    data["doctrine"] = block
    data["predicted_keepers"] = predicted
    artifact_path.write_text(json.dumps(data, separators=(",", ":")))
    print(f"  stamped doctrine into {artifact_path}")
    return True, block


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--artifact", default=str(OUT), help="path to draft_data.json")
    args = ap.parse_args()
    stamp(Path(args.artifact))
    # Always 0: a missing verdict or a missing artifact is a normal state, not a
    # build failure. The banner's control fallback is the honest outcome.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
