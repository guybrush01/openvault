# Ladder Queue (AIMD Concurrency) Implementation Plan

**Goal:** Add dynamic AIMD concurrency for Phase 2 enrichment operations via p-queue.

**Architecture:** A `createLadderQueue` wrapper around p-queue implements Additive Increase / Multiplicative Decrease concurrency scaling. Phase 2 loops in communities, edge consolidation, and reflection generation are refactored from sequential `for...of` + `await` to `ladderQueue.add()` + `Promise.all()`. A `maxConcurrency` user setting (default `1`) caps parallelism, protecting local-LLM users.

**Tech Stack:** p-queue v8 (CDN via `cdnImport`), Vitest + JSDOM

---

### Task 1: Install p-queue and register test override

**Files:**
- Modify: `package.json`
- Modify: `tests/setup.js`

- [ ] Step 1: Add p-queue to devDependencies in `package.json`

Add to the `devDependencies` object:

```json
"p-queue": "^8.0.0"
```

- [ ] Step 2: Install the dependency

Run: `npm install`
Expected: Clean install, lock file updated

- [ ] Step 3: Register p-queue CDN test override in `tests/setup.js`

Add `'p-queue'` to the `CDN_SPECS` object (after the existing entries):

```javascript
const CDN_SPECS = {
    zod: () => import('zod'),
    jsonrepair: () => import('jsonrepair'),
    'snowball-stemmers': () => import('snowball-stemmers'),
    stopword: () => import('stopword'),
    graphology: () => import('graphology'),
    'graphology-communities-louvain': () => import('graphology-communities-louvain'),
    'graphology-operators': () => import('graphology-operators'),
    'gpt-tokenizer/encoding/o200k_base': () => import('gpt-tokenizer/encoding/o200k_base'),
    'p-queue': () => import('p-queue'),
};
```

- [ ] Step 4: Verify existing test suite passes

Run: `npm test`
Expected: All existing tests pass (no regressions)

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "chore: add p-queue dependency and register test override"
```

---

### Task 2: Add maxConcurrency to defaultSettings

**Files:**
- Modify: `src/constants.js`
- Test: `tests/constants.test.js`

- [ ] Step 1: Write the failing test

Add to `tests/constants.test.js`:

```javascript
describe('Concurrency Settings', () => {
    it('should have maxConcurrency in defaultSettings with default of 1', () => {
        expect(defaultSettings.maxConcurrency).toBe(1);
    });

    it('should have maxConcurrency in UI_DEFAULT_HINTS', () => {
        expect(UI_DEFAULT_HINTS.maxConcurrency).toBeDefined();
        expect(UI_DEFAULT_HINTS.maxConcurrency).toBe(1);
    });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npm test -- tests/constants.test.js`
Expected: FAIL — `defaultSettings.maxConcurrency` is undefined

- [ ] Step 3: Add maxConcurrency to `src/constants.js`

In `defaultSettings`, add after the `backfillMaxRPM` line:

```javascript
    backfillMaxRPM: 20,
    // Concurrency settings (Phase 2 parallelism)
    maxConcurrency: 1, // Default to 1 to protect local/VRAM-bound LLM users
```

In `UI_DEFAULT_HINTS`, add inside the `// Features` section:

```javascript
    maxConcurrency: defaultSettings.maxConcurrency,
```

- [ ] Step 4: Run test to verify it passes

Run: `npm test -- tests/constants.test.js`
Expected: PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: add maxConcurrency to defaultSettings"
```

---

### Task 3: createLadderQueue — basic execution

**Files:**
- Create: `tests/utils/queue.test.js`
- Create: `src/utils/queue.js`

- [ ] Step 1: Write the failing tests

Create `tests/utils/queue.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { createLadderQueue } from '../../src/utils/queue.js';

describe('createLadderQueue', () => {
    describe('basic execution', () => {
        it('should execute a single task and return its result', async () => {
            const queue = await createLadderQueue(1);
            const result = await queue.add(async () => 42);
            expect(result).toBe(42);
        });

        it('should execute multiple tasks', async () => {
            const queue = await createLadderQueue(2);
            const results = [];
            const promises = [
                queue.add(async () => { results.push('a'); return 'a'; }),
                queue.add(async () => { results.push('b'); return 'b'; }),
                queue.add(async () => { results.push('c'); return 'c'; }),
            ];
            await Promise.all(promises);
            expect(results).toHaveLength(3);
            expect(results).toContain('a');
            expect(results).toContain('b');
            expect(results).toContain('c');
        });

        it('should report concurrency via getter', async () => {
            const queue = await createLadderQueue(3);
            expect(queue.concurrency).toBe(3);
        });

        it('should resolve onIdle when queue is empty', async () => {
            const queue = await createLadderQueue(1);
            await queue.add(async () => 'done');
            await queue.onIdle();
            // If we reach here without hanging, the test passes
            expect(true).toBe(true);
        });

        it('should default maxConcurrency to 1 when undefined', async () => {
            const queue = await createLadderQueue(undefined);
            expect(queue.concurrency).toBe(1);
        });
    });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npm test -- tests/utils/queue.test.js`
Expected: FAIL — module `../../src/utils/queue.js` does not exist

- [ ] Step 3: Write minimal implementation

Create `src/utils/queue.js`:

```javascript
/**
 * AIMD Ladder Queue
 *
 * Wraps p-queue with Additive Increase / Multiplicative Decrease concurrency control.
 * On success: slowly climbs concurrency back toward the user-set ceiling.
 * On 429/timeout: halves concurrency and pauses the queue for a cooloff period.
 *
 * Used by Phase 2 enrichment loops (communities, reflections, edge consolidation).
 * Phase 1 (event → graph extraction) is always sequential — do NOT use this there.
 */

import { cdnImport } from './cdn.js';
import { logDebug, logWarn } from './logging.js';

/** @type {typeof import('p-queue').default | null} */
let PQueue;

/** Cooloff period in ms when rate-limited */
const RATE_LIMIT_COOLOFF_MS = 4000;

/**
 * Creates an AIMD-governed task queue.
 *
 * @param {number} [maxConcurrency=1] - Absolute ceiling for parallel tasks.
 *   Defaults to 1 (sequential) to protect local/VRAM-bound LLM users.
 * @returns {Promise<{ add: Function, onIdle: Function, concurrency: number }>}
 */
export async function createLadderQueue(maxConcurrency = 1) {
    if (!PQueue) {
        const module = await cdnImport('p-queue');
        PQueue = module.default;
    }

    const ceiling = Math.max(1, maxConcurrency);
    const queue = new PQueue({ concurrency: ceiling });

    const add = async (taskFn) => {
        return queue.add(async () => {
            const result = await taskFn();
            return result;
        });
    };

    return {
        add,
        onIdle: () => queue.onIdle(),
        get concurrency() { return queue.concurrency; },
    };
}
```

- [ ] Step 4: Run test to verify it passes

Run: `npm test -- tests/utils/queue.test.js`
Expected: PASS (5 tests)

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: createLadderQueue with basic p-queue execution"
```

---

### Task 4: createLadderQueue — AIMD decrease and increase

**Files:**
- Modify: `tests/utils/queue.test.js`
- Modify: `src/utils/queue.js`

- [ ] Step 1: Write the failing tests

Add to `tests/utils/queue.test.js`:

```javascript
    describe('AIMD behavior', () => {
        it('should halve concurrency on rate-limit error (multiplicative decrease)', async () => {
            const queue = await createLadderQueue(4);
            expect(queue.concurrency).toBe(4);

            // Task that throws a 429 error
            try {
                await queue.add(async () => {
                    throw new Error('429 Too Many Requests');
                });
            } catch {
                // Expected to throw
            }

            // Concurrency should have halved: floor(4/2) = 2
            expect(queue.concurrency).toBe(2);
        });

        it('should halve concurrency on timeout error', async () => {
            const queue = await createLadderQueue(4);

            try {
                await queue.add(async () => {
                    throw new Error('Request timeout after 60000ms');
                });
            } catch {
                // Expected
            }

            expect(queue.concurrency).toBe(2);
        });

        it('should not drop below concurrency 1', async () => {
            const queue = await createLadderQueue(2);

            // First 429: 2 -> 1
            try { await queue.add(async () => { throw new Error('429'); }); } catch {}
            expect(queue.concurrency).toBe(1);

            // Second 429: stays at 1
            try { await queue.add(async () => { throw new Error('429'); }); } catch {}
            expect(queue.concurrency).toBe(1);
        });

        it('should increase concurrency on success (additive increase)', async () => {
            const queue = await createLadderQueue(4);

            // Drop to 2 first
            try { await queue.add(async () => { throw new Error('429'); }); } catch {}
            expect(queue.concurrency).toBe(2);

            // Each success adds 0.5 to the internal limit (floor rounds down)
            // currentLimit starts at 2.0
            await queue.add(async () => 'ok'); // 2.0 + 0.5 = 2.5, floor = 2
            expect(queue.concurrency).toBe(2);

            await queue.add(async () => 'ok'); // 2.5 + 0.5 = 3.0, floor = 3
            expect(queue.concurrency).toBe(3);

            await queue.add(async () => 'ok'); // 3.0 + 0.5 = 3.5, floor = 3
            expect(queue.concurrency).toBe(3);

            await queue.add(async () => 'ok'); // 3.5 + 0.5 = 4.0, floor = 4
            expect(queue.concurrency).toBe(4);
        });

        it('should never exceed maxConcurrency ceiling', async () => {
            const queue = await createLadderQueue(3);

            // Many successes should not push above 3
            for (let i = 0; i < 10; i++) {
                await queue.add(async () => 'ok');
            }
            expect(queue.concurrency).toBe(3);
        });

        it('should not apply AIMD to non-rate-limit errors', async () => {
            const queue = await createLadderQueue(4);

            try {
                await queue.add(async () => {
                    throw new Error('Some random LLM parsing error');
                });
            } catch {
                // Expected
            }

            // Concurrency unchanged — only 429/timeout triggers AIMD
            expect(queue.concurrency).toBe(4);
        });

        it('should re-throw errors from tasks', async () => {
            const queue = await createLadderQueue(1);

            await expect(
                queue.add(async () => { throw new Error('task failed'); })
            ).rejects.toThrow('task failed');
        });
    });
```

- [ ] Step 2: Run test to verify it fails

Run: `npm test -- tests/utils/queue.test.js`
Expected: FAIL — concurrency doesn't change (no AIMD logic yet)

- [ ] Step 3: Implement AIMD logic

Replace the `add` function in `src/utils/queue.js`:

```javascript
    let currentLimit = ceiling;

    const add = async (taskFn) => {
        return queue.add(async () => {
            try {
                const result = await taskFn();

                // Additive Increase: slowly climb back up on success
                if (currentLimit < ceiling) {
                    currentLimit = Math.min(ceiling, currentLimit + 0.5);
                    queue.concurrency = Math.floor(currentLimit);
                }

                return result;
            } catch (error) {
                if (isRateLimitError(error)) {
                    // Multiplicative Decrease: drop the ladder
                    currentLimit = Math.max(1, Math.floor(currentLimit / 2));
                    queue.concurrency = Math.floor(currentLimit);
                    logWarn(`Rate limit hit. Dropping concurrency to ${queue.concurrency}`);
                }

                throw error;
            }
        });
    };
```

And add the helper function (before `createLadderQueue`):

```javascript
/**
 * Detect rate-limit or timeout errors.
 * @param {Error} error
 * @returns {boolean}
 */
function isRateLimitError(error) {
    return (
        error.status === 429 ||
        error.message?.includes('429') ||
        error.message?.includes('timeout')
    );
}
```

- [ ] Step 4: Run test to verify it passes

Run: `npm test -- tests/utils/queue.test.js`
Expected: PASS (all tests including new AIMD tests)

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: add AIMD concurrency scaling to ladder queue"
```

---

### Task 5: createLadderQueue — pause on rate limit

**Files:**
- Modify: `tests/utils/queue.test.js`
- Modify: `src/utils/queue.js`

- [ ] Step 1: Write the failing test

Add to the `AIMD behavior` describe block in `tests/utils/queue.test.js`:

```javascript
        it('should pause queue on rate limit and resume after cooloff', async () => {
            vi.useFakeTimers();
            const queue = await createLadderQueue(4);
            const log = [];

            // Task 1: will succeed
            const p1 = queue.add(async () => { log.push('t1'); return 1; });
            await p1;

            // Task 2: triggers rate limit → queue pauses
            const p2 = queue.add(async () => {
                throw new Error('429 Too Many Requests');
            }).catch(() => { log.push('t2-err'); });

            await p2;

            // Task 3: queued while paused — should not run until resume
            const p3 = queue.add(async () => { log.push('t3'); return 3; });

            // Advance past cooloff (4 seconds)
            await vi.advanceTimersByTimeAsync(4500);
            await p3;

            expect(log).toContain('t1');
            expect(log).toContain('t2-err');
            expect(log).toContain('t3');

            vi.useRealTimers();
        });

        it('should not pause more than once concurrently', async () => {
            vi.useFakeTimers();
            const queue = await createLadderQueue(4);

            // Two rapid 429 errors
            const p1 = queue.add(async () => { throw new Error('429'); }).catch(() => {});
            await p1;
            const p2 = queue.add(async () => { throw new Error('429'); }).catch(() => {});

            // Advance past cooloff
            await vi.advanceTimersByTimeAsync(5000);
            await p2;

            // Should reach here without hanging
            expect(queue.concurrency).toBeGreaterThanOrEqual(1);

            vi.useRealTimers();
        });
```

Add `vi` to the import at the top of the file:

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
```

- [ ] Step 2: Run test to verify it fails

Run: `npm test -- tests/utils/queue.test.js`
Expected: FAIL — queue doesn't pause (task 3 runs immediately)

- [ ] Step 3: Implement pause/resume logic

In the `isRateLimitError` catch block in `src/utils/queue.js`, add the pause logic after the concurrency decrease:

```javascript
                if (isRateLimitError(error)) {
                    // Multiplicative Decrease: drop the ladder
                    currentLimit = Math.max(1, Math.floor(currentLimit / 2));
                    queue.concurrency = Math.floor(currentLimit);
                    logWarn(`Rate limit hit. Dropping concurrency to ${queue.concurrency}`);

                    // Pause queue to let the API breathe
                    if (!queue.isPaused) {
                        queue.pause();
                        setTimeout(() => {
                            logDebug('Resuming ladder queue after cooloff');
                            queue.start();
                        }, RATE_LIMIT_COOLOFF_MS);
                    }
                }
```

- [ ] Step 4: Run test to verify it passes

Run: `npm test -- tests/utils/queue.test.js`
Expected: PASS (all tests)

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: add rate-limit pause/resume to ladder queue"
```

---

### Task 6: Refactor updateCommunitySummaries to use queue

**Files:**
- Modify: `src/graph/communities.js`
- Modify: `tests/graph/communities.test.js`

- [ ] Step 1: Verify existing community tests pass

Run: `npm test -- tests/graph/communities.test.js`
Expected: PASS

- [ ] Step 2: Write a concurrency-aware test

Add to `tests/graph/communities.test.js` (inside a new describe block, add the mocks at the top of the file after other mocks):

The file already has `updateCommunitySummaries` imported. Add this test after the existing tests:

```javascript
describe('updateCommunitySummaries with queue', () => {
    const mockCallLLM = vi.fn();

    beforeEach(() => {
        vi.mock('../../src/llm.js', () => ({
            callLLM: (...args) => mockCallLLM(...args),
            LLM_CONFIGS: { community: { profileSettingKey: 'extractionProfile' } },
        }));
        vi.mock('../../src/embeddings.js', () => ({
            getQueryEmbedding: vi.fn().mockResolvedValue(null),
        }));
        vi.mock('../../src/perf/store.js', () => ({
            record: vi.fn(),
        }));
        setupTestContext({
            settings: { maxConcurrency: 3 },
        });
        mockCallLLM.mockReset();
    });

    afterEach(() => {
        resetDeps();
        vi.restoreAllMocks();
    });

    it('should process all communities correctly with maxConcurrency > 1', async () => {
        mockCallLLM.mockResolvedValue(JSON.stringify({
            title: 'Test Community',
            summary: 'A test summary',
            findings: ['Finding 1'],
        }));

        const groups = {
            0: { nodeKeys: ['a', 'b'], nodeLines: ['- A', '- B'], edgeLines: ['- A→B'] },
            1: { nodeKeys: ['c', 'd'], nodeLines: ['- C', '- D'], edgeLines: ['- C→D'] },
            2: { nodeKeys: ['e', 'f'], nodeLines: ['- E', '- F'], edgeLines: ['- E→F'] },
        };

        const result = await updateCommunitySummaries(null, groups, {}, 100, 100, false);

        expect(Object.keys(result.communities)).toHaveLength(3);
        expect(result.communities.C0).toBeDefined();
        expect(result.communities.C1).toBeDefined();
        expect(result.communities.C2).toBeDefined();
        expect(mockCallLLM).toHaveBeenCalledTimes(3);
    });
});
```

- [ ] Step 3: Refactor `updateCommunitySummaries` in `src/graph/communities.js`

Add import at the top (after existing imports):

```javascript
import { createLadderQueue } from '../utils/queue.js';
```

Replace the `for` loop body (from `for (const [communityId, group]` through the closing `}` of the loop) with the queue-based version. The full refactored section:

```javascript
    const ladderQueue = await createLadderQueue(settings.maxConcurrency);
    const promises = [];

    for (const [communityId, group] of Object.entries(communityGroups)) {
        // Skip solo nodes - they don't form a meaningful community
        if (group.nodeKeys.length < 2) continue;

        const key = `C${communityId}`;
        const existing = existingCommunities[key];

        // Check if membership has changed
        const membershipChanged = !existing || !sameMembers(existing.nodeKeys, group.nodeKeys);

        // Check staleness: message count delta exceeds threshold
        const messageDelta = currentMessageCount - (existing?.lastUpdatedMessageCount || 0);
        const isStale = messageDelta >= stalenessThreshold;

        // Check if embedding is missing (need to regenerate if so)
        const missingEmbedding = existing && !hasEmbedding(existing);

        // Special case: if only one community, always re-summarize at staleness interval
        const singleCommunityForceRefresh = isSingleCommunity && isStale;

        // Skip if membership hasn't changed AND not stale AND not missing embedding
        if (!membershipChanged && !isStale && !missingEmbedding && !singleCommunityForceRefresh) {
            updatedCommunities[key] = existing;
            continue;
        }

        // Queue the LLM summarization
        promises.push(
            ladderQueue.add(async () => {
                const prompt = buildCommunitySummaryPrompt(group.nodeLines, group.edgeLines, preamble, outputLanguage, prefill);
                const response = await callLLM(prompt, LLM_CONFIGS.community, { structured: true });
                const parsed = parseCommunitySummaryResponse(response);
                const embedding = await getQueryEmbedding(parsed.summary);
                const community = {
                    nodeKeys: group.nodeKeys,
                    title: parsed.title,
                    summary: parsed.summary,
                    findings: parsed.findings,
                    lastUpdated: deps.Date.now(),
                    lastUpdatedMessageCount: currentMessageCount,
                };
                if (embedding) {
                    setEmbedding(community, embedding);
                }
                updatedCommunities[key] = community;
                updatedCount++;
                logDebug(`Community ${key}: "${parsed.title}" (${group.nodeKeys.length} nodes)`);
            }).catch(error => {
                logDebug(`Community ${key} summarization failed: ${error.message}`);
                if (existing) {
                    updatedCommunities[key] = existing;
                }
            })
        );
    }

    await Promise.all(promises);
```

Also remove the `await yieldToMain();` call that was at the top of the old loop — the queue handles yielding.

- [ ] Step 4: Run tests to verify they pass

Run: `npm test -- tests/graph/communities.test.js`
Expected: PASS (all existing + new test)

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: parallelize community summarization via ladder queue"
```

---

### Task 7: Refactor synthesizeInChunks to use queue

**Files:**
- Modify: `src/graph/communities.js`
- Modify: `tests/graph/communities.test.js`

- [ ] Step 1: Write the failing test

Add to `tests/graph/communities.test.js` (in the `updateCommunitySummaries with queue` describe block or a new one):

```javascript
describe('synthesizeInChunks with queue', () => {
    const mockCallLLM = vi.fn();

    beforeEach(() => {
        vi.mock('../../src/llm.js', () => ({
            callLLM: (...args) => mockCallLLM(...args),
            LLM_CONFIGS: { community: { profileSettingKey: 'extractionProfile' } },
        }));
        setupTestContext({
            settings: { maxConcurrency: 3 },
        });
        mockCallLLM.mockReset();
    });

    afterEach(() => {
        resetDeps();
        vi.restoreAllMocks();
    });

    it('should process large community sets via chunked map-reduce with queue', async () => {
        // Create 15 communities (> GLOBAL_SYNTHESIS_CHUNK_SIZE of 10)
        const communities = Array.from({ length: 15 }, (_, i) => ({
            title: `Community ${i}`,
            summary: `Summary for community ${i}`,
            findings: [`Finding ${i}`],
        }));

        // Mock: regional summaries for map phase, then final summary for reduce phase
        mockCallLLM
            .mockResolvedValueOnce(JSON.stringify({ global_summary: 'Region A summary' }))
            .mockResolvedValueOnce(JSON.stringify({ global_summary: 'Region B summary' }))
            .mockResolvedValue(JSON.stringify({ global_summary: 'Final global summary' }));

        const result = await synthesizeInChunks(communities, 'auto', 'auto', '{');

        // Map phase: 2 chunks (10 + 5), Reduce phase: 1 call = 3 total
        expect(mockCallLLM).toHaveBeenCalledTimes(3);
        expect(result).toBe('Final global summary');
    });
});
```

- [ ] Step 2: Run test to verify current state

Run: `npm test -- tests/graph/communities.test.js`
Expected: Test may pass with sequential code (verifying correctness baseline)

- [ ] Step 3: Refactor `synthesizeInChunks` in `src/graph/communities.js`

The import for `createLadderQueue` is already added in Task 6. Replace the map-phase `for` loop in `synthesizeInChunks`:

```javascript
export async function synthesizeInChunks(communityList, preamble, outputLanguage, prefill) {
    if (communityList.length <= GLOBAL_SYNTHESIS_CHUNK_SIZE) {
        // Small set: single-pass (current behavior)
        const prompt = buildGlobalSynthesisPrompt(communityList, preamble, outputLanguage, prefill);
        const response = await callLLM(prompt, LLM_CONFIGS.community, { structured: true });
        return parseGlobalSynthesisResponse(response).global_summary;
    }

    // Map phase: chunk communities, get regional summaries (parallelized)
    const chunks = [];
    for (let i = 0; i < communityList.length; i += GLOBAL_SYNTHESIS_CHUNK_SIZE) {
        chunks.push(communityList.slice(i, i + GLOBAL_SYNTHESIS_CHUNK_SIZE));
    }

    const settings = getDeps().getExtensionSettings()?.[extensionName] || {};
    const ladderQueue = await createLadderQueue(settings.maxConcurrency);

    const results = await Promise.all(
        chunks.map(chunk =>
            ladderQueue.add(async () => {
                const prompt = buildGlobalSynthesisPrompt(chunk, preamble, outputLanguage, prefill);
                const response = await callLLM(prompt, LLM_CONFIGS.community, { structured: true });
                return parseGlobalSynthesisResponse(response).global_summary;
            }).catch(err => {
                logDebug(`Regional synthesis chunk failed, skipping: ${err.message}`);
                return null;
            })
        )
    );

    const regionalSummaries = results.filter(r => r !== null);

    if (regionalSummaries.length === 0) return null;

    // Reduce phase: synthesize regional summaries into final global summary
    const pseudoCommunities = regionalSummaries.map((summary, i) => ({
        title: `Region ${i + 1}`,
        summary,
        findings: [],
    }));
    const reducePrompt = buildGlobalSynthesisPrompt(pseudoCommunities, preamble, outputLanguage, prefill);
    const reduceResponse = await callLLM(reducePrompt, LLM_CONFIGS.community, { structured: true });
    return parseGlobalSynthesisResponse(reduceResponse).global_summary;
}
```

- [ ] Step 4: Run tests to verify they pass

Run: `npm test -- tests/graph/communities.test.js`
Expected: PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: parallelize synthesizeInChunks map phase via ladder queue"
```

---

### Task 8: Refactor consolidateEdges to use queue

**Files:**
- Modify: `src/graph/graph.js`
- Modify: `tests/graph/consolidation.test.js`

- [ ] Step 1: Write the test for parallel edge consolidation

Add to `tests/graph/consolidation.test.js`:

```javascript
    it('consolidates multiple edges in parallel with maxConcurrency > 1', async () => {
        mockCallLLM
            .mockResolvedValueOnce(JSON.stringify({ consolidated_description: 'Relationship A' }))
            .mockResolvedValueOnce(JSON.stringify({ consolidated_description: 'Relationship B' }));

        const graph = createEmptyGraph();
        graph.nodes.alice = { name: 'Alice', type: 'PERSON', description: 'test', mentions: 1 };
        graph.nodes.bob = { name: 'Bob', type: 'PERSON', description: 'test', mentions: 1 };
        graph.nodes.carol = { name: 'Carol', type: 'PERSON', description: 'test', mentions: 1 };
        graph.edges['alice__bob'] = {
            source: 'alice', target: 'bob',
            description: 'Seg1 | Seg2 | Seg3 | Seg4 | Seg5 | Seg6',
            weight: 6, _descriptionTokens: 600,
        };
        graph.edges['alice__carol'] = {
            source: 'alice', target: 'carol',
            description: 'Seg1 | Seg2 | Seg3 | Seg4 | Seg5',
            weight: 5, _descriptionTokens: 500,
        };
        graph._edgesNeedingConsolidation = ['alice__bob', 'alice__carol'];

        const result = await consolidateEdges(graph, {});
        expect(result).toBe(2);
        expect(graph.edges['alice__bob'].description).toBe('Relationship A');
        expect(graph.edges['alice__carol'].description).toBe('Relationship B');
        expect(graph._edgesNeedingConsolidation).toHaveLength(0);
    });
```

- [ ] Step 2: Run test to verify current state

Run: `npm test -- tests/graph/consolidation.test.js`
Expected: Test should pass with sequential code (correctness baseline)

- [ ] Step 3: Refactor `consolidateEdges` in `src/graph/graph.js`

Add import at top of `src/graph/graph.js`:

```javascript
import { createLadderQueue } from '../utils/queue.js';
```

Replace the `for` loop in `consolidateEdges` (from `const successfulKeys = [];` through the end of the loop) with:

```javascript
    const maxConcurrency = extensionSettings.maxConcurrency;
    const ladderQueue = await createLadderQueue(maxConcurrency);

    const results = await Promise.all(
        toProcess.map(edgeKey =>
            ladderQueue.add(async () => {
                const edge = graphData.edges[edgeKey];
                if (!edge) return null;

                const prompt = buildEdgeConsolidationPrompt(edge, preamble, outputLanguage, prefill);
                const response = await callLLM(prompt, LLM_CONFIGS.edge_consolidation, { structured: true });

                const result = parseConsolidationResponse(response);
                if (result.consolidated_description) {
                    edge.description = result.consolidated_description;
                    edge._descriptionTokens = countTokens(result.consolidated_description);

                    // Re-embed for accurate RAG (only if embeddings enabled)
                    if (isEmbeddingsEnabled()) {
                        const newEmbedding = await getDocumentEmbedding(
                            `relationship: ${edge.source} - ${edge.target}: ${edge.description}`
                        );
                        setEmbedding(edge, newEmbedding);
                    }

                    return edgeKey;
                }
                return null;
            }).catch(err => {
                logError(`Failed to consolidate edge ${edgeKey}`, err);
                return null;
            })
        )
    );

    const successfulKeys = results.filter(k => k !== null);
```

- [ ] Step 4: Run tests to verify they pass

Run: `npm test -- tests/graph/consolidation.test.js`
Expected: PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: parallelize edge consolidation via ladder queue"
```

---

### Task 9: Refactor reflection loops in extract.js to use queue

**Files:**
- Modify: `src/extraction/extract.js`

- [ ] Step 1: Verify existing extraction tests pass

Run: `npm test -- tests/extraction/extract.test.js`
Expected: PASS

- [ ] Step 2: Add import for `createLadderQueue`

At the top of `src/extraction/extract.js`, add:

```javascript
import { createLadderQueue } from '../utils/queue.js';
```

- [ ] Step 3: Refactor the Phase 2 reflection loop in `extractMemories`

In `extractMemories`, find the Phase 2 reflection loop (the `for (const characterName of characters)` block). Replace it with:

```javascript
                const ladderQueue = await createLadderQueue(settings.maxConcurrency);
                const reflectionPromises = [];

                for (const characterName of characters) {
                    if (shouldReflect(data.reflection_state, characterName, reflectionThreshold)) {
                        reflectionPromises.push(
                            ladderQueue.add(async () => {
                                const reflections = await generateReflections(
                                    characterName,
                                    data[MEMORIES_KEY] || [],
                                    data[CHARACTERS_KEY] || {}
                                );
                                if (reflections.length > 0) {
                                    data[MEMORIES_KEY].push(...reflections);
                                }
                                // Reset accumulator after reflection
                                data.reflection_state[characterName].importance_sum = 0;
                            }).catch(error => {
                                if (error.name === 'AbortError') throw error;
                                logError(`Reflection error for ${characterName}`, error);
                            })
                        );
                    }
                }

                await Promise.all(reflectionPromises);
```

- [ ] Step 4: Refactor the reflection loop in `runPhase2Enrichment`

In `runPhase2Enrichment`, find the `for (const characterName of characterNames)` loop. Replace it with:

```javascript
        const ladderQueue = await createLadderQueue(settings.maxConcurrency);
        const reflectionPromises = [];

        for (const characterName of characterNames) {
            if (shouldReflect(data.reflection_state, characterName, reflectionThreshold)) {
                reflectionPromises.push(
                    ladderQueue.add(async () => {
                        const reflections = await generateReflections(
                            characterName,
                            memories,
                            data[CHARACTERS_KEY] || {}
                        );
                        if (reflections.length > 0) {
                            data[MEMORIES_KEY].push(...reflections);
                        }
                        // Reset accumulator after reflection
                        data.reflection_state[characterName].importance_sum = 0;
                    }).catch(error => {
                        if (error.name === 'AbortError') throw error;
                        logError(`Reflection error for ${characterName}`, error);
                    })
                );
            }
        }

        await Promise.all(reflectionPromises);
```

- [ ] Step 5: Run tests to verify no regressions

Run: `npm test -- tests/extraction/extract.test.js`
Expected: PASS

- [ ] Step 6: Commit

```bash
git add -A && git commit -m "feat: parallelize reflection generation via ladder queue"
```

---

### Task 10: Add UI slider and settings binding

**Files:**
- Modify: `templates/settings_panel.html`
- Modify: `src/ui/settings.js`

- [ ] Step 1: Add slider HTML to `templates/settings_panel.html`

Find the `System Limits` details block (the `<details>` containing `openvault_backfill_rpm`). Add the concurrency slider inside the `openvault-settings-group` div, **before** the RPM label:

```html
                        <label for="openvault_max_concurrency">
                            Cloud API Concurrency: <span id="openvault_max_concurrency_value">1</span>
                            <small class="openvault-default-hint" data-default-key="maxConcurrency"></small>
                        </label>
                        <input type="range" id="openvault_max_concurrency" min="1" max="5" step="1" />
                        <small class="openvault-hint">Keep at 1 for local LLMs (Ollama/LM Studio). Increase to 3-5 for cloud APIs (Kimi/OpenAI) to speed up background processing. Auto-drops on rate limits.</small>

                        <div style="height: 8px;"></div>
```

- [ ] Step 2: Add settings binding in `src/ui/settings.js`

In the `bindUIElements()` function, add after the existing backfill RPM binding (around line 481):

```javascript
    // Concurrency settings
    bindSetting('max_concurrency', 'maxConcurrency');
```

- [ ] Step 3: Add load code in the settings load function

Find the section where `$('#openvault_backfill_rpm').val(...)` is set (around line 708). Add before it:

```javascript
    // Concurrency settings
    $('#openvault_max_concurrency').val(settings.maxConcurrency);
    $('#openvault_max_concurrency_value').text(settings.maxConcurrency);
```

- [ ] Step 4: Verify existing tests pass

Run: `npm test`
Expected: PASS (all tests)

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: add Cloud API Concurrency slider to settings UI"
```

---

### Task 11: Full test suite verification

- [ ] Step 1: Run the complete test suite

Run: `npm test`
Expected: All tests pass

- [ ] Step 2: Verify no lint errors

Run: `npm run lint`
Expected: Clean

- [ ] Step 3: Final commit (if any fixups needed)

```bash
git add -A && git commit -m "chore: final cleanup for ladder queue feature"
```
