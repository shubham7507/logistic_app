const { chromium } = require('playwright');
const assert = require('assert');

const BASE = process.env.MOVEAI_BASE || 'http://127.0.0.1:4177';
const expectedNav = { // current menus (option C: the customer app shows only customer items)
  personal:['home','book','services','messages','account'],
  goods:['home','work','trips','fleet','people','messages','money','invoices','business'],
  transporter:['home','work','trips','fleet','people','messages','money','invoices','business'],
  vehicle:['home','fleet','work','trips','people','messages','money','invoices','business'],
  movers:['home','work','fleet','people','messages','money','business'],
  commercialDriver:['home','myJobs','work','messages','money','profile'],
  personalDriver:['home','myJobs','work','messages','money','profile'],
  helper:['home','myJobs','work','messages','money','profile'],
  admin:['home','verification','payOps','approvals','cases','documents','users','audit'],
};

(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});

  await page.goto(`${BASE}/#/home`,{waitUntil:'networkidle'});
  assert.equal(await page.locator('#app').getAttribute('aria-busy'),'false');
  assert.equal(await page.locator('#workspace-name').textContent(),'My account');
  assert.ok(await page.locator('h1').textContent().then(t=>t.startsWith('Hi ')),'customer home greeting');

  for(const [role,routes] of Object.entries(expectedNav)){
    await page.evaluate(r=>window.MoveAIVNextTest.switchWorkspace(r,r==='personal'?'customer':undefined),role);
    const visible=await page.locator('#desktop-nav [data-route]').evaluateAll(btns=>btns.map(b=>b.dataset.route));
    assert.deepEqual(visible,routes,`navigation mismatch for ${role}`);
    for(const route of routes){
      await page.locator(`#desktop-nav [data-route="${route}"]`).click();
      await page.waitForTimeout(20);
      assert.ok(!await page.locator('.error-page').isVisible(),`${role}/${route} rendered error`);
      assert.equal((await page.url()).split('#')[1],`/${route}`);
    }
  }

  // Unknown route recovery.
  await page.goto(`${BASE}/#/does-not-exist`);
  await page.waitForTimeout(30);
  assert.equal(await page.locator('.error-page h1').textContent(),'Page not found');
  await page.locator('.error-page [data-route="home"]').first().click();
  assert.ok((await page.url()).endsWith('#/home'));

  // Permission boundary: Personal cannot open Admin Audit.
  await page.evaluate(()=>window.MoveAIVNextTest.switchWorkspace('personal'));
  await page.goto(`${BASE}/#/audit`);
  await page.waitForTimeout(30);
  assert.equal(await page.locator('.error-page h1').textContent(),'Access denied');
  assert.equal(await page.locator('#page-title').textContent(),'Access denied');

  // Direct deep-link refresh works for an allowed route.
  await page.evaluate(()=>window.MoveAIVNextTest.switchWorkspace('vehicle'));
  await page.goto(`${BASE}/business.html#/fleet`); // Truck Owner lives in the Business app
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.locator('#page-title').textContent(),'Fleet');
  assert.ok(await page.locator('#desktop-nav [data-route="fleet"]').evaluate(el=>el.classList.contains('active')));

  // Mobile shell keeps at most five actions and exposes remaining routes under More.
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>window.MoveAIVNextTest.switchWorkspace('transporter'));
  assert.equal(await page.locator('#mobile-nav [data-route]').count(),5);
  await page.locator('#mobile-nav [data-route="more"]').click();
  assert.ok(await page.locator('#more-sheet').isVisible());
  assert.ok(await page.locator('#more-list [data-route="fleet"]').count());
  assert.ok(await page.locator('#more-list [data-route="people"]').count());
  await page.locator('[data-close-more]').click();

  // Shared state lab supports actions and reset restores Personal.
  await page.goto(`${BASE}/#/states`);
  assert.equal(await page.locator('.state-card').count(),4);
  await page.evaluate(()=>window.MoveAIVNextTest.reset());
  assert.equal(await page.locator('#workspace-name').textContent(),'My account');

  assert.deepEqual(errors,[],`browser errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({status:'PASS',roles:Object.keys(expectedNav).length,routesTested:Object.values(expectedNav).reduce((n,x)=>n+x.length,0),mobile:true,guards:true,errors:0},null,2));
  await browser.close();
})().catch(async err=>{console.error(err);process.exit(1)});
