# Implementation Plan - Batch Dedup, Community Pruning, Dynamic Character Stopwords

> **Reference:** `tmp/task.md` (review feedback items B, C, D)
> **Execution:** Use `executing-plans` skill.

---

## Task 1: Same-Batch Jaccard Dedup in `filterSimilarEvents`

**Goal:** Add a token-level Jaccard similarity check within the same extraction batch to catch near-duplicate events that cosine similarity misses due to sentence structure variation.

### Step 1: Write Failing Test

- File: `tests/extraction/extract.test.js`
- Add to existing test file:
```javascript
describe('filterSimilarEvents - intra-batch Jaccard dedup', () => {
    it('deduplicates semantically similar events within the same batch using Jaccard similarity', async () => {
        // These have identical meaning but different phrasing — cosine on short embeddings may miss them
        const newEvents = [
            { summary: 'Suzy proposed daily morning training sessions for Vova starting at 7am', embedding: [0.9, 0.1] },
            { summary: 'Suzy proposed daily morning training sessions with structured warm-up drills for Vova', embedding: [0.1, 0.9] },
            { summary: 'Vova went to the store to buy groceries', embedding: [0.5, 0.5] },
        ];
        const existingMemories = [];
        // With orthogonal embeddings (cosine ~0), the cosine check won't catch them.
        // But Jaccard on tokens should catch the overlap.
        const { filterSimilarEvents } = await import('../../src/extraction/extract.js');
        const result = filterSimilarEvents(newEvents, existingMemories, 0.85, 0.6);
        // Should keep first occurrence + the unrelated event, skip the near-duplicate
        expect(result).toHaveLength(2);
        expect(result[0].summary).toContain('starting at 7am');
        expect(result[1].summary).toContain('groceries');
    });

    it('does not Jaccard-dedup events with low token overlap', () => {
        const newEvents = [
            { summary: 'Suzy proposed training sessions for morning warmup', embedding: [0.9, 0.1] },
            { summary: 'Vova cooked dinner for the family at home', embedding: [0.1, 0.9] },
        ];
        const { filterSimilarEvents } = await import('../../src/extraction/extract.js');
        const result = filterSimilarEvents(newEvents, [], 0.85, 0.6);
        expect(result).toHaveLength(2);
    });
});
```

### Step 2: Run Test (Red)

- Command: `npm test tests/extraction/extract.test.js`
- Expect: Fail — `filterSimilarEvents` doesn't accept a 4th param and doesn't do intra-batch dedup.

### Step 3: Implementation (Green)

- File: `src/extraction/extract.js`
- **Export** `filterSimilarEvents` (currently unexported) so tests can access it.
- Add `jaccardThreshold` parameter (default 0.6).
- After the existing cosine-vs-existingMemories filter, add intra-batch dedup:

Replace `filterSimilarEvents`:
```javascript
/**
 * Filter out events that are too similar to existing memories OR to each other within the batch.
 * @param {Object[]} newEvents - Events to filter
 * @param {Object[]} existingMemories - Already-stored memories
 * @param {number} cosineThreshold - Cosine similarity threshold for existing memory dedup
 * @param {number} jaccardThreshold - Jaccard token similarity threshold for intra-batch dedup
 */
export function filterSimilarEvents(newEvents, existingMemories, cosineThreshold = 0.85, jaccardThreshold = 0.6) {
    // Phase 1: Filter against existing memories (cosine, unchanged)
    let filtered = newEvents;
    if (existingMemories?.length) {
        filtered = newEvents.filter((event) => {
            if (!event.embedding) return true;
            for (const memory of existingMemories) {
                if (!memory.embedding) continue;
                const similarity = cosineSimilarity(event.embedding, memory.embedding);
                if (similarity >= cosineThreshold) {
                    log(`Dedup: Skipping "${event.summary}..." (${(similarity * 100).toFixed(1)}% similar to existing)`);
                    return false;
                }
            }
            return true;
        });
    }

    // Phase 2: Intra-batch Jaccard dedup
    const kept = [];
    for (const event of filtered) {
        const eventTokens = new Set(tokenize(event.summary || ''));
        let isDuplicate = false;
        for (const keptEvent of kept) {
            const keptTokens = new Set(tokenize(keptEvent.summary || ''));
            const intersection = [...eventTokens].filter(t => keptTokens.has(t)).length;
            const union = new Set([...eventTokens, ...keptTokens]).size;
            const jaccard = union > 0 ? intersection / union : 0;
            if (jaccard >= jaccardThreshold) {
                log(`Dedup: Skipping "${event.summary.slice(0, 60)}..." (Jaccard ${(jaccard * 100).toFixed(1)}% with "${keptEvent.summary.slice(0, 60)}...")`);
                isDuplicate = true;
                break;
            }
        }
        if (!isDuplicate) kept.push(event);
    }
    return kept;
}
```

- Import `tokenize` from `../retrieval/math.js` at top of file (if not already imported).
- At the call site (~line 375), pass both thresholds:
```javascript
const dedupThreshold = settings.dedupSimilarityThreshold ?? 0.85;
const jaccardThreshold = settings.dedupJaccardThreshold ?? 0.6;
enrichedEvents = filterSimilarEvents(enrichedEvents, existingMemories, dedupThreshold, jaccardThreshold);
```

### Step 4: Verify (Green)

- Command: `npm test tests/extraction/extract.test.js`
- Expect: PASS

### Step 5: Git Commit

- Command: `git add . && git commit -m "feat: add intra-batch Jaccard dedup to filterSimilarEvents"`

---

## Task 2: Prune Main Character Edges Before Louvain Community Detection

**Goal:** Temporarily remove edges involving the two main characters (User and Char) before running Louvain, so secondary entities cluster by their mutual relationships rather than all connecting through the protagonist hairball.

### Step 1: Write Failing Test

- File: `tests/graph/communities.test.js`
- Add:
```javascript
describe('detectCommunities - main character pruning', () => {
    it('finds multiple communities when main character edges are pruned', () => {
        // Build a graph where everything connects through "protagonist"
        // but two distinct clusters exist among secondary entities
        const graphData = {
            nodes: {
                protagonist: { name: 'Protagonist', type: 'PERSON', description: 'Main', mentions: 10 },
                shopkeeper: { name: 'Shopkeeper', type: 'PERSON', description: 'Shop owner', mentions: 3 },
                shop: { name: 'Shop', type: 'PLACE', description: 'A store', mentions: 3 },
                item: { name: 'Magic Sword', type: 'OBJECT', description: 'A sword', mentions: 2 },
                teacher: { name: 'Teacher', type: 'PERSON', description: 'A mentor', mentions: 3 },
                school: { name: 'School', type: 'PLACE', description: 'Academy', mentions: 3 },
                textbook: { name: 'Textbook', type: 'OBJECT', description: 'A book', mentions: 2 },
            },
            edges: {
                // Protagonist connects to everything (hairball)
                p_shop: { source: 'protagonist', target: 'shopkeeper', description: 'visits', weight: 5 },
                p_teach: { source: 'protagonist', target: 'teacher', description: 'studies with', weight: 5 },
                p_school: { source: 'protagonist', target: 'school', description: 'attends', weight: 3 },
                p_store: { source: 'protagonist', target: 'shop', description: 'goes to', weight: 3 },
                // Cluster A: shop world
                sk_shop: { source: 'shopkeeper', target: 'shop', description: 'owns', weight: 4 },
                sk_item: { source: 'shopkeeper', target: 'item', description: 'sells', weight: 3 },
                shop_item: { source: 'shop', target: 'item', description: 'contains', weight: 3 },
                // Cluster B: school world
                t_school: { source: 'teacher', target: 'school', description: 'works at', weight: 4 },
                t_book: { source: 'teacher', target: 'textbook', description: 'uses', weight: 3 },
                school_book: { source: 'school', target: 'textbook', description: 'has', weight: 3 },
            },
        };

        const mainCharacterKeys = ['protagonist'];
        const result = detectCommunities(graphData, mainCharacterKeys);
        expect(result).not.toBeNull();
        // Without pruning, Louvain likely finds 1 community (everything through protagonist)
        // With pruning, should find >= 2 communities (shop cluster + school cluster)
        expect(result.count).toBeGreaterThanOrEqual(2);
    });

    it('still works when mainCharacterKeys is empty', () => {
        const graphData = {
            nodes: {
                a: { name: 'A', type: 'PERSON', description: 'A', mentions: 1 },
                b: { name: 'B', type: 'PERSON', description: 'B', mentions: 1 },
                c: { name: 'C', type: 'PERSON', description: 'C', mentions: 1 },
            },
            edges: {
                ab: { source: 'a', target: 'b', description: 'knows', weight: 1 },
                bc: { source: 'b', target: 'c', description: 'knows', weight: 1 },
            },
        };
        const result = detectCommunities(graphData, []);
        expect(result).not.toBeNull();
    });
});
```

### Step 2: Run Test (Red)

- Command: `npm test tests/graph/communities.test.js`
- Expect: Fail — `detectCommunities` doesn't accept `mainCharacterKeys` parameter.

### Step 3: Implementation (Green)

- File: `src/graph/communities.js`
- Update `detectCommunities` signature and logic:

```javascript
/**
 * Run Louvain community detection on the graph.
 * Temporarily prunes edges involving main characters to avoid hairball effect.
 * @param {Object} graphData - Flat graph data
 * @param {string[]} mainCharacterKeys - Node keys for main characters (User + Char) to prune
 * @returns {{ communities: Object<string, number>, count: number } | null}
 */
export function detectCommunities(graphData, mainCharacterKeys = []) {
    if (Object.keys(graphData.nodes || {}).length < 3) return null;

    const directed = toGraphology(graphData);
    const undirected = toUndirected(directed);

    // Temporarily remove edges involving main characters for better community structure
    const mainSet = new Set(mainCharacterKeys);
    if (mainSet.size > 0) {
        const edgesToDrop = [];
        undirected.forEachEdge((edge, _attrs, source, target) => {
            if (mainSet.has(source) || mainSet.has(target)) {
                edgesToDrop.push(edge);
            }
        });
        for (const edge of edgesToDrop) {
            undirected.dropEdge(edge);
        }
        // Also drop isolated nodes that lost all edges (main chars themselves)
        undirected.forEachNode((node) => {
            if (undirected.degree(node) === 0) {
                undirected.dropNode(node);
            }
        });
    }

    // Need at least 3 nodes after pruning
    if (undirected.order < 3) {
        // Fallback: run without pruning
        const fallbackDirected = toGraphology(graphData);
        const fallbackUndirected = toUndirected(fallbackDirected);
        const details = louvain.detailed(fallbackUndirected, {
            getEdgeWeight: 'weight',
            resolution: 1.0,
        });
        return { communities: details.communities, count: details.count };
    }

    const details = louvain.detailed(undirected, {
        getEdgeWeight: 'weight',
        resolution: 1.0,
    });

    // Re-assign main characters to the community of their strongest remaining neighbor
    for (const mainKey of mainCharacterKeys) {
        if (!graphData.nodes[mainKey]) continue;
        // Find neighbor with highest edge weight
        let bestCommunity = 0;
        let bestWeight = -1;
        for (const [_edgeKey, edge] of Object.entries(graphData.edges || {})) {
            const neighborKey = edge.source === mainKey ? edge.target : edge.target === mainKey ? edge.source : null;
            if (neighborKey && details.communities[neighborKey] !== undefined) {
                if ((edge.weight || 1) > bestWeight) {
                    bestWeight = edge.weight || 1;
                    bestCommunity = details.communities[neighborKey];
                }
            }
        }
        details.communities[mainKey] = bestCommunity;
    }

    return {
        communities: details.communities,
        count: details.count,
    };
}
```

- Update the caller of `detectCommunities` to pass main character keys. Find where it's called (likely in the graph pipeline) and pass the User and Char node keys.

### Step 4: Verify (Green)

- Command: `npm test tests/graph/communities.test.js`
- Expect: PASS

### Step 5: Find and Update Caller

- Search for `detectCommunities(` call sites in `src/` and update them to pass `mainCharacterKeys`.
- The caller likely has access to the character name and user name from context. Derive the node keys (lowercase or normalized form matching graph node keys).

### Step 6: Run Full Suite

- Command: `npm test`
- Expect: PASS

### Step 7: Git Commit

- Command: `git add . && git commit -m "feat: prune main character edges before Louvain community detection"`

---

## Task 3: Dynamic Character Name Stopwords for BM25

**Goal:** Filter main character names from BM25 query tokens at retrieval time, since they appear in nearly every memory and waste BM25 weight that should go to action verbs and objects.

### Step 1: Write Failing Test

- File: `tests/math.test.js`
- Add:
```javascript
describe('scoreMemories - dynamic character stopwords', () => {
    it('filters character names from BM25 tokens when characterNames provided', () => {
        // Create memories where "suzy" appears in every one but content differs
        const memories = [
            { importance: 3, message_ids: [10], embedding: null, summary: 'Suzy walked to the park with her dog' },
            { importance: 3, message_ids: [20], embedding: null, summary: 'Suzy bought a red dress at the mall' },
            { importance: 3, message_ids: [30], embedding: null, summary: 'Suzy cooked pasta for dinner tonight' },
        ];

        const constants = { BASE_LAMBDA: 0.05, IMPORTANCE_5_FLOOR: 5 };
        const settings = { vectorSimilarityThreshold: 0.5, alpha: 0.7, combinedBoostWeight: 15 };

        // Query: "suzy park dog" — "suzy" is in every memory so has zero discriminative value
        // With character stopwords, BM25 should focus on "park" and "dog"
        const resultWith = scoreMemories(memories, null, 50, constants, settings, 'suzy park dog', ['suzy']);
        const resultWithout = scoreMemories(memories, null, 50, constants, settings, 'suzy park dog', []);

        // With filtering, the park/dog memory should score higher relative to others
        // because "suzy" no longer inflates all scores equally
        const parkMemoryWith = resultWith.find(r => r.memory.summary.includes('park'));
        const pastaMemoryWith = resultWith.find(r => r.memory.summary.includes('pasta'));
        const parkMemoryWithout = resultWithout.find(r => r.memory.summary.includes('park'));
        const pastaMemoryWithout = resultWithout.find(r => r.memory.summary.includes('pasta'));

        // The gap between park and pasta should be larger with filtering
        const gapWith = parkMemoryWith.score - pastaMemoryWith.score;
        const gapWithout = parkMemoryWithout.score - pastaMemoryWithout.score;
        expect(gapWith).toBeGreaterThan(gapWithout);
    });
});
```

### Step 2: Run Test (Red)

- Command: `npm test tests/math.test.js`
- Expect: Fail — `scoreMemories` doesn't accept a `characterNames` parameter.

### Step 3: Implementation (Green)

- File: `src/retrieval/math.js`
- Add `characterNames` parameter to `scoreMemories`:

```javascript
export function scoreMemories(memories, contextEmbedding, chatLength, constants, settings, queryTokens, characterNames = []) {
```

- After tokenizing `queryTokens` (~line 278), add character name filtering:

```javascript
        tokens = Array.isArray(queryTokens) ? queryTokens : tokenize(queryTokens);

        // Filter out main character name stems — they appear in nearly every memory
        // and have near-zero IDF, wasting BM25 weight on non-discriminative tokens
        if (characterNames.length > 0) {
            const charStems = new Set(characterNames.flatMap(name => tokenize(name.toLowerCase())));
            tokens = tokens.filter(t => !charStems.has(t));
        }

        if (tokens.length > 0) {
```

- File: `src/retrieval/scoring.js`
- Update `scoreMemoriesDirect` to accept and pass `characterNames`:

```javascript
function scoreMemoriesDirect(memories, contextEmbedding, chatLength, limit, queryTokens, characterNames = []) {
    const { constants, settings } = getScoringParams();
    const scored = scoreMemories(memories, contextEmbedding, chatLength, constants, settings, queryTokens, characterNames);
```

- Update `selectRelevantMemoriesSimple` to derive character names from context and pass them through:
  - The function already receives `ctx.activeCharacters`. Use these as the character names.
  - Pass to `scoreMemoriesDirect`:
```javascript
return scoreMemoriesDirect(memories, contextEmbedding, chatLength, limit, bm25Tokens, ctx.activeCharacters || []);
```

### Step 4: Verify (Green)

- Command: `npm test tests/math.test.js`
- Expect: PASS

### Step 5: Run Full Suite

- Command: `npm test`
- Expect: PASS

### Step 6: Git Commit

- Command: `git add . && git commit -m "feat: dynamic character name stopwords for BM25 scoring"`

---

## Task 4: Final Verification

### Step 1: Run full test suite

- Command: `npm test`
- Expect: All tests pass.

### Step 2: Run linter

- Command: `npm run lint`
- Expect: No errors (or fix with `npm run format`).

### Step 3: Git Commit (if any lint fixes)

- Command: `npm run format && git add . && git commit -m "chore: format"`
