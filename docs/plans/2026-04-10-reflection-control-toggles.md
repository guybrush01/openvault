# Reflection Control Toggles Implementation Plan

**Goal:** Add two boolean settings to control reflection generation and injection independently.

**Architecture:** Two toggles: `reflectionGenerationEnabled` (Advanced tab) controls Phase 2 LLM calls in `synthesizeReflections()`; `reflectionInjectionEnabled` (Memories → Injection Settings) filters reflections from retrieval candidates in `retrieveAndInjectContext()`.

**Tech Stack:** JavaScript (ESM), Vitest, jQuery for UI bindings

---

### File Structure Overview

- **Modify:** `src/constants.js` - Add new settings to `defaultSettings`
- **Modify:** `src/extraction/extract.js` - Add generation toggle check in `synthesizeReflections()`
- **Modify:** `src/retrieval/retrieve.js` - Add injection toggle check when filtering reflections
- **Modify:** `templates/settings_panel.html` - Add UI checkboxes for both toggles
- **Modify:** `src/ui/settings.js` - Bind UI elements and sync in `updateUI()`
- **Create:** `tests/reflection/toggles.test.js` - Unit tests for both toggles

---

### Task 1: Add Settings to Constants

**Files:**
- Modify: `src/constants.js`

**Purpose:** Define the two new boolean settings with default values of `true` (preserve existing behavior).

- [ ] Step 1: Write the failing test

```javascript
// tests/reflection/toggles.test.js
import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/constants.js';

describe('reflection toggle settings', () => {
    it('should have reflectionGenerationEnabled defaulting to true', () => {
        expect(defaultSettings.reflectionGenerationEnabled).toBe(true);
    });

    it('should have reflectionInjectionEnabled defaulting to true', () => {
        expect(defaultSettings.reflectionInjectionEnabled).toBe(true);
    });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npm test -- tests/reflection/toggles.test.js --reporter=verbose`

Expected: FAIL with "Expected true but got undefined"

- [ ] Step 3: Write minimal implementation

```javascript
// In src/constants.js, add to defaultSettings object (after reflectionLevelMultiplier)
    reflectionLevelMultiplier: 2.0, // Decay slows by 2x per level
    // Reflection control toggles
    reflectionGenerationEnabled: true,  // Enable automatic reflection generation
    reflectionInjectionEnabled: true,   // Enable reflection injection into context
```

- [ ] Step 4: Run test to verify it passes

Run: `npm test -- tests/reflection/toggles.test.js --reporter=verbose`

Expected: PASS

- [ ] Step 5: Commit

```bash
git add src/constants.js tests/reflection/toggles.test.js && git commit -m "feat: add reflectionGenerationEnabled and reflectionInjectionEnabled settings"
```

---

### Task 2: Implement Generation Toggle in Extraction Pipeline

**Files:**
- Modify: `src/extraction/extract.js`
- Test: `tests/reflection/toggles.test.js`

**Purpose:** Skip LLM reflection generation when `reflectionGenerationEnabled` is false.

**Common Pitfalls:**
- Import `getSettings` from `../settings.js` at the top of the file
- Place the check BEFORE `generateReflections()` is called (around line 638)
- Return the correct shape: `{ stChanges: { toUpsert: [], toDelete: [] } }`

- [ ] Step 1: Write the failing test

```javascript
// Add to tests/reflection/toggles.test.js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { synthesizeReflections } from '../../src/extraction/extract.js';
import { getSettings } from '../../src/settings.js';

describe('synthesizeReflections with generation toggle', () => {
    let mockData;
    let mockSettings;

    beforeEach(() => {
        mockData = {
            schema_version: 2,
            memories: [],
            character_states: {},
            reflection_state: {
                'TestChar': { importance_sum: 100 },
            },
            graph: { nodes: {}, edges: {} },
        };
        mockSettings = {
            reflectionThreshold: 40,
            maxConcurrency: 1,
        };
    });

    it('should skip reflection generation when reflectionGenerationEnabled is false', async () => {
        // Mock getSettings to return false
        vi.mock('../../src/settings.js', async () => {
            const actual = await vi.importActual('../../src/settings.js');
            return {
                ...actual,
                getSettings: vi.fn((path, defaultValue) => {
                    if (path === 'reflectionGenerationEnabled') return false;
                    return defaultValue;
                }),
            };
        });

        await synthesizeReflections(mockData, ['TestChar'], mockSettings);

        // No new memories should be added
        expect(mockData.memories.length).toBe(0);
    });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npm test -- tests/reflection/toggles.test.js --reporter=verbose`

Expected: FAIL - memories were created when they shouldn't be

- [ ] Step 3: Write minimal implementation

```javascript
// In src/extraction/extract.js, at the start of synthesizeReflections function (around line 618)
export async function synthesizeReflections(data, characterNames, settings, options = {}) {
    const { abortSignal = null } = options;

    // Check if reflection generation is enabled
    if (!getSettings('reflectionGenerationEnabled', true)) {
        logDebug('[Extraction] Reflection generation disabled, skipping Phase 2');
        return { stChanges: { toUpsert: [], toDelete: [] } };
    }

    const reflectionThreshold = settings.reflectionThreshold;
    // ... rest of function
```

- [ ] Step 4: Run test to verify it passes

Run: `npm test -- tests/reflection/toggles.test.js --reporter=verbose`

Expected: PASS

- [ ] Step 5: Commit

```bash
git add src/extraction/extract.js tests/reflection/toggles.test.js && git commit -m "feat: skip reflection generation when reflectionGenerationEnabled is false"
```

---

### Task 3: Implement Injection Toggle in Retrieval Pipeline

**Files:**
- Modify: `src/retrieval/retrieve.js`
- Test: `tests/reflection/toggles.test.js`

**Purpose:** Filter out reflections from retrieval candidates when `reflectionInjectionEnabled` is false.

**Common Pitfalls:**
- There are TWO places reflections are filtered: `_getHiddenMemories()` and `retrieveAndInjectContext()` - modify the correct one
- The check must happen BEFORE reflections are merged into candidate memories
- Import `getSettings` from `../settings.js`

- [ ] Step 1: Write the failing test

```javascript
// Add to tests/reflection/toggles.test.js
import { describe, expect, it, vi } from 'vitest';

describe('retrieveAndInjectContext with injection toggle', () => {
    it('should exclude reflections when reflectionInjectionEnabled is false', async () => {
        // Mock getSettings to return false for injection toggle
        vi.doMock('../../src/settings.js', async () => {
            const actual = await vi.importActual('../../src/settings.js');
            return {
                ...actual,
                getSettings: vi.fn((path, defaultValue) => {
                    if (path === 'reflectionInjectionEnabled') return false;
                    return defaultValue;
                }),
            };
        });

        const { retrieveAndInjectContext } = await import('../../src/retrieval/retrieve.js');

        const mockMemories = [
            { id: 'r1', type: 'reflection', summary: 'Test reflection' },
            { id: 'e1', type: 'event', summary: 'Test event' },
        ];

        const result = await retrieveAndInjectContext(mockMemories, { /* mock context */ });

        // Reflection should not be in result
        const reflectionIds = result.memories.filter(m => m.type === 'reflection').map(m => m.id);
        expect(reflectionIds).not.toContain('r1');
        // Event should still be there
        const eventIds = result.memories.filter(m => m.type === 'event').map(m => m.id);
        expect(eventIds).toContain('e1');
    });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npm test -- tests/reflection/toggles.test.js --reporter=verbose`

Expected: FAIL - reflection was included when it shouldn't be

- [ ] Step 3: Write minimal implementation

```javascript
// In src/retrieval/retrieve.js, modify retrieveAndInjectContext function
// Around line 186-188 where reflections are filtered:

    // Filter to memories from hidden messages only (visible messages are already in context)
    const hiddenMemories = _getHiddenMemories(chat, memories);
    // Include reflections (which have no message_ids) in candidate set - respecting user toggle
    const includeReflections = getSettings('reflectionInjectionEnabled', true);
    const reflections = includeReflections
        ? memories.filter((m) => m.type === 'reflection')
        : [];
    const candidateMemories = _deduplicateById([...hiddenMemories, ...reflections]);
```

Do the same for the second location around line 463:

```javascript
    // Filter to memories from hidden messages only (visible messages are already in context)
    const hiddenMemories = _getHiddenMemories(context.chat, memories);
    // Include reflections (which have no message_ids) in candidate set - respecting user toggle
    const includeReflections = getSettings('reflectionInjectionEnabled', true);
    const reflections = includeReflections
        ? memories.filter((m) => m.type === 'reflection')
        : [];
    const candidateMemories = _deduplicateById([...hiddenMemories, ...reflections]);
```

- [ ] Step 4: Run test to verify it passes

Run: `npm test -- tests/reflection/toggles.test.js --reporter=verbose`

Expected: PASS

- [ ] Step 5: Commit

```bash
git add src/retrieval/retrieve.js tests/reflection/toggles.test.js && git commit -m "feat: exclude reflections from retrieval when reflectionInjectionEnabled is false"
```

---

### Task 4: Add UI Checkboxes to Settings Panel

**Files:**
- Modify: `templates/settings_panel.html`

**Purpose:** Add checkboxes for both toggles in appropriate tabs.

**Common Pitfalls:**
- Use `checkbox_label` class for consistent styling
- Add IDs following the pattern: `openvault_reflection_generation` and `openvault_reflection_injection`
- The Reflection Engine section already exists in the Memories tab - add to that

- [ ] Step 1: Add generation toggle to Advanced tab

```html
<!-- In templates/settings_panel.html, add after the "Danger Zone" section in the Advanced tab -->

                <!-- Reflection Engine Settings -->
                <details class="openvault-details" style="margin-top: 15px;">
                    <summary><i class="fa-solid fa-lightbulb"></i> Reflection Engine</summary>
                    <div class="openvault-settings-group">
                        <label class="checkbox_label">
                            <input id="openvault_reflection_generation" type="checkbox" />
                            <span>Generate reflections automatically</span>
                        </label>
                        <small class="openvault-hint">When disabled, no new reflections will be generated. Existing reflections remain untouched.</small>
                    </div>
                </details>
```

- [ ] Step 2: Add injection toggle to Memories → Reflection Engine section

```html
<!-- In templates/settings_panel.html, find the Reflection Engine details (around line 390) -->
<!-- Add after the max_reflections input but before closing </div> -->

                        <label for="openvault_max_reflections">
                            Max Reflections per Character: <span id="openvault_max_reflections_value">50</span>
                            <small class="openvault-default-hint" data-default-key="maxReflectionsPerCharacter"></small>
                        </label>
                        <input type="range" id="openvault_max_reflections" min="10" max="200" step="10" />
                        <small class="openvault-hint">Maximum stored insights per character. Older ones are archived when exceeded</small>

                        <!-- NEW: Injection toggle -->
                        <div style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px;">
                            <label class="checkbox_label">
                                <input id="openvault_reflection_injection" type="checkbox" />
                                <span>Inject reflections into context</span>
                            </label>
                            <small class="openvault-hint">When disabled, existing reflections will not appear in the AI's context window</small>
                        </div>
```

- [ ] Step 3: Verify HTML structure

Run: `npm run check-css`

Expected: CSS check passed (no errors about missing classes)

- [ ] Step 4: Commit

```bash
git add templates/settings_panel.html && git commit -m "ui: add reflection generation and injection toggle checkboxes"
```

---

### Task 5: Bind UI Elements in settings.js

**Files:**
- Modify: `src/ui/settings.js`

**Purpose:** Wire up the checkboxes to save/load settings values.

**Common Pitfalls:**
- Add bindings in `bindUIElements()` function
- Add sync in `updateUI()` function
- Use `'bool'` type for checkboxes

- [ ] Step 1: Add import for getSettings if not already imported

```javascript
// In src/ui/settings.js, verify imports include:
import { getSettings, setSetting } from '../settings.js';
```

- [ ] Step 2: Add bindings in bindUIElements()

```javascript
// In src/ui/settings.js, in bindUIElements() function (around line 790)
// Add after existing reflection settings:

    // Feature settings
    bindSetting('reflection_threshold', 'reflectionThreshold');
    bindSetting('max_insights', 'maxInsightsPerReflection');
    // NEW: Reflection control toggles
    bindSetting('reflection_generation', 'reflectionGenerationEnabled', 'bool');
    bindSetting('reflection_injection', 'reflectionInjectionEnabled', 'bool');
```

- [ ] Step 3: Add sync in updateUI()

```javascript
// In src/ui/settings.js, in updateUI() function (around line 975)
// Add after existing reflection settings sync:

    // Feature settings
    $('#openvault_reflection_threshold').val(settings.reflectionThreshold);
    $('#openvault_reflection_threshold_value').text(settings.reflectionThreshold);

    $('#openvault_max_insights').val(settings.maxInsightsPerReflection);
    $('#openvault_max_insights_value').text(settings.maxInsightsPerReflection);

    // NEW: Reflection control toggles
    $('#openvault_reflection_generation').prop('checked', settings.reflectionGenerationEnabled);
    $('#openvault_reflection_injection').prop('checked', settings.reflectionInjectionEnabled);
```

- [ ] Step 4: Run linter

Run: `npm run lint:fix`

Expected: No errors, files fixed if needed

- [ ] Step 5: Commit

```bash
git add src/ui/settings.js && git commit -m "ui: bind reflection toggle settings to UI controls"
```

---

### Task 6: Integration Tests

**Files:**
- Modify: `tests/reflection/toggles.test.js`

**Purpose:** Verify the toggles work end-to-end with the rest of the system.

- [ ] Step 1: Add integration test for generation toggle

```javascript
// Add to tests/reflection/toggles.test.js

describe('integration: reflection toggles', () => {
    it('should preserve existing reflections when generation is disabled', async () => {
        const data = {
            schema_version: 2,
            memories: [
                { id: 'existing-reflection', type: 'reflection', summary: 'Old reflection' },
            ],
            character_states: {},
            reflection_state: { 'Char1': { importance_sum: 100 } },
            graph: { nodes: {}, edges: {} },
        };

        // Mock settings to disable generation
        vi.mocked(getSettings).mockImplementation((path) => {
            if (path === 'reflectionGenerationEnabled') return false;
            return true;
        });

        await synthesizeReflections(data, ['Char1'], { reflectionThreshold: 40, maxConcurrency: 1 });

        // Existing reflection should still be in memories
        expect(data.memories.some(m => m.id === 'existing-reflection')).toBe(true);
    });

    it('should allow generation to continue while injection is disabled', async () => {
        // These are independent toggles - generation can happen while injection is off
        // This is useful for "audit mode" - building reflections but not using them yet

        // Mock settings
        vi.mocked(getSettings).mockImplementation((path) => {
            if (path === 'reflectionGenerationEnabled') return true;
            if (path === 'reflectionInjectionEnabled') return false;
            return true;
        });

        // Generation should proceed (would call LLM in real scenario)
        // Injection should filter them out
        const memories = [
            { id: 'r1', type: 'reflection', summary: 'Test' },
        ];

        // Verify the settings are independent
        expect(getSettings('reflectionGenerationEnabled')).toBe(true);
        expect(getSettings('reflectionInjectionEnabled')).toBe(false);
    });
});
```

- [ ] Step 2: Run all tests

Run: `npm test -- tests/reflection/toggles.test.js --reporter=verbose`

Expected: All tests PASS

- [ ] Step 3: Run full test suite

Run: `npm test`

Expected: All tests PASS (or existing failures - no new failures introduced)

- [ ] Step 4: Commit

```bash
git add tests/reflection/toggles.test.js && git commit -m "test: add integration tests for reflection toggles"
```

---

### Task 7: Final Verification

**Files:**
- All modified files

**Purpose:** Ensure everything works together.

- [ ] Step 1: Run pre-commit checks

Run: `npm run check`

Expected:
```
Version already in sync: XX.XX
Generated X types in .../types.d.ts
Checked X files
JSDoc check passed
CSS check passed
```

- [ ] Step 2: Run tests one final time

Run: `npm test`

Expected: All tests pass

- [ ] Step 3: Verify imports in modified files

Check: `src/extraction/extract.js` imports `getSettings` from `'../settings.js'`
Check: `src/retrieval/retrieve.js` imports `getSettings` from `'../settings.js'`
Check: `src/ui/settings.js` has access to `getSettings` and `setSetting`

- [ ] Step 4: Final commit

```bash
git add -A && git commit -m "feat: reflection generation and injection toggles complete"
```

---

## Summary

This implementation adds two independent boolean toggles:

1. **reflectionGenerationEnabled** (Advanced tab) - Controls whether new reflections are generated via LLM calls. When disabled, existing reflections remain but no new ones are created.

2. **reflectionInjectionEnabled** (Memories → Reflection Engine) - Controls whether reflections appear in the AI's context. When disabled, reflections exist but are never injected.

Both default to `true` to preserve existing behavior for current users.
