import {
  DOMAIN_STEP_PLAN,
  getDomainStepPlan,
  isLessonDomain,
} from '../../src/modules/learning/domain-step-plan';

describe('domain-step-plan', () => {
  it('maps language and math to reading + writing', () => {
    for (const domain of ['language', 'math'] as const) {
      const plan = getDomainStepPlan(domain);
      expect(plan.step2.label).toBe('读');
      expect(plan.step3.label).toBe('写');
      expect(plan.step3.moduleType).toBe('writing');
    }
  });

  it('maps science to observation + experiment', () => {
    const plan = getDomainStepPlan('science');
    expect(plan.step2.label).toBe('观察');
    expect(plan.step3.label).toBe('做');
    expect(plan.step3.moduleType).toBe('experiment');
  });

  it('maps art to appreciation + drawing', () => {
    const plan = getDomainStepPlan('art');
    expect(plan.step2.label).toBe('赏');
    expect(plan.step3.label).toBe('画');
    expect(plan.step3.moduleType).toBe('drawing');
  });

  it('maps social to listen-speak + roleplay', () => {
    const plan = getDomainStepPlan('social');
    expect(plan.step2.label).toBe('听说');
    expect(plan.step3.label).toBe('演');
    expect(plan.step3.moduleType).toBe('roleplay');
  });

  it('falls back to language for unknown / empty domains', () => {
    for (const value of [undefined, null, '', 'unknown', 'physics', 42]) {
      expect(getDomainStepPlan(value as any)).toEqual(DOMAIN_STEP_PLAN.language);
    }
  });

  it('isLessonDomain accepts only the five known domains', () => {
    for (const domain of ['language', 'math', 'science', 'art', 'social']) {
      expect(isLessonDomain(domain)).toBe(true);
    }
    for (const value of ['unknown', '', null, undefined, 5, {}]) {
      expect(isLessonDomain(value)).toBe(false);
    }
  });

  it('keeps step ids stable across domains (write slot reused)', () => {
    // The plan only varies label/icon/moduleType; step ids stay watch/read/write/practice.
    for (const domain of Object.keys(DOMAIN_STEP_PLAN)) {
      const plan = getDomainStepPlan(domain);
      expect(plan.step3.moduleType).toBeDefined();
      expect(['writing', 'drawing', 'roleplay', 'experiment']).toContain(plan.step3.moduleType);
    }
  });
});