# Design: Request Logging for LLM Calls

## 1. Problem Statement

When the upstream LLM API returns errors (e.g., 400 Bad Request), OpenVault only surfaces `error.message` — the full response body and the original request payload are lost. Users cannot diagnose whether the issue is content moderation, token limits, or malformed input without seeing what was actually sent and what the API actually returned.

## 2. Goals & Non-Goals

**Must do:**
- New "Request Logging" checkbox in Settings → System → Debug section
- Log the full request payload (messages array) sent to the LLM via `console.groupCollapsed`
- Capture and log whatever error detail survives through the Error chain (message, cause, stack)
- Log on both success and failure when enabled (request payload always, response summary on success, full error on failure)

**Won't do:**
- Modify SillyTavern's ConnectionManager code (out of scope)
- Persist request logs to storage
- Add network-level interception (service worker, etc.)

## 3. Proposed Architecture

### Approach: Wrapper in `callLLM()`

Instrument `src/llm.js:callLLM()` — the single chokepoint for all LLM calls. Before calling `deps.connectionManager.sendRequest()`, capture the full request. After success/failure, log the result.

This is the simplest approach because:
- All LLM calls already flow through `callLLM()`
- No need to patch or wrap external code
- The request payload (messages, maxTokens, config) is fully available here

### Key Components

1. **Setting:** `requestLogging` (boolean, default: `false`) in `constants.js`
2. **UI:** New checkbox in `settings_panel.html` under Debug card
3. **Binding:** New change handler in `ui/settings.js`
4. **Logging:** New `logRequest()` helper in `utils.js`

## 4. Data Models / Schema

### New Setting

```javascript
// constants.js - add to defaultSettings
requestLogging: false,
```

## 5. Interface / API Design

### `logRequest()` in `utils.js`

```javascript
/**
 * Log full LLM request/response to console when request logging is enabled.
 * Uses console.groupCollapsed for clean F12 experience.
 *
 * @param {string} label - Context label (e.g., "Extraction")
 * @param {Object} data - { messages, maxTokens, profileId, response?, error? }
 */
export function logRequest(label, data) {
    const settings = getDeps().getExtensionSettings()[extensionName];
    if (!settings?.requestLogging) return;

    const isError = !!data.error;
    const prefix = isError ? '❌' : '✅';
    const console = getDeps().console;

    console.groupCollapsed(`[OpenVault] ${prefix} ${label} — ${isError ? 'FAILED' : 'OK'}`);
    console.log('Profile:', data.profileId);
    console.log('Max Tokens:', data.maxTokens);
    console.log('Messages:', data.messages);  // browser shows collapsed object
    if (data.response) {
        console.log('Response:', data.response);
    }
    if (data.error) {
        console.error('Error:', data.error);
        if (data.error.cause) {
            console.error('Caused by:', data.error.cause);
        }
    }
    console.groupEnd();
}
```

### Changes to `callLLM()` in `llm.js`

```javascript
// After the sendRequest call resolves (success path):
logRequest(errorContext, { messages, maxTokens, profileId, response: content });

// In the catch block (error path):
logRequest(errorContext, { messages, maxTokens, profileId, error });
```

## 6. UI Changes

### `settings_panel.html` — Add after the Debug Mode checkbox (line ~515)

```html
<label class="checkbox_label">
    <input type="checkbox" id="openvault_request_logging" />
    <span>Request Logging</span>
</label>
<small class="openvault-hint">Log full LLM request/response payloads to browser console (F12). Useful for diagnosing API errors.</small>
```

### `ui/settings.js` — Add binding

```javascript
$('#openvault_request_logging').on('change', function () {
    saveSetting('requestLogging', $(this).is(':checked'));
});

// In updateUI:
$('#openvault_request_logging').prop('checked', settings.requestLogging);
```

## 7. Risks & Edge Cases

| Risk | Mitigation |
|------|------------|
| Large request payloads slow down console | `groupCollapsed` keeps them hidden until clicked; separate setting so it's opt-in |
| Messages contain sensitive RP content | Only logged to local browser console, never sent anywhere. Checkbox is off by default. |
| `getDeps().console.groupCollapsed` may not exist | Fall back to `console.log` if `groupCollapsed` is undefined |
| Error.cause chain may not preserve API response body | Log what's available; document that ST's ConnectionManager strips response details. This is still better than nothing — the request payload alone is enough to diagnose most 400 errors. |
