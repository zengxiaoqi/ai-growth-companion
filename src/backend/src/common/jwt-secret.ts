import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';

/**
 * Placeholder values shipped in .env.example / deployment docs. None of these
 * may ever be used to sign a token in production, even if someone copies an
 * example file verbatim.
 */
const KNOWN_PLACEHOLDERS = new Set([
  'change-me-in-production',
  'lingxi-secret-key',
  'lingxi-secret-key-change-in-production',
  'your-super-secret-key',
  'your-super-secret-key-2026-very-long',
  'my-super-secret-key-2026-very-long',
  'your-super-secret-jwt-key-change-me',
]);

const MIN_SECRET_LENGTH = 32;

/**
 * Shared across JwtModule (signing) and JwtStrategy (verification) so both end
 * up with the exact same key within one process.
 */
let ephemeralSecret: string | undefined;

function readConfig(configService?: ConfigService): { secret?: string; isProduction: boolean } {
  const pick = (key: string): string | undefined =>
    configService?.get<string>(key) ?? process.env[key];

  const raw = pick('JWT_SECRET');
  return {
    secret: typeof raw === 'string' ? raw.trim() : undefined,
    isProduction: pick('NODE_ENV') === 'production',
  };
}

/**
 * Resolve the JWT signing secret.
 *
 * - Production: JWT_SECRET is mandatory, at least 32 chars, and must not be a
 *   documented placeholder. Missing/weak values abort startup (fail-fast)
 *   instead of silently falling back to a public key that anyone can forge.
 * - Development/test: fall back to a per-process random secret. This keeps
 *   local development working without ever embedding a usable key in the
 *   (public) repository. Tokens are invalidated on restart.
 */
export function resolveJwtSecret(configService?: ConfigService): string {
  const { secret, isProduction } = readConfig(configService);
  const isPlaceholder = !!secret && KNOWN_PLACEHOLDERS.has(secret.toLowerCase());

  if (isProduction) {
    if (!secret || isPlaceholder || secret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        'JWT_SECRET is missing or too weak for production. ' +
          'Set it to a random string of at least 32 characters ' +
          '(e.g. `openssl rand -hex 32`). Refusing to start with a default key.',
      );
    }
    return secret;
  }

  if (secret && !isPlaceholder) {
    return secret;
  }

  if (!ephemeralSecret) {
    ephemeralSecret = randomBytes(32).toString('hex');
  }
  return ephemeralSecret;
}
