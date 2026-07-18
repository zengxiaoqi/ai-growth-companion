import { Module } from '@nestjs/common';
import { PublicApiService } from './public-api.service';
import { PublicApiController } from './public-api.controller';

/**
 * Public API proxy module.
 *
 * Aggregates free, no-auth external APIs (Open-Meteo, REST Countries,
 * Numbers API, Open Notify ISS, Sunrise/Sunset, USGS Earthquake,
 * Fruityvice, Open Trivia DB, Free Dictionary) behind a single
 * `/api/public/*` namespace.
 *
 * Benefits:
 *  - Solves CORS for APIs that don't send CORS headers
 *  - Normalises HTTP→HTTPS (e.g. numbersapi.com is HTTP-only)
 *  - Server-side response caching (in-memory, TTL per endpoint)
 *  - Central content-safety filter hook
 *  - Stale-cache fallback on upstream failure
 */
@Module({
  providers: [PublicApiService],
  controllers: [PublicApiController],
  exports: [PublicApiService],
})
export class PublicApiModule {}
