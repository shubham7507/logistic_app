import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SEED} from '../js/mock-data.js';
import * as C from '../js/commerce.js';
import {PRODUCTS} from '../js/products.js';
import {canOpen} from '../js/permissions.js';
for(const [product,page,role] of [['seller','seller.html','grocery'],['delivery','delivery.html','deliveryPartner']]){
 const html=fs.readFileSync(new URL(`../${page}`,import.meta.url),'utf8');
 assert.match(html,new RegExp(`data-product="${product}"`));
 assert.equal(PRODUCTS[product].defaultWs,role);
 assert.ok(C.screen(SEED,'home',role).includes('data-route'));
}
for(const [role,route] of [['grocery','shopOrders'],['groceryFresh','shopEarnings'],['deliveryPartner','deliveryJobs'],['deliveryPartner2','deliveryCash'],['admin','commerceOps']]){
 assert.equal(canOpen(role,route),true);assert.ok(C.screen(SEED,route,role).length>40);
}
for(const [role,route] of [['grocery','commerceOps'],['grocery','deliveryJobs'],['deliveryPartner','shopOrders'],['deliveryPartner2','shopEarnings']])assert.equal(canOpen(role,route),false);
console.log(JSON.stringify({status:'PASS',suite:'Seller, delivery and admin screens and routes'}));
