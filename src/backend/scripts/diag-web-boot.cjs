const puppeteer = require('puppeteer-core');
const fs = require('fs');
(async () => {
  const b = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    defaultViewport: { width: 1280, height: 900 },
    args: [
      '--disable-features=CalculateNativeWinOcclusion',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
    ],
  });
  const p = await b.newPage();
  await p.bringToFront();
  await p.evaluateOnNewDocument(() => {
    window.flutterConfiguration = { renderer: 'canvaskit' };
    window.__raf = 0;
    const orig = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => orig((t) => { window.__raf++; return cb(t); });
    document.addEventListener('flutter-first-frame', () => { window.__ff = true; });
    window.addEventListener('unhandledrejection', (e) => console.log('UNHANDLED', String(e.reason && e.reason.stack || e.reason).slice(0, 400)));
    window.addEventListener('error', (e) => console.log('WINERROR', String(e.message).slice(0, 200)));
  });
  const localFont = fs.readFileSync('C:\\Windows\\Fonts\\msyh.ttc');
  const pending = new Map();
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    pending.set(r.url(), Date.now());
    if (/fonts\.gstatic|fonts\.googleapis/.test(r.url())) {
      r.respond({ status: 200, contentType: 'font/ttc', headers: { 'Access-Control-Allow-Origin': '*' }, body: localFont });
    } else r.continue();
  });
  p.on('requestfinished', (r) => pending.delete(r.url()));
  p.on('requestfailed', (r) => { pending.delete(r.url()); console.log('REQFAIL', r.url().slice(0, 100)); });
  p.on('console', (m) => console.log('CONSOLE', m.type(), m.text().slice(0, 200)));
  p.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
  await p.goto('http://localhost:8092/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 20000));
  console.log('PENDING', JSON.stringify([...pending.keys()].map((u) => u.slice(0, 100))));
  console.log('STATE', await p.evaluate(() => JSON.stringify({
    sems: document.querySelectorAll('flt-semantics').length,
    raf: window.__raf || 0,
    ff: !!window.__ff,
    canvas: document.querySelectorAll('canvas').length,
    fvChildren: document.querySelector('flutter-view') ? document.querySelector('flutter-view').children.length : -1,
    fv: !!document.querySelector('flutter-view'),
    flutterKeys: window._flutter ? Object.keys(window._flutter) : null,
    loader: window._flutter && window._flutter.loader ? 'yes' : 'no',
    sw: navigator.serviceWorker ? (navigator.serviceWorker.controller ? 'controlled' : 'none') : 'unsupported',
    entries: performance.getEntriesByType('resource').map((e) => e.name.split('/').pop() + ':' + Math.round(e.duration)).slice(-12),
    fvChildTags: document.querySelector('flutter-view') ? [...document.querySelector('flutter-view').children].map((c) => c.tagName.toLowerCase() + (c.id ? '#' + c.id : '') + (c.className ? '.' + String(c.className).slice(0, 30) : '')) : null,
    glassPane: document.querySelectorAll('flt-glass-pane').length,
    canvasKit: typeof window.CanvasKit,
    ckInit: window.CanvasKit ? !!window.CanvasKit.Init : null,
    bodyChildren: [...document.body.children].map((c) => c.tagName.toLowerCase() + (c.id ? '#' + c.id : '')),
    flutterLoaderState: window._flutter && window._flutter.loader ? Object.keys(window._flutter.loader) : null,
    webgl: (() => { try { const c = document.createElement('canvas'); return { webgl2: !!c.getContext('webgl2'), webgl: !!c.getContext('webgl') }; } catch (e) { return String(e); } })(),
    glassHTML: document.querySelector('flt-glass-pane') ? document.querySelector('flt-glass-pane').innerHTML.slice(0, 300) : null,
    buildConfig: window._flutter && window._flutter.buildConfig ? JSON.stringify(window._flutter.buildConfig).slice(0, 300) : null,
    renderer: window.flutterConfiguration ? JSON.stringify(window.flutterConfiguration).slice(0, 200) : null,
    shadowCanvas: (() => { let n = 0; const walk = (root) => { root.querySelectorAll('*').forEach((el) => { if (el.tagName === 'CANVAS') n++; if (el.shadowRoot) walk(el.shadowRoot); }); }; walk(document); return n; })(),
    glassShadow: document.querySelector('flt-glass-pane') && document.querySelector('flt-glass-pane').shadowRoot ? document.querySelector('flt-glass-pane').shadowRoot.innerHTML.slice(0, 200) : 'no-shadow',
  })));
  await p.screenshot({ path: 'storage/qa/player-verify/diag-boot.png' });
  await p.keyboard.press('Tab');
  await new Promise((r) => setTimeout(r, 1500));
  console.log('SEMS_AFTER_TAB', await p.evaluate(() => document.querySelectorAll('flt-semantics').length));
  console.log('SW', await p.evaluate(async () => JSON.stringify((await navigator.serviceWorker.getRegistrations()).map((r) => ({ scope: r.scope, active: !!r.active, installing: !!r.installing, waiting: !!r.waiting })))));
  await b.close();
})();