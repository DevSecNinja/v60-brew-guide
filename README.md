# ☕ V60 Brew Guide

A simple, static V60 pour-over coffee brew guide based on [James Hoffmann's Ultimate V60 Technique](https://www.youtube.com/watch?v=1oB1oDrDkHM). It is a step-by-step guide, not just a number cruncher — pick a recipe, follow the timed pours, and adjust the ratio to taste.

## 🔗 Live Site

**[v60.ravensberg.org](https://v60.ravensberg.org/)**

## What It Does

- Displays a reference table with V60 recipes scaled from 100g to 500g in 10g increments
- Shows coffee dose, bloom water, and pour targets for each brew size
- Highlights the classic 250ml recipe (15g coffee → 250g water)
- Includes an adjustable ratio slider (1:14 – 1:18) that recalculates all values in real time
- Mobile-friendly — designed to be checked on your phone while brewing
- Supports any scale, with dedicated Maestri House K112 manual and automatic setup guidance
- Offers app-guided timing or a scale-timed reference without a competing app clock
- Shows the current cumulative target, amount for this pour, elapsed time, and next step
- Calculates custom recipes from the coffee dose you actually weighed; shares and favorites preserve that dose
- Keeps drawdown running until you confirm it has finished, rather than declaring completion at three minutes
- Saves local brew history with actual dose, water, time, beans, grind, taste, and K112 behavior notes

## Brewing with a scale

Choose **Any scale** or **Maestri House K112** in *Your brewing setup*. The default
remains any scale with app-guided timing. K112 owners can choose **Manual** or
**Automatic (try it out)** independently of which device supplies the clock.
The setup and timer-start preference are remembered on this browser.

- **App timing:** choose an immediate start or the existing three-second countdown.
  Begin pouring when the clock starts. Steps follow absolute times from that first
  pour, including after returning from the background. Advancing a step early
  does not move the remaining recipe deadlines. Audio cues require browser support;
  keeping the app visible is best.
- **Scale timing:** start the scale timer manually with the first pour, or let the
  K112 trigger in automatic mode. Tap *Begin scale-timed brew* to keep the guide
  active, then follow the static cumulative timeline. This button does not start
  or synchronize the hardware clock.
- **Finish:** tap *Drawdown finished* when drainage actually finishes. In app mode,
  the finish step remains active past the approximate three-minute target. In
  scale mode, manually enter the timer reading.

The [supplied K112 manual](https://cdn.shopify.com/s/files/1/0596/5335/7750/files/K112_EN_DE_Manual.pdf?v=1750065226)
(printed pages 3, 5-10) describes flow-triggered automatic timing with possible
start delay and stopping when flow stops. Its behavior during pulse pours should
be tested on your own unit. Manual mode is the more predictable starting point;
automatic mode is available for comparison, not treated as a verified full-brew
timer. History distinguishes app elapsed time from reported automatic scale time,
which may exclude pauses or drawdown. There is no Bluetooth connection, weight
import, or automatic detection in the app.

Use grams, tare the brewing equipment before weighing coffee, then tare again
before the first pour. **Do not tare between pours.** Targets mean cumulative
water poured, not beverage yield. Follow the K112 manual's silicone-pad, dry-port,
no-use-while-charging, and 2,000g total-load guidance.

## Dose recipes and history

Enter coffee in 0.1g increments under the ratio slider and choose *Use this dose*.
Water rounds to whole grams and must remain within the existing 100-500g brew
range. For example, 15.2g at 1:16.7 produces a 254g water target. Changing the ratio
keeps the dose fixed. Table-selected recipes instead keep water fixed.

After brewing, confirm the dose, enter actual water poured, and confirm or enter
the finish time as `m:ss`. Notes are optional. Choose *Save brew* or *Skip saving*
before brewing again. Recipe/setup changes are locked during an active brew or
while results await saving; *Reset* explicitly discards the current session.
Saved history can repeat the original recipe/setup or delete an individual brew.
No automatic extraction or taste diagnosis is inferred from these measurements.

History, favorites, and preferences stay in local browser storage and work offline
after the app has been cached. They do not sync between devices. Storage failures
are displayed, and a failed history save leaves the result form available to retry.
Clearing browser data removes saved information.

## Tech

- **Zero runtime dependencies** — a single `index.html` file with inline CSS and JavaScript
- Hosted via GitHub Pages with automated deployment
- No frameworks and no build step — static files are served as-is

## Gotchas

- **Treat the service worker cache version as a cache-schema version.**
  `CACHE_NAME` in `sw.js` only needs to change when the cache layout or
  contents scheme changes. Normal deployed asset updates self-heal:
  navigation/HTML and `manifest.json` are network-first, while same-origin
  static assets are stale-while-revalidate.
- **iOS PWA wake lock requires a user gesture.** The Screen Wake Lock API
  cannot be granted on iOS / iPadOS standalone PWAs without an explicit user
  interaction (tap, scroll, keypress). The app therefore acquires the lock
  on the first gesture rather than on app open, and re-acquires it on the
  next gesture after returning from the background. In practice the screen
  stays on from your very first interaction, but a freshly-launched app
  sitting idle on the table will still dim and lock as usual.

## Credits

- Recipe by **James Hoffmann** — [The Ultimate V60 Technique](https://www.youtube.com/watch?v=1oB1oDrDkHM)
- Built by [DevSecNinja](https://github.com/DevSecNinja)
