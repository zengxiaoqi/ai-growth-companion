import { Test, TestingModule } from '@nestjs/testing';
import { BadGatewayException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PublicApiService } from '../../src/modules/public-api/public-api.service';
import { BUNDLED_COUNTRIES } from '../../src/modules/public-api/countries.data';
import { Fruit } from '../../src/database/entities/fruit.entity';

// Mock global fetch
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch as any;

// Mock FruitRepository
const mockFruitRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  count: jest.fn().mockResolvedValue(49),
  delete: jest.fn(),
} as unknown as Repository<Fruit>;

describe('PublicApiService', () => {
  let service: PublicApiService;

  beforeEach(async () => {
    mockFetch.mockReset();
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicApiService,
        { provide: getRepositoryToken(Fruit), useValue: mockFruitRepo },
      ],
    }).compile();

    service = module.get<PublicApiService>(PublicApiService);
  });

  afterEach(() => {
    mockFetch.mockReset();
  });

  // Helper: build a successful fetch Response mock
  const makeOkResponse = (data: any): Response =>
    ({
      ok: true,
      json: async () => data,
    }) as any as Response;

  const makeErrorResponse = (status: number): Response =>
    ({
      ok: false,
      status,
      json: async () => ({ error: 'test' }),
    }) as any as Response;

  describe('proxy — core caching/dedup/fallback logic', () => {
    it('fetches upstream and returns data on cache miss', async () => {
      const payload = { hello: 'world' };
      mockFetch.mockResolvedValueOnce(makeOkResponse(payload));

      const result = await service.proxy<any>({
        url: 'https://example.com/api',
        cacheKey: 'test:1',
        ttlSeconds: 60,
      });

      expect(result).toEqual(payload);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api',
        expect.objectContaining({
          headers: expect.objectContaining({ Accept: 'application/json' }),
        }),
      );
    });

    it('returns cached data on cache hit without calling fetch', async () => {
      const payload = { cached: true };
      mockFetch.mockResolvedValueOnce(makeOkResponse(payload));

      // First call — cache miss, fetch
      await service.proxy<any>({
        url: 'https://example.com/api',
        cacheKey: 'test:2',
        ttlSeconds: 60,
      });
      // Second call — cache hit, no fetch
      const result = await service.proxy<any>({
        url: 'https://example.com/api',
        cacheKey: 'test:2',
        ttlSeconds: 60,
      });

      expect(result).toEqual(payload);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('re-fetches after TTL expiry', async () => {
      const payload1 = { version: 1 };
      const payload2 = { version: 2 };
      mockFetch.mockResolvedValueOnce(makeOkResponse(payload1));

      await service.proxy<any>({
        url: 'https://example.com/api',
        cacheKey: 'test:3',
        ttlSeconds: 0, // 0 second TTL = immediately expired
      });

      mockFetch.mockResolvedValueOnce(makeOkResponse(payload2));
      const result = await service.proxy<any>({
        url: 'https://example.com/api',
        cacheKey: 'test:3',
        ttlSeconds: 0,
      });

      expect(result).toEqual(payload2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('dedupes concurrent identical requests (inflight map)', async () => {
      const payload = { concurrent: true };
      // Single shared fetch promise resolving once
      mockFetch.mockResolvedValueOnce(makeOkResponse(payload));

      const p1 = service.proxy<any>({
        url: 'https://example.com/api',
        cacheKey: 'test:dedup',
        ttlSeconds: 60,
      });
      const p2 = service.proxy<any>({
        url: 'https://example.com/api',
        cacheKey: 'test:dedup',
        ttlSeconds: 60,
      });

      const [r1, r2] = await Promise.all([p1, p2]);

      expect(r1).toEqual(payload);
      expect(r2).toEqual(payload);
      // Should only call fetch once despite two concurrent calls
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('serves stale cache on upstream failure when staleFallback=true', async () => {
      const staleData = { stale: true };
      // First call: success → cached
      mockFetch.mockResolvedValueOnce(makeOkResponse(staleData));
      await service.proxy<any>({
        url: 'https://example.com/api',
        cacheKey: 'test:stale',
        ttlSeconds: 0, // immediately expired for next call
      });

      // Second call: upstream fails, should fall back to stale cache
      mockFetch.mockRejectedValueOnce(new Error('network down'));
      const result = await service.proxy<any>({
        url: 'https://example.com/api',
        cacheKey: 'test:stale',
        ttlSeconds: 0,
        staleFallback: true,
      });

      expect(result).toEqual(staleData);
    });

    it('throws BadGatewayException on upstream failure with no cache', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network down'));

      await expect(
        service.proxy<any>({
          url: 'https://example.com/api',
          cacheKey: 'test:nocache',
          ttlSeconds: 60,
          staleFallback: true,
        }),
      ).rejects.toThrow(BadGatewayException);
    });

    it('throws BadGatewayException when upstream returns non-ok status', async () => {
      mockFetch.mockResolvedValueOnce(makeErrorResponse(500));

      await expect(
        service.proxy<any>({
          url: 'https://example.com/api',
          cacheKey: 'test:500',
          ttlSeconds: 60,
        }),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  describe('endpoint helpers', () => {
    it('getAllCountries returns bundled dataset', async () => {
      const result = await service.getAllCountries();
      expect(result).toBe(BUNDLED_COUNTRIES);
      expect(result.length).toBeGreaterThan(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('getDailyCountry returns a country from the bundled set', async () => {
      const result = await service.getDailyCountry();
      expect(BUNDLED_COUNTRIES).toContain(result);
    });

    it('getDailyCountry is deterministic per day', async () => {
      const r1 = await service.getDailyCountry();
      const r2 = await service.getDailyCountry();
      expect(r1).toEqual(r2);
    });

    it('getNumberFact returns number + fact from upstream', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse({ text: '7 is a lucky number' }));
      const result: any = await service.getNumberFact(7);
      expect(result.number).toBe(7);
      expect(result.fact).toBe('7 is a lucky number');
      expect(result.source).toBe('uselessfacts');
    });

    it('getNumberFact falls back to local pack on upstream failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network'));
      const result: any = await service.getNumberFact(7);
      expect(result.number).toBe(7);
      expect(result.fact).toContain('7');
      expect(result.source).toBe('local');
    });

    it('getNumberFact local fallback has curated fact for 0', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network'));
      const result: any = await service.getNumberFact(0);
      expect(result.number).toBe(0);
      expect(result.fact).toContain('0');
      expect(result.source).toBe('local');
    });

    it('getIssPosition maps upstream fields correctly', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkResponse({
          latitude: 39.9,
          longitude: 116.4,
          altitude: 420,
          velocity: 27600,
          visibility: 'daylight',
          timestamp: 1700000000,
        }),
      );
      const result: any = await service.getIssPosition();
      expect(result.latitude).toBe(39.9);
      expect(result.longitude).toBe(116.4);
      expect(result.altitude_km).toBe(420);
      expect(result.velocity_kmh).toBe(27600);
      expect(result.visibility).toBe('daylight');
      expect(result.timestamp).toBe(1700000000);
    });

    it('getPeopleInSpace normalizes number/people fields', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkResponse({
          people: [{ name: 'Astro 1' }, { name: 'Astro 2' }],
          number: 2,
        }),
      );
      const result: any = await service.getPeopleInSpace();
      expect(result.number).toBe(2);
      expect(result.people.length).toBe(2);
    });

    it('getPeopleInSpace handles num field fallback', async () => {
      mockFetch.mockResolvedValueOnce(
        makeOkResponse({
          people: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
          num: 3,
        }),
      );
      const result: any = await service.getPeopleInSpace();
      expect(result.number).toBe(3);
    });

    it('getWeather calls Open-Meteo with lat/lng', async () => {
      const data = { current: { temperature_2m: 25 } };
      mockFetch.mockResolvedValueOnce(makeOkResponse(data));
      const result = await service.getWeather(39.9, 116.4);
      expect(result).toEqual(data);
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('latitude=39.9');
      expect(calledUrl).toContain('longitude=116.4');
      expect(calledUrl).toContain('open-meteo.com');
    });

    it('getFruits returns from database', async () => {
      const fruits = [{ id: 1, name: 'apple', nameZh: '苹果' }];
      (mockFruitRepo.find as jest.Mock).mockResolvedValueOnce(fruits);
      const result = await service.getFruits();
      expect(result).toEqual(fruits);
      expect(mockFruitRepo.find).toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled(); // from DB, not upstream
    });

    it('getTrivia passes amount and difficulty to opentdb', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse({ results: [] }));
      await service.getTrivia(5, undefined, 'hard');
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('amount=5');
      expect(url).toContain('difficulty=hard');
      expect(url).toContain('opentdb.com');
    });

    it('getTrivia appends category when provided', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse({ results: [] }));
      await service.getTrivia(5, '17', 'easy');
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('category=17');
    });

    it('getDictionaryEntry returns array on success', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse([{ word: 'test' }]));
      const result = await service.getDictionaryEntry('test');
      expect(result).toEqual([{ word: 'test' }]);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('dictionaryapi.dev');
      expect(url).toContain('/test');
    });

    it('getDictionaryEntry returns null on failure (word not found)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('404'));
      const result = await service.getDictionaryEntry('nonexistentword');
      expect(result).toBeNull();
    });

    it('getDictionaryEntry lowercases and trims input', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse([{}]));
      await service.getDictionaryEntry('  TestWord  ');
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/testword');
    });

    it('geocode returns coordinates for known city', async () => {
      const result: any = await service.geocode('北京');
      expect(result).toHaveLength(1);
      expect(result[0].display_name).toBe('北京');
      expect(parseFloat(result[0].lat)).toBeCloseTo(39.9042, 3);
    });

    it('geocode falls back to Beijing for unknown city', async () => {
      const result: any = await service.geocode('不存在的城市');
      expect(result).toHaveLength(1);
      expect(parseFloat(result[0].lat)).toBeCloseTo(39.9042, 3);
    });

    it('geocode matches by English alias', async () => {
      const result: any = await service.geocode('shanghai');
      expect(result[0].display_name).toBe('上海');
    });

    it('getActivity proxies to bored-api mirror', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse({ activity: 'Read' }));
      const result: any = await service.getActivity();
      expect(result.activity).toBe('Read');
      expect(mockFetch.mock.calls[0][0] as string).toContain('bored-api.appbrewery.com');
    });

    it('getActivity with type uses /filter endpoint', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse([{ activity: 'Read' }]));
      await service.getActivity({ type: 'education' });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/filter');
      expect(url).toContain('type=education');
    });

    it('getRandomPoem proxies to poetrydb', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse({ title: 'Test' }));
      const result: any = await service.getRandomPoem();
      expect(result.title).toBe('Test');
      expect(mockFetch.mock.calls[0][0] as string).toContain('poetrydb.org');
    });

    it('getPoemsByAuthor encodes author name', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse([]));
      await service.getPoemsByAuthor('Emily Dickinson');
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('Emily%20Dickinson');
      expect(url).toContain('/author/');
    });

    it('getPoemsByTitle encodes title', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse([]));
      await service.getPoemsByTitle('The Raven');
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('The%20Raven');
      expect(url).toContain('/title/');
    });

    it('translate builds MyMemory url with langpair', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse({ text: '你好' }));
      const result: any = await service.translate('hello');
      expect(result.text).toBe('你好');
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('mymemory.translated.net');
      expect(url).toContain('langpair=en|zh');
      expect(url).toContain('q=hello');
    });

    it('getJoke includes safe-mode in url', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse({ joke: 'funny' }));
      await service.getJoke('Any');
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('safe-mode');
      expect(url).toContain('/joke/Any');
    });

    it('getTodayFact proxies to uselessfacts today endpoint', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse({ text: 'today fact' }));
      const result: any = await service.getTodayFact();
      expect(result.text).toBe('today fact');
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/facts/today');
    });

    it('getRandomFact proxies to uselessfacts random endpoint', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse({ text: 'random fact' }));
      const result: any = await service.getRandomFact();
      expect(result.text).toBe('random fact');
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('/facts/random');
    });

    it('getSunriseSunset passes lat/lng to sunrise-sunset.org', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse({ results: {} }));
      await service.getSunriseSunset(40, 116);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('lat=40');
      expect(url).toContain('lng=116');
      expect(url).toContain('sunrise-sunset.org');
    });

    it('getEarthquakes queries USGS geojson', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse({ features: [] }));
      const result = await service.getEarthquakes();
      expect(result).toEqual({ features: [] });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('earthquake.usgs.gov');
      expect(url).toContain('minmagnitude=2.5');
    });
  });

  describe('getKidFriendlyActivity', () => {
    it('returns first kidFriendly=true activity', async () => {
      mockFetch.mockResolvedValueOnce(makeOkResponse({ activity: 'A', kidFriendly: true }));
      const result: any = await service.getKidFriendlyActivity();
      expect(result.activity).toBe('A');
    });

    it('retries up to 3 times then falls back to any activity', async () => {
      // 3 non-kid-friendly activities
      mockFetch.mockResolvedValueOnce(makeOkResponse({ activity: 'A1', kidFriendly: false }));
      mockFetch.mockResolvedValueOnce(makeOkResponse({ activity: 'A2', kidFriendly: false }));
      mockFetch.mockResolvedValueOnce(makeOkResponse({ activity: 'A3', kidFriendly: false }));
      // fallback
      mockFetch.mockResolvedValueOnce(makeOkResponse({ activity: 'Any' }));
      const result: any = await service.getKidFriendlyActivity();
      expect(result.activity).toBe('Any');
    });

    it('returns null when all fetches fail', async () => {
      mockFetch.mockRejectedValue(new Error('network'));
      const result = await service.getKidFriendlyActivity();
      expect(result).toBeNull();
    });
  });
});
