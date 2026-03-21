import { describe, expect, it } from 'vitest';

describe('ST sync flag helpers', () => {
    it('markStSynced sets flag, isStSynced reads it', async () => {
        const { markStSynced, isStSynced } = await import('../src/utils/embedding-codec.js');
        const obj = {};
        expect(isStSynced(obj)).toBe(false);
        markStSynced(obj);
        expect(isStSynced(obj)).toBe(true);
    });

    it('clearStSynced removes flag', async () => {
        const { markStSynced, isStSynced, clearStSynced } = await import('../src/utils/embedding-codec.js');
        const obj = {};
        markStSynced(obj);
        clearStSynced(obj);
        expect(isStSynced(obj)).toBe(false);
    });

    it('deleteEmbedding also clears _st_synced', async () => {
        const { markStSynced, isStSynced, deleteEmbedding, setEmbedding } = await import('../src/utils/embedding-codec.js');
        const obj = {};
        setEmbedding(obj, new Float32Array([1, 2, 3]));
        markStSynced(obj);
        deleteEmbedding(obj);
        expect(isStSynced(obj)).toBe(false);
    });

    it('isStSynced returns false for null/undefined', async () => {
        const { isStSynced } = await import('../src/utils/embedding-codec.js');
        expect(isStSynced(null)).toBe(false);
        expect(isStSynced(undefined)).toBe(false);
    });
});