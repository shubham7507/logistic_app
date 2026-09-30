const {chromium}=require('playwright');
const assert=require('assert');
const BASE=process.env.MOVEAI_BASE||'http://127.0.0.1:4177';

(async()=>{
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`${BASE}/business.html#/home`,{waitUntil:'networkidle'});
  await page.evaluate(()=>window.MoveAIVNextTest.reset());
  await page.evaluate(()=>window.MoveAIVNextTest.switchWorkspace('transporter'));

  // Owner shares the invitation link; the invited person opens it in their own tab (separate session),
  // verifies the exact mobile with OTP, creates their account, accepts and fills their own details.
  await page.goto(`${BASE}/business.html#/people`,{waitUntil:'networkidle'});
  let state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  const token=state.staffInvitations.find(x=>x.id==='SINV-501').token;
  assert.ok(token,'invitation link token');
  const staff=await context.newPage();
  await staff.goto(`${BASE}/business.html#/join/${token}`,{waitUntil:'networkidle'});
  await staff.fill('[data-join-form="mobile"] [name="mobile"]','9876501199');
  await staff.locator('[data-join-form="mobile"] button').click();
  await staff.fill('[data-join-form="otp"] [name="otp"]','123456');
  await staff.locator('[data-join-form="otp"] button[type="submit"]').click();
  await staff.check('[data-join-form="identity"] [name="consent"]');
  await staff.locator('[data-join-form="identity"] button').click();
  await staff.locator('[data-join-form="decision"] button[value="accept"]').click();
  state=await page.evaluate(()=>JSON.parse(localStorage.getItem('moveai-vnext-p1')));
  assert.equal(state.staffInvitations.find(x=>x.id==='SINV-501').status,'accepted');

  // Staff owns personal documents, emergency contact and payment destination.
  await staff.fill('[name="dob"]','1994-06-12');await staff.fill('[name="idLast4"]','4821');await staff.fill('[name="address"]','Sector 18, Noida 201301');
  await staff.setInputFiles('[name="idFile"]',{name:'aadhaar.jpg',mimeType:'image/jpeg',buffer:Buffer.from('fake')});
  await staff.fill('[name="emergencyName"]','Rekha Meena');await staff.fill('[name="emergencyMobile"]','9876501200');
  await staff.fill('[name="accountNumber"]','123456789012');await staff.fill('[name="ifsc"]','SBIN0001234');
  await staff.locator('[data-join-form="joining"] button[type="submit"]').click();
  state=await page.evaluate(()=>JSON.parse(localStorage.getItem('moveai-vnext-p1')));
  let invited=state.peopleByWorkspace.transporter.find(x=>x.mobile==='9876501199');
  assert.equal(invited.status,'submitted');
  assert.equal(invited.staffId,null);

  // Owner returns only one section for correction.
  await page.reload({waitUntil:'networkidle'});
  await page.goto(`${BASE}/business.html#/people`);
  await page.locator(`[data-action="open-staff"][data-staff="${invited.id}"]`).first().click();
  await page.locator('[data-route="staffReview"]').click();
  await page.locator('select[name="section"]').selectOption('bankStatus');
  await page.locator('textarea[name="reason"]').fill('Bank proof is unclear. Upload it again.');
  await page.locator('[data-action="staff-review"][data-decision="correction"]').click();
  state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  invited=state.peopleByWorkspace.transporter.find(x=>x.mobile==='9876501199');
  assert.equal(invited.status,'correction_required');
  assert.equal(invited.bankStatus,'correction_required');

  // Staff sees the reason on the same link, fixes it and resubmits.
  await staff.reload({waitUntil:'networkidle'});
  assert.ok((await staff.locator('#main-content').textContent()).includes('Bank proof is unclear'));
  await staff.fill('[name="accountNumber"]','123456789099');
  await staff.locator('[data-join-form="joining"] button[type="submit"]').click();
  await page.goto(`${BASE}/business.html#/staffDetail`);await page.reload({waitUntil:'networkidle'});

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
  await page.goto(`${BASE}/business.html#/people`);
  assert.equal(await page.locator('.error-page h1').textContent(),'Access denied');
  await page.goto(`${BASE}/business.html#/business`);
  assert.equal(await page.locator('.error-page h1').textContent(),'Access denied');
  await page.goto(`${BASE}/business.html#/profile`);
  assert.ok((await page.locator('h1').textContent()).includes('My profile'));

  // Continue owner-only Phase 3 controls.
  await page.evaluate(()=>window.MoveAIVNextTest.switchWorkspace('transporter'));
  await page.goto(`${BASE}/business.html#/staffAccess`);
  await page.locator('#staff-access-form').dispatchEvent('submit');
  state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  assert.ok(!state.peopleByWorkspace.transporter.find(x=>x.id===state.selectedStaffId).access.permissions.includes('bank.change'));

  await page.goto(`${BASE}/business.html#/ownerCover`);
  await page.locator('select[name="delegateId"]').selectOption('STAFF-001');
  await page.locator('#owner-cover-form').dispatchEvent('submit');
  state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  assert.equal(state.ownerCovers.length,1);
  assert.ok(state.ownerCovers[0].blockedActions.includes('bank.change'));

  await page.goto(`${BASE}/business.html#/people`);await page.locator('[data-staff="WORKER-001"]').click();await page.locator('[data-route="offboarding"]').click();
  await page.locator('[data-action="reassign-staff-work"]').click();await page.locator('[data-action="complete-offboarding"]').click();
  state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  const driver=state.peopleByWorkspace.transporter.find(x=>x.id==='WORKER-001');
  assert.equal(driver.status,'offboarded');assert.equal(driver.dues,4500);

  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS',staffOtp:true,selfService:true,correction:true,ownerApproval:true,staffId:true,roleBoundary:true,accessScope:true,ownerCover:true,offboarding:true},null,2));
  await browser.close();
})().catch(err=>{console.error(err);process.exit(1)});

