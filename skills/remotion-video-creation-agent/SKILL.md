---
id: remotion-video-creation
name: Remotion Teaching Video Creation
description: Generate high-quality teaching videos using Remotion engine with TTS narration, domain-specific compositions, React-based animations, and rich scene transitions.
triggers:
  - remotion视频
  - remotion动画
  - 复杂动画视频
  - 高质量教学视频
  - 高质量视频
  - remotion video
  - complex animation video
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
  - name: engine
    type: string
    required: false
    defaultValue: remotion
    description: Render engine mode, defaults to remotion for this skill
  - name: force
    type: boolean
    required: false
    defaultValue: false
    description: Whether to skip cache and enqueue a fresh task
---

When user asks to generate a high-quality teaching video with Remotion, call `enqueueTeachingVideo` with `engine: "remotion"` and return:

- taskId
- status
- progress
- renderEngine
- provider

## Engine Capabilities

Remotion renders React-based video compositions with:
- **TTS narration**: Each slide gets text-to-speech audio via VoiceService, with accurate MP3 duration parsing
- **Domain-specific theming**: Color palettes per domain (language, math, science, art, social) with themed intro/outro slides
- **Rich compositions**: TopicVideo and NumbersVideo compositions with frame-driven animations via `useCurrentFrame()`
- **Scene transitions**: `<TransitionSeries>` with fade, slide, wipe, flip, clockWipe transitions
- **Text animations**: Typewriter effect, word highlighting, per-character reveals
- **Chart components**: Bar charts and data visualizations for math/science content
- **Audio support**: Background music, sound effects, narration with precise timing
- **3D content**: Three.js integration via React Three Fiber for science visualizations

## When to Use Remotion

- Complex animation requirements (character animations, word-reveal, counting objects)
- Lessons with rich visualStory data and animationTemplate references
- Language/story domain content (character strokes, word reveals, story scenes)
- Age 5-6 content (more complex narratives, richer visuals)
- When TTS narration is important
- When user explicitly asks for "high quality" or "complex animation"

## Rules

1. Set `engine` to `"remotion"` when this skill is triggered.
2. Do not wait synchronously for video completion.
3. Tell the user to poll existing task-status APIs with `taskId`.
4. If `lessonId` is missing, ask for it instead of guessing.
5. Inform the user that Remotion produces videos with TTS narration and rich React-based animations.
