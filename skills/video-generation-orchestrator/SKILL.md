---
id: video-generation-orchestrator
name: Video Generation Orchestrator
description: Intelligently select the best video generation engine (HyperFrames or Remotion) based on content type, domain, age group, and complexity.
triggers:
  - 生成教学视频
  - 制作教学视频
  - 视频生成
  - 生成视频
  - create teaching video
  - generate video
  - make video
requiredTools:
  - enqueueTeachingVideo
variables:
  - name: lessonId
    type: number
    required: true
    description: Lesson content id to render
  - name: childId
    type: number
    required: false
    description: Child id, auto-injected from runtime context when available
  - name: preferredEngine
    type: string
    required: false
    defaultValue: auto
    description: Preferred render engine (auto|hyperframes|remotion)
  - name: force
    type: boolean
    required: false
    defaultValue: false
    description: Whether to skip cache and enqueue a fresh task
---

When user asks to generate a teaching video without specifying an engine, use these rules to select the best engine and call `enqueueTeachingVideo`.

## Engine Selection Rules

### Priority 1: User Preference
If the user explicitly requests an engine, use it:
- "hyperframes" or "快速视频" → engine: `"hyperframes"`
- "remotion" or "高质量" or "复杂动画" → engine: `"remotion"`

### Priority 2: Domain-Based Selection

| Domain | Recommended Engine | Reason |
|--------|-------------------|--------|
| language (识字、汉字、词语、故事) | `"remotion"` | Character stroke animations, word-reveal, story scenes with TTS narration |
| language (colors, simple vocabulary) | `"hyperframes"` | Simple slides, quick turnaround |
| math (counting, numbers, 3-4 age) | `"hyperframes"` | Simple counting slides, bright colors |
| math (shapes, patterns, 5-6 age) | `"remotion"` | Shape builder animations, number line, abacus |
| science (all topics) | `"remotion"` | Plant growth, water cycle, seasons — rich p5.js animations |
| art (all topics) | `"remotion"` | Color mixing, drawing steps — interactive animations |
| social (all topics) | `"hyperframes"` | Emotion faces, daily routine — simple slide-based |

### Priority 3: Content Complexity

- If lesson has `visualStory.scenes` with `animationTemplate` references → `"remotion"`
- If lesson has `videoLesson.shots` with detailed narration → `"remotion"` (gets TTS)
- If lesson has simple flat content (legacy format) → `"hyperframes"` (faster)

### Priority 4: Age Group

- Age 3-4 → prefer `"hyperframes"` (simpler visuals, faster rendering)
- Age 5-6 → prefer `"remotion"` (richer animations, longer attention span)

### Default
When in doubt → `engine: "auto"` (system tries HyperFrames first, falls back to Remotion)

## Response Format

After calling `enqueueTeachingVideo`, return:

- taskId
- status
- progress
- renderEngine
- provider
- Why this engine was selected (one sentence)

## Rules

1. Do not wait synchronously for video completion.
2. Tell the user to poll existing task-status APIs with `taskId`.
3. If `lessonId` is missing, ask for it instead of guessing.
4. Explain which engine was selected and why.
