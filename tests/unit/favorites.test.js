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

describe('V60 Recipe Calculator — Favorites Feature', () => {
  let dom, doc, window;

  beforeEach(() => {
    dom = createDOM();
    doc = dom.window.document;
    window = dom.window;
    // Clear localStorage before each test
    window.localStorage.clear();
  });

  afterEach(() => {
    dom.window.close();
  });

  describe('Favorites HTML structure', () => {
    test('favorites section exists in the DOM', () => {
      const section = doc.getElementById('favoritesSection');
      expect(section).not.toBeNull();
    });

    test('favorites section is hidden initially (no favorites)', () => {
      const section = doc.getElementById('favoritesSection');
      expect(section.style.display).toBe('none');
    });

    test('favorites list container exists', () => {
      const list = doc.getElementById('favoritesList');
      expect(list).not.toBeNull();
    });

    test('table header has a favorite column', () => {
      const headers = doc.querySelectorAll('thead th');
      expect(headers.length).toBe(6);
      const lastHeader = headers[headers.length - 1];
      expect(lastHeader.textContent.trim()).toBe('♡');
    });

    test('each table row has a favorite button', () => {
      const rows = doc.querySelectorAll('#recipeTableBody tr');
      rows.forEach(row => {
        const btn = row.querySelector('.btn-favorite');
        expect(btn).not.toBeNull();
        expect(btn.getAttribute('aria-label')).toBeTruthy();
      });
    });
  });

  describe('Favorites JavaScript functions', () => {
    test('loadFavorites function is defined', () => {
      expect(typeof window.loadFavorites).toBe('function');
    });

    test('saveFavorites function is defined', () => {
      expect(typeof window.saveFavorites).toBe('function');
    });

    test('toggleFavorite function is defined', () => {
      expect(typeof window.toggleFavorite).toBe('function');
    });

    test('isFavorite function is defined', () => {
      expect(typeof window.isFavorite).toBe('function');
    });

    test('renderFavorites function is defined', () => {
      expect(typeof window.renderFavorites).toBe('function');
    });

    test('updateFavoriteDescription function is defined', () => {
      expect(typeof window.updateFavoriteDescription).toBe('function');
    });

    test('removeFavorite function is defined', () => {
      expect(typeof window.removeFavorite).toBe('function');
    });
  });

  describe('Favorites localStorage persistence', () => {
    test('loadFavorites returns empty array when no favorites exist', () => {
      const favorites = window.loadFavorites();
      expect(favorites).toEqual([]);
    });

    test('saveFavorites stores data in localStorage', () => {
      const testData = [{ key: '16.7:250', ratio: '16.7', water: 250 }];
      window.saveFavorites(testData);
      const stored = JSON.parse(window.localStorage.getItem('v60_favorites'));
      expect(stored).toEqual(testData);
    });

    test('loadFavorites retrieves stored data', () => {
      const testData = [{ key: '16.7:250', ratio: '16.7', water: 250 }];
      window.localStorage.setItem('v60_favorites', JSON.stringify(testData));
      const favorites = window.loadFavorites();
      expect(favorites).toEqual(testData);
    });

    test('loadFavorites handles corrupted data gracefully', () => {
      window.localStorage.setItem('v60_favorites', 'not-valid-json');
      const favorites = window.loadFavorites();
      expect(favorites).toEqual([]);
    });
  });

  describe('Toggle favorite', () => {
    test('toggling a favorite adds it to the list', () => {
      window.toggleFavorite('16.7', 250, '15.0', '30', '150', '250');
      const favorites = window.loadFavorites();
      expect(favorites.length).toBe(1);
      expect(favorites[0].water).toBe(250);
      expect(favorites[0].ratio).toBe('16.7');
    });

    test('toggling a favorite again removes it', () => {
      window.toggleFavorite('16.7', 250, '15.0', '30', '150', '250');
      window.toggleFavorite('16.7', 250, '15.0', '30', '150', '250');
      const favorites = window.loadFavorites();
      expect(favorites.length).toBe(0);
    });

    test('isFavorite returns true for saved favorites', () => {
      window.toggleFavorite('16.7', 250, '15.0', '30', '150', '250');
      expect(window.isFavorite('16.7', 250)).toBe(true);
    });

    test('isFavorite returns false for non-favorites', () => {
      expect(window.isFavorite('16.7', 250)).toBe(false);
    });

    test('can add multiple favorites', () => {
      window.toggleFavorite('16.7', 250, '15.0', '30', '150', '250');
      window.toggleFavorite('16.7', 300, '18.0', '36', '180', '300');
      const favorites = window.loadFavorites();
      expect(favorites.length).toBe(2);
    });

    test('favorites with different ratios are independent', () => {
      window.toggleFavorite('16.7', 250, '15.0', '30', '150', '250');
      window.toggleFavorite('15.0', 250, '16.7', '33', '150', '250');
      const favorites = window.loadFavorites();
      expect(favorites.length).toBe(2);
    });
  });

  describe('Favorite description', () => {
    test('new favorites have empty description', () => {
      window.toggleFavorite('16.7', 250, '15.0', '30', '150', '250');
      const favorites = window.loadFavorites();
      expect(favorites[0].description).toBe('');
    });

    test('updateFavoriteDescription updates the description', () => {
      window.toggleFavorite('16.7', 250, '15.0', '30', '150', '250');
      window.updateFavoriteDescription('16.7:250', 'My daily brew');
      const favorites = window.loadFavorites();
      expect(favorites[0].description).toBe('My daily brew');
    });

    test('updateFavoriteDescription does nothing for non-existent key', () => {
      window.toggleFavorite('16.7', 250, '15.0', '30', '150', '250');
      window.updateFavoriteDescription('99.9:999', 'Should not exist');
      const favorites = window.loadFavorites();
      expect(favorites.length).toBe(1);
      expect(favorites[0].description).toBe('');
    });
  });

  describe('Remove favorite', () => {
    test('removeFavorite removes a specific favorite', () => {
      window.toggleFavorite('16.7', 250, '15.0', '30', '150', '250');
      window.toggleFavorite('16.7', 300, '18.0', '36', '180', '300');
      window.removeFavorite('16.7:250');
      const favorites = window.loadFavorites();
      expect(favorites.length).toBe(1);
      expect(favorites[0].water).toBe(300);
    });

    test('removeFavorite does nothing for non-existent key', () => {
      window.toggleFavorite('16.7', 250, '15.0', '30', '150', '250');
      window.removeFavorite('99.9:999');
      const favorites = window.loadFavorites();
      expect(favorites.length).toBe(1);
    });
  });

  describe('Favorites rendering', () => {
    test('favorites section is shown when favorites exist', () => {
      window.toggleFavorite('16.7', 250, '15.0', '30', '150', '250');
      const section = doc.getElementById('favoritesSection');
      expect(section.style.display).not.toBe('none');
    });

    test('favorites section is hidden when all favorites are removed', () => {
      window.toggleFavorite('16.7', 250, '15.0', '30', '150', '250');
      window.toggleFavorite('16.7', 250, '15.0', '30', '150', '250');
      const section = doc.getElementById('favoritesSection');
      expect(section.style.display).toBe('none');
    });

    test('favorite card is rendered for each favorite', () => {
      window.toggleFavorite('16.7', 250, '15.0', '30', '150', '250');
      window.toggleFavorite('16.7', 300, '18.0', '36', '180', '300');
      const cards = doc.querySelectorAll('.favorite-card');
      expect(cards.length).toBe(2);
    });

    test('favorite card shows recipe details', () => {
      window.toggleFavorite('16.7', 250, '15.0', '30', '150', '250');
      const card = doc.querySelector('.favorite-card');
      expect(card.textContent).toContain('250g water');
      expect(card.textContent).toContain('15.0g coffee');
      expect(card.textContent).toContain('1:16.7');
    });

    test('favorite card has a remove button', () => {
      window.toggleFavorite('16.7', 250, '15.0', '30', '150', '250');
      const removeBtn = doc.querySelector('.btn-remove-favorite');
      expect(removeBtn).not.toBeNull();
      expect(removeBtn.getAttribute('aria-label')).toBe('Remove favorite');
    });

    test('favorite card has a description area', () => {
      window.toggleFavorite('16.7', 250, '15.0', '30', '150', '250');
      const descText = doc.querySelector('.favorite-description-text');
      expect(descText).not.toBeNull();
    });

    test('favorite card shows saved description', () => {
      window.toggleFavorite('16.7', 250, '15.0', '30', '150', '250');
      window.updateFavoriteDescription('16.7:250', 'Perfect for my glass');
      window.renderFavorites();
      const descText = doc.querySelector('.favorite-description-text');
      expect(descText.textContent).toBe('Perfect for my glass');
    });
  });

  describe('Table favorite button integration', () => {
    test('clicking favorite button toggles favorite state', () => {
      const firstRow = doc.querySelector('#recipeTableBody tr');
      const favBtn = firstRow.querySelector('.btn-favorite');
      expect(favBtn.textContent.trim()).toBe('♡');

      favBtn.click();
      // After toggling, the table regenerates
      const updatedBtn = doc.querySelector('#recipeTableBody tr .btn-favorite');
      expect(updatedBtn.classList.contains('favorited')).toBe(true);
      expect(updatedBtn.textContent.trim()).toBe('♥');
    });

    test('clicking favorite button does not select the recipe row', () => {
      const firstRow = doc.querySelector('#recipeTableBody tr');
      const favBtn = firstRow.querySelector('.btn-favorite');
      favBtn.click();

      const stepsGrid = doc.getElementById('stepsGrid');
      expect(stepsGrid.style.display).toBe('none');
    });

    test('favorite button reflects state after page reload', () => {
      // Simulate adding a favorite
      window.toggleFavorite('16.7', 100, '6.0', '12', '60', '100');
      // Regenerate table (simulates what happens on page load)
      const slider = doc.getElementById('ratioSlider');
      slider.dispatchEvent(new window.Event('input'));

      const firstRow = doc.querySelector('#recipeTableBody tr');
      const favBtn = firstRow.querySelector('.btn-favorite');
      expect(favBtn.classList.contains('favorited')).toBe(true);
      expect(favBtn.textContent.trim()).toBe('♥');
    });
  });
});
