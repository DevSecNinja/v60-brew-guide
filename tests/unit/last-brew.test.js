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

describe('V60 Recipe — Last Brew Persistence', () => {
  let dom, doc, window;

  beforeEach(() => {
    dom = createDOM();
    doc = dom.window.document;
    window = dom.window;
    window.localStorage.clear();
  });

  afterEach(() => {
    dom.window.close();
  });

  describe('localStorage helper functions', () => {
    test('saveLastBrew function is defined', () => {
      expect(typeof window.saveLastBrew).toBe('function');
    });

    test('loadLastBrew function is defined', () => {
      expect(typeof window.loadLastBrew).toBe('function');
    });

    test('clearLastBrew function is defined', () => {
      expect(typeof window.clearLastBrew).toBe('function');
    });

    test('loadLastBrew returns null when no last brew exists', () => {
      const lastBrew = window.loadLastBrew();
      expect(lastBrew).toBeNull();
    });

    test('saveLastBrew stores data in localStorage', () => {
      const recipe = { water: 250, coffee: '15.0', bloom: '50', pour1: '100', pour2: '150', pour3: '200', pour4: '250' };
      window.saveLastBrew(recipe, 16.7);
      const stored = JSON.parse(window.localStorage.getItem('v60_last_brew'));
      expect(stored.recipe).toEqual(recipe);
      expect(stored.ratio).toBe(16.7);
      expect(stored.completedAt).toBeDefined();
    });

    test('loadLastBrew retrieves stored data', () => {
      const recipe = { water: 300, coffee: '18.0' };
      window.saveLastBrew(recipe, 15.0);
      const lastBrew = window.loadLastBrew();
      expect(lastBrew.recipe).toEqual(recipe);
      expect(lastBrew.ratio).toBe(15.0);
    });

    test('loadLastBrew handles corrupted data gracefully', () => {
      window.localStorage.setItem('v60_last_brew', 'not-valid-json');
      const lastBrew = window.loadLastBrew();
      expect(lastBrew).toBeNull();
    });

    test('clearLastBrew removes data from localStorage', () => {
      window.saveLastBrew({ water: 250 }, 16.7);
      window.clearLastBrew();
      expect(window.localStorage.getItem('v60_last_brew')).toBeNull();
    });
  });

  describe('Brew complete persists last brew', () => {
    function selectAndCompleteBrew(waterAmount) {
      const rows = doc.querySelectorAll('#recipeTableBody tr');
      const row = Array.from(rows).find(r => r.dataset.water === String(waterAmount));
      row.click();
      // Step 0 needs 3 clicks: available → countdown → running → completed
      const step0 = doc.getElementById('step0');
      step0.click(); // countdown
      step0.click(); // running
      step0.click(); // completed (auto-starts step 1)
      // Steps 1–5 are auto-started; one click each to complete
      for (let i = 1; i < 6; i++) {
        const step = doc.getElementById('step' + i);
        step.click(); // complete (already running)
      }
    }

    test('completing a brew saves it to localStorage', () => {
      selectAndCompleteBrew(250);
      const lastBrew = window.loadLastBrew();
      expect(lastBrew).not.toBeNull();
      expect(lastBrew.recipe.water).toBe(250);
      expect(lastBrew.ratio).toBe(16.7);
    });

    test('completing a brew with different ratio saves correct ratio', () => {
      const slider = doc.getElementById('ratioSlider');
      slider.value = '15.0';
      slider.dispatchEvent(new window.Event('input'));

      const rows = doc.querySelectorAll('#recipeTableBody tr');
      const row = Array.from(rows).find(r => r.dataset.water === '300');
      row.click();
      // Step 0: 3 clicks (available → countdown → running → completed)
      const step0 = doc.getElementById('step0');
      step0.click(); // countdown
      step0.click(); // running (cancels countdown)
      step0.click(); // completed (auto-starts step 1)
      // Steps 1–5 are auto-started; one click each to complete
      for (let i = 1; i < 6; i++) {
        const step = doc.getElementById('step' + i);
        step.click(); // complete (already running)
      }

      const lastBrew = window.loadLastBrew();
      expect(lastBrew.ratio).toBe(15);
      expect(lastBrew.recipe.water).toBe(300);
    });
  });

  describe('Brew Another One button', () => {
    test('button exists in the DOM', () => {
      const btn = doc.getElementById('btnBrewAgain');
      expect(btn).not.toBeNull();
    });

    test('button is hidden initially', () => {
      const btn = doc.getElementById('btnBrewAgain');
      expect(btn.classList.contains('visible')).toBe(false);
    });

    test('button becomes visible after brew complete (with timer)', () => {
      jest.useFakeTimers();

      const rows = doc.querySelectorAll('#recipeTableBody tr');
      const row = Array.from(rows).find(r => r.dataset.water === '250');
      row.click();
      // Step 0: 3 clicks (available → countdown → running → completed)
      const step0 = doc.getElementById('step0');
      step0.click(); // countdown
      step0.click(); // running (cancels countdown)
      step0.click(); // completed (auto-starts step 1)
      // Steps 1–5 are auto-started; one click each to complete
      for (let i = 1; i < 6; i++) {
        const step = doc.getElementById('step' + i);
        step.click(); // complete (already running)
      }

      const btn = doc.getElementById('btnBrewAgain');
      // Button should not be visible yet
      expect(btn.classList.contains('visible')).toBe(false);

      // Advance timer by 3 seconds
      jest.advanceTimersByTime(3000);
      expect(btn.classList.contains('visible')).toBe(true);

      jest.useRealTimers();
    });

    test('clicking brew another one resets brew state', () => {
      jest.useFakeTimers();

      const rows = doc.querySelectorAll('#recipeTableBody tr');
      const row = Array.from(rows).find(r => r.dataset.water === '250');
      row.click();
      // Step 0: 3 clicks (available → countdown → running → completed)
      const step0 = doc.getElementById('step0');
      step0.click(); // countdown
      step0.click(); // running (cancels countdown)
      step0.click(); // completed (auto-starts step 1)
      // Steps 1–5 are auto-started; one click each to complete
      for (let i = 1; i < 6; i++) {
        const step = doc.getElementById('step' + i);
        step.click(); // complete (already running)
      }

      jest.advanceTimersByTime(3000);

      const btn = doc.getElementById('btnBrewAgain');
      btn.click();

      // Brew complete should be hidden
      const brewComplete = doc.getElementById('brewComplete');
      expect(brewComplete.classList.contains('show')).toBe(false);

      // First step should be available again
      expect(step0.classList.contains('available')).toBe(true);

      // Button should be hidden again
      expect(btn.classList.contains('visible')).toBe(false);

      jest.useRealTimers();
    });
  });

  describe('Last brew restoration on page load', () => {
    test('recipe is restored from localStorage on fresh page load', () => {
      // Create a new DOM that has last brew in localStorage before scripts run
      const lastBrewData = JSON.stringify({
        recipe: { water: 300, coffee: '18.0', bloom: '60', pour1: '120', pour2: '180', pour3: '240', pour4: '300' },
        ratio: 16.7,
        completedAt: Date.now()
      });

      const dom2 = new JSDOM(html, {
        runScripts: 'dangerously',
        pretendToBeVisual: true,
        url: 'http://localhost',
        beforeParse(window) {
          // Pre-populate localStorage before the page scripts execute
          window.localStorage.setItem('v60_last_brew', lastBrewData);
        }
      });
      const doc2 = dom2.window.document;

      // The recipe should be restored: row 300g should be selected
      const selected = doc2.querySelectorAll('#recipeTableBody tr.selected');
      expect(selected.length).toBe(1);
      expect(selected[0].dataset.water).toBe('300');

      // The brew complete screen should NOT be shown
      const brewComplete = doc2.getElementById('brewComplete');
      expect(brewComplete.classList.contains('show')).toBe(false);

      // Step 0 should be available (ready to brew again)
      const step0 = doc2.getElementById('step0');
      expect(step0.classList.contains('available')).toBe(true);

      dom2.window.close();
    });

    test('recipe with non-default ratio is restored correctly', () => {
      const lastBrewData = JSON.stringify({
        recipe: { water: 250, coffee: '16.7', bloom: '50', pour1: '100', pour2: '150', pour3: '200', pour4: '250' },
        ratio: 15.0,
        completedAt: Date.now()
      });

      const dom2 = new JSDOM(html, {
        runScripts: 'dangerously',
        pretendToBeVisual: true,
        url: 'http://localhost',
        beforeParse(window) {
          window.localStorage.setItem('v60_last_brew', lastBrewData);
        }
      });
      const doc2 = dom2.window.document;

      // The slider should be set to the saved ratio
      const slider2 = doc2.getElementById('ratioSlider');
      expect(parseFloat(slider2.value)).toBe(15.0);

      // Row 250g should be selected
      const selected = doc2.querySelectorAll('#recipeTableBody tr.selected');
      expect(selected.length).toBe(1);
      expect(selected[0].dataset.water).toBe('250');

      dom2.window.close();
    });

    test('enjoy brew screen is NOT shown on page load even with last brew', () => {
      // The brew complete screen should not be shown on page load
      const brewComplete = doc.getElementById('brewComplete');
      expect(brewComplete.classList.contains('show')).toBe(false);
    });

    test('URL params take priority over last brew', () => {
      const lastBrewData = JSON.stringify({
        recipe: { water: 300 },
        ratio: 16.7,
        completedAt: Date.now()
      });

      // Create a DOM with URL params AND last brew in localStorage
      const dom2 = new JSDOM(html, {
        runScripts: 'dangerously',
        pretendToBeVisual: true,
        url: 'http://localhost?water=250',
        beforeParse(window) {
          window.localStorage.setItem('v60_last_brew', lastBrewData);
        }
      });
      const doc2 = dom2.window.document;

      // The URL params should have selected water=250 (not 300 from localStorage)
      const selected = doc2.querySelectorAll('#recipeTableBody tr.selected');
      expect(selected.length).toBe(1);
      expect(selected[0].dataset.water).toBe('250');

      dom2.window.close();
    });
  });
});
