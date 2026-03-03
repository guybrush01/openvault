import { describe, it, expect } from 'vitest';

describe('scoring after smart retrieval removal', () => {
    it('does not export selectRelevantMemoriesSmart', async () => {
        const module = await import('../src/retrieval/scoring.js');
        expect(module.selectRelevantMemoriesSmart).toBeUndefined();
    });
});
