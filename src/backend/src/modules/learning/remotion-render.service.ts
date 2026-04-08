import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GenerateVideoDataTool, TeachingVideoData } from '../ai/agent/tools/generate-video-data';

export type ResolvedComposition = {
  compositionId: string;
  inputProps: Record<string, any>;
};

@Injectable()
export class RemotionRenderService {
  private readonly logger = new Logger(RemotionRenderService.name);
  private readonly remotionDir = path.resolve(__dirname, '../../../../video-remotion');

  constructor(private readonly generateVideoDataTool: GenerateVideoDataTool) {}

  async resolveComposition(
    topic: string,
    ageGroup?: string,
  ): Promise<ResolvedComposition> {
    if (this.isNumbersTopic(topic)) {
      return { compositionId: 'NumbersVideo', inputProps: {} };
    }

    const videoData = await this.generateVideoDataTool.execute({
      topic,
      ageGroup: ageGroup === '3-4' ? '3-4' : '5-6',
    });

    return { compositionId: 'TopicVideo', inputProps: videoData };
  }

  async renderComposition(
    compositionId: string,
    inputProps: Record<string, any>,
    outputPath: string,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    const propsPath = await this.writePropsFile(inputProps);

    try {
      await this.runRemotionRender(compositionId, outputPath, propsPath, onProgress);
    } finally {
      await this.cleanupFile(propsPath);
    }
  }

  private isNumbersTopic(topic: string): boolean {
    const normalized = topic.trim().toLowerCase();
    return (
      normalized === '认识数字' ||
      normalized === '数字' ||
      normalized === 'numbers' ||
      normalized === '1-10' ||
      /^认识数字\s*[1１]?[-—]?\s*10$/.test(normalized)
    );
  }

  private async writePropsFile(props: Record<string, any>): Promise<string> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'remotion-props-'));
    const propsPath = path.join(tmpDir, 'input-props.json');
    await fs.writeFile(propsPath, JSON.stringify(props), 'utf-8');
    return propsPath;
  }

  private runRemotionRender(
    compositionId: string,
    outputPath: string,
    propsPath: string,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        'remotion',
        'render',
        compositionId,
        outputPath,
        '--codec=h264',
        `--props=${propsPath}`,
      ];

      this.logger.log(`Spawning remotion render: npx ${args.join(' ')}`);

      const proc = spawn('npx', args, {
        cwd: this.remotionDir,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let lastError = '';

      proc.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        const percent = this.parseProgress(text);
        if (percent !== null && onProgress) {
          onProgress(percent);
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        const percent = this.parseProgress(text);
        if (percent !== null && onProgress) {
          onProgress(percent);
        }
        // Capture last error line for diagnostics
        const lines = text.trim().split('\n');
        const lastLine = lines[lines.length - 1]?.trim();
        if (lastLine && !lastLine.startsWith('[') && lastLine.length < 200) {
          lastError = lastLine;
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`remotion spawn failed: ${err.message}`));
      });

      proc.on('close', (code) => {
        if (code === 0) {
          this.logger.log(`Remotion render completed: ${compositionId} → ${outputPath}`);
          resolve();
        } else {
          reject(new Error(`remotion render exited with code ${code}: ${lastError}`));
        }
      });
    });
  }

  private parseProgress(text: string): number | null {
    // Remotion outputs progress like "Rendering... 45%" or "[45%]"
    const match = text.match(/(\d{1,3})\s*%/);
    if (!match) return null;
    const value = parseInt(match[1], 10);
    return value >= 0 && value <= 100 ? value : null;
  }

  private async cleanupFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      const dir = path.dirname(filePath);
      await fs.rmdir(dir);
    } catch {
      // best effort cleanup
    }
  }
}
