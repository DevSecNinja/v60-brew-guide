#!/usr/bin/env node

const { execFileSync } = require('node:child_process');

const CACHE_NAME_PATTERN = /^v60-brew-guide-v(\d+)\.(\d+)\.(\d+)$/;
const HEAD_REF = process.env.SW_VERSION_CHECK_HEAD_REF || 'HEAD';

function runGit(args, options = {}) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', options.quiet ? 'ignore' : 'pipe']
    }).trimEnd();
  } catch (error) {
    if (options.allowFailure) {
      return null;
    }

    throw error;
  }
}

function warn(message) {
  console.warn(`SW version check warning: ${message}`);
}

function success(message) {
  console.log(`SW version check passed: ${message}`);
}

function fail(message) {
  console.error(`SW version check failed:\n${message}`);
  process.exit(1);
}

function isPullRequestContext() {
  return process.env.GITHUB_EVENT_NAME === 'pull_request' || Boolean(process.env.GITHUB_BASE_REF);
}

function skipIfNonPullRequestCi() {
  if (
    !process.env.SW_VERSION_CHECK_BASE_REF &&
    process.env.GITHUB_ACTIONS === 'true' &&
    !isPullRequestContext()
  ) {
    success('not running in a pull request context; skipping.');
    process.exit(0);
  }
}

function isShallowRepository() {
  return runGit(['rev-parse', '--is-shallow-repository'], { allowFailure: true, quiet: true }) === 'true';
}

function fetchBaseBranch(branch) {
  if (!runGit(['remote', 'get-url', 'origin'], { allowFailure: true, quiet: true })) {
    return;
  }

  const refspec = `${branch}:refs/remotes/origin/${branch}`;
  runGit(['fetch', '--no-tags', 'origin', refspec], { allowFailure: true });

  if (isShallowRepository()) {
    runGit(['fetch', '--no-tags', '--deepen=1000', 'origin', branch], { allowFailure: true });
  }
}

function branchNameFromRef(ref) {
  if (ref.startsWith('origin/')) {
    return ref.slice('origin/'.length);
  }

  if (/^[A-Za-z0-9._/-]+$/.test(ref) && !ref.includes('~') && !ref.includes('^')) {
    return ref;
  }

  return null;
}

function refExists(ref) {
  return Boolean(runGit(['rev-parse', '--verify', `${ref}^{commit}`], { allowFailure: true, quiet: true }));
}

function resolveBaseRef() {
  // Local testing override, for example:
  // SW_VERSION_CHECK_BASE_REF=HEAD~1 node scripts/check-sw-version.js
  const override = process.env.SW_VERSION_CHECK_BASE_REF;
  const candidates = [];

  if (override) {
    candidates.push(override);
  } else if (process.env.GITHUB_BASE_REF) {
    candidates.push(`origin/${process.env.GITHUB_BASE_REF}`, process.env.GITHUB_BASE_REF);
  } else {
    candidates.push('origin/main', 'main');
  }

  for (const candidate of candidates) {
    const branch = branchNameFromRef(candidate);
    if (branch) {
      fetchBaseBranch(branch);
    }

    if (refExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

function mergeBase(baseRef) {
  let base = runGit(['merge-base', baseRef, HEAD_REF], { allowFailure: true, quiet: true });

  if (!base && isShallowRepository()) {
    const branch = branchNameFromRef(baseRef);
    if (branch) {
      fetchBaseBranch(branch);
    }

    base = runGit(['merge-base', baseRef, HEAD_REF], { allowFailure: true, quiet: true });
  }

  return base;
}

function changedFilesSince(baseCommit) {
  const output = runGit(
    ['diff', '--name-only', '--diff-filter=ACMRTD', baseCommit, HEAD_REF, '--'],
    { allowFailure: true }
  );

  if (output === null) {
    return null;
  }

  return output.split('\n').filter(Boolean);
}

function gitShow(ref, file) {
  return runGit(['show', `${ref}:${file}`], { allowFailure: true });
}

function extractCacheName(swContent) {
  if (!swContent) {
    return null;
  }

  const match = swContent.match(/\bconst\s+CACHE_NAME\s*=\s*['"]([^'"]+)['"]\s*;/);
  return match ? match[1] : null;
}

function parseCacheVersion(cacheName) {
  const match = cacheName && cacheName.match(CACHE_NAME_PATTERN);
  if (!match) {
    return null;
  }

  return match.slice(1).map((part) => Number(part));
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] > right[index] ? 1 : -1;
    }
  }

  return 0;
}

function extractAssetList(swContent) {
  if (!swContent) {
    return null;
  }

  const match = swContent.match(/\bconst\s+ASSETS_TO_CACHE\s*=\s*\[([\s\S]*?)\]\s*;/);
  if (!match) {
    return null;
  }

  return Array.from(match[1].matchAll(/(['"])((?:\\.|(?!\1)[\s\S])*)\1/g), (assetMatch) => assetMatch[2]);
}

function swAssetListChanged(baseSw, headSw) {
  const baseAssets = extractAssetList(baseSw);
  const headAssets = extractAssetList(headSw);

  if (!baseAssets && !headAssets) {
    return false;
  }

  return JSON.stringify(baseAssets) !== JSON.stringify(headAssets);
}

function isExcluded(file) {
  const normalized = file.replaceAll('\\', '/');
  const basename = normalized.split('/').pop();

  return (
    normalized.startsWith('tests/') ||
    normalized.startsWith('.github/') ||
    normalized.startsWith('scripts/') ||
    normalized.startsWith('.devcontainer/') ||
    normalized.startsWith('.vscode/') ||
    /\.md$/i.test(normalized) ||
    normalized === 'package.json' ||
    normalized === 'package-lock.json' ||
    normalized === 'renovate.json5' ||
    normalized === '.gitignore' ||
    basename === 'jest.config.js' ||
    basename === 'playwright.config.js' ||
    /\.config\.js$/i.test(basename)
  );
}

function isGuardedAsset(file, baseSw, headSw) {
  const normalized = file.replaceAll('\\', '/');

  if (isExcluded(normalized)) {
    return false;
  }

  if (normalized === 'sw.js') {
    return swAssetListChanged(baseSw, headSw);
  }

  if (normalized === 'index.html' || normalized === 'manifest.json') {
    return true;
  }

  if (normalized.startsWith('icons/')) {
    return true;
  }

  return /\.(?:html|css|js)$/i.test(normalized);
}

function formatFileList(files) {
  return files.map((file) => `  - ${file}`).join('\n');
}

function validateCacheNameBump(baseRef, changedAssets) {
  const baseSw = gitShow(baseRef, 'sw.js');
  const headSw = gitShow(HEAD_REF, 'sw.js');
  const baseCacheName = extractCacheName(baseSw);
  const headCacheName = extractCacheName(headSw);

  if (!headCacheName) {
    fail(
      `${formatFileList(changedAssets)}\n\n` +
        'Could not find CACHE_NAME in sw.js at the PR head. ' +
        'Add a CACHE_NAME like v60-brew-guide-vMAJOR.MINOR.PATCH.'
    );
  }

  const headVersion = parseCacheVersion(headCacheName);
  if (!headVersion) {
    fail(
      `${formatFileList(changedAssets)}\n\n` +
        `CACHE_NAME in sw.js is "${headCacheName}", but it must match ` +
        'v60-brew-guide-vMAJOR.MINOR.PATCH.'
    );
  }

  if (!baseCacheName) {
    warn(`could not find CACHE_NAME in sw.js at ${baseRef}; skipping version comparison.`);
    return;
  }

  if (baseCacheName === headCacheName) {
    fail(
      `${formatFileList(changedAssets)}\n\n` +
        `CACHE_NAME is still "${headCacheName}". Bump CACHE_NAME in sw.js ` +
        'when cached/deployed assets change so installed PWAs detect the update.'
    );
  }

  const baseVersion = parseCacheVersion(baseCacheName);
  if (!baseVersion) {
    warn(
      `CACHE_NAME at ${baseRef} is "${baseCacheName}", which does not match the expected format; ` +
        'verified only that the PR head uses a new valid CACHE_NAME.'
    );
    return;
  }

  if (compareVersions(headVersion, baseVersion) <= 0) {
    fail(
      `${formatFileList(changedAssets)}\n\n` +
        `CACHE_NAME changed from "${baseCacheName}" to "${headCacheName}", but the new ` +
        'version must be strictly greater than the base version.'
    );
  }

  success(
    `cached/deployed assets changed and CACHE_NAME was bumped from ${baseCacheName} to ${headCacheName}.`
  );
}

function main() {
  skipIfNonPullRequestCi();

  const baseRef = resolveBaseRef();
  if (!baseRef) {
    warn('could not resolve a base ref; skipping rather than failing for an indeterminate comparison.');
    return;
  }

  const baseCommit = mergeBase(baseRef);
  if (!baseCommit) {
    warn(`could not determine a merge base between ${baseRef} and ${HEAD_REF}; skipping.`);
    return;
  }

  const changedFiles = changedFilesSince(baseCommit);
  if (!changedFiles) {
    warn('could not determine changed files; skipping rather than failing for an indeterminate comparison.');
    return;
  }

  const baseSw = gitShow(baseRef, 'sw.js');
  const headSw = gitShow(HEAD_REF, 'sw.js');
  const guardedAssets = changedFiles.filter((file) => isGuardedAsset(file, baseSw, headSw));

  if (guardedAssets.length === 0) {
    success('no cached/deployed asset changes detected; CACHE_NAME bump is not required.');
    return;
  }

  validateCacheNameBump(baseRef, guardedAssets);
}

main();
