# ☕ V60 Brew Guide

A simple, static V60 pour-over coffee brew guide based on [James Hoffmann's Ultimate V60 Technique](https://www.youtube.com/watch?v=1oB1oDrDkHM). It is a step-by-step guide, not just a number cruncher — pick a recipe, follow the timed pours, and adjust the ratio to taste.

## 🔗 Live Site

**[v60.ravensberg.org](https://v60.ravensberg.org/)**

## What It Does

- Displays a reference table with V60 recipes scaled from 100ml to 500ml in 20ml increments
- Shows coffee dose, bloom water, and pour targets for each brew size
- Highlights the classic 250ml recipe (15g coffee → 250g water)
- Includes an adjustable ratio slider (1:14 – 1:18) that recalculates all values in real time
- Mobile-friendly — designed to be checked on your phone while brewing

## Tech

- **Zero dependencies** — a single `index.html` file with inline CSS and JavaScript
- Hosted via GitHub Pages with automated deployment
- No frameworks, no build tools, no npm — deploy and forget

## Gotchas

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
