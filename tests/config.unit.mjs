import assert from 'node:assert/strict';
import {ROLE_CONFIG,ROUTES,allowedRoutes,MOBILE_PRIMARY} from '../js/config.js';

assert.equal(Object.keys(ROLE_CONFIG).length,10);
assert.ok(Object.keys(ROUTES).includes('states'));
for(const [key,role] of Object.entries(ROLE_CONFIG)){
  assert.ok(role.nav.length>=5,`${key} has fewer than five nav routes`);
  const ids=role.nav.map(x=>x[0]);
  assert.equal(new Set(ids).size,ids.length,`${key} has duplicate nav routes`);
  assert.equal(ids[0],'home',`${key} must start with Home`);
  for(const id of ids)assert.ok(ROUTES[id],`${key} references unknown route ${id}`);
  assert.ok(allowedRoutes(key).has('states'));
}
assert.ok(MOBILE_PRIMARY.length<=4);
console.log(JSON.stringify({status:'PASS',roles:Object.keys(ROLE_CONFIG).length,routes:Object.keys(ROUTES).length,duplicateNav:0,unknownNav:0},null,2));
