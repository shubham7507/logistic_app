import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SEED} from '../js/mock-data.js';
import * as C from '../js/commerce.js';
import {PRODUCTS} from '../js/products.js';
import {canOpen} from '../js/permissions.js';
import {ROLE_CONFIG} from '../js/config.js';
import {PERSONAL_NAV} from '../js/products.js';
import {mobileNavigation} from '../js/navigation.js';
for(const [product,page,role] of [['seller','seller.html','grocery'],['picker','picker.html','picker'],['delivery','delivery.html','deliveryPartner']]){
 const html=fs.readFileSync(new URL(`../${page}`,import.meta.url),'utf8');
 assert.match(html,new RegExp(`data-product="${product}"`));
 assert.equal(PRODUCTS[product].defaultWs,role);
 assert.ok(C.screen(SEED,'home',role).includes('data-route'));
}
for(const [role,route] of [['grocery','shopOrders'],['groceryFresh','shopEarnings'],['picker','pickTasks'],['pickerFresh','pickProfile'],['deliveryPartner','deliveryJobs'],['deliveryPartner2','deliveryCash'],['admin','commerceOps']]){
 assert.equal(canOpen(role,route),true);assert.ok(C.screen(SEED,route,role).length>40);
}
for(const [role,route] of [['grocery','commerceOps'],['grocery','deliveryJobs'],['picker','shopOrders'],['pickerFresh','deliveryJobs'],['deliveryPartner','shopOrders'],['deliveryPartner2','shopEarnings']])assert.equal(canOpen(role,route),false);
for(const [product,role,nav,expected] of [
 ['customer','personal',PERSONAL_NAV.customer,['home','search','orders','account']],
 ['seller','grocery',ROLE_CONFIG.grocery.nav,['home','shopOrders','shopCatalog','shopEarnings']],
 ['picker','picker',ROLE_CONFIG.picker.nav,['home','pickTasks','pickProfile']],
 ['delivery','deliveryPartner',ROLE_CONFIG.deliveryPartner.nav,['home','deliveryJobs','deliveryEarnings','deliveryProfile']],
 ['admin','admin',ROLE_CONFIG.admin.nav,['home','commerceOrders','commercePartners','commercePayments']]
]){
 const {shown,more}=mobileNavigation(product,role,nav);
 assert.deepEqual(shown.map(([id])=>id),expected);
 assert.deepEqual([...shown,...more],nav.filter(([id])=>expected.includes(id)).concat(nav.filter(([id])=>!expected.includes(id))));
 assert.equal(new Set([...shown,...more].map(([id])=>id)).size,nav.length);
}
assert.ok(mobileNavigation('delivery','deliveryPartner',ROLE_CONFIG.deliveryPartner.nav).more.some(([id])=>id==='deliveryCash'));
assert.equal(canOpen('personal','orderTracking'),true);assert.equal(canOpen('picker','orderTracking'),false);
for(const route of ['commerceOrders','commercePartners','commercePayments','commerceIssues']){
 assert.equal(canOpen('admin',route),true);
 assert.ok(C.screen(SEED,route,'admin').length>100);
 assert.equal(canOpen('grocery',route),false);
}
assert.match(C.screen(SEED,'deliveryEarnings','deliveryPartner'),/View COD cash and hand over/);
console.log(JSON.stringify({status:'PASS',suite:'Seller, delivery and admin screens and routes'}));
