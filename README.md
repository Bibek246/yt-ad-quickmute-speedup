# YouTube Ad Mute & Speedup (Auto Skip/Next) — MV3

Mutes and speeds up YouTube ads (optionally to 16×), **auto-clicks YouTube’s own Skip/Next buttons when they appear**, and then cleanly restores your previous volume and playback speed. Built for Chrome Manifest V3.

##  Features

-  **Auto-mute during ads**, restores your prior mute state after
-  **Speed up ads** to your chosen rate (default 4×) or **force max (16×)**
-  **Auto-click “Skip”/“Next”** when YouTube shows the button (no hidden skipping)
-  **Accurate ad detection**: uses the active player’s `ad-showing` / `ad-interrupting` classes and true ad UI (skip/countdown) inside the same player
-  Works across navigations (YouTube SPA), mid-rolls, ad pods
-  MV3-safe (no inline scripts; CSP-compliant options page)

## Folder structure

```
yt-ad-quickmute-speedup/
├─ manifest.json
├─ content.js
├─ options.html
├─ options.js
└─ icons/
   ├─ icon16.png
   ├─ icon32.png
   ├─ icon48.png
   └─ icon128.png
```

## Installation (Chrome / Edge / Brave)

1. Download or clone this repo.
2. Open `chrome://extensions` (or `edge://extensions` / `brave://extensions`).
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the `yt-ad-quickmute-speedup` folder.
5. (Optional) Right-click the extension → **Options** to tweak settings.

> **Updating:** Make changes to files and click **Reload** on the extension card.

## Options

- **Default ad playback speed**: number (0.1–16), used when Max is **OFF**
- **Use max ad speed (16×)**: if **ON**, ads force to 16×
- **Auto-click Skip/Next if shown**: if **ON**, clicks YouTube’s own controls when they appear

## How it works (technical notes)

- Detects ads using the **current player’s**:
  - `ad-showing` / `ad-interrupting` classes, **or**
  - visible ad-only UI (Skip button, countdown pie) **inside that same player**
- On ad start:
  - Saves your **current** `playbackRate` and `muted` state
  - Sets `muted = true` and `playbackRate = <configured or 16×>`
- During ads:
  - Re-checks every ~150ms and **clicks Skip/Next** the moment it’s clickable  
    (simulates mouseover → mousedown → mouseup → click)
- On ad end:
  - Requires ~1s of **clean player** (no ad classes/UI) to avoid flicker issues
  - Restores **only** what it changed (won’t unmute if you were muted before)

## Permissions rationale

- `"host_permissions": ["*://www.youtube.com/*", "*://m.youtube.com/*"]`  
  Needed to run the content script on YouTube pages only.
- `"storage"`  
  Saves your options (speed, max-speed toggle, auto-skip toggle).

## Privacy

- No analytics, no network calls, no data collection.  
- Runs entirely on your device and only on YouTube pages.

## Compatibility

- Chrome, Edge, Brave (Manifest V3)
- Standard YouTube player (watch pages). Shorts/embeds generally work, but selector differences can require tweaks.

## Troubleshooting

**Options page shows CSP error (“Refused to execute inline script…”):**  
MV3 forbids inline scripts. Use an external `options.js` and include it like:  
```html
<script src="options.js" defer></script>
```

**Extension doesn’t load (“Could not load icon …”):**  
Either add the icons under `icons/` with the exact filenames or remove the `"icons"` block from `manifest.json`.

**Video stays muted or fast after the ad:**  
- Ensure you’re on the latest build with strict, scoped detection.
- The extension requires ~1s of a clean player (no ad classes/UI) before restoring.
- If it persists on a specific surface (e.g., Shorts), open an issue with the URL pattern.

**Skip isn’t clicked:**  
- The extension only clicks **YouTube’s own Skip/Next**. It won’t simulate hidden/non-UI skipping.
- Some locales/experiments change CSS. If you see a visible Skip button that isn’t clicked, share a screenshot/outerHTML so selectors can be updated.

## Known limitations

- YouTube can **clamp playback rate** on some ad formats; if 16× doesn’t “stick,” try 2×–4×.
- UI/CSS experiments or locale variants may change button selectors.
- Shorts and embedded players occasionally differ; report cases so selectors can be tuned.
- Respect YouTube’s Terms for your usage. The extension **does not skip ads invisibly**; it only interacts with visible UI and playback.

## Development notes

- Built for MV3; no inline JS or remote code.
- Content script runs at `document_idle` and uses MutationObservers + a 150ms loop.
- Options stored via `chrome.storage.sync`.

## License


MIT License — Copyright (c) 2025 <Bibek Sharma>
Permission is hereby granted, free of charge, to any person obtaining a copy...

## Disclaimer

This tool adjusts playback and clicks **YouTube’s visible controls** only. You’re responsible for ensuring your use complies with YouTube’s Terms of Service.
