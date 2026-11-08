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
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { AppModule } from '../src/app.module';
import { ConversationService } from '../src/agent-framework/conversation/conversation.service';

describe('App bootstrap smoke test', () => {
  let app: INestApplication;
  let tempDbPath: string;

  // Allow extra time for NestJS module compilation + DB connection setup
  jest.setTimeout(30000);

  beforeAll(async () => {
    // Point the app at a throwaway database. Without this the test opens the
    // developer's `lingxi.db` and syncs its schema — a test that rewrites
    // local data is a test nobody dares run.
    tempDbPath = join(tmpdir(), `lingxi-smoke-${process.pid}.db`);
    if (existsSync(tempDbPath)) unlinkSync(tempDbPath);
    process.env.DB_PATH = tempDbPath;

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      try {
        await app.close();
      } catch {
        // Gracefully ignore shutdown errors (e.g., DataSource lifecycle issues)
      }
    }
    delete process.env.DB_PATH;
    if (tempDbPath && existsSync(tempDbPath)) unlinkSync(tempDbPath);
  });

  it('should bootstrap without DI errors', () => {
    expect(app).toBeDefined();
  });

  it('resolves the conversation layer through AiModule', () => {
    // AiModule used to provide its own ConversationManager. It now injects
    // ConversationService from the agent framework, so this fails if the
    // ConversationModule export stops being re-exported by
    // AgentFrameworkModule — a break tsc cannot see.
    expect(app.get(ConversationService)).toBeInstanceOf(ConversationService);
  });
});
