#!/usr/bin/env node
// Fetch open-licensed learning data (hanzi-writer-data / Twemoji / pinyin-data)
// into src/frontend/assets and enrich src/content course JSON (pinyin / emoji keys).
// Usage: node scripts/fetch-open-data.mjs [--dry-run] [--force]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_DIR = path.join(ROOT, 'src', 'content');
const ASSETS = path.join(ROOT, 'src', 'frontend', 'assets');
const DRY = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

const isPictographic = (c) => /\p{Extended_Pictographic}/u.test(c);
const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const isEmojiString = (s) => {
  const cps = [...s.trim()];
  return cps.length > 0 && cps.some(isPictographic) && cps.every((c) => isPictographic(c) || c === '️' || c === '‍');
};
const emojiHex = (e) => [...e].map((c) => c.codePointAt(0).toString(16)).filter((h) => h !== 'fe0f').join('-');

const courses = [];
for (const dir of ['3-4-years', '5-6-years']) {
  for (const f of fs.readdirSync(path.join(CONTENT_DIR, dir)).filter((f) => f.endsWith('.json')).sort()) {
    courses.push({ rel: `${dir}/${f}`, file: path.join(CONTENT_DIR, dir, f), data: JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, dir, f), 'utf8')) });
  }
}

const chars = new Set();
const emojis = new Set();
const walk = (v, fn) => {
  if (typeof v === 'string') fn(v);
  else if (Array.isArray(v)) v.forEach((x) => walk(x, fn));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => walk(x, fn));
};
for (const { data } of courses) {
  for (const block of data.content ?? []) {
    for (const c of block.characters ?? []) if (c.char) chars.add(c.char);
    for (const t of block.tracing ?? []) if (/^[一-龥]$/.test(t)) chars.add(t);
  }
  walk(data.content, (s) => { for (const m of s.matchAll(EMOJI_RE)) emojis.add(m[0]); });
}

const hanziUrls = (ch) => [
  `https://unpkg.com/hanzi-writer-data@2.0.1/${encodeURIComponent(ch)}.json`,
  `https://fastly.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(ch)}.json`,
  `https://fastly.jsdelivr.net/gh/chanind/hanzi-writer-data@master/data/${encodeURIComponent(ch)}.json`,
  `https://raw.githubusercontent.com/chanind/hanzi-writer-data/master/data/${encodeURIComponent(ch)}.json`,
];
const twemojiUrls = (hex) => [
  `https://fastly.jsdelivr.net/gh/jdecked/twemoji@main/assets/svg/${hex}.svg`,
  `https://gcore.jsdelivr.net/gh/jdecked/twemoji@main/assets/svg/${hex}.svg`,
  `https://cdn.jsdelivr.net/gh/jdecked/twemoji@main/assets/svg/${hex}.svg`,
];
const PINYIN_URLS = [
  'https://fastly.jsdelivr.net/gh/mozillazg/pinyin-data@master/kMandarin_8105.txt',
  'https://gcore.jsdelivr.net/gh/mozillazg/pinyin-data@master/kMandarin_8105.txt',
  'https://raw.githubusercontent.com/mozillazg/pinyin-data/master/kMandarin_8105.txt',
];
const LICENSES = [
  { dest: 'ARPHICPL.TXT', urls: ['https://unpkg.com/hanzi-writer-data@2.0.1/ARPHICPL.TXT', 'https://fastly.jsdelivr.net/gh/chanind/hanzi-writer-data@master/ARPHICPL.TXT'] },
  { dest: 'TWEMOJI-LICENSE.txt', urls: ['https://unpkg.com/twemoji@14.0.2/LICENSE', 'https://fastly.jsdelivr.net/gh/jdecked/twemoji@main/LICENSE'] },
  { dest: 'PINYIN-DATA-LICENSE.txt', urls: ['https://fastly.jsdelivr.net/gh/mozillazg/pinyin-data@master/LICENSE', 'https://gcore.jsdelivr.net/gh/mozillazg/pinyin-data@master/LICENSE'] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchFirst(urls, validate) {
  const errors = [];
  for (const url of urls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Accept: '*/*' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        validate(text);
        return text;
      } catch (e) {
        errors.push(`${url} (${e.message})`);
        await sleep(600 * (attempt + 1));
      }
    }
  }
  throw new Error(`all hosts failed:\n  ${errors.join('\n  ')}`);
}
async function pool(items, limit, fn) {
  const queue = [...items.entries()];
  const results = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (queue.length) {
      const [i, item] = queue.shift();
      results[i] = await fn(item);
    }
  }));
  return results;
}
const writeAsset = (rel, text) => {
  const dest = path.join(ASSETS, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, text);
};

const ATTRIBUTION = `# 开源数据与许可 (Open Data Attribution)

本应用内置以下开放授权数据，仅用于儿童教育目的：

## 汉字笔顺数据 — hanzi-writer-data
- 来源: https://github.com/chanind/hanzi-writer-data (derived from Make Me a Hanzi)
- 版权: © Arphic Technology Co., Ltd.
- 许可: Arphic Public License (全文见 ARPHICPL.TXT)

## 插图 — Twemoji
- 来源: https://github.com/jdecked/twemoji
- 版权: © Twitter, Inc and contributors
- 许可: CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/)，全文见 TWEMOJI-LICENSE.txt

## 拼音读音 — pinyin-data
- 来源: https://github.com/mozillazg/pinyin-data
- 版权: © mozillazg
- 许可: MIT，全文见 PINYIN-DATA-LICENSE.txt

## 笔顺动画组件 — stroke_order_animator
- 来源: https://github.com/chill-chinese/stroke-order-animator
- 许可: BSD-3-Clause
`;

console.log(`courses: ${courses.length}, hanzi chars: ${[...chars].join('')}, emojis: ${emojis.size}`);
if (DRY) {
  console.log('[dry-run] would fetch:');
  console.log(`  hanzi  -> assets/hanzi/{${[...chars].join(',')}}.json`);
  console.log(`  twemoji-> assets/twemoji/{${[...emojis].map(emojiHex).join(',')}}.svg`);
  console.log(`  licenses -> ${LICENSES.map((l) => l.dest).join(', ')}`);
  console.log('  pinyin -> enrich characters[].pinyin; normalize emoji keys; write manifest.json + ATTRIBUTION.md');
  process.exit(0);
}

const failures = [];
await pool([...chars], 4, async (ch) => {
  const rel = `hanzi/${ch}.json`;
  if (fs.existsSync(path.join(ASSETS, rel)) && !FORCE) return;
  try {
    const text = await fetchFirst(hanziUrls(ch), (t) => {
      const j = JSON.parse(t);
      if (!Array.isArray(j.strokes) || !Array.isArray(j.medians) || j.strokes.length !== j.medians.length) throw new Error('bad strokes/medians');
    });
    writeAsset(rel, text);
    console.log(`  ✔ hanzi ${ch}`);
  } catch (e) { failures.push(`hanzi ${ch}: ${e.message}`); }
});
await pool([...emojis], 4, async (e) => {
  const rel = `twemoji/${emojiHex(e)}.svg`;
  if (fs.existsSync(path.join(ASSETS, rel)) && !FORCE) return;
  try {
    const text = await fetchFirst(twemojiUrls(emojiHex(e)), (t) => { if (!t.includes('<svg')) throw new Error('not svg'); });
    writeAsset(rel, text);
  } catch (err) { failures.push(`twemoji ${e}: ${err.message}`); }
});
console.log(`  ✔ twemoji ${emojis.size} svgs`);
for (const l of LICENSES) {
  if (fs.existsSync(path.join(ASSETS, 'licenses', l.dest)) && !FORCE) continue;
  try { writeAsset(`licenses/${l.dest}`, await fetchFirst(l.urls, (t) => { if (t.length < 50) throw new Error('too short'); })); console.log(`  ✔ license ${l.dest}`); }
  catch (e) { failures.push(`license ${l.dest}: ${e.message}`); }
}

const pinyinMap = new Map();
try {
  const txt = await fetchFirst(PINYIN_URLS, (t) => { if (!t.includes('U+')) throw new Error('bad pinyin table'); });
  for (const line of txt.split('\n')) {
    const m = line.match(/^U\+([0-9A-Fa-f]+):\s*([^#\s]+)/);
    if (m) pinyinMap.set(String.fromCodePoint(parseInt(m[1], 16)), m[2].split(',')[0]);
  }
  console.log(`  ✔ pinyin table ${pinyinMap.size} entries`);
} catch (e) { failures.push(`pinyin: ${e.message}`); }

let enriched = 0;
for (const c of courses) {
  let changed = false;
  for (const block of c.data.content ?? []) {
    for (const entry of block.characters ?? []) {
      const py = pinyinMap.get(entry.char);
      if (py && entry.pinyin !== py) { entry.pinyin = py; changed = true; }
    }
  }
  const normalize = (v) => {
    if (Array.isArray(v)) { v.forEach(normalize); return; }
    if (v && typeof v === 'object') {
      if (v.emoji === undefined) {
        for (const k of ['animal', 'item']) {
          if (typeof v[k] === 'string' && isEmojiString(v[k])) { v.emoji = v[k]; changed = true; break; }
        }
      }
      Object.values(v).forEach(normalize);
    }
  };
  normalize(c.data.content);
  if (changed) {
    fs.writeFileSync(c.file, JSON.stringify(c.data, null, 2) + '\n');
    enriched++;
    console.log(`  ✎ enriched ${c.rel}`);
  }
}

writeAsset('twemoji/manifest.json', JSON.stringify(Object.fromEntries([...emojis].map((e) => [e, `${emojiHex(e)}.svg`])), null, 2) + '\n');
writeAsset('licenses/ATTRIBUTION.md', ATTRIBUTION);

const missing = [];
for (const ch of chars) if (!fs.existsSync(path.join(ASSETS, `hanzi/${ch}.json`))) missing.push(`hanzi/${ch}.json`);
for (const e of emojis) if (!fs.existsSync(path.join(ASSETS, `twemoji/${emojiHex(e)}.svg`))) missing.push(`twemoji/${emojiHex(e)}.svg`);
if (missing.length) failures.push(`missing assets: ${missing.join(', ')}`);

console.log(`\ndone: enriched ${enriched} course files, failures ${failures.length}`);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }