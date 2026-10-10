const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { confirmPreparation } = require('../helpers/brew-journey');

const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

describe('Scale companion', () => {
  let dom, win, doc, now, errors;
  const get = id => doc.getElementById(id);
  const change = (id, value) => {
    get(id).value = value;
    get(id).dispatchEvent(new win.Event(id === 'ratioSlider' ? 'input' : 'change'));
  };
  const submit = id => get(id).dispatchEvent(new win.Event('submit', { cancelable: true }));
  const select = (water = 250) => {
    win.selectRecipeByWater(water);
    confirmPreparation(win);
  };
  const advance = seconds => {
    now += seconds * 1000;
    win.tickBrew();
  };
  const useDose = dose => {
    get('coffeeDose').value = dose;
    submit('doseForm');
  };
  const startApp = () => {
    change('startDelay', '0');
    select();
    get('btnFocusAction').click();
  };
  const finishApp = () => {
    startApp();
    advance(195);
    get('btnFocusAction').click();
  };
  const save = () => {
    get('resultWater').value = '252.3';
    submit('brewResultForm');
  };
  const history = () => JSON.parse(win.localStorage.getItem('v60_history'));

  function create({ url = 'http://localhost', storage = {} } = {}) {
    if (dom) dom.window.close();
    now = 1000000;
    errors = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', error => errors.push(error.message));
    dom = new JSDOM(html, {
      url, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole,
      beforeParse(window) {
        window.Date.now = () => now;
        window.scrollTo = () => {};
        window.confirm = () => true;
        Object.entries(storage).forEach(([key, value]) => window.localStorage.setItem(key, value));
      }
    });
    win = dom.window;
    doc = win.document;
    win.playCompletionSound = jest.fn();
    win.playHapticFeedback = jest.fn();
    win.requestWakeLock = jest.fn(() => Promise.resolve(false));
  }

  beforeEach(() => create());
  afterEach(() => {
    expect(errors).toEqual([]);
    dom.window.close();
    dom = null;
  });

  test('generic scale and app timing remain the defaults', () => {
    expect(get('scaleType').value).toBe('generic');
    expect(get('timerSource').value).toBe('app');
    expect(get('startDelay').value).toBe('3');
    expect(get('k112ModeField').hidden).toBe(true);
    expect(get('brewFocus').hidden).toBe(true);
  });

  test.each(['manual', 'auto'])('K112 %s setup persists and gives mode-specific instructions', mode => {
    change('scaleType', 'k112');
    change('k112Mode', mode);
    expect(get('scaleChecklist').textContent).toContain('ZERO/POWER');
    expect(get('scaleChecklist').textContent).toContain('Do not tare between pours');
    const checklist = get('scaleChecklist').querySelectorAll('li');
    expect(checklist[0].textContent).toMatch(/^Fold and fit/);
    expect(checklist[1].textContent).toMatch(/^Switch the K112 on/);
    expect(get('scaleChecklist').textContent).not.toContain('medium-fine');
    expect(get('k112Safety').textContent).not.toContain('limit includes');
    expect(get('k112Safety').hidden).toBe(false);
    expect(get('modeGuidance').textContent).toContain('The app times');
    if (mode === 'auto') expect(get('autoModeGuidance').textContent).toContain('experimental');
    const setup = win.localStorage.getItem('v60_setup');
    create({ storage: { v60_setup: setup } });
    expect(get('scaleType').value).toBe('k112');
    expect(get('k112Mode').value).toBe(mode);
  });

  test.each([
    ['generic', 'manual'], ['k112', 'manual'], ['k112', 'auto']
  ])('%s / %s supports scale timing without starting an app brew clock', (scale, mode) => {
    change('scaleType', scale);
    change('k112Mode', mode);
    change('timerSource', 'scale');
    select();
    expect(get('stepsGrid').hidden).toBe(true);
    expect(get('brewTimeline').textContent).toContain('150 g total');
    expect(get('brewTimeline').textContent).toContain('1:30');
    expect(get('startDelayField').hidden).toBe(true);
    get('btnFocusAction').click();
    expect(win.isBrewRunning()).toBe(true);
    expect(win.requestWakeLock).toHaveBeenCalled();
    advance(600);
    expect(get('focusClock').textContent).toContain('not connected');
    expect(win.elapsedBrewSeconds()).toBe(0);
    expect(win.isBrewComplete()).toBe(false);
    get('btnFocusAction').click();
    expect(win.isBrewComplete()).toBe(true);
    expect(get('resultTime').value).toBe('');
    get('resultTime').value = '3:27';
    save();
    expect(history()[0].timeSource).toBe(scale === 'k112' && mode === 'auto' ? 'scale-auto' : 'scale-manual');
    expect(history()[0].setup).toMatchObject({ scale, mode, timer: 'scale' });
    if (mode === 'auto') expect(get('brewHistory').textContent).toContain('may exclude pauses');
  });

  test.each(['manual', 'auto'])('K112 %s supports independent app timing', mode => {
    change('scaleType', 'k112');
    change('k112Mode', mode);
    finishApp();
    expect(get('resultTime').value).toBe('3:15');
    expect(get('resultScaleNotesField').hidden).toBe(false);
    save();
    expect(history()[0].timeSource).toBe('app');
    expect(history()[0].setup.mode).toBe(mode);
  });

  test('dose-first targets use exact coffee and round cumulative water', () => {
    useDose('15.2');
    expect(get('brewRecipeLabel').textContent).toContain('254g water / 15.2g coffee');
    expect(get('focusTarget').textContent).toContain('51 g');
    expect(win.recipeTargets()).toEqual([51, 102, 152, 203, 254]);
    change('ratioSlider', '16');
    expect(get('brewRecipeLabel').textContent).toContain('243g water / 15.2g coffee');
    expect(get('focusTarget').textContent).toContain('49 g');
  });

  test.each(['', '-5', '0', '40', '0.5', '15.25'])('rejects invalid dose %s without selecting a recipe', dose => {
    useDose(dose);
    expect(get('brewFocus').hidden).toBe(true);
    expect(get('doseFeedback').textContent).toContain('100-500');
  });

  test('out-of-range ratio change preserves the previous dose recipe and URL', () => {
    change('ratioSlider', '14');
    useDose('35.7');
    const url = win.location.href;
    change('ratioSlider', '18');
    expect(get('ratioSlider').value).toBe('14');
    expect(get('ratioDisplay').textContent).toBe('1:14.0');
    expect(get('brewRecipeLabel').textContent).toContain('500g water / 35.7g coffee');
    expect(win.location.href).toBe(url);
    expect(get('ratioFeedback').textContent).toContain('100-500 g');
  });

  test('ratio changes update the selected water-first recipe too', () => {
    select(300);
    change('ratioSlider', '15');
    expect(get('brewRecipeLabel').textContent).toContain('300g water / 20.0g coffee');
  });

  test('dose recipe round-trips through URL, favorites, and last brew', () => {
    useDose('15.2');
    const url = win.location.href;
    expect(new URL(url).searchParams.get('coffee')).toBe('15.2');
    get('btnFavoriteRecipe').click();
    const favorites = win.localStorage.getItem('v60_favorites');
    create({ url });
    expect(get('brewRecipeLabel').textContent).toContain('254g water / 15.2g coffee');
    create({ storage: { v60_favorites: favorites } });
    doc.querySelector('.favorite-card').click();
    expect(get('brewRecipeLabel').textContent).toContain('254g water / 15.2g coffee');
    confirmPreparation(win);
    get('btnFocusAction').click();
    get('btnFocusAction').click();
    advance(185);
    get('btnFocusAction').click();
    const last = win.localStorage.getItem('v60_last_brew');
    create({ storage: { v60_last_brew: last } });
    expect(get('brewRecipeLabel').textContent).toContain('254g water / 15.2g coffee');
    expect(get('coffeeDose').value).toBe('15.2');
  });

  test('dose and water-first favorites do not collide at the same water and ratio', () => {
    change('ratioSlider', '16');
    useDose('15');
    get('btnFavoriteRecipe').click();
    select(240);
    expect(get('btnFavoriteRecipe').textContent).toBe('Save favorite');
    get('btnFavoriteRecipe').click();
    expect(win.loadFavorites()).toHaveLength(2);
    expect(new Set(win.loadFavorites().map(fav => fav.key)).size).toBe(2);
  });

  test('custom whole-gram water links work and malformed links do not partially parse', () => {
    create({ url: 'http://localhost/?water=254' });
    expect(get('brewRecipeLabel').textContent).toContain('254g water');
    create({ url: 'http://localhost/?water=250garbage' });
    expect(get('brewFocus').hidden).toBe(true);
    expect(get('companionMessage').hidden).toBe(false);
  });

  test('focused app timer shows cumulative targets, increments, elapsed and next pour', () => {
    startApp();
    advance(70);
    expect(get('focusTarget').textContent).toBe('Pour to 150 g total');
    expect(get('focusDetail').textContent).toContain('+50 g');
    expect(get('focusClock').textContent).toContain('Elapsed 1:10');
    expect(get('focusClock').textContent).toContain('Step remaining 0:20');
    expect(get('focusNext').textContent).toContain('200 g by 1:50');
  });

  test('wall-clock catch-up enters drawdown but never declares coffee ready', () => {
    startApp();
    advance(300);
    expect(get('step5').classList.contains('running')).toBe(true);
    expect(get('step5Timer').textContent).toBe('5:00');
    expect(win.isBrewRunning()).toBe(true);
    expect(get('brewComplete').classList.contains('show')).toBe(false);
    expect(win.playCompletionSound).toHaveBeenCalledTimes(1);
    get('btnFocusAction').click();
    expect(get('brewComplete').classList.contains('show')).toBe(true);
    expect(get('resultTime').value).toBe('5:00');
  });

  test('drawdown can finish earlier than the approximate target', () => {
    startApp();
    advance(140);
    get('btnFocusAction').click();
    expect(get('resultTime').value).toBe('2:20');
  });

  test('advancing early does not shift absolute recipe deadlines', () => {
    startApp();
    advance(20);
    get('btnFocusAction').click();
    expect(get('focusStage').textContent).toBe('Pour 1');
    advance(50);
    expect(get('focusStage').textContent).toBe('Pour 2');
    expect(get('focusClock').textContent).toContain('1:10');
  });

  test('temperature prep gates app and scale starts', () => {
    change('timerSource', 'scale');
    change('temperatureEstimatorTarget', '94');
    select();
    expect(get('btnFocusAction').disabled).toBe(true);
    get('temperaturePrepStep').click();
    expect(get('scaleType').disabled).toBe(true);
    get('temperaturePrepStep').click();
    expect(get('btnFocusAction').disabled).toBe(true);
    expect(get('scaleType').disabled).toBe(false);
    get('btnWaterReady').click();
    expect(get('btnFocusAction').disabled).toBe(false);
    get('btnFocusAction').click();
    expect(win.isBrewRunning()).toBe(true);
  });

  test('active brew and unsaved results protect recipe and setup', () => {
    startApp();
    expect(get('scaleType').disabled).toBe(true);
    select(300);
    expect(get('brewRecipeLabel').textContent).toContain('250g');
    advance(195);
    get('btnFocusAction').click();
    expect(get('btnBrewAgain').disabled).toBe(true);
    expect(get('ratioSlider').disabled).toBe(true);
    select(400);
    expect(get('brewRecipeLabel').textContent).toContain('250g');
    get('btnDiscardResult').click();
    expect(get('btnBrewAgain').disabled).toBe(false);
    expect(get('ratioSlider').disabled).toBe(false);
    get('btnBrewAgain').click();
    expect(get('focusClock').textContent).toContain('Elapsed 0:00');
  });

  test('reset cancels countdown, clocks and scale sessions', () => {
    select();
    get('btnFocusAction').click();
    expect(win.isBrewRunning()).toBe(true);
    get('btnResetBrew').click();
    expect(win.isBrewRunning()).toBe(false);
    change('timerSource', 'scale');
    confirmPreparation(win);
    get('btnFocusAction').click();
    get('btnResetBrew').click();
    expect(win.isBrewRunning()).toBe(false);
    expect(get('btnFocusAction').textContent).toBe('Begin scale-timed brew');
  });

  test('results require actual water and valid time, not target-shaped defaults', () => {
    finishApp();
    expect(get('resultWater').value).toBe('');
    submit('brewResultForm');
    expect(history()).toBeNull();
    expect(get('resultFeedback').textContent).toContain('Enter positive');
    get('resultWater').value = '250';
    get('resultTime').value = '3:99';
    submit('brewResultForm');
    expect(history()).toBeNull();
    get('resultTime').value = '3:20';
    submit('brewResultForm');
    expect(history()[0].timeSource).toBe('manual-entry');
  });

  test('history persists actuals, notes, immutable recipe, and safely rendered text', () => {
    change('scaleType', 'k112');
    change('k112Mode', 'auto');
    finishApp();
    get('resultBeans').value = '<img src=x onerror=alert(1)>';
    get('resultGrind').value = 'K6 / 90 clicks';
    get('resultTaste').value = 'Sweet; try slightly finer.';
    get('resultScaleNotes').value = 'Timer stopped at bloom.';
    save();
    const stored = win.localStorage.getItem('v60_history');
    expect(history()[0]).toMatchObject({
      coffee: 15, water: 252.3, seconds: 195, timeSource: 'app', appElapsed: 195,
      recipe: { water: 250, ratio: 16.7 }, scaleNotes: 'Timer stopped at bloom.'
    });
    expect(get('brewHistory').querySelector('img')).toBeNull();
    expect(get('brewHistory').textContent).toContain('1:16.82');
    create({ storage: { v60_history: stored } });
    expect(get('brewHistory').textContent).toContain('K6 / 90 clicks');
    doc.querySelector('[data-history-repeat]').click();
    expect(get('k112Mode').value).toBe('auto');
    expect(get('brewRecipeLabel').textContent).toContain('250g water');
    doc.querySelector('[data-history-delete]').click();
    expect(history()).toEqual([]);
  });

  test('failed storage retains unsaved results and never announces success', () => {
    finishApp();
    const original = win.Storage.prototype.setItem;
    win.Storage.prototype.setItem = () => { throw new Error('Quota exceeded'); };
    save();
    expect(get('brewResult').hidden).toBe(false);
    expect(get('resultFeedback').textContent).toContain('Could not save');
    expect(get('storageWarning').hidden).toBe(false);
    expect(get('btnBrewAgain').disabled).toBe(true);
    win.Storage.prototype.setItem = original;
    save();
    expect(history()).toHaveLength(1);
    submit('brewResultForm');
    expect(history()).toHaveLength(1);
  });

  test('repeat restores the recorded water preparation as well as scale setup', () => {
    change('temperatureEstimatorVolume', '1000');
    change('temperatureEstimatorTarget', '94');
    select();
    get('temperaturePrepStep').click();
    get('temperaturePrepStep').click();
    get('btnWaterReady').click();
    get('btnFocusAction').click();
    get('btnFocusAction').click();
    advance(185);
    get('btnFocusAction').click();
    save();
    change('temperatureEstimatorVolume', '300');
    change('temperatureEstimatorTarget', '');
    doc.querySelector('[data-history-repeat]').click();
    expect(get('temperatureEstimatorVolume').value).toBe('1000');
    expect(get('temperatureEstimatorTarget').value).toBe('94');
    expect(get('temperaturePrepTimer').textContent).toBe('2:00');
    expect(get('temperatureEstimatorResult').textContent).toContain('~2 minutes');
    expect(get('temperatureEstimatorTimeline').textContent).toContain('120s');
  });

  test.each(['not-json', '{}', '[null]'])('corrupt history %s is reported and not overwritten', raw => {
    create({ storage: { v60_history: raw } });
    expect(get('brewHistory').textContent).toContain('not been overwritten');
    finishApp();
    save();
    expect(get('brewResult').hidden).toBe(false);
    expect(win.localStorage.getItem('v60_history')).toBe(raw);
  });

  test('stages stay mounted but require explicit preparation before starting', () => {
    const startDelay = get('startDelay');
    win.selectRecipeByWater(250);
    expect(get('setupStage').hidden).toBe(true);
    get('btnRecipeNext').click();
    expect(get('setupStage').hidden).toBe(false);
    expect(get('waterStage').hidden).toBe(true);
    expect(get('brewStage').hidden).toBe(true);
    get('step0').click();
    expect(win.isBrewRunning()).toBe(false);
    get('btnSetupReady').click();
    expect(get('waterStage').hidden).toBe(false);
    expect(get('brewStage').hidden).toBe(true);
    get('btnWaterReady').click();
    expect(get('brewStage').hidden).toBe(false);
    expect(get('startDelay')).toBe(startDelay);
    expect(get('step5Timer').textContent).toBe('~3:00 target');
  });

  test('selecting a recipe preserves editor disclosures until Continue', () => {
    get('recipeAdjustments').open = true;
    get('recipeReference').open = true;
    get('coffeeDose').value = '15.2';
    submit('doseForm');
    expect(get('recipeChoices').open).toBe(true);
    expect(get('recipeAdjustments').open).toBe(true);
    expect(get('setupStage').hidden).toBe(true);
    expect(get('journeyRecipeSummary').textContent).toBe('254 g water · 15.2 g coffee · 1:16.7');
    expect(doc.querySelectorAll('[data-quick-water][aria-pressed="true"]')).toHaveLength(0);
    get('btnRecipeNext').click();
    expect(get('recipeChoices').open).toBe(false);
    expect(get('setupStage').hidden).toBe(false);
    expect(doc.activeElement.id).toBe('setupHeading');
  });

  test('restored custom recipes are compact but require explicit Continue', () => {
    create({ url: 'http://localhost/?coffee=15.2&water=254' });
    expect(get('recipeChoices').open).toBe(false);
    expect(get('recipeAdjustments').open).toBe(false);
    expect(get('recipeSelection').hidden).toBe(false);
    expect(get('setupStage').hidden).toBe(true);
    expect(get('journeyRecipeSummary').textContent).toContain('254 g water');
    get('btnRecipeNext').click();
    expect(get('setupStage').hidden).toBe(false);
    expect(get('coffeeDose').value).toBe('15.2');
  });

  test('selection announcements do not mutate on every timer tick', () => {
    startApp();
    const mutations = new win.MutationObserver(() => {});
    mutations.observe(get('journeyRecipeSummary'), { childList: true, characterData: true, subtree: true });
    advance(70);
    expect(mutations.takeRecords()).toHaveLength(0);
    mutations.disconnect();
  });

  test('the empty selection live region is mounted before the first choice', () => {
    expect(get('journeyRecipeSummary').closest('[hidden]')).toBeNull();
    expect(get('journeyRecipeSummary').getAttribute('role')).toBe('status');
    expect(get('journeyRecipeSummary').textContent).toBe('');
    expect(get('recipeSelection').hidden).toBe(true);
  });

  test('the selected-recipe card groups labeled amounts and Continue', () => {
    win.selectRecipeByWater(300);
    expect(get('recipeSelection').hidden).toBe(false);
    expect(get('recipeSelection').getAttribute('aria-labelledby')).toBe('recipeSelectionHeading');
    expect(get('recipeSelectionHeading').textContent).toBe('Your selected recipe');
    expect(Array.from(get('recipeSelection').querySelectorAll('dt'), label => label.textContent)).toEqual(['Water', 'Coffee', 'Ratio']);
    expect(get('selectedWater').textContent).toBe('300 g');
    expect(get('selectedCoffee').textContent).toBe('18.0 g');
    expect(get('selectedRatio').textContent).toBe('1:16.7');
    expect(get('recipeSelection').contains(get('btnRecipeNext'))).toBe(true);
    expect(get('setupStage').hidden).toBe(true);
  });

  test('selected-recipe metrics update with custom doses and ratio changes', () => {
    useDose('15.2');
    expect(get('selectedWater').textContent).toBe('254 g');
    expect(get('selectedCoffee').textContent).toBe('15.2 g');
    change('ratioSlider', '16');
    expect(get('selectedWater').textContent).toBe('243 g');
    expect(get('selectedCoffee').textContent).toBe('15.2 g');
    expect(get('selectedRatio').textContent).toBe('1:16.0');
  });

  test('reselecting the same preset, table row or favorite keeps completed preparation', () => {
    change('temperatureEstimatorTarget', '94');
    select();
    get('btnFavoriteRecipe').click();
    get('temperaturePrepStep').click();
    get('temperaturePrepStep').click();
    get('btnWaterReady').click();
    const choices = [
      doc.querySelector('[data-quick-water="250"]'),
      doc.querySelector('#recipeTableBody tr[data-water="250"]'),
      doc.querySelector('.btn-select-favorite')
    ];
    for (const choice of choices) {
      choice.click();
      expect(get('temperaturePrepStep').classList.contains('completed')).toBe(true);
      expect(get('setupStage').hidden).toBe(false);
      expect(get('waterStage').hidden).toBe(false);
      expect(get('brewStage').hidden).toBe(false);
    }
  });

  test('successful selection and reset clear obsolete companion warnings', () => {
    create({ url: 'http://localhost/?water=250garbage' });
    expect(get('companionMessage').hidden).toBe(false);
    select();
    expect(get('companionMessage').hidden).toBe(true);
    get('btnFocusAction').click();
    win.selectRecipeByWater(300);
    expect(get('companionMessage').hidden).toBe(false);
    get('btnResetBrew').click();
    expect(get('companionMessage').hidden).toBe(true);
  });

  test.each(['[null]', '[1]', '[{}]', '[[]]'])('invalid favorite entries %s cannot abort initialization', favorites => {
    create({ storage: { v60_favorites: favorites } });
    expect(doc.querySelectorAll('#recipeTableBody tr')).toHaveLength(41);
    expect(get('storageWarning').hidden).toBe(false);
    startApp();
    expect(win.isBrewRunning()).toBe(true);
  });

  test('malformed favorites preserve usable entries', () => {
    select();
    get('btnFavoriteRecipe').click();
    const favorites = JSON.parse(win.localStorage.getItem('v60_favorites'));
    create({ storage: { v60_favorites: JSON.stringify([null, ...favorites]) } });
    expect(win.loadFavorites()).toHaveLength(1);
    expect(doc.querySelectorAll('.favorite-card')).toHaveLength(1);
    doc.querySelector('.favorite-card').click();
    expect(get('journeyRecipeSummary').textContent).toContain('250 g water');
  });

  test('history recomputes water-basis recipe coffee instead of rendering stored markup', () => {
    finishApp();
    save();
    const saved = history();
    saved[0].recipe.coffee = '<img src=x onerror=alert(1)>';
    create({ storage: { v60_history: JSON.stringify(saved) } });
    expect(get('brewHistory').querySelector('img')).toBeNull();
    expect(get('brewHistory').textContent).toContain('250 g water / 15.0 g coffee');
  });

  test('explicit recovery clears only history and retains the pending result', () => {
    select();
    get('btnFavoriteRecipe').click();
    const favorites = win.localStorage.getItem('v60_favorites');
    change('scaleType', 'k112');
    finishApp();
    const setup = win.localStorage.getItem('v60_setup');
    get('resultWater').value = '252.3';
    get('resultTaste').value = 'Keep this note';
    win.localStorage.setItem('v60_history', '[null]');
    submit('brewResultForm');
    expect(get('historyRecovery').hidden).toBe(false);
    win.confirm = () => false;
    get('btnResetHistory').click();
    expect(win.localStorage.getItem('v60_history')).toBe('[null]');
    win.confirm = () => true;
    get('btnResetHistory').click();
    expect(win.localStorage.getItem('v60_history')).toBeNull();
    expect(win.localStorage.getItem('v60_favorites')).toBe(favorites);
    expect(win.localStorage.getItem('v60_setup')).toBe(setup);
    expect(get('resultTaste').value).toBe('Keep this note');
    expect(get('brewResult').hidden).toBe(false);
    save();
    expect(history()[0].taste).toBe('Keep this note');
  });

  test('ratio input rebuilds once, debounces its URL, and skips unchanged URLs', () => {
    select();
    const tableSpy = jest.spyOn(win, 'generateTable');
    const urlSpy = jest.spyOn(win.history, 'replaceState');
    for (let i = 0; i < 30; i++) change('ratioSlider', String(14 + i / 10));
    expect(tableSpy).toHaveBeenCalledTimes(30);
    expect(urlSpy).not.toHaveBeenCalled();
    get('ratioSlider').dispatchEvent(new win.Event('change'));
    expect(urlSpy).toHaveBeenCalledTimes(1);
    expect(new URL(win.location.href).searchParams.get('ratio')).toBe('1:16.9');
    win.updateShareUrl();
    expect(urlSpy).toHaveBeenCalledTimes(1);
  });

  test('table generation reads favorites once and refreshes the favorite button once', () => {
    select();
    const storageSpy = jest.spyOn(win.Storage.prototype, 'getItem');
    const buttonSpy = jest.spyOn(win, 'renderFavoriteButton');
    win.generateTable(16.7);
    expect(buttonSpy).toHaveBeenCalledTimes(1);
    expect(storageSpy.mock.calls.filter(([key]) => key === 'v60_favorites')).toHaveLength(2);
  });

  test('ratio edits preserve both completed preparation and journey readiness', () => {
    change('temperatureEstimatorTarget', '94');
    select();
    get('temperaturePrepStep').click();
    get('temperaturePrepStep').click();
    get('btnWaterReady').click();
    change('ratioSlider', '16');
    expect(get('temperaturePrepStep').classList.contains('completed')).toBe(true);
    expect(get('brewStage').hidden).toBe(false);
    expect(get('btnFocusAction').disabled).toBe(false);
  });

  test('switching from scale to app timing asks for notifications before brew start', async () => {
    const requestPermission = jest.fn(() => Promise.resolve('granted'));
    win.Notification = { permission: 'default', requestPermission };
    change('timerSource', 'scale');
    select();
    expect(requestPermission).not.toHaveBeenCalled();
    change('timerSource', 'app');
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(win.isBrewRunning()).toBe(false);
    await Promise.resolve();
  });

  test('conflicting share parameters explain why dose determines water', () => {
    create({ url: 'http://localhost/?coffee=15.2&water=250' });
    expect(get('journeyRecipeSummary').textContent).toContain('254 g');
    expect(get('companionMessage').textContent).toContain('did not match');
  });
});
