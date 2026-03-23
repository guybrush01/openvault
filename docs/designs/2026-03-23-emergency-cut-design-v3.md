# Design: Emergency Cut Feature

**Status:** Draft v1
**Date:** 2026-03-23
**Scope:** UI dashboard button to extract all unprocessed messages and hide them, breaking LLM repetition loops.

---

## 1. Overview

Emergency Cut allows users to immediately extract all unprocessed chat messages into memories and hide them from the LLM's context. This creates a "clean cut" where the model can no longer see recent chat history to repeat from.

**Key principle:** Only hide messages that were successfully extracted. If extraction fails, nothing is hidden.

---

## 2. User Flow

```
1. User clicks "Emergency Cut" button in Dashboard
   ↓
2. Confirmation dialog: "Extract and hide 47 unprocessed messages?
   The LLM will only see: preset, char card, lorebooks, and OpenVault memories."
   [Cancel] [Extract and Hide]
   ↓
3. Progress modal shows: "Emergency Cut: batch 2 of 8..."
   Chat sending is blocked during this time
   ↓
4. Extraction completes (reuses existing backfill logic)
   ↓
5. Successfully extracted messages are marked as is_system=true
   ↓
6. Toast: "Emergency Cut complete. 47 messages extracted and hidden."
```

---

## 3. UI Changes

### 3.1 Button Layout (templates/settings_panel.html)

Stack vertically in Extraction Progress card:

```html
<div class="openvault-button-row openvault-button-stack">
    <button id="openvault_extract_all_btn" class="menu_button">
        <i class="fa-solid fa-layer-group"></i> Backfill History
    </button>
    <button id="openvault_emergency_cut_btn" class="menu_button danger"
            title="Extract all unprocessed messages and hide chat history to break repetition loops.">
        <i class="fa-solid fa-scissors"></i> Emergency Cut
    </button>
</div>
```

**Styling:**
- Add `.openvault-button-stack` class for vertical layout
- `.danger` class for visual distinction (red accent)
- Tooltip explains purpose on hover

### 3.2 Progress Modal (templates/settings_panel.html)

New modal overlay, reuses existing batch progress bar:

```html
<div id="openvault_emergency_cut_modal" class="openvault-modal hidden">
    <div class="openvault-modal-content">
        <h3><i class="fa-solid fa-scissors"></i> Emergency Cut in Progress</h3>
        <p>Extracting and hiding messages...</p>
        <!-- Reuse existing progress bar -->
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

---

## 4. State Management

### 4.1 Operation State (src/state.js)

Add flag to block chat sending:

```javascript
export const operationState = {
    // ... existing flags
    emergencyCutInProgress: false,
};
```

### 4.2 Event Blocking (src/events.js)

Block message sending during Emergency Cut:

```javascript
export async function onBeforeGeneration() {
    if (operationState.emergencyCutInProgress) {
        showToast('warning', 'Emergency Cut in progress. Please wait.');
        return false; // Block send
    }
    // ... rest of function
}
```

---

## 5. Handler Implementation (src/ui/settings.js)

### 5.1 handleEmergencyCut() - FIXED (v3)

```javascript
let emergencyCutAbortController = null;

async function handleEmergencyCut() {
    const { getBackfillStats } = await import('../extraction/scheduler.js');
    const { getDeps } = await import('../deps.js');
    const { operationState } = await import('../state.js');
    const { isWorkerRunning } = await import('../extraction/worker.js');

    // CRITICAL: Check for worker conflict
    if (isWorkerRunning()) {
        showToast('warning', 'Background extraction in progress. Please wait a moment.');
        return;
    }

    const context = getDeps().getContext();
    const chat = context.chat || [];
    const data = getOpenVaultData();

    // Get stats for confirmation
    const stats = getBackfillStats(chat, data);

    // CRITICAL FIX: Handle "Zero Unextracted" case
    // User may want to hide already-extracted messages to break a loop
    let shouldExtract = true;
    let confirmMessage = '';

    if (stats.unextractedCount === 0) {
        // All messages already extracted - just offer to hide them
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

    // Confirmation dialog
    const confirmed = confirm(confirmMessage);
    if (!confirmed) return;

    // If no extraction needed, just hide and done
    if (!shouldExtract) {
        const hiddenCount = await hideExtractedMessages();
        showToast('success', `Emergency Cut complete. ${hiddenCount} messages hidden from context.`);
        refreshAllUI();
        return;
    }

    // Block chat sending - CRITICAL: Disable ST textarea
    operationState.emergencyCutInProgress = true;
    $('#send_textarea').prop('disabled', true);
    emergencyCutAbortController = new AbortController();

    showEmergencyCutModal();

    try {
        // Reuse existing backfill function with UI override
        const { extractAllMessages } = await import('../extraction/extract.js');
        const result = await extractAllMessages({
            isEmergencyCut: true,
            progressCallback: updateEmergencyCutProgress,
            abortSignal: emergencyCutAbortController.signal,
        });

        // CRITICAL: Hide ALL extracted messages (historical + new)
        await hideExtractedMessages();

        showToast('success',
            `Emergency Cut complete. ${result.messagesProcessed} messages processed, ` +
            `${result.eventsCreated} memories created. Chat history hidden.`
        );
        refreshAllUI();

    } catch (err) {
        // Extraction failed - nothing was hidden (rule enforced)
        logError('Emergency Cut failed', err);
        const isCancel = err.name === 'AbortError';
        const message = isCancel
            ? 'Emergency Cut cancelled. No messages were hidden.'
            : `Emergency Cut failed: ${err.message}. No messages were hidden.`;
        showToast(isCancel ? 'info' : 'error', message);
    } finally {
        operationState.emergencyCutInProgress = false;
        $('#send_textarea').prop('disabled', false);
        hideEmergencyCutModal();
        emergencyCutAbortController = null;
    }
}
```

**Key Fixes (v3):**
1. **Zero Unextracted Trap Fixed:** If no unextracted messages, offer to hide already-extracted messages instead of returning early
2. Check `isWorkerRunning()` before starting
3. Disable `#send_textarea` to block ST hotkey sending
3. Pass `isEmergencyCut: true` to suppress backfill toast
4. `hideExtractedMessages()` takes no args - fetches global processed set

### 5.2 hideExtractedMessages() - FIXED

**Critical Fix:** Hide ALL historically extracted messages, not just the new batch.

```javascript
async function hideExtractedMessages() {
    const { getDeps } = await import('../deps.js');
    const { getProcessedFingerprints } = await import('../extraction/scheduler.js');

    const context = getDeps().getContext();
    const chat = context.chat || [];
    const data = getOpenVaultData();

    // Get ALL historically processed fingerprints, not just this run
    const processedFps = getProcessedFingerprints(data);

    let hiddenCount = 0;
    for (const msg of chat) {
        const fp = getFingerprint(msg);
        // Hide ALL messages that were ever extracted (not just this run)
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

**Logic:** This ensures the LLM sees **zero** chat history - both previously extracted messages AND newly extracted ones.

---

## 6. Reused Components

| Component | Location | Usage |
|-----------|----------|-------|
| `extractAllMessages()` | `src/extraction/extract.js` | Full extraction pipeline (Phase 1 + Phase 2) |
| `getBackfillStats()` | `src/extraction/scheduler.js` | Count messages for confirmation |
| `getUnextractedMessageIds()` | `src/extraction/scheduler.js` | Identify what to extract |
| `getProcessedFingerprints()` | `src/extraction/scheduler.js` | Track successfully extracted |
| `getFingerprint()` | `src/extraction/scheduler.js` | Message fingerprinting |
| Batch progress bar | `templates/settings_panel.html` | Progress visualization |
| `showToast()` | `src/utils/dom.js` | User feedback |
| `refreshAllUI()` | `src/ui/render.js` | Update dashboard |

---

## 7. Error Handling

| Scenario | Behavior |
|----------|----------|
| **Extraction fails** | Immediately abort. Toast error. **No messages hidden.** |
| User cancels | Stop after current batch. Toast "Cancelled - nothing hidden." |
| Chat switch | Abort, cleanup, unblock chat. |
| Zero unextracted | Toast "Nothing to extract", skip modal. |
| Partial batch (last) | Only hide successfully extracted from complete batches. |

---

## 8. Testing Strategy

### 8.1 Unit Tests

| Test | File | Description |
|------|------|-------------|
| hideExtractedMessages only marks extracted | `tests/ui/settings.test.js` | Verify only fp in processed set are hidden |
| hideExtractedMessages skips already hidden | `tests/ui/settings.test.js` | Don't double-hide messages |
| handleEmergencyCut shows confirmation | `tests/ui/settings.test.js` | Confirm dialog with correct count |
| Block send during emergency cut | `tests/events.test.js` | onBeforeGeneration returns false |

### 8.2 Integration Tests

| Test | File | Description |
|------|------|-------------|
| Emergency Cut full flow | `tests/integration/emergency-cut.test.js` | Click → confirm → extract → hide → toast |
| Emergency Cut cancellation | `tests/integration/emergency-cut.test.js` | Cancel mid-extraction, verify nothing hidden |
| Emergency Cut failure | `tests/integration/emergency-cut.test.js` | Mock extraction fail, verify nothing hidden |

### 8.3 Structure Tests

| Test | File | Description |
|------|------|-------------|
| Emergency Cut button exists | `tests/ui/dashboard-structure.test.js` | ID, class, icon, tooltip |
| Progress modal exists | `tests/ui/dashboard-structure.test.js` | Modal HTML structure |
| Buttons stacked vertically | `tests/ui/dashboard-structure.test.js` | CSS class verification |

---

## 9. CSS Additions (css/dashboard.css)

```css
.openvault-button-stack {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.openvault-button-stack .menu_button {
    width: 100%;
}

#openvault_emergency_cut_btn {
    border-color: var(--danger-border, #dc3545);
    color: var(--danger-text, #dc3545);
}

#openvault_emergency_cut_btn:hover {
    background: var(--danger-bg, #dc354520);
}

.openvault-modal {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.openvault-modal.hidden {
    display: none;
}

.openvault-modal-content {
    background: var(--background-color, #fff);
    padding: 20px;
    border-radius: 8px;
    min-width: 300px;
    text-align: center;
}
```

---

## 10. Migration Notes

- No data migration needed
- No settings migration needed
- New feature, purely additive

---

## 11. Open Questions

1. Should we add a keyboard shortcut (e.g., Ctrl+Shift+E) for Emergency Cut?
2. Should Emergency Cut trigger a "Clear Memories" reset option for unhiding?
3. Should we track Emergency Cut usage in perf metrics?

---

## 12. Required Changes to Existing Code

### 12.1 src/extraction/extract.js - extractAllMessages()

Add options parameter and UI decoupling:

```javascript
export async function extractAllMessages(options = {}) {
    const {
        isEmergencyCut = false,
        progressCallback = null,
        abortSignal = null,
    } = options;

    // ... existing setup ...

    let toast = null;
    if (!isEmergencyCut) {
        // Only show toast for normal backfill
        toast = toastr.info('...', 'Backfill', { ... });
    }

    // ...

    while (true) {
        // CRITICAL: Check abort signal
        if (abortSignal?.aborted) {
            throw new DOMException('Emergency Cut Cancelled', 'AbortError');
        }

        // ... process batch ...

        // CRITICAL: Wrap BOTH toast creation AND global selector updates
        if (!isEmergencyCut) {
            // Only update toast for normal backfill
            if (toast) {
                toast.find('.toastr-progress').text(`Batch ${batchNum}/${initialBatchCount}`);
            }
            // Also wrap any global jQuery selectors like:
            // $('.openvault-backfill-toast .toast-message').text(...)
        } else if (progressCallback) {
            // Call progress callback for Emergency Cut
            progressCallback(batchNum, initialBatchCount, eventsCreated);
        }
    }

    // Run Phase 2 enrichment
    // ...

    if (!isEmergencyCut && toast) {
        toastr.clear(toast);
    }

    // Return stats for Emergency Cut
    return { messagesProcessed: totalMessages, eventsCreated: totalEvents };
}
```

**Important:** Ensure all toastr-related DOM updates (including global `$('.openvault-backfill-toast')` selectors) are wrapped in `if (!isEmergencyCut)` blocks.

### 12.2 src/state.js

Add flag:

```javascript
export const operationState = {
    // ... existing flags
    emergencyCutInProgress: false,
};
```

### 12.3 src/events.js - Blocking is Optional

Note: The textarea disable in `handleEmergencyCut()` is the primary blocking mechanism. The modal with `z-index: 1000` also blocks clicks. The `operationState.emergencyCutInProgress` flag is for internal tracking.

### 12.4 src/ui/settings.js - Update Existing Call

**CRITICAL:** Update the existing `handleExtractAll` function to use the new options signature:

```javascript
// BEFORE (old):
async function handleExtractAll() {
    const { extractAllMessages } = await import('../extraction/extract.js');
    const { isWorkerRunning } = await import('../extraction/worker.js');
    if (isWorkerRunning()) {
        showToast('warning', 'Background extraction in progress. Please wait.', 'OpenVault');
        return;
    }
    await extractAllMessages(updateEventListeners); // <-- OLD CALL
}

// AFTER (new):
async function handleExtractAll() {
    const { extractAllMessages } = await import('../extraction/extract.js');
    const { isWorkerRunning } = await import('../extraction/worker.js');
    if (isWorkerRunning()) {
        showToast('warning', 'Background extraction in progress. Please wait.', 'OpenVault');
        return;
    }
    await extractAllMessages({
        onComplete: updateEventListeners // <-- NEW CALL with options
    });
}
```

**Note:** When implementing Section 12.1, ensure the `extractAllMessages` function handles both legacy calls and new options-based calls, OR update all call sites.

---

## 13. Implementation Checklist

- [ ] Add `emergencyCutInProgress` to `operationState`
- [ ] Add blocking logic to `onBeforeGeneration`
- [ ] Add buttons to `templates/settings_panel.html`
- [ ] Add modal HTML to `templates/settings_panel.html`
- [ ] Add CSS to `css/dashboard.css`
- [ ] Implement `handleEmergencyCut()` in `src/ui/settings.js`
- [ ] Implement `hideExtractedMessages()` in `src/ui/settings.js`
- [ ] Bind button click in `bindUIElements()`
- [ ] Add unit tests
- [ ] Add integration tests
- [ ] Add structure tests
