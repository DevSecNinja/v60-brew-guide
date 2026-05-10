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

describe('GitHub Star Feature', () => {
  let dom, doc;

  beforeEach(() => {
    dom = createDOM();
    doc = dom.window.document;
  });

  afterEach(() => {
    dom.window.close();
  });

  describe('HTML Structure', () => {
    test('footer contains GitHub star section', () => {
      const githubStarSection = doc.getElementById('githubStarSection');
      expect(githubStarSection).not.toBeNull();
    });

    test('footer contains commit SHA element', () => {
      const commitSha = doc.getElementById('commitSha');
      expect(commitSha).not.toBeNull();
      expect(commitSha.classList.contains('commit-sha')).toBe(true);
      expect(commitSha.closest('footer')).not.toBeNull();
    });

    test('commit SHA is a clickable link to GitHub', () => {
      const commitShaLink = doc.getElementById('commitShaLink');
      expect(commitShaLink).not.toBeNull();
      expect(commitShaLink.tagName).toBe('A');
      expect(commitShaLink.href).toContain('github.com/DevSecNinja/v60-brew-guide');
      expect(commitShaLink.target).toBe('_blank');
      expect(commitShaLink.rel).toBe('noopener');
    });

    test('GitHub star button exists and links to repository', () => {
      const githubStarButton = doc.getElementById('githubStarButton');
      expect(githubStarButton).not.toBeNull();
      expect(githubStarButton.tagName).toBe('A');
      expect(githubStarButton.href).toContain('github.com/DevSecNinja/v60-brew-guide');
      expect(githubStarButton.target).toBe('_blank');
      expect(githubStarButton.rel).toBe('noopener');
    });

    test('GitHub star button has star icon', () => {
      const starIcon = doc.querySelector('.github-star-icon');
      expect(starIcon).not.toBeNull();
      expect(starIcon.textContent).toBe('⭐');
    });

    test('star count text element exists', () => {
      const starCountText = doc.getElementById('starCountText');
      expect(starCountText).not.toBeNull();
      expect(starCountText.textContent).toBe('Star on GitHub');
    });

    test('call-to-action message exists', () => {
      const ctaMessage = doc.querySelector('.github-star-cta');
      expect(ctaMessage).not.toBeNull();
      expect(ctaMessage.textContent).toContain('star the repo to support');
    });
  });

  describe('CSS Classes', () => {
    test('github-star section has correct class', () => {
      const githubStarSection = doc.getElementById('githubStarSection');
      expect(githubStarSection.classList.contains('github-star')).toBe(true);
    });

    test('star button has correct class', () => {
      const githubStarButton = doc.getElementById('githubStarButton');
      expect(githubStarButton.classList.contains('github-star-button')).toBe(true);
    });
  });

  describe('JavaScript Functions', () => {
    test('fetchGitHubStars function is defined', () => {
      expect(typeof dom.window.fetchGitHubStars).toBe('function');
    });

    test('updateStarCount function is defined', () => {
      expect(typeof dom.window.updateStarCount).toBe('function');
    });

    test('updateStarCount updates the star count text', () => {
      const starCountText = doc.getElementById('starCountText');
      dom.window.updateStarCount(42);
      expect(starCountText.textContent).toBe('42 stars');
    });

    test('updateStarCount formats numbers correctly', () => {
      const starCountText = doc.getElementById('starCountText');
      dom.window.updateStarCount(42);
      expect(starCountText.textContent).toBe('42 stars');
      
      // Test with larger number - formatting may vary by locale
      dom.window.updateStarCount(1234);
      const formattedText = starCountText.textContent;
      // Should contain the digits and 'stars'
      expect(formattedText).toMatch(/1[,\s.]?234 stars/);
    });

    test('updateStarCount handles singular star', () => {
      const starCountText = doc.getElementById('starCountText');
      dom.window.updateStarCount(1);
      expect(starCountText.textContent).toBe('1 star');
    });

    test('updateStarCount handles zero stars', () => {
      const starCountText = doc.getElementById('starCountText');
      dom.window.updateStarCount(0);
      expect(starCountText.textContent).toBe('0 stars');
    });
  });
});
