export type LessonDomain = 'language' | 'math' | 'science' | 'art' | 'social';

export type OutputModuleType = 'writing' | 'drawing' | 'roleplay' | 'experiment';

export interface DomainStepPlan {
  step2: { label: string; icon: string };
  step3: { label: string; icon: string; moduleType: OutputModuleType };
}

export const DOMAIN_STEP_PLAN: Record<LessonDomain, DomainStepPlan> = {
  language: {
    step2: { label: '读', icon: 'book' },
    step3: { label: '写', icon: 'pen', moduleType: 'writing' },
  },
  math: {
    step2: { label: '读', icon: 'book' },
    step3: { label: '写', icon: 'pen', moduleType: 'writing' },
  },
  science: {
    step2: { label: '观察', icon: 'search' },
    step3: { label: '做', icon: 'flask', moduleType: 'experiment' },
  },
  art: {
    step2: { label: '赏', icon: 'palette' },
    step3: { label: '画', icon: 'brush', moduleType: 'drawing' },
  },
  social: {
    step2: { label: '听说', icon: 'chat' },
    step3: { label: '演', icon: 'masks', moduleType: 'roleplay' },
  },
};

export function getDomainStepPlan(domain?: string | null): DomainStepPlan {
  return DOMAIN_STEP_PLAN[domain as LessonDomain] || DOMAIN_STEP_PLAN.language;
}

export function isLessonDomain(value: unknown): value is LessonDomain {
  return typeof value === 'string' && value in DOMAIN_STEP_PLAN;
}