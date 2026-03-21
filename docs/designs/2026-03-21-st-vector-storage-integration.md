# ST Vector Storage Integration

**Date:** 2026-03-21
**Status:** Approved

## Summary

Add SillyTavern's Vector Storage as an optional embedding strategy in OpenVault. When selected, OpenVault delegates embedding generation, storage, and similarity search to ST's `/api/vector/*` endpoints instead of handling embeddings locally.

## Background

OpenVault currently supports:
- **Transformers.js**: Local WASM/WebGPU with customizable models (multilingual-e5-small, bge-small-en-v1.5, embeddinggemma-300m)
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
    // Existing methods (used by Transformers/Ollama)
    async getQueryEmbedding(text, options) { throw new Error('Not implemented'); }
    async getDocumentEmbedding(text, options) { throw new Error('Not implemented'); }

    // NEW: Methods for storage-backed strategies
    async insertItems(items, options) { return false; }
    async searchItems(query, topK, threshold, options) { return null; }
    async deleteItems(hashes, options) { return false; }
    usesExternalStorage() { return false; }
}
```

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

## Implementation

### StVectorStrategy Class

Location: `src/embeddings.js` (add to existing strategies)

```javascript
class StVectorStrategy extends EmbeddingStrategy {
    #getCollectionId() {
        const source = this.#getSource();
        return `openvault-${source}`;
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
        const response = await getDeps().fetch('/api/vector/insert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                collectionId: this.#getCollectionId(),
                source: this.#getSource(),
                items: items.map(m => ({
                    hash: m.id,
                    text: m.summary,
                    index: m.index ?? 0
                })),
            }),
            signal,
        });
        return response.ok;
    }

    async searchItems(queryText, topK, threshold, { signal } = {}) {
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

        if (!response.ok) return [];

        const data = await response.json();
        return data.hashes.map((hash, i) => ({
            id: hash,
            text: data.metadata[i]?.text,
        }));
    }

    async deleteItems(hashes, { signal } = {}) {
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
    }

    #getSource() {
        const settings = getDeps().getExtensionSettings()?.vectors;
        return settings?.source || 'transformers';
    }
}
```

### Retrieval Integration

Location: `src/retrieval/retrieve.js`

```javascript
export async function retrieveMemories(queryText, topK, threshold, { signal } = {}) {
    if (!isEmbeddingsEnabled()) return [];

    const settings = getDeps().getExtensionSettings()[extensionName];
    const source = settings.embeddingSource;
    const strategy = getStrategy(source);

    if (strategy.usesExternalStorage()) {
        const results = await strategy.searchItems(queryText, topK, threshold, { signal });
        const memories = getOpenVaultData()[MEMORIES_KEY] || [];
        return results
            .map(r => memories.find(m => m.id === r.id))
            .filter(Boolean)
            .slice(0, topK);
    }

    // Existing path: local embedding + cosine similarity
    const queryEmbedding = await getQueryEmbedding(queryText, { signal });
    // ... existing logic ...
}
```

### Memory Sync Hooks

Location: `src/events.js`

Add sync calls on memory create/delete:

```javascript
// On memory created
async function syncMemoryToSt(memory) {
    const strategy = getStrategy(settings.embeddingSource);
    if (strategy.usesExternalStorage?.()) {
        await strategy.insertItems([memory]);
    }
}

// On memory deleted
async function deleteMemoryFromSt(memoryId) {
    const strategy = getStrategy(settings.embeddingSource);
    if (strategy.usesExternalStorage?.()) {
        await strategy.deleteItems([memoryId]);
    }
}
```

**Note:** Updates are not handled (simple sync). If a memory summary changes, the stored vector becomes stale until manual re-index.

## Error Handling

| Scenario | Handling |
|----------|----------|
| ST not reachable | Log warning, return empty results |
| 404 on `/api/vector/*` | ST version too old, show toast |
| Invalid source/model | Log and return empty results |
| Network timeout | AbortSignal propagation, return empty |

## Collection Management

Collection ID includes source: `openvault-{source}`

This ensures:
- Each embedding source has its own collection
- Switching sources starts fresh (no stale vectors)
- ST stores at `data/vectors/{source}/openvault-{source}/`

## Testing

### Unit Tests

- `isEnabled()` returns correct value based on ST settings
- `getStatus()` shows correct format
- `insertItems()` sends correct payload
- `searchItems()` parses response correctly
- `deleteItems()` sends correct hashes
- Error cases return empty array

### Integration Tests

- End-to-end with real ST instance
- Source switch creates new collection
- Missing ST degrades gracefully

### Manual Testing

1. Configure ST Vector Storage (e.g., OpenRouter)
2. Add memories in OpenVault
3. Verify vectors in `data/vectors/openrouter/openvault-openrouter/`
4. Search via OpenVault UI
5. Delete memory, verify removal
6. Restart ST, verify persistence

## Files Changed

| File | Change |
|------|--------|
| `src/embeddings.js` | Add `StVectorStrategy`, extend base class methods |
| `src/retrieval/retrieve.js` | Add branch for `usesExternalStorage()` |
| `src/events.js` | Add sync hooks for create/delete |

## Rollout

1. Add `StVectorStrategy` with feature flag
2. Test with ST nightly/latest release
3. Document in user guide
4. Remove feature flag after validation