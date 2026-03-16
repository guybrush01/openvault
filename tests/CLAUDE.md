# Testing Subsystem (Vitest + JSDOM)

## CORE RULES & CONSTRAINTS

1. **Zero `vi.mock()`**: NEVER use `vi.mock()` on internal or ST modules (except for minor `embeddings.js` edge cases if explicitly required). 
2. **Single I/O Boundary**: All external ST/Browser boundaries are mocked through `setupTestContext({ deps: { ... } })` in `tests/setup.js`. This overrides the injection in `src/deps.js`.
3. **Data, Not Implementation**: Assert on output data (`mockData.memories`, `mockData.graph`, prompt slot content), not on spy call counts.
4. **Module-Level State**: Worker tests MUST use `vi.resetModules()` in `beforeEach` to reset mutable top-level variables (like `isRunning` in `worker.js`).
5. **No DOM Mocks for Math/Helpers**: Test pure functions (`helpers.js`, `math.js`) by passing objects directly.

## ESM URL ALIASING
Production code uses bare URLs (e.g., `https://esm.sh/graphology`). Node/Vitest cannot resolve these natively.
- **Requirement**: Any CDN package MUST be aliased in `vitest.config.js` to a local `node_modules/` path.
- **Requirement**: You must `npm install --save-dev` the package to make it available to the alias.

## EMBEDDING MOCKS
Do not run real Transformers.js models in Vitest. 
- Force the 'ollama' strategy in test settings (`embeddingSource: 'ollama'`).
- Mock `deps.fetch` to return `{ ok: true, json: () => ({ embedding: [0.1, 0.2] }) }`.

## UI RENDERING TESTS
`render.js` and `status.js` run real code. jQuery on empty JSDOM selections is a silent no-op. If you need to test DOM output, use string templates from `templates.js` directly, or mount standard HTML to the JSDOM document before running.

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

## PERF TEST SUITE (`tests/perf/`)
- **`store.test.js`**: Unit tests for perf store singleton — `record()`, `getAll()`, `loadFromChat()`, `formatForClipboard()`. Uses `_resetForTest()` for isolation.
- **`tab.test.js`**: HTML/CSS presence tests for Perf tab UI structure.
- **`instrumentation.test.js`**: Validates that `record()` is called in instrumented code paths (`autoHide`, memory scoring, event dedup, chat save).