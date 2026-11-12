import {
  LEARNING_DOMAINS,
  LEARNING_DOMAIN_CATALOG,
  DOMAIN_ORDER,
  LEARNING_DOMAIN_SET,
  isLearningDomain,
  domainLabel,
  domainShortLabel,
} from '../../src/common/domain/learning-domains';

describe('learning-domains registry', () => {
  it('pins the canonical member list and order', () => {
    expect([...LEARNING_DOMAINS]).toEqual([
      'language',
      'math',
      'science',
      'art',
      'social',
      'english',
    ]);
  });

  it('DOMAIN_ORDER aliases LEARNING_DOMAINS', () => {
    expect(DOMAIN_ORDER).toEqual(LEARNING_DOMAINS);
  });

  it('catalog is exhaustive over the tuple', () => {
    for (const key of LEARNING_DOMAINS) {
      expect(LEARNING_DOMAIN_CATALOG[key]).toBeDefined();
      expect(typeof LEARNING_DOMAIN_CATALOG[key].label).toBe('string');
      expect(typeof LEARNING_DOMAIN_CATALOG[key].shortLabel).toBe('string');
    }
    expect(Object.keys(LEARNING_DOMAIN_CATALOG)).toHaveLength(
      LEARNING_DOMAINS.length,
    );
  });

  it('isLearningDomain guards members and rejects others', () => {
    expect(isLearningDomain('english')).toBe(true);
    expect(isLearningDomain('music')).toBe(false);
    expect(isLearningDomain('other')).toBe(false);
    expect(isLearningDomain(undefined)).toBe(false);
    expect(isLearningDomain(42)).toBe(false);
  });

  it('LEARNING_DOMAIN_SET matches the tuple', () => {
    expect(LEARNING_DOMAIN_SET.size).toBe(LEARNING_DOMAINS.length);
    expect(LEARNING_DOMAIN_SET.has('english')).toBe(true);
  });

  it('domainLabel returns long labels and falls back to raw key', () => {
    expect(domainLabel('language')).toBe('语言表达');
    expect(domainLabel('english')).toBe('英语能力');
    expect(domainLabel('custom')).toBe('custom');
  });

  it('domainShortLabel returns short labels and falls back to raw key', () => {
    expect(domainShortLabel('social')).toBe('社交');
    expect(domainShortLabel('art')).toBe('艺术');
    expect(domainShortLabel('english')).toBe('英语');
    expect(domainShortLabel('custom')).toBe('custom');
  });
});