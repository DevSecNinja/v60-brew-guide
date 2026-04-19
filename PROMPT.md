# V60 Recipe Calculator — Build Prompt

Build a static V60 coffee recipe calculator website based on [James Hoffmann's Ultimate V60 Technique](https://www.youtube.com/watch?v=1oB1oDrDkHM).

## Core Concept

James Hoffmann's base recipe uses a **1:16.67 ratio** (15g coffee → 250g water). The brewing follows this pour structure:

1. **Bloom** — pour 20% of total water (e.g., 50g for 250g), swirl, wait 45 seconds
2. **Pour 1** — pour up to 40% of total water by 1:10
3. **Pour 2** — pour up to 60% of total water by 1:30
4. **Pour 3** — pour up to 80% of total water by 1:50
5. **Pour 4** — pour up to 100% of total water by 2:05
6. Final gentle swirl, let drain — target total brew time ~3:00

Users often want to brew slightly more or less than 250ml but don't want to recalculate the pour breakdown manually.

## Features

- Display a **reference table** showing the recipe scaled in **20ml water increments** from **100ml to 500ml**, with columns for:
  - Total water (g)
  - Coffee dose (g), rounded to 1 decimal
  - Bloom water (g) — 20% of total water
  - Pour 1 target (g) — 40% of total water
  - Pour 2 target (g) — 60% of total water
  - Pour 3 target (g) — 80% of total water
  - Pour 4 target (g) — 100% of total water
- **Highlight the classic 250ml row** as the default/base recipe
- Add a **ratio slider** (range: 1:14 to 1:18, step 0.1, default 1:16.7) that **dynamically recalculates** all table values when adjusted. Display the current ratio value next to the slider.
- Responsive, **mobile-friendly layout** (users will check this on their phone while brewing)

## Tech & Hosting

- **Static HTML/CSS/JS only** — zero dependencies, no frameworks, no build tools, no npm. A single `index.html` file (with inline CSS/JS) is ideal. Deploy-and-forget.
- Host via **GitHub Pages**. Add a GitHub Actions workflow (`.github/workflows/pages.yml`) that deploys the site from the repository root.

## Design

- Modern, clean layout with a **coffee-brown color palette** (e.g., espresso dark brown `#3E2723`, cream `#EFEBE9`, accent `#8D6E63`)
- Use **Google Fonts** via CDN for a modern feel (e.g., Inter or similar)
- Subtle styling touches: rounded corners, soft shadows, good spacing

## Credits & Links

- Credit **James Hoffmann** with a link to his video: https://www.youtube.com/watch?v=1oB1oDrDkHM
- Note that the spelling is "Hoffmann" (two f's, two n's)
- Include a footer linking to my GitHub profile: https://github.com/DevSecNinja

## Documentation

- Write a `README.md` with:
  - What the site does
  - A link to the live GitHub Pages URL (`https://v60.ravensberg.org/`)
  - Credit to James Hoffmann
  - A note that the site has zero dependencies and requires no maintenance
