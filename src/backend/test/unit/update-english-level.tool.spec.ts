import { UpdateEnglishLevelTool } from '../../src/agent-framework/tools/impl/update-english-level';
import type { AbilitiesService } from '../../src/modules/abilities/abilities.service';

function toolWith(updateWithEma: jest.Mock) {
  const abilities = { updateWithEma } as unknown as AbilitiesService;
  return new UpdateEnglishLevelTool(abilities);
}

const ctx = {} as any;

describe('UpdateEnglishLevelTool', () => {
  it('exposes the expected metadata', () => {
    const tool = toolWith(jest.fn());
    expect(tool.metadata.name).toBe('updateEnglishLevel');
    expect(tool.metadata.requiresChildId).toBe(true);
  });

  it('fails when childId is missing', async () => {
    const updateWithEma = jest.fn();
    const result = await toolWith(updateWithEma).execute({ score: 70 } as any, ctx);
    expect(result.success).toBe(false);
    expect(updateWithEma).not.toHaveBeenCalled();
  });

  it('fails when score is not a finite number', async () => {
    const updateWithEma = jest.fn();
    const result = await toolWith(updateWithEma).execute({ childId: 1, score: 'abc' } as any, ctx);
    expect(result.success).toBe(false);
    expect(updateWithEma).not.toHaveBeenCalled();
  });

  it('clamps score into 0-100 and writes the english domain via EMA', async () => {
    const updateWithEma = jest.fn().mockResolvedValue({ score: 100, evidence: { previousScore: null } });
    const result = await toolWith(updateWithEma).execute({ childId: 7, score: 150 }, ctx);

    expect(updateWithEma).toHaveBeenCalledWith(
      7,
      'english',
      100,
      expect.objectContaining({ source: 'english-practice' }),
    );
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ score: 100, englishLevel: 'L3', previousScore: null, changed: true });
  });

  it('clamps negative scores to 0 (L1)', async () => {
    const updateWithEma = jest.fn().mockResolvedValue({ score: 0, evidence: { previousScore: null } });
    const result = await toolWith(updateWithEma).execute({ childId: 7, score: -20 }, ctx);
    expect(updateWithEma).toHaveBeenCalledWith(7, 'english', 0, expect.any(Object));
    expect(result.data).toMatchObject({ score: 0, englishLevel: 'L1' });
  });

  it('reports changed=false when the smoothed score equals the previous', async () => {
    const updateWithEma = jest.fn().mockResolvedValue({ score: 68, evidence: { previousScore: 68 } });
    const result = await toolWith(updateWithEma).execute({ childId: 7, score: 68 }, ctx);
    expect(result.data).toMatchObject({ score: 68, englishLevel: 'L2', previousScore: 68, changed: false });
  });

  it('passes observation evidence through to the service', async () => {
    const updateWithEma = jest.fn().mockResolvedValue({ score: 72, evidence: { previousScore: null } });
    await toolWith(updateWithEma).execute(
      { childId: 7, score: 72, observedWords: ['apple', 'red'], errors: ['article'], suggestion: 'colors' },
      ctx,
    );
    expect(updateWithEma).toHaveBeenCalledWith(
      7,
      'english',
      72,
      expect.objectContaining({ observedWords: ['apple', 'red'], errors: ['article'], suggestion: 'colors' }),
    );
  });

  it('returns a failure result when the service throws', async () => {
    const updateWithEma = jest.fn().mockRejectedValue(new Error('db down'));
    const result = await toolWith(updateWithEma).execute({ childId: 7, score: 72 }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('db down');
  });
});