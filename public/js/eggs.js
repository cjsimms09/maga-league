/* EASTER EGGS — the hidden stuff that rewards a season of poking around.
 *
 * League voice: crude/funny about FANTASY, never anyone's real life, no slurs,
 * nothing genuinely political. Everything here is decorative — remove this file
 * and the site works identically.
 *
 * Registered so far:
 *  - "back-to-back world war champs" medal: tap a German flag on the Money Board.
 *  - the 2022 asterisk that argues with itself: tap the * on Marian's 2022 line.
 *  - Konami code: unlocks a leaguewide arrowhead-red confetti + Mahomes line.
 * More get wired here as pages land (eagle long-press, star-row five-tap, …).
 */
(function () {
  'use strict';

  // Reveal-toggles keyed by data-egg -> the matching [data-egg-*] in the same row.
  function nearestReveal(el, attr) {
    // Look within the closest table row / list item / card, then fall back to
    // the whole document (there is only one of each medal per page context).
    var scope = el.closest('tr, li, .card, .mb-trend, td') || document;
    return scope.querySelector('[' + attr + '="' + el.getAttribute('data-egg') + '"]')
      || document.querySelector('[' + attr + '="' + el.getAttribute('data-egg') + '"]');
  }

  function toggle(el, attr) {
    var target = nearestReveal(el, attr);
    if (target) target.classList.toggle('show');
  }

  document.addEventListener('click', function (e) {
    var flag = e.target.closest('.egg-flag[data-egg]');
    if (flag) { toggle(flag, 'data-egg-medal'); return; }
    var aster = e.target.closest('.egg-aster[data-egg]');
    if (aster) { toggle(aster, 'data-egg-note'); return; }
  });
  // Keyboard parity for the role="button" hooks.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var el = document.activeElement;
    if (!el) return;
    if (el.matches('.egg-flag[data-egg]')) { e.preventDefault(); toggle(el, 'data-egg-medal'); }
    else if (el.matches('.egg-aster[data-egg]')) { e.preventDefault(); toggle(el, 'data-egg-note'); }
  });

  // --- five taps on the star row -> the Balls and Wieners origin -----------
  var starRow = document.getElementById('star-row');
  if (starRow) {
    var taps = 0, tapTimer = null;
    var pop = function () {
      var note = document.querySelector('[data-egg-origin]');
      if (note) note.classList.add('show');
    };
    starRow.addEventListener('click', function () {
      taps++;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(function () { taps = 0; }, 1200);
      if (taps >= 5) { taps = 0; pop(); }
    });
    starRow.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); starRow.click(); }
    });
  }

  // --- Konami code: ↑↑↓↓←→←→ B A -------------------------------------------
  var KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  var buf = [];
  document.addEventListener('keydown', function (e) {
    buf.push(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    if (buf.length > KONAMI.length) buf.shift();
    if (KONAMI.every(function (k, i) { return buf[i] === k; })) { buf = []; konami(); }
  });
  function konami() {
    if (document.getElementById('konami-egg')) return;
    var wrap = document.createElement('div');
    wrap.id = 'konami-egg';
    wrap.setAttribute('role', 'status');
    wrap.innerHTML = '<div class="konami-card">🏹 <b>15 &mdash; 0 IS NOT A CHOKE, IT&rsquo;S A LIFESTYLE</b>'
      + '<span>Mahomes says set your lineup. — the management</span></div>';
    document.body.appendChild(wrap);
    // arrowhead-red confetti, used deliberately and sparingly (Chiefs colours).
    for (var i = 0; i < 40; i++) {
      var c = document.createElement('i');
      c.className = 'konami-bit';
      c.style.left = (Math.random() * 100) + 'vw';
      c.style.animationDelay = (Math.random() * 0.6) + 's';
      c.style.setProperty('--h', (Math.random() * 30 - 5) + 'deg');
      wrap.appendChild(c);
    }
    setTimeout(function () { wrap.classList.add('konami-out'); }, 3200);
    setTimeout(function () { wrap.remove(); }, 4000);
  }
})();
