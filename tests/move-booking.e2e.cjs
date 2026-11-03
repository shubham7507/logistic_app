// Moving in the browser (phone width): "What are you moving?" → items → pickup (GPS) / drop (search) with
// floors → vehicle cards with prices (recommended, won't fit) → helpers (driver limit, stairs) → extras → slot →
// review → pay → Patna mover branch gets the vehicle, helpers and map route. Serve on 4177 first.
const {chromium} = require('playwright');
const assert = require('assert');
const B = (process.env.MOVEAI_BASE || 'http://127.0.0.1:4177') + '/'; let n = 0;
const go = async (p, path) => { await p.goto(`${B}${path.replace('#', `?t=${++n}#`)}`, {waitUntil: 'load'}); await p.waitForTimeout(450); };
const state = p => p.evaluate(() => window.MoveAIVNextTest.state());
const text = async (p, sel = 'main') => (await p.textContent(sel)).replace(/\s+/g, ' ');
const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const F = '#move-book-form ';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 390, height: 860}});
  await ctx.route(/cdn\.jsdelivr/, r => r.fulfill({body: '', contentType: 'text/javascript'})); await ctx.route(/cdnjs/, r => r.abort());
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await go(p, 'index.html?demo=on#/home'); await p.evaluate(() => { window.MoveAIVNextTest.reset(); window.MoveAIVNextTest.switchWorkspace('personal'); }); await go(p, 'index.html#/home');
  await p.click('[data-customer-service="moving"]'); await p.waitForTimeout(400); assert.ok(p.url().includes('#/moveBook'));

  // 2 BHK: Tata Ace can't be picked, 14 ft recommended
  await p.check(F + '[name=what][value="2bhk"]', {force: true}); await p.waitForTimeout(300);
  assert.match(await text(p, '[data-mv-vehicle-card="14ft"]'), /Recommended/); assert.equal(await p.isDisabled(F + '[name=vehicle][value="ace"]'), true);
  assert.match(await text(p, '[data-mv-vehicle-card="ace"]'), /Won't fit/);

  // A few items: fridge + washing machine → 3-wheeler; driver-only help blocked
  await p.check(F + '[name=what][value="few"]', {force: true}); await p.waitForTimeout(300);
  await p.click('[data-mv-qty="fridge"][data-d="1"]'); await p.waitForTimeout(250); await p.click('[data-mv-qty="washer"][data-d="1"]'); await p.waitForTimeout(250);
  assert.match(await text(p, '[data-mv-vehicle-card="3w"]'), /Recommended/); assert.equal(await p.isDisabled(F + '[name=help][value="driver"]'), true, 'driver cannot carry a fridge alone');
  // Pickup: GPS (demo Patna flat), 2nd floor no lift; drop: search Kankarbagh
  await p.click('[data-loc-picker="move-from"] [data-loc="demo"][data-spot="patna"]'); await p.waitForTimeout(300);
  await p.fill('[name="move-from-line"]', 'Flat 3B, Ganga Apartments'); await p.fill('[name="move-from-pincode"]', '800001');
  await p.fill('[name="move-to-q"]', 'Kankarbagh Patna'); await p.click('[data-loc-picker="move-to"] [data-loc="search"]'); await p.waitForTimeout(300);
  assert.equal(await p.inputValue('[name="move-from-line"]'), 'Flat 3B, Ganga Apartments', 'typed pickup kept');
  await p.fill('[name="move-to-line"]', 'House 22, Road 4');
  await p.fill(F + '[name=fromFloor]', '2'); await p.selectOption(F + '[name=fromLift]', 'no'); await p.waitForTimeout(300);
  assert.match(await text(p, F), /estimated \d+ km from the two addresses/);
  const before = await text(p, '[data-mv-total]');
  await p.check(F + '[name=help][value="h2"]', {force: true}); await p.waitForTimeout(300);
  assert.match(await text(p, '[data-mv-summary]'), /2 helpers \(incl\. stairs\)/); assert.notEqual(await text(p, '[data-mv-total]'), before);
  await p.check(F + '[name=x-stop]'); await p.waitForTimeout(300); assert.match(await text(p, '[data-mv-summary]'), /Extra stop on the way/);
  await p.fill(F + '[name=date]', tomorrow()); await p.dispatchEvent(F + '[name=date]', 'change'); await p.waitForTimeout(300);
  await p.check(F + '[name=slot][value="10"]', {force: true});
  const total = (await text(p, '[data-mv-total]')).trim();
  await p.locator('#move-book-form').dispatchEvent('submit'); await p.waitForTimeout(500);
  assert.ok(p.url().includes('#/bookingReview')); assert.match(await text(p), /3-wheeler/); assert.match(await text(p), /2 helper\(s\)/); assert.match(await text(p), new RegExp(total.replace(/[₹,]/g, m => m === '₹' ? '₹' : ',')));
  await p.click('[data-op="booking-publish"]'); await p.waitForTimeout(800);
  const s = await state(p), r = s.serviceRequests[0], j = s.movingJobs.find(x => x.id === r.movingJobId);
  assert.equal(r.bookingKind, 'vehicle'); assert.equal(j.branchId, 'BR-032', 'Patna branch'); assert.equal(j.vehicleId, '3w'); assert.equal(j.helpers, 2); assert.ok(j.route?.from?.[0] > 25 && j.route.to[0] > 25, 'map route from the two pins');
  assert.equal(j.window.from, `${tomorrow()}T10:00`);
  await p.evaluate(() => window.MoveAIVNextTest.switchWorkspace('movers'));
  await p.evaluate(id => { const k = 'moveai-vnext-p1', st = JSON.parse(localStorage.getItem(k)); st.selectedMovingJobId = id; localStorage.setItem(k, JSON.stringify(st)); }, j.id);
  await go(p, 'business.html#/movingJob'); const mt = await text(p);
  assert.match(mt, /Vehicle booking \(driver \+ helpers\)/); assert.match(mt, /2 helper\(s\)/); assert.match(mt, /Extra stop/);
  assert.deepEqual(errors, []);
  await b.close(); console.log('PASS moving: what are you moving, items, won\'t-fit block, recommended vehicle, driver limit, GPS + search addresses, stairs, extras, slot, review, pay, Patna branch with vehicle, helpers and route');
})().catch(e => { console.error(e); process.exit(1); });
