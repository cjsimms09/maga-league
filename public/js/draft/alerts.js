/* A-3 — my-turn alerting that survives a pocket.
 *
 * The 30-second scenario this kills: talking trash, phone dark, clock running.
 * When my turn arrives: audio ping + vibration (where supported) + title-bar
 * flash + push via ntfy topic if configured. Defaults ON for audio.
 *
 * Two hard-won mobile realities are designed in, not patched on:
 *   ARM STEP — iOS Safari will not play audio without a user gesture. The
 *   "arm" button creates/resumes the AudioContext inside that gesture; an
 *   unarmed alert still flashes the title and vibrates, and the UI shows the
 *   arm state so silence is never a mystery.
 *   CATCH-UP SWEEP — a backgrounded tab's poll is throttled, so the turn can
 *   arrive while no tick runs. The transition detector is EDGE-TRIGGERED on
 *   "entered my turn since the last tick I saw", not "a tick saw the turn
 *   start", so the first tick after re-foregrounding fires the alert that was
 *   missed in the pocket. app.js re-ticks on visibilitychange.
 */
(function (global) {
  'use strict';

  const DEFAULTS = { audio: true, vibrate: true, titleFlash: true, ntfyTopic: '' };

  /** Pure: is `pick` one of mine? */
  function isMyTurn(pick, myPicks) {
    return (myPicks || []).indexOf(pick) >= 0;
  }

  /**
   * Pure edge detector. `st` carries lastSeenPick + lastFiredPick; returns
   * {fire, st}. Fires when the current pick IS mine and we have not fired for
   * this pick — regardless of how many picks flew by while backgrounded, so
   * the catch-up sweep works with zero extra machinery. Never re-fires for the
   * same pick however many ticks see it.
   */
  function tick(st, currentPick, myPicks) {
    st = st || { lastFiredPick: null };
    const mine = isMyTurn(currentPick, myPicks);
    const fire = mine && st.lastFiredPick !== currentPick;
    return { fire, st: { lastFiredPick: fire ? currentPick : st.lastFiredPick } };
  }

  /* ---- side effects (all best-effort; none may touch the clock) ---------- */

  let audioCtx = null;
  let flashTimer = null;
  let baseTitle = null;

  /** MUST be called from a user gesture (the arm button). */
  function arm() {
    try {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return false;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      // A near-silent blip inside the gesture unlocks later playback on iOS.
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      g.gain.value = 0.001;
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.02);
      return true;
    } catch (e) { return false; }
  }

  function armed() {
    return !!(audioCtx && audioCtx.state === 'running');
  }

  function ping() {
    if (!audioCtx) return false;
    try {
      // Two rising tones — unmistakably "you're up", no asset to load.
      [[880, 0], [1320, 0.18]].forEach(function (t) {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.frequency.value = t[0];
        g.gain.setValueAtTime(0.25, audioCtx.currentTime + t[1]);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + t[1] + 0.35);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(audioCtx.currentTime + t[1]);
        o.stop(audioCtx.currentTime + t[1] + 0.4);
      });
      return true;
    } catch (e) { return false; }
  }

  function flashTitle(doc, text) {
    if (!doc) return;
    if (baseTitle == null) baseTitle = doc.title;
    let on = false;
    if (flashTimer) clearInterval(flashTimer);
    flashTimer = setInterval(function () {
      on = !on;
      doc.title = on ? text : baseTitle;
    }, 900);
  }

  function stopFlash(doc) {
    if (flashTimer) { clearInterval(flashTimer); flashTimer = null; }
    if (doc && baseTitle != null) doc.title = baseTitle;
  }

  function notifyNtfy(topic, message) {
    if (!topic || typeof fetch !== 'function') return Promise.resolve(false);
    // Explicitly opt-in: the topic is configured by the owner; this posts to
    // THEIR channel only when they set it.
    return fetch('https://ntfy.sh/' + encodeURIComponent(topic), {
      method: 'POST', body: message,
      headers: { Title: 'MAGA League draft', Priority: 'high', Tags: 'football' },
    }).then(function (r) { return r.ok; }).catch(function () { return false; });
  }

  /** Fire everything the config allows. Returns what actually ran (for tests/UI). */
  function fire(cfg, env) {
    cfg = Object.assign({}, DEFAULTS, cfg || {});
    env = env || {};
    const ran = { audio: false, vibrate: false, title: false, ntfy: false };
    if (cfg.audio) ran.audio = ping();
    if (cfg.vibrate && env.navigator && typeof env.navigator.vibrate === 'function') {
      try { ran.vibrate = !!env.navigator.vibrate([200, 100, 200, 100, 400]); } catch (e) {}
    }
    if (cfg.titleFlash && env.document) {
      flashTitle(env.document, '🚨 YOUR PICK — MAGA League');
      ran.title = true;
    }
    if (cfg.ntfyTopic) {
      notifyNtfy(cfg.ntfyTopic, 'You are ON THE CLOCK.');
      ran.ntfy = true;
    }
    return ran;
  }

  const api = { DEFAULTS, isMyTurn, tick, arm, armed, ping, fire,
                flashTitle, stopFlash, notifyNtfy };
  global.DraftAlerts = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
