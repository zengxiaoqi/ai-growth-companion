import { validate } from 'class-validator';
import { QuickVideoGenerateDto } from '../../src/modules/learning/learning.dto';

describe('QuickVideoGenerateDto', () => {
  it('should accept valid minimal input', async () => {
    const dto = new QuickVideoGenerateDto();
    dto.topic = '海洋动物';
    dto.ageGroup = '4-5';

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should accept full input with all optional fields', async () => {
    const dto = new QuickVideoGenerateDto();
    dto.topic = '数字1-10';
    dto.ageGroup = '3-4';
    dto.durationSec = 90;
    dto.style = 'story';
    dto.childId = 2;

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject missing topic', async () => {
    const dto = new QuickVideoGenerateDto();
    dto.ageGroup = '4-5';

    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('topic');
  });

  it('should reject missing ageGroup', async () => {
    const dto = new QuickVideoGenerateDto();
    dto.topic = '海洋动物';

    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('ageGroup');
  });
});