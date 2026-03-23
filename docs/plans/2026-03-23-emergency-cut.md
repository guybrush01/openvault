# Emergency Cut Implementation Plan

**Goal:** Add UI button to extract all unprocessed messages and hide them from LLM context, breaking repetition loops.
**Architecture:** New modal-based UI flow reusing existing `extractAllMessages` and backfill infrastructure. AbortController enables cancellation during Phase 1. Phase 2 is uncancellable.
**Tech Stack:** jQuery UI, AbortController API, existing extraction pipeline

---

## File Structure

**Create:**
- `tests/integration/emergency-cut.test.js` - Integration tests for Emergency Cut flow

**Modify:**
- `templates/settings_panel.html` - Add Emergency Cut button and modal HTML
- `css/dashboard.css` - Add modal and button styling
- `src/ui/settings.js` - Add handler functions and modal helpers
- `src/extraction/extract.js` - Add abort signal propagation and Phase 2 callback
- `tests/ui/dashboard-structure.test.js` - Add button existence tests

---

### Task 1: Add Emergency Cut Button to HTML

**Files:**
- Modify: `templates/settings_panel.html`
- Test: `tests/ui/dashboard-structure.test.js`

**Purpose:** Add the Emergency Cut button stacked below Backfill History in the Extraction Progress card.

- [ ] Step 1: Write the failing test

```javascript
// In tests/ui/dashboard-structure.test.js, add to existing describe block:

it('has Emergency Cut button in Extraction Progress card', () => {
    const progressMatch = dashboardHtml.match(
        /Extraction Progress[\s\S]*?<div class="openvault-button-row">([\s\S]*?)<\/div>/
    );
    expect(progressMatch).toBeTruthy();

    const buttonHtml = progressMatch[1];

    // Emergency Cut button exists
    expect(buttonHtml).toContain('id="openvault_emergency_cut_btn"');
    expect(buttonHtml).toContain('fa-scissors');
    expect(buttonHtml).toContain('Emergency Cut');

    // Has danger styling
    expect(buttonHtml).toContain('danger');

    // Has tooltip explaining purpose
    expect(buttonHtml).toContain('title=');
    expect(buttonHtml).toContain('repetition');
});

it('has Emergency Cut modal at correct location', () => {
    // Modal should exist in the HTML (will be moved to body at runtime)
    expect(html).toContain('id="openvault_emergency_cut_modal"');
    expect(html).toContain('openvault-modal-content');
    expect(html).toContain('id="openvault_emergency_cancel"');
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npx vitest tests/ui/dashboard-structure.test.js -v`
Expected: FAIL - "has Emergency Cut button" and "has Emergency Cut modal" tests fail

- [ ] Step 3: Write minimal implementation

```html
<!-- In templates/settings_panel.html, replace the button-row in Extraction Progress card: -->

<div class="openvault-card">
    <div class="openvault-card-header">
        <span class="openvault-card-title"><i class="fa-solid fa-bars-progress"></i> Extraction Progress</span>
    </div>
    <div class="openvault-batch-progress">
        <div class="openvault-batch-progress-bar">
            <div class="openvault-batch-progress-fill" id="openvault_batch_progress_fill"></div>
        </div>
        <span class="openvault-batch-progress-label" id="openvault_batch_progress_label">No chat</span>
    </div>
    <div class="openvault-button-row openvault-button-stack">
        <button id="openvault_extract_all_btn" class="menu_button">
            <i class="fa-solid fa-layer-group"></i> Backfill History
        </button>
        <button id="openvault_emergency_cut_btn" class="menu_button danger"
                title="Extract all unprocessed messages and hide chat history to break repetition loops.">
            <i class="fa-solid fa-scissors"></i> Emergency Cut
        </button>
    </div>
    <div class="openvault-button-row" style="margin-top: 8px;">
        <button id="openvault_backfill_embeddings_btn" class="menu_button">
            <i class="fa-solid fa-vector-square"></i> Generate Embeddings
        </button>
    </div>
</div>

<!-- Add modal at the end of the #openvault_settings div (before closing </div>) -->
<!-- Emergency Cut Progress Modal -->
<div id="openvault_emergency_cut_modal" class="openvault-modal hidden">
    <div class="openvault-modal-content">
        <h3><i class="fa-solid fa-scissors"></i> Emergency Cut in Progress</h3>
        <p id="openvault_emergency_phase">Extracting and hiding messages...</p>
        <p class="openvault-modal-hint">Note: You can manually unhide messages later using ST's built-in message visibility tools.</p>
        <div class="openvault-batch-progress">
            <div class="openvault-batch-progress-bar">
                <div class="openvault-batch-progress-fill" id="openvault_emergency_fill"></div>
            </div>
            <span class="openvault-batch-progress-label" id="openvault_emergency_label">Starting...</span>
        </div>
        <button id="openvault_emergency_cancel" class="menu_button">Cancel</button>
    </div>
</div>
```

- [ ] Step 4: Run test to verify it passes

Run: `npx vitest tests/ui/dashboard-structure.test.js -v`
Expected: PASS - All tests pass

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat(ui): add Emergency Cut button and modal HTML"
```

---

### Task 2: Add CSS Styles for Modal and Button

**Files:**
- Modify: `css/dashboard.css`
- Test: `tests/ui/css-classes.test.js`

**Purpose:** Add styling for the modal overlay, danger button, and button stack layout.

- [ ] Step 1: Write the failing test

```javascript
// In tests/ui/css-classes.test.js, add to existing describe block:

it('defines emergency cut modal classes', () => {
    const css = readFileSync(resolve(process.cwd(), 'css/dashboard.css'), 'utf-8');

    // Modal overlay
    expect(css).toContain('.openvault-modal');
    expect(css).toContain('position: fixed');
    expect(css).toContain('z-index: 9999');

    // Hidden state
    expect(css).toContain('.openvault-modal.hidden');

    // Button stack
    expect(css).toContain('.openvault-button-stack');

    // Danger button
    expect(css).toContain('#openvault_emergency_cut_btn');

    // Disabled cancel button
    expect(css).toContain('#openvault_emergency_cancel:disabled');
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npx vitest tests/ui/css-classes.test.js -v`
Expected: FAIL - "defines emergency cut modal classes" test fails

- [ ] Step 3: Write minimal implementation

```css
/* In css/dashboard.css, append at end: */

/* Emergency Cut Button Stack */
.openvault-button-stack {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.openvault-button-stack .menu_button {
    width: 100%;
}

/* Emergency Cut Danger Button */
#openvault_emergency_cut_btn {
    border-color: var(--danger-border, #dc3545);
    color: var(--danger-text, #dc3545);
}

#openvault_emergency_cut_btn:hover {
    background: var(--danger-bg, rgba(220, 53, 69, 0.13));
}

/* Emergency Cut Modal */
.openvault-modal {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
}

.openvault-modal.hidden {
    display: none;
}

.openvault-modal-content {
    background: var(--background-color, #1a1a1a);
    padding: 20px;
    border-radius: 8px;
    min-width: 300px;
    max-width: 400px;
    text-align: center;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.openvault-modal-content h3 {
    margin: 0 0 10px 0;
    color: var(--SmartThemeBodyColor, #ccc);
}

.openvault-modal-content h3 i {
    margin-right: 8px;
    color: var(--danger-text, #dc3545);
}

.openvault-modal-hint {
    font-size: 0.85em;
    color: var(--SmartThemeEmColor, #666);
    margin: 8px 0 15px 0;
    font-style: italic;
}

#openvault_emergency_cancel {
    margin-top: 15px;
}

#openvault_emergency_cancel:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}
```

- [ ] Step 4: Run test to verify it passes

Run: `npx vitest tests/ui/css-classes.test.js -v`
Expected: PASS - All tests pass

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat(css): add Emergency Cut modal and danger button styles"
```

---

### Task 3: Add Modal Helper Functions

**Files:**
- Modify: `src/ui/settings.js`
- Test: `tests/ui/settings-helpers.test.js` (new file)

**Purpose:** Implement reusable modal show/hide/progress helpers with keyboard trap and body append for stacking context fix.

**Common Pitfalls:**
- Modal must append to `document.body`, not extension panel, to avoid CSS transform clipping
- Escape key must work even if focus has dropped to body (overlay click case)
- Cancel button click handler must be bound in show function, cleaned up in hide

- [ ] Step 1: Write the failing test

```javascript
// tests/ui/settings-helpers.test.js (new file)
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import $ from 'jquery';

// Set up JSDOM
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.window = dom.window;
global.$ = $;
$.fn = $.fn || {};

describe('Emergency Cut Modal Helpers', () => {
    beforeEach(() => {
        // Reset body
        document.body.innerHTML = `
            <div id="openvault_emergency_cut_modal" class="openvault-modal hidden">
                <div class="openvault-modal-content">
                    <button id="openvault_emergency_cancel">Cancel</button>
                </div>
            </div>
        `;
    });

    afterEach(() => {
        $(document).off('keydown.emergencyCut');
    });

    describe('showEmergencyCutModal', () => {
        it('appends modal to body and removes hidden class', async () => {
            const { showEmergencyCutModal } = await import('../../src/ui/settings.js');

            showEmergencyCutModal();

            const $modal = $('#openvault_emergency_cut_modal');
            expect($modal.parent().is('body')).toBe(true);
            expect($modal.hasClass('hidden')).toBe(false);
        });

        it('binds keydown trap that blocks events outside modal', async () => {
            const { showEmergencyCutModal, hideEmergencyCutModal } = await import('../../src/ui/settings.js');

            showEmergencyCutModal();

            // Simulate keydown outside modal
            const event = new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
            const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
            const stopPropagationSpy = vi.spyOn(event, 'stopPropagation');

            document.body.dispatchEvent(event);

            expect(preventDefaultSpy).toHaveBeenCalled();
            expect(stopPropagationSpy).toHaveBeenCalled();

            hideEmergencyCutModal();
        });

        it('allows Tab and Enter inside modal without blocking', async () => {
            const { showEmergencyCutModal, hideEmergencyCutModal } = await import('../../src/ui/settings.js');

            showEmergencyCutModal();

            const $cancelBtn = $('#openvault_emergency_cancel');
            const event = new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
            const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

            $cancelBtn[0].dispatchEvent(event);

            expect(preventDefaultSpy).not.toHaveBeenCalled();

            hideEmergencyCutModal();
        });

        it('Escape key triggers cancel button click if not disabled', async () => {
            const { showEmergencyCutModal, hideEmergencyCutModal } = await import('../../src/ui/settings.js');

            showEmergencyCutModal();

            const $cancelBtn = $('#openvault_emergency_cancel');
            const clickSpy = vi.fn();
            $cancelBtn.on('click', clickSpy);

            // Simulate Escape key
            const event = new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
            document.body.dispatchEvent(event);

            expect(clickSpy).toHaveBeenCalled();

            hideEmergencyCutModal();
        });
    });

    describe('hideEmergencyCutModal', () => {
        it('adds hidden class and removes keydown handler', async () => {
            const { showEmergencyCutModal, hideEmergencyCutModal } = await import('../../src/ui/settings.js');

            showEmergencyCutModal();
            hideEmergencyCutModal();

            const $modal = $('#openvault_emergency_cut_modal');
            expect($modal.hasClass('hidden')).toBe(true);

            // Keydown handler should be removed
            const events = $._data(document, 'events');
            expect(events?.keydown?.some(e => e.namespace === 'emergencyCut')).toBe(false);
        });
    });

    describe('updateEmergencyCutProgress', () => {
        it('updates progress bar and label', async () => {
            const { updateEmergencyCutProgress } = await import('../../src/ui/settings.js');

            updateEmergencyCutProgress(3, 8, 42);

            expect($('#openvault_emergency_fill').css('width')).toBe('37.5%');
            expect($('#openvault_emergency_label').text()).toBe('Batch 3/8 - 42 memories created');
        });
    });

    describe('disableEmergencyCutCancel', () => {
        it('disables cancel button and updates text', async () => {
            const { disableEmergencyCutCancel } = await import('../../src/ui/settings.js');

            disableEmergencyCutCancel();

            expect($('#openvault_emergency_cancel').prop('disabled')).toBe(true);
            expect($('#openvault_emergency_cancel').text()).toBe('Synthesizing...');
            expect($('#openvault_emergency_phase').text()).toBe('Running final synthesis...');
        });
    });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npx vitest tests/ui/settings-helpers.test.js -v`
Expected: FAIL - All tests fail (imports fail, functions don't exist)

- [ ] Step 3: Write minimal implementation

```javascript
// In src/ui/settings.js, add after imports (around line 30):

// =============================================================================
// Emergency Cut Modal Helpers
// =============================================================================

let emergencyCutModalAppended = false;
let emergencyCutAbortController = null;

/**
 * Show the Emergency Cut progress modal.
 * Appends to body to avoid stacking context issues with ST's extension panel.
 */
export function showEmergencyCutModal() {
    const $modal = $('#openvault_emergency_cut_modal');
    if (!emergencyCutModalAppended) {
        $modal.appendTo('body');
        emergencyCutModalAppended = true;
    }
    $modal.removeClass('hidden');

    // Keyboard trap with modal accessibility
    $(document).on('keydown.emergencyCut', function(e) {
        // Escape - always check first (handles focus loss on overlay click)
        if (e.key === 'Escape') {
            e.preventDefault();
            const $cancelBtn = $('#openvault_emergency_cancel');
            if (!$cancelBtn.prop('disabled')) {
                $cancelBtn.click();
            }
            return;
        }

        // Allow Tab/Enter inside modal
        if ($(e.target).closest('#openvault_emergency_cut_modal').length) {
            return;
        }

        // Block ST hotkeys outside
        e.preventDefault();
        e.stopPropagation();
    });

    // Bind cancel button click to abort controller
    $('#openvault_emergency_cancel').off('click').on('click', () => {
        if (emergencyCutAbortController) {
            emergencyCutAbortController.abort();
        }
    });
}

/**
 * Hide the Emergency Cut progress modal.
 */
export function hideEmergencyCutModal() {
    $('#openvault_emergency_cut_modal').addClass('hidden');
    $(document).off('keydown.emergencyCut');
    $('#openvault_emergency_cancel').off('click');
}

/**
 * Update progress display during Emergency Cut.
 * @param {number} batchNum - Current batch number (1-indexed)
 * @param {number} totalBatches - Total number of batches
 * @param {number} eventsCreated - Number of memories created so far
 */
export function updateEmergencyCutProgress(batchNum, totalBatches, eventsCreated) {
    const progress = Math.round((batchNum / totalBatches) * 100);
    $('#openvault_emergency_fill').css('width', `${progress}%`);
    $('#openvault_emergency_label').text(`Batch ${batchNum}/${totalBatches} - ${eventsCreated} memories created`);
}

/**
 * Disable the cancel button when entering Phase 2 (uncancellable).
 */
export function disableEmergencyCutCancel() {
    $('#openvault_emergency_cancel')
        .prop('disabled', true)
        .text('Synthesizing...');
    $('#openvault_emergency_phase').text('Running final synthesis...');
}
```

- [ ] Step 4: Run test to verify it passes

Run: `npx vitest tests/ui/settings-helpers.test.js -v`
Expected: PASS - All tests pass

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat(ui): add Emergency Cut modal helper functions"
```

---

### Task 4: Implement hideExtractedMessages Function

**Files:**
- Modify: `src/ui/settings.js`
- Test: `tests/ui/settings-helpers.test.js`

**Purpose:** Mark all processed messages as `is_system=true` to hide them from LLM context.

- [ ] Step 1: Write the failing test

```javascript
// Add to tests/ui/settings-helpers.test.js:

describe('hideExtractedMessages', () => {
    it('only marks messages that are in processed fingerprints set', async () => {
        // Mock the scheduler module
        vi.mock('../../src/extraction/scheduler.js', () => ({
            getProcessedFingerprints: vi.fn(() => new Set(['fp1', 'fp2'])),
            getFingerprint: vi.fn((msg) => msg.fp),
        }));

        // Mock data module
        vi.mock('../../src/utils/data.js', () => ({
            getOpenVaultData: vi.fn(() => ({ memories: [] })),
        }));

        // Mock deps
        vi.mock('../../src/deps.js', () => ({
            getDeps: vi.fn(() => ({
                getContext: () => ({
                    chat: [
                        { fp: 'fp1', is_system: false },  // processed, should hide
                        { fp: 'fp2', is_system: false },  // processed, should hide
                        { fp: 'fp3', is_system: false },  // not processed, keep visible
                        { fp: 'fp1', is_system: true },   // already hidden, skip
                    ]
                }),
                saveChatConditional: vi.fn(async () => true),
            })),
        }));

        const { hideExtractedMessages } = await import('../../src/ui/settings.js');

        const count = await hideExtractedMessages();

        expect(count).toBe(2); // Only fp1 and fp2 (not already hidden)
    });

    it('returns 0 if no messages to hide', async () => {
        vi.mock('../../src/extraction/scheduler.js', () => ({
            getProcessedFingerprints: vi.fn(() => new Set([])),
            getFingerprint: vi.fn((msg) => msg.fp),
        }));

        vi.mock('../../src/utils/data.js', () => ({
            getOpenVaultData: vi.fn(() => ({ memories: [] })),
        }));

        vi.mock('../../src/deps.js', () => ({
            getDeps: vi.fn(() => ({
                getContext: () => ({
                    chat: [
                        { fp: 'fp1', is_system: false },
                        { fp: 'fp2', is_system: false },
                    ]
                }),
                saveChatConditional: vi.fn(async () => true),
            })),
        }));

        const { hideExtractedMessages } = await import('../../src/ui/settings.js');

        const count = await hideExtractedMessages();

        expect(count).toBe(0);
    });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npx vitest tests/ui/settings-helpers.test.js -v`
Expected: FAIL - hideExtractedMessages tests fail

- [ ] Step 3: Write minimal implementation

```javascript
// In src/ui/settings.js, add after modal helpers:

/**
 * Hide all extracted messages from LLM context by setting is_system=true.
 * Only hides messages that have been successfully processed (fingerprint in processed set).
 * @returns {Promise<number>} Number of messages hidden
 */
export async function hideExtractedMessages() {
    const { getDeps } = await import('../deps.js');
    const { getProcessedFingerprints, getFingerprint } = await import('../extraction/scheduler.js');
    const { getOpenVaultData } = await import('../utils/data.js');

    const context = getDeps().getContext();
    const chat = context.chat || [];
    const data = getOpenVaultData();

    const processedFps = getProcessedFingerprints(data);

    let hiddenCount = 0;
    for (const msg of chat) {
        const fp = getFingerprint(msg);
        if (processedFps.has(fp) && !msg.is_system) {
            msg.is_system = true;
            hiddenCount++;
        }
    }

    if (hiddenCount > 0) {
        await getDeps().saveChatConditional();
        logInfo(`Emergency Cut: hid ${hiddenCount} messages (all extracted)`);
    }

    return hiddenCount;
}
```

- [ ] Step 4: Run test to verify it passes

Run: `npx vitest tests/ui/settings-helpers.test.js -v`
Expected: PASS - All tests pass

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat(ui): add hideExtractedMessages for Emergency Cut"
```

---

### Task 5: Implement handleEmergencyCut Main Handler

**Files:**
- Modify: `src/ui/settings.js`
- Test: `tests/ui/settings-helpers.test.js`

**Purpose:** Wire up the Emergency Cut button to show confirmation, run extraction, hide messages, and show toast.

**Common Pitfalls:**
- Must check `isWorkerRunning()` first to avoid collision
- Must set `operationState.extractionInProgress` to block background worker
- AbortError should show "cancelled, nothing hidden" message
- Other errors should show failure message
- Always cleanup in finally block

- [ ] Step 1: Write the failing test

```javascript
// Add to tests/ui/settings-helpers.test.js:

describe('handleEmergencyCut', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('shows warning toast if worker is running', async () => {
        const showToastMock = vi.fn();

        vi.mock('../../src/extraction/worker.js', () => ({
            isWorkerRunning: vi.fn(() => true),
        }));

        vi.mock('../../src/utils/dom.js', () => ({
            showToast: showToastMock,
        }));

        const { handleEmergencyCut } = await import('../../src/ui/settings.js');

        await handleEmergencyCut();

        expect(showToastMock).toHaveBeenCalledWith('warning', expect.stringContaining('Background extraction'));
    });

    it('shows info toast and returns if no messages to hide', async () => {
        const showToastMock = vi.fn();

        vi.mock('../../src/extraction/worker.js', () => ({
            isWorkerRunning: vi.fn(() => false),
        }));

        vi.mock('../../src/extraction/scheduler.js', () => ({
            getBackfillStats: vi.fn(() => ({ unextractedCount: 0 })),
            getProcessedFingerprints: vi.fn(() => new Set()),
            getFingerprint: vi.fn(() => 'fp1'),
        }));

        vi.mock('../../src/utils/data.js', () => ({
            getOpenVaultData: vi.fn(() => ({ memories: [] })),
        }));

        vi.mock('../../src/utils/dom.js', () => ({
            showToast: showToastMock,
        }));

        vi.mock('../../src/deps.js', () => ({
            getDeps: vi.fn(() => ({
                getContext: () => ({ chat: [] }),
            })),
        }));

        // Mock confirm to return false
        global.confirm = vi.fn(() => false);

        const { handleEmergencyCut } = await import('../../src/ui/settings.js');

        await handleEmergencyCut();

        expect(showToastMock).toHaveBeenCalledWith('info', 'No messages to hide');
    });

    it('returns early if user cancels confirmation', async () => {
        const showToastMock = vi.fn();

        vi.mock('../../src/extraction/worker.js', () => ({
            isWorkerRunning: vi.fn(() => false),
        }));

        vi.mock('../../src/extraction/scheduler.js', () => ({
            getBackfillStats: vi.fn(() => ({ unextractedCount: 10 })),
        }));

        vi.mock('../../src/utils/dom.js', () => ({
            showToast: showToastMock,
        }));

        global.confirm = vi.fn(() => false);

        const { handleEmergencyCut } = await import('../../src/ui/settings.js');

        await handleEmergencyCut();

        expect(showToastMock).not.toHaveBeenCalled();
    });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npx vitest tests/ui/settings-helpers.test.js -v`
Expected: FAIL - handleEmergencyCut tests fail

- [ ] Step 3: Write minimal implementation

```javascript
// In src/ui/settings.js, add after hideExtractedMessages:

/**
 * Handle Emergency Cut button click.
 * Extracts all unprocessed messages and hides them from LLM context.
 */
export async function handleEmergencyCut() {
    const { getBackfillStats, getProcessedFingerprints, getFingerprint } = await import('../extraction/scheduler.js');
    const { operationState } = await import('../state.js');
    const { isWorkerRunning } = await import('../extraction/worker.js');
    const { getOpenVaultData } = await import('../utils/data.js');

    if (isWorkerRunning()) {
        showToast('warning', 'Background extraction in progress. Please wait a moment.');
        return;
    }

    const context = getDeps().getContext();
    const chat = context.chat || [];
    const data = getOpenVaultData();

    const stats = getBackfillStats(chat, data);

    let shouldExtract = true;
    let confirmMessage = '';

    if (stats.unextractedCount === 0) {
        const processedFps = getProcessedFingerprints(data);
        const hideableCount = chat.filter(m =>
            !m.is_system && processedFps.has(getFingerprint(m))
        ).length;

        if (hideableCount === 0) {
            showToast('info', 'No messages to hide');
            return;
        }

        confirmMessage = `All messages are already extracted. Hide ${hideableCount} messages from the LLM to break the loop?\n\n` +
            `The LLM will only see: preset, char card, lorebooks, and OpenVault memories.`;
        shouldExtract = false;
    } else {
        confirmMessage = `Extract and hide ${stats.unextractedCount} unprocessed messages?\n\n` +
            `The LLM will only see: preset, char card, lorebooks, and OpenVault memories.`;
    }

    if (!confirm(confirmMessage)) return;

    if (!shouldExtract) {
        const hiddenCount = await hideExtractedMessages();
        showToast('success', `Emergency Cut complete. ${hiddenCount} messages hidden from context.`);
        refreshAllUI();
        return;
    }

    operationState.extractionInProgress = true;
    $('#send_textarea').prop('disabled', true);
    emergencyCutAbortController = new AbortController();

    showEmergencyCutModal();

    try {
        const { extractAllMessages } = await import('../extraction/extract.js');
        const result = await extractAllMessages({
            isEmergencyCut: true,
            progressCallback: updateEmergencyCutProgress,
            abortSignal: emergencyCutAbortController.signal,
            onPhase2Start: disableEmergencyCutCancel,
        });

        await hideExtractedMessages();

        showToast('success',
            `Emergency Cut complete. ${result.messagesProcessed} messages processed, ` +
            `${result.eventsCreated} memories created. Chat history hidden.`
        );
        refreshAllUI();

    } catch (err) {
        logError('Emergency Cut failed', err);
        const isCancel = err.name === 'AbortError';
        const message = isCancel
            ? 'Emergency Cut cancelled. No messages were hidden.'
            : `Emergency Cut failed: ${err.message}. No messages were hidden.`;
        showToast(isCancel ? 'info' : 'error', message);
    } finally {
        operationState.extractionInProgress = false;
        $('#send_textarea').prop('disabled', false);
        hideEmergencyCutModal();
        emergencyCutAbortController = null;
    }
}
```

- [ ] Step 4: Run test to verify it passes

Run: `npx vitest tests/ui/settings-helpers.test.js -v`
Expected: PASS - All tests pass

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat(ui): add handleEmergencyCut main handler"
```

---

### Task 6: Bind Emergency Cut Button Click

**Files:**
- Modify: `src/ui/settings.js`

**Purpose:** Wire up the Emergency Cut button in the UI binding function.

- [ ] Step 1: Add button binding to bindUIElements function

```javascript
// In src/ui/settings.js, in bindUIElements function, add after extract_all_btn binding:

    // Emergency Cut button
    $('#openvault_emergency_cut_btn').on('click', handleEmergencyCut);
```

- [ ] Step 2: Verify button binding exists in codebase

Run: `grep -n "emergency_cut_btn" src/ui/settings.js`
Expected: Shows the click binding line

- [ ] Step 3: Commit

```bash
git add -A && git commit -m "feat(ui): bind Emergency Cut button click handler"
```

---

### Task 7: Update extractAllMessages to Support Emergency Cut

**Files:**
- Modify: `src/extraction/extract.js`
- Test: `tests/extraction/extract.test.js`

**Purpose:** Add options normalization, abort signal propagation, and Phase 2 callback to extractAllMessages.

**Common Pitfalls:**
- Must normalize options object before destructuring (JS anti-pattern fix)
- Must pass abortSignal to extractMemories so in-flight LLM calls can be cancelled
- Must call onPhase2Start callback before Phase 2
- AbortError must propagate for Emergency Cut to show "cancelled" message

- [ ] Step 1: Write the failing test

```javascript
// Add to tests/extraction/extract.test.js:

describe('extractAllMessages Emergency Cut support', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('accepts options object with isEmergencyCut flag', async () => {
        const progressCallback = vi.fn();
        const abortSignal = new AbortController().signal;
        const onPhase2Start = vi.fn();

        // Setup minimal mock that returns immediately
        vi.mock('../../src/deps.js', () => ({
            getDeps: vi.fn(() => ({
                getContext: () => ({ chat: [] }),
                getExtensionSettings: () => ({ openvault: { extractionTokenBudget: 8000 } }),
                saveChatConditional: vi.fn(async () => true),
            })),
        }));

        vi.mock('../../src/utils/data.js', () => ({
            getOpenVaultData: vi.fn(() => null),
        }));

        vi.mock('../../src/utils/dom.js', () => ({
            showToast: vi.fn(),
        }));

        const { extractAllMessages } = await import('../../src/extraction/extract.js');

        // Should not throw
        await extractAllMessages({
            isEmergencyCut: true,
            progressCallback,
            abortSignal,
            onPhase2Start,
        });
    });

    it('throws AbortError when signal is aborted during batch loop', async () => {
        const controller = new AbortController();

        vi.mock('../../src/deps.js', () => ({
            getDeps: vi.fn(() => ({
                getContext: () => ({
                    chat: [{ mes: 'test', is_user: true, send_date: '1' }],
                    name1: 'User',
                    name2: 'Char',
                }),
                getExtensionSettings: () => ({ openvault: { extractionTokenBudget: 8000 } }),
                saveChatConditional: vi.fn(async () => true),
            })),
        }));

        vi.mock('../../src/utils/data.js', () => ({
            getOpenVaultData: vi.fn(() => ({ memories: [], processed_message_ids: [] })),
            getCurrentChatId: vi.fn(() => 'test-chat'),
        }));

        vi.mock('../../src/extraction/scheduler.js', () => ({
            getBackfillMessageIds: vi.fn(() => ({ messageIds: [0], batchCount: 1 })),
            getNextBatch: vi.fn(() => [0]),
            getProcessedFingerprints: vi.fn(() => new Set()),
        }));

        vi.mock('../../src/utils/tokens.js', () => ({
            getTokenSum: vi.fn(() => 10000),
        }));

        vi.mock('../../src/utils/dom.js', () => ({
            showToast: vi.fn(),
        }));

        // Abort immediately
        controller.abort();

        const { extractAllMessages } = await import('../../src/extraction/extract.js');

        await expect(extractAllMessages({
            isEmergencyCut: true,
            abortSignal: controller.signal,
        })).rejects.toThrow(expect.objectContaining({ name: 'AbortError' }));
    });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npx vitest tests/extraction/extract.test.js -v`
Expected: FAIL - Emergency Cut support tests fail

- [ ] Step 3: Write minimal implementation

```javascript
// In src/extraction/extract.js, modify extractAllMessages function:

/**
 * Extract memories from all unextracted messages in current chat
 * Processes in batches determined by extractionTokenBudget setting
 * @param {function|object} optionsOrCallback - Legacy callback OR options object
 */
export async function extractAllMessages(optionsOrCallback) {
    // v6: Normalize options to handle legacy function argument
    const opts = typeof optionsOrCallback === 'function'
        ? { onComplete: optionsOrCallback }
        : (optionsOrCallback || {});

    const {
        isEmergencyCut = false,
        progressCallback = null,
        abortSignal = null,
        onComplete = null,
        onPhase2Start = null,
    } = opts;

    const updateEventListenersFn = onComplete;

    const context = getDeps().getContext();
    const chat = context.chat;

    if (!chat || chat.length === 0) {
        showToast('warning', 'No chat messages to extract');
        return { messagesProcessed: 0, eventsCreated: 0 };
    }

    const settings = getDeps().getExtensionSettings()[extensionName];
    const tokenBudget = settings.extractionTokenBudget;
    const data = getOpenVaultData();
    if (!data) {
        showToast('warning', 'No chat context available');
        return { messagesProcessed: 0, eventsCreated: 0 };
    }

    // ... existing setup code ...

    // Get initial estimate for progress display
    const { messageIds: initialMessageIds, batchCount: initialBatchCount } = getBackfillMessageIds(
        chat,
        data,
        tokenBudget
    );
    const processedFps = getProcessedFingerprints(data);

    if (processedFps.size > 0) {
        logDebug(`Backfill: Skipping ${processedFps.size} already-extracted messages`);
    }

    if (initialMessageIds.length === 0) {
        if (processedFps.size > 0) {
            showToast('info', `All eligible messages already extracted (${processedFps.size} messages have memories)`);
        } else {
            showToast('warning', `Not enough messages for a complete batch (need token budget met)`);
        }
        return { messagesProcessed: 0, eventsCreated: 0 };
    }

    // Show persistent progress toast (skip for Emergency Cut - uses modal instead)
    let toast = null;
    if (!isEmergencyCut) {
        setStatus('extracting');
        $(
            toastr?.info(`Backfill: 0/${initialBatchCount} batches (0%)`, 'OpenVault - Extracting', {
                timeOut: 0,
                extendedTimeOut: 0,
                tapToDismiss: false,
                toastClass: 'toast openvault-backfill-toast',
            })
        );
    }

    // Capture chat ID to detect if user switches during backfill
    const targetChatId = getCurrentChatId();

    // Process in batches - re-fetch indices each iteration to handle chat mutations
    let totalEvents = 0;
    let batchesProcessed = 0;
    let messagesProcessed = 0;
    let currentBatch = null;
    let retryCount = 0;
    let cumulativeBackoffMs = 0;

    while (true) {
        // v6: Check abort signal at start of loop
        if (abortSignal?.aborted) {
            throw new DOMException('Emergency Cut Cancelled', 'AbortError');
        }

        // If we have no current batch or need to get a fresh one (after successful extraction)
        if (!currentBatch) {
            // Re-fetch current state to handle chat mutations (deletions/additions)
            const freshContext = getDeps().getContext();
            const freshChat = freshContext.chat;
            const freshData = getOpenVaultData();

            // ... existing debug logging ...

            if (!freshChat || !freshData) {
                logDebug('Backfill: Lost chat context, stopping');
                break;
            }

            const { messageIds: freshIds, batchCount: remainingBatches } = getBackfillMessageIds(
                freshChat,
                freshData,
                tokenBudget
            );

            logDebug(
                `Backfill check: ${freshIds.length} unextracted messages available, ${remainingBatches} complete batches remaining`
            );

            // Get next batch using token budget
            currentBatch = getNextBatch(freshChat, freshData, tokenBudget);
            if (!currentBatch) {
                logDebug('Backfill: No more complete batches available');
                break;
            }
        }

        // Update progress (toast for normal, callback for Emergency Cut)
        const progress = Math.round((batchesProcessed / initialBatchCount) * 100);
        const retryText =
            retryCount > 0
                ? ` (retry ${retryCount}, backoff ${Math.round(cumulativeBackoffMs / 1000)}s/${Math.round(MAX_BACKOFF_TOTAL_MS / 1000)}s)`
                : '';

        if (!isEmergencyCut) {
            $('.openvault-backfill-toast .toast-message').text(
                `Backfill: ${batchesProcessed}/${initialBatchCount} batches (${Math.min(progress, 100)}%) - Processing...${retryText}`
            );
        } else if (progressCallback) {
            progressCallback(batchesProcessed + 1, initialBatchCount, totalEvents);
        }

        try {
            logDebug(`Processing batch ${batchesProcessed + 1}/${initialBatchCount}${retryText}...`);
            const result = await extractMemories(currentBatch, targetChatId, {
                isBackfill: true,
                silent: true,
                abortSignal, // v6: Pass signal to enable mid-request cancellation
            });
            totalEvents += result?.events_created || 0;
            messagesProcessed += currentBatch?.length || 0;

            // Success - clear current batch and reset retry count
            currentBatch = null;
            retryCount = 0;
            batchesProcessed++;

            await rpmDelay(settings, 'Batch rate limit');
        } catch (error) {
            // v6: AbortError propagation for Emergency Cut
            if (error.name === 'AbortError' || error.message === 'Chat changed during extraction') {
                if (isEmergencyCut) {
                    throw error; // Propagate to Emergency Cut handler
                }
                logDebug('Chat changed during backfill, aborting');
                $('.openvault-backfill-toast').remove();
                showToast('warning', 'Backfill aborted: chat changed', 'OpenVault');
                clearAllLocks();
                setStatus('ready');
                return { messagesProcessed: 0, eventsCreated: 0 };
            }

            retryCount++;
            const isTimeout = error.message.includes('timed out');
            const errorType = isTimeout ? 'timeout' : 'error';

            // Get backoff delay from schedule (cycle through schedule for retries beyond its length)
            const scheduleIndex = Math.min(retryCount - 1, BACKOFF_SCHEDULE_SECONDS.length - 1);
            const backoffSeconds = BACKOFF_SCHEDULE_SECONDS[scheduleIndex];
            const backoffMs = backoffSeconds * 1000;
            cumulativeBackoffMs += backoffMs;

            // If cumulative backoff exceeds limit, stop extraction entirely
            if (cumulativeBackoffMs >= MAX_BACKOFF_TOTAL_MS) {
                // v6: Throw for Emergency Cut instead of silent success
                if (isEmergencyCut) {
                    throw new Error(`Extraction failed after ${Math.round(cumulativeBackoffMs / 1000)}s of API errors.`);
                }

                logDebug(
                    `Batch ${batchesProcessed + 1} failed: cumulative backoff reached ${Math.round(cumulativeBackoffMs / 1000)}s (limit: ${Math.round(MAX_BACKOFF_TOTAL_MS / 1000)}s). Stopping extraction.`
                );
                logError('Extraction stopped after exceeding backoff limit', error);
                showToast(
                    'error',
                    `Extraction stopped: API errors persisted for ${Math.round(cumulativeBackoffMs / 1000)}s. Check your API connection and try again.`,
                    'OpenVault'
                );
                break;
            }

            logDebug(
                `Batch ${batchesProcessed + 1} failed with ${errorType}, retrying in ${backoffSeconds}s (attempt ${retryCount}, cumulative backoff: ${Math.round(cumulativeBackoffMs / 1000)}s/${Math.round(MAX_BACKOFF_TOTAL_MS / 1000)}s)...`
            );

            // Update toast to show waiting state (skip for Emergency Cut - modal shows progress)
            if (!isEmergencyCut) {
                $('.openvault-backfill-toast .toast-message').text(
                    `Backfill: ${batchesProcessed}/${initialBatchCount} batches - Waiting ${backoffSeconds}s before retry ${retryCount}...`
                );
            }

            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            // Do NOT clear currentBatch or increment batchesProcessed - retry the same batch
        }
    }

    // ===== NEW: Run final Phase 2 synthesis =====
    // v6: Notify Emergency Cut that Phase 2 is starting (uncancellable)
    if (isEmergencyCut && onPhase2Start) {
        onPhase2Start();
    }

    // Update existing progress toast for the final heavy lifting
    logInfo('Backfill Phase 1 complete. Running final Phase 2 synthesis...');
    if (!isEmergencyCut) {
        $('.openvault-backfill-toast .toast-message').text(
            `Backfill: 100% - Synthesizing world state and reflections. This may take a minute...`
        );
    }

    try {
        await runPhase2Enrichment(data, settings, targetChatId, { abortSignal }); // v6: Pass signal
    } catch (error) {
        // v6: Propagate AbortError for Emergency Cut
        if (error.name === 'AbortError' && isEmergencyCut) {
            throw error;
        }
        logError('Final Phase 2 enrichment failed', error);
        showToast('warning', 'Events saved, but final summarization failed. You can re-run later.', 'OpenVault');
        // Don't throw - Phase 1 data is safe
    }
    // ===== END FINAL PHASE 2 =====

    // Now clear it when everything is truly done
    // Clear progress toast
    if (!isEmergencyCut) {
        $('.openvault-backfill-toast').remove();
    }

    // Reset operation state
    clearAllLocks();

    // Clear injection and save
    safeSetExtensionPrompt('');
    await getDeps().saveChatConditional();

    // Re-register event listeners
    if (updateEventListenersFn) {
        updateEventListenersFn(true);
    }

    if (!isEmergencyCut) {
        showToast('success', `Extracted ${totalEvents} events from ${messagesProcessed} messages`);
        refreshAllUI();
        setStatus('ready');
    }

    logDebug('Backfill complete');

    return { messagesProcessed, eventsCreated: totalEvents };
}
```

- [ ] Step 4: Run test to verify it passes

Run: `npx vitest tests/extraction/extract.test.js -v`
Expected: PASS - All tests pass

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat(extract): add Emergency Cut support to extractAllMessages"
```

---

### Task 8: Pass AbortSignal to extractMemories and runPhase2Enrichment

**Files:**
- Modify: `src/extraction/extract.js`

**Purpose:** Enable in-flight LLM call cancellation via AbortSignal propagation to callLLM.

- [ ] Step 1: Modify extractMemories to accept and pass abortSignal

```javascript
// In src/extraction/extract.js, modify extractMemories function signature:

/**
 * Extract events from chat messages
 *
 * @param {number[]} [messageIds=null] - Optional specific message IDs for targeted extraction
 * @param {string} [targetChatId=null] - Optional chat ID to verify before saving
 * @param {Object} [options={}] - Optional configuration
 * @param {boolean} [options.silent=false] - Suppress toast notifications
 * @param {boolean} [options.isBackfill=false] - Skip Phase 2 LLM synthesis (for backfill mode)
 * @param {AbortSignal} [options.abortSignal=null] - Abort signal for cancellation
 * @returns {Promise<{status: string, events_created?: number, messages_processed?: number, reason?: string}>}
 */
export async function extractMemories(messageIds = null, targetChatId = null, options = {}) {
    const { isBackfill = false, silent = false, abortSignal = null } = options;

    // ... existing code ...

    // In Stage 3A: Event Extraction, pass abortSignal to callLLM:
    const eventJson = await callLLM(prompt, LLM_CONFIGS.extraction_events, {
        structured: true,
        signal: abortSignal, // v6: Enables mid-request cancellation
    });

    // ... existing code ...

    // In Stage 3B: Graph Extraction, pass abortSignal to callLLM:
    const graphJson = await callLLM(graphPrompt, LLM_CONFIGS.extraction_graph, {
        structured: true,
        signal: abortSignal, // v6: Enables mid-request cancellation
    });

    // ... rest of function ...
}
```

- [ ] Step 2: Modify runPhase2Enrichment to accept and check abortSignal

```javascript
// In src/extraction/extract.js, modify runPhase2Enrichment function:

/**
 * Run Phase 2 enrichment (Reflections & Communities) independently.
 * Used after backfill completes to run comprehensive synthesis once.
 *
 * @param {Object} data - OpenVault data object (modified in-place)
 * @param {Object} settings - Extension settings
 * @param {string} targetChatId - Chat ID for change detection
 * @param {Object} [options={}] - Optional configuration
 * @param {AbortSignal} [options.abortSignal=null] - Abort signal for cancellation
 * @returns {Promise<void>}
 */
export async function runPhase2Enrichment(data, settings, targetChatId, options = {}) {
    const { abortSignal = null } = options;

    const memories = data[MEMORIES_KEY] || [];

    // Guard: No memories to enrich
    if (memories.length === 0) {
        logDebug('runPhase2Enrichment: No memories to enrich');
        return;
    }

    logDebug('runPhase2Enrichment: Starting comprehensive Phase 2 synthesis');

    try {
        // ===== REFLECTIONS: Process all characters with accumulated importance =====
        initGraphState(data); // Ensures reflection_state exists
        const characterNames = Object.keys(data.reflection_state || {});
        const reflectionThreshold = settings.reflectionThreshold;

        const ladderQueue = await createLadderQueue(settings.maxConcurrency);
        const reflectionPromises = [];

        for (const characterName of characterNames) {
            // v6: Check abort signal in loop
            if (abortSignal?.aborted) {
                throw new DOMException('Emergency Cut Cancelled', 'AbortError');
            }

            if (shouldReflect(data.reflection_state, characterName, reflectionThreshold)) {
                reflectionPromises.push(
                    ladderQueue
                        .add(async () => {
                            const reflections = await generateReflections(
                                characterName,
                                memories,
                                data[CHARACTERS_KEY] || {},
                                { abortSignal } // Pass to generateReflections if it accepts it
                            );
                            if (reflections.length > 0) {
                                data[MEMORIES_KEY].push(...reflections);
                            }
                            // Reset accumulator after reflection
                            data.reflection_state[characterName].importance_sum = 0;
                        })
                        .catch((error) => {
                            if (error.name === 'AbortError') throw error;
                            logError(`Reflection error for ${characterName}`, error);
                        })
                );
            }
        }

        await Promise.all(reflectionPromises);

        // ... rest of function ...
    } catch (error) {
        if (error.name === 'AbortError') throw error;
        logError('runPhase2Enrichment failed', error);
        throw error;
    }
}
```

- [ ] Step 3: Fix outer catch block in extractMemories to comply with project rules

The existing outermost catch block in `extractMemories` logs all errors before re-throwing.
This violates the project rule: *\"Always re-throw AbortError before logging\"*.
Without this fix, cancelling Emergency Cut would spam the console with "Extraction error" logs.

```javascript
// In src/extraction/extract.js, fix the outer catch block at the end of extractMemories:

    } catch (error) {
        if (error.name === 'AbortError') throw error; // Don't log cancellation
        logError('Extraction error', error, { messageCount: messages.length });
        throw error;
    }
```

**Note:** The `{ abortSignal }` passed to `generateReflections` in Step 2 is a no-op (that function accepts only 3 arguments), but this is fine because Phase 2 is uncancellable—the Cancel button is already disabled via `disableEmergencyCutCancel()`. Chat-switch aborts are still handled by `getSessionSignal()` inside `callLLM`.

- [ ] Step 4: Commit

```bash
git add -A && git commit -m "feat(extract): propagate abortSignal to LLM calls for Emergency Cut"
```

---

### Task 9: Update handleExtractAll to Use New Options Signature

**Files:**
- Modify: `src/ui/settings.js`

**Purpose:** Update existing backfill button handler to use new options object signature.

- [ ] Step 1: Modify handleExtractAll function

```javascript
// In src/ui/settings.js, update handleExtractAll:

async function handleExtractAll() {
    const { extractAllMessages } = await import('../extraction/extract.js');
    const { isWorkerRunning } = await import('../extraction/worker.js');
    if (isWorkerRunning()) {
        showToast('warning', 'Background extraction in progress. Please wait.', 'OpenVault');
        return;
    }
    // v6: Use options object signature
    await extractAllMessages({ onComplete: updateEventListeners });
}
```

- [ ] Step 2: Commit

```bash
git add -A && git commit -m "refactor(ui): update handleExtractAll to use options object"
```

---

### Task 10: Add Integration Tests for Emergency Cut Flow

**Files:**
- Create: `tests/integration/emergency-cut.test.js`

**Purpose:** Test the full Emergency Cut flow from button click to message hiding.

**Common Pitfalls:**
- Integration tests should focus on wiring, not edge cases (test those in unit tests)
- Mock confirm() to avoid blocking
- Use fake timers to avoid waiting for real delays

- [ ] Step 1: Write the integration tests

```javascript
// tests/integration/emergency-cut.test.js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDeps } from '../../src/deps.js';
import { defaultSettings } from '../../src/constants.js';

describe('Emergency Cut Integration', () => {
    let mockContext;
    let mockData;
    let sendRequest;

    beforeEach(() => {
        vi.useFakeTimers();

        mockData = {
            memories: [],
            character_states: {},
            processed_message_ids: [],
            reflection_state: {},
            graph: { nodes: {}, edges: {} },
        };

        mockContext = {
            chat: [
                { mes: 'Hello', is_user: true, name: 'User', send_date: '1000000' },
                { mes: 'Welcome', is_user: false, name: 'Char', send_date: '1000001' },
            ],
            name1: 'User',
            name2: 'Char',
            characterId: 'char1',
            characters: { char1: { description: '' } },
            chatMetadata: { openvault: mockData },
            chatId: 'test-chat',
            powerUserSettings: {},
        };

        sendRequest = vi
            .fn()
            .mockResolvedValueOnce({
                content: JSON.stringify({
                    events: [{ summary: 'Test event', importance: 3, characters_involved: ['Char'] }],
                }),
            })
            .mockResolvedValueOnce({
                content: JSON.stringify({ entities: [], relationships: [] }),
            });

        global.confirm = vi.fn(() => true);

        setupTestContext({
            context: mockContext,
            settings: { ...defaultSettings, extractionProfile: 'test-profile' },
            deps: {
                connectionManager: {
                    selectedProfile: 'test-profile',
                    profiles: [{ id: 'test-profile', name: 'Test' }],
                    sendRequest,
                },
                fetch: vi.fn(async () => ({
                    ok: true,
                    json: async () => ({ embedding: [0.1, 0.2] }),
                })),
                saveChatConditional: vi.fn(async () => true),
            },
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        resetDeps();
        vi.clearAllMocks();
    });

    it('happy path: extracts and hides messages', async () => {
        const { handleEmergencyCut } = await import('../../src/ui/settings.js');

        await handleEmergencyCut();

        // Verify extraction happened
        expect(sendRequest).toHaveBeenCalled();
        expect(mockData.memories.length).toBeGreaterThan(0);

        // Verify messages were hidden
        const hiddenCount = mockContext.chat.filter(m => m.is_system).length;
        expect(hiddenCount).toBeGreaterThan(0);
    });

    it('shows toast on successful extraction', async () => {
        const showToast = vi.fn();
        vi.mock('../../src/utils/dom.js', () => ({ showToast }));

        const { handleEmergencyCut } = await import('../../src/ui/settings.js');

        await handleEmergencyCut();

        expect(showToast).toHaveBeenCalledWith('success', expect.stringContaining('complete'));
    });

    it('cancellation during Phase 1 shows appropriate message', async () => {
        const showToast = vi.fn();
        vi.mock('../../src/utils/dom.js', () => ({ showToast }));

        // Abort on first LLM call
        sendRequest.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

        const { handleEmergencyCut } = await import('../../src/ui/settings.js');

        await handleEmergencyCut();

        expect(showToast).toHaveBeenCalledWith('info', expect.stringContaining('cancelled'));
        expect(showToast).not.toHaveBeenCalledWith('success', expect.anything());
    });

    it('API error shows failure message without hiding messages', async () => {
        const showToast = vi.fn();
        vi.mock('../../src/utils/dom.js', () => ({ showToast }));

        // Fail on first LLM call (not abort)
        sendRequest.mockRejectedValueOnce(new Error('API error'));

        const { handleEmergencyCut } = await import('../../src/ui/settings.js');

        await handleEmergencyCut();

        expect(showToast).toHaveBeenCalledWith('error', expect.stringContaining('failed'));
        expect(showToast).not.toHaveBeenCalledWith('success', expect.anything());

        // No messages should be hidden
        const hiddenCount = mockContext.chat.filter(m => m.is_system).length;
        expect(hiddenCount).toBe(0);
    });
});
```

- [ ] Step 2: Run test to verify it passes

Run: `npx vitest tests/integration/emergency-cut.test.js -v`
Expected: PASS - All integration tests pass

- [ ] Step 3: Commit

```bash
git add -A && git commit -m "test(integration): add Emergency Cut flow tests"
```

---

### Task 11: Run Full Test Suite

**Purpose:** Verify all changes work together without breaking existing functionality.

- [ ] Step 1: Run full test suite

Run: `npm run test:run`
Expected: All tests pass

- [ ] Step 2: Fix any failures if needed

If tests fail, investigate and fix before proceeding.

- [ ] Step 3: Final commit

```bash
git add -A && git commit -m "test: verify Emergency Cut integration with full suite"
```

---

### Task 12: Manual Testing Checklist

Before marking complete, manually test in SillyTavern:

- [ ] Emergency Cut button appears in Dashboard
- [ ] Button has danger styling (red border/text)
- [ ] Clicking button shows confirmation dialog with correct count
- [ ] Cancelling confirmation does nothing
- [ ] Accepting shows progress modal with batch progress
- [ ] Cancel button works during Phase 1
- [ ] Cancel button is disabled during Phase 2
- [ ] Successful extraction shows toast with counts
- [ ] Messages are hidden from chat (is_system=true)
- [ ] Error during extraction shows error toast, no messages hidden
- [ ] Escape key closes modal during Phase 1
- [ ] Chat textarea is disabled during extraction
- [ ] Background worker is blocked during extraction

---

## Summary

This plan implements the Emergency Cut feature through 12 sequential tasks following TDD methodology:

1. **UI Structure** - Add button and modal HTML
2. **Styling** - CSS for modal, danger button, button stack
3. **Modal Helpers** - Show/hide/progress with keyboard trap
4. **Hide Function** - Mark processed messages as is_system
5. **Main Handler** - Confirmation, extraction, cleanup
6. **Button Binding** - Wire click event
7. **Extract Options** - Add abort signal and Phase 2 callback
8. **Signal Propagation** - Pass signal to LLM calls
9. **Handler Update** - Update existing backfill handler
10. **Integration Tests** - End-to-end flow tests
11. **Full Suite** - Verify no regressions
12. **Manual Testing** - User acceptance testing