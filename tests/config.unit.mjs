import assert from 'node:assert/strict';
import {ROLE_CONFIG,ROUTES,allowedRoutes,MOBILE_PRIMARY} from '../js/config.js';
import {SEED} from '../js/mock-data.js';

assert.equal(Object.keys(ROLE_CONFIG).length,20);
assert.ok(Object.keys(ROUTES).includes('states'));
for(const [key,role] of Object.entries(ROLE_CONFIG)){
  assert.ok(role.nav.length>=3,`${key} has fewer than three nav routes`);
  const ids=role.nav.map(x=>x[0]);
  assert.equal(new Set(ids).size,ids.length,`${key} has duplicate nav routes`);
  assert.equal(ids[0],'home',`${key} must start with Home`);
  for(const id of ids)assert.ok(ROUTES[id],`${key} references unknown route ${id}`);
  assert.ok(allowedRoutes(key).has('states'));
}
assert.ok(MOBILE_PRIMARY.length<=4);
assert.equal(Object.keys(SEED.mockUsers).length,20);
assert.equal(SEED.mockUsers.goods.role,'Goods Owner');
assert.equal(SEED.mockUsers.transporter.role,'Transporter');
assert.equal(SEED.mockUsers.vehicle.role,'Truck Owner');
assert.equal(SEED.mockUsers.movers.role,'Mover Owner');
assert.equal(new Set(Object.values(SEED.mockUsers).map(x=>x.name)).size,20,'each workspace needs a distinct mock user');
console.log(JSON.stringify({status:'PASS',roles:Object.keys(ROLE_CONFIG).length,routes:Object.keys(ROUTES).length,mockPersonas:Object.keys(SEED.mockUsers).length,duplicateNav:0,unknownNav:0},null,2));
