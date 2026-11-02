// Plays every journey one after another in ONE browser, like a visitor going through the guide,
// so a journey that only works on a fresh browser (leftover role or data from the previous one) fails here.
const {chromium} = require('playwright'); const path = require('path');
const B = (process.env.MOVEAI_BASE || 'http://127.0.0.1:4177') + '/', sleep = ms => new Promise(r => setTimeout(r, ms));
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
(async () => {
  const {JOURNEYS} = await import(path.join(__dirname, '..', 'js', 'tour-journeys.js'));
  const ids = Object.keys(JOURNEYS).filter(id => !ONLY.length || ONLY.includes(id)).reverse(); // reverse: logistics roles first, then the rest
  const b = await chromium.launch(), ctx = await b.newContext({viewport: {width: 1280, height: 800}});
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', {get: () => false})); // behave like a real visitor (role picker etc.)
  await ctx.route(/cdn\.jsdelivr/, r => r.fulfill({body: '', contentType: 'text/javascript'})); await ctx.route(/cdnjs/, r => r.abort());
  const p = await ctx.newPage(); const fails = [];
  for (const id of ids) {
    await p.goto(`${B}index.html?demo=on&tour=${id}&speed=fast#/home`, {waitUntil: 'load'});
    let st = {}; const end = Date.now() + 6 * 60000;
    while (Date.now() < end) { await sleep(400); try { st = await p.evaluate(() => ({done: !!window.__tourDone, error: window.__tourError || '', t: JSON.parse(sessionStorage.getItem('moveai-tour') || 'null')})); } catch { continue; } if (st.done || st.error) break; }
    let outcome = ''; if (st.done && JOURNEYS[id].verify) { const s = await p.evaluate(() => window.MoveAIVNextTest.state()).catch(() => null); outcome = s ? JOURNEYS[id].verify(s) : 'no state'; }
    const ok = st.done && !st.error && !outcome; if (!ok) fails.push(id);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${id}${ok ? '' : ' — ' + (st.error || outcome || `stopped at step ${(st.t?.i ?? -1) + 1}`)}`);
  }
  await b.close(); if (fails.length) { console.log('FAILED: ' + fails.join(', ')); process.exit(1); } console.log(`PASS tour sequence: ${ids.length} journeys in one browser`);
})().catch(e => { console.error(e); process.exit(1); });
