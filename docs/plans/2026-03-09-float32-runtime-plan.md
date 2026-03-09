# Implementation Plan - Float32Array Runtime Embeddings

> **Reference:** `docs/designs/2026-03-09-float32-runtime-design.md`
> **Execution:** Use `executing-plans` skill.

---

### Task 1: Unroll cosineSimilarity + Add Float32Array Test Coverage

**Goal:** Refactor `cosineSimilarity()` to a 4x unrolled loop and add tests covering Float32Array inputs, mixed types, and remainder handling.

**Step 1: Write New Tests (Green Baseline)**
- File: `tests/math.test.js`
- Action: Add a new `describe` block after the existing `'scoreMemories - dynamic character stopwords'` block.
- Code:
  ```js
  describe('cosineSimilarity - Float32Array and unrolling', () => {
      it('handles Float32Array inputs', () => {
          const a = new Float32Array([1, 0, 0]);
          const b = new Float32Array([0, 1, 0]);
          expect(cosineSimilarity(a, b)).toBe(0);
      });

      it('handles identical Float32Array vectors', () => {
          const a = new Float32Array([0.5, 0.5, 0.5]);
          expect(cosineSimilarity(a, a)).toBeCloseTo(1.0, 10);
      });

      it('handles mixed Float32Array + number[] inputs', () => {
          const a = new Float32Array([1, 0, 0]);
          const b = [1, 0, 0];
          expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 10);
      });

      it('handles vectors with length not divisible by 4 (remainder)', () => {
          const a = new Float32Array([1, 2, 3, 4, 5]);
          const b = new Float32Array([1, 2, 3, 4, 5]);
          expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 10);
      });

      it('handles length=1 vector (all remainder, no unrolled iterations)', () => {
          const a = new Float32Array([1]);
          const b = new Float32Array([1]);
          expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 10);
      });

      it('handles length=4 vector (exactly one unrolled iteration, no remainder)', () => {
          const a = new Float32Array([1, 0, 0, 0]);
          const b = new Float32Array([0, 1, 0, 0]);
          expect(cosineSimilarity(a, b)).toBe(0);
      });

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
              dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
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
              dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
          }
          const expected = dot / (Math.sqrt(na) * Math.sqrt(nb));
          expect(cosineSimilarity(a, b)).toBeCloseTo(expected, 10);
      });
  });
  ```
- Note: Import `cosineSimilarity` — it's already imported in the file's top-level import: `import { calculateScore, scoreMemories, tokenize } from '../src/retrieval/math.js';`. **Add `cosineSimilarity` to this import.**

**Step 2: Run Tests (Green Baseline)**
- Command: `npx vitest run tests/math.test.js`
- Expect: **PASS** — current `cosineSimilarity` already handles `Float32Array` via `[]` indexing. This confirms our Green baseline before refactoring.

**Step 3: Refactor cosineSimilarity (Green → Green)**
- File: `src/retrieval/math.js`
- Action: Replace the `cosineSimilarity` function body with the 4x unrolled version. Keep the same guard clause.
- Replace:
  ```js
  /**
   * Calculate cosine similarity between two vectors
   * @param {number[]} vecA - First vector
   * @param {number[]} vecB - Second vector
   * @returns {number} Cosine similarity (0-1)
   */
  export function cosineSimilarity(vecA, vecB) {
      if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) {
          return 0;
      }

      let dotProduct = 0;
      let normA = 0;
      let normB = 0;

      for (let i = 0; i < vecA.length; i++) {
          dotProduct += vecA[i] * vecB[i];
          normA += vecA[i] * vecA[i];
          normB += vecB[i] * vecB[i];
      }

      const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
      return magnitude === 0 ? 0 : dotProduct / magnitude;
  }
  ```
- With:
  ```js
  /**
   * Calculate cosine similarity between two vectors.
   * 4x loop-unrolled for performance on 384/768-dim typed arrays.
   * @param {Float32Array|number[]} vecA - First vector
   * @param {Float32Array|number[]} vecB - Second vector
   * @returns {number} Cosine similarity (0-1)
   */
  export function cosineSimilarity(vecA, vecB) {
      if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) {
          return 0;
      }

      const len = vecA.length;
      let dot = 0, normA = 0, normB = 0;

      // Process 4 elements per iteration (384-dim → 96 iterations)
      const limit = len - (len % 4);
      for (let i = 0; i < limit; i += 4) {
          const a0 = vecA[i],     a1 = vecA[i + 1], a2 = vecA[i + 2], a3 = vecA[i + 3];
          const b0 = vecB[i],     b1 = vecB[i + 1], b2 = vecB[i + 2], b3 = vecB[i + 3];
          dot   += a0 * b0 + a1 * b1 + a2 * b2 + a3 * b3;
          normA += a0 * a0 + a1 * a1 + a2 * a2 + a3 * a3;
          normB += b0 * b0 + b1 * b1 + b2 * b2 + b3 * b3;
      }

      // Handle remainder (0-3 elements)
      for (let i = limit; i < len; i++) {
          dot   += vecA[i] * vecB[i];
          normA += vecA[i] * vecA[i];
          normB += vecB[i] * vecB[i];
      }

      const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
      return magnitude === 0 ? 0 : dot / magnitude;
  }
  ```

**Step 4: Verify (Green)**
- Command: `npx vitest run tests/math.test.js`
- Expect: **PASS** — all existing + new tests pass.

**Step 5: Git Commit**
- `git add tests/math.test.js src/retrieval/math.js && git commit -m "refactor: unroll cosineSimilarity 4x + Float32Array test coverage"`

---

### Task 2: Codec Returns Float32Array

**Goal:** Change `getEmbedding()` to return `Float32Array` instead of `number[]`. Update breaking test assertions.

**Step 1: Write Failing Tests (Red)**
- File: `tests/utils/embedding-codec.test.js`
- Action 1: Update the test `'reads legacy number[] from obj.embedding'` to expect `Float32Array`:
  - Replace:
    ```js
    it('reads legacy number[] from obj.embedding', () => {
        const obj = { embedding: [0.1, 0.2, 0.3] };
        expect(getEmbedding(obj)).toEqual([0.1, 0.2, 0.3]);
    });
    ```
  - With:
    ```js
    it('wraps legacy number[] in Float32Array', () => {
        const obj = { embedding: [0.1, 0.2, 0.3] };
        const result = getEmbedding(obj);
        expect(result).toBeInstanceOf(Float32Array);
        expect(result).toHaveLength(3);
        expect(result[0]).toBeCloseTo(0.1, 5);
        expect(result[1]).toBeCloseTo(0.2, 5);
        expect(result[2]).toBeCloseTo(0.3, 5);
    });
    ```
- Action 2: Add new test cases inside the `'getEmbedding (lazy migration)'` describe block, after the `'returns null for embedding: []'` test:
  ```js
  it('returns Float32Array from Base64 decode', () => {
      const obj = {};
      setEmbedding(obj, [0.5, -0.5, 1.0]);
      const result = getEmbedding(obj);
      expect(result).toBeInstanceOf(Float32Array);
      expect(result).toHaveLength(3);
  });

  it('returns Float32Array from legacy path', () => {
      const obj = { embedding: [1.0, 2.0] };
      const result = getEmbedding(obj);
      expect(result).toBeInstanceOf(Float32Array);
  });
  ```
- Action 3: Update the test title `'encodes to Base64 and decodes back to number[]'` to `'encodes to Base64 and decodes back to Float32Array'`. Add a `toBeInstanceOf` assertion after `getEmbedding`:
  - In the roundtrip test, after `const decoded = getEmbedding(obj);`, add:
    ```js
    expect(decoded).toBeInstanceOf(Float32Array);
    ```

**Step 2: Run Tests (Red)**
- Command: `npx vitest run tests/utils/embedding-codec.test.js`
- Expect: **FAIL** — `toBeInstanceOf(Float32Array)` fails because `getEmbedding` currently returns `number[]`.

**Step 3: Implementation (Green)**
- File: `src/utils/embedding-codec.js`
- Action 1: In `decode()`, replace `return Array.from(new Float32Array(bytes.buffer));` with `return new Float32Array(bytes.buffer);`
- Action 2: In `getEmbedding()`, replace `return obj.embedding;` with `return new Float32Array(obj.embedding);`
- Action 3: Update JSDoc on `decode()`: change `@returns {number[]}` to `@returns {Float32Array}`
- Action 4: Update JSDoc on `getEmbedding()`: change `@returns {number[]|null}` to `@returns {Float32Array|null}`

**Step 4: Verify (Green)**
- Command: `npx vitest run tests/utils/embedding-codec.test.js`
- Expect: **PASS** — all tests pass with Float32Array returns.

**Step 5: Cross-Check — Run Full Suite**
- Command: `npx vitest run`
- Expect: **PASS** — existing tests use `[i]` indexing and `.toBeCloseTo()` which work on Float32Array. Mocked tests return `number[]` which `cosineSimilarity` handles.
- If any test breaks: it means a test used `.toEqual([...])` on a `getEmbedding()` result that wasn't caught in the analysis. Fix those assertions the same way.

**Step 6: Git Commit**
- `git add src/utils/embedding-codec.js tests/utils/embedding-codec.test.js && git commit -m "feat: getEmbedding returns Float32Array instead of number[]"`

---

### Task 3: Strategy Methods Return Float32Array

**Goal:** Make `TransformersStrategy.#embed()` and `OllamaStrategy.getEmbedding()` return `Float32Array` instead of `number[]`.

**Step 1: Implementation**
- File: `src/embeddings.js`
- Action 1: In `TransformersStrategy.#embed()`, replace:
  ```js
  return Array.from(output.data);
  ```
  With:
  ```js
  return output.data instanceof Float32Array ? output.data : new Float32Array(output.data);
  ```
- Action 2: In `OllamaStrategy.getEmbedding()`, replace:
  ```js
  return data.embedding || null;
  ```
  With:
  ```js
  return data.embedding ? new Float32Array(data.embedding) : null;
  ```
- Action 3: Update JSDoc on `EmbeddingStrategy` base class — all three methods:
  - `getEmbedding`: `@returns {Promise<Float32Array|null>}`
  - `getQueryEmbedding`: `@returns {Promise<Float32Array|null>}`
  - `getDocumentEmbedding`: `@returns {Promise<Float32Array|null>}`
- Action 4: Update JSDoc on `getQueryEmbedding()` (public API): `@returns {Promise<Float32Array|null>}`
- Action 5: Update JSDoc on `getDocumentEmbedding()` (public API): `@returns {Promise<Float32Array|null>}`

**Step 2: Verify**
- Command: `npx vitest run tests/embeddings.test.js`
- Expect: **PASS** — test assertions use `.toBeCloseTo()` on `decoded[0]` which works on Float32Array. Mock strategies in other tests return `number[]` via `vi.fn` — those tests use mocked `getEmbedding` which returns `number[]`, and `cosineSimilarity` handles mixed types.

**Step 3: Full Suite Check**
- Command: `npx vitest run`
- Expect: **PASS**

**Step 4: Git Commit**
- `git add src/embeddings.js && git commit -m "feat: embedding strategies return Float32Array directly"`

---

### Task 4: JSDoc Updates + ARCHITECTURE.md

**Goal:** Update remaining JSDoc type annotations and architecture docs to reflect `Float32Array` runtime type.

**Step 1: Update math.js JSDoc**
- File: `src/retrieval/math.js`
- Action 1: In `calculateScore()` JSDoc, change:
  - `@param {number[]|null} contextEmbedding` → `@param {Float32Array|null} contextEmbedding`
- Action 2: In `scoreMemories()` JSDoc, change:
  - `@param {number[]|null} contextEmbedding` → `@param {Float32Array|null} contextEmbedding`

**Step 2: Update world-context.js JSDoc**
- File: `src/retrieval/world-context.js`
- Action: In `retrieveWorldContext()` JSDoc, change:
  - `@param {number[]} queryEmbedding` → `@param {Float32Array} queryEmbedding`

**Step 3: Update ARCHITECTURE.md**
- File: `include/ARCHITECTURE.md`
- Action: In the `**Embeddings**` section, replace:
  ```
  **Embeddings**: Stored as Base64 Float32Array. Legacy JSON arrays read transparently (lazy migration). True LRU cache (max 500).
  ```
  With:
  ```
  **Embeddings**: Stored as Base64 Float32Array, decoded to `Float32Array` at runtime (not `number[]`). Legacy JSON arrays wrapped in `Float32Array` on read (lazy migration). True LRU cache (max 500). All cosine similarity uses 4x loop-unrolled dot product on typed arrays.
  ```

**Step 4: Update data schema comment**
- File: `include/ARCHITECTURE.md`
- Action: In the data schema `memories` type, verify `embedding_b64: string` is already documented (it is). No change needed.

**Step 5: Verify**
- Command: `npx vitest run`
- Expect: **PASS** — JSDoc and doc changes don't affect tests.

**Step 6: Git Commit**
- `git add src/retrieval/math.js src/retrieval/world-context.js include/ARCHITECTURE.md && git commit -m "docs: update JSDoc types and ARCHITECTURE.md for Float32Array runtime"`
