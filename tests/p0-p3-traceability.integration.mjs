import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const stories=fs.readFileSync(path.join(root,'P0-P3-USER-STORIES.md'),'utf8');
const plan=fs.readFileSync(path.join(root,'P0-P3-E2E-TEST-PLAN.md'),'utf8');
const storyIds=[...stories.matchAll(/P[0-3]-US-\d{2}/g)].map(x=>x[0]);
const testIds=[...stories.matchAll(/P[0-3]-E2E-\d{2}/g)].map(x=>x[0]);

assert.equal(new Set(storyIds).size,45,'Every P0-P3 user story must have one unique ID');
assert.equal(new Set(testIds).size,45,'Every P0-P3 story must map to one unique E2E scenario');
for(const id of new Set(testIds))assert.ok(plan.includes(id),`E2E plan is missing ${id}`);
for(const phase of ['P0','P1','P2','P3']){
  assert.ok(stories.includes(`## Phase ${phase.slice(1)}`),`Story phase ${phase} missing`);
  assert.ok(plan.includes(`## ${phase}`),`Test-plan phase ${phase} missing`);
}
assert.ok(plan.includes('123456'));
assert.ok(plan.includes('9876501199'));
assert.ok(plan.includes('STF-TRA-'));
console.log(JSON.stringify({status:'PASS',userStories:45,e2eMappings:45,phases:4,mockOtp:true,staffLifecycle:true},null,2));
