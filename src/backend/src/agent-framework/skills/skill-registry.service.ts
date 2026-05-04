import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type {
  ISkill,
  ISkillRegistry,
  SkillDefinition,
  SkillExecutionContext,
} from "../core";
import { loadSkillsFromDirectory } from "./markdown-skill-loader";
import * as path from "path";
import { existsSync } from "fs";

@Injectable()
export class SkillRegistryService implements ISkillRegistry, OnModuleInit {
  private readonly logger = new Logger(SkillRegistryService.name);
  private readonly skills: Map<string, ISkill> = new Map();

  async onModuleInit(): Promise<void> {
    const builtInDir = path.join(__dirname, "definitions");
    const configuredSkillsDir = String(process.env.SKILLS_DIR || "").trim();
    const localSkillsDir = path.join(process.cwd(), "skills");
    const repoSkillsDir = path.resolve(process.cwd(), "..", "..", "skills");
    const externalDir =
      configuredSkillsDir ||
      (existsSync(localSkillsDir) ? localSkillsDir : repoSkillsDir);

    const dirs = [builtInDir];
    if (externalDir !== builtInDir) {
      dirs.push(externalDir);
    }

    await this.loadSkillDirectories(dirs);
  }

  register(skill: ISkill): void {
    const existing = this.skills.get(skill.definition.id);
    if (existing) {
      this.logger.warn(
        `Overwriting skill: ${skill.definition.id} (from=${existing.definition.sourceDir || "unknown"} to=${skill.definition.sourceDir || "unknown"})`,
      );
    }
    this.skills.set(skill.definition.id, skill);
    this.logger.log(
      `Registered skill: ${skill.definition.id} source=${skill.definition.sourceDir || "unknown"}`,
    );
  }

  get(id: string): ISkill | undefined {
    return this.skills.get(id);
  }

  getAll(): ISkill[] {
    return Array.from(this.skills.values());
  }

  findByTrigger(keyword: string): ISkill[] {
    return this.getAll().filter((skill) =>
      skill.definition.triggers.some(
        (trigger) => keyword.includes(trigger) || trigger.includes(keyword),
      ),
    );
  }

  async loadSkillDirectories(dirPaths: string[]): Promise<void> {
    for (const dirPath of dirPaths) {
      const definitions = loadSkillsFromDirectory(dirPath, this.logger);
      for (const definition of definitions) {
        this.register(new MarkdownSkill(definition));
      }
    }
  }

  getSkillsForAgent(allowedSkills?: string[]): ISkill[] {
    if (!allowedSkills || allowedSkills.length === 0) return [];
    return allowedSkills
      .map((id) => this.skills.get(id))
      .filter((s): s is ISkill => s != null);
  }
}

/** ISkill implementation backed by a Markdown definition */
class MarkdownSkill implements ISkill {
  readonly definition: SkillDefinition;
  constructor(definition: SkillDefinition) {
    this.definition = definition;
  }

  async execute(
    variables: Record<string, unknown>,
    context: SkillExecutionContext,
  ): Promise<any> {
    return { definition: this.definition, variables, context };
  }
}
