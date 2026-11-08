import type { ConfigService } from '@nestjs/config';

/**
 * Decide whether TypeORM may reconcile the schema from entity metadata.
 *
 * `synchronize: true` is convenient in development but dangerous in
 * production: a renamed column becomes "add new column, drop old column"
 * and the data in the old one is gone; removing an entity definition can
 * drop its table. None of that needs an operator to confirm — it happens
 * on the next restart.
 *
 * Precedence:
 *   1. `DB_SYNCHRONIZE` explicitly boolean → that value wins (escape hatch);
 *      an unparseable value is ignored rather than treated as `true`
 *   2. `NODE_ENV=production`               → false (safe default)
 *   3. otherwise                          → true  (unchanged local behaviour)
 *
 * Step 2 matters because "remember to set an env var" is not a control:
 * the whole point of this switch is that forgetting it cannot destroy
 * production data. All 33 tables (29 pre-existing + 4 new) now have a
 * migration baseline, so `false` works on an empty database as well as
 * one built by `synchronize` before the baseline existed.
 */
export function resolveSynchronize(
  configService: Pick<ConfigService, 'get'>,
): boolean {
  const raw = configService.get<string>('DB_SYNCHRONIZE');
  if (raw != null && String(raw).trim() !== '') {
    const value = String(raw).trim().toLowerCase();
    if (['false', '0', 'no', 'off'].includes(value)) return false;
    if (['true', '1', 'yes', 'on'].includes(value)) return true;
    // An unparseable value is a typo, not a request to auto-sync a
    // production database. Fall through to the environment default.
  }
  return configService.get<string>('NODE_ENV') !== 'production';
}
