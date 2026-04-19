/**
 * MarkdownSkillLoader — loads skills from directory-based Markdown format.
 *
 * Each skill is a directory containing:
 * - SKILL.md (required) — YAML frontmatter + Markdown body
 * - rules/*.md (optional) — supporting rule files
 */

import type { Logger } from "@nestjs/common";
import matter from "gray-matter";
import * as fs from "fs";
import * as path from "path";
import type { SkillDefinition, SkillRule, SkillVariable } from "../core";

type RawFrontmatter = Record<string, any>;

/**
 * Load all skills from a directory containing skill subdirectories.
 * Each subdirectory with a SKILL.md file is loaded as a skill.
 */
export function loadSkillsFromDirectory(
  dirPath: string,
  logger: Logger,
): SkillDefinition[] {
  if (!fs.existsSync(dirPath)) {
    logger.warn(`Skills directory not found: ${dirPath}`);
    return [];
  }

  const skills: SkillDefinition[] = [];

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillDir = path.join(dirPath, entry.name);
    const skillMdPath = path.join(skillDir, "SKILL.md");

    if (!fs.existsSync(skillMdPath)) continue;

    try {
      const definition = loadSkillFromDirectory(skillDir, entry.name);
      if (definition) {
        skills.push(definition);
        logger.log(`Loaded skill from directory: ${entry.name}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to load skill from ${entry.name}: ${message}`);
    }
  }

  return skills;
}

/**
 * Load a single skill from its directory.
 */
function loadSkillFromDirectory(
  skillDir: string,
  dirName: string,
): SkillDefinition | null {
  const skillMdPath = path.join(skillDir, "SKILL.md");
  const raw = fs.readFileSync(skillMdPath, "utf-8");
  const { data: frontmatter, content: body } = matter(raw);

  if (!frontmatter.name && !frontmatter.description) {
    return null;
  }

  const id = frontmatter.id || dirName;

  const triggers = asStringArray(frontmatter.triggers, []);
  const variables = parseVariables(frontmatter.variables);
  const requiredTools = asStringArray(frontmatter.requiredTools, undefined);
  const ageGroups = asStringArray(frontmatter.ageGroups, undefined);
  const chainTo = asOptionalString(frontmatter.chainTo);

  const rules = loadRulesFromDirectory(skillDir);

  return {
    id,
    name: frontmatter.name || id,
    description: frontmatter.description || "",
    triggers,
    body: body.trim() || undefined,
    variables,
    requiredTools,
    chainTo,
    ageGroups: ageGroups as SkillDefinition["ageGroups"],
    rules: rules.length > 0 ? rules : undefined,
  };
}

/**
 * Load all .md files from the rules/ subdirectory of a skill.
 */
function loadRulesFromDirectory(skillDir: string): SkillRule[] {
  const rulesDir = path.join(skillDir, "rules");
  if (!fs.existsSync(rulesDir)) return [];

  const rules: SkillRule[] = [];
  const files = fs.readdirSync(rulesDir).filter((f) => f.endsWith(".md"));

  for (const file of files) {
    const filePath = path.join(rulesDir, file);
    const content = fs.readFileSync(filePath, "utf-8");
    rules.push({ name: file, content: content.trim() });
  }

  return rules;
}

/**
 * Parse a raw variables array from frontmatter into typed SkillVariable[].
 */
function parseVariables(raw: unknown): SkillVariable[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((v: any) => v && typeof v === "object" && v.name)
    .map((v: any) => ({
      name: String(v.name),
      type: (["string", "number", "boolean"].includes(v.type)
        ? v.type
        : "string") as SkillVariable["type"],
      required: v.required !== false,
      defaultValue: v.defaultValue,
      description: String(v.description || ""),
    }));
}

function asStringArray(
  value: unknown,
  fallback: string[] | undefined,
): string[] | undefined {
  if (!Array.isArray(value)) return fallback;
  return value.map((v: any) => String(v)).filter(Boolean);
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
