# ST Vector Storage Integration Implementation Plan

**Goal:** Add SillyTavern's Vector Storage as an optional embedding strategy that delegates embedding generation, storage, and similarity search to ST's `/api/vector/*` endpoints.
**Architecture:** Extend existing `EmbeddingStrategy` pattern with `StVectorStrategy` that returns `null` for embedding methods but implements `insertItems()`, `searchItems()`, and `deleteItems()` for ST API delegation.
**Tech Stack:** JavaScript, Vitest, fetch API

---

## File Structure

| File | Action | Description |
|------|--------|-------------|
| `src/embeddings.js` | Modify | Add `StVectorStrategy`, extend base class with storage methods |
| `src/retrieval/scoring.js` | Modify | Add branch for `usesExternalStorage()` in `selectRelevantMemories()` |
| `tests/embeddings.test.js` | Modify | Add tests for `StVectorStrategy` |

---

### Task 1: Extend EmbeddingStrategy Base Class

**Files:**
- Modify: `src/embeddings.js`

**Purpose:** Add storage-related methods to the base class that strategies can optionally implement.

**Common Pitfalls:**
- Don't make new methods throw errors - return default values (false, null) so existing strategies continue working
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
     * @param {Object[]} items - Items to insert [{ id, summary, index? }]
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
     * @returns {Promise<{id: number, text: string}[]|null>} Search results or null
     */
    async searchItems(_queryText, _topK, _threshold, _options = {}) {
        return null;
    }

    /**
     * Delete items from external vector storage
     * @param {number[]} hashes - Item hashes/IDs to delete
     * @param {Object} options - Options
     * @param {AbortSignal} options.signal - AbortSignal
     * @returns {Promise<boolean>} True if successful
     */
    async deleteItems(_hashes, _options = {}) {
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

### Task 2: Write Tests for StVectorStrategy

**Files:**
- Modify: `tests/embeddings.test.js`

**Purpose:** Write failing tests that define the expected behavior of StVectorStrategy.

**Common Pitfalls:**
- Mock `getDeps()` to return ST's `extension_settings.vectors` config
- The strategy reads from `vectors` extension settings, not `openvault` settings
- Collection ID should include source for isolation

- [ ] Step 1: Write test for isEnabled()

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

        it('shows not configured when missing', async () => {
            const depsModule = await import('../src/deps.js');
            vi.spyOn(depsModule, 'getDeps').mockReturnValue({
                getExtensionSettings: vi.fn(() => ({})),
            });

            const { getStrategy } = await import('../src/embeddings.js');
            const strategy = getStrategy('st-vectors');

            expect(strategy.getStatus()).toBe('ST: not configured');
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

    describe('getEmbedding methods', () => {
        it('getQueryEmbedding returns null', async () => {
            const depsModule = await import('../src/deps.js');
            vi.spyOn(depsModule, 'getDeps').mockReturnValue({
                getExtensionSettings: vi.fn(() => ({ vectors: { source: 'openrouter' } })),
            });

            const { getStrategy } = await import('../src/embeddings.js');
            const strategy = getStrategy('st-vectors');

            expect(await strategy.getQueryEmbedding('test')).toBeNull();
        });

        it('getDocumentEmbedding returns null', async () => {
            const depsModule = await import('../src/deps.js');
            vi.spyOn(depsModule, 'getDeps').mockReturnValue({
                getExtensionSettings: vi.fn(() => ({ vectors: { source: 'openrouter' } })),
            });

            const { getStrategy } = await import('../src/embeddings.js');
            const strategy = getStrategy('st-vectors');

            expect(await strategy.getDocumentEmbedding('test')).toBeNull();
        });
    });

    describe('insertItems', () => {
        it('calls ST /api/vector/insert with correct payload', async () => {
            const fetchSpy = vi.fn(async () => ({ ok: true }));

            const depsModule = await import('../src/deps.js');
            vi.spyOn(depsModule, 'getDeps').mockReturnValue({
                getExtensionSettings: vi.fn(() => ({
                    vectors: { source: 'openrouter', openrouter_model: 'qwen/qwen3-embedding-4b' },
                })),
                fetch: fetchSpy,
            });

            const { getStrategy } = await import('../src/embeddings.js');
            const strategy = getStrategy('st-vectors');

            const items = [
                { id: 123, summary: 'First memory' },
                { id: 456, summary: 'Second memory', index: 5 },
            ];

            const result = await strategy.insertItems(items);

            expect(result).toBe(true);
            expect(fetchSpy).toHaveBeenCalledTimes(1);
            expect(fetchSpy).toHaveBeenCalledWith('/api/vector/insert', expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            }));

            const callArgs = fetchSpy.mock.calls[0];
            const body = JSON.parse(callArgs[1].body);
            expect(body).toEqual({
                collectionId: 'openvault-openrouter',
                source: 'openrouter',
                items: [
                    { hash: 123, text: 'First memory', index: 0 },
                    { hash: 456, text: 'Second memory', index: 5 },
                ],
            });
        });

        it('returns false on fetch failure', async () => {
            const fetchSpy = vi.fn(async () => ({ ok: false }));

            const depsModule = await import('../src/deps.js');
            vi.spyOn(depsModule, 'getDeps').mockReturnValue({
                getExtensionSettings: vi.fn(() => ({
                    vectors: { source: 'openrouter' },
                })),
                fetch: fetchSpy,
            });

            const { getStrategy } = await import('../src/embeddings.js');
            const strategy = getStrategy('st-vectors');

            const result = await strategy.insertItems([{ id: 1, summary: 'test' }]);

            expect(result).toBe(false);
        });
    });

    describe('searchItems', () => {
        it('calls ST /api/vector/query and parses response', async () => {
            const fetchSpy = vi.fn(async () => ({
                ok: true,
                json: async () => ({
                    hashes: [123, 456],
                    metadata: [
                        { hash: 123, text: 'First memory', index: 0 },
                        { hash: 456, text: 'Second memory', index: 1 },
                    ],
                }),
            }));

            const depsModule = await import('../src/deps.js');
            vi.spyOn(depsModule, 'getDeps').mockReturnValue({
                getExtensionSettings: vi.fn(() => ({
                    vectors: { source: 'openrouter', openrouter_model: 'qwen/qwen3-embedding-4b' },
                })),
                fetch: fetchSpy,
            });

            const { getStrategy } = await import('../src/embeddings.js');
            const strategy = getStrategy('st-vectors');

            const results = await strategy.searchItems('query text', 10, 0.5);

            expect(fetchSpy).toHaveBeenCalledWith('/api/vector/query', expect.objectContaining({
                method: 'POST',
            }));

            const callArgs = fetchSpy.mock.calls[0];
            const body = JSON.parse(callArgs[1].body);
            expect(body).toEqual({
                collectionId: 'openvault-openrouter',
                source: 'openrouter',
                searchText: 'query text',
                topK: 10,
                threshold: 0.5,
            });

            expect(results).toEqual([
                { id: 123, text: 'First memory' },
                { id: 456, text: 'Second memory' },
            ]);
        });

        it('returns empty array on fetch failure', async () => {
            const fetchSpy = vi.fn(async () => ({ ok: false }));

            const depsModule = await import('../src/deps.js');
            vi.spyOn(depsModule, 'getDeps').mockReturnValue({
                getExtensionSettings: vi.fn(() => ({
                    vectors: { source: 'openrouter' },
                })),
                fetch: fetchSpy,
            });

            const { getStrategy } = await import('../src/embeddings.js');
            const strategy = getStrategy('st-vectors');

            const results = await strategy.searchItems('query', 10, 0.5);

            expect(results).toEqual([]);
        });
    });

    describe('deleteItems', () => {
        it('calls ST /api/vector/delete with correct payload', async () => {
            const fetchSpy = vi.fn(async () => ({ ok: true }));

            const depsModule = await import('../src/deps.js');
            vi.spyOn(depsModule, 'getDeps').mockReturnValue({
                getExtensionSettings: vi.fn(() => ({
                    vectors: { source: 'openrouter' },
                })),
                fetch: fetchSpy,
            });

            const { getStrategy } = await import('../src/embeddings.js');
            const strategy = getStrategy('st-vectors');

            const result = await strategy.deleteItems([123, 456]);

            expect(result).toBe(true);
            expect(fetchSpy).toHaveBeenCalledWith('/api/vector/delete', expect.objectContaining({
                method: 'POST',
            }));

            const callArgs = fetchSpy.mock.calls[0];
            const body = JSON.parse(callArgs[1].body);
            expect(body).toEqual({
                collectionId: 'openvault-openrouter',
                source: 'openrouter',
                hashes: [123, 456],
            });
        });

        it('returns false on fetch failure', async () => {
            const fetchSpy = vi.fn(async () => ({ ok: false }));

            const depsModule = await import('../src/deps.js');
            vi.spyOn(depsModule, 'getDeps').mockReturnValue({
                getExtensionSettings: vi.fn(() => ({
                    vectors: { source: 'openrouter' },
                })),
                fetch: fetchSpy,
            });

            const { getStrategy } = await import('../src/embeddings.js');
            const strategy = getStrategy('st-vectors');

            const result = await strategy.deleteItems([123]);

            expect(result).toBe(false);
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

### Task 3: Implement StVectorStrategy

**Files:**
- Modify: `src/embeddings.js`

**Purpose:** Add `StVectorStrategy` class and register it in the strategies map.

**Common Pitfalls:**
- Register strategy as `'st-vectors'` in the strategies map
- Collection ID must include source for isolation when switching providers
- Return `null` from `getQueryEmbedding` and `getDocumentEmbedding` - ST generates embeddings internally
- Handle fetch errors gracefully - return false/empty array, don't throw

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

    #getCollectionId() {
        const source = this.#getSource();
        return `openvault-${source}`;
    }

    async insertItems(items, { signal } = {}) {
        try {
            const response = await getDeps().fetch('/api/vector/insert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    collectionId: this.#getCollectionId(),
                    source: this.#getSource(),
                    items: items.map((m) => ({
                        hash: m.id,
                        text: m.summary,
                        index: m.index ?? 0,
                    })),
                }),
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
            const response = await getDeps().fetch('/api/vector/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    collectionId: this.#getCollectionId(),
                    source: this.#getSource(),
                    searchText: queryText,
                    topK,
                    threshold,
                }),
                signal,
            });

            if (!response.ok) {
                return [];
            }

            const data = await response.json();
            return data.hashes.map((hash, i) => ({
                id: hash,
                text: data.metadata[i]?.text,
            }));
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            logError('ST Vector search failed', error);
            return [];
        }
    }

    async deleteItems(hashes, { signal } = {}) {
        try {
            const response = await getDeps().fetch('/api/vector/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    collectionId: this.#getCollectionId(),
                    source: this.#getSource(),
                    hashes,
                }),
                signal,
            });
            return response.ok;
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            logError('ST Vector delete failed', error);
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

- [ ] Step 3: Run tests to verify they pass

Run: `npm run test:run tests/embeddings.test.js`
Expected: All tests pass

- [ ] Step 4: Commit

```bash
git add -A && git commit -m "feat(embeddings): implement StVectorStrategy for ST Vector Storage"
```

---

### Task 4: Integrate with Retrieval System

**Files:**
- Modify: `src/retrieval/scoring.js`

**Purpose:** Add branch in `selectRelevantMemories()` to use ST's search when the strategy uses external storage.

**Common Pitfalls:**
- Check `usesExternalStorage()` before calling `searchItems()`
- Map returned IDs back to memory objects from the provided memories array
- Return early with ST results - don't fall through to local similarity

- [ ] Step 1: Read scoring.js to understand selectRelevantMemories

```bash
# Just review, no changes yet
```

- [ ] Step 2: Add import for getStrategy

At the top of `src/retrieval/scoring.js`, add to imports:

```javascript
import { getStrategy, getQueryEmbedding, isEmbeddingsEnabled } from '../embeddings.js';
```

- [ ] Step 3: Add ST branch at start of selectRelevantMemories

At the beginning of `selectRelevantMemories()` function (after the early returns), add:

```javascript
export async function selectRelevantMemories(memories, ctx) {
    // Early returns for disabled/no memories...

    // Check if using ST Vector Storage
    const settings = getDeps().getExtensionSettings()[extensionName];
    const source = settings.embeddingSource;
    const strategy = getStrategy(source);

    if (strategy.usesExternalStorage()) {
        // Use ST's vector search
        const results = await strategy.searchItems(
            ctx.userMessages || ctx.recentContext?.slice(-500),
            ctx.finalTokens / 100, // rough topK estimate
            0.0, // threshold
        );

        if (!results || results.length === 0) {
            return [];
        }

        // Map IDs back to memory objects
        const idSet = new Set(results.map((r) => r.id));
        return memories.filter((m) => idSet.has(m.id)).slice(0, 20);
    }

    // Existing local embedding + scoring logic...
}
```

- [ ] Step 4: Run all tests to verify no regression

Run: `npm run test:run`
Expected: All tests pass

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat(retrieval): integrate StVectorStrategy with memory selection"
```

---

### Task 5: Add Memory Sync Hooks

**Files:**
- Modify: `src/events.js`

**Purpose:** Sync memories to ST Vector Storage when created/deleted.

**Common Pitfalls:**
- Only sync when strategy uses external storage
- Don't block the main operation on sync failure
- Use the strategy from current settings, not cached

- [ ] Step 1: Find where memories are created in events.js

Search for where memories are added to the MEMORIES_KEY array. This is typically in extraction handlers.

- [ ] Step 2: Add sync helper function

Add after the imports section:

```javascript
/**
 * Sync memory to ST Vector Storage if using external storage strategy
 * @param {Object} memory - Memory to sync
 */
async function syncMemoryToStStorage(memory) {
    try {
        const settings = getDeps().getExtensionSettings()[extensionName];
        if (settings.embeddingSource !== 'st-vectors') return;

        const { getStrategy } = await import('./embeddings.js');
        const strategy = getStrategy('st-vectors');

        if (strategy.usesExternalStorage()) {
            await strategy.insertItems([memory]);
            logDebug(`Synced memory ${memory.id} to ST Vector Storage`);
        }
    } catch (error) {
        logError('Failed to sync memory to ST Vector Storage', error);
    }
}

/**
 * Delete memory from ST Vector Storage if using external storage strategy
 * @param {number} memoryId - Memory ID to delete
 */
async function deleteMemoryFromStStorage(memoryId) {
    try {
        const settings = getDeps().getExtensionSettings()[extensionName];
        if (settings.embeddingSource !== 'st-vectors') return;

        const { getStrategy } = await import('./embeddings.js');
        const strategy = getStrategy('st-vectors');

        if (strategy.usesExternalStorage()) {
            await strategy.deleteItems([memoryId]);
            logDebug(`Deleted memory ${memoryId} from ST Vector Storage`);
        }
    } catch (error) {
        logError('Failed to delete memory from ST Vector Storage', error);
    }
}
```

- [ ] Step 3: Call sync after memory creation

Find the location where new memories are saved and add:

```javascript
// After saving memories to data
await syncMemoryToStStorage(newMemory);
```

- [ ] Step 4: Call delete after memory removal

Find the location where memories are deleted and add:

```javascript
// After removing memory from array
await deleteMemoryFromStStorage(memoryId);
```

- [ ] Step 5: Run all tests

Run: `npm run test:run`
Expected: All tests pass

- [ ] Step 6: Commit

```bash
git add -A && git commit -m "feat(events): add sync hooks for ST Vector Storage"
```

---

### Task 6: Update getOptimalChunkSize for st-vectors

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

    // For ST Vector Storage, use safe default
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

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Extend EmbeddingStrategy base class | `src/embeddings.js` |
| 2 | Write tests for StVectorStrategy | `tests/embeddings.test.js` |
| 3 | Implement StVectorStrategy | `src/embeddings.js` |
| 4 | Integrate with retrieval system | `src/retrieval/scoring.js` |
| 5 | Add memory sync hooks | `src/events.js` |
| 6 | Update getOptimalChunkSize | `src/embeddings.js` |

## Verification

After all tasks:

1. Run full test suite: `npm run test:run`
2. Configure ST Vector Storage with a provider (e.g., OpenRouter)
3. Select `st-vectors` as embedding source in OpenVault settings
4. Add memories and verify they appear in ST's vector store
5. Search memories and verify results return correctly