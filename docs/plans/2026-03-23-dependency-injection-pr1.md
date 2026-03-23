# PR 1: Dependency Injection — Implementation Plan

**Goal:** Remove `getDeps().getExtensionSettings()` reads from `query-context.js`, `scoring.js`, `embeddings.js`, and `llm.js`. Deliver settings via existing context objects. No logic changes.

**Architecture:** Orchestrators (`retrieve.js`) build config objects from settings and attach them to `RetrievalContext`. Domain functions read config from ctx instead of calling `getDeps()`. Embedding strategies accept settings as method params; wrappers remain the getDeps boundary. `callLLM` accepts optional profileId in options with getDeps fallback.

**Tech Stack:** Vitest, ESM, no new dependencies.

**Common Pitfalls:**
- `buildBM25Tokens` DOES use settings (`entityBoostWeight`) — don't forget its queryConfig param
- `scoreMemoriesDirect` in `scoring.js` must destructure flat `scoringConfig` into the `{constants, settings}` shape `math.js` expects — do NOT touch `math.js`
- `selectRelevantMemoriesWithST` calls `scoreMemories` from `math.js` directly (not via `scoreMemoriesDirect`) — it also needs its own destructuring
- `query-context.js` imports `getOptimalChunkSize` from `embeddings.js` which still calls getDeps — the test must mock this import (already done, but fix the stale module path)
- `OllamaStrategy.isEnabled()` and `getStatus()` still need `#getSettings()` — only delete getDeps from embedding methods

**File Structure Overview:**
- Modify: `src/retrieval/query-context.js` — delete `getQueryContextSettings()`, accept `queryConfig` param
- Modify: `src/retrieval/scoring.js` — delete `getScoringParams()`, read from `ctx.scoringConfig`, pass `ctx.queryConfig`
- Modify: `src/retrieval/retrieve.js` — build `queryConfig` + `scoringConfig` in `buildRetrievalContext()`
- Modify: `src/embeddings.js` — inject prefix/url/model into strategy methods
- Modify: `src/llm.js` — accept optional `profileId`/`backupProfileId` in options
- Modify: `tests/query-context.test.js` — remove `setupTestContext`, pass `queryConfig` directly
- Modify: `tests/retrieval/scoring.test.js` — add configs to ctx objects
- Modify: `tests/embeddings.test.js` — add strategy-level test with injected params
- Modify: `tests/llm.test.js` — add explicit profileId test

---

### Task 1: Refactor query-context.js

**Files:**
- Modify: `src/retrieval/query-context.js`

- [ ] Step 1: Delete `getQueryContextSettings()` and its imports

Remove the `extensionName` and `getDeps` imports and the entire `getQueryContextSettings()` function (lines 1-2, 20-28):

```js
// DELETE these two imports:
import { extensionName } from '../constants.js';
import { getDeps } from '../deps.js';

// DELETE this entire function:
function getQueryContextSettings() {
    const settings = getDeps().getExtensionSettings()[extensionName];
    return {
        entityWindowSize: settings.entityWindowSize,
        embeddingWindowSize: settings.embeddingWindowSize,
        recencyDecayFactor: settings.recencyDecayFactor,
        topEntitiesCount: settings.topEntitiesCount,
        entityBoostWeight: settings.entityBoostWeight,
    };
}
```

- [ ] Step 2: Add `queryConfig` param to `extractQueryContext`

```js
// BEFORE
export function extractQueryContext(messages, activeCharacters = [], graphNodes = {}) {
    if (!messages || messages.length === 0) {
        return { entities: [], weights: {} };
    }
    const settings = getQueryContextSettings();

// AFTER
export function extractQueryContext(messages, activeCharacters = [], graphNodes = {}, queryConfig) {
    if (!messages || messages.length === 0) {
        return { entities: [], weights: {} };
    }
    const settings = queryConfig;
```

- [ ] Step 3: Add `queryConfig` param to `buildEmbeddingQuery`

```js
// BEFORE
export function buildEmbeddingQuery(messages, extractedEntities) {
    if (!messages || messages.length === 0) {
        return '';
    }
    const settings = getQueryContextSettings();

// AFTER
export function buildEmbeddingQuery(messages, extractedEntities, queryConfig) {
    if (!messages || messages.length === 0) {
        return '';
    }
    const settings = queryConfig;
```

- [ ] Step 4: Add `queryConfig` param to `buildBM25Tokens`

```js
// BEFORE
export function buildBM25Tokens(userMessage, extractedEntities, corpusVocab = null, meta = null) {
    const tokens = [];
    const settings = getQueryContextSettings();

// AFTER
export function buildBM25Tokens(userMessage, extractedEntities, corpusVocab = null, meta = null, queryConfig) {
    const tokens = [];
    const settings = queryConfig;
```

- [ ] Step 5: Run test to confirm expected failures

Run: `npx vitest tests/query-context.test.js --run 2>&1 | head -30`
Expected: FAIL — tests still pass `setupTestContext` and don't provide `queryConfig`

---

### Task 2: Update query-context.test.js

**Files:**
- Modify: `tests/query-context.test.js`

- [ ] Step 1: Fix `vi.mock` path and remove `setupTestContext`

```js
// BEFORE (top of file)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDeps } from '../src/deps.js';

// Mock getOptimalChunkSize
vi.mock('../src/embeddings/strategies.js', () => ({
    getOptimalChunkSize: () => 500,
}));

// AFTER (top of file)
import { describe, expect, it, vi } from 'vitest';

// Mock getOptimalChunkSize — embeddings.js still calls getDeps internally
vi.mock('../src/embeddings.js', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, getOptimalChunkSize: () => 500 };
});
```

- [ ] Step 2: Replace `beforeEach`/`afterEach` with a shared `queryConfig` constant

```js
// DELETE the beforeEach/afterEach blocks entirely:
//   beforeEach(() => { setupTestContext({...}); });
//   afterEach(() => { resetDeps(); vi.clearAllMocks(); });

// ADD at the top of describe('query-context'):
const queryConfig = {
    entityWindowSize: 10,
    embeddingWindowSize: 5,
    recencyDecayFactor: 0.09,
    topEntitiesCount: 5,
    entityBoostWeight: 5.0,
};
```

- [ ] Step 3: Pass `queryConfig` to all `extractQueryContext` calls

Every `extractQueryContext(messages, chars, nodes)` becomes `extractQueryContext(messages, chars, nodes, queryConfig)`:

```js
// Example (in each test):
const result = extractQueryContext(messages, [], graphNodes, queryConfig);
```

Edge-case tests that pass `null` or `[]` — add queryConfig as last arg:
```js
const result = extractQueryContext(null, [], {}, queryConfig);
const result = extractQueryContext([], [], {}, queryConfig);
```

- [ ] Step 4: Pass `queryConfig` to all `buildEmbeddingQuery` calls

```js
const query = buildEmbeddingQuery(messages, entities, queryConfig);
```

- [ ] Step 5: Pass `queryConfig` to all `buildBM25Tokens` calls

```js
// Calls with 2 args (userMessage, entities):
const tokens = buildBM25Tokens(userMessage, entities, null, null, queryConfig);

// Calls with 1 arg (userMessage only with null entities):
const tokens = buildBM25Tokens('test query', null, null, null, queryConfig);

// Calls with explicit corpusVocab — already has 4 args, add queryConfig as 5th
```

- [ ] Step 6: Run tests to verify all pass

Run: `npx vitest tests/query-context.test.js --run`
Expected: All 17+ tests PASS

---

### Task 3: Refactor scoring.js

**Files:**
- Modify: `src/retrieval/scoring.js`

- [ ] Step 1: Delete `getScoringParams()` and clean up imports

```js
// BEFORE (imports)
import { extensionName, OVER_FETCH_MULTIPLIER } from '../constants.js';
import { getDeps } from '../deps.js';

// AFTER (imports) — remove extensionName and getDeps
import { OVER_FETCH_MULTIPLIER } from '../constants.js';

// DELETE getScoringParams() entirely (lines 27-42)
```

- [ ] Step 2: Update `scoreMemoriesDirect` to accept `scoringConfig`

```js
// BEFORE
async function scoreMemoriesDirect(
    memories, contextEmbedding, chatLength, limit,
    queryTokens, characterNames = [], hiddenMemories = [], idfCache = null
) {
    const { constants, settings } = getScoringParams();
    const scored = await scoreMemories(
        memories, contextEmbedding, chatLength,
        constants, settings,
        queryTokens, characterNames, hiddenMemories, idfCache
    );

// AFTER
async function scoreMemoriesDirect(
    memories, contextEmbedding, chatLength, limit,
    queryTokens, characterNames = [], hiddenMemories = [], idfCache = null,
    scoringConfig
) {
    // Destructure flat scoringConfig into the {constants, settings} shape math.js expects
    const constants = {
        BASE_LAMBDA: scoringConfig.forgetfulnessBaseLambda,
        IMPORTANCE_5_FLOOR: scoringConfig.forgetfulnessImportance5Floor,
        reflectionDecayThreshold: scoringConfig.reflectionDecayThreshold,
    };
    const settings = {
        vectorSimilarityThreshold: scoringConfig.vectorSimilarityThreshold,
        alpha: scoringConfig.alpha,
        combinedBoostWeight: scoringConfig.combinedBoostWeight,
    };
    const scored = await scoreMemories(
        memories, contextEmbedding, chatLength,
        constants, settings,
        queryTokens, characterNames, hiddenMemories, idfCache
    );
```

- [ ] Step 3: Update `selectRelevantMemoriesSimple`

Replace `getDeps()` reads with ctx destructuring. Pass `ctx.queryConfig` to query-context calls. Pass `ctx.scoringConfig` to `scoreMemoriesDirect`.

```js
async function selectRelevantMemoriesSimple(memories, ctx, limit, allHiddenMemories = [], idfCache = null) {
    const { recentContext, userMessages, activeCharacters, chatLength, scoringConfig, queryConfig } = ctx;

    // BEFORE: const settings = getDeps().getExtensionSettings()[extensionName];
    //         const source = settings.embeddingSource;
    // AFTER:
    const source = scoringConfig.embeddingSource;
    const strategy = getStrategy(source);

    if (strategy.usesExternalStorage()) {
        return selectRelevantMemoriesWithST(memories, ctx, limit, allHiddenMemories, idfCache, strategy);
    }

    const recentMessages = parseRecentMessages(recentContext, 10);
    // ADD queryConfig as 4th arg:
    const queryContext = extractQueryContext(recentMessages, activeCharacters, ctx.graphNodes || {}, queryConfig);

    const userMessagesForEmbedding = parseRecentMessages(userMessages, 3);
    // ADD queryConfig as 3rd arg:
    const embeddingQuery = buildEmbeddingQuery(userMessagesForEmbedding, queryContext, queryConfig);

    // ... event gate unchanged ...

    if (hasEvents) {
        const corpusVocab = buildCorpusVocab(memories, allHiddenMemories, ctx.graphNodes || {}, ctx.graphEdges || {});
        // ADD queryConfig as 5th arg:
        bm25Tokens = buildBM25Tokens(userMessages, queryContext, corpusVocab, bm25Meta, queryConfig);
    }

    // ... caching, logging, embedding unchanged ...

    return scoreMemoriesDirect(
        memories, contextEmbedding, chatLength, limit,
        bm25Tokens, activeCharacters || [], allHiddenMemories, idfCache,
        scoringConfig  // ADD as last arg
    );
}
```

- [ ] Step 4: Update `selectRelevantMemoriesWithST`

Replace `getDeps()` reads. Destructure `scoringConfig` for `scoreMemories` call. Pass `queryConfig` to query-context calls.

```js
async function selectRelevantMemoriesWithST(memories, ctx, limit, allHiddenMemories, idfCache, strategy) {
    const { recentContext, userMessages, activeCharacters, chatLength, scoringConfig, queryConfig } = ctx;
    // DELETE: const settings = getDeps().getExtensionSettings()[extensionName];

    const stTopK = limit * OVER_FETCH_MULTIPLIER;
    const stResults = await strategy.searchItems(
        userMessages || recentContext?.slice(-500) || '',
        stTopK,
        scoringConfig.vectorSimilarityThreshold  // was: settings.vectorSimilarityThreshold
    );

    // ... build candidates unchanged ...

    if (candidates.length > 0) {
        const recentMessages = parseRecentMessages(recentContext, 10);
        const queryContext = extractQueryContext(recentMessages, activeCharacters, ctx.graphNodes || {}, queryConfig);

        // ... event gate ...
        if (hasEvents) {
            const corpusVocab = buildCorpusVocab(candidates, allHiddenMemories, ctx.graphNodes || {}, ctx.graphEdges || {});
            bm25Tokens = buildBM25Tokens(userMessages, queryContext, corpusVocab, null, queryConfig);
        }

        // BEFORE: const { constants, settings: scoringSettings } = getScoringParams();
        // AFTER: Destructure for math.js
        const constants = {
            BASE_LAMBDA: scoringConfig.forgetfulnessBaseLambda,
            IMPORTANCE_5_FLOOR: scoringConfig.forgetfulnessImportance5Floor,
            reflectionDecayThreshold: scoringConfig.reflectionDecayThreshold,
        };
        const scoringSettings = {
            vectorSimilarityThreshold: scoringConfig.vectorSimilarityThreshold,
            alpha: scoringConfig.alpha,
            combinedBoostWeight: scoringConfig.combinedBoostWeight,
        };
        const scored = await scoreMemories(
            candidates, null, chatLength,
            constants, scoringSettings,
            bm25Tokens, activeCharacters || [], allHiddenMemories, idfCache
        );

        // ... rest unchanged (cleanup proxy scores, return) ...
    }

    // Fallback path (ST returned 0 candidates) — same pattern:
    const recentMessages = parseRecentMessages(recentContext, 10);
    const queryContext = extractQueryContext(recentMessages, activeCharacters, ctx.graphNodes || {}, queryConfig);
    // ... event gate ...
    if (hasEvents) {
        const corpusVocab = buildCorpusVocab(memories, allHiddenMemories, ctx.graphNodes || {}, ctx.graphEdges || {});
        bm25Tokens = buildBM25Tokens(userMessages, queryContext, corpusVocab, null, queryConfig);
    }

    return scoreMemoriesDirect(
        memories, null, chatLength, limit,
        bm25Tokens, activeCharacters || [], allHiddenMemories, idfCache,
        scoringConfig
    );
}
```

- [ ] Step 5: Run test to confirm expected failures

Run: `npx vitest tests/retrieval/scoring.test.js --run 2>&1 | head -30`
Expected: FAIL — tests don't provide `scoringConfig`/`queryConfig` in ctx

---

### Task 4: Update scoring.test.js

**Files:**
- Modify: `tests/retrieval/scoring.test.js`

- [ ] Step 1: Add shared config objects

The `selectMemoriesWithSoftBalance` tests don't need changes (pure function, no ctx). Only the `selectRelevantMemories` tests need updated ctx:

```js
// Add these config objects at the top of "selectRelevantMemories with soft balance" describe:
const scoringConfig = {
    forgetfulnessBaseLambda: 0.05,
    forgetfulnessImportance5Floor: undefined,
    reflectionDecayThreshold: undefined,
    vectorSimilarityThreshold: 0.5,
    alpha: 0.7,
    combinedBoostWeight: 15,
    embeddingSource: 'multilingual-e5-small',
};
const queryConfig = {
    entityWindowSize: 10,
    embeddingWindowSize: 5,
    recencyDecayFactor: 0.09,
    topEntitiesCount: 5,
    entityBoostWeight: 5.0,
};
```

- [ ] Step 2: Add configs to mockCtx in both `selectRelevantMemories` tests

```js
const mockCtx = {
    recentContext: '...',
    userMessages: '...',
    activeCharacters: ['Char'],
    chatLength: 1000,
    finalTokens: 500,
    graphNodes: {},
    graphEdges: {},
    allAvailableMemories: [],
    scoringConfig,  // ADD
    queryConfig,    // ADD
};
```

- [ ] Step 3: Run tests

Run: `npx vitest tests/retrieval/scoring.test.js --run`
Expected: All tests PASS

---

### Task 5: Wire retrieve.js

**Files:**
- Modify: `src/retrieval/retrieve.js`

- [ ] Step 1: Build `queryConfig` and `scoringConfig` in `buildRetrievalContext()`

In `buildRetrievalContext()`, after the existing `const settings = deps.getExtensionSettings()[extensionName];` line, add two config blocks before the return statement:

```js
    // Build config objects for domain functions (dependency injection)
    const queryConfig = {
        entityWindowSize: settings.entityWindowSize,
        embeddingWindowSize: settings.embeddingWindowSize,
        recencyDecayFactor: settings.recencyDecayFactor,
        topEntitiesCount: settings.topEntitiesCount,
        entityBoostWeight: settings.entityBoostWeight,
    };

    const scoringConfig = {
        forgetfulnessBaseLambda: settings.forgetfulnessBaseLambda,
        forgetfulnessImportance5Floor: settings.forgetfulnessImportance5Floor,
        reflectionDecayThreshold: settings.reflectionDecayThreshold,
        vectorSimilarityThreshold: settings.vectorSimilarityThreshold,
        alpha: settings.alpha,
        combinedBoostWeight: settings.combinedBoostWeight,
        embeddingSource: settings.embeddingSource,
    };

    return {
        recentContext,
        userMessages,
        chatLength: chat.length,
        primaryCharacter,
        activeCharacters: getActiveCharacters(),
        headerName: isGroupChat ? povCharacters[0] : 'Scene',
        finalTokens: settings.retrievalFinalTokens,
        worldContextBudget: settings.worldContextBudget,
        graphNodes: data?.graph?.nodes || {},
        graphEdges: data?.graph?.edges || {},
        allAvailableMemories: data?.[MEMORIES_KEY] || [],
        idfCache: data?.idf_cache || null,
        queryConfig,      // ADD
        scoringConfig,    // ADD
    };
```

- [ ] Step 2: Run retrieval pipeline tests

Run: `npx vitest tests/retrieval/ --run`
Expected: All tests PASS

- [ ] Step 3: Run full test suite

Run: `npm run test:run`
Expected: All tests PASS

- [ ] Step 4: Commit retrieval pipeline refactoring

```bash
git add src/retrieval/query-context.js src/retrieval/scoring.js src/retrieval/retrieve.js tests/query-context.test.js tests/retrieval/scoring.test.js && git commit -m "$(cat <<'EOF'
refactor(retrieval): inject settings via context objects

Remove getDeps().getExtensionSettings() from query-context.js and
scoring.js. Settings are now built in retrieve.js:buildRetrievalContext()
and delivered via ctx.queryConfig and ctx.scoringConfig.
EOF
)"
```

---

### Task 6: Refactor embeddings.js strategy methods

**Files:**
- Modify: `src/embeddings.js`

- [ ] Step 1: Update `TransformersStrategy.getQueryEmbedding` to accept `prefix` param

```js
// BEFORE
async getQueryEmbedding(text, { signal } = {}) {
    const settings = getDeps().getExtensionSettings()[extensionName];
    const prefix = settings.embeddingQueryPrefix;
    return this.#embed(text, prefix, { signal });
}

// AFTER
async getQueryEmbedding(text, { signal, prefix = '' } = {}) {
    return this.#embed(text, prefix, { signal });
}
```

- [ ] Step 2: Update `TransformersStrategy.getDocumentEmbedding` to accept `prefix` param

```js
// BEFORE
async getDocumentEmbedding(text, { signal } = {}) {
    const settings = getDeps().getExtensionSettings()[extensionName];
    const prefix = settings.embeddingDocPrefix;
    return this.#embed(text, prefix, { signal });
}

// AFTER
async getDocumentEmbedding(text, { signal, prefix = '' } = {}) {
    return this.#embed(text, prefix, { signal });
}
```

- [ ] Step 3: Update `OllamaStrategy.getEmbedding` to accept `url`/`model` params

```js
// BEFORE
async getEmbedding(text, { signal } = {}) {
    const { url, model } = this.#getSettings();

// AFTER
async getEmbedding(text, { signal, url, model } = {}) {
    // #getSettings() no longer called here — url/model injected by wrapper
```

- [ ] Step 4: Update `OllamaStrategy.getQueryEmbedding` and `getDocumentEmbedding` to forward params

```js
// BEFORE
async getQueryEmbedding(text, { signal } = {}) {
    return this.getEmbedding(text, { signal });
}
async getDocumentEmbedding(text, { signal } = {}) {
    return this.getEmbedding(text, { signal });
}

// AFTER
async getQueryEmbedding(text, options = {}) {
    return this.getEmbedding(text, options);
}
async getDocumentEmbedding(text, options = {}) {
    return this.getEmbedding(text, options);
}
```

Note: `#getSettings()` is kept — `isEnabled()` and `getStatus()` still use it. Only embedding methods are decoupled.

- [ ] Step 5: Update wrapper `getQueryEmbedding` to pass settings to strategy

```js
// BEFORE (the strategy call at the end):
    const result = await strategy.getQueryEmbedding(text, { signal });

// AFTER:
    const result = await strategy.getQueryEmbedding(text, {
        signal,
        prefix: settings.embeddingQueryPrefix,
        url: settings.ollamaUrl,
        model: settings.embeddingModel,
    });
```

- [ ] Step 6: Update wrapper `getDocumentEmbedding` to pass settings to strategy

```js
// BEFORE:
    const result = await strategy.getDocumentEmbedding(summary, { signal });

// AFTER:
    const result = await strategy.getDocumentEmbedding(summary, {
        signal,
        prefix: settings.embeddingDocPrefix,
        url: settings.ollamaUrl,
        model: settings.embeddingModel,
    });
```

- [ ] Step 7: Update `generateEmbeddingsForMemories` strategy call

```js
// BEFORE:
    const embeddings = await processInBatches(validMemories, 5, async (m) => {
        return strategy.getDocumentEmbedding(m.summary, { signal });
    });

// AFTER:
    const embeddings = await processInBatches(validMemories, 5, async (m) => {
        return strategy.getDocumentEmbedding(m.summary, {
            signal,
            prefix: settings.embeddingDocPrefix,
            url: settings.ollamaUrl,
            model: settings.embeddingModel,
        });
    });
```

- [ ] Step 8: Update `enrichEventsWithEmbeddings` strategy call

```js
// BEFORE:
        return strategy.getDocumentEmbedding(e.summary, { signal });

// AFTER:
        return strategy.getDocumentEmbedding(e.summary, {
            signal,
            prefix: settings.embeddingDocPrefix,
            url: settings.ollamaUrl,
            model: settings.embeddingModel,
        });
```

- [ ] Step 9: Update `backfillAllEmbeddings` node embedding call

In the node embeddings section (inside the `if (nodes.length > 0)` block):

```js
// BEFORE:
    const nodeEmbeddings = await processInBatches(nodes, 5, async (n) => {
        return strategy.getDocumentEmbedding(`${n.type}: ${n.name} - ${n.description}`, { signal });
    });

// AFTER:
    const nodeEmbeddings = await processInBatches(nodes, 5, async (n) => {
        return strategy.getDocumentEmbedding(`${n.type}: ${n.name} - ${n.description}`, {
            signal,
            prefix: settings.embeddingDocPrefix,
            url: settings.ollamaUrl,
            model: settings.embeddingModel,
        });
    });
```

- [ ] Step 10: Run embedding tests

Run: `npx vitest tests/embeddings.test.js --run`
Expected: All tests PASS (wrapper tests still mock getDeps; strategy tests mock strategy methods)

---

### Task 7: Update embeddings.test.js and commit

**Files:**
- Modify: `tests/embeddings.test.js`

- [ ] Step 1: Add a strategy-level test for `OllamaStrategy` with injected params

Add a new `describe` block verifying the strategy works with injected url/model (no getDeps mock needed):

```js
describe('OllamaStrategy with injected params', () => {
    it('uses injected url and model instead of getDeps', async () => {
        const fetchSpy = vi.fn(async () => ({
            ok: true,
            json: async () => ({ embedding: [0.1, 0.2] }),
        }));

        const depsModule = await import('../src/deps.js');
        vi.spyOn(depsModule, 'getDeps').mockReturnValue({ fetch: fetchSpy });

        const { getStrategy } = await import('../src/embeddings.js');
        const strategy = getStrategy('ollama');
        const result = await strategy.getEmbedding('test text', {
            url: 'http://injected:11434',
            model: 'injected-model',
        });

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const fetchUrl = fetchSpy.mock.calls[0][0];
        expect(fetchUrl).toBe('http://injected:11434/api/embeddings');
        const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
        expect(body.model).toBe('injected-model');
        expect(result).toBeInstanceOf(Float32Array);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });
});
```

- [ ] Step 2: Run embedding tests

Run: `npx vitest tests/embeddings.test.js --run`
Expected: All tests PASS

- [ ] Step 3: Commit embeddings refactoring

```bash
git add src/embeddings.js tests/embeddings.test.js && git commit -m "$(cat <<'EOF'
refactor(embeddings): inject settings into strategy methods

Strategy classes now accept prefix/url/model as method params instead of
reading getDeps() internally. Wrapper functions remain the getDeps
boundary and pass settings down.
EOF
)"
```

---

### Task 8: Refactor llm.js

**Files:**
- Modify: `src/llm.js`

- [ ] Step 1: Accept optional `profileId` and `backupProfileId` in options

In `callLLM`, change the profile resolution logic:

```js
// BEFORE
    let profileId = settings[profileSettingKey];

// AFTER
    let profileId = options.profileId ?? settings[profileSettingKey];
```

```js
// BEFORE
        const backupProfileId = settings.backupProfile;

// AFTER
        const backupProfileId = options.backupProfileId ?? settings.backupProfile;
```

That's it — two lines changed. The fallback to `getDeps()` is preserved via `settings[profileSettingKey]` and `settings.backupProfile`.

- [ ] Step 2: Run llm tests to verify backward compat

Run: `npx vitest tests/llm.test.js --run`
Expected: All 13 tests PASS (existing tests don't pass profileId — fallback kicks in)

---

### Task 9: Update llm.test.js and commit

**Files:**
- Modify: `tests/llm.test.js`

- [ ] Step 1: Add test for explicit `profileId` override

Inside the `callLLM backup profile failover` describe, add:

```js
    it('uses explicitly passed profileId over settings', async () => {
        const sendRequest = vi.fn().mockResolvedValue({ content: 'explicit-ok' });
        setupTestContext({
            settings: { extractionProfile: 'settings-id' },
            deps: { connectionManager: { sendRequest } },
        });

        const result = await callLLM(testMessages, testConfig, { profileId: 'explicit-id' });
        expect(result).toBe('explicit-ok');
        expect(sendRequest.mock.calls[0][0]).toBe('explicit-id');
    });

    it('uses explicitly passed backupProfileId over settings', async () => {
        const sendRequest = vi
            .fn()
            .mockRejectedValueOnce(new Error('main down'))
            .mockResolvedValueOnce({ content: 'backup-ok' });
        setupTestContext({
            settings: { extractionProfile: 'main-id', backupProfile: 'settings-backup' },
            deps: { connectionManager: { sendRequest } },
        });

        const result = await callLLM(testMessages, testConfig, {
            backupProfileId: 'explicit-backup',
        });
        expect(result).toBe('backup-ok');
        expect(sendRequest.mock.calls[1][0]).toBe('explicit-backup');
    });
```

- [ ] Step 2: Run llm tests

Run: `npx vitest tests/llm.test.js --run`
Expected: All 15 tests PASS

- [ ] Step 3: Commit llm refactoring

```bash
git add src/llm.js tests/llm.test.js && git commit -m "$(cat <<'EOF'
refactor(llm): accept optional profileId in callLLM options

callLLM now accepts explicit profileId and backupProfileId via the
options param, with fallback to getDeps() settings read. Enables
incremental decoupling of callers from settings access.
EOF
)"
```

---

### Task 10: Final verification

- [ ] Step 1: Run full test suite

Run: `npm run test:run`
Expected: All tests PASS

- [ ] Step 2: Verify getDeps removal

Run: `grep -n "getDeps" src/retrieval/query-context.js src/retrieval/scoring.js`
Expected: No matches (zero getDeps calls in these files)

Run: `grep -c "getDeps" src/embeddings.js`
Expected: Count reduced (moved from strategies to wrappers)

Run: `grep -n "getScoringParams\|getQueryContextSettings" src/retrieval/scoring.js src/retrieval/query-context.js`
Expected: No matches (deleted functions)

- [ ] Step 3: Verify Biome lint passes

Run: `npx biome check src/retrieval/query-context.js src/retrieval/scoring.js src/retrieval/retrieve.js src/embeddings.js src/llm.js`
Expected: No errors (pre-commit hook would catch this, but good to verify)
