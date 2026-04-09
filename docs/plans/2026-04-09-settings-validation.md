# Settings Validation — Runtime Clamping for Scoring Parameters

**Goal:** Add defense-in-depth runtime clamping to scoring parameters so that corrupted, out-of-range, or manually-tampered settings cannot crash the scoring pipeline or produce mathematically undefined results.
**Architecture:** Two-layer defense: (1) Zod schema `.min()/.max()` constraints for type generation and future use, (2) inline `Math.min`/`Math.max` clamping at the point of consumption in `calculateScore()` so even bypassed schemas can't produce NaN/Infinity/division-by-zero.
**Tech Stack:** Zod, Vitest, existing test patterns (unit tests, no mocking)

---

## File Structure Overview

- Modify: `src/store/schemas.js` — Add `.min()/.max()` constraints to ScoringConfigSchema and ScoringSettingsSchema
- Modify: `src/retrieval/math.js` — Add inline clamping at the top of `calculateScore()` before any math
- Create: `tests/retrieval/scoring-clamping.test.js` — Unit tests for clamping behavior (pure functions, no mocking)

---

## Common Pitfalls

- **Don't clamp inside `loadSettings()` or `setSetting()`** — that's the wrong layer. Settings is a general-purpose key-value store. Clamping belongs at the domain boundary where the value is consumed.
- **Don't add `.refine()` validators** — `.min()/.max()` on `z.number()` is sufficient and keeps the schema serializable for JSON Schema output.
- **`transientDecayMultiplier` default fallback** — Already has `.positive().default(5.0)` in the existing schema, but `calculateScore` uses `settings.transientDecayMultiplier || 5.0` as a second fallback. The clamping layer must respect this fallback.
- **Tests must use `calculateScore` directly** — no `setupTestContext()` needed since `calculateScore` is a pure function with no deps.

---

### Task 1: Add `.min()/.max()` constraints to Zod scoring schemas

**Files:**
- Modify: `src/store/schemas.js`
- Test: `tests/store/schemas.test.js`

- [ ] Step 1: Write the failing test — ScoringConfigSchema should reject out-of-range values

Add these test cases to `tests/store/schemas.test.js` (inside a new `describe('ScoringConfigSchema')` block):

```javascript
describe('ScoringConfigSchema', () => {
    it('should reject negative forgetfulnessBaseLambda', () => {
        const result = schemas.ScoringConfigSchema.safeParse({
            forgetfulnessBaseLambda: -0.05,
            forgetfulnessImportance5Floor: 5,
            reflectionDecayThreshold: 750,
            reflectionLevelMultiplier: 2.0,
            vectorSimilarityThreshold: 0.5,
            alpha: 0.7,
            combinedBoostWeight: 15,
            embeddingSource: 'local',
        });
        expect(result.success).toBe(false);
    });

    it('should reject vectorSimilarityThreshold >= 1.0', () => {
        const result = schemas.ScoringConfigSchema.safeParse({
            forgetfulnessBaseLambda: 0.05,
            forgetfulnessImportance5Floor: 5,
            reflectionDecayThreshold: 750,
            reflectionLevelMultiplier: 2.0,
            vectorSimilarityThreshold: 1.0,
            alpha: 0.7,
            combinedBoostWeight: 15,
            embeddingSource: 'local',
        });
        expect(result.success).toBe(false);
    });

    it('should reject alpha < 0', () => {
        const result = schemas.ScoringConfigSchema.safeParse({
            forgetfulnessBaseLambda: 0.05,
            forgetfulnessImportance5Floor: 5,
            reflectionDecayThreshold: 750,
            reflectionLevelMultiplier: 2.0,
            vectorSimilarityThreshold: 0.5,
            alpha: -0.5,
            combinedBoostWeight: 15,
            embeddingSource: 'local',
        });
        expect(result.success).toBe(false);
    });

    it('should reject alpha > 1', () => {
        const result = schemas.ScoringConfigSchema.safeParse({
            forgetfulnessBaseLambda: 0.05,
            forgetfulnessImportance5Floor: 5,
            reflectionDecayThreshold: 750,
            reflectionLevelMultiplier: 2.0,
            vectorSimilarityThreshold: 0.5,
            alpha: 1.5,
            combinedBoostWeight: 15,
            embeddingSource: 'local',
        });
        expect(result.success).toBe(false);
    });

    it('should accept valid scoring config', () => {
        const result = schemas.ScoringConfigSchema.safeParse({
            forgetfulnessBaseLambda: 0.05,
            forgetfulnessImportance5Floor: 5,
            reflectionDecayThreshold: 750,
            reflectionLevelMultiplier: 2.0,
            vectorSimilarityThreshold: 0.5,
            alpha: 0.7,
            combinedBoostWeight: 15,
            embeddingSource: 'local',
        });
        expect(result.success).toBe(true);
    });
});
```

Also add a `describe('ScoringSettingsSchema')` block:

```javascript
describe('ScoringSettingsSchema', () => {
    it('should reject vectorSimilarityThreshold >= 1.0', () => {
        const result = schemas.ScoringSettingsSchema.safeParse({
            vectorSimilarityThreshold: 1.0,
            alpha: 0.7,
            combinedBoostWeight: 15,
            transientDecayMultiplier: 5.0,
        });
        expect(result.success).toBe(false);
    });

    it('should accept valid scoring settings', () => {
        const result = schemas.ScoringSettingsSchema.safeParse({
            vectorSimilarityThreshold: 0.5,
            alpha: 0.7,
            combinedBoostWeight: 15,
            transientDecayMultiplier: 5.0,
        });
        expect(result.success).toBe(true);
    });
});
```

- [ ] Step 2: Run tests to verify they fail

Run: `npx vitest run tests/store/schemas.test.js -v`
Expected: FAIL — ScoringConfigSchema and ScoringSettingsSchema accept invalid values because there are no `.min()/.max()` constraints.

- [ ] Step 3: Add `.min()/.max()` constraints to schemas

In `src/store/schemas.js`, update `ScoringConfigSchema`:

```javascript
export const ScoringConfigSchema = z.object({
    forgetfulnessBaseLambda: z.number().min(0.001).max(1),
    forgetfulnessImportance5Floor: z.number().min(0),
    reflectionDecayThreshold: z.number().min(0),
    reflectionLevelMultiplier: z.number().min(1).max(10),
    vectorSimilarityThreshold: z.number().min(0).max(0.99),
    alpha: z.number().min(0).max(1),
    combinedBoostWeight: z.number().min(0).max(100),
    embeddingSource: z.enum(['local', 'ollama', 'st_vector']),
    transientDecayMultiplier: z.number().positive().max(50).optional().default(5.0),
});
```

Update `ScoringSettingsSchema`:

```javascript
export const ScoringSettingsSchema = z.object({
    vectorSimilarityThreshold: z.number().min(0).max(0.99),
    alpha: z.number().min(0).max(1),
    combinedBoostWeight: z.number().min(0).max(100),
    transientDecayMultiplier: z.number().positive().max(50).optional(),
});
```

- [ ] Step 4: Run tests to verify they pass

Run: `npx vitest run tests/store/schemas.test.js -v`
Expected: PASS — All new test cases pass.

- [ ] Step 5: Run full type generation and typecheck

Run: `npm run check`
Expected: All checks pass. Verify that `src/types.d.ts` was regenerated with updated types.

- [ ] Step 6: Commit

```bash
git add -A && git commit -m "feat: add min/max constraints to scoring Zod schemas"
```

---

### Task 2: Add runtime clamping in `calculateScore()`

**Files:**
- Modify: `src/retrieval/math.js`
- Test: `tests/retrieval/scoring-clamping.test.js`

- [ ] Step 1: Write the failing tests — clamping prevents crashes from bad settings

Create `tests/retrieval/scoring-clamping.test.js`:

```javascript
import { describe, expect, it } from 'vitest';
import { calculateScore } from '../../src/retrieval/math.js';

const BASE_CONSTANTS = { BASE_LAMBDA: 0.05, IMPORTANCE_5_FLOOR: 5, reflectionDecayThreshold: 750 };

function makeMemory(overrides = {}) {
    return {
        id: 'test-1',
        summary: 'A test memory about something important',
        importance: 3,
        message_ids: [50],
        tokens: ['test', 'memori'],
        ...overrides,
    };
}

describe('calculateScore - settings clamping defense', () => {
    it('should not produce NaN when vectorSimilarityThreshold is 1.0', () => {
        const memory = makeMemory({ embedding: [1, 0, 0], _proxyVectorScore: 0.95 });
        const settings = {
            vectorSimilarityThreshold: 1.0,   // Dangerous: causes division by zero
            alpha: 0.7,
            combinedBoostWeight: 15,
            transientDecayMultiplier: 5.0,
        };
        const breakdown = calculateScore(memory, null, 100, BASE_CONSTANTS, settings, 0);
        expect(breakdown.total).toBeFinite();
        expect(breakdown.vectorBonus).toBe(0); // Threshold clamped to 0.99, so 0.95 < 0.99
    });

    it('should not produce NaN when vectorSimilarityThreshold is -0.5', () => {
        const memory = makeMemory({ _proxyVectorScore: 0.3 });
        const settings = {
            vectorSimilarityThreshold: -0.5,   // Negative threshold
            alpha: 0.7,
            combinedBoostWeight: 15,
            transientDecayMultiplier: 5.0,
        };
        const breakdown = calculateScore(memory, null, 100, BASE_CONSTANTS, settings, 0);
        expect(breakdown.total).toBeFinite();
    });

    it('should not produce Infinity when transientDecayMultiplier is negative', () => {
        const memory = makeMemory({ is_transient: true });
        const settings = {
            vectorSimilarityThreshold: 0.5,
            alpha: 0.7,
            combinedBoostWeight: 15,
            transientDecayMultiplier: -5.0,    // Negative = exponential growth instead of decay
        };
        const breakdown = calculateScore(memory, null, 100, BASE_CONSTANTS, settings, 0);
        expect(breakdown.total).toBeFinite();
    });

    it('should not produce Infinity when alpha is 999', () => {
        const memory = makeMemory({ _proxyVectorScore: 0.8 });
        const settings = {
            vectorSimilarityThreshold: 0.5,
            alpha: 999,
            combinedBoostWeight: 15,
            transientDecayMultiplier: 5.0,
        };
        const breakdown = calculateScore(memory, null, 100, BASE_CONSTANTS, settings, 0);
        expect(breakdown.total).toBeFinite();
    });

    it('should not produce NaN when alpha is NaN', () => {
        const memory = makeMemory();
        const settings = {
            vectorSimilarityThreshold: 0.5,
            alpha: NaN,
            combinedBoostWeight: 15,
            transientDecayMultiplier: 5.0,
        };
        const breakdown = calculateScore(memory, null, 100, BASE_CONSTANTS, settings, 0);
        expect(breakdown.total).toBeFinite();
    });

    it('should not produce Infinity when forgetfulnessBaseLambda is negative', () => {
        const memory = makeMemory({ importance: 1, message_ids: [10] });
        const constants = { ...BASE_CONSTANTS, BASE_LAMBDA: -0.05 };
        const settings = {
            vectorSimilarityThreshold: 0.5,
            alpha: 0.7,
            combinedBoostWeight: 15,
        };
        const breakdown = calculateScore(memory, null, 1000, constants, settings, 0);
        expect(breakdown.total).toBeFinite();
    });

    it('should clamp alpha outside [0, 1] and produce correct blend weights', () => {
        const memory = makeMemory({ _proxyVectorScore: 0.8 });
        const settings = {
            vectorSimilarityThreshold: 0.5,
            alpha: 2.0,               // Should be clamped to 1.0
            combinedBoostWeight: 15,
            transientDecayMultiplier: 5.0,
        };
        const breakdown = calculateScore(memory, null, 100, BASE_CONSTANTS, settings, 0);
        // With alpha clamped to 1.0, BM25 bonus should be (1 - 1.0) * weight = 0
        expect(breakdown.bm25Bonus).toBe(0);
    });

    it('should produce valid scores with all normal settings (regression)', () => {
        const memory = makeMemory({ importance: 3, message_ids: [80] });
        const settings = {
            vectorSimilarityThreshold: 0.5,
            alpha: 0.7,
            combinedBoostWeight: 15,
            transientDecayMultiplier: 5.0,
        };
        const breakdown = calculateScore(memory, null, 100, BASE_CONSTANTS, settings, 0);
        expect(breakdown.total).toBeGreaterThan(0);
        expect(breakdown.base).toBeGreaterThan(0);
    });
});
```

- [ ] Step 2: Run tests to verify they fail

Run: `npx vitest run tests/retrieval/scoring-clamping.test.js -v`
Expected: FAIL — Tests with `vectorSimilarityThreshold: 1.0` will produce NaN (division by zero), and negative `transientDecayMultiplier` will produce Infinity.

- [ ] Step 3: Add clamping at the top of `calculateScore()`

In `src/retrieval/math.js`, add clamping lines immediately after the function signature and before any math. Insert between the `/** @type {Map<string, number>|null} */ chatFingerprintMap = null` parameter and the `// === Forgetfulness Curve ===` comment:

```javascript
    // === Settings Clamping (Defense-in-Depth) ===
    // Prevents NaN, Infinity, and division-by-zero from corrupted/tampered settings.
    // Zod schemas provide schema-level validation; this is the runtime safety net.
    const clampedThreshold = Math.min(Math.max(settings.vectorSimilarityThreshold || 0, 0), 0.99);
    const clampedAlpha = Math.min(Math.max(settings.alpha || 0, 0), 1);
    const clampedBoostWeight = Math.max(settings.combinedBoostWeight || 0, 0);
    const clampedTransientMultiplier = Math.max(settings.transientDecayMultiplier || 5.0, 0.01);
    const clampedBaseLambda = Math.max(constants.BASE_LAMBDA || 0.001, 0.001);
```

Then replace all usages within `calculateScore()`:

1. Line `const alpha = settings.alpha;` → `const alpha = clampedAlpha;`
2. Line `const boostWeight = settings.combinedBoostWeight;` → `const boostWeight = clampedBoostWeight;`
3. All `const threshold = settings.vectorSimilarityThreshold;` → `const threshold = clampedThreshold;`
4. The transient decay block: `const multiplier = settings.transientDecayMultiplier || 5.0;` → `const multiplier = clampedTransientMultiplier;`
5. The forgetfulness lambda block: change `(constants.BASE_LAMBDA / (importance * importance))` → `(clampedBaseLambda / (importance * importance))`

- [ ] Step 4: Run tests to verify they pass

Run: `npx vitest run tests/retrieval/scoring-clamping.test.js -v`
Expected: PASS — All clamping tests pass. No NaN, no Infinity.

- [ ] Step 5: Run full test suite to verify no regressions

Run: `npm test`
Expected: All tests pass (including existing `math.test.js` and `scoring.test.js`).

- [ ] Step 6: Commit

```bash
git add -A && git commit -m "fix: clamp scoring parameters at consumption to prevent NaN/Infinity"
```

---

### Task 3: Verify clamping also protects `scoreMemories()` slow-pass path

**Files:**
- Test: `tests/retrieval/scoring-clamping.test.js`

- [ ] Step 1: Write failing test — slow-pass vector override also protected

Add to `tests/retrieval/scoring-clamping.test.js`:

```javascript
describe('calculateScore - slow-pass vector override clamping', () => {
    it('should not produce NaN in the two-pass vector re-scoring path', async () => {
        const { scoreMemories } = await import('../../src/retrieval/math.js');

        const memories = [
            {
                id: 'm1',
                summary: 'A memory about a forest',
                importance: 3,
                message_ids: [50],
                tokens: ['memori', 'forest'],
                embedding: new Float32Array([1, 0, 0]),
            },
            {
                id: 'm2',
                summary: 'A memory about the ocean',
                importance: 3,
                message_ids: [60],
                tokens: ['memori', 'ocean'],
                embedding: new Float32Array([0, 1, 0]),
            },
        ];

        const contextEmbedding = new Float32Array([1, 0, 0]);
        const constants = { ...BASE_CONSTANTS };
        const settings = {
            vectorSimilarityThreshold: 1.0, // Would cause division by zero in slow-pass
            alpha: 0.7,
            combinedBoostWeight: 15,
            transientDecayMultiplier: 5.0,
        };

        const result = await scoreMemories(memories, contextEmbedding, 100, constants, settings, 'forest');
        for (const scored of result) {
            expect(scored.score).toBeFinite();
            expect(scored.breakdown.vectorBonus).toBeFinite();
        }
    });
});
```

- [ ] Step 2: Run the test

Run: `npx vitest run tests/retrieval/scoring-clamping.test.js -v`
Expected: FAIL — The slow-pass re-scoring in `scoreMemories()` at line ~567 also computes `(vectorSimilarity - threshold) / (1 - threshold)` directly without going through `calculateScore()`'s clamping.

- [ ] Step 3: Apply clamping in the slow-pass override in `scoreMemories()`

In `src/retrieval/math.js`, inside the `scoreMemories` function's slow-pass block (around line 563-575), find:

```javascript
        // If we have a pre-computed vector similarity, override the vectorBonus
        if (vectorSimilarity !== null) {
            const threshold = settings.vectorSimilarityThreshold;
            if (vectorSimilarity > threshold) {
                const normalizedSim = (vectorSimilarity - threshold) / (1 - threshold);
                breakdown.vectorBonus = settings.alpha * settings.combinedBoostWeight * normalizedSim;
```

Replace with:

```javascript
        // If we have a pre-computed vector similarity, override the vectorBonus
        if (vectorSimilarity !== null) {
            const threshold = Math.min(Math.max(settings.vectorSimilarityThreshold || 0, 0), 0.99);
            const alpha = Math.min(Math.max(settings.alpha || 0, 0), 1);
            const boostWeight = Math.max(settings.combinedBoostWeight || 0, 0);
            if (vectorSimilarity > threshold) {
                const normalizedSim = (vectorSimilarity - threshold) / (1 - threshold);
                breakdown.vectorBonus = alpha * boostWeight * normalizedSim;
```

- [ ] Step 4: Run tests

Run: `npx vitest run tests/retrieval/scoring-clamping.test.js -v`
Expected: PASS.

- [ ] Step 5: Run full suite

Run: `npm test`
Expected: All tests pass.

- [ ] Step 6: Commit

```bash
git add -A && git commit -m "fix: clamp scoring params in scoreMemories slow-pass vector override"
```

---

### Task 4: Run full pre-commit check

- [ ] Step 1: Run the complete check pipeline

Run: `npm run check`
Expected: All checks pass (sync-version, generate-types, lint, jsdoc, css, typecheck).

- [ ] Step 2: Verify generated types updated correctly

Check that `src/types.d.ts` now has narrower types for `ScoringConfig` and `ScoringSettings` (no `any`, proper number types with min/max inferred where Zod can express them).

- [ ] Step 3: Final commit if anything was missed

```bash
git add -A && git commit -m "chore: ensure generated types reflect schema constraints"
```
