# Implementation Plan - Request Logging

> **Reference:** `docs/designs/2026-03-04-request-logging-design.md`
> **Execution:** Use `executing-plans` skill.

---

### Task 1: Add Setting Default

**Goal:** Register `requestLogging` in default settings.

**Step 1: Edit**
- File: `src/constants.js`
- Action: Add `requestLogging: false,` after `debugMode: false,` (line 28)
- Exact code:
  ```javascript
  debugMode: false,
  requestLogging: false,
  ```

**Step 2: Verify**
- Command: Search `src/constants.js` for `requestLogging` — confirm it exists.

**Step 3: Git Commit**
- `git add src/constants.js && git commit -m "feat: add requestLogging setting default"`

---

### Task 2: Add `logRequest()` Helper

**Goal:** Create the console logging function in utils.js.

**Step 1: Edit**
- File: `src/utils.js`
- Action: Add the following function after the existing `log()` function (after line ~62):

```javascript
/**
 * Log full LLM request/response to console when request logging is enabled.
 * Uses console.groupCollapsed for clean F12 experience.
 * @param {string} label - Context label (e.g., "Extraction")
 * @param {Object} data - { messages, maxTokens, profileId, response?, error? }
 */
export function logRequest(label, data) {
    const settings = getDeps().getExtensionSettings()[extensionName];
    if (!settings?.requestLogging) return;

    const isError = !!data.error;
    const prefix = isError ? '❌' : '✅';
    const c = getDeps().console;
    const group = c.groupCollapsed ? c.groupCollapsed.bind(c) : c.log.bind(c);
    const groupEnd = c.groupEnd ? c.groupEnd.bind(c) : () => {};

    group(`[OpenVault] ${prefix} ${label} — ${isError ? 'FAILED' : 'OK'}`);
    c.log('Profile:', data.profileId);
    c.log('Max Tokens:', data.maxTokens);
    c.log('Messages:', data.messages);
    if (data.response !== undefined) {
        c.log('Response:', data.response);
    }
    if (data.error) {
        c.error('Error:', data.error);
        if (data.error.cause) {
            c.error('Caused by:', data.error.cause);
        }
    }
    groupEnd();
}
```

**Step 2: Verify**
- Command: Search `src/utils.js` for `logRequest` — confirm function exists and is exported.

**Step 3: Git Commit**
- `git add src/utils.js && git commit -m "feat: add logRequest() helper for request debugging"`

---

### Task 3: Instrument `callLLM()`

**Goal:** Add request/response logging calls in the LLM chokepoint.

**Step 1: Edit Import**
- File: `src/llm.js`, line 16
- Change: `import { log, showToast, withTimeout } from './utils.js';`
- To: `import { log, logRequest, showToast, withTimeout } from './utils.js';`

**Step 2: Add Success Logging**
- File: `src/llm.js`
- Action: After the line `log(\`LLM response received (${content.length} chars)\`);` (around line 109), add:
  ```javascript
  logRequest(errorContext, { messages, maxTokens, profileId, response: content });
  ```

**Step 3: Add Error Logging**
- File: `src/llm.js`
- Action: In the catch block, before `throw error;` (around line 130), add:
  ```javascript
  logRequest(errorContext, { messages, maxTokens, profileId, error });
  ```

**Step 4: Verify**
- Command: Search `src/llm.js` for `logRequest` — confirm 3 occurrences (1 import + 2 calls).

**Step 5: Git Commit**
- `git add src/llm.js && git commit -m "feat: instrument callLLM with request logging"`

---

### Task 4: Add UI Checkbox

**Goal:** Add the Request Logging checkbox to the settings panel.

**Step 1: Edit HTML**
- File: `templates/settings_panel.html`
- Action: After the Debug Mode hint line (`<small class="openvault-hint">Enable verbose logging to console</small>`, around line 515), add:
  ```html
  <label class="checkbox_label">
      <input type="checkbox" id="openvault_request_logging" />
      <span>Request Logging</span>
  </label>
  <small class="openvault-hint">Log full LLM request/response payloads to browser console (F12). Useful for diagnosing API errors.</small>
  ```

**Step 2: Edit Settings Binding**
- File: `src/ui/settings.js`
- Action: After the `$('#openvault_debug').on('change', ...)` block (around line 273), add:
  ```javascript
  $('#openvault_request_logging').on('change', function () {
      saveSetting('requestLogging', $(this).is(':checked'));
  });
  ```

**Step 3: Edit UI Update**
- File: `src/ui/settings.js`
- Action: After `$('#openvault_debug').prop('checked', settings.debugMode);` (around line 478), add:
  ```javascript
  $('#openvault_request_logging').prop('checked', settings.requestLogging);
  ```

**Step 4: Verify**
- Search `settings_panel.html` for `openvault_request_logging` — 1 occurrence.
- Search `src/ui/settings.js` for `requestLogging` — 2 occurrences.

**Step 5: Git Commit**
- `git add templates/settings_panel.html src/ui/settings.js && git commit -m "feat: add Request Logging checkbox to settings UI"`
