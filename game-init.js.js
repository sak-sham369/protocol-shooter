/* =====================================================================
   PROTOCOL :: 1v1 TACTICAL SHOOTER
   game-init.js - Boot sequence, error handling, final init
   ~200 lines
   ===================================================================== */
'use strict';

/* ============================================================
   ERROR HANDLER
   ~50 lines - catches uncaught errors and shows them
   ============================================================ */
window.addEventListener('error', e => {
  console.error('[PROTOCOL] Uncaught error:', e.error || e.message);
  if (window.G && (G.phase === 'menu' || G.phase === 'boot')) {
    const bs = document.getElementById('bootScreen');
    if (bs) {
      bs.innerHTML = `<div style="color:#ff4655;font-family:monospace;padding:20px;text-align:left;max-width:80vw;margin:auto;font-size:12px">
        <h2>PROTOCOL - BOOT ERROR</h2>
        <p>${(e.error ? e.error.message : e.message) || 'Unknown error'}</p>
        <p>Check the browser console (F12) for details.</p>
        <p style="color:#768079;margin-top:20px">Common fixes: Use Chrome/Edge/Firefox. Make sure all 5 files are in the same folder.</p>
      </div>`;
    }
  }
});

/* ============================================================
   PRE-LOAD CHECKS
   ~80 lines
   ============================================================ */
function preLoad() {
  // check THREE
  if (typeof THREE === 'undefined') {
    const bs = document.getElementById('bootScreen');
    if (bs) bs.innerHTML = `<div style="color:#ff4655;padding:20px;font-family:sans-serif">
      <h2>Loading Error</h2>
      <p>Could not load THREE.js library. Please check your internet connection and try again.</p>
    </div>`;
    return false;
  }
  // check PeerJS (only needed for online)
  if (typeof Peer === 'undefined') {
    console.warn('[PROTOCOL] PeerJS not loaded - online play will not work, bot practice only');
  }
  // check all our script files
  const required = ['G','AGENTS','WEAPONS','ARMOR','MAPS','SPAWNS','Audio','FPC','World','buildMap','Character','BOT','useAbility','AbilityState','setupUI','setupInput','startMatch','init','Peer'];
  const missing = required.filter(name => typeof window[name] === 'undefined');
  if (missing.length > 0) {
    const bs = document.getElementById('bootScreen');
    if (bs) bs.innerHTML = `<div style="color:#ff4655;padding:20px;font-family:sans-serif">
      <h2>Loading Error</h2>
      <p>Missing required components: ${missing.join(', ')}</p>
      <p style="color:#768079">Make sure all 5 files (index.html, game-data.js, game-engine.js, game-ui.js, game-init.js) are in the same folder.</p>
    </div>`;
    return false;
  }
  return true;
}

/* ============================================================
   BOOT TRIGGER
   ~50 lines
   ============================================================ */
function startBoot() {
  if (!preLoad()) return;
  // pre-load voices for speech synthesis
  if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }
  // initialize the game
  try {
    if (typeof init === 'function') {
      init();
    } else {
      console.error('[PROTOCOL] init function not found');
    }
  } catch (e) {
    console.error('[PROTOCOL] Init failed:', e);
    const bs = document.getElementById('bootScreen');
    if (bs) {
      bs.classList.remove('hidden');
      bs.innerHTML = `<div style="color:#ff4655;padding:20px;font-family:sans-serif;max-width:80vw;margin:auto">
        <h2>PROTOCOL - STARTUP FAILED</h2>
        <pre style="text-align:left;background:#000;padding:15px;font-size:11px;overflow:auto">${e.message}\n${e.stack || ''}</pre>
        <p style="color:#768079">Try refreshing the page. If the issue persists, open browser console (F12) for details.</p>
      </div>`;
    }
  }
}

// start when window is fully loaded
if (document.readyState === 'complete') {
  startBoot();
} else {
  window.addEventListener('load', startBoot);
}

/* ============================================================
   GLOBAL KEYBOARD SHORTCUTS
   ~30 lines
   ============================================================ */
// F1 = help
// F2 = toggle settings
// F11 = fullscreen
document.addEventListener('keydown', e => {
  if (e.key === 'F1') {
    e.preventDefault();
    const help = `PROTOCOL :: 1v1 TACTICAL SHOOTER
═══════════════════════════════
CONTROLS:
  WASD         - Move
  Mouse        - Look
  Left Click   - Fire
  Right Click  - ADS (coming soon)
  R            - Reload
  Space        - Jump
  Shift        - Walk (Caps Lock)
  1-0, Q-T     - Switch weapons
  V            - Knife
  C, Q, E, X   - Abilities (C/Q/E basic, X ult)
  B            - Buy ability (during buy phase)
  E            - Plant / Defuse spike
  Tab          - Scoreboard
  Esc          - Pause / Back
  F11          - Fullscreen
  F1           - This help

GOAL:
  Win rounds by killing the enemy.
  First to your selected number wins.
  Practice vs bot, or host/join online with a friend.
  Share the lobby code with a friend to play online.
═══════════════════════════════`;
    alert(help);
  }
});

console.log('[PROTOCOL] game-init.js loaded');
console.log('[PROTOCOL] All systems ready. Press F1 for help in-game.');
