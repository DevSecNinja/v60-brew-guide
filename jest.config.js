module.exports = {
  testEnvironment: 'node',
  verbose: true,
  testTimeout: 10_000,
  setupFiles: ['./tests/setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/tests/e2e/'],
  // CI also writes JUnit XML for the Pages test report. Each npm run test:*
  // is a separate Jest run, so every run gets its own file.
  reporters: process.env.CI
    ? [
        'default',
        [
          'jest-junit',
          // reportTestSuiteErrors: a suite that fails to load is reported as a failure.
          { outputDirectory: 'junit', uniqueOutputName: 'true', addFileAttribute: 'true', reportTestSuiteErrors: 'true' },
        ],
      ]
    : ['default'],
};
