// Location picker and live tracking in the browser (phone width), through the home-service steps:
// Motihari address not on the map → landmark section opens; wrong-pin warning; GPS gives an Exact point with
// DIGIPIN; booking; pro Navigate link, live drive, customer live card + "last seen"; area-only booking where the
// customer shares live location. Serve on 4177 first.
const {chromium} = require('playwright');
const assert = require('assert');
const B = (process.env.MOVEAI_BASE || 'http://127.0.0.1:4177') + '/'; let n = 0;
const go = async (p, path) => { await p.goto(`${B}${path.replace('#', `?t=${++n}#`)}`, {waitUntil: 'load'}); await p.waitForTimeout(450); };
const state = p => p.evaluate(() => window.MoveAIVNextTest.state());
const text = async (p, sel = 'main') => (await p.textContent(sel)).replace(/\s+/g, ' ');
const as = async (p, ws, path) => { await p.evaluate(w => window.MoveAIVNextTest.switchWorkspace(w), ws); await go(p, path); };
const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const K = '[data-loc-picker="hs-addr"] ';
const next = async p => { await p.locator('#home-book-form').dispatchEvent('submit'); await p.waitForTimeout(350); };
const toAddressStep = async (p, job) => { await go(p, 'index.html#/homeBook'); await p.click(`[data-hs-qty="${job}"][data-d="1"]`); await p.waitForTimeout(250); await next(p); await p.check('[name="addressId"][value="new"]', {force: true}); await p.waitForTimeout(300); };
const finish = async (p, slot) => { await next(p); await p.check(`#home-book-form [name=date][value="${tomorrow()}"]`, {force: true}); await p.waitForTimeout(300); await p.check(`#home-book-form [name=slot][value="${slot}"]`, {force: true}); await next(p); await next(p); await p.waitForTimeout(300); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 390, height: 860}});
  await ctx.route(/cdn\.jsdelivr/, r => r.fulfill({body: '', contentType: 'text/javascript'})); await ctx.route(/cdnjs/, r => r.abort());
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await go(p, 'index.html?demo=on#/home'); await p.evaluate(() => { window.MoveAIVNextTest.reset(); window.MoveAIVNextTest.switchWorkspace('personal'); });
  await toAddressStep(p, 'fan');
  assert.ok(await p.isVisible(K + '[data-loc="gps"]'), 'Use my location button shown'); assert.equal(await p.isVisible(K + '[name="hs-addr-landmark"]'), false, 'landmark tucked away');

  // Motihari: search finds nothing → the landmark / link section opens
  await p.fill(K + '[name="hs-addr-q"]', 'Chhatauni Motihari'); await p.click(K + '[data-loc="search"]'); await p.waitForTimeout(250);
  assert.match(await text(p, K + '[data-loc-msg="hs-addr"]'), /not on the map/); assert.ok(await p.isVisible(K + '[name="hs-addr-landmark"]'), 'landmark section opened');
  await p.fill(K + '[name="hs-addr-line"]', 'Ram Prasad ji ka ghar'); await p.fill(K + '[name="hs-addr-village"]', 'Pipra tola'); await p.fill(K + '[name="hs-addr-landmark"]', 'Hanuman mandir ke peeche'); await p.fill(K + '[name="hs-addr-pincode"]', '845401');
  // Wrong pin: Noida phone location with a Motihari PIN → warning, Next blocked
  await p.click(K + '[data-loc="demo"][data-spot="noida"]'); await p.waitForTimeout(250);
  assert.ok(await p.isVisible('[data-loc-far="hs-addr"]'), 'wrong-pin warning'); assert.equal(await p.inputValue(K + '[name="hs-addr-line"]'), 'Ram Prasad ji ka ghar', 'typed fields kept');
  await next(p); assert.match(await text(p, '#home-book-error'), /Yes, the pin is right/);
  // The real GPS point at the house in Motihari → Exact + DIGIPIN, no warning
  await p.click(K + '[data-loc="demo"][data-spot="motihari"]'); await p.waitForTimeout(250);
  assert.equal(await p.isVisible('[data-loc-far="hs-addr"]'), false); assert.equal(await p.getAttribute(K + '[data-loc-label]', 'data-loc-label'), 'exact');
  assert.match(await text(p, K + '.loc-summary'), /DIGIPIN [2-9CFJKLMPT]{3}-/);
  await finish(p, '10');
  let s = await state(p); const r = s.serviceRequests[0];
  assert.equal(r.address.precision, 'exact'); assert.equal(r.address.village, 'Pipra tola'); assert.ok(s.savedAddresses.some(a => a.line === 'Ram Prasad ji ka ghar' && a.precision === 'exact'));

  // Pro: navigate, on the way, live drive
  await as(p, 'homePro', 'partner.html#/home'); await p.click(`[data-hs-offer="${r.id}"] [data-hs="accept"]`); await p.waitForTimeout(400);
  assert.match(await text(p), /Hanuman mandir ke peeche/); assert.match(await p.getAttribute('[data-hs-nav]', 'href'), /destination=26\.67/);
  await p.click('[data-hs="on-the-way"]'); await p.waitForTimeout(250); await p.click('[data-hs="drive"]'); await p.waitForTimeout(200); await p.click('[data-hs="drive"]'); await p.waitForTimeout(200);
  assert.match(await text(p), /Sharing your location/);

  // Customer: live card with distance and ETA; then "last seen"
  await as(p, 'personal', 'index.html#/serviceDetail'); assert.match(await text(p, '[data-hs-live]'), /Suresh Kumar is [\d.]+ km away · about \d+ min/);
  await p.evaluate(id => { const k = 'moveai-vnext-p1', st = JSON.parse(localStorage.getItem(k)); st.serviceRequests.find(x => x.id === id).geo.lastAt -= 4 * 60000; localStorage.setItem(k, JSON.stringify(st)); }, r.id);
  await go(p, 'index.html#/serviceDetail'); assert.match(await text(p, '[data-hs-live]'), /Last seen 4 min ago/);

  // Area-only booking (basic phone, landmark only): customer shares live location later
  await toAddressStep(p, 'switch');
  await p.click(K + '.loc-more summary'); await p.waitForTimeout(100);
  await p.fill(K + '[name="hs-addr-line"]', 'Shiv Kumar ji ka ghar'); await p.fill(K + '[name="hs-addr-village"]', 'Turkaulia'); await p.fill(K + '[name="hs-addr-landmark"]', 'Near the school'); await p.fill(K + '[name="hs-addr-pincode"]', '845401');
  await finish(p, '12');
  s = await state(p); const r2 = s.serviceRequests[0]; assert.equal(r2.address.precision, 'area');
  await as(p, 'homePro', 'partner.html#/proJobs'); await p.click(`[data-hs-offer="${r2.id}"] [data-hs="accept"]`); await p.waitForTimeout(300);
  assert.match(await p.getAttribute('[data-hs-nav]', 'href'), /maps\/search\/.*school/i);
  await as(p, 'personal', 'index.html#/serviceDetail'); await p.click('[data-hs="cust-share-demo"]'); await p.waitForTimeout(300);
  s = await state(p); assert.equal(s.serviceRequests.find(x => x.id === r2.id).address.precision, 'exact');
  await go(p, 'index.html#/homeBook'); assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no sideways scrolling');
  assert.deepEqual(errors, []);
  await b.close(); console.log('PASS location: Motihari not on map opens landmark section, wrong-pin warning blocks Next, GPS exact + DIGIPIN, saved address, Navigate link, live drive, customer live card + last seen, area-only customer shares location');
})().catch(e => { console.error(e); process.exit(1); });
