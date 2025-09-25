// YouTube Ad Mute & Speedup (Auto Skip/Next)
// v1.2.2
//
// Changes in this version:
// - STRICT ad detection: only the active player's 'ad-showing' / 'ad-interrupting' OR true ad-only UI (skip/countdown) inside the SAME player.
// - All queries are SCOPED to the current player's DOM to avoid false positives from other overlays.
// - Stronger ad-end debounce and "must-be-clean" checks so we always restore post-ad.
// - Optional DEBUG switch for quick diagnosis (leave off by default).

const DEFAULT_AD_SPEED = 4.0;
const DEBUG = false;

let configuredAdSpeed = DEFAULT_AD_SPEED;
let autoSkip = true;       // default ON
let useMaxAdSpeed = true;  // default ON

let isAdActive = false;
let lastKnownUserRate = 1.0;
let lastKnownUserMuted = false;
let weChangedMute = false;
let weChangedRate = false;

let cleanFalseStreak = 0;   // counts consecutive "no-ad" ticks
let lastClickMs = 0;

function log(...args) { if (DEBUG) console.log('[YtAdQuick]', ...args); }

async function loadConfig() {
  return new Promise(resolve => {
    if (!chrome || !chrome.storage || !chrome.storage.sync) return resolve();
    chrome.storage.sync.get(['adSpeed', 'autoSkip', 'useMaxAdSpeed'], (res) => {
      const s = parseFloat(res.adSpeed);
      if (!Number.isNaN(s) && s > 0) configuredAdSpeed = s;
      if (typeof res.autoSkip === 'boolean') autoSkip = res.autoSkip;
      if (typeof res.useMaxAdSpeed === 'boolean') useMaxAdSpeed = res.useMaxAdSpeed;
      resolve();
    });
  });
}

function getMainVideo() {
  // Prefer the primary HTML5 player video
  return document.querySelector('video.html5-main-video') || document.querySelector('video');
}

function getPlayerForVideo(video) {
  // Scope all queries to THIS player's subtree
  if (!video) return null;
  return video.closest('.html5-video-player') || document.querySelector('.html5-video-player');
}

function isVisible(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return rect.width > 0 && rect.height > 0 &&
         cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
}

function playerClassSaysAd(playerEl) {
  if (!playerEl) return false;
  return playerEl.classList.contains('ad-showing') || playerEl.classList.contains('ad-interrupting');
}

function playerHasAdUi(playerEl) {
  // Only "true" ad UI — skip button or countdown pie — within THIS player.
  if (!playerEl) return false;
  const selectors = [
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-timed-pie-countdown-container'
  ];
  for (const sel of selectors) {
    const el = playerEl.querySelector(sel);
    if (el && isVisible(el)) return true;
  }
  return false;
}

function isAdShowingScoped(video) {
  // STRICT rule: treat as ad only if the active player's class says ad OR ad-only UI is visible IN that player.
  const player = getPlayerForVideo(video);
  if (!player) return false;
  if (playerClassSaysAd(player)) return true;
  if (playerHasAdUi(player)) return true;
  return false;
}

function clampRate(rate) {
  return Math.max(0.1, Math.min(rate, 16));
}
function targetAdSpeed() {
  return useMaxAdSpeed ? 16 : configuredAdSpeed;
}

function rememberUserState(video) {
  lastKnownUserRate = video?.playbackRate ?? 1.0;
  lastKnownUserMuted = !!(video?.muted);
  weChangedRate = false;
  weChangedMute = false;
  log('Remember state:', { rate: lastKnownUserRate, muted: lastKnownUserMuted });
}

function applyAdMode(video) {
  if (!video) return;
  if (!isAdActive) rememberUserState(video);

  const desired = clampRate(targetAdSpeed());
  if (Math.abs((video.playbackRate || 1.0) - desired) > 0.001) {
    try { video.playbackRate = desired; weChangedRate = true; } catch {}
  }
  if (!video.muted) {
    try { video.muted = true; weChangedMute = true; } catch {}
  }
  isAdActive = true;
}

function restoreUserMode(video) {
  if (!video) return;

  if (weChangedRate && Math.abs((video.playbackRate || 1.0) - lastKnownUserRate) > 0.001) {
    try { video.playbackRate = lastKnownUserRate; } catch {}
  }
  if (weChangedMute && video.muted === true && lastKnownUserMuted === false) {
    try { video.muted = false; } catch {}
  }
  isAdActive = false;
  weChangedRate = false;
  weChangedMute = false;
  log('Restored state.');
}

// ---------- Robust Skip / Next (SCOPED to player) ----------

function isClickable(el) {
  if (!isVisible(el)) return false;
  const disabled = el.getAttribute('disabled') !== null ||
                   el.getAttribute('aria-disabled') === 'true';
  if (disabled) return false;
  const cs = getComputedStyle(el);
  if (cs.pointerEvents === 'none') return false;
  return true;
}

function findSkipButtonScoped(player) {
  if (!player) return null;
  const selectors = [
    'button.ytp-ad-skip-button',
    'button.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button-container button',
    '.ytp-skip-ad-button'
  ];
  for (const sel of selectors) {
    const el = player.querySelector(sel);
    if (el && isClickable(el)) return el;
  }
  // Fallback: text-based search inside player
  const candidates = Array.from(player.querySelectorAll('[role="button"], button, .ytp-button'));
  for (const el of candidates) {
    if (!isClickable(el)) continue;
    const label = (el.getAttribute('aria-label') || el.textContent || '').trim().toLowerCase();
    if (label === 'skip' || label.startsWith('skip ad') || label.startsWith('skip ads') || label.startsWith('skip trial')) {
      return el;
    }
  }
  return null;
}

function findNextButtonScoped(player) {
  if (!player) return null;
  const el = player.querySelector('.ytp-next-button');
  if (!el || !isClickable(el)) return null;
  return el;
}

function simulateHumanClick(el) {
  if (!el) return false;
  const now = Date.now();
  if (now - lastClickMs < 120) return false;
  lastClickMs = now;

  const rect = el.getBoundingClientRect();
  const cx = Math.max(1, Math.min(rect.width - 1, rect.width * 0.5));
  const cy = Math.max(1, Math.min(rect.height - 1, rect.height * 0.5));
  const opts = { bubbles: true, cancelable: true, view: window, clientX: rect.left + cx, clientY: rect.top + cy };

  try { el.dispatchEvent(new MouseEvent('mouseover', opts)); } catch {}
  try { el.dispatchEvent(new MouseEvent('mousedown', opts)); } catch {}
  try { el.dispatchEvent(new MouseEvent('mouseup', opts)); } catch {}
  try { el.click(); } catch {}
  try { el.dispatchEvent(new MouseEvent('click', opts)); } catch {}

  return true;
}

function tryAutoSkipOrNext(video) {
  if (!autoSkip) return;
  const player = getPlayerForVideo(video);
  if (!player) return;

  const skip = findSkipButtonScoped(player);
  if (skip) { simulateHumanClick(skip); return; }

  const nextBtn = findNextButtonScoped(player);
  if (nextBtn) simulateHumanClick(nextBtn);
}

// ---------- Main loop ----------

function adCleanEnoughToRestore(video) {
  // We consider it clean ONLY if:
  // 1) Player class does NOT indicate ad
  // 2) No ad-only UI (skip/countdown) visible in this player
  const player = getPlayerForVideo(video);
  if (!player) return true;
  const classAd = playerClassSaysAd(player);
  const uiAd = playerHasAdUi(player);
  return !classAd && !uiAd;
}

function tick() {
  // Avoid Shorts until separately tuned (optional; uncomment if Shorts cause noise)
  // if (location.pathname.startsWith('/shorts/')) return;

  const video = getMainVideo();
  if (!video) return;

  const adNow = isAdShowingScoped(video);

  if (adNow) {
    cleanFalseStreak = 0;
    applyAdMode(video);
    tryAutoSkipOrNext(video);
  } else {
    if (adCleanEnoughToRestore(video)) {
      cleanFalseStreak++;
      // Require ~1s of clean ticks (with 150ms interval this is ~7 ticks)
      if (isAdActive && cleanFalseStreak >= 7) {
        restoreUserMode(video);
      }
    } else {
      // Not clean, reset counter
      cleanFalseStreak = 0;
    }
  }
}

function installObservers() {
  let lastUrl = location.href;
  const urlObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(() => tick(), 350);
    }
  });
  urlObserver.observe(document.documentElement || document.body, { childList: true, subtree: true });

  const domObserver = new MutationObserver(() => tick());
  domObserver.observe(document.documentElement || document.body, { attributes: true, childList: true, subtree: true });
}

async function main() {
  await loadConfig();
  installObservers();
  setInterval(tick, 150);
  tick();
}

main().catch(() => {});
