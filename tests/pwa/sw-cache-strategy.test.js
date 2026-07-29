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
  constructor(name, entries = {}, failingAssets = new Set(), failingPuts = new Set()) {
    this.name = name;
    this.entries = new Map(Object.entries(entries));
    this.failingAssets = failingAssets;
    this.failingPuts = failingPuts;
    this.match = jest.fn(async (request) => this.entries.get(cacheKey(request)));
    this.put = jest.fn(async (request, response) => {
      const key = cacheKey(request);
      if (this.failingPuts.has(key)) {
        throw new Error(`Failed to put ${key}`);
      }
      this.entries.set(key, response);
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
  const failingPuts = options.failingPuts || new Set();
  const cacheMap = new Map(
    Object.entries(options.initialCaches || {}).map(([name, entries]) => [
      name,
      new FakeCache(name, entries, failingAssets, failingPuts),
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
        cacheMap.set(name, new FakeCache(name, {}, failingAssets, failingPuts));
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
    `${swSource}\nself.__SW_TEST_EXPORTS__ = { CACHE_NAME, APP_SHELL_CACHE_KEY, MANDATORY_ASSETS_TO_CACHE, OPTIONAL_ASSETS_TO_CACHE, ASSETS_TO_CACHE };`,
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
    appShellCacheKey: self.__SW_TEST_EXPORTS__.APP_SHELL_CACHE_KEY,
    mandatoryAssetsToCache: self.__SW_TEST_EXPORTS__.MANDATORY_ASSETS_TO_CACHE,
    optionalAssetsToCache: self.__SW_TEST_EXPORTS__.OPTIONAL_ASSETS_TO_CACHE,
    assetsToCache: self.__SW_TEST_EXPORTS__.ASSETS_TO_CACHE,
    currentCache: () => cacheMap.get(self.__SW_TEST_EXPORTS__.CACHE_NAME),
  };
}

function createFetchEvent(request) {
  let responsePromise;
  const waitUntilPromises = [];
  return {
    request,
    respondWith: jest.fn((promise) => {
      responsePromise = Promise.resolve(promise);
    }),
    waitUntil: jest.fn((promise) => {
      waitUntilPromises.push(Promise.resolve(promise));
    }),
    response: () => responsePromise,
    waitUntilDone: () => Promise.all(waitUntilPromises),
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
    expect(harness.currentCache().put.mock.calls[0][0]).toBe(harness.appShellCacheKey);
    await expect(harness.currentCache().put.mock.calls[0][1].text()).resolves.toBe('fresh-index');
  });

  test('failed navigation cache writes still return the network response', async () => {
    const request = createRequest('https://example.com/', {
      mode: 'navigate',
      destination: 'document',
      headers: { accept: 'text/html' },
    });
    const freshNetworkResponse = new MockResponse('fresh-index');
    const harness = createServiceWorkerHarness({
      initialCaches: { [CACHE_NAME]: {} },
      failingPuts: new Set(['./index.html']),
      fetchImpl: async () => freshNetworkResponse,
    });

    const response = await dispatchFetch(harness, request);

    expect(response).toBe(freshNetworkResponse);
    await expect(response.text()).resolves.toBe('fresh-index');
    expect(harness.currentCache().put).toHaveBeenCalledWith(
      harness.appShellCacheKey,
      expect.any(MockResponse)
    );
  });

  test('navigation requests with query strings are cached once and served offline from the app shell', async () => {
    const onlineRequest = createRequest('https://example.com/?ratio=1%3A16&water=250', {
      mode: 'navigate',
      headers: { accept: 'text/html' },
    });
    const offlineRequest = createRequest('https://example.com/?ratio=1%3A17&water=300', {
      mode: 'navigate',
      headers: { accept: 'text/html' },
    });
    const freshNetworkResponse = new MockResponse('fresh-index');
    const harness = createServiceWorkerHarness({
      initialCaches: { [CACHE_NAME]: {} },
      fetchImpl: async () => freshNetworkResponse,
    });

    const onlineResponse = await dispatchFetch(harness, onlineRequest);

    expect(onlineResponse).toBe(freshNetworkResponse);
    expect(harness.currentCache().put).toHaveBeenCalledTimes(1);
    expect(harness.currentCache().put.mock.calls[0][0]).toBe(harness.appShellCacheKey);
    expect(harness.currentCache().entries.has(onlineRequest.url)).toBe(false);
    expect(harness.currentCache().entries.has(harness.appShellCacheKey)).toBe(true);

    harness.fetch.mockRejectedValueOnce(new Error('offline'));

    const offlineResponse = await dispatchFetch(harness, offlineRequest);

    expect(harness.fetch).toHaveBeenCalledTimes(2);
    await expect(offlineResponse.text()).resolves.toBe('fresh-index');
    expect(harness.caches.match).toHaveBeenCalledWith(harness.appShellCacheKey);
    expect(harness.caches.match).not.toHaveBeenCalledWith(offlineRequest);
    expect(harness.currentCache().put).toHaveBeenCalledTimes(1);
  });

  test('navigation requests fall back to the cached app shell when offline', async () => {
    const request = createRequest('https://example.com/deep/link?from=share', {
      mode: 'navigate',
      headers: { accept: 'text/html' },
    });
    const harness = createServiceWorkerHarness({
      initialCaches: {
        [CACHE_NAME]: {
          './index.html': new MockResponse('cached-index-fallback'),
        },
      },
      fetchImpl: async () => {
        throw new Error('offline');
      },
    });

    const response = await dispatchFetch(harness, request);

    expect(harness.fetch).toHaveBeenCalledTimes(1);
    await expect(response.text()).resolves.toBe('cached-index-fallback');
    expect(harness.caches.match).toHaveBeenCalledWith(harness.appShellCacheKey);
    expect(harness.caches.match).not.toHaveBeenCalledWith(request);
    expect(harness.caches.match).not.toHaveBeenCalledWith('./');
    expect(harness.currentCache().put).not.toHaveBeenCalled();
  });

  test('5xx navigation responses fall back to the cached app shell', async () => {
    const request = createRequest('https://example.com/', {
      mode: 'navigate',
      headers: { accept: 'text/html' },
    });
    const errorResponse = new MockResponse('server-error', {
      status: 500,
      statusText: 'Internal Server Error',
    });
    const harness = createServiceWorkerHarness({
      initialCaches: {
        [CACHE_NAME]: {
          './index.html': new MockResponse('offline-index'),
        },
      },
      fetchImpl: async () => errorResponse,
    });

    const response = await dispatchFetch(harness, request);

    expect(response).not.toBe(errorResponse);
    await expect(response.text()).resolves.toBe('offline-index');
    expect(harness.caches.match).toHaveBeenCalledWith(harness.appShellCacheKey);
    expect(harness.currentCache().put).not.toHaveBeenCalled();
  });

  test('404 navigation responses are returned but not written to the cache', async () => {
    const request = createRequest('https://example.com/missing', {
      mode: 'navigate',
      headers: { accept: 'text/html' },
    });
    const notFoundResponse = new MockResponse('not-found', {
      status: 404,
      statusText: 'Not Found',
    });
    const harness = createServiceWorkerHarness({
      initialCaches: {
        [CACHE_NAME]: {
          './index.html': new MockResponse('offline-index'),
        },
      },
      fetchImpl: async () => notFoundResponse,
    });

    const response = await dispatchFetch(harness, request);

    expect(response).toBe(notFoundResponse);
    await expect(response.text()).resolves.toBe('not-found');
    expect(harness.caches.match).not.toHaveBeenCalled();
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

  test('same-origin static assets return cached responses and revalidate in the background', async () => {
    const request = createRequest('https://example.com/icons/icon-192.png', {
      destination: 'image',
    });
    const cachedIcon = new MockResponse('cached-icon');
    const updatedIcon = new MockResponse('updated-icon');
    const harness = createServiceWorkerHarness({
      initialCaches: {
        [CACHE_NAME]: {
          [request.url]: cachedIcon,
        },
      },
      fetchImpl: async () => updatedIcon,
    });
    const event = createFetchEvent(request);

    harness.listeners.fetch(event);
    expect(event.respondWith).toHaveBeenCalledTimes(1);
    const response = await event.response();

    expect(response).toBe(cachedIcon);
    await expect(response.text()).resolves.toBe('cached-icon');
    expect(harness.fetch).toHaveBeenCalledWith(request);
    expect(event.waitUntil).toHaveBeenCalledTimes(1);

    await expect(event.waitUntilDone()).resolves.toBeDefined();

    const cachedResponse = harness.currentCache().entries.get(request.url);
    await expect(cachedResponse.text()).resolves.toBe('updated-icon');
    expect(harness.currentCache().put).toHaveBeenCalledWith(request, expect.any(MockResponse));
  });

  test.each([
    ['network error', async () => { throw new Error('offline'); }],
    ['5xx response', async () => new MockResponse('server-error', { status: 500 })],
  ])('same-origin static asset revalidation failures (%s) do not affect cached responses', async (_name, fetchImpl) => {
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
      fetchImpl,
    });
    const event = createFetchEvent(request);

    harness.listeners.fetch(event);
    expect(event.respondWith).toHaveBeenCalledTimes(1);
    const response = await event.response();

    expect(response).toBe(cachedIcon);
    await expect(response.text()).resolves.toBe('cached-icon');
    expect(harness.fetch).toHaveBeenCalledWith(request);
    await expect(event.waitUntilDone()).resolves.toBeDefined();
    expect(harness.currentCache().entries.get(request.url)).toBe(cachedIcon);
    expect(harness.currentCache().put).not.toHaveBeenCalled();
  });

  test('same-origin static asset cache misses fetch, cache, and return successful responses', async () => {
    const request = createRequest('https://example.com/icons/icon-512.png', {
      destination: 'image',
    });
    const networkIcon = new MockResponse('network-icon');
    const harness = createServiceWorkerHarness({
      initialCaches: { [CACHE_NAME]: {} },
      fetchImpl: async () => networkIcon,
    });
    const event = createFetchEvent(request);

    harness.listeners.fetch(event);
    expect(event.respondWith).toHaveBeenCalledTimes(1);
    const response = await event.response();

    expect(response).toBe(networkIcon);
    await expect(response.text()).resolves.toBe('network-icon');
    expect(harness.fetch).toHaveBeenCalledWith(request);
    expect(event.waitUntil).not.toHaveBeenCalled();
    expect(harness.currentCache().put).toHaveBeenCalledWith(request, expect.any(MockResponse));
    const cachedResponse = harness.currentCache().entries.get(request.url);
    await expect(cachedResponse.text()).resolves.toBe('network-icon');
  });

  test('manifest.json is network-first with a cached fallback', async () => {
    const request = createRequest('https://example.com/manifest.json', {
      destination: 'manifest',
    });
    const cachedManifest = new MockResponse('cached-manifest');
    const freshManifest = new MockResponse('fresh-manifest');
    const harness = createServiceWorkerHarness({
      initialCaches: {
        [CACHE_NAME]: {
          [request.url]: cachedManifest,
        },
      },
      fetchImpl: async () => freshManifest,
    });

    const response = await dispatchFetch(harness, request);

    expect(harness.fetch).toHaveBeenCalledWith(request);
    expect(response).toBe(freshManifest);
    await expect(response.text()).resolves.toBe('fresh-manifest');
    expect(harness.currentCache().put).toHaveBeenCalledWith(request, expect.any(MockResponse));

    harness.fetch.mockRejectedValueOnce(new Error('offline'));

    const fallbackResponse = await dispatchFetch(harness, request);

    await expect(fallbackResponse.text()).resolves.toBe('fresh-manifest');
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

  test('install rejects when the mandatory HTML shell cannot be cached', async () => {
    const failingAsset = './index.html';
    const harness = createServiceWorkerHarness({
      failingAssets: new Set([failingAsset]),
    });
    const event = createExtendableEvent();

    harness.listeners.install(event);

    await expect(event.done()).rejects.toThrow('Failed to cache ./index.html');
    expect(event.waitUntil).toHaveBeenCalledTimes(1);
    expect(harness.mandatoryAssetsToCache).toEqual(['./index.html']);
    expect(harness.currentCache().add).toHaveBeenCalledWith(failingAsset);
  });

  test('install tolerates a failing optional icon cache add', async () => {
    const failingAsset = './icons/icon-192.png';
    const harness = createServiceWorkerHarness({
      failingAssets: new Set([failingAsset]),
    });
    const event = createExtendableEvent();

    harness.listeners.install(event);

    await expect(event.done()).resolves.toBeDefined();
    expect(event.waitUntil).toHaveBeenCalledTimes(1);
    expect(harness.currentCache().add).toHaveBeenCalledTimes(harness.assetsToCache.length);
    expect(harness.mandatoryAssetsToCache).toEqual(['./index.html']);
    expect(harness.optionalAssetsToCache).toContain(failingAsset);
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
