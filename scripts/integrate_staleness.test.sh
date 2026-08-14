#!/usr/bin/env bash
# TERRITORY: A
# TEST — integrate.sh REFUSES a branch with unpushed local commits.
#
# THE INCIDENT (C, 2026-08-11). A fix to territory-check.sh was committed and not
# pushed. `integrate.sh <branch> C` merged `origin/<branch>` — the commit BEFORE
# the fix — ran both suites on that stale tree, printed "Suites green LOCALLY",
# and merged to main. What landed was a guard that refused any second argument,
# WITHOUT the commit that fixed it, so every `territory-check.sh <side> --range`
# call inside integrate.sh was refused for every lane until someone noticed.
#
# NOTHING REPORTED A PROBLEM. The run printed the same success it prints for a
# correct integration. That is the failure class this repo keeps naming — a step
# that reports success for work it did not do — and it is the one shape a habit
# cannot fix, because a lapsed habit leaves no evidence behind.
#
# ── WHAT THIS TEST HAS TO PROVE, and why the second half is the harder half ──
#
# 1. The guard FIRES when local is ahead of the remote, and exits before merging.
# 2. It is SILENT when local matches the remote — the overwhelmingly common case.
# 3. It is SILENT when there is no local branch at all — the normal shape for
#    another lane's work, where only the remote ref exists and there is nothing
#    stale about a branch you have never checked out. A guard that refused those
#    would block every C integration, which is most of them.
#
# (3) is the one that would make this a net loss if wrong, so it is asserted
# rather than reasoned about.
#
# Isolated in a throwaway repo with a real file:// remote, so a push and a fetch
# are genuine and the never-pushed case is genuinely never-pushed.
#
# Run: bash scripts/integrate_staleness.test.sh
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
pass=0; fail=0
ck() { if [ "$1" = "$2" ]; then echo "PASS  $3"; pass=$((pass+1));
       else echo "FAIL  $3 (got exit $1, want $2)"; fail=$((fail+1)); fi; }
ckg() { if grep -q "$1" "$2"; then echo "PASS  $3"; pass=$((pass+1));
        else echo "FAIL  $3 — output had no /$1/"; sed 's/^/       /' "$2" | head -12; fail=$((fail+1)); fi; }
ckng() { if grep -q "$1" "$2"; then echo "FAIL  $3 — output contained /$1/"; fail=$((fail+1));
         else echo "PASS  $3"; pass=$((pass+1)); fi; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# ── a real bare remote, so push/fetch are not simulated ──────────────────────
git init -q --bare "$TMP/remote.git"
git init -q "$TMP/work"
cd "$TMP/work"
git config user.email t@t; git config user.name t; git config commit.gpgsign false
git remote add origin "$TMP/remote.git"
mkdir -p scripts
cp "$HERE/integrate.sh" scripts/integrate.sh
# territory-check is invoked right AFTER the guard. A stub that always passes
# keeps this test about the guard and lets the not-fired arms run past it.
printf '#!/usr/bin/env bash\nexit 0\n' > scripts/territory-check.sh
chmod +x scripts/*.sh
echo base > file.txt
git add -A; git commit -qm base
git branch -M main
git push -q -u origin main

git checkout -q -b feature
echo "the commit that gets pushed" > file.txt
git commit -qam "pushed work"
git push -q -u origin feature

# ── 1. THE CONTROL FIRST: in sync, the guard must not fire ──────────────────
# Asserted BEFORE the fail arm, because a guard that refuses everything would
# "pass" the fail arm for the wrong reason.
git checkout -q main
bash scripts/integrate.sh feature C > "$TMP/sync.out" 2>&1
ckng "REFUSING" "$TMP/sync.out" "IN SYNC — the guard stays silent"
ckg  "matches origin/feature" "$TMP/sync.out" "and says so, so a correct run is visibly checked"
ckg  "== territory" "$TMP/sync.out" "and execution reaches the NEXT step rather than stopping here"

# ── 2. THE INCIDENT, RECONSTRUCTED ──────────────────────────────────────────
git checkout -q feature
echo "THE FIX — committed, never pushed" > file.txt
git commit -qam "the fix that was not pushed"
git checkout -q main
MAIN_BEFORE="$(git rev-parse main)"
bash scripts/integrate.sh feature C > "$TMP/stale.out" 2>&1
ck $? 2 "UNPUSHED COMMIT — integrate REFUSES instead of merging a stale branch"
ckg "REFUSING: local 'feature' has 1 commit" "$TMP/stale.out" "it says how many and which branch"
ckg "the fix that was not pushed" "$TMP/stale.out" "and NAMES the commit that would have been silently dropped"
ckg "git push -u origin feature" "$TMP/stale.out" "and gives the one command that fixes it"

# THE PART THAT ACTUALLY MATTERED IN THE INCIDENT: main must be untouched.
ck "$([ "$(git rev-parse main)" = "$MAIN_BEFORE" ] && echo 0 || echo 1)" 0 \
  "main is EXACTLY where it was — the refusal happens before anything merges"
ckng "Suites green" "$TMP/stale.out" "and it never reports success"
ckng "merge committed" "$TMP/stale.out" "and no merge was committed"

# ── 3. NO LOCAL BRANCH AT ALL — the normal shape for another lane's work ────
# If this arm refuses, the guard blocks nearly every real integration and is a
# net loss regardless of how well it catches the incident.
git branch -D feature -q 2>/dev/null   # keep origin/feature, drop the local ref
bash scripts/integrate.sh feature C > "$TMP/nolocal.out" 2>&1
ckng "REFUSING" "$TMP/nolocal.out" "NO LOCAL REF — a branch you never checked out is not stale"
ckg  "== territory" "$TMP/nolocal.out" "and it proceeds normally"
ckng "matches origin/feature" "$TMP/nolocal.out" "and it does not claim to have checked something it could not"

# ── 4. BEHIND, NOT AHEAD — also not stale ───────────────────────────────────
# The remote having MORE than local is fine: the remote is what gets merged, and
# it is the newer thing. Counting `git rev-list --count A...B` symmetrically —
# an easy slip — would refuse this and be wrong.
git checkout -q -B feature "$(git rev-parse origin/feature~1)"
git checkout -q main
bash scripts/integrate.sh feature C > "$TMP/behind.out" 2>&1
ckng "REFUSING" "$TMP/behind.out" "LOCAL BEHIND REMOTE — not stale, since the REMOTE is what is merged"

echo
echo "$pass/$((pass+fail)) checks passed"
[ "$fail" = 0 ] || { echo "FAILED"; exit 1; }
cat <<'EOF'

WHAT THIS GUARANTEES: an integration cannot silently merge a branch older than
the one you just committed to, main is untouched when it refuses, and the refusal
names the dropped commit rather than asking you to work out what happened.
WHAT IT DOES NOT: check anything about the CONTENT of the branch. A pushed branch
can still be wrong; this only closes the case where the run and the author
disagree about which commits are even in play.
EOF
