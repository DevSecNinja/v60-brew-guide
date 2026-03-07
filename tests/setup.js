const { TextEncoder, TextDecoder } = require('util');

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Suppress console.debug output during tests to keep output clean
// This prevents verbose debug messages from cluttering test output
console.debug = () => {};
