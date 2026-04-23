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
├── .github/workflows/preview.yml   # Cloudflare Pages PR preview deployment workflow
├── README.md                       # Project documentation
├── ARCHITECTURE.md                 # This file
├── PROMPT.md                       # Original build prompt
└── LICENSE                         # License file
```

## Why a Single File?

Everything lives in one `index.html` with inline `<style>` and `<script>` blocks. This is intentional:

- **Zero build step** — no bundler, no npm, no framework. The file is the app.
- **Deploy and forget** — push to `main` and GitHub Pages serves it. No CI artifacts, no build cache, no dependency updates.
- **Instant load** — one HTTP request for the document, one for the font. No JS bundle to parse.
- **Portable** — can be opened directly from the filesystem (`file://`) for offline use.

## Application Sections

The page is divided into four visual sections, rendered top to bottom:

### 1. Header
Static branding with a link to James Hoffmann's original video.

### 2. Brew Steps (interactive)
A 6-step guided brew timer driven by a finite state machine (see below). Steps display recipe-specific values and countdown timers. This section is hidden until a recipe is selected from the table.

### 3. Ratio Slider
An `<input type="range">` (1:14 to 1:18, step 0.1) that recalculates the entire recipe table on every `input` event. Features:
- **Reset button** — appears only when the slider is away from the default.

### 4. Recipe Table
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
- Countdown timers auto-complete the step when they reach 0:00.
- Users may tap a running step to skip ahead early.
- The "Reset" button returns all steps to their initial state.

### Countdown Durations

Derived from James Hoffmann's improved V60 technique timing:

| Step        | Duration | Rationale                                  |
|-------------|----------|--------------------------------------------|
| Bloom       | 0:45     | Pour bloom water (20% of total), swirl, wait |
| Pour 1      | 0:25     | Pour to 40% of total by 1:10 (45s+25s)     |
| Pour 2      | 0:20     | Pour to 60% of total by 1:30 (70s+20s)     |
| Pour 3      | 0:20     | Pour to 80% of total by 1:50 (90s+20s)     |
| Pour 4      | 0:15     | Pour to 100% of total by 2:05 (110s+15s)   |
| Finish      | 0:55     | Gently swirl and drain, target ~3:00 total  |

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

### PR Previews (Cloudflare Pages)

The workflow `.github/workflows/preview.yml` deploys a preview of each pull request
to Cloudflare Pages. It runs on `pull_request` events (opened, synchronize, reopened,
closed) and:

1. Skips fork PRs (Cloudflare secrets are not available)
2. Validates that `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets are set
3. Applies the same service-worker cache-version and footer-SHA updates as production
4. Deploys to Cloudflare Pages using `wrangler pages deploy` with the PR branch name
5. Posts (or updates) a PR comment with the preview URL
6. Deletes the preview deployment when the PR is closed

## Progressive Web App (PWA)

The app is installable as a PWA for offline use, particularly useful for brewing coffee without network access.

### Components

| File | Purpose |
|------|---------|
| `manifest.json` | Declares app name, icons, theme color, display mode (`standalone`), and start URL |
| `sw.js` | Service worker that caches all app assets and Google Fonts for offline use |
| `icons/` | PNG icons at 192×192 and 512×512, plus maskable variants and an Apple touch icon |

### Caching Strategy

The service worker uses a **cache-first** strategy:

1. **Install** — Pre-caches `index.html`, `manifest.json`, and icons.
2. **Fetch** — Serves cached assets first; falls back to network and caches new responses (including Google Fonts CSS and font files).
3. **Activate** — Cleans up old cache versions when a new service worker is deployed.

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

The suite ([`tests/pwa/ios-pwa.test.js`](tests/pwa/ios-pwa.test.js))
validates:

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

The cache name includes a version string (e.g. `v60-recipe-v1.16.0` for local
development, `v60-recipe-sha-<short-sha>` in production). The value in
`sw.js` (`const CACHE_NAME = 'v60-recipe-...'`) serves as a fallback for
local use; the GitHub Pages deploy workflow automatically rewrites it to
`v60-recipe-sha-${GITHUB_SHA::7}` at build time via a `sed` step in
[`.github/workflows/pages.yml`](.github/workflows/pages.yml). This means every
push to `main` ships with a unique cache name, so the `activate` handler
reliably deletes the previous cache and users always pick up the latest
`index.html`/`sw.js` without needing a manual version bump.

If you need to bust the cache during local development or in a non-Pages
environment, bump the fallback version string in `sw.js` manually.

## Design Trade-offs

| Decision | Rationale |
|----------|-----------|
| Single file over components | Simplicity; no module system needed for ~900 lines |
| Inline CSS/JS over separate files | One fewer HTTP request; easier to maintain as a unit |
| `setInterval` at 200ms over `requestAnimationFrame` | Sufficient precision for second-resolution countdowns; simpler code |
| 10g water increments | Captures the classic 250g recipe (missed with 20g increments) while keeping the table scannable |
| Sequential step enforcement | Prevents user error during brewing — can't accidentally start pour 2 before pour 1 |
| Auto-complete on countdown zero | Hands-free brewing — user doesn't need to tap when timer expires |
