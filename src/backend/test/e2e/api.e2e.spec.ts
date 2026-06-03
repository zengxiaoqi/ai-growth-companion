import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';

// Increase timeout for e2e tests to avoid SIGKILL from slow CI environments
jest.setTimeout(30000);

// Simple smoke test to verify API is working
describe('API Smoke Tests', () => {
  let app: INestApplication;
  let server: any;
  let moduleFixture: TestingModule;

  beforeAll(async () => {
    // Dynamic import to avoid issues with module loading
    const { AppModule } = await import('../../src/app.module');

    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
    server = app.getHttpServer();
  }, 30000);

  afterAll(async () => {
    // Close server first, then app, then destroy module to release all resources
    if (server && server.close) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
    if (app) {
      await app.close();
    }
    if (moduleFixture) {
      await moduleFixture.close();
    }
  }, 15000);

  describe('Health Check', () => {
    it('should respond on contents endpoint', async () => {
      const response = await request(server).get('/api/contents').expect(200);

      expect(response.body).toHaveProperty('list');
    });
  });

  describe('Public Endpoints', () => {
    it('GET /api/contents - should return content list', async () => {
      const response = await request(server).get('/api/contents').expect(200);

      expect(Array.isArray(response.body.list)).toBe(true);
    });

    it('GET /api/game/list - should return game list', async () => {
      const response = await request(server).get('/api/game/list').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('GET /api/voice/tts - should return tts response', async () => {
      const response = await request(server).get('/api/voice/tts?text=hello').expect(200);

      // Voice API returns binary audio data
      expect(response.type).toBe('audio/mpeg');
      expect(Buffer.isBuffer(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });
  });
});
