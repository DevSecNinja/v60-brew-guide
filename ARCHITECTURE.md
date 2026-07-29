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
├── scripts/check-sw-version.js     # Guard that requires cache-version bumps for deployed asset changes
├── playwright.config.js            # Playwright config (WebKit / iPhone 14 e2e tests)
├── .github/workflows/pages.yml     # GitHub Pages deployment workflow
├── .github/workflows/sw-version-check.yml # PR guard for service-worker cache versioning
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
4. **Static assets** — Google Fonts and other same-origin static assets are
   **cache-first** with network fallback. Only successful `200` responses are
   stored.
5. **Everything else** — Cross-origin requests other than Google Fonts, and all
   non-`GET` requests, are network-only.
6. **Activate** — Deletes cache buckets whose name does not match the current
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
reload is deferred while a brew timer or temperature-prep timer is visibly
running. A deferred reload is retried when the brew completes or the page is
backgrounded.

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
  static assets are cache-first, and offline fallbacks do not overwrite cached
  successful responses

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

`sw.js` declares a semver cache name:

```js
const CACHE_NAME = 'v60-brew-guide-v1.19.0';
```

Any change to a deployed asset must increase this value. This includes
`index.html`, `manifest.json`, `icons/`, and other client-served HTML/CSS/JS.
Browsers only run the service-worker update flow after they detect a changed
`sw.js`; if cached assets change but `CACHE_NAME` does not, installed PWAs can
keep serving old cached HTML indefinitely.

The PR workflow
[`sw-version-check.yml`](.github/workflows/sw-version-check.yml) runs
`npm run check:sw-version` and fails when guarded assets changed without a
strictly higher `CACHE_NAME`. For local checks, run the same command. You can
override the comparison refs with `SW_VERSION_CHECK_BASE_REF` and
`SW_VERSION_CHECK_HEAD_REF` when testing a branch locally.

## Design Trade-offs

| Decision | Rationale |
|----------|-----------|
| Single file over components | Simplicity; no module system needed for ~900 lines |
| Inline CSS/JS over separate files | One fewer HTTP request; easier to maintain as a unit |
| `setInterval` at 200ms over `requestAnimationFrame` | Sufficient precision for second-resolution countdowns; simpler code |
| 10g water increments | Captures the classic 250g recipe (missed with 20g increments) while keeping the table scannable |
| Sequential step enforcement | Prevents user error during brewing — can't accidentally start pour 2 before pour 1 |
| Auto-complete on countdown zero | Hands-free brewing — user doesn't need to tap when timer expires |
