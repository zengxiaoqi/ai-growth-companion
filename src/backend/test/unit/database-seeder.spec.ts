import { DatabaseSeederService } from '../../src/database/seeds/seeder.service';

describe('DatabaseSeederService', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let userRepository: any;
  let service: DatabaseSeederService;
  let seedUsers: jest.SpyInstance;
  let seedContents: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  const setNodeEnv = (value?: string) => {
    if (value === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = value;
  };

  beforeEach(() => {
    userRepository = {
      count: jest.fn().mockResolvedValue(0),
      save: jest.fn(),
    };
    const contentRepository = { count: jest.fn(), save: jest.fn() };
    service = new DatabaseSeederService(userRepository, contentRepository as any);
    seedUsers = jest.spyOn(service as any, 'seedUsers').mockResolvedValue(undefined);
    seedContents = jest.spyOn(service as any, 'seedContents').mockResolvedValue(undefined);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    setNodeEnv(originalNodeEnv);
    jest.restoreAllMocks();
    logSpy.mockRestore();
  });

  it('never creates the well-known demo accounts in production', async () => {
    setNodeEnv('production');
    await service.seed();

    expect(seedUsers).not.toHaveBeenCalled();
    // Curriculum content is still seeded so a fresh deployment is usable.
    expect(seedContents).toHaveBeenCalledTimes(1);
  });

  it('seeds demo accounts outside production', async () => {
    setNodeEnv('development');
    await service.seed();

    expect(seedUsers).toHaveBeenCalledTimes(1);
    expect(seedContents).toHaveBeenCalledTimes(1);
  });

  it('skips everything when users already exist', async () => {
    setNodeEnv('production');
    userRepository.count.mockResolvedValue(1);
    await service.seed();

    expect(seedUsers).not.toHaveBeenCalled();
    expect(seedContents).not.toHaveBeenCalled();
  });
});
