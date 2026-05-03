---
id: video-generation-orchestrator
name: Video Generation Orchestrator
description: Full-pipeline video generation skill: storyboard → composition → render → quality review. Intelligently select engine and orchestrate the entire video creation workflow.
triggers:
  - 生成教学视频
  - 制作教学视频
  - 视频生成
  - 生成视频
  - create teaching video
  - generate video
  - make video
requiredTools:
  - generateVideoContent
  - renderHyperframes
  - renderRemotion
  - reviewVideoQuality
variables:
  - name: topic
    type: string
    required: true
    description: Video topic
  - name: ageGroup
    type: string
    required: false
    defaultValue: "5-6"
    description: Target age group (3-4 or 5-6)
  - name: domain
    type: string
    required: false
    description: Subject domain (language, math, science, art, social)
  - name: preferredEngine
    type: string
    required: false
    defaultValue: hyperframes
    description: Preferred render engine (hyperframes|remotion)
---

## Full-Pipeline Video Generation Workflow

When asked to generate a teaching video, follow this workflow:

### Step 1: Generate Storyboard Content

Call `generateVideoContent` with:
- `topic`: the video topic
- `ageGroup`: target age group
- `domain`: subject domain (if known)
- `sceneCount`: 5 (default)

The tool returns a structured storyboard with scenes, narrations, visual descriptions, and animation templates.

### Step 2: Author Composition

Based on the storyboard, write the rendering composition:

**For HyperFrames (default):**
1. Use `writeFile` to create an HTML file with GSAP animations
2. Follow the `hyperframes` skill rules for HTML structure
3. Each scene becomes a `<section class="scene">` with GSAP timelines
4. Use storyboard's `visualDescription` for visual composition
5. Use storyboard's `transitionToNext` for scene transitions
6. Use storyboard's `visualTheme` for color palette

**For Remotion:**
1. Use `writeFile` to write React component with props
2. Follow `remotion-video-creation` skill rules
3. Map storyboard scenes to Remotion `<Sequence>` components

### Step 3: Render

**HyperFrames:** Call `renderHyperframes` with the HTML composition.
**Remotion:** Call `renderRemotion` with composition ID and props.

### Step 4: Quality Review

Call `reviewVideoQuality` with:
- `topic`: original topic
- `scenes`: the generated storyboard scenes
- `narrations`: all narration texts

If score < 70 or `passed` is false:
1. Read the `issues` and `suggestions` from the review
2. Regenerate affected content via `generateVideoContent`
3. Rewrite and re-render the composition
4. Re-review (max 2 retry cycles)

### Step 5: Return Result

Report:
- Video file path
- Quality score
- Number of scenes
- Total duration
- Engine used

## Engine Selection Rules

### Priority 1: User Preference
- "hyperframes" or "快速视频" → HyperFrames
- "remotion" or "高质量" → Remotion

### Priority 2: Domain-Based Selection

| Domain | Recommended Engine | Reason |
|--------|-------------------|--------|
| language (识字、汉字) | `"hyperframes"` | Quick turnaround for character/word animations |
| math (counting, 3-4 age) | `"hyperframes"` | Simple slides, bright colors |
| math (shapes, 5-6 age) | `"remotion"` | Complex shape builder animations |
| science (all topics) | `"remotion"` | Rich p5.js animations for plant growth, water cycle |
| art (all topics) | `"remotion"` | Interactive color mixing, drawing steps |
| social (all topics) | `"hyperframes"` | Simple emotion/routine slides |

### Priority 3: Age Group
- Age 3-4 → prefer `"hyperframes"` (simpler, faster)
- Age 5-6 → prefer `"remotion"` (richer animations)

## Rules

1. Always run quality review after rendering.
2. Retry up to 2 times if quality score < 70.
3. Use storyboard `visualDescription` to guide composition authoring.
4. Keep narrations warm, specific, and topic-relevant.
5. Never use generic templates like "请和老师一起学习".
