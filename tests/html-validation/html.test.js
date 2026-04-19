const fs = require('fs');
const path = require('path');
const { HtmlValidate } = require('html-validate');

const htmlContent = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

describe('HTML Validation', () => {
  let htmlvalidate;
  let report;

  beforeAll(async () => {
    htmlvalidate = new HtmlValidate({
      extends: ['html-validate:recommended'],
      rules: {
        // Allow inline styles and scripts for single-file app
        'no-inline-style': 'off',
        // Relax some rules for a single-file app
        'require-sri': 'off',
        'tel-non-breaking': 'off',
      },
    });
    report = await htmlvalidate.validateString(htmlContent);
  });

  test('HTML has no errors', () => {
    const errors = report.results[0]?.messages.filter(m => m.severity === 2) || [];
    if (errors.length > 0) {
      const errorMessages = errors.map(e => `Line ${e.line}: ${e.message} (${e.ruleId})`).join('\n');
      throw new Error(`HTML validation errors:\n${errorMessages}`);
    }
  });

  test('HTML has minimal warnings', () => {
    const warnings = report.results[0]?.messages.filter(m => m.severity === 1) || [];
    // Log warnings but don't fail — they're advisory
    if (warnings.length > 0) {
      console.warn(`HTML validation warnings (${warnings.length}):`);
      warnings.forEach(w => console.warn(`  Line ${w.line}: ${w.message} (${w.ruleId})`));
    }
    // Allow up to 10 warnings for a single-file app
    expect(warnings.length).toBeLessThanOrEqual(10);
  });
});

describe('HTML Structure', () => {
  let doc;

  beforeAll(() => {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM(htmlContent);
    doc = dom.window.document;
  });

  test('has DOCTYPE declaration', () => {
    expect(htmlContent.trim().toLowerCase().startsWith('<!doctype html>')).toBe(true);
  });

  test('has html lang attribute', () => {
    const html = doc.querySelector('html');
    expect(html.getAttribute('lang')).toBe('en');
  });

  test('has charset meta tag', () => {
    const charset = doc.querySelector('meta[charset]');
    expect(charset).not.toBeNull();
    expect(charset.getAttribute('charset').toUpperCase()).toBe('UTF-8');
  });

  test('has viewport meta tag', () => {
    const viewport = doc.querySelector('meta[name="viewport"]');
    expect(viewport).not.toBeNull();
    expect(viewport.getAttribute('content')).toContain('width=device-width');
  });

  test('has a title element', () => {
    const title = doc.querySelector('title');
    expect(title).not.toBeNull();
    expect(title.textContent.length).toBeGreaterThan(0);
  });

  test('title contains "V60"', () => {
    const title = doc.querySelector('title');
    expect(title.textContent).toContain('V60');
  });

  test('has a header element', () => {
    expect(doc.querySelector('header')).not.toBeNull();
  });

  test('has a main element', () => {
    expect(doc.querySelector('main')).not.toBeNull();
  });

  test('has a footer element', () => {
    expect(doc.querySelector('footer')).not.toBeNull();
  });

  test('has exactly one h1 element', () => {
    const h1s = doc.querySelectorAll('h1');
    expect(h1s.length).toBe(1);
  });

  test('h1 contains "V60"', () => {
    const h1 = doc.querySelector('h1');
    expect(h1.textContent).toContain('V60');
  });

  test('has recipe table with thead and tbody', () => {
    const table = doc.querySelector('table');
    expect(table).not.toBeNull();
    expect(table.querySelector('thead')).not.toBeNull();
    expect(table.querySelector('tbody')).not.toBeNull();
  });

  test('table has correct column headers', () => {
    const headers = doc.querySelectorAll('thead th');
    const headerTexts = Array.from(headers).map(th => th.textContent.trim());
    expect(headerTexts).toContain('Water (g)');
    expect(headerTexts).toContain('Coffee (g)');
    expect(headerTexts).toContain('Bloom (g)');
    expect(headerTexts).toContain('Pour 1 to (g)');
    expect(headerTexts).toContain('Pour 2 to (g)');
    expect(headerTexts).toContain('Pour 3 to (g)');
    expect(headerTexts).toContain('Pour 4 to (g)');
  });

  test('has 6 brew steps', () => {
    const steps = doc.querySelectorAll('.step');
    expect(steps.length).toBe(6);
  });

  test('brew steps have correct labels', () => {
    const labels = doc.querySelectorAll('.step-label');
    const texts = Array.from(labels).map(l => l.textContent.trim());
    expect(texts[0]).toContain('Bloom');
    expect(texts[1]).toContain('Pour 1');
    expect(texts[2]).toContain('Pour 2');
    expect(texts[3]).toContain('Pour 3');
    expect(texts[4]).toContain('Pour 4');
    expect(texts[5]).toContain('Finish');
  });

  test('has ratio slider with correct attributes', () => {
    const slider = doc.querySelector('#ratioSlider');
    expect(slider).not.toBeNull();
    expect(slider.getAttribute('type')).toBe('range');
    expect(slider.getAttribute('min')).toBe('14');
    expect(slider.getAttribute('max')).toBe('18');
  });

  test('has reset buttons', () => {
    expect(doc.getElementById('btnResetBrew')).not.toBeNull();
    expect(doc.getElementById('btnResetRatio')).not.toBeNull();
  });

  test('external links have rel="noopener"', () => {
    const externalLinks = doc.querySelectorAll('a[target="_blank"]');
    externalLinks.forEach(link => {
      expect(link.getAttribute('rel')).toContain('noopener');
    });
  });

  test('external links open in new tab', () => {
    const externalLinks = doc.querySelectorAll('a[href^="http"]');
    externalLinks.forEach(link => {
      expect(link.getAttribute('target')).toBe('_blank');
    });
  });
});

describe('CSS and Styling', () => {
  let doc;

  beforeAll(() => {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM(htmlContent);
    doc = dom.window.document;
  });

  test('has a style element with CSS', () => {
    const style = doc.querySelector('style');
    expect(style).not.toBeNull();
    expect(style.textContent.length).toBeGreaterThan(100);
  });

  test('CSS defines custom properties (CSS variables)', () => {
    const style = doc.querySelector('style');
    expect(style.textContent).toContain('--espresso');
    expect(style.textContent).toContain('--cream');
    expect(style.textContent).toContain('--accent');
  });

  test('has responsive media query', () => {
    const style = doc.querySelector('style');
    expect(style.textContent).toContain('@media');
    expect(style.textContent).toContain('max-width');
  });

  test('uses box-sizing border-box', () => {
    const style = doc.querySelector('style');
    expect(style.textContent).toContain('box-sizing: border-box');
  });

  test('loads Google Fonts', () => {
    const fontLinks = doc.querySelectorAll('link[href*="fonts.googleapis.com"]');
    expect(fontLinks.length).toBeGreaterThan(0);
  });

  test('has font preconnect hints', () => {
    const preconnect = doc.querySelectorAll('link[rel="preconnect"]');
    expect(preconnect.length).toBeGreaterThan(0);
  });
});

describe('Mobile Table Scrolling', () => {
  let styleContent;

  beforeAll(() => {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM(htmlContent);
    const doc = dom.window.document;
    const style = doc.querySelector('style');
    styleContent = style.textContent;
  });

  test('has media query for mobile/tablet (768px)', () => {
    expect(styleContent).toContain('@media (max-width: 768px)');
  });

  test('table-wrapper has max-height for mobile scrolling', () => {
    expect(styleContent).toContain('.table-wrapper');
    expect(styleContent).toContain('max-height: 50vh');
  });

  test('table-wrapper has overflow-y for vertical scrolling', () => {
    expect(styleContent).toContain('overflow-y: auto');
  });

  test('sticky header is applied to thead th (not thead) for cross-browser support', () => {
    // Sticky on thead th works reliably across browsers including iOS Safari
    expect(styleContent).toContain('.table-wrapper thead th');
    expect(styleContent).toMatch(/\.table-wrapper thead th[\s\S]*?position:\s*sticky/);
  });

  test('sticky header has z-index for proper layering', () => {
    expect(styleContent).toMatch(/\.table-wrapper thead th[\s\S]*?z-index:\s*1/);
  });

  test('sticky header has background color to prevent content showing through', () => {
    expect(styleContent).toMatch(/\.table-wrapper thead th[\s\S]*?background:\s*var\(--cream\)/);
  });

  test('sticky header has top: 0 for positioning', () => {
    expect(styleContent).toMatch(/\.table-wrapper thead th[\s\S]*?top:\s*0/);
  });
});
