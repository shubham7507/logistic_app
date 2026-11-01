// Browser journey for the workspace hub. Serve this folder first, e.g. `python3 -m http.server 4177`.
const {chromium}=require('playwright');const assert=require('assert');
const B=(process.env.MOVEAI_BASE||'http://127.0.0.1:4177')+'/';
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1280,height:900}});
await ctx.route(/cdn\.jsdelivr/,r=>r.fulfill({body:'',contentType:'text/javascript'}));
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
const rows=()=>p.$$eval('#workspace-list [data-workspace]',e=>e.map(x=>x.dataset.workspace));
// Business app lists store workspaces and switches in place
await p.goto(B+'business.html#/home',{waitUntil:'load'});await p.waitForTimeout(600);
await p.click('#workspace-button');assert.ok((await rows()).includes('grocery')&&(await rows()).includes('picker'),'business app lists store roles');
assert.ok(!(await rows()).includes('deliveryPartner'),'delivery stays in Partner app');
await p.click('[data-workspace="grocery"]');await p.waitForTimeout(400);
assert.equal(await p.textContent('.brand b'),'MoveAI Business');assert.equal(await p.textContent('#workspace-name'),'ABC Grocery');
await p.reload({waitUntil:'load'});await p.waitForTimeout(600);assert.equal(await p.textContent('#workspace-name'),'ABC Grocery','remembers last workspace');
// Money banner names the workspace
await p.goto(B+'business.html#/shopEarnings',{waitUntil:'load'});await p.waitForTimeout(500);
assert.match(await p.textContent('.ws-money-banner b'),/ABC Grocery/);
// Deep link switches workspace
await p.goto(B+'business.html#/shopOrders?ws=groceryManager',{waitUntil:'load'});await p.waitForTimeout(700);
assert.equal(await p.textContent('#workspace-name'),'ABC Grocery manager');assert.equal(await p.evaluate(()=>location.hash),'#/shopOrders');
// Store device PIN from the owner workspace
await p.click('#workspace-button');await p.click('[data-workspace="grocery"]');await p.waitForTimeout(300);
await p.click('#workspace-button');await p.click('[data-ws-pin-open]');
await p.fill('#ws-pin','0000');await p.click('#ws-pin-form button[type=submit]');await p.waitForTimeout(150);
assert.match(await p.textContent('#ws-pin-error'),/Wrong PIN/);
await p.fill('#ws-pin','1234');await p.click('#ws-pin-form button[type=submit]');await p.waitForTimeout(300);
assert.equal(await p.textContent('#workspace-name'),'ABC Grocery picker');
// Partner app: delivery partner with an active delivery cannot switch away
await p.goto(B+'partner.html#/home',{waitUntil:'load'});await p.waitForTimeout(500);
await p.click('#workspace-button');assert.ok((await rows()).includes('deliveryPartner'));await p.click('[data-workspace="deliveryPartner"]');await p.waitForTimeout(300);
await p.evaluate(()=>{const k='moveai-vnext-p1';const s=JSON.parse(localStorage.getItem(k));const id=s.deliveryPartners.deliveryPartner.id;const o=s.customerOrders[0];o.deliveryAssignment={partnerId:id,partnerName:'Ravi',status:'picked_up'};o.status='out_for_delivery';localStorage.setItem(k,JSON.stringify(s))});
await p.reload({waitUntil:'load'});await p.waitForTimeout(500);
await p.click('#workspace-button');await p.click('[data-workspace="commercialDriver"]');await p.waitForTimeout(300);
assert.ok(await p.isVisible('#ws-confirm-dialog'),'demo mode explains the block');assert.match(await p.textContent('#ws-confirm-dialog'),/Finish or hand back delivery/);await p.click('[data-ws-confirm-yes]');assert.equal(await p.textContent('#workspace-name'),'Delivery Partner 1','stays on the delivery');
// Branch chips and logistics roles
await p.goto(B+'business.html?r=2#/home',{waitUntil:'load'});await p.waitForTimeout(500);
await p.click('#workspace-button');assert.match(await p.textContent('#workspace-list'),/Owner · Transporter/);
await p.click('.ws-branch-chip[data-ws-branch="transporter"][data-branch-id="BR-002"]');await p.waitForTimeout(400);
assert.equal(await p.textContent('#workspace-name'),'Raj Logistics');assert.equal(await p.textContent('#branch-button'),'Jaipur Branch');
// Staff at two businesses, header shows the business, live trip blocks switching (demo dialog)
await p.evaluate(()=>{const k='moveai-vnext-p1';const s=JSON.parse(localStorage.getItem(k));s.peopleByWorkspace.vehicle=[...(s.peopleByWorkspace.vehicle||[]),{id:'VSTAFF-9',name:'Mohan Yadav',mobile:'9876501103',role:'driver',designation:'Driver',branchIds:['BR-020'],status:'active'}];s.staffSession={ownerWorkspace:'transporter',memberId:'WORKER-001',mobile:'9876501103',verified:true};s.selectedStaffId='WORKER-001';if(!s.workspaces.includes('staff'))s.workspaces.push('staff');localStorage.setItem(k,JSON.stringify(s))});
await p.goto(B+'business.html?r=3#/home',{waitUntil:'load'});await p.waitForTimeout(500);
await p.click('#workspace-button');assert.equal((await p.$$('[data-staff-owner]')).length,2,'one row per business');
await p.click('[data-staff-owner="vehicle"]');await p.waitForTimeout(400);
assert.equal(await p.textContent('#workspace-name'),'Raj Transport');assert.match(await p.textContent('#workspace-role'),/Mohan Yadav · Driver/);
await p.click('#workspace-button');await p.click('[data-staff-owner="transporter"]');await p.waitForTimeout(400);
await p.click('#workspace-button');await p.click('[data-workspace="goods"]');await p.waitForTimeout(300);
assert.match(await p.textContent('#ws-confirm-dialog'),/Trip TRP-501 is in progress/);await p.click('[data-ws-confirm-yes]');assert.equal(await p.textContent('#workspace-name'),'Raj Logistics');
// Money confirmation names payer and payee
await p.evaluate(()=>{localStorage.setItem('moveai-money-confirm','on');const k='moveai-vnext-p1';const s=JSON.parse(localStorage.getItem(k));s.trips.find(t=>t.id==='TRP-501').status='delivered';localStorage.setItem(k,JSON.stringify(s))});
await p.goto(B+'business.html?r=4#/money?ws=transporter',{waitUntil:'load'});await p.waitForTimeout(500);
if(await p.isVisible('#ws-confirm-dialog'))await p.click('[data-ws-confirm-no]');
await p.goto(B+'business.html?r=5#/money?ws=transporter',{waitUntil:'load'});await p.waitForTimeout(500);
await p.click('[data-op="open-payment"][data-id="PAY-9004"]');await p.waitForTimeout(300);await p.click('[data-op="money-action"][data-action-name="approve"]');await p.waitForTimeout(200);
const conf=(await p.textContent('#ws-confirm-dialog')).replace(/\s+/g,' ');assert.match(conf,/From ?Raj Logistics/);assert.match(conf,/To ?Mohan Yadav \(Commercial Driver\)/);assert.match(conf,/₹640/);
await p.click('[data-ws-confirm-no]');assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('moveai-vnext-p1')).ledger.find(x=>x.id==='PAY-9004').status),'pending_approval','cancel does nothing');
await p.click('[data-op="money-action"][data-action-name="approve"]');await p.waitForTimeout(200);await p.click('[data-ws-confirm-yes]');await p.waitForTimeout(300);
assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('moveai-vnext-p1')).ledger.find(x=>x.id==='PAY-9004').status),'approved','confirm runs the action');
await p.evaluate(()=>localStorage.removeItem('moveai-money-confirm'));
// Customer checkout offers business buying profiles that fill the GST invoice
await p.goto(B+'index.html#/home',{waitUntil:'load'});await p.waitForTimeout(400);
await p.evaluate(()=>{const k='moveai-vnext-p1';const s=JSON.parse(localStorage.getItem(k));const prod=s.products.find(x=>x.status==='active');s.productCart=[{productId:prod.id,quantity:1,priceAtAdd:prod.price}];s.checkoutFromCart=true;localStorage.setItem(k,JSON.stringify(s))});
await p.goto(B+'index.html#/productCheckout',{waitUntil:'load'});await p.waitForTimeout(600);
await p.check('input[name=buyingProfile][value=goods]');assert.equal(await p.inputValue('#bill-name'),'Sharma Foods');assert.match(await p.inputValue('#bill-gstin'),/^09/);assert.equal(await p.inputValue('#bill-email'),'accounts@sharmafoods.example');assert.equal(await p.$eval('input[name=method]:checked',e=>e.value),'upi');
// Mobile: header opens the switcher; ?demo=off hides persona text
const m=await b.newContext({viewport:{width:390,height:844},isMobile:true});await m.route(/cdn\.jsdelivr/,r=>r.fulfill({body:'',contentType:'text/javascript'}));const mp=await m.newPage();
await mp.goto(B+'business.html?demo=off#/home',{waitUntil:'load'});await mp.waitForTimeout(500);await mp.click('.topbar-title');
assert.ok(await mp.isVisible('#workspace-dialog'));assert.ok(!/Test as/.test(await mp.textContent('#workspace-list')));
assert.equal(await mp.evaluate(()=>{const l=document.getElementById('workspace-list');return l.scrollWidth<=l.clientWidth}),true,'no sideways scroll');
await mp.goto(B+'business.html?demo=off&r=6#/pickProfile?ws=picker',{waitUntil:'load'});await mp.waitForTimeout(500);assert.equal(await mp.isVisible('[data-picker-account]'),false,'demo account picker hidden');
await mp.goto(B+'business.html?demo=on&r=7#/pickProfile',{waitUntil:'load'});await mp.waitForTimeout(500);assert.equal(await mp.isVisible('[data-picker-account]'),true);
assert.deepEqual(errs,[]);console.log('PASS workspace switching journey (apps, branches, staff memberships, trip guard, money confirm, checkout profile, mobile, demo off)');await b.close()})().catch(e=>{console.error(e);process.exit(1)});
