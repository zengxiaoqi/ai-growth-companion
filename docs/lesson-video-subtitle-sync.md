# 教学视频字幕对拍（词级时间戳）

> 目标：字幕"念到哪个字就亮哪个字"，误差 ≤1 帧；并让图形强调有真实同步信号。
> 相关：`docs/lesson-video-figure-channel.md`（画板通道）、`src/backend/src/modules/learning/subtitle-timing.ts`

## 1. 数据从哪来

Edge-TTS（`@andresaya/edge-tts`）的 `synthesize()` 在同一条 websocket 消息流里就会回
`WordBoundary`，库直接把它收进实例，`getWordBoundaries()` 可取：

```ts
{ text: '太阳', offset: 0, duration: 5000000 }   // offset/duration 单位 100ns
```

此前后端只取 `toBuffer()`，这部分数据被整条扔掉。现在：

- `VoiceService.textToSpeechWithTiming()` 返回 `{ buffer, wordBoundaries, durationMs }`；
  `textToSpeech()` 保持原签名（8 处调用零改动），内部转调它。
- `remotion-render.service.ts` 在配音后调用 `buildSubtitleCues()`，把词边界映射成
  "每个字幕 token 在第几帧点亮"，写进 props 的 `scene.subtitlePages`。

## 2. 对齐算法（为什么不能逐字比）

送进 TTS 的文本被 `sanitizeForTTS` 清洗过（去 emoji / markdown / 部分空格），
所以边界文本和屏幕文本不能按字面索引对应。做法：

1. 两侧都只保留"能念的字"（去掉 `\p{P}\p{S}` 与空白）；
2. 双指针 + 4 格前瞻匹配，跳过 emoji、被吞掉的符号、偶发错字；
3. 一个词的 `duration` 线性摊到它的每个字上（两字词不会两颗一起亮）；
4. 没对上的 token 继承前一个的时间并强制单调，不留空洞；
5. **覆盖率 <60% 直接返回 null**，模板回退到"按屏长均分"的估算口径——
   宁可承认拿不到时间戳，也不要硬塞一个错的节奏。

渲染侧（`SubtitleTrack`）两档：
- `scene.subtitlePages` 存在 → 按真实发音帧点亮，换页提前 6 帧（0.2s）露出下一句；
- 不存在 → 旧口径（每字 `perPage/字数`，封顶 10 帧/字），逐像素零回归。

场景时长也随之改为"以语音为准"：`durationFrames = max(90, 语音 + 0.3s 入画 + 0.5s 收尾)`，
不再取 `max(分镜估算, 语音)`——估算偏长就会在句末留下"念完了字幕不动"的死等。

## 3. 实测（真实配音，非估算）

`npx ts-node --transpile-only scripts/verify-subtitle-sync.ts --limit 9`
（9 个真实课程场景，用生产同一个 `VoiceService` + `buildSubtitleCues`）：

| 指标 | 结果 |
|---|---|
| 对齐覆盖率 | 9/9 场景 100% |
| 可严格交叉验证 | 9/9（旁白无 emoji，严格逐字对齐可用作独立基准）|
| 逐字最大偏差 | **0 帧（0 ms）** |
| 旧口径（按屏长均分）偏差 | 中位 0.69s，最大 2.37s |
| 场景时长 | 66.1s → 65.0s（裁掉估算超出语音的部分）|

渲染侧（`scripts/build-sync-probe.ts` + `scripts/measure-subtitle-steps.py`，
用真实配音渲 230 帧，逐帧数"已点亮字的白色像素台阶"）：

| 屏 | 对上 | 最大偏差 |
|---|---|---|
| 第 1 屏 | 17/17 字 | **0 帧** |
| 第 2 屏 | 18/19 字（1 个与上一字间隔 2 帧，人眼看是同时亮）| **0 帧** |

无时间戳路径回归：同一份预览、新旧模板各渲 62 帧逐像素比对，57 帧字节级一致，
5 帧最大差 3 灰度级——同版本二次渲染的抖动也是这个量级（799 px / 3 灰阶），
即没有功能性差异。

## 4. 怎么复验

```bash
# 1) 词级时间轴 vs 真实语音（会真的调 TTS，约 1 分钟/场景）
cd src/backend && npx ts-node --transpile-only scripts/verify-subtitle-sync.ts --limit 9 \
  --json ../video-remotion/out/subtitle-sync.json

# 2) 渲染侧对拍：生成探针 props（含真实配音 mp3）
npx ts-node --transpile-only scripts/build-sync-probe.ts --scene 0
cd ../video-remotion && npx remotion render src/__preview/index.ts LessonPreview \
  out/sync-probe/frames --sequence --image-format=png \
  --props=out/sync-probe/props.json --frames=0-229
cd ../backend && python scripts/measure-subtitle-steps.py --dir ../video-remotion/out/sync-probe
```

## 5. 已知边界

- **只有动态场景链路有词边界**（`tryGenerateNarrationAudio`）。`TeachingVideoData`
  的 slides 链路（`generateNarrationAudioFiles`）仍走 `textToSpeech()`，字幕是模板
  自己按字数排的，没有逐字概念。
- **6 秒最短场景**：`parseMp3DurationFrames` 的 `MIN_FRAMES` 让短旁白也占 6s，
  句末空等 1.5~2s 是这条约束造成的，不是字幕问题。
- **换页切分仍是估算**：每屏最多 30 字、优先切标点，与语音停顿无关；只有屏内逐字
  是精确的。要按喘息切屏需要 boundary 的标点停顿信息（Edge 的 `sentenceBoundaries`
  可以再挖）。
- **字幕时间戳不能用于图形强调**之前要先验证：`subtitlePages` 只解决了字幕；
  让图形跟着"念到哪个词"走是下一件事（beats 目前仍按拍硬切）。
