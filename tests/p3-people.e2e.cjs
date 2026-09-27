const {chromium}=require('playwright');
const assert=require('assert');
const BASE=process.env.MOVEAI_BASE||'http://127.0.0.1:4177';

(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`${BASE}/#/home`,{waitUntil:'networkidle'});
  await page.evaluate(()=>window.MoveAIVNextTest.reset());
  await page.evaluate(()=>window.MoveAIVNextTest.switchWorkspace('transporter'));

  // Invitation links a mobile once; staff owns personal document entry.
  await page.goto(`${BASE}/#/people`);
  await page.locator('[data-action="accept-staff-invite"]').first().click();
  for(const step of ['documentsStatus','emergencyStatus','bankStatus'])await page.locator(`[data-action="complete-staff-step"][data-step="${step}"]`).click();
  await page.locator('[data-action="finish-staff-onboarding"]').click();
  let state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  const invited=state.peopleByWorkspace.transporter.find(x=>x.mobile==='9876501199');
  assert.equal(invited.documentsStatus,'verified');
  assert.equal(invited.bankStatus,'verified');

  // Branch and service access save without owner-only permissions.
  await page.goto(`${BASE}/#/staffAccess`);
  await page.locator('#staff-access-form').dispatchEvent('submit');
  state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  assert.ok(!state.peopleByWorkspace.transporter.find(x=>x.id===state.selectedStaffId).access.permissions.includes('bank.change'));

  // Owner Cover is time/branch/limit bound.
  await page.goto(`${BASE}/#/ownerCover`);
  await page.locator('select[name="delegateId"]').selectOption('STAFF-001');
  await page.locator('#owner-cover-form').dispatchEvent('submit');
  state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  assert.equal(state.ownerCovers.length,1);
  assert.ok(state.ownerCovers[0].blockedActions.includes('bank.change'));

  // Offboarding requires reassignment and preserves dues/history.
  state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  await page.evaluate(()=>{window.MoveAIVNextTest.switchWorkspace('transporter')});
  await page.goto(`${BASE}/#/people`);await page.locator('[data-staff="WORKER-001"]').click();await page.locator('[data-route="offboarding"]').click();
  await page.locator('[data-action="reassign-staff-work"]').click();await page.locator('[data-action="complete-offboarding"]').click();
  state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  const driver=state.peopleByWorkspace.transporter.find(x=>x.id==='WORKER-001');
  assert.equal(driver.status,'offboarded');assert.equal(driver.dues,4500);

  // Candidate role cannot deep-link to business People.
  await page.evaluate(()=>window.MoveAIVNextTest.switchWorkspace('commercialDriver'));
  await page.goto(`${BASE}/#/people`);
  assert.equal(await page.locator('.error-page h1').textContent(),'Access denied');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS',selfService:true,accessScope:true,ownerCover:true,offboarding:true,workerBoundary:true},null,2));
  await browser.close();
})().catch(err=>{console.error(err);process.exit(1)});
