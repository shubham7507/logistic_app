import assert from 'node:assert/strict';
import {SEED} from '../js/mock-data.js';
import * as Commerce from '../js/commerce.js';
import * as HR from '../js/store-hr.js';
import * as Branches from '../js/seller-branches.js';
import * as Workforce from '../js/grocery-workforce.js';

for(const [store,worker,manager] of [['grocery','picker','groceryManager'],['groceryFresh','pickerFresh','groceryFreshManager'],['electrical','pickerElectrical','electricalManager'],['fashion','pickerFashion','fashionManager']]){
 const s=structuredClone(SEED);
 const p=s.pickerStaff.find(x=>x.store===store&&x.status==='active');assert(p);
 s.activePicker[worker]=p.id;
 const profile=Commerce.screen(s,'pickProfile',worker);
 assert.match(profile,/Work and verification/);
 assert.match(profile,/data-route="myHR"/);
 assert.match(profile,new RegExp(p.name));
 assert.match(profile,new RegExp(s.shopPartners[store].name));
 assert.doesNotMatch(profile,/data-route="pickEarnings"/);
 assert.match(HR.screen(s,'myHR',worker),/How you get paid/);
 const next=Branches.branchesFor(s,store).find(b=>b.id!==Branches.defaultBranch(s,store));
 assert.equal(Branches.assignStaffBranch(s,store,p.id,next.id,true),'');
 assert.match(Commerce.screen(s,'pickProfile',worker),new RegExp(next.name));
 const managerProfile=Commerce.screen(s,'managerProfile',manager);
 assert.match(managerProfile,/Work and verification/);
 assert.match(managerProfile,/data-route="myHR"/);
 assert.doesNotMatch(managerProfile,/My pay history/);
 assert.match(Commerce.screen(s,'home',worker),/data-route="myHR"/);
 const invited=structuredClone(SEED),newId=`PICK-INV-${store}`;
 invited.pickerStaff.push({id:newId,name:'Sample Invite',store,mobile:'9876501122',status:'invited',branchIds:[Branches.defaultBranch(invited,store)]});
 invited.activePicker[worker]=newId;
 assert.match(Commerce.screen(invited,'pickProfile',worker),/Accept store invitation/);
 assert.match(Commerce.screen(invited,'pickProfile',worker),/pending/);
 const owner=HR.screen(s,'storeHR',store);assert.match(owner,/People &amp; pay|People & pay/);
}
console.log('PASS staff profiles: invitation, branch, verification, payout summary and shared work/pay links across four stores');
