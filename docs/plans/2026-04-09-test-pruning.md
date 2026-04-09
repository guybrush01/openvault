# Test Suite Pruning Implementation Plan

**Goal:** Remove ~135 redundant tests across 8 deleted files and 4 trimmed files, reducing total from 1428 to ~1293 tests.
**Architecture:** Three independent tiers of cleanup — file deletions (Tier 1), intra-file trims (Tier 2), and file merges (Tier 3). Each tier is independently committable.
**Tech Stack:** Vitest, no code changes to `src/`

---

## File Structure

### Files to DELETE (Tier 1):
- Delete: `tests/prompts/examples/events.test.js` — asserts literal prompt content (violates CLAUDE.md)
- Delete: `tests/prompts/examples/graph.test.js` — asserts literal prompt content
- Delete: `tests/prompts/examples/communities.test.js` — asserts literal prompt content
- Delete: `tests/prompts/examples/reflections.test.js` — asserts literal prompt content
- Delete: `tests/prompts/events/examples/ru.test.js` — asserts exact Russian word choices
- Delete: `tests/retrieval/scoring.integration.test.js` — both tests redundant with math-alpha-blend.test.js

### Files to TRIM (Tier 2):
- Modify: `tests/utils/text.test.js` — remove legacy safeParseJSON suite (~23 tests)
- Modify: `tests/graph/graph.test.js` — remove dead code tests, tautologies, duplicates (~26 tests)
- Modify: `tests/ui/helpers.test.js` — remove schema-violation tests, consolidate parameterization (~19 tests)
- Modify: `tests/extraction/scheduler.test.js` — remove tautologies, duplicate blocks (~14 tests)

### Files to MERGE (Tier 3):
- Delete: `tests/store/chat-data-deleteEntity.test.js` (5 tests) → merge into `tests/store/chat-data.test.js`
- Delete: `tests/store/chat-data-updateEntity.test.js` (7 tests) → merge into `tests/store/chat-data.test.js`
- Delete: `tests/store/migrations-v3.test.js` (5 tests) → merge into `tests/store/migrations.test.js`

---

### Task 1: Delete prompt example test files (Tier 1a)

**Files:**
- Delete: `tests/prompts/examples/events.test.js`
- Delete: `tests/prompts/examples/graph.test.js`
- Delete: `tests/prompts/examples/communities.test.js`
- Delete: `tests/prompts/examples/reflections.test.js`
- Delete: `tests/prompts/events/examples/ru.test.js`

- [ ] Step 1: Delete the five prompt example test files

```bash
rm tests/prompts/examples/events.test.js
rm tests/prompts/examples/graph.test.js
rm tests/prompts/examples/communities.test.js
rm tests/prompts/examples/reflections.test.js
rm tests/prompts/events/examples/ru.test.js
rmdir tests/prompts/events/examples
rmdir tests/prompts/examples
```

- [ ] Step 2: Run tests to verify nothing depends on deleted files

Run: `npx vitest run 2>&1 | tail -5`
Expected: All remaining tests pass, no import errors

- [ ] Step 3: Commit

```bash
git add -A && git commit -m "chore: remove prompt-content example tests (violated CLAUDE.md rules)"
```

---

### Task 2: Delete scoring.integration.test.js (Tier 1b)

**Files:**
- Delete: `tests/retrieval/scoring.integration.test.js`

- [ ] Step 1: Delete the redundant integration test file

```bash
rm tests/retrieval/scoring.integration.test.js
```

- [ ] Step 2: Run retrieval tests to verify coverage preserved

Run: `npx vitest run tests/retrieval/ 2>&1 | tail -5`
Expected: All retrieval tests pass. The hidden-memory IDF behavior is already tested in `math-alpha-blend.test.js` under `calculateIDF with expanded corpus`.

- [ ] Step 3: Commit

```bash
git add -A && git commit -m "chore: remove redundant scoring.integration.test.js (covered by math-alpha-blend)"
```

---

### Task 3: Trim text.test.js — remove legacy safeParseJSON suite (Tier 2a)

**Files:**
- Modify: `tests/utils/text.test.js`

The file has two `safeParseJSON` describe blocks:
1. **Lines 88–267**: `safeParseJSON (legacy compatibility)` — 23 tests with `setupTestContext` in beforeEach
2. **Lines 466–607**: `safeParseJSON (refactored)` — better organized by tier

The legacy suite tests the exact same function with significant overlap (valid JSON, markdown fences, trailing commas, unquoted keys, single quotes, thinking tags, concatenation). The refactored suite covers all these cases plus additional edge cases (input validation, options, error context).

- [ ] Step 1: Remove the entire `safeParseJSON (legacy compatibility)` describe block

Delete lines 88–267 (the entire `describe('safeParseJSON (legacy compatibility)', ...)` block). This removes the `setupTestContext` beforeEach inside it and all 23 legacy tests.

- [ ] Step 2: Run text tests to verify

Run: `npx vitest run tests/utils/text.test.js 2>&1 | tail -5`
Expected: All remaining tests pass (~56 tests remain)

- [ ] Step 3: Commit

```bash
git add -A && git commit -m "chore: remove legacy safeParseJSON test suite from text.test.js (covered by refactored suite)"
```

---

### Task 4: Trim graph.test.js — remove dead code, tautologies, duplicates (Tier 2b)

**Files:**
- Modify: `tests/graph/graph.test.js`

Four removal targets:

1. **`describe('dead code removal', ...)`** (lines 6–10) — 2 tests asserting removed functions stay removed. Meta-testing with no ongoing value.

2. **`describe('createEmptyGraph', ...)`** (lines ~340–346) — 1 test asserting `{ nodes: {}, edges: {} }` equals `{ nodes: {}, edges: {} }`. Tautological.

3. **Token overlap test in `upsertRelationship`** (lines ~234–244, the test named `'detects near-duplicate descriptions with stem-aware tokenizer'`) — 1 test that duplicates coverage in `token-overlap.test.js` (20+ tests).

4. **`describe('findCrossScriptCharacterKeys', ...)`** (lines ~1138–1245) — 9 `it.each` tests that duplicate the cross-script integration tests already in `mergeOrInsertEntity` (lines ~446–723, which test the same Levenshtein distances and thresholds through the actual merge path).

- [ ] Step 1: Remove the four blocks

Delete these four describe blocks from `tests/graph/graph.test.js`:
- `describe('dead code removal', ...)` with its 2 tests
- `describe('createEmptyGraph', ...)` with its 1 test
- The `'detects near-duplicate descriptions with stem-aware tokenizer'` test inside `describe('upsertRelationship', ...)`
- `describe('findCrossScriptCharacterKeys', ...)` with its 9 tests

Also remove `findCrossScriptCharacterKeys` from the import statement at the top of the file.

- [ ] Step 2: Run graph tests to verify

Run: `npx vitest run tests/graph/ 2>&1 | tail -5`
Expected: All remaining graph tests pass (~35 tests remain in graph.test.js)

- [ ] Step 3: Commit

```bash
git add -A && git commit -m "chore: prune graph.test.js — remove dead code tests, tautologies, and duplicate coverage"
```

---

### Task 5: Trim helpers.test.js — remove schema-violation and duplicate tests (Tier 2c)

**Files:**
- Modify: `tests/ui/helpers.test.js`

Removal targets:

1. **`'does not mutate original array'`** in `sortMemoriesByDate` — tests spread operator implementation detail, not behavior

2. **`'handles missing created_at (treats as 0)'`** in `sortMemoriesByDate` — schema violation; memories always have created_at

3. **`'handles null/undefined graph'`** in `filterEntities` — consolidate into `'handles empty graph'` test

4. **`'search is case-insensitive'`** in `filterEntities` — already covered by `'filters by search query (name)'` which uses lowercase 'castle' against 'Castle'

5. **`'handles missing characters_involved'`** in `extractCharactersSet` — schema violation

6. **`'excludes dead fingerprints from extracted count'`** in `calculateExtractionStats` — tests implementation detail at wrong abstraction layer

- [ ] Step 1: Remove the six identified tests

Delete these individual `it()` blocks from `tests/ui/helpers.test.js`:
- `it('does not mutate original array', ...)` inside sortMemoriesByDate
- `it('handles missing created_at (treats as 0)', ...)` inside sortMemoriesByDate
- `it('handles null/undefined graph', ...)` inside filterEntities
- `it('search is case-insensitive', ...)` inside filterEntities
- `it('handles missing characters_involved', ...)` inside extractCharactersSet
- `it('excludes dead fingerprints from extracted count', ...)` inside calculateExtractionStats

- [ ] Step 2: Run UI helper tests to verify

Run: `npx vitest run tests/ui/helpers.test.js 2>&1 | tail -5`
Expected: All remaining tests pass (~63 tests remain)

- [ ] Step 3: Commit

```bash
git add -A && git commit -m "chore: prune helpers.test.js — remove schema-violation and duplicate tests"
```

---

### Task 6: Trim scheduler.test.js — remove tautologies and duplicate blocks (Tier 2d)

**Files:**
- Modify: `tests/extraction/scheduler.test.js`

Removal targets:

1. **`'returns empty set when no processed messages'`** in `getProcessedFingerprints` — tautological (empty array → empty Set)

2. **`'returns original when turnsToTrim is 0'`** in `trimTailTurns` — tautological (0 does nothing)

3. **`'returns original when messageIds is empty'`** in `trimTailTurns` — tautological (empty input → empty output)

4. **`describe('getBackfillStats (token-based)', ...)`** (entire block, ~lines 462–492) — duplicate of the earlier `getBackfillStats` block which has better coverage (system messages, dead fingerprints)

5. **`describe('getBackfillMessageIds swipe protection', ...)`** (entire block, ~lines 688–707) — swipe protection logic already tested in `getNextBatch swipe protection` block via the same `trimTailTurns` function

- [ ] Step 1: Remove the five identified blocks/tests

Delete from `tests/extraction/scheduler.test.js`:
- `it('returns empty set when no processed messages', ...)` in getProcessedFingerprints
- `it('returns original when turnsToTrim is 0', ...)` in trimTailTurns
- `it('returns original when messageIds is empty', ...)` in trimTailTurns
- Entire `describe('getBackfillStats (token-based)', ...)` block
- Entire `describe('getBackfillMessageIds swipe protection', ...)` block

- [ ] Step 2: Run scheduler tests to verify

Run: `npx vitest run tests/extraction/scheduler.test.js 2>&1 | tail -5`
Expected: All remaining tests pass (~37 tests remain)

- [ ] Step 3: Commit

```bash
git add -A && git commit -m "chore: prune scheduler.test.js — remove tautologies and duplicate blocks"
```

---

### Task 7: Merge chat-data-deleteEntity.test.js into chat-data.test.js (Tier 3a)

**Files:**
- Modify: `tests/store/chat-data.test.js`
- Delete: `tests/store/chat-data-deleteEntity.test.js`

- [ ] Step 1: Copy deleteEntity tests into chat-data.test.js

Append the `describe('deleteEntity', ...)` block from `chat-data-deleteEntity.test.js` to the end of `chat-data.test.js`. Preserve all 5 tests exactly as-is (they are not redundant — they test a distinct function).

Required imports already exist in `chat-data.test.js` (it imports from `../../src/store/chat-data.js` and `../factories.js`). Add `METADATA_KEY` and `setDeps` to the import from `../../src/constants.js` and `../../src/deps.js` if not already present.

- [ ] Step 2: Delete the source file

```bash
rm tests/store/chat-data-deleteEntity.test.js
```

- [ ] Step 3: Run store tests to verify

Run: `npx vitest run tests/store/ 2>&1 | tail -5`
Expected: All store tests pass. Total store test count unchanged.

- [ ] Step 4: Commit

```bash
git add -A && git commit -m "chore: merge chat-data-deleteEntity.test.js into chat-data.test.js"
```

---

### Task 8: Merge chat-data-updateEntity.test.js into chat-data.test.js (Tier 3b)

**Files:**
- Modify: `tests/store/chat-data.test.js`
- Delete: `tests/store/chat-data-updateEntity.test.js`

- [ ] Step 1: Copy updateEntity tests into chat-data.test.js

Append the `describe('updateEntity', ...)` block from `chat-data-updateEntity.test.js` to the end of `chat-data.test.js`. Preserve all 7 tests exactly as-is.

The `normalizeKey` import from `../../src/graph/graph.js` needs to be added to chat-data.test.js if not present.

- [ ] Step 2: Delete the source file

```bash
rm tests/store/chat-data-updateEntity.test.js
```

- [ ] Step 3: Run store tests to verify

Run: `npx vitest run tests/store/ 2>&1 | tail -5`
Expected: All store tests pass.

- [ ] Step 4: Commit

```bash
git add -A && git commit -m "chore: merge chat-data-updateEntity.test.js into chat-data.test.js"
```

---

### Task 9: Merge migrations-v3.test.js into migrations.test.js (Tier 3c)

**Files:**
- Modify: `tests/store/migrations.test.js`
- Delete: `tests/store/migrations-v3.test.js`

- [ ] Step 1: Copy v3 migration tests into migrations.test.js

Append the `describe('v3 migration - backfill message_fingerprints', ...)` block from `migrations-v3.test.js` to the end of `migrations.test.js`. Preserve all 5 tests exactly as-is.

The import from `../../src/store/migrations/index.js` already exists in `migrations.test.js`.

- [ ] Step 2: Delete the source file

```bash
rm tests/store/migrations-v3.test.js
```

- [ ] Step 3: Run store tests to verify

Run: `npx vitest run tests/store/ 2>&1 | tail -5`
Expected: All store tests pass.

- [ ] Step 4: Commit

```bash
git add -A && git commit -m "chore: merge migrations-v3.test.js into migrations.test.js"
```

---

### Task 10: Final verification

- [ ] Step 1: Run full test suite

Run: `npx vitest run --reporter=verbose 2>&1 | tail -5`
Expected: All tests pass. Target: ~83 files, ~1293 tests (down from 89 files, 1428 tests).

- [ ] Step 2: Verify no orphan files remain

```bash
ls tests/prompts/examples/ 2>/dev/null || echo "directory removed"
ls tests/prompts/events/examples/ 2>/dev/null || echo "directory removed"
```
Expected: Both directories removed.

- [ ] Step 3: Final commit if any cleanup needed

```bash
git add -A && git commit -m "chore: test pruning complete — 1428 → ~1293 tests, 89 → 83 files"
```

---

## Common Pitfalls

- **Don't remove `setupTestContext` import from text.test.js** — it may still be used by the refactored safeParseJSON suite's `beforeEach`. Check before removing.
- **Preserve imports when merging files** — chat-data.test.js needs `METADATA_KEY`, `setDeps`, `normalizeKey`, `buildMockGraphNode` added if not already present.
- **The `createEmptyGraph` function is still used** in other graph.test.js tests (e.g., edge creation tests). Only remove the test, not the import.
- **The `findCrossScriptCharacterKeys` function is still exported** and used by production code. Only remove the test block, not the import from graph.js.
- **Dead code tests import graph.js dynamically** via `await import(...)`. Removing them doesn't affect static imports at the top of the file.
