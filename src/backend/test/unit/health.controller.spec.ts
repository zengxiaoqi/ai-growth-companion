import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '../../src/modules/health/health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should return health status', async () => {
    const result = await controller.check();
    expect(result.status).toBe('ok');
    expect(result.uptime).toBeGreaterThanOrEqual(0);
    expect(result.timestamp).toBeDefined();
    expect(result.node).toBeDefined();
    // The controller reports the host platform; pin it to the real one so
    // this suite passes on Windows and Linux alike.
    expect(result.platform).toBe(process.platform);
    expect(result.memory).toBeDefined();
  });

  it('should return DB health status', async () => {
    const result = await controller.dbCheck();
    expect(result.status).toBe('ok');
    expect(result.message).toBe('Database connection OK');
    expect(result.timestamp).toBeDefined();
  });
});
