// Browser journey: a Bihar food seller goes through the strict identity and shop checks, the admin
// works the risk queue with evidence, the store goes live on probation, and a UPI order shows the
// seller a clear "waiting for payment" state until the (demo) bank confirms. Then the customer
// reports an expired item. Serve this folder first: `python3 -m http.server 4177`.
const {chromium} = require('playwright');
const assert = require('assert');
const B = (process.env.MOVEAI_BASE || 'http://127.0.0.1:4177') + '/';
let n = 0;
const go = async (p, path) => { await p.goto(`${B}${path.replace('#', `?t=${++n}#`)}`, {waitUntil: 'load'}); await p.waitForTimeout(450); };
const sellErr = p => p.$eval('.sell-error', e => e.hidden ? '' : e.textContent).catch(() => '');
const step = async p => { await p.click('form[data-sell-step] button[type=submit]'); await p.waitForTimeout(250); return sellErr(p); };
const state = p => p.evaluate(() => window.MoveAIVNextTest.state());
const patch = (p, fn) => p.evaluate(src => { const k = 'moveai-vnext-p1', s = JSON.parse(localStorage.getItem(k)); (0, eval)(`(${src})`)(s); localStorage.setItem(k, JSON.stringify(s)); }, fn.toString());
const shot = async (p, name) => { if (process.env.SHOTS) await p.screenshot({path: `${process.env.SHOTS}/${name}.png`, fullPage: true}); };
const iso = d => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport: {width: 1280, height: 900}});
  await ctx.route(/cdn\.jsdelivr/, r => r.fulfill({body: '', contentType: 'text/javascript'})); await ctx.route(/cdnjs/, r => r.abort());
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));

  await go(p, 'index.html#/home'); await p.evaluate(() => window.MoveAIVNextTest.startSignup());
  await p.locator('[data-route="signup"]').click(); await p.fill('#mobile', '9123456711'); await p.check('#consent'); await p.locator('#mobile-form').dispatchEvent('submit');
  await p.fill('#otp', '123456'); await p.locator('#otp-form').dispatchEvent('submit'); await p.waitForTimeout(300);
  await p.click('[data-purpose="sell"]'); await p.waitForTimeout(500);
  await p.fill('input[name=legalName]', 'Patna Traders'); await p.check('input[name=sellerType][value=shop]'); await p.check('input[name=categories][value=food]'); assert.equal(await step(p), '');
  await p.fill('input[name=pan]', 'ABCDE1234F'); await p.fill('input[name=gstin]', '10ABCDE1234F1Z5'); await p.fill('input[name=account]', '123456789012'); await p.fill('input[name=ifsc]', 'SBIN0001234'); assert.equal(await step(p), '');
  await p.fill('input[name=fssai]', '12345678901234'); await p.fill('input[name=fssaiExpiry]', '2030-01-01'); assert.equal(await step(p), '');
  // Store: the screenshot's mistake (wrong pincode for the state) is caught.
  await p.fill('input[name=storeName]', 'Patna Bazaar'); await p.fill('input[name=branchName]', 'Boring Road'); await p.fill('input[name=address]', '4 Boring Road, Patna'); await p.fill('input[name=city]', 'Patna');
  await p.fill('input[name=pincode]', '201301'); await p.selectOption('select[name=stateCode]', '10'); assert.match(await step(p), /Pincode 201301 is in Uttar Pradesh, but you chose Bihar/);
  await p.fill('input[name=pincode]', '800001'); assert.equal(await step(p), '');
  // Identity and shop checks (strict state) — its own step, right after the store.
  assert.match(await p.textContent('.page-header p'), /Identity and shop checks/);
  assert.match(await p.textContent('main'), /Extra checks for sellers in this state/);
  await shot(p, 'trust-step');
  assert.match(await step(p), /OTP|Aadhaar|consent/i, 'nothing filled → refused');
  await p.fill('input[name=aadhaar]', '234567890123'); await p.fill('input[name=otp]', '123456'); await p.check('input[name=consent]');
  const file = name => ({name, mimeType: 'image/jpeg', buffer: Buffer.from('x')});
  await p.setInputFiles('input[name=selfie]', file('selfie.jpg'));
  await p.setInputFiles('input[name=photoSignboard]', file('sign.jpg')); await p.setInputFiles('input[name=photoInside]', file('inside.jpg'));
  assert.match(await step(p), /all three shop photos/);
  await p.setInputFiles('input[name=photoStock]', file('stock.jpg')); await p.setInputFiles('input[name=invoices]', {name: 'invoice.pdf', mimeType: 'application/pdf', buffer: Buffer.from('x')});
  assert.equal(await step(p), '');
  await p.check('input[name=own]'); assert.equal(await step(p), '');
  await p.check('input[name=accept]'); assert.equal(await step(p), '');
  const add = async (o = {}) => { await p.fill('form[data-sell-product] input[name=name]', 'Toor Dal'); await p.fill('form[data-sell-product] input[name=price]', '150'); await p.fill('form[data-sell-product] input[name=mrp]', '170'); await p.fill('form[data-sell-product] input[name=size]', '1 kg'); await p.fill('form[data-sell-product] input[name=batch]', o.batch ?? 'TD-11'); await p.fill('form[data-sell-product] input[name=mfgDate]', o.mfg ?? iso(-20)); await p.fill('form[data-sell-product] input[name=expiryDate]', o.exp ?? iso(300)); await p.click('form[data-sell-product] button'); await p.waitForTimeout(250); return sellErr(p); };
  assert.match(await add({mfg: iso(-300), exp: iso(20)}), /too close to expiry/);
  assert.equal(await add(), '');
  await p.click('[data-sell-goto="8"]'); await p.waitForTimeout(250); await p.click('[data-sell-submit]'); await p.waitForTimeout(400);
  assert.equal(await p.textContent('.sell-app .panel-header .status-pill'), 'Under review', 'strict state is never auto-approved');

  // Admin: queue sorted by risk, evidence panel, field visit + video KYC recorded before approving.
  await patch(p, s => { if (!s.workspaces.includes('admin')) s.workspaces.push('admin'); });
  await go(p, 'admin.html#/sellerReview');
  assert.match(await p.textContent('.review-queue'), /Patna Bazaar[\s\S]*Bihar[\s\S]*strict[\s\S]*Medium risk/);
  assert.match(await p.textContent('.seller-policy summary'), /strict in Bihar/);
  await shot(p, 'admin-queue');
  const panel = '#review-' + (await state(p)).sellerApplications.find(a => a.store.name === 'Patna Bazaar').id;
  assert.match(await p.textContent(panel + ' .evidence'), /Pincode is in the chosen state[\s\S]*800001 → Bihar[\s\S]*Aadhaar via DigiLocker/);
  await p.click(panel + ' form[data-sell-decide][data-section="trust"] button[value=approved]'); await p.waitForTimeout(250);
  assert.match(await p.textContent('#toast, .toast, body'), /Not every check has passed/);
  for (const key of ['shopPhotos', 'supplierInvoices', 'videoKyc', 'fieldVisit']) { await p.fill(`${panel} form[data-trust-record][data-key="${key}"] input[name=note]`, 'Checked in person and on call'); await p.click(`${panel} form[data-trust-record][data-key="${key}"] button[value=verified]`); await p.waitForTimeout(200); }
  for (const sec of ['type', 'kyc', 'food', 'store', 'trust', 'delivery', 'agreement', 'products']) { await p.click(`${panel} form[data-sell-decide][data-section="${sec}"] button[value=approved]`); await p.waitForTimeout(200); }
  const st = await state(p), store = Object.entries(st.shopPartners).find(([, x]) => x.name === 'Patna Bazaar');
  assert.ok(store, 'store live'); assert.equal(store[1].probation.limits.maxOrderValue, 2000); assert.match(await p.textContent('main'), /New stores on probation[\s\S]*Patna Bazaar/);

  // Customer pays by UPI: the seller sees "waiting for payment", then the demo bank confirms and Accept appears.
  await patch(p, s => { const prod = s.products.find(x => x.fulfilmentPartner === 'Patna Bazaar'); s.productCart = [{productId: prod.id, quantity: 2, priceAtAdd: prod.price}]; s.checkoutFromCart = true; s.currentWorkspace = 'personal'; });
  await go(p, 'index.html#/productCheckout');
  const fulfil = await p.$('select[name=fulfilment]'); if (fulfil) await fulfil.selectOption('delivery').catch(() => {});
  await p.fill('textarea[name=address], input[name=address]', '22 Fraser Road, Patna').catch(() => {});
  await p.check('input[name=method][value=cod]').catch(() => {});
  await p.click('form[data-po-form] button[type=submit]'); await p.waitForTimeout(300);
  assert.match(await p.textContent('#po-error'), /new store: pay by UPI or card/, 'no COD on probation');
  await p.check('input[name=method][value=upi]'); await p.fill('input[name=vpa]', 'buyer@okaxis');
  await p.click('form[data-po-form] button[type=submit]'); await p.waitForTimeout(600);
  await p.keyboard.press('Escape').catch(() => {}); await p.evaluate(() => document.querySelectorAll('div[style*="position:fixed"]').forEach(x => x.remove()));
  await go(p, 'index.html#/orders');
  assert.match(await p.textContent('main'), /Waiting for your bank to confirm[\s\S]*moveai\.orders@example/);
  await go(p, 'business.html#/shopOrders?ws=' + store[0]);
  assert.match(await p.textContent('main'), /Waiting for the customer's payment\. Don't pack yet[\s\S]*cancels automatically in 1[0-5] min/);
  assert.ok(!(await p.$('[data-commerce="accept"]')), 'no Accept while unpaid');
  await shot(p, 'store-waiting');
  assert.doesNotMatch(await p.textContent('main'), /not_eligible/, 'plain words, no status codes');
  await patch(p, s => { s.currentWorkspace = 'personal'; });
  await go(p, 'index.html#/orders'); await p.click('[data-po="bank-ok"]'); await p.waitForTimeout(300);
  await go(p, 'business.html#/shopOrders?ws=' + store[0]);
  assert.ok(await p.$('[data-commerce="accept"]'), 'Accept appears once the bank confirms');

  // Expired item report after delivery: refund, product paused, strike.
  await patch(p, s => { const o = s.customerOrders.find(x => x.fulfilmentPartner === 'Patna Bazaar'); o.status = 'delivered'; o.deliveredAt = Date.now(); s.currentWorkspace = 'personal'; });
  await go(p, 'index.html#/orders'); await p.click('.expired-report summary');
  await p.setInputFiles('.expired-report input[name=photo]', file('expiry.jpg')); await p.click('.expired-report button'); await p.waitForTimeout(300);
  const after = await state(p), partner = Object.values(after.shopPartners).find(x => x.name === 'Patna Bazaar');
  assert.equal(partner.strikes, 1); assert.equal(after.products.find(x => x.fulfilmentPartner === 'Patna Bazaar').status, 'paused');

  // ?demo=off hides the demo bank buttons.
  await patch(p, s => { const o = s.customerOrders.find(x => x.fulfilmentPartner === 'Patna Bazaar'); o.status = 'payment_pending'; });
  await p.goto(`${B}index.html?demo=off&t=${++n}#/orders`, {waitUntil: 'load'}); await p.waitForTimeout(450); assert.equal(await p.$$eval('[data-po="bank-ok"]', x => x.filter(e => e.offsetParent).length), 0);

  assert.deepEqual(errors, []);
  console.log('PASS seller trust journey: Bihar strict checks, pincode guard, expiry on listing, admin risk queue + evidence, probation (no COD), UPI waiting state → bank confirm → Accept, expired-item report, demo=off');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
