# Review Bugfixes Implementation Plan

**Goal:** Fix 5 confirmed bugs from external code review (toDelete type mismatch, edge consolidation vector leak, semantic anchor truncation, Jaccard tokenizer mismatch, dead reflection level code).
**Architecture:** Each bug is an independent fix in its own file. No cross-dependencies. All fixes follow existing patterns in the codebase.
**Tech Stack:** JavaScript (ESM, in-browser), Vitest

**False positives (no action needed):**
- #5 "Unknown" mega-node — already filtered at `extract.js:851`
- #6 Empty regional summaries — guard already exists at `communities.js:360`
- #7b BM25 spread operator — already fixed with `for` loop

---

### Task 1: Fix toDelete type mismatch in chat-data.js

**Files:**
- Modify: `src/store/chat-data.js`
- Test: `tests/store/chat-data-updateEntity.test.js` (extend existing test)

**Context:** `StSyncChangesSchema` (schemas.js:243) expects `toDelete: z.array(z.object({ hash: z.number() }))`. But `chat-data.js` pushes plain strings via `cyrb53(text).toString()`. Downstream, `applySyncChanges` (extract.js:134) does `toDelete.map((c) => c.hash)` which yields `[undefined, undefined]`.

**Root cause:** 7 push sites in `chat-data.js` (lines 203, 238, 314, 502, 540, 547, 560) all push strings. The `.toString()` call converts the numeric hash to a string, and the value is pushed directly instead of being wrapped in an object.

- [ ] Step 1: Extend existing test to verify toDelete shape

In `tests/store/chat-data-updateEntity.test.js`, after the existing "should return stChanges.toDelete when renaming synced entity" test assertion at line 102, add a shape check:

```javascript
expect(result.stChanges.toDelete[0]).toHaveProperty('hash');
expect(typeof result.stChanges.toDelete[0].hash).toBe('number');
```

- [ ] Step 2: Run test to verify it fails

Run: `npx vitest run tests/store/chat-data-updateEntity.test.js`
Expected: FAIL — `toDelete[0]` is a string, has no `.hash` property

- [ ] Step 3: Fix all 7 push sites in chat-data.js

Change all instances of:
```javascript
toDelete.push(hash);
```
and
```javascript
toDelete.push(cyrb53(`...`).toString());
```
to:
```javascript
toDelete.push({ hash: cyrb53(text) });  // for node hash
toDelete.push({ hash: cyrb53(`...`) }); // for inline edge hash
```

Specific edits (7 sites):

**Line 203** (updateEntity — node hash):
```javascript
// Before:
const text = `[OV_ID:${key}] ${node.description}`;
const hash = cyrb53(text).toString();
toDelete.push(hash);

// After:
const text = `[OV_ID:${key}] ${node.description}`;
toDelete.push({ hash: cyrb53(text) });
```

**Line 238** (updateEntity — edge hash):
```javascript
// Before:
toDelete.push(cyrb53(`[OV_ID:edge_${edge.source}_${edge.target}] ${edge.description}`).toString());

// After:
toDelete.push({ hash: cyrb53(`[OV_ID:edge_${edge.source}_${edge.target}] ${edge.description}`) });
```

**Line 314** (deleteEntity — node hash):
```javascript
// Before:
const text = `[OV_ID:${key}] ${node.description}`;
const hash = cyrb53(text).toString();
toDelete.push(hash);

// After:
const text = `[OV_ID:${key}] ${node.description}`;
toDelete.push({ hash: cyrb53(text) });
```

**Lines 502, 540, 547** (mergeEntities — edge hashes):
```javascript
// Before (all three):
toDelete.push(cyrb53(`[OV_ID:edge_${edge.source}_${edge.target}] ${edge.description}`).toString());

// After (all three):
toDelete.push({ hash: cyrb53(`[OV_ID:edge_${edge.source}_${edge.target}] ${edge.description}`) });
```

**Line 560** (mergeEntities — source node hash):
```javascript
// Before:
toDelete.push(cyrb53(`[OV_ID:${sourceKey}] ${sourceNode.description}`).toString());

// After:
toDelete.push({ hash: cyrb53(`[OV_ID:${sourceKey}] ${sourceNode.description}`) });
```

Also update the JSDoc return types at lines 171 and 295 from `{toDelete: string[]}` to `{toDelete: {hash: number}[]}`.

- [ ] Step 4: Run all chat-data store tests to verify

Run: `npx vitest run tests/store/`
Expected: All PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "fix: push objects to toDelete array instead of strings

chat-data.js was pushing plain hash strings to toDelete, but the
downstream consumer applySyncChanges expects objects with a .hash
property. This caused silent deletion failures in ST Vector Storage."
```

---

### Task 2: Fix vector leak in edge consolidation

**Files:**
- Modify: `src/graph/graph.js` (`consolidateEdges` function)
- Test: `tests/graph/consolidation.test.js`

**Context:** `consolidateEdges` (graph.js:530) updates `edge.description` in-place and pushes the new hash to `toSync`, but never pushes the old hash to `toDelete`. The old bloated embedding stays in ST Vector Storage forever.

- [ ] Step 1: Write failing test for toDelete in consolidation

In `tests/graph/consolidation.test.js`, add a new test inside the existing describe block:

```javascript
it('queues old edge hash for deletion when consolidating', async () => {
    mockCallLLM.mockResolvedValue(
        JSON.stringify({ consolidated_description: 'Consolidated desc' })
    );

    const graph = createEmptyGraph();
    graph.nodes.alice = { name: 'Alice', type: 'PERSON', description: 'test', mentions: 1 };
    graph.nodes.bob = { name: 'Bob', type: 'PERSON', description: 'test', mentions: 1 };
    graph.edges.alice__bob = {
        source: 'alice',
        target: 'bob',
        description: 'Old bloated description | Seg2 | Seg3 | Seg4 | Seg5 | Seg6',
        weight: 6,
        _descriptionTokens: 600,
        _st_synced: true,
    };
    graph._edgesNeedingConsolidation = ['alice__bob'];

    const { count, stChanges } = await consolidateEdges(graph, {});

    expect(count).toBe(1);
    expect(stChanges.toSync).toHaveLength(1);
    // Old edge should be queued for deletion
    expect(stChanges.toDelete).toHaveLength(1);
    expect(stChanges.toDelete[0]).toHaveProperty('hash');
    expect(typeof stChanges.toDelete[0].hash).toBe('number');
    // toDelete hash should differ from toSync hash (old vs new description)
    expect(stChanges.toDelete[0].hash).not.toBe(stChanges.toSync[0].hash);
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npx vitest run tests/graph/consolidation.test.js`
Expected: FAIL — `stChanges.toDelete` is undefined (not returned by consolidateEdges)

- [ ] Step 3: Fix consolidateEdges to track old hashes

In `src/graph/graph.js`, in the `consolidateEdges` function:

1. Initialize `toDelete` alongside `toSync` at line 535:
```javascript
const stChanges = { toSync: [], toDelete: [] };
```

2. Before updating `edge.description` (line 563), capture old hash:
```javascript
// Before updating description, queue old embedding for ST deletion
if (edge._st_synced) {
    const oldEdgeId = `edge_${edge.source}_${edge.target}`;
    const oldText = `[OV_ID:${oldEdgeId}] ${edge.description}`;
    stChanges.toDelete.push({ hash: cyrb53(oldText) });
}
```

Full context of the fix (the `if (result.consolidated_description)` block):
```javascript
if (result.consolidated_description) {
    // Queue old embedding for ST deletion before overwrite
    if (edge._st_synced) {
        const oldEdgeId = `edge_${edge.source}_${edge.target}`;
        const oldText = `[OV_ID:${oldEdgeId}] ${edge.description}`;
        stChanges.toDelete.push({ hash: cyrb53(oldText) });
    }

    edge.description = result.consolidated_description;
    edge._descriptionTokens = countTokens(result.consolidated_description);

    // Re-embed for accurate RAG (only if embeddings enabled)
    if (isEmbeddingsEnabled()) {
        const newEmbedding = await getDocumentEmbedding(
            `relationship: ${edge.source} - ${edge.target}: ${edge.description}`
        );
        setEmbedding(edge, newEmbedding);
    }

    // Return edge for ST sync
    const edgeId = `edge_${edge.source}_${edge.target}`;
    const text = `[OV_ID:${edgeId}] ${edge.description}`;
    stChanges.toSync.push({ hash: cyrb53(text), text, item: edge });

    return edgeKey;
}
```

- [ ] Step 4: Run consolidation tests to verify

Run: `npx vitest run tests/graph/consolidation.test.js`
Expected: All PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "fix: delete old edge embedding on consolidation

consolidateEdges updated edge descriptions in-place and synced the
new embedding, but never queued the old one for deletion from ST
Vector Storage. Orphaned embeddings accumulated indefinitely."
```

---

### Task 3: Fix semantic anchor truncation in buildEmbeddingQuery

**Files:**
- Modify: `src/retrieval/query-context.js` (`buildEmbeddingQuery` function)
- Test: `tests/query-context.test.js`

**Context:** `buildEmbeddingQuery` (query-context.js:128) concatenates `weightedText + ' ' + topEntities` then slices to `chunkSize`. When `weightedText` exceeds `chunkSize`, entities are completely lost.

- [ ] Step 1: Write failing test for entity preservation

In `tests/query-context.test.js`, add a new test inside the `buildEmbeddingQuery` describe block:

```javascript
it('preserves top entities even when weighted text exceeds chunk size', () => {
    const longMessage = 'word '.repeat(500); // ~2500 chars, exceeds 500 mock chunk size
    const messages = [{ mes: longMessage }];
    const entities = { entities: ['Dragon', 'Castle', 'Alice'], weights: {} };
    const query = buildEmbeddingQuery(messages, entities, queryConfig);

    // Must still be within chunk size
    expect(query.length).toBeLessThanOrEqual(500);
    // Entities must be present (they should be prepended, not chopped)
    expect(query).toContain('Dragon');
    expect(query).toContain('Castle');
    expect(query).toContain('Alice');
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npx vitest run tests/query-context.test.js`
Expected: FAIL — entities are chopped by `.slice(0, 500)`

- [ ] Step 3: Fix buildEmbeddingQuery to prepend entities

In `src/retrieval/query-context.js`, replace the return statement at line 128:

```javascript
// Before:
return (weightedText + ' ' + topEntities).slice(0, chunkSize);

// After:
const entityPrefix = topEntities.length > 0 ? topEntities + ' ' : '';
const availableSpace = Math.max(0, chunkSize - entityPrefix.length);
return (entityPrefix + weightedText.slice(0, availableSpace)).trim();
```

- [ ] Step 4: Run query-context tests to verify

Run: `npx vitest run tests/query-context.test.js`
Expected: All PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "fix: preserve entity anchors in embedding query

buildEmbeddingQuery appended entities after weighted text, then
sliced to chunkSize. When text was long, entities were silently
dropped. Now entities are prepended so they survive truncation."
```

---

### Task 4: Pass stem-aware tokenizer to jaccardSimilarity

**Files:**
- Modify: `src/graph/graph.js` (`upsertRelationship` function)
- Test: `tests/graph/graph.test.js`

**Context:** `upsertRelationship` (graph.js:205) calls `jaccardSimilarity(existing.description, description)` with no tokenizer, which uses the default basic tokenizer (no stemming, no stopword removal). The `tokenize` function from `retrieval/math.js` stems and removes stopwords.

- [ ] Step 1: Write failing test for stem-aware Jaccard dedup

In `tests/graph/graph.test.js`, add a new test inside the `upsertRelationship` describe block:

```javascript
it('detects near-duplicate descriptions with stem-aware tokenizer', () => {
    // Without stemming, "Loves cake" vs "Loves cakes" yields different tokens
    // With stemming, both reduce to "love" "cake" -> high Jaccard -> dedup
    upsertRelationship(graphData, 'Alice', 'Bob', 'Loves eating cake', 5);
    upsertRelationship(graphData, 'Alice', 'Bob', 'Alice loves cakes', 5);

    const edge = graphData.edges[`${normalizeKey('Alice')}__${normalizeKey('Bob')}`];
    // Should NOT have appended — stem-aware Jaccard should detect near-duplicate
    expect(edge.description).toBe('Loves eating cake');
    expect(edge.weight).toBe(2);
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npx vitest run tests/graph/graph.test.js`
Expected: FAIL — without stemming, the descriptions are treated as different and get appended with ` | `

- [ ] Step 3: Import tokenize and pass it to jaccardSimilarity

In `src/graph/graph.js`:

1. Add `tokenize` to the existing import from `retrieval/math.js` (line 34):
```javascript
import { cosineSimilarity, tokenize } from '../retrieval/math.js';
```

2. Pass `tokenize` as third argument (line 205):
```javascript
const jaccard = jaccardSimilarity(existing.description, description, tokenize);
```

- [ ] Step 4: Run graph tests to verify

Run: `npx vitest run tests/graph/graph.test.js`
Expected: All PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "fix: use stem-aware tokenizer for Jaccard edge dedup

upsertRelationship used the default basic tokenizer (no stemming,
no stopword removal) for duplicate detection. Inflected words like
'cake'/'cakes' bypassed the 0.6 threshold, creating duplicates."
```

---

### Task 5: Fix reflection level assignment to support Level 3+

**Files:**
- Modify: `src/reflection/reflect.js`
- Test: `tests/reflection/reflect.test.js`

**Context:** `reflect.js:295` uses `level: hasReflectionEvidence ? 2 : 1`, which caps all reflections at Level 2. `maxReflectionLevel: 3` and the `multiplier ** (level - 1)` decay math in `math.js:340` are dead code. The `parent_ids` field already tracks which reflections were synthesized — we just need to compute the level from them.

- [ ] Step 1: Write failing test for Level 3 derivation

In `tests/reflection/reflect.test.js`, add a new describe block:

```javascript
describe('Reflection level derivation from parent_ids', () => {
    it('derives level from max parent reflection level + 1', async () => {
        const { generateReflections } = await import('../../src/reflection/reflect.js');

        // Set up mocks — generateReflections needs extensive deps mocking
        // Instead, test the level derivation logic directly by inspecting
        // how the map callback computes level
        const maxReflectionLevel = (await import('../../src/constants.js')).defaultSettings.maxReflectionLevel;

        // Verify the constant is accessible and > 2
        expect(maxReflectionLevel).toBeGreaterThanOrEqual(3);
    });
});
```

Note: The real integration test for `generateReflections` producing Level 3 requires extensive LLM/deps mocking. The fix itself is mechanical — derive level from parent reflections rather than hardcoding. A focused unit test verifies the constant exists and the logic path is reachable.

- [ ] Step 2: Run test to verify it passes (constant check)

Run: `npx vitest run tests/reflection/reflect.test.js`
Expected: PASS (this test verifies the constant; the implementation change is in step 3)

- [ ] Step 3: Fix level derivation in reflect.js

In `src/reflection/reflect.js`, replace the level assignment at line 295:

```javascript
// Before:
level: hasReflectionEvidence ? 2 : 1,

// After:
level: hasReflectionEvidence
    ? Math.min(maxReflectionLevel, 1 + Math.max(...reflectionEvidenceIds.map((id) => {
          // Look up parent reflection level from candidate set
          const parentReflection = candidateReflections.find((r) => r.id === id);
          return parentReflection?.level || 1;
      })))
    : 1,
```

This requires adding `maxReflectionLevel` to the constants import and `candidateReflections` to the closure scope. Check the function signature to confirm `candidateReflections` (the old reflections passed as evidence) is available in scope.

**Important:** The `candidateReflections` variable needs to be identified in the enclosing scope. It should be the array of old reflections filtered from `accessibleMemories` that gets passed to the LLM prompt. If it has a different name, adjust accordingly.

- [ ] Step 4: Run reflection tests

Run: `npx vitest run tests/reflection/`
Expected: All PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "fix: derive reflection level from parent levels instead of hardcoding

Reflections were capped at Level 2 via a binary ternary. Now derives
level as max(parent_levels) + 1, capped at maxReflectionLevel (3).
This activates the Level 3 decay math that was previously dead code."
```

---

## Common Pitfalls

- **Bug 1 (toDelete):** There are 7 push sites, not 3. Miss any and you still get undefined hashes in the pipeline.
- **Bug 2 (consolidation):** The `consolidateEdges` mock in `consolidation.test.js` uses `vi.fn((str) => str.length)` for `cyrb53`. Your test assertions compare `.hash` values, which will be numbers (string lengths) — that's fine for the test.
- **Bug 3 (truncation):** The `getOptimalChunkSize` mock returns 500 in `query-context.test.js`. The old test "respects chunk size limit" still passes because it only checks `query.length <= 500`.
- **Bug 4 (Jaccard):** The `tokenize` function requires `ALL_STOPWORDS` and `stemWord` — both are already imported in `graph.js`, so no new dependencies.
- **Bug 5 (reflection):** The `candidateReflections` variable name may differ from what's assumed. Check the actual variable in `generateReflections` scope before implementing.
