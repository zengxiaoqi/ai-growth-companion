// End-to-end Flutter-web player verification (headless Chrome).
// Drives login -> 生成视频 -> 历史记录 -> 查看视频 x2 and asserts the <video>
// (a platform view inside Flutter's shadow DOM) actually advances currentTime.
// Exits 0 only when >=2 distinct videos play. Screenshots -> storage/qa/player-verify/.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FONT = 'C:/Windows/Fonts/msyh.ttc';
const OUT = 'storage/qa/player-verify';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Walk shadow roots to collect <video> elements (platform views live in shadow DOM).
const FIND_VIDEO = `(() => {
  const vids = [];
  const walk = (root) => {
    root.querySelectorAll('video').forEach((v) => vids.push(v));
    root.querySelectorAll('*').forEach((el) => { if (el.shadowRoot) walk(el.shadowRoot); });
  };
  walk(document);
  return vids.map((v) => ({ src: (v.currentSrc || v.src || '').slice(-60), ready: v.readyState, paused: v.paused, t: v.currentTime, dur: v.duration }));
})()`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, defaultViewport: { width: 1280, height: 900 } });
  const p = await b.newPage();
  const localFont = fs.readFileSync(FONT);
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    if (/fonts\.gstatic|fonts\.googleapis/.test(r.url())) {
      r.respond({ status: 200, contentType: 'font/ttc', headers: { 'Access-Control-Allow-Origin': '*' }, body: localFont });
    } else r.continue();
  });
  p.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));

  await p.goto('http://localhost:8092/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(9000);
  // login (fixed centered layout)
  await p.mouse.click(640, 421); await p.keyboard.type('13800000001', { delay: 25 });
  await p.mouse.click(640, 489); await p.keyboard.type('password123', { delay: 25 });
  await p.mouse.click(640, 603);
  await sleep(6000);
  // parent home -> 生成视频
  await p.mouse.click(797, 573); await sleep(4000);
  // 历史记录 tab
  await p.mouse.click(950, 113); await sleep(3000);

  const playButtons = [[1183, 631], [1183, 851]];
  let advanced = 0;
  for (let i = 0; i < playButtons.length; i++) {
    await p.mouse.click(playButtons[i][0], playButtons[i][1]);
    await sleep(6000);
    await p.screenshot({ path: `${OUT}/play-${i + 1}.png` });
    // ensure playing then sample currentTime over 3s
    await p.evaluate(`(() => { const walk=(root)=>{root.querySelectorAll('video').forEach(v=>{if(v.paused)v.play().catch(()=>{});});root.querySelectorAll('*').forEach(el=>{if(el.shadowRoot)walk(el.shadowRoot);});};walk(document);})()`);
    const before = await p.evaluate(FIND_VIDEO);
    await sleep(3000);
    const after = await p.evaluate(FIND_VIDEO);
    console.log(`VIDEO${i + 1}_BEFORE`, JSON.stringify(before));
    console.log(`VIDEO${i + 1}_AFTER`, JSON.stringify(after));
    const ok = after.some((v, idx) => v.ready >= 2 && !v.paused && before[idx] && v.t > before[idx].t + 0.1);
    if (ok) advanced++;
    console.log(`VIDEO${i + 1}_ADVANCED`, ok);
    // back to history (top-left back button)
    await p.mouse.click(40, 32); await sleep(3000);
    // re-open history tab (back lands on generator 生成 tab)
    await p.mouse.click(950, 113); await sleep(2500);
  }
  console.log('ADVANCED_COUNT', advanced);
  await b.close();
  process.exit(advanced >= 2 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });