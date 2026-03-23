You have executed a masterful, systematic cleanup so far. The extraction of the pipeline stages in PR 4 and the purging of domain I/O in PR 2 have successfully pushed side-effects to the edges of your architecture. 

Reviewing your codebase, the next major bottleneck is exactly what you identified in your roadmap: **The `data.js` Junk Drawer** and the **Split-Brain State Management**.

Here is the high-level roadmap for the next three phases, followed by the detailed, actionable design document for **PR 5**.

---

### Refactoring Roadmap (Phases 5 - 7)

*   **Phase 5 (Next): Nuke the `data.js` Junk Drawer.** `src/utils/data.js` is a severe Single Responsibility Principle (SRP) violation. It mixes local JSON state initialization, memory CRUD operations, vector embedding invalidation logic, and REST API wrappers for SillyTavern's Vector DB. We will split this into a `store/` (local state) and a `services/` (network adapters) architecture.
*   **Phase 6: Unify State Management.** Concurrency locks are currently split. `worker.js` tracks `isRunning` and `wakeGeneration`, while `state.js` tracks `operationState.extractionInProgress` and `generationLockTimeout`. Consolidating this into a single, unified `ConcurrencyManager` will prevent race conditions between the background worker, manual extractions, and the UI.
*   **Phase 7: Isolate Domain Mutations (CQRS).** Currently, `graph.js` and `reflect.js` mutate `data.graph` and `data.memories` deeply in place. Moving toward pure functions that return "Change Sets" (like you did for ST Sync in PR 2) for local memory/graph mutations will make the system fully predictable and trivially testable without mocking global state.

---

Here is the actionable design document for **PR 5**.

# PR 5: Nuke the `data.js` Junk Drawer

## Goal
Dismantle `src/utils/data.js` (500+ lines) into three highly cohesive, purpose-built modules. Separate local state management (Repository Pattern) from external REST API interactions (Adapter Pattern) and embedding migration logic.

**Non-goals:** No changes to how data is actually stored in ST's `chatMetadata`. No changes to ST Vector API endpoints or payloads. No changes to the actual logic of embedding invalidation. We are strictly moving and categorizing code.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | Ports & Adapters (Hexagonal) | Clear boundaries between local disk I/O (`saveChatConditional`), Network I/O (`fetch`), and Domain Logic. |
| Directory Structure | `src/store/`, `src/services/`, `src/embeddings/` | Moves away from the generic `utils/` folder into semantic architectural layers. |
| Chat ID Resolution | Stays in `store/chat-data.js` | Resolving the active `chatId` is a local ST context concern, closely tied to `saveOpenVaultData`. |
| Caching | Move `validatedChats` to `services/st-vector.js` | The cache preventing duplicate `/api/characters/chats` calls is purely a network optimization. |

## File-by-File Changes

### 1. `src/services/st-vector.js` (New File)
**Responsibility:** Pure REST API wrappers for SillyTavern's Vector Storage endpoints. Knows *nothing* about OpenVault data structures (except extracting the OV_ID).

**Move the following from `data.js`:**
*   `const validatedChats = new Set();` and `_clearValidatedChatsCache()`
*   `chatExists(chatId)`
*   `getSTCollectionId(chatId)`
*   `extractOvId(text)`
*   `getSTVectorSource()`
*   `getSourceApiUrl(sourceType)`
*   `getSTVectorRequestBody(source)`
*   `isStVectorSource()`
*   `syncItemsToST(items, chatId)`
*   `deleteItemsFromST(hashes, chatId)`
*   `purgeSTCollection(chatId)`
*   `querySTVector(searchText, topK, threshold, chatId)`

**Imports needed:** `getDeps` from `deps.js`, `showToast` from `utils/dom.js`, `logError/logWarn` from `utils/logging.js`.

### 2. `src/store/chat-data.js` (New File)
**Responsibility:** The "Repository" for local chat metadata. Handles initialization, saving, and basic CRUD operations for memories.

**Move the following from `data.js`:**
*   `getOpenVaultData()`
*   `getCurrentChatId()`
*   `saveOpenVaultData(expectedChatId)`
*   `generateId()`
*   `updateMemory(id, updates)`
*   `deleteMemory(id)`
*   `deleteCurrentChatData()`

**Imports needed:** `METADATA_KEY, MEMORIES_KEY, CHARACTERS_KEY` from `constants.js`, `getDeps`, `record` from `perf/store.js`, embedding codec imports (for `deleteMemory`), and `purgeSTCollection` from `services/st-vector.js` (used in `deleteCurrentChatData`).

### 3. `src/embeddings/migration.js` (New File)
**Responsibility:** Domain logic for detecting model mismatches, wiping stale embeddings, and managing ST Vector fingerprints. 

**Move the following from `data.js`:**
*   `getStVectorFingerprint()`
*   `stampStVectorFingerprint(data)`
*   `_hasStVectorMismatch(data)`
*   `_hasSyncedItems(data)`
*   `_clearAllStSyncFlags(data)`
*   `invalidateStaleEmbeddings(data, currentModelId)`
*   `_countEmbeddings(data)`
*   `deleteCurrentChatEmbeddings()`

**Imports needed:** `getSTVectorSource`, `getSTVectorRequestBody`, `purgeSTCollection` from `services/st-vector.js`. `getOpenVaultData`, `getCurrentChatId` from `store/chat-data.js`. Various `embedding-codec.js` helpers.

### 4. `src/utils/data.js` (The Deletion)
*   **Delete this file completely.**
*   Update all imports across the codebase (`extract.js`, `retrieve.js`, `embeddings.js`, `events.js`, `ui/settings.js`, etc.) to point to the three new files.

## Execution Order

| Step | Action | Risk | Test Impact |
|------|--------|------|-------------|
| 1 | Create `src/services/st-vector.js` and move API wrappers. | Low | Move `querySTVector`, `syncItemsToST`, etc. tests from `data.test.js` to `tests/services/st-vector.test.js`. Update `st-vector.test.js` imports. |
| 2 | Create `src/store/chat-data.js` and move CRUD logic. | Low | Move `getOpenVaultData`, `saveOpenVaultData`, `updateMemory` tests to `tests/store/chat-data.test.js`. |
| 3 | Create `src/embeddings/migration.js` and move mismatch logic. | Low | Move `invalidateStaleEmbeddings` and fingerprint tests to `tests/embeddings/migration.test.js`. |
| 4 | Update Imports globally. | Medium | Do a global search for `utils/data.js` and replace with specific imports from the new files. |
| 5 | Delete `src/utils/data.js` and `tests/utils/data.test.js`. | Low | Cleanup. |

## Verification

- `npm run test` passes (specifically ensuring Vitest `vi.mock()` paths in `setup.js` or individual test files point to the new file paths).
- Check `extract.js` and `retrieve.js`: they should now import `syncItemsToST` directly from `../services/st-vector.js` and `getOpenVaultData` from `../store/chat-data.js`.
- Check `embeddings.js`: `StVectorStrategy` should import from `services/st-vector.js`.
- Start SillyTavern, perform a manual extraction, and change an embedding model in the UI to ensure `invalidateStaleEmbeddings` (now in `migration.js`) triggers correctly.
- Biome lint/format passes (pre-commit hook).