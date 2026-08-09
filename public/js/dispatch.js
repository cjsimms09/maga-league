/* THE DISPATCH — progressive enhancement for the transient popups.
 *
 * No-JS: the dispatch region renders as a plain dismissible stack at the top of
 * the page; each ✕ is a real form POST that marks it seen and reloads.
 *
 * With JS: the same region becomes a centered overlay that dims the page, and
 * each ✕ dismisses via fetch and removes just that card — no reload. When the
 * last card clears, the overlay goes with it. Nothing is ever left "sitting on
 * the page": dismissal is server-side either way, so it stays gone.
 */
(function () {
  'use strict';
  var region = document.getElementById('dispatch-region');
  if (!region) return;

  region.classList.add('js'); // opt into overlay styling only when JS is live
  document.documentElement.classList.add('dispatch-open');

  function remaining() { return region.querySelectorAll('.dispatch-card').length; }
  function closeRegion() {
    region.classList.add('closing');
    document.documentElement.classList.remove('dispatch-open');
    setTimeout(function () { if (region.parentNode) region.parentNode.removeChild(region); }, 200);
  }
  function dropCard(card) {
    card.classList.add('gone');
    setTimeout(function () {
      if (card.parentNode) card.parentNode.removeChild(card);
      if (remaining() === 0) closeRegion();
    }, 180);
  }

  region.querySelectorAll('.dispatch-dismiss-form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var card = form.closest('.dispatch-card');
      var key = form.querySelector('input[name="key"]').value;
      dropCard(card); // optimistic — the read is done, the record follows
      fetch('/dispatch/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body: 'ajax=1&key=' + encodeURIComponent(key),
      }).catch(function () { /* the redirect path still marks it next load */ });
    });
  });

  // Esc dismisses the top (oldest-shown) card — a keyboard read-and-clear.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var card = region.querySelector('.dispatch-card');
    if (card) { var f = card.querySelector('.dispatch-dismiss-form'); if (f) f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable: true })); }
  });
})();
