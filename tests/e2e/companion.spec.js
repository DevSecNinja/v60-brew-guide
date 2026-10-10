const { test, expect } = require('@playwright/test');
const { startStaticServer } = require('../helpers/static-server');

async function prepareWater(page) {
  if (await page.locator('#setupStage').isHidden()) await page.locator('#btnRecipeNext').click();
  await page.locator('#btnSetupReady').click();
  await page.locator('#btnWaterReady').click();
}

test.describe('Scale companion on mobile', () => {
  test.use({ serviceWorkers: 'block' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('dose recipe shares and favorites preserve the weighed coffee', async ({ page }) => {
    await page.locator('#recipeAdjustments > summary').click();
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
    await page.locator('[data-quick-water="250"]').click();
    await page.locator('#btnRecipeNext').click();
    await page.locator('#scaleType').selectOption('k112');
    await page.locator('#startDelay').selectOption('0');
    await prepareWater(page);
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
      await page.locator('[data-quick-water="250"]').click();
      await page.locator('#btnRecipeNext').click();
      await page.locator('#scaleType').selectOption('k112');
      await page.locator('#k112Mode').selectOption(mode);
      await page.locator('#timerSource').selectOption('scale');
      await prepareWater(page);
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
    await page.locator('[data-quick-water="250"]').click();
    await page.locator('#btnRecipeNext').click();
    await page.locator('#timerSource').selectOption('scale');
    await prepareWater(page);
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
    await page.locator('[data-quick-water="250"]').click();
    await prepareWater(page);
    await page.locator('#btnFocusAction').click();
    await expect(page.locator('#focusClock')).toHaveText('Start pouring in 3');
    await page.clock.fastForward(3000);
    await expect(page.locator('#focusClock')).toContainText('Elapsed 0:00');
    await page.clock.fastForward(45000);
    await expect(page.locator('#focusTarget')).toHaveText('Pour to 100 g total');
    await expect(page.locator('#focusClock')).toContainText('Elapsed 0:45');
  });

  test('new users follow numbered stages and receive focus at each transition', async ({ page }, testInfo) => {
    await expect(page.locator('main > :first-child')).toHaveAttribute('id', 'brewIntro');
    await expect(page.locator('#brewIntro')).toHaveAttribute('open', '');
    await expect(page.locator('#setupStage')).not.toBeVisible();
    await expect(page.locator('#waterStage')).not.toBeVisible();
    await expect(page.locator('#brewStage')).not.toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('journey-start.png') });
    await page.locator('#btnIntroNext').click();
    await expect(page.locator('#recipeHeading')).toBeFocused();
    await page.locator('[data-quick-water="250"]').click();
    await expect(page.locator('#setupStage')).not.toBeVisible();
    await expect(page.locator('#recipeChoices')).toHaveAttribute('open', '');
    await page.locator('#btnRecipeNext').click();
    await expect(page.locator('#setupHeading')).toBeFocused();
    await expect(page.locator('#waterStage')).not.toBeVisible();
    await page.locator('#btnSetupReady').click();
    await expect(page.locator('#waterHeading')).toBeFocused();
    await expect(page.locator('#brewStage')).not.toBeVisible();
    await page.locator('#btnWaterReady').click();
    await expect(page.locator('#brewHeading')).toBeFocused();
    await expect(page.locator('#allBrewSteps')).not.toHaveAttribute('open', '');
    await page.locator('#btnFocusAction').click();
    await page.locator('#btnFocusAction').click();
    await page.clock.install();
    await page.clock.fastForward(195000);
    await page.locator('#btnFocusAction').click();
    await expect(page.locator('#resultHeading')).toBeFocused();
    await expect(page.locator('#btnBrewAgain')).toBeDisabled();
    await page.locator('#btnDiscardResult').click();
    await page.clock.fastForward(3000);
    await page.locator('#btnBrewAgain').click();
    await expect(page.locator('#waterHeading')).toBeFocused();
    await expect(page.locator('#brewStage')).not.toBeVisible();
    await page.reload();
    await expect(page.locator('#brewIntro')).not.toHaveAttribute('open', '');
    await expect(page.locator('#setupStage')).not.toBeVisible();
    await expect(page.locator('#recipeChoices')).not.toHaveAttribute('open', '');
    await expect(page.locator('#btnRecipeNext')).toBeVisible();
    await expect(page.locator('#waterStage')).not.toBeVisible();
  });

  test('optional water timer gates brewing and ratio edits preserve completed preparation', async ({ page }) => {
    await page.locator('[data-quick-water="250"]').click();
    await page.locator('#btnRecipeNext').click();
    await page.locator('#btnSetupReady').click();
    await page.locator('#temperatureEstimator > summary').click();
    await page.locator('#temperatureEstimatorTarget').selectOption('94');
    await expect(page.locator('#btnWaterReady')).toBeDisabled();
    await page.locator('#temperaturePrepStep').click();
    await page.locator('#temperaturePrepStep').click();
    await page.locator('#btnWaterReady').click();
    await page.locator('#recipeChoices > summary').click();
    await page.locator('#recipeAdjustments > summary').click();
    await page.locator('#ratioSlider').fill('16');
    await expect(page.locator('#temperaturePrepStep')).toHaveClass(/completed/);
    await expect(page.locator('#btnFocusAction')).toBeEnabled();
    await expect(page.locator('#brewStage')).toBeVisible();
  });

  test('the full recipe table can be selected by keyboard', async ({ page }) => {
    await page.locator('#recipeReference > summary').click();
    const recipe = page.getByRole('button', { name: 'Use 260 g water recipe', exact: true });
    await recipe.focus();
    await recipe.press('Enter');
    await expect(page.locator('#journeyRecipeSummary')).toContainText('260 g water');
    await expect(recipe).toBeFocused();
    await expect(page.locator('#setupStage')).not.toBeVisible();
    await page.locator('#btnRecipeNext').click();
    await expect(page.locator('#setupHeading')).toBeFocused();
  });

  test('Step 2 leads with water choices and keeps adjustments optional', async ({ page }, testInfo) => {
    await page.locator('#btnIntroNext').click();
    await expect(page.locator('#recipeAdjustments')).not.toHaveAttribute('open', '');
    await expect(page.locator('#coffeeDose')).not.toBeVisible();
    await expect(page.locator('#ratioSlider')).not.toBeVisible();
    await expect(page.locator('#favoritesSection')).not.toBeVisible();
    await expect(page.locator('#recipeReference')).not.toHaveAttribute('open', '');
    await expect(page.locator('#recipeSelection')).not.toBeVisible();
    await expect(page.locator('[data-quick-water][aria-pressed="true"]')).toHaveCount(0);
    await page.locator('#recipeStage').screenshot({ path: testInfo.outputPath('recipe-choices.png') });
    const choice = page.locator('[data-quick-water="250"]');
    await choice.focus();
    await choice.press('Enter');
    await expect(choice).toBeFocused();
    await expect(choice).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#journeyRecipeSummary')).toHaveText('250 g water · 15.0 g coffee · 1:16.7');
    await expect(page.getByRole('region', { name: 'Your selected recipe' })).toBeVisible();
    await expect(page.locator('#selectedWater')).toHaveText('250 g');
    await expect(page.locator('#selectedCoffee')).toHaveText('15.0 g');
    await expect(page.locator('#selectedRatio')).toHaveText('1:16.7');
    await expect(page.locator('#setupStage')).not.toBeVisible();
    await page.locator('#recipeStage').screenshot({ path: testInfo.outputPath('recipe-selected.png') });
    await page.setViewportSize({ width: 320, height: 700 });
    await page.emulateMedia({ colorScheme: 'dark' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('[data-quick-water]').evaluateAll(buttons =>
      buttons.every(button => button.scrollWidth <= button.clientWidth))).toBe(true);
    expect(await page.locator('.recipe-selection-values dd').evaluateAll(values =>
      values.every(value => value.scrollWidth <= value.clientWidth))).toBe(true);
    await page.locator('#recipeStage').screenshot({ path: testInfo.outputPath('recipe-selected-dark-narrow.png') });
    await page.locator('#btnRecipeNext').click();
    await expect(page.locator('#setupHeading')).toBeFocused();
  });

  test('dose editing stays open and reports out-of-range ratio changes locally', async ({ page }) => {
    await page.locator('#recipeAdjustments > summary').click();
    await page.getByRole('slider', { name: 'Coffee-to-water ratio' }).fill('14');
    await page.locator('#coffeeDose').fill('35.7');
    await page.locator('#btnUseDose').click();
    await expect(page.locator('#recipeAdjustments')).toHaveAttribute('open', '');
    await expect(page.locator('#recipeChoices')).toHaveAttribute('open', '');
    await expect(page.locator('#setupStage')).not.toBeVisible();
    await page.locator('#ratioSlider').fill('18');
    await expect(page.locator('#ratioFeedback')).toBeVisible();
    await expect(page.locator('#ratioFeedback')).toContainText('100-500 g');
    await expect(page.locator('#journeyRecipeSummary')).toContainText('500 g water · 35.7 g coffee');
    await expect(page.locator('#ratioSlider')).toHaveValue('14');
    await page.locator('#coffeeDose').fill('15.2');
    await page.locator('#btnUseDose').click();
    await expect(page.locator('#ratioFeedback')).toBeEmpty();
    await expect(page.locator('#recipeAdjustments')).toHaveAttribute('open', '');
  });

  test('saved recipe bars support keyboard selection and management without leaving Step 2', async ({ page }, testInfo) => {
    await page.locator('[data-quick-water="250"]').click();
    await page.locator('#btnFavoriteRecipe').click();
    await page.locator('[data-quick-water="300"]').click();
    await page.locator('#btnFavoriteRecipe').click();
    await expect(page.locator('#favoritesSummary')).toHaveText('Saved recipes (2)');
    await expect(page.locator('.btn-select-favorite')).toHaveCount(2);
    await expect(page.locator('.btn-select-favorite').first()).toBeVisible();
    await expect(page.locator('.favorite-card-actions').first()).not.toBeVisible();
    const presets = await page.locator('.recipe-options').boundingBox();
    const bars = await page.locator('#favoritesList').boundingBox();
    expect(bars.y).toBeGreaterThan(presets.y + presets.height);
    await page.setViewportSize({ width: 320, height: 700 });
    expect(await page.locator('.favorite-card').evaluateAll(cards =>
      cards.every(card => card.scrollWidth <= card.clientWidth && card.clientHeight < 100))).toBe(true);
    await page.locator('#recipeStage').screenshot({ path: testInfo.outputPath('saved-recipe-bars.png') });
    const saved250 = page.locator('.btn-select-favorite').filter({ hasText: '250g water' });
    await saved250.focus();
    await saved250.press('Enter');
    await expect(saved250).toBeFocused();
    await expect(saved250).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#setupStage')).not.toBeVisible();
    await page.locator('#btnManageFavorites').click();
    await expect(page.locator('#btnManageFavorites')).toHaveAttribute('aria-expanded', 'true');
    const moveDown = page.locator('.favorite-card').filter({ hasText: '250g water' }).getByRole('button', { name: 'Move down', exact: true });
    await moveDown.focus();
    await moveDown.press('Enter');
    await expect(page.locator('.btn-select-favorite').last()).toContainText('250g water');
    await expect(page.locator('.favorite-card').filter({ hasText: '250g water' }).getByRole('button', { name: 'Move up', exact: true })).toBeFocused();
    await page.locator('#btnManageFavorites').click();
    await expect(page.locator('.favorite-card-actions').first()).not.toBeVisible();
    await page.reload();
    await page.locator('#recipeChoices > summary').click();
    await expect(page.locator('.btn-select-favorite').first()).toBeVisible();
    await expect(page.locator('#btnManageFavorites')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.btn-select-favorite').last()).toContainText('250g water');
  });

  test('a table selection brings Continue into the viewport without changing focus', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 664 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#recipeReference > summary').click();
    const recipe = page.getByRole('button', { name: 'Use 420 g water recipe', exact: true });
    await recipe.focus();
    await recipe.press('Enter');
    await expect(recipe).toBeFocused();
    await expect(page.locator('#btnRecipeNext')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('#setupStage')).not.toBeVisible();
  });

  test('removing the last saved recipe returns keyboard focus to a visible preset', async ({ page }) => {
    await page.locator('[data-quick-water="250"]').click();
    await page.locator('#btnFavoriteRecipe').click();
    await page.goto('/');
    await expect(page.locator('#recipeSelection')).not.toBeVisible();
    await page.locator('#btnManageFavorites').click();
    const remove = page.getByRole('button', { name: 'Remove favorite', exact: true });
    await remove.focus();
    await remove.press('Enter');
    await expect(page.locator('#favoritesSection')).not.toBeVisible();
    await expect(page.locator('[data-quick-water="250"]')).toBeFocused();
  });
});

test('custom recipe and scale setup restore offline', async ({ page }) => {
  const server = await startStaticServer();
  try {
    await page.goto(server.url);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await page.locator('#recipeAdjustments > summary').click();
    await page.locator('#coffeeDose').fill('15.2');
    await page.locator('#btnUseDose').click();
    await page.locator('#btnRecipeNext').click();
    await page.locator('#scaleType').selectOption('k112');
    await page.locator('#k112Mode').selectOption('auto');
    await page.locator('#timerSource').selectOption('scale');
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
    await prepareWater(page);
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
