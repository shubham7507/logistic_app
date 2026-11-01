// Adding a picker to a store created through "Sell products" (an electrical shop): owner invites →
// worker gets an SMS/WhatsApp link → confirms mobile with OTP → accepts → Aadhaar, selfie, bank →
// owner approves → checks in → an order is offered → task appears. Serve on port 4177 first.
const {chromium} = require('playwright');
const assert = require('assert');
const B = (process.env.MOVEAI_BASE || 'http://127.0.0.1:4177') + '/'; let n = 0;
const go = async (p, path) => { await p.goto(`${B}${path.replace('#', `?t=${++n}#`)}`, {waitUntil: 'load'}); await p.waitForTimeout(450); };
const state = p => p.evaluate(() => window.MoveAIVNextTest.state());
const text = async (p, sel = 'main') => (await p.textContent(sel)).replace(/\s+/g, ' ');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 1280, height: 900}});
  await ctx.route(/cdn\.jsdelivr/, r => r.fulfill({body: '', contentType: 'text/javascript'})); await ctx.route(/cdnjs/, r => r.abort());
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await go(p, 'index.html#/home'); await p.evaluate(() => window.MoveAIVNextTest.startSignup());
  await p.locator('[data-route="signup"]').click(); await p.fill('#mobile', '9123456733'); await p.check('#consent'); await p.locator('#mobile-form').dispatchEvent('submit');
  await p.fill('#otp', '123456'); await p.locator('#otp-form').dispatchEvent('submit'); await p.waitForTimeout(300);
  // A live electrical shop created through seller onboarding (UP, standard review).
  const ws = await p.evaluate(async () => {
    const SO = await import('./js/seller-onboarding.js'); const k = 'moveai-vnext-p1', s = JSON.parse(localStorage.getItem(k));
    const a = SO.startApplication(s, {}); SO.saveType(s, a, {sellerType: 'shop', categories: ['electrical'], legalName: 'Verma Electricals'});
    SO.saveKyc(s, a, {pan: 'ABCDE1234F', gstin: '09ABCDE1234F1Z5', account: '123456789012', ifsc: 'SBIN0001234'}); SO.saveLicences(s, a, {brandProof: 'invoice.pdf'});
    SO.saveStore(s, a, {storeName: 'Verma Electricals', branchName: 'Sector 18', address: '5 Sector 18 Market, Noida', city: 'Noida', pincode: '201301', stateCode: '09', open: '00:00', close: '23:59', radiusKm: 5});
    SO.saveDelivery(s, a, {mode: 'moveai'}); SO.saveAgreement(s, a, {accept: true}); SO.addProduct(s, a, {name: 'LED Bulb 9W', category: 'electrical', price: 90, mrp: 120, size: '9 W', stock: 40});
    SO.submit(s, a); for (const sec of Object.keys(a.sections)) if (a.sections[sec].status === 'pending') SO.decide(s, a.id, sec, 'approved', 'Checked papers');
    localStorage.setItem(k, JSON.stringify(s)); return a.storeKey;
  });
  assert.ok(ws, 'store live'); const worker = 'picker' + ws[0].toUpperCase() + ws.slice(1);

  // 1. Owner: Staff → Add worker → invite (SMS + WhatsApp link).
  await go(p, `business.html#/easyStaff?ws=${ws}`); assert.match(await text(p), /Staff ?Verma Electricals · Owner/);
  await p.click('[data-easy-nav="storeHR"]'); await p.waitForTimeout(400);
  await p.fill('form[data-hr-form=invite] input[name=name]', 'Arjun Kumar'); await p.fill('form[data-hr-form=invite] input[name=mobile]', '9876512345'); await p.fill('form[data-hr-form=invite] input[name=rate]', '12000');
  await p.click('form[data-hr-form=invite] button'); await p.waitForTimeout(400);
  assert.match(await text(p), /Arjun Kumar · invitation sent[\s\S]*SMS and WhatsApp to ••••2345[\s\S]*not opened yet/);
  let st = await state(p); const pk = st.pickerStaff.find(x => x.store === ws && x.name === 'Arjun Kumar');
  assert.equal(pk.status, 'invited'); assert.equal(pk.role, 'fulfilment', 'electrical shops get fulfilment staff');
  assert.match(st.outbox[0].text, new RegExp(`pickJoin/${pk.inviteToken}`)); assert.deepEqual(st.outbox[0].channels, ['SMS', 'WhatsApp']);

  // 2. Worker opens the link: wrong mobile refused, then OTP → staff app.
  await go(p, `business.html#/pickJoin/${pk.inviteToken}`); assert.match(await text(p), /Verma Electricals invited you Arjun Kumar · Order preparation \(fulfilment\)/);
  await p.fill('form[data-pick-join] input[name=mobile]', '9000000000'); await p.fill('form[data-pick-join] input[name=otp]', '123456'); await p.check('form[data-pick-join] input[name=consent]');
  await p.click('form[data-pick-join] button'); await p.waitForTimeout(300); assert.match(await text(p, '.pick-join-error'), /ending 2345/);
  await p.fill('form[data-pick-join] input[name=mobile]', '9876512345'); await p.fill('form[data-pick-join] input[name=otp]', '123456'); await p.check('form[data-pick-join] input[name=consent]');
  await p.click('form[data-pick-join] button'); await p.waitForTimeout(600);
  assert.ok(p.url().endsWith('#/pickProfile')); assert.equal(await p.textContent('#workspace-name'), 'Verma Electricals staff');
  await go(p, 'business.html#/pickJoin/nope'); assert.match(await text(p), /not valid/);

  // 3. Accept → joining details (Aadhaar OTP, selfie, bank) → submitted.
  await go(p, `business.html#/pickProfile?ws=${worker}`); await p.click('[data-commerce="accept-picker"]'); await p.waitForTimeout(400);
  const F = '#picker-onboarding-form ';
  await p.fill(F + 'input[name=aadhaar]', '234567890123'); await p.fill(F + 'input[name=dob]', '1998-05-10'); await p.fill(F + 'input[name=otp]', '123456');
  await p.setInputFiles(F + 'input[name=selfie]', {name: 'selfie.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('x')}); await p.check(F + 'input[name=consent]');
  await p.fill(F + 'input[name=accountName]', 'Arjun Kumar'); await p.fill(F + 'input[name=accountNumber]', '123456789012'); await p.fill(F + 'input[name=ifsc]', 'SBIN0001234');
  await p.click(F + 'button.button.primary'); await p.waitForTimeout(500);
  st = await state(p); assert.equal(st.pickerStaff.find(x => x.id === pk.id).status, 'submitted', 'selfie file accepted (bug fixed)');

  // 4. Owner reviews and activates.
  await go(p, `business.html#/shopTeam?ws=${ws}`); await p.click('[data-picker-review]'); await p.waitForTimeout(400);
  assert.match(await text(p), /Mobile verified[\s\S]*Aadhaar \(OTP\)[\s\S]*Bank \/ UPI/);
  await p.click('[data-commerce="picker-review-approve"]'); await p.waitForTimeout(400);
  st = await state(p); assert.equal(st.pickerStaff.find(x => x.id === pk.id).status, 'active');

  // 5. Worker checks in (My work & pay) → owner accepts a paid order → offered to the worker.
  await p.evaluate(({ws, id}) => { const k = 'moveai-vnext-p1', s = JSON.parse(localStorage.getItem(k)); (s.staffWorkRules ||= {})[id] = [{effectiveFrom: '2026-01-01', weekdays: [0, 1, 2, 3, 4, 5, 6]}]; localStorage.setItem(k, JSON.stringify(s)); }, {ws, id: pk.id});
  await go(p, `business.html#/myHR?ws=${worker}`); await p.click('[data-hr="checkin"]'); await p.waitForTimeout(400);
  const oid = await p.evaluate(async () => { const O = await import('./js/product-orders.js'); const k = 'moveai-vnext-p1', s = JSON.parse(localStorage.getItem(k)); const prod = s.products.find(x => x.fulfilmentPartner === 'Verma Electricals'); const r = O.placeOrder(s, {productId: prod.id, qty: 1, address: '9 Sector 50, Noida', method: 'upi', vpa: 'c@okaxis'}); O.bankConfirmPayment(s, r.order, true); localStorage.setItem(k, JSON.stringify(s)); return r.order.id; });
  await go(p, `business.html#/shopOrders?ws=${ws}`); await p.click('[data-commerce="accept"]'); await p.waitForTimeout(400);
  st = await state(p); const o = st.customerOrders.find(x => x.id === oid); assert.equal(o.pickerOffer?.pickerId, pk.id, 'offered to the checked-in worker');
  await go(p, `business.html#/pickTasks?ws=${worker}`); assert.match(await text(p), new RegExp(`${oid}[\\s\\S]*Accept task`));

  assert.deepEqual(errors, []);
  console.log('PASS picker joining for a new electrical shop: invite link (SMS/WhatsApp), mobile OTP, accept, Aadhaar/selfie/bank, owner approval, check-in, order offered');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
