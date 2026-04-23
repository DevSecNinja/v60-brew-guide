// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/** Port used by the local static-file server during tests. */
const PORT = 4173;

/**
 * Playwright configuration for iOS / WebKit end-to-end tests.
 *
 * These tests run against a local static file server so they exercise
 * real browser behaviour (gesture events, service workers, viewport
 * handling) rather than the static-DOM assertions in the Jest suite.
 *
 * Run with:  npm run test:e2e
 */
module.exports = defineConfig({
  testDir: './tests/e2e',

  // Strict timeouts to prevent runaway tests in CI.
  timeout: 30_000,        // 30 s per individual test
  globalTimeout: 300_000, // 5 min for the entire suite

  // Fail fast in CI; allow full retries locally so flaky network/SW
  // initialisation doesn't mask real failures.
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',

  use: {
    // All e2e tests share a single base URL served by the built-in
    // Playwright static-file server (see webServer below).
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'webkit-ios',
      use: {
        ...devices['iPhone 14'],
        // Emulate iOS WebKit — closest to the real Safari engine available
        // without physical hardware.  Covers viewport, touch events, and
        // gesture recognition that JSDOM/Node tests cannot exercise.
      },
    },
  ],

  // Serve the repository root as a static site for the duration of the test
  // run.  No build step is needed because the app is a single HTML file.
  webServer: {
    command: `npx --yes serve . --listen ${PORT} --no-clipboard`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
