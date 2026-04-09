# Debug Log Removal & Type Safety Cleanup

**Goal:** Remove a production debug `console.log` and replace all `z.any()` in Zod schemas with proper types so generated TypeScript types lose their `any` escapes.
**Architecture:** Two independent fixes — (A) swap a raw `console.log` for the existing `logDebug()` utility in `query-context.js`, and (B) replace `z.any()` with typed Zod schemas in `src/store/schemas.js` then regenerate `src/types.d.ts`. Both changes feed `npm run check` as the final gate.
**Tech Stack:** Vitest, Zod 4, zod-to-ts (via `scripts/generate-types.js`)

---

### Task 1: Replace `console.log` with `logDebug` in `query-context.js`

**Files:**
- Modify: `src/retrieval/query-context.js`
- Test: `tests/retrieval/query-context.test.js`

- [ ] Step 1: Add `logDebug` import

At the top of `src/retrieval/query-context.js`, add the import after the existing imports:

```javascript
import { logDebug } from '../utils/logging.js';
```

- [ ] Step 2: Replace the raw `console.log` block (lines 192-204) with `logDebug`

Replace:

```javascript
        // DEBUG: Log corpus grounding behavior
        if (msgStems.length > 0) {
            console.log('[BM25-DEBUG] Three-tier BM25:', {
                msgStems: msgStems.slice(0, 20),
                groundedCount: grounded.length,
                nonGroundedCount: nonGrounded.length,
                sampleGrounded: grounded.slice(0, 10),
                sampleNonGrounded: nonGrounded.slice(0, 10),
                vocabSize: corpusVocab.size,
                weights: {
                    layer1: `${settings.entityBoostWeight}x (entities)`,
                    layer2: `${Math.ceil(settings.entityBoostWeight * CORPUS_GROUNDED_BOOST_RATIO)}x (grounded)`,
                    layer3: `${Math.ceil(settings.entityBoostWeight * NON_GROUNDED_BOOST_RATIO)}x (non-grounded)`,
                },
            });
        }
```

With:

```javascript
        if (msgStems.length > 0) {
            logDebug('Three-tier BM25:', {
                msgStems: msgStems.slice(0, 20),
                groundedCount: grounded.length,
                nonGroundedCount: nonGrounded.length,
                sampleGrounded: grounded.slice(0, 10),
                sampleNonGrounded: nonGrounded.slice(0, 10),
                vocabSize: corpusVocab.size,
                weights: {
                    layer1: `${settings.entityBoostWeight}x (entities)`,
                    layer2: `${Math.ceil(settings.entityBoostWeight * CORPUS_GROUNDED_BOOST_RATIO)}x (grounded)`,
                    layer3: `${Math.ceil(settings.entityBoostWeight * NON_GROUNDED_BOOST_RATIO)}x (non-grounded)`,
                },
            });
        }
```

- [ ] Step 3: Run tests to verify nothing breaks

Run: `npx vitest run tests/retrieval/query-context.test.js -v`
Expected: All tests PASS

- [ ] Step 4: Commit

```bash
git add -A && git commit -m "fix: replace raw console.log with logDebug in query-context"
```

---

### Task 2: Type `getJsonSchema` as a function returning an object

**Files:**
- Modify: `src/store/schemas.js`
- Modify: `src/types.d.ts` (auto-generated)

- [ ] Step 1: Replace `z.any()` for `getJsonSchema` in `LLMConfigSchema`

The actual return type from `toJsonSchema()` in `src/extraction/structured.js` is `{ name: string, strict: boolean, value: object }`.

In `src/store/schemas.js`, find:

```javascript
    getJsonSchema: z.any().optional(),
```

Replace with:

```javascript
    getJsonSchema: z.function(
        z.tuple([]),
        z.object({ name: z.string(), strict: z.boolean(), value: z.record(z.string(), z.unknown()) })
    ).optional(),
```

This types `getJsonSchema` as `(() => { name: string; strict: boolean; value: Record<string, unknown> }) | undefined`.

- [ ] Step 2: Run type generation

Run: `npm run generate-types`
Expected: `src/types.d.ts` updated — `getJsonSchema` field is now typed as `(() => Record<string, unknown>) | undefined` instead of `any | undefined`

- [ ] Step 3: Run full check

Run: `npm run check`
Expected: All steps pass (lint, typecheck, tests)

- [ ] Step 4: Commit

```bash
git add -A && git commit -m "fix: type getJsonSchema as function returning Record in Zod schema"
```

---

### Task 3: Type `abortSignal` and `signal` as `AbortSignal`

**Files:**
- Modify: `src/store/schemas.js`
- Modify: `src/types.d.ts` (auto-generated)

- [ ] Step 1: Replace `z.any()` for signal fields in `ExtractionOptionsSchema`

In `src/store/schemas.js`, find:

```javascript
    abortSignal: z.any().optional(),
    progressCallback: z.any().optional(),
    onPhase2Start: z.any().optional(),
```

Replace with:

```javascript
    abortSignal: z.instanceof(AbortSignal).optional(),
    progressCallback: z.function(z.tuple([z.number(), z.number(), z.number()]), z.void()).optional(),
    onPhase2Start: z.function(z.tuple([]), z.void()).optional(),
```

- [ ] Step 2: Replace `z.any()` for signal field in `ExtractionLLMOptionsSchema`

Find:

```javascript
    signal: z.any().optional(),
```

Replace with:

```javascript
    signal: z.instanceof(AbortSignal).optional(),
```

- [ ] Step 3: Replace `z.any()` for signal field in `LLMCallOptionsSchema`

Find:

```javascript
    signal: z.any().optional(),
```

Replace with:

```javascript
    signal: z.instanceof(AbortSignal).optional(),
```

- [ ] Step 4: Run type generation

Run: `npm run generate-types`
Expected: Types now show `AbortSignal` instead of `any` for all signal fields; callbacks show function signatures.

- [ ] Step 5: Run full check

Run: `npm run check`
Expected: All steps pass

- [ ] Step 6: Commit

```bash
git add -A && git commit -m "fix: type abortSignal, progressCallback, onPhase2Start, signal in Zod schemas"
```

---

### Task 4: Type `StSyncChanges.item` as a discriminated union

**Files:**
- Modify: `src/store/schemas.js`
- Modify: `src/types.d.ts` (auto-generated)

The `item` field in `StSyncChanges.toSync` carries a reference back to the data object that was synced. In practice it is one of: `Memory`, `GraphNode`, `GraphEdge`, or `CommunitySummary`. Use `z.union()`.

- [ ] Step 1: Replace `z.any()` for `item` in `StSyncChangesSchema`

In `src/store/schemas.js`, find:

```javascript
            z.object({
                hash: z.number(),
                text: z.string(),
                item: z.any(),
            })
```

Replace with:

```javascript
            z.object({
                hash: z.number(),
                text: z.string(),
                item: z.union([MemorySchema, GraphNodeSchema, GraphEdgeSchema, CommunitySummarySchema]),
            })
```

- [ ] Step 2: Run type generation

Run: `npm run generate-types`
Expected: `item` is now typed as `Memory | GraphNode | GraphEdge | CommunitySummary` instead of `any`

- [ ] Step 3: Run full check

Run: `npm run check`
Expected: All steps pass

- [ ] Step 4: Commit

```bash
git add -A && git commit -m "fix: type StSyncChanges.item as union of Memory/Node/Edge/Community"
```

---

### Task 5: Type `emotional_impact` and `relationship_impact` as `Record<string, string>`

**Files:**
- Modify: `src/store/schemas.js`
- Modify: `src/types.d.ts` (auto-generated)

These fields store LLM-extracted character → impact string mappings (e.g., `{ "Alice": "feels betrayed" }`).

- [ ] Step 1: Replace `z.record(..., z.any())` in `EventSchema`

In `src/store/schemas.js`, find:

```javascript
    emotional_impact: z.record(z.string().trim(), z.any()).optional().default({}),
    relationship_impact: z.record(z.string().trim(), z.any()).optional().default({}),
```

Replace with:

```javascript
    emotional_impact: z.record(z.string().trim(), z.string()).optional().default({}),
    relationship_impact: z.record(z.string().trim(), z.string()).optional().default({}),
```

- [ ] Step 2: Run type generation

Run: `npm run generate-types`
Expected: Both fields now typed as `Record<string, string>` instead of `Record<string, any>`

- [ ] Step 3: Run full check

Run: `npm run check`
Expected: All steps pass

- [ ] Step 4: Commit

```bash
git add -A && git commit -m "fix: type emotional_impact/relationship_impact as Record<string, string>"
```

---

### Task 6: Remove `CdnMirrorFnSchema` and `LadderQueueSchema` placeholder types

**Files:**
- Modify: `src/store/schemas.js`
- Modify: `scripts/generate-types.js`
- Modify: `src/utils/cdn.js`
- Modify: `src/utils/queue.js`
- Modify: `src/types.d.ts` (auto-generated)

These two are typed as `z.any()` because Zod has no way to express interface shapes. They serve no runtime validation purpose — they only exist for type generation and currently produce `export type CdnMirrorFn = any;` and `export type LadderQueue = any;`. Remove them from generation and use inline JSDoc typedefs at the point of use.

- [ ] Step 1: Remove `CdnMirrorFnSchema` and `LadderQueueSchema` from `schemas.js`

In `src/store/schemas.js`, remove:

```javascript
// CdnMirrorFn - function type (represented as any for Zod)
export const CdnMirrorFnSchema = z.any();

// LadderQueue - complex interface (represented as any for Zod)
export const LadderQueueSchema = z.any();
```

- [ ] Step 2: Remove imports and type mappings from `generate-types.js`

In `scripts/generate-types.js`, remove from the import destructuring:

```javascript
    CdnMirrorFnSchema,
    LadderQueueSchema,
```

And remove these two entries from the `typeMappings` array:

```javascript
    // Function/complex types represented as any
    { name: 'CdnMirrorFn', schema: CdnMirrorFnSchema },
    { name: 'LadderQueue', schema: LadderQueueSchema },
```

- [ ] Step 3: Flip typedef direction in `cdn.js`

In `src/utils/cdn.js`, replace:

```javascript
/** @typedef {import('../types.d.ts').CdnMirrorFn} CdnMirrorFn */
```

With:

```javascript
/**
 * CDN mirror function — takes a pinned package spec, returns a full URL or null.
 * @typedef {(pkg: string) => string | null} CdnMirrorFn
 */
```

- [ ] Step 4: Flip typedef direction in `queue.js`

In `src/utils/queue.js`, replace:

```javascript
/** @typedef {import('../types.d.ts').LadderQueue} LadderQueue */
```

With:

```javascript
/**
 * AIMD-governed task queue.
 * @typedef {{ add: (fn: () => Promise<unknown>) => Promise<unknown>, onIdle: () => Promise<void>, concurrency: number }} LadderQueue
 */
```

- [ ] Step 5: Search for any other imports of these types from `types.d.ts`

Run: `grep -rn "CdnMirrorFn\|LadderQueue" src/ --include="*.js"`
Expected: Only `cdn.js` and `queue.js` reference them

- [ ] Step 6: Run type generation

Run: `npm run generate-types`
Expected: `types.d.ts` no longer contains `CdnMirrorFn` or `LadderQueue` exports

- [ ] Step 7: Run full check

Run: `npm run check`
Expected: All steps pass (no broken type imports)

- [ ] Step 8: Commit

```bash
git add -A && git commit -m "fix: remove z.any() placeholders for CdnMirrorFn/LadderQueue, use JSDoc typedefs"
```

---

### Task 7: Final verification — zero `any` in generated types

- [ ] Step 1: Run full check suite

Run: `npm run check`
Expected: Clean pass (sync-version, generate-types, lint, jsdoc, css, typecheck)

- [ ] Step 2: Verify no `any` remains in `types.d.ts`

Run: `grep -n "any" src/types.d.ts`
Expected: No matches (or only within comments)

- [ ] Step 3: Verify no raw `console.log` in production code

Run: `grep -rn "console.log" src/ --include="*.js"`
Expected: Only inside `src/utils/logging.js` (the `c.log(...)` calls which go through `getDeps().console`)

---

## Common Pitfalls

- `z.function()` in Zod 4.3.6 has not been used elsewhere in this codebase. If `zod-to-ts` cannot render function types, `z.function()` may produce `unknown` in the output — check the generated `types.d.ts` after Task 2 and Task 3. If it breaks, fall back to `z.unknown()` for those fields (still better than `any`).
- `z.instanceof(AbortSignal)` works in browsers but Vitest uses JSDOM — verify `AbortSignal` is available globally in the test environment (it is in Node 18+ and JSDOM). If `zod-to-ts` cannot handle `z.instanceof`, fall back to `z.object({ aborted: z.boolean() })` as a structural approximation.
- `npm run check` runs `sync-version` first — don't accidentally bump version; it reads from `package.json`.
- `generate-types.js` uses named imports from `schemas.js` and has an explicit `typeMappings` array — removing schemas requires updating **both** the import and the array (Task 6, Steps 1-2).
- The `logDebug` call in Task 1 must use the same `[OpenVault]` prefix that the logging utility adds automatically — do NOT add `[BM25-DEBUG]` to the message string since `logDebug` already prefixes with `[OpenVault]`.
