# PR 6: Final Polish Implementation Plan

**Goal:** Purge jQuery/toastr/setStatus from `extractAllMessages` via callback injection, and lock down direct data mutations behind repository methods in `chat-data.js`.

**Architecture:** Two independent changes composed into one PR. Part A adds three repository mutation methods to `store/chat-data.js` and rewires `extract.js` to use them. Part B converts `extractAllMessages` from imperative UI manipulation to callback-driven, moving all toast/status/DOM code into `settings.js` callbacks.

**Tech Stack:** Vitest (JSDOM), existing `setupTestContext`/`setDeps` patterns, jQuery (UI layer only).

**Common Pitfalls:**
- `PROCESSED_MESSAGES_KEY` must be imported in `chat-data.js` from `../constants.js` — it's not there yet.
- `settings.js` does NOT currently import `setStatus` — must add it to the existing `./status.js` import line.
- `extractAllMessages` still needs `showToast` for guard clauses (no chat, worker running, etc.) — do NOT remove that import.
- `extract.js` still needs `MEMORIES_KEY` for reads (`data[MEMORIES_KEY] || []`) — only `PROCESSED_MESSAGES_KEY` can be removed.
- The `toastr` global in `extract.js` is accessed directly (not imported) — just delete the usage lines.

---

## File Structure Overview

- Modify: `src/store/chat-data.js` — add `addMemories`, `markMessagesProcessed`, `incrementGraphMessageCount`
- Modify: `src/extraction/extract.js` — use repository methods, add callback params, remove jQuery/toast/setStatus
- Modify: `src/ui/settings.js` — wire backfill callbacks in `handleExtractAll`, add `setStatus` import
- Test: `tests/store/chat-data.test.js` — add tests for 3 new repository methods
- Test: `tests/extraction/extract.test.js` — no changes (callbacks optional, behavior identical)

---

### Task 1: Add repository methods to `chat-data.js`

**Files:**
- Modify: `src/store/chat-data.js`
- Test: `tests/store/chat-data.test.js`

- [ ] Step 1: Write failing tests for the 3 new repository methods

Add at the end of `tests/store/chat-data.test.js`, inside the outer `describe('store/chat-data', ...)` block, before its closing `});`:

```js
describe('addMemories', () => {
    it('appends memories to the store', () => {
        mockContext.chatMetadata[METADATA_KEY] = { [MEMORIES_KEY]: [{ id: 'existing' }] };
        addMemories([{ id: 'new1' }, { id: 'new2' }]);
        expect(getOpenVaultData()[MEMORIES_KEY]).toEqual([{ id: 'existing' }, { id: 'new1' }, { id: 'new2' }]);
    });

    it('initializes memories array if missing', () => {
        mockContext.chatMetadata[METADATA_KEY] = {};
        addMemories([{ id: 'first' }]);
        expect(getOpenVaultData()[MEMORIES_KEY]).toEqual([{ id: 'first' }]);
    });

    it('no-ops on empty array', () => {
        mockContext.chatMetadata[METADATA_KEY] = { [MEMORIES_KEY]: [{ id: 'existing' }] };
        addMemories([]);
        expect(getOpenVaultData()[MEMORIES_KEY]).toEqual([{ id: 'existing' }]);
    });

    it('no-ops when context unavailable', () => {
        setDeps({
            console: mockConsole,
            getContext: () => null,
            getExtensionSettings: () => ({}),
        });
        expect(() => addMemories([{ id: 'x' }])).not.toThrow();
    });
});

describe('markMessagesProcessed', () => {
    it('appends fingerprints to processed list', () => {
        mockContext.chatMetadata[METADATA_KEY] = { processed_message_ids: ['fp1'] };
        markMessagesProcessed(['fp2', 'fp3']);
        expect(getOpenVaultData().processed_message_ids).toEqual(['fp1', 'fp2', 'fp3']);
    });

    it('initializes processed list if missing', () => {
        mockContext.chatMetadata[METADATA_KEY] = {};
        markMessagesProcessed(['fp1']);
        expect(getOpenVaultData().processed_message_ids).toEqual(['fp1']);
    });

    it('no-ops on empty array', () => {
        mockContext.chatMetadata[METADATA_KEY] = { processed_message_ids: ['fp1'] };
        markMessagesProcessed([]);
        expect(getOpenVaultData().processed_message_ids).toEqual(['fp1']);
    });
});

describe('incrementGraphMessageCount', () => {
    it('increments existing count', () => {
        mockContext.chatMetadata[METADATA_KEY] = { graph_message_count: 10 };
        incrementGraphMessageCount(5);
        expect(getOpenVaultData().graph_message_count).toBe(15);
    });

    it('initializes from zero if missing', () => {
        mockContext.chatMetadata[METADATA_KEY] = {};
        incrementGraphMessageCount(3);
        expect(getOpenVaultData().graph_message_count).toBe(3);
    });

    it('no-ops when context unavailable', () => {
        setDeps({
            console: mockConsole,
            getContext: () => null,
            getExtensionSettings: () => ({}),
        });
        expect(() => incrementGraphMessageCount(5)).not.toThrow();
    });
});
```

Also add imports at the top of the test file — update the existing import from `chat-data.js`:

```js
import {
    addMemories,
    deleteCurrentChatData,
    deleteMemory,
    generateId,
    getCurrentChatId,
    getOpenVaultData,
    incrementGraphMessageCount,
    markMessagesProcessed,
    saveOpenVaultData,
    updateMemory,
} from '../../src/store/chat-data.js';
```

- [ ] Step 2: Run tests to verify they fail

Run: `npx vitest tests/store/chat-data.test.js --run`
Expected: FAIL — `addMemories`, `markMessagesProcessed`, `incrementGraphMessageCount` are not exported from `chat-data.js`

- [ ] Step 3: Implement the 3 repository methods in `chat-data.js`

In `src/store/chat-data.js`:

1. Update the constants import (line 1) to add `PROCESSED_MESSAGES_KEY`:
```js
import { CHARACTERS_KEY, MEMORIES_KEY, METADATA_KEY, PROCESSED_MESSAGES_KEY } from '../constants.js';
```

2. Add the 3 functions at the end of the file (before the final closing of the module, after `deleteCurrentChatData`):

```js
/**
 * Append new memories to the store
 * @param {Array} newMemories - Memory objects to add
 */
export function addMemories(newMemories) {
    const data = getOpenVaultData();
    if (!data || newMemories.length === 0) return;
    data[MEMORIES_KEY] = data[MEMORIES_KEY] || [];
    data[MEMORIES_KEY].push(...newMemories);
}

/**
 * Record message fingerprints as processed
 * @param {Array<string>} fingerprints - Message fingerprints to mark
 */
export function markMessagesProcessed(fingerprints) {
    const data = getOpenVaultData();
    if (!data || fingerprints.length === 0) return;
    data[PROCESSED_MESSAGES_KEY] = data[PROCESSED_MESSAGES_KEY] || [];
    data[PROCESSED_MESSAGES_KEY].push(...fingerprints);
}

/**
 * Increment the graph message count
 * @param {number} count - Number of messages to add
 */
export function incrementGraphMessageCount(count) {
    const data = getOpenVaultData();
    if (!data) return;
    data.graph_message_count = (data.graph_message_count || 0) + count;
}
```

- [ ] Step 4: Run tests to verify they pass

Run: `npx vitest tests/store/chat-data.test.js --run`
Expected: ALL PASS

- [ ] Step 5: Commit

```
feat(store): add repository mutation methods to chat-data.js
```

---

### Task 2: Rewire `extract.js` to use repository methods

**Files:**
- Modify: `src/extraction/extract.js`

- [ ] Step 1: Update imports in `extract.js`

Change the constants import (line 8):
```js
// BEFORE
import { CHARACTERS_KEY, extensionName, MEMORIES_KEY, PROCESSED_MESSAGES_KEY } from '../constants.js';
// AFTER
import { CHARACTERS_KEY, extensionName, MEMORIES_KEY } from '../constants.js';
```

Change the store import (line 38):
```js
// BEFORE
import { getCurrentChatId, getOpenVaultData, saveOpenVaultData } from '../store/chat-data.js';
// AFTER
import { addMemories, getCurrentChatId, getOpenVaultData, incrementGraphMessageCount, markMessagesProcessed, saveOpenVaultData } from '../store/chat-data.js';
```

- [ ] Step 2: Replace the 4 mutation sites

**Site 1 — line 596** (inside `synthesizeReflections`, the reflection push):
```js
// BEFORE
                        if (reflections.length > 0) {
                            data[MEMORIES_KEY].push(...reflections);
                        }
// AFTER
                        if (reflections.length > 0) {
                            addMemories(reflections);
                        }
```

**Site 2 — line 954** (graph message count):
```js
// BEFORE
        data.graph_message_count = (data.graph_message_count || 0) + messages.length;
// AFTER
        incrementGraphMessageCount(messages.length);
```

**Site 3 — lines 960-961** (events push):
```js
// BEFORE
            data[MEMORIES_KEY] = data[MEMORIES_KEY] || [];
            data[MEMORIES_KEY].push(...events);
// AFTER
            addMemories(events);
```

**Site 4 — lines 967-968** (processed fingerprints push):
```js
// BEFORE
        data[PROCESSED_MESSAGES_KEY] = data[PROCESSED_MESSAGES_KEY] || [];
        data[PROCESSED_MESSAGES_KEY].push(...processedFps);
// AFTER
        markMessagesProcessed(processedFps);
```

- [ ] Step 3: Run all extraction tests to verify behavior unchanged

Run: `npx vitest tests/extraction/extract.test.js --run`
Expected: ALL PASS (3 extractMemories + 2 runPhase2Enrichment + 2 extractAllMessages tests)

- [ ] Step 4: Run full test suite

Run: `npm run test:run`
Expected: ALL PASS

- [ ] Step 5: Commit

```
refactor(extract): use repository methods for data mutations
```

---

### Task 3: Add callback params to `extractAllMessages` and purge jQuery/toast/setStatus

**Files:**
- Modify: `src/extraction/extract.js`

This is the largest step. The `extractAllMessages` function (lines ~1090-1360) has ~10 sites where jQuery/toastr/setStatus are used in the non-Emergency-Cut path. Each gets replaced with a callback invocation.

- [ ] Step 1: Update the options destructuring at the top of `extractAllMessages`

Find the current destructuring (around line 1095-1098):
```js
    const { isEmergencyCut = false, progressCallback = null, abortSignal = null, onComplete = null } = opts;
```

Replace with:
```js
    const {
        isEmergencyCut = false,
        abortSignal = null,
        onComplete = null,
        // Backfill UI callbacks (non-Emergency-Cut path)
        onStart,
        onProgress,
        onPhase2Start,
        onBatchRetryWait,
        onFinish,
        onAbort,
        onError,
        // Emergency Cut path (unchanged)
        progressCallback = null,
    } = opts;
```

- [ ] Step 2: Replace the toast creation block (non-Emergency-Cut start)

Find (around lines 1147-1155):
```js
    // Show persistent progress toast (skip for Emergency Cut - uses modal instead)
    if (!isEmergencyCut) {
        setStatus('extracting');
        const _toast = toastr?.info(`Backfill: 0/${initialBatchCount} batches (0%)`, 'OpenVault - Extracting', {
            timeOut: 0,
            extendedTimeOut: 0,
            tapToDismiss: false,
            toastClass: 'toast openvault-backfill-toast',
        });
    }
```

Replace with:
```js
    // Notify caller that backfill is starting (skip for Emergency Cut - uses modal instead)
    if (!isEmergencyCut) {
        onStart?.(initialBatchCount);
    }
```

- [ ] Step 3: Replace the progress update inside the batch loop

Find (around lines 1213-1222):
```js
        if (!isEmergencyCut) {
            $('.openvault-backfill-toast .toast-message').text(
                `Backfill: ${batchesProcessed}/${initialBatchCount} batches (${Math.min(progress, 100)}%) - Processing...${retryText}`
            );
        } else if (progressCallback) {
```

Replace with:
```js
        if (!isEmergencyCut) {
            onProgress?.(batchesProcessed, initialBatchCount, totalEvents, retryText);
        } else if (progressCallback) {
```

- [ ] Step 4: Replace the chat-change abort handler

Find (around lines 1240-1254):
```js
            if (error.name === 'AbortError' || error.message === 'Chat changed during extraction') {
                if (isEmergencyCut) {
                    throw error; // Propagate to Emergency Cut handler
                }
                logDebug('Chat changed during backfill, aborting');
                $('.openvault-backfill-toast').remove();
                showToast('warning', 'Backfill aborted: chat changed', 'OpenVault');
                clearAllLocks();
                setStatus('ready');
                return { messagesProcessed: 0, eventsCreated: 0 };
            }
```

Replace with:
```js
            if (error.name === 'AbortError' || error.message === 'Chat changed during extraction') {
                if (isEmergencyCut) {
                    throw error; // Propagate to Emergency Cut handler
                }
                logDebug('Chat changed during backfill, aborting');
                clearAllLocks();
                onAbort?.();
                return { messagesProcessed: 0, eventsCreated: 0 };
            }
```

- [ ] Step 5: Replace the backoff-limit-exceeded handler

Find (around lines 1270-1284):
```js
            if (cumulativeBackoffMs >= MAX_BACKOFF_TOTAL_MS) {
                // v6: Throw for Emergency Cut instead of silent success
                if (isEmergencyCut) {
                    throw new Error(
                        `Extraction failed after ${Math.round(cumulativeBackoffMs / 1000)}s of API errors.`
                    );
                }

                logDebug(
                    `Batch ${batchesProcessed + 1} failed: cumulative backoff reached ${Math.round(cumulativeBackoffMs / 1000)}s (limit: ${Math.round(MAX_BACKOFF_TOTAL_MS / 1000)}s). Stopping extraction.`
                );
                logError('Extraction stopped after exceeding backoff limit', error);
                showToast(
                    'error',
                    `Extraction stopped: API errors persisted for ${Math.round(cumulativeBackoffMs / 1000)}s. Check your API connection and try again.`,
                    'OpenVault'
                );
                break;
            }
```

Replace with:
```js
            if (cumulativeBackoffMs >= MAX_BACKOFF_TOTAL_MS) {
                // v6: Throw for Emergency Cut instead of silent success
                if (isEmergencyCut) {
                    throw new Error(
                        `Extraction failed after ${Math.round(cumulativeBackoffMs / 1000)}s of API errors.`
                    );
                }

                logDebug(
                    `Batch ${batchesProcessed + 1} failed: cumulative backoff reached ${Math.round(cumulativeBackoffMs / 1000)}s (limit: ${Math.round(MAX_BACKOFF_TOTAL_MS / 1000)}s). Stopping extraction.`
                );
                logError('Extraction stopped after exceeding backoff limit', error);
                onError?.(new Error(
                    `Extraction stopped: API errors persisted for ${Math.round(cumulativeBackoffMs / 1000)}s. Check your API connection and try again.`
                ));
                break;
            }
```

- [ ] Step 6: Replace the retry-wait toast update

Find (around lines 1289-1294):
```js
            // Update toast to show waiting state (skip for Emergency Cut - modal shows progress)
            if (!isEmergencyCut) {
                $('.openvault-backfill-toast .toast-message').text(
                    `Backfill: ${batchesProcessed}/${initialBatchCount} batches - Waiting ${backoffSeconds}s before retry ${retryCount}...`
                );
            }
```

Replace with:
```js
            // Notify caller of retry wait (skip for Emergency Cut - modal shows progress)
            if (!isEmergencyCut) {
                onBatchRetryWait?.(batchesProcessed, initialBatchCount, backoffSeconds, retryCount);
            }
```

- [ ] Step 7: Replace the Phase 2 start notification and Phase 2 failure toast

Find (around lines 1303-1320):
```js
        logInfo('Backfill Phase 1 complete. Running final Phase 2 synthesis...');
        $('.openvault-backfill-toast .toast-message').text(
            `Backfill: 100% - Synthesizing world state and reflections. This may take a minute...`
        );

        try {
            await runPhase2Enrichment(data, settings, targetChatId, { abortSignal });
        } catch (error) {
            logError('Final Phase 2 enrichment failed', error);
            showToast('warning', 'Events saved, but final summarization failed. You can re-run later.', 'OpenVault');
            // Don't throw - Phase 1 data is safe
        }
```

Replace with:
```js
        logInfo('Backfill Phase 1 complete. Running final Phase 2 synthesis...');
        onPhase2Start?.();

        try {
            await runPhase2Enrichment(data, settings, targetChatId, { abortSignal });
        } catch (error) {
            logError('Final Phase 2 enrichment failed', error);
            onError?.(new Error('Events saved, but final summarization failed. You can re-run later.'));
            // Don't throw - Phase 1 data is safe
        }
```

- [ ] Step 8: Replace the completion block (toast removal + success toast + refreshAllUI + setStatus)

Find (around lines 1322-1344):
```js
    // Now clear it when everything is truly done
    // Clear progress toast
    if (!isEmergencyCut) {
        $('.openvault-backfill-toast').remove();
    }

    // Reset operation state
    clearAllLocks();

    // Clear injection and save
    safeSetExtensionPrompt('');
    await getDeps().saveChatConditional();

    // Re-register event listeners
    if (updateEventListenersFn) {
        updateEventListenersFn(true);
    }

    if (!isEmergencyCut) {
        showToast('success', `Extracted ${totalEvents} events from ${messagesProcessed} messages`);
        refreshAllUI();
        setStatus('ready');
    }
```

Replace with:
```js
    // Reset operation state
    clearAllLocks();

    // Clear injection and save
    safeSetExtensionPrompt('');
    await getDeps().saveChatConditional();

    // Re-register event listeners
    if (onComplete) {
        onComplete(true);
    }

    // Notify caller of completion (skip for Emergency Cut - caller handles its own UI)
    if (!isEmergencyCut) {
        onFinish?.({ messagesProcessed, eventsCreated: totalEvents });
    }
```

Note: The `updateEventListenersFn` variable (which was an alias for `onComplete`) is no longer needed — use `onComplete` directly.

- [ ] Step 9: Remove the `updateEventListenersFn` alias

Find (around line 1100):
```js
    const updateEventListenersFn = onComplete;
```

Delete this line entirely. The step 8 replacement already uses `onComplete` directly.

- [ ] Step 10: Run all extraction tests

Run: `npx vitest tests/extraction/extract.test.js --run`
Expected: ALL PASS (callbacks are all optional, so existing tests that don't provide them still work)

- [ ] Step 11: Run full test suite

Run: `npm run test:run`
Expected: ALL PASS

- [ ] Step 12: Commit

```
refactor(extract): replace jQuery/toast/setStatus with callback injection in extractAllMessages
```

---

### Task 4: Wire callbacks in `settings.js` and remove dead imports from `extract.js`

**Files:**
- Modify: `src/ui/settings.js`
- Modify: `src/extraction/extract.js`

- [ ] Step 1: Add `setStatus` import to `settings.js`

Find (line 35):
```js
import { updateEmbeddingStatusDisplay } from './status.js';
```

Replace with:
```js
import { setStatus, updateEmbeddingStatusDisplay } from './status.js';
```

- [ ] Step 2: Replace `handleExtractAll` in `settings.js`

Find (around lines 358-363):
```js
async function handleExtractAll() {
    const { extractAllMessages } = await import('../extraction/extract.js');
    // v6: Use options object signature
    // Guard: extractAllMessages handles isWorkerRunning() check internally
    await extractAllMessages({ onComplete: updateEventListeners });
}
```

Replace with:
```js
async function handleExtractAll() {
    const { extractAllMessages } = await import('../extraction/extract.js');
    await extractAllMessages({
        onComplete: updateEventListeners,
        onStart: (batchCount) => {
            setStatus('extracting');
            toastr?.info(`Backfill: 0/${batchCount} batches (0%)`, 'OpenVault - Extracting', {
                timeOut: 0,
                extendedTimeOut: 0,
                tapToDismiss: false,
                toastClass: 'toast openvault-backfill-toast',
            });
        },
        onProgress: (batchNum, totalBatches, _eventsCreated, retryText) => {
            const progress = Math.round((batchNum / totalBatches) * 100);
            $('.openvault-backfill-toast .toast-message').text(
                `Backfill: ${batchNum}/${totalBatches} batches (${Math.min(progress, 100)}%) - Processing...${retryText}`
            );
        },
        onBatchRetryWait: (batchNum, totalBatches, backoffSeconds, retryCount) => {
            $('.openvault-backfill-toast .toast-message').text(
                `Backfill: ${batchNum}/${totalBatches} batches - Waiting ${backoffSeconds}s before retry ${retryCount}...`
            );
        },
        onPhase2Start: () => {
            $('.openvault-backfill-toast .toast-message').text(
                'Backfill: 100% - Synthesizing world state and reflections. This may take a minute...'
            );
        },
        onFinish: ({ messagesProcessed, eventsCreated }) => {
            $('.openvault-backfill-toast').remove();
            showToast('success', `Extracted ${eventsCreated} events from ${messagesProcessed} messages`);
            refreshAllUI();
            setStatus('ready');
        },
        onAbort: () => {
            $('.openvault-backfill-toast').remove();
            showToast('warning', 'Backfill aborted: chat changed', 'OpenVault');
            setStatus('ready');
        },
        onError: (error) => {
            $('.openvault-backfill-toast').remove();
            showToast('warning', error.message, 'OpenVault');
            setStatus('ready');
        },
    });
}
```

- [ ] Step 3: Remove dead imports from `extract.js`

Remove `setStatus` import — find (line 36):
```js
import { setStatus } from '../ui/status.js';
```
Delete this line entirely.

Remove `refreshAllUI` import — find (line 35):
```js
import { refreshAllUI } from '../ui/render.js';
```
Delete this line entirely.

- [ ] Step 4: Run full test suite

Run: `npm run test:run`
Expected: ALL PASS

- [ ] Step 5: Commit

```
refactor(ui): wire backfill callbacks in settings.js, remove dead imports from extract.js
```

---

### Task 5: Run Biome unsafe fixes on full codebase and fix all issues

**Files:**
- Potentially any file in the codebase

- [ ] Step 1: Run Biome check with unsafe fixes on the full codebase

Run: `npx biome check --write --unsafe src/ tests/`

This applies all safe AND unsafe auto-fixes (unused imports, sort imports, formatting, etc.) across the entire codebase.

- [ ] Step 2: Review the changes

Run: `git diff --stat`

Inspect which files changed and what Biome modified. Look for:
- Removed unused imports (expected — `setStatus`, `refreshAllUI`, possibly others)
- Re-sorted imports
- Formatting fixes
- Any unexpected changes that need manual review

- [ ] Step 3: Fix any remaining Biome errors that couldn't be auto-fixed

Run: `npx biome check src/ tests/`

If any errors remain, fix them manually. Common ones:
- Unused variables that Biome flags but can't safely remove (e.g., destructured but unused callback params — prefix with `_`)
- Import ordering that Biome can't resolve due to side-effect imports

- [ ] Step 4: Run full test suite to verify nothing broke

Run: `npm run test:run`
Expected: ALL PASS

- [ ] Step 5: Commit

```
chore: biome unsafe fixes across full codebase
```

---

## Verification Checklist (after all tasks)

Run these commands to confirm architectural goals are met:

```bash
# No jQuery in extraction layer
grep -r '\$(' src/extraction/
# Expected: zero hits

# No toastr in extraction layer
grep -r 'toastr' src/extraction/
# Expected: zero hits

# No setStatus in extraction layer
grep -r 'setStatus' src/extraction/
# Expected: zero hits

# No refreshAllUI in extraction layer
grep -r 'refreshAllUI' src/extraction/
# Expected: zero hits

# No direct data[KEY].push in extract.js for memories/processed
grep -n 'data\[MEMORIES_KEY\]\.push\|data\[PROCESSED_MESSAGES_KEY\]' src/extraction/extract.js
# Expected: zero hits

# showToast remains only for guard clauses
grep -n 'showToast' src/extraction/extract.js
# Expected: only in guard clauses (early returns for no chat, worker running, etc.)

# Full test suite green
npm run test:run
```
