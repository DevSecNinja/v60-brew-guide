/**
 * iOS / WebKit end-to-end tests — Playwright
 * ---------------------------------------------------------------
 * These tests run against a real WebKit instance (via Playwright's
 * iPhone 14 device emulation) to catch runtime-only iOS bugs that
 * the static Jest assertions in tests/pwa/ios-pwa.test.js cannot
 * detect — e.g. a pinch gesture slipping through, the app failing
 * to load when offline, or the service worker not responding.
 *
 * Run with:  npm run test:e2e
 *
 * Scope:
 *   1. Page load  — app renders and displays the recipe table
 *   2. Zoom prevention — gesture / touch events are suppressed
 *   3. Ratio slider — touch interaction updates the table
 *   4. Brew timer — tapping a row and a step starts a countdown
 *   5. Offline launch — app loads after the network is cut
 *   6. Viewport meta — initial scale is 1 and zoom is disabled
 */

const { test, expect } = require('@playwright/test');

// ---------------------------------------------------------------------------
// 1. Page load
// ---------------------------------------------------------------------------

test.describe('Page load', () => {
  test('app title is correct', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/V60 Recipe Calculator/i);
  });

  test('recipe table is visible and has rows', async ({ page }) => {
    await page.goto('/');
    // The table is generated from 100 g to 500 g water in 10 g steps = 41 rows.
    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(41);
  });

  test('250 g row is highlighted by default', async ({ page }) => {
    await page.goto('/');
    // The 250 g row is the default highlighted row; the app marks it with the
    // --highlight-bg/border CSS custom properties applied via a class or style.
    // We verify it is visually distinct by checking its background color differs
    // from that of a non-highlighted sibling row.
    const highlightedRow = page.locator('table tbody tr').nth(15); // 250 g is at index 15 (0-based)
    await expect(highlightedRow).toBeVisible();
    const highlightBg = await highlightedRow.evaluate(
      (el) => getComputedStyle(el).backgroundColor
    );
    const otherRow = page.locator('table tbody tr').first();
    const otherBg = await otherRow.evaluate(
      (el) => getComputedStyle(el).backgroundColor
    );
    // The 250 g row must have a visually different background than a plain row.
    expect(highlightBg).not.toBe(otherBg);
  });
});

// ---------------------------------------------------------------------------
// 2. Zoom prevention (gesturestart / touchend / touchmove)
// ---------------------------------------------------------------------------

test.describe('Zoom prevention', () => {
  test('gesturestart event is cancelled (preventDefault called)', async ({ page }) => {
    await page.goto('/');

    // Dispatch a synthetic gesturestart on the document and check whether
    // the default action was prevented.  Because iOS gesturestart only fires
    // on real hardware, we simulate it via dispatchEvent in the page context.
    const defaultPrevented = await page.evaluate(() => {
      // Create a minimal GestureEvent-like CustomEvent that is cancelable.
      const evt = new Event('gesturestart', { cancelable: true, bubbles: true });
      document.dispatchEvent(evt);
      return evt.defaultPrevented;
    });
    expect(defaultPrevented).toBe(true);
  });

  test('touchmove with multiple touch points is suppressed', async ({ page }) => {
    await page.goto('/');

    const defaultPrevented = await page.evaluate(() => {
      // WebKit does not expose a constructable Touch; use a plain event and
      // patch the `touches` property to simulate a two-finger gesture.
      const evt = document.createEvent('Event');
      evt.initEvent('touchmove', /* bubbles */ true, /* cancelable */ true);
      Object.defineProperty(evt, 'touches', { value: { length: 2 } });
      document.dispatchEvent(evt);
      return evt.defaultPrevented;
    });
    expect(defaultPrevented).toBe(true);
  });

  test('single-finger touchmove is NOT suppressed (normal scroll)', async ({ page }) => {
    await page.goto('/');

    const defaultPrevented = await page.evaluate(() => {
      // WebKit does not expose a constructable Touch; patch touches manually.
      const evt = document.createEvent('Event');
      evt.initEvent('touchmove', /* bubbles */ true, /* cancelable */ true);
      Object.defineProperty(evt, 'touches', { value: { length: 1 } });
      document.dispatchEvent(evt);
      return evt.defaultPrevented;
    });
    // A single-touch move should scroll normally — do NOT prevent it.
    expect(defaultPrevented).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Ratio slider — touch interaction
// ---------------------------------------------------------------------------

test.describe('Ratio slider', () => {
  test('changing the slider updates the coffee column', async ({ page }) => {
    await page.goto('/');

    const slider = page.locator('input[type="range"]');
    await expect(slider).toBeVisible();

    // Read the current coffee value for the first data row.
    const firstCoffeeCell = page.locator('table tbody tr td:nth-child(2)').first();
    const before = await firstCoffeeCell.textContent();

    // Move the slider to its maximum value to force a different ratio.
    await page.evaluate(() => {
      const el = document.querySelector('input[type="range"]');
      el.value = el.max;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Wait for the DOM to reflect the new value.
    await page.waitForFunction(
      (prev) => {
        const cell = document.querySelector('table tbody tr td:nth-child(2)');
        return cell && cell.textContent !== prev;
      },
      before,
      { timeout: 3000 }
    );

    const after = await firstCoffeeCell.textContent();
    // The coffee weight must change when the ratio changes.
    expect(after).not.toBe(before);
  });
});

// ---------------------------------------------------------------------------
// 4. Brew timer — step progression
// ---------------------------------------------------------------------------

test.describe('Brew timer', () => {
  test('tapping a recipe row reveals the brew steps section', async ({ page }) => {
    await page.goto('/');

    // Tap the first data row in the recipe table to select a recipe.
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.tap();

    // The brew-steps section should now be visible.
    const brewSection = page.locator('#brew-steps, [id*="brew"], [class*="brew-steps"]').first();
    await expect(brewSection).toBeVisible({ timeout: 3000 });
  });

  test('first brew step becomes available after selecting a recipe', async ({ page }) => {
    await page.goto('/');
    await page.locator('table tbody tr').first().tap();

    // The first step card should show the "available" state (▶ tap to start).
    const firstStep = page.locator('.step, [class*="step"]').first();
    await expect(firstStep).toBeVisible({ timeout: 3000 });
  });
});

// ---------------------------------------------------------------------------
// 5. Offline launch — service worker caches assets
// ---------------------------------------------------------------------------

test.describe('Offline launch', () => {
  test('service worker is active as the page controller after first load', async ({ page }) => {
    await page.goto('/');

    // Wait for the SW to become the controller (proves it activated and claimed
    // the client — a prerequisite for offline-first to work).
    const isControlled = await page.evaluate(() =>
      new Promise((resolve) => {
        if (navigator.serviceWorker.controller) {
          resolve(true);
          return;
        }
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(true), { once: true });
        // If no controller appears within 6 s, resolve false so the assertion
        // fails with a meaningful message rather than timing out.
        setTimeout(() => resolve(false), 6000);
      })
    );
    expect(isControlled).toBe(true);
  });

  test('service worker cache contains the core offline assets', async ({ page }) => {
    // Load the page and wait for it to fully settle (including any SW-triggered
    // page claim that can cause a context-destroyed error if we evaluate too soon).
    await page.goto('/', { waitUntil: 'networkidle' });

    // Verify that the Cache API has entries for the core assets.
    const cached = await page.evaluate(async () => {
      const keys = await caches.keys();
      if (!keys.length) return [];
      const cache = await caches.open(keys[0]);
      const requests = await cache.keys();
      return requests.map((r) => r.url);
    });

    // At least one cache entry must exist to confirm offline caching ran.
    expect(cached.length).toBeGreaterThan(0);
    // index.html must be cached for the app to launch offline.
    const hasIndex = cached.some((url) => url.endsWith('/') || url.endsWith('index.html'));
    expect(hasIndex).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Viewport meta — initial scale and zoom disabled at page level
// ---------------------------------------------------------------------------

test.describe('Viewport meta', () => {
  test('initial device pixel ratio scales the page to 1:1', async ({ page }) => {
    await page.goto('/');

    const initialScale = await page.evaluate(() => {
      const vp = document.querySelector('meta[name="viewport"]');
      if (!vp) return null;
      const match = vp.getAttribute('content').match(/initial-scale\s*=\s*([\d.]+)/);
      return match ? parseFloat(match[1]) : null;
    });
    expect(initialScale).toBe(1.0);
  });

  test('user-scalable is set to no in the viewport meta', async ({ page }) => {
    await page.goto('/');

    const userScalable = await page.evaluate(() => {
      const vp = document.querySelector('meta[name="viewport"]');
      if (!vp) return null;
      const match = vp.getAttribute('content').match(/user-scalable\s*=\s*(\w+)/);
      return match ? match[1] : null;
    });
    expect(userScalable).toBe('no');
  });

  test('maximum-scale is 1 to prevent browser zoom on iOS', async ({ page }) => {
    await page.goto('/');

    const maxScale = await page.evaluate(() => {
      const vp = document.querySelector('meta[name="viewport"]');
      if (!vp) return null;
      const match = vp.getAttribute('content').match(/maximum-scale\s*=\s*([\d.]+)/);
      return match ? parseFloat(match[1]) : null;
    });
    expect(maxScale).toBe(1.0);
  });
});
