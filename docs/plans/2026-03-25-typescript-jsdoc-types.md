# TypeScript JSDoc Types Implementation Plan

**Goal:** Enable TypeScript-level type checking via `// @ts-check` in `math.js`, `scoring.js`, and `extract.js` without a build step.

**Architecture:** Centralized type definitions in `src/types.js` imported via JSDoc's `import()` syntax. Pure comment-based types with zero runtime impact.

**Tech Stack:** Vanilla JavaScript, JSDoc, VS Code TypeScript server

---

## File Structure Overview

- **Create:** `src/types.js` - Centralized JSDoc type definitions (no runtime exports)
- **Modify:** `src/retrieval/math.js` - Add `@ts-check` and type annotations
- **Modify:** `src/retrieval/scoring.js` - Add `@ts-check` and type annotations
- **Modify:** `src/extraction/extract.js` - Add `@ts-check` and type annotations

---

### Task 1: Create Centralized Type Definitions

**Files:**
- Create: `src/types.js`

**Purpose:** Define all domain types in one place for JSDoc import across the codebase.

**Common Pitfalls:**
- This file must NOT export anything at runtime — it's purely for TypeScript consumption
- Use `@ts-check` at the top so VS Code validates the JSDoc syntax
- Optional properties use `[propertyName]` syntax in JSDoc

- [ ] Step 1: Create `src/types.js` with all domain typedefs

```javascript
// @ts-check

/**
 * Core memory object stored in chatMetadata.openvault.memories
 * @typedef {Object} Memory
 * @property {string} id - Unique identifier (cyrb53 hash)
 * @property {string} summary - Human-readable event description
 * @property {number} importance - 1-5 scale, affects forgetfulness curve
 * @property {number[]} [embedding] - Vector embedding for similarity search
 * @property {number} message_id - Source message sequence number
 * @property {number} timestamp - Unix timestamp
 * @property {string[]} [witnesses] - Character names present
 * @property {string} [type] - 'event' | 'reflection' | 'global_synthesis'
 * @property {number} [level] - Reflection level (1-3) for decay calculation
 * @property {string[]} tokens - Pre-computed BM25 stem tokens
 * @property {number[]} [message_ids] - Multiple message IDs for merged memories
 * @property {number} [mentions] - How many times this memory was mentioned
 * @property {number} [retrieval_hits] - Access counter for reinforcement
 * @property {boolean} [archived] - Whether memory is archived
 * @property {boolean} [_st_synced] - Sync status for ST Vector Storage
 * @property {number} [_proxyVectorScore] - Temporary proxy score from ST Vector
 */

/**
 * Knowledge graph entity
 * @typedef {Object} Entity
 * @property {string} key - Normalized unique key (lowercase, no possessives)
 * @property {string} name - Display name
 * @property {string} [description] - LLM-generated description
 * @property {string} [entityType] - 'character' | 'object' | 'location' | 'abstract'
 * @property {number} [firstSeen] - Message ID where first extracted
 * @property {number} [lastSeen] - Message ID where last mentioned
 * @property {string[]} [aliases] - Alternative names
 * @property {number[]} [embedding] - Vector representation
 * @property {boolean} [_st_synced]
 */

/**
 * Relationship between two entities
 * @typedef {Object} Relationship
 * @property {string} source - Source entity key
 * @property {string} target - Target entity key
 * @property {string} relation - Relationship type
 * @property {number} [strength] - 1-10 scale
 * @property {number} [firstSeen]
 * @property {number} [lastSeen]
 * @property {string} [description]
 * @property {boolean} [_st_synced]
 */

/**
 * Extracted event from LLM
 * @typedef {Object} ExtractedEvent
 * @property {string} summary
 * @property {number} importance - 1-5
 * @property {string[]} witnesses
 * @property {string} [mood] - Emotional tone
 * @property {string[]} [tags]
 * @property {string} [thinking] - LLM reasoning (stripped before storage)
 */

/**
 * Graph extraction result from LLM
 * @typedef {Object} GraphExtraction
 * @property {Array<{name: string, entityType: string, description: string}>} entities
 * @property {Array<{source: string, target: string, relation: string, description: string}>} relationships
 */

/**
 * Scored memory result
 * @typedef {Object} ScoredMemory
 * @property {Memory} memory
 * @property {number} score - Final computed score
 * @property {Object} breakdown - Score components
 * @property {number} breakdown.total
 * @property {number} breakdown.base
 * @property {number} breakdown.baseAfterFloor
 * @property {number} breakdown.recencyPenalty
 * @property {number} breakdown.vectorBonus
 * @property {number} breakdown.vectorSimilarity
 * @property {number} breakdown.bm25Bonus
 * @property {number} breakdown.bm25Score
 * @property {number} breakdown.distance
 * @property {number} breakdown.importance
 * @property {number} [breakdown.hitDamping]
 * @property {number} [breakdown.frequencyFactor]
 */

/**
 * BM25 calculation context
 * @typedef {Object} BM25Context
 * @property {Map<string, number>} idfMap - Term to IDF score
 * @property {number} avgDL - Average document length
 */

/**
 * Forgetfulness curve constants
 * @typedef {Object} ForgetfulnessConstants
 * @property {number} BASE_LAMBDA - Base decay rate
 * @property {number} IMPORTANCE_5_FLOOR - Floor for max importance memories
 * @property {number} reflectionDecayThreshold - Message distance for reflection penalty
 * @property {number} [reflectionLevelMultiplier] - Level decay divisor
 */

/**
 * Scoring settings
 * @typedef {Object} ScoringSettings
 * @property {number} vectorSimilarityThreshold - Cosine similarity cutoff
 * @property {number} alpha - Blend factor between BM25 and vector
 * @property {number} combinedBoostWeight - Weight for combined score
 */

/**
 * Scoring configuration (flat structure from settings)
 * @typedef {Object} ScoringConfig
 * @property {number} forgetfulnessBaseLambda
 * @property {number} forgetfulnessImportance5Floor
 * @property {number} reflectionDecayThreshold
 * @property {number} reflectionLevelMultiplier
 * @property {number} vectorSimilarityThreshold
 * @property {number} alpha
 * @property {number} combinedBoostWeight
 * @property {string} embeddingSource - 'local' | 'ollama' | 'st_vector'
 */

/**
 * Query context configuration
 * @typedef {Object} QueryConfig
 * @property {number} [contextWindowSize]
 * @property {number} [entityBoostWeight]
 * @property {number} [corpusGroundedBoost]
 * @property {number} [corpusNonGroundedBoost]
 * @property {number} [exactPhraseBoostWeight]
 */

/**
 * Retrieval context for scoring
 * @typedef {Object} RetrievalContext
 * @property {string} recentContext - Recent chat messages
 * @property {string} userMessages - Last 3 user messages for embedding
 * @property {string[]} activeCharacters - Characters in scene
 * @property {number} chatLength - Current message count
 * @property {number} finalTokens - Token budget
 * @property {ScoringConfig} scoringConfig
 * @property {QueryConfig} queryConfig
 * @property {Object} [graphNodes] - Entity graph nodes
 * @property {Object} [graphEdges] - Entity graph edges
 * @property {Memory[]} [allAvailableMemories] - All memories for IDF corpus
 * @property {Object} [idfCache] - Pre-computed IDF cache
 */

/**
 * ST Vector sync changes
 * @typedef {Object} StSyncChanges
 * @property {Array<{hash: number, text: string, item: Object}>} [toSync] - Items to upsert
 * @property {Array<{hash: number}>} [toDelete] - Items to remove
 */

/**
 * Extraction phase options
 * @typedef {Object} ExtractionOptions
 * @property {boolean} [isBackfill] - Skip Phase 2 enrichment
 * @property {boolean} [isEmergencyCut] - Enable cancellation
 * @property {boolean} [silent] - Suppress toast notifications
 * @property {AbortSignal} [abortSignal] - Cancellation signal
 * @property {function(number, number, number): void} [progressCallback] - Progress handler (batchNum, totalBatches, eventsCreated)
 * @property {function(): void} [onPhase2Start] - Phase 2 start callback
 */

/**
 * IDF cache object stored in chat metadata
 * @typedef {Object} IDFCache
 * @property {number} memoryCount - Corpus size when cache was built
 * @property {Object.<string, number>} idfMap - Serialized term -> IDF mapping
 * @property {number} avgDL - Average document length
 */
```

- [ ] Step 2: Verify JSDoc syntax with linter

Run: `npm run lint`
Expected: PASS (Biome validates JSDoc syntax)

- [ ] Step 3: Commit

```bash
git add src/types.js && git commit -m "feat(types): add centralized JSDoc type definitions"
```

---

### Task 2: Add Types to math.js

**Files:**
- Modify: `src/retrieval/math.js`

**Purpose:** Enable type checking for pure math functions with no DOM dependencies.

**Common Pitfalls:**
- `tokenize` returns `string[]` not `Array<string>` (use JSDoc primitive)
- `cosineSimilarity` accepts `Float32Array|number[]` — use union type
- Some functions return complex objects — document all properties

- [ ] Step 1: Add `@ts-check` and import typedefs at top of file

Insert at line 1 (before existing imports):

```javascript
// @ts-check

/** @typedef {import('../types.js').Memory} Memory */
/** @typedef {import('../types.js').ScoredMemory} ScoredMemory */
/** @typedef {import('../types.js').BM25Context} BM25Context */
/** @typedef {import('../types.js').ForgetfulnessConstants} ForgetfulnessConstants */
/** @typedef {import('../types.js').ScoringSettings} ScoringSettings */
/** @typedef {import('../types.js').IDFCache} IDFCache */
```

- [ ] Step 2: Enhance JSDoc for `tokenize` function

Replace existing JSDoc (lines 18-22):

```javascript
/**
 * Tokenize text into lowercase words, filtering stop words
 * @param {string} text - Text to tokenize
 * @returns {string[]} Array of tokens
 */
```

- [ ] Step 3: Enhance JSDoc for `hasExactPhrase` function

Replace existing JSDoc (lines 36-42):

```javascript
/**
 * Check if a memory contains an exact multi-word phrase (case-insensitive).
 * Normalizes whitespace and strips punctuation for matching.
 * @param {string} phrase - Multi-word phrase to find (must contain space)
 * @param {Memory} memory - Memory object with summary field
 * @returns {boolean} True if exact phrase found in memory
 */
```

- [ ] Step 4: Enhance JSDoc for `calculateIDF` function

Replace existing JSDoc (lines 59-64):

```javascript
/**
 * Calculate IDF scores and average document length for a corpus
 * @param {Memory[]} memories - Memories to analyze
 * @param {Map<number, string[]>} tokenizedMemories - Map of memory index to tokens
 * @returns {BM25Context} IDF map and average document length
 */
```

- [ ] Step 5: Enhance JSDoc for `adjustQueryTokensByIDF` function

Replace existing JSDoc (lines 89-96):

```javascript
/**
 * IDF-aware query token frequency adjustment.
 * Reduces repeated tokens proportional to their IDF to prevent corpus-common
 * entity tokens (e.g. main character name) from inflating scores.
 * @param {string[]} queryTokens - Original query tokens (may have repeats)
 * @param {Map<string, number>} idfMap - Precomputed IDF scores
 * @param {number} totalDocs - Total number of documents (memories)
 * @returns {string[]} Adjusted query tokens with TF scaled by IDF
 */
```

- [ ] Step 6: Enhance JSDoc for `bm25Score` function

Replace existing JSDoc (lines 126-134):

```javascript
/**
 * Calculate BM25 score for a document against a query
 * @param {string[]} queryTokens - Tokenized query
 * @param {string[]} docTokens - Tokenized document
 * @param {Map<string, number>} idfMap - Precomputed IDF scores
 * @param {number} avgDL - Average document length
 * @returns {number} BM25 score
 */
```

- [ ] Step 7: Enhance JSDoc for `cosineSimilarity` function

Replace existing JSDoc (lines 159-165):

```javascript
/**
 * Calculate cosine similarity between two vectors.
 * 4x loop-unrolled for performance on 384/768-dim typed arrays.
 * @param {Float32Array|number[]} vecA - First vector
 * @param {Float32Array|number[]} vecB - Second vector
 * @returns {number} Cosine similarity (0-1)
 */
```

- [ ] Step 8: Enhance JSDoc for `rankToProxyScore` function

Replace existing JSDoc (lines 207-214):

```javascript
/**
 * Convert ST rank position to a cosine similarity proxy.
 * ST results are pre-sorted by cosine similarity and pre-filtered by threshold.
 * @param {number} rank - 0-based rank position from ST results
 * @param {number} totalResults - Total number of results returned
 * @returns {number} Proxy score in [0.5, 1.0] range
 */
```

- [ ] Step 9: Enhance JSDoc for `calculateScore` function

Replace existing JSDoc (lines 221-233):

```javascript
/**
 * Calculate memory score based on forgetfulness curve, vector similarity, and BM25
 * @param {Memory} memory - Memory object with message_ids, importance, embedding
 * @param {Float32Array|null} contextEmbedding - Context embedding for similarity
 * @param {number} chatLength - Current chat length
 * @param {ForgetfulnessConstants} constants - Scoring constants
 * @param {ScoringSettings} settings - Scoring settings
 * @param {number} [bm25Score] - Precomputed BM25 score
 * @returns {ScoredMemory['breakdown']} Score breakdown object
 */
```

- [ ] Step 10: Enhance JSDoc for `scoreMemories` function

Replace existing JSDoc (lines 332-348):

```javascript
/**
 * Score and sort memories using forgetfulness curve + vector similarity + BM25
 * @param {Memory[]} memories - Memories to score
 * @param {Float32Array|null} contextEmbedding - Context embedding
 * @param {number} chatLength - Current chat length
 * @param {ForgetfulnessConstants} constants - Scoring constants
 * @param {ScoringSettings} settings - Scoring settings
 * @param {string|string[]} [queryTokens] - Query text or pre-tokenized array for BM25 scoring
 * @param {string[]} [characterNames] - Main character names to filter from query tokens (dynamic stopwords)
 * @param {Memory[]} [hiddenMemories] - Hidden memories for IDF corpus expansion
 * @param {IDFCache|null} [idfCache] - Pre-computed IDF cache from chatMetadata.openvault.idf_cache
 * @returns {Promise<ScoredMemory[]>} Scored and sorted memories
 */
```

- [ ] Step 11: Run tests to verify no regressions

Run: `npm run test:math`
Expected: PASS (all math tests pass)

- [ ] Step 12: Run linter to verify JSDoc syntax

Run: `npm run lint`
Expected: PASS

- [ ] Step 13: Commit

```bash
git add src/retrieval/math.js && git commit -m "feat(types): add @ts-check and JSDoc types to math.js"
```

---

### Task 3: Add Types to scoring.js

**Files:**
- Modify: `src/retrieval/scoring.js`

**Purpose:** Enable type checking for scoring orchestration layer.

**Common Pitfalls:**
- `scoringConfig` is the flat settings structure, not the nested `constants/settings` shape
- `RetrievalContext` has many optional properties from graphNodes/graphEdges
- Internal functions like `scoreMemoriesDirect` don't need export but need types

- [ ] Step 1: Add `@ts-check` and import typedefs at top of file

Insert at line 1 (before existing imports):

```javascript
// @ts-check

/** @typedef {import('../types.js').Memory} Memory */
/** @typedef {import('../types.js').ScoredMemory} ScoredMemory */
/** @typedef {import('../types.js').RetrievalContext} RetrievalContext */
/** @typedef {import('../types.js').ScoringConfig} ScoringConfig */
/** @typedef {import('../types.js').ForgetfulnessConstants} ForgetfulnessConstants */
/** @typedef {import('../types.js').ScoringSettings} ScoringSettings */
/** @typedef {import('../types.js').IDFCache} IDFCache */
```

- [ ] Step 2: Enhance JSDoc for `scoreMemoriesDirect` function

Replace existing JSDoc (lines 20-33):

```javascript
/**
 * Score memories (main-thread, async to allow yielding).
 * @param {Memory[]} memories - Memories to score
 * @param {number[]|null} contextEmbedding - Context embedding
 * @param {number} chatLength - Current chat length
 * @param {number} limit - Maximum results
 * @param {string|string[]} queryTokens - Query text or pre-tokenized array for BM25
 * @param {string[]} [characterNames] - Main character names to filter from query tokens
 * @param {Memory[]} [hiddenMemories] - Hidden memories for expanded corpus IDF
 * @param {IDFCache|null} [idfCache] - Pre-computed IDF cache
 * @param {ScoringConfig} scoringConfig - Flat scoring configuration from settings
 * @returns {Promise<{memories: Memory[], scoredResults: ScoredMemory[]}>}
 */
```

- [ ] Step 3: Enhance JSDoc for `selectRelevantMemoriesSimple` function

Replace existing JSDoc (lines 58-70):

```javascript
/**
 * Select relevant memories using forgetfulness curve scoring
 * @param {Memory[]} memories - Available memories
 * @param {RetrievalContext} ctx - Retrieval context object
 * @param {number} limit - Maximum memories to return
 * @param {Memory[]} [allHiddenMemories] - All hidden memories for IDF corpus
 * @param {IDFCache|null} [idfCache] - Pre-computed IDF cache
 * @returns {Promise<{memories: Memory[], scoredResults: ScoredMemory[]}>}
 */
```

- [ ] Step 4: Enhance JSDoc for `selectRelevantMemoriesWithST` function

Add new JSDoc before the function (around line 139):

```javascript
/**
 * Select relevant memories using ST Vector Storage + Alpha-Blend reranking.
 * Over-fetches from ST, assigns rank-position proxy scores, then feeds into scoreMemories.
 * @param {Memory[]} memories - Available memories
 * @param {RetrievalContext} ctx - Retrieval context object
 * @param {number} limit - Maximum memories to return
 * @param {Memory[]} allHiddenMemories - All hidden memories for IDF corpus
 * @param {IDFCache|null} idfCache - Pre-computed IDF cache
 * @param {Object} strategy - ST Vector strategy object with searchItems method
 * @returns {Promise<{memories: Memory[], scoredResults: ScoredMemory[]}>}
 */
```

- [ ] Step 5: Enhance JSDoc for `selectMemoriesWithSoftBalance` function

Replace existing JSDoc (lines 231-240):

```javascript
/**
 * Select memories using pre-allocated bucket quotas with score-based filling.
 * Pre-allocates minRepresentation per bucket first, then fills remainder by score.
 * @param {ScoredMemory[]} scoredMemories - Pre-scored, sorted
 * @param {number} tokenBudget - Maximum tokens to select
 * @param {number} chatLength - Current message length
 * @param {number} [minRepresentation=0.20] - Minimum 20% per bucket
 * @returns {Memory[]} Selected memories
 */
```

- [ ] Step 6: Enhance JSDoc for `selectRelevantMemories` function

Replace existing JSDoc (lines 301-313):

```javascript
/**
 * Select relevant memories using scoring and token budget
 * @param {Memory[]} memories - Available memories
 * @param {RetrievalContext} ctx - Retrieval context object
 * @returns {Promise<Memory[]>} Selected memories
 */
```

- [ ] Step 7: Run tests to verify no regressions

Run: `npm run test:run tests/retrieval/scoring.test.js`
Expected: PASS

- [ ] Step 8: Run linter

Run: `npm run lint`
Expected: PASS

- [ ] Step 9: Commit

```bash
git add src/retrieval/scoring.js && git commit -m "feat(types): add @ts-check and JSDoc types to scoring.js"
```

---

### Task 4: Add Types to extract.js

**Files:**
- Modify: `src/extraction/extract.js`

**Purpose:** Enable type checking for the complex extraction pipeline.

**Common Pitfalls:**
- This is the largest file — focus on exported functions and stage functions
- `ExtractionOptions` has many optional callbacks
- `StSyncChanges` is returned by several stage functions
- Stage functions are internal but complex — they need types

- [ ] Step 1: Add `@ts-check` and import typedefs at top of file

Insert at line 1 (before existing imports):

```javascript
// @ts-check

/** @typedef {import('../types.js').Memory} Memory */
/** @typedef {import('../types.js').Entity} Entity */
/** @typedef {import('../types.js').Relationship} Relationship */
/** @typedef {import('../types.js').ExtractedEvent} ExtractedEvent */
/** @typedef {import('../types.js').GraphExtraction} GraphExtraction */
/** @typedef {import('../types.js').StSyncChanges} StSyncChanges */
/** @typedef {import('../types.js').ExtractionOptions} ExtractionOptions */
```

- [ ] Step 2: Enhance JSDoc for `rpmDelay` function

Replace existing JSDoc (lines 64-70):

```javascript
/**
 * Wait based on the configured RPM rate limit.
 * Accounts for elapsed time since the last call — only sleeps the remaining delta.
 * @param {Object} settings - Extension settings containing backfillMaxRPM
 * @param {string} [label='Rate limit'] - Log label
 * @returns {Promise<void>}
 */
```

- [ ] Step 3: Enhance JSDoc for `applySyncChanges` function

Replace existing JSDoc (lines 82-86):

```javascript
/**
 * Apply ST Vector Storage sync changes from domain function return values.
 * Handles both sync (insert) and delete operations in bulk.
 * @param {StSyncChanges} stChanges
 * @returns {Promise<void>}
 */
```

- [ ] Step 4: Enhance JSDoc for `hideExtractedMessages` function

Replace existing JSDoc (lines 97-102):

```javascript
/**
 * Hide all extracted messages from LLM context by setting is_system=true.
 * Only hides messages that have been successfully processed (fingerprint in processed set).
 * @returns {Promise<number>} Number of messages hidden
 */
```

- [ ] Step 5: Enhance JSDoc for `executeEmergencyCut` function

Replace existing JSDoc (lines 112-126):

```javascript
/**
 * Execute an Emergency Cut — extract all unprocessed messages and hide them.
 * Domain orchestrator with callback injection for UI updates.
 * @param {Object} options
 * @param {function(string): void} [options.onWarning] - Called for non-fatal warnings
 * @param {function(string): boolean} [options.onConfirmPrompt] - Called for user confirmation; return false to cancel
 * @param {function(): void} [options.onStart] - Called when extraction phase begins
 * @param {function(number, number, number): void} [options.onProgress] - Called per batch (batchNum, totalBatches, eventsCreated)
 * @param {function({messagesProcessed: number, eventsCreated: number, hiddenCount: number}): void} [options.onComplete] - Called on success
 * @param {function(Error, boolean): void} [options.onError] - Called on failure (error, isCancel)
 * @param {AbortSignal} [options.abortSignal] - For cancellation
 * @returns {Promise<void>}
 */
```

- [ ] Step 6: Add JSDoc for `extractMemories` function (find and enhance)

Search for the function signature and replace its JSDoc. The function should be exported and take `(messages, targetChatId, options)`.

```javascript
/**
 * Extract memories from a batch of messages.
 * Phase 1: Events + Graph extraction (critical, gates UI)
 * Phase 2: Reflections + Communities (non-critical, deferred during backfill)
 * @param {Object[]} messages - Chat messages to extract from
 * @param {string|null} targetChatId - Target chat ID or null for current
 * @param {ExtractionOptions} [options] - Extraction options
 * @returns {Promise<{events: ExtractedEvent[], stChanges: StSyncChanges}>}
 */
```

- [ ] Step 7: Add JSDoc for Stage 1 function `fetchEventsFromLLM`

Find the function and add:

```javascript
/**
 * Stage 1: Fetch events from LLM.
 * @param {string} messagesText - Concatenated message text
 * @param {Object} contextParams - Context parameters
 * @param {string} contextParams.preamble
 * @param {string} contextParams.prefill
 * @param {string} contextParams.outputLanguage
 * @returns {Promise<{events: ExtractedEvent[]}>}
 */
```

- [ ] Step 8: Add JSDoc for Stage 2 function `fetchGraphFromLLM`

Find the function and add:

```javascript
/**
 * Stage 2: Fetch graph entities and relationships from LLM.
 * @param {string} messagesText - Concatenated message text
 * @param {ExtractedEvent[]} events - Events extracted in Stage 1
 * @param {Object} contextParams - Context parameters
 * @returns {Promise<GraphExtraction>}
 */
```

- [ ] Step 9: Add JSDoc for Stage 4 function `processGraphUpdates`

Find the function and add:

```javascript
/**
 * Stage 4: Process graph updates (entity upserts, relationship upserts).
 * @param {GraphExtraction} graphData - Graph extraction result
 * @param {Object} data - OpenVault data object
 * @returns {StSyncChanges} Sync changes for ST Vector
 */
```

- [ ] Step 10: Run tests to verify no regressions

Run: `npm run test:extract`
Expected: PASS

- [ ] Step 11: Run full test suite

Run: `npm run test`
Expected: PASS

- [ ] Step 12: Run linter

Run: `npm run lint`
Expected: PASS

- [ ] Step 13: Commit

```bash
git add src/extraction/extract.js && git commit -m "feat(types): add @ts-check and JSDoc types to extract.js"
```

---

### Task 5: Final Verification

**Files:**
- All modified files

**Purpose:** Ensure complete type safety across all three files.

- [ ] Step 1: Verify `@ts-check` presence in all target files

Run: `git diff --name-only`
Expected: Shows `src/types.js`, `src/retrieval/math.js`, `src/retrieval/scoring.js`, `src/extraction/extract.js`

- [ ] Step 2: Run full test suite

Run: `npm run test`
Expected: PASS (all tests pass)

- [ ] Step 3: Run linter with auto-fix

Run: `npm run lint`
Expected: PASS (no JSDoc syntax errors)

- [ ] Step 4: Verify VS Code type checking (manual check)

Open in VS Code:
1. Open `src/retrieval/math.js` — verify no red squiggles
2. Open `src/retrieval/scoring.js` — verify no red squiggles
3. Open `src/extraction/extract.js` — verify no red squiggles
4. Hover over `Memory` type — verify IntelliSense shows properties
5. Type `const m = { id: 'test' }; m.summry` — verify error on typo

- [ ] Step 5: Commit design and plan documents

```bash
git add docs/designs/ docs/plans/ && git commit -m "docs: add TypeScript JSDoc types design and plan"
```

---

### Task 6: Run Biome Full Unsafe Format

**Files:**
- All modified files

**Purpose:** Apply aggressive Biome formatting including JSDoc normalization.

**Common Pitfalls:**
- `--unsafe` flag is required for JSDoc formatting fixes
- Run this AFTER all files are committed so you can review changes
- May reformat JSDoc parameter alignment

- [ ] Step 1: Run Biome with unsafe flag

Run: `npm run lint:fix`
Expected: Biome reformats JSDoc comments, fixes indentation, normalizes parameter descriptions

- [ ] Step 2: Review changes

Run: `git diff`
Expected: JSDoc formatting improvements (parameter alignment, description wrapping)

- [ ] Step 3: Run tests to ensure no functional changes

Run: `npm run test`
Expected: PASS (formatting only, no logic changes)

- [ ] Step 4: Commit formatting changes

```bash
git add -A && git commit -m "style: apply biome unsafe formatting to JSDoc types"
```

---

## Success Criteria

- [ ] `// @ts-check` present in `src/retrieval/math.js`
- [ ] `// @ts-check` present in `src/retrieval/scoring.js`
- [ ] `// @ts-check` present in `src/extraction/extract.js`
- [ ] `src/types.js` created with all domain typedefs
- [ ] VS Code shows IntelliSense for `Memory`, `Entity`, `ScoredMemory`
- [ ] Property access typos show red underline in VS Code
- [ ] `npm run test` passes
- [ ] `npm run lint` passes
- [ ] No runtime dependencies added

---

## Post-Implementation Notes

After completing this plan:
1. Types are available for import in other files: `/** @typedef {import('./types.js').Memory} Memory */`
2. Future files can add `@ts-check` and import types as needed
3. Consider adding types to `src/graph/graph.js` next (uses Entity types heavily)
4. Consider adding types to `src/store/chat-data.js` (repository pattern)
