// Home services in the browser, both sides: customer books an electrician (job + address + slot) →
// pro accepts in MoveAI Partner → on the way → start code → extra charge → customer approves →
// done with photo → customer confirms, pays, rates → 30-day re-work. Phone width. Serve on 4177 first.
const {chromium} = require('playwright');
const assert = require('assert');
const B = (process.env.MOVEAI_BASE || 'http://127.0.0.1:4177') + '/'; let n = 0;
const go = async (p, path) => { await p.goto(`${B}${path.replace('#', `?t=${++n}#`)}`, {waitUntil: 'load'}); await p.waitForTimeout(450); };
const state = p => p.evaluate(() => window.MoveAIVNextTest.state());
const text = async (p, sel = 'main') => (await p.textContent(sel)).replace(/\s+/g, ' ');
const as = async (p, ws, path) => { await p.evaluate(w => window.MoveAIVNextTest.switchWorkspace(w), ws); await go(p, path); };
const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 390, height: 860}});
  await ctx.route(/cdn\.jsdelivr/, r => r.fulfill({body: '', contentType: 'text/javascript'})); await ctx.route(/cdnjs/, r => r.abort());
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await go(p, 'index.html#/home'); await p.evaluate(() => { window.MoveAIVNextTest.reset(); window.MoveAIVNextTest.switchWorkspace('personal'); }); await go(p, 'index.html#/home');

  // Customer: Home services tile → booking page
  await p.click('[data-customer-service="general"]'); await p.waitForTimeout(400);
  assert.ok(p.url().includes('#/homeBook')); assert.match(await text(p), /Home services/);
  const next = async () => { await p.locator('#home-book-form').dispatchEvent('submit'); await p.waitForTimeout(350); };
  const step = () => p.getAttribute('#home-book-form', 'data-step');
  assert.match(await text(p, '[data-wiz-head]'), /Step 1 of 4 · Job/);
  await next(); assert.match(await text(p, '#home-book-error'), /Choose at least one job/); assert.equal(await step(), '1');
  await p.click('[data-hs-qty="fan"][data-d="1"]'); await p.waitForTimeout(250);
  assert.equal((await p.textContent('[data-hs-count="fan"]')).trim(), '1'); assert.match(await text(p, '[data-wiz-total]'), /₹249/);
  await p.click('[data-hs-qty="switch"][data-d="1"]'); await p.waitForTimeout(250); assert.match(await text(p, '[data-wiz-total]'), /₹348/);
  await p.click('.hs-note summary'); await p.fill('#home-book-form [name=description]', 'Fan wobbles and makes noise');
  await next(); assert.equal(await step(), '2'); assert.match(await text(p, '[data-wiz-head]'), /✓ Job/);
  assert.equal(await p.isChecked('[name="addressId"][value="AD-HOME"]'), true, 'saved home address preselected');
  await next(); assert.equal(await step(), '3');
  await next(); assert.match(await text(p, '#home-book-error'), /time slot/);
  await p.check(`#home-book-form [name=date][value="${tomorrow()}"]`, {force: true}); await p.waitForTimeout(300);
  await p.check('#home-book-form [name=slot][value="10"]', {force: true});
  await next(); assert.equal(await step(), '4'); assert.match(await text(p), /Check and book/); assert.match(await text(p, '.hs-review'), /₹348/); assert.match(await text(p, '.hs-review'), /Fan wobbles/);
  await p.click('[data-wiz-go="1"]'); await p.waitForTimeout(300); assert.equal(await step(), '1'); assert.equal((await p.textContent('[data-hs-count="fan"]')).trim(), '1', 'choices kept');
  await next(); await next(); await next(); assert.equal(await step(), '4');
  await next(); await p.waitForTimeout(200);
  assert.ok(p.url().includes('#/serviceDetail'));
  let s = await state(p); const r = s.serviceRequests[0];
  assert.equal(r.type, 'general'); assert.equal(r.status, 'searching'); assert.equal(r.quote.total, 348); assert.equal(r.address.pincode, '201309'); assert.equal(r.slot, '10');
  assert.match(await text(p), /Finding a pro/); assert.doesNotMatch(await text(p), /Verified service partner|Prototype: provider/);

  // Pro (MoveAI Partner): offer on home → accept → on the way
  await as(p, 'homePro', 'partner.html#/home'); assert.match(await text(p), /Namaste, Suresh/);
  assert.ok(await p.isVisible(`[data-hs-offer="${r.id}"]`), 'new job shows on the pro home'); assert.match(await text(p, `[data-hs-offer="${r.id}"]`), /You earn ₹296/);
  await p.click(`[data-hs-offer="${r.id}"] [data-hs="accept"]`); await p.waitForTimeout(400);
  assert.ok(p.url().includes('#/proJob')); assert.match(await text(p), /Flat 402, Tower B/);
  await p.click('[data-hs="on-the-way"]'); await p.waitForTimeout(300);

  // Customer sees the pro and the start code
  await as(p, 'personal', 'index.html#/serviceDetail'); assert.match(await text(p), /Suresh Kumar/); assert.match(await text(p), /ID verified/);
  const otp = (await p.textContent('[data-hs-otp]')).trim(); assert.match(otp, /^\d{4}$/);

  // Pro: wrong code refused, right code starts; extra charge; can't finish until answered
  await as(p, 'homePro', 'partner.html#/proJob');
  assert.match(await p.getAttribute('[data-hs-nav]', 'href'), /google\.com\/maps\/dir\/.*destination=28\.62.*travelmode=two-wheeler/);
  await p.fill(`[data-hs-start] [name=otp]`, otp); await p.locator('[data-hs-start]').dispatchEvent('submit'); await p.waitForTimeout(200);
  assert.match(await text(p, '#hs-pro-error'), /live location/, 'cannot start before reaching an exact address');
  for (let i = 0; i < 20 && !(await p.isVisible('text=Arrived — ask for the start code')); i++) { await p.click('[data-hs="drive"]'); await p.waitForTimeout(120); }
  assert.ok(await p.isVisible('text=Arrived — ask for the start code'));
  await p.fill(`[data-hs-start] [name=otp]`, '0000'); await p.locator('[data-hs-start]').dispatchEvent('submit'); await p.waitForTimeout(200);
  assert.match(await text(p, '#hs-pro-error'), /code is wrong/);
  await p.fill(`[data-hs-start] [name=otp]`, otp); await p.locator('[data-hs-start]').dispatchEvent('submit'); await p.waitForTimeout(300);
  await p.click('[data-hs-extra] ~ * , details summary').catch(() => {});
  await p.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true));
  await p.fill('[data-hs-extra] [name=note]', 'Fan capacitor needs replacing'); await p.locator('[data-hs-extra]').dispatchEvent('submit'); await p.waitForTimeout(300);
  await p.setInputFiles('[data-hs-done] [name=after]', {name: 'fan-fixed.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('x')}); await p.locator('[data-hs-done]').dispatchEvent('submit'); await p.waitForTimeout(200);
  assert.match(await text(p, '#hs-pro-error'), /not answered your extra/);

  // Customer approves the extra
  await as(p, 'personal', 'index.html#/serviceDetail'); await p.click('[data-extra="approve"]'); await p.waitForTimeout(300);

  // Pro marks done with a photo
  await as(p, 'homePro', 'partner.html#/proJob');
  await p.setInputFiles('[data-hs-done] [name=after]', {name: 'fan-fixed.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('x')}); await p.locator('[data-hs-done]').dispatchEvent('submit'); await p.waitForTimeout(300);
  s = await state(p); assert.equal(s.serviceRequests.find(x => x.id === r.id).status, 'provider_done');

  // Customer confirms, pays, rates; re-work promise appears
  await as(p, 'personal', 'index.html#/serviceDetail'); assert.match(await text(p), /fan-fixed\.jpg/);
  await p.click('[data-op="service-confirm"]'); await p.waitForTimeout(300);
  assert.match(await text(p), /Cash to the pro/); assert.match(await text(p), /Pay ₹598/);
  await p.click(`[data-pay-balance="${r.id}"]`); await p.waitForTimeout(500);
  s = await state(p); const credit = s.ledger.find(x => x.type === 'wallet_credit' && x.serviceId === r.id);
  assert.equal(credit.payee, 'homePro'); assert.equal(credit.amount, 598 - Math.round(598 * 0.15), 'pro gets the job minus 15%');
  await p.click('[data-op="service-rate"]'); await p.waitForTimeout(300);
  assert.match(await text(p), /30-day re-work promise/);

  // Pro money shows the paid job; admin sees the booking
  await as(p, 'homePro', 'partner.html#/money'); assert.match(await text(p), new RegExp(r.id));
  await p.evaluate(() => { const k = 'moveai-vnext-p1', s = JSON.parse(localStorage.getItem(k)); if (!s.workspaces.includes('admin')) s.workspaces.push('admin'); localStorage.setItem(k, JSON.stringify(s)); });
  await go(p, 'admin.html#/homeServicesAdmin?ws=admin'); assert.match(await text(p), new RegExp(r.id));
  assert.deepEqual(errors, []);
  await b.close(); console.log('PASS home services: book job + address + slot, pro accepts, on the way, start code, extra approved, done with photo, confirm, pay (pro gets 85%), rate, re-work promise, admin list');
})().catch(e => { console.error(e); process.exit(1); });
