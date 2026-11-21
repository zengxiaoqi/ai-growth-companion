import { resolveJwtSecret } from '../../src/common/jwt-secret';

describe('resolveJwtSecret', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSecret = process.env.JWT_SECRET;

  const setEnv = (nodeEnv: string, secret?: string) => {
    process.env.NODE_ENV = nodeEnv;
    if (secret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = secret;
    }
  };

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  it('fails fast in production when JWT_SECRET is missing', () => {
    setEnv('production');
    expect(() => resolveJwtSecret()).toThrow(/JWT_SECRET is missing or too weak/);
  });

  it.each([
    'change-me-in-production',
    'lingxi-secret-key',
    'lingxi-secret-key-change-in-production',
    'your-super-secret-key',
    'short-but-set',
  ])('rejects placeholder/short secret %p in production', (secret) => {
    setEnv('production', secret);
    expect(() => resolveJwtSecret()).toThrow(/JWT_SECRET is missing or too weak/);
  });

  it('accepts a strong secret in production', () => {
    const strong = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
    setEnv('production', strong);
    expect(resolveJwtSecret()).toBe(strong);
  });

  it('uses a per-process random secret instead of a hardcoded key in development', () => {
    setEnv('development');
    const first = resolveJwtSecret();
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    // Signing (JwtModule) and verification (JwtStrategy) must share one key.
    expect(resolveJwtSecret()).toBe(first);
    expect(first).not.toContain('lingxi');
  });

  it('honours an explicitly configured secret in development', () => {
    setEnv('development', 'my-local-development-secret');
    expect(resolveJwtSecret()).toBe('my-local-development-secret');
  });
});
