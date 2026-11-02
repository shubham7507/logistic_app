// "Verify my ID" in the browser: consent not pre-ticked, Send OTP shows the masked mobile, resend too
// fast, wrong OTP tries, lock after 3 → upload offered, unlock after 30 min, verify, then the same person
// sees "Already verified" as a seller and the admin sees one ID checks list. Serve on port 4177 first.
const {chromium} = require('playwright');
const assert = require('assert');
const B = (process.env.MOVEAI_BASE || 'http://127.0.0.1:4177') + '/'; let n = 0;
const go = async (p, path) => { await p.goto(`${B}${path.replace('#', `?t=${++n}#`)}`, {waitUntil: 'load'}); await p.waitForTimeout(450); };
const state = p => p.evaluate(() => window.MoveAIVNextTest.state());
const text = async (p, sel = 'main') => (await p.textContent(sel)).replace(/\s+/g, ' ');
const M = '9123456744', F = 'form[data-worker-verify="aadhaar"] ';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({viewport: {width: 390, height: 860}});
  await ctx.route(/cdn\.jsdelivr/, r => r.fulfill({body: '', contentType: 'text/javascript'})); await ctx.route(/cdnjs/, r => r.abort());
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await go(p, 'index.html#/home'); await p.evaluate(() => window.MoveAIVNextTest.startSignup());
  await p.locator('[data-route="signup"]').click(); await p.fill('#mobile', M); await p.check('#consent'); await p.locator('#mobile-form').dispatchEvent('submit');
  await p.fill('#otp', '123456'); await p.locator('#otp-form').dispatchEvent('submit'); await p.waitForTimeout(300);
  await p.locator('[data-purpose="work"]').click(); await p.waitForTimeout(400);

  // Helper profile → Verify my ID
  await go(p, 'partner.html#/candidateProfile');
  await p.check('input[name=workerType][value=helper]'); await p.fill('input[name=name]', 'Raju Kumar'); await p.fill('input[name=location]', 'Patna');
  await p.check('input[name=skills][value="Loading / unloading"]'); await p.fill('input[name=expectedPay]', '600'); await p.locator('#candidate-profile-form').dispatchEvent('submit'); await p.waitForTimeout(400);
  await go(p, 'partner.html#/workerStatus'); assert.match(await text(p, '[data-worker-check="aadhaar"]').catch(() => ''), /Verify/);
  assert.match(await text(p), /Not started/, 'shared status words');
  await p.click('[data-worker-check="aadhaar"]'); await p.waitForTimeout(300);
  assert.equal(await p.isChecked(F + '[name=consent]'), false, 'consent is never pre-ticked');
  assert.ok(await p.isVisible(F + '[data-idv="send"]'), 'Send OTP button is there');

  // Send OTP: needs consent, then shows the masked mobile; resend too fast is refused
  await p.fill(F + '[name=aadhaar]', '234567890123'); await p.click(F + '[data-idv="send"]');
  assert.match(await text(p, F + '[data-idv-msg]'), /Tick the consent box/);
  await p.check(F + '[name=consent]'); await p.click(F + '[data-idv="send"]');
  assert.match(await text(p, F + '[data-idv-msg]'), /OTP sent to \+91 ••••••6744/);
  assert.equal((await p.textContent(F + '[data-idv="send"]')).trim(), 'Resend OTP');
  await p.click(F + '[data-idv="send"]'); assert.match(await text(p, F + '[data-idv-msg]'), /Wait \d+ seconds/);

  // Wrong OTP: tries left, then locked with an upload offered
  await p.fill(F + '[name=otp]', '111111'); await p.locator(F.trim()).dispatchEvent('submit'); await p.waitForTimeout(150);
  assert.match(await text(p, '#worker-verify-error'), /2 tries left/);
  await p.locator(F.trim()).dispatchEvent('submit'); await p.waitForTimeout(150); assert.match(await text(p, '#worker-verify-error'), /1 try left/);
  await p.locator(F.trim()).dispatchEvent('submit'); await p.waitForTimeout(400);
  assert.ok(await p.isVisible('form[data-worker-manual="aadhaar"]'), 'upload for manual review offered after the lock');
  assert.match(await text(p), /Too many wrong OTPs/);
  await p.check(F + '[name=consent]'); await p.fill(F + '[name=aadhaar]', '234567890123'); await p.click(F + '[data-idv="send"]');
  assert.match(await text(p, F + '[data-idv-msg]'), /Too many wrong OTPs/, 'cannot ask again while locked');

  // 31 minutes later: unlocked → verify
  await p.evaluate(() => { globalThis.__moveaiClockOffset = 31 / (60 * 24); });
  await p.click(F + '[data-idv="send"]'); assert.match(await text(p, F + '[data-idv-msg]'), /OTP sent/);
  await p.fill(F + '[name=otp]', '123456'); await p.locator(F.trim()).dispatchEvent('submit'); await p.waitForTimeout(500);
  assert.ok(p.url().includes('#/workerStatus')); assert.match(await text(p), /XXXX XXXX 0123/);
  let s = await state(p); assert.equal(s.identityChecks[M].record.status, 'verified'); assert.ok(!JSON.stringify(s).includes('234567890123'), 'full Aadhaar not stored');

  // Same person as a seller without GST: "Already verified", no OTP
  await p.evaluate(async () => {
    const SO = await import('./js/seller-onboarding.js'); const k = 'moveai-vnext-p1', s = JSON.parse(localStorage.getItem(k));
    const a = SO.startApplication(s, {}); SO.saveType(s, a, {sellerType: 'individual', categories: ['fresh'], legalName: 'Raju Kumar'}); a.step = 2; s.currentSellerAppId = a.id;
    localStorage.setItem(k, JSON.stringify(s));
  });
  await go(p, 'index.html#/sellStart'); assert.match(await text(p), /Already verified/);
  await p.fill('form[data-sell-step="2"] [name=pan]', 'ABCDE1234F'); await p.check('form[data-sell-step="2"] [name=nonGst]');
  await p.fill('form[data-sell-step="2"] [name=account]', '123456789012'); await p.fill('form[data-sell-step="2"] [name=ifsc]', 'SBIN0001234');
  await p.locator('form[data-sell-step="2"]').dispatchEvent('submit'); await p.waitForTimeout(400);
  s = await state(p); const app = s.sellerApplications.find(x => x.id === s.currentSellerAppId) || s.sellerApplications.at(-1);
  assert.equal(app.kyc.aadhaarLast4, '0123', 'seller reused the verified Aadhaar'); assert.ok(s.identityChecks[M].record.usedFor.includes('Seller without GST'));

  // Admin: one ID checks list
  await p.evaluate(() => { const k = 'moveai-vnext-p1', s = JSON.parse(localStorage.getItem(k)); s.workspaces.push('admin'); localStorage.setItem(k, JSON.stringify(s)); });
  await go(p, 'admin.html#/idChecks?ws=admin'); assert.match(await text(p), /ID checks/); assert.match(await text(p, `[data-idv-item="${M}"]`), /Verified/);
  assert.deepEqual(errors, []);
  await b.close(); console.log('PASS Verify my ID: consent, Send OTP, resend wait, wrong OTP tries, lock + upload, unlock, verify, reuse as seller, admin list (phone width)');
})().catch(e => { console.error(e); process.exit(1); });
