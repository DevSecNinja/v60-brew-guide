const { test, expect } = require('@playwright/test');
const { startStaticServer } = require('../helpers/static-server');

test.describe('Scale companion on mobile', () => {
  test.use({ serviceWorkers: 'block' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('dose recipe shares and favorites preserve the weighed coffee', async ({ page }) => {
    await page.locator('#coffeeDose').fill('15.2');
    await page.getByRole('button', { name: 'Use this dose', exact: true }).click();
    await expect(page.locator('#focusTarget')).toHaveText('Pour to 51 g total');
    await expect(page.locator('#brewRecipeLabel')).toContainText('254g water / 15.2g coffee');
    await expect(page).toHaveURL(/coffee=15.2/);
    await page.locator('#btnFavoriteRecipe').click();
    await page.reload();
    await expect(page.locator('#brewRecipeLabel')).toContainText('254g water / 15.2g coffee');
    await expect(page.locator('#btnFavoriteRecipe')).toHaveText('Remove favorite');
  });

  test('app clock catches up and waits for a real drawdown finish', async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
    await page.locator('#scaleType').selectOption('k112');
    await page.locator('#startDelay').selectOption('0');
    await page.locator('#recipeTableBody tr[data-water="250"]').click();
    await page.locator('#btnFocusAction').click();
    await page.clock.fastForward(70000);
    await expect(page.locator('#focusTarget')).toHaveText('Pour to 150 g total');
    await expect(page.locator('#focusClock')).toContainText('Elapsed 1:10');
    await expect(page.locator('#scaleType')).toBeDisabled();
    await page.locator('#brewFocus').screenshot({ path: testInfo.outputPath('focus-light.png') });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.locator('#brewFocus').screenshot({ path: testInfo.outputPath('focus-dark.png') });
    await page.clock.fastForward(125000);
    await expect(page.locator('#btnFocusAction')).toHaveText('Drawdown finished');
    await expect(page.locator('#brewComplete')).not.toBeVisible();
    await page.locator('#btnFocusAction').click();
    await expect(page.locator('#resultTime')).toHaveValue('3:15');
    await page.locator('#resultWater').fill('252.3');
    await page.locator('#resultGrind').fill('K6 / 90 clicks');
    await page.getByRole('button', { name: 'Save brew', exact: true }).click();
    await expect(page.locator('#brewHistory')).toContainText('1:16.82');
    await expect(page.locator('#brewHistory')).toContainText('app-measured elapsed');
    await page.reload();
    await expect(page.locator('#brewHistory')).toContainText('K6 / 90 clicks');
    expect(errors).toEqual([]);
  });

  for (const mode of ['manual', 'auto']) {
    test(`K112 ${mode} scale timing logs reported time without an app clock`, async ({ page }) => {
      await page.locator('#scaleType').selectOption('k112');
      await page.locator('#k112Mode').selectOption(mode);
      await page.locator('#timerSource').selectOption('scale');
      await page.locator('#recipeTableBody tr[data-water="250"]').click();
      await expect(page.locator('#stepsGrid')).not.toBeVisible();
      await expect(page.locator('#brewTimeline')).toContainText('150 g total');
      await page.locator('#btnFocusAction').click();
      await expect(page.locator('#focusClock')).toHaveText('Clock: your scale (not connected)');
      await page.locator('#btnFocusAction').click();
      await expect(page.locator('#resultTime')).toBeEmpty();
      await page.locator('#resultTime').fill('3:20');
      await page.locator('#resultWater').fill('250');
      await page.locator('#resultScaleNotes').fill(mode === 'auto' ? 'Stopped during bloom' : 'Continuous timer');
      await page.getByRole('button', { name: 'Save brew', exact: true }).click();
      await expect(page.locator('#brewHistory')).toContainText(mode === 'auto' ? 'reported automatic time' : 'reported scale time');
      await page.locator('[data-history-repeat]').click();
      await expect(page.locator('#k112Mode')).toHaveValue(mode);
      await expect(page.locator('#timerSource')).toHaveValue('scale');
      await expect(page.locator('#btnFocusAction')).toHaveText('Begin scale-timed brew');
    });
  }

  test('generic scale timeline works at narrow viewport widths', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.locator('#timerSource').selectOption('scale');
    await page.locator('#recipeTableBody tr[data-water="250"]').click();
    await expect(page.locator('#k112ModeField')).not.toBeVisible();
    await expect(page.locator('#scaleReference')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('#btnFocusAction').click();
    await page.locator('#btnResetBrew').click();
    await expect(page.locator('#timerSource')).toBeEnabled();
    await expect(page.locator('#btnFocusAction')).toHaveText('Begin scale-timed brew');
  });

  test('countdown start excludes preparation from elapsed brew time', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
    await page.locator('#recipeTableBody tr[data-water="250"]').click();
    await page.locator('#btnFocusAction').click();
    await expect(page.locator('#focusClock')).toHaveText('Start pouring in 3');
    await page.clock.fastForward(3000);
    await expect(page.locator('#focusClock')).toContainText('Elapsed 0:00');
    await page.clock.fastForward(45000);
    await expect(page.locator('#focusTarget')).toHaveText('Pour to 100 g total');
    await expect(page.locator('#focusClock')).toContainText('Elapsed 0:45');
  });
});

test('custom recipe and scale setup restore offline', async ({ page }) => {
  const server = await startStaticServer();
  try {
    await page.goto(server.url);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await page.locator('#scaleType').selectOption('k112');
    await page.locator('#k112Mode').selectOption('auto');
    await page.locator('#timerSource').selectOption('scale');
    await page.locator('#coffeeDose').fill('15.2');
    await page.locator('#btnUseDose').click();
    await page.locator('#btnFavoriteRecipe').click();
    await expect.poll(() => page.evaluate(async () => {
      const response = await caches.match(new URL('index.html', location.href).href);
      return Boolean(response);
    })).toBe(true);
    await server.close();
    await page.reload();
    await expect(page.locator('#k112Mode')).toHaveValue('auto');
    await expect(page.locator('#brewRecipeLabel')).toContainText('254g water / 15.2g coffee');
    await expect(page.locator('#btnFavoriteRecipe')).toHaveText('Remove favorite');
    await page.locator('#btnFocusAction').click();
    await page.locator('#btnFocusAction').click();
    await page.locator('#resultTime').fill('3:05');
    await page.locator('#resultWater').fill('254');
    await page.getByRole('button', { name: 'Save brew', exact: true }).click();
    await page.reload();
    await expect(page.locator('#brewHistory')).toContainText('3:05');
    await expect(page.locator('#brewHistory')).toContainText('reported automatic time');
  } finally {
    await server.close();
  }
});
