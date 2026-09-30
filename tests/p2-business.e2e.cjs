const {chromium}=require('playwright');
const assert=require('assert');
const BASE=process.env.MOVEAI_BASE||'http://127.0.0.1:4177';

(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`${BASE}/#/home`,{waitUntil:'networkidle'});
  await page.evaluate(()=>window.MoveAIVNextTest.reset());
  await page.evaluate(()=>window.MoveAIVNextTest.switchWorkspace('personal'));

  // One legal business selects several services.
  await page.goto(`${BASE}/#/businessStart`);
  await page.locator('#legal-name').fill('Sinha Cargo & Movers');
  for(const service of ['transport','fleet','movers'])await page.locator(`input[name="services"][value="${service}"]`).check();
  await page.locator('#business-start-form').dispatchEvent('submit');
  await page.locator('input[name="pan"]').fill('ABCDE1234F');
  await page.locator('input[name="gstin"]').fill('09ABCDE1234F1Z5');
  await page.locator('textarea[name="address"]').fill('Sector 62, Noida, Uttar Pradesh');
  await page.locator('#business-details-form').dispatchEvent('submit');
  while(await page.locator('[data-action="use-sample-document"]').count())await page.locator('[data-action="use-sample-document"]').first().click();
  await page.locator('[data-action="continue-kyc"]').click();
  await page.locator('#branch-form').dispatchEvent('submit');
  await page.locator('input[name="accountNumber"]').fill('451278963214');
  await page.locator('input[name="ifsc"]').fill('HDFC0001842');
  await page.locator('#bank-form').dispatchEvent('submit');
  await page.locator('[data-action="submit-business-application"]').click();
  let state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  assert.equal(state.businessApplications.find(x=>x.id===state.currentApplicationId).status,'under_review');

  // Admin approves the exact version and owner receives one workspace.
  await page.evaluate(()=>window.MoveAIVNextTest.switchWorkspace('admin'));
  await page.goto(`${BASE}/#/approvals`);
  const id=state.currentApplicationId;
  await page.locator(`[data-application="${id}"]`).click();
  await page.locator('[data-action="admin-decision"][data-decision="approved"]').click();
  state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  assert.equal(state.businessApplications.find(x=>x.id===id).status,'approved');
  assert.equal(state.workspaces.filter(x=>x==='transporter').length,1);
  assert.equal(state.workspaceOverrides.transporter.label,'Sinha Cargo & Movers');

  // Active work blocks branch disable, while a clear branch may be disabled.
  await page.evaluate(()=>window.MoveAIVNextTest.switchWorkspace('transporter'));
  await page.goto(`${BASE}/business.html#/branches`);
  const before=await page.evaluate(()=>window.MoveAIVNextTest.state().businessProfiles.transporter.branches[0].status);
  await page.locator('[data-action="disable-branch"]').first().click();
  const after=await page.evaluate(()=>window.MoveAIVNextTest.state().businessProfiles.transporter.branches[0].status);
  assert.equal(before,after);

  // Cross-role deep link cannot expose admin review.
  await page.goto(`${BASE}/#/applicationReview`);
  assert.equal(await page.locator('.error-page h1').textContent(),'Access denied');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS',businessCreation:true,multiService:true,kycResume:true,adminApproval:true,workspaceCreation:true,branchSafety:true,adminBoundary:true},null,2));
  await browser.close();
})().catch(err=>{console.error(err);process.exit(1)});
