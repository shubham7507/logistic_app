// Plays every "Show me" journey in a real browser and checks it reaches the end.
// With RECORD=<dir> it also records a video (MP4 via ffmpeg) and a screenshot of every step, which
// guide.html shows — run `npm run guide:record` after changing a flow so the guide stays accurate.
// Serve the folder first: `python3 -m http.server 4177`.
const {chromium} = require('playwright');
const fs = require('fs'), path = require('path'), {execFileSync} = require('child_process');
const B = (process.env.MOVEAI_BASE || 'http://127.0.0.1:4177') + '/';
const RECORD = process.env.RECORD || '', ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const SPEED = process.env.SPEED || (RECORD ? 'normal' : 'fast');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const {JOURNEYS} = await import(path.join(__dirname, '..', 'js', 'tour-journeys.js'));
  const ids = Object.keys(JOURNEYS).filter(id => !ONLY.length || ONLY.includes(id));
  const b = await chromium.launch(); const results = [];
  if (RECORD) fs.mkdirSync(path.join(RECORD, 'shots'), {recursive: true});
  for (const id of ids) {
    const j = JOURNEYS[id], vdir = RECORD ? fs.mkdtempSync(path.join(require('os').tmpdir(), 'tour-')) : null;
    const ctx = await b.newContext({viewport: {width: 1280, height: 800}, ...(vdir ? {recordVideo: {dir: vdir, size: {width: 1280, height: 800}}} : {})});
    await ctx.route(/cdn\.jsdelivr/, r => r.fulfill({body: '', contentType: 'text/javascript'})); await ctx.route(/cdnjs/, r => r.abort());
    const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.goto(`${B}index.html?tour=${id}&speed=${SPEED}#/home`, {waitUntil: 'load'});
    const end = Date.now() + 6 * 60000; let status = {}, lastShot = -1;
    while (Date.now() < end) {
      await sleep(400);
      try { status = await p.evaluate(() => ({done: !!window.__tourDone, error: window.__tourError || '', t: JSON.parse(sessionStorage.getItem('moveai-tour') || 'null')})); } catch { continue; }
      if (RECORD && status.t && status.t.i !== lastShot && status.t.ran) { lastShot = status.t.i; await sleep(250); await p.screenshot({path: path.join(RECORD, 'shots', `${id}-${String(status.t.i + 1).padStart(2, '0')}.jpg`), type: 'jpeg', quality: 62}).catch(() => {}); }
      if (status.done || status.error) break;
    }
    if (RECORD && status.done) { await sleep(1800); await p.screenshot({path: path.join(RECORD, 'shots', `${id}-done.jpg`), type: 'jpeg', quality: 62}); }
    let outcome = '';
    if (status.done && j.verify) { const st = await p.evaluate(() => window.MoveAIVNextTest.state()).catch(() => null); outcome = st ? j.verify(st) : 'could not read state'; }
    if (outcome) status.error = `outcome: ${outcome}`;
    const ok = status.done && !status.error && !errors.length;
    results.push({id, steps: j.steps.length, ok, error: status.error || errors[0] || (status.done ? '' : `stopped at step ${(status.t?.i ?? -1) + 1}`)});
    console.log(`${ok ? 'PASS' : 'FAIL'} ${id} (${j.steps.length} steps)${ok ? '' : ' — ' + results.at(-1).error}`);
    const video = vdir ? await p.video()?.path() : null; await ctx.close();
    if (RECORD && video && ok) {
      const mp4 = path.join(RECORD, `${id}.mp4`);
      try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4]); }
      catch (e) { fs.copyFileSync(video, path.join(RECORD, `${id}.webm`)); }
    }
    if (vdir) fs.rmSync(vdir, {recursive: true, force: true});
  }
  await b.close();
  if (RECORD) { // merge, so recording a few journeys keeps the others' results
    const file = path.join(RECORD, 'journeys.json'); let prev = []; try { prev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
    const ids = new Set(results.map(r => r.id)), order = Object.keys(JOURNEYS);
    const merged = [...prev.filter(r => !ids.has(r.id) && order.includes(r.id)), ...results].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    fs.writeFileSync(file, JSON.stringify(merged, null, 2));
  }
  if (results.some(r => !r.ok)) process.exit(1);
  console.log(`PASS tour journeys: ${results.map(r => r.id).join(', ')}`);
})().catch(e => { console.error(e); process.exit(1); });
