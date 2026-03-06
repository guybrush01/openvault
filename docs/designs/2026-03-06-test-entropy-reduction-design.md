# Design: Test Suite Entropy Reduction

## 1. Problem Statement

The test suite has accumulated structural coupling that provides false confidence while increasing maintenance burden:

- **4 test files (~365 lines)** verify tautologies, import mechanics, or implementation details — zero behavioral safety.
- **11 `vi.mock()` calls** across `extract.test.js` (6) and `retrieve.test.js` (5) mock internal modules, coupling tests to file structure rather than behavior.
- **No documented boundary** prevents this pattern from recurring.

## 2. Goals & Non-Goals

### Goals
- Delete test files that provide zero behavioral safety
- Remove **every** `vi.mock()` call — route all I/O through `deps.js` exclusively
- Convert implementation-detail assertions ("FunctionA called FunctionB") to behavioral assertions ("given state X, system produces data Y")
- Update `tests/CLAUDE.md` and `include/ARCHITECTURE.md` to codify the single-boundary rule

### Non-Goals
- Adding new test coverage
- Refactoring source code to improve testability
- Changing test framework or runner config
- Adding integration tests for worker or event wiring

---

## 3. Proposed Architecture

### Single Mock Boundary

All test mocking flows through exactly one mechanism: `setupTestContext()` → `setDeps()`.

```
Before (scattered mocks):          After (single boundary):

┌──────────────┐                    ┌──────────────┐
│  Test File   │                    │  Test File   │
│              │                    │              │
│ vi.mock(A)   │                    │ setupTest-   │
│ vi.mock(B)   │                    │  Context({   │
│ vi.mock(C)   │                    │   deps: {…}  │
│ vi.mock(D)   │                    │  })          │
│ vi.mock(E)   │                    │              │
│ vi.mock(F)   │                    └──────┬───────┘
└──────┬───────┘                           │
       │ imports                           │ real imports
  ┌────┴─────┐                        ┌────┴─────┐
  │  Mocked  │                        │   Real   │
  │ modules  │                        │ modules  │
  └──────────┘                        └────┬─────┘
                                           │ getDeps()
                                      ┌────┴─────┐
                                      │  deps.js │ ← sole mock point
                                      │  stubs   │
                                      └──────────┘
```

### What Gets Mocked (via deps.js)

| Boundary          | Dep Key                          | Mock Behavior                                        |
|-------------------|----------------------------------|------------------------------------------------------|
| LLM API           | `connectionManager.sendRequest`  | Sequential `.mockResolvedValueOnce()` per LLM call   |
| Embedding API     | `fetch`                          | Returns `{ embedding: [0.1, 0.2] }` (Ollama format) |
| ST Context        | `getContext`                     | Test chat data                                       |
| ST Settings       | `getExtensionSettings`           | Test settings with `embeddingSource: 'ollama'`       |
| ST Prompt Slot    | `setExtensionPrompt`             | `vi.fn()` — assert on calls for behavioral checks    |
| Persistence       | `saveChatConditional`            | Resolves `true`                                      |
| Notifications     | `showToast`                      | No-op                                                |

### What Runs Real Code

| Module                   | Why It Works Without Mocking                                                 |
|--------------------------|-----------------------------------------------------------------------------|
| `scoring.js`             | Pure math — cosine similarity, BM25, decay curves                          |
| `formatting.js`          | Pure data transformation — formats memories into prompt text                |
| `world-context.js`       | Orchestrator — calls `callLLM` which hits mocked `connectionManager`       |
| `reflect.js`             | Orchestrator — calls `callLLM` which hits mocked `connectionManager`       |
| `communities.js`         | Graph algorithm (graphology already aliased in vitest.config.js) + LLM     |
| `embeddings.js`          | OllamaStrategy routes through `getDeps().fetch()` — no ML model loading   |
| `ui/render.js`           | jQuery on empty JSDOM selections — silent no-ops                           |
| `ui/status.js`           | jQuery on empty JSDOM selections — silent no-ops                           |
| `llm.js` (`callLLM`)    | Uses `getDeps().connectionManager.sendRequest()` — hits mock               |

---

## 4. Change Manifest

### Phase 1: Deletions (4 files)

| File                                         | Lines | Reason                                                              |
|----------------------------------------------|-------|---------------------------------------------------------------------|
| `tests/constants.test.js`                    | ~30   | Tautology — tests if array keys match object keys                   |
| `tests/retrieval/debug-cache-integration.test.js` | ~15 | Tests that the `import` keyword works                              |
| `tests/events.test.js`                       | ~70   | Mock-heavy — asserts `onMessageReceived` calls `wakeUpBackgroundWorker` |
| `tests/extraction/worker.test.js`            | ~250  | Fragile `vi.useFakeTimers` + `vi.resetModules` for async loop       |

### Phase 2: Mock Removal — `extract.test.js`

**Remove all 6 `vi.mock()` blocks:**
1. `vi.mock('../../src/embeddings.js', ...)`
2. `vi.mock('../../src/llm.js', ...)`
3. `vi.mock('../../src/ui/render.js', ...)`
4. `vi.mock('../../src/ui/status.js', ...)`
5. `vi.mock('../../src/reflection/reflect.js', ...)`
6. `vi.mock('../../src/graph/communities.js', ...)`

**Remove bare mock imports** (these exist only to access `.mock.calls`):
- `import { accumulateImportance, generateReflections, shouldReflect } from '../../src/reflection/reflect.js';`
- `import { buildCommunityGroups, detectCommunities, updateCommunitySummaries } from '../../src/graph/communities.js';`
- `import { callLLM, LLM_CONFIGS } from '../../src/llm.js';`

**Keep direct imports** for functions under test:
- `import { extractMemories, updateCharacterStatesFromEvents, cleanupCharacterStates, filterSimilarEvents } from '../../src/extraction/extract.js';`

### Phase 3: Mock Removal — `retrieve.test.js`

**Remove all 5 `vi.mock()` blocks:**
1. `vi.mock('../../src/embeddings.js', ...)`
2. `vi.mock('../../src/embeddings/strategies.js', ...)`
3. `vi.mock('../../src/retrieval/scoring.js', ...)`
4. `vi.mock('../../src/retrieval/formatting.js', ...)`
5. `vi.mock('../../src/retrieval/world-context.js', ...)`

**Remove bare mock import:**
- `import { retrieveWorldContext } from '../../src/retrieval/world-context.js';`

### Phase 4: Doc Updates

Files modified:
- `tests/CLAUDE.md`
- `include/ARCHITECTURE.md`

---

## 5. Mock Pattern: The `connectionManager` Dispatcher

The key insight: `callLLM` calls `connectionManager.sendRequest(profileId, messages, maxTokens, options, extra)`. By controlling `sendRequest` return values sequentially, we simulate the multi-stage extraction pipeline.

### Extract Test Setup

```javascript
beforeEach(() => {
    const sendRequest = vi.fn()
        // Call 1: Event extraction
        .mockResolvedValueOnce({
            content: JSON.stringify({
                reasoning: null,
                events: [{
                    summary: 'King Aldric entered the Castle',
                    importance: 3,
                    characters_involved: ['King Aldric'],
                }],
            }),
        })
        // Call 2: Graph extraction
        .mockResolvedValueOnce({
            content: JSON.stringify({
                entities: [
                    { name: 'King Aldric', type: 'PERSON', description: 'The aging ruler' },
                    { name: 'Castle', type: 'PLACE', description: 'An ancient fortress' },
                ],
                relationships: [{ source: 'King Aldric', target: 'Castle', description: 'Rules from' }],
            }),
        });

    setupTestContext({
        context: { /* chat, names, chatMetadata */ },
        settings: {
            extractionProfile: 'test-profile',
            embeddingSource: 'ollama',
            ollamaUrl: 'http://test:11434',
            embeddingModel: 'test-model',
        },
        deps: {
            connectionManager: { sendRequest },
            fetch: vi.fn(async () => ({
                ok: true,
                json: async () => ({ embedding: [0.1, 0.2] }),
            })),
            saveChatConditional: vi.fn(async () => true),
        },
    });
});
```

### Embedding Route

```
Test settings: embeddingSource = 'ollama'
                   ↓
embeddings.js → OllamaStrategy.getDocumentEmbedding(text)
                   ↓
getDeps().fetch('http://test:11434/api/embeddings', { body: { prompt: text } })
                   ↓
Mock fetch returns { embedding: [0.1, 0.2] }
```

TransformersStrategy is never instantiated for the `'ollama'` source key. No ML model loading occurs.

### Reflection/Community Extension

Tests that exercise reflection or community paths add more `.mockResolvedValueOnce()` entries:

```javascript
sendRequest
    .mockResolvedValueOnce({ content: '...' })  // events
    .mockResolvedValueOnce({ content: '...' })  // graph
    .mockResolvedValueOnce({ content: '...' })  // reflection: salient questions
    .mockResolvedValueOnce({ content: '...' })  // reflection: insights
    .mockResolvedValueOnce({ content: '...' }); // community summary (if triggered)
```

### Simulating Failures

```javascript
sendRequest
    .mockResolvedValueOnce({ content: '...' })  // events (succeeds)
    .mockResolvedValueOnce({ content: '...' })  // graph (succeeds)
    .mockRejectedValueOnce(new Error('API down'));  // reflection (throws)
```

---

## 6. Test Assertion Migration

### extract.test.js — Reflection Suite

| Current (Implementation)                                    | New (Behavioral)                                                       |
|------------------------------------------------------------|------------------------------------------------------------------------|
| `expect(accumulateImportance).toHaveBeenCalled()`          | `expect(mockData.reflection_state['King Aldric'].importance_sum).toBeGreaterThan(0)` |
| `shouldReflect.mockReturnValue(true)` + `expect(generateReflections).toHaveBeenCalled()` | Set `importance_sum >= threshold` in test data, add reflection LLM responses to `sendRequest`, assert `mockData.memories.some(m => m.type === 'reflection')` |
| `expect(charState.importance_sum).toBe(0)` (after mock)   | Same assertion — importance_sum should reset after real reflection runs |

### extract.test.js — Community Suite

| Current (Implementation)                                           | New (Behavioral)                                                     |
|-------------------------------------------------------------------|----------------------------------------------------------------------|
| `expect(detectCommunities).toHaveBeenCalledWith(graph, charNames)` | `expect(Object.keys(mockData.communities).length).toBeGreaterThan(0)` |
| `expect(detectCommunities).not.toHaveBeenCalled()`                | `expect(mockData.communities).toEqual({})` or unchanged              |
| `detectCommunities.mockImplementation(() => { throw ... })`       | **DELETE** — cannot reliably cause graphology Louvain to throw       |

### extract.test.js — Two-Stage Pipeline Suite

| Current (Implementation)                       | Decision                                                    |
|------------------------------------------------|-------------------------------------------------------------|
| `expect(callLLM).toHaveBeenCalledTimes(2)`     | **DELETE suite** — redundant with graph integration tests    |
| `expect(callLLM.mock.calls[0][1]).toBe(cfg)`   | Behavior already proven by: events exist + graph populated   |

### retrieve.test.js

| Current (Implementation)                                          | New (Behavioral)                                                     |
|------------------------------------------------------------------|----------------------------------------------------------------------|
| `expect(selectRelevantMemories.mock.calls[0][0]).toContain(...)` | Assert `setExtensionPrompt` call content includes both event and reflection text |
| `expect(retrieveWorldContext).toHaveBeenCalled()`                | Assert `setExtensionPrompt` was called with slot `'openvault_world'` containing community text |
| `expect(worldCall[1]).toContain('world_context')`                | Same — already behavioral, just needs real code to produce the output |

---

## 7. Documentation Updates

### tests/CLAUDE.md — Add Section

```markdown
## STRICT MOCKING RULES

1. **Zero `vi.mock()`.** Never use `vi.mock()` on any module. Not internal, not external.
2. **Single Boundary: `deps.js`.** All external I/O is mocked exclusively via `setupTestContext({ deps: { ... } })`.
3. **External boundaries** mocked through deps: `connectionManager.sendRequest` (LLM), `fetch` (embeddings/network), `saveChatConditional` (persistence), `showToast` (notifications).
4. **Embeddings in tests** use Ollama strategy: set `embeddingSource: 'ollama'`, `ollamaUrl`, `embeddingModel` in test settings. Mock `fetch` via deps to return `{ embedding: [...] }`.
5. **Test Data, Not Implementation.** Assert on output data (`mockData.memories`, `mockData.graph`, prompt slot content), never on whether internal functions were called.
6. **UI modules** (`render.js`, `status.js`) run real code. jQuery on empty JSDOM selections is a silent no-op — no mocking needed.
```

### include/ARCHITECTURE.md — Add to Section 3 (Core Modules)

After §3.3 (GraphRAG Communities), add:

```markdown
### 3.4. Testing Architecture

The codebase separates into two testability tiers:

**Tier 1: Pure Data Transformations (unit-tested)**
Modules with no external I/O. Tests feed data in, assert data out.
- `src/retrieval/math.js` — scoring curves, BM25, cosine similarity
- `src/retrieval/formatting.js` — memory → prompt text
- `src/ui/helpers.js` — UI data preparation
- `src/extraction/extract.js` (pure functions: `filterSimilarEvents`, `updateCharacterStatesFromEvents`, `cleanupCharacterStates`)
- `src/graph/` — graph operations, token overlap, community algorithms

**Tier 2: Orchestrators (integration-tested via deps.js boundary)**
Modules that coordinate I/O through `getDeps()`. Tests provide mock boundaries and assert on final data state.
- `src/extraction/extract.js` (`extractMemories`) — tested with mock `connectionManager` + `fetch`
- `src/retrieval/retrieve.js` — tested with mock `connectionManager` + `fetch` + `setExtensionPrompt`
- `src/reflection/reflect.js` — runs real code in extract tests, hits mock LLM boundary

**Intentionally Untested:**
- `src/extraction/worker.js` — infinite async loop with interruptible sleep; mock complexity exceeds value
- `src/main.js` (event wiring) — wiring ST events to handlers; testing implementation details
```

---

## 8. Risks & Edge Cases

### R1: `callLLM` Error Handling Path
`callLLM` calls `showToast()` from `utils.js` on failure. This chains to `getDeps().showToast` or global `toastr`. Both are stubbed. **Risk: None.**

### R2: `embeddings.js` Module-Level Initialization
At import time, `embeddings.js` creates strategy instances (`new TransformersStrategy()`, `new OllamaStrategy()`). These constructors only set internal fields — no I/O. **Risk: None.**

### R3: Community Detection Needs Sufficient Graph Data
Real Louvain algorithm requires ≥2 connected nodes to detect communities. Tests exercising community detection must provide enough graph nodes/edges in `mockData.graph`. If the graph is too sparse, Louvain returns null and the test silently passes without exercising the community path. **Mitigation:** Community tests should pre-populate `mockData.graph` with ≥4 connected nodes across ≥2 clusters.

### R4: `parseReasoningFromString` in `callLLM`
`callLLM` optionally calls `context.parseReasoningFromString(content)`. Test contexts typically don't provide this, so `callLLM` falls through to returning raw content. **Risk: None.**

### R5: `getExtensionSettings` Shape
`callLLM` reads `extension_settings.connectionManager.selectedProfile` as a fallback. The `setupTestContext` helper must ensure `getExtensionSettings()` returns both `[extensionName]` settings AND `connectionManager.profiles`. If omitted, `callLLM` throws "No connection profile available." **Mitigation:** Documented in §5 mock pattern; enforce in CLAUDE.md rules.

### R6: Real Scoring in retrieve.test.js
With mocked `selectRelevantMemories` removed, real scoring runs. It needs: (a) query embeddings from mock fetch, (b) memory embeddings pre-populated in test data, (c) sufficient chat length for decay calculations. Tests must provide complete memory objects with `embedding`, `importance`, `message_ids` fields. **Mitigation:** Test data in `setupTestContext` already includes these fields.

### R7: Deleted Test — "handles community detection errors gracefully"
Cannot reliably cause graphology's Louvain to throw without mocking. This edge case (malformed graph causing Louvain crash) is protected by the existing `try/catch` in `extractMemories` Phase 2 — the catch is visible in code review and the Phase 1 save guarantees data safety. **Accepted risk.**

---

## 9. Execution Order

1. **Delete** 4 test files
2. **Refactor** `extract.test.js` — remove mocks, rewrite assertions
3. **Refactor** `retrieve.test.js` — remove mocks, rewrite assertions
4. **Run** `npm run test` — verify all remaining tests pass
5. **Update** `tests/CLAUDE.md`
6. **Update** `include/ARCHITECTURE.md`
7. **Final** `npm run test` — confirm no regressions
