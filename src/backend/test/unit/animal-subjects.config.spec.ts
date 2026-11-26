import {
  animalVariantAssetPath,
  findAnimalMentions,
  inferAnimalVariant,
} from '../../src/modules/learning/animal-subjects.config';

describe('animal subject variants', () => {
  it('recognizes Chinese snail names and keeps the child-facing label', () => {
    expect(findAnimalMentions('蜗牛慢慢爬过叶片')).toEqual([
      { id: 'snail', label: '蜗牛', index: 0 },
    ]);
  });

  it.each([
    ['白玉蜗牛有白白的壳', 'white'],
    ['一只白色蜗牛', 'white'],
    ['花蜗牛有深色条纹', 'striped'],
    ['条纹蜗牛', 'striped'],
    ['蜗牛壳上有深浅不同的彩色条纹', 'striped'],
    ['The shell has colorful bands of brown, yellow and cream stripes.', 'striped'],
    ['蜗牛缩进壳里保护自己', 'retracted'],
    ['a retracted snail inside its shell', 'retracted'],
    ['蜗牛慢慢爬', 'generic'],
  ])('infers %s as %s', (source, expected) => {
    expect(inferAnimalVariant(source, 'snail')).toBe(expected);
  });

  it('does not apply snail variants to other animals', () => {
    expect(inferAnimalVariant('白玉蜗牛', 'rabbit')).toBe('generic');
    expect(animalVariantAssetPath('rabbit', 'white')).toBeNull();
  });

  it('maps every snail variant to a tracked lesson asset', () => {
    expect(animalVariantAssetPath('snail', 'generic')).toBe(
      'assets/lesson/animals/snail-generic.svg',
    );
    expect(animalVariantAssetPath('snail', 'white')).toBe(
      'assets/lesson/animals/snail-white.svg',
    );
    expect(animalVariantAssetPath('snail', 'striped')).toBe(
      'assets/lesson/animals/snail-striped.svg',
    );
    expect(animalVariantAssetPath('snail', 'retracted')).toBe(
      'assets/lesson/animals/snail-retracted.svg',
    );
  });
});
