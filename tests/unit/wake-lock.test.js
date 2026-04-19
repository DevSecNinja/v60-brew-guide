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

describe('V60 Recipe Calculator — Wake Lock', () => {
  let dom, doc, window;

  beforeEach(() => {
    dom = createDOM();
    doc = dom.window.document;
    window = dom.window;
  });

  afterEach(() => {
    dom.window.close();
  });

  describe('Wake Lock function availability', () => {
    test('requestWakeLock function is defined', () => {
      expect(typeof window.requestWakeLock).toBe('function');
    });

    test('releaseWakeLock function is defined', () => {
      expect(typeof window.releaseWakeLock).toBe('function');
    });

    test('isBrewRunning function is defined', () => {
      expect(typeof window.isBrewRunning).toBe('function');
    });
  });

  describe('Wake Lock API fallback handling', () => {
    test('requestWakeLock handles missing Wake Lock API gracefully', async () => {
      // jsdom doesn't support navigator.wakeLock, so this tests the fallback
      const result = await window.requestWakeLock();
      expect(result).toBe(false);
    });

    test('releaseWakeLock handles null wakeLock gracefully', async () => {
      // Should not throw when wakeLock is null
      await expect(window.releaseWakeLock()).resolves.toBeUndefined();
    });
  });

  describe('isBrewRunning state detection', () => {
    function selectRow(waterAmount) {
      const rows = doc.querySelectorAll('#recipeTableBody tr');
      const row = Array.from(rows).find(r => r.dataset.water === String(waterAmount));
      row.click();
      return row;
    }

    test('returns false when no recipe is selected', () => {
      expect(window.isBrewRunning()).toBe(false);
    });

    test('returns false when recipe selected but no step started', () => {
      selectRow(250);
      expect(window.isBrewRunning()).toBe(false);
    });

    test('returns true when a step is running', () => {
      selectRow(250);
      const step0 = doc.getElementById('step0');
      step0.click(); // start step
      expect(window.isBrewRunning()).toBe(true);
    });

    test('returns true after a step is completed (next step auto-starts)', () => {
      selectRow(250);
      const step0 = doc.getElementById('step0');
      step0.click(); // start step
      step0.click(); // complete step → next step auto-starts
      expect(window.isBrewRunning()).toBe(true);
    });

    test('returns true during any running step', () => {
      selectRow(250);
      // Complete first step, start second
      const step0 = doc.getElementById('step0');
      step0.click(); // start step 0
      step0.click(); // complete step 0
      
      const step1 = doc.getElementById('step1');
      step1.click(); // start step 1
      
      expect(window.isBrewRunning()).toBe(true);
    });

    test('returns false when all steps are completed', () => {
      selectRow(250);
      // Complete all steps
      for (let i = 0; i < 6; i++) {
        const step = doc.getElementById('step' + i);
        step.click(); // start
        step.click(); // complete
      }
      expect(window.isBrewRunning()).toBe(false);
    });

    test('returns false after brew reset', () => {
      selectRow(250);
      const step0 = doc.getElementById('step0');
      step0.click(); // start step (running)
      
      // Reset brew
      const btnReset = doc.getElementById('btnResetBrew');
      btnReset.click();
      
      expect(window.isBrewRunning()).toBe(false);
    });
  });

  describe('Wake Lock integration with brew steps', () => {
    function selectRow(waterAmount) {
      const rows = doc.querySelectorAll('#recipeTableBody tr');
      const row = Array.from(rows).find(r => r.dataset.water === String(waterAmount));
      row.click();
      return row;
    }

    test('requestWakeLock is called when first step starts', () => {
      const originalRequestWakeLock = window.requestWakeLock;
      let wakeLockCalled = false;
      window.requestWakeLock = () => {
        wakeLockCalled = true;
        return Promise.resolve(false);
      };

      selectRow(250);
      const step0 = doc.getElementById('step0');
      step0.click(); // start first step

      expect(wakeLockCalled).toBe(true);

      // Restore
      window.requestWakeLock = originalRequestWakeLock;
    });

    test('requestWakeLock is NOT called when subsequent steps start', () => {
      const originalRequestWakeLock = window.requestWakeLock;
      let wakeLockCallCount = 0;
      window.requestWakeLock = () => {
        wakeLockCallCount++;
        return Promise.resolve(false);
      };

      selectRow(250);
      
      // Start and complete first step
      const step0 = doc.getElementById('step0');
      step0.click(); // start (should call requestWakeLock)
      step0.click(); // complete

      // Start second step
      const step1 = doc.getElementById('step1');
      step1.click(); // start (should NOT call requestWakeLock)

      expect(wakeLockCallCount).toBe(1);

      // Restore
      window.requestWakeLock = originalRequestWakeLock;
    });

    test('releaseWakeLock is called when all steps complete', () => {
      const originalReleaseWakeLock = window.releaseWakeLock;
      let releaseCalled = false;
      window.releaseWakeLock = () => {
        releaseCalled = true;
        return Promise.resolve();
      };

      selectRow(250);

      // Complete all steps
      for (let i = 0; i < 6; i++) {
        const step = doc.getElementById('step' + i);
        step.click(); // start
        step.click(); // complete
      }

      expect(releaseCalled).toBe(true);

      // Restore
      window.releaseWakeLock = originalReleaseWakeLock;
    });

    test('releaseWakeLock is called when brew is reset', () => {
      const originalReleaseWakeLock = window.releaseWakeLock;
      let releaseCalled = false;
      window.releaseWakeLock = () => {
        releaseCalled = true;
        return Promise.resolve();
      };

      selectRow(250);
      const step0 = doc.getElementById('step0');
      step0.click(); // start step

      // Reset brew
      const btnReset = doc.getElementById('btnResetBrew');
      btnReset.click();

      expect(releaseCalled).toBe(true);

      // Restore
      window.releaseWakeLock = originalReleaseWakeLock;
    });
  });

  describe('Wake Lock code implementation', () => {
    test('requestWakeLock checks for API support', () => {
      const codeString = window.requestWakeLock.toString();
      expect(codeString).toContain('wakeLock');
      expect(codeString).toContain('navigator');
    });

    test('requestWakeLock uses try-catch for error handling', () => {
      const codeString = window.requestWakeLock.toString();
      expect(codeString).toContain('try');
      expect(codeString).toContain('catch');
    });

    test('releaseWakeLock uses try-catch for error handling', () => {
      const codeString = window.releaseWakeLock.toString();
      expect(codeString).toContain('try');
      expect(codeString).toContain('catch');
    });

    test('requestWakeLock requests screen wake lock type', () => {
      const codeString = window.requestWakeLock.toString();
      expect(codeString).toContain("'screen'");
    });
  });
});
