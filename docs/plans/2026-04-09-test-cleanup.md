# Test Suite Cleanup Implementation Plan

**Goal:** Remove ~170 redundant tests and ~17 files from the 1,543-test / 106-file suite.
**Architecture:** Three tiers — (1) delete garbage files that test literal string content, (2) merge duplicate test files, (3) parameterize bloat within large files.
**Tech Stack:** Vitest, no code changes to `src/`

---

### Task 1: Delete garbage prompt-content test files (7 files, ~39 tests)

These assert that prompt strings contain certain phrases. They break on every prompt edit and test nothing behavioral.

- [ ] Step 1: Delete the following files

```bash
rm tests/prompts/events/rules.test.js
rm tests/prompts/graph/rules.test.js
rm tests/prompts/roles.test.js
rm tests/prompts/rules.test.js
rm tests/prompts/schemas.test.js
rm tests/prompts/examples/events-en.test.js
rm tests/prompts/examples/events/ru.test.js
```

- [ ] Step 2: Run tests to confirm nothing else depended on them

Run: `npx vitest run --reporter=verbose 2>&1 | tail -20`
Expected: All tests pass, no import errors from deleted files.

- [ ] Step 3: Commit

```bash
git add -A && git commit -m "chore: delete 7 prompt-content test files (asserted literal strings, not behavior)"
```

### Task 2: Delete garbage UI/CSS/constants test files (4 files, ~13 tests)

- [ ] Step 1: Delete the following files

```bash
rm tests/ui/descriptions.test.js
rm tests/ui/css-classes.test.js
rm tests/constants/settings.test.js
rm tests/unit/settings-ui.test.js
```

- [ ] Step 2: Run tests

Run: `npx vitest run --reporter=verbose 2>&1 | tail -20`
Expected: All tests pass.

- [ ] Step 3: Commit

```bash
git add -A && git commit -m "chore: delete 4 UI/CSS/constants garbage test files"
```

### Task 3: Merge `tests/unit/st-helpers.test.js` into `tests/utils/st-helpers.test.js`

The unit file has 4 tests for `safeSetExtensionPrompt` position parameter behavior. The utils file already tests `safeSetExtensionPrompt` (success/error/custom name/default). Add the missing position-specific tests.

- [ ] Step 1: Read both files to identify unique tests in the unit file

The unit file tests:
- Default position (already covered by utils: "defaults to extensionName when no name provided")
- Position parameter 4-arg call (NOT covered — add)
- Skip when position is CUSTOM (-1) (NOT covered — add)
- Named slots mapping (NOT covered — add)

- [ ] Step 2: Add the 3 missing test cases to `tests/utils/st-helpers.test.js`

In the existing `safeSetExtensionPrompt` describe block in `tests/utils/st-helpers.test.js`, add:

```javascript
it('passes position and depth parameters', () => {
    const mockSetPrompt = vi.fn();
    setDeps({
        console: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
        setExtensionPrompt: mockSetPrompt,
        extension_prompt_types: { IN_PROMPT: 0, AN: 2, CHAT: 4 },
    });

    safeSetExtensionPrompt('test content', 'openvault', 2, 4);
    expect(mockSetPrompt).toHaveBeenCalledWith('openvault', 'test content', 2, 4);
});

it('skips injection when position is CUSTOM (-1)', () => {
    const mockSetPrompt = vi.fn();
    setDeps({
        console: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
        setExtensionPrompt: mockSetPrompt,
        extension_prompt_types: { IN_PROMPT: 0 },
    });

    expect(safeSetExtensionPrompt('test content', 'openvault', -1, 0)).toBe(false);
    expect(mockSetPrompt).not.toHaveBeenCalled();
});

it('maps named slot world position', () => {
    const mockSetPrompt = vi.fn();
    setDeps({
        console: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
        setExtensionPrompt: mockSetPrompt,
        extension_prompt_types: { IN_PROMPT: 0, AN: 2 },
    });

    safeSetExtensionPrompt('world content', 'openvault_world', 1, 0);
    // Position 1 is the named world slot — maps to IN_PROMPT (0)
    expect(mockSetPrompt).toHaveBeenCalledWith('openvault_world', 'world content', 0, 0);
});
```

- [ ] Step 3: Delete the unit file

```bash
rm tests/unit/st-helpers.test.js
```

- [ ] Step 4: Run tests

Run: `npx vitest run tests/utils/st-helpers.test.js --reporter=verbose`
Expected: All tests pass (original + 3 new).

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "chore: merge unit/st-helpers into utils/st-helpers, delete duplicate"
```

### Task 4: Merge `tests/query-context.test.js` into `tests/retrieval/query-context.test.js`

The root file tests `buildBM25Tokens`, `buildEmbeddingQuery`, `extractQueryContext`, `parseRecentMessages`. The retrieval file tests `buildCorpusVocab` and `buildBM25Tokens`. Both test `buildBM25Tokens` from different angles. The root file also has unique tests for `extractQueryContext`, `buildEmbeddingQuery`, and `parseRecentMessages` that need porting.

- [ ] Step 1: Port unique describe blocks from root file into retrieval file

Add these describe blocks to `tests/retrieval/query-context.test.js` (after the existing content, before the closing of the outermost describe or as new top-level describes):

```javascript
describe('extractQueryContext — graph-anchored', () => {
    const queryConfig = {
        entityWindowSize: 10,
        embeddingWindowSize: 5,
        recencyDecayFactor: 0.09,
        topEntitiesCount: 5,
        entityBoostWeight: 5.0,
    };

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
            const result = extractQueryContext(messages, [], graphNodes, queryConfig);
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
            const graphNodes = { sarah: { name: 'Sarah', type: 'PERSON' } };
            const result = extractQueryContext(messages, [], graphNodes, queryConfig);
            expect(result.entities).not.toContain('Запомни');
            expect(result.entities).not.toContain('Держись');
            expect(result.entities).not.toContain('The');
        });

        it('matches Russian inflectional forms via stemming', () => {
            const messages = [{ mes: 'Подошла к Елену и сказала' }, { mes: 'Потом ушла.' }, { mes: 'Вернулась.' }];
            const graphNodes = { елена: { name: 'Елена', type: 'PERSON' } };
            const result = extractQueryContext(messages, [], graphNodes, queryConfig);
            expect(result.entities).toContain('Елена');
        });

        it('matches aliases from merged entities', () => {
            const messages = [{ mes: 'Lily came into the room.' }, { mes: 'She sat down.' }, { mes: 'Nothing else.' }];
            const graphNodes = {
                vova: { name: 'Vova', type: 'PERSON', aliases: ['Vova (aka Lily)'] },
            };
            const result = extractQueryContext(messages, [], graphNodes, queryConfig);
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
            const result = extractQueryContext(messages, ['Elena', 'Viktor'], {}, queryConfig);
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
            const result = extractQueryContext(messages, [], graphNodes, queryConfig);
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
            const result = extractQueryContext(messages, [], graphNodes, queryConfig);
            expect(result.weights.Marcus).toBeGreaterThan(result.weights.Sarah);
        });
    });

    describe('edge cases', () => {
        it('returns empty for null messages', () => {
            const result = extractQueryContext(null, [], {}, queryConfig);
            expect(result.entities).toEqual([]);
            expect(result.weights).toEqual({});
        });

        it('returns empty for empty array', () => {
            const result = extractQueryContext([], [], {}, queryConfig);
            expect(result.entities).toEqual([]);
            expect(result.weights).toEqual({});
        });

        it('handles empty graph gracefully', () => {
            const messages = [{ mes: 'just lowercase text here' }, { mes: 'more words' }, { mes: 'nothing special' }];
            const result = extractQueryContext(messages, [], {}, queryConfig);
            expect(result.entities).toEqual([]);
        });
    });
});

describe('buildEmbeddingQuery', () => {
    const queryConfig = {
        entityWindowSize: 10,
        embeddingWindowSize: 5,
        recencyDecayFactor: 0.09,
        topEntitiesCount: 5,
        entityBoostWeight: 5.0,
    };

    it('concatenates messages without duplication', () => {
        const messages = [{ mes: 'newest message' }, { mes: 'second message' }, { mes: 'third message' }];
        const entities = { entities: [], weights: {} };
        const query = buildEmbeddingQuery(messages, entities, queryConfig);
        expect(query).toContain('newest message');
        expect(query).toContain('second message');
        expect(query).toContain('third message');
        const newestCount = (query.match(/newest message/g) || []).length;
        expect(newestCount).toBe(1);
    });

    it('appends top entities', () => {
        const messages = [{ mes: 'some context' }];
        const entities = { entities: ['Alice', 'Cabin', 'Secret'], weights: { Alice: 2.0, Cabin: 1.5, Secret: 1.0 } };
        const query = buildEmbeddingQuery(messages, entities, queryConfig);
        expect(query).toContain('Alice');
        expect(query).toContain('Cabin');
        expect(query).toContain('Secret');
    });

    it('respects chunk size limit', () => {
        const longMessage = 'word '.repeat(500);
        const messages = [{ mes: longMessage }, { mes: longMessage }, { mes: longMessage }];
        const entities = { entities: ['Entity'], weights: { Entity: 1 } };
        const query = buildEmbeddingQuery(messages, entities, queryConfig);
        expect(query.length).toBeLessThanOrEqual(500);
    });

    it('preserves top entities even when weighted text exceeds chunk size', () => {
        const longMessage = 'word '.repeat(500);
        const messages = [{ mes: longMessage }];
        const entities = { entities: ['Dragon', 'Castle', 'Alice'], weights: {} };
        const query = buildEmbeddingQuery(messages, entities, queryConfig);
        expect(query.length).toBeLessThanOrEqual(500);
        expect(query).toContain('Dragon');
        expect(query).toContain('Castle');
        expect(query).toContain('Alice');
    });

    it('handles empty messages', () => {
        const query = buildEmbeddingQuery([], { entities: [], weights: {} }, queryConfig);
        expect(query).toBe('');
    });

    it('handles null entities', () => {
        const messages = [{ mes: 'some text' }];
        const query = buildEmbeddingQuery(messages, null, queryConfig);
        expect(query).toContain('some text');
    });
});

describe('parseRecentMessages', () => {
    const queryConfig = {
        entityWindowSize: 10,
        embeddingWindowSize: 5,
        recencyDecayFactor: 0.09,
        topEntitiesCount: 5,
        entityBoostWeight: 5.0,
    };

    it('parses newline-separated context', () => {
        const context = 'First message\nSecond message\nThird message';
        const messages = parseRecentMessages(context, 10);
        expect(messages).toHaveLength(3);
        expect(messages[0].mes).toBe('Third message');
        expect(messages[2].mes).toBe('First message');
    });

    it('respects count limit', () => {
        const context = 'One\nTwo\nThree\nFour\nFive';
        const messages = parseRecentMessages(context, 3);
        expect(messages).toHaveLength(3);
        expect(messages[0].mes).toBe('Five');
        expect(messages[1].mes).toBe('Four');
        expect(messages[2].mes).toBe('Three');
    });

    it('filters empty lines', () => {
        const messages = parseRecentMessages('First\n\n\nSecond\n');
        expect(messages).toHaveLength(2);
    });

    it('handles null context', () => {
        expect(parseRecentMessages(null)).toEqual([]);
    });

    it('handles empty string', () => {
        expect(parseRecentMessages('')).toEqual([]);
    });
});
```

Also add `extractQueryContext` and `parseRecentMessages` to the import at the top of `tests/retrieval/query-context.test.js`.

**Important:** The root file uses a `vi.mock` for `embeddings.js` that the retrieval file may not have. Check whether the retrieval file already mocks `embeddings.js` — if yes, no change needed. If not, add:

```javascript
vi.mock('../src/embeddings.js', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, getOptimalChunkSize: () => 500 };
});
```

- [ ] Step 2: Delete the root file

```bash
rm tests/query-context.test.js
```

- [ ] Step 3: Run tests

Run: `npx vitest run tests/retrieval/query-context.test.js --reporter=verbose`
Expected: All tests pass (original + ported).

- [ ] Step 4: Commit

```bash
git add -A && git commit -m "chore: merge query-context.test.js into retrieval/query-context.test.js"
```

### Task 5: Merge `tests/formatting.test.js` into `tests/retrieval/formatting.test.js`

The root file has unique tests for `formatContextForInjection` (subconscious_drives / reflection separation). Port those into the retrieval file, then delete the root file.

- [ ] Step 1: Add the unique subconscious_drives tests to `tests/retrieval/formatting.test.js`

Add a new describe block inside the existing `formatContextForInjection` describe:

```javascript
// Subconscious Drives (reflection separation)
describe('subconscious_drives', () => {
    it('separates reflections from events into different XML blocks', () => {
        const memories = [
            { id: 'ev_1', type: 'event', summary: 'Event 1', importance: 3, sequence: 1000 },
            { id: 'ev_2', type: 'event', summary: 'Event 2', importance: 3, sequence: 2000 },
            { id: 'ref_1', type: 'reflection', summary: 'Insight about character', importance: 4, sequence: 1500 },
        ];
        const result = formatContextForInjection(memories, [], null, 'CharacterA', 1000, 100);
        expect(result).toContain('<scene_memory>');
        expect(result).toContain('Event 1');
        expect(result).toContain('Event 2');
        expect(result).toContain('<subconscious_drives>');
        expect(result).toContain('Insight about character');
        const sceneMemoryMatch = result.match(/<scene_memory>([\s\S]*?)<\/scene_memory>/);
        const sceneMemoryContent = sceneMemoryMatch ? sceneMemoryMatch[1] : '';
        expect(sceneMemoryContent).not.toContain('Insight about character');
    });

    it('omits subconscious_drives block when no reflections exist', () => {
        const memories = [{ id: 'ev_1', type: 'event', summary: 'Event 1', importance: 3, sequence: 1000 }];
        const result = formatContextForInjection(memories, [], null, 'Char', 1000, 100);
        expect(result).toContain('<scene_memory>');
        expect(result).not.toContain('<subconscious_drives>');
    });
});

describe('formatContextForInjection without hard quotas', () => {
    it('accepts memories pre-selected by scoring', () => {
        const memories = [
            { id: '1', summary: 'Old memory', message_ids: [100], sequence: 10000, importance: 3 },
            { id: '2', summary: 'Recent memory', message_ids: [900], sequence: 9000, importance: 3 },
        ];
        const result = formatContextForInjection(memories, ['OtherChar'], { emotion: 'neutral' }, 'TestChar', 1000, 1000);
        expect(result).toContain('Old memory');
        expect(result).toContain('Recent memory');
    });
});
```

Also add `formatMemory` tests from the root file if `tests/retrieval/formatting.test.js` doesn't already test it. Check first.

- [ ] Step 2: Delete the root file

```bash
rm tests/formatting.test.js
```

- [ ] Step 3: Run tests

Run: `npx vitest run tests/retrieval/formatting.test.js --reporter=verbose`
Expected: All tests pass.

- [ ] Step 4: Commit

```bash
git add -A && git commit -m "chore: merge formatting.test.js into retrieval/formatting.test.js"
```

### Task 6: Consolidate 4 UI structure test files into `tests/ui/structure.test.js`

- [ ] Step 1: Read all 4 files

Read these files to understand their exact content:
- `tests/ui/dashboard-structure.test.js`
- `tests/ui/advanced-structure.test.js`
- `tests/ui/memories-structure.test.js`
- `tests/ui/tab-structure.test.js`

- [ ] Step 2: Create `tests/ui/structure.test.js` by concatenating all 4 files

Combine them into a single file with one top-level describe block per tab/area. The exact code depends on reading the files — use the same imports and test cases, just reorganized under a single `describe('UI structure')` with nested `describe()` blocks for each area.

- [ ] Step 3: Delete the 4 original files

```bash
rm tests/ui/dashboard-structure.test.js
rm tests/ui/advanced-structure.test.js
rm tests/ui/memories-structure.test.js
rm tests/ui/tab-structure.test.js
```

- [ ] Step 4: Run tests

Run: `npx vitest run tests/ui/structure.test.js --reporter=verbose`
Expected: All tests pass.

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "chore: consolidate 4 UI structure test files into ui/structure.test.js"
```

### Task 7: Move `tests/math.test.js` to `tests/retrieval/math-alpha-blend.test.js`

- [ ] Step 1: Move the file

```bash
git mv tests/math.test.js tests/retrieval/math-alpha-blend.test.js
```

- [ ] Step 2: Fix import paths in the moved file

All `../src/` paths become `../../src/`. The file currently uses relative imports from root `tests/` — adjust to the new location.

- [ ] Step 3: Run tests

Run: `npx vitest run tests/retrieval/math-alpha-blend.test.js --reporter=verbose`
Expected: All tests pass.

- [ ] Step 4: Commit

```bash
git add -A && git commit -m "chore: move math.test.js to retrieval/math-alpha-blend.test.js"
```

### Task 8: Parameterize `tests/utils/text.test.js` — stripThinkingTags section

- [ ] Step 1: Read the current `stripThinkingTags` describe block

Read `tests/utils/text.test.js` and locate the `stripThinkingTags` describe block. Identify all individual `it()` tests.

- [ ] Step 2: Replace individual tests with parameterized `it.each()`

Consolidate into 3-4 parameterized test groups:

```javascript
describe('stripThinkingTags', () => {
    it.each([
        ['`-thinking-` paired tags', '<thinking>some thought</thinking>', 'some thought'],
        ['`clear_thought` paired tags', '<clear_thought>thought</clear_thought>', 'thought'],
        ['`reasoning` paired tags', '<reasoning>thought</reasoning>', 'thought'],
        ['paired tags with attributes', '<think data-v="1">thought</think data-v="1">', 'thought'],
        ['case-insensitive paired tags', '<THINKING>thought</THINKING>', 'thought'],
    ])('strips $name', (_, input, expected) => {
        expect(stripThinkingTags(input)).toBe(expected);
    });

    it.each([
        ['orphaned `</think closing tag`', '</think some prefill text', 'some prefill text'],
        ['orphaned `</thinking` closing tag', '</thinking continued', 'continued'],
        ['orphaned `</reasoning` closing tag', '</reasoning continued', 'continued'],
        ['orphaned `</clear_thought` closing tag', '</clear_thought continued', 'continued'],
        ['orphaned `</ideal_output` closing tag', '</ideal_output continued', 'continued'],
    ])('strips $name', (_, input, expected) => {
        expect(stripThinkingTags(input)).toBe(expected);
    });

    it('preserves content when no thinking tags exist', () => {
        expect(stripThinkingTags('just normal text here')).toBe('just normal text here');
    });

    it('strips `[TOOL_CALL]` bracket tags', () => {
        expect(stripThinkingTags('[TOOL_CALL]some tool output[/TOOL_CALL]')).toBe('some tool output');
    });
});
```

Adjust the exact test cases after reading the file — the above is a template. The key principle: group by behavior (paired tags, orphaned closing tags, edge cases) instead of one test per tag variant.

- [ ] Step 3: Run tests

Run: `npx vitest run tests/utils/text.test.js --reporter=verbose 2>&1 | grep -E '(stripThinkingTags|PASS|FAIL)'`
Expected: All stripThinkingTags tests pass.

- [ ] Step 4: Commit

```bash
git add -A && git commit -m "chore: parameterize stripThinkingTags tests in text.test.js"
```

### Task 9: Parameterize `tests/utils/text.test.js` — safeParseJSON, normalizeText, stripMarkdownFences, scrubConcatenation

- [ ] Step 1: Read the file and identify parameterizable sections

Read `tests/utils/text.test.js`. For each section:

**normalizeText**: Consolidate 8 tests into `it.each()`:

```javascript
describe('normalizeText', () => {
    it.each([
        ['preserves valid text unchanged', 'Hello world', 'Hello world'],
        ['replaces smart double quotes', '"Hello" \u201Cworld\u201D', '"Hello" "world"'],
        ['replaces smart single quotes', '\u2018Hello\u2019', "'Hello'"],
        ['strips U+2028 line separator', 'line1\u2028line2', 'line1line2'],
        ['strips U+2029 paragraph separator', 'line1\u2029line2', 'line1line2'],
        ['handles empty string', '', ''],
    ])('$desc', (_, input, expected) => {
        expect(normalizeText(input)).toBe(expected);
    });
});
```

**stripMarkdownFences**: Consolidate 8 tests into `it.each()`:

```javascript
describe('stripMarkdownFences', () => {
    it.each([
        ['strips ```json fence', '```json\n{"a":1}\n```', '{"a":1}'],
        ['strips ``` fence without language', '```\n{"a":1}\n```', '{"a":1}'],
        ['strips unclosed opening fence', '```json\n{"a":1}', '{"a":1}'],
        ['strips orphan closing fence', '{"a":1}\n```', '{"a":1}'],
        ['handles uppercase JSON', '```JSON\n{"a":1}\n```', '{"a":1}'],
        ['handles tilde fences', '~~~\n{"a":1}\n~~~', '{"a":1}'],
        ['handles empty string', '', ''],
    ])('$desc', (_, input, expected) => {
        expect(stripMarkdownFences(input)).toBe(expected);
    });
});
```

**scrubConcatenation**: Consolidate 11 tests into `it.each()`:

```javascript
describe('scrubConcatenation', () => {
    it.each([
        ['simple concatenation', '"a" + "b"', '"ab"'],
        ['concatenation with spaces', '"a" + " b"', '"a b"'],
        ['concatenation across newlines', '"a" +\n"b"', '"ab"'],
        ['full-width plus', '"a" \uff0b "b"', '"ab"'],
        ['preserves plus inside strings', '"a+b"', '"a+b"'],
        ['handles empty string', '', ''],
    ])('$desc', (_, input, expected) => {
        expect(scrubConcatenation(input)).toBe(expected);
    });
});
```

- [ ] Step 2: Apply all changes

Replace the expanded test sections with the parameterized versions above. Adjust expected values after reading the actual file content — the templates above are approximations.

- [ ] Step 3: Run tests

Run: `npx vitest run tests/utils/text.test.js --reporter=verbose 2>&1 | tail -30`
Expected: All tests pass, test count reduced.

- [ ] Step 4: Commit

```bash
git add -A && git commit -m "chore: parameterize normalizeText, stripMarkdownFences, scrubConcatenation tests"
```

### Task 10: Parameterize `tests/ui-helpers.test.js` — formatter functions

- [ ] Step 1: Read the file and identify parameterizable formatters

Read `tests/ui-helpers.test.js`. Look for these patterns:
- `formatMemoryDate`: Multiple tests returning "Unknown" for different falsy inputs
- `formatWitnesses`: Multiple tests returning empty string for falsy inputs
- `getStatusText`: Multiple tests mapping status strings
- `formatEmotionSource`: Multiple tests returning empty for null/undefined
- `formatHiddenMessagesText`: Multiple tests returning empty for zero/negative
- `formatMemoryImportance`: Multiple tests mapping importance values to star strings

- [ ] Step 2: Replace with `it.each()` blocks

Example for `formatMemoryDate`:
```javascript
it.each([
    ['null timestamp', null, 'Unknown'],
    ['undefined timestamp', undefined, 'Unknown'],
    ['zero timestamp', 0, 'Unknown'],
])('returns Unknown for $desc', (_, timestamp, expected) => {
    expect(formatMemoryDate(timestamp)).toBe(expected);
});
```

Example for `getStatusText`:
```javascript
it.each([
    ['ready status', 'ready', 'Ready'],
    ['extracting status', 'extracting', 'Extracting...'],
    ['error status', 'error', 'Error'],
])('returns correct text for $desc', (_, status, expected) => {
    expect(getStatusText(status)).toBe(expected);
});
```

Apply the same pattern to all 6 formatter groups.

- [ ] Step 3: Run tests

Run: `npx vitest run tests/ui-helpers.test.js --reporter=verbose 2>&1 | tail -20`
Expected: All tests pass, test count reduced.

- [ ] Step 4: Commit

```bash
git add -A && git commit -m "chore: parameterize ui-helpers formatter tests"
```

### Task 11: Parameterize `tests/prompts.test.js` — think tag, prefill, export checks

- [ ] Step 1: Read the file and identify parameterizable sections

Read `tests/prompts.test.js`. Look for:
- 5 think tag support tests (same pattern across schemas)
- 5 prefill parameter tests (same "2 messages when empty" pattern)
- Trivial preamble/prefill export checks

- [ ] Step 2: Replace with `it.each()` blocks

For think tag support:
```javascript
it.each([
    'EVENT_SCHEMA',
    'GRAPH_SCHEMA',
    'CONSOLIDATION_SCHEMA',
    'UNIFIED_REFLECTION_SCHEMA',
    'COMMUNITY_SCHEMA',
])('%s allows think tags before JSON', (schemaName) => {
    // test logic
});
```

For prefill parameter:
```javascript
it.each([
    'buildEventExtractionPrompt',
    'buildGraphExtractionPrompt',
    'buildUnifiedReflectionPrompt',
    'buildCommunitySummaryPrompt',
    'buildGlobalSynthesisPrompt',
])('%s returns 2 messages when prefill is empty', (fnName) => {
    // test logic
});
```

Delete the trivial "exports X as non-empty string" tests entirely — they test that constants exist.

- [ ] Step 3: Run tests

Run: `npx vitest run tests/prompts.test.js --reporter=verbose 2>&1 | tail -20`
Expected: All tests pass, test count reduced.

- [ ] Step 4: Commit

```bash
git add -A && git commit -m "chore: parameterize prompts.test.js think tag and prefill tests"
```

### Task 12: Parameterize `tests/graph/graph.test.js` — cross-script and key normalization

- [ ] Step 1: Read the file and identify parameterizable sections

Read `tests/graph/graph.test.js`. Focus on:
- Cross-script merge tests (~9 tests, same pattern with different inputs)
- `findCrossScriptCharacterKeys` tests (~9 tests, same pattern with different inputs)
- Basic key normalization tests (possessives, whitespace collapse, etc.)

- [ ] Step 2: Replace with `it.each()` blocks

For cross-script merge:
```javascript
describe('cross-script merge', () => {
    it.each([
        { desc: 'merges Cyrillic PERSON matching main character via transliteration', ... },
        { desc: 'does not cross-script merge non-PERSON entities', ... },
        // etc
    ])('$desc', ({ setup, expected }) => {
        // test logic
    });
});
```

For key normalization:
```javascript
it.each([
    ['strips possessives', "Vova's House", 'vovas house'],
    ['collapses whitespace', '  Alice   Bob  ', 'alice bob'],
    ['handles curly apostrophe', "Alice\u2019s", 'alices'],
])('$desc', (_, input, expected) => {
    // test logic
});
```

- [ ] Step 3: Run tests

Run: `npx vitest run tests/graph/graph.test.js --reporter=verbose 2>&1 | tail -20`
Expected: All tests pass, test count reduced.

- [ ] Step 4: Commit

```bash
git add -A && git commit -m "chore: parameterize graph.test.js cross-script and normalization tests"
```

### Task 13: Final validation — full test suite + pre-commit check

- [ ] Step 1: Run the full test suite

Run: `npx vitest run --reporter=verbose 2>&1 | tail -30`
Expected: All tests pass. Note the final test count — should be ~1,370 (down from 1,543).

- [ ] Step 2: Run the pre-commit check

Run: `npm run check`
Expected: All checks pass (sync-version, generate-types, lint, jsdoc, css, typecheck).

- [ ] Step 3: Commit (if any residual changes)

```bash
git add -A && git commit -m "chore: test cleanup complete — removed ~170 tests and 17 files"
```

---

## Expected Results

| Metric | Before | After |
|--------|--------|-------|
| Test files | 106 | ~89 |
| Test cases | ~1,543 | ~1,370 |
| Files deleted | 0 | 17 |
| Tests deleted | 0 | ~170 |

**Files deleted (17):**
1. `tests/prompts/events/rules.test.js`
2. `tests/prompts/graph/rules.test.js`
3. `tests/prompts/roles.test.js`
4. `tests/prompts/rules.test.js`
5. `tests/prompts/schemas.test.js`
6. `tests/prompts/examples/events-en.test.js`
7. `tests/prompts/examples/events/ru.test.js`
8. `tests/ui/descriptions.test.js`
9. `tests/ui/css-classes.test.js`
10. `tests/constants/settings.test.js`
11. `tests/unit/settings-ui.test.js`
12. `tests/unit/st-helpers.test.js`
13. `tests/query-context.test.js`
14. `tests/formatting.test.js`
15. `tests/ui/dashboard-structure.test.js`
16. `tests/ui/advanced-structure.test.js`
17. `tests/ui/memories-structure.test.js`
18. `tests/ui/tab-structure.test.js`

**Files created (1):**
1. `tests/ui/structure.test.js`

**Files moved (1):**
1. `tests/math.test.js` → `tests/retrieval/math-alpha-blend.test.js`

## Common Pitfalls

- **Import paths change after moves.** When merging files from root `tests/` into `tests/retrieval/` or `tests/ui/`, all `../../src/` imports must become `../../../src/` (one level deeper). Double-check every import.
- **vi.mock paths are relative to the test file.** When moving tests, mock paths must also update.
- **`vi.resetModules()` invalidates module cache.** If merged tests use `vi.resetModules()` + dynamic imports, they must come AFTER any static imports in the file, or be in separate describe blocks with proper `beforeEach`.
- **The `formatting.test.js` merge requires checking for duplicate tests.** Both files test `formatContextForInjection` — the retrieval version is more comprehensive. Only port tests from the root file that don't already exist in the retrieval file (the subconscious_drives tests).
- **Parameterized tests use template literals.** When using `it.each()` with arrays containing special characters (Cyrillic, smart quotes), make sure the test description string doesn't break the test runner.
