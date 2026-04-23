module.exports = {
  testEnvironment: 'node',
  verbose: true,
  testTimeout: 10_000,
  setupFiles: ['./tests/setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/tests/e2e/'],
};
