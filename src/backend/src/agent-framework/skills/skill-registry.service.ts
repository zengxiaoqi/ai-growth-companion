import { Injectable, Logger } from '@nestjs/common';
import type { ISkill, ISkillRegistry, SkillDefinition, SkillExecutionContext } from '../core';
import { SkillNotFoundError } from '../core';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SkillRegistryService implements ISkillRegistry {
  private readonly logger = new Logger(SkillRegistryService.name);
  private readonly skills: Map<string, ISkill> = new Map();

  register(skill: ISkill): void {
    this.skills.set(skill.definition.id, skill);
    this.logger.log(`Registered skill: ${skill.definition.id}`);
  }

  get(id: string): ISkill | undefined {
    return this.skills.get(id);
  }

  getAll(): ISkill[] {
    return Array.from(this.skills.values());
  }

  findByTrigger(keyword: string): ISkill[] {
    return this.getAll().filter(skill =>
      skill.definition.triggers.some(trigger =>
        keyword.includes(trigger) || trigger.includes(keyword)
      )
    );
  }

  async loadFromDirectory(dirPath: string): Promise<void> {
    if (!fs.existsSync(dirPath)) {
      this.logger.warn(`Skills directory not found: ${dirPath}`);
      return;
    }

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const filePath = path.join(dirPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const definition: SkillDefinition = JSON.parse(content);
        this.register(new JsonSkill(definition));
        this.logger.log(`Loaded skill from file: ${file}`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to load skill from ${file}: ${message}`);
      }
    }
  }
}

/** Simple ISkill implementation backed by a JSON definition */
class JsonSkill implements ISkill {
  readonly definition: SkillDefinition;
  constructor(definition: SkillDefinition) {
    this.definition = definition;
  }

  async execute(
    variables: Record<string, unknown>,
    context: SkillExecutionContext,
  ): Promise<any> {
    // JSON skills are prompt templates — the actual execution
    // is handled by the SkillExecutor which has LLM access
    return { definition: this.definition, variables, context };
  }
}
