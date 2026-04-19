/**
 * Content safety module — provides content filtering as a NestJS service.
 */

import { Global, Module } from "@nestjs/common";
import { ContentSafetyService } from "./content-safety.service";

@Global()
@Module({
  providers: [ContentSafetyService],
  exports: [ContentSafetyService],
})
export class SafetyModule {}
