// YouTube Ad Mute & Speedup (No Skip)
// - Detects ad state via player CSS classes and ad containers
// - When ad starts: store current playbackRate & mute state -> set fast rate & mute
// - When ad ends: restore prior user settings
// - Robust to SPA navigations on youtube.com and mid-roll ads

const DEFAULT_AD_SPEED = 4; // sensible default; most players accept up to 4 smoothly
let configuredAdSpeed = DEFAULT_AD_SPEED;

let isAdActive = false;
let lastKnownUserRate = 1.0;
let lastKnownUserMuted = false;
let weChangedMute = false;       // track whether we forced mute (so we don't unmute if user muted)
let weChangedRate = false;       // track whether we forced rate (so we don't overwrite user choice)

function getMainVideo() {
  // YouTube's main <video> is usually .html5-main-video, but fallback to first <video>
  return document.querySelector('video.html5-main-video') || document.querySelector('video');
}

function isAdShowing() {
  // Primary reliable signal: the html5 player gets 'ad-showing' class during ads
  const adClassPlayer = document.querySelector('.html5-video-player.ad-showing');
  if (adClassPlayer) return true;

  // Defensive: check common ad overlays/containers
  if (document.querySelector('.ytp-ad-player-overlay') || document.querySelector('.ytp-ad-text')) return true;

  // Newer UI variants sometimes inject ad containers:
  if (document.querySelector('.ytp-ad-module')) return true;

  return false;
}

async function loadConfig() {
  return new Promise(resolve => {
    if (!chrome?.storage?.sync) return resolve();
    chrome.storage.sync.get(['adSpeed'], (res) => {
      const s = parseFloat(res.adSpeed);
      if (!Number.isNaN(s) && s > 0) configuredAdSpeed = s;
      resolve();
    });
  });
}

function clampRate(rate) {
  // Most browsers allow high values, but YouTube may clamp internally.
  // Keep within a safe practical range. You can raise max to 16; 4 is smooth/realistic.
  const r = Math.max(0.1, Math.min(rate, 16));
  return r;
}

function applyAdMode(video) {
  if (!video) return;

  // Persist user's current state (only once per ad)
  if (!isAdActive) {
    lastKnownUserRate = video.playbackRate || 1.0;
    lastKnownUserMuted = video.muted || false;
    weChangedRate = weChangedMute = false;
  }

  const targetRate = clampRate(configuredAdSpeed);

  // Set playback rate fast if not already
  if (Math.abs(video.playbackRate - targetRate) > 0.001) {
    try {
      video.playbackRate = targetRate;
      weChangedRate = true;
    } catch (_) {}
  }

  // Force mute during ad (but remember if user was already muted)
  if (!video.muted) {
    try {
      video.muted = true;
      weChangedMute = true;
    } catch (_) {}
  }

  isAdActive = true;
}

function restoreUserMode(video) {
  if (!video) return;

  // Only restore what we changed
  if (weChangedRate && Math.abs(video.playbackRate - lastKnownUserRate) > 0.001) {
    try { video.playbackRate = lastKnownUserRate; } catch (_) {}
  }
  if (weChangedMute && video.muted === true && lastKnownUserMuted === false) {
    try { video.muted = false; } catch (_) {}
  }

  isAdActive = false;
  weChangedRate = false;
  weChangedMute = false;
}

function tick() {
  const video = getMainVideo();
  const adNow = isAdShowing();

  if (adNow) {
    applyAdMode(video);
  } else {
    if (isAdActive) restoreUserMode(video);
  }
}

// Some pages are SPA; observe URL changes / DOM mutations:
let lastUrl = location.href;
const urlObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    // On navigation, give DOM a moment to settle then tick
    setTimeout(() => { tick(); }, 500);
  }
});
urlObserver.observe(document.body, { childList: true, subtree: true });

// Extra: keep enforcing settings while ad is active (players sometimes fight changes)
let intervalId = null;

async function main() {
  await loadConfig();

  // Poll frequently but lightly
  intervalId = setInterval(tick, 400);

  // Also watch for class changes on the player to react instantly
  const root = document.documentElement || document.body;
  const mo = new MutationObserver(() => tick());
  mo.observe(root, { attributes: true, childList: true, subtree: true });
}

main().catch(() => {
  // If anything fails, the site just behaves normally.
});
