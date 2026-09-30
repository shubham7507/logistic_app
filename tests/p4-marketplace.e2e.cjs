const {chromium}=require('playwright');
const assert=require('assert');
const BASE=process.env.MOVEAI_BASE||'http://127.0.0.1:4177';

(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(`${BASE}/#/home`,{waitUntil:'networkidle'});
  await page.evaluate(()=>window.MoveAIVNextTest.reset());

  await page.evaluate(()=>window.MoveAIVNextTest.switchWorkspace('goods'));
  await page.goto(`${BASE}/business.html#/goodsOrder`);
  await page.locator('#goods-order-form').dispatchEvent('submit');
  await page.locator('#transport-requirement-form').dispatchEvent('submit');
  await page.locator('#arrangement-form input[name="arrangement"][value="selected_transporters"]').check();
  await page.locator('#arrangement-form input[name="transporters"]').first().check();
  await page.locator('#arrangement-form').dispatchEvent('submit');
  let state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  const requirement=state.transportRequirements[0];
  assert.equal(requirement.status,'published');
  assert.equal(requirement.arrangement,'selected_transporters');

  await page.evaluate(()=>window.MoveAIVNextTest.switchWorkspace('transporter'));
  await page.goto(`${BASE}/business.html#/postAvailableLoad`);
  await page.locator('select[name="requirementId"]').selectOption(requirement.id);
  await page.locator('#available-load-form').dispatchEvent('submit');
  state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  assert.ok(state.availableLoads.some(load=>load.requirementId===requirement.id));

  await page.goto(`${BASE}/business.html#/postLoadRequirement`);
  await page.locator('#load-requirement-form').dispatchEvent('submit');
  state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  const loadRequirement=state.loadRequirements[0];
  assert.equal(loadRequirement.status,'open');

  await page.evaluate(()=>window.MoveAIVNextTest.switchWorkspace('goods'));
  await page.goto(`${BASE}/business.html#/transporterRequirements`);
  await page.locator(`[data-requirement="${loadRequirement.id}"]`).click();
  await page.locator('[data-action="convert-opportunity"]').click();
  state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  assert.equal(state.canonicalLoads.length,1);
  const canonicalId=state.canonicalLoads[0].id;
  await page.locator('[data-action="convert-opportunity"]').click();
  state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  assert.equal(state.canonicalLoads.length,1);
  assert.equal(state.opportunities.find(op=>op.canonicalLoadId===canonicalId).status,'converted');

  await page.goto(`${BASE}/business.html#/opportunityChat`);
  await page.locator('#opportunity-message-form').dispatchEvent('submit');
  state=await page.evaluate(()=>window.MoveAIVNextTest.state());
  assert.ok(state.opportunityMessages[state.selectedOpportunityId].length>=2);

  await page.evaluate(()=>window.MoveAIVNextTest.switchWorkspace('vehicle'));
  await page.goto(`${BASE}/business.html#/routeOpportunities`);
  assert.ok(/\d+% match/.test(await page.locator('body').textContent()),'route opportunity shows a match score');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS',goodsOrder:true,transportRequirement:true,selectedTransporter:true,availableLoad:true,loadRequirement:true,goodsResponse:true,idempotentLoad:true,chat:true,nextLoad:true},null,2));
  await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});

