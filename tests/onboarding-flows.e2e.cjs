// Every onboarding path from one sign-up: customer, courier, driver/helper, logistics business, seller
// (full review cycle), an approved business adding "Sell products", and pickup-only checkout.
// Serve this folder first, e.g. `python3 -m http.server 4177`.
const {chromium} = require('playwright');
const assert = require('assert');
const B = (process.env.MOVEAI_BASE || 'http://127.0.0.1:4177') + '/';
let n = 0;
const go = async (p, path) => { await p.goto(`${B}${path.replace('#', `?t=${++n}#`)}`, {waitUntil: 'load'}); await p.waitForTimeout(450); };
const sellErr = p => p.$eval('.sell-error', e => e.hidden ? '' : e.textContent).catch(() => '');
const state = p => p.evaluate(() => window.MoveAIVNextTest.state());

async function signUp(p, mobile = '9123456789') {
  await go(p, 'index.html#/home');
  await p.evaluate(() => window.MoveAIVNextTest.startSignup());
  await p.locator('[data-route="signup"]').click();
  await p.fill('#mobile', mobile); await p.check('#consent'); await p.locator('#mobile-form').dispatchEvent('submit');
  await p.fill('#otp', '123456'); await p.locator('#otp-form').dispatchEvent('submit'); await p.waitForTimeout(300);
  assert.ok(p.url().endsWith('#/purpose'), 'new people see "What do you want to do?"');
}
async function step(p) { await p.click('form[data-sell-step] button[type=submit]'); await p.waitForTimeout(250); return sellErr(p); }

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport: {width: 1280, height: 900}});
  await ctx.route(/cdn\.jsdelivr/, r => r.fulfill({body: '', contentType: 'text/javascript'})); await ctx.route(/cdnjs/, r => r.abort());
  const p = await ctx.newPage(); const errors = [];
  p.on('pageerror', e => { errors.push(e.message); if (process.env.DEBUG) console.log('PAGEERR', p.url(), e.stack.split('\n').slice(0, 3).join(' | ')); });

  // 1. Purpose screen lists every path, including the new "Sell products".
  await signUp(p);
  const purposes = await p.$$eval('[data-purpose]', e => e.map(x => x.dataset.purpose));
  for (const k of ['personal', 'work', 'delivery', 'sell', 'business', 'invitations', 'later']) assert.ok(purposes.includes(k), k);

  // 2. Customer: straight to the customer home with Sell / Work entry points.
  await p.click('[data-purpose="personal"]'); await p.waitForTimeout(300);
  assert.ok(p.url().endsWith('#/home')); assert.deepEqual((await state(p)).workspaces, ['personal']);
  assert.deepEqual(await p.$$eval('.join-entry b', e => e.map(x => x.textContent)), ['Sell on MoveAI', 'Work with MoveAI']);

  // 3. Driver / helper: "Find work" opens the partner profile.
  await signUp(p); await p.click('[data-purpose="work"]'); await p.waitForTimeout(400);
  assert.match(p.url(), /#\/(candidateProfile|workerStatus)$/);
  assert.equal(await p.textContent('.brand b'), 'MoveAI Partner');

  // 4. Courier: "Become a delivery partner" opens the delivery joining profile in the Partner app.
  await signUp(p); await p.click('[data-purpose="delivery"]'); await p.waitForTimeout(400);
  assert.ok(p.url().endsWith('#/deliveryProfile')); assert.equal(await p.textContent('.brand b'), 'MoveAI Partner');

  // 5. Logistics business: "Create a logistics business" opens Add your business, which also offers Sell products.
  await signUp(p); await p.click('[data-purpose="business"]'); await p.waitForTimeout(400);
  assert.ok(p.url().endsWith('#/businessStart')); assert.ok(await p.isVisible('.sell-banner [data-sell-entry]'));

  // 6. Seller: full application, validation messages, admin correction, resubmission, go-live.
  await signUp(p, '9123456780'); await p.click('[data-purpose="sell"]'); await p.waitForTimeout(500);
  assert.ok(p.url().endsWith('#/sellStart')); assert.equal(await p.textContent('#page-title'), 'Sell products');
  assert.match(await step(p), /seller type/i, 'empty step 1 is refused');
  await p.fill('input[name=legalName]', 'Gupta Traders'); await p.check('input[name=sellerType][value=shop]');
  await p.check('input[name=categories][value=food]'); await p.check('input[name=categories][value=electrical]');
  assert.equal(await step(p), '');
  await p.fill('input[name=pan]', 'ABCDE1234F'); await p.fill('input[name=gstin]', '09ABCDE1234F1Z9'); await p.fill('input[name=account]', '123456789012'); await p.fill('input[name=ifsc]', 'SBIN0001234');
  assert.match(await step(p), /cancelled/, 'cancelled GSTIN');
  await p.fill('input[name=gstin]', '09ABCDE1234F1Z5'); assert.equal(await step(p), '');
  await p.fill('input[name=fssai]', '12345678901234'); await p.fill('input[name=fssaiExpiry]', '2030-01-01'); assert.equal(await step(p), '', 'brand papers left out on purpose');
  await p.fill('input[name=storeName]', 'Gupta Mart'); await p.fill('input[name=branchName]', 'Sector 62'); await p.fill('input[name=address]', '12 Sector 62, Noida'); await p.fill('input[name=city]', 'Noida');
  await p.selectOption('select[name=stateCode]', '27'); assert.match(await step(p), /registered in Uttar Pradesh/, 'address must be in the GSTIN state');
  await p.selectOption('select[name=stateCode]', '09'); assert.equal(await step(p), '');
  await p.check('input[name=mode][value=pickup]'); assert.equal(await step(p), '');
  assert.match(await step(p), /Accept/); await p.check('input[name=accept]'); assert.equal(await step(p), '');
  const add = async (name, category, price, mrp, size) => { await p.fill('form[data-sell-product] input[name=name]', name); await p.selectOption('form[data-sell-product] select[name=category]', category); await p.fill('form[data-sell-product] input[name=price]', String(price)); await p.fill('form[data-sell-product] input[name=mrp]', String(mrp)); await p.fill('form[data-sell-product] input[name=size]', size); await p.click('form[data-sell-product] button'); await p.waitForTimeout(250); return sellErr(p); };
  assert.match(await add('Kingfisher Beer', 'food', 150, 160, '650 ml'), /restricted/);
  assert.match(await add('Toor Dal', 'food', 200, 170, '1 kg'), /above the MRP/);
  assert.equal(await add('Toor Dal', 'food', 150, 170, '1 kg'), '');
  assert.equal(await add('LED Bulb 12W', 'electrical', 120, 150, '12 W'), '');
  await p.click('[data-sell-goto="8"]'); await p.waitForTimeout(250); await p.click('[data-sell-submit]'); await p.waitForTimeout(400);
  assert.ok(p.url().endsWith('#/sellStatus'));
  assert.equal(await p.textContent('.sell-app .panel-header .status-pill'), 'Under review');
  assert.match(await p.textContent('.sell-app'), /Brand papers \(electricals\)\s*Not provided/);
  // Switcher shows the application in progress (Business app).
  await p.click('#workspace-button'); assert.match(await p.textContent('#workspace-list'), /Applications in progress[\s\S]*Gupta Mart/); await p.keyboard.press('Escape'); await p.click('[data-close-dialog]').catch(() => {});

  // Admin (on another device in real life): grant admin here to review in the same browser.
  await p.evaluate(() => { const k = 'moveai-vnext-p1', s = JSON.parse(localStorage.getItem(k)); if (!s.workspaces.includes('admin')) s.workspaces.push('admin'); localStorage.setItem(k, JSON.stringify(s)); });
  await go(p, 'admin.html#/sellerReview'); assert.equal(await p.textContent('#page-title'), 'Seller onboarding review');
  await p.fill('form[data-sell-decide][data-section="store"] input[name=note]', 'Shop photo address does not match');
  await p.click('form[data-sell-decide][data-section="store"] button[value=correction]'); await p.waitForTimeout(250);
  for (const sec of ['type', 'kyc', 'food', 'delivery', 'agreement', 'products']) { await p.click(`form[data-sell-decide][data-section="${sec}"] button[value=approved]`); await p.waitForTimeout(200); }

  await go(p, 'business.html#/sellStatus');
  assert.equal(await p.textContent('.sell-app .panel-header .status-pill'), 'Needs correction');
  assert.match(await p.textContent('.sell-app'), /Shop photo address does not match/);
  await p.click('[data-sell-fix][data-step="4"]'); await p.waitForTimeout(300);
  await p.fill('input[name=address]', '12 Main Market, Sector 62, Noida'); assert.equal(await step(p), '');
  await go(p, 'business.html#/sellStatus'); await p.click('[data-sell-fix][data-step="8"]'); await p.waitForTimeout(250); await p.click('[data-sell-submit]'); await p.waitForTimeout(300);
  await go(p, 'admin.html#/sellerReview'); await p.click('form[data-sell-decide][data-section="store"] button[value=approved]'); await p.waitForTimeout(300);

  await go(p, 'business.html#/sellStatus');
  assert.equal(await p.textContent('.sell-app .panel-header .status-pill'), 'Live (some categories locked)');
  assert.match(await p.textContent('.sell-app'), /Live categories: Packaged food · locked: Electricals/);
  await p.click('[data-sell-open]'); await p.waitForTimeout(500);
  assert.equal(await p.textContent('#workspace-name'), 'Gupta Mart'); assert.equal(await p.textContent('.brand b'), 'MoveAI Business');
  for (const r of ['shopOrders', 'shopCatalog', 'shopTeam', 'plusStore']) { await go(p, `business.html#/${r}`); assert.notEqual(await p.textContent('#page-title'), 'Access denied', r); assert.equal(await p.textContent('#workspace-name'), 'Gupta Mart'); }
  assert.match(await p.textContent('main'), /Store setup|Verification/);

  // Customer side: approved product is in the shop; the locked electrical product is not; pickup-only enforced.
  await go(p, 'index.html#/search');
  const shop = await p.textContent('main'); assert.ok(shop.includes('Toor Dal')); assert.ok(!shop.includes('LED Bulb 12W'));
  await p.evaluate(() => { const k = 'moveai-vnext-p1', s = JSON.parse(localStorage.getItem(k)); const prod = s.products.find(x => x.name === 'Toor Dal' && x.fulfilmentPartner === 'Gupta Mart'); s.productCart = [{productId: prod.id, quantity: 1, priceAtAdd: prod.price}]; s.checkoutFromCart = true; s.currentWorkspace = 'personal'; localStorage.setItem(k, JSON.stringify(s)); });
  await go(p, 'index.html#/productCheckout');
  const fulfil = await p.$('select[name=fulfilment]'); if (fulfil) await fulfil.selectOption('delivery').catch(() => {});
  await p.click('form[data-po-form] button[type=submit], #po-form button[type=submit], .form-actions .button.primary[type=submit]'); await p.waitForTimeout(300);
  assert.match(await p.textContent('#po-error'), /Gupta Mart offers store pickup only/);

  // 7. An approved logistics business adds "Sell products": KYC reused, nothing re-entered.
  await p.evaluate(() => { const k = 'moveai-vnext-p1'; localStorage.removeItem(k); });
  await go(p, 'business.html#/home?ws=transporter'); await go(p, 'business.html#/serviceExpansion?ws=transporter');
  await p.click('.sell-banner [data-sell-entry]'); await p.waitForTimeout(400);
  assert.match(await p.textContent('h1'), /Add “Sell products” to Raj Logistics/);
  await p.check('input[name=sellerType][value=shop]'); await p.check('input[name=categories][value=household]'); assert.equal(await step(p), '');
  assert.match(await p.textContent('main'), /Using Raj Logistics's verified details/); assert.equal(await step(p), '');
  assert.match(await p.textContent('#page-title'), /Sell products/);

  // 8. Mobile: the seller application fits without sideways scrolling.
  const m = await b.newContext({viewport: {width: 390, height: 844}, isMobile: true}); await m.route(/cdn\.jsdelivr/, r => r.fulfill({body: '', contentType: 'text/javascript'})); await m.route(/cdnjs/, r => r.abort());
  const mp = await m.newPage(); await mp.goto(`${B}business.html?t=m#/sellStart`, {waitUntil: 'load'}); await mp.waitForTimeout(500);
  assert.ok(await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll on mobile');

  assert.deepEqual(errors, []);
  console.log('PASS onboarding flows: purpose screen, customer, driver/helper, courier, logistics business, seller (validation, correction, resubmission, go-live, locked category, pickup-only), business adds Sell products, mobile');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
