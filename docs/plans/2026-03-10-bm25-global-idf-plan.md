# Implementation Plan - BM25 Global IDF Calculation

> **Reference:** `docs/designs/2026-03-10-bm25-global-idf-design.md`
> **Execution:** Use `executing-plans` skill.

## Overview

This plan implements BM25 IDF calculation using an expanded corpus (candidate + hidden memories) instead of just candidate memories. This prevents common terms from receiving artificially high IDF scores.

**Files Modified:**
- `src/retrieval/math.js` - Core scoring logic
- `src/retrieval/scoring.js` - Selection pipeline
- `src/retrieval/retrieve.js` - Context building

**No Schema Changes:** Fully backward compatible.

---

## Task 1: Unit Test - Expanded Corpus IDF Calculation

**Goal:** Verify that calculateIDF correctly uses an expanded corpus including hidden memories.

**Step 1: Write the Failing Test**
- File: `tests/retrieval/math.test.js`
- Code:

```javascript
describe('calculateIDF with expanded corpus', () => {
    it('should calculate lower IDF for common terms when hidden memories included', () => {
        const { tokenize, calculateIDF } = await import('../../src/retrieval/math.js');

        const candidates = [
            { summary: 'Suzy fought bravely' },
            { summary: 'The kingdom is at peace' }
        ];
        const hidden = [
            { summary: 'Suzy visited the castle' },
            { summary: 'Suzy met the king' },
            { summary: 'The king declared war' }
        ];

        // Tokenize all memories
        const tokenizedCandidates = candidates.map((m, i) => [i, tokenize(m.summary)]);
        const tokenizedHidden = hidden.map((m, i) => [i + candidates.length, tokenize(m.summary)]);

        // Calculate IDF with expanded corpus (candidates + hidden)
        const { idfMap: expandedIdf } = calculateIDF(
            [...candidates, ...hidden],
            new Map([...tokenizedCandidates, ...tokenizedHidden])
        );

        // Calculate IDF with candidates only
        const { idfMap: candidatesOnlyIdf } = calculateIDF(
            candidates,
            new Map(tokenizedCandidates)
        );

        // "suzy" appears in 3/5 = 60% of expanded corpus vs 1/2 = 50% of candidates only
        // Expanded corpus should have LOWER IDF for "suzy" (more common in broader context)
        const suzyExpandedIdf = expandedIdf.get('suzy') ?? 0;
        const suzyCandidatesOnlyIdf = candidatesOnlyIdf.get('suzy') ?? 0;

        expect(suzyExpandedIdf).toBeLessThan(suzyCandidatesOnlyIdf);
    });

    it('should handle empty hidden memories array', () => {
        const { tokenize, calculateIDF } = await import('../../src/retrieval/math.js');

        const candidates = [
            { summary: 'Suzy fought bravely' },
            { summary: 'The kingdom is at peace' }
        ];

        const tokenized = new Map(candidates.map((m, i) => [i, tokenize(m.summary)]));
        const { idfMap } = calculateIDF(candidates, tokenized);

        expect(idfMap.size).toBeGreaterThan(0);
    });
});
```

**Step 2: Run Test (Red)**
- Command: `npm test tests/retrieval/math.test.js`
- Expect: Tests fail because `calculateIDF` already works but we're verifying baseline behavior

**Step 3: Verify Baseline (Green)**
- Command: `npm test tests/retrieval/math.test.js`
- Expect: PASS (calculateIDF already handles expanded corpus correctly)

**Step 4: Git Commit**
- Command: `git add tests/retrieval/math.test.js && git commit -m "test: add unit tests for expanded corpus IDF calculation"`

---

## Task 2: Add `hiddenMemories` Parameter to `scoreMemories()`

**Goal:** Add optional `hiddenMemories` parameter to scoring function and expand IDF corpus.

**Step 1: Update Function Signature**
- File: `src/retrieval/math.js`
- Find: `export async function scoreMemories(` at line ~225
- Action: Add `hiddenMemories = []` parameter after `characterNames = []`
- Change:

```javascript
export async function scoreMemories(
    memories,
    contextEmbedding,
    chatLength,
    constants,
    settings,
    queryTokens,
    characterNames = [],
    hiddenMemories = []    // NEW: Optional hidden memories for IDF
) {
```

**Step 2: Build Expanded Corpus**
- File: `src/retrieval/math.js`
- Find: Inside `scoreMemories()`, after `const start = performance.now();` (~line 245)
- Action: Add corpus building logic before `if (queryTokens)` block
- Add:

```javascript
    const start = performance.now();

    // Build corpus: candidates + hidden (if provided)
    const idfCorpus = hiddenMemories.length > 0
        ? [...memories, ...hiddenMemories]
        : memories;

    // Precompute BM25 data if query tokens provided
```

**Step 3: Update Tokenization to Use Expanded Corpus**
- File: `src/retrieval/math.js`
- Find: Inside `if (tokens.length > 0)` block, the line `memoryTokensList = memories.map(...)` (~line 270)
- Replace the entire tokenization block:

```javascript
        if (tokens.length > 0) {
            // Tokenize ALL memories in corpus (candidates + hidden)
            const corpusMemoryTokens = idfCorpus.map((m) => m.tokens || tokenize(m.summary || ''));

            // Calculate IDF from expanded corpus
            const tokenizedMap = new Map(corpusMemoryTokens.map((t, i) => [i, t]));
            const idfData = calculateIDF(idfCorpus, tokenizedMap);
            idfMap = idfData.idfMap;
            avgDL = idfData.avgDL;

            // Only score candidate memories (not hidden ones)
            memoryTokensList = corpusMemoryTokens.slice(0, memories.length);

            // IDF-aware query TF adjustment (existing)
            tokens = adjustQueryTokensByIDF(tokens, idfMap, idfCorpus.length);
        }
```

**Step 4: Run Tests**
- Command: `npm test tests/retrieval/math.test.js`
- Expect: PASS

**Step 5: Git Commit**
- Command: `git add src/retrieval/math.js && git commit -m "feat(math): add hiddenMemories parameter for expanded IDF corpus"`

---

## Task 3: Update `scoreMemoriesDirect()` to Pass Hidden Memories

**Goal:** Thread the `hiddenMemories` parameter through the scoring pipeline.

**Step 1: Update Function Signature**
- File: `src/retrieval/scoring.js`
- Find: `async function scoreMemoriesDirect(` at line ~35
- Action: Add `hiddenMemories = []` parameter
- Change:

```javascript
async function scoreMemoriesDirect(
    memories,
    contextEmbedding,
    chatLength,
    limit,
    queryTokens,
    characterNames = [],
    hiddenMemories = []  // NEW: Optional parameter
) {
```

**Step 2: Pass Through to scoreMemories**
- File: `src/retrieval/scoring.js`
- Find: `const scored = await scoreMemories(` call within `scoreMemoriesDirect()` (~line 42)
- Action: Add `hiddenMemories` argument
- Change:

```javascript
    const scored = await scoreMemories(
        memories,
        contextEmbedding,
        chatLength,
        constants,
        settings,
        queryTokens,
        characterNames,
        hiddenMemories  // NEW: Pass through
    );
```

**Step 3: Run Tests**
- Command: `npm test tests/retrieval/`
- Expect: PASS

**Step 4: Git Commit**
- Command: `git add src/retrieval/scoring.js && git commit -m "feat(scoring): thread hiddenMemories through scoreMemoriesDirect"`

---

## Task 4: Update `selectRelevantMemoriesSimple()` to Pass Hidden Memories

**Goal:** Update the intermediate function to accept and pass hidden memories.

**Step 1: Update Function Signature**
- File: `src/retrieval/scoring.js`
- Find: `async function selectRelevantMemoriesSimple(` at line ~70
- Action: Add `allHiddenMemories = []` parameter at the end
- Change:

```javascript
async function selectRelevantMemoriesSimple(memories, ctx, limit, allHiddenMemories = []) {
```

**Step 2: Pass to scoreMemoriesDirect**
- File: `src/retrieval/scoring.js`
- Find: `return scoreMemoriesDirect(` call within `selectRelevantMemoriesSimple()` (~line 100)
- Action: Add `allHiddenMemories` argument
- Change:

```javascript
    return scoreMemoriesDirect(
        memories,
        contextEmbedding,
        chatLength,
        limit,
        bm25Tokens,
        activeCharacters || [],
        allHiddenMemories  // NEW: Pass hidden memories for IDF
    );
```

**Step 3: Run Tests**
- Command: `npm test tests/retrieval/`
- Expect: PASS

**Step 4: Git Commit**
- Command: `git add src/retrieval/scoring.js && git commit -m "feat(scoring): pass hiddenMemories through selectRelevantMemoriesSimple"`

---

## Task 5: Update `selectRelevantMemories()` to Extract Hidden Memories

**Goal:** Extract hidden memories from context and pass them to IDF calculation.

**Step 1: Extract Hidden Memories from Context**
- File: `src/retrieval/scoring.js`
- Find: `export async function selectRelevantMemories(` at line ~115
- Find: `const { finalTokens } = ctx;` line (~line 120)
- Action: Add hidden memory extraction after that line
- Add:

```javascript
    const activeMemories = memories.filter((m) => !m.archived);
    const { finalTokens } = ctx;

    // Build hidden memories set (all memories - candidates)
    const candidateIds = new Set(activeMemories.map((m) => m.id));
    const hiddenMemories = (ctx.allAvailableMemories || [])
        .filter((m) => !m.archived && !candidateIds.has(m.id));
```

**Step 2: Pass Hidden Memories Down**
- File: `src/retrieval/scoring.js`
- Find: `const { memories: scoredMemories, scoredResults } = await selectRelevantMemoriesSimple(` (~line 125)
- Action: Add `hiddenMemories` argument
- Change:

```javascript
    const { memories: scoredMemories, scoredResults } = await selectRelevantMemoriesSimple(
        activeMemories,
        ctx,
        1000,
        hiddenMemories  // NEW: Pass for IDF calculation
    );
```

**Step 3: Run Tests**
- Command: `npm test tests/retrieval/`
- Expect: PASS

**Step 4: Git Commit**
- Command: `git add src/retrieval/scoring.js && git commit -m "feat(scoring): extract and pass hidden memories for IDF calculation"`

---

## Task 6: Update `buildRetrievalContext()` to Include All Memories

**Goal:** Populate `allAvailableMemories` in the retrieval context.

**Step 1: Import MEMORIES_KEY**
- File: `src/retrieval/retrieve.js`
- Find: Import section at top of file
- Verify: `import { CHARACTERS_KEY, extensionName, MEMORIES_KEY } from '../constants.js';` exists
- If not present, add `MEMORIES_KEY` to the import

**Step 2: Add allAvailableMemories to Context**
- File: `src/retrieval/retrieve.js`
- Find: `export function buildRetrievalContext(` at line ~115
- Find: The return statement with all the context properties (~line 145)
- Action: Add `allAvailableMemories` property before the closing `};`
- Change:

```javascript
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
        allAvailableMemories: data?.[MEMORIES_KEY] || [],  // NEW: Full memory list
    };
```

**Step 3: Run Tests**
- Command: `npm test tests/retrieval/`
- Expect: PASS

**Step 4: Git Commit**
- Command: `git add src/retrieval/retrieve.js && git commit -m "feat(retrieve): add allAvailableMemories to retrieval context"`

---

## Task 7: Integration Test - BM25 with Hidden Memory IDF

**Goal:** Verify that BM25 correctly ranks rare terms higher than common terms using expanded corpus.

**Step 1: Write the Integration Test**
- File: `tests/retrieval/scoring.integration.test.js` (create if doesn't exist)
- Code:

```javascript
import { describe, it, expect } from 'vitest';
import { scoreMemories } from '../../src/retrieval/math.js';

describe('BM25 retrieval with hidden memory IDF', () => {
    it('should rank rare terms higher than common terms using expanded corpus', async () => {
        // Setup: Create memories where "sword" is common, "excalibur" is rare
        const candidates = [
            { id: '1', summary: 'He drew his sword', message_ids: [1], importance: 3 },
            { id: '2', summary: 'The sword gleamed', message_ids: [2], importance: 3 },
            { id: '4', summary: 'He found Excalibur', message_ids: [4], importance: 3 },
        ];

        const hiddenMemories = [
            { id: '5', summary: 'His sword was heavy', message_ids: [5], importance: 3 },
            { id: '6', summary: 'Sword practice daily', message_ids: [6], importance: 3 },
        ];

        const queryTokens = ['sword', 'excalibur'];

        const constants = { BASE_LAMBDA: 0.05, IMPORTANCE_5_FLOOR: 1.0, reflectionDecayThreshold: 750 };
        const settings = { vectorSimilarityThreshold: 0.5, alpha: 0.5, combinedBoostWeight: 2.0 };

        // Score with hidden memories (expanded corpus)
        const withHidden = await scoreMemories(
            candidates,
            null,  // no context embedding
            10,    // chatLength
            constants,
            settings,
            queryTokens,
            [],    // no character names
            hiddenMemories
        );

        // Score without hidden memories (candidates only)
        const withoutHidden = await scoreMemories(
            candidates,
            null,
            10,
            constants,
            settings,
            queryTokens,
            [],
            []     // no hidden memories
        );

        // Find the "excalibur" memory results
        const excaliburWithHidden = withHidden.find(r => r.memory.id === '4');
        const excaliburWithoutHidden = withoutHidden.find(r => r.memory.id === '4');

        // With expanded corpus, "excalibur" should score higher relative to "sword"
        // because "sword" is now recognized as common (lower IDF)
        const swordWithHidden = withHidden.find(r => r.memory.id === '1');

        expect(excaliburWithHidden.breakdown.bm25Score).toBeGreaterThan(
            swordWithHidden.breakdown.bm25Score
        );

        // The relative advantage of "excalibur" over "sword" should be greater
        // with the expanded corpus
        const ratioWithHidden = excaliburWithHidden.breakdown.bm25Score /
                               (swordWithHidden.breakdown.bm25Score || 0.001);
        const ratioWithoutHidden = excaliburWithoutHidden.breakdown.bm25Score /
                                  (withoutHidden.find(r => r.memory.id === '1').breakdown.bm25Score || 0.001);

        expect(ratioWithHidden).toBeGreaterThan(ratioWithoutHidden);
    });

    it('should handle empty hidden memories gracefully', async () => {
        const memories = [
            { id: '1', summary: 'Test memory one', message_ids: [1], importance: 3 },
        ];

        const constants = { BASE_LAMBDA: 0.05, IMPORTANCE_5_FLOOR: 1.0, reflectionDecayThreshold: 750 };
        const settings = { vectorSimilarityThreshold: 0.5, alpha: 0.5, combinedBoostWeight: 2.0 };

        const result = await scoreMemories(
            memories,
            null,
            10,
            constants,
            settings,
            ['test'],
            [],
            []  // empty hidden memories
        );

        expect(result.length).toBe(1);
        expect(result[0].memory.id).toBe('1');
    });
});
```

**Step 2: Run Test (Red)**
- Command: `npm test tests/retrieval/scoring.integration.test.js`
- Expect: May fail initially, implement to pass

**Step 3: Verify Implementation (Green)**
- Command: `npm test tests/retrieval/scoring.integration.test.js`
- Expect: PASS

**Step 4: Git Commit**
- Command: `git add tests/retrieval/scoring.integration.test.js && git commit -m "test: add integration test for BM25 with expanded IDF corpus"`

---

## Task 8: Manual Verification

**Goal:** Verify the feature works in a real scenario.

**Step 1: Load Test Chat**
- Action: Start SillyTavern with a test chat that has 50+ messages
- Action: Trigger a memory extraction if needed
- Verify: Memories are stored in `chatMetadata.openvault.memories`

**Step 2: Check Debug Output**
- Action: Open browser DevTools Console
- Action: Trigger a context retrieval
- Verify: Check that `bm25TokenCount` and other debug values are logged

**Step 3: Compare Before/After (Optional)**
- Action: Temporarily revert Task 5 to skip hidden memory extraction
- Action: Compare BM25 scores for common vs rare terms
- Action: Re-apply changes
- Verify: Common terms receive lower BM25 bonus with expanded corpus

**Step 4: Final Git Commit**
- Command: `git add . && git commit -m "test: manual verification complete for BM25 global IDF"`

---

## Summary of Changes

After completing all tasks:

1. **`src/retrieval/math.js`**: Added `hiddenMemories` parameter to `scoreMemories()`, expanded IDF corpus
2. **`src/retrieval/scoring.js`**: Threaded `hiddenMemories` through the pipeline, extracted hidden from `allAvailableMemories`
3. **`src/retrieval/retrieve.js`**: Added `allAvailableMemories` to `RetrievalContext`
4. **`tests/retrieval/math.test.js`**: Added unit tests for expanded corpus
5. **`tests/retrieval/scoring.integration.test.js`**: Added integration test for rare vs common term ranking

**No schema changes** - fully backward compatible with existing chats.
