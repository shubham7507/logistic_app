// Every browser module must parse on its own (node --check does not follow imports).
import {readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const files = readdirSync(new URL('../js/', import.meta.url)).filter(f => f.endsWith('.js'));
for (const f of files) execFileSync(process.execPath, ['--check', new URL(`../js/${f}`, import.meta.url).pathname]);
console.log(JSON.stringify({status: 'PASS', suite: 'module syntax', files: files.length}, null, 2));
