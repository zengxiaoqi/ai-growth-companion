import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { spawn, ChildProcess } from "child_process";
import { createHash } from "crypto";
import { promises as fs, existsSync, readdirSync } from "fs";
import * as os from "os";
import * as path from "path";
import {
  GenerateVideoDataTool,
  TeachingVideoData,
} from "../ai/agent/tools/generate-video-data";
import { VoiceService } from "../voice/voice.service";
import { deriveWatchSceneDocument } from "./lesson-scene";
import type { VideoGenerationTask } from "../../database/entities/video-generation-task.entity";
import type { DynamicRemotionManifest } from "./video-generation-agent.service";
import {
  checkStaticFiles,
  checkGeneratedFiles,
  autoFixErrors,
} from "./remotion-ts-validator";

export type ResolvedComposition = {
  compositionId: string;
  inputProps: Record<string, any>;
};

type ResolveCompositionInput = string | Record<string, any>;
type OriginalTeachingSlide = TeachingVideoData["slides"][number];
type TeachingSlide = OriginalTeachingSlide & {
  durationFrames?: number;
  narrationSrc?: string;
  transitionIn?: "fade" | "slide-left" | "slide-right" | "zoom";
};
type TeachingSlideItem = NonNullable<OriginalTeachingSlide["items"]>[number];

type LessonModules = {
  listening?: Record<string, any>;
  reading?: Record<string, any>;
  writing?: Record<string, any>;
  game?: Record<string, any>;
  quiz?: Record<string, any>;
};

type LessonVideoPayload = {
  topic: string;
  title: string;
  summary: string;
  ageGroup?: string;
  watchScene?: Record<string, any> | null;
  visualStory?: Record<string, any>;
  videoLesson?: Record<string, any>;
  modules?: LessonModules;
};

type SlideTheme = {
  emoji?: string;
  layout?: TeachingSlide["layout"];
  bgColor?: string;
  accentColor?: string;
  subtitle?: string;
  items?: TeachingSlideItem[];
};

const _BG_PALETTE = [
  "#FFF5F5",
  "#FFFBEB",
  "#EBF5FF",
  "#E8F8FF",
  "#F8F0FF",
  "#F0FFF4",
  "#FFF0F6",
  "#FFF8F0",
  "#F0F0FF",
  "#FFF0E8",
] as const;

const _ACCENT_PALETTE = [
  "#FF6B6B",
  "#FFD93D",
  "#4D96FF",
  "#00B4D8",
  "#9B59B6",
  "#6BCB77",
  "#FF6B9D",
  "#E67E22",
  "#667EEA",
  "#FF9A76",
] as const;

const EMOJI_PALETTE = ["✨", "📘", "🌟", "🎈", "🧠", "🎨", "🔍", "🎵"] as const;
const ANIMAL_EMOJI_PALETTE = [
  "🐒",
  "🐰",
  "🐻",
  "🐼",
  "🐧",
  "🦁",
  "🐸",
  "🦋",
] as const;
const ANIMAL_ITEM_EMOJI = [
  "🍎",
  "🍌",
  "🌿",
  "🌳",
  "🐾",
  "🥕",
  "🥕",
  "🐟",
] as const;
const SEASON_EMOJI = ["🌸", "☀️", "🍂", "❄️"] as const;
const SEASON_BG = ["#F0FFF4", "#FFF8E1", "#FFF3E0", "#E8F4FF"] as const;
const SEASON_ACCENT = ["#6BCB77", "#F59E0B", "#E67E22", "#4D96FF"] as const;

const DOMAIN_THEMES: Record<
  string,
  {
    introBg: string;
    outroBg: string;
    bgPalette: string[];
    accentPalette: string[];
  }
> = {
  language: {
    introBg: "#667EEA",
    outroBg: "#764BA2",
    bgPalette: ["#FFF5F5", "#FFFBEB", "#F8F0FF", "#FFF0F6", "#FFF8F0"],
    accentPalette: ["#FF6B6B", "#E67E22", "#9B59B6", "#FF6B9D", "#FF9A76"],
  },
  math: {
    introBg: "#4D96FF",
    outroBg: "#6BCB77",
    bgPalette: ["#EBF5FF", "#E8F8FF", "#F0FFF4", "#F8F0FF", "#F0F0FF"],
    accentPalette: ["#4D96FF", "#00B4D8", "#6BCB77", "#9B59B6", "#667EEA"],
  },
  science: {
    introBg: "#00B4D8",
    outroBg: "#6BCB77",
    bgPalette: ["#E8F8FF", "#F0FFF4", "#FFF8E1", "#FFF3E0", "#E8F4FF"],
    accentPalette: ["#00B4D8", "#6BCB77", "#F59E0B", "#E67E22", "#4D96FF"],
  },
  art: {
    introBg: "#FF6B6B",
    outroBg: "#FFD93D",
    bgPalette: ["#FFF0F6", "#FFF5F5", "#FFFBEB", "#F8F0FF", "#FFF0E8"],
    accentPalette: ["#FF6B9D", "#FF6B6B", "#FFD93D", "#9B59B6", "#FF9A76"],
  },
  social: {
    introBg: "#FFD93D",
    outroBg: "#6BCB77",
    bgPalette: ["#FFFBEB", "#F0FFF4", "#FFF8F0", "#FFF5F5", "#F8F0FF"],
    accentPalette: ["#FFD93D", "#6BCB77", "#E67E22", "#FF6B6B", "#9B59B6"],
  },
};

@Injectable()
export class RemotionRenderService implements OnModuleInit {
  private readonly logger = new Logger(RemotionRenderService.name);
  private readonly remotionDir = path.resolve(
    __dirname,
    "../../../../video-remotion",
  );

  /**
   * Hard timeout for Remotion render processes (15 minutes).
   * When Chrome/Chromium hangs, the render process can block indefinitely.
   * This ensures the process is force-killed after the timeout.
   */
  private readonly RENDER_HARD_TIMEOUT_MS = this.toInt(
    process.env.REMOTION_RENDER_TIMEOUT_MS,
    15 * 60 * 1000, // 15 minutes
    60_000,
    60 * 60 * 1000,
  );

  constructor(
    private readonly generateVideoDataTool: GenerateVideoDataTool,
    private readonly voiceService: VoiceService,
  ) {}

  async onModuleInit(): Promise<void> {
    const result = await checkStaticFiles(this.remotionDir);
    if (result.passed) {
      this.logger.log("[onModuleInit] static Remotion TS check passed");
      return;
    }

    this.logger.warn(
      `[onModuleInit] static TS check found ${result.errors.length} errors, attempting auto-fix`,
    );

    const { fixed, unfixed } = await autoFixErrors(
      result.errors,
      this.remotionDir,
    );
    this.logger.log(`[onModuleInit] auto-fixed ${fixed} static TS errors`);

    if (unfixed.length > 0) {
      const recheck = await checkStaticFiles(this.remotionDir);
      if (!recheck.passed) {
        this.logger.warn(
          `[onModuleInit] ${recheck.errors.length} static TS errors remain after auto-fix — rendering may fail`,
        );
      }
    }
  }

  /**
   * Spawn a child process with a hard timeout that escalates from SIGTERM to SIGKILL.
   *
   * Strategy:
   * 1. Start a timeout timer for RENDER_HARD_TIMEOUT_MS
   * 2. On timeout: send SIGTERM for graceful shutdown
   * 3. After 2 seconds: send SIGKILL to force-terminate
   * 4. Log every step for observability
   */
  private spawnWithHardTimeout(
    label: string,
    proc: ChildProcess,
    resolve: () => void,
    reject: (err: Error) => void,
    lastErrorRef: { value: string },
    stderrBuffer?: { value: string },
  ): void {
    let timedOut = false;
    let sigkillTimer: NodeJS.Timeout | null = null;

    const hardTimer = setTimeout(() => {
      timedOut = true;
      this.logger.error(
        `[${label}] ⏰ RENDER TIMEOUT after ${this.RENDER_HARD_TIMEOUT_MS}ms — sending SIGTERM to pid=${proc.pid}`,
      );

      // Step 1: SIGTERM for graceful shutdown
      if (proc.pid && !proc.killed) {
        proc.kill("SIGTERM");
      }

      // Step 2: After 2 seconds, force SIGKILL if still alive
      sigkillTimer = setTimeout(() => {
        if (proc.pid && !proc.killed) {
          this.logger.error(
            `[${label}] 🔫 SIGTERM ineffective, sending SIGKILL to pid=${proc.pid}`,
          );
          proc.kill("SIGKILL");
        }
      }, 2000);
    }, this.RENDER_HARD_TIMEOUT_MS);

    proc.on("close", (code, signal) => {
      clearTimeout(hardTimer);
      if (sigkillTimer) clearTimeout(sigkillTimer);

      if (timedOut) {
        const reason = signal
          ? `killed by signal ${signal} after ${this.RENDER_HARD_TIMEOUT_MS}ms timeout`
          : `exited with code ${code} after ${this.RENDER_HARD_TIMEOUT_MS}ms timeout`;
        this.logger.error(
          `[${label}] Render process terminated by timeout: ${reason}`,
        );
        reject(
          new Error(
            `视频渲染超时（${Math.round(this.RENDER_HARD_TIMEOUT_MS / 60000)} 分钟）。渲染进程已强制终止，请检查 Chrome/Chromium 是否正常运行，或稍后重试。`,
          ),
        );
        return;
      }

      if (code === 0) {
        resolve();
      } else {
        const stderrSnippet = stderrBuffer
          ? `\nstderr: ${stderrBuffer.value.slice(0, 2000)}`
          : "";
        reject(
          new Error(
            `remotion render exited with code ${code}: ${lastErrorRef.value}${stderrSnippet}`,
          ),
        );
      }
    });
  }

  /**
   * Resolve the Chrome/Chromium browser executable path for Remotion rendering.
   *
   * Discovery order:
   * 1. CHROME_PATH environment variable (per-environment override)
   * 2. Puppeteer cached chrome-headless-shell
   * 3. Playwright cached chromium
   * 4. System-installed chromium-browser / google-chrome
   *
   * Returns null if no browser found (Remotion will attempt its own download as fallback).
   */
  private resolveChromePath(): string | null {
    // 1. Explicit environment variable — highest priority
    if (process.env.CHROME_PATH) {
      const p = process.env.CHROME_PATH;
      if (existsSync(p)) {
        this.logger.log(`[resolveChromePath] Using CHROME_PATH: ${p}`);
        return p;
      }
      this.logger.warn(
        `[resolveChromePath] CHROME_PATH set but file not found: ${p}`,
      );
    }

    const home = os.homedir();
    const isWin = process.platform === "win32";
    const isMac = process.platform === "darwin";

    // 2. Puppeteer cache — chrome-headless-shell (lightweight, preferred)
    const puppeteerBase = isWin
      ? path.join(
          process.env.LOCALAPPDATA ?? path.join(home, ".cache"),
          "puppeteer",
          "chrome-headless-shell",
        )
      : path.join(home, ".cache", "puppeteer", "chrome-headless-shell");
    const puppeteerDirs = existsSync(puppeteerBase)
      ? readdirSync(puppeteerBase).sort().reverse()
      : [];
    for (const ver of puppeteerDirs) {
      const platformDir = isWin
        ? "chrome-headless-shell-win64"
        : isMac
          ? "chrome-headless-shell-mac-"
          : "chrome-headless-shell-linux64";
      // Match any platform subdirectory that starts with the expected prefix
      const verDir = path.join(puppeteerBase, ver);
      const entries = existsSync(verDir) ? readdirSync(verDir) : [];
      const match = entries.find(
        (e) => e.startsWith(platformDir) || e.includes("chrome-headless-shell"),
      );
      if (match) {
        const exe = isWin
          ? "chrome-headless-shell.exe"
          : "chrome-headless-shell";
        const candidate = path.join(verDir, match, exe);
        if (existsSync(candidate)) {
          this.logger.log(
            `[resolveChromePath] Found puppeteer chrome-headless-shell: ${candidate}`,
          );
          return candidate;
        }
      }
    }

    // 3. Playwright cache — full Chromium
    const playwrightBase = isWin
      ? path.join(
          process.env.LOCALAPPDATA ?? path.join(home, ".cache"),
          "ms-playwright",
        )
      : isMac
        ? path.join(home, "Library", "Caches", "ms-playwright")
        : path.join(home, ".cache", "ms-playwright");
    const playwrightDirs = existsSync(playwrightBase)
      ? readdirSync(playwrightBase).sort().reverse()
      : [];
    for (const dir of playwrightDirs) {
      const dirPath = path.join(playwrightBase, dir);
      const entries = existsSync(dirPath) ? readdirSync(dirPath) : [];
      const chromeSubdir = entries.find((e) => e.startsWith("chrome-"));
      if (chromeSubdir) {
        const exe = isWin ? "chrome.exe" : "chrome";
        const candidate = path.join(dirPath, chromeSubdir, exe);
        if (existsSync(candidate)) {
          this.logger.log(
            `[resolveChromePath] Found playwright chromium: ${candidate}`,
          );
          return candidate;
        }
      }
    }

    // 4. System-installed browsers
    const systemPaths = isWin
      ? [
          path.join(
            process.env.PROGRAMFILES ?? "C:\\Program Files",
            "Google",
            "Chrome",
            "Application",
            "chrome.exe",
          ),
          path.join(
            process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)",
            "Google",
            "Chrome",
            "Application",
            "chrome.exe",
          ),
          path.join(
            process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"),
            "Google",
            "Chrome",
            "Application",
            "chrome.exe",
          ),
          path.join(
            process.env.PROGRAMFILES ?? "C:\\Program Files",
            "BraveSoftware",
            "Brave-Browser",
            "Application",
            "brave.exe",
          ),
          path.join(
            process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"),
            "Microsoft",
            "Edge",
            "Application",
            "msedge.exe",
          ),
        ]
      : isMac
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
          ]
        : [
            "/usr/bin/chromium-browser",
            "/usr/bin/chromium",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/google-chrome",
            "/snap/bin/chromium",
          ];
    for (const candidate of systemPaths) {
      if (existsSync(candidate)) {
        this.logger.log(
          `[resolveChromePath] Found system browser: ${candidate}`,
        );
        return candidate;
      }
    }

    this.logger.warn(
      "[resolveChromePath] No Chrome/Chromium found. " +
        "Set CHROME_PATH env var or install Chrome/Chromium. " +
        "Remotion will attempt its own download (may be slow or fail).",
    );
    return null;
  }

  async resolveComposition(
    input: ResolveCompositionInput,
    ageGroup?: string,
  ): Promise<ResolvedComposition> {
    const payload = this.normalizePayload(input, ageGroup);

    if (this.hasLessonVideoSource(payload)) {
      const videoData = this.buildVideoDataFromLesson(payload);
      this.logger.log(
        `[resolveComposition] using lesson video source: topic="${payload.topic}", slides=${videoData.slides?.length || 0}, ageGroup=${payload.ageGroup || "unknown"}`,
      );
      const enrichedData = await this.generateNarrationAudioFiles(videoData);
      this.logger.log(
        `[resolveComposition] narration audio generated for ${enrichedData.slides?.filter((s: any) => s.narrationSrc).length || 0}/${enrichedData.slides?.length || 0} slides`,
      );
      return {
        compositionId: "TopicVideo",
        inputProps: enrichedData,
      };
    }

    if (this.isNumbersTopic(payload.topic)) {
      this.logger.log(
        `[resolveComposition] detected numbers topic, using NumbersVideo composition`,
      );
      return { compositionId: "NumbersVideo", inputProps: {} };
    }

    this.logger.log(
      `[resolveComposition] no lesson source, generating video data via AI for topic="${payload.topic}"`,
    );
    const videoData = await this.generateVideoDataTool.execute({
      topic: payload.topic,
      ageGroup: payload.ageGroup === "3-4" ? "3-4" : "5-6",
    });

    return { compositionId: "TopicVideo", inputProps: videoData };
  }

  private normalizePayload(
    input: ResolveCompositionInput,
    ageGroup?: string,
  ): LessonVideoPayload {
    if (typeof input === "string") {
      return {
        topic: this.toText(input, "课程"),
        title: "",
        summary: "",
        ageGroup,
        watchScene: null,
        visualStory: {},
        videoLesson: {},
        modules: {},
      };
    }

    return {
      topic: this.toText(input?.topic, "课程"),
      title: this.toText(input?.title),
      summary: this.toText(input?.summary),
      ageGroup: this.toText(input?.ageGroup || ageGroup) || undefined,
      watchScene:
        input?.watchScene && typeof input.watchScene === "object"
          ? input.watchScene
          : null,
      visualStory:
        input?.visualStory && typeof input.visualStory === "object"
          ? input.visualStory
          : {},
      videoLesson:
        input?.videoLesson && typeof input.videoLesson === "object"
          ? input.videoLesson
          : {},
      modules:
        input?.modules && typeof input.modules === "object"
          ? {
              listening: this.asRecord(input.modules.listening),
              reading: this.asRecord(input.modules.reading),
              writing: this.asRecord(input.modules.writing),
              game: this.asRecord(input.modules.game),
              quiz: this.asRecord(input.modules.quiz),
            }
          : {},
    };
  }

  private hasLessonVideoSource(payload: LessonVideoPayload): boolean {
    return (
      (Array.isArray(payload.watchScene?.scenes) &&
        payload.watchScene.scenes.length > 0) ||
      (Array.isArray(payload.visualStory?.scenes) &&
        payload.visualStory.scenes.length > 0) ||
      (Array.isArray(payload.videoLesson?.shots) &&
        payload.videoLesson.shots.length > 0) ||
      this.hasSupplementSlides(payload.modules)
    );
  }

  private hasSupplementSlides(modules?: LessonModules): boolean {
    if (!modules) return false;
    return [
      modules.listening,
      modules.reading,
      modules.writing,
      modules.game,
      modules.quiz,
    ].some((entry) => entry && Object.keys(entry).length > 0);
  }

  private buildVideoDataFromLesson(
    payload: LessonVideoPayload,
  ): TeachingVideoData {
    const domain = this.inferDomain(payload.topic, payload);
    const theme = DOMAIN_THEMES[domain] || DOMAIN_THEMES.language;

    const watchSlides = this.buildWatchSlides(payload, domain);
    const mergedSlides = this.mergeListeningIntoWatchSlides(
      watchSlides,
      payload.modules?.listening,
    );
    const supportSlides = this.buildSupplementSlides(
      payload.modules || {},
      mergedSlides.length,
    );

    // Dynamic allocation: watch content 60%, supplement 40%
    const MAX_SLIDES = 16;
    const watchBudget = Math.max(3, Math.floor(MAX_SLIDES * 0.6));
    const supportBudget = MAX_SLIDES - watchBudget;

    const selectedSupport = supportSlides.slice(0, supportBudget);
    // Return unused support quota to watch slides
    const unused = supportBudget - selectedSupport.length;
    const selectedWatch = mergedSlides.slice(0, watchBudget + unused);

    const slides = [...selectedWatch, ...selectedSupport];

    return {
      title: this.toText(
        payload.videoLesson?.title,
        this.toText(payload.title, `认识${payload.topic}`),
      ),
      subtitle: this.toText(
        payload.summary,
        payload.ageGroup
          ? `${payload.ageGroup}岁启蒙课程`
          : `${slides.length || 1}个知识点动画课`,
      ),
      introBg: theme.introBg,
      outroBg: theme.outroBg,
      slides:
        slides.length > 0
          ? slides
          : [this.buildFallbackSlide(payload.topic, domain)],
    };
  }

  private buildWatchSlides(
    payload: LessonVideoPayload,
    domain: string,
  ): TeachingSlide[] {
    const sceneDoc =
      Array.isArray(payload.watchScene?.scenes) &&
      payload.watchScene.scenes.length > 0
        ? payload.watchScene
        : deriveWatchSceneDocument(
            {
              visualStory: payload.visualStory || {},
              videoLesson: payload.videoLesson || {},
            },
            payload.topic,
            domain,
          );

    return (Array.isArray(sceneDoc?.scenes) ? sceneDoc.scenes : [])
      .slice(0, 16)
      .map((scene: Record<string, any>, index: number) =>
        this.buildSlideFromScene(scene, index, domain),
      );
  }

  private mergeListeningIntoWatchSlides(
    watchSlides: TeachingSlide[],
    listening: Record<string, any> | undefined,
  ): TeachingSlide[] {
    if (!listening || Object.keys(listening).length === 0) return watchSlides;
    if (watchSlides.length === 0) return watchSlides;

    const script = Array.isArray(listening.audioScript)
      ? listening.audioScript
      : [];
    if (script.length === 0) return watchSlides;

    return watchSlides.map((slide, index) => {
      const segment = script[index % script.length];
      const segmentNarration = this.toText(segment?.narration);
      if (!segmentNarration) return slide;

      // Join at sentence boundary instead of raw space concatenation
      const mergedNarration = slide.narration
        ? `${slide.narration.replace(/[。！？，]$/, "")}。${segmentNarration}`
        : segmentNarration;

      return {
        ...slide,
        narration: this.truncateAtSentenceEnd(mergedNarration, 300),
      };
    });
  }

  private buildSupplementSlides(
    modules: LessonModules,
    startIndex: number,
  ): TeachingSlide[] {
    const slides: TeachingSlide[] = [];

    // Listening content is merged into watch slides, skip separate listening slide
    const readingSlide = this.buildReadingSlide(
      modules.reading,
      startIndex + slides.length,
    );
    if (readingSlide) slides.push(readingSlide);

    const writingSlide = this.buildWritingSlide(
      modules.writing,
      startIndex + slides.length,
    );
    if (writingSlide) slides.push(writingSlide);

    const practiceSlide = this.buildPracticeSlide(
      modules.game,
      startIndex + slides.length,
    );
    if (practiceSlide) slides.push(practiceSlide);

    const assessSlide = this.buildAssessSlide(
      modules.quiz,
      startIndex + slides.length,
    );
    if (assessSlide) slides.push(assessSlide);

    return slides;
  }

  private buildListeningSlide(
    listening: Record<string, any> | undefined,
    _index: number,
  ): TeachingSlide | null {
    if (!listening || Object.keys(listening).length === 0) return null;
    const script = Array.isArray(listening.audioScript)
      ? listening.audioScript
      : [];
    const questions = Array.isArray(listening.questions)
      ? listening.questions
      : [];
    const items = this.createItems(
      [
        ...script.map((entry: any) =>
          this.toText(entry?.segment || entry?.narration),
        ),
        ...questions.map((entry: any) => this.toText(entry)),
      ]
        .filter(Boolean)
        .slice(0, 8),
      ["🎧", "🎵", "🗣️", "👂"],
    );

    return {
      title: this.toText(listening.goal, "听一听").slice(0, 24),
      emoji: "🎧",
      subtitle:
        this.toText(script[0]?.narration, "听老师讲一讲").slice(0, 60) ||
        undefined,
      bgColor: "#FFF8F0",
      accentColor: "#E67E22",
      layout: items.length >= 3 ? "grid" : items.length > 0 ? "list" : "hero",
      items: items.length > 0 ? items : undefined,
      narration: this.truncateAtSentenceEnd(
        this.toText(script[0]?.narration, "先竖起小耳朵，跟着老师认真听一听。"),
        300,
      ),
    };
  }

  private buildReadingSlide(
    reading: Record<string, any> | undefined,
    _index: number,
  ): TeachingSlide | null {
    if (!reading || Object.keys(reading).length === 0) return null;
    const keywords = Array.isArray(reading.keywords) ? reading.keywords : [];
    const questions = Array.isArray(reading.questions) ? reading.questions : [];
    const items = this.createItems(
      [
        ...keywords.map((entry: any) => this.toText(entry)),
        ...questions.map((entry: any) => this.toText(entry)),
      ]
        .filter(Boolean)
        .slice(0, 8),
      ["📚", "🔤", "📝", "💡"],
    );

    // Build narration from actual content, not a generic template
    const keywordsIntro =
      keywords.length > 0
        ? `重点词语有：${keywords
            .slice(0, 8)
            .map((k: any) => this.toText(k))
            .join("、")}。`
        : "";
    const narration = this.toText(
      reading.text,
      keywordsIntro || "我们一起读一读，把重点内容记下来。",
    );

    return {
      title: this.toText(reading.goal, "读一读").slice(0, 24),
      emoji: "📚",
      subtitle:
        this.toText(reading.text, "一起读一读重点内容").slice(0, 60) ||
        undefined,
      bgColor: "#F8F0FF",
      accentColor: "#9B59B6",
      layout: items.length >= 3 ? "grid" : items.length > 0 ? "list" : "hero",
      items: items.length > 0 ? items : undefined,
      narration: this.truncateAtSentenceEnd(narration, 300),
    };
  }

  private buildWritingSlide(
    writing: Record<string, any> | undefined,
    _index: number,
  ): TeachingSlide | null {
    if (!writing || Object.keys(writing).length === 0) return null;
    const tracingItems = Array.isArray(writing.tracingItems)
      ? writing.tracingItems
      : [];
    const practiceTasks = Array.isArray(writing.practiceTasks)
      ? writing.practiceTasks
      : [];
    const firstTarget = this.toText(tracingItems[0]);
    const items = this.createItems(
      [
        ...tracingItems.map((entry: any) => this.toText(entry)),
        ...practiceTasks.map((entry: any) => this.toText(entry)),
      ]
        .filter(Boolean)
        .slice(0, 8),
      ["✍️", "📝", "📏", "⭐"],
    );

    return {
      title: this.toText(
        writing.goal,
        firstTarget ? `写一写 ${firstTarget}` : "写一写",
      ).slice(0, 24),
      emoji: "✍️",
      subtitle: firstTarget
        ? `描红练习：${firstTarget}`.slice(0, 60)
        : "跟着提示动笔练习",
      bgColor: "#EBF5FF",
      accentColor: "#4D96FF",
      layout: items.length >= 3 ? "grid" : items.length > 0 ? "list" : "hero",
      items: items.length > 0 ? items : undefined,
      narration: this.truncateAtSentenceEnd(
        this.toText(
          practiceTasks[0],
          firstTarget
            ? `我们来描一描${firstTarget}。`
            : "拿起笔，跟着老师一起写一写。",
        ),
        300,
      ),
    };
  }

  private buildPracticeSlide(
    game: Record<string, any> | undefined,
    _index: number,
  ): TeachingSlide | null {
    if (!game || Object.keys(game).length === 0) return null;
    const activityData = this.asRecord(game.activityData);
    const questionCount = Array.isArray(activityData.questions)
      ? activityData.questions.length
      : 0;
    const pairCount = Array.isArray(activityData.pairs)
      ? activityData.pairs.length
      : 0;
    const items = this.createItems(
      [
        this.toText(game.activityType),
        questionCount > 0 ? `${questionCount}道题` : "",
        pairCount > 0 ? `${pairCount}组配对` : "",
        this.toText(activityData.title),
      ]
        .filter(Boolean)
        .slice(0, 8),
      ["🎮", "🧩", "🎯", "🏅"],
    );

    return {
      title: this.toText(activityData.title, "练一练").slice(0, 24),
      emoji: "🎮",
      subtitle:
        this.toText(game.activityType, "互动练习").slice(0, 60) || undefined,
      bgColor: "#FFF0F6",
      accentColor: "#FF6B9D",
      layout: items.length >= 3 ? "grid" : items.length > 0 ? "list" : "hero",
      items: items.length > 0 ? items : undefined,
      narration: this.truncateAtSentenceEnd(
        `现在开始互动练习，一起挑战${this.toText(activityData.title, "小游戏")}。`,
        300,
      ),
    };
  }

  private buildAssessSlide(
    quiz: Record<string, any> | undefined,
    _index: number,
  ): TeachingSlide | null {
    if (!quiz || Object.keys(quiz).length === 0) return null;
    const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
    const items = this.createItems(
      questions
        .map((entry: any) => this.toText(entry?.question))
        .filter(Boolean)
        .slice(0, 8),
      ["✅", "🧠", "📌", "🏁"],
    );

    return {
      title: this.toText(quiz.title, "评一评").slice(0, 24),
      emoji: "✅",
      subtitle:
        questions.length > 0 ? `共${questions.length}道题` : "小测验时间",
      bgColor: "#F0FFF4",
      accentColor: "#6BCB77",
      layout: items.length >= 3 ? "grid" : items.length > 0 ? "list" : "hero",
      items: items.length > 0 ? items : undefined,
      narration: this.truncateAtSentenceEnd(
        questions.length > 0
          ? `最后我们来做${questions.length}道题，看看今天学会了什么。`
          : "最后来做一个小测验。",
        300,
      ),
    };
  }

  private buildSlideFromScene(
    scene: Record<string, any>,
    index: number,
    domain: string,
  ): TeachingSlide {
    const domainTheme = DOMAIN_THEMES[domain] || DOMAIN_THEMES.language;
    const theme = this.resolveSceneTheme(scene, index);
    const visualLabels = [
      ...(Array.isArray(scene?.visual?.items)
        ? scene.visual.items
            .map((item: any) => this.toText(item?.label))
            .filter(Boolean)
        : []),
      ...(Array.isArray(scene?.visual?.characters)
        ? scene.visual.characters
            .map((item: any) => this.toText(item?.label))
            .filter(Boolean)
        : []),
    ];

    const mergedItems = this.mergeItems(
      theme.items || [],
      this.createItems(
        visualLabels.slice(0, 8),
        this.isAnimalContext(visualLabels)
          ? ANIMAL_EMOJI_PALETTE
          : EMOJI_PALETTE,
      ),
    );

    const headline = this.toText(
      scene?.onScreenText,
      this.toText(scene?.title, `知识点${index + 1}`),
    );
    const subtitle =
      theme.subtitle ||
      (this.toText(scene?.title, "") === headline
        ? this.toText(scene?.visual?.caption)
        : this.toText(scene?.title, this.toText(scene?.visual?.caption)));

    // Extract animation template from scene visual data
    const templateId = this.toText(scene?.visual?.templateId);
    const templateParams = this.asRecord(scene?.visual?.templateParams);
    const animationTemplate = templateId
      ? { id: templateId, params: templateParams }
      : undefined;

    // Build visual scene descriptor from scene data
    const bgType = this.toText(scene?.visual?.background?.type);
    const validBgTypes = [
      "day",
      "night",
      "indoor",
      "spring",
      "summer",
      "autumn",
      "winter",
    ];
    const sceneCharacters = Array.isArray(scene?.visual?.characters)
      ? scene.visual.characters
          .map((c: any) => this.toText(c?.label || c))
          .filter(Boolean)
          .slice(0, 8)
      : [];
    const sceneVisualItems = Array.isArray(scene?.visual?.items)
      ? scene.visual.items
          .map((i: any) => this.toText(i?.label || i))
          .filter(Boolean)
          .slice(0, 12)
      : [];
    const visual = {
      bgType: validBgTypes.includes(bgType) ? bgType : undefined,
      caption:
        this.toText(scene?.onScreenText || scene?.visual?.caption) || undefined,
      characters: sceneCharacters.length > 0 ? sceneCharacters : undefined,
      items: sceneVisualItems.length > 0 ? sceneVisualItems : undefined,
      mood: this.inferMood(this.toText(scene?.narration)),
    };

    // Determine slide transition style based on position
    const transitionIn =
      index === 0 ? "fade" : index % 3 === 0 ? "slide-left" : "fade";

    return {
      title: headline.slice(0, 24),
      emoji: theme.emoji || EMOJI_PALETTE[index % EMOJI_PALETTE.length],
      subtitle: subtitle.slice(0, 60) || undefined,
      bgColor:
        theme.bgColor ||
        this.toText(
          scene?.visual?.background?.themeColor,
          domainTheme.bgPalette[index % domainTheme.bgPalette.length],
        ),
      accentColor:
        theme.accentColor ||
        this.toText(
          scene?.visual?.background?.accentColor,
          domainTheme.accentPalette[index % domainTheme.accentPalette.length],
        ),
      layout:
        theme.layout ||
        (mergedItems.length >= 3
          ? "grid"
          : mergedItems.length >= 1
            ? "list"
            : "hero"),
      items: mergedItems.length > 0 ? mergedItems : undefined,
      narration: this.truncateAtSentenceEnd(
        this.toText(scene?.narration, "请和老师一起学习。"),
        300,
      ),
      ...(animationTemplate ? { animationTemplate } : {}),
      visual,
      transitionIn,
    };
  }

  private resolveSceneTheme(
    scene: Record<string, any>,
    index: number,
  ): SlideTheme {
    const templateId = this.toText(scene?.visual?.templateId);
    const templateParams = this.asRecord(scene?.visual?.templateParams);

    if (templateId === "science.seasons-cycle") {
      const focusSeason = this.toSeasonIndex(templateParams.focusSeason);
      const seasonNames = Array.isArray(templateParams.seasonNames)
        ? templateParams.seasonNames
        : ["春", "夏", "秋", "冬"];
      return {
        emoji: SEASON_EMOJI[focusSeason],
        layout: "grid",
        bgColor: SEASON_BG[focusSeason],
        accentColor: SEASON_ACCENT[focusSeason],
        subtitle: "四季轮转",
        items: seasonNames.slice(0, 4).map((name: any, itemIndex: number) => ({
          emoji: SEASON_EMOJI[itemIndex % SEASON_EMOJI.length],
          label: this.toText(name).slice(0, 8),
        })),
      };
    }

    if (templateId === "science.day-night-cycle") {
      return {
        emoji: "🌞",
        layout: "list",
        bgColor: "#E8F4FF",
        accentColor: "#4D96FF",
        subtitle: "白天和黑夜",
        items: this.createItems(
          ["太阳升起", "月亮出现", "昼夜变化"],
          ["☀️", "🌙", "⭐"],
        ),
      };
    }

    if (templateId === "science.water-cycle") {
      return {
        emoji: "💧",
        layout: "list",
        bgColor: "#E8F8FF",
        accentColor: "#00B4D8",
        subtitle: "水循环过程",
        items: this.createItems(["蒸发", "成云", "下雨"], ["💨", "☁️", "🌧️"]),
      };
    }

    if (templateId === "science.plant-growth") {
      return {
        emoji: "🌱",
        layout: "list",
        bgColor: "#F0FFF4",
        accentColor: "#6BCB77",
        subtitle: "植物慢慢长大",
        items: this.createItems(["种子", "发芽", "开花"], ["🌰", "🌱", "🌸"]),
      };
    }

    if (templateId === "language.character-stroke") {
      const character = this.toText(templateParams.character);
      return {
        emoji: "✍️",
        layout: "hero",
        bgColor: "#FFF8F0",
        accentColor: "#E67E22",
        subtitle: character ? `认识“${character}”` : "跟着老师学笔顺",
        items: character
          ? this.createItems([character, "笔顺"], ["🀄", "✏️"])
          : this.createItems(["笔顺"], ["✏️"]),
      };
    }

    if (templateId === "language.word-reveal") {
      const words = Array.isArray(templateParams.words)
        ? templateParams.words
        : [];
      return {
        emoji: "🔤",
        layout: "list",
        bgColor: "#F8F0FF",
        accentColor: "#9B59B6",
        subtitle: "词语逐个出现",
        items: this.createItems(
          words
            .map((entry: any) => this.toText(entry))
            .filter(Boolean)
            .slice(0, 8),
          ["🔤", "🪄", "📖", "✨"],
        ),
      };
    }

    if (templateId === "language.story-scene") {
      return {
        emoji: "📖",
        layout: "hero",
        bgColor: "#FFF5F5",
        accentColor: "#FF6B6B",
        subtitle: this.toText(scene?.visual?.caption, "故事时间"),
      };
    }

    // Math templates
    if (templateId === "math.counting-objects") {
      const count = Number(templateParams.targetCount) || 5;
      return {
        emoji: "🔢",
        layout: "grid",
        bgColor: "#EBF5FF",
        accentColor: "#4D96FF",
        subtitle: `数一数，一共${count}个`,
        items: this.createItems(
          Array.from({ length: Math.min(count, 5) }, (_, i) => String(i + 1)),
          ["⭐", "🍎", "🎈", "🌟", "💎"],
        ),
      };
    }

    if (templateId === "math.shape-builder") {
      const shapes = Array.isArray(templateParams.shapes)
        ? templateParams.shapes
        : ["circle", "square", "triangle"];
      const shapeEmoji: Record<string, string> = {
        circle: "⭕",
        square: "⬛",
        triangle: "🔺",
        rectangle: "▬",
        star: "⭐",
      };
      return {
        emoji: "📐",
        layout: "grid",
        bgColor: "#F0F0FF",
        accentColor: "#667EEA",
        subtitle: "认识图形",
        items: shapes.slice(0, 4).map((s: string) => ({
          emoji: shapeEmoji[s] || "🔷",
          label: this.toText(s).slice(0, 8),
        })),
      };
    }

    if (templateId === "math.number-line") {
      const start = Number(templateParams.startNum) || 1;
      const end = Number(templateParams.endNum) || 10;
      return {
        emoji: "📏",
        layout: "list",
        bgColor: "#E8F8FF",
        accentColor: "#00B4D8",
        subtitle: `${start} 到 ${end} 的数轴`,
        items: this.createItems(
          [`${start}`, "...", `${end}`],
          ["1️⃣", "➡️", "🔟"],
        ),
      };
    }

    if (templateId === "math.abacus") {
      return {
        emoji: "🧮",
        layout: "hero",
        bgColor: "#FFFBEB",
        accentColor: "#F59E0B",
        subtitle: "算盘计数",
        items: this.createItems(["拨珠子", "数一数"], ["🟤", "🔢"]),
      };
    }

    // Art templates
    if (templateId === "art.color-mixing") {
      return {
        emoji: "🎨",
        layout: "grid",
        bgColor: "#FFF0F6",
        accentColor: "#FF6B9D",
        subtitle: "颜色混合实验",
        items: this.createItems(
          ["红色", "蓝色", "黄色", "混合"],
          ["🔴", "🔵", "🟡", "🎨"],
        ),
      };
    }

    if (templateId === "art.drawing-steps") {
      return {
        emoji: "🖌️",
        layout: "list",
        bgColor: "#FFF8F0",
        accentColor: "#E67E22",
        subtitle: "跟着画一画",
        items: this.createItems(
          ["第一步", "第二步", "完成"],
          ["✏️", "🖊️", "🌟"],
        ),
      };
    }

    // Social templates
    if (templateId === "social.emotion-faces") {
      const emotions = Array.isArray(templateParams.emotions)
        ? templateParams.emotions
        : ["happy", "sad", "angry", "surprised"];
      const emotionEmoji: Record<string, string> = {
        happy: "😊",
        sad: "😢",
        angry: "😠",
        surprised: "😲",
        scared: "😨",
        shy: "😳",
        proud: "😎",
        calm: "😌",
      };
      return {
        emoji: "😊",
        layout: "grid",
        bgColor: "#FFFBEB",
        accentColor: "#FFD93D",
        subtitle: "认识表情",
        items: emotions.slice(0, 4).map((e: string) => ({
          emoji: emotionEmoji[e] || "😀",
          label: this.toText(e).slice(0, 8),
        })),
      };
    }

    if (templateId === "social.daily-routine") {
      const activities = Array.isArray(templateParams.activities)
        ? templateParams.activities
        : [];
      return {
        emoji: "⏰",
        layout: activities.length >= 3 ? "grid" : "list",
        bgColor: "#F0FFF4",
        accentColor: "#6BCB77",
        subtitle: "日常好习惯",
        items:
          activities.length > 0
            ? activities.slice(0, 4).map((a: string, i: number) => ({
                emoji: ["🌅", "🍽️", "📚", "🌙"][i % 4],
                label: this.toText(a).slice(0, 8),
              }))
            : this.createItems(
                ["起床", "学习", "玩耍", "睡觉"],
                ["🌅", "📚", "🎮", "🌙"],
              ),
      };
    }

    const backgroundType = this.toText(scene?.visual?.background?.type);
    if (backgroundType === "night") {
      return { emoji: "🌙", bgColor: "#E8F0FF", accentColor: "#667EEA" };
    }
    if (backgroundType === "seasonal") {
      return { emoji: "🍃", bgColor: "#F0FFF4", accentColor: "#6BCB77" };
    }
    if (backgroundType === "indoor") {
      return { emoji: "🏫", bgColor: "#FFF8F0", accentColor: "#E67E22" };
    }
    if (backgroundType === "abstract") {
      return { emoji: "✨", bgColor: "#F8F0FF", accentColor: "#9B59B6" };
    }

    return {
      emoji: EMOJI_PALETTE[index % EMOJI_PALETTE.length],
    };
  }

  private isAnimalContext(labels: string[]): boolean {
    const animalKeywords = [
      "猴子",
      "兔",
      "熊",
      "猫",
      "狗",
      "熊猫",
      "企鹅",
      "大象",
      "狮子",
      "长颈鹿",
      "青蛙",
      "蝴蝶",
      "蜜蜂",
      "蛇",
      "乌龟",
      "猫头鹰",
      "马",
      "牛",
      "猪",
      "鸡",
      "动物",
      "monkey",
      "rabbit",
      "bear",
      "panda",
      "penguin",
      "elephant",
      "lion",
      "giraffe",
      "frog",
      "butterfly",
      "bee",
      "snake",
      "turtle",
      "owl",
      "horse",
      "cow",
      "pig",
      "chicken",
      "animal",
    ];
    return labels.some((l) =>
      animalKeywords.some((k) => l.toLowerCase().includes(k)),
    );
  }

  private buildFallbackSlide(topic: string, domain?: string): TeachingSlide {
    const theme = DOMAIN_THEMES[domain || "language"] || DOMAIN_THEMES.language;
    const domainEmoji: Record<string, string> = {
      language: "📖",
      math: "🔢",
      science: "🔬",
      art: "🎨",
      social: "🤝",
    };
    const domainLabel: Record<string, string> = {
      language: "语言启蒙",
      math: "数学启蒙",
      science: "科学探索",
      art: "艺术创造",
      social: "社交成长",
    };
    return {
      title: `认识${topic}`.slice(0, 24),
      emoji: domainEmoji[domain || "language"] || "✨",
      subtitle: domainLabel[domain || "language"] || "启蒙动画课",
      bgColor: theme.bgPalette[0],
      accentColor: theme.accentPalette[0],
      layout: "hero",
      items: this.createItems(["一起观察", "一起学习"], ["👀", "📘"]),
      narration: this.truncateAtSentenceEnd(
        `请跟着老师一起认识${topic}。`,
        300,
      ),
      transitionIn: "fade",
    };
  }

  /** Infer mood from narration text for visual scene descriptor */
  private inferMood(
    text: string,
  ): "playful" | "calm" | "exciting" | "mysterious" | "warm" {
    if (/(开心|快乐|好玩|游戏|玩|笑|哈哈|太棒|加油|欢迎)/.test(text))
      return "playful";
    if (/(安静|轻轻|慢慢|温柔|仔细|认真|观察)/.test(text)) return "calm";
    if (/(发现|探索|惊喜|哇|厉害|挑战|比赛|冒险)/.test(text)) return "exciting";
    if (/(神奇|奇妙|秘密|魔法|变化|不可思议)/.test(text)) return "mysterious";
    if (/(温暖|拥抱|爱|妈妈|爸爸|朋友|分享|帮助|谢谢|再见)/.test(text))
      return "warm";
    return "playful";
  }

  private mergeItems(
    primary: TeachingSlideItem[],
    secondary: TeachingSlideItem[],
  ): TeachingSlideItem[] {
    const seen = new Set<string>();
    return [...primary, ...secondary]
      .filter((item) => {
        const key = this.toText(item?.label);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);
  }

  private createItems(
    labels: string[],
    emojiSource: readonly string[],
  ): TeachingSlideItem[] {
    return labels
      .map((label, index) => ({
        emoji: emojiSource[index % emojiSource.length],
        label: this.toText(label).slice(0, 20),
      }))
      .filter((item) => item.label);
  }

  private toSeasonIndex(value: unknown): number {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 3) {
      return Math.trunc(numeric);
    }
    return 0;
  }

  private asRecord(value: unknown): Record<string, any> {
    return value && typeof value === "object"
      ? (value as Record<string, any>)
      : {};
  }

  private toText(value: unknown, fallback = ""): string {
    if (value == null) return fallback;
    const text = String(value).replace(/\s+/g, " ").trim();
    return text || fallback;
  }

  private toInt(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.trunc(parsed)));
  }

  /** Truncate at the last complete sentence within the limit */
  private truncateAtSentenceEnd(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    const sub = text.slice(0, maxLen);
    const lastPunc = Math.max(
      sub.lastIndexOf("。"),
      sub.lastIndexOf("！"),
      sub.lastIndexOf("？"),
      sub.lastIndexOf("，"),
    );
    return lastPunc > maxLen * 0.5 ? sub.slice(0, lastPunc + 1) : sub;
  }

  private async generateNarrationAudioFiles(
    data: TeachingVideoData,
  ): Promise<TeachingVideoData> {
    const publicDir = path.join(this.remotionDir, "public");
    await fs.mkdir(publicDir, { recursive: true });

    // Sequential TTS calls with one retry — parallel calls exhaust the TLS
    // connection pool on slower networks, causing all slides to fail at once.
    const slideResults: TeachingSlide[] = [];
    for (const slide of data.slides) {
      if (!slide.narration || slide.narration.trim().length === 0) {
        slideResults.push(slide);
        continue;
      }

      let buffer: Buffer | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          buffer = await this.voiceService.textToSpeech(slide.narration);
          break; // success
        } catch (err: any) {
          if (attempt === 0) {
            this.logger.warn(
              `TTS attempt 1 failed for slide "${slide.title}", retrying in 1 s: ${err?.message || "unknown"}`,
            );
            await new Promise((r) => setTimeout(r, 1000));
          } else {
            this.logger.warn(
              `TTS generation failed for slide "${slide.title}" after 2 attempts: ${err?.message || "unknown"}`,
            );
          }
        }
      }

      if (!buffer) {
        // Fallback: estimate duration from text length (≈4 chars/s for Chinese TTS)
        const chars = slide.narration.replace(/\s+/g, "").length;
        const estimatedSeconds = Math.max(3, chars / 4);
        slideResults.push({
          ...slide,
          durationFrames: Math.ceil(estimatedSeconds * 30) + 30,
        });
        continue;
      }

      const hash = createHash("sha1")
        .update(slide.narration)
        .digest("hex")
        .slice(0, 12);
      const filename = `narration-${hash}.mp3`;
      await fs.writeFile(path.join(publicDir, filename), buffer);

      const durationFrames = this.parseMp3DurationFrames(buffer);
      slideResults.push({
        ...slide,
        narrationSrc: filename,
        durationFrames,
      });
    }

    return { ...data, slides: slideResults };
  }

  /**
   * Parse MP3 frame headers to compute an accurate duration in Remotion frames.
   * Scans the first sync word in the first 64 KB to detect bitrate/samplerate,
   * then calculates total frames from file size. Falls back to a byte-rate
   * heuristic if the file is malformed. Adds 0.3 s lead-in + 0.5 s tail buffer.
   */
  private parseMp3DurationFrames(mp3Buffer: Buffer): number {
    const FPS = 30;
    const LEAD_IN_FRAMES = Math.ceil(0.3 * FPS); // 9 frames — slide entrance anim
    const TAIL_FRAMES = Math.ceil(0.5 * FPS); // 15 frames — pause after speech
    const MIN_FRAMES = 6 * FPS; // 6 s minimum slide duration

    try {
      // Scan up to 64 KB for the first valid MPEG sync word (0xFF 0xE0 mask)
      const scanLimit = Math.min(mp3Buffer.length - 4, 65536);
      for (let i = 0; i < scanLimit; i++) {
        if (mp3Buffer[i] !== 0xff || (mp3Buffer[i + 1] & 0xe0) !== 0xe0)
          continue;

        const h =
          (mp3Buffer[i] << 24) |
          (mp3Buffer[i + 1] << 16) |
          (mp3Buffer[i + 2] << 8) |
          mp3Buffer[i + 3];

        const mpegVersion = (h >> 19) & 0x3; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
        const layerBits = (h >> 17) & 0x3; // 3=Layer1, 2=Layer2, 1=Layer3
        const bitrateIdx = (h >> 12) & 0xf;
        const srateIdx = (h >> 10) & 0x3;
        const padding = (h >> 9) & 0x1;

        if (
          mpegVersion === 1 ||
          layerBits === 0 ||
          bitrateIdx === 0 ||
          bitrateIdx === 15 ||
          srateIdx === 3
        ) {
          continue; // reserved/free/bad values — keep scanning
        }

        // MPEG1 Layer3 bitrate table (kbps)
        const BITRATES_V1_L3 = [
          0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
        ];
        // MPEG2/2.5 Layer3 bitrate table (kbps)
        const BITRATES_V2_L3 = [
          0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0,
        ];

        // MPEG1 sample rates (Hz)
        const SRATES_V1 = [44100, 48000, 32000, 0];
        // MPEG2 sample rates (Hz)
        const SRATES_V2 = [22050, 24000, 16000, 0];
        // MPEG2.5 sample rates (Hz)
        const SRATES_V25 = [11025, 12000, 8000, 0];

        const isV1 = mpegVersion === 3;
        const isL3 = layerBits === 1;

        const bitrate =
          (isV1 ? BITRATES_V1_L3 : BITRATES_V2_L3)[bitrateIdx] * 1000;
        const srate = (
          isV1 ? SRATES_V1 : mpegVersion === 2 ? SRATES_V2 : SRATES_V25
        )[srateIdx];

        if (!bitrate || !srate || !isL3) continue;

        // Samples per frame: MPEG1 L3 = 1152, MPEG2/2.5 L3 = 576
        const samplesPerFrame = isV1 ? 1152 : 576;
        // Frame size in bytes (without padding byte)
        const frameBytes =
          Math.floor((samplesPerFrame * bitrate) / 8 / srate) + padding;

        if (frameBytes < 24 || frameBytes > 1442) continue; // sanity check

        // Estimate total MP3 frame count from file size and first-frame size
        const dataBytes = mp3Buffer.length - i;
        const frameCount = Math.max(1, Math.floor(dataBytes / frameBytes));
        const seconds = (frameCount * samplesPerFrame) / srate;

        const rawFrames = Math.ceil(seconds * FPS);
        return Math.max(MIN_FRAMES, rawFrames + LEAD_IN_FRAMES + TAIL_FRAMES);
      }
    } catch {
      // fall through to heuristic
    }

    // Fallback: assume 40 kbps mono MP3 (typical TTS output)
    const seconds = mp3Buffer.length / 5000;
    return Math.max(
      MIN_FRAMES,
      Math.ceil(seconds * FPS) + LEAD_IN_FRAMES + TAIL_FRAMES,
    );
  }

  async cleanupNarrationFiles(inputProps: Record<string, any>): Promise<void> {
    const slides = inputProps?.slides;
    if (!Array.isArray(slides)) return;

    const publicDir = path.join(this.remotionDir, "public");
    for (const slide of slides) {
      if (slide.narrationSrc) {
        try {
          await fs.unlink(path.join(publicDir, slide.narrationSrc));
        } catch {
          // best effort cleanup
        }
      }
    }
  }

  async renderGeneratedComposition(
    task: VideoGenerationTask,
    manifest: DynamicRemotionManifest,
    outputPath: string,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    const taskName = `task-${task.id}-${Date.now()}`;
    const taskDir = path.join(
      this.remotionDir,
      ".generated",
      "remotion-tasks",
      taskName,
    );
    const publicTaskDir = path.join(
      this.remotionDir,
      "public",
      ".generated",
      "remotion-tasks",
      taskName,
    );
    const publicTaskRel = `.generated/remotion-tasks/${taskName}`;
    const preserveFailedDir =
      process.env.REMOTION_PRESERVE_FAILED_TASK_DIR === "true";

    try {
      await fs.mkdir(taskDir, { recursive: true });
      await fs.mkdir(publicTaskDir, { recursive: true });

      const props = await this.prepareGeneratedPropsWithAudio(
        task.id,
        manifest,
        publicTaskDir,
        publicTaskRel,
      );

      for (const file of manifest.files) {
        const target = this.resolveGeneratedFilePath(taskDir, file.path);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, file.content, "utf-8");
      }

      const propsPath = path.join(taskDir, "props.json");
      await fs.writeFile(propsPath, JSON.stringify(props), "utf-8");
      const entryPath = path.join(taskDir, "index.ts");

      this.logger.log(
        `[renderGeneratedComposition] taskId=${task.id} dynamicRemotion=true compositionId=${manifest.compositionId}, files=${manifest.files.length}, scenes=${Array.isArray(props.scenes) ? props.scenes.length : 0}, outputPath=${outputPath}`,
      );

      const tsResult = await checkGeneratedFiles(taskDir, this.remotionDir);
      if (!tsResult.passed) {
        this.logger.warn(
          `[renderGeneratedComposition] taskId=${task.id} TS check found ${tsResult.errors.length} errors, auto-fixing`,
        );
        const { fixed, unfixed } = await autoFixErrors(
          tsResult.errors,
          taskDir,
        );
        this.logger.log(
          `[renderGeneratedComposition] taskId=${task.id} auto-fixed ${fixed} TS errors`,
        );
        if (unfixed.length > 0) {
          const recheck = await checkGeneratedFiles(taskDir, this.remotionDir);
          if (!recheck.passed) {
            throw new Error(
              `dynamic Remotion TS check failed with ${recheck.errors.length} unfixable errors:\n${recheck.errors.map((e) => `${e.file}(${e.line},${e.col}): ${e.code}: ${e.message}`).join("\n")}`,
            );
          }
        }
      }

      await this.runGeneratedRemotionRender(
        entryPath,
        manifest.compositionId,
        outputPath,
        propsPath,
        onProgress,
      );
    } catch (err) {
      if (preserveFailedDir) {
        this.logger.warn(
          `[renderGeneratedComposition] REMOTION_PRESERVE_FAILED_TASK_DIR=true — keeping task dir for debugging: ${taskDir}`,
        );
      }
      throw err;
    } finally {
      if (!preserveFailedDir) {
        await this.safeRemove(taskDir);
        await this.safeRemove(publicTaskDir);
      }
    }
  }

  private async prepareGeneratedPropsWithAudio(
    taskId: number,
    manifest: DynamicRemotionManifest,
    publicTaskDir: string,
    publicTaskRel: string,
  ): Promise<Record<string, any>> {
    const props = JSON.parse(JSON.stringify(manifest.props || {}));
    const scenes = Array.isArray(props.scenes) ? props.scenes : [];

    let audioCount = 0;
    for (let index = 0; index < scenes.length; index += 1) {
      const scene = scenes[index];
      const narration = this.toText(scene?.narration);
      if (!narration) continue;

      const audio = await this.tryGenerateNarrationAudio(
        narration,
        `${scene?.title || `scene-${index + 1}`}`,
      );
      if (!audio) {
        this.logger.warn(
          `[renderGeneratedComposition] taskId=${taskId} scene="${scene?.title || index + 1}" generatedVisual=${scene?.generatedVisual || ""} assetProvider=${scene?.visualAssets?.assetProvider || "svgFallback"} characterProvider=${scene?.visualAssets?.characterProvider || ""} backgroundProvider=${scene?.visualAssets?.backgroundProvider || ""} hasCharacterAsset=${Boolean(scene?.visualAssets?.characterAssetSrc)} license=${scene?.visualAssets?.license || ""} assetQuality=${scene?.visualAssets?.qualityScore || 0} audioBytes=0`,
        );
        continue;
      }

      const hash = createHash("sha1")
        .update(`${index}:${narration}`)
        .digest("hex")
        .slice(0, 12);
      const filename = `narration-${index + 1}-${hash}.mp3`;
      await fs.writeFile(path.join(publicTaskDir, filename), audio.buffer);

      scene.audioSrc = `${publicTaskRel}/${filename}`;
      scene.durationFrames = Math.max(
        Number(scene.durationFrames) || 0,
        audio.durationFrames,
      );
      audioCount += 1;
      this.logger.log(
        `[renderGeneratedComposition] taskId=${taskId} scene="${scene?.title || index + 1}" template=${scene?.template || ""} generatedVisual=${scene?.generatedVisual || ""} assetProvider=${scene?.visualAssets?.assetProvider || "svgFallback"} characterProvider=${scene?.visualAssets?.characterProvider || ""} backgroundProvider=${scene?.visualAssets?.backgroundProvider || ""} hasCharacterAsset=${Boolean(scene?.visualAssets?.characterAssetSrc)} license=${scene?.visualAssets?.license || ""} assetQuality=${scene?.visualAssets?.qualityScore || 0} audioBytes=${audio.buffer.length}`,
      );
    }

    props.scenes = scenes;
    props.durationFrames = Math.max(
      Number(props.durationFrames) || 0,
      scenes.reduce(
        (sum: number, scene: any) =>
          sum + Math.max(90, Number(scene?.durationFrames) || 180),
        0,
      ),
    );

    this.logger.log(
      `[renderGeneratedComposition] narration audio generated for ${audioCount}/${scenes.length} dynamic scenes`,
    );
    return props;
  }

  private async tryGenerateNarrationAudio(
    narration: string,
    label: string,
  ): Promise<{ buffer: Buffer; durationFrames: number } | null> {
    const minBytes = this.toInt(
      process.env.REMOTION_TTS_MIN_BYTES,
      1024,
      1,
      1024 * 1024,
    );

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const buffer = await this.voiceService.textToSpeech(narration);
        if (!Buffer.isBuffer(buffer) || buffer.length < minBytes) {
          throw new Error(
            `empty or too small TTS buffer (${buffer?.length || 0} bytes)`,
          );
        }
        return {
          buffer,
          durationFrames: this.parseMp3DurationFrames(buffer),
        };
      } catch (error: any) {
        if (attempt === 0) {
          this.logger.warn(
            `TTS attempt 1 failed for dynamic scene "${label}", retrying in 1 s: ${error?.message || "unknown"}`,
          );
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } else {
          this.logger.warn(
            `TTS generation failed for dynamic scene "${label}" after 2 attempts: ${error?.message || "unknown"}`,
          );
        }
      }
    }
    return null;
  }

  private resolveGeneratedFilePath(root: string, relativePath: string): string {
    const normalized = path.normalize(relativePath);
    if (
      path.isAbsolute(normalized) ||
      normalized.startsWith("..") ||
      normalized.includes(`..${path.sep}`)
    ) {
      throw new Error(`invalid generated file path: ${relativePath}`);
    }
    const resolved = path.resolve(root, normalized);
    if (!resolved.startsWith(path.resolve(root))) {
      throw new Error(`generated file escaped task directory: ${relativePath}`);
    }
    return resolved;
  }

  private runGeneratedRemotionRender(
    entryPath: string,
    compositionId: string,
    outputPath: string,
    propsPath: string,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const cpuCount = Math.max(1, (require("os").cpus() || []).length);
      const concurrency = Math.min(cpuCount - 1 || 1, 4);
      const chromePath = this.resolveChromePath();
      const args = [
        "remotion",
        "render",
        entryPath,
        compositionId,
        outputPath,
        "--codec=h264",
        `--concurrency=${concurrency}`,
        `--props=${propsPath}`,
        ...(chromePath ? [`--browser-executable=${chromePath}`] : []),
      ];

      this.logger.log(
        `[runGeneratedRemotionRender] Spawning dynamic Remotion render: compositionId=${compositionId}, concurrency=${concurrency}, cwd=${this.remotionDir}, entry=${entryPath}, browser=${chromePath || "auto"}, timeout=${this.RENDER_HARD_TIMEOUT_MS}ms`,
      );

      const proc = spawn("npx", args, {
        cwd: this.remotionDir,
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const lastErrorRef = { value: "" };
      const stderrBuffer = { value: "" };

      // Wire up hard timeout (SIGTERM → 2s → SIGKILL)
      this.spawnWithHardTimeout(
        "runGeneratedRemotionRender",
        proc,
        () => {
          this.logger.log(
            `[runGeneratedRemotionRender] Dynamic Remotion render completed: ${compositionId} -> ${outputPath}`,
          );
          resolve();
        },
        reject,
        lastErrorRef,
        stderrBuffer,
      );

      proc.stdout?.on("data", (data: Buffer) => {
        const text = data.toString();
        const percent = this.parseProgress(text);
        if (percent !== null && onProgress) onProgress(percent);
      });
      proc.stderr?.on("data", (data: Buffer) => {
        const text = data.toString();
        stderrBuffer.value += text;
        const percent = this.parseProgress(text);
        if (percent !== null && onProgress) onProgress(percent);
        const lines = text.trim().split("\n");
        const lastLine = lines[lines.length - 1]?.trim();
        if (lastLine && !lastLine.startsWith("[") && lastLine.length < 300) {
          lastErrorRef.value = lastLine;
        }
      });
      proc.on("error", (err) => {
        reject(
          new Error(
            `dynamic remotion spawn failed: ${err.message}\nstderr: ${stderrBuffer.value.slice(0, 2000)}`,
          ),
        );
      });
    });
  }

  private async safeRemove(target: string): Promise<void> {
    try {
      await fs.rm(target, { recursive: true, force: true });
    } catch {
      // best effort cleanup
    }
  }

  async renderComposition(
    compositionId: string,
    inputProps: Record<string, any>,
    outputPath: string,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    const propsPath = await this.writePropsFile(inputProps);

    try {
      await this.runRemotionRender(
        compositionId,
        outputPath,
        propsPath,
        onProgress,
      );
    } finally {
      await this.cleanupFile(propsPath);
    }
  }

  /** Infer content domain from topic text and payload hints */
  private inferDomain(topic: string, payload: LessonVideoPayload): string {
    // Check if payload has an explicit domain field
    const explicitDomain = this.toText((payload as any)?.domain);
    if (explicitDomain && DOMAIN_THEMES[explicitDomain]) return explicitDomain;

    // Check visualStory scenes for animation template hints
    const scenes = Array.isArray(payload.visualStory?.scenes)
      ? payload.visualStory.scenes
      : [];
    for (const scene of scenes) {
      const templateId = this.toText(scene?.visual?.templateId);
      if (templateId) {
        const domain = templateId.split(".")[0];
        if (DOMAIN_THEMES[domain]) return domain;
      }
    }

    // Keyword-based inference from topic
    const t = topic.trim();
    if (
      /(汉字|识字|拼音|词语|词汇|朗读|阅读|认字|生字|写字|笔画|偏旁|部首|古诗|诗歌|儿歌|故事|绘本|童话)/.test(
        t,
      )
    )
      return "language";
    if (
      /(数字|数数|加法|减法|形状|图形|算盘|排序|规律|数学|计数|比大小)/.test(t)
    )
      return "math";
    if (
      /(四季|季节|水循环|白天|黑夜|植物|种子|动物|昆虫|天气|身体|食物|声音|光|磁铁|科学)/.test(
        t,
      )
    )
      return "science";
    if (/(颜色|色彩|画画|绘画|简笔画|手工|折纸|音乐|唱歌|乐器|美术)/.test(t))
      return "art";
    if (/(情绪|表情|作息|习惯|朋友|分享|合作|礼貌|家庭|节日|安全|社交)/.test(t))
      return "social";

    return "language";
  }

  private isNumbersTopic(topic: string): boolean {
    const normalized = topic.trim().toLowerCase();
    return (
      normalized === "认识数字" ||
      normalized === "数字" ||
      normalized === "numbers" ||
      normalized === "1-10" ||
      /^认识数字\s*[1１]?[-—]?\s*10$/.test(normalized)
    );
  }

  private async writePropsFile(props: Record<string, any>): Promise<string> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "remotion-props-"));
    const propsPath = path.join(tmpDir, "input-props.json");
    await fs.writeFile(propsPath, JSON.stringify(props), "utf-8");
    return propsPath;
  }

  private runRemotionRender(
    compositionId: string,
    outputPath: string,
    propsPath: string,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const cpuCount = Math.max(1, (require("os").cpus() || []).length);
      const concurrency = Math.min(cpuCount - 1 || 1, 4); // Use N-1 cores, max 4
      const chromePath = this.resolveChromePath();
      const args = [
        "remotion",
        "render",
        compositionId,
        outputPath,
        "--codec=h264",
        `--concurrency=${concurrency}`,
        `--props=${propsPath}`,
        ...(chromePath ? [`--browser-executable=${chromePath}`] : []),
      ];

      this.logger.log(
        `[runRemotionRender] Spawning remotion render: compositionId=${compositionId}, concurrency=${concurrency}, cwd=${this.remotionDir}, outputPath=${outputPath}, browser=${chromePath || "auto"}, timeout=${this.RENDER_HARD_TIMEOUT_MS}ms`,
      );

      const proc = spawn("npx", args, {
        cwd: this.remotionDir,
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const lastErrorRef = { value: "" };
      const stderrBuffer = { value: "" };
      let lastProgressLog = 0;

      // Wire up hard timeout (SIGTERM → 2s → SIGKILL)
      this.spawnWithHardTimeout(
        "runRemotionRender",
        proc,
        () => {
          this.logger.log(
            `[runRemotionRender] Remotion render completed: ${compositionId} → ${outputPath}`,
          );
          resolve();
        },
        reject,
        lastErrorRef,
        stderrBuffer,
      );

      proc.stdout?.on("data", (data: Buffer) => {
        const text = data.toString();
        const percent = this.parseProgress(text);
        if (percent !== null && onProgress) {
          onProgress(percent);
          if (percent - lastProgressLog >= 20) {
            this.logger.debug(
              `[runRemotionRender] ${compositionId} progress: ${percent}%`,
            );
            lastProgressLog = percent;
          }
        }
      });

      proc.stderr?.on("data", (data: Buffer) => {
        const text = data.toString();
        stderrBuffer.value += text;
        const percent = this.parseProgress(text);
        if (percent !== null && onProgress) {
          onProgress(percent);
        }
        const lines = text.trim().split("\n");
        const lastLine = lines[lines.length - 1]?.trim();
        if (lastLine && !lastLine.startsWith("[") && lastLine.length < 200) {
          lastErrorRef.value = lastLine;
        }
      });

      proc.on("error", (err) => {
        this.logger.error(
          `[runRemotionRender] spawn error: ${err.message}. Check if remotion is installed at ${this.remotionDir}`,
        );
        reject(
          new Error(
            `remotion spawn failed: ${err.message}\nstderr: ${stderrBuffer.value.slice(0, 2000)}`,
          ),
        );
      });
    });
  }

  private parseProgress(text: string): number | null {
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
