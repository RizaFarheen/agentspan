import { readdirSync } from 'fs';
import { join, extname, resolve } from 'path';
import { Agent } from '../src/agent.js';

const scanPath = resolve(process.argv[2] || './examples');
console.error('Scanning:', scanPath);
const entries = readdirSync(scanPath, { withFileTypes: true });

const entry = entries.find(e => e.name === '01-basic-agent.ts')!;
const fullPath = join(scanPath, entry.name);
console.error('Importing:', fullPath);
const mod = await import(fullPath);

for (const [key, val] of Object.entries(mod)) {
  console.error(`  ${key}: instanceof Agent = ${val instanceof Agent}, constructor = ${(val as any)?.constructor?.name}`);
}
