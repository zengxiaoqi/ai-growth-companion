import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import * as request from "supertest";

// Simple smoke test to verify API is working
describe("API Smoke Tests", () => {
  let app: INestApplication;
  let server: any;

  beforeAll(async () => {
    // Dynamic import to avoid issues with module loading
    const { AppModule } = await import("../src/app.module");

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("Health Check", () => {
    it("should respond on contents endpoint", async () => {
      const response = await request(server).get("/api/contents").expect(200);

      expect(response.body).toHaveProperty("list");
    });
  });

  describe("Public Endpoints", () => {
    it("GET /api/contents - should return content list", async () => {
      const response = await request(server).get("/api/contents").expect(200);

      expect(Array.isArray(response.body.list)).toBe(true);
    });

    it("GET /api/game/list - should return game list", async () => {
      const response = await request(server).get("/api/game/list").expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it("GET /api/voice/tts - should return tts response", async () => {
      const response = await request(server)
        .get("/api/voice/tts?text=hello")
        .expect(200);

      expect(response.body).toHaveProperty("audioUrl");
    });
  });
});
