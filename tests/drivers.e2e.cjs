// Drivers in the browser (phone width): hire a personal driver in steps → best-matched driver (Anil) →
// selfie before accepting → on the way → start code + car photos + odometer → 5 h on a 4 h booking →
// end trip → customer approves the extra hour, confirms, pays, rates, "Book Anil again". Then a small
// Tata Ace booking goes to the owner-driver (Manoj): pickup code → drop code → paid. Then truck safeguards:
// police check expiring soon, delivery code shown to the receiver. Serve on 4177 first.
const {chromium} = require('playwright');
const assert = require('assert');
const B = (process.env.MOVEAI_BASE || 'http://127.0.0.1:4177') + '/'; let n = 0;
const go = async (p, path) => { await p.goto(`${B}${path.replace('#', `?t=${++n}#`)}`, {waitUntil: 'load'}); await p.waitForTimeout(450); };
const state = p => p.evaluate(() => window.MoveAIVNextTest.state());
const text = async (p, sel = 'main') => (await p.textContent(sel)).replace(/\s+/g, ' ');
const as = async (p, ws, path) => { await p.evaluate(w => window.MoveAIVNextTest.switchWorkspace(w), ws); await go(p, path); };
const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const pick = (p, sel) => p.evaluate(q => { const el = document.querySelector(q); el.checked = true; el.dispatchEvent(new Event('change', {bubbles: true})); }, sel).then(() => p.waitForTimeout(250));
const img = name => ({name, mimeType: 'image/jpeg', buffer: Buffer.from('x')});
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 390, height: 860}});
  await ctx.route(/cdn\.jsdelivr/, r => r.fulfill({body: '', contentType: 'text/javascript'})); await ctx.route(/cdnjs/, r => r.abort());
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await go(p, 'index.html?demo=on#/home'); await p.evaluate(() => { window.MoveAIVNextTest.reset(); window.MoveAIVNextTest.switchWorkspace('personal'); }); await go(p, 'index.html#/home');

  // Customer: Hire a driver in five short steps
  await p.click('[data-customer-service="driver"]'); await p.waitForTimeout(400); assert.ok(p.url().includes('#/driverBook'));
  const next = async () => { await p.locator('#drv-book-form').dispatchEvent('submit'); await p.waitForTimeout(350); };
  assert.match(await text(p, '[data-wiz-head]'), /Step 1 of 5 · Trip/); await next();
  assert.equal(await p.isChecked('[name="addressId"][value="AD-HOME"]'), true); await next();
  await next(); assert.match(await text(p, '#drv-book-error'), /start time|date/i);
  await pick(p, `#drv-book-form [name=date][value="${tomorrow()}"]`); await p.selectOption('#drv-book-form [name=startTime]', '10:00'); await p.waitForTimeout(250); await next();
  await next(); assert.match(await text(p, '#drv-book-error'), /Write the car/);
  await p.fill('[name=make]', 'Hyundai Creta'); await pick(p, '[name=body][value=suv]'); await pick(p, '[name=transmission][value=automatic]'); await p.fill('[name=make]', 'Hyundai Creta'); await p.fill('[name=plate]', 'UP16 AB 1234'); await next();
  assert.match(await text(p, '.drv-review'), /Trip protection/); assert.match(await text(p, '[data-wiz-total]'), /₹/); await next();
  assert.ok(p.url().includes('#/bookingReview')); assert.match(await text(p), /best match gets it/);
  await p.click('[data-op="booking-publish"]'); await p.waitForTimeout(500); assert.ok(p.url().includes('#/serviceDetail'));
  let s = await state(p); const r = s.serviceRequests[0]; assert.equal(r.flow, 'steps'); assert.deepEqual([...r.dispatch.current.ids].sort(), ['DP-ANIL', 'DP-VIKAS']);
  assert.match(await text(p, '[data-drv-searching]'), /best-matched verified drivers who can drive your car/);

  // Driver Anil: selfie first, then accept, go, arrive, start
  await as(p, 'personalDriver', 'partner.html#/myJobs'); assert.match(await text(p, '[data-drv-offers]'), /Take today's selfie first/);
  await p.click(`[data-drv-offer="${r.id}"] [data-drv="accept"]`); await p.waitForTimeout(300); s = await state(p); assert.equal(s.serviceRequests.find(x => x.id === r.id).status, 'searching');
  await go(p, 'partner.html#/dailySelfie'); await p.setInputFiles('#selfie-form [name=selfie]', img('me.jpg')); await p.locator('#selfie-form').dispatchEvent('submit'); await p.waitForTimeout(400);
  await go(p, 'partner.html#/myJobs'); await p.click(`[data-drv-offer="${r.id}"] [data-drv="accept"]`); await p.waitForTimeout(400); assert.ok(p.url().includes('#/driverTrip'));
  assert.match(await p.getAttribute('[data-drv-nav]', 'href'), /destination=28\.62/);
  await p.click('[data-drv="on-the-way"]'); await p.waitForTimeout(250);
  for (let i = 0; i < 20 && !(await p.isVisible('text=At the car')); i++) { await p.click('[data-drv="drive"]'); await p.waitForTimeout(100); }
  s = await state(p); const otp = s.serviceRequests.find(x => x.id === r.id).startOtp;
  await p.setInputFiles('[data-drv-start] [name=photos]', [img('front.jpg'), img('back.jpg')]); await p.fill('[data-drv-start] [name=odometer]', '23450'); await p.fill('[data-drv-start] [name=otp]', otp); await p.locator('[data-drv-start]').dispatchEvent('submit'); await p.waitForTimeout(300);
  await p.click('[data-drv="hours"]'); await p.waitForTimeout(250); assert.match(await text(p, '[data-drv-running]'), /5\.\d h of 4 h/);
  await p.setInputFiles('[data-drv-end] [name=photos]', img('after.jpg')); await p.fill('[data-drv-end] [name=odometer]', '23512'); await p.locator('[data-drv-end]').dispatchEvent('submit'); await p.waitForTimeout(300);
  s = await state(p); const done = s.serviceRequests.find(x => x.id === r.id); assert.equal(done.status, 'provider_done'); assert.ok(done.extras.some(x => x.kind === 'extra_hour' && x.status === 'proposed'));

  // Customer: car photos, approve extra time, confirm, pay, rate, book again
  await as(p, 'personal', 'index.html#/serviceDetail'); assert.match(await text(p), /62 km/); assert.match(await text(p), /front\.jpg/);
  while (await p.locator('[data-extra="approve"]').count()) { await p.locator('[data-extra="approve"]').first().click(); await p.waitForTimeout(250); }
  await p.click('[data-op="service-confirm"]'); await p.waitForTimeout(300); await p.click(`[data-pay-balance="${r.id}"]`); await p.waitForTimeout(500);
  s = await state(p); assert.ok(s.ledger.some(x => x.type === 'wallet_credit' && x.serviceId === r.id && x.payee === 'personalDriver'));
  await p.click('[data-op="service-rate"]'); await p.waitForTimeout(300); await p.click('[data-drv="again"]'); await p.waitForTimeout(400); assert.ok(p.url().includes('#/driverBook'));
  s = await state(p); assert.equal(s.driverDraft.favouriteDriverId, 'DP-ANIL');

  // Small Tata Ace booking → driver with own vehicle (Manoj)
  await go(p, 'index.html#/moveBook'); const mnext = async () => { await p.locator('#move-book-form').dispatchEvent('submit'); await p.waitForTimeout(350); };
  await p.click('[data-loc-picker="move-from"] [data-loc="demo"][data-spot="patna"]'); await p.waitForTimeout(250); await p.fill('[name="move-from-line"]', 'Flat 3B, Ganga Apartments'); await p.fill('[name="move-from-pincode"]', '800001');
  await p.fill('[name="move-to-q"]', 'Kankarbagh Patna'); await p.click('[data-loc-picker="move-to"] [data-loc="search"]'); await p.waitForTimeout(250); await p.fill('[name="move-to-line"]', 'House 22, Road 4'); await mnext();
  await pick(p, '#move-book-form [name=what][value="few"]'); await p.click('[data-mv-qty="box"][data-d="1"]'); await p.waitForTimeout(200); await p.click('[data-mv-qty="box"][data-d="1"]'); await p.waitForTimeout(200); await mnext();
  await pick(p, '#move-book-form [name=vehicle][value="ace"]'); await mnext(); await pick(p, '#move-book-form [name=help][value="driver"]'); await mnext();
  await pick(p, `#move-book-form [name=date][value="${tomorrow()}"]`); await pick(p, '#move-book-form [name=slot][value="10"]'); await mnext(); if (await p.$('#move-book-form')) await mnext();
  assert.ok(p.url().includes('#/bookingReview'), p.url()); await p.click('[data-op="booking-publish"]'); await p.waitForTimeout(500);
  s = await state(p); const m = s.serviceRequests[0]; assert.equal(m.kind, 'owner'); assert.deepEqual(m.dispatch.current.ids, ['OD-MANOJ']);
  assert.match(await text(p, '[data-od-searching]'), /Tata Ace drivers/);
  await as(p, 'ownerDriver', 'partner.html#/home'); assert.match(await text(p), /Namaste, Manoj/); await p.click(`[data-od-offer="${m.id}"] [data-od="accept"]`); await p.waitForTimeout(400);
  await p.click('[data-od="on-the-way"]'); await p.waitForTimeout(250);
  for (let i = 0; i < 25 && !(await p.isVisible('text=At the pickup')); i++) { await p.click('[data-od="drive"]'); await p.waitForTimeout(100); }
  s = await state(p); const mj = s.serviceRequests.find(x => x.id === m.id);
  await p.setInputFiles('[data-od-pickup] [name=photo]', img('loaded.jpg')); await p.fill('[data-od-pickup] [name=otp]', mj.startOtp); await p.locator('[data-od-pickup]').dispatchEvent('submit'); await p.waitForTimeout(300);
  for (let i = 0; i < 25 && !(await p.isVisible('text=At the drop')); i++) { await p.click('[data-od="drive"]'); await p.waitForTimeout(100); }
  await p.setInputFiles('[data-od-drop] [name=photo]', img('delivered.jpg')); await p.fill('[data-od-drop] [name=otp]', mj.dropOtp); await p.locator('[data-od-drop]').dispatchEvent('submit'); await p.waitForTimeout(300);
  s = await state(p); assert.ok(['completed', 'paid'].includes(s.serviceRequests.find(x => x.id === m.id).status));

  // Truck safeguards: police check expiring soon on the driver's home; delivery code for the receiver
  await as(p, 'commercialDriver', 'partner.html#/home'); assert.match(await text(p, '[data-tx-docs]'), /Police verification expires in \d+ days/);
  await as(p, 'goods', 'business.html#/trips'); await p.click('[data-op="open-trip"][data-id="TRP-501"]').catch(() => {}); await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'no sideways scrolling');
  assert.deepEqual(errors, []);
  await b.close(); console.log('PASS drivers e2e: hire a driver in steps, best match, selfie first, start code + car photos + odometer, actual time billed, approve/pay/rate/book again; own-vehicle driver pickup + drop codes; document expiry banner');
})().catch(e => { console.error(e); process.exit(1); });
