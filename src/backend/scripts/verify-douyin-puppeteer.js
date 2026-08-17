/**
 * Douyin Puppeteer smoke test — verifies the headless-Chromium extraction path
 * used by video-download.service.ts (fetchDouyinVideoData).
 *
 * Tier 1 verification artifact: does NOT modify production code. Run manually:
 *   cd src/backend && /usr/bin/node scripts/verify-douyin-puppeteer.js [optional-douyin-url]
 *
 * Checks:
 *   1. puppeteer-extra + stealth plugin load
 *   2. Chromium at CHROMIUM_PATH launches headless
 *   3. A page can be navigated and title read (network sanity)
 *   4. If a douyin URL is given, attempts the real extraction (best-effort)
 */
const path = require('path');

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/snap/bin/chromium';

(async () => {
  const results = [];
  let exitCode = 0;

  // 1. Load puppeteer-extra + stealth
  let puppeteer, StealthPlugin;
  try {
    puppeteer = require('puppeteer-extra');
    StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteer.use(StealthPlugin());
    results.push('PASS puppeteer-extra + stealth plugin loaded');
  } catch (e) {
    results.push(`FAIL puppeteer-extra load: ${e.message}`);
    exitCode = 1;
  }

  // 2-3. Launch + navigate
  let browser;
  if (puppeteer) {
    try {
      browser = await puppeteer.launch({
        executablePath: CHROMIUM_PATH,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
      results.push(`PASS chromium launched: ${CHROMIUM_PATH}`);

      const page = await browser.newPage();
      await page.goto('https://www.baidu.com', { timeout: 15000, waitUntil: 'domcontentloaded' });
      const title = await page.title();
      results.push(`PASS page navigation works (title="${title}")`);
    } catch (e) {
      results.push(`FAIL chromium launch/navigate: ${e.message}`);
      exitCode = 1;
    }
  }

  // 4. Optional real douyin extraction (best-effort, network-dependent)
  const douyinUrl = process.argv[2];
  if (douyinUrl && browser) {
    try {
      const page = await browser.newPage();
      await page.goto(douyinUrl, { timeout: 25000, waitUntil: 'domcontentloaded' });
      const videoId = await page.evaluate(() => {
        const m = window.location.href.match(/video\/(\d+)/);
        return m ? m[1] : null;
      });
      results.push(videoId ? `PASS douyin videoId extracted: ${videoId}` : 'WARN douyin page loaded but no videoId in URL (may be share redirect)');
    } catch (e) {
      results.push(`WARN douyin extraction failed (network/blocking): ${e.message}`);
    }
  }

  if (browser) await browser.close();
  results.forEach((r) => console.log(r));
  process.exit(exitCode);
})();
