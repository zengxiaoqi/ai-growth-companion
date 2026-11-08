import { ConfigService } from '@nestjs/config';
import { SafetyDetector } from '../../src/modules/safety/safety-detector.service';
import {
  DEFAULT_RULES,
  builtinRuleSet,
  parseSafetyRulesYaml,
} from '../../src/modules/safety/safety-rules';

function detectorWith(env: Record<string, string> = {}): SafetyDetector {
  const config = {
    get: (key: string, fallback?: string) => env[key] ?? fallback,
  } as unknown as ConfigService;
  const detector = new SafetyDetector(config);
  detector.onModuleInit();
  return detector;
}

/**
 * The word list is the fast floor of the safety net: local, synchronous,
 * and independent of every model backend. These assertions are ported
 * from 碎碎念's `tests/safety/test_detector.py`.
 */
describe('SafetyDetector', () => {
  it('flags an explicit cry for help', () => {
    const flags = detectorWith().detect('救命！有人在追我');
    expect(flags).toHaveLength(1);
    expect(flags[0].category).toBe('danger');
    expect(flags[0].level).toBe('critical');
    expect(flags[0].source).toBe('rules');
  });

  it('keeps two different terms in one category as separate evidence', () => {
    const flags = detectorWith().detect('救命，着火了');
    expect(flags.map((flag) => flag.category)).toEqual(['danger', 'danger']);
    expect(flags).toHaveLength(2);
  });

  it('does not fire on the classic ASR false positive', () => {
    // 「死」 alone is not a term precisely so that 「想吃」/「想死」-adjacent
    // ASR noise does not interrupt a child mid-sentence.
    expect(detectorWith().detect('我想吃西瓜')).toHaveLength(0);
    expect(detectorWith().detect('这个字念死')).toHaveLength(0);
  });

  it('does not fire on ordinary complaint', () => {
    expect(detectorWith().detect('我不想去上学了')).toHaveLength(0);
    expect(detectorWith().detect('他抢了我的玩具')).toHaveLength(0);
  });

  it('falls back to the built-in table when the rules file is missing (fail-closed)', () => {
    const detector = detectorWith({ SAFETY_RULES_FILE: '/nonexistent/safety_rules.yaml' });
    expect(detector.origin).toBe('builtin');
    expect(detector.detect('救命')).toHaveLength(1);
  });

  it('adds deployer terms on top of the shipped shape', () => {
    const yaml = `
categories:
  danger:
    terms:
      - 救命
      - 有人跟踪我
`;
    const terms = parseSafetyRulesYaml(yaml);
    expect(terms).toContainEqual(['danger', '有人跟踪我']);
  });

  it('keeps the built-in list when the file parses to nothing', () => {
    const rules = builtinRuleSet('empty');
    const total = Object.values(DEFAULT_RULES).flat().length;
    expect(rules.terms).toHaveLength(total);
    expect(rules.origin).toBe('builtin');
  });

  it('never returns a snippet longer than the audit window', () => {
    const text = `${'前'.repeat(50)}救命${'后'.repeat(50)}`;
    const [flag] = detectorWith().detect(text);
    expect(flag.snippet.length).toBeLessThan(text.length);
    expect(flag.snippet).toContain('救命');
  });

  it('is fast enough for the synchronous promise', () => {
    const detector = detectorWith();
    const startedAt = process.hrtime.bigint();
    for (let i = 0; i < 1000; i++) detector.detect('今天我在幼儿园画了一只很大的恐龙');
    const perCallMs = Number(process.hrtime.bigint() - startedAt) / 1e6 / 1000;
    // The contract is "well under a millisecond"; allow a generous ceiling
    // so a loaded CI box does not make this flaky.
    expect(perCallMs).toBeLessThan(5);
  });
});
