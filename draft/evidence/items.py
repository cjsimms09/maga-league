"""Evidence items 5, 6, 7 and 9, against a REAL build.

5 — name-match report, Sleeper<->FFC and Sleeper<->GSIS, all top-150 failures
6 — the raw joined record for 5 named players
7 — match-rate percentages on the top 200, and the fail-loud threshold
9 — fresh live scoring_settings vs the stored config

These are the items the review called "the difference between a no and a yes",
and every one of them was CANNOT PRODUCE for the same reason: an offline build
has no FFC payload and no nflverse rows to join against, so there is nothing to
report a match RATE over. Nothing here degrades to a fixture — if a join is
missing, it says so and moves on rather than printing a comforting zero.
"""
import json, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import adp as ADP
import sleeper_import as SL

LEAGUE_ID = sys.argv[1] if len(sys.argv) > 1 else None
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
ART = json.load(open(os.path.join(ROOT, 'public', 'draft_data.json')))
CFG = json.load(open(os.path.join(ROOT, 'draft', 'config', 'league_config.json')))
PLAYERS = {p['player_id']: p for p in ART['players']}


def hr(n, title):
    print('\n' + '=' * 78)
    print('ITEM %s — %s' % (n, title))
    print('=' * 78)


FAILED = []


def item(n):
    """Run one item; a crash prints the traceback and the bundle continues.

    The first CI run lost seven working items because item 5 raised a KeyError
    on line 36. An evidence bundle whose failure mode is "produce nothing" is
    the opposite of the point — a failed item IS evidence, and the other items
    are unaffected by it.  Errors are re-listed at the end and set the exit
    status, so this isolates failures without hiding them."""
    import functools, traceback

    def deco(fn):
        try:
            fn()
        except Exception:                                    # noqa: BLE001
            FAILED.append(n)
            print('\n!! ITEM %s FAILED — the rest of the bundle continues' % n)
            traceback.print_exc()
        return fn
    return deco


# --- 5 + 7 -----------------------------------------------------------------
hr('5 + 7', 'name match Sleeper<->FFC, every top-150 failure, and the rates')

@item('5+7')
def _item57():
 sleeper_players = SL.fetch_players()
 # league_config.json is FLAT — teams/season/scoring sit at the top level, not
 # under a 'league' key. The first CI run died here on my own assumption, and
 # took the other seven items with it.  `or {}` rather than a get-default
 # because the 'adp' key EXISTS with a null value, so a default never fires.
 fmt = (CFG.get('adp') or {}).get('format', 'half-ppr')
 teams = int(CFG['teams'])
 year = int(CFG['season'])
 # build_adp_table RAISES when anything in the top STRICT_TOP_N fails to match
 # — the fail-loud rule, working. That means the interesting case for item 5
 # arrives as an exception, not as a report with a populated list. Catching it
 # here is how "every top-150 failure" gets printed instead of aborting the
 # report; the BUILD still refuses, which is the behaviour that matters.
 raised = None
 try:
     table = ADP.build_adp_table(sleeper_players, fmt=fmt, teams=teams, year=year)
 except RuntimeError as e:
     raised = str(e)
     print('\nBUILD REFUSED THE BOARD (this is the fail-loud rule firing):')
     print('  ' + raised)
     print('\nRe-running the match WITHOUT the strict gate, purely to enumerate '
           'the failures for this report:')
     table = ADP.build_adp_table(sleeper_players, fmt=fmt, teams=teams,
                                 year=year, strict_top_n=10 ** 9)

 rows = table['adp']
 report = table['report']
 matched, unmatched = report['matched'], report['unmatched']
 total = matched + len(unmatched)
 print('\nFFC payload: %d players, stdev field %r'
       % (report['payload']['player_count'], report['payload']['stdev_field']))
 print('matched %d of %d  (%.1f%%)' % (matched, total, 100.0 * matched / max(1, total)))
 # The rate that MATTERS is over the part of the board that gets drafted, not
 # over FFC's whole long tail — a 95%% overall rate that misses six of the top
 # 150 is a broken board with a reassuring headline number.
 for cut in (50, 100, 150, 200):
     miss = [u for u in unmatched if u['rank'] <= cut]
     print('  top %-3d: %d unmatched  (%.1f%% matched)'
           % (cut, len(miss), 100.0 * (cut - len(miss)) / cut))
 print('\nfail-loud threshold: STRICT_TOP_N = %d — any unmatched player at or '
       'above this rank raises and stops the build.' % ADP.STRICT_TOP_N)
 print('this build: %s' % ('REFUSED — ' + raised if raised
                           else 'passed the gate, no top-%d miss' % ADP.STRICT_TOP_N))
 print('\nevery unmatched player inside the top 150:')
 top150 = [u for u in unmatched if u['rank'] <= 150]
 if not top150:
     print('  (none)')
 for u in top150:
     print('  rank %-4d %-26s %-4s %-4s adp %s'
           % (u['rank'], u['name'], u['pos'], u['team'], u['adp']))

 by_method = {}
 for pid, row in rows.items():
     by_method[row['match_method']] = by_method.get(row['match_method'], 0) + 1
 print('\nmatches by method (exact vs fuzzy vs alias — a board carried by '
       'aliases is one roster update away from breaking):')
 for m, n in sorted(by_method.items(), key=lambda kv: -kv[1]):
     print('  %-22s %d' % (m, n))

# --- 6 ---------------------------------------------------------------------
hr(6, 'raw joined record for 5 named players, every source side by side')
@item(6)
def _item6():
 ranked = sorted((p for p in ART['players'] if p.get('overall_rank')),
                 key=lambda p: p['overall_rank'])
 picks = ranked[:3] + ranked[len(ranked) // 2: len(ranked) // 2 + 2]
 for p in picks:
     print('\n--- %s (%s %s) ---' % (p.get('name'), p.get('position'), p.get('team')))
     for k in ('player_id', 'gsis_id', 'overall_rank', 'proj_mean', 'proj_sd',
               'raw_adp', 'adjusted_adp', 'adp_sd', 'adp_sd_source', 'adp_source',
               'match_method', 'opportunity_z', 'opportunity_adj', 'vorp', 'tier'):
         if k in p:
             print('  %-20s %s' % (k, p[k]))
     missing = [k for k in ('gsis_id', 'opportunity_adj', 'adp_source') if k not in p]
     if missing:
         print('  NOT JOINED: %s' % ', '.join(missing))

# --- 9 ---------------------------------------------------------------------
hr(9, 'fresh live scoring_settings vs the stored config')
@item(9)
def _item9():
 if not LEAGUE_ID:
     print('CANNOT PRODUCE: no league id passed.')
 else:
     live = SL.fetch_league(LEAGUE_ID).get('scoring_settings') or {}
     stored = CFG['scoring']
     keys = sorted(set(live) | set(stored))
     diffs = 0
     print('%-18s %12s %12s' % ('key', 'live', 'stored'))
     for k in keys:
         lv, sv = live.get(k), stored.get(k)
         if lv is None and sv is None:
             continue
         same = (lv is not None and sv is not None and abs(float(lv) - float(sv)) < 1e-9)
         if not same:
             diffs += 1
             print('%-18s %12s %12s   <-- DIFFERS' % (k, lv, sv))
     print('\n%d differing keys.' % diffs)
     if diffs:
         print('Every projection, VORP and recommendation in the artifact was '
               'computed with the STORED column. Where they differ, the advice '
               'is scored for a league that is not this one.')


# ---------------------------------------------------------------------------
if FAILED:
    print('\n' + '=' * 78)
    print('ITEMS THAT FAILED: %s' % ', '.join(str(f) for f in FAILED))
    print('=' * 78)
    sys.exit(1)
print('\nall python items produced output')
