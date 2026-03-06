# Implementation Plan — Graph-Anchored Entity Detection

> **Reference:** `docs/designs/2026-03-06-graph-anchored-entity-detection-design.md`
> **Execution:** Use `executing-plans` skill.

---

### Task 1: Create Shared Stemmer Utility

**Goal:** Extract `stemWord()` from `math.js` into `src/utils/stemmer.js`, add `stemName()`.

**Step 1: Write the Failing Test**
- File: `tests/utils/stemmer.test.js`
- Code:
  ```javascript
  import { describe, expect, it } from 'vitest';
  import { stemWord, stemName } from '../../src/utils/stemmer.js';

  describe('stemWord', () => {
      it('stems English words', () => {
          expect(stemWord('running')).toBe('run');
          expect(stemWord('castles')).toBe('castl');
      });

      it('stems Russian words', () => {
          expect(stemWord('елену')).toBe(stemWord('елена'));
          expect(stemWord('москвы')).toBe(stemWord('москва'));
      });

      it('passes through non-Latin/Cyrillic unchanged', () => {
          expect(stemWord('東京')).toBe('東京');
      });
  });

  describe('stemName', () => {
      it('stems multi-word names into a Set', () => {
          const stems = stemName('King Aldric');
          expect(stems).toBeInstanceOf(Set);
          expect(stems.has('king')).toBe(true);
          expect(stems.has('aldric')).toBe(true);
      });

      it('handles Russian names with inflections', () => {
          const nominative = stemName('Елена');
          const accusative = stemName('Елену');
          // Both should produce the same stem set
          expect([...nominative]).toEqual([...accusative]);
      });

      it('filters stems shorter than 3 chars', () => {
          const stems = stemName('Jo Bo');
          expect(stems.size).toBe(0);
      });

      it('returns empty set for null/empty', () => {
          expect(stemName(null).size).toBe(0);
          expect(stemName('').size).toBe(0);
      });

      it('does NOT filter stopwords — entity names are sacred', () => {
          // "The Castle" should keep "castl" stem even though "the" is a stopword
          const stems = stemName('The Castle');
          expect(stems.has('castl')).toBe(true);
          // "the" stems to "the" (3 chars), might be included — that's fine
      });
  });
  ```

**Step 2: Run Test (Red)**
- Command: `npx vitest run tests/utils/stemmer.test.js`
- Expect: Import fails — `src/utils/stemmer.js` doesn't exist.

**Step 3: Implementation (Green)**
- File: `src/utils/stemmer.js`
- Action: Create new file with `stemWord()` and `stemName()` as specified in the design doc section 3.1.

**Step 4: Verify (Green)**
- Command: `npx vitest run tests/utils/stemmer.test.js`
- Expect: PASS

**Step 5: Git Commit**
- `git add src/utils/stemmer.js tests/utils/stemmer.test.js && git commit -m "feat: shared stemmer utility (stemWord + stemName)"`

---

### Task 2: DRY math.js — Remove Duplicate Stemmers

**Goal:** Make `math.js` import from the new shared utility. Delete its private stemmer copies.

**Step 1: Write the Failing Test**
- No new test needed. Existing `math.js` tests (BM25, tokenize) serve as regression.

**Step 2: Run Existing Tests (Green Baseline)**
- Command: `npx vitest run tests/math.test.js`
- Expect: PASS (baseline before refactor)

**Step 3: Implementation**
- File: `src/retrieval/math.js`
- **DELETE these lines** (approximately lines 8–26):
  ```javascript
  import snowball from 'https://esm.sh/snowball-stemmers';
  const ruStemmer = snowball.newStemmer('russian');
  const enStemmer = snowball.newStemmer('english');
  const CYRILLIC_RE = /\p{Script=Cyrillic}/u;
  const LATIN_RE = /\p{Script=Latin}/u;
  function stemWord(word) { ... }
  ```
- **ADD import:**
  ```javascript
  import { stemWord } from '../utils/stemmer.js';
  ```

**Step 4: Verify (Green)**
- Command: `npx vitest run tests/math.test.js`
- Expect: PASS — all existing BM25/tokenize tests still pass.

**Step 5: Git Commit**
- `git add src/retrieval/math.js && git commit -m "refactor: math.js imports stemWord from shared utility"`

---

### Task 3: Add Alias Persistence to Graph Merges

**Goal:** When entities merge, persist the old name as an alias on the surviving node.

**Step 1: Write the Failing Tests**
- File: `tests/graph/graph.test.js`
- Add inside the existing `describe('mergeOrInsertEntity')` block:
  ```javascript
  it('persists alias when semantic merge occurs', async () => {
      const { getDocumentEmbedding } = await import('../../src/embeddings.js');
      getDocumentEmbedding.mockResolvedValue([0.9, 0.1, 0]);

      upsertEntity(graphData, 'Vova', 'PERSON', 'A young man');
      graphData.nodes.vova.embedding = [0.9, 0.1, 0];

      await mergeOrInsertEntity(graphData, 'Vova (aka Lily)', 'PERSON', 'Also Vova', 3, mockSettings);

      expect(graphData.nodes.vova.aliases).toBeDefined();
      expect(graphData.nodes.vova.aliases).toContain('Vova (aka Lily)');
  });

  it('does not add alias on exact key match (fast path)', async () => {
      const { getDocumentEmbedding } = await import('../../src/embeddings.js');
      getDocumentEmbedding.mockResolvedValue(null);

      upsertEntity(graphData, 'Castle', 'PLACE', 'A fortress');
      await mergeOrInsertEntity(graphData, 'castle', 'PLACE', 'Updated', 3, mockSettings);

      // Fast path: same key, no alias needed
      expect(graphData.nodes.castle.aliases).toBeUndefined();
  });
  ```
- Add inside the existing `describe('consolidateGraph')` block:
  ```javascript
  it('persists alias during consolidation merge', async () => {
      const { getDocumentEmbedding } = await import('../../src/embeddings.js');
      getDocumentEmbedding.mockResolvedValue([1, 0, 0]);

      const graphData = { nodes: {}, edges: {} };
      upsertEntity(graphData, "Vova's House", 'PLACE', 'Home');
      upsertEntity(graphData, "Vova's Apartment", 'PLACE', 'Flat');
      graphData.nodes['vova house'].embedding = [1, 0, 0];
      graphData.nodes['vova apartment'].embedding = [1, 0, 0];
      // Give "vova house" more mentions so it survives
      graphData.nodes['vova house'].mentions = 5;

      await consolidateGraph(graphData, { entityMergeSimilarityThreshold: 0.8, entityDescriptionCap: 3 });

      // The surviving node should have the removed node's name as alias
      const survivor = graphData.nodes['vova house'];
      expect(survivor).toBeDefined();
      expect(survivor.aliases).toContain("Vova's Apartment");
  });
  ```

**Step 2: Run Tests (Red)**
- Command: `npx vitest run tests/graph/graph.test.js`
- Expect: Fail — `aliases` is undefined on merged nodes.

**Step 3: Implementation**
- File: `src/graph/graph.js`
- In `mergeOrInsertEntity()`, after the `log('[graph] Entity merged...')` line and before `return bestMatch;`, add:
  ```javascript
  // Persist alias for retrieval-time alternate name matching
  if (!graphData.nodes[bestMatch].aliases) graphData.nodes[bestMatch].aliases = [];
  graphData.nodes[bestMatch].aliases.push(name);
  ```
- In `consolidateGraph()`, inside the `for (const [removeKey, keepKey] of mergeMap)` loop, after
  `upsertEntity(...)` and before `redirectEdges(...)`, add:
  ```javascript
  // Persist alias for retrieval-time alternate name matching
  if (!graphData.nodes[keepKey].aliases) graphData.nodes[keepKey].aliases = [];
  graphData.nodes[keepKey].aliases.push(removedNode.name);
  ```

**Step 4: Verify (Green)**
- Command: `npx vitest run tests/graph/graph.test.js`
- Expect: PASS

**Step 5: Git Commit**
- `git add src/graph/graph.js tests/graph/graph.test.js && git commit -m "feat: persist aliases on graph node merge"`

---

### Task 4: Rewrite extractQueryContext — Graph-Anchored + Remove Old Code

**Goal:** Replace regex-based `extractFromText()` with graph-anchored stem matching. Delete all old extraction code.

**Step 1: Write the Failing Tests**
- File: `tests/query-context.test.js`
- **DELETE** the entire existing `describe('entity extraction')` block (tests for Latin capitalized names, Cyrillic names, sentence starters, interjections, minimum 3 chars).
- **DELETE** the `describe('active characters')` block.
- **DELETE** the `describe('frequency filtering')` block.
- **REPLACE** with new tests that pass `graphNodes` as 3rd argument:
  ```javascript
  describe('extractQueryContext — graph-anchored', () => {
      describe('entity detection from graph nodes', () => {
          it('detects graph entity names in messages', () => {
              const messages = [
                  { mes: 'Sarah went to the Cabin with Marcus' },
                  { mes: 'They talked for hours.' },
                  { mes: 'Nothing else happened.' },
              ];
              const graphNodes = {
                  sarah: { name: 'Sarah', type: 'PERSON' },
                  cabin: { name: 'Cabin', type: 'PLACE' },
                  marcus: { name: 'Marcus', type: 'PERSON' },
              };
              const result = extractQueryContext(messages, [], graphNodes);
              expect(result.entities).toContain('Sarah');
              expect(result.entities).toContain('Cabin');
              expect(result.entities).toContain('Marcus');
          });

          it('does NOT detect words that are not in graph', () => {
              const messages = [
                  { mes: 'Запомни это. Держись крепче. The weather is nice.' },
                  { mes: 'Another message.' },
                  { mes: 'One more.' },
              ];
              const graphNodes = {
                  sarah: { name: 'Sarah', type: 'PERSON' },
              };
              const result = extractQueryContext(messages, [], graphNodes);
              expect(result.entities).not.toContain('Запомни');
              expect(result.entities).not.toContain('Держись');
              expect(result.entities).not.toContain('The');
          });

          it('matches Russian inflectional forms via stemming', () => {
              const messages = [
                  { mes: 'Подошла к Елену и сказала' },
                  { mes: 'Потом ушла.' },
                  { mes: 'Вернулась.' },
              ];
              const graphNodes = {
                  елена: { name: 'Елена', type: 'PERSON' },
              };
              const result = extractQueryContext(messages, [], graphNodes);
              expect(result.entities).toContain('Елена');
          });

          it('matches aliases from merged entities', () => {
              const messages = [
                  { mes: 'Lily came into the room.' },
                  { mes: 'She sat down.' },
                  { mes: 'Nothing else.' },
              ];
              const graphNodes = {
                  vova: { name: 'Vova', type: 'PERSON', aliases: ['Vova (aka Lily)'] },
              };
              const result = extractQueryContext(messages, [], graphNodes);
              expect(result.entities).toContain('Vova');
          });
      });

      describe('active characters', () => {
          it('boosts known character names even without graph', () => {
              const messages = [
                  { mes: 'Someone mentioned the cabin.' },
                  { mes: 'It was quiet outside.' },
                  { mes: 'Nothing else happened.' },
              ];
              const result = extractQueryContext(messages, ['Elena', 'Viktor'], {});
              expect(result.entities).toContain('Elena');
              expect(result.entities).toContain('Viktor');
          });
      });

      describe('frequency filtering', () => {
          it('filters entities appearing in >50% of messages', () => {
              const messages = [
                  { mes: 'Alice and Bob talked.' },
                  { mes: 'Alice went home.' },
                  { mes: 'Alice came back.' },
                  { mes: 'Charlie arrived.' },
              ];
              const graphNodes = {
                  alice: { name: 'Alice', type: 'PERSON' },
                  bob: { name: 'Bob', type: 'PERSON' },
                  charlie: { name: 'Charlie', type: 'PERSON' },
              };
              const result = extractQueryContext(messages, [], graphNodes);
              expect(result.entities).not.toContain('Alice');
              expect(result.entities).toContain('Bob');
              expect(result.entities).toContain('Charlie');
          });
      });

      describe('recency weighting', () => {
          it('weights recent messages higher', () => {
              const messages = [
                  { mes: 'Marcus arrived at the door.' },
                  { mes: 'Sarah left earlier.' },
                  { mes: 'Bob was there too.' },
                  { mes: 'Charlie came by.' },
                  { mes: 'Marcus spoke first.' },
              ];
              const graphNodes = {
                  marcus: { name: 'Marcus', type: 'PERSON' },
                  sarah: { name: 'Sarah', type: 'PERSON' },
                  bob: { name: 'Bob', type: 'PERSON' },
                  charlie: { name: 'Charlie', type: 'PERSON' },
              };
              const result = extractQueryContext(messages, [], graphNodes);
              expect(result.weights.Marcus).toBeGreaterThan(result.weights.Sarah);
          });
      });

      describe('edge cases', () => {
          it('returns empty for null messages', () => {
              const result = extractQueryContext(null);
              expect(result.entities).toEqual([]);
              expect(result.weights).toEqual({});
          });

          it('returns empty for empty array', () => {
              const result = extractQueryContext([]);
              expect(result.entities).toEqual([]);
              expect(result.weights).toEqual({});
          });

          it('handles empty graph gracefully', () => {
              const messages = [
                  { mes: 'just lowercase text here' },
                  { mes: 'more words' },
                  { mes: 'nothing special' },
              ];
              const result = extractQueryContext(messages, [], {});
              expect(result.entities).toEqual([]);
          });
      });
  });
  ```

**Step 2: Run Tests (Red)**
- Command: `npx vitest run tests/query-context.test.js`
- Expect: Fail — `extractQueryContext` still uses old signature (no `graphNodes` param).

**Step 3: Implementation**
- File: `src/retrieval/query-context.js`
- **DELETE** the `extractFromText()` function entirely (lines ~18–53).
- **DELETE** these imports:
  ```javascript
  import { isLikelyImperative } from '../utils/russian-imperatives.js';
  import { ALL_STOPWORDS } from '../utils/stopwords.js';
  ```
- **ADD** import:
  ```javascript
  import { stemName, stemWord } from '../utils/stemmer.js';
  ```
- **REWRITE** `extractQueryContext()` to accept `graphNodes` as 3rd param and use stem matching:
  ```javascript
  export function extractQueryContext(messages, activeCharacters = [], graphNodes = {}) {
      if (!messages || messages.length === 0) {
          return { entities: [], weights: {} };
      }

      const settings = getQueryContextSettings();

      // Build stem → display name map from graph nodes + aliases + characters
      const stemToEntity = new Map();
      for (const [, node] of Object.entries(graphNodes)) {
          for (const stem of stemName(node.name)) {
              stemToEntity.set(stem, node.name);
          }
          for (const alias of node.aliases || []) {
              for (const stem of stemName(alias)) {
                  stemToEntity.set(stem, node.name);
              }
          }
      }
      for (const char of activeCharacters) {
          for (const stem of stemName(char)) {
              stemToEntity.set(stem, char);
          }
      }

      const entityScores = new Map();
      const entityMessageCounts = new Map();
      const messagesToScan = messages.slice(0, settings.entityWindowSize);

      messagesToScan.forEach((msg, index) => {
          const recencyWeight = 1 - index * settings.recencyDecayFactor;
          const text = msg.mes || msg.message || '';

          // Stem message words (no stopword filter — entity names could be stopwords)
          const words = (text.toLowerCase().match(/[\p{L}0-9]+/gu) || [])
              .filter(w => w.length > 2)
              .map(stemWord)
              .filter(w => w.length > 2);

          const matchedInMsg = new Set();
          for (const word of words) {
              const entity = stemToEntity.get(word);
              if (entity) matchedInMsg.add(entity);
          }

          for (const entity of matchedInMsg) {
              entityMessageCounts.set(entity, (entityMessageCounts.get(entity) || 0) + 1);
              const current = entityScores.get(entity) || { count: 0, weightSum: 0 };
              current.count++;
              current.weightSum += recencyWeight;
              entityScores.set(entity, current);
          }
      });

      // Boost active characters
      for (const charName of activeCharacters) {
          if (charName && charName.length >= 2) {
              const current = entityScores.get(charName) || { count: 0, weightSum: 0 };
              current.weightSum += 3.0;
              entityScores.set(charName, current);
          }
      }

      // Filter entities appearing in >50% of messages
      const threshold = messagesToScan.length * 0.5;
      for (const [entity, count] of entityMessageCounts.entries()) {
          if (count > threshold) {
              entityScores.delete(entity);
          }
      }

      // Sort by weight sum and take top N
      const sorted = Array.from(entityScores.entries())
          .sort((a, b) => b[1].weightSum - a[1].weightSum)
          .slice(0, settings.topEntitiesCount);

      const entities = sorted.map(([entity]) => entity);
      const weights = Object.fromEntries(sorted.map(([entity, data]) => [entity, data.weightSum]));
      return { entities, weights };
  }
  ```

**Step 4: Verify (Green)**
- Command: `npx vitest run tests/query-context.test.js`
- Expect: PASS

**Step 5: Git Commit**
- `git add src/retrieval/query-context.js tests/query-context.test.js && git commit -m "feat: graph-anchored entity detection, remove regex extraction"`

---

### Task 5: Wire Graph Nodes Through Retrieval Pipeline

**Goal:** Pass `data.graph.nodes` from `retrieve.js` → `scoring.js` → `extractQueryContext()`.

**Step 1: No New Tests**
- The integration is tested by the rewritten query-context tests (Task 4) and existing retrieval tests.
- Run baseline first.

**Step 2: Run Existing Tests (Green Baseline)**
- Command: `npx vitest run`
- Expect: PASS (everything from Tasks 1–4)

**Step 3: Implementation**
- File: `src/retrieval/retrieve.js`
  - In `buildRetrievalContext()`, add `graphNodes` to the returned object:
    ```javascript
    const data = getOpenVaultData();
    // ... existing code ...
    return {
        recentContext,
        userMessages,
        chatLength: chat.length,
        primaryCharacter,
        activeCharacters: getActiveCharacters(),
        headerName: isGroupChat ? povCharacters[0] : 'Scene',
        finalTokens: settings.retrievalFinalTokens || 12000,
        worldContextBudget: settings.worldContextBudget || 2000,
        graphNodes: data?.graph?.nodes || {},   // NEW
    };
    ```
  - Update JSDoc `@typedef RetrievalContext` to include `graphNodes`.

- File: `src/retrieval/scoring.js`
  - In `selectRelevantMemoriesSimple()`, pass `ctx.graphNodes` to `extractQueryContext`:
    ```javascript
    // Change this line:
    const queryContext = extractQueryContext(recentMessages, activeCharacters);
    // To:
    const queryContext = extractQueryContext(recentMessages, activeCharacters, ctx.graphNodes || {});
    ```

**Step 4: Verify (Green)**
- Command: `npx vitest run`
- Expect: PASS — all tests pass.

**Step 5: Git Commit**
- `git add src/retrieval/retrieve.js src/retrieval/scoring.js && git commit -m "feat: wire graph nodes into retrieval query context"`

---

### Task 6: Cleanup — Remove Dead Imports

**Goal:** Verify no remaining references to removed code paths. Remove `extractFromText` test artifacts.

**Step 1: Verify**
- Search for `extractFromText` across the codebase — should have zero hits.
- Search for `isLikelyImperative` imports outside `stopwords.js` — should have zero hits in `query-context.js`.
- Confirm `query-context.js` no longer imports from `stopwords.js` or `russian-imperatives.js`.

**Step 2: Run Full Suite**
- Command: `npx vitest run`
- Expect: PASS — all tests green, no dead imports.

**Step 3: Git Commit**
- `git add -A && git commit -m "chore: verify cleanup of removed regex entity extraction"`
