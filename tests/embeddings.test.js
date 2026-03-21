import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRANSFORMERS_MODELS } from '../src/embeddings.js';
import {
    hasEmbedding,
    deleteEmbedding,
    isStSynced,
    markStSynced,
    clearStSynced,
} from '../src/utils/embedding-codec.js';

describe('embedding-codec: _st_synced flag', () => {
    it('hasEmbedding returns true for _st_synced items without local embedding', () => {
        const obj = { _st_synced: true };
        expect(hasEmbedding(obj)).toBe(true);
    });

    it('hasEmbedding returns false when no embedding and not synced', () => {
        const obj = { summary: 'test' };
        expect(hasEmbedding(obj)).toBe(false);
    });

    it('deleteEmbedding clears _st_synced flag', () => {
        const obj = { _st_synced: true, embedding_b64: 'AAAA' };
        deleteEmbedding(obj);
        expect(obj._st_synced).toBeUndefined();
        expect(obj.embedding_b64).toBeUndefined();
    });

    it('isStSynced returns true for synced items', () => {
        const obj = { _st_synced: true };
        expect(isStSynced(obj)).toBe(true);
    });

    it('isStSynced returns false for non-synced items', () => {
        const obj = { summary: 'test' };
        expect(isStSynced(obj)).toBe(false);
    });

    it('isStSynced returns false for null/undefined', () => {
        expect(isStSynced(null)).toBe(false);
        expect(isStSynced(undefined)).toBe(false);
    });

    it('markStSynced sets _st_synced to true', () => {
        const obj = { summary: 'test' };
        markStSynced(obj);
        expect(obj._st_synced).toBe(true);
    });

    it('markStSynced handles null/undefined gracefully', () => {
        expect(() => markStSynced(null)).not.toThrow();
        expect(() => markStSynced(undefined)).not.toThrow();
    });

    it('clearStSynced removes _st_synced flag', () => {
        const obj = { _st_synced: true, summary: 'test' };
        clearStSynced(obj);
        expect(obj._st_synced).toBeUndefined();
    });

    it('clearStSynced handles null/undefined gracefully', () => {
        expect(() => clearStSynced(null)).not.toThrow();
        expect(() => clearStSynced(undefined)).not.toThrow();
    });
});

describe('TRANSFORMERS_MODELS config', () => {
    it('multilingual-e5-small has Cyrillic-safe chunk size', () => {
        const config = TRANSFORMERS_MODELS['multilingual-e5-small'];
        // 250 chars × ~1.5 tokens/Cyrillic char ≈ 375 tokens (within 512 limit)
        expect(config.optimalChunkSize).toBeLessThanOrEqual(250);
    });

    it('embeddinggemma-300m retains large chunk size', () => {
        const config = TRANSFORMERS_MODELS['embeddinggemma-300m'];
        expect(config.optimalChunkSize).toBe(1800);
    });
});

describe('generateEmbeddingsForMemories', () => {
    let _originalGetDeps;

    beforeEach(async () => {
        // Import and save original getDeps
        const depsModule = await import('../src/deps.js');
        _originalGetDeps = depsModule.getDeps;

        // Mock getDeps to return enabled settings
        const mockDeps = {
            getExtensionSettings: vi.fn(() => ({
                openvault: {
                    embeddingSource: 'multilingual-e5-small',
                    embeddingQueryPrefix: 'query: ',
                    embeddingDocPrefix: 'passage: ',
                },
            })),
        };
        vi.spyOn(depsModule, 'getDeps').mockReturnValue(mockDeps);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('generateEmbeddingsForMemories stores embedding as Base64 via setEmbedding', async () => {
        const { hasEmbedding, getEmbedding } = await import('../src/utils/embedding-codec.js');
        const { generateEmbeddingsForMemories, getStrategy } = await import('../src/embeddings.js');

        const memories = [{ summary: 'Test memory', id: 'test1' }];

        // Spy on the strategy's getDocumentEmbedding method
        const strategy = getStrategy('multilingual-e5-small');
        const getDocEmbSpy = vi.spyOn(strategy, 'getDocumentEmbedding').mockResolvedValue([0.1, 0.2, 0.3]);

        const count = await generateEmbeddingsForMemories(memories);

        expect(getDocEmbSpy).toHaveBeenCalledWith(
            'Test memory',
            expect.objectContaining({ signal: expect.any(AbortSignal) })
        );
        expect(count).toBe(1);
        expect(hasEmbedding(memories[0])).toBe(true);
        expect(memories[0].embedding).toBeUndefined(); // no legacy key
        expect(memories[0].embedding_b64).toBeTypeOf('string');
        const decoded = getEmbedding(memories[0]);
        expect(decoded[0]).toBeCloseTo(0.1, 5);
    });
});

describe('getQueryEmbedding abort signal', () => {
    beforeEach(async () => {
        const depsModule = await import('../src/deps.js');
        vi.spyOn(depsModule, 'getDeps').mockReturnValue({
            getExtensionSettings: vi.fn(() => ({
                openvault: {
                    embeddingSource: 'ollama',
                    ollamaUrl: 'http://test:11434',
                    embeddingModel: 'test-model',
                },
            })),
            fetch: vi.fn(async () => ({
                ok: true,
                json: async () => ({ embedding: [0.1, 0.2, 0.3] }),
            })),
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('throws AbortError with pre-aborted signal', async () => {
        const { getQueryEmbedding, clearEmbeddingCache } = await import('../src/embeddings.js');
        clearEmbeddingCache();
        const ctrl = new AbortController();
        ctrl.abort();

        await expect(getQueryEmbedding('test', { signal: ctrl.signal })).rejects.toThrow(
            expect.objectContaining({ name: 'AbortError' })
        );
    });

    it('throws AbortError with pre-aborted signal on getDocumentEmbedding', async () => {
        const { getDocumentEmbedding, clearEmbeddingCache } = await import('../src/embeddings.js');
        clearEmbeddingCache();
        const ctrl = new AbortController();
        ctrl.abort();

        await expect(getDocumentEmbedding('test', { signal: ctrl.signal })).rejects.toThrow(
            expect.objectContaining({ name: 'AbortError' })
        );
    });
});

describe('OllamaStrategy abort signal', () => {
    it('passes signal to fetch', async () => {
        const fetchSpy = vi.fn(async () => ({
            ok: true,
            json: async () => ({ embedding: [0.1, 0.2] }),
        }));

        const depsModule = await import('../src/deps.js');
        vi.spyOn(depsModule, 'getDeps').mockReturnValue({
            getExtensionSettings: vi.fn(() => ({
                openvault: {
                    embeddingSource: 'ollama',
                    ollamaUrl: 'http://test:11434',
                    embeddingModel: 'test-model',
                },
            })),
            fetch: fetchSpy,
        });

        const { getStrategy } = await import('../src/embeddings.js');
        const strategy = getStrategy('ollama');
        const ctrl = new AbortController();
        await strategy.getEmbedding('test text', { signal: ctrl.signal });

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const fetchOptions = fetchSpy.mock.calls[0][1];
        expect(fetchOptions.signal).toBe(ctrl.signal);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });
});

describe('enrichEventsWithEmbeddings abort signal', () => {
    beforeEach(async () => {
        const depsModule = await import('../src/deps.js');
        vi.spyOn(depsModule, 'getDeps').mockReturnValue({
            getExtensionSettings: vi.fn(() => ({
                openvault: {
                    embeddingSource: 'ollama',
                    ollamaUrl: 'http://test:11434',
                    embeddingModel: 'test-model',
                },
            })),
            fetch: vi.fn(async () => ({
                ok: true,
                json: async () => ({ embedding: [0.1, 0.2] }),
            })),
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('throws AbortError when signal is pre-aborted', async () => {
        const { enrichEventsWithEmbeddings } = await import('../src/embeddings.js');
        const ctrl = new AbortController();
        ctrl.abort();

        await expect(enrichEventsWithEmbeddings([{ summary: 'test' }], { signal: ctrl.signal })).rejects.toThrow(
            expect.objectContaining({ name: 'AbortError' })
        );
    });
});

describe('ST Vector ID Prefix Utilities', () => {
    it('creates and extracts ID from text', async () => {
        const { extractIdFromText } = await import('../src/embeddings.js');

        // Simulate what createTextWithId produces
        const textWithId = '[OV_ID:event_123456789_0] This is a memory summary';
        const result = extractIdFromText(textWithId);

        expect(result.id).toBe('event_123456789_0');
        expect(result.text).toBe('This is a memory summary');
    });

    it('handles text without ID prefix', async () => {
        const { extractIdFromText } = await import('../src/embeddings.js');

        const result = extractIdFromText('Plain text without prefix');

        expect(result.id).toBeNull();
        expect(result.text).toBe('Plain text without prefix');
    });

    it('handles IDs with special characters', async () => {
        const { extractIdFromText } = await import('../src/embeddings.js');

        const textWithId = '[OV_ID:ref_abc-123_xyz] Reflection summary';
        const result = extractIdFromText(textWithId);

        expect(result.id).toBe('ref_abc-123_xyz');
        expect(result.text).toBe('Reflection summary');
    });

    it('hashStringToNumber produces stable hashes', async () => {
        const { hashStringToNumber } = await import('../src/embeddings.js');

        const id1 = 'event_123456789_0';
        const id2 = 'ref_abc123-def456';

        expect(hashStringToNumber(id1)).toBe(hashStringToNumber(id1)); // Stable
        expect(hashStringToNumber(id2)).toBe(hashStringToNumber(id2)); // Stable
        expect(hashStringToNumber(id1)).not.toBe(hashStringToNumber(id2)); // Different
        expect(hashStringToNumber(id1)).toBeGreaterThan(0); // Positive
    });
});
