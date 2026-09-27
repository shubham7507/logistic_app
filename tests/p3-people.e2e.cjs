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

  // Owner sends invitation; invited staff verifies the exact mobile with OTP.
  await page.goto(`${BASE}/#/people`);
  await page.locator('[data-action="test-staff-invite"]').first().click();
  await page.locator('#staff-mobile-form').dispatchEvent('submit');
  await page.locator('#staff-otp-form input[name="otp"]').fill('123456');
  await page.locator('#staff-otp-form').dispatchEvent('submit');
  await page.locator('[data-action="accept-staff-invite-self"]').click();
  let state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  assert.equal(state.currentWorkspace,'staff');
  assert.equal(state.staffInvitations.find(x=>x.id==='SINV-501').status,'accepted');

  // Staff owns personal documents, emergency contact and payment destination.
  for(const step of ['documentsStatus','emergencyStatus','bankStatus'])await page.locator(`[data-action="complete-staff-step"][data-step="${step}"]`).click();
  await page.locator('[data-action="finish-staff-onboarding"]').click();
  state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  let invited=state.peopleByWorkspace.transporter.find(x=>x.mobile==='9876501199');
  assert.equal(invited.status,'submitted');
  assert.equal(invited.staffId,null);

  // Owner returns only one section for correction.
  await page.locator('[data-action="return-owner-demo"]').click();
  await page.locator('[data-route="staffReview"]').click();
  await page.locator('select[name="section"]').selectOption('bankStatus');
  await page.locator('textarea[name="reason"]').fill('Bank proof is unclear. Upload it again.');
  await page.locator('[data-action="staff-review"][data-decision="correction"]').click();
  state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  invited=state.peopleByWorkspace.transporter.find(x=>x.mobile==='9876501199');
  assert.equal(invited.status,'correction_required');
  assert.equal(invited.bankStatus,'correction_required');

  // Staff fixes the selected section and resubmits without repeating the rest.
  await page.locator('[data-action="open-staff-workspace"]').click();
  await page.locator('[data-action="complete-staff-step"][data-step="bankStatus"]').click();
  await page.locator('[data-action="finish-staff-onboarding"]').click();
  await page.locator('[data-action="return-owner-demo"]').click();

  // Owner approves, creates a permanent Staff ID and activates scoped access.
  await page.locator('[data-route="staffReview"]').click();
  await page.locator('[data-action="staff-review"][data-decision="approve"]').click();
  state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  invited=state.peopleByWorkspace.transporter.find(x=>x.mobile==='9876501199');
  assert.equal(invited.status,'active');
  assert.ok(invited.staffId.startsWith('STF-TRA-'));
  assert.ok(!invited.access.permissions.includes('bank.change'));

  // Active staff gets a role-specific workspace and cannot deep-link to owner pages.
  await page.locator('[data-action="open-staff-workspace"]').click();
  assert.equal(await page.locator('#workspace-name').textContent(),'Pankaj Meena');
  await page.goto(`${BASE}/#/people`);
  assert.equal(await page.locator('.error-page h1').textContent(),'Access denied');
  await page.goto(`${BASE}/#/business`);
  assert.equal(await page.locator('.error-page h1').textContent(),'Access denied');
  await page.goto(`${BASE}/#/profile`);
  assert.ok((await page.locator('h1').textContent()).includes('My profile'));

  // Continue owner-only Phase 3 controls.
  await page.evaluate(()=>window.MoveAIVNextTest.switchWorkspace('transporter'));
  await page.goto(`${BASE}/#/staffAccess`);
  await page.locator('#staff-access-form').dispatchEvent('submit');
  state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  assert.ok(!state.peopleByWorkspace.transporter.find(x=>x.id===state.selectedStaffId).access.permissions.includes('bank.change'));

  await page.goto(`${BASE}/#/ownerCover`);
  await page.locator('select[name="delegateId"]').selectOption('STAFF-001');
  await page.locator('#owner-cover-form').dispatchEvent('submit');
  state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  assert.equal(state.ownerCovers.length,1);
  assert.ok(state.ownerCovers[0].blockedActions.includes('bank.change'));

  await page.goto(`${BASE}/#/people`);await page.locator('[data-staff="WORKER-001"]').click();await page.locator('[data-route="offboarding"]').click();
  await page.locator('[data-action="reassign-staff-work"]').click();await page.locator('[data-action="complete-offboarding"]').click();
  state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  const driver=state.peopleByWorkspace.transporter.find(x=>x.id==='WORKER-001');
  assert.equal(driver.status,'offboarded');assert.equal(driver.dues,4500);

  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS',staffOtp:true,selfService:true,correction:true,ownerApproval:true,staffId:true,roleBoundary:true,accessScope:true,ownerCover:true,offboarding:true},null,2));
  await browser.close();
})().catch(err=>{console.error(err);process.exit(1)});

