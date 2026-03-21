# ST Vector Storage Integration v2

**Date:** 2026-03-21
**Status:** Approved (Revised)
**Replaces:** 2026-03-21-st-vector-storage-integration.md

## Summary

Add SillyTavern's Vector Storage as an optional embedding strategy in OpenVault. When selected, OpenVault delegates embedding generation, storage, and similarity search to ST's `/api/vector/*` endpoints instead of handling embeddings locally.

## Background

OpenVault currently supports:
- **Transformers.js**: Local WASM/WebGPU with customizable models
- **Ollama**: Local server with configurable model

SillyTavern's Vector Storage extension provides:
- Multiple embedding providers (OpenRouter, OpenAI, Cohere, Ollama, etc.)
- Persistent vector storage via Vectra
- Similarity search via `/api/vector/query`

**Problem:** Users must configure embedding settings twice - once in ST, once in OpenVault.

**Solution:** Allow OpenVault to use ST's configured embedding providers directly.

## Architecture

### Strategy Pattern Extension

Add `StVectorStrategy` to the existing strategy pattern in `src/embeddings.js`:

```
┌─────────────────────────────────────────────────────────────────┐
│ EMBEDDING STRATEGIES                                            │
│                                                                 │
│  [TransformersStrategy]  →  Local WASM/WebGPU, custom models    │
│  [OllamaStrategy]        →  Local Ollama server                 │
│  [StVectorStrategy] NEW  →  ST Vector Storage (insert + query)  │
└─────────────────────────────────────────────────────────────────┘
```

### Interface Adaptation

Extend `EmbeddingStrategy` base class with storage-related methods:

```javascript
class EmbeddingStrategy {
    // Existing methods
    async getQueryEmbedding(text, options) { throw new Error('Not implemented'); }
    async getDocumentEmbedding(text, options) { throw new Error('Not implemented'); }

    // NEW: Methods for storage-backed strategies
    async insertItems(items, options) { return false; }
    async searchItems(query, topK, threshold, options) { return null; }
    async deleteItems(hashes, options) { return false; }
    usesExternalStorage() { return false; }
}
```

### Collection Isolation

**CRITICAL:** Collection ID includes chat ID to prevent cross-chat data leakage:

```javascript
#getCollectionId() {
    const chatId = getCurrentChatId();
    const source = this.#getSource();
    return `openvault-${chatId}-${source}`;
}
```

This ensures:
- Each chat has isolated vector storage
- Switching chats creates new collection
- No cross-chat contamination

### Data Flow

**Current flow (Transformers/Ollama):**
```
Query Text → Generate Embedding → Compare against stored embeddings → Top-K results
```

**New flow (ST Vector Storage):**
```
Query Text → POST /api/vector/query → ST generates embedding + searches → Top-K IDs
         → Look up memories by ID → Return results
```

### Scoring Trade-off

**IMPORTANT:** When using ST Vector Storage, OpenVault's sophisticated scoring math is bypassed:

| Feature | Local Embeddings | ST Vector Storage |
|---------|-----------------|-------------------|
| Forgetfulness Curve | ✅ Lambda decay | ❌ Raw cosine |
| Alpha-Blend | ✅ Vector + BM25 | ❌ Vector only |
| Frequency Factor | ✅ Mentions boost | ❌ Not available |
| Reflection Decay | ✅ Level-based | ❌ Not available |
| BM25 Fallback | ✅ Lexical match | ❌ Not available |

**Mitigation:**
- UI grays out scoring-related settings when `st-vectors` is active
- Info tooltip explains the trade-off
- Mock `scoredResults` generated for debug cache compatibility

### Entity Types

OpenVault embeds three types of entities. All must be synced to ST:

| Type | Source | ID Format | Collection |
|------|--------|-----------|------------|
| Memories | `MEMORIES_KEY` | `event_xxx` or `ref_xxx` | Same collection |
| Graph Nodes | `graph.nodes` | Entity name | Same collection |
| Communities | `communities` | `comm_xxx` | Same collection |

Items include metadata for type filtering:
```javascript
{
    hash: "event_123",
    text: "Memory summary...",
    metadata: { type: "memory" }
}
```

## Implementation

### StVectorStrategy Class

Location: `src/embeddings.js`

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
 * Reverse lookup: maps numeric hashes back to original string IDs
 * Stored in OpenVault data for persistence
 */
function getStringId(numericHash, data) {
    return data._st_hash_map?.[numericHash] || null;
}

function storeHashMapping(stringId, numericHash, data) {
    data._st_hash_map = data._st_hash_map || {};
    data._st_hash_map[numericHash] = stringId;
}

class StVectorStrategy extends EmbeddingStrategy {
    #getSource() {
        const settings = getDeps().getExtensionSettings()?.vectors;
        return settings?.source || 'transformers';
    }

    #getCollectionId() {
        const { getCurrentChatId } = await import('./utils/data.js');
        const chatId = getCurrentChatId() || 'default';
        const source = this.#getSource();
        return `openvault-${chatId}-${source}`;
    }

    getId() { return 'st-vectors'; }

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

    usesExternalStorage() { return true; }

    async getQueryEmbedding() { return null; }
    async getDocumentEmbedding() { return null; }

    async insertItems(items, { signal } = {}) {
        try {
            const data = getOpenVaultData();
            const itemsWithNumericHash = items.map(item => {
                const numericHash = hashToNumber(item.id);
                storeHashMapping(item.id, numericHash, data);
                return {
                    hash: numericHash,
                    text: item.summary,
                    index: 0,
                };
            });

            const response = await getDeps().fetch('/api/vector/insert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    collectionId: await this.#getCollectionId(),
                    source: this.#getSource(),
                    items: itemsWithNumericHash,
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
                    collectionId: await this.#getCollectionId(),
                    source: this.#getSource(),
                    searchText: queryText,
                    topK,
                    threshold,
                }),
                signal,
            });

            if (!response.ok) return [];

            const data = await response.json();
            const openVaultData = getOpenVaultData();

            // Map numeric hashes back to string IDs
            return data.hashes.map((numericHash, i) => ({
                id: getStringId(numericHash, openVaultData) || numericHash,
                text: data.metadata[i]?.text,
            }));
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            logError('ST Vector search failed', error);
            return [];
        }
    }

    async deleteItems(stringIds, { signal } = {}) {
        try {
            const numericHashes = stringIds.map(id => hashToNumber(id));

            const response = await getDeps().fetch('/api/vector/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    collectionId: await this.#getCollectionId(),
                    source: this.#getSource(),
                    hashes: numericHashes,
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

### Retrieval Integration

Location: `src/retrieval/scoring.js`

```javascript
export async function selectRelevantMemories(memories, ctx) {
    if (!memories || memories.length === 0) return [];

    const settings = getDeps().getExtensionSettings()[extensionName];
    const source = settings.embeddingSource;
    const strategy = getStrategy(source);

    // ST Vector Storage branch
    if (strategy.usesExternalStorage()) {
        const queryText = ctx.userMessages || ctx.recentContext?.slice(-500);
        const results = await strategy.searchItems(
            queryText,
            100, // Get more for filtering
            0.0
        );

        // Filter to memories only and map back to objects
        const memoryResults = results.filter(r => r.type === 'memory');
        const idSet = new Set(memoryResults.map(r => r.id));
        const selectedMemories = memories.filter(m => idSet.has(m.id)).slice(0, ctx.finalTokens / 50);

        // Mock scoredResults for debug cache compatibility
        const scoredResults = selectedMemories.map((m, i) => ({
            memory: m,
            score: 1.0 - (i * 0.01),
            breakdown: {
                base: 1.0,
                total: 1.0 - (i * 0.01),
                stVectorScore: true
            }
        }));

        const selectedIds = new Set(selectedMemories.map(m => m.id));
        cacheScoringDetails(scoredResults, selectedIds);

        cacheRetrievalDebug({
            stVectorMode: true,
            stResultsCount: results.length,
            selectedCount: selectedMemories.length,
        });

        return selectedMemories;
    }

    // Existing local embedding + scoring logic...
}
```

### World Context Integration

Location: `src/retrieval/world-context.js`

```javascript
export async function retrieveWorldContext(communities, globalState, userMessagesString, queryEmbedding, tokenBudget = 2000) {
    // Check for ST Vector Storage
    const settings = getDeps().getExtensionSettings()[extensionName];
    const source = settings.embeddingSource;
    const strategy = getStrategy(source);

    if (strategy.usesExternalStorage()) {
        // Use ST's search for communities
        const queryText = userMessagesString || '';
        const results = await strategy.searchItems(queryText, 10, 0.0);
        const communityResults = results.filter(r => r.type === 'community');

        // Format and return...
    }

    // Existing local logic...
}
```

### Memory Sync Hooks

**Location: `src/extraction/extract.js`** (after Phase 1 commit)

```javascript
// After: data[MEMORIES_KEY].push(...events);
// Add:
if (events.length > 0) {
    await syncItemsToStStorage(events.map(e => ({
        id: e.id,
        summary: e.summary,
        type: 'memory'
    })));
}
```

**Location: `src/reflection/reflect.js`** (after generating reflections)

```javascript
// After: data[MEMORIES_KEY].push(...reflections);
// Add:
if (reflections.length > 0) {
    await syncItemsToStStorage(reflections.map(r => ({
        id: r.id,
        summary: r.summary,
        type: 'memory'
    })));
}
```

**Location: `src/utils/data.js`** (in deleteMemory)

```javascript
export async function deleteMemory(id) {
    // ... existing deletion logic ...

    // Delete from ST Vector Storage
    await deleteItemsFromStStorage([id]);
}
```

**Location: `src/utils/data.js`** (in deleteCurrentChatData)

```javascript
export async function deleteCurrentChatData() {
    // Get all memory IDs before deletion
    const memoryIds = (data[MEMORIES_KEY] || []).map(m => m.id);

    // ... existing deletion logic ...

    // Delete collection from ST Vector Storage
    await deleteStVectorCollection();
}
```

### Backfill Support

Location: `src/embeddings.js` - `backfillAllEmbeddings()`

```javascript
export async function backfillAllEmbeddings({ signal, silent = false } = {}) {
    // ... existing guards ...

    const strategy = getStrategy(source);

    if (strategy.usesExternalStorage()) {
        // For ST Vector Storage, insert items directly
        const memoryItems = memories.map(m => ({
            id: m.id,
            summary: m.summary,
            type: 'memory'
        }));

        const nodeItems = nodes.map(n => ({
            id: n.name,
            summary: `${n.type}: ${n.name} - ${n.description}`,
            type: 'node'
        }));

        const communityItems = communities.map(c => ({
            id: c.id || `comm_${generateId()}`,
            summary: c.summary,
            type: 'community'
        }));

        const allItems = [...memoryItems, ...nodeItems, ...communityItems];

        if (allItems.length > 0) {
            const success = await strategy.insertItems(allItems, { signal });
            if (success) {
                await saveOpenVaultData();
            }
        }

        return {
            memories: memoryItems.length,
            nodes: nodeItems.length,
            communities: communityItems.length,
            total: allItems.length,
            skipped: false
        };
    }

    // Existing local embedding logic...
}
```

## API Compatibility

### Hash ID Mapping

**CRITICAL:** ST Vector Storage converts hashes to numbers via `Number(x)`. OpenVault uses string IDs (`event_123456789_0`, `ref_abc123`).

**Solution:** Use a stable hash function to convert string IDs to numeric IDs:

```javascript
// Simple but stable hash function (djb2)
function hashToNumber(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
    }
    return Math.abs(hash);
}

// Map: event_123456789_0 -> 1234567890123 (stable numeric ID)
```

**Trade-off:** Slight collision risk, but acceptable for memory IDs in a single chat.

### ST API Endpoints

| Endpoint | Method | Required Fields | Notes |
|----------|--------|-----------------|-------|
| `/api/vector/insert` | POST | `collectionId`, `items[{hash, text}]` | Bulk insert supported |
| `/api/vector/query` | POST | `collectionId`, `searchText` | Returns `{hashes, metadata}` |
| `/api/vector/delete` | POST | `collectionId`, `hashes[]` | Hashes converted to numbers |
| `/api/vector/purge` | POST | `collectionId` | Deletes entire collection |
| `/api/vector/list` | POST | `collectionId` | Returns all hashes |

### Source Settings

Each embedding source requires specific settings passed in the request body:

| Source | Required Settings |
|--------|-------------------|
| `openrouter` | `model` (e.g., `openai/text-embedding-3-large`) |
| `openai` | `model` (e.g., `text-embedding-3-small`) |
| `ollama` | `apiUrl`, `model` |
| `cohere` | `model` |
| `transformers` | None (uses default model) |

Settings are read from ST's `extension_settings.vectors` and passed through to the API.

## Error Handling

| Scenario | Handling |
|----------|----------|
| ST not reachable | Log warning, return empty results, show toast |
| 404 on `/api/vector/*` | ST version too old, show toast with version requirement |
| Invalid source/model | Log and return empty results |
| Network timeout | AbortSignal propagation, return empty |
| Chat ID unavailable | Use 'default' as fallback, log warning |
| Hash collision | Log warning, both memories searchable by content |

## Files Changed

| File | Change |
|------|--------|
| `src/embeddings.js` | Add `StVectorStrategy`, extend base class, update `backfillAllEmbeddings` |
| `src/retrieval/scoring.js` | Add branch for `usesExternalStorage()` with mock scoring |
| `src/retrieval/world-context.js` | Add branch for ST search on communities |
| `src/extraction/extract.js` | Add sync hook after Phase 1 commit |
| `src/reflection/reflect.js` | Add sync hook after reflection generation |
| `src/utils/data.js` | Add sync helpers, call on delete operations |

## Rollout

1. Implement `StVectorStrategy` with feature flag
2. Test with ST nightly/latest release
3. Add UI indicators for scoring trade-off
4. Document in user guide
5. Remove feature flag after validation