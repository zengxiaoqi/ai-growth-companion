/**
 * Smoke test — verifies NestJS can bootstrap without DI errors.
 *
 * This catches issues that tsc --noEmit cannot:
 * - Interface-typed DI tokens (NestJS needs concrete classes)
 * - Missing module imports / provider registrations
 * - Circular dependency issues
 */

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';

describe('App bootstrap smoke test', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should bootstrap without DI errors', () => {
    expect(app).toBeDefined();
  });
});
