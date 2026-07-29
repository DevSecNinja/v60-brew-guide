const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO_ROOT = path.resolve(__dirname, '../..');
const swPath = path.join(REPO_ROOT, 'sw.js');
const swSource = fs.readFileSync(swPath, 'utf8');

const CACHE_NAME = swSource.match(/const CACHE_NAME = ['"]([^'"]+)['"];/)[1];

class MockResponse {
  constructor(body, options = {}) {
    this.body = body;
    this.status = options.status || 200;
    this.statusText = options.statusText || 'OK';
    this.ok = this.status >= 200 && this.status < 300;
  }

  clone() {
    return new MockResponse(this.body, {
      status: this.status,
      statusText: this.statusText,
    });
  }

  async text() {
    return this.body;
  }
}

function createHeaders(headers = {}) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );

  return {
    get: jest.fn((name) => normalized[String(name).toLowerCase()] || null),
  };
}

function createRequest(url, options = {}) {
  return {
    url,
    method: options.method || 'GET',
    mode: options.mode || 'same-origin',
    destination: options.destination || '',
    headers: createHeaders(options.headers),
  };
}

function cacheKey(requestOrUrl) {
  return typeof requestOrUrl === 'string' ? requestOrUrl : requestOrUrl.url;
}

class FakeCache {
  constructor(name, entries = {}, failingAssets = new Set()) {
    this.name = name;
    this.entries = new Map(Object.entries(entries));
    this.failingAssets = failingAssets;
    this.match = jest.fn(async (request) => this.entries.get(cacheKey(request)));
    this.put = jest.fn(async (request, response) => {
      this.entries.set(cacheKey(request), response);
    });
    this.add = jest.fn(async (asset) => {
      if (this.failingAssets.has(asset)) {
        throw new Error(`Failed to cache ${asset}`);
      }
      this.entries.set(asset, new MockResponse(`pre-cached:${asset}`));
    });
    this.addAll = jest.fn(async (assets) => Promise.all(assets.map((asset) => this.add(asset))));
  }
}

function createServiceWorkerHarness(options = {}) {
  const listeners = {};
  const failingAssets = options.failingAssets || new Set();
  const cacheMap = new Map(
    Object.entries(options.initialCaches || {}).map(([name, entries]) => [
      name,
      new FakeCache(name, entries, failingAssets),
    ])
  );

  const fetchMock = jest.fn(options.fetchImpl || (async () => new MockResponse('network')));
  const self = {
    location: { origin: 'https://example.com' },
    clients: { claim: jest.fn(async () => undefined) },
    skipWaiting: jest.fn(),
    addEventListener: jest.fn((type, handler) => {
      listeners[type] = handler;
    }),
  };

  const caches = {
    open: jest.fn(async (name) => {
      if (!cacheMap.has(name)) {
        cacheMap.set(name, new FakeCache(name, {}, failingAssets));
      }
      return cacheMap.get(name);
    }),
    match: jest.fn(async (request) => {
      for (const cache of cacheMap.values()) {
        const cached = await cache.match(request);
        if (cached) return cached;
      }
      return undefined;
    }),
    keys: jest.fn(async () => Array.from(cacheMap.keys())),
    delete: jest.fn(async (name) => cacheMap.delete(name)),
  };

  const context = {
    self,
    clients: self.clients,
    caches,
    fetch: fetchMock,
    console: { log: jest.fn() },
    URL,
    Response: MockResponse,
  };

  vm.runInNewContext(
    `${swSource}\nself.__SW_TEST_EXPORTS__ = { CACHE_NAME, ASSETS_TO_CACHE };`,
    context,
    { filename: swPath }
  );

  return {
    listeners,
    self,
    caches,
    fetch: fetchMock,
    cacheMap,
    cacheName: self.__SW_TEST_EXPORTS__.CACHE_NAME,
    assetsToCache: self.__SW_TEST_EXPORTS__.ASSETS_TO_CACHE,
    currentCache: () => cacheMap.get(self.__SW_TEST_EXPORTS__.CACHE_NAME),
  };
}

function createFetchEvent(request) {
  let responsePromise;
  return {
    request,
    respondWith: jest.fn((promise) => {
      responsePromise = Promise.resolve(promise);
    }),
    response: () => responsePromise,
  };
}

function createExtendableEvent() {
  const promises = [];
  return {
    waitUntil: jest.fn((promise) => {
      promises.push(Promise.resolve(promise));
    }),
    done: () => Promise.all(promises),
  };
}

async function dispatchFetch(harness, request) {
  const event = createFetchEvent(request);
  harness.listeners.fetch(event);
  expect(event.respondWith).toHaveBeenCalledTimes(1);
  return event.response();
}

describe('service worker cache strategy', () => {
  test('navigation requests are network-first even when a stale cached response exists', async () => {
    const request = createRequest('https://example.com/', {
      mode: 'navigate',
      destination: 'document',
      headers: { accept: 'text/html' },
    });
    const staleCachedResponse = new MockResponse('stale-index');
    const freshNetworkResponse = new MockResponse('fresh-index');
    const harness = createServiceWorkerHarness({
      initialCaches: {
        [CACHE_NAME]: {
          [request.url]: staleCachedResponse,
        },
      },
      fetchImpl: async () => freshNetworkResponse,
    });

    const response = await dispatchFetch(harness, request);

    expect(harness.fetch).toHaveBeenCalledTimes(1);
    expect(harness.fetch).toHaveBeenCalledWith(request);
    expect(response).toBe(freshNetworkResponse);
    await expect(response.text()).resolves.toBe('fresh-index');
    expect(response).not.toBe(staleCachedResponse);
    expect(harness.currentCache().put).toHaveBeenCalledTimes(1);
    expect(harness.currentCache().put.mock.calls[0][0]).toBe(request);
    await expect(harness.currentCache().put.mock.calls[0][1].text()).resolves.toBe('fresh-index');
  });

  test('navigation requests fall back to the exact cached page when offline', async () => {
    const request = createRequest('https://example.com/recipes?from=pwa', {
      mode: 'navigate',
      headers: { accept: 'text/html' },
    });
    const exactCachedResponse = new MockResponse('cached-exact-navigation');
    const harness = createServiceWorkerHarness({
      initialCaches: {
        [CACHE_NAME]: {
          [request.url]: exactCachedResponse,
        },
      },
      fetchImpl: async () => {
        throw new Error('offline');
      },
    });

    const response = await dispatchFetch(harness, request);

    expect(harness.fetch).toHaveBeenCalledTimes(1);
    expect(response).toBe(exactCachedResponse);
    await expect(response.text()).resolves.toBe('cached-exact-navigation');
    expect(harness.currentCache().put).not.toHaveBeenCalled();
  });

  test.each([
    ['./index.html', 'cached-index-fallback'],
    ['./', 'cached-root-fallback'],
  ])('navigation requests fall back to %s when the exact request is not cached', async (fallbackKey, body) => {
    const request = createRequest('https://example.com/deep/link', {
      mode: 'navigate',
      headers: { accept: 'text/html' },
    });
    const harness = createServiceWorkerHarness({
      initialCaches: {
        [CACHE_NAME]: {
          [fallbackKey]: new MockResponse(body),
        },
      },
      fetchImpl: async () => {
        throw new Error('offline');
      },
    });

    const response = await dispatchFetch(harness, request);

    expect(harness.fetch).toHaveBeenCalledTimes(1);
    await expect(response.text()).resolves.toBe(body);
    expect(harness.caches.match).toHaveBeenCalledWith(request);
    expect(harness.caches.match).toHaveBeenCalledWith('./index.html');
    if (fallbackKey === './') {
      expect(harness.caches.match).toHaveBeenCalledWith('./');
    }
    expect(harness.currentCache().put).not.toHaveBeenCalled();
  });

  test('non-200 navigation responses are returned but not written to the cache', async () => {
    const request = createRequest('https://example.com/', {
      mode: 'navigate',
      headers: { accept: 'text/html' },
    });
    const errorResponse = new MockResponse('server-error', {
      status: 500,
      statusText: 'Internal Server Error',
    });
    const harness = createServiceWorkerHarness({
      initialCaches: { [CACHE_NAME]: {} },
      fetchImpl: async () => errorResponse,
    });

    const response = await dispatchFetch(harness, request);

    expect(response).toBe(errorResponse);
    await expect(response.text()).resolves.toBe('server-error');
    expect(harness.currentCache().put).not.toHaveBeenCalled();
  });

  test('network errors do not write navigation fallback responses into the cache', async () => {
    const request = createRequest('https://example.com/', {
      mode: 'navigate',
      headers: { accept: 'text/html' },
    });
    const harness = createServiceWorkerHarness({
      initialCaches: {
        [CACHE_NAME]: {
          './index.html': new MockResponse('offline-index'),
        },
      },
      fetchImpl: async () => {
        throw new Error('offline');
      },
    });

    const response = await dispatchFetch(harness, request);

    await expect(response.text()).resolves.toBe('offline-index');
    expect(harness.currentCache().put).not.toHaveBeenCalled();
  });

  test('same-origin static assets are cache-first and do not hit the network on a cache hit', async () => {
    const request = createRequest('https://example.com/icons/icon-192.png', {
      destination: 'image',
    });
    const cachedIcon = new MockResponse('cached-icon');
    const harness = createServiceWorkerHarness({
      initialCaches: {
        [CACHE_NAME]: {
          [request.url]: cachedIcon,
        },
      },
      fetchImpl: async () => new MockResponse('network-icon'),
    });

    const response = await dispatchFetch(harness, request);

    expect(response).toBe(cachedIcon);
    await expect(response.text()).resolves.toBe('cached-icon');
    expect(harness.fetch).not.toHaveBeenCalled();
    expect(harness.currentCache().put).not.toHaveBeenCalled();
  });

  test('activate deletes old caches and claims clients', async () => {
    const harness = createServiceWorkerHarness({
      initialCaches: {
        'v60-brew-guide-v1.17.0': {},
        [CACHE_NAME]: {},
      },
    });
    const event = createExtendableEvent();

    harness.listeners.activate(event);
    await event.done();

    expect(harness.caches.keys).toHaveBeenCalledTimes(1);
    expect(harness.caches.delete).toHaveBeenCalledTimes(1);
    expect(harness.caches.delete).toHaveBeenCalledWith('v60-brew-guide-v1.17.0');
    expect(harness.cacheMap.has('v60-brew-guide-v1.17.0')).toBe(false);
    expect(harness.cacheMap.has(CACHE_NAME)).toBe(true);
    expect(harness.self.clients.claim).toHaveBeenCalledTimes(1);
  });

  test('install tolerates a failing asset cache add', async () => {
    const failingAsset = './manifest.json';
    const harness = createServiceWorkerHarness({
      failingAssets: new Set([failingAsset]),
    });
    const event = createExtendableEvent();

    harness.listeners.install(event);

    await expect(event.done()).resolves.toBeDefined();
    expect(event.waitUntil).toHaveBeenCalledTimes(1);
    expect(harness.currentCache().add).toHaveBeenCalledTimes(harness.assetsToCache.length);
    expect(harness.currentCache().add).toHaveBeenCalledWith(failingAsset);
  });

  test('SKIP_WAITING messages call skipWaiting', () => {
    const harness = createServiceWorkerHarness();

    harness.listeners.message({ data: { type: 'SKIP_WAITING' } });

    expect(harness.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  test('CACHE_NAME is a bumped semver cache name', () => {
    expect(CACHE_NAME).toMatch(/^v60-brew-guide-v\d+\.\d+\.\d+$/);

    const version = CACHE_NAME.match(/v(\d+)\.(\d+)\.(\d+)$/).slice(1).map(Number);
    const [major, minor, patch] = version;
    expect(version).toHaveLength(3);
    expect(major * 1_000_000 + minor * 1_000 + patch).toBeGreaterThanOrEqual(1_018_000);
  });
});
