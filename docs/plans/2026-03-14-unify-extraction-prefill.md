# Unify Extraction Prefill Implementation Plan

**Goal:** Extend the `extractionPrefill` setting to ALL 6 LLM prompt types, with strict prefill parameter validation (no fallback) and schema updates allowing optional `<thinking>` tags.

**Architecture:** Prompt builders in `src/prompts/index.js` are pure functions that construct message arrays. Each builder uses `buildMessages()` to assemble system/user/assistant messages. Callers in extraction, reflection, graph, and communities modules resolve settings and pass prefill explicitly.

**Tech Stack:** JavaScript (ES modules), Vitest for testing, SillyTavern extension environment.

---

## File Structure

**Modified:**
- `src/prompts/index.js` — 5 schema updates, 5 builder signature changes
- `src/extraction/extract.js` — Verify prefill threading to graph extraction
- `src/reflection/reflect.js` — Import resolver, pass prefill
- `src/graph/consolidation.js` — Import resolver, pass prefill
- `src/communities/communities.js` — Import resolver, pass prefill (2 prompts)
- `src/prompts/examples/graph.js` — Add think-then-JSON examples
- `src/prompts/examples/reflections.js` — Add think-then-JSON examples
- `src/prompts/examples/communities.js` — Add think-then-JSON examples
- `src/prompts/examples/global-synthesis.js` — Add think-then-JSON examples
- `src/prompts/examples/insights.js` — Add think-then-JSON examples
- `src/prompts/examples/questions.js` — Add think-then-JSON examples
- `tests/prompts.test.js` — Update tests for new signatures

---

### Task 1: Update GRAPH_SCHEMA to Allow Think Tags

**Files:**
- Modify: `src/prompts/index.js`
- Test: `tests/prompts.test.js`

**Step 1:** Write failing test

Add to `tests/prompts.test.js`:
```javascript
describe('GRAPH_SCHEMA think tag support', () => {
    it('allows think tags before JSON', () => {
        const result = buildGraphExtractionPrompt({
            messages: '[A]: test',
            names: { char: 'A', user: 'B' },
        });
        const sys = result[0].content;
        expect(sys).toContain('You MAY use <thinking> tags');
        expect(sys).toContain('JSON object must still be valid');
    });
});
```

**Step 2:** Run test to verify it fails

```bash
npm test -- tests/prompts.test.js -t "allows think tags before JSON"
```

Expected: FAIL with "expected … toContain …"

**Step 3:** Update GRAPH_SCHEMA

In `src/prompts/index.js`, change Rule 5 in `GRAPH_SCHEMA`:

From:
```javascript
5. Do NOT include ANY text outside the JSON object.
```

To:
```javascript
5. You MAY use <thinking> tags for reasoning before providing the JSON.
   The JSON object must still be valid and parseable.
```

**Step 4:** Run test to verify it passes

```bash
npm test -- tests/prompts.test.js -t "allows think tags before JSON"
```

Expected: PASS

**Step 5:** Commit

```bash
git add -A && git commit -m "feat: update GRAPH_SCHEMA to allow think tags"
```

---

### Task 2: Update CONSOLIDATION_SCHEMA to Allow Think Tags

**Files:**
- Modify: `src/prompts/index.js`
- Test: `tests/prompts.test.js`

**Step 1:** Write failing test

Add to `tests/prompts.test.js`:
```javascript
describe('CONSOLIDATION_SCHEMA think tag support', () => {
    it('allows think tags before JSON', () => {
        const edge = { source: 'A', target: 'B', description: 'Test', weight: 1 };
        const result = buildEdgeConsolidationPrompt(edge);
        const sys = result[0].content;
        expect(sys).toContain('You MAY use <thinking> tags');
    });
});
```

**Step 2:** Run test

```bash
npm test -- tests/prompts.test.js -t "CONSOLIDATION_SCHEMA"
```

Expected: FAIL

**Step 3:** Update CONSOLIDATION_SCHEMA Rule 4

Change from:
```
4. Do NOT include ANY text outside the JSON object.
```

To:
```
4. You MAY use <thinking> tags for reasoning before providing the JSON.
   The JSON object must still be valid and parseable.
```

**Step 4:** Run test

```bash
npm test -- tests/prompts.test.js -t "CONSOLIDATION_SCHEMA"
```

Expected: PASS

**Step 5:** Commit

```bash
git add -A && git commit -m "feat: update CONSOLIDATION_SCHEMA to allow think tags"
```

---

### Task 3: Update UNIFIED_REFLECTION_SCHEMA to Allow Think Tags

**Files:**
- Modify: `src/prompts/index.js`
- Test: `tests/prompts.test.js`

**Step 1:** Write failing test

```javascript
describe('UNIFIED_REFLECTION_SCHEMA think tag support', () => {
    it('allows think tags before JSON', () => {
        const result = buildUnifiedReflectionPrompt('Alice', [], 'auto', 'auto');
        const sys = result[0].content;
        expect(sys).toContain('You MAY use <thinking> tags');
    });
});
```

**Step 2:** Run test

```bash
npm test -- tests/prompts.test.js -t "UNIFIED_REFLECTION_SCHEMA"
```

Expected: FAIL

**Step 3:** Update UNIFIED_REFLECTION_SCHEMA Rule 5

Change from:
```
5. Do NOT include ANY text outside the JSON object.
```

To:
```
5. You MAY use <thinking> tags for reasoning before providing the JSON.
   The JSON object must still be valid and parseable.
```

**Step 4:** Run test

```bash
npm test -- tests/prompts.test.js -t "UNIFIED_REFLECTION_SCHEMA"
```

Expected: PASS

**Step 5:** Commit

```bash
git add -A && git commit -m "feat: update UNIFIED_REFLECTION_SCHEMA to allow think tags"
```

---

### Task 4: Update COMMUNITY_SCHEMA to Allow Think Tags

**Files:**
- Modify: `src/prompts/index.js`
- Test: `tests/prompts.test.js`

**Step 1:** Write failing test

```javascript
describe('COMMUNITY_SCHEMA think tag support', () => {
    it('allows think tags before JSON', () => {
        const result = buildCommunitySummaryPrompt(['- Node'], ['- Edge']);
        const sys = result[0].content;
        expect(sys).toContain('You MAY use <thinking> tags');
    });
});
```

**Step 2:** Run test

```bash
npm test -- tests/prompts.test.js -t "COMMUNITY_SCHEMA"
```

Expected: FAIL

**Step 3:** Update COMMUNITY_SCHEMA Rule 6

Change from:
```
6. Do NOT include ANY text outside the JSON object.
```

To:
```
6. You MAY use <thinking> tags for reasoning before providing the JSON.
   The JSON object must still be valid and parseable.
```

**Step 4:** Run test

```bash
npm test -- tests/prompts.test.js -t "COMMUNITY_SCHEMA"
```

Expected: PASS

**Step 5:** Commit

```bash
git add -A && git commit -m "feat: update COMMUNITY_SCHEMA to allow think tags"
```

---

### Task 5: Update GLOBAL_SYNTHESIS_SCHEMA to Allow Think Tags

**Files:**
- Modify: `src/prompts/index.js`
- Test: `tests/prompts.test.js`

**Step 1:** Write failing test

```javascript
describe('GLOBAL_SYNTHESIS_SCHEMA think tag support', () => {
    it('allows think tags before JSON', () => {
        const result = buildGlobalSynthesisPrompt([{ title: 'C1', summary: 'S1' }], 'auto', 'auto');
        const sys = result[0].content;
        expect(sys).toContain('You MAY use <thinking> tags');
    });
});
```

**Step 2:** Run test

```bash
npm test -- tests/prompts.test.js -t "GLOBAL_SYNTHESIS_SCHEMA"
```

Expected: FAIL

**Step 3:** Update GLOBAL_SYNTHESIS_SCHEMA Rule 4

Change from:
```
4. Do NOT include ANY text outside the JSON object.
```

To:
```
4. You MAY use <thinking> tags for reasoning before providing the JSON.
   The JSON object must still be valid and parseable.
```

**Step 4:** Run test

```bash
npm test -- tests/prompts.test.js -t "GLOBAL_SYNTHESIS_SCHEMA"
```

Expected: PASS

**Step 5:** Commit

```bash
git add -A && git commit -m "feat: update GLOBAL_SYNTHESIS_SCHEMA to allow think tags"
```

---

### Task 6: Add Prefill Parameter to buildGraphExtractionPrompt

**Files:**
- Modify: `src/prompts/index.js`
- Modify: `src/extraction/extract.js`
- Test: `tests/prompts.test.js`

**Step 1:** Write failing test

```javascript
describe('buildGraphExtractionPrompt prefill parameter', () => {
    it('throws when prefill is missing', () => {
        expect(() => buildGraphExtractionPrompt({
            messages: '[A]: test',
            names: { char: 'A', user: 'B' },
        })).toThrow('prefill is required');
    });

    it('throws when prefill is empty string', () => {
        expect(() => buildGraphExtractionPrompt({
            messages: '[A]: test',
            names: { char: 'A', user: 'B' },
            prefill: '',
        })).toThrow('prefill is required');
    });

    it('uses provided prefill in assistant message', () => {
        const result = buildGraphExtractionPrompt({
            messages: '[A]: test',
            names: { char: 'A', user: 'B' },
            prefill: '<thinking>',
        });
        expect(result[2].content).toBe('<thinking>');
    });
});
```

**Step 2:** Run test

```bash
npm test -- tests/prompts.test.js -t "buildGraphExtractionPrompt prefill"
```

Expected: FAIL (doesn't throw yet)

**Step 3:** Update buildGraphExtractionPrompt signature

In `src/prompts/index.js`, change function signature and add validation:

```javascript
export function buildGraphExtractionPrompt({
    messages,
    names,
    extractedEvents = [],
    context = {},
    preamble,
    prefill,  // ADD THIS
    outputLanguage = 'auto',
}) {
    // ADD VALIDATION
    if (!prefill) {
        throw new Error('buildGraphExtractionPrompt: prefill is required');
    }
    // ... existing code ...
    return buildMessages(systemPrompt, userPrompt, prefill, preamble);  // CHANGE FROM '{'
}
```

**Step 4:** Update caller in extract.js

In `src/extraction/extract.js`, find the call to `buildGraphExtractionPrompt` and ensure `prefill` is passed:

```javascript
// Find where prefill is resolved (already done for event extraction)
const prefill = resolveExtractionPrefill(settings);

// Update the call:
const messages = buildGraphExtractionPrompt({
    messages: formattedMessages,
    names,
    extractedEvents,
    context,
    preamble,
    prefill,  // ADD THIS
    outputLanguage,
});
```

**Step 5:** Run test

```bash
npm test -- tests/prompts.test.js -t "buildGraphExtractionPrompt prefill"
```

Expected: PASS

**Step 6:** Commit

```bash
git add -A && git commit -m "feat: add required prefill parameter to buildGraphExtractionPrompt"
```

---

### Task 7: Add Prefill Parameter to buildUnifiedReflectionPrompt

**Files:**
- Modify: `src/prompts/index.js`
- Modify: `src/reflection/reflect.js`
- Test: `tests/prompts.test.js`

**Step 1:** Write failing test

```javascript
describe('buildUnifiedReflectionPrompt prefill parameter', () => {
    it('throws when prefill is missing', () => {
        expect(() => buildUnifiedReflectionPrompt('Alice', [], 'auto', 'auto'))
            .toThrow('prefill is required');
    });

    it('throws when prefill is empty string', () => {
        expect(() => buildUnifiedReflectionPrompt('Alice', [], 'auto', 'auto', ''))
            .toThrow('prefill is required');
    });

    it('uses provided prefill in assistant message', () => {
        const result = buildUnifiedReflectionPrompt('Alice', [], 'auto', 'auto', '<thinking>');
        expect(result[2].content).toBe('<thinking>');
    });
});
```

**Step 2:** Run test

```bash
npm test -- tests/prompts.test.js -t "buildUnifiedReflectionPrompt prefill"
```

Expected: FAIL

**Step 3:** Update buildUnifiedReflectionPrompt signature

```javascript
export function buildUnifiedReflectionPrompt(
    characterName,
    recentMemories,
    preamble,
    outputLanguage = 'auto',
    prefill  // ADD THIS PARAMETER
) {
    // ADD VALIDATION
    if (!prefill) {
        throw new Error('buildUnifiedReflectionPrompt: prefill is required');
    }
    // ... existing code ...
    return buildMessages(systemPrompt, userPrompt, prefill, preamble);  // CHANGE FROM '{'
}
```

**Step 4:** Update caller in reflect.js

In `src/reflection/reflect.js`:

```javascript
// At top of file, import resolveExtractionPrefill
import { resolveExtractionPrefill } from '../prompts/preambles.js';

// Find the function that calls buildUnifiedReflectionPrompt
// Add before the call:
const settings = getExtensionSettings();  // or however settings are accessed
const prefill = resolveExtractionPrefill(settings);

// Update the call:
const messages = buildUnifiedReflectionPrompt(
    characterName,
    recentMemories,
    preamble,
    outputLanguage,
    prefill  // ADD THIS
);
```

**Step 5:** Run test

```bash
npm test -- tests/prompts.test.js -t "buildUnifiedReflectionPrompt prefill"
```

Expected: PASS

**Step 6:** Commit

```bash
git add -A && git commit -m "feat: add required prefill parameter to buildUnifiedReflectionPrompt"
```

---

### Task 8: Add Prefill Parameter to buildEdgeConsolidationPrompt

**Files:**
- Modify: `src/prompts/index.js`
- Modify: `src/graph/consolidation.js`
- Test: `tests/prompts.test.js`

**Step 1:** Write failing test

```javascript
describe('buildEdgeConsolidationPrompt prefill parameter', () => {
    it('throws when prefill is missing', () => {
        const edge = { source: 'A', target: 'B', description: 'Test', weight: 1 };
        expect(() => buildEdgeConsolidationPrompt(edge))
            .toThrow('prefill is required');
    });

    it('throws when prefill is empty string', () => {
        const edge = { source: 'A', target: 'B', description: 'Test', weight: 1 };
        expect(() => buildEdgeConsolidationPrompt(edge, 'auto', 'auto', ''))
            .toThrow('prefill is required');
    });

    it('uses provided prefill in assistant message', () => {
        const edge = { source: 'A', target: 'B', description: 'Test', weight: 1 };
        const result = buildEdgeConsolidationPrompt(edge, 'auto', 'auto', '<thinking>');
        expect(result[2].content).toBe('<thinking>');
    });
});
```

**Step 2:** Run test

```bash
npm test -- tests/prompts.test.js -t "buildEdgeConsolidationPrompt prefill"
```

Expected: FAIL

**Step 3:** Update buildEdgeConsolidationPrompt signature

```javascript
export function buildEdgeConsolidationPrompt(
    edgeData,
    preamble,
    outputLanguage = 'auto',
    prefill  // ADD THIS PARAMETER
) {
    // ADD VALIDATION
    if (!prefill) {
        throw new Error('buildEdgeConsolidationPrompt: prefill is required');
    }
    // ... existing code ...
    return buildMessages(systemPrompt, userPrompt, prefill, preamble);  // CHANGE FROM '{'
}
```

**Step 4:** Update caller in consolidation.js

In `src/graph/consolidation.js`:

```javascript
// At top of file, import resolveExtractionPrefill
import { resolveExtractionPrefill } from '../prompts/preambles.js';

// In consolidateEdges function:
const settings = getExtensionSettings();  // or similar
const prefill = resolveExtractionPrefill(settings);

// Update the call to buildEdgeConsolidationPrompt:
const messages = buildEdgeConsolidationPrompt(
    edgeData,
    preamble,
    outputLanguage,
    prefill  // ADD THIS
);
```

**Step 5:** Run test

```bash
npm test -- tests/prompts.test.js -t "buildEdgeConsolidationPrompt prefill"
```

Expected: PASS

**Step 6:** Commit

```bash
git add -A && git commit -m "feat: add required prefill parameter to buildEdgeConsolidationPrompt"
```

---

### Task 9: Add Prefill Parameter to buildCommunitySummaryPrompt

**Files:**
- Modify: `src/prompts/index.js`
- Modify: `src/communities/communities.js`
- Test: `tests/prompts.test.js`

**Step 1:** Write failing test

```javascript
describe('buildCommunitySummaryPrompt prefill parameter', () => {
    it('throws when prefill is missing', () => {
        expect(() => buildCommunitySummaryPrompt(['- Node'], ['- Edge']))
            .toThrow('prefill is required');
    });

    it('throws when prefill is empty string', () => {
        expect(() => buildCommunitySummaryPrompt(['- Node'], ['- Edge'], 'auto', 'auto', ''))
            .toThrow('prefill is required');
    });

    it('uses provided prefill in assistant message', () => {
        const result = buildCommunitySummaryPrompt(['- Node'], ['- Edge'], 'auto', 'auto', '<thinking>');
        expect(result[2].content).toBe('<thinking>');
    });
});
```

**Step 2:** Run test

```bash
npm test -- tests/prompts.test.js -t "buildCommunitySummaryPrompt prefill"
```

Expected: FAIL

**Step 3:** Update buildCommunitySummaryPrompt signature

```javascript
export function buildCommunitySummaryPrompt(
    nodeLines,
    edgeLines,
    preamble,
    outputLanguage = 'auto',
    prefill  // ADD THIS PARAMETER
) {
    // ADD VALIDATION
    if (!prefill) {
        throw new Error('buildCommunitySummaryPrompt: prefill is required');
    }
    // ... existing code ...
    return buildMessages(systemPrompt, userPrompt, prefill, preamble);  // CHANGE FROM '{'
}
```

**Step 4:** Update caller in communities.js

In `src/communities/communities.js`:

```javascript
// At top of file, import resolveExtractionPrefill
import { resolveExtractionPrefill } from '../prompts/preambles.js';

// In updateCommunitySummaries function:
const settings = getExtensionSettings();  // or similar
const prefill = resolveExtractionPrefill(settings);

// Update the call:
const messages = buildCommunitySummaryPrompt(
    nodeLines,
    edgeLines,
    preamble,
    outputLanguage,
    prefill  // ADD THIS
);
```

**Step 5:** Run test

```bash
npm test -- tests/prompts.test.js -t "buildCommunitySummaryPrompt prefill"
```

Expected: PASS

**Step 6:** Commit

```bash
git add -A && git commit -m "feat: add required prefill parameter to buildCommunitySummaryPrompt"
```

---

### Task 10: Add Prefill Parameter to buildGlobalSynthesisPrompt

**Files:**
- Modify: `src/prompts/index.js`
- Modify: `src/communities/communities.js`
- Test: `tests/prompts.test.js`

**Step 1:** Write failing test

```javascript
describe('buildGlobalSynthesisPrompt prefill parameter', () => {
    it('throws when prefill is missing', () => {
        expect(() => buildGlobalSynthesisPrompt([{ title: 'C1', summary: 'S1' }], 'auto', 'auto'))
            .toThrow('prefill is required');
    });

    it('throws when prefill is empty string', () => {
        expect(() => buildGlobalSynthesisPrompt([{ title: 'C1', summary: 'S1' }], 'auto', 'auto', ''))
            .toThrow('prefill is required');
    });

    it('uses provided prefill in assistant message', () => {
        const result = buildGlobalSynthesisPrompt([{ title: 'C1', summary: 'S1' }], 'auto', 'auto', '<thinking>');
        expect(result[2].content).toBe('<thinking>');
    });
});
```

**Step 2:** Run test

```bash
npm test -- tests/prompts.test.js -t "buildGlobalSynthesisPrompt prefill"
```

Expected: FAIL

**Step 3:** Update buildGlobalSynthesisPrompt signature

```javascript
export function buildGlobalSynthesisPrompt(
    communities,
    preamble,
    outputLanguage = 'auto',
    prefill  // ADD THIS PARAMETER
) {
    // ADD VALIDATION
    if (!prefill) {
        throw new Error('buildGlobalSynthesisPrompt: prefill is required');
    }
    // ... existing code ...
    return buildMessages(systemPrompt, userPrompt, prefill, preamble);  // CHANGE FROM '{'
}
```

**Step 4:** Update caller in communities.js

In `src/communities/communities.js`:

```javascript
// In generateGlobalWorldState function (or wherever buildGlobalSynthesisPrompt is called):
const settings = getExtensionSettings();
const prefill = resolveExtractionPrefill(settings);

// Update the call:
const messages = buildGlobalSynthesisPrompt(
    communities,
    preamble,
    outputLanguage,
    prefill  // ADD THIS
);
```

**Step 5:** Run test

```bash
npm test -- tests/prompts.test.js -t "buildGlobalSynthesisPrompt prefill"
```

Expected: PASS

**Step 6:** Commit

```bash
git add -A && git commit -m "feat: add required prefill parameter to buildGlobalSynthesisPrompt"
```

---

### Task 11: Update Example Files with Think-Then-JSON Pattern

**Files:**
- Modify: `src/prompts/examples/graph.js`
- Modify: `src/prompts/examples/reflections.js`
- Modify: `src/prompts/examples/communities.js`
- Modify: `src/prompts/examples/global-synthesis.js`
- Modify: `src/prompts/examples/insights.js`
- Modify: `src/prompts/examples/questions.js`
- Test: Corresponding test files

**Step 1:** Read each example file

```bash
cat src/prompts/examples/graph.js
```

**Step 2:** Update GRAPH_EXAMPLES

Add `<thinking>` blocks before each JSON example in `src/prompts/examples/graph.js`:

```javascript
export const GRAPH_EXAMPLES = `<examples>
<example_1>
User: Alice met Bob at the tavern. They discussed the dragon threat.

Assistant:
<thinking>
The user mentions two people (Alice and Bob), a location (tavern), and a concept (dragon threat). They have a relationship through meeting.
</thinking>
{"entities":[{"name":"Alice","type":"PERSON","description":"A person who met Bob at the tavern"},{"name":"Bob","type":"PERSON","description":"A person who met Alice at the tavern"},{"name":"tavern","type":"PLACE","description":"A location where Alice and Bob met"},{"name":"dragon threat","type":"CONCEPT","description":"A danger discussed by Alice and Bob"}],"relationships":[{"source":"Alice","target":"Bob","description":"Met at the tavern and discussed the dragon threat"}]}
</example_1>
... (update remaining examples)
</examples>`;
```

**Step 3:** Update remaining example files similarly

For each file:
- `reflections.js` — Add `<thinking>` before JSON in UNIFIED_REFLECTION_EXAMPLES
- `communities.js` — Add `<thinking>` before JSON in COMMUNITY_EXAMPLES
- `global-synthesis.js` — Add `<thinking>` before JSON in GLOBAL_SYNTHESIS_EXAMPLES
- `insights.js` — Add `<thinking>` before JSON in INSIGHT_EXAMPLES
- `questions.js` — Add `<thinking>` before JSON in QUESTION_EXAMPLES

**Step 4:** Run all example tests

```bash
npm test -- tests/prompts/examples/
```

Expected: PASS (tests verify structure, not exact content)

**Step 5:** Commit

```bash
git add -A && git commit -m "feat: add think-then-JSON examples to all prompt types"
```

---

### Task 12: Update Existing Tests for New Prefill Requirement

**Files:**
- Modify: `tests/prompts.test.js`

**Step 1:** Find and update tests that call builders without prefill

Search for calls and update:

```bash
grep -n "buildGraphExtractionPrompt\|buildUnifiedReflectionPrompt\|buildEdgeConsolidationPrompt\|buildCommunitySummaryPrompt\|buildGlobalSynthesisPrompt" tests/prompts.test.js
```

**Step 2:** Update each call to include prefill

Update these tests to pass prefill:

```javascript
// OLD:
const result = buildGraphExtractionPrompt({
    messages: '[A]: test',
    names: { char: 'A', user: 'B' },
});

// NEW:
const result = buildGraphExtractionPrompt({
    messages: '[A]: test',
    names: { char: 'A', user: 'B' },
    prefill: '{',
});
```

Similarly update:
- `buildUnifiedReflectionPrompt('Alice', [], 'auto', 'auto')` → add `, '{'`
- `buildEdgeConsolidationPrompt(edge)` → add `, 'auto', 'auto', '{'`
- `buildCommunitySummaryPrompt(['- Node'], ['- Edge'])` → add `, 'auto', 'auto', '{'`
- `buildGlobalSynthesisPrompt([...], 'auto', 'auto')` → add `, '{'`

**Step 3:** Run all prompts tests

```bash
npm test -- tests/prompts.test.js
```

Expected: PASS

**Step 4:** Commit

```bash
git add -A && git commit -m "test: update prompts tests to pass required prefill parameter"
```

---

### Task 13: Update Non-Think Prefill Tests

**Files:**
- Modify: `tests/prompts.test.js`

**Step 1:** Update the existing "non-think prompts prefill assistant with JSON opener" test

Change from:
```javascript
it('non-think prompts prefill assistant with JSON opener', () => {
    const graphResult = buildGraphExtractionPrompt({
        messages: '[A]: test',
        names: { char: 'A', user: 'B' },
    });
    // ...
    for (const result of [graphResult, communityResult]) {
        expect(result[2].role).toBe('assistant');
        expect(result[2].content).toBe('{');
    }
});
```

To:
```javascript
it('non-think prompts use provided prefill', () => {
    const graphResult = buildGraphExtractionPrompt({
        messages: '[A]: test',
        names: { char: 'A', user: 'B' },
        prefill: '{',
    });
    const communityResult = buildCommunitySummaryPrompt(['- Node'], ['- Edge'], 'auto', 'auto', '{');
    // ...
    for (const result of [graphResult, communityResult]) {
        expect(result[2].role).toBe('assistant');
        expect(result[2].content).toBe('{');
    }
});
```

**Step 2:** Run test

```bash
npm test -- tests/prompts.test.js -t "non-think prompts"
```

Expected: PASS

**Step 3:** Commit

```bash
git add -A && git commit -m "test: update non-think prefill tests for new API"
```

---

### Task 14: Run Full Test Suite

**Step 1:** Run all tests

```bash
npm test
```

Expected: ALL PASS

**Step 2:** Fix any failures

If tests fail, fix issues:
- Missing imports
- Wrong parameter order
- Tests not updated

**Step 3:** Final commit

```bash
git add -A && git commit -m "feat: unify extraction prefill across all LLM operations

- Update all 5 non-event schemas to allow optional <thinking> tags
- Add required prefill parameter to all non-event prompt builders
- Update all callers to resolve and pass prefill from settings
- Update all example files with think-then-JSON pattern
- Update all tests for new API signatures
- No fallback: builders throw if prefill is missing or empty"
```

---

## Verification Checklist

- [ ] `GRAPH_SCHEMA` contains "You MAY use <thinking> tags"
- [ ] `CONSOLIDATION_SCHEMA` contains "You MAY use <thinking> tags"
- [ ] `UNIFIED_REFLECTION_SCHEMA` contains "You MAY use <thinking> tags"
- [ ] `COMMUNITY_SCHEMA` contains "You MAY use <thinking> tags"
- [ ] `GLOBAL_SYNTHESIS_SCHEMA` contains "You MAY use <thinking> tags"
- [ ] `buildGraphExtractionPrompt` throws if prefill missing
- [ ] `buildUnifiedReflectionPrompt` throws if prefill missing
- [ ] `buildEdgeConsolidationPrompt` throws if prefill missing
- [ ] `buildCommunitySummaryPrompt` throws if prefill missing
- [ ] `buildGlobalSynthesisPrompt` throws if prefill missing
- [ ] All callers resolve prefill via `resolveExtractionPrefill(settings)`
- [ ] All example files show `<thinking>` before JSON
- [ ] All tests pass
- [ ] No regression in extraction/retrieval pipeline

---

## Success Criteria

1. All 6 prompt types use user-selected prefill
2. All 5 non-event schemas allow optional `<thinking>` tags
3. All prompt builders throw if prefill is missing
4. All example files show think-then-JSON pattern
5. Unit tests pass with strict prefill validation
6. No regression in extraction/retrieval pipeline
