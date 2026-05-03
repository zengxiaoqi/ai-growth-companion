---
id: video-content-gen
name: Video Content Generation
description: Generate high-quality educational video storyboard content with topic-specific narration, visual descriptions, and animation templates for children aged 3-6.
triggers:
  - 视频内容
  - 分镜脚本
  - 视频脚本
  - video content
  - storyboard
requiredTools:
  - generateVideoContent
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
    description: Subject domain
  - name: sceneCount
    type: number
    required: false
    defaultValue: 5
    description: Number of scenes (4-8)
---

# Video Content Generation Guidelines

## Storyboard Structure

Every video MUST follow this narrative arc:

1. **Intro scene** (1 scene): Hook the child's attention, introduce the topic with excitement
2. **Core concept scenes** (2-4 scenes): Teach key knowledge points, one per scene
3. **Example/practice scene** (0-1 scenes): Show how the concept applies
4. **Summary scene** (1 scene): Recap key points, celebrate learning

## Narration Quality Standards

### MUST DO:
- Every narration must contain SPECIFIC knowledge about the topic
- Use warm, conversational teacher-child tone
- Include sensory details (color, shape, sound, movement)
- 40-80 Chinese characters per narration
- 2-3 complete sentences

### FORBIDDEN patterns:
- "请和老师一起学习" (too generic)
- "我们来看看" (no substance)
- "请跟着老师" (no teaching content)
- "我们一起来" (meaningless)
- Any narration shorter than 30 characters
- Narrations that could apply to ANY topic

### Good examples by domain:

**Science (认识动物兔子):**
"小朋友，这是小兔子！兔子有长长的耳朵，短短的尾巴，最喜欢吃胡萝卜和青草。它跳起来蹦蹦跳跳的，好可爱呀！"

**Math (认识数字5):**
"看！这里有五颗小星星，我们一起来数一数：一、二、三、四、五！五颗星星亮晶晶，就像天空中的小眼睛在眨呀眨。"

**Language (认识汉字大):**
"'大'字真有趣！一横一撇一捺，就像一个人张开双臂站得大大的。小朋友也来试试，把手张开，你就是个'大'人啦！"

**Art (认识颜色):**
"红色好漂亮呀！红红的苹果、红红的花朵、红红的小雨伞。生活中有好多红色的东西，找找看，你身边有没有红色的呢？"

**Social (认识情绪):**
"开心的时候我们会笑，嘴角翘起来，眼睛弯弯的像月牙。当你和好朋友一起玩玩具的时候，是不是就觉得很开心呢？"

## Visual Description Guidelines

Each scene's `visualDescription` must include:
1. **Background**: What the scene looks like (day/night/indoor, season, specific setting)
2. **Characters**: Who is in the scene and what they are doing (pose, action, expression)
3. **Items**: Key objects and their positions
4. **Mood**: The emotional atmosphere (playful/calm/exciting/mysterious/warm)

Example: "蓝天白云下的绿色草地上，小兔子坐在中间吃胡萝卜，周围有红色的花朵和黄色的蝴蝶飞舞，老师和小朋犰站在旁边微笑观看"

## Animation Template Selection

Choose templates based on scene CONTENT, not just domain:
- Scene about a Chinese character → `language.character-stroke`
- Scene about counting objects → `math.counting-objects`
- Scene about animal behavior → `language.story-scene`
- Scene about seasons/weather → `science.seasons-cycle`
- Scene about plant growth → `science.plant-growth`
- Scene about emotions → `social.emotion-faces`
- Scene about colors → `art.color-mixing`

Fill in ALL template parameters with topic-specific values.

## Age-Appropriate Content

### Age 3-4:
- Simpler vocabulary (认识、喜欢、看)
- Shorter sentences (15-25 chars)
- More sensory language (颜色、声音、触感)
- Repetition and rhythm

### Age 5-6:
- Slightly richer vocabulary (观察、发现、比较)
- Longer sentences (25-40 chars)
- More factual knowledge
- "Why" questions to encourage thinking
