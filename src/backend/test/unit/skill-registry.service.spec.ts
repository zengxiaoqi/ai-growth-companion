import * as path from 'path';
import { loadSkillsFromDirectory } from '../../src/agent-framework/skills/markdown-skill-loader';
import { SkillExecutor } from '../../src/agent-framework/skills/skill-executor';
import { videoGeneratorDefinition } from '../../src/agent-framework/agents/definitions/video-generator.agent';

describe('Remotion skill registration', () => {
  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads remotion-video-creation from the rules skill directory without enqueue skill override', () => {
    const repoSkillsDir = path.resolve(process.cwd(), '../../skills');
    const definitions = loadSkillsFromDirectory(repoSkillsDir, logger);

    const remotionSkills = definitions.filter(
      (definition) => definition.id === 'remotion-video-creation',
    );
    expect(remotionSkills).toHaveLength(1);

    const remotionSkill = remotionSkills[0];
    expect(path.normalize(remotionSkill.sourceDir || '')).toBe(
      path.normalize(path.join(repoSkillsDir, 'remotion-video-creation')),
    );
    expect(remotionSkill.rules?.map((rule) => rule.name)).toEqual(
      expect.arrayContaining(['assets.md', 'images.md', 'compositions.md']),
    );

    const rendered = new SkillExecutor().renderSkillForPrompt(remotionSkill);
    expect(rendered).toContain('<Img');
    expect(rendered).toContain('staticFile');
    expect(rendered).toContain('Importing assets in Remotion');
  });

  it('keeps video-generator pointed at the Remotion rules skill only', () => {
    expect(videoGeneratorDefinition.allowedSkills).toContain('remotion-video-creation');
    expect(videoGeneratorDefinition.allowedSkills).not.toContain('remotion-video-creation-agent');
  });
});
