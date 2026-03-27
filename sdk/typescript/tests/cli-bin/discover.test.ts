import { describe, it, expect } from 'vitest';

describe('discover bin script', () => {
  it('should format discovered agents as JSON entries', async () => {
    const { formatDiscoveryResult } = await import('../../cli-bin/discover.js');
    // Create minimal agent-like objects with name property
    const result = formatDiscoveryResult([{ name: 'researcher' }, { name: 'summarizer' }] as any);
    expect(result).toEqual([
      { name: 'researcher', framework: 'native' },
      { name: 'summarizer', framework: 'native' },
    ]);
  });

  it('should return empty array when no agents found', async () => {
    const { formatDiscoveryResult } = await import('../../cli-bin/discover.js');
    const result = formatDiscoveryResult([]);
    expect(result).toEqual([]);
  });
});
