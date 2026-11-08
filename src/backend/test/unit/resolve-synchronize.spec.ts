import type { ConfigService } from '@nestjs/config';
import { resolveSynchronize } from '../../src/database/resolve-synchronize';

function config(env: Record<string, string | undefined>): Pick<ConfigService, 'get'> {
  return { get: ((key: string) => env[key]) as any };
}

describe('resolveSynchronize', () => {
  it('keeps auto-sync for local development when nothing is configured', () => {
    expect(resolveSynchronize(config({}))).toBe(true);
    expect(resolveSynchronize(config({ NODE_ENV: 'development' }))).toBe(true);
  });

  it('defaults to migrations-owned schema in production', () => {
    expect(resolveSynchronize(config({ NODE_ENV: 'production' }))).toBe(false);
  });

  it('ignores an empty value and falls back to the environment default', () => {
    expect(resolveSynchronize(config({ NODE_ENV: 'production', DB_SYNCHRONIZE: '  ' }))).toBe(false);
    expect(resolveSynchronize(config({ NODE_ENV: 'development', DB_SYNCHRONIZE: '' }))).toBe(true);
  });

  it.each(['false', 'FALSE', ' 0 ', 'no', 'OFF'])(
    'honours an explicit disable (%s)',
    (raw) => {
      expect(resolveSynchronize(config({ DB_SYNCHRONIZE: raw }))).toBe(false);
    },
  );

  it.each(['true', 'TRUE', ' 1 ', 'yes', 'ON'])(
    'honours an explicit enable even in production (%s)',
    (raw) => {
      expect(
        resolveSynchronize(config({ NODE_ENV: 'production', DB_SYNCHRONIZE: raw })),
      ).toBe(true);
    },
  );

  it('does not treat a typo as permission to auto-sync production', () => {
    expect(
      resolveSynchronize(config({ NODE_ENV: 'production', DB_SYNCHRONIZE: 'tru' })),
    ).toBe(false);
    expect(
      resolveSynchronize(config({ NODE_ENV: 'development', DB_SYNCHRONIZE: 'tru' })),
    ).toBe(true);
  });
});
