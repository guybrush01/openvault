# TypeScript-Style Type Safety Phase 3 - Utilities & Services Implementation Plan

**Goal:** Add `@ts-check` and JSDoc type coverage to 8 remaining utility and service files for comprehensive type safety at I/O boundaries and pure function layers.

**Architecture:** Add TypeScript type checking via JSDoc comments to utility and service modules. Uses shared typedefs in `src/types.js` for cross-file structures. No runtime impact — pure comments, no transpilation.

**Tech Stack:** JSDoc, TypeScript `@ts-check` directive, VS Code TypeScript server

---

### Task 1: Add New Type Definitions to src/types.js

**Files:**
- Modify: `src/types.js`
- Test: `npm run lint` (verify no syntax errors)

Add 6 new type definitions to the existing types file.

- [ ] Step 1: Add new typedefs to src/types.js

Insert at the end of `src/types.js`, before the `export {}` statement:

```javascript
/**
 * ST Vector Storage item for insert/sync operations
 * @typedef {Object} StVectorItem
 * @property {number} hash - Cyrb53 hash ID
 * @property {string} text - Text content (with optional OV_ID prefix)
 * @property {number} [index] - Optional index field
 */

/**
 * ST Vector Storage query result
 * @typedef {Object} StVectorQueryResult
 * @property {string} id - Extracted OpenVault ID or hash as string
 * @property {number} hash - Numeric hash
 * @property {string} text - Stored text content
 */

/**
 * LLM configuration preset for callLLM
 * @typedef {Object} LLMConfig
 * @property {string} profileSettingKey - Settings key for profile selection
 * @property {number} maxTokens - Maximum output tokens
 * @property {string} errorContext - Error message context
 * @property {number} timeoutMs - Request timeout in milliseconds
 * @property {function(): Object} [getJsonSchema] - Optional function returning Zod JSON schema
 */

/**
 * LLM call options
 * @typedef {Object} LLMCallOptions
 * @property {boolean} [structured] - Enable structured output with jsonSchema
 * @property {AbortSignal} [signal] - AbortSignal for cancellation
 * @property {string} [profileId] - Override profile ID
 * @property {string} [backupProfileId] - Backup profile for failover
 */

/**
 * Ladder Queue interface returned by createLadderQueue
 * @typedef {Object} LadderQueue
 * @property {<T>(taskFn: () => Promise<T>) => Promise<T>} add - Add task to queue
 * @property {function(): Promise<void>} onIdle - Promise resolving when queue is idle
 * @property {number} concurrency - Current concurrency level
 */

/**
 * CDN mirror function type
 * @typedef {function(string): string} CdnMirrorFn
 */
```

- [ ] Step 2: Run lint to verify no syntax errors

Run: `npm run lint`
Expected: No errors (Biome lints/formats automatically)

- [ ] Step 3: Commit

```bash
git add src/types.js && git commit -m "feat(types): add Phase 3 typedefs for utilities and services"
```

---

### Task 2: Add @ts-check to src/llm.js

**Files:**
- Modify: `src/llm.js`

Add `@ts-check` directive and type imports to the LLM service.

- [ ] Step 1: Add @ts-check directive to src/llm.js

Add at the very top of `src/llm.js`, after the file comment block and before the imports:

```javascript
// @ts-check
```

- [ ] Step 2: Add type imports after the existing imports

Add these lines after the import statements in `src/llm.js`:

```javascript
/** @typedef {import('./types.js').LLMConfig} LLMConfig */
/** @typedef {import('./types.js').LLMCallOptions} LLMCallOptions */
/** @typedef {import('./types.js').LLMMessages} LLMMessages */
```

- [ ] Step 3: Update JSDoc for raceAbort function

Replace the existing `raceAbort` JSDoc comment with:

```javascript
/**
 * Race a promise against an AbortSignal.
 * @template T
 * @param {Promise<T>} promise - The promise to race
 * @param {AbortSignal} signal - The signal to watch
 * @returns {Promise<T>} Resolves/rejects with the first to settle
 */
```

- [ ] Step 4: Update JSDoc for callLLM function

Replace the existing `callLLM` JSDoc comment with:

```javascript
/**
 * Call LLM with messages array
 * @param {LLMMessages} messages - Array of message objects
 * @param {LLMConfig} config - Request configuration from LLM_CONFIGS
 * @param {LLMCallOptions} [options] - Optional parameters
 * @returns {Promise<string>} The LLM response content
 * @throws {Error} If the LLM call fails or no profile is available
 */
```

- [ ] Step 5: Run lint to verify

Run: `npm run lint`
Expected: No errors

- [ ] Step 6: Commit

```bash
git add src/llm.js && git commit -m "feat(types): add @ts-check to LLM service"
```

---

### Task 3: Add @ts-check to src/services/st-vector.js

**Files:**
- Modify: `src/services/st-vector.js`

Add `@ts-check` directive and type imports to the ST Vector service.

- [ ] Step 1: Add @ts-check directive to src/services/st-vector.js

Add at the very top of `src/services/st-vector.js`, before the imports:

```javascript
// @ts-check
```

- [ ] Step 2: Add type imports after the existing imports

Add these lines after the import statements in `src/services/st-vector.js`:

```javascript
/** @typedef {import('../types.js').StVectorItem} StVectorItem */
/** @typedef {import('../types.js').StVectorQueryResult} StVectorQueryResult */
```

- [ ] Step 3: Update JSDoc for chatExists function

Replace the existing `chatExists` JSDoc comment with:

```javascript
/**
 * Check if a chat still exists in ST
 * @param {string} chatId
 * @returns {Promise<boolean>}
 */
```

- [ ] Step 4: Update JSDoc for getSTCollectionId function

Replace the existing `getSTCollectionId` JSDoc comment with:

```javascript
/**
 * Get the ST Vector Storage collection ID for the current chat.
 * Includes chat ID to prevent cross-chat data leakage.
 * @param {string} chatId - Current chat ID
 * @returns {string} Collection ID
 */
```

- [ ] Step 5: Update JSDoc for extractOvId function

Replace the existing `extractOvId` JSDoc comment with:

```javascript
/**
 * Extract OpenVault ID from ST text field with OV_ID prefix.
 * @param {string} text - Text like "[OV_ID:event_123] The actual text..."
 * @returns {string | null} Extracted ID or null
 */
```

- [ ] Step 6: Update JSDoc for getSourceApiUrl function

Replace the existing `getSourceApiUrl` JSDoc comment with:

```javascript
/**
 * Get the API URL for a local text-generation source, respecting alt endpoint override.
 * Mirrors ST's logic: use alt_endpoint_url if enabled, otherwise textCompletionSettings.server_urls.
 * @param {string} sourceType - The textgen source type key (e.g., 'ollama', 'llamacpp', 'vllm')
 * @returns {string | undefined} The API URL
 */
```

- [ ] Step 7: Update JSDoc for getSTVectorRequestBody function

Replace the existing `getSTVectorRequestBody` JSDoc comment with:

```javascript
/**
 * Get additional request body parameters based on the source.
 * Mirrors ST's getVectorsRequestBody function.
 * @param {string} source - The vector source
 * @returns {Object} Additional parameters for the request body
 */
```

- [ ] Step 8: Update JSDoc for getSTVectorSource function

Replace the existing `getSTVectorSource` JSDoc comment with:

```javascript
/**
 * Get the ST Vector Storage source from ST settings.
 * @returns {string} The configured source (e.g., 'openrouter', 'openai', 'ollama')
 */
```

- [ ] Step 9: Update JSDoc for isStVectorSource function

Replace the existing `isStVectorSource` JSDoc comment with:

```javascript
/**
 * Check if the current embedding source is ST Vector Storage.
 * @returns {boolean}
 */
```

- [ ] Step 10: Update JSDoc for syncItemsToST function

Replace the existing `syncItemsToST` JSDoc comment with:

```javascript
/**
 * Sync items to ST Vector Storage via /api/vector/insert.
 * @param {StVectorItem[]} items - Items to insert
 * @param {string} chatId - Current chat ID
 * @returns {Promise<boolean>} True if successful
 */
```

- [ ] Step 11: Update JSDoc for deleteItemsFromST function

Replace the existing `deleteItemsFromST` JSDoc comment with:

```javascript
/**
 * Delete items from ST Vector Storage via /api/vector/delete.
 * @param {number[]} hashes - Cyrb53 hashes to delete
 * @param {string} chatId - Current chat ID
 * @returns {Promise<boolean>} True if successful
 */
```

- [ ] Step 12: Update JSDoc for purgeSTCollection function

Replace the existing `purgeSTCollection` JSDoc comment with:

```javascript
/**
 * Purge entire ST Vector Storage collection.
 * @param {string} chatId - Current chat ID
 * @returns {Promise<boolean>} True if successful
 */
```

- [ ] Step 13: Update JSDoc for querySTVector function

Replace the existing `querySTVector` JSDoc comment with:

```javascript
/**
 * Query ST Vector Storage for similar items.
 * @param {string} searchText - Query text
 * @param {number} topK - Number of results
 * @param {number} threshold - Similarity threshold
 * @param {string} chatId - Current chat ID
 * @returns {Promise<StVectorQueryResult[]>} Results with extracted OV IDs
 */
```

- [ ] Step 14: Update JSDoc for _clearValidatedChatsCache function

Replace the existing `_clearValidatedChatsCache` JSDoc comment with:

```javascript
/**
 * Clear the validated chats cache. Used for testing.
 * @returns {void}
 */
```

- [ ] Step 15: Run lint to verify

Run: `npm run lint`
Expected: No errors

- [ ] Step 16: Commit

```bash
git add src/services/st-vector.js && git commit -m "feat(types): add @ts-check to ST Vector service"
```

---

### Task 4: Add @ts-check to src/utils/queue.js

**Files:**
- Modify: `src/utils/queue.js`

Add `@ts-check` directive and type imports to the ladder queue utility.

- [ ] Step 1: Add @ts-check directive to src/utils/queue.js

Add at the very top of `src/utils/queue.js`, after the file comment block and before the imports:

```javascript
// @ts-check
```

- [ ] Step 2: Add type import after the existing imports

Add these lines after the import statement in `src/utils/queue.js`:

```javascript
/** @typedef {import('../types.js').LadderQueue} LadderQueue */
```

- [ ] Step 3: Add generic type parameter to isRateLimitError JSDoc

Replace the existing `isRateLimitError` function with:

```javascript
/**
 * Detect rate-limit or timeout errors.
 * @param {Error} error
 * @returns {boolean}
 */
function isRateLimitError(error) {
    return error.status === 429 || error.message?.includes('429') || error.message?.includes('timeout');
}
```

- [ ] Step 4: Update JSDoc for createLadderQueue function

Replace the existing `createLadderQueue` JSDoc comment with:

```javascript
/**
 * Creates an AIMD-governed task queue.
 *
 * @param {number} [maxConcurrency=1] - Absolute ceiling for parallel tasks.
 *   Defaults to 1 (sequential) to protect local/VRAM-bound LLM users.
 * @returns {Promise<LadderQueue>}
 */
```

- [ ] Step 5: Run lint to verify

Run: `npm run lint`
Expected: No errors

- [ ] Step 6: Commit

```bash
git add src/utils/queue.js && git commit -m "feat(types): add @ts-check to ladder queue utility"
```

---

### Task 5: Add @ts-check to src/utils/cdn.js

**Files:**
- Modify: `src/utils/cdn.js`

Add `@ts-check` directive and type imports to the CDN import utility.

- [ ] Step 1: Add @ts-check directive to src/utils/cdn.js

Add at the very top of `src/utils/cdn.js`, after the file comment block and before the MIRRORS constant:

```javascript
// @ts-check
```

- [ ] Step 2: Add type import after @ts-check

Add this line after the `// @ts-check` directive:

```javascript
/** @typedef {import('../types.js').CdnMirrorFn} CdnMirrorFn */
```

- [ ] Step 3: Update MIRRORS constant type annotation

Replace the existing MIRRORS constant declaration with:

```javascript
/** @type {CdnMirrorFn[]} */
const MIRRORS = [
    (pkg) => `https://esm.sh/${pkg}`,
    (pkg) => `https://cdn.skypack.dev/${pkg}`,
    (pkg) => `https://esm.run/${pkg}`,
    (pkg) => `https://unpkg.com/${pkg}?module`, // ?module forces ESM mode
];
```

- [ ] Step 4: Update getTestOverrides JSDoc

Replace the existing `getTestOverrides` JSDoc comment with:

```javascript
/**
 * Test-only override map. Stored on globalThis to survive vi.resetModules().
 * @returns {Map<string, object>} The test overrides map
 */
```

- [ ] Step 5: Update _setTestOverride JSDoc

Replace the existing `_setTestOverride` JSDoc comment with:

```javascript
/**
 * Register a local module for a package spec (test-only).
 * Must be called from vitest setupFiles BEFORE source modules are imported.
 * @param {string} packageSpec
 * @param {object} mod - The module namespace object
 * @returns {void}
 */
```

- [ ] Step 6: Update cdnImport JSDoc

Replace the existing `cdnImport` JSDoc comment with:

```javascript
/**
 * Import an npm package from CDN with retry and mirror fallback.
 *
 * @param {string} packageSpec - Package specifier (e.g. 'zod', 'gpt-tokenizer/encoding/o200k_base')
 * @returns {Promise<object>} The resolved ES module namespace
 * @throws {Error} If all mirrors and retries are exhausted
 */
```

- [ ] Step 7: Run lint to verify

Run: `npm run lint`
Expected: No errors

- [ ] Step 8: Commit

```bash
git add src/utils/cdn.js && git commit -m "feat(types): add @ts-check to CDN import utility"
```

---

### Task 6: Add @ts-check to src/utils/embedding-codec.js

**Files:**
- Modify: `src/utils/embedding-codec.js`

Add `@ts-check` directive and type annotations to the embedding codec utility.

- [ ] Step 1: Add @ts-check directive to src/utils/embedding-codec.js

Add at the very top of `src/utils/embedding-codec.js`, after the file comment block and before the encode function:

```javascript
// @ts-check
```

- [ ] Step 2: Update encode function JSDoc

Replace the existing `encode` JSDoc comment with:

```javascript
/**
 * Encode a number array to a Base64 string via Float32Array.
 * @param {number[] | Float32Array} vec - Embedding vector
 * @returns {string} Base64-encoded string
 */
```

- [ ] Step 3: Update decode function JSDoc

Replace the existing `decode` JSDoc comment with:

```javascript
/**
 * Decode a Base64 string back to a Float32Array.
 * @param {string} b64 - Base64-encoded Float32Array
 * @returns {Float32Array} Decoded embedding vector
 */
```

- [ ] Step 4: Update getEmbedding function JSDoc

Replace the existing `getEmbedding` JSDoc comment with:

```javascript
/**
 * Read embedding from an object. Prefers Base64 format, falls back to legacy array.
 * @param {Record<string, any>} obj - Object with embedding_b64 or embedding property
 * @returns {Float32Array | null} Embedding vector or null
 */
```

- [ ] Step 5: Update setEmbedding function JSDoc

Replace the existing `setEmbedding` JSDoc comment with:

```javascript
/**
 * Write embedding to an object in Base64 format. Removes legacy key.
 * @param {Record<string, any>} obj - Target object (mutated)
 * @param {number[] | Float32Array} vec - Embedding vector
 * @returns {void}
 */
```

- [ ] Step 6: Update hasEmbedding function JSDoc

Replace the existing `hasEmbedding` JSDoc comment with:

```javascript
/**
 * Check if an object has an embedding (either format).
 * @param {Record<string, any>} obj - Object to check
 * @returns {boolean}
 */
```

- [ ] Step 7: Update deleteEmbedding function JSDoc

Replace the existing `deleteEmbedding` JSDoc comment with:

```javascript
/**
 * Remove embedding from an object (both formats).
 * @param {Record<string, any>} obj - Object to clean (mutated)
 * @returns {void}
 */
```

- [ ] Step 8: Update markStSynced function JSDoc

Replace the existing `markStSynced` JSDoc comment with:

```javascript
/**
 * Mark an object as synced to ST Vector Storage.
 * @param {Record<string, any>} obj - Object to mark
 * @returns {void}
 */
```

- [ ] Step 9: Update isStSynced function JSDoc

Replace the existing `isStSynced` JSDoc comment with:

```javascript
/**
 * Check if an object has been synced to ST Vector Storage.
 * @param {Record<string, any>} obj - Object to check
 * @returns {boolean}
 */
```

- [ ] Step 10: Update clearStSynced function JSDoc

Replace the existing `clearStSynced` JSDoc comment with:

```javascript
/**
 * Clear ST sync flag from an object.
 * @param {Record<string, any>} obj - Object to clear
 * @returns {void}
 */
```

- [ ] Step 11: Update cyrb53 function JSDoc

Replace the existing `cyrb53` JSDoc comment with:

```javascript
/**
 * Cyrb53 hash — 53-bit hash for ST Vector Storage compatibility.
 * Produces non-negative integer hashes safe for Vectra's numeric hash IDs.
 * @param {string} str - Input string
 * @param {number} [seed=0] - Optional seed
 * @returns {number} 53-bit positive integer hash
 */
```

- [ ] Step 12: Update export comment for _migrateEncodeBase64

Replace the existing export comment with:

```javascript
/**
 * Export encode as _migrateEncodeBase64 for migrations only.
 * The underscore prefix signals it's NOT part of the standard codec API.
 * Use setEmbedding() for normal operations — this is only for v1->v2 migration.
 * @param {number[] | Float32Array} vec - Embedding vector
 * @returns {string} Base64-encoded string
 */
```

And update the export line to:

```javascript
export {
    /** @param {number[] | Float32Array} vec */
    encode as _migrateEncodeBase64
};
```

- [ ] Step 13: Run lint to verify

Run: `npm run lint`
Expected: No errors

- [ ] Step 14: Commit

```bash
git add src/utils/embedding-codec.js && git commit -m "feat(types): add @ts-check to embedding codec utility"
```

---

### Task 7: Add @ts-check to src/utils/tokens.js

**Files:**
- Modify: `src/utils/tokens.js`

Add `@ts-check` directive and type annotations to the token counting utility.

- [ ] Step 1: Add @ts-check directive to src/utils/tokens.js

Add at the very top of `src/utils/tokens.js`, after the import statement:

```javascript
// @ts-check
```

- [ ] Step 2: Update countTokens JSDoc

Replace the existing `countTokens` function with proper JSDoc:

```javascript
/**
 * Count tokens in a text string using gpt-tokenizer.
 * @param {string} text - Input text
 * @returns {number} Token count
 */
export function countTokens(text) {
    return (text || '').length === 0 ? 0 : _countTokens(text);
}
```

- [ ] Step 3: Update clearTokenCache JSDoc

Replace the existing `clearTokenCache` function with proper JSDoc:

```javascript
/**
 * Clear the token cache. Call on CHAT_CHANGED.
 * @returns {void}
 */
export function clearTokenCache() {
    tokenCache.clear();
}
```

- [ ] Step 4: Update getMessageTokenCount JSDoc

Replace the existing `getMessageTokenCount` JSDoc comment with:

```javascript
/**
 * Get token count for a single message. Uses in-memory LRU cache.
 * @param {Array<{mes?: string}>} chat - Chat array
 * @param {number} index - Message index
 * @returns {number} Token count
 */
```

- [ ] Step 5: Update getTokenSum JSDoc

Replace the existing `getTokenSum` JSDoc comment with:

```javascript
/**
 * Sum token counts for a list of message indices.
 * @param {Array<{mes?: string}>} chat - Chat array
 * @param {number[]} indices - Message indices
 * @returns {number} Total tokens
 */
```

- [ ] Step 6: Update snapToTurnBoundary JSDoc

Replace the existing `snapToTurnBoundary` JSDoc comment with:

```javascript
/**
 * Snap a message index list to a valid turn boundary.
 * A split is valid when the last message is from Bot and the next message is from User,
 * or at end-of-chat. This prevents orphaning User messages from their Bot responses.
 * Trims backward until a valid boundary is found. Returns [] if none found.
 * @param {Array<{is_user?: boolean}>} chat - Full chat array
 * @param {number[]} messageIds - Ordered message indices to snap
 * @returns {number[]} Snapped message indices
 */
```

- [ ] Step 7: Run lint to verify

Run: `npm run lint`
Expected: No errors

- [ ] Step 8: Commit

```bash
git add src/utils/tokens.js && git commit -m "feat(types): add @ts-check to token counting utility"
```

---

### Task 8: Add @ts-check to src/utils/stemmer.js

**Files:**
- Modify: `src/utils/stemmer.js`

Add `@ts-check` directive and type annotations to the stemmer utility.

- [ ] Step 1: Add @ts-check directive to src/utils/stemmer.js

Add at the very top of `src/utils/stemmer.js`, after the import statement:

```javascript
// @ts-check
```

- [ ] Step 2: Add @ts-expect-error for CDN import

Add `@ts-expect-error` comment before the cdnImport call:

```javascript
// @ts-expect-error - No types available for CDN import
const { default: snowball } = await cdnImport('snowball-stemmers');
```

- [ ] Step 3: Update stemWord function JSDoc

Replace the existing `stemWord` JSDoc comment with:

```javascript
/**
 * Stem a word using the appropriate language stemmer based on script detection.
 * Cyrillic → Russian, Latin → English, other → unchanged.
 *
 * Includes an over-stem guard for Cyrillic: if Snowball's multi-pass stripping
 * removes more than 3 chars (e.g. елена → ел), falls back to removing just the
 * final character — structurally correct for Russian nominative -а/-я endings.
 * @param {string} word - Word to stem
 * @returns {string} Stemmed word
 */
```

- [ ] Step 4: Update stemName function JSDoc

Replace the existing `stemName` JSDoc comment with:

```javascript
/**
 * Stem a multi-word name into a Set of stems.
 * No stopword filtering — entity names should not be filtered.
 * @param {string} name - Entity name (e.g. "King Aldric")
 * @returns {Set<string>} Set of stems (e.g. {"king", "aldric"})
 */
```

- [ ] Step 5: Run lint to verify

Run: `npm run lint`
Expected: No errors

- [ ] Step 6: Commit

```bash
git add src/utils/stemmer.js && git commit -m "feat(types): add @ts-check to stemmer utility"
```

---

### Task 9: Add @ts-check to src/utils/transliterate.js

**Files:**
- Modify: `src/utils/transliterate.js`

Add `@ts-check` directive and type annotations to the transliterate utility.

- [ ] Step 1: Add @ts-check directive to src/utils/transliterate.js

Add at the very top of `src/utils/transliterate.js`, after the import statement:

```javascript
// @ts-check
```

- [ ] Step 2: Add @ts-expect-error for CDN import

Add `@ts-expect-error` comment before the cdnImport call:

```javascript
// @ts-expect-error - No types available for CDN import
const CyrillicToTranslit = (await cdnImport('cyrillic-to-translit-js')).default;
```

- [ ] Step 3: Update transliterateCyrToLat function JSDoc

Replace the existing `transliterateCyrToLat` JSDoc comment with:

```javascript
/**
 * Transliterate a Cyrillic string to Latin characters.
 * Non-Cyrillic characters pass through unchanged.
 * Result is always lowercased for key comparison.
 *
 * @param {string} str - Input string (may contain Cyrillic)
 * @returns {string} Lowercased Latin transliteration
 */
```

- [ ] Step 4: Update levenshteinDistance function JSDoc

Replace the existing `levenshteinDistance` JSDoc comment with:

```javascript
/**
 * Compute Levenshtein edit distance between two strings.
 * Standard O(n*m) dynamic programming implementation.
 *
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Edit distance
 */
```

- [ ] Step 5: Update resolveCharacterName function JSDoc

Replace the existing `resolveCharacterName` JSDoc comment with:

```javascript
/**
 * Resolve a character name against a list of known canonical names,
 * supporting cross-script matching via transliteration + Levenshtein distance.
 *
 * @param {string} name - Character name to resolve (may be Cyrillic or Latin)
 * @param {string[]} canonicalNames - Known canonical character names
 * @param {number} [maxDistance=2] - Maximum Levenshtein distance for fuzzy matching
 * @returns {string | null} Matching canonical name, or null if no match
 */
```

- [ ] Step 6: Run lint to verify

Run: `npm run lint`
Expected: No errors

- [ ] Step 7: Commit

```bash
git add src/utils/transliterate.js && git commit -m "feat(types): add @ts-check to transliterate utility"
```

---

### Task 10: Verify All Type Safety

**Files:**
- All modified files

Run verification to ensure type safety is working correctly.

- [ ] Step 1: Run full lint check

Run: `npm run lint`
Expected: No errors

- [ ] Step 2: Run tests to ensure no runtime regressions

Run: `npm run test`
Expected: All tests pass

- [ ] Step 3: Check for TypeScript errors in VS Code

Open VS Code and check the Problems panel.
Expected: 0 TypeScript errors

- [ ] Step 4: Verify IntelliSense works for new types

In VS Code, test IntelliSense by:
1. Opening `src/llm.js` and typing `LLMConfig` - should show autocomplete
2. Opening `src/services/st-vector.js` and typing `StVectorItem` - should show autocomplete
3. Opening `src/utils/queue.js` and typing `LadderQueue` - should show autocomplete

Expected: IntelliSense shows type definitions and property suggestions

- [ ] Step 5: Final commit if verification passes

```bash
git add -A && git commit -m "feat(types): complete Phase 3 type safety implementation"
```

---

## Success Criteria

After completing all tasks:
- [ ] `// @ts-check` present in all 8 target files
- [ ] VS Code shows IntelliSense for `StVectorItem`, `LLMConfig`, `LadderQueue`, etc.
- [ ] Property access typos show red underline
- [ ] All existing tests pass (`npm run test`)
- [ ] No new runtime dependencies added

---

## Common Pitfalls

- **Generic Type Syntax**: The `LadderQueue.add` generic uses TS syntax inside JSDoc: `@property {<T>(taskFn: () => Promise<T>) => Promise<T>} add`
- **AbortSignal Typing**: Using `AbortSignal` (not `Object`) connects to built-in DOM types
- **CDN Library Types**: Some libraries lack types — use `@ts-expect-error` comments as shown in the plan
- **Record vs Object**: Use `Record<string, any>` for flexible object types in embedding-codec.js
- **Union Types**: Use `|` for union types in JSDoc (e.g., `string | null`, `number[] | Float32Array`)
