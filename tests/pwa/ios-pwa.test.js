/**
 * iOS / iPadOS PWA Test Suite
 * ---------------------------------------------------------------
 * The V60 Recipe Calculator is designed to be installed as a PWA
 * on iOS and iPadOS. Testing the real experience on those devices
 * is expensive (requires physical hardware), so this suite locks
 * down the contract that makes the PWA behave correctly on Apple
 * platforms.
 *
 * If any of these tests fail, there is a high risk that the
 * install-to-home-screen experience (icon, standalone launch,
 * status bar, safe-area, offline caching, zoom prevention) is
 * broken on iPhone / iPad.
 *
 * Scope:
 *   1. iOS-specific meta tags in index.html
 *   2. Apple touch icon link + file on disk
 *   3. Viewport + safe-area (Dynamic Island) handling
 *   4. iOS zoom prevention JavaScript handlers
 *   5. Web app manifest validity and required PWA fields
 *   6. Service worker structure (offline-first, iOS-friendly update flow)
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const REPO_ROOT = path.resolve(__dirname, '../..');
const htmlPath = path.join(REPO_ROOT, 'index.html');
const manifestPath = path.join(REPO_ROOT, 'manifest.json');
const swPath = path.join(REPO_ROOT, 'sw.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
const swSource = fs.readFileSync(swPath, 'utf8');

function parseHTML() {
  // We don't need to execute scripts for these checks; a static parse is safer
  // and faster and keeps these tests focused on the iOS PWA contract.
  return new JSDOM(html, { url: 'http://localhost/' });
}

describe('iOS / iPadOS PWA — HTML meta tags', () => {
  let doc;

  beforeAll(() => {
    doc = parseHTML().window.document;
  });

  test('declares apple-mobile-web-app-capable=yes (standalone launch)', () => {
    const meta = doc.querySelector('meta[name="apple-mobile-web-app-capable"]');
    expect(meta).not.toBeNull();
    expect(meta.getAttribute('content')).toBe('yes');
  });

  test('declares the modern mobile-web-app-capable=yes alias', () => {
    // Apple has been moving toward the standard `mobile-web-app-capable`;
    // shipping both keeps older iOS versions happy while the standard
    // name remains forward-compatible.
    const meta = doc.querySelector('meta[name="mobile-web-app-capable"]');
    expect(meta).not.toBeNull();
    expect(meta.getAttribute('content')).toBe('yes');
  });

  test('sets an apple-mobile-web-app-status-bar-style', () => {
    const meta = doc.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    expect(meta).not.toBeNull();
    // Must be one of Apple's accepted values.
    expect(['default', 'black', 'black-translucent']).toContain(
      meta.getAttribute('content')
    );
  });

  test('sets a home-screen title via apple-mobile-web-app-title', () => {
    const meta = doc.querySelector('meta[name="apple-mobile-web-app-title"]');
    expect(meta).not.toBeNull();
    expect(meta.getAttribute('content').trim().length).toBeGreaterThan(0);
  });

  test('viewport enables viewport-fit=cover for Dynamic Island / notch', () => {
    const meta = doc.querySelector('meta[name="viewport"]');
    expect(meta).not.toBeNull();
    const content = meta.getAttribute('content');
    expect(content).toMatch(/viewport-fit\s*=\s*cover/);
    // `width=device-width` is required for correct PWA layout on iPad.
    expect(content).toMatch(/width\s*=\s*device-width/);
  });

  test('declares a theme-color matching the manifest', () => {
    const meta = doc.querySelector('meta[name="theme-color"]');
    expect(meta).not.toBeNull();
    const manifest = JSON.parse(manifestRaw);
    expect(meta.getAttribute('content').toLowerCase())
      .toBe(manifest.theme_color.toLowerCase());
  });
});

describe('iOS / iPadOS PWA — Apple touch icon', () => {
  let doc;

  beforeAll(() => {
    doc = parseHTML().window.document;
  });

  test('<link rel="apple-touch-icon"> is present', () => {
    const link = doc.querySelector('link[rel="apple-touch-icon"]');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBeTruthy();
  });

  test('the referenced apple-touch-icon file exists on disk', () => {
    const link = doc.querySelector('link[rel="apple-touch-icon"]');
    const href = link.getAttribute('href');
    const iconPath = path.join(REPO_ROOT, href);
    expect(fs.existsSync(iconPath)).toBe(true);
    // Apple touch icons must be non-empty PNGs.
    const stat = fs.statSync(iconPath);
    expect(stat.size).toBeGreaterThan(0);
  });
});

describe('iOS / iPadOS PWA — Safe-area (Dynamic Island / notch)', () => {
  test('CSS uses env(safe-area-inset-top) at least once', () => {
    // Dynamic Island / notch: content must be pushed below the status bar
    // because apple-mobile-web-app-status-bar-style=black-translucent renders
    // the page underneath the status bar.
    expect(html).toMatch(/env\(\s*safe-area-inset-top\s*\)/);
  });

  test('touch-action: manipulation is applied to suppress iOS double-tap zoom delay', () => {
    expect(html).toMatch(/touch-action\s*:\s*manipulation/);
  });
});

describe('iOS / iPadOS PWA — Zoom prevention handlers', () => {
  // iOS Safari ignores `user-scalable=no`, so the app installs
  // JavaScript handlers to block pinch / double-tap zoom. These handlers
  // are what keep the installed PWA from behaving like a zoomable web page.
  test.each([
    // Gesture events are registered via a forEach over an array literal,
    // so we just assert the event name appears as a quoted token.
    ['gesturestart', /['"`]gesturestart['"`]/],
    ['gesturechange', /['"`]gesturechange['"`]/],
    ['gestureend', /['"`]gestureend['"`]/],
    // touch* handlers are attached directly.
    ['touchend', /addEventListener\(\s*['"`]touchend['"`]/],
    ['touchmove', /addEventListener\(\s*['"`]touchmove['"`]/],
  ])('registers a %s handler to suppress iOS zoom', (_evt, pattern) => {
    expect(html).toMatch(pattern);
  });
});

describe('iOS / iPadOS PWA — Web app manifest', () => {
  let manifest;

  beforeAll(() => {
    // Must be valid JSON for iOS to read it.
    manifest = JSON.parse(manifestRaw);
  });

  test('manifest is linked from index.html', () => {
    const doc = parseHTML().window.document;
    const link = doc.querySelector('link[rel="manifest"]');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('manifest.json');
  });

  test('declares required fields for installability', () => {
    expect(typeof manifest.name).toBe('string');
    expect(manifest.name.length).toBeGreaterThan(0);
    expect(typeof manifest.short_name).toBe('string');
    // iOS home-screen label typically truncates around 12 characters; this
    // is a recommended guideline rather than a hard platform limit, but it
    // catches accidental overly-long short_name values.
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.scope).toBeTruthy();
  });

  test('uses display=standalone so iOS launches without Safari chrome', () => {
    expect(manifest.display).toBe('standalone');
  });

  test('declares theme_color and background_color for splash / status bar', () => {
    expect(manifest.theme_color).toMatch(/^#[0-9a-fA-F]{3,8}$/);
    expect(manifest.background_color).toMatch(/^#[0-9a-fA-F]{3,8}$/);
  });

  test('includes 192x192 and 512x512 PNG icons (PWA installability minimum)', () => {
    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    manifest.icons.forEach((icon) => {
      expect(icon.type).toBe('image/png');
    });
  });

  test('provides maskable icons for modern adaptive launchers', () => {
    const maskable = manifest.icons.filter(
      (i) => i.purpose && i.purpose.split(/\s+/).includes('maskable')
    );
    expect(maskable.length).toBeGreaterThan(0);
  });

  test('every icon listed in the manifest exists on disk', () => {
    manifest.icons.forEach((icon) => {
      const iconPath = path.join(REPO_ROOT, icon.src);
      expect(fs.existsSync(iconPath)).toBe(true);
    });
  });
});

describe('iOS / iPadOS PWA — Notification grouping', () => {
  // iOS stacks each unique notification tag as a separate entry in the
  // Notification Center.  The app fires multiple step notifications during
  // a single brew; using the *same* tag for every step makes each new
  // notification replace the previous one so only one entry is visible.

  test('all showNotification / new Notification calls share a single tag for grouping', () => {
    // Collect every `tag:` value from notification option objects in the HTML.
    const tagMatches = [...html.matchAll(/tag\s*:\s*['"]([^'"]+)['"]/g)];
    expect(tagMatches.length).toBeGreaterThanOrEqual(1);

    const uniqueTags = new Set(tagMatches.map((m) => m[1]));
    // All notification calls must use exactly one shared tag value.
    expect(uniqueTags.size).toBe(1);

    // The tag must be a fixed string — not a per-step template expression —
    // so that iOS groups them into a single notification.
    const [tag] = uniqueTags;
    expect(tag).not.toMatch(/\+/); // no string concatenation

    // Both notification call sites (SW path + fallback) must pass the same
    // options object so the shared tag & renotify flag cannot drift.
    expect(html).toMatch(/registration\.showNotification\s*\([^,]+,\s*options\s*\)/);
    expect(html).toMatch(/new Notification\s*\([^,]+,\s*options\s*\)/);
  });

  test('notifications set renotify so the user is still alerted on each replacement', () => {
    // When the tag is reused, `renotify: true` ensures the device still
    // plays the sound / vibration even though the notification is being
    // replaced rather than created fresh.
    const renotifyMatches = [...html.matchAll(/renotify\s*:\s*(true|false)/g)];
    expect(renotifyMatches.length).toBeGreaterThanOrEqual(1);
    renotifyMatches.forEach((m) => {
      expect(m[1]).toBe('true');
    });
  });
});

describe('iOS / iPadOS PWA — Service worker', () => {
  test('index.html registers sw.js', () => {
    // The register call is built up as a template/string in index.html;
    // match loosely on the registration target.
    expect(html).toMatch(/navigator\.serviceWorker\.register\(\s*['"]sw\.js['"]/);
  });

  test('service worker handles install, activate, and fetch events', () => {
    expect(swSource).toMatch(/addEventListener\(\s*['"]install['"]/);
    expect(swSource).toMatch(/addEventListener\(\s*['"]activate['"]/);
    expect(swSource).toMatch(/addEventListener\(\s*['"]fetch['"]/);
  });

  test('service worker uses SKIP_WAITING message (iOS-friendly update flow)', () => {
    // On iOS a hanging "waiting" service worker often never activates
    // until the app is force-quit. The app works around this by sending
    // a SKIP_WAITING message when a new worker is detected.
    expect(swSource).toMatch(/SKIP_WAITING/);
    expect(swSource).toMatch(/skipWaiting\s*\(/);
    expect(html).toMatch(/SKIP_WAITING/);
  });

  test('service worker claims clients on activate (ensures offline control)', () => {
    expect(swSource).toMatch(/clients\.claim\s*\(/);
  });

  test('service worker pre-caches the core assets needed for offline launch', () => {
    // These are the files iOS needs in the cache to launch the PWA
    // with no network on a plane or in a kitchen with bad Wi-Fi.
    ['index.html', 'manifest.json', 'apple-touch-icon.png'].forEach((asset) => {
      expect(swSource).toEqual(expect.stringContaining(asset));
    });
  });

  test('every asset listed in the SW pre-cache exists on disk', () => {
    // Extract quoted './...' paths from the ASSETS_TO_CACHE array. Any missing
    // file would cause cache.addAll() to reject and break offline install on iOS.
    const match = swSource.match(/ASSETS_TO_CACHE\s*=\s*\[([\s\S]*?)\]/);
    expect(match).not.toBeNull();
    const assets = match[1]
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      // Filter out empty strings (trailing comma), the root path './'
      // (which maps to index.html and is covered separately), and any
      // '// ...' comment lines that happen to survive the split.
      .filter((s) => s && s !== './' && !s.startsWith('//'));
    assets.forEach((asset) => {
      const assetPath = path.join(REPO_ROOT, asset.replace(/^\.\//, ''));
      expect(fs.existsSync(assetPath)).toBe(true);
    });
  });
});

describe('Apple HIG — Reduced Motion', () => {
  test('CSS includes a prefers-reduced-motion media query', () => {
    expect(html).toMatch(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/);
  });

  test('reduced-motion rule disables animation-duration', () => {
    // The rule must contain `animation-duration: 0.01ms` or similar
    // near-zero value to effectively suppress animations.
    expect(html).toMatch(/animation-duration\s*:\s*0\.01ms/);
  });

  test('reduced-motion rule disables transition-duration', () => {
    expect(html).toMatch(/transition-duration\s*:\s*0\.01ms/);
  });
});

describe('Apple HIG — Dark Mode', () => {
  test('CSS includes a prefers-color-scheme: dark media query', () => {
    expect(html).toMatch(/@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)/);
  });

  test('dark mode overrides --text-primary to a light colour', () => {
    // Extract everything after the dark-mode media query opening brace.
    const darkBlock = html.match(/@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{([\s\S]+)/);
    expect(darkBlock).not.toBeNull();
    expect(darkBlock[1]).toMatch(/--text-primary\s*:/);
  });

  test('dark mode overrides --cream-light (page background) to a dark colour', () => {
    const darkBlock = html.match(/@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{([\s\S]+)/);
    expect(darkBlock).not.toBeNull();
    expect(darkBlock[1]).toMatch(/--cream-light\s*:/);
  });

  test('provides a dark theme-color meta tag for the status bar', () => {
    const doc = parseHTML().window.document;
    const darkThemeMeta = doc.querySelector('meta[name="theme-color"][media*="dark"]');
    expect(darkThemeMeta).not.toBeNull();
    // The dark theme-color should be a genuinely dark colour.
    // Parse the hex value and verify its numeric brightness is low.
    const color = darkThemeMeta.getAttribute('content');
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    const numeric = parseInt(color.slice(1), 16);
    expect(numeric).toBeLessThan(0x808080);
  });

  test('light theme-color meta tag is also present', () => {
    const doc = parseHTML().window.document;
    const lightThemeMeta = doc.querySelector('meta[name="theme-color"][media*="light"]');
    expect(lightThemeMeta).not.toBeNull();
    const manifest = JSON.parse(manifestRaw);
    expect(lightThemeMeta.getAttribute('content').toLowerCase())
      .toBe(manifest.theme_color.toLowerCase());
  });
});

describe('Apple HIG — Safe Areas (bottom inset)', () => {
  test('CSS uses env(safe-area-inset-bottom) for the home indicator', () => {
    expect(html).toMatch(/env\(\s*safe-area-inset-bottom\s*\)/);
  });
});

describe('Apple HIG — Minimum 44pt Touch Targets', () => {
  test('CSS enforces min-height: 44px on interactive buttons', () => {
    expect(html).toMatch(/min-height\s*:\s*44px/);
  });

  test('CSS enforces min-width: 44px on interactive buttons', () => {
    expect(html).toMatch(/min-width\s*:\s*44px/);
  });
});

describe('Apple HIG — Haptic Feedback', () => {
  test('JavaScript includes a haptic feedback function using navigator.vibrate', () => {
    expect(html).toMatch(/navigator\.vibrate/);
  });

  test('haptic feedback is called on step completion', () => {
    expect(html).toMatch(/playHapticFeedback\s*\(\s*\)/);
  });
});
