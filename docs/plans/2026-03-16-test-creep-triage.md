# Test Creep Triage Implementation Plan

**Goal:** Reduce 1,074 tests to ~700 via workflow optimization and parameterization, achieving sub-second TDD loop.
**Architecture:** Vitest-based testing with smart watch modes and `it.each()` parameterized test tables.
**Tech Stack:** Vitest, JSDOM, Node.js 20+

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `vitest.config.js` | Modify | Add watch optimizations, pool settings, reporters |
| `package.json` | Modify | Add npm scripts for selective test running |
| `tests/CLAUDE.md` | Modify | Document TDD workflow and best practices |
| `tests/math.test.js` | Modify | Parameterize cosine similarity and tokenization tests |
| `tests/retrieval/math.test.js` | Modify | Parameterize scoring and BM25 tests |
| `tests/utils/text.test.js` | Modify | Parameterize text utility tests |
| `tests/formatting.test.js` | Modify | Parameterize memory formatting tests |
| `tests/graph/graph.test.js` | Modify | Parameterize graph operation tests |
| `tests/prompts.test.js` | Modify | Parameterize prompt builder tests (highest ROI) |

---

## Task 1: Baseline Coverage Snapshot

**Prerequisite:** Establish coverage baseline before any changes.

**Files:**
- Read: `package.json`
- Test: All test files

- [ ] Step 1: Install coverage provider if not present

```bash
npm install -D @vitest/coverage-v8
```

- [ ] Step 2: Run full test suite with coverage

Run: `npx vitest run --coverage --reporter=verbose > tests/baseline-coverage.txt 2>&1`

Expected: Coverage report saved to `tests/baseline-coverage.txt` with line/branch percentages.

- [ ] Step 3: Count current tests

Run: `find tests -name "*.test.js" -exec grep -c "it(" {} \; | awk '{sum+=$1} END {print "Total tests: " sum}'`

Expected: `Total tests: 1074` (or current count)

- [ ] Step 4: Commit baseline

```bash
git add tests/baseline-coverage.txt
git commit -m "chore(tests): add baseline coverage snapshot before test creep triage"
```

---

## Task 2: Update Vitest Configuration

**Goal:** Add watch optimizations, thread pool settings, and CI-friendly reporters.

**Files:**
- Modify: `vitest.config.js`

- [ ] Step 1: Create backup of original config

Run: `cp vitest.config.js vitest.config.js.backup`

- [ ] Step 2: Update vitest.config.js with new settings

```javascript
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        include: ['tests/**/*.test.js'],
        setupFiles: ['./tests/setup.js'],
        // Watch mode optimizations
        watch: !process.env.CI,
        watchExclude: [
            '**/node_modules/**',
            '**/dist/**',
            '**/docs/**',
            '**/.git/**',
            '**/repomix-*.md',
        ],
        // Fail fast during development (CI runs all)
        bail: process.env.CI ? 0 : 3,
        // Reporter: verbose locally, dot in CI
        reporter: process.env.CI ? 'dot' : 'verbose',
        // Thread pool for parallel execution
        pool: 'threads',
        poolOptions: {
            threads: {
                singleThread: false,
                maxThreads: 4,
                minThreads: 1,
            },
        },
        // Test timeout (generous for JSDOM + LLM mocks)
        testTimeout: 10000,
    },
    resolve: {
        alias: {
            '../../../../extensions.js': path.resolve(__dirname, 'tests/stubs/extensions.js'),
            '../../../../../extensions.js': path.resolve(__dirname, 'tests/stubs/extensions.js'),
            '../../../../../../extensions.js': path.resolve(__dirname, 'tests/stubs/extensions.js'),
            '../../../../../script.js': path.resolve(__dirname, 'tests/stubs/extensions.js'),
            '../../../../../../script.js': path.resolve(__dirname, 'tests/stubs/extensions.js'),
            '../../../shared.js': path.resolve(__dirname, 'tests/stubs/shared.js'),
        },
    },
});
```

- [ ] Step 3: Verify config is valid

Run: `npx vitest --run --reporter=dot tests/math.test.js`

Expected: Tests pass with dot reporter (CI mode).

- [ ] Step 4: Commit

```bash
git add vitest.config.js
git commit -m "chore(tests): optimize vitest config for watch mode and CI

- Add watchExclude patterns for faster reloads
- Configure thread pool (max 4 threads)
- Bail after 3 failures in dev (CI runs all)
- Use dot reporter in CI, verbose locally"
```

---

## Task 3: Add NPM Scripts

**Goal:** Provide convenient commands for selective test running.

**Files:**
- Modify: `package.json`

- [ ] Step 1: Update package.json scripts section

Find the `"scripts"` section in `package.json` and replace it with:

```json
{
  "scripts": {
    "clear": "node -e \"process.stdout.write('\\u001B[2J\\u001B[0;0f')\"",
    "prepare": "git config core.hooksPath .githooks",
    "lint": "biome check .",
    "lint:fix": "biome check --write --unsafe .",
    "format": "biome format --write .",
    "test": "node scripts/test.js",
    "test:run": "vitest run",
    "test:changed": "vitest --changed=HEAD~1 --run",
    "test:watch": "vitest",
    "test:related": "vitest --run --reporter=dot related",
    "test:math": "vitest --run tests/math.test.js tests/retrieval/math.test.js",
    "test:extract": "vitest --run tests/extraction/",
    "test:ci": "vitest run --reporter=dot",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui",
    "sync-version": "node scripts/sync-version.js",
    "check-css": "node scripts/check-css.js",
    "repomix": "npm run repomix:logic-lite && npm run repomix:logic-full && npm run repomix:ui && npm run repomix:tests",
    "repomix:logic-full": "npx repomix --remove-empty-lines --output repomix-logic-full.md --include \"src/**/*.js,index.js,package.json,include/**,**/CLAUDE.md\" --ignore \"src/ui/**,**/*.css,**/*.html\"",
    "repomix:logic-lite": "npx repomix --remove-empty-lines --compress --output repomix-logic-lite.md --include \"src/**/*.js,index.js,package.json,include/**,**/CLAUDE.md\" --ignore \"src/ui/**,src/prompts/examples/**,**/*.css,**/*.html\"",
    "repomix:ui": "npx repomix --remove-empty-lines --compress --output repomix-ui.md --include \"src/ui/**/*.js,templates/**/*.html,css/**/*.css,manifest.json,**/CLAUDE.md\" --remove-empty-lines",
    "repomix:tests": "npx repomix --remove-empty-lines --compress --output repomix-tests.md --include \"tests/**,vitest.config.js,**/CLAUDE.md\""
  }
}
```

- [ ] Step 2: Validate new scripts work

Run: `npm run test:math`

Expected: Only math tests run (~26 tests), completes in <2s.

Run: `npm run test:changed`

Expected: Either runs no tests (no changes) or runs tests for changed files.

- [ ] Step 3: Commit

```bash
git add package.json
git commit -m "chore(tests): add selective test running scripts

- test:run - Run all tests once
- test:changed - Run tests for changed files only
- test:watch - Interactive watch mode
- test:related - Run tests related to changed files
- test:math - Quick math module feedback
- test:extract - Extraction pipeline tests
- test:ui - Browser UI for debugging"
```

---

## Task 4: Update Testing Documentation

**Goal:** Document the TDD workflow for developers.

**Files:**
- Modify: `tests/CLAUDE.md`

- [ ] Step 1: Append workflow section to tests/CLAUDE.md

Add this section at the end of `tests/CLAUDE.md`:

```markdown

---

## Test Development Workflow (Phase 1)

### Quick Development Loop (Use These)

```bash
# While working on specific module — watches only that file
npx vitest tests/math.test.js

# After making changes — runs only tests affected by uncommitted changes
npm run test:changed

# For rapid iteration — interactive filter mode
npm run test:watch
# Then press:
#   'p' → filter by filename pattern
#   't' → filter by test name pattern
#   'a' → run all tests
#   'q' → quit
```

### Module-Specific Shortcuts

```bash
# Math/scoring functions (fastest feedback)
npm run test:math

# Extraction pipeline
npm run test:extract

# With UI (for debugging parameterized tests)
npm run test:ui
```

### Pre-Commit (Full Suite)

```bash
npm run test:run  # Run all tests once
```

### Coverage Check

```bash
# Before and after refactoring, verify coverage unchanged
npm run test:coverage
```

### Emergency Escape Hatches

```bash
# Skip tests entirely (not recommended)
git commit --no-verify

# Run specific test by name
npx vitest -t "tokenize filters"

# Run tests matching pattern
npx vitest --run -t "BM25|vector"
```

### When to Run What

| Scenario | Command | Why |
|----------|---------|-----|
| Active TDD on math.js | `npx vitest tests/math.test.js` | <1s feedback |
| Finished feature | `npm run test:changed` | Catches regressions |
| Refactoring shared code | `npm run test:run` | Full coverage |
| Debugging parameterized test | `npm run test:ui` | Visual test explorer |
| CI/Pre-commit | `npm run test:run` | Gatekeeping |

### Parameterized Tests Best Practices

Use `it.each()` with object arrays for readability:

```javascript
// Good: Self-documenting, easy to add cases
const CASES = [
  { name: 'handles positive', input: 5, expected: 10 },
  { name: 'handles zero', input: 0, expected: 0 },
  { name: 'handles negative', input: -3, expected: -6 },
];

it.each(CASES)('$name', ({ input, expected }) => {
  expect(double(input)).toBe(expected);
});
```

**Warning:** If test functions mutate input objects, use `structuredClone()`:

```javascript
it.each(CASES)('$name', (caseData) => {
  const memory = structuredClone(caseData.memory); // Prevent cross-test pollution
  const result = processMemory(memory);
  expect(result).toBe(caseData.expected);
});
```
```

- [ ] Step 2: Verify documentation renders correctly

Run: `head -50 tests/CLAUDE.md`

Expected: New workflow section visible at end of file.

- [ ] Step 3: Commit

```bash
git add tests/CLAUDE.md
git commit -m "docs(tests): add TDD workflow documentation

- Document quick development loop commands
- Add module-specific shortcuts
- Include when-to-run-what decision table
- Document parameterized test best practices"
```

---

## Task 5: Parameterize Cosine Similarity Tests

**Goal:** Convert 6 separate cosine similarity tests to one parameterized test.

**Files:**
- Read: `tests/math.test.js` (cosineSimilarity section)
- Modify: `tests/math.test.js`

- [ ] Step 1: Read current cosine similarity tests

Run: `grep -n "cosineSimilarity" tests/math.test.js | head -20`

Expected: Multiple test cases for Float32Array, mixed inputs, edge cases.

- [ ] Step 2: Replace individual tests with parameterized version

Find the `describe('cosineSimilarity` block (around line 240) and replace all `it()` blocks inside with:

```javascript
describe('cosineSimilarity - parameterized', () => {
  const COSINE_CASES = [
    {
      name: 'Float32Array orthogonal vectors',
      a: new Float32Array([1, 0, 0]),
      b: new Float32Array([0, 1, 0]),
      expected: 0,
    },
    {
      name: 'identical Float32Array vectors',
      a: new Float32Array([0.5, 0.5, 0.5]),
      b: null, // Will use 'a' (isSelf flag)
      expected: 1.0,
      isSelf: true,
    },
    {
      name: 'mixed Float32Array + number[]',
      a: new Float32Array([1, 0, 0]),
      b: [1, 0, 0],
      expected: 1.0,
    },
    {
      name: 'vectors with length not divisible by 4',
      a: new Float32Array([1, 2, 3, 4, 5]),
      b: new Float32Array([1, 2, 3, 4, 5]),
      expected: 1.0,
    },
    {
      name: 'length=1 vector (all remainder)',
      a: new Float32Array([1]),
      b: new Float32Array([1]),
      expected: 1.0,
    },
    {
      name: 'length=4 vector (exact unrolled iteration)',
      a: new Float32Array([1, 0, 0, 0]),
      b: new Float32Array([0, 1, 0, 0]),
      expected: 0,
    },
  ];

  it.each(COSINE_CASES)('$name', ({ a, b, expected, isSelf }) => {
    const result = cosineSimilarity(a, isSelf ? a : b);
    expect(result).toBeCloseTo(expected, 10);
  });

  // High-dimension reference tests kept separate (computationally heavy)
  it('produces identical results on 384-dim vs naive reference', () => {
    const a = new Float32Array(384);
    const b = new Float32Array(384);
    for (let i = 0; i < 384; i++) {
      a[i] = Math.sin(i * 0.1);
      b[i] = Math.cos(i * 0.1);
    }
    // Naive reference
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < 384; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    const expected = dot / (Math.sqrt(na) * Math.sqrt(nb));
    expect(cosineSimilarity(a, b)).toBeCloseTo(expected, 10);
  });

  it('produces identical results on 768-dim vs naive reference', () => {
    const a = new Float32Array(768);
    const b = new Float32Array(768);
    for (let i = 0; i < 768; i++) {
      a[i] = Math.sin(i * 0.05);
      b[i] = Math.cos(i * 0.05);
    }
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < 768; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    const expected = dot / (Math.sqrt(na) * Math.sqrt(nb));
    expect(cosineSimilarity(a, b)).toBeCloseTo(expected, 10);
  });
});
```

- [ ] Step 3: Run tests to verify they pass

Run: `npx vitest --run tests/math.test.js -t "cosineSimilarity"`

Expected: All 8 tests pass (6 parameterized + 2 high-dim reference).

- [ ] Step 4: Commit

```bash
git add tests/math.test.js
git commit -m "refactor(tests): parameterize cosine similarity tests

- Convert 6 separate tests to it.each() table
- Keep high-dimension reference tests separate (heavy computation)
- 6 tests → 1 parameterized test + 2 reference tests"
```

---

## Task 6: Parameterize Tokenization Tests

**Goal:** Convert tokenization tests to parameterized format.

**Files:**
- Modify: `tests/math.test.js`

- [ ] Step 1: Find and replace tokenization tests

Find the `describe('math.js - tokenization'` block and replace with:

```javascript
describe('math.js - tokenization', () => {
  const TOKENIZE_CASES = [
    {
      name: 'filters post-stem runt tokens (< 3 chars)',
      input: 'боюсь страшно',
      expectMinLength: 3,
    },
    {
      name: 'filters stop words',
      input: 'the dragon and the princess',
      notContains: ['the', 'and'],
      contains: ['dragon', 'princess'],
    },
    {
      name: 'handles Russian stemming',
      input: 'драконы дракону',
      contains: ['дракон'],
    },
  ];

  it.each(TOKENIZE_CASES)('$name', ({ input, expectMinLength, notContains, contains }) => {
    const tokens = tokenize(input);

    if (expectMinLength) {
      for (const t of tokens) {
        expect(t.length).toBeGreaterThanOrEqual(expectMinLength);
      }
    }

    if (notContains) {
      for (const word of notContains) {
        expect(tokens).not.toContain(word);
      }
    }

    if (contains) {
      for (const word of contains) {
        expect(tokens).toContain(word);
      }
    }
  });
});
```

- [ ] Step 2: Run tests

Run: `npx vitest --run tests/math.test.js -t "tokenization"`

Expected: All 3 parameterized tests pass.

- [ ] Step 3: Commit

```bash
git add tests/math.test.js
git commit -m "refactor(tests): parameterize tokenization tests

- Convert 3 tokenization tests to it.each() table
- 3 tests → 1 parameterized test"
```

---

## Task 7: Parameterize Retrieval Math Tests

**Goal:** Convert BM25 and scoring tests in retrieval/math.test.js.

**Files:**
- Read: `tests/retrieval/math.test.js`
- Modify: `tests/retrieval/math.test.js`

- [ ] Step 1: Read current retrieval math tests

Run: `wc -l tests/retrieval/math.test.js && head -80 tests/retrieval/math.test.js`

- [ ] Step 2: Create parameterized scoring tests

Add after imports, before first describe:

```javascript
// Default constants reused across scoring tests
const DEFAULT_CONSTANTS = { BASE_LAMBDA: 0.05, IMPORTANCE_5_FLOOR: 5 };
const DEFAULT_SETTINGS = {
  vectorSimilarityThreshold: 0.5,
  alpha: 0.7,
  combinedBoostWeight: 15,
};
```

Then find the BM25 bonus tests and replace with parameterized version:

```javascript
describe('calculateScore - parameterized alpha-blend', () => {
  const SCORE_CASES = [
    {
      name: 'BM25 bonus capped at (1-alpha) * weight',
      memory: { importance: 3, message_ids: [50], embedding: [1, 0, 0] },
      contextEmbedding: [1, 0, 0],
      chatPosition: 100,
      settings: { alpha: 0.7, combinedBoostWeight: 15 },
      normalizedBm25: 1.0,
      expect: { field: 'bm25Bonus', closeTo: 4.5, precision: 1 },
    },
    {
      name: 'vector bonus uses alpha * weight',
      memory: { importance: 3, message_ids: [100], embedding: [1, 0, 0] },
      contextEmbedding: [1, 0, 0],
      chatPosition: 100,
      settings: { alpha: 0.7, combinedBoostWeight: 15 },
      normalizedBm25: 0,
      expect: { field: 'vectorBonus', closeTo: 10.5, precision: 1 },
    },
    {
      name: 'respects vector similarity threshold',
      memory: { importance: 3, message_ids: [100], embedding: [1, 0] },
      contextEmbedding: [0, 1], // sim = 0 (orthogonal)
      chatPosition: 100,
      settings: { vectorSimilarityThreshold: 0.5, alpha: 0.7, combinedBoostWeight: 15 },
      normalizedBm25: 0,
      expect: { field: 'vectorBonus', toBe: 0 },
    },
    {
      name: 'importance-5 uses soft floor of 1.0',
      memory: { importance: 5, message_ids: [10], embedding: null },
      contextEmbedding: null,
      chatPosition: 1000, // distance 990
      settings: {},
      normalizedBm25: 0,
      expect: [
        { field: 'baseAfterFloor', gte: 1.0 },
        { field: 'baseAfterFloor', lt: 5.0 },
      ],
    },
  ];

  it.each(SCORE_CASES)('$name', ({
    memory, contextEmbedding, chatPosition, settings, normalizedBm25, expect: exp
  }) => {
    const mergedSettings = { ...DEFAULT_SETTINGS, ...settings };
    const result = calculateScore(
      memory, contextEmbedding, chatPosition,
      DEFAULT_CONSTANTS, mergedSettings, normalizedBm25
    );

    const expectations = Array.isArray(exp) ? exp : [exp];
    for (const e of expectations) {
      if (e.closeTo !== undefined) {
        expect(result[e.field]).toBeCloseTo(e.closeTo, e.precision);
      }
      if (e.toBe !== undefined) {
        expect(result[e.field]).toBe(e.toBe);
      }
      if (e.gte !== undefined) {
        expect(result[e.field]).toBeGreaterThanOrEqual(e.gte);
      }
      if (e.lt !== undefined) {
        expect(result[e.field]).toBeLessThan(e.lt);
      }
    }
  });
});
```

- [ ] Step 3: Run tests

Run: `npx vitest --run tests/retrieval/math.test.js -t "parameterized"`

Expected: All 4 parameterized tests pass.

- [ ] Step 4: Commit

```bash
git add tests/retrieval/math.test.js
git commit -m "refactor(tests): parameterize retrieval scoring tests

- Add DEFAULT_CONSTANTS and DEFAULT_SETTINGS for reuse
- Convert 4+ scoring tests to it.each() table
- Support multi-expect cases (gte + lt combinations)"
```

---

## Task 8: Parameterize Text Utility Tests

**Goal:** Convert getMemoryPosition and other text utilities.

**Files:**
- Read: `tests/utils/text.test.js`
- Modify: `tests/utils/text.test.js`

- [ ] Step 1: Read current text utility tests

Run: `grep -n "it(" tests/utils/text.test.js | head -20`

- [ ] Step 2: Parameterize getMemoryPosition tests

Find `describe('getMemoryPosition'` and replace:

```javascript
describe('getMemoryPosition', () => {
  const POSITION_CASES = [
    { msgIndex: 95, total: 100, expected: 'recent', desc: 'near the end (>66%)' },
    { msgIndex: 5, total: 100, expected: 'old', desc: 'at the start (<33%)' },
    { msgIndex: 50, total: 100, expected: 'mid', desc: 'in the middle (33-66%)' },
    { msgIndex: 32, total: 100, expected: 'old', desc: 'at 32% boundary' },
    { msgIndex: 33, total: 100, expected: 'mid', desc: 'at 33% boundary (inclusive)' },
    { msgIndex: 66, total: 100, expected: 'mid', desc: 'at 66% boundary (inclusive)' },
    { msgIndex: 67, total: 100, expected: 'recent', desc: 'past 66% boundary' },
    { msgIndex: 0, total: 1, expected: 'recent', desc: 'single message' },
    { msgIndex: 0, total: 3, expected: 'old', desc: 'first of three (0%)' },
    { msgIndex: 1, total: 3, expected: 'mid', desc: 'middle of three (33%)' },
    { msgIndex: 2, total: 3, expected: 'recent', desc: 'last of three (66%)' },
  ];

  it.each(POSITION_CASES)(
    'returns "$expected" for message $msgIndex/$total ($desc)',
    ({ msgIndex, total, expected }) => {
      expect(getMemoryPosition(msgIndex, total)).toBe(expected);
    }
  );
});
```

- [ ] Step 3: Run tests

Run: `npx vitest --run tests/utils/text.test.js -t "getMemoryPosition"`

Expected: All 11 position tests pass.

- [ ] Step 4: Commit

```bash
git add tests/utils/text.test.js
git commit -m "refactor(tests): parameterize getMemoryPosition tests

- Convert 11 position boundary tests to it.each() table
- Include edge cases: single message, exact boundaries"
```

---

## Task 9: Parameterize Formatting Tests

**Goal:** Compress formatting.test.js tests.

**Files:**
- Read: `tests/formatting.test.js`
- Modify: `tests/formatting.test.js`

- [ ] Step 1: Identify repetitive formatting tests

Run: `grep -c "it(" tests/formatting.test.js`

Expected: ~55 tests in this file.

- [ ] Step 2: Look for patterns in memory formatting tests

Run: `grep -B2 "it(" tests/formatting.test.js | head -40`

- [ ] Step 3: Create parameterized memory format tests

Find tests that check memory formatting with different importance levels and replace:

```javascript
describe('formatMemoryImportance - parameterized', () => {
  const IMPORTANCE_CASES = [
    { importance: 1, expected: expect.stringContaining('low') },
    { importance: 2, expected: expect.stringContaining('low') },
    { importance: 3, expected: expect.stringContaining('medium') },
    { importance: 4, expected: expect.stringContaining('high') },
    { importance: 5, expected: expect.stringContaining('critical') },
  ];

  it.each(IMPORTANCE_CASES)('formats importance $importance correctly', ({ importance, expected }) => {
    const result = formatMemoryImportance(importance);
    expect(result).toEqual(expected);
  });
});
```

(Note: Exact assertions depend on the actual formatting functions in the codebase.)

- [ ] Step 4: Run tests

Run: `npx vitest --run tests/formatting.test.js -t "parameterized"`

Expected: New parameterized tests pass.

- [ ] Step 5: Commit

```bash
git add tests/formatting.test.js
git commit -m "refactor(tests): parameterize formatting tests

- Convert importance level tests to it.each() table
- 5 tests → 1 parameterized test"
```

---

## Task 10: Final Verification

**Goal:** Verify full suite still passes and count reduction.

**Files:**
- All test files

- [ ] Step 1: Run full test suite

Run: `npm run test:run`

Expected: All tests pass (0 failures).

- [ ] Step 2: Count new test total

Run: `find tests -name "*.test.js" -exec grep -c "it(" {} \; | awk '{sum+=$1} END {print "Total tests: " sum}'`

Expected: Total tests significantly reduced (target: ~700-800 range).

- [ ] Step 3: Run coverage comparison

Run: `npm run test:coverage 2>&1 | tail -20`

Expected: Coverage percentages match baseline (within 1-2%).

- [ ] Step 4: Test quick development loop

Run: `time npm run test:changed`

Expected: Completes in <3 seconds if no changes, or <5 seconds if running affected tests.

- [ ] Step 5: Final commit

```bash
git add -A
git commit -m "test: complete Phase 1+2 test creep triage

Phase 1 (Workflow):
- Optimize vitest config for watch mode and CI
- Add selective test running npm scripts
- Document TDD workflow in CLAUDE.md

Phase 2 (Parameterization):
- Parameterize cosine similarity tests (6→1)
- Parameterize tokenization tests (3→1)
- Parameterize retrieval scoring tests (4→1)
- Parameterize text utility tests (11→1)
- Parameterize formatting tests

Result: ~1074 tests → ~700 tests, sub-second dev loop"
```

---

## Success Checklist

- [ ] Baseline coverage captured
- [ ] `npm run test:changed` completes in <3s
- [ ] `npm run test:math` runs only math tests
- [ ] All parameterized tests pass
- [ ] Total test count reduced by ~30%
- [ ] Coverage unchanged from baseline
- [ ] Documentation updated

---

## Rollback Instructions

If any issues arise:

```bash
# Revert specific file
git checkout HEAD~1 -- tests/math.test.js

# Or revert all test changes
git log --oneline --grep="refactor(tests)" -n 10
git revert <commit-hash>

# Restore from backup
cp vitest.config.js.backup vitest.config.js
```
