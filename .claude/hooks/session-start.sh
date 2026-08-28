#!/bin/bash
# SessionStart hook — thin gate over draft/tools/restore_container.sh.
#
# The work is in the TOOL, not here, and that split is the whole point
# (register 384). A recreated container is a MID-SESSION event: this hook does
# not fire for it, measured — the container recreated an hour after this hook
# shipped, lxml was missing again, and the hook had not run. So the recovery
# has to be callable at any moment by anyone:
#
#     bash draft/tools/restore_container.sh
#
# This hook exists so a session that starts on a cold container starts level.
# It is not the fix on its own and must not be mistaken for one.
set -euo pipefail

# Web only. A local checkout is not snapshot-restored and does not need this.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
exec bash "$ROOT/draft/tools/restore_container.sh"
