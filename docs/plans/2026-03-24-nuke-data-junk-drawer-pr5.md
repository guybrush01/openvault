# PR 5: Nuke the `data.js` Junk Drawer + Unify State Management — Implementation Plan

**Goal:** Dismantle `src/utils/data.js` (773 lines) into 3 cohesive modules (`services/st-vector.js`, `store/chat-data.js`, `embeddings/migration.js`), then consolidate concurrency state from `worker.js` into `state.js`.

**Architecture:** Ports & Adapters — network I/O in `services/`, local state in `store/`, domain logic in `embeddings/`. All concurrency flags unified in `state.js`. No logic changes; strictly moving and rewiring code.

**Tech Stack:** ESM, Vitest, JSDOM, CDN imports (no bundler).

**Common Pitfalls:**
- `getRequestHeaders` comes from `getDeps()`, not a direct import — make sure every `fetch` call still uses `getDeps().getRequestHeaders()`.
- `deleteCurrentChatData()` in `store/chat-data.js` imports `purgeSTCollection` from `services/st-vector.js` — this is the one intentional cross-layer dependency.
- `embeddings/migration.js` imports from BOTH `services/st-vector.js` AND `store/chat-data.js` — it's a coordination module.
- `worker.test.js` uses `vi.resetModules()` + dynamic `import()` to reset module state — after moving state to `state.js`, the test reset mechanism must change to use `setWorkerRunning(false)`.
- The `querySTVector` orphan detection tests use dynamic `import()` to get fresh module state — they must be updated to import from `services/st-vector.js` and call `_clearValidatedChatsCache()` in `beforeEach`.
- `data.js` imports `record` from `perf/store.js` (used only in `saveOpenVaultData`) — this goes to `store/chat-data.js`.
- `showToast` import goes to both `store/chat-data.js` (for save errors, update/delete warnings) AND `services/st-vector.js` (for orphan detection toast).

---

### Task 1: Create `src/services/st-vector.js` — ST Vector API Wrappers

**Files:**
- Create: `src/services/st-vector.js`
- Test: `tests/services/st-vector.test.js` (moved from `tests/utils/data.test.js`)

- [ ] Step 1: Create `src/services/st-vector.js` with all ST Vector functions moved from `data.js`

Copy the following functions verbatim from `src/utils/data.js` into `src/services/st-vector.js`:

```js
import { getDeps } from '../deps.js';
import { showToast } from '../utils/dom.js';
import { logDebug, logError, logWarn } from '../utils/logging.js';

// Cache of validated chats for this session (module-level state)
const validatedChats = new Set();

/**
 * Clear the validated chats cache. Used for testing.
 */
export function _clearValidatedChatsCache() {
    validatedChats.clear();
}

// Copy these functions exactly from data.js (preserving JSDoc):
// - chatExists(chatId)              — internal (not exported)
// - getSTCollectionId(chatId)       — internal
// - extractOvId(text)               — internal
// - getSTVectorSource()             — internal
// - getSourceApiUrl(sourceType)     — internal
// - getSTVectorRequestBody(source)  — internal
// - isStVectorSource()              — export
// - syncItemsToST(items, chatId)    — export
// - deleteItemsFromST(hashes, chatId) — export
// - purgeSTCollection(chatId)       — export
// - querySTVector(searchText, topK, threshold, chatId) — export
```

Import header: only `getDeps` from `../deps.js`, `showToast` from `../utils/dom.js`, `logDebug/logError/logWarn` from `../utils/logging.js`. No other imports needed (no `embedding-codec.js`, no `constants.js`, no `perf/store.js`).

- [ ] Step 2: Create `tests/services/st-vector.test.js` by moving the orphan detection tests

Move the `describe('querySTVector — orphan detection')` block (6 tests) from `tests/utils/data.test.js` into a new file `tests/services/st-vector.test.js`. Update imports:

```js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extensionName } from '../../src/constants.js';
import { resetDeps, setDeps } from '../../src/deps.js';
import { querySTVector, _clearValidatedChatsCache } from '../../src/services/st-vector.js';
```

Also update all dynamic `import()` calls inside the tests:
```js
// BEFORE
const { querySTVector: freshQuery } = await import('../../src/utils/data.js');
// AFTER
const { querySTVector: freshQuery } = await import('../../src/services/st-vector.js');
```

- [ ] Step 3: Run tests to verify the new file works

Run: `npx vitest tests/services/st-vector.test.js --run`
Expected: All 6 orphan detection tests PASS.

- [ ] Step 4: Commit

```bash
git add src/services/st-vector.js tests/services/st-vector.test.js && git commit -m "$(cat <<'EOF'
refactor(services): extract ST Vector API wrappers from data.js

Move all SillyTavern Vector Storage REST API functions (syncItemsToST,
deleteItemsFromST, purgeSTCollection, querySTVector, isStVectorSource,
and internal helpers) into src/services/st-vector.js. Move orphan
detection tests to tests/services/st-vector.test.js.
EOF
)"
```

---

### Task 2: Create `src/store/chat-data.js` — Local State Repository

**Files:**
- Create: `src/store/chat-data.js`
- Test: `tests/store/chat-data.test.js` (moved from `tests/utils/data.test.js`)

- [ ] Step 1: Create `src/store/chat-data.js` with all CRUD functions moved from `data.js`

```js
import { CHARACTERS_KEY, MEMORIES_KEY, METADATA_KEY } from '../constants.js';
import { getDeps } from '../deps.js';
import { record } from '../perf/store.js';
import { purgeSTCollection } from '../services/st-vector.js';
import { showToast } from '../utils/dom.js';
import { deleteEmbedding } from '../utils/embedding-codec.js';
import { logDebug, logError, logInfo, logWarn } from '../utils/logging.js';

// Copy these functions exactly from data.js (preserving JSDoc):
// - getOpenVaultData()                    — export
// - getCurrentChatId()                    — export
// - saveOpenVaultData(expectedChatId?)    — export
// - generateId()                          — export
// - updateMemory(id, updates)             — export
// - deleteMemory(id)                      — export
// - deleteCurrentChatData()               — export
```

Note: `deleteCurrentChatData()` currently reads `embeddingSource` from settings to decide whether to call `purgeSTCollection`. It imports `purgeSTCollection` from `../services/st-vector.js` (the file just created in Task 1). It also imports `getCurrentChatId` — but that's defined in the same file, so it's just a local call.

The `isStVectorSource()` call inside `deleteCurrentChatData` is currently an inline check (`settings?.embeddingSource === 'st_vector'`), not a function call. Keep it inline — do NOT import `isStVectorSource` from `services/st-vector.js`. The original code already does the check inline.

- [ ] Step 2: Create `tests/store/chat-data.test.js` by moving CRUD tests

Move these describe blocks from `tests/utils/data.test.js`:
- `getOpenVaultData` (4 tests)
- `getCurrentChatId` (3 tests)
- `saveOpenVaultData` (4 tests)
- `generateId` (2 tests)
- `updateMemory` (3 tests)
- `deleteMemory` (1 test)
- `deleteCurrentChatData` (4 tests)
- `deleteCurrentChatEmbeddings` (1 test) — **wait**, this goes to migration. Skip it here.

Total: 21 tests moved. Update imports:

```js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS_KEY, extensionName, MEMORIES_KEY, METADATA_KEY } from '../../src/constants.js';
import { resetDeps, setDeps } from '../../src/deps.js';
import {
    deleteCurrentChatData,
    deleteMemory,
    generateId,
    getCurrentChatId,
    getOpenVaultData,
    saveOpenVaultData,
    updateMemory,
} from '../../src/store/chat-data.js';
```

Keep the same `beforeEach`/`afterEach` setup from the original file.

- [ ] Step 3: Run tests to verify

Run: `npx vitest tests/store/chat-data.test.js --run`
Expected: All 21 tests PASS.

- [ ] Step 4: Commit

```bash
git add src/store/chat-data.js tests/store/chat-data.test.js && git commit -m "$(cat <<'EOF'
refactor(store): extract chat data repository from data.js

Move getOpenVaultData, saveOpenVaultData, getCurrentChatId, generateId,
updateMemory, deleteMemory, deleteCurrentChatData into
src/store/chat-data.js. Move corresponding tests to
tests/store/chat-data.test.js.
EOF
)"
```

---

### Task 3: Create `src/embeddings/migration.js` — Embedding Invalidation Logic

**Files:**
- Create: `src/embeddings/migration.js`
- Test: `tests/embeddings/migration.test.js` (moved from `tests/utils/data.test.js`)

- [ ] Step 1: Create `src/embeddings/migration.js`

```js
import { MEMORIES_KEY } from '../constants.js';
import { getDeps } from '../deps.js';
import { getSTVectorRequestBody, getSTVectorSource, purgeSTCollection } from '../services/st-vector.js';
import { getCurrentChatId, getOpenVaultData } from '../store/chat-data.js';
import { clearStSynced, deleteEmbedding, hasEmbedding, isStSynced } from '../utils/embedding-codec.js';
import { logDebug, logInfo, logWarn } from '../utils/logging.js';

// Copy these functions exactly from data.js (preserving JSDoc):
// - getStVectorFingerprint()                    — export
// - stampStVectorFingerprint(data)              — export
// - _hasStVectorMismatch(data)                  — internal
// - _hasSyncedItems(data)                       — internal
// - _clearAllStSyncFlags(data)                  — internal
// - _countEmbeddings(data)                      — internal
// - invalidateStaleEmbeddings(data, currentModelId) — export
// - deleteCurrentChatEmbeddings()               — export
```

Key: `getSTVectorSource` and `getSTVectorRequestBody` are internal (not exported) in `services/st-vector.js`. They must be exported from `st-vector.js` for `migration.js` to use them. **Add `export` keyword** to `getSTVectorSource()` and `getSTVectorRequestBody(source)` in `src/services/st-vector.js`.

- [ ] Step 2: Update `src/services/st-vector.js` — export `getSTVectorSource` and `getSTVectorRequestBody`

In `src/services/st-vector.js`, change:
```js
// BEFORE
function getSTVectorSource() {
// AFTER
export function getSTVectorSource() {
```

```js
// BEFORE
function getSTVectorRequestBody(source) {
// AFTER
export function getSTVectorRequestBody(source) {
```

These were internal in `data.js` but now need to cross the module boundary.

- [ ] Step 3: Create `tests/embeddings/migration.test.js` by moving migration tests

Move these describe blocks from `tests/utils/data.test.js`:
- `invalidateStaleEmbeddings` (6 tests)
- `invalidateStaleEmbeddings — ST Vector fingerprint` (8 tests)
- `getStVectorFingerprint` (2 tests)
- `stampStVectorFingerprint` (2 tests)
- `deleteCurrentChatEmbeddings` (1 test)

Total: 19 tests moved. Update imports:

```js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extensionName, MEMORIES_KEY, METADATA_KEY } from '../../src/constants.js';
import { resetDeps, setDeps } from '../../src/deps.js';
import {
    deleteCurrentChatEmbeddings,
    getStVectorFingerprint,
    invalidateStaleEmbeddings,
    stampStVectorFingerprint,
} from '../../src/embeddings/migration.js';
```

Keep the same `beforeEach`/`afterEach` setup. The `setStVectorDeps` helper inside the ST fingerprint describe block stays as-is (it calls `setDeps` with the right shape).

Note: `deleteCurrentChatEmbeddings` calls `getOpenVaultData()` (from `store/chat-data.js`) and `getDeps().saveChatConditional()`. The test mocks these via `setDeps` — no change needed.

- [ ] Step 4: Run tests to verify

Run: `npx vitest tests/embeddings/migration.test.js --run`
Expected: All 19 tests PASS.

- [ ] Step 5: Commit

```bash
git add src/embeddings/migration.js src/services/st-vector.js tests/embeddings/migration.test.js && git commit -m "$(cat <<'EOF'
refactor(embeddings): extract migration logic from data.js

Move invalidateStaleEmbeddings, getStVectorFingerprint,
stampStVectorFingerprint, deleteCurrentChatEmbeddings and internal
helpers into src/embeddings/migration.js. Export getSTVectorSource and
getSTVectorRequestBody from services/st-vector.js for cross-module use.
Move tests to tests/embeddings/migration.test.js.
EOF
)"
```

---

### Task 4: Rewire All Consumers to Import from New Modules

**Files:**
- Modify: `src/extraction/extract.js`
- Modify: `src/extraction/worker.js`
- Modify: `src/reflection/reflect.js`
- Modify: `src/retrieval/retrieve.js`
- Modify: `src/perf/store.js`
- Modify: `src/events.js`
- Modify: `src/ui/settings.js`
- Modify: `src/ui/render.js`
- Modify: `src/ui/status.js`
- Modify: `src/ui/export-debug.js`

- [ ] Step 1: Rewire `src/extraction/extract.js`

Replace:
```js
import {
    deleteItemsFromST,
    getCurrentChatId,
    getOpenVaultData,
    isStVectorSource,
    saveOpenVaultData,
    syncItemsToST,
} from '../utils/data.js';
```

With:
```js
import { deleteItemsFromST, isStVectorSource, syncItemsToST } from '../services/st-vector.js';
import { getCurrentChatId, getOpenVaultData, saveOpenVaultData } from '../store/chat-data.js';
```

- [ ] Step 2: Rewire `src/extraction/worker.js`

Replace:
```js
import { getCurrentChatId, getOpenVaultData } from '../utils/data.js';
```

With:
```js
import { getCurrentChatId, getOpenVaultData } from '../store/chat-data.js';
```

- [ ] Step 3: Rewire `src/reflection/reflect.js`

Replace:
```js
import { generateId } from '../utils/data.js';
```

With:
```js
import { generateId } from '../store/chat-data.js';
```

- [ ] Step 4: Rewire `src/retrieval/retrieve.js`

Replace:
```js
import { getOpenVaultData } from '../utils/data.js';
```

With:
```js
import { getOpenVaultData } from '../store/chat-data.js';
```

- [ ] Step 5: Rewire `src/perf/store.js`

Replace:
```js
import { getOpenVaultData } from '../utils/data.js';
```

With:
```js
import { getOpenVaultData } from '../store/chat-data.js';
```

- [ ] Step 6: Rewire `src/events.js`

Replace:
```js
import { getOpenVaultData } from './utils/data.js';
```

With:
```js
import { getOpenVaultData } from './store/chat-data.js';
```

- [ ] Step 7: Rewire `src/ui/settings.js`

Replace:
```js
import { deleteCurrentChatData, getOpenVaultData } from '../utils/data.js';
```

With:
```js
import { deleteCurrentChatData, getOpenVaultData } from '../store/chat-data.js';
```

Also check if `settings.js` imports any migration functions (`invalidateStaleEmbeddings`, etc.). Search for all `data.js` imports in `settings.js` and rewire accordingly. If it imports from `embeddings/migration.js` functions, update those too.

- [ ] Step 8: Rewire `src/ui/render.js`

Replace:
```js
import {
    deleteMemory as deleteMemoryAction,
    getOpenVaultData,
    updateMemory as updateMemoryAction,
} from '../utils/data.js';
```

With:
```js
import {
    deleteMemory as deleteMemoryAction,
    getOpenVaultData,
    updateMemory as updateMemoryAction,
} from '../store/chat-data.js';
```

- [ ] Step 9: Rewire `src/ui/status.js`

Replace:
```js
import { getOpenVaultData } from '../utils/data.js';
```

With:
```js
import { getOpenVaultData } from '../store/chat-data.js';
```

- [ ] Step 10: Rewire `src/ui/export-debug.js`

Replace:
```js
import { getOpenVaultData } from '../utils/data.js';
```

With:
```js
import { getOpenVaultData } from '../store/chat-data.js';
```

- [ ] Step 11: Search for any remaining `utils/data.js` imports in `src/`

Run: `grep -r "utils/data.js" src/`
Expected: **Zero matches.** If any remain, rewire them.

- [ ] Step 12: Run full test suite

Run: `npm run test`
Expected: All tests PASS. Some tests in `tests/utils/data.test.js` may now fail because the source file still exists but its consumers have been rewired. That's expected — those tests will be deleted in Task 5.

- [ ] Step 13: Commit

```bash
git add src/extraction/extract.js src/extraction/worker.js src/reflection/reflect.js src/retrieval/retrieve.js src/perf/store.js src/events.js src/ui/settings.js src/ui/render.js src/ui/status.js src/ui/export-debug.js && git commit -m "$(cat <<'EOF'
refactor(imports): rewire all consumers from utils/data.js to new modules

Update 10 source files to import from services/st-vector.js,
store/chat-data.js, and embeddings/migration.js instead of the
monolithic utils/data.js.
EOF
)"
```

---

### Task 5: Delete `src/utils/data.js` and `tests/utils/data.test.js`

**Files:**
- Delete: `src/utils/data.js`
- Delete: `tests/utils/data.test.js`

- [ ] Step 1: Verify no remaining imports of `utils/data.js` anywhere

Run: `grep -r "utils/data.js" src/ tests/`
Expected: Only `tests/utils/data.test.js` itself (the import line inside it). No source files should reference it.

- [ ] Step 2: Delete both files

```bash
git rm src/utils/data.js tests/utils/data.test.js
```

- [ ] Step 3: Run full test suite

Run: `npm run test`
Expected: All tests PASS. The 3 new test files (`tests/services/st-vector.test.js`, `tests/store/chat-data.test.js`, `tests/embeddings/migration.test.js`) cover everything.

- [ ] Step 4: Commit

```bash
git commit -m "$(cat <<'EOF'
refactor(cleanup): delete src/utils/data.js and tests/utils/data.test.js

All functions have been moved to services/st-vector.js,
store/chat-data.js, and embeddings/migration.js. All tests moved
to corresponding new test files.
EOF
)"
```

---

### Task 6: Unify State Management — Move Worker State to `state.js`

**Files:**
- Modify: `src/state.js`
- Modify: `src/extraction/worker.js`
- Modify: `src/extraction/extract.js`
- Modify: `tests/state.test.js`
- Modify: `tests/extraction/worker.test.js`

- [ ] Step 1: Add worker state variables and accessors to `src/state.js`

Add after the `chatLoadingTimeout` declaration (around line 52):

```js
// Worker singleton state — moved from worker.js for concurrency visibility
let _workerRunning = false;
let _wakeGeneration = 0;

/**
 * Check if the background worker is currently processing.
 */
export function isWorkerRunning() {
    return _workerRunning;
}

/**
 * Set the background worker running state.
 * @param {boolean} value
 */
export function setWorkerRunning(value) {
    _workerRunning = value;
}

/**
 * Get current wake generation counter.
 * Used by interruptible sleep to detect new messages.
 * @returns {number}
 */
export function getWakeGeneration() {
    return _wakeGeneration;
}

/**
 * Increment wake generation to signal the worker to reset backoff.
 */
export function incrementWakeGeneration() {
    _wakeGeneration++;
}
```

Update `clearAllLocks()` to also reset worker state:

```js
export function clearAllLocks() {
    operationState.generationInProgress = false;
    operationState.extractionInProgress = false;
    operationState.retrievalInProgress = false;
    _workerRunning = false;
    if (generationLockTimeout) {
        getDeps().clearTimeout(generationLockTimeout);
        generationLockTimeout = null;
    }
}
```

- [ ] Step 2: Update `src/extraction/worker.js` — remove state, import from `state.js`

Delete these lines from `worker.js`:
```js
let isRunning = false;
let wakeGeneration = 0;
```

Delete these exported functions from `worker.js`:
```js
export function isWorkerRunning() { ... }
export function getWakeGeneration() { ... }
export function incrementWakeGeneration() { ... }
```

Update the import from `state.js`:
```js
// BEFORE
import { getSessionSignal, operationState } from '../state.js';

// AFTER
import {
    getSessionSignal,
    getWakeGeneration,
    incrementWakeGeneration,
    isWorkerRunning,
    operationState,
    setWorkerRunning,
} from '../state.js';
```

Update `wakeUpBackgroundWorker()`:
```js
export function wakeUpBackgroundWorker() {
    incrementWakeGeneration();
    if (isWorkerRunning()) return;
    setWorkerRunning(true);
    runWorkerLoop().finally(() => {
        setWorkerRunning(false);
    });
}
```

Update `interruptibleSleep()` — replace `wakeGeneration !== generationAtStart` with `getWakeGeneration() !== generationAtStart`.

Update `runWorkerLoop()` — replace all bare `wakeGeneration` reads:
- `let lastSeenGeneration = wakeGeneration;` → `let lastSeenGeneration = getWakeGeneration();`
- `if (wakeGeneration !== lastSeenGeneration)` → `if (getWakeGeneration() !== lastSeenGeneration)`
- `lastSeenGeneration = wakeGeneration;` → `lastSeenGeneration = getWakeGeneration();`

- [ ] Step 3: Update `src/extraction/extract.js` — import `isWorkerRunning` from `state.js`

Delete:
```js
import { isWorkerRunning } from './worker.js';
```

Add `isWorkerRunning` to the existing `state.js` import:
```js
// BEFORE
import { clearAllLocks, operationState } from '../state.js';

// AFTER
import { clearAllLocks, isWorkerRunning, operationState } from '../state.js';
```

- [ ] Step 4: Add worker state tests to `tests/state.test.js`

Add a new describe block:

```js
import {
    clearAllLocks,
    getSessionSignal,
    getWakeGeneration,
    incrementWakeGeneration,
    isWorkerRunning,
    resetSessionController,
    setWorkerRunning,
} from '../src/state.js';

// ... existing session tests ...

describe('Worker state', () => {
    afterEach(() => {
        setWorkerRunning(false);
    });

    it('isWorkerRunning returns false by default', () => {
        expect(isWorkerRunning()).toBe(false);
    });

    it('setWorkerRunning toggles the flag', () => {
        setWorkerRunning(true);
        expect(isWorkerRunning()).toBe(true);
        setWorkerRunning(false);
        expect(isWorkerRunning()).toBe(false);
    });

    it('incrementWakeGeneration increases the counter', () => {
        const before = getWakeGeneration();
        incrementWakeGeneration();
        expect(getWakeGeneration()).toBe(before + 1);
    });
});

describe('clearAllLocks', () => {
    afterEach(() => {
        setWorkerRunning(false);
    });

    it('resets worker running state', () => {
        setWorkerRunning(true);
        clearAllLocks();
        expect(isWorkerRunning()).toBe(false);
    });
});
```

Note: `clearAllLocks` calls `getDeps().clearTimeout` — the test needs deps set up OR we accept that it may warn. Since the existing `state.test.js` doesn't use `setupTestContext`, we can either:
- Import `setDeps` and provide a minimal mock with `clearTimeout: vi.fn()` in a `beforeEach`, OR
- Simply not test `clearAllLocks` at unit level and rely on the worker integration test.

Simplest: add a minimal `setDeps` for the `clearAllLocks` test:

```js
import { resetDeps, setDeps } from '../src/deps.js';

describe('clearAllLocks', () => {
    beforeEach(() => {
        setDeps({ clearTimeout: vi.fn() });
    });
    afterEach(() => {
        setWorkerRunning(false);
        resetDeps();
    });
    // ... tests ...
});
```

- [ ] Step 5: Update `tests/extraction/worker.test.js` — change state reset mechanism

The existing test uses `vi.resetModules()` to reset `isRunning`. After the move, `isRunning` lives in `state.js`, so `vi.resetModules()` alone won't help (state.js is imported statically by the test).

Update the test to import and reset state directly:

```js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDeps } from '../../src/deps.js';
import { setWorkerRunning } from '../../src/state.js';

describe('worker abort handling', () => {
    beforeEach(async () => {
        vi.resetModules();
        setWorkerRunning(false);
        await registerCdnOverrides();
    });

    afterEach(() => {
        setWorkerRunning(false);
        resetDeps();
        vi.restoreAllMocks();
    });

    it('worker loop exits on chat switch without throwing', async () => {
        let callCount = 0;
        setupTestContext({
            context: {
                get chatId() {
                    callCount++;
                    return callCount <= 1 ? 'chat-A' : 'chat-B';
                },
                chat: [{ mes: 'test', is_user: true }],
                chatMetadata: { openvault: { memories: [], processed_message_ids: [] } },
            },
            settings: { enabled: true, extractionTokenBudget: 9999 },
        });

        const { wakeUpBackgroundWorker } = await import('../../src/extraction/worker.js');
        const { isWorkerRunning } = await import('../../src/state.js');

        wakeUpBackgroundWorker();
        await new Promise((r) => setTimeout(r, 100));
        expect(isWorkerRunning()).toBe(false);
    });
});
```

Note the key change: `isWorkerRunning` is now imported from `state.js`, not from `worker.js`.

- [ ] Step 6: Run full test suite

Run: `npm run test`
Expected: All tests PASS.

- [ ] Step 7: Verify no state accessors remain in `worker.js`

Run: `grep -n "isWorkerRunning\|getWakeGeneration\|incrementWakeGeneration\|let isRunning\|let wakeGeneration" src/extraction/worker.js`
Expected: **Zero matches** for variable declarations and accessor function definitions. Only CALLS to these functions should appear (imported from state.js).

- [ ] Step 8: Commit

```bash
git add src/state.js src/extraction/worker.js src/extraction/extract.js tests/state.test.js tests/extraction/worker.test.js && git commit -m "$(cat <<'EOF'
refactor(state): unify concurrency state in state.js

Move isRunning and wakeGeneration from worker.js to state.js. All
concurrency flags (operationState, worker running, wake generation,
generation lock, session controller, chat loading cooldown) now live
in a single module. clearAllLocks() also resets worker running state.
EOF
)"
```

---

### Task 7: Update `src/utils/CLAUDE.md` and Final Verification

**Files:**
- Modify: `src/utils/CLAUDE.md` — remove `data.js` section
- No other CLAUDE.md files need updating (the new directories don't need CLAUDE.md files — they're too small)

- [ ] Step 1: Remove `data.js` section from `src/utils/CLAUDE.md`

Delete the entire `### data.js` section (lines describing lazy-init, chat-switch guard, updateMemory, ST Vector Storage, ST Sync Helpers).

- [ ] Step 2: Run full test suite one final time

Run: `npm run test`
Expected: All tests PASS.

- [ ] Step 3: Verify final state

Run these checks:
```bash
# No references to utils/data.js in source or tests
grep -r "utils/data.js" src/ tests/

# Worker.js has no state variable declarations
grep -n "let isRunning\|let wakeGeneration" src/extraction/worker.js

# Worker.js exports only wakeUpBackgroundWorker and interruptibleSleep (no state accessors)
grep -n "^export function" src/extraction/worker.js

# state.js exports the worker accessors
grep -n "^export function" src/state.js
```

Expected:
- First command: zero matches
- Second command: zero matches
- Third command: `wakeUpBackgroundWorker` and `interruptibleSleep` only
- Fourth command: includes `isWorkerRunning`, `setWorkerRunning`, `getWakeGeneration`, `incrementWakeGeneration` among existing exports

- [ ] Step 4: Commit

```bash
git add src/utils/CLAUDE.md && git commit -m "$(cat <<'EOF'
docs: remove data.js section from utils/CLAUDE.md
EOF
)"
```
