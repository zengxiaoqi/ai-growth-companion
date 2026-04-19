/**
 * enrich-course-json.ts
 *
 * Batch-enrich existing course JSON files with `visualStory` and `videoLesson`
 * fields so the video pipeline produces richer content without relying on LLM
 * fallback generation.
 *
 * Usage:
 *   npx ts-node scripts/enrich-course-json.ts [--dry-run]
 *
 * - Without --dry-run: writes enriched JSON back to each file
 * - With --dry-run: prints a summary of what would be generated
 */

import * as fs from 'fs';
import * as path from 'path';

const CONTENT_ROOT = path.resolve(process.cwd(), 'src', 'content');
const AGE_DIRS = ['3-4-years', '5-6-years'];
const DRY_RUN = process.argv.includes('--dry-run');

interface CourseRecord {
  id?: string;
  name?: string;
  ageRange?: string;
  domain?: string;
  duration?: number;
  difficulty?: number;
  objectives?: string[];
  content?: any[];
  visualStory?: any;
  videoLesson?: any;
  [key: string]: any;
}

// ──────────────────────────────────────────────
// Template suggestion (mirrors animation-templates.ts logic)
// ──────────────────────────────────────────────

function suggestTemplate(domain: string, text: string): string {
  const t = text.trim();

  if (domain === 'language' || domain === 'literacy') {
    if (/(汉字|识字|拼音|词语|词汇|朗读|阅读|认字|生字|写字|笔画|偏旁|部首)/.test(t)) return 'language.word-reveal';
    if (/(故事|绘本|对话|情景|童话|寓言|儿歌|古诗|诗歌)/.test(t)) return 'language.story-scene';
    return 'language.word-reveal';
  }
  if (domain === 'math') {
    if (/(计数|数数|加法|减法|数量|一共|还剩|分成)/.test(t)) return 'math.counting-objects';
    if (/(形状|三角|圆形|方形|图形)/.test(t)) return 'math.shape-builder';
    if (/算盘/.test(t)) return 'math.abacus';
    if (/(数字|数轴|排序|顺序|比大小|规律)/.test(t)) return 'math.number-line';
    return 'math.counting-objects';
  }
  if (domain === 'science') {
    if (/(四季|季节|春夏秋冬)/.test(t)) return 'science.seasons-cycle';
    if (/(水循环|下雨|蒸发|云|雨|雪|冰)/.test(t)) return 'science.water-cycle';
    if (/(白天|黑夜|昼夜|地球|太阳|月亮)/.test(t)) return 'science.day-night-cycle';
    if (/(植物|种子|发芽|开花|树|花|动物|昆虫|食物|水果|身体)/.test(t)) return 'science.plant-growth';
    return 'science.plant-growth';
  }
  if (domain === 'art') {
    if (/(颜色|色彩|调色|混色)/.test(t)) return 'art.color-mixing';
    return 'art.drawing-steps';
  }
  if (domain === 'social') {
    if (/(情绪|表情|开心|生气|难过|害怕)/.test(t)) return 'social.emotion-faces';
    return 'social.daily-routine';
  }
  return 'language.story-scene';
}

// ──────────────────────────────────────────────
// Background inference
// ──────────────────────────────────────────────

function inferBgType(text: string): string {
  if (/(夜|晚上|星星|月亮|黑夜|睡觉)/.test(text)) return 'night';
  if (/(春|花开|发芽|播种)/.test(text)) return 'spring';
  if (/(夏|热|太阳大|游泳|西瓜)/.test(text)) return 'summer';
  if (/(秋|落叶|丰收|果实)/.test(text)) return 'autumn';
  if (/(冬|雪|冷|棉袄)/.test(text)) return 'winter';
  if (/(教室|课堂|室内|家|房间)/.test(text)) return 'indoor';
  return 'day';
}

// ──────────────────────────────────────────────
// Character/item extraction
// ──────────────────────────────────────────────

function extractCharacters(text: string): string[] {
  const patterns: [RegExp, string][] = [
    [/(猫|小猫|猫咪)/, '小猫'], [/(狗|小狗|狗狗)/, '小狗'],
    [/(兔|小兔|兔子)/, '小兔子'], [/(牛|奶牛|小牛)/, '小牛'],
    [/(羊|小羊)/, '小羊'], [/(鸡|小鸡)/, '小鸡'],
    [/(鸟|小鸟)/, '小鸟'], [/(鱼|小鱼)/, '小鱼'],
    [/(老师|教师)/, '老师'], [/(小朋友|孩子|宝宝)/, '小朋友'],
  ];
  const found: string[] = [];
  for (const [regex, label] of patterns) {
    if (regex.test(text) && !found.includes(label)) found.push(label);
  }
  if (found.length === 0) found.push('老师', '小朋友');
  return found.slice(0, 4);
}

function extractItems(text: string): string[] {
  const patterns: [RegExp, string][] = [
    [/(太阳)/, '太阳'], [/(月亮)/, '月亮'], [/(星星)/, '星星'],
    [/(花|花朵)/, '花'], [/(树|树木)/, '树'], [/(草|小草)/, '草'],
    [/(苹果)/, '苹果'], [/(香蕉)/, '香蕉'], [/(西瓜)/, '西瓜'],
    [/(蝴蝶)/, '蝴蝶'], [/(云|白云)/, '云'], [/(雨|下雨)/, '雨'],
    [/(雪|下雪)/, '雪'], [/(球|皮球)/, '球'], [/(书|书本)/, '书'],
  ];
  const found: string[] = [];
  for (const [regex, label] of patterns) {
    if (regex.test(text) && !found.includes(label)) found.push(label);
  }
  return found.slice(0, 4);
}

// ──────────────────────────────────────────────
// Mood inference
// ──────────────────────────────────────────────

function inferMood(text: string): 'playful' | 'calm' | 'exciting' | 'mysterious' | 'warm' {
  if (/(开心|快乐|好玩|游戏|玩|笑)/.test(text)) return 'playful';
  if (/(安静|轻轻|慢慢|温柔)/.test(text)) return 'calm';
  if (/(发现|探索|惊喜|哇)/.test(text)) return 'exciting';
  if (/(神奇|奇妙|秘密|魔法)/.test(text)) return 'mysterious';
  if (/(温暖|拥抱|爱|家|妈妈|爸爸)/.test(text)) return 'warm';
  return 'playful';
}

// ──────────────────────────────────────────────
// Core enrichment logic
// ──────────────────────────────────────────────

function enrichCourse(course: CourseRecord): CourseRecord {
  // Skip if already has visualStory with scenes
  if (course.visualStory?.scenes?.length > 0) {
    return course;
  }

  const domain = course.domain || 'language';
  const topic = course.name || '';
  const contentBlocks = Array.isArray(course.content) ? course.content : [];

  // Build visualStory scenes from story/lesson blocks
  const scenes = buildScenesFromContent(contentBlocks, domain, topic);

  // Build videoLesson shots
  const shots = buildShotsFromContent(contentBlocks, topic);

  const enriched = { ...course };

  if (scenes.length > 0) {
    enriched.visualStory = {
      style: 'colorful-educational',
      scenes,
    };
  }

  if (shots.length > 0) {
    enriched.videoLesson = {
      title: `${topic}动画课`,
      durationSec: shots.reduce((sum, s) => sum + (s.durationSec || 10), 0),
      shots,
    };
  }

  return enriched;
}

function buildScenesFromContent(
  contentBlocks: any[],
  domain: string,
  topic: string,
): any[] {
  const storyBlocks = contentBlocks.filter(b => b.type === 'story' || b.type === 'lesson');
  const scenes: any[] = [];

  // Scene 1: Introduction
  scenes.push({
    scene: `欢迎来到${topic}`,
    imagePrompt: `明亮的卡通场景，${topic}主题，小朋友和老师在一起，温暖的色调`,
    narration: `小朋友好！今天我们一起来学习${topic}。准备好了吗？让我们开始吧！`,
    onScreenText: topic,
    durationSec: 10,
    animationTemplate: suggestTemplate(domain, topic),
    animationParams: {
      bgType: 'day',
      characters: ['老师', '小朋友'],
    },
  });

  // Scenes from story content
  for (const block of storyBlocks) {
    const text = block.text || '';
    const title = block.title || '';

    // Split by paragraphs (double newline) or dialog turns
    let paragraphs = text.split(/\n\n/).filter((p: string) => p.trim().length > 5);
    if (paragraphs.length < 2) {
      // Fall back to sentence splitting for compact single-paragraph stories
      paragraphs = text.split(/[。！？]/).filter((s: string) => s.trim().length > 3);
    }

    for (let i = 0; i < Math.min(paragraphs.length, 6); i++) {
      const para = paragraphs[i].trim();
      const characters = extractCharacters(para);
      const items = extractItems(para);

      scenes.push({
        scene: title ? `${title}·${i + 1}` : `${topic}·场景${scenes.length}`,
        imagePrompt: `${topic}场景：${para.slice(0, 40)}，卡通教育风格，明亮温暖`,
        narration: para.endsWith('。') || para.endsWith('！') || para.endsWith('？') ? para : `${para}。`,
        onScreenText: extractKeyPhrase(para, topic),
        durationSec: Math.max(8, Math.min(16, Math.round(para.length / 4))),
        animationTemplate: suggestTemplate(domain, para),
        animationParams: {
          bgType: inferBgType(para),
          characters,
          items: items.length > 0 ? items : undefined,
        },
      });
    }
  }

  // Scenes from questions (interactive thinking moments)
  const questions = contentBlocks
    .flatMap(b => Array.isArray(b.questions) ? b.questions : [])
    .slice(0, 2);

  for (const q of questions) {
    const qText = q.q || q.question || '';
    if (!qText) continue;

    scenes.push({
      scene: `思考时间`,
      imagePrompt: `思考时间：${qText.slice(0, 30)}，小朋友在思考，问号气泡，卡通风格`,
      narration: `小朋友，动动小脑筋想一想：${qText}`,
      onScreenText: `🤔 ${qText.slice(0, 10)}`,
      durationSec: 10,
      animationTemplate: 'language.story-scene',
      animationParams: {
        bgType: 'indoor',
        characters: ['小朋友'],
        items: ['问号', '书本'],
      },
    });
  }

  // Final scene: summary
  const objectives = Array.isArray(contentBlocks[0]?.objectives)
    ? contentBlocks[0].objectives
    : [];
  scenes.push({
    scene: `${topic}总结`,
    imagePrompt: `${topic}总结场景，小朋友和老师开心地挥手，彩色背景`,
    narration: `今天我们学了${topic}，你记住了吗？下次我们再一起学习更多有趣的知识吧！`,
    onScreenText: `再见！`,
    durationSec: 10,
    animationTemplate: suggestTemplate(domain, topic),
    animationParams: {
      bgType: 'day',
      characters: ['老师', '小朋友'],
    },
  });

  return scenes;
}

function buildShotsFromContent(contentBlocks: any[], topic: string): any[] {
  const storyBlocks = contentBlocks.filter(b => b.type === 'story' || b.type === 'lesson');
  const shots: any[] = [];

  // Intro shot
  shots.push({
    shot: '导入',
    narration: `小朋友好，今天我们一起学习${topic}！`,
    caption: topic,
    durationSec: 8,
  });

  for (const block of storyBlocks) {
    const text = block.text || '';
    const firstSentence = text.split(/[。！？]/)[0]?.trim() || text.slice(0, 50);
    shots.push({
      shot: block.title || `${topic}讲解`,
      narration: firstSentence.length > 50 ? `${firstSentence.slice(0, 47)}...` : firstSentence,
      caption: (block.title || firstSentence).slice(0, 12),
      durationSec: Math.max(8, Math.min(16, Math.round(firstSentence.length / 4))),
    });
  }

  // Outro shot
  shots.push({
    shot: '总结',
    narration: `今天我们学了${topic}，下次再见！`,
    caption: '再见',
    durationSec: 8,
  });

  return shots;
}

function extractKeyPhrase(text: string, topic: string): string {
  // Try quoted phrase
  const quoted = text.match(/[""\u201c]([^""\u201d]{2,12})[""\u201d]/);
  if (quoted?.[1]) return quoted[1];

  // First meaningful Chinese phrase
  const phrases = (text.match(/[\u4e00-\u9fff]{2,10}/g) || [])
    .filter(p => !['小朋友', '我们', '一起', '看看', '今天', '大家'].includes(p));
  return phrases[0]?.slice(0, 10) || topic.slice(0, 10) || '学习中';
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

function main() {
  let totalFiles = 0;
  let enrichedCount = 0;
  let skippedCount = 0;

  for (const ageDir of AGE_DIRS) {
    const dirPath = path.join(CONTENT_ROOT, ageDir);
    if (!fs.existsSync(dirPath)) {
      console.log(`⚠️  Directory not found: ${dirPath}`);
      continue;
    }

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
    console.log(`\n📁 ${ageDir} (${files.length} files)`);

    for (const file of files) {
      totalFiles++;
      const filePath = path.join(dirPath, file);
      const raw = fs.readFileSync(filePath, 'utf-8');
      let course: CourseRecord;
      try {
        course = JSON.parse(raw);
      } catch {
        console.log(`  ❌ ${file}: invalid JSON, skipping`);
        continue;
      }

      if (course.visualStory?.scenes?.length > 0) {
        console.log(`  ⏭️  ${file}: already has visualStory (${course.visualStory.scenes.length} scenes), skipping`);
        skippedCount++;
        continue;
      }

      const enriched = enrichCourse(course);
      const sceneCount = enriched.visualStory?.scenes?.length || 0;
      const shotCount = enriched.videoLesson?.shots?.length || 0;

      if (DRY_RUN) {
        console.log(`  📝 ${file}: would add ${sceneCount} scenes, ${shotCount} shots (topic: ${course.name})`);
      } else {
        fs.writeFileSync(filePath, JSON.stringify(enriched, null, 2) + '\n', 'utf-8');
        console.log(`  ✅ ${file}: added ${sceneCount} scenes, ${shotCount} shots`);
      }
      enrichedCount++;
    }
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`📊 Summary: ${totalFiles} files total, ${enrichedCount} enriched, ${skippedCount} skipped`);
  if (DRY_RUN) {
    console.log(`ℹ️  This was a dry run. Run without --dry-run to write changes.`);
  }
}

main();
