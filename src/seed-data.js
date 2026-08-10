// Historical league data imported from the commissioner's master spreadsheet.
// "Hagen" in the sheet is Michael's team — his weekly wins, awards, and the
// per-year money grid all credit the same dollars — so Hagen maps to Michael.
// Sums here were re-verified against each season's total pot; the sheet's
// all-time Total column was stale (it excluded 2025), the per-year values win.

const OWNERS = [
  // record = career regular-season W-L-T from the master sheet
  { name: 'Cory',    username: 'cory',    commissioner: 1, wins: 49, losses: 36, ties: 1 },
  { name: 'Marian',  username: 'marian',  commissioner: 0, wins: 52, losses: 33, ties: 0 },
  { name: 'David',   username: 'david',   commissioner: 0, wins: 51, losses: 34, ties: 0 },
  { name: 'Michael', username: 'michael', commissioner: 0, wins: 42, losses: 43, ties: 0, alias: 'Hagen' },
  { name: 'Bates',   username: 'bates',   commissioner: 0, wins: 36, losses: 49, ties: 0 },
  { name: 'Dylan',   username: 'dylan',   commissioner: 0, wins: 41, losses: 44, ties: 0 },
  { name: 'Sam',     username: 'sam',     commissioner: 0, wins: 37, losses: 48, ties: 0 },
  { name: 'Jeremy',  username: 'jeremy',  commissioner: 0, wins: 40, losses: 45, ties: 0 },
  { name: 'Richard', username: 'richard', commissioner: 0, wins: 36, losses: 49, ties: 0 },
  { name: 'Justin',  username: 'justin',  commissioner: 0, wins: 41, losses: 43, ties: 1 },
];

// Payout structure percentages apply to the pot remaining after weekly payouts.
const SEASONS = [
  { year: 2016, buy_in: 100, total_pot: 1000, weeks: 0,  weekly_payout: 0,   status: 'complete',
    payouts: { reg: [0.225, 0.05], playoff: [0.30, 0.20, 0.125, 0.10] } },
  { year: 2017, buy_in: 125, total_pot: 1250, weeks: 0,  weekly_payout: 0,   status: 'complete',
    payouts: { reg: [0.225, 0.05], playoff: [0.30, 0.20, 0.125, 0.10] } },
  { year: 2018, buy_in: 150, total_pot: 1500, weeks: 0,  weekly_payout: 0,   status: 'complete',
    payouts: { reg: [0.225, 0.05], playoff: [0.30, 0.20, 0.125, 0.10] } },
  { year: 2019, buy_in: 200, total_pot: 2000, weeks: 0,  weekly_payout: 0,   status: 'complete',
    payouts: { reg: [0.225, 0.05], playoff: [0.30, 0.20, 0.125, 0.10] } },
  { year: 2020, buy_in: 250, total_pot: 2500, weeks: 0,  weekly_payout: 0,   status: 'complete',
    payouts: { reg: [0.225, 0.05], playoff: [0.30, 0.20, 0.125, 0.10] } },
  { year: 2021, buy_in: 300, total_pot: 2900, weeks: 0,  weekly_payout: 0,   status: 'complete',
    payouts: { reg: [0.225, 0.05], playoff: [0.30, 0.20, 0.125, 0.10] } },
  { year: 2022, buy_in: 350, total_pot: 3500, weeks: 0,  weekly_payout: 0,   status: 'complete',
    payouts: { reg: [0.225, 0.05], playoff: [0.30, 0.20, 0.125, 0.10] } },
  { year: 2023, buy_in: 350, total_pot: 3500, weeks: 15, weekly_payout: 100, status: 'complete',
    payouts: { reg: [0.10, 0.05], playoff: [0.275, 0.225, 0.20, 0.15] } },
  { year: 2024, buy_in: 400, total_pot: 4000, weeks: 15, weekly_payout: 100, status: 'complete',
    payouts: { reg: [0.10, 0.05], playoff: [0.27, 0.22, 0.20, 0.16] } },
  { year: 2025, buy_in: 400, total_pot: 4000, weeks: 15, weekly_payout: 100, status: 'complete',
    payouts: { reg: [0.10, 0.05], playoff: [0.27, 0.22, 0.20, 0.16] } },
  { year: 2026, buy_in: 400, total_pot: 4000, weeks: 15, weekly_payout: 100, status: 'active',
    payouts: { reg: [0.10, 0.05], playoff: [0.27, 0.23, 0.19, 0.16] } },
];

// Per-owner winnings by year, straight from the master sheet's money grid
// (Hagen's money already lives on Michael's row there).
const LEGACY_WINNINGS = {
  Marian:  { 2019: 700, 2020: 900, 2021: 870, 2022: 1662.5, 2023: 100, 2024: 750, 2025: 100 },
  Cory:    { 2016: 200, 2017: 437.5, 2018: 525, 2020: 1050, 2021: 507.5, 2023: 400, 2024: 400 },
  David:   { 2016: 300, 2017: 250, 2019: 250, 2020: 250, 2022: 437.5, 2023: 800, 2024: 950, 2025: 800 },
  Michael: { 2016: 350, 2019: 850, 2023: 1050, 2024: 100, 2025: 1325 },
  Bates:   { 2018: 487.5, 2020: 300, 2021: 1232.5, 2023: 100, 2025: 875 },
  Dylan:   { 2017: 406.25, 2018: 187.5, 2022: 350, 2023: 550, 2024: 100, 2025: 100 },
  Sam:     { 2022: 1050, 2023: 200 },
  Jeremy:  { 2017: 156.25, 2019: 200, 2021: 290, 2023: 200, 2024: 900, 2025: 600 },
  Richard: { 2016: 150, 2018: 300, 2023: 100, 2024: 200, 2025: 200 },
  Justin:  { 2024: 600 },
};

// category: reg_1 reg_2 playoff_1..playoff_4
const AWARDS = {
  2016: [ ['reg_1','Michael',225], ['reg_2','Richard',50], ['playoff_1','David',300], ['playoff_2','Cory',200], ['playoff_3','Michael',125], ['playoff_4','Richard',100] ],
  2017: [ ['reg_1','Dylan',281.25], ['reg_2','Cory',62.5], ['playoff_1','Cory',375], ['playoff_2','David',250], ['playoff_3','Jeremy',156.25], ['playoff_4','Dylan',125] ],
  2018: [ ['reg_1','Bates',337.5], ['reg_2','Cory',75], ['playoff_1','Cory',450], ['playoff_2','Richard',300], ['playoff_3','Dylan',187.5], ['playoff_4','Bates',150] ],
  2019: [ ['reg_1','Michael',450], ['reg_2','Marian',100], ['playoff_1','Marian',600], ['playoff_2','Michael',400], ['playoff_3','David',250], ['playoff_4','Jeremy',200] ],
  2020: [ ['reg_1','Cory',562.5], ['reg_2','David',125], ['playoff_1','Marian',750], ['playoff_2','Cory',500], ['playoff_3','Bates',312.5], ['playoff_4','David',250] ],
  2021: [ ['reg_1','Bates',675], ['reg_2','Cory',150], ['playoff_1','Marian',900], ['playoff_2','Bates',600], ['playoff_3','Cory',375], ['playoff_4','Jeremy',300] ],
  // 2022 championship was split between Marian and Sam (1st + 2nd money combined, halved)
  2022: [ ['reg_1','Marian',787.5], ['reg_2','Sam',175], ['playoff_1','Marian',875,'Co-champion — split 1st/2nd money with Sam'], ['playoff_2','Sam',875,'Co-champion — split 1st/2nd money with Marian'], ['playoff_3','David',437.5], ['playoff_4','Dylan',350] ],
  2023: [ ['reg_1','Michael',200], ['reg_2','David',100], ['playoff_1','Michael',550], ['playoff_2','Dylan',450], ['playoff_3','Cory',400], ['playoff_4','David',300] ],
  2024: [ ['reg_1','David',250], ['reg_2','Jeremy',125], ['playoff_1','Jeremy',675], ['playoff_2','Marian',550], ['playoff_3','Justin',500], ['playoff_4','David',400] ],
  2025: [ ['reg_1','Michael',250], ['reg_2','Bates',125], ['playoff_1','Michael',675], ['playoff_2','Bates',550], ['playoff_3','David',500], ['playoff_4','Jeremy',400] ],
};

// Weekly high-point winners (weeks 1-15) where the sheet recorded them.
const WEEKLY_WINNERS = {
  2023: ['David','Michael','Marian','David','Richard','Dylan','David','Michael','Jeremy','Sam','Bates','Jeremy','Sam','David','Michael'],
  2024: ['Richard','Marian','Cory','David','Cory','Richard','Dylan','Marian','Jeremy','Cory','Michael','Justin','David','Cory','David'],
  2025: ['David','Jeremy','Michael','Dylan','Michael','David','Richard','Jeremy','Michael','Bates','Michael','Bates','Richard','David','Marian'],
};

// Final regular-season standings, 1st -> 10th.
const STANDINGS = {
  2019: ['Michael','Marian','David','Jeremy','Richard','Dylan','Justin','Cory','Sam','Bates'],
  2020: ['Cory','David','Marian','Bates','Justin','Richard','Dylan','Sam','Michael','Jeremy'],
  2021: ['Bates','Cory','Marian','Jeremy','Michael','Sam','Justin','David','Dylan','Richard'],
  2022: ['Marian','Sam','David','Dylan','Justin','Cory','Jeremy','Michael','Bates','Richard'],
  2023: ['Michael','David','Dylan','Cory','Marian','Sam','Justin','Richard','Bates','Jeremy'],
  2024: ['David','Jeremy','Justin','Marian','Cory','Richard','Dylan','Michael','Bates','Sam'],
  2025: ['Michael','Bates','Jeremy','David','Dylan','Marian','Cory','Justin','Sam','Richard'],
};

// Completed draft-slot selections. pick order = reverse of prior-year standings;
// entries listed in pick order as [owner, slot chosen].
const DRAFTS = {
  2025: { order: [ ['Sam',1], ['Bates',2], ['Michael',3], ['Dylan',4], ['Richard',5], ['Cory',6], ['David',7], ['Justin',8], ['Marian',9], ['Jeremy',10] ] },
  // 2026 selection happens live on the site: reverse of 2025 standings, Richard first, no spots chosen yet.
  2026: { open: true, order: [ ['Richard',null], ['Sam',null], ['Justin',null], ['Cory',null], ['Marian',null], ['Dylan',null], ['David',null], ['Jeremy',null], ['Bates',null], ['Michael',null] ] },
};

// 2026 buy-in ledger from the Payments tab: 0 = settled, -400 = owes the full
// buy-in. David's +375 is a credit carried against his balance.
const PAYMENTS_2026 = {
  Cory:    { paid: 400, note: '' },
  Marian:  { paid: 400, note: '' },
  David:   { paid: 775, note: '$375 credit on the books' },
  Bates:   { paid: 0, note: '' },
  Michael: { paid: 0, note: '' },
  Richard: { paid: 0, note: '' },
  Jeremy:  { paid: 0, note: '' },
  Justin:  { paid: 0, note: '' },
  Sam:     { paid: 0, note: '' },
  Dylan:   { paid: 0, note: '' },
};

const VOTES = [
  { question: 'Increase Buy-in to $500?', description: 'Raise the annual buy-in from $400 to $500 starting next season.' },
  { question: 'Keep Keeper rules the same?', description: 'Keep the current 3-keeper rule (each keeper costs the matching draft round).' },
  { question: 'Change Payout percentages?', description: 'Adjust how the pot is split between regular season, playoffs, and weekly payouts.' },
];

const RULES = [
  'All rule changes approved by 6 votes',
  'Retain up to 3 keepers from previous year',
  'Draft Order — reverse standings from previous year; last place picks their draft spot first',
  'Each keeper costs the matching draft round (1 keeper = your 1st round pick, 2 keepers = 1st and 2nd, 3 keepers = 1st, 2nd, and 3rd)',
  'Owners MUST set their lineup or be kicked out (1 warning)',
  'ALL trades pending approval (5 votes denies a trade)',
  'Any trade involving draft picks must swap picks within 1 round of each other',
  'Tie breaker = total points',
  '$100 payout to weekly high point (regular season ONLY)',
];

const SCORING = {
  Passing: [ ['Passing Yards', '25 yds = 1 pt'], ['Passing TD', '6'], ['2-pt Conversion', '2'], ['Interception', '-2'] ],
  Rushing: [ ['Rushing Yards', '0.1 / yd'], ['Rushing TD', '6'], ['2-pt Conversion', '2'], ['Fumble Lost', '-2'] ],
  Receiving: [ ['Reception', '0.5'], ['Receiving Yards', '0.1 / yd'], ['Receiving TD', '6'] ],
  Kicking: [ ['FG (0-49 yd)', '3'], ['FG (50+ yd)', '5'], ['PAT Made', '1'], ['PAT Missed', '-1'] ],
  // CORRECTED 2026-08-10 against the imported Sleeper config. Three faults, all
  // the signature of a hand-kept copy: 28-34 read "1" when Sleeper says -1.0 (a
  // SIGN ERROR — the page said a bad defensive week EARNED a point), the 21-27
  // bracket was missing entirely so the table showed a hole between 20 and 28,
  // and Blocked kick was absent. Human phrasing is kept deliberately; only the
  // NUMBERS are Sleeper's. draft/tests/rules_page.test.js now cross-checks every
  // value against draft/config/league_config.json, so this can drift once and
  // never twice.
  'Defense / ST': [ ['TD', '6'], ['0 points allowed', '10'], ['1-6 points allowed', '7'], ['7-13 points allowed', '4'], ['14-20 points allowed', '1'], ['21-27 points allowed', '0'], ['28-34 points allowed', '-1'], ['35+ points allowed', '-4'], ['Sack', '1'], ['Interception', '2'], ['Fumble Recovery', '2'], ['Safety', '2'], ['Blocked Kick', '0'] ],
};

// CORRECTED 2026-08-10: TE — an actual STARTING POSITION — was missing from the
// list of starting positions, and IR:1 was listed though this league has no IR
// slot. Derived shape now lives in src/rules-derived.js and is asserted equal.
const ROSTER = [ ['QB', 1], ['RB', 2], ['WR', 2], ['TE', 1], ['WR/RB/TE (Flex)', 1], ['DEF', 1], ['K', 1], ['Bench', 6] ];

// Auto-roasts for whoever is in last place. {name} gets substituted.
const ROASTS = [
  "{name} is currently losing to two guys managing their teams from Germany. Six time zones away. Think about that.",
  "OFFICIAL NOTICE: {name} is in DEAD LAST. Sad! Many people are saying it's the worst team they've ever seen.",
  "BREAKING: {name} is currently last place. Historians are calling it a disaster of tremendous proportions.",
  "ALERT: {name}'s team is failing badly. Total disaster. Everybody agrees.",
  "{name} sits in dead last. Experts asked for comment simply laughed.",
  "This is a formal announcement that {name} stinks. That is all.",
];

// Rotating footer quips.
const QUIPS = [
  "Winners win. Losers pick first. That's the deal.",
  "Proudly hosted in the United States. Back-to-back World War champs.",
  "Freedom units only. Points, not kilometers.",
  "Two of our owners operate from Germany. We monitor the situation closely.",
  "Est. 1776. The league came later.",
  "This footer has been cleared by U.S. Customs. Marian's lineup has not.",
  "We settle our tabs. Eventually. Sometimes it takes years. Looking at you, Germany.",
  "The most tremendous league in the history of leagues, maybe ever.",
  "Six votes changes a rule. No votes changes your terrible roster.",
  "All payouts guaranteed by the full faith and credit of the commissioner.",
  "In this league we drain the swamp and the waiver wire.",
];

const SLEEPER_LEAGUE_ID = '1374848328470102016';

module.exports = { OWNERS, SEASONS, LEGACY_WINNINGS, AWARDS, WEEKLY_WINNERS, STANDINGS, DRAFTS, PAYMENTS_2026, VOTES, RULES, SCORING, ROSTER, ROASTS, QUIPS, SLEEPER_LEAGUE_ID };
