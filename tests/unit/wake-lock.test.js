const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// Load the HTML file
const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

// Helper: create a fresh JSDOM instance with scripts executing
function createDOM(options = {}) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost',
    ...options,
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

    test('isBrewComplete function is defined', () => {
      expect(typeof window.isBrewComplete).toBe('function');
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

  describe('isBrewComplete state detection', () => {
    function selectRow(waterAmount) {
      const rows = doc.querySelectorAll('#recipeTableBody tr');
      const row = Array.from(rows).find(r => r.dataset.water === String(waterAmount));
      row.click();
      return row;
    }

    function completeBrew() {
      const step0 = doc.getElementById('step0');
      step0.click(); // countdown
      step0.click(); // running
      step0.click(); // completed (auto-starts step 1)
      const stepCount = doc.querySelectorAll('#stepsGrid .step').length;
      for (let i = 1; i < stepCount; i++) {
        const step = doc.getElementById(`step${i}`);
        step.click(); // complete (already running)
      }
    }

    test('returns false when no recipe is selected', () => {
      expect(window.isBrewComplete()).toBe(false);
    });

    test('returns false when recipe selected but no step started', () => {
      selectRow(250);
      expect(window.isBrewComplete()).toBe(false);
    });

    test('returns true when all steps are completed', () => {
      selectRow(250);
      completeBrew();
      expect(window.isBrewComplete()).toBe(true);
    });
  });

  describe('Wake Lock integration with brew steps', () => {
    function selectRow(waterAmount) {
      const rows = doc.querySelectorAll('#recipeTableBody tr');
      const row = Array.from(rows).find(r => r.dataset.water === String(waterAmount));
      row.click();
      return row;
    }

    function completeBrew() {
      const step0 = doc.getElementById('step0');
      step0.click(); // countdown
      step0.click(); // running
      step0.click(); // complete (auto-starts step 1)
      // Steps 1–5 are auto-started; one click each to complete
      const stepCount = doc.querySelectorAll('#stepsGrid .step').length;
      for (let i = 1; i < stepCount; i++) {
        const step = doc.getElementById(`step${i}`);
        step.click(); // complete (already running)
      }
    }

    test('wake lock is requested when the app opens', async () => {
      const mockWakeLockRequest = jest.fn(() => Promise.resolve({
        addEventListener: jest.fn(),
        release: jest.fn(),
      }));
      const domWithWakeLock = createDOM({
        beforeParse(win) {
          Object.defineProperty(win.navigator, 'wakeLock', {
            value: { request: mockWakeLockRequest },
            configurable: true,
          });
        },
      });

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockWakeLockRequest).toHaveBeenCalledWith('screen');

      domWithWakeLock.window.close();
    });

    test('requestWakeLock is NOT called when a recipe is selected', () => {
      const originalRequestWakeLock = window.requestWakeLock;
      let wakeLockCallCount = 0;
      window.requestWakeLock = () => {
        wakeLockCallCount++;
        return Promise.resolve(false);
      };

      selectRow(250);

      expect(wakeLockCallCount).toBe(0);

      // Restore
      window.requestWakeLock = originalRequestWakeLock;
    });

    test('releaseWakeLock is NOT called when a recipe is selected', () => {
      const originalReleaseWakeLock = window.releaseWakeLock;
      let releaseCalled = false;
      window.releaseWakeLock = () => {
        releaseCalled = true;
        return Promise.resolve();
      };

      selectRow(250);

      expect(releaseCalled).toBe(false);

      // Restore
      window.releaseWakeLock = originalReleaseWakeLock;
    });

    test('requestWakeLock is NOT called when step 0 starts', () => {
      const originalRequestWakeLock = window.requestWakeLock;
      let wakeLockCallCount = 0;

      selectRow(250);
      window.requestWakeLock = () => {
        wakeLockCallCount++;
        return Promise.resolve(false);
      };

      const step0 = doc.getElementById('step0');
      step0.click(); // start step 0

      expect(wakeLockCallCount).toBe(0);

      // Restore
      window.requestWakeLock = originalRequestWakeLock;
    });

    test('requestWakeLock is NOT called when subsequent steps start', () => {
      const originalRequestWakeLock = window.requestWakeLock;
      let wakeLockCallCount = 0;

      selectRow(250);
      const step0 = doc.getElementById('step0');
      step0.click(); // start step 0
      step0.click(); // skip countdown → running

      // Now reset the counter so we only measure calls from steps 1+.
      window.requestWakeLock = () => {
        wakeLockCallCount++;
        return Promise.resolve(false);
      };

      // Complete step 0, which auto-starts step 1 — should NOT call requestWakeLock
      step0.click();

      expect(wakeLockCallCount).toBe(0);

      // Restore
      window.requestWakeLock = originalRequestWakeLock;
    });

    test('requestWakeLock is re-acquired on visibility change before brew completes', () => {
      const originalRequestWakeLock = window.requestWakeLock;
      let wakeLockCallCount = 0;

      window.requestWakeLock = () => {
        wakeLockCallCount++;
        return Promise.resolve(false);
      };

      // Simulate the page going to background and back (wake lock auto-released)
      // by firing a visibilitychange event with visibilityState = 'visible'.
      Object.defineProperty(doc, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      });
      doc.dispatchEvent(new window.Event('visibilitychange'));

      // The handler should re-request the lock because the brew is not done.
      expect(wakeLockCallCount).toBe(1);

      // Restore
      window.requestWakeLock = originalRequestWakeLock;
    });

    test('requestWakeLock is NOT re-acquired on visibility change after brew completes', () => {
      const originalRequestWakeLock = window.requestWakeLock;
      let wakeLockCallCount = 0;

      selectRow(250);

      completeBrew();

      // Intercept wake lock calls after brew completion
      window.requestWakeLock = () => {
        wakeLockCallCount++;
        return Promise.resolve(false);
      };

      Object.defineProperty(doc, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      });
      doc.dispatchEvent(new window.Event('visibilitychange'));

      // The handler should NOT re-request — the brew is done
      expect(wakeLockCallCount).toBe(0);

      // Restore
      window.requestWakeLock = originalRequestWakeLock;
    });


    test('releaseWakeLock is called when all steps complete', () => {
      const originalReleaseWakeLock = window.releaseWakeLock;
      const originalSetTimeout = window.setTimeout;
      let releaseCalled = false;
      window.releaseWakeLock = () => {
        releaseCalled = true;
        return Promise.resolve();
      };
      window.setTimeout = (callback) => {
        callback();
        return 0;
      };

      selectRow(250);

      completeBrew();

      expect(releaseCalled).toBe(true);

      // Restore
      window.releaseWakeLock = originalReleaseWakeLock;
      window.setTimeout = originalSetTimeout;
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

    test('requestWakeLock is NOT called when brewing another one', () => {
      const originalRequestWakeLock = window.requestWakeLock;
      let wakeLockCallCount = 0;

      selectRow(250);
      completeBrew();

      window.requestWakeLock = () => {
        wakeLockCallCount++;
        return Promise.resolve(false);
      };

      const btnBrewAgain = doc.getElementById('btnBrewAgain');
      btnBrewAgain.click();

      expect(wakeLockCallCount).toBe(0);

      // Restore
      window.requestWakeLock = originalRequestWakeLock;
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
