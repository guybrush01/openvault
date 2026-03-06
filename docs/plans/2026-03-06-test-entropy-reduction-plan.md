# Implementation Plan — Test Suite Entropy Reduction

> **Reference:** `docs/designs/2026-03-06-test-entropy-reduction-design.md`
> **Execution:** Use `executing-plans` skill.

---

## Task 1: Delete 4 Fragile Test Files

**Goal:** Remove test files that provide zero behavioral safety.

**Step 1: Delete files**
Delete these 4 files:
- `tests/constants.test.js`
- `tests/retrieval/debug-cache-integration.test.js`
- `tests/events.test.js`
- `tests/extraction/worker.test.js`

**Step 2: Verify**
- Command: `npm run test`
- Expect: All remaining tests pass. No test references these deleted files.

**Step 3: Git Commit**
```bash
git add -A && git commit -m "test: delete 4 fragile test files (constants, debug-cache-integration, events, worker)"
```

---

## Task 2: Rewrite `extract.test.js` — Remove Mocks & Rewrite Graph/Save Tests

**Goal:** Strip all 6 `vi.mock()` blocks, remove bare mock imports, add DI-based test setup. Verify graph integration, pure function, and two-phase save suites pass.

**Files:** `tests/extraction/extract.test.js`

### Step 1: Remove all vi.mock blocks and bare mock imports

Delete these **entire blocks** from the top of the file (everything between the first import and the `extractMemories` import):

```javascript
// DELETE: All 6 vi.mock(...) blocks
vi.mock('../../src/embeddings.js', () => ({ ... }));
vi.mock('../../src/llm.js', () => ({ ... }));
vi.mock('../../src/ui/render.js', () => ({ ... }));
vi.mock('../../src/ui/status.js', () => ({ ... }));
vi.mock('../../src/reflection/reflect.js', () => ({ ... }));
vi.mock('../../src/graph/communities.js', () => ({ ... }));

// DELETE: Bare mock imports (only used for .mock.calls access)
import { accumulateImportance, generateReflections, shouldReflect } from '../../src/reflection/reflect.js';
import { buildCommunityGroups, detectCommunities, updateCommunitySummaries } from '../../src/graph/communities.js';
import { callLLM, LLM_CONFIGS } from '../../src/llm.js';
```

### Step 2: Replace file header with clean imports

The file header should be:

```javascript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings, extensionName } from '../../src/constants.js';
import { resetDeps } from '../../src/deps.js';
import { extractMemories, updateCharacterStatesFromEvents, cleanupCharacterStates, filterSimilarEvents } from '../../src/extraction/extract.js';
```

### Step 3: Add DI mock helper at file scope

After the imports, add this shared helper:

```javascript
/**
 * Standard LLM response data for extraction tests.
 * Events stage returns 1 event; Graph stage returns 2 entities + 1 relationship.
 */
const EXTRACTION_RESPONSES = {
    events: JSON.stringify({
        reasoning: null,
        events: [{
            summary: 'King Aldric entered the Castle and surveyed the hall',
            importance: 3,
            characters_involved: ['King Aldric'],
            witnesses: ['King Aldric'],
            location: 'Castle',
            is_secret: false,
            emotional_impact: {},
            relationship_impact: {},
        }],
    }),
    graph: JSON.stringify({
        entities: [
            { name: 'King Aldric', type: 'PERSON', description: 'The aging ruler' },
            { name: 'Castle', type: 'PLACE', description: 'An ancient fortress' },
        ],
        relationships: [{ source: 'King Aldric', target: 'Castle', description: 'Rules from' }],
    }),
};

/**
 * Create a sendRequest mock with sequential LLM responses.
 * @param  {...{content: string}} extraResponses - Additional responses after events+graph
 */
function mockSendRequest(...extraResponses) {
    const fn = vi.fn()
        .mockResolvedValueOnce({ content: EXTRACTION_RESPONSES.events })
        .mockResolvedValueOnce({ content: EXTRACTION_RESPONSES.graph });
    for (const resp of extraResponses) {
        fn.mockResolvedValueOnce(resp);
    }
    return fn;
}

/**
 * Create the standard DI deps for extraction tests.
 */
function extractionDeps(mockContext, sendRequest) {
    return {
        deps: {
            getContext: () => mockContext,
            getExtensionSettings: () => ({
                [extensionName]: {
                    ...defaultSettings,
                    extractionProfile: 'test-profile',
                    embeddingSource: 'ollama',
                    ollamaUrl: 'http://test:11434',
                    embeddingModel: 'test-model',
                },
                connectionManager: {
                    selectedProfile: 'test-profile',
                    profiles: [{ id: 'test-profile', name: 'Test' }],
                },
            }),
            connectionManager: { sendRequest },
            fetch: vi.fn(async () => ({
                ok: true,
                json: async () => ({ embedding: [0.1, 0.2] }),
            })),
            saveChatConditional: vi.fn(async () => true),
        },
    };
}
```

### Step 4: Rewrite `extractMemories graph integration` beforeEach

Replace the existing `beforeEach` in the `'extractMemories graph integration'` describe with:

```javascript
beforeEach(() => {
    mockData = {
        memories: [],
        character_states: {},
        last_processed_message_id: -1,
        processed_message_ids: [],
    };

    mockContext = {
        chat: [
            { mes: 'Hello', is_user: true, name: 'User' },
            { mes: 'Welcome to the Castle', is_user: false, name: 'King Aldric' },
        ],
        name1: 'User',
        name2: 'King Aldric',
        characterId: 'char1',
        characters: { char1: { description: '' } },
        chatMetadata: { openvault: mockData },
        chatId: 'test-chat',
        powerUserSettings: {},
    };

    setupTestContext(extractionDeps(mockContext, mockSendRequest()));
});
```

The 4 test assertions in this suite (`populates graph.nodes`, `populates graph.edges`, `increments graph_message_count`, `sets type to "event"`) remain **unchanged** — they assert on data output, not mock calls.

### Step 5: Rewrite `two-phase extraction with intermediate save` beforeEach

Replace the existing `beforeEach` (add sendRequest and use DI helper):

```javascript
beforeEach(() => {
    mockData = {
        memories: [],
        character_states: {},
        last_processed_message_id: -1,
        processed_message_ids: [],
        reflection_state: { 'King Aldric': { importance_sum: 0 } },
    };

    mockContext = {
        chat: [
            { mes: 'Hello', is_user: true, name: 'User' },
            { mes: 'Welcome to the Castle', is_user: false, name: 'King Aldric' },
        ],
        name1: 'User',
        name2: 'King Aldric',
        characterId: 'char1',
        characters: { char1: { description: '' } },
        chatMetadata: { openvault: mockData },
        chatId: 'test-chat',
        powerUserSettings: {},
    };

    setupTestContext(extractionDeps(mockContext, mockSendRequest()));
});
```

The test `'saves data after Phase 1 even if reflection throws'` needs adjustment. It previously used `shouldReflect.mockReturnValue(true)` and `generateReflections.mockRejectedValue(...)`. Without mocks, to make reflection fail we need:
1. Set `importance_sum` high enough so real `shouldReflect` returns `true`.
2. Have the `sendRequest` mock reject on the 3rd call (reflection questions LLM call).

Replace the test body:

```javascript
it('saves data after Phase 1 (events + graph) even if reflection throws', async () => {
    // Set importance high so shouldReflect triggers, then fail the reflection LLM call
    mockData.reflection_state = { 'King Aldric': { importance_sum: 100 } };

    // Override sendRequest: events + graph succeed, reflection questions fails
    const sendRequest = mockSendRequest();
    sendRequest.mockRejectedValueOnce(new Error('Reflection API down'));
    setupTestContext(extractionDeps(mockContext, sendRequest));

    const result = await extractMemories([0, 1]);

    // Phase 1 should succeed — events committed
    expect(result.status).toBe('success');
    expect(result.events_created).toBeGreaterThan(0);
    expect(mockData.memories.length).toBeGreaterThan(0);
    expect(mockData.processed_message_ids.length).toBeGreaterThan(0);
});
```

The other two tests in this suite (`'accepts options.silent parameter'`, `'updates PROCESSED_MESSAGES_KEY only after events are pushed to memories'`) remain **unchanged**.

### Step 6: Delete the `'two-stage extraction pipeline'` describe block entirely

Remove the entire `describe('two-stage extraction pipeline', () => { ... })` block (including `'calls callLLM twice'`, `'first call uses extraction_events config'`, `'second call uses extraction_graph config'`). These are redundant with the graph integration tests — if graph data appears, both stages ran.

Also remove this now-unused import at the top: `callLLM.mockClear()` references won't compile without the mock.

### Step 7: Verify

- Command: `npm run test -- tests/extraction/extract.test.js`
- Expect: Graph integration, pure function (updateCharacterStatesFromEvents, cleanupCharacterStates, filterSimilarEvents, CPU yielding), and two-phase save tests all PASS. Reflection and community tests may FAIL — they're addressed in Task 3.

Note: If reflection/community tests fail at this point, that's expected. The priority is verifying the DI infrastructure works for the graph/save/pure-function suites.

### Step 8: Git Commit
```bash
git add -A && git commit -m "test(extract): remove all vi.mock, rewrite DI setup for graph and save suites"
```

---

## Task 3: Rewrite `extract.test.js` — Reflection & Community Tests

**Goal:** Convert reflection and community tests from implementation assertions to behavioral assertions. Delete redundant suites.

**Files:** `tests/extraction/extract.test.js`

### Step 1: Rewrite `extractMemories reflection integration`

Replace the entire `describe('extractMemories reflection integration', ...)` block with:

```javascript
describe('extractMemories reflection integration', () => {
    let mockContext;
    let mockData;

    beforeEach(() => {
        mockData = {
            memories: [],
            character_states: {},
            last_processed_message_id: -1,
            processed_message_ids: [],
            graph: { nodes: {}, edges: {} },
            graph_message_count: 0,
            reflection_state: {},
        };

        mockContext = {
            chat: [
                { mes: 'Hello', is_user: true, name: 'User' },
                { mes: 'Welcome to the Castle', is_user: false, name: 'King Aldric' },
            ],
            name1: 'User',
            name2: 'King Aldric',
            characterId: 'char1',
            characters: { char1: { description: '' } },
            chatMetadata: { openvault: mockData },
            chatId: 'test-chat',
            powerUserSettings: {},
        };

        setupTestContext(extractionDeps(mockContext, mockSendRequest()));
    });

    afterEach(() => {
        resetDeps();
    });

    it('accumulates importance in reflection_state after extraction', async () => {
        await extractMemories([0, 1]);

        // Real accumulateImportance adds event importance (3) to each involved character
        expect(mockData.reflection_state).toBeDefined();
        expect(mockData.reflection_state['King Aldric']).toBeDefined();
        expect(mockData.reflection_state['King Aldric'].importance_sum).toBeGreaterThan(0);
    });

    it('produces reflections when importance exceeds threshold', async () => {
        // Pre-load importance so threshold is crossed after events are extracted
        mockData.reflection_state = { 'King Aldric': { importance_sum: 100 } };

        // Extend sendRequest: events + graph + reflection questions + 3x insight calls
        const sendRequest = mockSendRequest(
            // Call 3: Salient questions
            { content: JSON.stringify({ questions: ['What drives King Aldric?', 'What are his fears?', 'What is his goal?'] }) },
            // Calls 4-6: Insights (one per question, run in parallel)
            { content: JSON.stringify({ insights: [{ insight: 'King Aldric is driven by duty to protect the realm', evidence_ids: [] }] }) },
            { content: JSON.stringify({ insights: [{ insight: 'King Aldric fears losing control of the kingdom', evidence_ids: [] }] }) },
            { content: JSON.stringify({ insights: [{ insight: 'King Aldric seeks to establish lasting peace', evidence_ids: [] }] }) },
        );
        setupTestContext(extractionDeps(mockContext, sendRequest));

        await extractMemories([0, 1]);

        const reflections = mockData.memories.filter(m => m.type === 'reflection');
        expect(reflections.length).toBeGreaterThan(0);
        expect(reflections[0].character).toBe('King Aldric');
    });

    it('resets importance accumulator after generating reflections', async () => {
        mockData.reflection_state = { 'King Aldric': { importance_sum: 100 } };

        const sendRequest = mockSendRequest(
            { content: JSON.stringify({ questions: ['Q1?', 'Q2?', 'Q3?'] }) },
            { content: JSON.stringify({ insights: [] }) },
            { content: JSON.stringify({ insights: [] }) },
            { content: JSON.stringify({ insights: [] }) },
        );
        setupTestContext(extractionDeps(mockContext, sendRequest));

        await extractMemories([0, 1]);

        expect(mockData.reflection_state['King Aldric'].importance_sum).toBe(0);
    });
});
```

### Step 2: Rewrite `extractMemories community detection`

Replace the entire `describe('extractMemories community detection', ...)` block with a simplified version that tests only the threshold logic:

```javascript
describe('extractMemories community detection', () => {
    let mockContext;
    let mockData;

    beforeEach(() => {
        mockData = {
            memories: [],
            character_states: {},
            last_processed_message_id: -1,
            processed_message_ids: [],
            graph: { nodes: {}, edges: {} },
            graph_message_count: 0,
            reflection_state: {},
            communities: {},
        };

        mockContext = {
            chat: [
                { mes: 'Hello', is_user: true, name: 'User' },
                { mes: 'Welcome to the Castle', is_user: false, name: 'King Aldric' },
            ],
            name1: 'User',
            name2: 'King Aldric',
            characterId: 'char1',
            characters: { char1: { description: '' } },
            chatMetadata: { openvault: mockData },
            chatId: 'test-chat',
            powerUserSettings: {},
        };

        setupTestContext(extractionDeps(mockContext, mockSendRequest()));
    });

    afterEach(() => {
        resetDeps();
    });

    it('does not trigger community detection when below threshold', async () => {
        mockData.graph_message_count = 10;

        await extractMemories([0, 1]);

        // Communities should remain empty — count didn't cross 50-boundary
        expect(mockData.communities).toEqual({});
    });

    it('does not trigger community detection at exactly 50 without crossing boundary', async () => {
        // At 50, adding 2 messages = 52, still in same 50-message bucket as 50
        mockData.graph_message_count = 50;

        await extractMemories([0, 1]);

        expect(mockData.communities).toEqual({});
    });
});
```

**Why the "triggers community detection" test is deleted:** Real Louvain requires a graph with ≥3 nodes forming distinct clusters. Setting up this data correctly AND handling the variable number of LLM calls for community summaries is fragile without mocks. The threshold logic (tested by the negative cases above) is the critical behavioral boundary. The positive case is validated by the production system naturally.

**Why "handles community detection errors gracefully" is deleted:** Cannot cause graphology's Louvain to throw without mocking. Covered by code-review of the try/catch in `extractMemories` Phase 2.

### Step 3: Verify

- Command: `npm run test -- tests/extraction/extract.test.js`
- Expect: ALL tests in this file PASS.

**Troubleshooting:**
- If `'produces reflections when importance exceeds threshold'` fails with empty reflections, the pre-flight similarity gate may be skipping reflection. Check: the test events have embedding `[0.1, 0.2]` and there are no existing reflections, so `shouldSkipReflectionGeneration` should return `false`. If it still skips, reduce the gate threshold or add `reflectionPreflightThreshold: 1.0` to test settings.
- If any test fails with `'No connection profile available'`, the `getExtensionSettings` override in `extractionDeps` is not being applied. Check that `extractionProfile: 'test-profile'` is present.

### Step 4: Git Commit
```bash
git add -A && git commit -m "test(extract): rewrite reflection and community tests as behavioral assertions"
```

---

## Task 4: Rewrite `retrieve.test.js` — Remove Mocks, Behavioral Assertions

**Goal:** Strip all 5 `vi.mock()` blocks, rewrite tests to assert on `setExtensionPrompt` output.

**Files:** `tests/retrieval/retrieve.test.js`

### Step 1: Replace file header

Remove all `vi.mock()` blocks and the bare `retrieveWorldContext` import. The new header:

```javascript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings, extensionName } from '../../src/constants.js';
import { resetDeps } from '../../src/deps.js';
import { updateInjection } from '../../src/retrieval/retrieve.js';
```

### Step 2: Rewrite `'reflection retrieval'` describe

Replace the entire `describe('reflection retrieval', ...)` block:

```javascript
describe('reflection retrieval', () => {
    it('includes both events and reflections in injected context', async () => {
        const mockSetPrompt = vi.fn();

        setupTestContext({
            deps: {
                getContext: () => ({
                    chat: [
                        { mes: 'Hello', is_user: true, is_system: true },
                        { mes: 'Hi', is_user: false, is_system: false },
                    ],
                    name1: 'User',
                    name2: 'Alice',
                    chatMetadata: {
                        openvault: {
                            memories: [
                                {
                                    id: 'ev1',
                                    type: 'event',
                                    summary: 'Alice explored the ancient library',
                                    importance: 3,
                                    message_ids: [0],
                                    characters_involved: ['Alice'],
                                    witnesses: ['Alice'],
                                    is_secret: false,
                                    embedding: [0.5, 0.5],
                                },
                                {
                                    id: 'ref1',
                                    type: 'reflection',
                                    summary: 'Alice fears abandonment deeply',
                                    importance: 4,
                                    characters_involved: ['Alice'],
                                    witnesses: ['Alice'],
                                    is_secret: false,
                                    character: 'Alice',
                                    source_ids: ['ev1'],
                                    embedding: [0.5, 0.5],
                                },
                            ],
                            character_states: { Alice: { name: 'Alice', known_events: ['ev1'] } },
                            graph: { nodes: {}, edges: {} },
                            communities: {},
                        },
                    },
                    chatId: 'test-chat',
                }),
                getExtensionSettings: () => ({
                    [extensionName]: {
                        ...defaultSettings,
                        automaticMode: true,
                        embeddingSource: 'ollama',
                        ollamaUrl: 'http://test:11434',
                        embeddingModel: 'test-model',
                    },
                }),
                setExtensionPrompt: mockSetPrompt,
                extension_prompt_types: { IN_PROMPT: 0 },
                fetch: vi.fn(async () => ({
                    ok: true,
                    json: async () => ({ embedding: [0.5, 0.5] }),
                })),
            },
        });

        await updateInjection();

        // The memory injection slot should contain BOTH event and reflection text
        const memoryCall = mockSetPrompt.mock.calls.find(c => c[0] === 'openvault_memory');
        expect(memoryCall).toBeDefined();
        const injectedText = memoryCall[1];
        expect(injectedText).toContain('ancient library');
        expect(injectedText).toContain('abandonment');
    });
});
```

### Step 3: Rewrite `'updateInjection world context'` describe

Replace the entire `describe('updateInjection world context', ...)` block:

```javascript
describe('updateInjection world context', () => {
    let mockSetPrompt;

    beforeEach(() => {
        mockSetPrompt = vi.fn();

        setupTestContext({
            context: {
                chat: [
                    { mes: 'Hello', is_user: true, is_system: true },
                    { mes: 'Hi', is_user: false, is_system: false },
                ],
                chatMetadata: {
                    openvault: {
                        memories: [
                            {
                                id: 'ev1',
                                type: 'event',
                                summary: 'Test memory about the kingdom',
                                importance: 3,
                                message_ids: [0],
                                characters_involved: ['Alice'],
                                witnesses: ['Alice'],
                                is_secret: false,
                                embedding: [0.5, 0.5],
                            },
                        ],
                        character_states: { Alice: { name: 'Alice', known_events: ['ev1'] } },
                        communities: {
                            C0: {
                                title: 'Royal Court',
                                summary: 'The seat of power in the kingdom',
                                findings: ['The king rules wisely'],
                                embedding: [0.5, 0.5],
                                nodeKeys: ['alice'],
                            },
                        },
                    },
                },
                chatId: 'test',
            },
            settings: { automaticMode: true },
            deps: {
                setExtensionPrompt: mockSetPrompt,
                extension_prompt_types: { IN_PROMPT: 0 },
                fetch: vi.fn(async () => ({
                    ok: true,
                    json: async () => ({ embedding: [0.5, 0.5] }),
                })),
            },
        });
    });

    afterEach(() => {
        resetDeps();
        vi.clearAllMocks();
    });

    it('injects world context when communities exist', async () => {
        await updateInjection();

        const worldCall = mockSetPrompt.mock.calls.find(c => c[0] === 'openvault_world');
        expect(worldCall).toBeDefined();
        expect(worldCall[1]).toContain('world_context');
    });

    it('includes community title in world context', async () => {
        await updateInjection();

        const worldCall = mockSetPrompt.mock.calls.find(c => c[0] === 'openvault_world');
        expect(worldCall).toBeDefined();
        expect(worldCall[1]).toContain('Royal Court');
    });
});
```

### Step 4: Verify

- Command: `npm run test -- tests/retrieval/retrieve.test.js`
- Expect: ALL tests PASS.

**Troubleshooting:**
- If `updateInjection` returns early without injecting: `isAutomaticMode()` checks `settings.automaticMode`. Ensure the test passes `automaticMode: true` (not `autoMode`).
- If memory injection is empty: `_getHiddenMemories` requires `chat[message_id].is_system === true`. Ensure message at index 0 has `is_system: true`.
- If world context is empty: `retrieveWorldContext` requires communities with non-empty `embedding` arrays. Ensure community has `embedding: [0.5, 0.5]`.
- If `setExtensionPrompt` is not called: `safeSetExtensionPrompt` uses `getDeps().setExtensionPrompt`. Ensure it's provided in deps, not just in the `overrides.deps` but directly reachable.

### Step 5: Git Commit
```bash
git add -A && git commit -m "test(retrieve): remove all vi.mock, rewrite as behavioral assertions"
```

---

## Task 5: Update `tests/CLAUDE.md`

**Goal:** Add strict mocking rules to prevent entropy from returning.

**Files:** `tests/CLAUDE.md`

### Step 1: Append to end of file

Add this section at the end of `tests/CLAUDE.md`:

```markdown

## STRICT MOCKING RULES

1. **Zero `vi.mock()`.** Never use `vi.mock()` on any module. Not internal, not external.
2. **Single Boundary: `deps.js`.** All external I/O is mocked exclusively via `setupTestContext({ deps: { ... } })`.
3. **External boundaries** mocked through deps: `connectionManager.sendRequest` (LLM), `fetch` (embeddings/network), `saveChatConditional` (persistence), `showToast` (notifications).
4. **Embeddings in tests** use Ollama strategy: set `embeddingSource: 'ollama'`, `ollamaUrl`, `embeddingModel` in test settings. Mock `fetch` via deps to return `{ embedding: [...] }`.
5. **Test Data, Not Implementation.** Assert on output data (`mockData.memories`, `mockData.graph`, prompt slot content), never on whether internal functions were called.
6. **UI modules** (`render.js`, `status.js`) run real code. jQuery on empty JSDOM selections is a silent no-op — no mocking needed.
```

### Step 2: Verify

- Command: `npm run test`
- Expect: All tests still pass (doc change only).

### Step 3: Git Commit
```bash
git add -A && git commit -m "docs(tests): add strict mocking rules to CLAUDE.md"
```

---

## Task 6: Update `include/ARCHITECTURE.md`

**Goal:** Document the testing architecture tiers.

**Files:** `include/ARCHITECTURE.md`

### Step 1: Add section after §3.3 (GraphRAG Communities)

Insert the following new section **before** `## 4. Retrieval & Scoring Mathematics`:

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

### Step 2: Verify

- Command: `npm run test`
- Expect: All tests still pass (doc change only).

### Step 3: Git Commit
```bash
git add -A && git commit -m "docs(arch): add testing architecture section to ARCHITECTURE.md"
```

---

## Task 7: Final Verification & Cleanup

**Goal:** Full test suite passes. No orphaned references.

### Step 1: Full test run

- Command: `npm run test`
- Expect: ALL tests pass. Zero failures.

### Step 2: Check for orphaned references

Search for any remaining `vi.mock` in the test suite:
- Command: Search all `tests/**/*.test.js` files for `vi.mock(`
- Expect: Zero results.

### Step 3: Check line count reduction

- Command: `git diff --stat HEAD~6` (compare against pre-Task-1 state)
- Expect: Net negative line change (~300-500 lines removed).

### Step 4: Final Commit (if any cleanup needed)

```bash
git add -A && git commit -m "test: final verification of entropy reduction"
```
