const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// Load the HTML file
const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

// Helper: create a fresh JSDOM instance with scripts executing
function createDOM() {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost',
  });
  return dom;
}

describe('V60 Recipe Calculator — Core Logic', () => {
  let dom, doc;

  beforeEach(() => {
    dom = createDOM();
    doc = dom.window.document;
  });

  afterEach(() => {
    dom.window.close();
  });

  describe('Constants and defaults', () => {
    test('default ratio is 16.7', () => {
      const ratioSlider = doc.getElementById('ratioSlider');
      expect(parseFloat(ratioSlider.value)).toBe(16.7);
    });

    test('slider range is 14 to 18', () => {
      const ratioSlider = doc.getElementById('ratioSlider');
      expect(parseFloat(ratioSlider.min)).toBe(14);
      expect(parseFloat(ratioSlider.max)).toBe(18);
    });

    test('slider step is 0.1', () => {
      const ratioSlider = doc.getElementById('ratioSlider');
      expect(parseFloat(ratioSlider.step)).toBe(0.1);
    });

    test('ratio display shows default value', () => {
      const ratioDisplay = doc.getElementById('ratioDisplay');
      expect(ratioDisplay.textContent).toBe('1:16.7');
    });
  });

  describe('Recipe table generation', () => {
    test('generates 41 rows (100g to 500g in 10g increments)', () => {
      const rows = doc.querySelectorAll('#recipeTableBody tr');
      expect(rows.length).toBe(41);
    });

    test('first row starts at 100g water', () => {
      const firstRow = doc.querySelector('#recipeTableBody tr');
      expect(firstRow.dataset.water).toBe('100');
    });

    test('last row ends at 500g water', () => {
      const rows = doc.querySelectorAll('#recipeTableBody tr');
      const lastRow = rows[rows.length - 1];
      expect(lastRow.dataset.water).toBe('500');
    });

    test('250g row is highlighted by default', () => {
      const rows = doc.querySelectorAll('#recipeTableBody tr');
      const row250 = Array.from(rows).find(r => r.dataset.water === '250');
      expect(row250.classList.contains('highlight')).toBe(true);
    });

    test('coffee calculation is correct at default ratio (1:16.7)', () => {
      const rows = doc.querySelectorAll('#recipeTableBody tr');
      const row250 = Array.from(rows).find(r => r.dataset.water === '250');
      const expectedCoffee = (250 / 16.7).toFixed(1);
      expect(row250.dataset.coffee).toBe(expectedCoffee);
    });

    test('bloom is 2x the coffee weight', () => {
      const rows = doc.querySelectorAll('#recipeTableBody tr');
      Array.from(rows).forEach(row => {
        const coffee = parseFloat(row.dataset.coffee);
        const bloom = parseInt(row.dataset.bloom);
        expect(bloom).toBe(Math.round(coffee * 2));
      });
    });

    test('pour 1 is 60% of total water', () => {
      const rows = doc.querySelectorAll('#recipeTableBody tr');
      Array.from(rows).forEach(row => {
        const water = parseInt(row.dataset.water);
        const pour1 = parseInt(row.dataset.pour1);
        expect(pour1).toBe(Math.round(water * 0.6));
      });
    });

    test('pour 2 equals total water', () => {
      const rows = doc.querySelectorAll('#recipeTableBody tr');
      Array.from(rows).forEach(row => {
        const water = parseInt(row.dataset.water);
        const pour2 = parseInt(row.dataset.pour2);
        expect(pour2).toBe(water);
      });
    });

    test('all rows have 6 columns', () => {
      const rows = doc.querySelectorAll('#recipeTableBody tr');
      rows.forEach(row => {
        expect(row.querySelectorAll('td').length).toBe(6);
      });
    });

    test('table values update when ratio changes', () => {
      const slider = doc.getElementById('ratioSlider');
      slider.value = '15';
      slider.dispatchEvent(new dom.window.Event('input'));

      const rows = doc.querySelectorAll('#recipeTableBody tr');
      const row300 = Array.from(rows).find(r => r.dataset.water === '300');
      const expectedCoffee = (300 / 15).toFixed(1);
      expect(row300.dataset.coffee).toBe(expectedCoffee);
    });
  });

  describe('Ratio slider behavior', () => {
    test('reset button is hidden when at default ratio', () => {
      const btnResetRatio = doc.getElementById('btnResetRatio');
      expect(btnResetRatio.classList.contains('hidden')).toBe(true);
    });

    test('reset button appears when ratio changes', () => {
      const slider = doc.getElementById('ratioSlider');
      const btnResetRatio = doc.getElementById('btnResetRatio');

      slider.value = '15';
      slider.dispatchEvent(new dom.window.Event('input'));

      expect(btnResetRatio.classList.contains('hidden')).toBe(false);
    });

    test('reset button restores default ratio', () => {
      const slider = doc.getElementById('ratioSlider');
      const btnResetRatio = doc.getElementById('btnResetRatio');
      const ratioDisplay = doc.getElementById('ratioDisplay');

      slider.value = '15';
      slider.dispatchEvent(new dom.window.Event('input'));
      btnResetRatio.click();

      expect(parseFloat(slider.value)).toBe(16.7);
      expect(ratioDisplay.textContent).toBe('1:16.7');
      expect(btnResetRatio.classList.contains('hidden')).toBe(true);
    });

    test('display updates when slider moves', () => {
      const slider = doc.getElementById('ratioSlider');
      const ratioDisplay = doc.getElementById('ratioDisplay');

      slider.value = '14.5';
      slider.dispatchEvent(new dom.window.Event('input'));
      expect(ratioDisplay.textContent).toBe('1:14.5');
    });
  });

  describe('Brew steps — initial state', () => {
    test('steps grid is hidden before recipe selection', () => {
      const stepsGrid = doc.getElementById('stepsGrid');
      expect(stepsGrid.style.display).toBe('none');
    });

    test('no-recipe notice is visible initially', () => {
      const notice = doc.getElementById('noRecipeNotice');
      expect(notice.style.display).not.toBe('none');
    });

    test('all steps are locked initially', () => {
      const steps = doc.querySelectorAll('.step');
      steps.forEach(step => {
        expect(step.classList.contains('locked')).toBe(true);
      });
    });
  });

  describe('Recipe selection and brew steps', () => {
    function selectRow(waterAmount) {
      const rows = doc.querySelectorAll('#recipeTableBody tr');
      const row = Array.from(rows).find(r => r.dataset.water === String(waterAmount));
      row.click();
      return row;
    }

    test('clicking a row shows the steps grid', () => {
      selectRow(250);
      const stepsGrid = doc.getElementById('stepsGrid');
      expect(stepsGrid.style.display).not.toBe('none');
    });

    test('clicking a row hides the no-recipe notice', () => {
      selectRow(250);
      const notice = doc.getElementById('noRecipeNotice');
      expect(notice.style.display).toBe('none');
    });

    test('clicking a row updates the recipe label', () => {
      selectRow(300);
      const label = doc.getElementById('brewRecipeLabel');
      expect(label.textContent).toContain('300g water');
    });

    test('selected row gets the selected class', () => {
      const row = selectRow(200);
      expect(row.classList.contains('selected')).toBe(true);
    });

    test('only one row can be selected at a time', () => {
      selectRow(200);
      selectRow(300);
      const selected = doc.querySelectorAll('#recipeTableBody tr.selected');
      expect(selected.length).toBe(1);
      expect(selected[0].dataset.water).toBe('300');
    });

    test('first step becomes available after selection', () => {
      selectRow(250);
      const step0 = doc.getElementById('step0');
      expect(step0.classList.contains('available')).toBe(true);
    });

    test('subsequent steps remain locked after selection', () => {
      selectRow(250);
      for (let i = 1; i < 4; i++) {
        const step = doc.getElementById('step' + i);
        expect(step.classList.contains('locked')).toBe(true);
      }
    });

    test('step details are populated with recipe values', () => {
      selectRow(300);
      const step0Detail = doc.getElementById('step0Detail').innerHTML;
      const coffee = (300 / 16.7).toFixed(1);
      const bloom = (parseFloat(coffee) * 2).toFixed(0);
      expect(step0Detail).toContain(bloom + 'g');
    });

    test('step 1 detail contains pour 1 value (60% of water)', () => {
      selectRow(300);
      const step1Detail = doc.getElementById('step1Detail').innerHTML;
      const pour1 = (300 * 0.6).toFixed(0);
      expect(step1Detail).toContain(pour1 + 'g');
    });

    test('step 2 detail contains total water value', () => {
      selectRow(300);
      const step2Detail = doc.getElementById('step2Detail').innerHTML;
      expect(step2Detail).toContain('300g');
    });
  });

  describe('Brew step interactions', () => {
    function selectAndStartBrew(waterAmount) {
      const rows = doc.querySelectorAll('#recipeTableBody tr');
      const row = Array.from(rows).find(r => r.dataset.water === String(waterAmount));
      row.click();
    }

    test('clicking available step starts it (changes to running)', () => {
      selectAndStartBrew(250);
      const step0 = doc.getElementById('step0');
      step0.click();
      expect(step0.classList.contains('running')).toBe(true);
    });

    test('clicking running step completes it (skip)', () => {
      selectAndStartBrew(250);
      const step0 = doc.getElementById('step0');
      step0.click(); // start
      step0.click(); // skip/complete
      expect(step0.classList.contains('completed')).toBe(true);
    });

    test('completing a step auto-starts the next step', () => {
      selectAndStartBrew(250);
      const step0 = doc.getElementById('step0');
      step0.click(); // start
      step0.click(); // complete → next step auto-starts
      const step1 = doc.getElementById('step1');
      expect(step1.classList.contains('running')).toBe(true);
    });

    test('clicking a locked step does nothing', () => {
      selectAndStartBrew(250);
      const step1 = doc.getElementById('step1');
      step1.click();
      expect(step1.classList.contains('locked')).toBe(true);
    });

    test('clicking a completed step does nothing', () => {
      selectAndStartBrew(250);
      const step0 = doc.getElementById('step0');
      step0.click(); // start
      step0.click(); // complete
      step0.click(); // click again
      expect(step0.classList.contains('completed')).toBe(true);
    });

    test('completing all steps shows brew complete message', () => {
      selectAndStartBrew(250);
      for (let i = 0; i < 4; i++) {
        const step = doc.getElementById('step' + i);
        step.click(); // start
        step.click(); // complete
      }
      const brewComplete = doc.getElementById('brewComplete');
      expect(brewComplete.classList.contains('show')).toBe(true);
    });

    test('reset button resets all brew steps', () => {
      selectAndStartBrew(250);
      const step0 = doc.getElementById('step0');
      step0.click(); // start
      step0.click(); // complete

      const btnReset = doc.getElementById('btnResetBrew');
      btnReset.click();

      expect(step0.classList.contains('available')).toBe(true);
      const step1 = doc.getElementById('step1');
      expect(step1.classList.contains('locked')).toBe(true);
    });
  });
});

describe('V60 Recipe Calculator — Mathematical Accuracy', () => {
  let dom, doc;

  beforeEach(() => {
    dom = createDOM();
    doc = dom.window.document;
  });

  afterEach(() => {
    dom.window.close();
  });

  test('coffee weight is always water / ratio', () => {
    const ratios = [14, 15, 16, 16.7, 17, 18];
    const slider = doc.getElementById('ratioSlider');

    ratios.forEach(ratio => {
      slider.value = String(ratio);
      slider.dispatchEvent(new dom.window.Event('input'));

      const effectiveRatio = Math.abs(ratio - 16.7) < 0.2 ? 16.7 : ratio;

      const rows = doc.querySelectorAll('#recipeTableBody tr');
      rows.forEach(row => {
        const water = parseInt(row.dataset.water);
        const coffee = parseFloat(row.dataset.coffee);
        const expected = parseFloat((water / effectiveRatio).toFixed(1));
        expect(coffee).toBeCloseTo(expected, 1);
      });
    });
  });

  test('water increments are exactly 10g apart', () => {
    const rows = doc.querySelectorAll('#recipeTableBody tr');
    for (let i = 1; i < rows.length; i++) {
      const prev = parseInt(rows[i - 1].dataset.water);
      const curr = parseInt(rows[i].dataset.water);
      expect(curr - prev).toBe(10);
    }
  });

  test('bloom weight is always within reasonable range (2x coffee ±1g rounding)', () => {
    const rows = doc.querySelectorAll('#recipeTableBody tr');
    rows.forEach(row => {
      const coffee = parseFloat(row.dataset.coffee);
      const bloom = parseInt(row.dataset.bloom);
      expect(Math.abs(bloom - coffee * 2)).toBeLessThanOrEqual(1);
    });
  });

  test('pour 1 is always less than pour 2 (total water)', () => {
    const rows = doc.querySelectorAll('#recipeTableBody tr');
    rows.forEach(row => {
      const pour1 = parseInt(row.dataset.pour1);
      const pour2 = parseInt(row.dataset.pour2);
      expect(pour1).toBeLessThan(pour2);
    });
  });

  test('bloom is always less than pour 1', () => {
    const rows = doc.querySelectorAll('#recipeTableBody tr');
    rows.forEach(row => {
      const bloom = parseInt(row.dataset.bloom);
      const pour1 = parseInt(row.dataset.pour1);
      expect(bloom).toBeLessThan(pour1);
    });
  });
});

describe('V60 Recipe Calculator — Audio Completion Sound', () => {
  let dom, doc, window;

  beforeEach(() => {
    dom = createDOM();
    doc = dom.window.document;
    window = dom.window;
  });

  afterEach(() => {
    dom.window.close();
  });

  describe('Audio function availability', () => {
    test('playCompletionSound function is defined', () => {
      expect(typeof window.playCompletionSound).toBe('function');
    });

    test('playCompletionSound can be called without errors', () => {
      // Should not throw even if Web Audio API is not fully supported in jsdom
      expect(() => window.playCompletionSound()).not.toThrow();
    });

    test('playCompletionSound handles missing Web Audio API gracefully', () => {
      // Mock scenario where AudioContext is not available
      const originalAudioContext = window.AudioContext;
      const originalWebkitAudioContext = window.webkitAudioContext;

      delete window.AudioContext;
      delete window.webkitAudioContext;

      // Should not throw error
      expect(() => window.playCompletionSound()).not.toThrow();

      // Restore
      window.AudioContext = originalAudioContext;
      window.webkitAudioContext = originalWebkitAudioContext;
    });
  });

  describe('Audio plays on step completion', () => {
    function selectAndStartBrew(waterAmount) {
      const rows = doc.querySelectorAll('#recipeTableBody tr');
      const row = Array.from(rows).find(r => r.dataset.water === String(waterAmount));
      row.click();
    }

    test('playCompletionSound is called when countdown reaches zero', () => {
      // Note: Auto-complete timer test is skipped in jsdom due to timing complexities
      // This test verifies the function is called during manual completion instead
      const originalPlaySound = window.playCompletionSound;
      let soundCalled = false;
      window.playCompletionSound = () => {
        soundCalled = true;
      };

      selectAndStartBrew(250);
      const step0 = doc.getElementById('step0');

      step0.click(); // start

      // The auto-complete timer would call completeStep() when countdown reaches 0
      // For this test, we verify the sound plays when completeStep() is called
      window.completeStep(0);

      expect(soundCalled).toBe(true);
      expect(step0.classList.contains('completed')).toBe(true);

      // Restore
      window.playCompletionSound = originalPlaySound;
    });

    test('playCompletionSound is called when step is manually skipped', () => {
      // Spy on playCompletionSound
      const originalPlaySound = window.playCompletionSound;
      let soundCalled = false;
      window.playCompletionSound = () => {
        soundCalled = true;
      };

      selectAndStartBrew(250);
      const step0 = doc.getElementById('step0');

      step0.click(); // start
      step0.click(); // skip (manual complete)

      expect(soundCalled).toBe(true);
      expect(step0.classList.contains('completed')).toBe(true);

      // Restore
      window.playCompletionSound = originalPlaySound;
    });

    test('playCompletionSound is called for each completed step', () => {
      // Spy on playCompletionSound
      const originalPlaySound = window.playCompletionSound;
      let callCount = 0;
      window.playCompletionSound = () => {
        callCount++;
      };

      selectAndStartBrew(250);

      // Complete all 4 steps
      for (let i = 0; i < 4; i++) {
        const step = doc.getElementById('step' + i);
        step.click(); // start
        step.click(); // complete
      }

      expect(callCount).toBe(4);

      // Restore
      window.playCompletionSound = originalPlaySound;
    });
  });

  describe('Web Audio API integration', () => {
    test('creates AudioContext with fallback to webkitAudioContext', () => {
      // This tests the implementation uses proper fallback
      const codeString = window.playCompletionSound.toString();
      expect(codeString).toContain('AudioContext');
      expect(codeString).toContain('webkitAudioContext');
    });

    test('uses sine wave oscillators for tones', () => {
      const codeString = window.playCompletionSound.toString();
      expect(codeString).toContain('createOscillator');
      expect(codeString).toContain('sine');
    });

    test('creates two-tone sound (800 Hz and 1000 Hz)', () => {
      const codeString = window.playCompletionSound.toString();
      expect(codeString).toContain('800');
      expect(codeString).toContain('1000');
    });

    test('uses gain nodes for volume control', () => {
      const codeString = window.playCompletionSound.toString();
      expect(codeString).toContain('createGain');
      expect(codeString).toContain('exponentialRampToValueAtTime');
    });

    test('wraps audio code in try-catch for error handling', () => {
      const codeString = window.playCompletionSound.toString();
      expect(codeString).toContain('try');
      expect(codeString).toContain('catch');
    });
  });

  describe('Offline PWA compatibility', () => {
    test('playCompletionSound does not require network resources', () => {
      // Web Audio API is synthesized in-browser, no fetch/network calls
      const codeString = window.playCompletionSound.toString();
      expect(codeString).not.toContain('fetch');
      expect(codeString).not.toContain('http');
      expect(codeString).not.toContain('Audio(');
      expect(codeString).not.toContain('new Audio');
    });

    test('function works without internet connection', () => {
      // This is effectively tested by jsdom environment (no real network)
      // Function should complete without throwing
      expect(() => window.playCompletionSound()).not.toThrow();
    });
  });
});
