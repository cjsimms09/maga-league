/* Module 0 confirmation screen.
 *
 * Renders the imported league config as editable fields. Saved corrections are
 * overrides, not a rewrite: the pipeline keeps importing from Sleeper, and the
 * overrides win wherever they disagree. That way a Sleeper fix upstream still
 * flows through, but a rule Sleeper gets wrong stays fixed.
 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Human labels for Sleeper's scoring keys. Anything unmapped shows its raw key
  // rather than being hidden — an unrecognised scoring rule is exactly the thing
  // you need to see.
  const LABELS = {
    pass_yd: 'Passing yards (per yard)', pass_td: 'Passing TD', pass_int: 'Interception thrown',
    pass_2pt: 'Passing 2-pt', rush_yd: 'Rushing yards (per yard)', rush_td: 'Rushing TD',
    rush_2pt: 'Rushing 2-pt', rec: 'Reception (PPR value)', rec_yd: 'Receiving yards (per yard)',
    rec_td: 'Receiving TD', rec_2pt: 'Receiving 2-pt', fum_lost: 'Fumble lost',
    fum_rec_td: 'Fumble recovery TD', st_td: 'Special teams TD', def_td: 'Defensive TD',
    def_st_td: 'DST return TD', sack: 'Sack', int: 'Defensive interception',
    fum_rec: 'Fumble recovery', safe: 'Safety', blk_kick: 'Blocked kick',
    pts_allow_0: 'DST shutout', pts_allow_1_6: 'DST 1-6 allowed', pts_allow_7_13: 'DST 7-13 allowed',
    pts_allow_14_20: 'DST 14-20 allowed', pts_allow_21_27: 'DST 21-27 allowed',
    pts_allow_28_34: 'DST 28-34 allowed', pts_allow_35p: 'DST 35+ allowed',
    fgm_0_19: 'FG 0-19', fgm_20_29: 'FG 20-29', fgm_30_39: 'FG 30-39',
    fgm_40_49: 'FG 40-49', fgm_50p: 'FG 50+', fgmiss: 'FG missed', xpm: 'Extra point', xpmiss: 'Extra point missed',
    bonus_rush_yd_100: 'Bonus: 100 rushing yards', bonus_rec_yd_100: 'Bonus: 100 receiving yards',
    bonus_pass_yd_300: 'Bonus: 300 passing yards',
  };
  // The handful that decide whether the whole board is right.
  const CRITICAL = ['rec', 'pass_td', 'rush_td', 'rec_td', 'pass_yd', 'rush_yd', 'rec_yd', 'pass_int', 'fum_lost'];

  const SLOT_LABELS = {
    QB: 'Quarterback', RB: 'Running back', WR: 'Wide receiver', TE: 'Tight end',
    FLEX: 'Flex (RB/WR/TE)', SUPER_FLEX: 'Superflex (QB eligible)', REC_FLEX: 'Rec flex (WR/TE)',
    K: 'Kicker', DEF: 'Defense / ST', BN: 'Bench', IR: 'Injured reserve', TAXI: 'Taxi squad',
  };

  fetch('/draft_data.json', { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error('no draft board built yet (HTTP ' + r.status + ')'); return r.json(); })
    .then(render)
    .catch(err => {
      $('#cfg-loading').innerHTML = '<div class="card"><div class="body"><p><b>Nothing to confirm yet.</b> '
        + esc(err.message) + '</p><p class="muted">Run the pipeline first — Actions → “Build draft board”.</p></div></div>';
    });

  function render(data) {
    const ov = window.CFG_OVERRIDES || {};
    const league = data.league || {};
    const scoring = Object.assign({}, league.scoring, ov.scoring);
    const slots = Object.assign({}, league.roster_slots, ov.roster_slots);
    const keepers = Object.assign({}, league.keeper_rules, ov.keepers);

    $('#f-teams').value = ov.teams || league.teams || 10;
    $('#f-slot').value = ov.my_draft_slot || league.my_draft_slot || 1;
    $('#f-type').value = ov.draft_type || league.draft_type || 'snake';
    $('#f-meta').textContent = (league.name || 'League') + ' · season ' + (league.season || '?')
      + ' · board built ' + (data.built_at || '').slice(0, 10)
      + ' · ' + (data.players || []).length + ' players'
      + ' · profiles from ' + ((data.notes || {}).profiles_from_drafts || 0) + ' prior draft(s)';

    $('#f-kcount').value = keepers.count == null ? 3 : keepers.count;
    $('#f-cost').value = keepers.cost_model || 'original_round';
    if (keepers.fixed_round) $('#f-fixed').value = keepers.fixed_round;
    if (keepers.escalator_rounds) $('#f-esc').value = keepers.escalator_rounds;
    $('#f-years').value = keepers.max_years == null ? 3 : keepers.max_years;
    $('#f-undrafted').value = keepers.undrafted_rule || 'assigned_round';
    $('#f-uround').value = keepers.undrafted_round == null ? 10 : keepers.undrafted_round;

    $('#f-slots').innerHTML = Object.keys(slots).sort().map(k =>
      '<tr><td><b>' + esc(SLOT_LABELS[k] || k) + '</b> <span class="muted">' + esc(k) + '</span></td>'
      + '<td class="num" style="width:110px"><input type="number" name="slot[' + esc(k) + ']" value="'
      + esc(slots[k]) + '" style="width:80px"></td></tr>').join('');

    const keys = Object.keys(scoring).sort((a, b) => {
      const ca = CRITICAL.indexOf(a), cb = CRITICAL.indexOf(b);
      if (ca !== -1 || cb !== -1) return (ca === -1 ? 99 : ca) - (cb === -1 ? 99 : cb);
      return a.localeCompare(b);
    });
    $('#f-scoring').innerHTML = keys.map(k => {
      const critical = CRITICAL.indexOf(k) !== -1;
      return '<tr' + (critical ? ' style="background:rgba(245,196,69,.06)"' : '') + '>'
        + '<td>' + (critical ? '★ ' : '') + '<b>' + esc(LABELS[k] || k) + '</b>'
        + (LABELS[k] ? ' <span class="muted">' + esc(k) + '</span>' : '') + '</td>'
        + '<td class="num" style="width:120px"><input type="number" step="0.001" name="scoring[' + esc(k)
        + ']" value="' + esc(scoring[k]) + '" style="width:95px"></td></tr>';
    }).join('');

    $('#cfg-loading').style.display = 'none';
    $('#cfg-form').style.display = '';
  }
})();
