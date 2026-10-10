import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import {loadStaffDemo} from '../js/staff-demo.js';
import * as Inventory from '../js/grocery-inventory.js';
import * as CSV from '../js/catalog-csv.js';
import * as Easy from '../js/easy-mode.js';
import * as HR from '../js/store-hr.js';
import * as Branches from '../js/seller-branches.js';

for(const store of ['grocery','groceryFresh','electrical','fashion']){
 const s=structuredClone(SEED),initial=s.products.length;
 assert.equal(loadStaffDemo(s,store),'',store);
 assert.equal(loadStaffDemo(s,store).includes('already loaded'),true);
 const d=s.staffDemoLoaded[store];assert(d);
 assert.notEqual(d.leaveDay,d.shiftDay,'sample shift must not overlap sample leave');
 assert.equal(s.staffDays.some(x=>x.store===store&&x.personId===d.workerId&&x.status==='pending'),true);
 assert.equal(s.staffLeaveRequests.some(x=>x.store===store&&x.personId===d.workerId&&x.status==='pending'),true);
 assert.equal(s.pickerSchedules.some(x=>x.store===store&&x.pickerId===d.workerId&&x.status==='published'),true);
 assert.equal(s.staffAdvances.some(x=>x.store===store&&x.personId===d.workerId&&x.status==='pending_approval'&&x.instalment===250),true);
 assert.equal(s.pickerStaff.some(x=>x.id===d.coverId&&x.status==='active'),true);
 assert.equal(s.staffHR[d.coverId].payout.verified,true);
 assert.equal(s.products.length,initial+3);
 assert.equal(Inventory.forStore(s,store).filter(x=>x.name.startsWith('Demo ')).length,3);
 assert.equal(Easy.screen(s,'easyStaff',store).includes('Sample loaded'),true);
 assert.equal(Inventory.catalogScreen(s,store).includes('data-commerce="catalog-csv-preview"'),true);
 const csv=CSV.template(store).replace('EXAMPLE-001','TEST-001').replace('Example item','Test, "quoted" item').replace('Example,draft','Example,active');
 // Commas and double quotes must be escaped in a CSV field.
 const valid=csv.replace('Test, "quoted" item','"Test, ""quoted"" item"');
 const preview=CSV.preview(s,store,valid,Inventory);assert.equal(preview.error,undefined,preview.error);
 assert.equal(preview.items[0].action,'New');assert.equal(s.products.length,initial+3,'preview changed live catalogue');
 assert.equal(CSV.commit(s,store,preview,Inventory),'');
 const added=Inventory.forStore(s,store).find(p=>p.sku==='TEST-001');assert.equal(added.name,'Test, "quoted" item');
 const update=valid.replace('99,10,3','129,2,3');const next=CSV.preview(s,store,update,Inventory);
 assert.equal(next.items[0].action,'Update');assert.equal(CSV.commit(s,store,next,Inventory),'');
 assert.equal(Inventory.forStore(s,store).find(p=>p.id===added.id).price,129);
 assert.equal(Inventory.available(Inventory.forStore(s,store).find(p=>p.id===added.id),d.branchId),2);
 assert.equal(Inventory.forStore(s,store).filter(p=>p.sku==='TEST-001').length,1);
 assert.equal(CSV.preview(s,store,valid+'TEST-001,Other,1 piece,"Pulses, dal & beans",,vegetarian,12,1,1,X,draft\n',Inventory).error?.includes('duplicate SKU'),true);
 const before=s.products.length,bad=valid.replace('129,2,3','0,2,3').replace('99,10,3','0,2,3');
 assert.match(CSV.preview(s,store,bad,Inventory).error,/Row 2/);
 assert.equal(s.products.length,before);
 assert.equal(CSV.preview(s,store,valid,Inventory).error,undefined);
 const second=Branches.branchesFor(s,store).find(b=>b.id!==d.branchId);
 if(second){
  const forMain=CSV.preview(s,store,valid,Inventory);
  assert.equal(Branches.selectBranch(s,store,second.id),'');
  assert.match(CSV.commit(s,store,forMain,Inventory),/current branch/);
  const forSecond=CSV.preview(s,store,update.replace('129,2,3','129,5,3'),Inventory);
  assert.equal(CSV.commit(s,store,forSecond,Inventory),'');
  const updated=Inventory.forStore(s,store).find(p=>p.id===added.id);
  assert.equal(Inventory.available(updated,second.id),5);
  assert.equal(Inventory.available(updated,d.branchId),2);
 }
 const managerWs={grocery:'groceryManager',groceryFresh:'freshManager',electrical:'electricalManager',fashion:'fashionManager'}[store];
 assert.equal(CSV.preview(s,managerWs,valid,Inventory).error?.includes('owner'),true);
 assert.equal(Inventory.forStore(s,store).some(p=>p.sku==='TEST-001'),true);
 const other=['grocery','groceryFresh','electrical','fashion'].find(x=>x!==store);
 assert.equal(Inventory.forStore(s,other).some(p=>p.sku==='TEST-001'),false);
 assert(HR.people(s,store).some(p=>p.id===d.workerId));
}

const s=structuredClone(SEED),before=JSON.stringify(s);
s.products.push({...s.products[0],id:'DUP-DEMO',fulfilmentPartner:s.shopPartners.grocery.name,name:'Demo Moong Dal',size:'1 kg'});
const snapshot=JSON.stringify(s);
assert(loadStaffDemo(s,'grocery'),'sample should fail if a shift is already present');
assert.equal(JSON.stringify(s),snapshot,'failed load should not partially mutate state');
assert(before);
console.log('PASS staff and catalogue demo: four sellers, stock and role isolation, attendance/leave/shift/pay profile, CSV preview/add/update/validation/atomic load');
