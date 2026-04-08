/**
 * Animation template registry.
 * Maps template IDs to definitions. Templates register themselves here on import.
 */
import type { AnimationTemplateDef } from './types';

const templates = new Map<string, AnimationTemplateDef>();

export function registerTemplate(def: AnimationTemplateDef): void {
  templates.set(def.id, def);
}

export function getTemplate(id: string): AnimationTemplateDef | undefined {
  return templates.get(id);
}

export function getAllTemplates(): AnimationTemplateDef[] {
  return Array.from(templates.values());
}

export function getTemplatesByDomain(domain: string): AnimationTemplateDef[] {
  return getAllTemplates().filter((t) => t.domain === domain);
}

export function hasTemplate(id: string): boolean {
  return templates.has(id);
}

/** Validate and apply defaults to scene params based on template definition */
export function validateSceneParams(
  templateId: string,
  rawParams: Record<string, unknown>,
): { valid: boolean; params: Record<string, unknown> } {
  const def = templates.get(templateId);
  if (!def) return { valid: false, params: rawParams };

  const params: Record<string, unknown> = {};
  for (const p of def.params) {
    const value = rawParams[p.name];
    if (value === undefined || value === null) {
      if (p.required) return { valid: false, params: rawParams };
      params[p.name] = p.defaultValue;
    } else {
      params[p.name] = value;
    }
  }
  return { valid: true, params };
}

// ── Import all templates to trigger registration ──
import './templates/language/character-stroke';
import './templates/language/word-reveal';
import './templates/language/story-scene';
import './templates/math/counting-objects';
import './templates/math/shape-builder';
import './templates/math/number-line';
import './templates/math/abacus';
import './templates/science/water-cycle';
import './templates/science/day-night-cycle';
import './templates/science/plant-growth';
import './templates/art/color-mixing';
import './templates/art/drawing-steps';
import './templates/social/emotion-faces';
import './templates/social/daily-routine';
