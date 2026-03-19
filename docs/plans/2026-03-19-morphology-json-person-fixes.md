# Russian Morphology, JSON Parsing, and PERSON Classification Implementation Plan

**Goal:** Fix three diagnosed failure modes in entity merging, JSON parsing, and prompt classification.
**Architecture:** Three isolated patches to existing functions with TDD red-green cycle.
**Tech Stack:** JavaScript (ES modules), Vitest, Snowball stemmers

---

## File Structure Overview

| Action | Path | Description |
|--------|------|-------------|
| Modify | `src/graph/graph.js` | Add stem-first check, raise LCS threshold |
| Modify | `tests/graph/token-overlap.test.js` | Add tests for Russian morphology cases |
| Modify | `src/utils/text.js` | Add multi-line `+` regex patterns |
| Modify | `tests/utils/text.test.js` | Add tests for multi-line concatenation |
| Modify | `src/prompts/graph/rules.js` | Extend PERSON definition |
| Modify | `tests/prompts/graph/rules.test.js` | Add test for persona classification |

---

### Task 1: Add Tests for Russian Morphology False Negatives

**Files:**
- Modify: `tests/graph/token-overlap.test.js`

**Purpose:**
Test that Russian diminutives and inflected forms merge via stem equality, and that false positives are blocked by stricter LCS threshold.

**Common Pitfalls:**
- The `stemWord` function is already imported in `graph.js` — no new imports needed
- Russian stems for `плетка`/`плеточка` should both resolve to `плетк`
- LCS threshold changes from 0.7 to 0.85 for long words (>4 chars)

- [ ] Step 1: Add failing tests for stem-first merge

Add these tests to `tests/graph/token-overlap.test.js`:

```javascript
    // === TASK 1: Russian morphology stem-first tests ===

    it('should merge Russian diminutives via stem equality (плетка/плеточка)', () => {
        // Same root "плетк" — stems match exactly
        const tokensA = new Set(['плетка']);
        const tokensB = new Set(['плеточка']);
        expect(hasSufficientTokenOverlap(tokensA, tokensB, 0.6, 'плетка', 'плеточка')).toBe(true);
    });

    it('should merge Russian singular/plural via stem equality (ошейник/ошейники)', () => {
        // Same stem — should merge immediately
        const tokensA = new Set(['ошейник']);
        const tokensB = new Set(['ошейники']);
        expect(hasSufficientTokenOverlap(tokensA, tokensB, 0.6, 'ошейник', 'ошейники')).toBe(true);
    });

    it('should NOT merge false positives blocked by stricter LCS (таблеточки/плеточка)', () => {
        // Different roots, shared suffix "леточк" (6 chars)
        // With LCS threshold 0.85, 6/9 = 0.67 < 0.85 → blocked
        const tokensA = new Set(['таблеточки']);
        const tokensB = new Set(['плеточка']);
        expect(hasSufficientTokenOverlap(tokensA, tokensB, 0.6, 'таблеточки', 'плеточка')).toBe(false);
    });

    it('should still merge true positives via LCS at 0.85 (свечи/свеча)', () => {
        // LCS "свеч" = 4 chars, minLen = 5, ratio = 0.8
        // Wait, 0.8 < 0.85 — this should now FAIL at LCS level
        // But stems should match: "свеч" for both
        const tokensA = new Set(['свечи']);
        const tokensB = new Set(['свеча']);
        expect(hasSufficientTokenOverlap(tokensA, tokensB, 0.6, 'свечи', 'свеча')).toBe(true);
    });

    it('should still merge верёвки/верёвка via stem or LCS', () => {
        // LCS "верёвк" = 6 chars, minLen = 7, ratio = 0.86 >= 0.85
        const tokensA = new Set(['верёвки']);
        const tokensB = new Set(['верёвка']);
        expect(hasSufficientTokenOverlap(tokensA, tokensB, 0.6, 'верёвки', 'верёвка')).toBe(true);
    });
```

- [ ] Step 2: Run tests to verify they fail

Run: `npm run test:run tests/graph/token-overlap.test.js`
Expected: 2+ tests FAIL (stem-first check not implemented, LCS threshold not raised)

- [ ] Step 3: Commit failing tests

```bash
git add -A && git commit -m "test: add failing tests for Russian morphology fix"
```

---

### Task 2: Implement Russian Morphology Fix

**Files:**
- Modify: `src/graph/graph.js`

**Purpose:**
Reorder `hasSufficientTokenOverlap()` to check stem equality first, and raise LCS threshold to 0.85 for long words.

- [ ] Step 1: Write the implementation

In `src/graph/graph.js`, find the `hasSufficientTokenOverlap` function (around line 248) and replace it:

```javascript
export function hasSufficientTokenOverlap(tokensA, tokensB, minOverlapRatio = 0.5, keyA = '', keyB = '') {
    // 1. NEW: Stem equality — immediate merge for morphological variants
    if (keyA && keyB) {
        const stemA = stemWord(keyA);
        const stemB = stemWord(keyB);
        if (stemA && stemB && stemA === stemB) return true;
    }

    // Helper: find longest common substring
    function longestCommonSubstring(a, b) {
        const longest = [0, 0];
        for (let i = 0; i < a.length; i++) {
            for (let j = 0; j < b.length; j++) {
                let k = 0;
                while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) {
                    k++;
                }
                if (k > longest[0]) longest[0] = k;
            }
        }
        return longest[0];
    }

    // 2. Direct substring containment
    if (keyA && keyB && (keyA.includes(keyB) || keyB.includes(keyA))) {
        return true;
    }

    // 3. LCS check — RAISED threshold to prevent suffix collisions
    if (keyA && keyB && keyA.length > 2 && keyB.length > 2) {
        const commonLen = longestCommonSubstring(keyA, keyB);
        const minLen = Math.min(keyA.length, keyB.length);
        const shortKeys = keyA.length <= 4 && keyB.length <= 4;
        const minAbsLen = shortKeys ? 2 : 4;
        const minRatio = shortKeys ? 0.6 : 0.85; // Changed from 0.7 to 0.85

        if (commonLen >= minAbsLen && commonLen / minLen >= minRatio) {
            return true;
        }
    }

    // 4. Token overlap with stopwords
    const significantA = new Set([...tokensA].filter((t) => !ALL_STOPWORDS.has(t.toLowerCase())));
    const significantB = new Set([...tokensB].filter((t) => !ALL_STOPWORDS.has(t.toLowerCase())));

    if (significantA.size === 0 || significantB.size === 0) {
        return false;
    }

    let overlapCount = 0;
    for (const token of significantA) {
        if (significantB.has(token)) {
            overlapCount++;
        }
    }

    const minSize = Math.min(significantA.size, significantB.size);
    const overlapRatio = overlapCount / minSize;

    // 5. Stem-based comparison (catches Russian morphological variants)
    const stemmedA = new Set([...significantA].map((t) => stemWord(t)).filter((s) => s.length >= 2));
    const stemmedB = new Set([...significantB].map((t) => stemWord(t)).filter((s) => s.length >= 2));
    if (stemmedA.size > 0 && stemmedB.size > 0) {
        let stemOverlap = 0;
        for (const s of stemmedA) {
            if (stemmedB.has(s)) stemOverlap++;
        }
        if (stemOverlap / Math.min(stemmedA.size, stemmedB.size) >= minOverlapRatio) {
            return true;
        }
    }

    return overlapRatio >= minOverlapRatio;
}
```

- [ ] Step 2: Run tests to verify they pass

Run: `npm run test:run tests/graph/token-overlap.test.js`
Expected: All tests PASS

- [ ] Step 3: Commit

```bash
git add -A && git commit -m "fix(graph): stem-first merge and stricter LCS for Russian morphology"
```

---

### Task 3: Add Tests for Multi-Line JSON Concatenation

**Files:**
- Modify: `tests/utils/text.test.js`

**Purpose:**
Test that `safeParseJSON` handles LLM-generated multi-line string concatenation with `+` symbols.

- [ ] Step 1: Add failing tests

Add these tests to `tests/utils/text.test.js` inside the `safeParseJSON` describe block:

```javascript
    // === TASK 3: Multi-line concatenation tests ===

    it('fixes string concatenation across multiple newlines with + on separate line', () => {
        const input = '{"events": [{"summary": "Alice walked "\n+\n"to the garden"}]}';
        const result = safeParseJSON(input);
        expect(result.events[0].summary).toBe('Alice walked to the garden');
    });

    it('fixes string concatenation with + stranded between multiple blank lines', () => {
        const input = '{"text": "start"\n\n+\n\n"end"}';
        const result = safeParseJSON(input);
        expect(result.text).toBe('startend');
    });

    it('fixes concatenation with CRLF line endings', () => {
        const input = '{"text": "hello"\r\n+\r\n"world"}';
        const result = safeParseJSON(input);
        expect(result.text).toBe('helloworld');
    });

    it('handles mixed concatenation patterns in same input', () => {
        const input = '{"a": "simple " + "case", "b": "multi"\n+\n"line"}';
        const result = safeParseJSON(input);
        expect(result.a).toBe('simple case');
        expect(result.b).toBe('multiline');
    });
```

- [ ] Step 2: Run tests to verify they fail

Run: `npm run test:run tests/utils/text.test.js`
Expected: 3-4 tests FAIL (multi-line patterns not handled)

- [ ] Step 3: Commit failing tests

```bash
git add -A && git commit -m "test: add failing tests for multi-line JSON concatenation"
```

---

### Task 4: Implement Multi-Line JSON Concatenation Fix

**Files:**
- Modify: `src/utils/text.js`

**Purpose:**
Add two regex patterns to catch `+` symbols stranded across multiple newlines.

- [ ] Step 1: Write the implementation

In `src/utils/text.js`, find the `safeParseJSON` function. After the existing step 1 comment, add the new patterns:

```javascript
// --- LLM SYNTAX HALLUCINATION SANITIZER ---

// 1. Mid-string concatenation across newlines: "text" +\n "more" -> "textmore"
cleanedInput = cleanedInput.replace(/(?<!\\)(["'])\s*[+＋]\s*(?:\r?\n)?\s*(?<!\\)(["'])/g, '');

// 1.5 NEW: Catch rogue '+' symbols stranded across multiple newlines
cleanedInput = cleanedInput.replace(/(["'])\s*(?:\r?\n)+\s*[+＋]\s*(?:\r?\n)+\s*(["'])/g, '$1$2');
cleanedInput = cleanedInput.replace(/(["'])\s*(?:\r?\n)+\s*[+＋]\s*(["'])/g, '$1$2');

// 2. Dangling plus before punctuation/newlines: "text" + , -> "text" ,
```

- [ ] Step 2: Run tests to verify they pass

Run: `npm run test:run tests/utils/text.test.js`
Expected: All tests PASS

- [ ] Step 3: Commit

```bash
git add -A && git commit -m "fix(json): handle multi-line string concatenation hallucinations"
```

---

### Task 5: Update PERSON Classification Rule

**Files:**
- Modify: `src/prompts/graph/rules.js`
- Modify: `tests/prompts/graph/rules.test.js`

**Purpose:**
Extend the PERSON definition to include fictional identities (personas, alter-egos, avatars).

- [ ] Step 1: Add test for updated PERSON definition

Add to `tests/prompts/graph/rules.test.js`:

```javascript
    it('should include fictional identities in PERSON definition', () => {
        expect(GRAPH_RULES).toContain('PERSON:');
        expect(GRAPH_RULES).toContain('fictional identities presented as characters');
        expect(GRAPH_RULES).toContain('personas');
        expect(GRAPH_RULES).toContain('alter-egos');
        expect(GRAPH_RULES).toContain('avatars');
    });
```

- [ ] Step 2: Run test to verify it fails

Run: `npm run test:run tests/prompts/graph/rules.test.js`
Expected: 1 test FAIL (new content not in rules)

- [ ] Step 3: Update the PERSON definition

In `src/prompts/graph/rules.js`, update the `GRAPH_RULES` constant:

```javascript
export const GRAPH_RULES = `Extract named entities mentioned or clearly implied in the messages. Focus on NEW entities or CHANGES to existing ones:
- PERSON: Named characters, NPCs, people mentioned by name, and fictional identities presented as characters (includes personas, alter-egos, avatars)
- PLACE: Named locations, buildings, rooms, cities, regions
- ORGANIZATION: Named groups, factions, guilds, companies
- OBJECT: Highly significant unique items, weapons, or plot devices. Do NOT extract mundane furniture, clothing, or food unless they are critical to the scene's dynamic
- CONCEPT: Named abilities, spells, diseases, prophecies

Also extract relationships between pairs of entities when the connection is stated or clearly implied. Do NOT re-describe existing static relationships unless a specific progression or change occurred in this batch.

IMPORTANT: Extract entities and relationships even when no events are extracted. Entity data builds world knowledge over time and is always valuable. Limit output to the most significant updates per batch.

<thinking_process>
Follow these steps IN ORDER. Write your work inside <tool_call> tags BEFORE outputting the JSON:

Step 1: Entity scan — List every named entity mentioned or implied. Include type (PERSON, PLACE, ORGANIZATION, OBJECT, CONCEPT).
Step 2: Type validation — Verify each entity type against the allowed set. Skip mundane objects unless plot-critical.
Step 3: Relationship map — For each entity pair with a stated or implied connection, note the direction and nature.
Step 4: Output — Count entities and relationships, then produce the final JSON.
</thinking_process>`;
```

- [ ] Step 4: Run tests to verify they pass

Run: `npm run test:run tests/prompts/graph/rules.test.js`
Expected: All tests PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat(prompts): extend PERSON definition to include personas and alter-egos"
```

---

### Task 6: Run Full Test Suite and Final Commit

**Files:**
- None (verification only)

**Purpose:**
Ensure all changes work together and no regressions introduced.

- [ ] Step 1: Run full test suite

Run: `npm run test:run`
Expected: All tests PASS

- [ ] Step 2: Verify no lint errors

Run: `npm run lint`
Expected: No errors

- [ ] Step 3: Final commit (if any uncommitted changes)

```bash
git add -A && git commit -m "chore: final verification for morphology, JSON, PERSON fixes"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add failing tests for Russian morphology | `tests/graph/token-overlap.test.js` |
| 2 | Implement stem-first merge + stricter LCS | `src/graph/graph.js` |
| 3 | Add failing tests for multi-line JSON | `tests/utils/text.test.js` |
| 4 | Implement multi-line `+` patterns | `src/utils/text.js` |
| 5 | Update PERSON definition + test | `src/prompts/graph/rules.js`, `tests/prompts/graph/rules.test.js` |
| 6 | Full test suite verification | None |