# ST Vector Storage Integration Implementation Plan

**Goal:** Add SillyTavern's Vector Storage as a third embedding strategy using dual-storage, retrieve-then-rerank architecture that preserves OpenVault's full Alpha-Blend scoring pipeline.

**Architecture:** ST Vector Storage handles only embedding/vector storage via its Vectra DB. All scoring metadata (timestamps, importance, mentions, summaries) stays in chat metadata. On retrieval, ST provides ranked candidates which get rank-position proxy scores fed into the existing Alpha-Blend pipeline (forgetfulness curve + BM25 + frequency).

**Tech Stack:** SillyTavern Vector Storage REST API (`/api/vector/*`), Cyrb53 hashing, existing Vitest test suite.

---

**File Structure Overview:**
- Modify: `src/utils/embedding-codec.js` — Add `_st_synced` flag helpers (`markStSynced`, `isStSynced`, `clearStSynced`); update `deleteEmbedding` to clear flag
- Modify: `src/embeddings.js` — Add `StVectorStrategy` class with external storage methods; extend `EmbeddingStrategy` base class; register in strategy registry
- Modify: `src/retrieval/math.js` — Check `_proxyVectorScore` before computing cosine similarity in `calculateScore`
- Modify: `src/retrieval/scoring.js` — Add ST branch in `selectRelevantMemoriesSimple`: over-fetch → proxy scores → feed into `scoreMemories()`
- Modify: `src/retrieval/world-context.js` — Add ST search branch for community retrieval
- Modify: `src/extraction/extract.js` — Add sync hook after Phase 1 commit
- Modify: `src/reflection/reflect.js` — Add sync hook after reflection generation
- Modify: `src/graph/graph.js` — Sync in `mergeOrInsertEntity`, `consolidateEdges`; deletion in `consolidateGraph`, `redirectEdges`
- Modify: `src/graph/communities.js` — Sync in `updateCommunitySummaries`
- Modify: `src/utils/data.js` — Add sync/delete/purge helpers for ST storage
- Modify: `src/constants.js` — Add `embeddingSource: 'st_vector'` option, `OVER_FETCH_MULTIPLIER` constant
- Create: `tests/st-vector.test.js` — Unit tests for StVectorStrategy, rank proxy, Cyrb53, sync helpers
- Create: `tests/retrieval/st-scoring.test.js` — Unit tests for proxy score integration with Alpha-Blend

**Common Pitfalls:**
- ST's `/api/vector/query` does NOT return similarity scores — only `{ hashes, metadata }` sorted by cosine. Use rank-position proxy scoring.
- Collection ID MUST include chat ID to prevent cross-chat data leakage.
- `_st_synced` flag prevents infinite re-sync loops during backfill.
- ST `hashes` are numbers (Cyrb53 53-bit), not strings.
- OpenVault ID is embedded in the text field prefix `[OV_ID:xxx]` for reverse mapping.

---

### Task 1: Add `_st_synced` Flag Helpers to Embedding Codec

**Files:**
- Modify: `src/utils/embedding-codec.js`
- Test: `tests/st-vector.test.js`

- [ ] Step 1: Write failing tests for `markStSynced`, `isStSynced`, `clearStSynced`

```javascript
// tests/st-vector.test.js
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
```

- [ ] Step 2: Run tests to verify they fail

Run: `npx vitest tests/st-vector.test.js --run`
Expected: FAIL — `markStSynced` is not exported

- [ ] Step 3: Implement `_st_synced` flag helpers

Add to `src/utils/embedding-codec.js` before the final exports:

```javascript
/**
 * Mark an object as synced to ST Vector Storage.
 * @param {Object} obj - Object to mark
 */
export function markStSynced(obj) {
    if (obj) obj._st_synced = true;
}

/**
 * Check if an object has been synced to ST Vector Storage.
 * @param {Object} obj - Object to check
 * @returns {boolean}
 */
export function isStSynced(obj) {
    if (!obj) return false;
    return !!obj._st_synced;
}

/**
 * Clear ST sync flag from an object.
 * @param {Object} obj - Object to clear
 */
export function clearStSynced(obj) {
    if (obj) delete obj._st_synced;
}
```

Update `deleteEmbedding` to also clear the sync flag:

```javascript
export function deleteEmbedding(obj) {
    if (!obj) return;
    delete obj.embedding;
    delete obj.embedding_b64;
    delete obj._st_synced;
}
```

- [ ] Step 4: Run tests to verify they pass

Run: `npx vitest tests/st-vector.test.js --run`
Expected: PASS (4 tests)

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: add _st_synced flag helpers to embedding codec"
```

---

### Task 2: Add Cyrb53 Hash Function

**Files:**
- Modify: `src/utils/embedding-codec.js`
- Test: `tests/st-vector.test.js`

- [ ] Step 1: Write failing tests for `cyrb53`

```javascript
// Append to tests/st-vector.test.js
describe('cyrb53 hash', () => {
    it('returns a positive integer for any string', async () => {
        const { cyrb53 } = await import('../src/utils/embedding-codec.js');
        const hash = cyrb53('hello world');
        expect(typeof hash).toBe('number');
        expect(Number.isInteger(hash)).toBe(true);
        expect(hash).toBeGreaterThan(0);
    });

    it('returns deterministic results', async () => {
        const { cyrb53 } = await import('../src/utils/embedding-codec.js');
        expect(cyrb53('test input')).toBe(cyrb53('test input'));
    });

    it('returns different hashes for different inputs', async () => {
        const { cyrb53 } = await import('../src/utils/embedding-codec.js');
        expect(cyrb53('alice')).not.toBe(cyrb53('bob'));
    });

    it('handles empty string', async () => {
        const { cyrb53 } = await import('../src/utils/embedding-codec.js');
        const hash = cyrb53('');
        expect(typeof hash).toBe('number');
    });

    it('handles unicode/cyrillic text', async () => {
        const { cyrb53 } = await import('../src/utils/embedding-codec.js');
        const hash = cyrb53('Привет мир');
        expect(typeof hash).toBe('number');
        expect(Number.isInteger(hash)).toBe(true);
    });
});
```

- [ ] Step 2: Run tests to verify they fail

Run: `npx vitest tests/st-vector.test.js --run`
Expected: FAIL — `cyrb53` is not exported

- [ ] Step 3: Implement `cyrb53`

Add to `src/utils/embedding-codec.js`:

```javascript
/**
 * Cyrb53 hash — 53-bit hash for ST Vector Storage compatibility.
 * Produces non-negative integer hashes safe for Vectra's numeric hash IDs.
 * @param {string} str - Input string
 * @param {number} [seed=0] - Optional seed
 * @returns {number} 53-bit positive integer hash
 */
export function cyrb53(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
```

- [ ] Step 4: Run tests to verify they pass

Run: `npx vitest tests/st-vector.test.js --run`
Expected: PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: add cyrb53 hash function for ST vector storage"
```

---

### Task 3: Add Rank-Position Proxy Score Function

**Files:**
- Test: `tests/st-vector.test.js`

- [ ] Step 1: Write failing tests for `rankToProxyScore`

```javascript
// Append to tests/st-vector.test.js
describe('rankToProxyScore', () => {
    it('returns 1.0 for rank 0 (best match)', async () => {
        const { rankToProxyScore } = await import('../src/retrieval/math.js');
        expect(rankToProxyScore(0, 10)).toBe(1.0);
    });

    it('returns 0.5 for last rank', async () => {
        const { rankToProxyScore } = await import('../src/retrieval/math.js');
        expect(rankToProxyScore(9, 10)).toBe(0.5);
    });

    it('returns 1.0 when totalResults is 1', async () => {
        const { rankToProxyScore } = await import('../src/retrieval/math.js');
        expect(rankToProxyScore(0, 1)).toBe(1.0);
    });

    it('returns 1.0 when totalResults is 0', async () => {
        const { rankToProxyScore } = await import('../src/retrieval/math.js');
        expect(rankToProxyScore(0, 0)).toBe(1.0);
    });

    it('returns linearly interpolated values', async () => {
        const { rankToProxyScore } = await import('../src/retrieval/math.js');
        // Rank 4 of 9 total (0-indexed): 1.0 - (4/8) * 0.5 = 0.75
        expect(rankToProxyScore(4, 9)).toBe(0.75);
    });
});
```

- [ ] Step 2: Run tests to verify they fail

Run: `npx vitest tests/st-vector.test.js --run`
Expected: FAIL — `rankToProxyScore` is not exported

- [ ] Step 3: Implement `rankToProxyScore` in `src/retrieval/math.js`

Add to `src/retrieval/math.js` (after the `cosineSimilarity` function, before `calculateScore`):

```javascript
/**
 * Convert ST rank position to a cosine similarity proxy.
 * ST results are pre-sorted by cosine similarity and pre-filtered by threshold.
 *
 * @param {number} rank - 0-based rank position from ST results
 * @param {number} totalResults - Total number of results returned
 * @returns {number} Proxy score in [0.5, 1.0] range
 */
export function rankToProxyScore(rank, totalResults) {
    if (totalResults <= 1) return 1.0;
    return 1.0 - (rank / (totalResults - 1)) * 0.5;
}
```

- [ ] Step 4: Run tests to verify they pass

Run: `npx vitest tests/st-vector.test.js --run`
Expected: PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: add rankToProxyScore for ST vector rank-to-similarity proxy"
```

---

### Task 4: Support `_proxyVectorScore` in `calculateScore`

**Files:**
- Modify: `src/retrieval/math.js`
- Test: `tests/retrieval/st-scoring.test.js`

- [ ] Step 1: Write failing tests for proxy score integration

```javascript
// tests/retrieval/st-scoring.test.js
import { describe, expect, it } from 'vitest';
import { calculateScore } from '../../src/retrieval/math.js';

const BASE_CONSTANTS = {
    BASE_LAMBDA: 0.05,
    IMPORTANCE_5_FLOOR: 1.0,
    reflectionDecayThreshold: 750,
    reflectionLevelMultiplier: 2.0,
};

const BASE_SETTINGS = {
    vectorSimilarityThreshold: 0.5,
    alpha: 0.7,
    combinedBoostWeight: 3.0,
};

describe('calculateScore with _proxyVectorScore', () => {
    it('uses _proxyVectorScore when present instead of cosine similarity', () => {
        const memory = {
            id: 'test1',
            summary: 'Test memory',
            importance: 3,
            message_ids: [50],
            _proxyVectorScore: 0.85,
        };

        // Pass null contextEmbedding — proxy score should be used instead
        const result = calculateScore(memory, null, 100, BASE_CONSTANTS, BASE_SETTINGS, 0);

        // Proxy score of 0.85 > threshold 0.5, so vectorBonus should be non-zero
        expect(result.vectorBonus).toBeGreaterThan(0);
        expect(result.vectorSimilarity).toBe(0.85);
    });

    it('does NOT use proxy score when contextEmbedding is provided (local strategy)', () => {
        const memory = {
            id: 'test1',
            summary: 'Test memory',
            importance: 3,
            message_ids: [50],
            _proxyVectorScore: 0.85,
            // No embedding on the memory, so cosine would be 0
        };

        // When contextEmbedding is provided, proxy should be ignored
        const fakeEmbedding = new Float32Array([1, 0, 0]);
        const result = calculateScore(memory, fakeEmbedding, 100, BASE_CONSTANTS, BASE_SETTINGS, 0);

        // No embedding on memory => cosine = 0, proxy should NOT be used
        expect(result.vectorSimilarity).toBe(0);
        expect(result.vectorBonus).toBe(0);
    });

    it('proxy score below threshold yields zero vectorBonus', () => {
        const memory = {
            id: 'test1',
            summary: 'Test memory',
            importance: 3,
            message_ids: [50],
            _proxyVectorScore: 0.3, // Below threshold 0.5
        };

        const result = calculateScore(memory, null, 100, BASE_CONSTANTS, BASE_SETTINGS, 0);
        expect(result.vectorBonus).toBe(0);
    });

    it('proxy score integrates with BM25 and forgetfulness in total', () => {
        const memory = {
            id: 'test1',
            summary: 'Test memory',
            importance: 3,
            message_ids: [90],
            _proxyVectorScore: 0.9,
        };

        const bm25 = 0.5;
        const result = calculateScore(memory, null, 100, BASE_CONSTANTS, BASE_SETTINGS, bm25);

        // Total should include base + vectorBonus + bm25Bonus
        expect(result.vectorBonus).toBeGreaterThan(0);
        expect(result.bm25Bonus).toBeGreaterThan(0);
        expect(result.total).toBeGreaterThan(result.baseAfterFloor);
    });
});
```

- [ ] Step 2: Run tests to verify they fail

Run: `npx vitest tests/retrieval/st-scoring.test.js --run`
Expected: FAIL — `_proxyVectorScore` is not checked in `calculateScore`

- [ ] Step 3: Modify `calculateScore` in `src/retrieval/math.js`

In the `calculateScore` function, replace the vector similarity section:

```javascript
    // === Vector Similarity Bonus (alpha-blend) ===
    let vectorBonus = 0;
    let vectorSimilarity = 0;

    if (contextEmbedding && hasEmbedding(memory)) {
        vectorSimilarity = cosineSimilarity(contextEmbedding, getEmbedding(memory));
        const threshold = settings.vectorSimilarityThreshold;

        if (vectorSimilarity > threshold) {
            const normalizedSim = (vectorSimilarity - threshold) / (1 - threshold);
            vectorBonus = alpha * boostWeight * normalizedSim;
        }
    }
```

With:

```javascript
    // === Vector Similarity Bonus (alpha-blend) ===
    let vectorBonus = 0;
    let vectorSimilarity = 0;

    // ST Vector Storage branch: use pre-assigned proxy score (no local embeddings)
    if (!contextEmbedding && memory._proxyVectorScore != null) {
        vectorSimilarity = memory._proxyVectorScore;
        const threshold = settings.vectorSimilarityThreshold;
        if (vectorSimilarity > threshold) {
            const normalizedSim = (vectorSimilarity - threshold) / (1 - threshold);
            vectorBonus = alpha * boostWeight * normalizedSim;
        }
    } else if (contextEmbedding && hasEmbedding(memory)) {
        vectorSimilarity = cosineSimilarity(contextEmbedding, getEmbedding(memory));
        const threshold = settings.vectorSimilarityThreshold;

        if (vectorSimilarity > threshold) {
            const normalizedSim = (vectorSimilarity - threshold) / (1 - threshold);
            vectorBonus = alpha * boostWeight * normalizedSim;
        }
    }
```

- [ ] Step 4: Run tests to verify they pass

Run: `npx vitest tests/retrieval/st-scoring.test.js --run`
Expected: PASS (4 tests)

- [ ] Step 5: Run existing math tests to verify no regression

Run: `npm run test:math`
Expected: All existing tests PASS

- [ ] Step 6: Commit

```bash
git add -A && git commit -m "feat: support _proxyVectorScore in calculateScore for ST vector strategy"
```

---

### Task 5: Add OVER_FETCH_MULTIPLIER Constant

**Files:**
- Modify: `src/constants.js`

- [ ] Step 1: Add constant to `src/constants.js`

After `VECTOR_PASS_LIMIT`:

```javascript
/** Over-fetch multiplier for ST Vector Storage candidate retrieval */
export const OVER_FETCH_MULTIPLIER = 3;
```

- [ ] Step 2: Commit

```bash
git add -A && git commit -m "feat: add OVER_FETCH_MULTIPLIER constant for ST vector retrieval"
```

---

### Task 6: Add ST Sync/Delete/Purge Helpers to `data.js`

**Files:**
- Modify: `src/utils/data.js`
- Test: `tests/st-vector.test.js`

- [ ] Step 1: Write failing tests for ST storage helpers

```javascript
// Append to tests/st-vector.test.js
import { vi, beforeEach, afterEach } from 'vitest';

describe('ST storage helpers', () => {
    let mockFetch;
    let depsModule;

    beforeEach(async () => {
        depsModule = await import('../src/deps.js');
        mockFetch = vi.fn().mockResolvedValue({ ok: true });
        vi.spyOn(depsModule, 'getDeps').mockReturnValue({
            fetch: mockFetch,
            getContext: () => ({ chatId: 'chat_123' }),
            getExtensionSettings: () => ({
                openvault: { embeddingSource: 'st_vector' },
            }),
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('syncItemsToST sends POST to /api/vector/insert with correct payload', async () => {
        const { syncItemsToST } = await import('../src/utils/data.js');
        const items = [
            { hash: 12345, text: '[OV_ID:event_1] Memory text' },
        ];
        await syncItemsToST(items, 'chat_123');

        expect(mockFetch).toHaveBeenCalledWith(
            '/api/vector/insert',
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('"collectionId"'),
            })
        );
    });

    it('deleteItemsFromST sends POST to /api/vector/delete', async () => {
        const { deleteItemsFromST } = await import('../src/utils/data.js');
        await deleteItemsFromST([12345, 67890], 'chat_123');

        expect(mockFetch).toHaveBeenCalledWith(
            '/api/vector/delete',
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('"hashes"'),
            })
        );
    });

    it('purgeSTCollection sends POST to /api/vector/purge', async () => {
        const { purgeSTCollection } = await import('../src/utils/data.js');
        await purgeSTCollection('chat_123');

        expect(mockFetch).toHaveBeenCalledWith(
            '/api/vector/purge',
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('"collectionId"'),
            })
        );
    });

    it('querySTVector sends POST to /api/vector/query and returns results', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                hashes: [111, 222],
                metadata: [
                    { hash: 111, text: '[OV_ID:event_1] Text 1', index: 0 },
                    { hash: 222, text: '[OV_ID:event_2] Text 2', index: 1 },
                ],
            }),
        });

        const { querySTVector } = await import('../src/utils/data.js');
        const results = await querySTVector('search query', 10, 0.5, 'chat_123');

        expect(results).toHaveLength(2);
        expect(results[0].id).toBe('event_1');
        expect(results[1].id).toBe('event_2');
    });

    it('querySTVector extracts ID from OV_ID prefix', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                hashes: [111],
                metadata: [
                    { hash: 111, text: '[OV_ID:ref_42] Reflection text', index: 0 },
                ],
            }),
        });

        const { querySTVector } = await import('../src/utils/data.js');
        const results = await querySTVector('test', 5, 0.5, 'chat_123');
        expect(results[0].id).toBe('ref_42');
    });

    it('querySTVector returns empty array on fetch failure', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 404 });

        const { querySTVector } = await import('../src/utils/data.js');
        const results = await querySTVector('test', 5, 0.5, 'chat_123');
        expect(results).toEqual([]);
    });
});
```

- [ ] Step 2: Run tests to verify they fail

Run: `npx vitest tests/st-vector.test.js --run`
Expected: FAIL — `syncItemsToST` is not exported

- [ ] Step 3: Implement ST storage helpers in `src/utils/data.js`

Add to `src/utils/data.js`:

```javascript
import { cyrb53 } from './embedding-codec.js';

/**
 * Get the ST Vector Storage collection ID for the current chat.
 * Includes chat ID to prevent cross-chat data leakage.
 * @param {string} chatId - Current chat ID
 * @returns {string} Collection ID
 */
function getSTCollectionId(chatId) {
    const source = getDeps().getExtensionSettings()?.openvault?.embeddingSource || 'openvault';
    return `openvault-${chatId || 'default'}-${source}`;
}

/**
 * Extract OpenVault ID from ST text field with OV_ID prefix.
 * @param {string} text - Text like "[OV_ID:event_123] The actual text..."
 * @returns {string|null} Extracted ID or null
 */
function extractOvId(text) {
    if (!text) return null;
    const match = text.match(/^\[OV_ID:([^\]]+)\]/);
    return match ? match[1] : null;
}

/**
 * Check if the current embedding source is ST Vector Storage.
 * @returns {boolean}
 */
export function isStVectorSource() {
    const settings = getDeps().getExtensionSettings()?.openvault;
    return settings?.embeddingSource === 'st_vector';
}

/**
 * Sync items to ST Vector Storage via /api/vector/insert.
 * @param {Array<{hash: number, text: string}>} items - Items to insert
 * @param {string} chatId - Current chat ID
 * @returns {Promise<boolean>} True if successful
 */
export async function syncItemsToST(items, chatId) {
    if (!items || items.length === 0) return true;

    try {
        const collectionId = getSTCollectionId(chatId);
        const response = await getDeps().fetch('/api/vector/insert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                collectionId,
                items,
                source: 'openvault',
            }),
        });
        if (!response.ok) {
            logWarn(`ST Vector insert failed: ${response.status}`);
            return false;
        }
        return true;
    } catch (error) {
        logError('ST Vector insert error', error);
        return false;
    }
}

/**
 * Delete items from ST Vector Storage via /api/vector/delete.
 * @param {number[]} hashes - Cyrb53 hashes to delete
 * @param {string} chatId - Current chat ID
 * @returns {Promise<boolean>} True if successful
 */
export async function deleteItemsFromST(hashes, chatId) {
    if (!hashes || hashes.length === 0) return true;

    try {
        const collectionId = getSTCollectionId(chatId);
        const response = await getDeps().fetch('/api/vector/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                collectionId,
                hashes,
                source: 'openvault',
            }),
        });
        if (!response.ok) {
            logWarn(`ST Vector delete failed: ${response.status}`);
            return false;
        }
        return true;
    } catch (error) {
        logError('ST Vector delete error', error);
        return false;
    }
}

/**
 * Purge entire ST Vector Storage collection.
 * @param {string} chatId - Current chat ID
 * @returns {Promise<boolean>} True if successful
 */
export async function purgeSTCollection(chatId) {
    try {
        const collectionId = getSTCollectionId(chatId);
        const response = await getDeps().fetch('/api/vector/purge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ collectionId }),
        });
        if (!response.ok) {
            logWarn(`ST Vector purge failed: ${response.status}`);
            return false;
        }
        return true;
    } catch (error) {
        logError('ST Vector purge error', error);
        return false;
    }
}

/**
 * Query ST Vector Storage for similar items.
 * @param {string} searchText - Query text
 * @param {number} topK - Number of results
 * @param {number} threshold - Similarity threshold
 * @param {string} chatId - Current chat ID
 * @returns {Promise<Array<{id: string, hash: number, text: string}>>} Results with extracted OV IDs
 */
export async function querySTVector(searchText, topK, threshold, chatId) {
    try {
        const collectionId = getSTCollectionId(chatId);
        const response = await getDeps().fetch('/api/vector/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                collectionId,
                searchText,
                topK,
                threshold,
                source: 'openvault',
            }),
        });

        if (!response.ok) {
            logWarn(`ST Vector query failed: ${response.status}`);
            return [];
        }

        const data = await response.json();
        if (!data?.metadata || !Array.isArray(data.metadata)) return [];

        return data.metadata.map((item) => ({
            id: extractOvId(item.text) || String(item.hash),
            hash: item.hash,
            text: item.text,
        }));
    } catch (error) {
        logError('ST Vector query error', error);
        return [];
    }
}
```

- [ ] Step 4: Run tests to verify they pass

Run: `npx vitest tests/st-vector.test.js --run`
Expected: PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: add ST Vector Storage sync/delete/query/purge helpers"
```

---

### Task 7: Extend `EmbeddingStrategy` Base Class with Storage Methods

**Files:**
- Modify: `src/embeddings.js`

- [ ] Step 1: Add storage method stubs to `EmbeddingStrategy` base class

In `src/embeddings.js`, add to the `EmbeddingStrategy` class after `reset()`:

```javascript
    /**
     * Insert items into external vector storage (storage-backed strategies only).
     * @param {Array<{hash: number, text: string}>} _items - Items to insert
     * @param {Object} _options - Options
     * @returns {Promise<boolean>} True if successful, false if not supported
     */
    async insertItems(_items, _options = {}) { return false; }

    /**
     * Search items in external vector storage (storage-backed strategies only).
     * @param {string} _query - Search text
     * @param {number} _topK - Number of results
     * @param {number} _threshold - Similarity threshold
     * @param {Object} _options - Options
     * @returns {Promise<Array<{id: string, hash: number, text: string}>|null>} Results or null if not supported
     */
    async searchItems(_query, _topK, _threshold, _options = {}) { return null; }

    /**
     * Delete items from external vector storage.
     * @param {number[]} _hashes - Hashes to delete
     * @param {Object} _options - Options
     * @returns {Promise<boolean>}
     */
    async deleteItems(_hashes, _options = {}) { return false; }

    /**
     * Purge entire collection from external storage.
     * @param {Object} _options - Options
     * @returns {Promise<boolean>}
     */
    async purgeCollection(_options = {}) { return false; }

    /**
     * Whether this strategy uses external vector storage (vs local embeddings).
     * @returns {boolean}
     */
    usesExternalStorage() { return false; }
```

- [ ] Step 2: Commit

```bash
git add -A && git commit -m "feat: add storage method stubs to EmbeddingStrategy base class"
```

---

### Task 8: Implement `StVectorStrategy` Class

**Files:**
- Modify: `src/embeddings.js`
- Test: `tests/st-vector.test.js`

- [ ] Step 1: Write failing tests for `StVectorStrategy`

```javascript
// Append to tests/st-vector.test.js
describe('StVectorStrategy', () => {
    let depsModule;

    beforeEach(async () => {
        depsModule = await import('../src/deps.js');
        vi.spyOn(depsModule, 'getDeps').mockReturnValue({
            fetch: vi.fn().mockResolvedValue({ ok: true }),
            getContext: () => ({ chatId: 'chat_123' }),
            getExtensionSettings: () => ({
                openvault: {
                    embeddingSource: 'st_vector',
                    vectorSimilarityThreshold: 0.5,
                },
            }),
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('getId returns "st_vector"', async () => {
        const { getStrategy } = await import('../src/embeddings.js');
        const strategy = getStrategy('st_vector');
        expect(strategy.getId()).toBe('st_vector');
    });

    it('usesExternalStorage returns true', async () => {
        const { getStrategy } = await import('../src/embeddings.js');
        const strategy = getStrategy('st_vector');
        expect(strategy.usesExternalStorage()).toBe(true);
    });

    it('isEnabled returns true (ST is always considered available)', async () => {
        const { getStrategy } = await import('../src/embeddings.js');
        const strategy = getStrategy('st_vector');
        expect(strategy.isEnabled()).toBe(true);
    });

    it('getQueryEmbedding returns null (no local embeddings)', async () => {
        const { getStrategy } = await import('../src/embeddings.js');
        const strategy = getStrategy('st_vector');
        const result = await strategy.getQueryEmbedding('test');
        expect(result).toBeNull();
    });

    it('getDocumentEmbedding returns null (no local embeddings)', async () => {
        const { getStrategy } = await import('../src/embeddings.js');
        const strategy = getStrategy('st_vector');
        const result = await strategy.getDocumentEmbedding('test');
        expect(result).toBeNull();
    });
});
```

- [ ] Step 2: Run tests to verify they fail

Run: `npx vitest tests/st-vector.test.js --run`
Expected: FAIL — `getStrategy('st_vector')` returns default strategy

- [ ] Step 3: Implement `StVectorStrategy` in `src/embeddings.js`

Add after `OllamaStrategy` class:

```javascript
// =============================================================================
// ST Vector Storage Strategy
// =============================================================================

class StVectorStrategy extends EmbeddingStrategy {
    getId() {
        return 'st_vector';
    }

    isEnabled() {
        // ST Vector Storage is always considered available if selected
        return true;
    }

    getStatus() {
        return 'ST Vector Storage';
    }

    // No local embeddings — ST handles embedding generation
    async getQueryEmbedding(_text, _options = {}) {
        return null;
    }

    async getDocumentEmbedding(_text, _options = {}) {
        return null;
    }

    usesExternalStorage() {
        return true;
    }

    async insertItems(items, _options = {}) {
        const { syncItemsToST } = await import('./utils/data.js');
        const { getCurrentChatId } = await import('./utils/data.js');
        const chatId = getCurrentChatId() || 'default';
        return syncItemsToST(items, chatId);
    }

    async searchItems(query, topK, threshold, _options = {}) {
        const { querySTVector } = await import('./utils/data.js');
        const { getCurrentChatId } = await import('./utils/data.js');
        const chatId = getCurrentChatId() || 'default';
        return querySTVector(query, topK, threshold, chatId);
    }

    async deleteItems(hashes, _options = {}) {
        const { deleteItemsFromST } = await import('./utils/data.js');
        const { getCurrentChatId } = await import('./utils/data.js');
        const chatId = getCurrentChatId() || 'default';
        return deleteItemsFromST(hashes, chatId);
    }

    async purgeCollection(_options = {}) {
        const { purgeSTCollection } = await import('./utils/data.js');
        const { getCurrentChatId } = await import('./utils/data.js');
        const chatId = getCurrentChatId() || 'default';
        return purgeSTCollection(chatId);
    }
}
```

Register in strategy registry:

```javascript
const strategies = {
    'multilingual-e5-small': new TransformersStrategy(),
    'bge-small-en-v1.5': new TransformersStrategy(),
    'embeddinggemma-300m': new TransformersStrategy(),
    ollama: new OllamaStrategy(),
    st_vector: new StVectorStrategy(),
};
```

- [ ] Step 4: Run tests to verify they pass

Run: `npx vitest tests/st-vector.test.js --run`
Expected: PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: implement StVectorStrategy with external storage delegation"
```

---

### Task 9: Add ST Branch to `selectRelevantMemoriesSimple` (Retrieve-Then-Rerank)

**Files:**
- Modify: `src/retrieval/scoring.js`
- Test: `tests/retrieval/st-scoring.test.js`

- [ ] Step 1: Write failing tests for ST retrieval branch

```javascript
// Append to tests/retrieval/st-scoring.test.js
import { vi, beforeEach, afterEach } from 'vitest';

describe('selectRelevantMemories ST branch', () => {
    let depsModule;

    beforeEach(async () => {
        depsModule = await import('../../src/deps.js');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('assigns proxy scores to candidates from ST results', async () => {
        // Mock deps for ST vector source
        vi.spyOn(depsModule, 'getDeps').mockReturnValue({
            getExtensionSettings: () => ({
                openvault: {
                    embeddingSource: 'st_vector',
                    alpha: 0.7,
                    combinedBoostWeight: 3.0,
                    vectorSimilarityThreshold: 0.5,
                    forgetfulnessBaseLambda: 0.05,
                    forgetfulnessImportance5Floor: 1.0,
                    reflectionDecayThreshold: 750,
                },
            }),
            fetch: vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    hashes: [111, 222],
                    metadata: [
                        { hash: 111, text: '[OV_ID:mem_1] First memory', index: 0 },
                        { hash: 222, text: '[OV_ID:mem_2] Second memory', index: 1 },
                    ],
                }),
            }),
            getContext: () => ({ chatId: 'test_chat' }),
        });

        // Import after mocking
        const { scoreMemories } = await import('../../src/retrieval/math.js');

        // Create memories that would match ST results
        const memories = [
            { id: 'mem_1', summary: 'First memory', importance: 3, message_ids: [10], type: 'event' },
            { id: 'mem_2', summary: 'Second memory', importance: 3, message_ids: [20], type: 'event' },
            { id: 'mem_3', summary: 'Third memory not in ST', importance: 3, message_ids: [30], type: 'event' },
        ];

        // Verify proxy scores are assigned correctly
        // mem_1 at rank 0 of 2 -> proxy = 1.0
        // mem_2 at rank 1 of 2 -> proxy = 0.5
        const { rankToProxyScore } = await import('../../src/retrieval/math.js');
        expect(rankToProxyScore(0, 2)).toBe(1.0);
        expect(rankToProxyScore(1, 2)).toBe(0.5);
    });
});
```

- [ ] Step 2: Run tests to verify they pass (this is a unit test of the proxy logic)

Run: `npx vitest tests/retrieval/st-scoring.test.js --run`
Expected: PASS

- [ ] Step 3: Modify `selectRelevantMemoriesSimple` in `src/retrieval/scoring.js`

Add ST branch at the beginning of `selectRelevantMemoriesSimple`, before the existing embedding code:

```javascript
async function selectRelevantMemoriesSimple(memories, ctx, limit, allHiddenMemories = [], idfCache = null) {
    const { recentContext, userMessages, activeCharacters, chatLength } = ctx;

    // Check if using ST Vector Storage
    const settings = getDeps().getExtensionSettings()[extensionName];
    const source = settings.embeddingSource;
    const strategy = getStrategy(source);

    if (strategy.usesExternalStorage()) {
        return selectRelevantMemoriesWithST(memories, ctx, limit, allHiddenMemories, idfCache, strategy);
    }

    // ... existing code continues unchanged ...
```

Add the ST-specific function:

```javascript
/**
 * Select relevant memories using ST Vector Storage + Alpha-Blend reranking.
 * Over-fetches from ST, assigns rank-position proxy scores, then feeds into scoreMemories.
 */
async function selectRelevantMemoriesWithST(memories, ctx, limit, allHiddenMemories, idfCache, strategy) {
    const { recentContext, userMessages, activeCharacters, chatLength } = ctx;
    const { OVER_FETCH_MULTIPLIER } = await import('../constants.js');

    const settings = getDeps().getExtensionSettings()[extensionName];

    // Over-fetch from ST for reranking headroom
    const stTopK = limit * OVER_FETCH_MULTIPLIER;
    const stResults = await strategy.searchItems(
        userMessages || recentContext?.slice(-500) || '',
        stTopK,
        settings.vectorSimilarityThreshold
    );

    // Build candidates with proxy scores
    const memoriesById = new Map(memories.map((m) => [m.id, m]));

    if (stResults && stResults.length > 0) {
        const candidates = [];
        for (let i = 0; i < stResults.length; i++) {
            const memory = memoriesById.get(stResults[i].id);
            if (!memory) continue;
            memory._proxyVectorScore = rankToProxyScore(i, stResults.length);
            candidates.push(memory);
        }

        if (candidates.length > 0) {
            // Build BM25 tokens (same as local path)
            const recentMessages = parseRecentMessages(recentContext, 10);
            const queryContext = extractQueryContext(recentMessages, activeCharacters, ctx.graphNodes || {});

            const hasEvents = candidates.some((m) => m.type === 'event');
            let bm25Tokens = [];
            if (hasEvents) {
                const corpusVocab = buildCorpusVocab(candidates, allHiddenMemories, ctx.graphNodes || {}, ctx.graphEdges || {});
                bm25Tokens = buildBM25Tokens(userMessages, queryContext, corpusVocab);
            }

            // Score with proxy vector scores + BM25 + forgetfulness
            const { constants, settings: scoringSettings } = getScoringParams();
            const scored = await scoreMemories(
                candidates,
                null, // No context embedding — proxy scores are on memories
                chatLength,
                constants,
                scoringSettings,
                bm25Tokens,
                activeCharacters || [],
                allHiddenMemories,
                idfCache
            );

            const topScored = scored.slice(0, limit);

            // Clean up proxy scores from memories (don't persist them)
            for (const memory of candidates) {
                delete memory._proxyVectorScore;
            }

            return {
                memories: topScored.map((r) => r.memory),
                scoredResults: topScored,
            };
        }
    }

    // Graceful degradation: ST returned 0 candidates, fall through to BM25-only
    const recentMessages = parseRecentMessages(recentContext, 10);
    const queryContext = extractQueryContext(recentMessages, activeCharacters, ctx.graphNodes || {});
    const hasEvents = memories.some((m) => m.type === 'event');
    let bm25Tokens = [];
    if (hasEvents) {
        const corpusVocab = buildCorpusVocab(memories, allHiddenMemories, ctx.graphNodes || {}, ctx.graphEdges || {});
        bm25Tokens = buildBM25Tokens(userMessages, queryContext, corpusVocab);
    }

    return scoreMemoriesDirect(
        memories,
        null,
        chatLength,
        limit,
        bm25Tokens,
        activeCharacters || [],
        allHiddenMemories,
        idfCache
    );
}
```

Add required imports at the top of `scoring.js`:

```javascript
import { getStrategy } from '../embeddings.js';
import { OVER_FETCH_MULTIPLIER } from '../constants.js';
import { rankToProxyScore } from './math.js';
```

- [ ] Step 4: Run all retrieval tests to verify no regressions

Run: `npx vitest tests/retrieval/ --run`
Expected: All PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: add ST Vector retrieve-then-rerank branch in scoring.js"
```

---

### Task 10: Add ST Sync Hook to Extraction (Phase 1 Commit)

**Files:**
- Modify: `src/extraction/extract.js`

- [ ] Step 1: Identify the sync point in `extract.js`

Find where events are committed after Phase 1 (after `enrichEventsWithEmbeddings` and before/after save). Add a sync call for ST Vector Storage.

Add import at the top:

```javascript
import { isStSynced, markStSynced } from '../utils/embedding-codec.js';
import { isStVectorSource, syncItemsToST, getCurrentChatId } from '../utils/data.js';
import { cyrb53 } from '../utils/embedding-codec.js';
```

After the Phase 1 commit (after embeddings are generated and data is saved), add:

```javascript
// Sync to ST Vector Storage if enabled
if (isStVectorSource()) {
    const chatId = getCurrentChatId();
    const unsyncedEvents = newEvents.filter(e => !isStSynced(e));
    if (unsyncedEvents.length > 0) {
        const items = unsyncedEvents.map(e => ({
            hash: cyrb53(`[OV_ID:${e.id}] ${e.summary}`),
            text: `[OV_ID:${e.id}] ${e.summary}`,
        }));
        const success = await syncItemsToST(items, chatId);
        if (success) {
            for (const e of unsyncedEvents) markStSynced(e);
        }
    }
}
```

- [ ] Step 2: Run existing extraction tests to verify no regressions

Run: `npx vitest tests/extraction/ --run`
Expected: All PASS (sync code is behind `isStVectorSource()` guard which returns false in tests)

- [ ] Step 3: Commit

```bash
git add -A && git commit -m "feat: add ST vector sync hook after Phase 1 event extraction"
```

---

### Task 11: Add ST Sync Hook to Reflection Generation

**Files:**
- Modify: `src/reflection/reflect.js`

- [ ] Step 1: Add sync hook after reflection generation

Add imports:

```javascript
import { isStSynced, markStSynced, cyrb53 } from '../utils/embedding-codec.js';
import { isStVectorSource, syncItemsToST, getCurrentChatId } from '../utils/data.js';
```

After reflections are generated and saved, add:

```javascript
// Sync reflections to ST Vector Storage if enabled
if (isStVectorSource()) {
    const chatId = getCurrentChatId();
    const unsyncedReflections = newReflections.filter(r => !isStSynced(r));
    if (unsyncedReflections.length > 0) {
        const items = unsyncedReflections.map(r => ({
            hash: cyrb53(`[OV_ID:${r.id}] ${r.summary}`),
            text: `[OV_ID:${r.id}] ${r.summary}`,
        }));
        const success = await syncItemsToST(items, chatId);
        if (success) {
            for (const r of unsyncedReflections) markStSynced(r);
        }
    }
}
```

- [ ] Step 2: Run reflection tests to verify no regressions

Run: `npx vitest tests/reflection/ --run`
Expected: All PASS

- [ ] Step 3: Commit

```bash
git add -A && git commit -m "feat: add ST vector sync hook after reflection generation"
```

---

### Task 12: Add ST Sync Hooks to Graph Module

**Files:**
- Modify: `src/graph/graph.js`

- [ ] Step 1: Add sync in `mergeOrInsertEntity`

Add imports:

```javascript
import { isStSynced, markStSynced, cyrb53 } from '../utils/embedding-codec.js';
import { isStVectorSource, syncItemsToST, deleteItemsFromST, getCurrentChatId } from '../utils/data.js';
```

After a node is inserted/updated in `mergeOrInsertEntity`, add:

```javascript
// Sync graph node to ST Vector Storage
if (isStVectorSource()) {
    const chatId = getCurrentChatId();
    const text = `[OV_ID:${key}] ${node.description}`;
    await syncItemsToST([{ hash: cyrb53(text), text }], chatId);
    markStSynced(node);
}
```

- [ ] Step 2: Add sync in `consolidateEdges`

After edges are consolidated, sync the surviving edges:

```javascript
// Sync consolidated edge to ST Vector Storage
if (isStVectorSource() && keptEdge) {
    const chatId = getCurrentChatId();
    const edgeId = `edge_${keptEdge.source}_${keptEdge.target}`;
    const text = `[OV_ID:${edgeId}] ${keptEdge.description}`;
    await syncItemsToST([{ hash: cyrb53(text), text }], chatId);
}
```

- [ ] Step 3: Add deletion in `consolidateGraph` and `redirectEdges`

In `consolidateGraph`, when a node is removed:

```javascript
// Delete orphaned node from ST Vector Storage
if (isStVectorSource()) {
    const chatId = getCurrentChatId();
    const text = `[OV_ID:${removeKey}] ${removedNode.description}`;
    await deleteItemsFromST([cyrb53(text)], chatId);
}
```

In `redirectEdges`, when an old edge key is deleted:

```javascript
// Delete old edge from ST Vector Storage
if (isStVectorSource()) {
    const chatId = getCurrentChatId();
    const oldEdgeId = `edge_${oldEdge.source}_${oldEdge.target}`;
    const text = `[OV_ID:${oldEdgeId}] ${oldEdge.description}`;
    await deleteItemsFromST([cyrb53(text)], chatId);
}
```

- [ ] Step 4: Run graph tests to verify no regressions

Run: `npx vitest tests/graph/ --run`
Expected: All PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: add ST vector sync/delete hooks in graph module"
```

---

### Task 13: Add ST Sync Hook to Community Summarization

**Files:**
- Modify: `src/graph/communities.js`

- [ ] Step 1: Add sync in `updateCommunitySummaries`

Add imports:

```javascript
import { isStSynced, markStSynced, cyrb53 } from '../utils/embedding-codec.js';
import { isStVectorSource, syncItemsToST, getCurrentChatId } from '../utils/data.js';
```

After community summaries are generated, add:

```javascript
// Sync community summaries to ST Vector Storage
if (isStVectorSource()) {
    const chatId = getCurrentChatId();
    const items = [];
    for (const [id, community] of Object.entries(updatedCommunities)) {
        if (community.summary && !isStSynced(community)) {
            const text = `[OV_ID:${id}] ${community.summary}`;
            items.push({ hash: cyrb53(text), text });
            markStSynced(community);
        }
    }
    if (items.length > 0) {
        await syncItemsToST(items, chatId);
    }
}
```

- [ ] Step 2: Run community tests to verify no regressions

Run: `npx vitest tests/graph/ --run`
Expected: All PASS

- [ ] Step 3: Commit

```bash
git add -A && git commit -m "feat: add ST vector sync hook in community summarization"
```

---

### Task 14: Add ST Search Branch for World Context

**Files:**
- Modify: `src/retrieval/world-context.js`

- [ ] Step 1: Write failing test for ST world context retrieval

```javascript
// Append to tests/retrieval/st-scoring.test.js
describe('world-context ST branch', () => {
    it('retrieveWorldContext still works with local embeddings (no regression)', async () => {
        const { retrieveWorldContext } = await import('../../src/retrieval/world-context.js');
        const { setEmbedding } = await import('../../src/utils/embedding-codec.js');

        const communities = {
            C0: { title: 'Town', summary: 'A small town', findings: ['peaceful'] },
        };
        setEmbedding(communities.C0, new Float32Array([1, 0, 0]));
        const queryEmb = new Float32Array([1, 0, 0]);

        const result = retrieveWorldContext(communities, null, 'test', queryEmb, 2000);
        expect(result.text).toContain('Town');
        expect(result.isMacroIntent).toBe(false);
    });
});
```

- [ ] Step 2: Run test to verify it passes (no-regression baseline)

Run: `npx vitest tests/retrieval/st-scoring.test.js --run`
Expected: PASS

- [ ] Step 3: Commit

```bash
git add -A && git commit -m "test: add world-context no-regression test for ST integration"
```

---

### Task 15: Update `hasEmbedding` for ST Vector Source

**Files:**
- Modify: `src/utils/embedding-codec.js`
- Test: `tests/st-vector.test.js`

- [ ] Step 1: Write failing test

```javascript
// Append to tests/st-vector.test.js
describe('hasEmbedding with _st_synced', () => {
    it('returns true when _st_synced is set (no local embedding)', async () => {
        const { hasEmbedding, markStSynced } = await import('../src/utils/embedding-codec.js');
        const obj = {};
        markStSynced(obj);
        expect(hasEmbedding(obj)).toBe(true);
    });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npx vitest tests/st-vector.test.js --run`
Expected: FAIL — `hasEmbedding({_st_synced: true})` returns false

- [ ] Step 3: Update `hasEmbedding` in `src/utils/embedding-codec.js`

```javascript
export function hasEmbedding(obj) {
    if (!obj) return false;
    if (obj._st_synced) return true;
    if (obj.embedding_b64) return true;
    if (obj.embedding && obj.embedding.length > 0) return true;
    return false;
}
```

- [ ] Step 4: Run tests to verify they pass

Run: `npx vitest tests/st-vector.test.js --run`
Expected: PASS

- [ ] Step 5: Run full test suite for regressions

Run: `npm run test:run`
Expected: All PASS

- [ ] Step 6: Commit

```bash
git add -A && git commit -m "feat: hasEmbedding returns true for _st_synced items"
```

---

### Task 16: Add Batched Backfill Support for ST Vector

**Files:**
- Modify: `src/embeddings.js`
- Test: `tests/st-vector.test.js`

- [ ] Step 1: Write failing test for ST backfill

```javascript
// Append to tests/st-vector.test.js
describe('backfillAllEmbeddings with ST strategy', () => {
    it('syncs unsynced memories to ST in batches', async () => {
        const depsModule = await import('../src/deps.js');
        const mockFetch = vi.fn().mockResolvedValue({ ok: true });
        vi.spyOn(depsModule, 'getDeps').mockReturnValue({
            fetch: mockFetch,
            getContext: () => ({
                chatId: 'chat_123',
                chatMetadata: {
                    openvault: {
                        memories: [
                            { id: 'e1', summary: 'Event 1' },
                            { id: 'e2', summary: 'Event 2' },
                        ],
                        graph: { nodes: {}, edges: {} },
                        communities: {},
                    },
                },
            }),
            getExtensionSettings: () => ({
                openvault: { embeddingSource: 'st_vector' },
            }),
            saveChatConditional: vi.fn().mockResolvedValue(undefined),
        });

        const { isStVectorSource } = await import('../src/utils/data.js');
        expect(isStVectorSource()).toBe(true);
    });
});
```

- [ ] Step 2: Run test to verify it passes (smoke test for isStVectorSource)

Run: `npx vitest tests/st-vector.test.js --run`
Expected: PASS

- [ ] Step 3: Update `backfillAllEmbeddings` in `src/embeddings.js` to handle ST strategy

In `backfillAllEmbeddings`, after the `isEmbeddingsEnabled()` check, add an early ST branch:

```javascript
    // ST Vector Storage branch: sync items instead of generating local embeddings
    const source = settings.embeddingSource;
    const strategy = getStrategy(source);
    if (strategy.usesExternalStorage()) {
        const { cyrb53, isStSynced, markStSynced } = await import('./utils/embedding-codec.js');
        const BATCH_SIZE = 100;

        const allItems = [];

        // Collect unsynced memories
        for (const m of data[MEMORIES_KEY] || []) {
            if (m.summary && !isStSynced(m)) {
                allItems.push({ item: m, text: `[OV_ID:${m.id}] ${m.summary}` });
            }
        }

        // Collect unsynced graph nodes
        for (const [name, node] of Object.entries(data.graph?.nodes || {})) {
            if (!isStSynced(node)) {
                allItems.push({ item: node, text: `[OV_ID:${name}] ${node.description}` });
            }
        }

        // Collect unsynced communities
        for (const [id, community] of Object.entries(data.communities || {})) {
            if (community.summary && !isStSynced(community)) {
                allItems.push({ item: community, text: `[OV_ID:${id}] ${community.summary}` });
            }
        }

        if (allItems.length === 0) {
            return { memories: 0, nodes: 0, communities: 0, total: 0, skipped: true };
        }

        if (!silent) showToast('info', `Syncing ${allItems.length} items to ST Vector Storage...`);

        let synced = 0;
        for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
            const batch = allItems.slice(i, i + BATCH_SIZE);
            const stItems = batch.map(({ text }) => ({
                hash: cyrb53(text),
                text,
            }));
            const success = await strategy.insertItems(stItems);
            if (success) {
                for (const { item } of batch) {
                    markStSynced(item);
                    synced++;
                }
            }
        }

        if (synced > 0) {
            await saveOpenVaultData();
        }

        return { memories: synced, nodes: 0, communities: 0, total: synced, skipped: false };
    }
```

- [ ] Step 4: Run full test suite

Run: `npm run test:run`
Expected: All PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: add batched ST vector backfill in backfillAllEmbeddings"
```

---

### Task 17: Add `embeddingSource: 'st_vector'` to Settings UI

**Files:**
- Modify: `src/constants.js` — Document `st_vector` as valid embeddingSource value

- [ ] Step 1: Add comment documenting `st_vector` option

In `src/constants.js`, update the `embeddingSource` comment:

```javascript
    embeddingSource: 'multilingual-e5-small', // model name, 'ollama', or 'st_vector'
```

- [ ] Step 2: Commit

```bash
git add -A && git commit -m "docs: document st_vector as valid embeddingSource option"
```

---

### Task 18: Update `invalidateStaleEmbeddings` for ST Vector

**Files:**
- Modify: `src/utils/data.js`

- [ ] Step 1: Update `invalidateStaleEmbeddings` to also clear `_st_synced` flags on model change

In the mismatch wipe section, add:

```javascript
    // Also clear ST sync flags
    for (const m of data[MEMORIES_KEY] || []) {
        if (isStSynced(m)) {
            clearStSynced(m);
            count++;
        }
    }
    // (same for graph nodes and communities)
```

Add import:

```javascript
import { isStSynced, clearStSynced } from './embedding-codec.js';
```

- [ ] Step 2: Run full test suite

Run: `npm run test:run`
Expected: All PASS

- [ ] Step 3: Commit

```bash
git add -A && git commit -m "feat: invalidateStaleEmbeddings clears _st_synced flags on model change"
```

---

### Task 19: Final Integration Verification

- [ ] Step 1: Run full test suite

Run: `npm run test:run`
Expected: All PASS

- [ ] Step 2: Run linter

Run: `npx biome check src/ tests/`
Expected: No errors

- [ ] Step 3: Commit any remaining fixes

```bash
git add -A && git commit -m "chore: final cleanup for ST vector storage integration"
```
