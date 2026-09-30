const {chromium}=require('playwright');
const assert=require('assert');
const BASE=process.env.MOVEAI_BASE||'http://127.0.0.1:4177';

(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(`${BASE}/#/home`,{waitUntil:'networkidle'});
  await page.evaluate(()=>window.MoveAIVNextTest.reset());

  await page.evaluate(()=>window.MoveAIVNextTest.switchWorkspace('commercialDriver'));
  await page.goto(`${BASE}/partner.html#/profile`);
  await page.locator('#candidate-profile-form').dispatchEvent('submit');
  assert.ok((await page.locator('h1').textContent()).includes('Find Work'));
  await page.locator('[data-opening="JOB-301"]').first().click();
  assert.ok(await page.locator('[data-action="apply-opening"]').isVisible());
  await page.locator('[data-action="apply-opening"]').click();
  await page.locator('#apply-opening-form [name="consent"]').check();await page.locator('#apply-opening-form').dispatchEvent('submit');
  let state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  let application=state.jobApplications.find(item=>item.openingId==='JOB-301'&&item.candidateId==='CAND-001');
  assert.equal(application.status,'new');
  await page.goto(`${BASE}/partner.html#/openingDetail`);
  await page.locator('[data-action="withdraw-application"]').click();
  state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  application=state.jobApplications.find(item=>item.openingId==='JOB-301'&&item.candidateId==='CAND-001');
  assert.equal(application.status,'withdrawn');
  assert.ok(await page.locator('[data-action="apply-opening"]').isVisible());

  await page.evaluate(()=>window.MoveAIVNextTest.reset());
  await page.evaluate(()=>window.MoveAIVNextTest.switchWorkspace('commercialDriver'));
  await page.goto(`${BASE}/partner.html#/profile`);
  await page.locator('#candidate-profile-form').dispatchEvent('submit');
  await page.locator('[data-opening="JOB-301"]').first().click();
  await page.locator('[data-action="apply-opening"]').click();
  await page.locator('#apply-opening-form [name="consent"]').check();await page.locator('#apply-opening-form').dispatchEvent('submit');

  await page.evaluate(()=>window.MoveAIVNextTest.switchWorkspace('transporter'));
  await page.goto(`${BASE}/business.html#/applications`);
  state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  application=state.jobApplications.find(item=>item.openingId==='JOB-301'&&item.candidateId==='CAND-001');
  const select=page.locator(`[data-application="${application.id}"]`);
  for(const status of ['reviewed','shortlisted','interview','offer','hired'])await select.selectOption(status);
  state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  application=state.jobApplications.find(item=>item.id===application.id);
  assert.equal(application.status,'hired');
  assert.equal(application.assignmentOnly,true);
  assert.equal(application.hiringOutcome,'Trip-only assignment created');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS',availability:true,matching:true,apply:true,withdraw:true,freshReset:true,pipeline:true,tripAssignment:true},null,2));
  await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});

