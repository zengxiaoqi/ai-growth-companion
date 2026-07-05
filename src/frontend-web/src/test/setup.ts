import '@testing-library/jest-dom';

/**
 * Suppress noisy console.warn / console.log output during tests.
 * Keeps console.error visible so real failures are still debuggable.
 */
const noop = () => {};

const originalWarn = console.warn;
const originalLog = console.log;

console.warn = (...args: any[]) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  // Allow React act() warnings and deprecation notices through
  if (
    msg.includes('DeprecationWarning') ||
    msg.includes('not wrapped in act')
  ) {
    originalWarn(...args);
  }
};

console.log = noop;

afterAll(() => {
  console.warn = originalWarn;
  console.log = originalLog;
});
