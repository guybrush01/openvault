# ST Vector Storage Integration v2 - Implementation Plan

**Goal:** Add SillyTavern's Vector Storage as an optional embedding strategy that delegates embedding generation, storage, and similarity search to ST's `/api/vector/*` endpoints.

**Architecture:** Extend existing `EmbeddingStrategy` pattern with `StVectorStrategy` that returns `null` for embedding methods but implements `insertItems()`, `searchItems()`, `deleteItems()`, and `purgeCollection()` for ST API delegation. Uses hash-to-number mapping for ID compatibility.

**Tech Stack:** JavaScript, Vitest, fetch API

---

## File Structure

| File | Action | Description |
|------|--------|-------------|
| `src/embeddings.js` | Modify | Add `StVectorStrategy`, extend base class with storage methods, update `backfillAllEmbeddings` |
| `src/retrieval/scoring.js` | Modify | Add branch for `usesExternalStorage()` with mock scoring |
| `src/retrieval/world-context.js` | Modify | Add branch for ST search on communities |
| `src/extraction/extract.js` | Modify | Add sync hook after Phase 1 commit |
| `src/reflection/reflect.js` | Modify | Add sync hook after reflection generation |
| `src/utils/data.js` | Modify | Add sync helpers, call on delete operations |
| `tests/embeddings.test.js` | Modify | Add tests for `StVectorStrategy` |

---

### Task 1: Extend EmbeddingStrategy Base Class

**Files:**
- Modify: `src/embeddings.js`

**Purpose:** Add storage-related methods to the base class that strategies can optionally implement.

**Common Pitfalls:**
- Don't make new methods throw errors - return default values so existing strategies continue working
- Keep methods optional - existing Transformers/Ollama strategies should not need changes

- [ ] Step 1: Add storage methods to EmbeddingStrategy base class

Add these methods after the `reset()` method (around line 92):

```javascript
    /**
     * Check if this strategy uses external storage (ST Vector Storage)
     * @returns {boolean} True if strategy delegates storage to external system
     */
    usesExternalStorage() {
        return false;
    }

    /**
     * Insert items into external vector storage
     * @param {Object[]} items - Items to insert [{ id, summary, type? }]
     * @param {Object} options - Options
     * @param {AbortSignal} options.signal - AbortSignal
     * @returns {Promise<boolean>} True if successful
     */
    async insertItems(_items, _options = {}) {
        return false;
    }

    /**
     * Search for similar items in external vector storage
     * @param {string} queryText - Query text
     * @param {number} topK - Number of results
     * @param {number} threshold - Similarity threshold
     * @param {Object} options - Options
     * @param {AbortSignal} options.signal - AbortSignal
     * @returns {Promise<{id: string, text: string}[]|null>} Search results or null
     */
    async searchItems(_queryText, _topK, _threshold, _options = {}) {
        return null;
    }

    /**
     * Delete items from external vector storage
     * @param {string[]} ids - Item IDs to delete
     * @param {Object} options - Options
     * @param {AbortSignal} options.signal - AbortSignal
     * @returns {Promise<boolean>} True if successful
     */
    async deleteItems(_ids, _options = {}) {
        return false;
    }

    /**
     * Purge entire collection from external vector storage
     * @param {Object} options - Options
     * @param {AbortSignal} options.signal - AbortSignal
     * @returns {Promise<boolean>} True if successful
     */
    async purgeCollection(_options = {}) {
        return false;
    }
```

- [ ] Step 2: Run tests to verify no regression

Run: `npm run test:run tests/embeddings.test.js`
Expected: All existing tests pass

- [ ] Step 3: Commit

```bash
git add -A && git commit -m "feat(embeddings): add storage methods to EmbeddingStrategy base class"
```

---

### Task 2: Add Hash Mapping Utility

**Files:**
- Modify: `src/embeddings.js`

**Purpose:** Add hash-to-number conversion functions for ST API compatibility.

**Common Pitfalls:**
- Hash function must be stable (same input always produces same output)
- Use absolute value to avoid negative numbers
- Store mapping for reverse lookup

- [ ] Step 1: Add hash mapping functions after imports (around line 20)

```javascript
/**
 * Simple but stable hash function (djb2)
 * Converts string IDs to numeric IDs for ST Vector Storage compatibility
 * @param {string} str - String to hash
 * @returns {number} Numeric hash
 */
function hashToNumber(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
    }
    return Math.abs(hash);
}

/**
 * Get string ID from numeric hash using stored mapping
 * @param {number} numericHash - Numeric hash
 * @param {Object} data - OpenVault data object
 * @returns {string|null} Original string ID or null
 */
function getStringId(numericHash, data) {
    return data._st_hash_map?.[numericHash] || null;
}

/**
 * Store hash mapping for reverse lookup
 * @param {string} stringId - Original string ID
 * @param {number} numericHash - Numeric hash
 * @param {Object} data - OpenVault data object (mutated)
 */
function storeHashMapping(stringId, numericHash, data) {
    data._st_hash_map = data._st_hash_map || {};
    data._st_hash_map[numericHash] = stringId;
}
```

- [ ] Step 2: Export hashToNumber for testing

Add to exports at bottom of file:

```javascript
export { hashToNumber };
```

- [ ] Step 3: Write tests for hash mapping

Add to `tests/embeddings.test.js`:

```javascript
describe('hashToNumber', () => {
    it('produces stable numeric hashes', async () => {
        const { hashToNumber } = await import('../src/embeddings.js');

        const id1 = 'event_123456789_0';
        const id2 = 'ref_abc123-def456';

        expect(hashToNumber(id1)).toBe(hashToNumber(id1)); // Stable
        expect(hashToNumber(id2)).toBe(hashToNumber(id2)); // Stable
        expect(hashToNumber(id1)).not.toBe(hashToNumber(id2)); // Different
        expect(typeof hashToNumber(id1)).toBe('number');
        expect(hashToNumber(id1)).toBeGreaterThan(0); // Positive
    });

    it('handles various ID formats', async () => {
        const { hashToNumber } = await import('../src/embeddings.js');

        const ids = [
            'event_1',
            'event_999999999999_99',
            'ref_a1b2c3d4',
            'comm_group1',
            'Alice', // Graph node name
        ];

        const hashes = ids.map(hashToNumber);
        expect(new Set(hashes).size).toBe(ids.length); // All unique
    });
});
```

- [ ] Step 4: Run tests

Run: `npm run test:run tests/embeddings.test.js`
Expected: Tests pass

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat(embeddings): add hash-to-number mapping for ST API compatibility"
```

---

### Task 3: Write Tests for StVectorStrategy

**Files:**
- Modify: `tests/embeddings.test.js`

**Purpose:** Write failing tests that define the expected behavior of StVectorStrategy.

**Common Pitfalls:**
- Mock `getDeps()` to return ST's `extension_settings.vectors` config
- The strategy reads from `vectors` extension settings, not `openvault` settings
- Collection ID should include chatId for isolation
- Hash IDs are converted to numbers via `hashToNumber()`

- [ ] Step 1: Write test suite for StVectorStrategy

Add to `tests/embeddings.test.js`:

```javascript
describe('StVectorStrategy', () => {
    let _originalGetDeps;

    beforeEach(async () => {
        const depsModule = await import('../src/deps.js');
        _originalGetDeps = depsModule.getDeps;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('isEnabled', () => {
        it('returns true when ST vectors source is configured', async () => {
            const depsModule = await import('../src/deps.js');
            vi.spyOn(depsModule, 'getDeps').mockReturnValue({
                getExtensionSettings: vi.fn(() => ({
                    vectors: { source: 'openrouter', openrouter_model: 'qwen/qwen3-embedding-4b' },
                })),
            });

            const { getStrategy } = await import('../src/embeddings.js');
            const strategy = getStrategy('st-vectors');

            expect(strategy.isEnabled()).toBe(true);
        });

        it('returns false when ST vectors source is not configured', async () => {
            const depsModule = await import('../src/deps.js');
            vi.spyOn(depsModule, 'getDeps').mockReturnValue({
                getExtensionSettings: vi.fn(() => ({ vectors: {} })),
            });

            const { getStrategy } = await import('../src/embeddings.js');
            const strategy = getStrategy('st-vectors');

            expect(strategy.isEnabled()).toBe(false);
        });
    });

    describe('getStatus', () => {
        it('shows source and model when configured', async () => {
            const depsModule = await import('../src/deps.js');
            vi.spyOn(depsModule, 'getDeps').mockReturnValue({
                getExtensionSettings: vi.fn(() => ({
                    vectors: { source: 'openrouter', openrouter_model: 'qwen/qwen3-embedding-4b' },
                })),
            });

            const { getStrategy } = await import('../src/embeddings.js');
            const strategy = getStrategy('st-vectors');

            expect(strategy.getStatus()).toBe('ST: openrouter / qwen/qwen3-embedding-4b');
        });

        it('shows only source when model not set', async () => {
            const depsModule = await import('../src/deps.js');
            vi.spyOn(depsModule, 'getDeps').mockReturnValue({
                getExtensionSettings: vi.fn(() => ({
                    vectors: { source: 'ollama' },
                })),
            });

            const { getStrategy } = await import('../src/embeddings.js');
            const strategy = getStrategy('st-vectors');

            expect(strategy.getStatus()).toBe('ST: ollama');
        });
    });

    describe('usesExternalStorage', () => {
        it('returns true', async () => {
            const depsModule = await import('../src/deps.js');
            vi.spyOn(depsModule, 'getDeps').mockReturnValue({
                getExtensionSettings: vi.fn(() => ({ vectors: { source: 'openrouter' } })),
            });

            const { getStrategy } = await import('../src/embeddings.js');
            const strategy = getStrategy('st-vectors');

            expect(strategy.usesExternalStorage()).toBe(true);
        });
    });

    describe('insertItems', () => {
        it('calls ST /api/vector/insert with numeric hashes', async () => {
            const fetchSpy = vi.fn(async () => ({ ok: true }));
            const mockData = { _st_hash_map: {} };

            const depsModule = await import('../src/deps.js');
            vi.spyOn(depsModule, 'getDeps').mockReturnValue({
                getExtensionSettings: vi.fn(() => ({
                    vectors: { source: 'openrouter', openrouter_model: 'test-model' },
                })),
                fetch: fetchSpy,
            });

            // Mock getOpenVaultData
            const dataModule = await import('../src/utils/data.js');
            vi.spyOn(dataModule, 'getOpenVaultData').mockReturnValue(mockData);
            vi.spyOn(dataModule, 'getCurrentChatId').mockReturnValue('chat-123');

            const { getStrategy, hashToNumber } = await import('../src/embeddings.js');
            const strategy = getStrategy('st-vectors');

            const items = [
                { id: 'event_123', summary: 'First memory' },
                { id: 'ref_456', summary: 'Second memory' },
            ];

            const result = await strategy.insertItems(items);

            expect(result).toBe(true);
            expect(fetchSpy).toHaveBeenCalledTimes(1);

            const callArgs = fetchSpy.mock.calls[0];
            const body = JSON.parse(callArgs[1].body);

            // Verify collectionId includes chatId
            expect(body.collectionId).toBe('openvault-chat-123-openrouter');
            expect(body.source).toBe('openrouter');

            // Verify hashes are numeric
            expect(typeof body.items[0].hash).toBe('number');
            expect(typeof body.items[1].hash).toBe('number');
            expect(body.items[0].hash).toBe(hashToNumber('event_123'));
            expect(body.items[1].hash).toBe(hashToNumber('ref_456'));
        });

        it('returns false on fetch failure', async () => {
            const fetchSpy = vi.fn(async () => ({ ok: false }));

            const depsModule = await import('../src/deps.js');
            vi.spyOn(depsModule, 'getDeps').mockReturnValue({
                getExtensionSettings: vi.fn(() => ({ vectors: { source: 'openrouter' } })),
                fetch: fetchSpy,
            });

            const dataModule = await import('../src/utils/data.js');
            vi.spyOn(dataModule, 'getOpenVaultData').mockReturnValue({});
            vi.spyOn(dataModule, 'getCurrentChatId').mockReturnValue('chat-123');

            const { getStrategy } = await import('../src/embeddings.js');
            const strategy = getStrategy('st-vectors');

            const result = await strategy.insertItems([{ id: 'event_1', summary: 'test' }]);

            expect(result).toBe(false);
        });
    });

    describe('searchItems', () => {
        it('calls ST /api/vector/query and maps hashes back to string IDs', async () => {
            const { hashToNumber } = await import('../src/embeddings.js');
            const hash1 = hashToNumber('event_123');
            const hash2 = hashToNumber('ref_456');

            const fetchSpy = vi.fn(async () => ({
                ok: true,
                json: async () => ({
                    hashes: [hash1, hash2],
                    metadata: [
                        { text: 'First memory' },
                        { text: 'Second memory' },
                    ],
                }),
            }));

            const mockData = {
                _st_hash_map: {
                    [hash1]: 'event_123',
                    [hash2]: 'ref_456',
                },
            };

            const depsModule = await import('../src/deps.js');
            vi.spyOn(depsModule, 'getDeps').mockReturnValue({
                getExtensionSettings: vi.fn(() => ({
                    vectors: { source: 'openrouter' },
                })),
                fetch: fetchSpy,
            });

            const dataModule = await import('../src/utils/data.js');
            vi.spyOn(dataModule, 'getOpenVaultData').mockReturnValue(mockData);
            vi.spyOn(dataModule, 'getCurrentChatId').mockReturnValue('chat-123');

            const { getStrategy } = await import('../src/embeddings.js');
            const strategy = getStrategy('st-vectors');

            const results = await strategy.searchItems('query text', 10, 0.5);

            expect(fetchSpy).toHaveBeenCalledWith('/api/vector/query', expect.objectContaining({
                method: 'POST',
            }));

            const callArgs = fetchSpy.mock.calls[0];
            const body = JSON.parse(callArgs[1].body);
            expect(body.collectionId).toBe('openvault-chat-123-openrouter');
            expect(body.searchText).toBe('query text');

            // Verify hashes are mapped back to string IDs
            expect(results).toEqual([
                { id: 'event_123', text: 'First memory' },
                { id: 'ref_456', text: 'Second memory' },
            ]);
        });

        it('returns empty array on fetch failure', async () => {
            const fetchSpy = vi.fn(async () => ({ ok: false }));

            const depsModule = await import('../src/deps.js');
            vi.spyOn(depsModule, 'getDeps').mockReturnValue({
                getExtensionSettings: vi.fn(() => ({ vectors: { source: 'openrouter' } })),
                fetch: fetchSpy,
            });

            const dataModule = await import('../src/utils/data.js');
            vi.spyOn(dataModule, 'getOpenVaultData').mockReturnValue({});
            vi.spyOn(dataModule, 'getCurrentChatId').mockReturnValue('chat-123');

            const { getStrategy } = await import('../src/embeddings.js');
            const strategy = getStrategy('st-vectors');

            const results = await strategy.searchItems('query', 10, 0.5);

            expect(results).toEqual([]);
        });
    });

    describe('deleteItems', () => {
        it('converts string IDs to numeric hashes for deletion', async () => {
            const fetchSpy = vi.fn(async () => ({ ok: true }));
            const { hashToNumber } = await import('../src/embeddings.js');

            const depsModule = await import('../src/deps.js');
            vi.spyOn(depsModule, 'getDeps').mockReturnValue({
                getExtensionSettings: vi.fn(() => ({ vectors: { source: 'openrouter' } })),
                fetch: fetchSpy,
            });

            const dataModule = await import('../src/utils/data.js');
            vi.spyOn(dataModule, 'getOpenVaultData').mockReturnValue({});
            vi.spyOn(dataModule, 'getCurrentChatId').mockReturnValue('chat-123');

            const { getStrategy } = await import('../src/embeddings.js');
            const strategy = getStrategy('st-vectors');

            const result = await strategy.deleteItems(['event_123', 'ref_456']);

            expect(result).toBe(true);
            expect(fetchSpy).toHaveBeenCalledWith('/api/vector/delete', expect.objectContaining({
                method: 'POST',
            }));

            const callArgs = fetchSpy.mock.calls[0];
            const body = JSON.parse(callArgs[1].body);
            expect(body.hashes).toEqual([hashToNumber('event_123'), hashToNumber('ref_456')]);
        });
    });

    describe('purgeCollection', () => {
        it('calls ST /api/vector/purge', async () => {
            const fetchSpy = vi.fn(async () => ({ ok: true }));

            const depsModule = await import('../src/deps.js');
            vi.spyOn(depsModule, 'getDeps').mockReturnValue({
                getExtensionSettings: vi.fn(() => ({ vectors: { source: 'openrouter' } })),
                fetch: fetchSpy,
            });

            const dataModule = await import('../src/utils/data.js');
            vi.spyOn(dataModule, 'getCurrentChatId').mockReturnValue('chat-123');

            const { getStrategy } = await import('../src/embeddings.js');
            const strategy = getStrategy('st-vectors');

            const result = await strategy.purgeCollection();

            expect(result).toBe(true);
            expect(fetchSpy).toHaveBeenCalledWith('/api/vector/purge', expect.objectContaining({
                method: 'POST',
            }));
        });
    });
});
```

- [ ] Step 2: Run tests to verify they fail

Run: `npm run test:run tests/embeddings.test.js`
Expected: Tests fail with "Unknown vector source st-vectors" or strategy not found

- [ ] Step 3: Commit

```bash
git add -A && git commit -m "test(embeddings): add failing tests for StVectorStrategy"
```

---

### Task 4: Implement StVectorStrategy

**Files:**
- Modify: `src/embeddings.js`

**Purpose:** Add `StVectorStrategy` class and register it in the strategies map.

**Common Pitfalls:**
- Register strategy as `'st-vectors'` in the strategies map
- Collection ID must include chatId for isolation
- Return `null` from `getQueryEmbedding` and `getDocumentEmbedding` - ST generates embeddings internally
- Handle fetch errors gracefully - return false/empty array, don't throw
- Use `hashToNumber()` for all hash conversions

- [ ] Step 1: Add StVectorStrategy class after OllamaStrategy

Add after the `OllamaStrategy` class (around line 290, before the Strategy Registry comment):

```javascript
// =============================================================================
// ST Vector Storage Strategy
// =============================================================================

class StVectorStrategy extends EmbeddingStrategy {
    getId() {
        return 'st-vectors';
    }

    isEnabled() {
        const settings = getDeps().getExtensionSettings()?.vectors;
        return !!(settings?.source);
    }

    getStatus() {
        const settings = getDeps().getExtensionSettings()?.vectors;
        const source = settings?.source || 'not configured';
        const model = settings?.[`${source}_model`] || '';
        return `ST: ${source}${model ? ` / ${model}` : ''}`;
    }

    usesExternalStorage() {
        return true;
    }

    async getQueryEmbedding() {
        return null;
    }

    async getDocumentEmbedding() {
        return null;
    }

    #getSource() {
        const settings = getDeps().getExtensionSettings()?.vectors;
        return settings?.source || 'transformers';
    }

    async #getCollectionId() {
        const { getCurrentChatId } = await import('./utils/data.js');
        const chatId = getCurrentChatId() || 'default';
        const source = this.#getSource();
        return `openvault-${chatId}-${source}`;
    }

    async insertItems(items, { signal } = {}) {
        try {
            const data = getOpenVaultData();
            const itemsWithNumericHash = items.map((item) => {
                const numericHash = hashToNumber(item.id);
                storeHashMapping(item.id, numericHash, data);
                return {
                    hash: numericHash,
                    text: item.summary,
                    index: 0,
                };
            });

            const source = this.#getSource();
            const settings = getDeps().getExtensionSettings()?.vectors;
            const model = settings?.[`${source}_model`];

            const body = {
                collectionId: await this.#getCollectionId(),
                source,
                items: itemsWithNumericHash,
            };

            // Add model for sources that require it
            if (model) {
                body.model = model;
            }

            const response = await getDeps().fetch('/api/vector/insert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal,
            });
            return response.ok;
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            logError('ST Vector insert failed', error);
            return false;
        }
    }

    async searchItems(queryText, topK, threshold, { signal } = {}) {
        try {
            const source = this.#getSource();
            const settings = getDeps().getExtensionSettings()?.vectors;
            const model = settings?.[`${source}_model`];

            const body = {
                collectionId: await this.#getCollectionId(),
                source,
                searchText: queryText,
                topK,
                threshold,
            };

            if (model) {
                body.model = model;
            }

            const response = await getDeps().fetch('/api/vector/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal,
            });

            if (!response.ok) {
                return [];
            }

            const data = await response.json();
            const openVaultData = getOpenVaultData();

            return data.hashes.map((numericHash, i) => ({
                id: getStringId(numericHash, openVaultData) || String(numericHash),
                text: data.metadata[i]?.text,
            }));
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            logError('ST Vector search failed', error);
            return [];
        }
    }

    async deleteItems(ids, { signal } = {}) {
        try {
            const numericHashes = ids.map((id) => hashToNumber(id));

            const source = this.#getSource();
            const settings = getDeps().getExtensionSettings()?.vectors;
            const model = settings?.[`${source}_model`];

            const body = {
                collectionId: await this.#getCollectionId(),
                source,
                hashes: numericHashes,
            };

            if (model) {
                body.model = model;
            }

            const response = await getDeps().fetch('/api/vector/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal,
            });
            return response.ok;
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            logError('ST Vector delete failed', error);
            return false;
        }
    }

    async purgeCollection({ signal } = {}) {
        try {
            const response = await getDeps().fetch('/api/vector/purge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    collectionId: await this.#getCollectionId(),
                }),
                signal,
            });
            return response.ok;
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            logError('ST Vector purge failed', error);
            return false;
        }
    }
}
```

- [ ] Step 2: Register strategy in the strategies map

Add to the strategies map (around line 380):

```javascript
const strategies = {
    'multilingual-e5-small': new TransformersStrategy(),
    'bge-small-en-v1.5': new TransformersStrategy(),
    'embeddinggemma-300m': new TransformersStrategy(),
    ollama: new OllamaStrategy(),
    'st-vectors': new StVectorStrategy(),
};
```

- [ ] Step 3: Add getOpenVaultData import at top of file

Add to imports:

```javascript
import { getOpenVaultData } from './utils/data.js';
```

- [ ] Step 4: Run tests to verify they pass

Run: `npm run test:run tests/embeddings.test.js`
Expected: All tests pass

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat(embeddings): implement StVectorStrategy for ST Vector Storage"
```

---

### Task 5: Integrate with Retrieval System

**Files:**
- Modify: `src/retrieval/scoring.js`

**Purpose:** Add branch in `selectRelevantMemories()` to use ST's search when the strategy uses external storage, with mock scoring for debug cache compatibility.

**Common Pitfalls:**
- Check `usesExternalStorage()` before calling `searchItems()`
- Map returned IDs back to memory objects from the provided memories array
- Generate mock `scoredResults` for debug cache compatibility
- Cache ST mode flag for debug export

- [ ] Step 1: Add import for getStrategy

At the top of `src/retrieval/scoring.js`, add to imports:

```javascript
import { getStrategy, getQueryEmbedding, isEmbeddingsEnabled } from '../embeddings.js';
```

- [ ] Step 2: Add ST branch at start of selectRelevantMemories

At the beginning of `selectRelevantMemories()` function (after the early returns for empty memories), add:

```javascript
export async function selectRelevantMemories(memories, ctx) {
    if (!memories || memories.length === 0) return [];

    // Check if using ST Vector Storage
    const settings = getDeps().getExtensionSettings()[extensionName];
    const source = settings.embeddingSource;
    const strategy = getStrategy(source);

    if (strategy.usesExternalStorage()) {
        // Use ST's vector search
        const queryText = ctx.userMessages || ctx.recentContext?.slice(-500);
        const results = await strategy.searchItems(queryText, 100, 0.0);

        if (!results || results.length === 0) {
            cacheRetrievalDebug({
                stVectorMode: true,
                stResultsCount: 0,
                selectedCount: 0,
            });
            return [];
        }

        // Map IDs back to memory objects
        const idSet = new Set(results.map((r) => r.id));
        const selectedMemories = memories
            .filter((m) => idSet.has(m.id))
            .slice(0, Math.ceil(ctx.finalTokens / 50));

        // Mock scoredResults for debug cache compatibility
        const scoredResults = selectedMemories.map((m, i) => ({
            memory: m,
            score: 1.0 - i * 0.01,
            breakdown: {
                base: 1.0,
                baseAfterFloor: 1.0,
                recencyPenalty: 0,
                vectorSimilarity: 1.0 - i * 0.01,
                vectorBonus: 0,
                bm25Score: 0,
                bm25Bonus: 0,
                hitDamping: 0,
                frequencyFactor: 0,
                total: 1.0 - i * 0.01,
                stVectorScore: true,
            },
        }));

        const selectedIds = new Set(selectedMemories.map((m) => m.id));
        cacheScoringDetails(scoredResults, selectedIds);

        // Calculate bucket distribution for debug
        const afterBuckets = assignMemoriesToBuckets(selectedMemories, ctx.chatLength);
        const countTokens = (bucket) => bucket.reduce((sum, m) => sum + (m.summary?.length || 0), 0);

        cacheRetrievalDebug({
            stVectorMode: true,
            stResultsCount: results.length,
            selectedCount: selectedMemories.length,
            tokenBudget: {
                budget: ctx.finalTokens,
                scoredCount: results.length,
                selectedCount: selectedMemories.length,
                trimmedByBudget: results.length - selectedMemories.length,
            },
            bucketDistribution: {
                after: {
                    old: countTokens(afterBuckets.old),
                    mid: countTokens(afterBuckets.mid),
                    recent: countTokens(afterBuckets.recent),
                },
                selectedCount: selectedMemories.length,
            },
        });

        // Increment retrieval_hits
        for (const memory of selectedMemories) {
            memory.retrieval_hits = (memory.retrieval_hits || 0) + 1;
        }

        logDebug(
            `ST Vector Retrieval: ${results.length} results -> ${selectedMemories.length} memories selected`
        );
        return selectedMemories;
    }

    // Skip archived reflections in retrieval
    const activeMemories = memories.filter((m) => !m.archived);
    // ... existing local embedding + scoring logic ...
}
```

- [ ] Step 3: Run all tests to verify no regression

Run: `npm run test:run`
Expected: All tests pass

- [ ] Step 4: Commit

```bash
git add -A && git commit -m "feat(retrieval): integrate StVectorStrategy with memory selection"
```

---

### Task 6: Add World Context Support

**Files:**
- Modify: `src/retrieval/world-context.js`

**Purpose:** Support ST Vector Storage for community retrieval.

**Common Pitfalls:**
- ST returns numeric hashes that need mapping back to community IDs
- Handle case where world context is disabled

- [ ] Step 1: Add import for getStrategy

```javascript
import { getStrategy, isEmbeddingsEnabled } from '../embeddings.js';
import { extensionName } from '../constants.js';
import { getDeps } from '../deps.js';
```

- [ ] Step 2: Update retrieveWorldContext function

Modify the function to handle ST Vector Storage:

```javascript
export async function retrieveWorldContext(communities, globalState, userMessagesString, queryEmbedding, tokenBudget = 2000) {
    // Intent-based routing: check for macro intent first
    if (detectMacroIntent(userMessagesString) && globalState?.summary) {
        return {
            text: `<world_context>\n${globalState.summary}\n</world_context>`,
            communityIds: [],
            isMacroIntent: true,
        };
    }

    // Check if using ST Vector Storage
    const settings = getDeps()?.getExtensionSettings()?.[extensionName];
    const source = settings?.embeddingSource;
    const strategy = getStrategy(source);

    if (strategy.usesExternalStorage()) {
        // Use ST's search for communities
        const queryText = userMessagesString || '';
        if (!queryText) {
            return { text: '', communityIds: [], isMacroIntent: false };
        }

        const results = await strategy.searchItems(queryText, 10, 0.0);
        const communityResults = results.filter((r) => {
            // Filter to community IDs (stored with numeric hashes)
            const communityKeys = Object.keys(communities || {});
            return communityKeys.some((key) => hashToNumber(key) === Number(r.id) || key === r.id);
        });

        if (communityResults.length === 0) {
            return { text: '', communityIds: [], isMacroIntent: false };
        }

        // Map numeric IDs back to community keys
        const communityKeys = Object.keys(communities || {});
        const selectedCommunities = communityResults
            .map((r) => {
                const key = communityKeys.find(
                    (k) => hashToNumber(k) === Number(r.id) || k === r.id
                );
                return key ? { id: key, community: communities[key] } : null;
            })
            .filter(Boolean);

        // Apply token budget
        const selected = [];
        let usedTokens = 0;

        for (const { id, community } of selectedCommunities) {
            const entry = formatCommunityEntry(community);
            const tokens = countTokens(entry);
            if (usedTokens + tokens > tokenBudget) break;
            selected.push({ id, entry });
            usedTokens += tokens;
        }

        if (selected.length === 0) {
            return { text: '', communityIds: [], isMacroIntent: false };
        }

        const text = '<world_context>\n' + selected.map((s) => s.entry).join('\n\n') + '\n</world_context>';

        return {
            text,
            communityIds: selected.map((s) => s.id),
            isMacroIntent: false,
        };
    }

    // Fall back to existing local vector search logic
    if (!communities || !queryEmbedding) {
        return { text: '', communityIds: [], isMacroIntent: false };
    }

    // ... existing local logic ...
}
```

- [ ] Step 3: Import hashToNumber

Add to imports:

```javascript
import { hashToNumber } from '../embeddings.js';
```

- [ ] Step 4: Run tests

Run: `npm run test:run`
Expected: All tests pass

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat(world-context): add ST Vector Storage support for communities"
```

---

### Task 7: Add Memory Sync Hooks

**Files:**
- Modify: `src/extraction/extract.js`
- Modify: `src/reflection/reflect.js`
- Modify: `src/utils/data.js`

**Purpose:** Sync memories to ST Vector Storage when created/deleted.

**Common Pitfalls:**
- Only sync when strategy uses external storage
- Don't block the main operation on sync failure
- Use the strategy from current settings, not cached
- Sync in batches, not one-by-one

- [ ] Step 1: Add sync helper function in `src/utils/data.js`

Add after the imports section:

```javascript
import { getStrategy, isEmbeddingsEnabled } from '../embeddings.js';
import { extensionName } from '../constants.js';

/**
 * Check if ST Vector Storage is active and sync items
 * @param {Object[]} items - Items to sync [{ id, summary }]
 * @returns {Promise<boolean>} True if synced or skipped
 */
export async function syncItemsToStStorage(items) {
    try {
        const deps = getDeps();
        const settings = deps.getExtensionSettings()?.[extensionName];
        if (settings?.embeddingSource !== 'st-vectors') return false;

        const strategy = getStrategy('st-vectors');
        if (!strategy.usesExternalStorage()) return false;

        if (!items || items.length === 0) return true;

        const result = await strategy.insertItems(items);
        if (!result) {
            logWarn(`ST Vector sync failed for ${items.length} items`);
        }
        return result;
    } catch (error) {
        logError('Failed to sync items to ST Vector Storage', error);
        return false;
    }
}

/**
 * Delete items from ST Vector Storage
 * @param {string[]} ids - Item IDs to delete
 * @returns {Promise<boolean>} True if deleted or skipped
 */
export async function deleteItemsFromStStorage(ids) {
    try {
        const deps = getDeps();
        const settings = deps.getExtensionSettings()?.[extensionName];
        if (settings?.embeddingSource !== 'st-vectors') return false;

        const strategy = getStrategy('st-vectors');
        if (!strategy.usesExternalStorage()) return false;

        if (!ids || ids.length === 0) return true;

        return await strategy.deleteItems(ids);
    } catch (error) {
        logError('Failed to delete items from ST Vector Storage', error);
        return false;
    }
}

/**
 * Purge ST Vector Storage collection for current chat
 * @returns {Promise<boolean>} True if purged or skipped
 */
export async function purgeStVectorCollection() {
    try {
        const deps = getDeps();
        const settings = deps.getExtensionSettings()?.[extensionName];
        if (settings?.embeddingSource !== 'st-vectors') return false;

        const strategy = getStrategy('st-vectors');
        if (!strategy.usesExternalStorage()) return false;

        return await strategy.purgeCollection();
    } catch (error) {
        logError('Failed to purge ST Vector collection', error);
        return false;
    }
}
```

- [ ] Step 2: Add sync call in `src/extraction/extract.js` after Phase 1 commit

Find the location where events are saved (after `data[MEMORIES_KEY].push(...events)`) and add:

```javascript
// After: data[MEMORIES_KEY].push(...events);
// Add:
if (events.length > 0) {
    // Sync to ST Vector Storage
    const { syncItemsToStStorage } = await import('../utils/data.js');
    await syncItemsToStStorage(
        events.map((e) => ({ id: e.id, summary: e.summary }))
    );
}
```

- [ ] Step 3: Add sync call in `src/reflection/reflect.js` after generating reflections

Find where reflections are added to memories and add:

```javascript
// After reflections are generated and added
if (toAdd.length > 0) {
    const { syncItemsToStStorage } = await import('../utils/data.js');
    await syncItemsToStStorage(
        toAdd.map((r) => ({ id: r.id, summary: r.summary }))
    );
}
```

- [ ] Step 4: Add delete call in `src/utils/data.js` deleteMemory function

```javascript
export async function deleteMemory(id) {
    const data = getOpenVaultData();
    if (!data) {
        showToast('warning', 'No chat loaded');
        return false;
    }

    const idx = data[MEMORIES_KEY]?.findIndex((m) => m.id === id);
    if (idx === -1) {
        logDebug(`Memory ${id} not found`);
        return false;
    }

    data[MEMORIES_KEY].splice(idx, 1);

    // Delete from ST Vector Storage
    await deleteItemsFromStStorage([id]);

    await getDeps().saveChatConditional();
    logDebug(`Deleted memory ${id}`);
    return true;
}
```

- [ ] Step 5: Add purge call in `src/utils/data.js` deleteCurrentChatData function

```javascript
export async function deleteCurrentChatData() {
    const context = getDeps().getContext();

    if (!context.chatMetadata) {
        logDebug('No chat metadata found');
        return false;
    }

    // Purge ST Vector collection before deleting data
    await purgeStVectorCollection();

    delete context.chatMetadata[METADATA_KEY];
    await getDeps().saveChatConditional();
    logDebug('Deleted all chat data');
    return true;
}
```

- [ ] Step 6: Run all tests

Run: `npm run test:run`
Expected: All tests pass

- [ ] Step 7: Commit

```bash
git add -A && git commit -m "feat(events): add sync hooks for ST Vector Storage"
```

---

### Task 8: Update backfillAllEmbeddings

**Files:**
- Modify: `src/embeddings.js`

**Purpose:** Handle external storage strategies in the backfill function.

**Common Pitfalls:**
- Don't call `getDocumentEmbedding()` for external storage - use `insertItems()` directly
- Include all entity types (memories, nodes, communities)
- Return correct counts

- [ ] Step 1: Update backfillAllEmbeddings function

Find the `backfillAllEmbeddings()` function and add branch for external storage:

```javascript
export async function backfillAllEmbeddings({ signal, silent = false } = {}) {
    signal ??= getSessionSignal();
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const { MEMORIES_KEY } = await import('./constants.js');
    const { getOpenVaultData, saveOpenVaultData } = await import('./utils/data.js');
    const { setStatus } = await import('./ui/status.js');
    const { showToast } = await import('./utils/dom.js');

    if (!isEmbeddingsEnabled()) {
        if (!silent) showToast('warning', 'Configure embedding source first');
        return { memories: 0, nodes: 0, communities: 0, total: 0, skipped: false };
    }

    const data = getOpenVaultData();
    if (!data) {
        if (!silent) showToast('warning', 'No chat data available');
        return { memories: 0, nodes: 0, communities: 0, total: 0, skipped: false };
    }

    // Count what needs embedding
    const memories = (data[MEMORIES_KEY] || []).filter((m) => m.summary && !hasEmbedding(m));
    const nodes = Object.values(data.graph?.nodes || {}).filter((n) => !hasEmbedding(n));
    const communities = Object.values(data.communities || {}).filter((c) => c.summary && !hasEmbedding(c));
    const totalNeeded = memories.length + nodes.length + communities.length;

    if (totalNeeded === 0) {
        return { memories: 0, nodes: 0, communities: 0, total: 0, skipped: true };
    }

    const settings = getDeps().getExtensionSettings()[extensionName];
    const source = settings.embeddingSource;
    const strategy = getStrategy(source);

    // Handle external storage strategies (ST Vector Storage)
    if (strategy.usesExternalStorage()) {
        if (!silent) showToast('info', `Syncing ${totalNeeded} items to ST Vector Storage...`);
        setStatus('extracting');

        try {
            const memoryItems = memories.map((m) => ({
                id: m.id,
                summary: m.summary,
            }));

            const nodeItems = nodes.map((n) => ({
                id: n.name,
                summary: `${n.type}: ${n.name} - ${n.description}`,
            }));

            const communityItems = communities.map((c, i) => ({
                id: c.id || `comm_${Date.now()}_${i}`,
                summary: c.summary,
            }));

            const allItems = [...memoryItems, ...nodeItems, ...communityItems];

            if (allItems.length > 0) {
                const success = await strategy.insertItems(allItems, { signal });
                if (success) {
                    await saveOpenVaultData();
                    logInfo(
                        `ST Vector sync complete: ${memoryItems.length} memories, ${nodeItems.length} nodes, ${communityItems.length} communities`
                    );
                }
            }

            return {
                memories: memoryItems.length,
                nodes: nodeItems.length,
                communities: communityItems.length,
                total: allItems.length,
                skipped: false,
            };
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            logError('ST Vector sync error', error);
            if (!silent) showToast('error', `ST Vector sync failed: ${error.message}`);
            return { memories: 0, nodes: 0, communities: 0, total: 0, skipped: false };
        } finally {
            setStatus('ready');
        }
    }

    // Existing local embedding logic...
    // (keep all existing code for Transformers/Ollama strategies)
}
```

- [ ] Step 2: Run tests

Run: `npm run test:run tests/embeddings.test.js`
Expected: All tests pass

- [ ] Step 3: Commit

```bash
git add -A && git commit -m "feat(embeddings): add ST Vector Storage support to backfillAllEmbeddings"
```

---

### Task 9: Update getOptimalChunkSize for st-vectors

**Files:**
- Modify: `src/embeddings.js`

**Purpose:** Return a reasonable chunk size for st-vectors strategy.

- [ ] Step 1: Update getOptimalChunkSize function

Find the `getOptimalChunkSize()` function and add case for st-vectors:

```javascript
function getOptimalChunkSize() {
    const settings = getDeps().getExtensionSettings()[extensionName];
    const source = settings.embeddingSource;

    // For Transformers models, get from model config
    if (TRANSFORMERS_MODELS[source]) {
        return TRANSFORMERS_MODELS[source].optimalChunkSize || 1000;
    }

    // For Ollama, use a safe default
    if (source === 'ollama') {
        return 800;
    }

    // For ST Vector Storage, use safe default (delegates to ST's model)
    if (source === 'st-vectors') {
        return 1000;
    }

    // Fallback default
    return 1000;
}
```

- [ ] Step 2: Run tests

Run: `npm run test:run tests/embeddings.test.js`
Expected: All tests pass

- [ ] Step 3: Commit

```bash
git add -A && git commit -m "feat(embeddings): add chunk size for st-vectors strategy"
```

---

### Task 10: Run Full Test Suite and Manual Verification

- [ ] Step 1: Run full test suite

Run: `npm run test:run`
Expected: All tests pass

- [ ] Step 2: Manual testing checklist

1. Configure ST Vector Storage with a provider (e.g., OpenRouter)
2. Select `st-vectors` as embedding source in OpenVault settings
3. Add memories in OpenVault
4. Verify vectors in `data/vectors/{source}/openvault-{chatId}-{source}/`
5. Search via OpenVault UI
6. Delete memory, verify removal from ST
7. Restart ST, verify persistence
8. Switch chats, verify isolation (no cross-chat results)

- [ ] Step 3: Final commit

```bash
git add -A && git commit -m "feat: complete ST Vector Storage integration v2"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Extend EmbeddingStrategy base class | `src/embeddings.js` |
| 2 | Add hash mapping utility | `src/embeddings.js` |
| 3 | Write tests for StVectorStrategy | `tests/embeddings.test.js` |
| 4 | Implement StVectorStrategy | `src/embeddings.js` |
| 5 | Integrate with retrieval system | `src/retrieval/scoring.js` |
| 6 | Add world context support | `src/retrieval/world-context.js` |
| 7 | Add memory sync hooks | `src/extraction/extract.js`, `src/reflection/reflect.js`, `src/utils/data.js` |
| 8 | Update backfillAllEmbeddings | `src/embeddings.js` |
| 9 | Update getOptimalChunkSize | `src/embeddings.js` |
| 10 | Full test and verification | All files |