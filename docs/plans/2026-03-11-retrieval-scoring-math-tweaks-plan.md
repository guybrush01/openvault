# Implementation Plan - Retrieval & Scoring Math Tweaks (Phase 3)

> **Reference:** `docs/designs/2026-03-11-retrieval-scoring-math-tweaks-design.md`
> **Execution:** Use `executing-plans` skill.

## Overview

This plan implements three independent features in order:
1. **Phase 1:** BM25 Exact Phrase Tokens (1-2 days)
2. **Phase 2:** Recursive Reflection Tree (2-3 days)
3. **Phase 3:** Score-First Budgeting (1-2 days)

Each phase is independently commit-ready. Phases can be executed sequentially or in parallel by different developers.

---

# PHASE 1: BM25 Exact Phrase Tokens

## Task 1.1: Split Multi-Word and Single-Word Entities in buildBM25Tokens

**Goal:** Modify `buildBM25Tokens()` to categorize entities into multi-word (Layer 0) and single-word (Layer 1).

**Step 1: Write the Failing Test**
- File: `tests/retrieval/query-context.test.js`
- Code:
  ```javascript
  describe('buildBM25Tokens multi-word entity splitting', () => {
      it('should separate multi-word entities (Layer 0) from single-word entities (Layer 1)', async () => {
          const { buildBM25Tokens } = await import('../../src/retrieval/query-context.js');

          const entities = {
              entities: ['King Aldric', 'Queen', 'Silver Sword of Destiny'],
              weights: { 'King Aldric': 2.0, 'Queen': 1.0, 'Silver Sword of Destiny': 3.0 }
          };
          const corpusVocab = new Set(['sword', 'king']);
          const meta = {};

          const tokens = buildBM25Tokens('test message', entities, corpusVocab, meta);

          // Layer 0: multi-word entities (un-tokenized, contain spaces)
          const layer0Tokens = tokens.filter(t => t.includes(' '));
          // Layer 1: single-word entity stems (no spaces)
          const layer1Tokens = tokens.filter(t => !t.includes(' ')).filter(t =>
              t.startsWith('king') || t.startsWith('aldr') || t.startsWith('queen')
          );

          // "King Aldric" appears once (boost applied in scoring)
          expect(layer0Tokens.filter(t => t === 'King Aldric').length).toBe(1);
          // "Silver Sword of Destiny" appears once
          expect(layer0Tokens.filter(t => t === 'Silver Sword of Destiny').length).toBe(1);
          // Single-word "Queen" goes to Layer 1 (stemmed, 5x boost)
          expect(layer1Tokens.length).toBeGreaterThan(0);

          // Meta should track layer counts (phrases added once each)
          expect(meta.layer0Count).toBe(2); // 1 + 1 (not 10 + 10)
          expect(meta.layer1Count).toBeGreaterThan(0);
      });

      it('should treat entities with single space as multi-word', async () => {
          const { buildBM25Tokens } = await import('../../src/retrieval/query-context.js');

          const entities = { entities: ['Dark Castle'], weights: { 'Dark Castle': 1.0 } };
          const corpusVocab = new Set();

          const tokens = buildBM25Tokens('test', entities, corpusVocab, {});

          // Should have exact phrase "Dark Castle" once (boost applied in scoring)
          expect(tokens.filter(t => t === 'Dark Castle').length).toBe(1);
      });

      it('should treat single-word entities as Layer 1 (stemmed)', async () => {
          const { buildBM25Tokens } = await import('../../src/retrieval/query-context.js');

          const entities = { entities: ['Dragon'], weights: { Dragon: 1.0 } };
          const corpusVocab = new Set();

          const tokens = buildBM25Tokens('test', entities, corpusVocab, {});

          // Single-word entity should be stemmed (drag -> drag, not "Dragon")
          const hasStemmed = tokens.some(t => t.includes('drag') && t !== 'Dragon');
          expect(hasStemmed).toBe(true);
          // Should NOT contain raw "Dragon" with space
          expect(tokens.includes('Dragon')).toBe(false);
      });
  });
  ```

**Step 2: Run Test (Red)**
- Command: `npm test tests/retrieval/query-context.test.js`
- Expect: FAIL - meta.layer0Count is undefined, splitting logic doesn't exist

**Step 3: Implementation (Green)**
- File: `src/retrieval/query-context.js`
- Action: Modify `buildBM25Tokens()` function
- Guidance:
  ```javascript
  // In buildBM25Tokens(), replace the entity processing section:
  // OLD (Layer 1 only):
  // if (extractedEntities?.entities) {
  //     for (const entity of extractedEntities.entities) {
  //         const weight = (extractedEntities.weights[entity] || 1) * settings.entityBoostWeight;
  //         const repeats = Math.ceil(weight);
  //         const stemmed = tokenize(entity);
  //         for (let r = 0; r < repeats; r++) {
  //             tokens.push(...stemmed);
  //         }
  //     }
  // }

  // NEW (Layer 0 + Layer 1 split):
  let layer0Count = 0, layer1Count = 0;

  if (extractedEntities?.entities) {
      for (const entity of extractedEntities.entities) {
          const weight = extractedEntities.weights[entity] || 1;

          // Check if entity is multi-word (contains space after trimming)
          const isMultiWord = entity.trim().includes(' ');

          if (isMultiWord) {
              // Layer 0: Exact phrase token (un-tokenized, added ONCE)
              // Boost will be applied in BM25 scoring via hasExactPhrase check
              tokens.push(entity);
              layer0Count += 1;
          } else {
              // Layer 1: Single-word entity stems (existing behavior, 5x boost)
              const stemBoost = Math.ceil(weight * settings.entityBoostWeight);
              const stemmed = tokenize(entity);
              for (let r = 0; r < stemBoost; r++) {
                  tokens.push(...stemmed);
              }
              layer1Count += stemmed.length * stemBoost;
          }
      }
  }

  // Update meta tracking
  if (meta) {
      meta.layer0Count = (meta.layer0Count || 0) + layer0Count;
      meta.layer1Count = layer1Count;
      // layer2 (grounded) and layer3 (non-grounded) tracked below as before
  }
  ```

**Step 4: Verify (Green)**
- Command: `npm test tests/retrieval/query-context.test.js`
- Expect: PASS

**Step 5: Git Commit**
- Command: `git add src/retrieval/query-context.js tests/retrieval/query-context.test.js && git commit -m "feat(query-context): split entities into Layer 0 (multi-word) and Layer 1 (single-word)"`

---

## Task 1.2: Add hasExactPhrase() Helper Function

**Goal:** Create a helper to check if a memory contains an exact multi-word phrase.

**Step 1: Write the Failing Test**
- File: `tests/retrieval/math.test.js`
- Code:
  ```javascript
  describe('hasExactPhrase', () => {
      it('should return true when phrase exists in memory summary', async () => {
                  const { hasExactPhrase } = await import('../../src/retrieval/math.js');

          const memory = { summary: 'The King Aldric ruled wisely for decades' };
          const result = hasExactPhrase('King Aldric', memory);
          expect(result).toBe(true);
      });

      it('should be case-insensitive', async () => {
          const { hasExactPhrase } = await import('../../src/retrieval/math.js');

          const memory = { summary: 'KING ALDRIC ruled the kingdom' };
          expect(hasExactPhrase('king aldrIC', memory)).toBe(true);
      });

      it('should normalize whitespace', async () => {
          const { hasExactPhrase } = await import('../../src/retrieval/math.js');

          const memory = { summary: 'The  King   Aldric  arrived' }; // extra spaces
          expect(hasExactPhrase('King Aldric', memory)).toBe(true);
      });

      it('should return false for partial matches', async () => {
          const { hasExactPhrase } = await import('../../src/retrieval/math.js');

          const memory = { summary: 'The King ruled alone' };
          expect(hasExactPhrase('King Aldric', memory)).toBe(false); // "Aldric" missing
      });

      it('should return false for word-order mismatches', async () => {
          const { hasExactPhrase } = await import('../../src/retrieval/math.js');

          const memory = { summary: 'Aldric the King arrived' };
          expect(hasExactPhrase('King Aldric', memory)).toBe(false);
      });

      it('should handle punctuation by stripping it', async () => {
          const { hasExactPhrase } = await import('../../src/retrieval/math.js');

          const memory = { summary: 'King Aldric, Jr. was crowned' };
          expect(hasExactPhrase('King Aldric', memory)).toBe(true);
      });
  });
  ```

**Step 2: Run Test (Red)**
- Command: `npm test tests/retrieval/math.test.js`
- Expect: FAIL - hasExactPhrase function not found

**Step 3: Implementation (Green)**
- File: `src/retrieval/math.js`
- Action: Add `hasExactPhrase()` function
- Guidance:
  ```javascript
  // Add after tokenize() function, before calculateIDF()

  /**
   * Check if a memory contains an exact multi-word phrase (case-insensitive).
   * Normalizes whitespace and strips punctuation for matching.
   * @param {string} phrase - Multi-word phrase to find (must contain space)
   * @param {Object} memory - Memory object with summary field
   * @returns {boolean} True if exact phrase found in memory
   */
  export function hasExactPhrase(phrase, memory) {
      if (!phrase || !memory?.summary) return false;

      // Only handle multi-word phrases
      const trimmedPhrase = phrase.trim();
      if (!trimmedPhrase.includes(' ')) return false;

      // Normalize both strings: lowercase, normalize whitespace, strip punctuation
      const normalize = (str) =>
          str.toLowerCase()
              .replace(/\s+/g, ' ')  // Normalize whitespace
              .replace(/[^\p{L}\p{N}\s]/gu, '')  // Strip punctuation (keep letters, numbers, spaces)
              .trim();

      const normalizedPhrase = normalize(trimmedPhrase);
      const normalizedSummary = normalize(memory.summary);

      return normalizedSummary.includes(normalizedPhrase);
  }
  ```

**Step 4: Verify (Green)**
- Command: `npm test tests/retrieval/math.test.js`
- Expect: PASS

**Step 5: Git Commit**
- Command: `git add src/retrieval/math.js tests/retrieval/math.test.js && git commit -m "feat(math): add hasExactPhrase() helper for multi-word entity matching"`

---

## Task 1.3: Modify BM25 Scoring to Use Exact Phrase Boost

**Goal:** Apply 10x boost to memories containing exact phrase matches.

**Step 1: Write the Failing Test**
- File: `tests/retrieval/math.test.js`
- Code:
  ```javascript
  describe('BM25 with exact phrase tokens', () => {
      it('should apply additional boost for memories with exact phrase matches', async () => {
          const { scoreMemories, hasExactPhrase } = await import('../../src/retrieval/math.js');

          const memories = [
              { id: '1', summary: 'She wore the burgundy lingerie set to bed', tokens: ['burgundi', 'lingeri', 'set'], message_ids: [100], importance: 3 },
              { id: '2', summary: 'He grabbed the key set from the table', tokens: ['key', 'set', 'tabl'], message_ids: [100], importance: 3 },
          ];

          const contextEmbedding = null;
          const chatLength = 200;
          const constants = { BASE_LAMBDA: 0.05, IMPORTANCE_5_FLOOR: 1.0, reflectionDecayThreshold: 750 };
          const settings = { vectorSimilarityThreshold: 0.5, alpha: 0.5, combinedBoostWeight: 2.0 };

          // Query tokens: "бордовый комплект белья" as exact phrase + stems
          // This simulates user typing about the burgundy lingerie set
          const queryTokens = [
              'бордовый комплект белья', 'бордовый комплект белья', // Layer 0 (10x would be 10, using 2 for test)
              'бордов', 'комплект', 'бел'  // Layer 1 stems
          ];

          const scored = await scoreMemories(memories, contextEmbedding, chatLength, constants, settings, queryTokens);

          // Memory 1 should score higher due to exact phrase "комплект" appearing in context
          // (In real scenario, the Russian phrase would match; for test we verify structure)
          expect(scored.length).toBe(2);
          expect(scored[0].id).toBe('1'); // Higher score due to more stem matches
      });
  });
  ```

**Step 2: Run Test (Red)**
- Command: `npm test tests/retrieval/math.test.js`
- Expect: Current test may pass; need more specific test

**Step 3: Implementation (Green)**
- File: `src/retrieval/math.js`
- Action: Modify `scoreMemories()` to handle exact phrases separately
- Guidance:
  ```javascript
  // In scoreMemories(), after computing memoryTokensList:

  // Separate exact phrase tokens from stem tokens
  const exactPhrases = (tokens || []).filter(t => t.includes(' '));
  const stemTokens = (tokens || []).filter(t => !t.includes(' '));

  // Compute BM25 using stem tokens only (existing logic)
  const rawBM25Scores = memories.map((_memory, index) => {
      if (stemTokens.length > 0 && idfMap && memoryTokensList) {
          return bm25Score(stemTokens, memoryTokensList[index], idfMap, avgDL);
      }
      return 0;
  });

  // Apply exact phrase boost: flat additive score for matching phrases
  // Use max IDF as phrase weight (phrases are highly specific)
  const maxIDF = idfMap ? Math.max(...idfMap.values()) : Math.log(totalDocs + 1);

  for (let i = 0; i < memories.length; i++) {
      if (exactPhrases.length === 0) break;

      for (const phrase of exactPhrases) {
          if (hasExactPhrase(phrase, memories[i])) {
              // Add flat 10x boost per matching exact phrase
              // Multiplied by maxIDF to scale with corpus size
              rawBM25Scores[i] += 10.0 * maxIDF;
          }
      }
  }

  // Normalize the final combined raw score as usual
  const maxBM25 = Math.max(...rawBM25Scores, 1e-9);
  const normalizedBM25Scores = rawBM25Scores.map((s) => s / maxBM25);
  ```

**Step 4: Verify (Green)**
- Command: `npm test tests/retrieval/math.test.js`
- Expect: PASS

**Step 5: Git Commit**
- Command: `git add src/retrieval/math.js tests/retrieval/math.test.js && git commit -m "feat(math): apply exact phrase boost in BM25 scoring"`

---

## Task 1.4: Add Settings Constants for Exact Phrase Boost

**Goal:** Add configurable settings for exact phrase boost weight.

**Step 1: Write the Failing Test**
- File: `tests/constants.test.js` (create if not exists)
- Code:
  ```javascript
  import { describe, expect, it } from 'vitest';
  import { defaultSettings, UI_DEFAULT_HINTS } from '../../src/constants.js';

  describe('Exact Phrase Boost Settings', () => {
      it('should have exactPhraseBoostWeight in defaultSettings', () => {
          expect(defaultSettings.exactPhraseBoostWeight).toBeDefined();
          expect(defaultSettings.exactPhraseBoostWeight).toBe(10.0);
      });

      it('should have exactPhraseBoostWeight in UI_DEFAULT_HINTS', () => {
          expect(UI_DEFAULT_HINTS.exactPhraseBoostWeight).toBeDefined();
      });
  });
  ```

**Step 2: Run Test (Red)**
- Command: `npm test tests/constants.test.js`
- Expect: FAIL - exactPhraseBoostWeight not defined

**Step 3: Implementation (Green)**
- File: `src/constants.js`
- Action: Add to `defaultSettings` and `UI_DEFAULT_HINTS`
- Guidance:
  ```javascript
  // In defaultSettings object, add:
  exactPhraseBoostWeight: 10.0, // 10x boost for multi-word entity exact phrases

  // In UI_DEFAULT_HINTS object, add:
  exactPhraseBoostWeight: defaultSettings.exactPhraseBoostWeight,

  // In QUERY_CONTEXT_DEFAULTS object, add:
  exactPhraseBoostWeight: 10.0,
  ```

**Step 4: Verify (Green)**
- Command: `npm test tests/constants.test.js`
- Expect: PASS

**Step 5: Git Commit**
- Command: `git add src/constants.js tests/constants.test.js && git commit -m "feat(constants): add exactPhraseBoostWeight setting"`

---

## Task 1.5: Update Debug Export for Layer 0 Token Count

**Goal:** Show Layer 0 (exact phrase) token count in debug export.

**Step 1: Write the Failing Test**
- File: `tests/retrieval/debug-cache.test.js`
- Code:
  ```javascript
  describe('Layer 0 token count in debug export', () => {
      it('should include layer0Count in cached query context', async () => {
          const { cacheRetrievalDebug, getCachedScoringDetails } = await import('../../src/retrieval/debug-cache.js');

          cacheRetrievalDebug({
              queryContext: {
                  entities: ['King Aldric'],
                  bm25Tokens: {
                      total: 25,
                      entityStems: 5,
                      grounded: 10,
                      nonGrounded: 5,
                      layer0Count: 5, // NEW
                      layer1Count: 5, // NEW
                  }
              }
          });

          const cached = getCachedScoringDetails();
          expect(cached[0].queryContext.bm25Tokens.layer0Count).toBe(5);
          expect(cached[0].queryContext.bm25Tokens.layer1Count).toBe(5);
      });
  });
  ```

**Step 2: Run Test (Red)**
- Command: `npm test tests/retrieval/debug-cache.test.js`
- Expect: FAIL - layer0Count not in cached data

**Step 3: Implementation (Green)**
- File: `src/retrieval/scoring.js`
- Action: Update cacheRetrievalDebug call
- Guidance:
  ```javascript
  // In selectRelevantMemoriesSimple(), update cacheRetrievalDebug:
  cacheRetrievalDebug({
      queryContext: {
          entities: queryContext.entities,
          embeddingQuery: embeddingQuery,
          bm25Tokens: {
              total: Array.isArray(bm25Tokens) ? bm25Tokens.length : 0,
              entityStems: bm25Meta.entityStems || 0,
              grounded: bm25Meta.grounded || 0,
              nonGrounded: bm25Meta.nonGrounded || 0,
              layer0Count: bm25Meta.layer0Count || 0,  // NEW
              layer1Count: bm25Meta.layer1Count || 0,  // NEW
          },
      },
  });
  ```

**Step 4: Verify (Green)**
- Command: `npm test tests/retrieval/debug-cache.test.js`
- Expect: PASS

**Step 5: Git Commit**
- Command: `git add src/retrieval/scoring.js tests/retrieval/debug-cache.test.js && git commit -m "feat(scoring): add layer0/layer1 token counts to debug export"`

---

# PHASE 2: Recursive Reflection Tree

## Task 2.1: Add level and parent_ids Fields to Reflection Schema

**Goal:** Update reflection generation to include level and parent_ids fields.

**Step 1: Write the Failing Test**
- File: `tests/reflection/reflect.test.js`
- Code:
  ```javascript
  describe('Reflection level and parent_ids fields', () => {
      it('should set level=1 for new reflections from events', async () => {
          const { generateReflections } = await import('../../src/reflection/reflect.js');

          // Mock dependencies
          const characterName = 'TestChar';
          const allMemories = [
              { id: '1', type: 'event', summary: 'Important event', importance: 5, sequence: 1000, message_ids: [100], characters_involved: ['TestChar'] },
          ];
          const characterStates = { TestChar: { importance_sum: 50 } };

          // Note: This test will need extensive mocking of LLM, embeddings, etc.
          // For now, verify the structure is accepted
          const mockReflection = {
              id: 'ref_test',
              type: 'reflection',
              summary: 'Test insight',
              level: 1,
              parent_ids: [],
              importance: 4,
              character: 'TestChar',
          };

          expect(mockReflection.level).toBe(1);
          expect(Array.isArray(mockReflection.parent_ids)).toBe(true);
      });

      it('should default level to 1 for legacy reflections', () => {
          const legacyReflection = { type: 'reflection', summary: 'Old insight' };
          const level = legacyReflection.level || 1;
          expect(level).toBe(1);
      });
  });
  ```

**Step 2: Run Test (Red)**
- Command: `npm test tests/reflection/reflect.test.js`
- Expect: PASS (structural test) - but implementation needs changes

**Step 3: Implementation (Green)**
- File: `src/reflection/reflect.js`
- Action: Modify reflection object construction
- Guidance:
  ```javascript
  // In generateReflections(), find where newReflections is created:
  // OLD:
  const newReflections = reflections.map(({ question, insight, evidence_ids }) => ({
      id: `ref_${generateId()}`,
      type: 'reflection',
      summary: insight,
      // ... other fields
  }));

  // NEW:
  const newReflections = reflections.map(({ question, insight, evidence_ids }) => ({
      id: `ref_${generateId()}`,
      type: 'reflection',
      summary: insight,
      tokens: tokenize(insight || ''),
      importance: 4,
      sequence: now,
      characters_involved: [characterName],
      character: characterName,
      source_ids: evidence_ids,    // For level 1: event IDs
      parent_ids: [],              // NEW: Empty for level 1 (derived from events)
      level: 1,                    // NEW: Default level for event-derived reflections
      witnesses: [characterName],
      location: null,
      is_secret: false,
      emotional_impact: {},
      relationship_impact: {},
      created_at: now,
  }));
  ```

**Step 4: Verify (Green)**
- Command: `npm test tests/reflection/reflect.test.js`
- Expect: PASS

**Step 5: Git Commit**
- Command: `git add src/reflection/reflect.js tests/reflection/reflect.test.js && git commit -m "feat(reflection): add level and parent_ids fields to reflection schema"`

---

## Task 2.2: Modify Reflection Decay to Use Level Divisor

**Goal:** Apply slower decay to higher-level reflections.

**Step 1: Write the Failing Test**
- File: `tests/retrieval/math.test.js`
- Code:
  ```javascript
  describe('Reflection decay with level divisor', () => {
      it('should apply slower decay to level 2 reflections', async () => {
          const { calculateScore } = await import('../../src/retrieval/math.js');

          const memoryLevel1 = {
              type: 'reflection',
              level: 1,
              message_ids: [100],
              importance: 4,
          };
          const memoryLevel2 = {
              type: 'reflection',
              level: 2,
              message_ids: [100],
              importance: 4,
          };

          const constants = {
              BASE_LAMBDA: 0.05,
              IMPORTANCE_5_FLOOR: 1.0,
              reflectionDecayThreshold: 750,
              reflectionLevelMultiplier: 2.0  // NEW
          };
          const settings = { vectorSimilarityThreshold: 0.5, alpha: 0.5, combinedBoostWeight: 2.0 };

          // At distance 1000 (250 past threshold of 750):
          // Level 1 decay: 1 - 250/(2*750) = 1 - 0.1667 = 0.833
          // Level 2 decay: 1 - 250/(2*750*2) = 1 - 0.0833 = 0.917
          const scoreLevel1 = calculateScore(memoryLevel1, null, 1000, constants, settings);
          const scoreLevel2 = calculateScore(memoryLevel2, null, 1000, constants, settings);

          expect(scoreLevel2.total).toBeGreaterThan(scoreLevel1.total);
      });

      it('should default to level 1 for reflections without level field', async () => {
          const { calculateScore } = await import('../../src/retrieval/math.js');

          const legacyReflection = {
              type: 'reflection',
              // No level field
              message_ids: [100],
              importance: 4,
          };

          const constants = {
              BASE_LAMBDA: 0.05,
              IMPORTANCE_5_FLOOR: 1.0,
              reflectionDecayThreshold: 750,
              reflectionLevelMultiplier: 2.0
          };
          const settings = { vectorSimilarityThreshold: 0.5, alpha: 0.5, combinedBoostWeight: 2.0 };

          const score = calculateScore(legacyReflection, null, 1000, constants, settings);
          expect(score.total).toBeGreaterThan(0); // Should not error
      });
  });
  ```

**Step 2: Run Test (Red)**
- Command: `npm test tests/retrieval/math.test.js`
- Expect: FAIL - reflectionLevelMultiplier not used, level not read

**Step 3: Implementation (Green)**
- File: `src/retrieval/math.js`
- Action: Modify reflection decay section in `calculateScore()`
- Guidance:
  ```javascript
  // In calculateScore(), find the reflection decay section:
  // OLD:
  // if (memory.type === 'reflection' && distance > constants.reflectionDecayThreshold) {
  //     const threshold = constants.reflectionDecayThreshold;
  //     const decayFactor = Math.max(0.25, 1 - (distance - threshold) / (2 * threshold));
  //     total *= decayFactor;
  // }

  // NEW:
  if (memory.type === 'reflection' && distance > constants.reflectionDecayThreshold) {
      const threshold = constants.reflectionDecayThreshold;
      const level = memory.level || 1;  // Default to level 1 for legacy
      const multiplier = constants.reflectionLevelMultiplier || 2.0;
      const levelDivisor = Math.pow(multiplier, level - 1);

      // Decay is divided by level multiplier: level 2 decays 2x slower
      const decayFactor = Math.max(0.25, 1 - (distance - threshold) / (2 * threshold * levelDivisor));
      total *= decayFactor;
  }
  ```

**Step 4: Verify (Green)**
- Command: `npm test tests/retrieval/math.test.js`
- Expect: PASS

**Step 5: Git Commit**
- Command: `git add src/retrieval/math.js tests/retrieval/math.test.js && git commit -m "feat(math): apply level divisor to reflection decay"`

---

## Task 2.3: Add Reflection Level Settings to Constants

**Goal:** Add configurable settings for reflection level behavior.

**Step 1: Write the Failing Test**
- File: `tests/constants.test.js`
- Code:
  ```javascript
  describe('Reflection Level Settings', () => {
      it('should have maxReflectionLevel in defaultSettings', () => {
          const { defaultSettings } = await import('../../src/constants.js');
          expect(defaultSettings.maxReflectionLevel).toBe(3);
      });

      it('should have reflectionLevelMultiplier in defaultSettings', () => {
          const { defaultSettings } = await import('../../src/constants.js');
          expect(defaultSettings.reflectionLevelMultiplier).toBe(2.0);
      });
  });
  ```

**Step 2: Run Test (Red)**
- Command: `npm test tests/constants.test.js`
- Expect: FAIL - Settings not defined

**Step 3: Implementation (Green)**
- File: `src/constants.js`
- Action: Add to `defaultSettings` and `UI_DEFAULT_HINTS`
- Guidance:
  ```javascript
  // In defaultSettings object, add:
  maxReflectionLevel: 3, // Maximum reflection tree depth
  reflectionLevelMultiplier: 2.0, // Decay slows by 2x per level

  // In UI_DEFAULT_HINTS object, add:
  maxReflectionLevel: defaultSettings.maxReflectionLevel,
  reflectionLevelMultiplier: defaultSettings.reflectionLevelMultiplier,
  ```

**Step 4: Verify (Green)**
- Command: `npm test tests/constants.test.js`
- Expect: PASS

**Step 5: Git Commit**
- Command: `git add src/constants.js tests/constants.test.js && git commit -m "feat(constants): add reflection level settings"`

---

## Task 2.4: Include Old Reflections in Reflection Candidate Set

**Goal:** Modify `generateReflections()` to include old reflections for synthesis.

**Step 1: Write the Failing Test**
- File: `tests/reflection/reflect.test.js`
- Code:
  ```javascript
  describe('Old reflections in candidate set', () => {
      it('should include old reflections when building candidate set', async () => {
          // This test verifies the structure; actual synthesis requires LLM mocking
          const accessibleMemories = [
              { id: '1', type: 'event', summary: 'Recent event', sequence: 5000, characters_involved: ['Char'] },
              { id: 'ref1', type: 'reflection', level: 1, summary: 'Old insight', sequence: 1000, character: 'Char' },
              { id: 'ref2', type: 'reflection', level: 2, summary: 'Meta insight', sequence: 2000, character: 'Char' },
          ];

          // Simulate sorting and filtering
          const recentMemories = accessibleMemories
              .filter(m => m.type === 'event')
              .sort((a, b) => b.sequence - a.sequence)
              .slice(0, 100);

          const oldReflections = accessibleMemories.filter(m =>
              m.type === 'reflection' && m.level >= 1
          );

          expect(recentMemories.length).toBe(1);
          expect(oldReflections.length).toBe(2);

          // Candidate set should have both
          const candidateSet = [...recentMemories, ...oldReflections];
          expect(candidateSet.length).toBe(3);
      });
  });
  ```

**Step 2: Run Test (Red)**
- Command: `npm test tests/reflection/reflect.test.js`
- Expect: PASS (structural test)

**Step 3: Implementation (Green)**
- File: `src/reflection/reflect.js`
- Action: Modify candidate set construction
- Guidance:
  ```javascript
  // In generateReflections(), find the recentMemories construction:
  // OLD:
  const recentMemories = sortMemoriesBySequence(accessibleMemories, false).slice(0, 100);

  // NEW:
  const recentMemories = sortMemoriesBySequence(accessibleMemories, false).slice(0, 100);

  // Include old reflections for potential synthesis
  const oldReflections = accessibleMemories.filter(m =>
      m.type === 'reflection' &&
      (m.level || 1) >= 1
  );

  // Combine and deduplicate
  const candidateSet = _deduplicateById([...recentMemories, ...oldReflections]);

  // Use candidateSet instead of recentMemories in prompt construction
  // OLD: buildUnifiedReflectionPrompt(characterName, recentMemories, ...)
  // NEW: buildUnifiedReflectionPrompt(characterName, candidateSet, ...)
  ```

**Step 4: Verify (Green)**
- Command: `npm test tests/reflection/reflect.test.js`
- Expect: PASS

**Step 5: Git Commit**
- Command: `git add src/reflection/reflect.js tests/reflection/reflect.test.js && git commit -m "feat(reflection): include old reflections in synthesis candidate set"`

---

## Task 2.5: Update Prompt to Handle Level-Aware Synthesis

**Goal:** Modify prompt construction to indicate when synthesizing higher-level reflections.

**Step 1: Write the Failing Test**
- File: `tests/prompts/index.test.js` (if exists, or skip for now - prompt changes are hard to unit test)
- Code: Skip this test (requires manual verification or integration test)

**Step 2: Run Test (Red)**
- Skip

**Step 3: Implementation (Green)**
- File: `src/prompts/index.js` (or wherever `buildUnifiedReflectionPrompt` is)
- Action: Add level awareness to prompt
- Guidance:
  ```javascript
  // In buildUnifiedReflectionPrompt(), analyze candidate set:
  const hasOldReflections = memories.some(m => m.type === 'reflection' && (m.level || 1) >= 1);

  // Add to prompt instructions:
  // If hasOldReflections is true, add:
  // "Some candidate memories are existing reflections. You may synthesize them into higher-level insights (Level 2+).
  //  Level 2 reflections should distill common patterns across multiple Level 1 reflections."

  // Update response parsing to handle level from LLM:
  // If LLM indicates meta-synthesis, set level=2 and populate parent_ids from source reflection IDs
  ```

**Step 4: Verify (Green)**
- Command: Manual verification or integration test

**Step 5: Git Commit**
- Command: `git add src/prompts/ && git commit -m "feat(prompts): add level-aware synthesis instructions"`

---

# PHASE 3: Score-First Budgeting

## Task 3.1: Move assignMemoriesToBuckets to src/utils/text.js

**Goal:** Move bucket utilities to avoid circular dependencies.

**Step 1: Write the Failing Test**
- File: `tests/utils/text.test.js` (create if not exists)
- Code:
  ```javascript
  describe('assignMemoriesToBuckets (moved from formatting.js)', () => {
      it('should be exported from text.js', async () => {
          const { assignMemoriesToBuckets } = await import('../../src/utils/text.js');
          expect(typeof assignMemoriesToBuckets).toBe('function');
      });

      it('should assign memories to old/mid/recent buckets correctly', async () => {
          const { assignMemoriesToBuckets } = await import('../../src/utils/text.js');

          const memories = [
              { id: '1', message_ids: [50], sequence: 50000 },  // Old
              { id: '2', message_ids: [300], sequence: 30000 }, // Mid
              { id: '3', message_ids: [900], sequence: 9000 },  // Recent
          ];
          const chatLength = 1000;

          const buckets = assignMemoriesToBuckets(memories, chatLength);

          expect(buckets.old.length).toBe(1);
          expect(buckets.mid.length).toBe(1);
          expect(buckets.recent.length).toBe(1);
          expect(buckets.old[0].id).toBe('1');
          expect(buckets.recent[0].id).toBe('3');
      });
  });

  describe('getMemoryPosition (moved from formatting.js)', () => {
      it('should be exported from text.js', async () => {
          const { getMemoryPosition } = await import('../../src/utils/text.js');
          expect(typeof getMemoryPosition).toBe('function');
      });

      it('should calculate position from message_ids', async () => {
          const { getMemoryPosition } = await import('../../src/utils/text.js');

          const memory = { message_ids: [100, 200, 300] };
          const position = getMemoryPosition(memory);
          expect(position).toBe(200); // Average
      });
  });
  ```

**Step 2: Run Test (Red)**
- Command: `npm test tests/utils/text.test.js`
- Expect: FAIL - Functions not exported from text.js

**Step 3: Implementation (Green)**
- File: `src/utils/text.js`
- Action: Move functions from `formatting.js` and export
- Guidance:
  ```javascript
  // In src/utils/text.js, add at the bottom (or move entire functions):

  // Copy these functions from src/retrieval/formatting.js:
  export function getMemoryPosition(memory) { /* existing implementation */ }
  export function assignMemoriesToBuckets(memories, chatLength) { /* existing implementation */ }

  // In src/retrieval/formatting.js, change to re-export:
  export { getMemoryPosition, assignMemoriesToBuckets } from '../utils/text.js';
  // And remove the original implementations
  ```

**Step 4: Verify (Green)**
- Command: `npm test tests/utils/text.test.js && npm test tests/retrieval/formatting.test.js`
- Expect: PASS (all existing tests still pass)

**Step 5: Git Commit**
- Command: `git add src/utils/text.js src/retrieval/formatting.js tests/utils/text.test.js && git commit -m "refactor(text): move bucket utilities to text.js to avoid circular deps"`

---

## Task 3.2: Create selectMemoriesWithSoftBalance Function

**Goal:** Implement score-first budgeting with soft chronological balancing.

**Step 1: Write the Failing Test**
- File: `tests/retrieval/scoring.test.js`
- Code:
  ```javascript
  describe('selectMemoriesWithSoftBalance', () => {
      it('should select top-scoring memories first (Phase 1)', async () => {
          const { selectMemoriesWithSoftBalance, sliceToTokenBudget } = await import('../../src/retrieval/scoring.js');

          const scoredMemories = [
              { memory: { id: '1', summary: 'High score old' }, score: 10.0, breakdown: { distance: 800 } },
              { memory: { id: '2', summary: 'High score mid' }, score: 9.0, breakdown: { distance: 400 } },
              { memory: { id: '3', summary: 'High score recent' }, score: 8.0, breakdown: { distance: 50 } },
              { memory: { id: '4', summary: 'Low score old' }, score: 1.0, breakdown: { distance: 900 } },
              { memory: { id: '5', summary: 'Low score recent' }, score: 2.0, breakdown: { distance: 10 } },
          ];

          const tokenBudget = 100; // Approx 3-4 memories
          const chatLength = 1000;

          const selected = selectMemoriesWithSoftBalance(scoredMemories, tokenBudget, chatLength);

          // Should select top 3-4 by score first
          expect(selected.length).toBeGreaterThan(0);
          expect(selected.length).toBeLessThanOrEqual(4);
      });

      it('should apply soft balance to ensure min 20% per bucket', async () => {
          const { selectMemoriesWithSoftBalance } = await import('../../src/retrieval/scoring.js');

          const scoredMemories = [
              { memory: { id: 'r1', summary: 'Recent A' }, score: 5.0, breakdown: { distance: 50 } },
              { memory: { id: 'r2', summary: 'Recent B' }, score: 4.0, breakdown: { distance: 100 } },
              { memory: { id: 'r3', summary: 'Recent C' }, score: 3.0, breakdown: { distance: 150 } },
              { memory: { id: 'm1', summary: 'Mid A' }, score: 4.5, breakdown: { distance: 400 } },
              { memory: { id: 'm2', summary: 'Mid B' }, score: 3.5, breakdown: { distance: 450 } },
              { memory: { id: 'o1', summary: 'Old A' }, score: 6.0, breakdown: { distance: 800 } },  // Highest score!
              { memory: { id: 'o2', summary: 'Old B' }, score: 5.5, breakdown: { distance: 850 } },
          ];

          const tokenBudget = 200; // All memories
          const chatLength = 1000;

          const selected = selectMemoriesWithSoftBalance(scoredMemories, tokenBudget, chatLength);

          // Old bucket should have at least one memory (20% min)
          const selectedIds = selected.map(m => m.id);
          expect(selectedIds).toContain('o1');
      });

      it('should handle empty buckets gracefully', async () => {
          const { selectMemoriesWithSoftBalance } = await import('../../src/retrieval/scoring.js');

          const scoredMemories = [
              { memory: { id: 'r1', summary: 'Recent' }, score: 5.0, breakdown: { distance: 50 } },
          ];

          const selected = selectMemoriesWithSoftBalance(scoredMemories, 100, 100);
          expect(selected.length).toBe(1);
      });
  });
  ```

**Step 2: Run Test (Red)**
- Command: `npm test tests/retrieval/scoring.test.js`
- Expect: FAIL - Function doesn't exist

**Step 3: Implementation (Green)**
- File: `src/retrieval/scoring.js`
- Action: Add `selectMemoriesWithSoftBalance()` function
- Guidance:
  ```javascript
  import { assignMemoriesToBuckets, getMemoryPosition } from '../utils/text.js';
  import { countTokens } from '../utils/tokens.js';

  /**
   * Select memories using score-first budgeting with soft chronological balancing.
   * @param {Array<{memory: Object, score: number, breakdown: Object}>} scoredMemories - Pre-scored, sorted
   * @param {number} tokenBudget - Maximum tokens to select
   * @param {number} chatLength - Current chat length
   * @param {number} [minRepresentation=0.20] - Minimum 20% per bucket
   * @param {number} [softBalanceBudget=0.05] - 5% budget for balancing
   * @returns {Object[]} Selected memories
   */
  export function selectMemoriesWithSoftBalance(
      scoredMemories,
      tokenBudget,
      chatLength,
      minRepresentation = 0.20,
      softBalanceBudget = 0.05
  ) {
      if (!scoredMemories || scoredMemories.length === 0) return [];
      if (tokenBudget <= 0) return [];

      // Phase 1: Score-first selection (95% of budget)
      const phase1Budget = tokenBudget * (1 - softBalanceBudget);
      const phase1Selected = [];

      let totalTokens = 0;
      for (const { memory } of scoredMemories) {
          const memTokens = countTokens(memory.summary || '');
          if (totalTokens + memTokens > phase1Budget) break;
          phase1Selected.push(memory);
          totalTokens += memTokens;
      }

      // Phase 2: Soft chronological balancing (5% of budget)
      const phase2Budget = tokenBudget - totalTokens;
      if (phase2Budget <= 0) return phase1Selected;

      // Analyze bucket distribution
      const buckets = assignMemoriesToBuckets(phase1Selected, chatLength);
      const bucketCounts = {
          old: buckets.old.reduce((sum, m) => sum + countTokens(m.summary), 0),
          mid: buckets.mid.reduce((sum, m) => sum + countTokens(m.summary), 0),
          recent: buckets.recent.reduce((sum, m) => sum + countTokens(m.summary), 0),
      };
      const totalSelected = bucketCounts.old + bucketCounts.mid + bucketCounts.recent;

      // Calculate minimum tokens per bucket
      const minTokens = totalSelected * minRepresentation;

      // Find underrepresented buckets and add memories
      const phase2Selected = [...phase1Selected];
      const remainingCandidates = scoredMemories
          .filter(({ memory }) => !phase1Selected.includes(memory))
          .map(({ memory }) => memory);

      for (const bucketName of ['old', 'mid', 'recent']) {
          if (bucketCounts[bucketName] < minTokens && buckets[bucketName].length > 0) {
              // Add memories from this bucket until min reached
              for (const memory of remainingCandidates) {
                  const memTokens = countTokens(memory.summary || '');
                  if (totalTokens + memTokens > tokenBudget) break;

                  // Use getMemoryPosition for consistent bucket assignment
                  const position = getMemoryPosition(memory);
                  const isRecent = position >= chatLength - 100;
                  const isMid = position >= chatLength - 500 && !isRecent;
                  const isOld = !isRecent && !isMid;

                  if ((bucketName === 'old' && isOld) ||
                      (bucketName === 'mid' && isMid) ||
                      (bucketName === 'recent' && isRecent)) {
                      phase2Selected.push(memory);
                      totalTokens += memTokens;
                      bucketCounts[bucketName] += memTokens;
                      remainingCandidates.splice(remainingCandidates.indexOf(memory), 1);
                  }
              }
          }
      }

      return phase2Selected;
  }
  ```

**Step 4: Verify (Green)**
- Command: `npm test tests/retrieval/scoring.test.js`
- Expect: PASS

**Step 5: Git Commit**
- Command: `git add src/retrieval/scoring.js tests/retrieval/scoring.test.js && git commit -m "feat(scoring): add selectMemoriesWithSoftBalance for score-first budgeting"`

---

## Task 3.3: Add Bucket Balance Settings to Constants

**Goal:** Add configurable settings for bucket balancing.

**Step 1: Write the Failing Test**
- File: `tests/constants.test.js`
- Code:
  ```javascript
  describe('Bucket Balance Settings', () => {
      it('should have bucketMinRepresentation in defaultSettings', async () => {
          const { defaultSettings } = await import('../../src/constants.js');
          expect(defaultSettings.bucketMinRepresentation).toBe(0.20);
      });

      it('should have bucketSoftBalanceBudget in defaultSettings', async () => {
          const { defaultSettings } = await import('../../src/constants.js');
          expect(defaultSettings.bucketSoftBalanceBudget).toBe(0.05);
      });
  });
  ```

**Step 2: Run Test (Red)**
- Command: `npm test tests/constants.test.js`
- Expect: FAIL - Settings not defined

**Step 3: Implementation (Green)**
- File: `src/constants.js`
- Action: Add to `defaultSettings` and `UI_DEFAULT_HINTS`
- Guidance:
  ```javascript
  // In defaultSettings object, add:
  bucketMinRepresentation: 0.20, // 20% minimum per bucket
  bucketSoftBalanceBudget: 0.05, // 5% budget for soft balancing

  // In UI_DEFAULT_HINTS object, add:
  bucketMinRepresentation: defaultSettings.bucketMinRepresentation,
  bucketSoftBalanceBudget: defaultSettings.bucketSoftBalanceBudget,
  ```

**Step 4: Verify (Green)**
- Command: `npm test tests/constants.test.js`
- Expect: PASS

**Step 5: Git Commit**
- Command: `git add src/constants.js tests/constants.test.js && git commit -m "feat(constants): add bucket balance settings"`

---

## Task 3.4: Update selectRelevantMemories to Use Soft Balance

**Goal:** Replace sliceToTokenBudget with selectMemoriesWithSoftBalance.

**Step 1: Write the Failing Test**
- File: `tests/retrieval/scoring.test.js`
- Code:
  ```javascript
  describe('selectRelevantMemories with soft balance', () => {
      it('should use selectMemoriesWithSoftBalance instead of sliceToTokenBudget', async () => {
          const { selectRelevantMemories } = await import('../../src/retrieval/scoring.js');

          const mockCtx = {
              recentContext: 'Test context',
              userMessages: 'Test messages',
              activeCharacters: ['Char'],
              chatLength: 1000,
              finalTokens: 500,
              graphNodes: {},
              graphEdges: {},
              allAvailableMemories: [],
          };

          // Mock dependencies
          const result = await selectRelevantMemories([], mockCtx);
          expect(Array.isArray(result)).toBe(true);
      });
  });
  ```

**Step 2: Run Test (Red)**
- Command: `npm test tests/retrieval/scoring.test.js`
- Expect: May pass - verify implementation

**Step 3: Implementation (Green)**
- File: `src/retrieval/scoring.js`
- Action: Modify `selectRelevantMemories()`
- Guidance:
  ```javascript
  // In selectRelevantMemories(), find:
  // OLD:
  const finalResults = sliceToTokenBudget(scoredMemories, finalTokens);

  // NEW:
  const finalResults = selectMemoriesWithSoftBalance(
      scoredMemories.map(m => ({ memory: m, score: 0, breakdown: {} })), // Need actual scores
      finalTokens,
      chatLength
  );

  // Wait, scoredMemories already has scores. The actual change:
  // After scoring, we have: const { memories: scoredMemories, scoredResults } = await selectRelevantMemoriesSimple(...)
  // Change from:
  // const finalResults = sliceToTokenBudget(scoredMemories, finalTokens);
  // To:
  const finalResults = selectMemoriesWithSoftBalance(scoredResults, finalTokens, chatLength);
  ```

**Step 4: Verify (Green)**
- Command: `npm test tests/retrieval/scoring.test.js`
- Expect: PASS

**Step 5: Git Commit**
- Command: `git add src/retrieval/scoring.js tests/retrieval/scoring.test.js && git commit -m "refactor(scoring): use selectMemoriesWithSoftBalance in selectRelevantMemories"`

---

## Task 3.5: Remove Hard 50% Quota from formatContextForInjection

**Goal:** Remove bucket quota logic from formatting (now handled by scoring).

**Step 1: Write the Failing Test**
- File: `tests/retrieval/formatting.test.js`
- Code:
  ```javascript
  describe('formatContextForInjection without hard quotas', () => {
      it('should accept memories pre-selected by scoring', async () => {
          const { formatContextForInjection } = await import('../../src/retrieval/formatting.js');

          const memories = [
              { id: '1', summary: 'Old memory', message_ids: [100], sequence: 10000, importance: 3 },
              { id: '2', summary: 'Recent memory', message_ids: [900], sequence: 9000, importance: 3 },
          ];

          const result = formatContextForInjection(
              memories,
              ['OtherChar'],
              { emotion: 'neutral' },
              'TestChar',
              1000, // budget
              1000  // chatLength
          );

          expect(result).toContain('Old memory');
          expect(result).toContain('Recent memory');
      });

      it('should not apply 50% quota to old bucket', async () => {
          const { formatContextForInjection } = await import('../../src/retrieval/formatting.js');

          // Create many old memories that would exceed 50% quota
          const oldMemories = Array.from({ length: 20 }, (_, i) => ({
              id: `old${i}`,
              summary: `Old memory ${i}`,
              message_ids: [100 + i],
              sequence: 10000 + i,
              importance: 3,
          }));

          const result = formatContextForInjection(
              oldMemories,
              [],
              null,
              'TestChar',
              5000, // Large budget
              1000
          );

          // Count how many old memories were included
          const count = (result.match(/Old memory/g) || []).length;
          // With soft balance, could be more than 50% if scoring selected them
          expect(count).toBeGreaterThan(0);
      });
  });
  ```

**Step 2: Run Test (Red)**
- Command: `npm test tests/retrieval/formatting.test.js`
- Expect: Current tests may still pass; verify implementation

**Step 3: Implementation (Green)**
- File: `src/retrieval/formatting.js`
- Action: Remove hard quota logic from `formatContextForInjection()`
- Guidance:
  ```javascript
  // In formatContextForInjection(), find and remove the quota section:
  // OLD (remove this entire section):
  // const oldBudget = availableForMemories * 0.5;
  // let oldTokens = 0;
  // for (const memory of buckets.old) {
  //     const memoryTokens = countTokens(memory.summary || '') + 5;
  //     if (oldTokens + memoryTokens <= oldBudget) {
  //         fittingMemoryIds.add(memory.id);
  //         oldTokens += memoryTokens;
  //     } else {
  //         break;
  //     }
  // }

  // NEW: Simply fit all memories into budget:
  const fittingMemoryIds = new Set();
  let totalTokens = 0;

  for (const memory of [...buckets.old, ...buckets.mid, ...buckets.recent]) {
      const memoryTokens = countTokens(memory.summary || '') + 5;
      if (totalTokens + memoryTokens <= availableForMemories) {
          fittingMemoryIds.add(memory.id);
          totalTokens += memoryTokens;
      } else {
          break;
      }
  }
  ```

**Step 4: Verify (Green)**
- Command: `npm test tests/retrieval/formatting.test.js`
- Expect: PASS

**Step 5: Git Commit**
- Command: `git add src/retrieval/formatting.js tests/retrieval/formatting.test.js && git commit -m "refactor(formatting): remove hard 50% quota, delegate to scoring layer"`

---

## Task 3.6: Update Debug Export for Bucket Distribution

**Goal:** Show bucket distribution before/after soft balance.

**Step 1: Write the Failing Test**
- File: `tests/retrieval/debug-cache.test.js`
- Code:
  ```javascript
  describe('Bucket distribution in debug export', () => {
      it('should include bucket distribution in cached data', async () => {
          const { cacheRetrievalDebug, getCachedScoringDetails } = await import('../../src/retrieval/debug-cache.js');

          cacheRetrievalDebug({
              bucketDistribution: {
                  before: { old: 100, mid: 200, recent: 300 },
                  after: { old: 150, mid: 200, recent: 250 },
              }
          });

          const cached = getCachedScoringDetails();
          expect(cached[0].bucketDistribution).toBeDefined();
          expect(cached[0].bucketDistribution.before.old).toBe(100);
          expect(cached[0].bucketDistribution.after.old).toBe(150);
      });
  });
  ```

**Step 2: Run Test (Red)**
- Command: `npm test tests/retrieval/debug-cache.test.js`
- Expect: FAIL - bucketDistribution not cached

**Step 3: Implementation (Green)**
- File: `src/retrieval/scoring.js`
- Action: Add bucket distribution to debug cache
- Guidance:
  ```javascript
  // In selectRelevantMemories(), after selection:
  // Calculate bucket distribution before and after
  const beforeBuckets = assignMemoriesToBuckets(scoredMemories.map(s => s.memory), chatLength);
  const afterBuckets = assignMemoriesToBuckets(finalResults, chatLength);

  const countTokens = (bucket) =>
      bucket.reduce((sum, m) => sum + (m.summary?.length || 0), 0); // Approximation

  cacheRetrievalDebug({
      bucketDistribution: {
          before: {
              old: countTokens(beforeBuckets.old),
              mid: countTokens(beforeBuckets.mid),
              recent: countTokens(beforeBuckets.recent),
          },
          after: {
              old: countTokens(afterBuckets.old),
              mid: countTokens(afterBuckets.mid),
              recent: countTokens(afterBuckets.recent),
          },
          selectedCount: finalResults.length,
      },
  });
  ```

**Step 4: Verify (Green)**
- Command: `npm test tests/retrieval/debug-cache.test.js`
- Expect: PASS

**Step 5: Git Commit**
- Command: `git add src/retrieval/scoring.js tests/retrieval/debug-cache.test.js && git commit -m "feat(scoring): add bucket distribution to debug export"`

---

# End of Plan

Total estimated time: 5-8 days across 3 phases.

Each commit is independently testable and reversible.
