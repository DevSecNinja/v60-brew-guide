const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

describe('Scale companion', () => {
  let dom, win, doc, now, errors;
  const get = id => doc.getElementById(id);
  const change = (id, value) => {
    get(id).value = value;
    get(id).dispatchEvent(new win.Event(id === 'ratioSlider' ? 'input' : 'change'));
  };
  const submit = id => get(id).dispatchEvent(new win.Event('submit', { cancelable: true }));
  const select = (water = 250) => win.selectRecipeByWater(water);
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
    expect(get('k112Safety').hidden).toBe(false);
    expect(get('modeGuidance').textContent).toContain(mode === 'auto' ? 'experimental' : 'The app times');
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
    expect(get('companionMessage').hidden).toBe(false);
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
    expect(get('btnFocusAction').disabled).toBe(false);
    expect(get('scaleType').disabled).toBe(false);
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
  });

  test.each(['not-json', '{}', '[null]'])('corrupt history %s is reported and not overwritten', raw => {
    create({ storage: { v60_history: raw } });
    expect(get('brewHistory').textContent).toContain('not been overwritten');
    finishApp();
    save();
    expect(get('brewResult').hidden).toBe(false);
    expect(win.localStorage.getItem('v60_history')).toBe(raw);
  });
});
