# Architecture & Design Decisions

## Overview

The V60 Recipe Calculator is a single-file static web application (`index.html`) with zero external dependencies beyond a Google Fonts CDN link. It is designed to be opened on a phone while brewing coffee and deployed via GitHub Pages with no build step. It is installable as a Progressive Web App (PWA) for offline use on iOS, Android, and desktop.

## File Structure

```
.
├── index.html                      # Entire application (HTML + inline CSS + inline JS)
├── manifest.json                   # PWA web app manifest
├── sw.js                           # Service worker for offline caching
├── icons/                          # PWA & Apple touch icons
│   ├── icon.png                    # Source logo (1024×1024)
│   ├── icon-192.png                # 192×192 app icon
│   ├── icon-512.png                # 512×512 app icon
│   ├── icon-maskable-192.png       # 192×192 maskable icon
│   ├── icon-maskable-512.png       # 512×512 maskable icon
│   ├── apple-touch-icon.png        # 180×180 Apple touch icon
│   └── favicon.ico                 # Multi-size favicon (16×16, 32×32)
├── playwright.config.js            # Playwright config (WebKit / iPhone 14 e2e tests)
├── .github/workflows/pages.yml     # GitHub Pages deployment workflow
├── README.md                       # Project documentation
├── ARCHITECTURE.md                 # This file
├── PROMPT.md                       # Original build prompt
└── LICENSE                         # License file
```

## Why a Single File?

Everything lives in one `index.html` with inline `<style>` and `<script>` blocks. This is intentional:

- **Zero build step** — no bundler and no framework. The file is the app.
- **Deploy and forget** — push to `main` and GitHub Pages serves it. No CI artifacts, no build cache, no dependency updates.
- **Instant load** — one HTTP request for the document, one for the font. No JS bundle to parse.
- **Portable** — can be opened directly from the filesystem (`file://`) for offline use.

## Application Sections

### Numbered, progressively revealed journey

The single document follows introduction, recipe selection, scale/coffee setup,
water preparation, brewing, and results, in that DOM order. All controls remain
mounted: disclosure uses `hidden` on stage containers and native `<details>` for
optional content. The full recipe table and the six-step brew grid are secondary
disclosures rather than competing with the focused action.

`recipeConfirmed`, `setupConfirmed` and `waterConfirmed` are memory-only gates.
Recipe selection stays in step 2 without closing its editors or moving focus.
If the confirmation is off-screen, it scrolls into view without a focus change.
Re-selecting the identical recipe before brewing is a no-op that preserves gates
and completed water preparation.
Continue confirms the recipe and reveals setup; setup confirmation reveals water preparation, whose
confirmation reveals brewing. Changing equipment requires setup confirmation again.
Reset or Brew another one returns to water preparation. Ratio-only changes preserve
completed preparation and existing gates when no brew has started. Reload restores
recipes and preferences, not gates, running clocks or pending results.

Step 2 starts with three water presets and then saved recipes as full-width bars.
Ratio/dose editing and the full table are closed native disclosures; a transient
Manage/Done toggle exposes favorite editing, deletion and reorder controls.
The selection live region is permanently mounted and visually hidden, including
before the first choice. A highlighted, labeled confirmation card presents water,
coffee and ratio together with Continue. The selected summary is announced
only when it changes, not on each brew tick. Restored recipes start with the recipe
editor collapsed and still require Continue. Favorites use native selection
buttons and keyboard reorder controls with focus retained across re-rendering.

`focusJourneyStage` moves focus to the next stage heading and scrolls it into view
on explicit transitions, respecting reduced motion. Completion focuses results.
Lock explanations sit within affected groups. `v60_intro_open` remembers the
introductory disclosure, which defaults open for a fresh, unselected session.

### Scale setup

Persisted `v60_setup` preferences select a generic or K112 scale, K112 manual or
automatic hardware mode, app or scale timing, and a zero/three-second app start
delay. Hardware mode and timing source are independent. The app never connects
to the scale or infers actual measurements from recipe targets. Setup guidance
comes from the linked K112 manual; automatic mode is explicitly experimental for
pulse pours.

### Header
Static branding with a link to James Hoffmann's original video.

### Brew steps
A focused current-step view plus a collapsible six-step guide, populated by table,
dose, favorite, shared-link, or last-brew selection. App timing shows cumulative
targets, planned increments, elapsed time, step countdown and next action. Scale
timing hides the interactive steps and displays a static reference timeline, with
an explicit session start/finish and no app brew clock.

### Ratio slider
An `<input type="range">` (1:14 to 1:18, step 0.1) that recalculates the entire recipe table on every `input` event. Features:
- **Reset button** — appears only when the slider is away from the default.
- **Dose input** — builds custom whole-gram water recipes from a 0.1g coffee dose.
  Supported water remains 100-500g; invalid combinations produce a visible error.
  Dose-based recipes retain coffee when ratio changes; table recipes retain water.
Each input event performs one table rebuild with a single favorite-key snapshot.
Range-rejection feedback is displayed next to the ratio slider without collapsing
the editor; the last valid recipe is retained.
URL updates are debounced for slider input, flushed on change/share, and skipped
when unchanged. Sharing builds the URL directly even if browser address updates fail.

### Recipe table
A dynamically generated `<table>` with rows from 100g to 500g water in 10g increments. Columns: Water, Coffee (1 decimal), Bloom (20% of water), Pour 1 (40% of water), Pour 2 (60% of water), Pour 3 (80% of water), Pour 4 (100% of water). The 250g row is permanently highlighted as the classic recipe. Clicking a row selects it and loads its values into the brew steps.

## Brew Step State Machine

Each of the 6 brew steps transitions through a strict sequential state machine:

```
locked → available → running → completed
```

| State       | Visual                          | Interaction              |
|-------------|---------------------------------|--------------------------|
| `locked`    | Dimmed, `cursor: not-allowed`   | None                     |
| `available` | Accent border, "▶ Tap to start" | Tap → starts countdown   |
| `running`   | Orange border, pulsing glow     | Tap → skip (early complete) |
| `completed` | Green background & border       | None                     |

**Rules:**
- Only step 1 starts as `available`; all others are `locked`.
- A step can only become `available` when the previous step is `completed`.
- Pour countdowns auto-complete at their deadlines; drawdown requires confirmation.
- Users may tap a running step to skip ahead early.
- The "Reset" button returns all steps to their initial state.

### Clock and drawdown

An app brew uses one wall-clock origin and one refresh interval. Pour deadlines
are 45, 70, 90, 110 and 125 seconds from the first pour. Each refresh catches up
all expired steps, so browser throttling does not restart missed durations.
Early manual advancement does not shift later deadlines. Catch-up skips obsolete
notifications. The three-second pre-start countdown is separate and may be bypassed
or disabled. Optional water preparation is not included in elapsed brew time.

The final step is open-ended: 180 seconds is only a target. It shows total elapsed
time and finishes only on explicit confirmation. A scale-timed session uses
`scaleBrewActive` instead of a brew interval, and requires manual time entry after
completion. Both types keep the wake-lock lifecycle and service-worker reload
guard active. Pending, unsaved results also block update-triggered reloads.

### Reference durations

Derived from James Hoffmann's improved V60 technique timing:

| Step        | Duration | Rationale                                  |
|-------------|----------|--------------------------------------------|
| Bloom       | 0:45     | Pour bloom water (20% of total), swirl, wait |
| Pour 1      | 0:25     | Pour to 40% of total by 1:10 (45s+25s)     |
| Pour 2      | 0:20     | Pour to 60% of total by 1:30 (70s+20s)     |
| Pour 3      | 0:20     | Pour to 80% of total by 1:50 (90s+20s)     |
| Pour 4      | 0:15     | Pour to 100% of total by 2:05 (110s+15s)   |
| Finish      | Open-ended | Gently swirl and drain, target ~3:00 total; user confirms |

### Recipe and result persistence

`makeRecipe` centralizes water/dose validation and cumulative targets. Recipes
include `ratio` and a `basis` (`water` or `dose`). Custom shares add `coffee` to
the existing ratio/water URL format. Dose favorites have an additional dose key
suffix, preserving legacy water/ratio favorite keys without collisions. Legacy
favorites and last brews are restored as water-first recipes. Invalid favorite
entries are filtered with a visible warning rather than aborting initialization.
Dose favorites must have a supported basis and a finite 0.1g coffee amount that
reproduces their whole-gram water target at the saved ratio.
Every accepted favorite is normalized through `makeRecipe` and `getFavoriteKey`,
preserving notes and other metadata while computing water-first coffee/pour values
and canonical ratios/keys. Duplicate identities retain the first valid entry with
a warning. Reading favorites does not rewrite the stored payload.

Recipe restoration itself never requests notification permission. Continue
requests permission for app-timed recipes on an explicit gesture, after history
repeat has restored the saved setup. Switching from scale timing to app timing
also requests permission. Neither path shares the brew-start gesture, avoiding
the iOS wake-lock/permission interaction.

Completing a brew snapshots its recipe, equipment/mode, timing source and estimated
temperature target. The result form requires actual water and a valid `m:ss` time;
it never saves target water as if measured. `v60_history` stores confirmed dose,
water, time, notes and the immutable recipe snapshot. Time provenance distinguishes
app elapsed, manually corrected elapsed, manual scale, and automatic scale readings.
Automatic scale time is not represented as guaranteed whole-brew elapsed time.
Repeat uses the original recipe and setup, not the actual-water result.

Controls that would mutate a running recipe or an unsaved result are disabled.
Reset explicitly clears current timers/results; Save or Skip saving unlocks the
next brew. Storage failures are visible and failed saves preserve the form.
History recipe snapshots are validated and normalized through `makeRecipe` before
rendering; stored free-form values are escaped. Malformed history is not overwritten.
An explicit, confirmed recovery action removes only the history key and retains
current unsaved inputs, setup and favorites. History is local-only with individual
deletion, no implicit retention cutoff, backend or new runtime dependencies.
Only an absent storage key uses the missing-data default; a stored empty string
is unreadable data and must follow the same explicit history recovery flow.

## Styling & Theming

All styling uses CSS custom properties defined in `:root` for easy theming:

| Variable             | Value     | Usage                       |
|----------------------|-----------|-----------------------------|
| `--espresso`         | `#3E2723` | Header background, headings |
| `--dark-brown`       | `#4E342E` | Header gradient end         |
| `--medium-brown`     | `#5D4037` | Hover states                |
| `--accent`           | `#8D6E63` | Borders, slider thumb, links|
| `--cream`            | `#EFEBE9` | Table header, step backgrounds |
| `--cream-light`      | `#FAF7F5` | Page background             |
| `--highlight-bg/border` | Orange tones | Default 250g row, running steps |
| `--selected-bg/border`  | Blue tones  | User-selected table row     |
| `--green-*`          | Green tones | Completed steps             |

Typography uses [Inter](https://fonts.google.com/specimen/Inter) via Google Fonts CDN, with a system font fallback stack.

## Responsive Design

- Max content width of 800px, centered.
- The brew steps grid uses `repeat(auto-fit, minmax(160px, 1fr))` — 4 columns on desktop, 2 on mobile.
- The recipe table scrolls horizontally on narrow screens via `overflow-x: auto`.
- A `@media (max-width: 480px)` breakpoint reduces padding and font sizes.

## Deployment

### Production (GitHub Pages)

The GitHub Actions workflow (`.github/workflows/pages.yml`) deploys on every push to `main`:

1. Checkout the repository
2. Upload the entire root as a Pages artifact
3. Deploy to GitHub Pages

No build command is needed — the static files are served as-is.

### PR Previews

The Pages workflow also runs on pull requests (opened, synchronize, reopened,
closed) and delegates to the shared reusable Pages workflow with the repository
root as the deployment artifact. Markdown-only changes are ignored.

## Progressive Web App (PWA)

The app is installable as a PWA for offline use, particularly useful for brewing coffee without network access.

### Components

| File | Purpose |
|------|---------|
| `manifest.json` | Declares app name, icons, theme color, display mode (`standalone`), and start URL |
| `sw.js` | Service worker that keeps HTML/update metadata fresh while caching the app shell and fonts for offline use |
| `icons/` | PNG icons at 192×192 and 512×512, plus maskable variants and an Apple touch icon |

### Caching Strategy

The service worker uses different strategies by request type:

1. **Install** — Opens the current `CACHE_NAME` and caches each core app-shell
   asset (`./`, `index.html`, `manifest.json`, and required icons)
   individually. A single failed asset is logged but does not abort the whole
   install.
2. **Navigation / HTML** — Same-origin document requests are **network-first**.
   Successful `200` responses are cached. If the network fails, the service
   worker falls back to the cached request, then `./index.html`, then `./`, and
   finally a `503 Offline` response.
3. **Update resources** — Same-origin `sw.js` and `manifest.json` are
   **network-first** with cached fallback so update metadata does not stay stale.
4. **Google Fonts** — Google Fonts CSS and font files are **cache-first** with
   network fallback. Only successful `200` responses are stored.
5. **Static assets** — Other same-origin static assets are
   **stale-while-revalidate**: a cached response is returned immediately, while
   a successful network refresh updates the cache for the next load.
6. **Everything else** — Cross-origin requests other than Google Fonts, and all
   non-`GET` requests, are network-only.
7. **Activate** — Deletes cache buckets whose name does not match the current
   `CACHE_NAME`, then calls `clients.claim()` so open pages are controlled by
   the activated worker.

### Service Worker Update Lifecycle

`index.html` registers `sw.js` with `updateViaCache: 'none'`, then checks for
updates through a throttled `checkForSwUpdate()` helper. The helper calls
`registration.update()` at most once per 60 seconds and is invoked on initial
registration, hourly, when the page becomes visible, on `pageshow`, and when the
browser comes back online. These extra triggers matter for installed iOS PWAs,
which are often frozen and restored instead of fully reloaded.

If registration finds an already-waiting worker, the page posts
`{ type: 'SKIP_WAITING' }` immediately. For newly detected updates,
`updatefound` watches the installing worker; when it reaches `installed` while
an existing controller is present, the page sends the same `SKIP_WAITING`
message. The worker handles that message with `self.skipWaiting()`, then the
activate handler clears old caches and claims clients.

The page listens for `controllerchange` after activation and reloads so the new
HTML and JavaScript are running. Because brew timer state is in memory, the
reload is suppressed while an app brew, scale-timed session, temperature-prep
timer, or unsaved result is active. First-time control is not treated as an
update: the initial HTML is already loaded, and reloading would interrupt setup.

### iOS (iPhone/iPad) Support

Apple-specific meta tags ensure proper behavior when added to the home screen:

- `apple-mobile-web-app-capable` — launches in standalone mode (no Safari chrome).
- `apple-mobile-web-app-status-bar-style` — dark translucent status bar matching the espresso theme.
- `apple-mobile-web-app-title` — "V60 Recipe" as the home screen label.
- `apple-touch-icon` — 180×180 icon used on the home screen.

### Testing the iOS / iPadOS PWA Experience

Because testing the installed PWA on real Apple hardware is expensive,
the project uses **two complementary test suites** to lock down iOS
behaviour:

#### 1. Static contract tests (Jest + JSDOM)

```bash
npm run test:pwa
```

The static PWA tests include
[`tests/pwa/ios-pwa.test.js`](tests/pwa/ios-pwa.test.js) for the iOS install
contract and
[`tests/pwa/sw-cache-strategy.test.js`](tests/pwa/sw-cache-strategy.test.js)
for the service-worker caching behaviour. Together they validate:

- Apple-specific meta tags (`apple-mobile-web-app-capable`,
  `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`)
- The `apple-touch-icon` link and that the referenced file exists
- Viewport with `viewport-fit=cover` and `env(safe-area-inset-*)`
  usage for Dynamic Island / notch handling
- iOS zoom-prevention handlers (`gesturestart`, `touchend`,
  `touchmove`, …)
- `manifest.json` validity and required PWA fields
  (`display=standalone`, theme/background color, 192×192 & 512×512
  icons, maskable icons)
- Service worker pre-cache, `SKIP_WAITING` + `clients.claim()` update
  flow (important on iOS, where a waiting worker often never activates
  until the app is force-quit)
- Service worker fetch strategy: navigation/HTML is network-first, same-origin
  static assets are stale-while-revalidate, and offline fallbacks do not
  overwrite cached successful responses

When making changes, run `npm run test:pwa` to catch regressions
that would break the home-screen install, offline launch, or
standalone-mode experience on iOS / iPadOS.

#### 2. End-to-end runtime tests (Playwright + WebKit)

```bash
npm run test:e2e
```

The suite ([`tests/e2e/ios-webkit.spec.js`](tests/e2e/ios-webkit.spec.js))
runs the app in a real WebKit engine emulating an iPhone 14 via
[`playwright.config.js`](playwright.config.js). It catches runtime-only
iOS bugs that static DOM assertions cannot:

| Group | What is tested |
|---|---|
| **Page load** | App title, recipe table renders, JS initialisation ran |
| **Zoom prevention** | `gesturestart` is cancelled; two-finger `touchmove` suppressed; single-finger scroll is **not** suppressed |
| **Ratio slider** | Touch-driven slider input updates the coffee column in the table |
| **Brew timer** | Tapping a recipe row reveals the brew steps; first step becomes available |
| **Offline launch** | Service worker becomes the page controller; Cache API holds the core pre-cached assets |
| **Viewport meta** | `initial-scale=1`, `user-scalable=no`, `maximum-scale=1` are set correctly |

The Playwright configuration ([`playwright.config.js`](playwright.config.js))
uses the `iPhone 14` device preset and spins up a local static-file server
(via `serve`) so no build step is needed.

### Cache Versioning

`CACHE_NAME` in `sw.js` is a semver-shaped cache-schema version, not a
per-release asset version. Bump it only when the cache layout or contents
scheme changes, such as changing cache keys, buckets, or the app-shell caching
model.

Normal deployed asset changes do not require a `CACHE_NAME` bump.
Navigation/HTML and `manifest.json` are network-first, so fresh app code and
update metadata are preferred whenever the network is available. Other
same-origin static assets are stale-while-revalidate, so an outdated cached
asset is refreshed in the background and self-heals on the next load.

## Design Trade-offs

| Decision | Rationale |
|----------|-----------|
| Single file over components | Simplicity; no module system needed for ~900 lines |
| Inline CSS/JS over separate files | One fewer HTTP request; easier to maintain as a unit |
| `setInterval` at 200ms over `requestAnimationFrame` | Sufficient precision for second-resolution countdowns; simpler code |
| 10g water increments | Captures the classic 250g recipe (missed with 20g increments) while keeping the table scannable |
| Sequential step enforcement | Prevents user error during brewing — can't accidentally start pour 2 before pour 1 |
| Auto-complete on countdown zero | Hands-free brewing — user doesn't need to tap when timer expires |
