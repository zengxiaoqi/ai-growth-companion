/**
 * RenderRemotionTool — renders video via Remotion CLI.
 *
 * Writes composition props and executes `npx remotion render` to produce video output.
 */

import { Injectable, Logger } from "@nestjs/common";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
import { BaseTool } from "../base-tool";
import { RegisterTool } from "../decorators/register-tool";
import type {
  ToolMetadata,
  ToolResult,
  ToolExecutionContext,
} from "../../core";

type RenderRemotionArgs = {
  compositionId: string;
  props?: Record<string, any>;
  outputDir?: string;
  quality?: "low" | "medium" | "high";
  width?: number;
  height?: number;
};

const RENDER_TIMEOUT = 180_000;

@Injectable()
@RegisterTool()
export class RenderRemotionTool extends BaseTool<RenderRemotionArgs> {
  private readonly logger = new Logger(RenderRemotionTool.name);

  readonly metadata: ToolMetadata = {
    name: "renderRemotion",
    description: "使用 Remotion CLI 渲染视频，需要提供 composition ID 和 props",
    inputSchema: {
      type: "object",
      properties: {
        compositionId: {
          type: "string",
          description: "Remotion composition ID",
        },
        props: {
          type: "object",
          description: "传递给 composition 的 props",
        },
        outputDir: {
          type: "string",
          description: "输出目录（可选，默认为临时目录）",
        },
        quality: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "渲染质量，默认 low",
        },
        width: {
          type: "number",
          description: "视频宽度，默认 1920",
        },
        height: {
          type: "number",
          description: "视频高度，默认 1080",
        },
      },
      required: ["compositionId"],
    },
    concurrencySafe: false,
    readOnly: false,
    requiresChildId: false,
    requiresParentId: false,
    requiresAgeGroup: false,
  };

  async execute(
    args: RenderRemotionArgs,
    _context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const compositionId = this.toText(args?.compositionId);
    if (!compositionId) return this.fail("compositionId is required");

    const props = args?.props || {};
    const width = Math.max(320, Math.min(3840, args?.width || 1920));
    const height = Math.max(240, Math.min(2160, args?.height || 1080));

    const workDir = path.join(os.tmpdir(), `remotion-${Date.now()}`);
    const outputDir = args?.outputDir || path.join(workDir, "output");
    const propsPath = path.join(workDir, "props.json");

    // Find the Remotion project directory
    const remotionRoot = this.findRemotionRoot();
    if (!remotionRoot) {
      return this.fail(
        "Remotion project not found. Expected video-remotion/ directory.",
      );
    }

    try {
      await fs.mkdir(workDir, { recursive: true });
      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(propsPath, JSON.stringify(props, null, 2), "utf-8");

      const outputPath = path.join(outputDir, `${compositionId}.mp4`);

      this.logger.log(`Rendering Remotion: ${compositionId} → ${outputPath}`);

      const result = await this.runRender(
        compositionId,
        propsPath,
        outputPath,
        remotionRoot,
        width,
        height,
      );

      if (result.exitCode !== 0) {
        return this.fail(
          `Remotion render failed (exit ${result.exitCode}): ${result.stderr.slice(0, 500)}`,
        );
      }

      let stat;
      try {
        stat = await fs.stat(outputPath);
      } catch {
        // Try to find any video file in output dir
        const found = await this.findVideoOutput(outputDir);
        if (!found) {
          return this.fail(
            `No video output found. stderr: ${result.stderr.slice(0, 300)}`,
          );
        }
        stat = await fs.stat(found);
      }

      this.logger.log(`Rendered video: ${outputPath} (${stat.size} bytes)`);

      return this.ok({
        videoPath: outputPath,
        fileSize: stat.size,
        width,
        height,
        duration: result.duration,
      });
    } catch (error: unknown) {
      return this.fail(
        `Render failed: ${error instanceof Error ? error.message : "unknown"}`,
      );
    } finally {
      setTimeout(() => {
        fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
      }, 5000);
    }
  }

  private findRemotionRoot(): string | null {
    const candidates = [
      path.join(process.cwd(), "video-remotion"),
      path.join(process.cwd(), "src", "video-remotion"),
      path.join(process.cwd(), "..", "video-remotion"),
    ];
    for (const candidate of candidates) {
      if (require("fs").existsSync(path.join(candidate, "package.json"))) {
        return candidate;
      }
    }
    return null;
  }

  private runRender(
    compositionId: string,
    propsPath: string,
    outputPath: string,
    remotionRoot: string,
    width: number,
    height: number,
  ): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
    duration: number;
  }> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      let stdout = "";
      let stderr = "";

      const proc = spawn(
        "npx",
        [
          "remotion",
          "render",
          compositionId,
          outputPath,
          "--props",
          propsPath,
          "--width",
          String(width),
          "--height",
          String(height),
        ],
        {
          shell: true,
          cwd: remotionRoot,
          env: { ...process.env },
          stdio: ["pipe", "pipe", "pipe"],
        },
      );

      const timer = setTimeout(() => {
        proc.kill("SIGTERM");
        reject(new Error(`Render timed out after ${RENDER_TIMEOUT}ms`));
      }, RENDER_TIMEOUT);

      proc.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
          duration: Date.now() - start,
        });
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  private async findVideoOutput(dir: string): Promise<string | null> {
    try {
      const files = await fs.readdir(dir);
      const videoFile = files.find((f) => /\.(mp4|webm|mov)$/i.test(f));
      return videoFile ? path.join(dir, videoFile) : null;
    } catch {
      return null;
    }
  }

  private toText(value: unknown, fallback = ""): string {
    if (value == null) return fallback;
    return String(value).trim() || fallback;
  }
}
