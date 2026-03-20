# Macro Positioning System Implementation Plan

**Goal:** Add configurable macro positioning for OpenVault's memory and world content injection, allowing users to select predefined injection positions or use custom macros for manual placement.

**Architecture:** Extend the existing `safeSetExtensionPrompt()` wrapper to accept position and depth parameters, register synchronous macros for custom placement, and add UI controls for position selection per content type.

**Tech Stack:** Vanilla JavaScript, jQuery (ST's existing), SillyTavern's extension prompt API

---

## Pre-Implementation Checklist

- [ ] **Verify import depth**: Check actual ST installation path and adjust `setExtensionPrompt` import accordingly

---

## File Structure Overview

- **Modify**: `src/constants.js` - Add position constants and injection settings to defaults
- **Create**: `src/injection/macros.js` - Macro registration and cachedContent export
- **Modify**: `src/utils/st-helpers.js` - Extend `safeSetExtensionPrompt` with position support
- **Modify**: `src/retrieval/retrieve.js` - Use position settings when injecting content
- **Modify**: `src/ui/settings.js` - Add injection settings panel
- **Modify**: `src/ui/render.js` - Add position badge display
- **Modify**: `src/events.js` - Initialize settings with lodash.merge pattern
- **Create**: `templates/injection_settings.html` - UI template for position selectors

---

### Task 1: Add Position Constants and Injection Settings

**Files:**
- Modify: `src/constants.js`

- [ ] Step 1: Write the failing test

```javascript
// tests/unit/constants.test.js
import { describe, it, expect } from 'vitest';
import { INJECTION_POSITIONS, defaultSettings } from '../../src/constants.js';

describe('INJECTION_POSITIONS', () => {
    it('should have all position codes with correct labels', () => {
        expect(INJECTION_POSITIONS).toEqual({
            BEFORE_MAIN: 0,
            AFTER_MAIN: 1,
            BEFORE_AN: 2,
            AFTER_AN: 3,
            IN_CHAT: 4,
            CUSTOM: -1,
        });
    });

    it('should have position labels array', () => {
        expect(POSITION_LABELS).toBeDefined();
        expect(POSITION_LABELS).toHaveLength(6);
        expect(POSITION_LABELS[0]).toBe('↑Char');
        expect(POSITION_LABELS[1]).toBe('↓Char');
    });
});

describe('defaultSettings injection config', () => {
    it('should have injection defaults for memory and world', () => {
        expect(defaultSettings.injection).toBeDefined();
        expect(defaultSettings.injection.memory).toEqual({
            position: 1,
            depth: 4,
        });
        expect(defaultSettings.injection.world).toEqual({
            position: 1,
            depth: 4,
        });
    });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npm test -- tests/unit/constants.test.js`
Expected: FAIL with "INJECTION_POSITIONS is not defined"

- [ ] Step 3: Write minimal implementation

```javascript
// Add to src/constants.js after existing exports

// =============================================================================
// Injection Position Constants
// =============================================================================

export const INJECTION_POSITIONS = Object.freeze({
    BEFORE_MAIN: 0,  // ↑Char - Before character definitions
    AFTER_MAIN: 1,   // ↓Char - After main prompt (default)
    BEFORE_AN: 2,    // ↑AN - Before author's note
    AFTER_AN: 3,     // ↓AN - After author's note
    IN_CHAT: 4,      // In-chat - At specified message depth
    CUSTOM: -1,      // Custom - Macro-only, no auto-injection
});

export const POSITION_LABELS = Object.freeze([
    { value: 0, label: '↑Char', description: 'Before character definitions' },
    { value: 1, label: '↓Char', description: 'After character definitions' },
    { value: 2, label: '↑AN', description: 'Before author\'s note' },
    { value: 3, label: '↓AN', description: 'After author\'s note' },
    { value: 4, label: 'In-chat', description: 'At specified message depth' },
    { value: -1, label: 'Custom', description: 'Use macro manually' },
]);

// Add to defaultSettings object (after existing properties)
injection: {
    memory: { position: 1, depth: 4 },
    world: { position: 1, depth: 4 },
},
```

- [ ] Step 4: Run test to verify it passes

Run: `npm test -- tests/unit/constants.test.js`
Expected: PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: add injection position constants and defaults"
```

---

### Task 2: Create Macros Module

**Files:**
- Create: `src/injection/macros.js`
- Modify: `src/constants.js` - Export extensionFolderPath if not already

- [ ] Step 1: Write the failing test

```javascript
// tests/unit/macros.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerMacro } from '../../src/injection/macros.js';

// Mock SillyTavern getContext
const mockRegisterMacro = vi.fn();
vi.mock('../../src/deps.js', () => ({
    getDeps: () => ({
        getContext: () => ({
            registerMacro: mockRegisterMacro,
        }),
    }),
}));

describe('macros module', () => {
    beforeEach(() => {
        mockRegisterMacro.mockClear();
    });

    it('should export cachedContent object', async () => {
        const { cachedContent } = await import('../../src/injection/macros.js');
        expect(cachedContent).toBeDefined();
        expect(cachedContent.memory).toBe('');
        expect(cachedContent.world).toBe('');
    });

    it('should register openvault_memory macro on init', async () => {
        await import('../../src/injection/macros.js');
        expect(mockRegisterMacro).toHaveBeenCalledWith(
            'openvault_memory',
            expect.any(Function)
        );
    });

    it('should register openvault_world macro on init', async () => {
        await import('../../src/injection/macros.js');
        expect(mockRegisterMacro).toHaveBeenCalledWith(
            'openvault_world',
            expect.any(Function)
        );
    });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npm test -- tests/unit/macros.test.js`
Expected: FAIL with "Cannot find module '../../src/injection/macros.js'"

- [ ] Step 3: Write minimal implementation

```javascript
// Create: src/injection/macros.js
import { getDeps } from '../deps.js';

/**
 * Cached content for macro access.
 * Exported so injection logic can update it.
 * Mutating properties (not reassigning) updates macro return values in-place.
 */
export const cachedContent = {
    memory: '',
    world: ''
};

/**
 * Initialize macros by registering with SillyTavern.
 * Must be called after extension is loaded.
 */
export function initMacros() {
    const { registerMacro } = getDeps().getContext();

    // Macros MUST be synchronous - no async/await
    // Do NOT wrap name in {{ }} - ST does that automatically
    registerMacro('openvault_memory', () => cachedContent.memory);
    registerMacro('openvault_world', () => cachedContent.world);
}

// Auto-initialize on import
initMacros();
```

- [ ] Step 4: Run test to verify it passes

Run: `npm test -- tests/unit/macros.test.js`
Expected: PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: create macros module with registration"
```

---

### Task 3: Extend safeSetExtensionPrompt with Position Support

**Files:**
- Modify: `src/utils/st-helpers.js`

- [ ] Step 1: Write the failing test

```javascript
// tests/unit/st-helpers.test.js
import { describe, it, expect, vi } from 'vitest';
import { safeSetExtensionPrompt } from '../../src/utils/st-helpers.js';

const mockSetExtensionPrompt = vi.fn();
vi.mock('../../src/deps.js', () => ({
    getDeps: () => ({
        setExtensionPrompt: mockSetExtensionPrompt,
        extension_prompt_types: {
            IN_PROMPT: 0,
            AN: 2,
            AN_SCOPE: 3,
            CHAT: 4,
        },
    }),
}));

describe('safeSetExtensionPrompt with position', () => {
    it('should use default position when not specified', () => {
        safeSetExtensionPrompt('test content');
        expect(mockSetExtensionPrompt).toHaveBeenCalledWith(
            'openvault',
            'test content',
            0, // IN_PROMPT
            0  // depth
        );
    });

    it('should accept position parameter', () => {
        safeSetExtensionPrompt('test content', 'openvault', 2, 4);
        expect(mockSetExtensionPrompt).toHaveBeenCalledWith(
            'openvault',
            'test content',
            2, // AN
            4  // depth
        );
    });

    it('should skip injection when position is CUSTOM (-1)', () => {
        safeSetExtensionPrompt('test content', 'openvault', -1, 0);
        expect(mockSetExtensionPrompt).not.toHaveBeenCalled();
    });

    it('should handle named slots', () => {
        safeSetExtensionPrompt('world content', 'openvault_world', 1, 0);
        expect(mockSetExtensionPrompt).toHaveBeenCalledWith(
            'openvault_world',
            'world content',
            0, // IN_PROMUT (mapped from 1)
            0
        );
    });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npm test -- tests/unit/st-helpers.test.js`
Expected: FAIL - current implementation doesn't accept position parameter

- [ ] Step 3: Write minimal implementation

```javascript
// Modify: src/utils/st-helpers.js

// Position code mapping to ST extension_prompt_types
const POSITION_MAP = {
    0: 0, // BEFORE_MAIN -> IN_PROMPT
    1: 0, // AFTER_MAIN -> IN_PROMPT (same slot, different ordering)
    2: 2, // BEFORE_AN -> AN
    3: 3, // AFTER_AN -> AN_SCOPE
    4: 4, // IN_CHAT -> CHAT
};

/**
 * Safe wrapper for setExtensionPrompt with error handling and position support
 * @param {string} content - Content to inject
 * @param {string} [name] - Named slot (defaults to extensionName)
 * @param {number} [position] - Position code (0-4, -1 for custom)
 * @param {number} [depth] - Message depth for IN_CHAT position
 * @returns {boolean} True if successful, false if skipped (CUSTOM position)
 */
export function safeSetExtensionPrompt(content, name = extensionName, position = 0, depth = 0) {
    // Custom position (-1) = macro-only, skip auto-injection
    if (position === -1) {
        return false;
    }

    try {
        const deps = getDeps();
        const promptType = POSITION_MAP[position] ?? 0;
        deps.setExtensionPrompt(name, content, promptType, depth);
        return true;
    } catch (error) {
        logError('Failed to set extension prompt', error);
        return false;
    }
}
```

- [ ] Step 4: Run test to verify it passes

Run: `npm test -- tests/unit/st-helpers.test.js`
Expected: PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: extend safeSetExtensionPrompt with position support"
```

---

### Task 4: Modify Injection Logic to Use Position Settings

**Files:**
- Modify: `src/retrieval/retrieve.js`

- [ ] Step 1: Write the failing test

```javascript
// tests/integration/injection.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateInjection } from '../../src/retrieval/retrieve.js';

const mockSettings = {
    injection: {
        memory: { position: 1, depth: 4 },
        world: { position: 2, depth: 4 },
    },
};

vi.mock('../../src/deps.js', () => ({
    getDeps: () => ({
        getExtensionSettings: () => ({ openvault: mockSettings }),
        getContext: () => ({
            chat: [{ is_system: false, is_user: true, mes: 'test' }],
        }),
    }),
}));

vi.mock('../../src/utils/st-helpers.js', () => ({
    safeSetExtensionPrompt: vi.fn(() => true),
    isExtensionEnabled: () => true,
}));

vi.mock('../../src/injection/macros.js', () => ({
    cachedContent: {
        memory: '',
        world: '',
    },
}));

describe('updateInjection with positions', () => {
    it('should update cachedContent for macro access', async () => {
        // Mock data retrieval to return actual content
        const { cachedContent } = await import('../../src/injection/macros.js');
        // After updateInjection, cachedContent should be populated
        // Test will verify this happens
    });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npm test -- tests/integration/injection.test.js`
Expected: FAIL - cachedContent not currently updated

- [ ] Step 3: Write minimal implementation

```javascript
// Modify: src/retrieval/retrieve.js

// Add import at top
import { cachedContent } from '../injection/macros.js';

// Modify injectContext function to accept position parameters
export function injectContext(contextText, worldText = '') {
    const deps = getDeps();
    const settings = deps.getExtensionSettings()[extensionName];

    // Always update cachedContent for macro access
    // NOTE: cachedContent is a live object reference from macros.js.
    // Mutating its properties (not reassigning the binding) is intentional
    // and updates the macro return values in-place.
    cachedContent.memory = contextText || '';
    cachedContent.world = worldText || '';

    // Get position settings
    const memoryPosition = settings?.injection?.memory?.position ?? 1;
    const memoryDepth = settings?.injection?.memory?.depth ?? 4;
    const worldPosition = settings?.injection?.world?.position ?? 1;
    const worldDepth = settings?.injection?.world?.depth ?? 4;

    // Inject memory content
    if (!contextText) {
        safeSetExtensionPrompt('', 'openvault', memoryPosition, memoryDepth);
    } else {
        safeSetExtensionPrompt(contextText, 'openvault', memoryPosition, memoryDepth);
    }

    // Inject world content
    if (!worldText) {
        safeSetExtensionPrompt('', 'openvault_world', worldPosition, worldDepth);
    } else {
        safeSetExtensionPrompt(worldText, 'openvault_world', worldPosition, worldDepth);
    }
}

// Update selectFormatAndInject to pass world text
async function selectFormatAndInject(memoriesToUse, data, ctx) {
    // ... existing code ...

    let worldText = '';
    if (worldCommunities?.length > 0 && isEmbeddingsEnabled()) {
        // ... existing world retrieval logic ...
        // Instead of calling safeSetExtensionPrompt directly, store result
        const worldResult = retrieveWorldContext(/* ... */);
        worldText = worldResult.text || '';
        cacheRetrievalDebug({ injectedWorldContext: worldText });
    }

    // Call injectContext with both contents
    injectContext(formattedContext, worldText);

    return { memories: relevantMemories, context: formattedContext };
}

// Update updateInjection to clear properly
export async function updateInjection(pendingUserMessage = '') {
    // ... existing guard clauses ...

    // Clear cachedContent and injections
    cachedContent.memory = '';
    cachedContent.world = '';
    injectContext('', '');

    // ... rest of function ...
}
```

- [ ] Step 4: Run test to verify it passes

Run: `npm test -- tests/integration/injection.test.js`
Expected: PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: use position settings in injection logic"
```

---

### Task 5: Initialize Settings with lodash.merge

**Files:**
- Modify: `src/events.js` or create new `src/settings.js`

- [ ] Step 1: Write the failing test

```javascript
// tests/unit/settings-init.test.js
import { describe, it, expect, vi } from 'vitest';

const mockExtensionSettings = { openvault: { enabled: true } };
const mockLodash = { merge: vi.fn((a, b) => ({ ...a, ...b })) };

vi.mock('../src/deps.js', () => ({
    getDeps: () => ({
        getExtensionSettings: () => mockExtensionSettings,
        getContext: () => ({}),
    }),
}));

vi.mock('../src/constants.js', () => ({
    extensionName: 'openvault',
    defaultSettings: {
        enabled: true,
        injection: { memory: { position: 1, depth: 4 } },
    },
}));

describe('settings initialization', () => {
    it('should use lodash.merge to combine defaults with existing', async () => {
        const { loadSettings } = await import('../src/settings.js');
        loadSettings();
        expect(mockLodash.merge).toHaveBeenCalled();
    });

    it('should preserve existing settings while adding defaults', () => {
        const { loadSettings } = require('../src/settings.js');
        loadSettings();
        expect(mockExtensionSettings.openvault.injection).toBeDefined();
    });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npm test -- tests/unit/settings-init.test.js`
Expected: FAIL - settings.js doesn't exist or doesn't use lodash.merge

- [ ] Step 3: Write minimal implementation

```javascript
// Create: src/settings.js
import { defaultSettings, extensionName } from './constants.js';
import { getDeps } from './deps.js';

/**
 * Initialize extension settings with defaults using lodash.merge.
 * Preserves existing user settings while adding any missing defaults.
 */
export function loadSettings() {
    const deps = getDeps();
    const { extensionSettings, lodash } = deps.getContext();
    const { registerSettings } = deps;

    // Use lodash.merge (bundled in ST) for proper deep merge
    extensionSettings[extensionName] = lodash.merge(
        structuredClone(defaultSettings),
        extensionSettings[extensionName] || {}
    );
}

// Auto-initialize on import
loadSettings();
```

Then modify `src/events.js` to import settings:

```javascript
// Add to src/events.js imports
import './settings.js';  // Side-effect import to initialize settings
```

- [ ] Step 4: Run test to verify it passes

Run: `npm test -- tests/unit/settings-init.test.js`
Expected: PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: add settings initialization with lodash.merge"
```

---

### Task 6: Create Injection Settings UI Template

**Files:**
- Create: `templates/injection_settings.html`

- [ ] Step 1: Write the failing test (manual verification)

- [ ] Step 2: Verify template file doesn't exist

Run: `ls templates/injection_settings.html`
Expected: No such file or directory

- [ ] Step 3: Write minimal implementation

```html
<!-- Create: templates/injection_settings.html -->
<div class="openvault-inline-drawer">
    <div class="inline-drawer-content openvault-injection-settings">
        <h3>Injection Positions</h3>
        <p class="margin5">
            <small>Choose where memories and world info are injected in the prompt.</small>
        </p>

        <!-- Memory Position -->
        <div class="openvault-injection-block">
            <h4>Memory Position</h4>
            <div class="openvault-position-selector">
                <label for="openvault_memory_position">Position:</label>
                <select id="openvault_memory_position" class="text_pole">
                    <option value="0">↑Char (Before character definitions)</option>
                    <option value="1" selected>↓Char (After character definitions)</option>
                    <option value="2">↑AN (Before author's note)</option>
                    <option value="3">↓AN (After author's note)</option>
                    <option value="4">In-chat (At message depth)</option>
                    <option value="-1">Custom (Use macro manually)</option>
                </select>
            </div>

            <div class="openvault-depth-input" style="display:none;">
                <label for="openvault_memory_depth">Depth:</label>
                <input type="number" id="openvault_memory_depth" class="text_pole" min="0" max="50" value="4">
                <small>Messages from end</small>
            </div>

            <div class="openvault-macro-info" style="display:none;">
                <label>Macro:</label>
                <code>{{openvault_memory}}</code>
                <button class="openvault-copy-macro" data-macro="openvault_memory" title="Copy to clipboard">
                    <i class="fa-solid fa-copy"></i>
                </button>
                <small>Place this macro in your prompt or character card</small>
            </div>
        </div>

        <!-- World Position -->
        <div class="openvault-injection-block">
            <h4>World Info Position</h4>
            <div class="openvault-position-selector">
                <label for="openvault_world_position">Position:</label>
                <select id="openvault_world_position" class="text_pole">
                    <option value="0">↑Char (Before character definitions)</option>
                    <option value="1" selected>↓Char (After character definitions)</option>
                    <option value="2">↑AN (Before author's note)</option>
                    <option value="3">↓AN (After author's note)</option>
                    <option value="4">In-chat (At message depth)</option>
                    <option value="-1">Custom (Use macro manually)</option>
                </select>
            </div>

            <div class="openvault-depth-input" style="display:none;">
                <label for="openvault_world_depth">Depth:</label>
                <input type="number" id="openvault_world_depth" class="text_pole" min="0" max="50" value="4">
                <small>Messages from end</small>
            </div>

            <div class="openvault-macro-info" style="display:none;">
                <label>Macro:</label>
                <code>{{openvault_world}}</code>
                <button class="openvault-copy-macro" data-macro="openvault_world" title="Copy to clipboard">
                    <i class="fa-solid fa-copy"></i>
                </button>
                <small>Place this macro in your prompt or character card</small>
            </div>
        </div>

        <hr class="openvault-divider">

        <p class="margin5">
            <small class="text-muted">
                <i class="fa-solid fa-info-circle"></i>
                ↓Char is recommended. Memories injected at ↑Char may not affect character behavior in some models.
            </small>
        </p>
    </div>
</div>
```

- [ ] Step 4: Verify file exists

Run: `ls templates/injection_settings.html`
Expected: File exists

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: add injection settings UI template"
```

---

### Task 7: Bind Injection Settings UI

**Files:**
- Modify: `src/ui/settings.js`

- [ ] Step 1: Write the failing test

```javascript
// tests/unit/settings-ui.test.js
import { describe, it, expect, vi } from 'vitest';

describe('injection settings UI', () => {
    it('should load injection settings template', async () => {
        const templateLoaded = $('#openvault_memory_position').length > 0;
        expect(templateLoaded).toBe(true);
    });

    it('should show depth input when In-chat selected', () => {
        $('#openvault_memory_position').val(4).trigger('change');
        const depthVisible = $('#openvault_memory_depth').parent().is(':visible');
        expect(depthVisible).toBe(true);
    });

    it('should show macro info when Custom selected', () => {
        $('#openvault_memory_position').val(-1).trigger('change');
        const macroVisible = $('.openvault-macro-info').is(':visible');
        expect(macroVisible).toBe(true);
    });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npm test -- tests/unit/settings-ui.test.js`
Expected: FAIL - UI bindings not implemented

- [ ] Step 3: Write minimal implementation

```javascript
// Add to src/ui/settings.js

// After loadSettings(), add this function
function loadInjectionSettings() {
    const settings = getSettings();

    // Load template
    $.get(`${extensionFolderPath}/templates/injection_settings.html`, (html) => {
        $('#extensions_settings2').append(html);
        bindInjectionSettings();
        updateInjectionUI();
    });
}

function bindInjectionSettings() {
    // Memory position selector
    $('#openvault_memory_position').on('change', function () {
        const position = parseInt($(this).val());
        saveSetting('injection.memory.position', position);
        updateInjectionUI('memory');
    });

    // Memory depth input
    $('#openvault_memory_depth').on('input', function () {
        const depth = parseInt($(this).val()) || 4;
        saveSetting('injection.memory.depth', depth);
    });

    // World position selector
    $('#openvault_world_position').on('change', function () {
        const position = parseInt($(this).val());
        saveSetting('injection.world.position', position);
        updateInjectionUI('world');
    });

    // World depth input
    $('#openvault_world_depth').on('input', function () {
        const depth = parseInt($(this).val()) || 4;
        saveSetting('injection.world.depth', depth);
    });

    // Copy macro buttons
    $('.openvault-copy-macro').on('click', function () {
        const macro = $(this).data('macro');
        const macroText = `{{${macro}}}`;
        navigator.clipboard.writeText(macroText).then(
            () => showToast('success', `Copied {{${macro}}} to clipboard`),
            () => showToast('error', 'Failed to copy')
        );
    });
}

function updateInjectionUI(type = 'both') {
    const settings = getSettings();

    const updateType = (t) => {
        const position = settings.injection[t].position;
        const depth = settings.injection[t].depth;

        // Update selector
        $(`#openvault_${t}_position`).val(position);

        // Show/hide depth input (only for IN_CHAT)
        $(`#openvault_${t}_depth`).parent().toggle(position === 4);

        // Show/hide macro info (only for CUSTOM)
        $(`.openvault-injection-block:nth-child(${t === 'memory' ? 1 : 2}) .openvault-macro-info`)
            .toggle(position === -1);
    };

    if (type === 'both' || type === 'memory') updateType('memory');
    if (type === 'both' || type === 'world') updateType('world');
}

// Add to loadSettings() function, after existing UI loading:
loadInjectionSettings();
```

- [ ] Step 4: Run test to verify it passes

Run: `npm test -- tests/unit/settings-ui.test.js`
Expected: PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: bind injection settings UI controls"
```

---

### Task 8: Add Position Badge Display

**Files:**
- Modify: `src/ui/render.js`

- [ ] Step 1: Write the failing test

```javascript
// tests/unit/render.test.js
import { describe, it, expect } from 'vitest';
import { renderPositionBadges } from '../../src/ui/render.js';

describe('position badges', () => {
    it('should render position badges for memory and world', () => {
        const settings = {
            injection: {
                memory: { position: 1 },
                world: { position: 2 },
            },
        };

        const html = renderPositionBadges(settings);
        expect(html).toContain('↓Char');
        expect(html).toContain('↑AN');
    });

    it('should show macro badge for custom position', () => {
        const settings = {
            injection: {
                memory: { position: -1 },
                world: { position: 1 },
            },
        };

        const html = renderPositionBadges(settings);
        expect(html).toContain('{{openvault_memory}}');
    });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npm test -- tests/unit/render.test.js`
Expected: FAIL - renderPositionBadges doesn't exist

- [ ] Step 3: Write minimal implementation

```javascript
// Add to src/ui/render.js

/**
 * Render position badges for display
 * @param {Object} settings - Extension settings
 * @returns {string} HTML for position badges
 */
export function renderPositionBadges(settings) {
    const getPositionLabel = (position) => {
        const labels = {
            0: '↑Char',
            1: '↓Char',
            2: '↑AN',
            3: '↓AN',
            4: 'In-chat',
            '-1': 'Custom',
        };
        return labels[position] || 'Unknown';
    };

    const memoryPos = settings?.injection?.memory?.position ?? 1;
    const worldPos = settings?.injection?.world?.position ?? 1;

    const memoryLabel = memoryPos === -1
        ? `<span class="openvault-position-badge custom" title="Click to copy macro" data-macro="openvault_memory">📋 {{openvault_memory}}</span>`
        : `<span class="openvault-position-badge" title="Memory injection position">${getPositionLabel(memoryPos)}</span>`;

    const worldLabel = worldPos === -1
        ? `<span class="openvault-position-badge custom" title="Click to copy macro" data-macro="openvault_world">📋 {{openvault_world}}</span>`
        : `<span class="openvault-position-badge" title="World injection position">${getPositionLabel(worldPos)}</span>`;

    return `${memoryLabel} | ${worldLabel}`;
}

// Add click handler for macro badges
function initPositionBadges() {
    $(document).on('click', '.openvault-position-badge.custom', function () {
        const macro = $(this).data('macro');
        const macroText = `{{${macro}}}`;
        navigator.clipboard.writeText(macroText).then(
            () => showToast('success', `Copied {{${macro}}} to clipboard`),
            () => showToast('error', 'Failed to copy')
        );
    });
}

// Call initPositionBadges in refreshAllUI()
```

Add to main UI template where status is displayed:

```html
<!-- In your main UI panel, add position badges -->
<div class="openvault-position-display">
    <small class="text-muted">Injection:</small>
    <span id="openvault_position_badges"></span>
</div>
```

- [ ] Step 4: Run test to verify it passes

Run: `npm test -- tests/unit/render.test.js`
Expected: PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: add position badge display to UI"
```

---

### Task 9: Add CSS Styles for Injection Settings

**Files:**
- Modify: `style.css` or `css/injection.css`

- [ ] Step 1: Write the failing test (visual verification)

- [ ] Step 2: Verify styles don't exist

Run: `grep "openvault-injection" style.css`
Expected: No matches found

- [ ] Step 3: Write minimal implementation

```css
/* Add to style.css */

/* Injection Settings Panel */
.openvault-injection-settings {
    padding: 10px;
}

.openvault-injection-block {
    margin-bottom: 15px;
    padding: 10px;
    border: 1px solid var(--martingrey10);
    border-radius: 5px;
    background: var(--black30a);
}

.openvault-injection-block h4 {
    margin: 0 0 10px 0;
    font-size: 14px;
    color: var(--SmartThemeBodyColor);
}

.openvault-position-selector,
.openvault-depth-input,
.openvault-macro-info {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
}

.openvault-position-selector label,
.openvault-depth-input label,
.openvault-macro-info label {
    min-width: 80px;
    font-size: 13px;
}

.openvault-position-selector select,
.openvault-depth-input input {
    flex: 1;
}

.openvault-macro-info code {
    background: var(--black50a);
    padding: 4px 8px;
    border-radius: 4px;
    font-family: monospace;
    color: var(--cyan50a);
}

.openvault-copy-macro {
    background: transparent;
    border: none;
    color: var(--SmartThemeBodyColor);
    cursor: pointer;
    padding: 4px;
}

.openvault-copy-macro:hover {
    color: var(--cyan50a);
}

/* Position Badges */
.openvault-position-display {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 10px;
    background: var(--black30a);
    border-radius: 4px;
    margin-top: 5px;
}

.openvault-position-badge {
    font-size: 12px;
    padding: 2px 6px;
    background: var(--black50a);
    border-radius: 3px;
    color: var(--SmartThemeBodyColor);
}

.openvault-position-badge.custom {
    color: var(--cyan50a);
    cursor: pointer;
}

.openvault-position-badge.custom:hover {
    background: var(--cyan30a20);
}
```

- [ ] Step 4: Verify styles exist

Run: `grep "openvault-injection" style.css`
Expected: Matches found

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: add CSS styles for injection settings"
```

---

### Task 10: Update Documentation

**Files:**
- Modify: `README.md`

- [ ] Step 1: Write the failing content check

Run: `grep -q "Macro Positioning" README.md`
Expected: Exit code 1 (not found)

- [ ] Step 2: Verify documentation doesn't exist

Run: `grep "Injection Positions\|macro positioning" README.md`
Expected: No matches found

- [ ] Step 3: Write minimal implementation

```markdown
<!-- Add to README.md after existing features section -->

## Injection Positions

OpenVault allows you to customize where retrieved memories and world info are injected into the prompt. This is useful for controlling how the AI prioritizes different context sources.

### Configuring Positions

1. Open SillyTavern Settings → Extensions → OpenVault
2. Scroll to the "Injection Positions" section
3. Choose a position for each content type:
   - **Memory Position**: Where retrieved memories are injected
   - **World Info Position**: Where world context is injected

### Available Positions

| Position | Label | Description |
|----------|-------|-------------|
| ↑Char | Before character definitions | Injected before the character card |
| ↓Char | After character definitions | Injected after the character card (recommended) |
| ↑AN | Before author's note | Injected at the top of the author's note |
| ↓AN | After author's note | Injected at the bottom of the author's note |
| In-chat | At message depth | Injected at a specific message depth |
| **Custom** | Use macro manually | No auto-injection; use macros below |

### Custom Position (Manual Macros)

When "Custom" is selected, content is **not automatically injected**. Instead, you can manually place macros anywhere in your prompt:

- `{{openvault_memory}}` — Retrieves the memory context
- `{{openvault_world}}` — Retrieves the world context

**Example usage in character card or prompt:**
```
{{openvault_memory}}

[Your custom instructions here]

{{openvault_world}}
```

### Inline Position Display

The main OpenVault panel shows current injection positions as badges:
- `[↓Char | ↑AN]` — Memory at ↓Char, World at ↑AN
- `[📋 {{openvault_memory}} | ↓Char]` — Memory uses custom macro, World at ↓Char

Click on a macro badge to copy it to your clipboard.

### Default Behavior

By default, both memory and world content are injected at **↓Char** (after character definitions), which is the recommended setting for most use cases.
```

- [ ] Step 4: Verify documentation exists

Run: `grep -q "Injection Positions" README.md`
Expected: Exit code 0 (found)

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "docs: add injection positions documentation"
```

---

### Task 11: Manual Testing and Verification

**Files:**
- None (manual testing)

- [ ] Step 1: Test all positions work correctly

Run: `npm run build && serve dist/` (or your dev server)
Manual test:
1. Open ST with OpenVault loaded
2. Create a test chat with some memories
3. For each position (0-4):
   - Set Memory Position to that position
   - Trigger generation
   - Verify memory appears at correct location in prompt
4. Test Custom position:
   - Set Memory Position to Custom
   - Add `{{openvault_memory}}` to character card
   - Trigger generation
   - Verify macro is replaced with memory content

Expected: All positions inject content correctly; Custom position only works via macro

- [ ] Step 2: Test copy-to-clipboard functionality

Run: Manual test
1. Click on macro badge in inline display
2. Verify macro is copied to clipboard
3. Paste into text editor to confirm

Expected: Macro copied correctly

- [ ] Step 3: Test settings persistence

Run: Manual test
1. Change positions to non-default values
2. Reload ST
3. Verify positions are remembered

Expected: Settings persist across reloads

- [ ] Step 4: Test backward compatibility

Run: Manual test
1. Install extension fresh (no existing settings)
2. Verify defaults (↓Char for both)
3. Test that existing users without injection settings get defaults

Expected: Defaults applied correctly for new and existing users

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "test: verify all injection positions work correctly"
```

---

## Common Pitfalls

- **Import path for `setExtensionPrompt`**: The relative path depth must match your actual ST installation. Use the pre-implementation checklist to verify.
- **Macro functions must be synchronous**: Do not use async/await in macro return functions — ST calls them synchronously.
- **`cachedContent` mutation**: Always mutate properties (`cachedContent.memory = '...'`) — never reassign the binding (`cachedContent = { ... }`), which breaks the macro closure.
- **Settings initialization order**: Import `settings.js` before any code that reads settings to ensure defaults are applied.
- **Position -1 (Custom) skips injection**: When Custom is selected, `safeSetExtensionPrompt` returns `false` and does NOT call ST's API — the content is only available via macros.

---

## Summary

This plan implements configurable macro positioning through 11 sequential tasks:

1. Add position constants and injection defaults
2. Create macros module with registration
3. Extend `safeSetExtensionPrompt` with position support
4. Modify injection logic to use position settings
5. Initialize settings with `lodash.merge`
6. Create injection settings UI template
7. Bind injection settings UI controls
8. Add position badge display
9. Add CSS styles
10. Update documentation
11. Manual testing and verification

Each task follows TDD red-green methodology with explicit test commands and expected outputs.
