import { validateAuthorSource, validateAuthorTaskDir } from '../../src/modules/learning/video/author-contract';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

const VALID_SOURCE = `import React from "react";
import { useCurrentFrame, interpolate, Sequence, Audio, staticFile } from "remotion";
import type { AuthorLessonProps } from "./contract";

export const GeneratedLesson: React.FC<AuthorLessonProps> = (props) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div style={{ opacity }}>
      {props.scenes.map((scene, i) => (
        <Sequence key={scene.id} from={i * scene.durationFrames} durationInFrames={scene.durationFrames}>
          {scene.narrationSrc ? <Audio src={staticFile(scene.narrationSrc)} /> : null}
          <h1>{scene.title}</h1>
        </Sequence>
      ))}
    </div>
  );
};
`;

describe('validateAuthorSource', () => {
  it('accepts a contract-conforming component', () => {
    expect(validateAuthorSource(VALID_SOURCE)).toEqual([]);
  });

  it('requires the fixed GeneratedLesson export', () => {
    const errors = validateAuthorSource(VALID_SOURCE.replace('export const GeneratedLesson', 'const Lesson'));
    expect(errors.some((e) => e.includes('GeneratedLesson'))).toBe(true);
  });

  it('requires the AuthorLessonProps type import from ./contract', () => {
    const errors = validateAuthorSource(
      VALID_SOURCE.replace('import type { AuthorLessonProps } from "./contract";', ''),
    );
    expect(errors.some((e) => e.includes('./contract'))).toBe(true);
  });

  it('requires frame-driven animation', () => {
    const errors = validateAuthorSource(VALID_SOURCE.replace('useCurrentFrame()', '0'));
    expect(errors.some((e) => e.includes('useCurrentFrame'))).toBe(true);
  });

  it.each([
    ['Date.now()', 'const t = Date.now();'],
    ['Math.random()', 'const r = Math.random();'],
    ['setTimeout()', 'setTimeout(() => {}, 100);'],
    ['fetch()', 'fetch("https://example.com");'],
    ['eval()', 'eval("1");'],
    ['require()', 'const fs = require("fs");'],
    ['browser globals', 'const w = window.innerWidth;'],
  ])('rejects %s', (_label, snippet) => {
    const errors = validateAuthorSource(
      VALID_SOURCE.replace('const frame = useCurrentFrame();', `const frame = useCurrentFrame();\n  ${snippet}`),
    );
    expect(errors.some((e) => e.includes('forbidden'))).toBe(true);
  });

  it('does not flag forbidden words inside comments or string literals', () => {
    const source = VALID_SOURCE.replace(
      'const frame = useCurrentFrame();',
      '// window.document 与 localStorage 只是注释里的词\n  const label = "document.title / setTimeout 演示文字";\n  const frame = useCurrentFrame();',
    );
    expect(validateAuthorSource(source)).toEqual([]);
  });

  it('rejects node builtin imports', () => {
    const errors = validateAuthorSource(`import { readFileSync } from "fs";\n${VALID_SOURCE}`);
    expect(errors.some((e) => e.includes('node builtin import'))).toBe(true);
  });

  it('rejects imports outside react / remotion / ./contract', () => {
    const errors = validateAuthorSource(`import { z } from "zod";\n${VALID_SOURCE}`);
    expect(errors.some((e) => e.includes('import not allowed: zod'))).toBe(true);
  });
});

describe('validateAuthorTaskDir', () => {
  it('reports a missing GeneratedLesson.tsx without running tsc', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'author-contract-'));
    try {
      const result = await validateAuthorTaskDir(dir, dir);
      expect(result.ok).toBe(false);
      expect(result.errors).toEqual(['GeneratedLesson.tsx not written yet']);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});