---
id: hyperframes-video-creation
name: HyperFrames Teaching Video Creation
description: Generate teaching videos using HyperFrames engine with rich HTML+GSAP compositions, domain-specific color palettes, varied entrance animations, and scene transitions.
triggers:
  - 教学视频
  - 课程视频
  - 生成视频
  - hyperframes视频
  - 快速视频
  - teaching video
  - video task
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
    defaultValue: auto
    description: Render engine mode, auto prefers HyperFrames and falls back to Remotion
  - name: force
    type: boolean
    required: false
    defaultValue: false
    description: Whether to skip cache and enqueue a fresh task
---

When user asks to generate a lesson teaching video, call `enqueueTeachingVideo` and return:

- taskId
- status
- progress
- renderEngine
- provider

## Engine Capabilities

HyperFrames generates HTML+GSAP video compositions with:
- **Domain-specific palettes**: language (warm reds), math (blues/greens), science (cyan/green), art (pinks/yellows), social (yellows/greens)
- **Varied entrance animations**: scale bounce, slide from left/right, fade up, rotate in — each element uses a different pattern
- **Scene transitions**: fade, slide, wipe transitions between scenes (no jump cuts)
- **Decorative elements**: geometric shapes (circles, squares, diamonds, triangles) with slow breathing animation for visual depth
- **Typography**: Fredoka (headlines) + Nunito (body) fonts, sized for video (96px titles, 52px captions)
- **Folk Frequency visual style**: warm, playful, child-friendly palette inspired by children's educational content

## When to Use HyperFrames

- Quick-to-medium complexity slides
- Lessons with clear scene breakdowns (6-16 scenes)
- Age 3-4 content (simpler visuals, bright colors)
- When user needs fast turnaround

## Rules

1. Default `engine` to `auto` unless user explicitly asks for `hyperframes` or `remotion`.
2. Do not wait synchronously for video completion.
3. Tell the user to poll existing task-status APIs with `taskId`.
4. If `lessonId` is missing, ask for it instead of guessing.
5. Inform the user that HyperFrames uses domain-specific color palettes and rich animations.
