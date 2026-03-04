import { describe, expect, it } from 'vitest';

describe('debug cache import verification', () => {
    it('cacheRetrievalDebug is importable from retrieve.js dependencies', async () => {
        // Verify the module can be imported (ensures no circular deps)
        const mod = await import('../../src/retrieval/debug-cache.js');
        expect(mod.cacheRetrievalDebug).toBeTypeOf('function');
        expect(mod.clearRetrievalDebug).toBeTypeOf('function');
    });
});
