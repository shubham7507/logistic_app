// Moving in the browser, step by step (phone width): Where (GPS pickup + search drop, floor chips) → What
// (size + items) → Vehicle (recommended preselected, too-small tucked away) → Help (driver limit, stairs)
// + extras → When (date chips, open slots) → review → pay → Patna branch gets vehicle, helpers and route.
// Also: each step blocks Next until its own fields are done; Back and the ✎ summaries keep choices.
const {chromium} = require('playwright');
const assert = require('assert');
const B = (process.env.MOVEAI_BASE || 'http://127.0.0.1:4177') + '/'; let n = 0;
const go = async (p, path) => { await p.goto(`${B}${path.replace('#', `?t=${++n}#`)}`, {waitUntil: 'load'}); await p.waitForTimeout(450); };
const state = p => p.evaluate(() => window.MoveAIVNextTest.state());
const text = async (p, sel = 'main') => (await p.textContent(sel)).replace(/\s+/g, ' ');
const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const F = '#move-book-form ';
const next = async p => { await p.locator('#move-book-form').dispatchEvent('submit'); await p.waitForTimeout(350); };
const step = p => p.getAttribute('#move-book-form', 'data-step');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 390, height: 860}});
  await ctx.route(/cdn\.jsdelivr/, r => r.fulfill({body: '', contentType: 'text/javascript'})); await ctx.route(/cdnjs/, r => r.abort());
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await go(p, 'index.html?demo=on#/home'); await p.evaluate(() => { window.MoveAIVNextTest.reset(); window.MoveAIVNextTest.switchWorkspace('personal'); }); await go(p, 'index.html#/home');
  await p.click('[data-customer-service="moving"]'); await p.waitForTimeout(400); assert.ok(p.url().includes('#/moveBook'));
  assert.match(await text(p, '[data-wiz-head]'), /Step 1 of 5 · Where\?/);
  assert.equal(await p.isVisible('[name="move-from-landmark"]'), false, 'landmark fields tucked away');

  // Step 1 — Next is blocked until both addresses are done
  await next(p); assert.equal(await step(p), '1'); assert.match(await text(p, '#move-book-error'), /Pickup/);
  await p.click('[data-loc-picker="move-from"] [data-loc="demo"][data-spot="patna"]'); await p.waitForTimeout(300);
  await p.fill('[name="move-from-line"]', 'Flat 3B, Ganga Apartments'); await p.fill('[name="move-from-pincode"]', '800001');
  await p.fill('[name="move-to-q"]', 'Kankarbagh Patna'); await p.click('[data-loc-picker="move-to"] [data-loc="search"]'); await p.waitForTimeout(300);
  assert.equal(await p.inputValue('[name="move-from-line"]'), 'Flat 3B, Ganga Apartments', 'typed pickup kept');
  await p.fill('[name="move-to-line"]', 'House 22, Road 4');
  await p.check(F + '[name=fromFloor][value="2"]', {force: true}); await p.waitForTimeout(250); await p.check(F + '[name=fromLift][value="no"]', {force: true}); await p.waitForTimeout(250);
  assert.match(await text(p, F), /About \d+ km by road/);
  await next(p); assert.equal(await step(p), '2'); assert.match(await text(p, '[data-wiz-head]'), /✓ Where\?\s*📍 Patna → Patna · \d+ km/);

  // Step 2 — 2 BHK shows a summary with Edit items; a few items opens the list
  await next(p); assert.match(await text(p, '#move-book-error'), /what you are moving/);
  await p.check(F + '[name=what][value="2bhk"]', {force: true}); await p.waitForTimeout(300);
  assert.match(await text(p, '.wiz-items-sum'), /56 items/); assert.ok(await p.isVisible('[data-mv-items="open"]'));
  await next(p); assert.equal(await step(p), '3');
  assert.match(await text(p, '[data-mv-vehicle-card="14ft"]'), /Recommended/); assert.equal(await p.isChecked(F + '[name=vehicle][value="14ft"]'), true, 'recommended preselected');
  assert.equal(await p.isVisible('[data-mv-vehicle-card="ace"]'), false, 'too-small vehicles tucked away');
  await p.click('[data-wiz-go="2"]'); await p.waitForTimeout(300); assert.equal(await step(p), '2');
  await p.check(F + '[name=what][value="few"]', {force: true}); await p.waitForTimeout(300);
  await next(p); assert.match(await text(p, '#move-book-error'), /at least one item/);
  await p.click('[data-mv-qty="fridge"][data-d="1"]'); await p.waitForTimeout(250); await p.click('[data-mv-qty="washer"][data-d="1"]'); await p.waitForTimeout(250);
  await next(p); assert.equal(await step(p), '3');
  assert.match(await text(p, '[data-mv-vehicle-card="3w"]'), /Recommended/); assert.match(await text(p, '[data-wiz-bar]'), /Total\s*₹/);
  await p.click('.mv-too-small summary'); assert.match(await text(p, '[data-mv-vehicle-card="bike"]'), /Won't fit/); assert.equal(await p.isDisabled(F + '[name=vehicle][value="bike"]'), true);
  await next(p); assert.equal(await step(p), '4');

  // Step 4 — driver alone can't carry a fridge; 2 helpers with stairs; extra stop
  assert.equal(await p.isDisabled(F + '[name=help][value="driver"]'), true); assert.equal(await p.isChecked(F + '[name=help][value="dh1"]'), true, 'suggested preselected');
  const before = await text(p, '[data-wiz-total]');
  await p.check(F + '[name=help][value="h2"]', {force: true}); await p.waitForTimeout(300); assert.notEqual(await text(p, '[data-wiz-total]'), before);
  await p.click('[data-mv-extras] summary'); await p.check(F + '[name=x-stop]'); await p.waitForTimeout(300);
  await p.click('[data-wiz="back"]'); await p.waitForTimeout(300); assert.equal(await step(p), '3'); await next(p);
  assert.equal(await p.isChecked(F + '[name=help][value="h2"]'), true, 'Back keeps the helper choice'); assert.equal(await p.isChecked(F + '[name=x-stop]'), true, 'extras kept');
  await next(p); assert.equal(await step(p), '5');

  // Step 5 — date chips, open slots only, price breakdown
  await next(p); assert.match(await text(p, '#move-book-error'), /slot|date/i);
  await p.check(F + `[name=date][value="${tomorrow()}"]`, {force: true}); await p.waitForTimeout(300);
  assert.equal(await p.locator(F + '[name=slot]').count(), 6, 'all six slots open tomorrow');
  await p.check(F + '[name=slot][value="10"]', {force: true});
  assert.match(await text(p, '[data-mv-summary]'), /2 helpers \(incl\. stairs\)/); assert.match(await text(p, '[data-mv-summary]'), /Extra stop on the way/);
  const total = (await text(p, '[data-mv-total]')).trim();
  await next(p); assert.ok(p.url().includes('#/bookingReview')); assert.match(await text(p), /3-wheeler/); assert.match(await text(p), /2 helper\(s\)/); assert.ok((await text(p)).includes(total));
  await p.click('[data-op="booking-publish"]'); await p.waitForTimeout(800);
  const s = await state(p), r = s.serviceRequests[0], j = s.movingJobs.find(x => x.id === r.movingJobId);
  assert.equal(r.bookingKind, 'vehicle'); assert.equal(j.branchId, 'BR-032', 'Patna branch'); assert.equal(j.vehicleId, '3w'); assert.equal(j.helpers, 2); assert.ok(j.route?.from?.[0] > 25 && j.route.to[0] > 25, 'map route from the two pins');
  assert.equal(j.window.from, `${tomorrow()}T10:00`);
  await p.evaluate(() => window.MoveAIVNextTest.switchWorkspace('movers'));
  await p.evaluate(id => { const k = 'moveai-vnext-p1', st = JSON.parse(localStorage.getItem(k)); st.selectedMovingJobId = id; localStorage.setItem(k, JSON.stringify(st)); }, j.id);
  await go(p, 'business.html#/movingJob'); const mt = await text(p);
  assert.match(mt, /Vehicle booking \(driver \+ helpers\)/); assert.match(mt, /2 helper\(s\)/); assert.match(mt, /Extra stop/);
  // nothing overflows the phone screen
  await go(p, 'index.html#/moveBook');
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no sideways scrolling');
  assert.deepEqual(errors, []);
  await b.close(); console.log('PASS moving step by step: where (GPS + search, floor chips), what (summary / item list), vehicle (recommended preselected, too small hidden), help (driver limit, stairs) + extras, when (date chips, open slots), per-step checks, back keeps choices, review, pay, Patna branch');
})().catch(e => { console.error(e); process.exit(1); });
