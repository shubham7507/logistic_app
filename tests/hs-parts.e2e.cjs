// Home services in the browser: plumber needs a part. Customer books → best-matched pro (Suresh) accepts →
// arrives → "Add part" from a nearby MoveAI shop (delivery) → customer sees ONE part card, opens "See it in the
// shop", approves → shop packs / sends / delivers → done → pay (part money to the shop) → "Report price" →
// "Book Suresh again" asks him first → admin Pros and Part prices tabs → pro training quiz + hours. Phone width.
const {chromium} = require('playwright');
const assert = require('assert');
const B = (process.env.MOVEAI_BASE || 'http://127.0.0.1:4177') + '/'; let n = 0;
const go = async (p, path) => { await p.goto(`${B}${path.replace('#', `?t=${++n}#`)}`, {waitUntil: 'load'}); await p.waitForTimeout(450); };
const state = p => p.evaluate(() => window.MoveAIVNextTest.state());
const text = async (p, sel = 'main') => (await p.textContent(sel)).replace(/\s+/g, ' ');
const as = async (p, ws, path) => { await p.evaluate(w => window.MoveAIVNextTest.switchWorkspace(w), ws); await go(p, path); };
const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const pick = (p, sel) => p.evaluate(q => { const el = document.querySelector(q); el.checked = true; el.dispatchEvent(new Event('change', {bubbles: true})); }, sel).then(() => p.waitForTimeout(250));
const patch = (p, fn) => p.evaluate(src => { const k = 'moveai-vnext-p1', s = JSON.parse(localStorage.getItem(k)); (new Function('s', src))(s); localStorage.setItem(k, JSON.stringify(s)); }, fn);
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 390, height: 860}});
  await ctx.route(/cdn\.jsdelivr/, r => r.fulfill({body: '', contentType: 'text/javascript'})); await ctx.route(/cdnjs/, r => r.abort());
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await go(p, 'index.html?demo=on#/home'); await p.evaluate(() => { window.MoveAIVNextTest.reset(); window.MoveAIVNextTest.switchWorkspace('personal'); });
  const next = async () => { await p.locator('#home-book-form').dispatchEvent('submit'); await p.waitForTimeout(350); };
  const bookTap = async () => {
    await p.check('[data-hs-cat][value="plumber"]', {force: true}); await p.waitForTimeout(250);
    await p.click('[data-hs-qty="tap"][data-d="1"]'); await p.waitForTimeout(200); await next(); await next();
    await p.check(`#home-book-form [name=date][value="${tomorrow()}"]`, {force: true}); await p.waitForTimeout(250); await pick(p, '#home-book-form [name=slot][value="12"]'); await next();
  };
  await go(p, 'index.html#/homeBook'); await bookTap(); await next();
  let s = await state(p); const r = s.serviceRequests[0];
  assert.equal(r.category, 'plumber'); assert.deepEqual(r.dispatch.current.ids, ['HP-SURESH'], 'only Suresh is a plumber within 5 km');
  assert.match(await text(p, '[data-hs-searching]'), /best-matched/); assert.ok(await p.isVisible('[data-hs="time-passes"]'));

  // Pro accepts, drives, starts
  await as(p, 'homePro', 'partner.html#/home'); assert.match(await text(p, `[data-hs-offer="${r.id}"]`), /closest best-rated/);
  await p.click(`[data-hs-offer="${r.id}"] [data-hs="accept"]`); await p.waitForTimeout(400); await p.click('[data-hs="on-the-way"]'); await p.waitForTimeout(250);
  for (let i = 0; i < 25 && !(await p.isVisible('.avail-chip')); i++) { await p.click('[data-hs="drive"]'); await p.waitForTimeout(100); }
  s = await state(p); await p.fill('[data-hs-start] [name=otp]', s.serviceRequests.find(x => x.id === r.id).startOtp); await p.locator('[data-hs-start]').dispatchEvent('submit'); await p.waitForTimeout(350);

  // Add part: search a nearby MoveAI shop, price comes from the shop
  await p.click('.part-add > summary'); await p.fill('[data-part-search] [name=q]', 'cartridge'); await p.locator('[data-part-search]').dispatchEvent('submit'); await p.waitForTimeout(300);
  assert.match(await text(p, '[data-part-add]'), /Gupta Hardware & Sanitary/); assert.match(await text(p, '[data-part-add]'), /₹220/); assert.doesNotMatch(await text(p, '[data-part-add]'), /Shiv Sanitary/);
  await p.selectOption('[data-part-add] [name=mode]', 'delivery'); await p.setInputFiles('[data-part-add] [name=photo]', {name: 'old-cartridge.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('x')});
  await p.locator('[data-part-add]').dispatchEvent('submit'); await p.waitForTimeout(300);
  await p.setInputFiles('[data-hs-done] [name=after]', {name: 'tap.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('x')}); await p.locator('[data-hs-done]').dispatchEvent('submit'); await p.waitForTimeout(250);
  assert.match(await text(p, '#hs-pro-error'), /not answered your part/);

  // Customer: one part card → See it in the shop → approve
  await as(p, 'personal', 'index.html#/serviceDetail'); assert.match(await text(p, '[data-part-approval]'), /Tap cartridge.*₹220/); assert.doesNotMatch(await text(p), /price list/i);
  await p.click('[data-part-see]'); await p.waitForTimeout(400); assert.ok(p.url().includes('#/partItem')); assert.match(await text(p), /MRP.*₹320/);
  await p.click('[data-part-decide="approve"]'); await p.waitForTimeout(400); assert.ok(p.url().includes('#/serviceDetail'));
  assert.match(await text(p), /Order placed with the shop/);
  for (let i = 0; i < 3; i++) { await p.click('[data-part-step]'); await p.waitForTimeout(250); }
  s = await state(p); assert.equal(s.serviceRequests.find(x => x.id === r.id).parts[0].order.status, 'delivered');
  assert.ok(s.notifications.some(x => x.to === 'personal' && /about 35 min/.test(x.text)));

  // Pro finishes; customer pays; part money reaches the shop; report price
  await as(p, 'homePro', 'partner.html#/proJob');
  await p.setInputFiles('[data-hs-done] [name=after]', {name: 'tap.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('x')}); await p.locator('[data-hs-done]').dispatchEvent('submit'); await p.waitForTimeout(300);
  await as(p, 'personal', 'index.html#/serviceDetail'); assert.match(await text(p), /Old part replaced: Tap cartridge/);
  await p.click('[data-op="service-confirm"]'); await p.waitForTimeout(300); await p.click(`[data-pay-balance="${r.id}"]`); await p.waitForTimeout(500);
  await go(p, 'index.html#/serviceDetail'); s = await state(p);
  assert.ok(s.ledger.some(x => x.type === 'wallet_credit' && x.payee === 'store:gupta-hardware' && x.amount === 220), 'part money to the shop');
  assert.ok(s.ledger.some(x => x.type === 'part_settlement' && x.serviceId === r.id));
  await p.click('[data-op="service-rate"]'); await p.waitForTimeout(300);
  await p.click('details:has([data-part-report]) > summary'); await p.fill('[data-part-report] [name=note]', 'Market price looks lower'); await p.locator('[data-part-report]').dispatchEvent('submit'); await p.waitForTimeout(300);
  assert.match(await text(p), /price report open/);

  // Book Suresh again → asked first
  await p.click('[data-hs="book-again"]'); await p.waitForTimeout(400); assert.ok(p.url().includes('#/homeBook'));
  await p.click('[data-hs-qty="tap"][data-d="1"]'); await p.waitForTimeout(200); await next(); await next();
  await p.check(`#home-book-form [name=date][value="${tomorrow()}"]`, {force: true}); await p.waitForTimeout(250); await pick(p, '#home-book-form [name=slot][value="16"]'); await next();
  assert.match(await text(p, '[data-hs-fav]'), /We ask Suresh Kumar first/); await next();
  s = await state(p); const r2 = s.serviceRequests[0]; assert.equal(r2.favouriteProId, 'HP-SURESH'); assert.equal(r2.dispatch.current.windowMs, 120000);
  assert.match(await text(p, '[data-hs-searching]'), /asked Suresh Kumar first/);

  // Admin: Pros tab and Part prices tab
  await patch(p, "if (!s.workspaces.includes('admin')) s.workspaces.push('admin');");
  await go(p, 'admin.html#/homeServicesAdmin?ws=admin'); await p.click('[data-hs-admin-tab="pros"]'); await p.waitForTimeout(300);
  assert.match(await text(p, '[data-hs-pros]'), /Suresh Kumar.*Trained/); assert.match(await text(p, '[data-hs-pros]'), /Deepak/);
  await p.click('[data-hs-pause="HP-AMIT"]'); await p.waitForTimeout(250); s = await state(p); assert.equal(s.homePros.find(x => x.id === 'HP-AMIT').active, false);
  await p.click('[data-hs-admin-tab="parts"]'); await p.waitForTimeout(300); assert.match(await text(p), /Market price looks lower/);
  await p.click('[data-part-resolve$="|dismiss"]'); await p.waitForTimeout(300); assert.match(await text(p), /Nothing to check/);

  // Pro set-up: training quiz → Trained; hours
  await as(p, 'homePro', 'partner.html#/home'); await patch(p, "const x = s.homePros.find(q => q.id === 'HP-SURESH'); x.trained = false; delete x.hours;"); await go(p, 'partner.html#/home'); assert.match(await text(p, '[data-hs-setup]'), /Training video/);
  await p.click('[data-hs-setup-open="train"]'); await p.waitForTimeout(400); assert.ok(p.url().includes('#/profile'));
  await p.locator('#hs-train-form').dispatchEvent('submit'); await p.waitForTimeout(250); assert.match(await text(p, '#hs-train-error'), /video/);
  await p.check('#hs-train-form [name=watched]'); for (let i = 0; i < 7; i++) { const el = await p.$(`#hs-train-form [name=q${i}][value="0"]`); if (el) await el.check(); }
  await p.locator('#hs-train-form').dispatchEvent('submit'); await p.waitForTimeout(300);
  s = await state(p); assert.equal(s.homePros.find(x => x.id === 'HP-SURESH').trained, true); assert.match(await text(p), /✓ Trained/);
  await p.click('[data-hs-section="hours"] > summary'); await p.uncheck('#hs-hours-form [name=days][value="0"]'); await p.locator('#hs-hours-form').dispatchEvent('submit'); await p.waitForTimeout(300);
  s = await state(p); assert.deepEqual(s.homePros.find(x => x.id === 'HP-SURESH').hours.days, [1, 2, 3, 4, 5, 6]);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no sideways scrolling');
  assert.deepEqual(errors, []);
  await b.close(); console.log('PASS parts e2e: best-matched pro, add part from nearby shop (delivery), one approval card + See it in the shop, shop packs/sends/delivers, done, pay → shop credited, report price, book my pro again (asked first), admin Pros/pause + Part prices, training quiz → Trained, hours');
})().catch(e => { console.error(e); process.exit(1); });
