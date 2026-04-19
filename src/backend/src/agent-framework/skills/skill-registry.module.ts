import { Global, Module } from "@nestjs/common";
import { SkillRegistryService } from "./skill-registry.service";

@Global()
@Module({
  providers: [SkillRegistryService],
  exports: [SkillRegistryService],
})
export class SkillRegistryModule {}
