import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PublicApiService } from './public-api.service';

/**
 * Public API proxy endpoints — all under `/api/public/*`.
 *
 * These endpoints aggregate free, no-auth external APIs behind a single
 * backend namespace. Solves CORS, HTTPS-normalisation, caching, and
 * content-safety in one place.
 *
 * NOTE: Intentionally unauthenticated — these are read-only public data
 * feeds. No user-identifying data is forwarded to upstream APIs.
 */
@Controller('public')
export class PublicApiController {
  private readonly logger = new Logger(PublicApiController.name);

  constructor(private readonly publicApi: PublicApiService) {}

  /** GET /api/public/weather?lat=..&lng=.. — Open-Meteo current + daily */
  @Get('weather')
  async weather(@Query('lat') lat: string, @Query('lng') lng: string) {
    const la = parseFloat(lat);
    const ln = parseFloat(lng);
    if (Number.isNaN(la) || Number.isNaN(ln)) {
      throw new BadRequestException('lat and lng must be numbers');
    }
    return this.publicApi.getWeather(la, ln);
  }

  /** GET /api/public/weather/city?city=北京 — geocode + weather in one call */
  @Get('weather/by-city')
  async weatherByCity(@Query('city') city: string) {
    if (!city?.trim()) throw new BadRequestException('city is required');
    const geo = await this.publicApi.geocode(city);
    if (!geo || geo.length === 0) {
      throw new BadRequestException(`未找到城市: ${city}`);
    }
    const { lat, lon } = geo[0];
    const weather = await this.publicApi.getWeather(parseFloat(lat), parseFloat(lon));
    return { city: geo[0].display_name, lat, lng: lon, weather };
  }

  /** GET /api/public/country/daily — "每日一国" */
  @Get('country/daily')
  async dailyCountry() {
    return this.publicApi.getDailyCountry();
  }

  /** GET /api/public/country/all — all countries (for matching game) */
  @Get('country/all')
  async allCountries() {
    return this.publicApi.getAllCountries();
  }

  /** GET /api/public/number/:num — Numbers API math fact */
  @Get('number/:num')
  async numberFact(@Param('num') num: string) {
    const n = parseInt(num, 10);
    if (Number.isNaN(n)) throw new BadRequestException('num must be an integer');
    return this.publicApi.getNumberFact(n);
  }

  /** GET /api/public/iss — ISS current position */
  @Get('iss')
  async iss() {
    return this.publicApi.getIssPosition();
  }

  /** GET /api/public/space-people — people currently in space */
  @Get('space-people')
  async spacePeople() {
    return this.publicApi.getPeopleInSpace();
  }

  /** GET /api/public/sun?lat=..&lng=.. — sunrise/sunset */
  @Get('sun')
  async sun(@Query('lat') lat: string, @Query('lng') lng: string) {
    const la = parseFloat(lat);
    const ln = parseFloat(lng);
    if (Number.isNaN(la) || Number.isNaN(ln)) {
      throw new BadRequestException('lat and lng must be numbers');
    }
    return this.publicApi.getSunriseSunset(la, ln);
  }

  /** GET /api/public/earthquakes — recent quakes (≥2.5) */
  @Get('earthquakes')
  async earthquakes() {
    return this.publicApi.getEarthquakes();
  }

  /** GET /api/public/fruits — all fruits (from DB, auto-seeded) */
  @Get('fruits')
  async fruits() {
    return this.publicApi.getFruits();
  }

  /** POST /api/public/fruits — add a new fruit */
  @Post('fruits')
  async addFruit(@Body() body: any) {
    if (!body?.name?.trim()) throw new BadRequestException('name is required');
    return this.publicApi.addFruit(body);
  }

  /** PUT /api/public/fruits/:id — update a fruit */
  @Put('fruits/:id')
  async updateFruit(@Param('id') id: string, @Body() body: any) {
    return this.publicApi.updateFruit(parseInt(id, 10), body);
  }

  /** DELETE /api/public/fruits/:id — delete a fruit */
  @Delete('fruits/:id')
  async deleteFruit(@Param('id') id: string) {
    return this.publicApi.deleteFruit(parseInt(id, 10));
  }

  /** GET /api/public/trivia?amount=10&difficulty=easy&category=17 — quiz questions */
  @Get('trivia')
  async trivia(
    @Query('amount') amount?: string,
    @Query('difficulty') difficulty = 'easy',
    @Query('category') category?: string,
  ) {
    const a = amount ? Math.min(Math.max(parseInt(amount, 10) || 10, 1), 50) : 10;
    return this.publicApi.getTrivia(a, category, difficulty);
  }

  /** GET /api/public/dictionary/:word — English word entry (null if not found) */
  @Get('dictionary/:word')
  async dictionary(@Param('word') word: string) {
    return this.publicApi.getDictionaryEntry(word);
  }

  /** GET /api/public/geocode?city=北京 — Nominatim geocoding */
  @Get('geocode')
  async geocode(@Query('city') city: string) {
    if (!city?.trim()) throw new BadRequestException('city is required');
    return this.publicApi.geocode(city);
  }

  // ─── B1: Bored API — 亲子活动推荐 ───

  /** GET /api/public/activity — random kid-friendly activity */
  @Get('activity')
  async activity() {
    return this.publicApi.getKidFriendlyActivity();
  }

  /** GET /api/public/activity/filter?type=cooking — filter by type (array) */
  @Get('activity/filter')
  async activityByType(@Query('type') type: string) {
    if (!type?.trim()) throw new BadRequestException('type is required');
    return this.publicApi.getActivity({ type });
  }

  // ─── B2: PoetryDB — 英文经典诗歌 ───

  /** GET /api/public/poem/random — one random poem */
  @Get('poem/random')
  async randomPoem() {
    return this.publicApi.getRandomPoem();
  }

  /** GET /api/public/poem/author?name=Emily%20Dickinson — poems by author */
  @Get('poem/author')
  async poemsByAuthor(@Query('name') name: string) {
    if (!name?.trim()) throw new BadRequestException('name is required');
    return this.publicApi.getPoemsByAuthor(name);
  }

  /** GET /api/public/poem/title?title=Sun — poems matching title */
  @Get('poem/title')
  async poemsByTitle(@Query('title') title: string) {
    if (!title?.trim()) throw new BadRequestException('title is required');
    return this.publicApi.getPoemsByTitle(title);
  }

  // ─── C1: 翻译 ───

  /** GET /api/public/translate?q=Hello&source=en&target=zh */
  @Get('translate')
  async translate(
    @Query('q') q: string,
    @Query('source') source = 'en',
    @Query('target') target = 'zh',
  ) {
    if (!q?.trim()) throw new BadRequestException('q is required');
    return this.publicApi.translate(q, source, target);
  }

  // ─── C3: JokeAPI ───

  /** GET /api/public/joke?category=Any — safe-mode joke */
  @Get('joke')
  async joke(@Query('category') category = 'Any') {
    return this.publicApi.getJoke(category);
  }

  // ─── C4: Useless Facts ───

  /** GET /api/public/fact/today — today's fact */
  @Get('fact/today')
  async factToday() {
    return this.publicApi.getTodayFact();
  }

  /** GET /api/public/fact/random — random fact */
  @Get('fact/random')
  async factRandom() {
    return this.publicApi.getRandomFact();
  }
}
