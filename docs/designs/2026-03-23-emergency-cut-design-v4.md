# Design: Emergency Cut Feature

**Status:** Draft v4 (Reviewed & Approved)
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
        <p class="openvault-modal-hint">Note: You can manually unhide messages later using ST's built-in message visibility tools.</p>
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

### 4.1 Reuse Existing Flag (src/state.js)

**CRITICAL (v4 fix):** Do NOT add a new flag. Reuse `extractionInProgress` which the background worker already respects.

```javascript
// In handleEmergencyCut():
operationState.extractionInProgress = true; // Worker checks this at line 101
```

This ensures:
- Worker halts immediately when it sees `extractionInProgress = true`
- No race condition between Emergency Cut and background extraction
- Simpler state management (one flag, one meaning)

### 4.2 Blocking Mechanism

**Primary:** Modal overlay with `z-index: 9999` covers all ST UI elements
**Secondary:** `$('#send_textarea').prop('disabled', true)` blocks keyboard sending

No changes needed to `src/events.js`. The DOM shield is sufficient.

---

## 5. Handler Implementation (src/ui/settings.js)

### 5.1 handleEmergencyCut() - v4

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

    // Handle "Zero Unextracted" case
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

    // Block chat sending
    // CRITICAL (v4): Use extractionInProgress - worker already respects this flag
    operationState.extractionInProgress = true;
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

        // Hide ALL extracted messages (historical + new)
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
        operationState.extractionInProgress = false;
        $('#send_textarea').prop('disabled', false);
        hideEmergencyCutModal();
        emergencyCutAbortController = null;
    }
}
```

### 5.2 hideExtractedMessages()

**Critical:** Hide ALL historically extracted messages, not just the new batch.

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
        // Check !msg.is_system to avoid double-counting already-hidden messages
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
| Chat switch | Abort (AbortError thrown), cleanup, unblock chat. |
| Zero unextracted | Offer to hide already-extracted messages instead. |
| Partial batch (last) | Only hide successfully extracted from complete batches. |

---

## 8. Testing Strategy

### 8.1 Unit Tests

| Test | File | Description |
|------|------|-------------|
| hideExtractedMessages only marks extracted | `tests/ui/settings.test.js` | Verify only fp in processed set are hidden |
| hideExtractedMessages skips already hidden | `tests/ui/settings.test.js` | Don't double-hide messages |
| handleEmergencyCut shows confirmation | `tests/ui/settings.test.js` | Confirm dialog with correct count |

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
    z-index: 9999; /* CRITICAL (v4): Must cover ST's top-level navigation */
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

.openvault-modal-hint {
    font-size: 0.85em;
    color: var(--muted-text, #666);
    margin-top: 8px;
}
```

---

## 10. Migration Notes

- No data migration needed
- No settings migration needed
- New feature, purely additive

---

## 11. Required Changes to Existing Code

### 11.1 src/extraction/extract.js - extractAllMessages()

**CRITICAL (v4):** Fix AbortError swallow bug and add options parameter.

```javascript
export async function extractAllMessages(options = {}) {
    const {
        isEmergencyCut = false,
        progressCallback = null,
        abortSignal = null,
        onComplete = null, // Replaces positional argument
    } = options;

    // Support legacy call signature: extractAllMessages(callbackFn)
    const updateEventListenersFn = typeof options === 'function' ? options : onComplete;

    // ... existing setup ...

    let toast = null;
    if (!isEmergencyCut) {
        // Only show toast for normal backfill
        toast = toastr.info('...', 'Backfill', { ... });
    }

    // ... existing code ...

    while (true) {
        // CRITICAL: Check abort signal
        if (abortSignal?.aborted) {
            throw new DOMException('Emergency Cut Cancelled', 'AbortError');
        }

        // ... process batch ...

        // CRITICAL: Wrap toast updates
        if (!isEmergencyCut) {
            if (toast) {
                toast.find('.toastr-progress').text(`Batch ${batchNum}/${initialBatchCount}`);
            }
            $('.openvault-backfill-toast .toast-message').text(...);
        } else if (progressCallback) {
            progressCallback(batchNum, initialBatchCount, eventsCreated);
        }
    }

    // Run Phase 2 enrichment
    // ...

    if (!isEmergencyCut && toast) {
        toastr.clear(toast);
    }

    // Call completion callback if provided
    if (updateEventListenersFn) {
        updateEventListenersFn(true);
    }

    // Return stats for Emergency Cut
    return { messagesProcessed: totalMessages, eventsCreated: totalEvents };
}
```

### 11.2 src/extraction/extract.js - AbortError Catch Block

**CRITICAL (v4):** Fix AbortError swallow bug at line ~1048.

```javascript
} catch (error) {
    // AbortError = chat switched (same as existing chat-change detection)
    if (error.name === 'AbortError' || error.message === 'Chat changed during extraction') {
        // CRITICAL (v4): For Emergency Cut, MUST throw to let handler catch it
        // Otherwise handler would hide messages on the WRONG chat after a switch
        if (isEmergencyCut) throw error;

        logDebug('Chat changed during backfill, aborting');
        $('.openvault-backfill-toast').remove();
        showToast('warning', 'Backfill aborted: chat changed', 'OpenVault');
        clearAllLocks();
        setStatus('ready');
        return;
    }
    // ... rest of error handling
}
```

**Why this matters:** Without this fix, if the user switches chats during Emergency Cut:
1. `extractAllMessages` catches AbortError and returns (resolves)
2. `handleEmergencyCut` continues to `hideExtractedMessages()`
3. Messages on the NEW chat get hidden - wrong chat!

With the fix, the error bubbles up to the handler's catch block, which shows the error toast without hiding anything.

### 11.3 src/ui/settings.js - Update handleExtractAll

```javascript
async function handleExtractAll() {
    const { extractAllMessages } = await import('../extraction/extract.js');
    const { isWorkerRunning } = await import('../extraction/worker.js');
    if (isWorkerRunning()) {
        showToast('warning', 'Background extraction in progress. Please wait.', 'OpenVault');
        return;
    }
    await extractAllMessages({ onComplete: updateEventListeners });
}
```

---

## 12. Implementation Checklist

- [ ] Add buttons to `templates/settings_panel.html`
- [ ] Add modal HTML to `templates/settings_panel.html`
- [ ] Add CSS to `css/dashboard.css`
- [ ] Implement `handleEmergencyCut()` in `src/ui/settings.js`
- [ ] Implement `hideExtractedMessages()` in `src/ui/settings.js`
- [ ] Bind button click in `bindUIElements()`
- [ ] Update `extractAllMessages()` to accept options object
- [ ] Fix AbortError swallow bug in `extractAllMessages()` catch block
- [ ] Update `handleExtractAll()` to use new options signature
- [ ] Add unit tests
- [ ] Add integration tests
- [ ] Add structure tests

---

## 13. Design Review Notes (v4)

### Critical Issues Fixed

1. **AbortError Swallow Bug** - `extractAllMessages()` was catching `AbortError` and returning instead of throwing. Fixed: throw if `isEmergencyCut: true`.

2. **Background Worker Collision** - Used existing `extractionInProgress` flag instead of adding new one. Worker already checks this flag at line 101 of `worker.js`.

3. **Modal z-index** - Bumped from 1000 to 9999 to ensure it covers ST's top-level navigation.

4. **State Management Simplified** - No new flag needed. Reuse `extractionInProgress`.

### Open Questions (Answered)

1. **Keyboard shortcut?** - No. Too destructive for accidental trigger. Button + confirmation is the right friction level.

2. **Clear Memories reset?** - Not needed. ST has built-in "Show Hidden Messages" toggle. Added hint in modal.

3. **Perf metrics?** - No. Underlying operations (`llm_events`, `chat_save`, etc.) already tracked.