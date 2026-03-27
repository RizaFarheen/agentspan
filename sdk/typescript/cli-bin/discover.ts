import { discoverAgents } from '../src/discovery.js';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import type { Agent } from '../src/agent.js';

export interface DiscoveryEntry {
  name: string;
  framework: string;
}

export function formatDiscoveryResult(agents: Agent[]): DiscoveryEntry[] {
  return agents.map(a => ({
    name: a.name,
    framework: 'native', // TS SDK currently only discovers native Agent instances
  }));
}

async function main() {
  const { values } = parseArgs({
    options: { path: { type: 'string' } },
    strict: false,
  });

  if (!values.path) {
    console.error('Error: --path is required');
    process.exit(1);
  }

  try {
    // Redirect stdout → stderr during imports so that console.log()
    // side-effects in imported files don't corrupt our JSON output.
    const realStdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = process.stderr.write.bind(process.stderr);

    const agents = await discoverAgents(resolve(values.path as string));

    // Restore stdout for our JSON output
    process.stdout.write = realStdoutWrite;

    const result = formatDiscoveryResult(agents);
    console.log(JSON.stringify(result));
  } catch (e: any) {
    console.error(`Discovery failed: ${e.message || e}`);
    process.exit(1);
  }
}

const isMain = process.argv[1]?.endsWith('discover.ts') || process.argv[1]?.endsWith('discover.js');
if (isMain) {
  main();
}
