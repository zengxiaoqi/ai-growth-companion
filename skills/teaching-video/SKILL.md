---
name: teaching-video
description: "Generate a teaching video mp4 from natural-language topic input using Remotion. Orchestrates the full pipeline: read the task input → author a topic-specific Remotion composition → render with npx remotion → self-check frames → emit an artifact manifest and print a machine-readable one-line JSON result to stdout. Use when asked to 生成教学视频 / 制作教学视频 / render a lesson video from a topic."
whenToUse: "When the user (or a host process) asks to generate a child-oriented teaching video from a topic, or when invoked headlessly with an input.json task file and an output directory."
metadata:
  tags: [video, remotion, teaching, education, render, orchestration]
---

# Teaching Video Generation (DSH orchestrator)

You are the video-generation worker. You receive a task as either:
- A natural-language topic in the user message, or
- (headless mode) an `input.json` file path plus an output directory, passed in the task prompt.

You author the visual code and produce a rendered mp4. You do NOT re-generate narration audio (TTS): if the task provides `narrationSrc`, consume those audio files as-is.

## Input contract

`input.json` fields (all optional except `topic`):
- `topic` (string, required) — lesson topic, e.g. "水循环"
- `title`, `summary` (string) — display title/summary
- `ageGroup` ("3-4" | "5-6") — default "5-6"
- `domain` (string) — language | math | science | art | social
- `durationSec` (number) — total target duration, default 60
- `style` (string) — story | science | song (visual hint)
- `sceneCount` (number) — 4..8, default 5
- `narrationSrc` (string[]) — absolute paths to pre-generated narration mp3 files, one per scene
- `outputDir` (string) — absolute output directory (mp4 + manifest land here)
- `fps` (number) — default 30
- `width` / `height` (number) — default 1920 / 1080

## Environment facts

- The Remotion project lives at `src/video-remotion/` (repo root). Its `node_modules`, `remotion.config.ts`, and compositions are already installed.
- Render with the project-local CLI: `npx --prefix src/video-remotion remotion render` or `cd src/video-remotion && npx remotion render`.
- Chrome is auto-discovered by Remotion (puppeteer/playwright/system chromium).

## Workflow

### Step 1 — Load rules
Call the `skill` tool for `remotion-video-creation` and follow its domain rules (compositions, animations, transitions, measuring text, fonts). Consult `hyperframes` only if the task explicitly asks for HTML/GSAP output; otherwise default to Remotion.

### Step 2 — Author the storyboard
Derive `sceneCount` scenes, each with: title, narration (Chinese, child-appropriate, 30-80 chars), onScreenText, visualDescription, and durationSec. Keep total duration ≈ `durationSec`. Use topic-specific visuals — never generic "一起学习" filler.

### Step 3 — Write a topic-specific composition
Under `src/video-remotion/src/compositions/` create `TeachingLesson.tsx` exporting a composition with a unique id `TeachingLesson-<slug>`. Make every scene a visually distinct, animated node — this is the whole point (do NOT fall back to plain text slides). Register it in `src/video-remotion/src/Root.tsx` and keep `index.ts` registering `Root`.

### Step 4 — Render
Write `props.json` to the output dir, then:

```bash
cd src/video-remotion && npx remotion render src/index.ts <CompositionId> --props=<abs>/props.json --codec=h264 --output=<outdir>/<cacheKey>.mp4
```

### Step 5 — Self-check (best effort)
Optionally extract 2-3 frames with Remotion to confirm scenes are not blank/overflowing; fix and re-render once if needed (max 1 retry).

### Step 6 — Manifest + result
Write `<outdir>/manifest.json`:

```json
{
  "schemaVersion": 1,
  "status": "completed",
  "engine": "remotion",
  "compositionId": "<CompositionId>",
  "output": { "videoPath": "<abs>/<cacheKey>.mp4", "durationSec": 60, "width": 1920, "height": 1080 },
  "scenes": 5
}
```

Then print ONE final line to stdout, nothing else:

```
{"status":"ok","manifestPath":"<abs>/manifest.json"}
```

## Rules

1. Always print the one-line JSON result as your LAST stdout line.
2. On render failure, retry once after fixing the code; on the second failure print `{"status":"failed","error":"<brief>"}` and stop.
3. Never eval untrusted code; never access the network inside a composition.
