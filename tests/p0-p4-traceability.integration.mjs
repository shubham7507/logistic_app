import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const stories=fs.readFileSync(path.join(root,'P0-P3-USER-STORIES.md'),'utf8')+'\n'+fs.readFileSync(path.join(root,'P4-USER-STORIES.md'),'utf8');
const plan=fs.readFileSync(path.join(root,'P0-P3-E2E-TEST-PLAN.md'),'utf8')+'\n'+fs.readFileSync(path.join(root,'P4-E2E-TEST-PLAN.md'),'utf8');
const storyIds=[...stories.matchAll(/P[0-4]-US-\d{2}/g)].map(match=>match[0]);
const testIds=[...stories.matchAll(/P[0-4]-E2E-\d{2}/g)].map(match=>match[0]);

assert.equal(new Set(storyIds).size,57,'Every P0-P4 user story must have one unique ID');
assert.equal(new Set(testIds).size,57,'Every P0-P4 story must map to one unique E2E scenario');
for(const id of new Set(testIds))assert.ok(plan.includes(id),`E2E plan is missing ${id}`);
for(const phase of ['P0','P1','P2','P3','P4']){
  assert.ok(stories.includes(`## Phase ${phase.slice(1)}`),`Story phase ${phase} missing`);
  assert.ok(plan.includes(`## ${phase}`),`Test-plan phase ${phase} missing`);
}
assert.ok(plan.includes('Commercial Driver → Profile'));
assert.ok(plan.includes('selected Transporters'));
assert.ok(plan.includes('canonical Load'));
console.log(JSON.stringify({status:'PASS',userStories:57,e2eMappings:57,phases:5,driverHiring:true,marketplace:true},null,2));
