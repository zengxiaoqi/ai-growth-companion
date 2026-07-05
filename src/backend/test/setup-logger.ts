/**
 * Test environment logger suppression.
 *
 * Silences NestJS Logger (warn/log/error/debug/verbose) during tests
 * to prevent repetitive WARN lines from polluting test output.
 * Individual tests can still spy on Logger if they need to assert on logs.
 */
import { Logger } from '@nestjs/common';

const noop = () => {};

// Override all NestJS Logger instance and static methods with no-ops
Logger.prototype.log = noop as any;
Logger.prototype.warn = noop as any;
Logger.prototype.error = noop as any;
Logger.prototype.debug = noop as any;
Logger.prototype.verbose = noop as any;

// Also suppress static calls (e.g. Logger.warn('...', 'Context'))
const staticNoop = {
  log: noop,
  warn: noop,
  error: noop,
  debug: noop,
  verbose: noop,
  overrideLogger: Logger.overrideLogger.bind(Logger),
};

Object.assign(Logger, staticNoop);

// Suppress console.warn / console.log noise from third-party libs in tests
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

console.warn = (...args: any[]) => {
  // Allow Node.js deprecation warnings through (useful for debugging)
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (msg.includes('DeprecationWarning')) {
    originalConsoleWarn(...args);
  }
};

console.log = noop;

// Restore after all tests if needed (e.g. for --watch mode)
afterAll?.(() => {
  console.warn = originalConsoleWarn;
  console.log = originalConsoleLog;
});
