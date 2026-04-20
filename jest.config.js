module.exports = {
  testEnvironment: 'node',
  verbose: true,
  setupFiles: ['./tests/setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/tests/e2e/'],
};
