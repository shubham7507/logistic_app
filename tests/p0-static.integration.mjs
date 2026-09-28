import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROLE_CONFIG,ROUTES,allowedRoutes,MOBILE_PRIMARY} from '../js/config.js';
import {canOpen,visibleNavigation} from '../js/permissions.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const index=read('index.html');

for(const file of ['css/tokens.css','css/components.css','css/responsive.css','js/app.js']){
  assert.ok(fs.existsSync(path.join(root,file)),`missing ${file}`);
  assert.ok(index.includes(`./${file}`),`index does not reference ${file}`);
}
const requiredDomIds=['app','sidebar','workspace-button','desktop-nav','mobile-nav','main-content','workspace-dialog','more-sheet','toast','profile-avatar','profile-name','profile-role'];
for(const id of requiredDomIds){
  assert.ok(index.includes(`id="${id}"`),`missing required DOM id ${id}`);
}

let navRoutes=0;
for(const [role,config] of Object.entries(ROLE_CONFIG)){
  const visible=visibleNavigation(role);
  assert.deepEqual(visible,config.nav);
  for(const [route] of visible){
    navRoutes++;
    assert.ok(ROUTES[route],`${role} has unknown route ${route}`);
    assert.ok(canOpen(role,route),`${role} cannot open visible route ${route}`);
  }
  const forbidden=Object.keys(ROUTES).filter(r=>!allowedRoutes(role).has(r));
  assert.ok(forbidden.length>0,`${role} should have at least one forbidden route`);
  for(const route of forbidden)assert.equal(canOpen(role,route),false,`${role} unexpectedly opens ${route}`);
}

assert.ok(MOBILE_PRIMARY.length<=4,'mobile primary routes must leave room for More');
{const lines=read('_redirects').trim().split('\n');assert.equal(lines.at(-1),'/* /index.html 200','catch-all SPA rewrite stays last');for(const p of ['partner','business','admin'])assert.ok(lines.includes(`/${p} /${p}.html 200`),`${p} product route`);}
// option C: four product entry pages share the same assets and differ only in product, title and brand
for(const [file,product] of [['index.html','customer'],['partner.html','partner'],['business.html','business'],['admin.html','admin']]){const html=read(file);assert.ok(html.includes(`data-product="${product}"`),file);const strip=h=>h.replace(/data-product="[a-z]+"/,'').replace(/<title>.*?<\/title>/,'').replace(/<div class="brand">.*?<\/div>/,'');assert.equal(strip(html),strip(index),`${file} must stay in sync with index.html`)}
assert.ok(read('netlify.toml').includes('to = "/index.html"'));
assert.ok(read('js/app.js').includes('window.MoveAIVNextTest'));
assert.ok(read('js/store.js').includes('localStorage'));
assert.ok(read('css/responsive.css').includes('.mobile-nav'));

console.log(JSON.stringify({status:'PASS',roles:Object.keys(ROLE_CONFIG).length,knownRoutes:Object.keys(ROUTES).length,navigationRoutesChecked:navRoutes,requiredDomIds:requiredDomIds.length,netlifySpaFallback:true},null,2));
