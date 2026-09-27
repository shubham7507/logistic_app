const {chromium}=require('playwright');
const assert=require('assert');
const BASE=process.env.MOVEAI_BASE||'http://127.0.0.1:4177';

(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`${BASE}/#/home`,{waitUntil:'networkidle'});

  // New mobile creates exactly one Personal workspace.
  await page.evaluate(()=>window.MoveAIVNextTest.startSignup());
  await page.locator('[data-route="signup"]').click();
  await page.locator('#mobile').fill('9123456789');
  await page.locator('#consent').check();
  await page.locator('#mobile-form').dispatchEvent('submit');
  assert.ok((await page.url()).endsWith('#/otp'));
  await page.locator('#otp').fill('123456');
  await page.locator('#otp-form').dispatchEvent('submit');
  assert.ok((await page.url()).endsWith('#/home'));
  let state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  assert.deepEqual(state.workspaces,['personal']);
  assert.equal(state.auth.mobileVerified,true);

  // Existing mobile recovers rather than creating a second person.
  await page.evaluate(()=>window.MoveAIVNextTest.startSignup());
  await page.goto(`${BASE}/#/signup`);
  await page.locator('#mobile').fill('9876543210');
  await page.locator('#consent').check();
  await page.locator('#mobile-form').dispatchEvent('submit');
  await page.locator('#otp').fill('123456');
  await page.locator('#otp-form').dispatchEvent('submit');
  assert.ok((await page.url()).endsWith('#/recover'));
  await page.locator('[data-action="continue-existing"]').click();
  state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  assert.equal(state.person.id,'PER-1001');
  assert.equal(new Set(state.workspaces).size,state.workspaces.length);

  // Invitation acceptance adds authorized workspace once.
  await page.goto(`${BASE}/#/invitations`);
  const id=await page.locator('[data-action="accept-invite"]').first().getAttribute('data-invite');
  await page.locator(`[data-invite="${id}"][data-action="accept-invite"]`).click();
  state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  assert.equal(state.invitations.find(x=>x.id===id).status,'accepted');
  assert.equal(new Set(state.workspaces).size,state.workspaces.length);

  // Business workspace cannot deep-link to Personal invitations.
  await page.evaluate(()=>window.MoveAIVNextTest.switchWorkspace('goods'));
  await page.goto(`${BASE}/#/invitations`);
  assert.equal(await page.locator('.error-page h1').textContent(),'Access denied');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS',newIdentity:true,duplicateRecovery:true,invitationAcceptance:true,workspaceBoundary:true,mobile:true},null,2));
  await browser.close();
})().catch(err=>{console.error(err);process.exit(1)});
