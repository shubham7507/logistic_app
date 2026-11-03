// A home-service pro signs in again: MoveAI opens the work app they used last (the pro home), not the customer home.
const {chromium} = require('playwright');
const assert = require('assert');
const B = (process.env.MOVEAI_BASE || 'http://127.0.0.1:4177') + '/'; let n = 0;
const go = async (p, path) => { await p.goto(`${B}${path.replace('#', `?t=${++n}#`)}`, {waitUntil: 'load'}); await p.waitForTimeout(450); };
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({viewport: {width: 390, height: 860}})).newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await go(p, 'index.html#/home'); await p.evaluate(() => { window.MoveAIVNextTest.reset(); window.MoveAIVNextTest.switchWorkspace('homePro'); });
  await p.evaluate(() => { const k = 'moveai-vnext-p1', s = JSON.parse(localStorage.getItem(k)); s.knownIdentities[0].workspaces.push('homePro'); s.currentWorkspace = 'personal';
    s.auth = {...s.auth, status: 'otp-pending', pendingMobile: s.knownIdentities[0].mobile, isExistingIdentity: true, otpSentAt: Date.now(), otpAttempts: 0}; localStorage.setItem(k, JSON.stringify(s)); });
  await go(p, 'index.html#/otp'); assert.equal((await p.evaluate(() => window.MoveAIVNextTest.state())).lastWorkspace, 'homePro');
  await p.fill('#otp', '123456'); await p.locator('#otp-form').dispatchEvent('submit'); await p.waitForTimeout(400);
  await p.click('[data-action="continue-existing"]'); await p.waitForTimeout(800);
  const s = await p.evaluate(() => window.MoveAIVNextTest.state()); assert.equal(s.currentWorkspace, 'homePro'); assert.equal(s.auth.status, 'authenticated');
  await p.waitForTimeout(300); assert.match((await p.textContent('main')).replace(/\s+/g, ' '), /Namaste, Suresh/);
  assert.deepEqual(errors, []); await b.close(); console.log('PASS re-login: the pro lands on their jobs app');
})().catch(e => { console.error(e); process.exit(1); });
