# Implementation Plan - Utils Refactor

> **Reference:** `docs/designs/2026-03-07-utils-refactor-design.md`
> **Execution:** Use `executing-plans` skill.

---

## Phase 1: Module Creation (TDD)

Modules are created in dependency order: leaf modules first, then `data.js` which depends on `logging.js` + `dom.js`. During this phase, `src/utils.js` remains intact — both old and new paths coexist.

---

### Task 1: Create `src/utils/dom.js` + Tests

**Goal:** Extract `escapeHtml` and `showToast` into a leaf module.

**Step 1: Write the Failing Test**
- File: `tests/utils/dom.test.js`
- Code:
  ```js
  import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
  import { resetDeps, setDeps } from '../../src/deps.js';
  import { escapeHtml, showToast } from '../../src/utils/dom.js';

  describe('dom', () => {
      afterEach(() => resetDeps());

      describe('escapeHtml', () => {
          it('escapes HTML special characters', () => {
              expect(escapeHtml('<script>alert("xss")</script>')).toBe(
                  '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
              );
          });

          it('escapes ampersands', () => {
              expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
          });

          it('escapes single quotes', () => {
              expect(escapeHtml("it's")).toBe('it&#039;s');
          });

          it('returns empty string for falsy input', () => {
              expect(escapeHtml(null)).toBe('');
              expect(escapeHtml(undefined)).toBe('');
              expect(escapeHtml('')).toBe('');
          });

          it('converts numbers to string', () => {
              expect(escapeHtml(123)).toBe('123');
          });
      });

      describe('showToast', () => {
          it('delegates to deps.showToast', () => {
              const mockShowToast = vi.fn();
              setDeps({ showToast: mockShowToast });

              showToast('success', 'Test message', 'Title', { timeout: 1000 });
              expect(mockShowToast).toHaveBeenCalledWith('success', 'Test message', 'Title', { timeout: 1000 });
          });
      });
  });
  ```

**Step 2: Run Test (Red)**
- Command: `npx vitest run tests/utils/dom.test.js`
- Expect: FAIL — module `../../src/utils/dom.js` not found.

**Step 3: Implementation (Green)**
- File: `src/utils/dom.js`
- Action: Extract `escapeHtml` and `showToast` from `src/utils.js`. Include the `getDeps` import for `showToast`.
- Code:
  ```js
  import { getDeps } from '../deps.js';

  /**
   * Escape HTML to prevent XSS
   * @param {string} str - String to escape
   * @returns {string}
   */
  export function escapeHtml(str) {
      if (!str) return '';
      return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
  }

  /**
   * Safe wrapper for toastr to handle cases where it might not be available
   * @param {string} type - 'success', 'error', 'warning', 'info'
   * @param {string} message - Message to display
   * @param {string} title - Toast title (default: 'OpenVault')
   * @param {object} options - Additional toastr options
   */
  export function showToast(type, message, title = 'OpenVault', options = {}) {
      getDeps().showToast(type, message, title, options);
  }
  ```

**Step 4: Verify (Green)**
- Command: `npx vitest run tests/utils/dom.test.js`
- Expect: PASS

**Step 5: Git Commit**
- `git add src/utils/dom.js tests/utils/dom.test.js && git commit -m "refactor(utils): extract dom.js module"`

---

### Task 2: Create `src/utils/logging.js` + Tests

**Goal:** Extract `log` and `logRequest` into a leaf module.

**Step 1: Write the Failing Test**
- File: `tests/utils/logging.test.js`
- Code:
  ```js
  import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
  import { extensionName } from '../../src/constants.js';
  import { resetDeps, setDeps } from '../../src/deps.js';
  import { log, logRequest } from '../../src/utils/logging.js';

  describe('logging', () => {
      let mockConsole;

      beforeEach(() => {
          mockConsole = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
      });
      afterEach(() => resetDeps());

      describe('log', () => {
          it('logs message when debug mode is enabled', () => {
              setDeps({
                  console: mockConsole,
                  getExtensionSettings: () => ({ [extensionName]: { debugMode: true } }),
              });
              log('test message');
              expect(mockConsole.log).toHaveBeenCalledWith('[OpenVault] test message');
          });

          it('does not log when debug mode is disabled', () => {
              setDeps({
                  console: mockConsole,
                  getExtensionSettings: () => ({ [extensionName]: { debugMode: false } }),
              });
              log('test message');
              expect(mockConsole.log).not.toHaveBeenCalled();
          });

          it('handles missing settings gracefully', () => {
              setDeps({
                  console: mockConsole,
                  getExtensionSettings: () => ({}),
              });
              log('test message');
              expect(mockConsole.log).not.toHaveBeenCalled();
          });
      });

      describe('logRequest', () => {
          it('does not log when requestLogging is disabled', () => {
              setDeps({
                  console: mockConsole,
                  getExtensionSettings: () => ({ [extensionName]: { requestLogging: false } }),
              });
              logRequest('Test', { messages: [], maxTokens: 100, profileId: 'p1' });
              expect(mockConsole.log).not.toHaveBeenCalled();
          });

          it('logs grouped output when requestLogging is enabled', () => {
              const groupCollapsed = vi.fn();
              const groupEnd = vi.fn();
              setDeps({
                  console: { ...mockConsole, groupCollapsed, groupEnd },
                  getExtensionSettings: () => ({ [extensionName]: { requestLogging: true } }),
              });
              logRequest('Extraction', { messages: ['m1'], maxTokens: 200, profileId: 'p2', response: 'ok' });
              expect(groupCollapsed).toHaveBeenCalledWith('[OpenVault] ✅ Extraction — OK');
              expect(mockConsole.log).toHaveBeenCalledWith('Profile:', 'p2');
              expect(mockConsole.log).toHaveBeenCalledWith('Response:', 'ok');
              expect(groupEnd).toHaveBeenCalled();
          });

          it('logs error label on failure', () => {
              const groupCollapsed = vi.fn();
              const groupEnd = vi.fn();
              setDeps({
                  console: { ...mockConsole, groupCollapsed, groupEnd },
                  getExtensionSettings: () => ({ [extensionName]: { requestLogging: true } }),
              });
              const err = new Error('boom');
              logRequest('Extraction', { messages: [], maxTokens: 100, profileId: 'p1', error: err });
              expect(groupCollapsed).toHaveBeenCalledWith('[OpenVault] ❌ Extraction — FAILED');
              expect(mockConsole.error).toHaveBeenCalledWith('Error:', err);
          });
      });
  });
  ```

**Step 2: Run Test (Red)**
- Command: `npx vitest run tests/utils/logging.test.js`
- Expect: FAIL — module not found.

**Step 3: Implementation (Green)**
- File: `src/utils/logging.js`
- Action: Extract `log` and `logRequest` from `src/utils.js`.
- Code:
  ```js
  import { extensionName } from '../constants.js';
  import { getDeps } from '../deps.js';

  /**
   * Log message if debug mode is enabled
   * @param {string} message
   */
  export function log(message) {
      const settings = getDeps().getExtensionSettings()[extensionName];
      if (settings?.debugMode) {
          getDeps().console.log(`[OpenVault] ${message}`);
      }
  }

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

**Step 4: Verify (Green)**
- Command: `npx vitest run tests/utils/logging.test.js`
- Expect: PASS

**Step 5: Git Commit**
- `git add src/utils/logging.js tests/utils/logging.test.js && git commit -m "refactor(utils): extract logging.js module"`

---

### Task 3: Create `src/utils/text.js` + Tests

**Goal:** Extract text processing and JSON parsing into a leaf module.

**Step 1: Write the Failing Test**
- File: `tests/utils/text.test.js`
- Code:
  ```js
  import { afterEach, describe, expect, it, vi } from 'vitest';
  import { resetDeps } from '../../src/deps.js';
  import {
      estimateTokens,
      safeParseJSON,
      sliceToTokenBudget,
      sortMemoriesBySequence,
      stripThinkingTags,
  } from '../../src/utils/text.js';

  describe('text', () => {
      afterEach(() => resetDeps());

      describe('estimateTokens', () => {
          it('estimates ~1 token per 3.5 chars', () => {
              // 7 chars → ceil(7/3.5) = 2
              expect(estimateTokens('1234567')).toBe(2);
          });

          it('returns 0 for empty/null', () => {
              expect(estimateTokens('')).toBe(0);
              expect(estimateTokens(null)).toBe(0);
          });
      });

      describe('sliceToTokenBudget', () => {
          it('slices to budget', () => {
              const memories = [
                  { summary: 'a'.repeat(35) },  // 10 tokens
                  { summary: 'b'.repeat(35) },  // 10 tokens
                  { summary: 'c'.repeat(35) },  // 10 tokens
              ];
              const result = sliceToTokenBudget(memories, 20);
              expect(result).toHaveLength(2);
          });

          it('returns empty for zero budget', () => {
              expect(sliceToTokenBudget([{ summary: 'x' }], 0)).toEqual([]);
          });

          it('returns empty for null input', () => {
              expect(sliceToTokenBudget(null, 100)).toEqual([]);
          });
      });

      describe('stripThinkingTags', () => {
          it('strips <think> tags', () => {
              expect(stripThinkingTags('<think>reasoning here</think>{"result": true}')).toBe('{"result": true}');
          });

          it('strips <thinking> tags', () => {
              expect(stripThinkingTags('<thinking>analysis</thinking>{"data": [1,2]}')).toBe('{"data": [1,2]}');
          });

          it('strips <reasoning> tags', () => {
              expect(stripThinkingTags('<reasoning>my thoughts</reasoning>[1,2,3]')).toBe('[1,2,3]');
          });

          it('handles multiline thinking', () => {
              expect(stripThinkingTags('<think>\nline1\nline2\n</think>{"ok": true}')).toBe('{"ok": true}');
          });

          it('handles multiple tags', () => {
              expect(stripThinkingTags('<think>a</think><reasoning>b</reasoning>{"x": 1}')).toBe('{"x": 1}');
          });

          it('returns original if no tags', () => {
              expect(stripThinkingTags('{"pure": "json"}')).toBe('{"pure": "json"}');
          });

          it('handles non-string input', () => {
              expect(stripThinkingTags(null)).toBe(null);
              expect(stripThinkingTags(undefined)).toBe(undefined);
              expect(stripThinkingTags(123)).toBe(123);
          });

          it('is case-insensitive', () => {
              expect(stripThinkingTags('<THINK>loud</THINK><Thinking>mixed</Thinking>{"done": true}')).toBe(
                  '{"done": true}'
              );
          });
      });

      describe('safeParseJSON', () => {
          beforeEach(() => {
              setupTestContext({ settings: { debugMode: true } });
          });

          it('parses valid JSON', () => {
              expect(safeParseJSON('{"key": "value"}')).toEqual({ key: 'value' });
          });

          it('extracts JSON from markdown code block', () => {
              expect(safeParseJSON('```json\n{"key": "value"}\n```')).toEqual({ key: 'value' });
          });

          it('handles arrays with recovery wrapper', () => {
              expect(safeParseJSON('[1, 2, 3]')).toEqual({
                  events: [1, 2, 3],
                  entities: [],
                  relationships: [],
                  reasoning: null,
              });
          });

          it('repairs malformed JSON with trailing comma', () => {
              expect(safeParseJSON('{"key": "value",}')).toEqual({ key: 'value' });
          });

          it('repairs JSON with unquoted keys', () => {
              expect(safeParseJSON('{key: "value"}')).toEqual({ key: 'value' });
          });

          it('repairs JSON with single quotes', () => {
              expect(safeParseJSON("{'key': 'value'}")).toEqual({ key: 'value' });
          });

          it('returns null on completely invalid input', () => {
              expect(safeParseJSON('not json at all')).toBeNull();
          });

          it('handles nested objects', () => {
              expect(safeParseJSON('{"outer": {"inner": "value"}}')).toEqual({ outer: { inner: 'value' } });
          });

          it('parses JSON after stripping think tags', () => {
              expect(safeParseJSON('<think>analyzing...</think>{"selected": [1, 2]}')).toEqual({ selected: [1, 2] });
          });

          it('handles thinking tags with markdown code block', () => {
              expect(safeParseJSON('<think>hmm</think>```json\n{"value": 42}\n```')).toEqual({ value: 42 });
          });

          it('extracts JSON from conversational response', () => {
              const input = 'Here is the result:\n\n{"selected": [1, 2, 3]}\n\nHope this helps!';
              expect(safeParseJSON(input)).toEqual({ selected: [1, 2, 3] });
          });

          it('extracts first JSON object when multiple present', () => {
              const input = '{"result": {"data": [1]}} some text {"other": "value"}';
              expect(safeParseJSON(input)).toEqual({ result: { data: [1] } });
          });
      });

      describe('sortMemoriesBySequence', () => {
          it('sorts by sequence ascending by default', () => {
              const memories = [
                  { id: '1', sequence: 30 },
                  { id: '2', sequence: 10 },
                  { id: '3', sequence: 20 },
              ];
              expect(sortMemoriesBySequence(memories).map((m) => m.id)).toEqual(['2', '3', '1']);
          });

          it('sorts by sequence descending when specified', () => {
              const memories = [
                  { id: '1', sequence: 30 },
                  { id: '2', sequence: 10 },
                  { id: '3', sequence: 20 },
              ];
              expect(sortMemoriesBySequence(memories, false).map((m) => m.id)).toEqual(['1', '3', '2']);
          });

          it('falls back to created_at when sequence missing', () => {
              const memories = [
                  { id: '1', created_at: 300 },
                  { id: '2', created_at: 100 },
                  { id: '3', sequence: 200 },
              ];
              expect(sortMemoriesBySequence(memories).map((m) => m.id)).toEqual(['2', '3', '1']);
          });

          it('does not mutate original array', () => {
              const memories = [{ id: '1', sequence: 30 }, { id: '2', sequence: 10 }];
              const sorted = sortMemoriesBySequence(memories);
              expect(memories[0].id).toBe('1');
              expect(sorted).not.toBe(memories);
          });

          it('handles empty array', () => {
              expect(sortMemoriesBySequence([])).toEqual([]);
          });
      });
  });
  ```

**Step 2: Run Test (Red)**
- Command: `npx vitest run tests/utils/text.test.js`
- Expect: FAIL — module not found.

**Step 3: Implementation (Green)**
- File: `src/utils/text.js`
- Action: Extract `estimateTokens`, `sliceToTokenBudget`, `stripThinkingTags`, `safeParseJSON`, `extractBalancedJSON` (private), `sortMemoriesBySequence` from `src/utils.js`. Include `jsonrepair` and `getDeps` imports.
- Code: Copy verbatim from `src/utils.js` lines 205–345, with these imports:
  ```js
  import { jsonrepair } from 'https://esm.sh/jsonrepair';
  import { getDeps } from '../deps.js';
  ```

**Step 4: Verify (Green)**
- Command: `npx vitest run tests/utils/text.test.js`
- Expect: PASS

**Step 5: Git Commit**
- `git add src/utils/text.js tests/utils/text.test.js && git commit -m "refactor(utils): extract text.js module"`

---

### Task 4: Create `src/utils/st-helpers.js` + Tests

**Goal:** Extract ST integration functions and async primitives into a leaf module. Delete `isAutomaticMode`.

**Step 1: Write the Failing Test**
- File: `tests/utils/st-helpers.test.js`
- Code:
  ```js
  import { afterEach, describe, expect, it, vi } from 'vitest';
  import { extensionName } from '../../src/constants.js';
  import { resetDeps, setDeps } from '../../src/deps.js';
  import { isExtensionEnabled, safeSetExtensionPrompt, withTimeout, yieldToMain } from '../../src/utils/st-helpers.js';

  describe('st-helpers', () => {
      afterEach(() => resetDeps());

      describe('withTimeout', () => {
          it('resolves when promise completes before timeout', async () => {
              const result = await withTimeout(Promise.resolve('success'), 1000, 'Test');
              expect(result).toBe('success');
          });

          it('rejects when promise exceeds timeout', async () => {
              const promise = new Promise((resolve) => setTimeout(resolve, 100));
              await expect(withTimeout(promise, 10, 'Test')).rejects.toThrow('Test timed out after 10ms');
          });
      });

      describe('safeSetExtensionPrompt', () => {
          it('calls setExtensionPrompt and returns true on success', () => {
              const mockSetPrompt = vi.fn();
              setDeps({
                  console: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
                  setExtensionPrompt: mockSetPrompt,
                  extension_prompt_types: { IN_PROMPT: 3 },
              });

              expect(safeSetExtensionPrompt('test content')).toBe(true);
              expect(mockSetPrompt).toHaveBeenCalledWith(extensionName, 'test content', 3, 0);
          });

          it('returns false on error', () => {
              setDeps({
                  console: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
                  setExtensionPrompt: () => { throw new Error('Prompt failed'); },
                  extension_prompt_types: { IN_PROMPT: 3 },
              });

              expect(safeSetExtensionPrompt('test content')).toBe(false);
          });

          it('passes custom name to setExtensionPrompt', () => {
              const mockSetPrompt = vi.fn();
              setDeps({
                  console: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
                  setExtensionPrompt: mockSetPrompt,
                  extension_prompt_types: { IN_PROMPT: 0 },
              });

              safeSetExtensionPrompt('test content', 'openvault_world');
              expect(mockSetPrompt).toHaveBeenCalledWith('openvault_world', 'test content', 0, 0);
          });

          it('defaults to extensionName when no name provided', () => {
              const mockSetPrompt = vi.fn();
              setDeps({
                  console: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
                  setExtensionPrompt: mockSetPrompt,
                  extension_prompt_types: { IN_PROMPT: 0 },
              });

              safeSetExtensionPrompt('test content');
              expect(mockSetPrompt).toHaveBeenCalledWith('openvault', 'test content', 0, 0);
          });
      });

      describe('isExtensionEnabled', () => {
          it('returns true when enabled is true', () => {
              setDeps({ getExtensionSettings: () => ({ [extensionName]: { enabled: true } }) });
              expect(isExtensionEnabled()).toBe(true);
          });

          it('returns false when enabled is false', () => {
              setDeps({ getExtensionSettings: () => ({ [extensionName]: { enabled: false } }) });
              expect(isExtensionEnabled()).toBe(false);
          });

          it('returns false when settings missing', () => {
              setDeps({ getExtensionSettings: () => ({}) });
              expect(isExtensionEnabled()).toBe(false);
          });
      });

      describe('yieldToMain', () => {
          it('returns a promise that resolves', async () => {
              await yieldToMain();
          });
      });
  });
  ```

**Step 2: Run Test (Red)**
- Command: `npx vitest run tests/utils/st-helpers.test.js`
- Expect: FAIL — module not found.

**Step 3: Implementation (Green)**
- File: `src/utils/st-helpers.js`
- Code:
  ```js
  import { extensionName } from '../constants.js';
  import { getDeps } from '../deps.js';

  /**
   * Wrap a promise with a timeout
   * @param {Promise} promise - The promise to wrap
   * @param {number} ms - Timeout in milliseconds
   * @param {string} operation - Name for error message
   * @returns {Promise} Promise that rejects on timeout
   */
  export function withTimeout(promise, ms, operation = 'Operation') {
      return Promise.race([
          promise,
          new Promise((_, reject) => setTimeout(() => reject(new Error(`${operation} timed out after ${ms}ms`)), ms)),
      ]);
  }

  /**
   * Safe wrapper for setExtensionPrompt with error handling
   * @param {string} content - Content to inject
   * @param {string} [name] - Named slot (defaults to extensionName for backwards compatibility)
   * @returns {boolean} True if successful
   */
  export function safeSetExtensionPrompt(content, name = extensionName) {
      try {
          const deps = getDeps();
          deps.setExtensionPrompt(name, content, deps.extension_prompt_types.IN_PROMPT, 0);
          return true;
      } catch (error) {
          getDeps().console.error('[OpenVault] Failed to set extension prompt:', error);
          return false;
      }
  }

  /**
   * Check if OpenVault extension is enabled
   * @returns {boolean}
   */
  export function isExtensionEnabled() {
      return getDeps().getExtensionSettings()[extensionName]?.enabled === true;
  }

  /**
   * Yield to the browser's main thread.
   * Use inside heavy for-loops to prevent UI freezing.
   * scheduler.yield() yields to the browser without artificial delay.
   * @returns {Promise<void>}
   */
  export function yieldToMain() {
      if (typeof scheduler !== 'undefined' && scheduler.yield) {
          return scheduler.yield();
      }
      return new Promise((resolve) => setTimeout(resolve, 0));
  }
  ```

**Step 4: Verify (Green)**
- Command: `npx vitest run tests/utils/st-helpers.test.js`
- Expect: PASS

**Step 5: Git Commit**
- `git add src/utils/st-helpers.js tests/utils/st-helpers.test.js && git commit -m "refactor(utils): extract st-helpers.js module"`

---

### Task 5: Create `src/utils/data.js` + Tests

**Goal:** Extract data access and mutation functions. This module depends on `logging.js` and `dom.js` (created in Tasks 1-2).

**Step 1: Write the Failing Test**
- File: `tests/utils/data.test.js`
- Code:
  ```js
  import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
  import { extensionName, CHARACTERS_KEY, LAST_PROCESSED_KEY, MEMORIES_KEY, METADATA_KEY } from '../../src/constants.js';
  import { resetDeps, setDeps } from '../../src/deps.js';
  import {
      deleteCurrentChatData,
      deleteCurrentChatEmbeddings,
      deleteMemory,
      generateId,
      getCurrentChatId,
      getOpenVaultData,
      saveOpenVaultData,
      updateMemory,
  } from '../../src/utils/data.js';

  describe('data', () => {
      let mockConsole;
      let mockContext;

      beforeEach(() => {
          mockConsole = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
          mockContext = { chatMetadata: {}, chatId: 'test-chat-123' };
          setupTestContext({
              settings: { debugMode: true },
              deps: { console: mockConsole, getContext: () => mockContext },
          });
      });
      afterEach(() => resetDeps());

      describe('getOpenVaultData', () => {
          it('creates empty data structure if none exists', () => {
              const data = getOpenVaultData();
              expect(data).toEqual({
                  [MEMORIES_KEY]: [],
                  [CHARACTERS_KEY]: {},
                  [LAST_PROCESSED_KEY]: -1,
              });
          });

          it('returns existing data if present', () => {
              const existing = { [MEMORIES_KEY]: [{ id: '1' }], [CHARACTERS_KEY]: {}, [LAST_PROCESSED_KEY]: 5 };
              mockContext.chatMetadata[METADATA_KEY] = existing;
              expect(getOpenVaultData()).toBe(existing);
          });

          it('returns null if context is not available', () => {
              setDeps({ console: mockConsole, getContext: () => null });
              expect(getOpenVaultData()).toBeNull();
              expect(mockConsole.warn).toHaveBeenCalled();
          });

          it('creates chatMetadata if missing', () => {
              mockContext.chatMetadata = undefined;
              const data = getOpenVaultData();
              expect(mockContext.chatMetadata).toBeDefined();
              expect(data).toBeDefined();
          });
      });

      describe('getCurrentChatId', () => {
          it('returns chatId from context', () => {
              expect(getCurrentChatId()).toBe('test-chat-123');
          });

          it('falls back to chat_metadata.chat_id', () => {
              mockContext.chatId = undefined;
              mockContext.chat_metadata = { chat_id: 'fallback-id' };
              expect(getCurrentChatId()).toBe('fallback-id');
          });

          it('returns null if no chat id available', () => {
              mockContext.chatId = undefined;
              expect(getCurrentChatId()).toBeNull();
          });
      });

      describe('saveOpenVaultData', () => {
          it('calls saveChatConditional and returns true', async () => {
              const mockSave = vi.fn().mockResolvedValue(undefined);
              setDeps({
                  console: mockConsole,
                  getContext: () => mockContext,
                  getExtensionSettings: () => ({ [extensionName]: { debugMode: true } }),
                  saveChatConditional: mockSave,
              });
              expect(await saveOpenVaultData()).toBe(true);
              expect(mockSave).toHaveBeenCalled();
          });

          it('returns false on failure', async () => {
              const mockShowToast = vi.fn();
              setDeps({
                  console: mockConsole,
                  getContext: () => mockContext,
                  getExtensionSettings: () => ({ [extensionName]: { debugMode: false } }),
                  saveChatConditional: vi.fn().mockRejectedValue(new Error('Save failed')),
                  showToast: mockShowToast,
              });
              expect(await saveOpenVaultData()).toBe(false);
              expect(mockConsole.error).toHaveBeenCalled();
          });

          it('returns false if expectedChatId does not match', async () => {
              const mockSave = vi.fn().mockResolvedValue(undefined);
              setDeps({
                  console: mockConsole,
                  getContext: () => mockContext,
                  getExtensionSettings: () => ({ [extensionName]: { debugMode: false } }),
                  saveChatConditional: mockSave,
              });
              expect(await saveOpenVaultData('different-chat-id')).toBe(false);
              expect(mockSave).not.toHaveBeenCalled();
          });

          it('saves when expectedChatId matches', async () => {
              const mockSave = vi.fn().mockResolvedValue(undefined);
              setDeps({
                  console: mockConsole,
                  getContext: () => mockContext,
                  getExtensionSettings: () => ({ [extensionName]: { debugMode: true } }),
                  saveChatConditional: mockSave,
              });
              expect(await saveOpenVaultData('test-chat-123')).toBe(true);
          });
      });

      describe('generateId', () => {
          it('generates unique IDs with timestamp prefix', () => {
              setDeps({ Date: { now: () => 1234567890 } });
              expect(generateId()).toMatch(/^1234567890-[a-z0-9]+$/);
          });

          it('generates different IDs on subsequent calls', () => {
              let time = 1000;
              setDeps({ Date: { now: () => time++ } });
              expect(generateId()).not.toBe(generateId());
          });
      });

      describe('updateMemory', () => {
          it('updates allowed fields and saves', async () => {
              const mockSave = vi.fn().mockResolvedValue(undefined);
              mockContext.chatMetadata[METADATA_KEY] = {
                  [MEMORIES_KEY]: [{ id: 'mem1', summary: 'old', importance: 3 }],
              };
              setDeps({
                  console: mockConsole,
                  getContext: () => mockContext,
                  getExtensionSettings: () => ({ [extensionName]: { debugMode: true } }),
                  saveChatConditional: mockSave,
              });
              const result = await updateMemory('mem1', { importance: 5 });
              expect(result).toBe(true);
              expect(mockContext.chatMetadata[METADATA_KEY][MEMORIES_KEY][0].importance).toBe(5);
          });

          it('invalidates embedding when summary changes', async () => {
              mockContext.chatMetadata[METADATA_KEY] = {
                  [MEMORIES_KEY]: [{ id: 'mem1', summary: 'old', embedding: [1, 2, 3] }],
              };
              setDeps({
                  console: mockConsole,
                  getContext: () => mockContext,
                  getExtensionSettings: () => ({ [extensionName]: { debugMode: true } }),
                  saveChatConditional: vi.fn().mockResolvedValue(undefined),
              });
              await updateMemory('mem1', { summary: 'new' });
              expect(mockContext.chatMetadata[METADATA_KEY][MEMORIES_KEY][0].embedding).toBeUndefined();
          });

          it('returns false for non-existent memory', async () => {
              mockContext.chatMetadata[METADATA_KEY] = { [MEMORIES_KEY]: [] };
              setDeps({
                  console: mockConsole,
                  getContext: () => mockContext,
                  getExtensionSettings: () => ({ [extensionName]: { debugMode: true } }),
              });
              expect(await updateMemory('nonexistent', { summary: 'x' })).toBe(false);
          });
      });

      describe('deleteMemory', () => {
          it('removes memory and saves', async () => {
              mockContext.chatMetadata[METADATA_KEY] = {
                  [MEMORIES_KEY]: [{ id: 'mem1' }, { id: 'mem2' }],
              };
              setDeps({
                  console: mockConsole,
                  getContext: () => mockContext,
                  getExtensionSettings: () => ({ [extensionName]: { debugMode: true } }),
                  saveChatConditional: vi.fn().mockResolvedValue(undefined),
              });
              expect(await deleteMemory('mem1')).toBe(true);
              expect(mockContext.chatMetadata[METADATA_KEY][MEMORIES_KEY]).toHaveLength(1);
              expect(mockContext.chatMetadata[METADATA_KEY][MEMORIES_KEY][0].id).toBe('mem2');
          });
      });

      describe('deleteCurrentChatData', () => {
          it('deletes openvault key from chatMetadata', async () => {
              mockContext.chatMetadata[METADATA_KEY] = { [MEMORIES_KEY]: [{ id: '1' }] };
              setDeps({
                  console: mockConsole,
                  getContext: () => mockContext,
                  getExtensionSettings: () => ({ [extensionName]: { debugMode: true } }),
                  saveChatConditional: vi.fn().mockResolvedValue(undefined),
              });
              expect(await deleteCurrentChatData()).toBe(true);
              expect(mockContext.chatMetadata[METADATA_KEY]).toBeUndefined();
          });
      });

      describe('deleteCurrentChatEmbeddings', () => {
          it('deletes embeddings from all memories', async () => {
              mockContext.chatMetadata[METADATA_KEY] = {
                  [MEMORIES_KEY]: [
                      { id: '1', embedding: [1, 2] },
                      { id: '2', embedding: [3, 4] },
                      { id: '3' },
                  ],
              };
              setDeps({
                  console: mockConsole,
                  getContext: () => mockContext,
                  getExtensionSettings: () => ({ [extensionName]: { debugMode: true } }),
                  saveChatConditional: vi.fn().mockResolvedValue(undefined),
              });
              const count = await deleteCurrentChatEmbeddings();
              expect(count).toBe(2);
              expect(mockContext.chatMetadata[METADATA_KEY][MEMORIES_KEY][0].embedding).toBeUndefined();
          });
      });
  });
  ```

**Step 2: Run Test (Red)**
- Command: `npx vitest run tests/utils/data.test.js`
- Expect: FAIL — module not found.

**Step 3: Implementation (Green)**
- File: `src/utils/data.js`
- Action: Extract all data functions from `src/utils.js`. Import `log` from `./logging.js` and `showToast` from `./dom.js`.
- Imports:
  ```js
  import { CHARACTERS_KEY, extensionName, LAST_PROCESSED_KEY, MEMORIES_KEY, METADATA_KEY } from '../constants.js';
  import { getDeps } from '../deps.js';
  import { showToast } from './dom.js';
  import { log } from './logging.js';
  ```
- Functions to copy verbatim: `getOpenVaultData`, `getCurrentChatId`, `saveOpenVaultData`, `generateId`, `updateMemory`, `deleteMemory`, `deleteCurrentChatData`, `deleteCurrentChatEmbeddings`.

**Step 4: Verify (Green)**
- Command: `npx vitest run tests/utils/data.test.js`
- Expect: PASS

**Step 5: Git Commit**
- `git add src/utils/data.js tests/utils/data.test.js && git commit -m "refactor(utils): extract data.js module"`

---

## Phase 2: Consumer Rewiring

All tasks in this phase are mechanical import path changes. `src/utils.js` still exists, so both old and new paths resolve. Verification after each task: run the full test suite.

**Verification command for all Phase 2 tasks:** `npx vitest run`

---

### Task 6: Rewire `src/pov.js`, `src/llm.js`, `src/embeddings.js`

**Goal:** Update root-level source files to import from sub-modules.

**Changes:**

`src/pov.js` — replace:
```js
import { getOpenVaultData, log } from './utils.js';
```
with:
```js
import { getOpenVaultData } from './utils/data.js';
import { log } from './utils/logging.js';
```

`src/llm.js` — replace:
```js
import { log, logRequest, showToast, withTimeout } from './utils.js';
```
with:
```js
import { showToast } from './utils/dom.js';
import { log, logRequest } from './utils/logging.js';
import { withTimeout } from './utils/st-helpers.js';
```

`src/embeddings.js` — replace:
```js
import { log } from './utils.js';
```
with:
```js
import { log } from './utils/logging.js';
```

**Verify:** `npx vitest run`

**Git Commit:** `git add src/pov.js src/llm.js src/embeddings.js && git commit -m "refactor(utils): rewire pov, llm, embeddings imports"`

---

### Task 7: Rewire `src/prompts.js`, `src/events.js`

**Goal:** Update remaining root source files. Apply `isAutomaticMode` → `isExtensionEnabled` rename in `events.js`.

**Changes:**

`src/prompts.js` — replace:
```js
import { sortMemoriesBySequence } from './utils.js';
```
with:
```js
import { sortMemoriesBySequence } from './utils/text.js';
```

`src/events.js` — replace:
```js
import { getOpenVaultData, isAutomaticMode, log, safeSetExtensionPrompt, showToast, withTimeout } from './utils.js';
```
with:
```js
import { getOpenVaultData } from './utils/data.js';
import { showToast } from './utils/dom.js';
import { log } from './utils/logging.js';
import { isExtensionEnabled, safeSetExtensionPrompt, withTimeout } from './utils/st-helpers.js';
```
Then find-replace all `isAutomaticMode` usages in `src/events.js` → `isExtensionEnabled`.

**Verify:** `npx vitest run`

**Git Commit:** `git add src/prompts.js src/events.js && git commit -m "refactor(utils): rewire prompts, events imports (collapse isAutomaticMode)"`

---

### Task 8: Rewire `src/graph/graph.js`, `src/graph/communities.js`

**Goal:** Update graph module imports.

**Changes:**

`src/graph/graph.js` — replace:
```js
import { log } from '../utils.js';
```
with:
```js
import { log } from '../utils/logging.js';
```

`src/graph/communities.js` — replace:
```js
import { log, yieldToMain } from '../utils.js';
```
with:
```js
import { log } from '../utils/logging.js';
import { yieldToMain } from '../utils/st-helpers.js';
```

**Verify:** `npx vitest run`

**Git Commit:** `git add src/graph/graph.js src/graph/communities.js && git commit -m "refactor(utils): rewire graph imports"`

---

### Task 9: Rewire `src/extraction/worker.js`, `src/extraction/structured.js`, `src/extraction/scheduler.js`

**Goal:** Update extraction module imports (simple files).

**Changes:**

`src/extraction/worker.js` — replace:
```js
import { getCurrentChatId, getOpenVaultData, isExtensionEnabled, log } from '../utils.js';
```
with:
```js
import { getCurrentChatId, getOpenVaultData } from '../utils/data.js';
import { log } from '../utils/logging.js';
import { isExtensionEnabled } from '../utils/st-helpers.js';
```

`src/extraction/structured.js` — replace:
```js
import { stripThinkingTags } from '../utils.js';
```
with:
```js
import { stripThinkingTags } from '../utils/text.js';
```

`src/extraction/scheduler.js` — replace:
```js
import { estimateTokens } from '../utils.js';
```
with:
```js
import { estimateTokens } from '../utils/text.js';
```

**Verify:** `npx vitest run`

**Git Commit:** `git add src/extraction/worker.js src/extraction/structured.js src/extraction/scheduler.js && git commit -m "refactor(utils): rewire extraction imports (worker, structured, scheduler)"`

---

### Task 10: Rewire `src/extraction/extract.js`

**Goal:** Rewire the largest consumer (11 imports from utils.js). Solo task due to import complexity.

**Changes:**

`src/extraction/extract.js` — replace the multi-line import block:
```js
import {
    estimateTokens,
    getCurrentChatId,
    getOpenVaultData,
    isExtensionEnabled,
    log,
    safeSetExtensionPrompt,
    saveOpenVaultData,
    showToast,
    sliceToTokenBudget,
    sortMemoriesBySequence,
    yieldToMain,
} from '../utils.js';
```
with:
```js
import { getCurrentChatId, getOpenVaultData, saveOpenVaultData } from '../utils/data.js';
import { showToast } from '../utils/dom.js';
import { log } from '../utils/logging.js';
import { isExtensionEnabled, safeSetExtensionPrompt, yieldToMain } from '../utils/st-helpers.js';
import { estimateTokens, sliceToTokenBudget, sortMemoriesBySequence } from '../utils/text.js';
```

**Verify:** `npx vitest run`

**Git Commit:** `git add src/extraction/extract.js && git commit -m "refactor(utils): rewire extract.js imports"`

---

### Task 11: Rewire `src/reflection/reflect.js`, `src/retrieval/formatting.js`, `src/retrieval/world-context.js`

**Goal:** Update reflection and simple retrieval imports.

**Changes:**

`src/reflection/reflect.js` — replace:
```js
import { generateId, log, sortMemoriesBySequence } from '../utils.js';
```
with:
```js
import { generateId } from '../utils/data.js';
import { log } from '../utils/logging.js';
import { sortMemoriesBySequence } from '../utils/text.js';
```

`src/retrieval/formatting.js` — replace:
```js
import { estimateTokens } from '../utils.js';
```
with:
```js
import { estimateTokens } from '../utils/text.js';
```

`src/retrieval/world-context.js` — replace:
```js
import { estimateTokens } from '../utils.js';
```
with:
```js
import { estimateTokens } from '../utils/text.js';
```

**Verify:** `npx vitest run`

**Git Commit:** `git add src/reflection/reflect.js src/retrieval/formatting.js src/retrieval/world-context.js && git commit -m "refactor(utils): rewire reflection, formatting, world-context imports"`

---

### Task 12: Rewire `src/retrieval/retrieve.js`, `src/retrieval/scoring.js`

**Goal:** Update retrieval imports. Apply `isAutomaticMode` → `isExtensionEnabled` rename in `retrieve.js`.

**Changes:**

`src/retrieval/retrieve.js` — replace:
```js
import { getOpenVaultData, isAutomaticMode, isExtensionEnabled, log, safeSetExtensionPrompt } from '../utils.js';
```
with:
```js
import { getOpenVaultData } from '../utils/data.js';
import { log } from '../utils/logging.js';
import { isExtensionEnabled, safeSetExtensionPrompt } from '../utils/st-helpers.js';
```
Note: `isAutomaticMode` was already imported alongside `isExtensionEnabled` — just drop the `isAutomaticMode` import and replace any call sites with `isExtensionEnabled`.

`src/retrieval/scoring.js` — replace:
```js
import { log, sliceToTokenBudget } from '../utils.js';
```
with:
```js
import { log } from '../utils/logging.js';
import { sliceToTokenBudget } from '../utils/text.js';
```

**Verify:** `npx vitest run`

**Git Commit:** `git add src/retrieval/retrieve.js src/retrieval/scoring.js && git commit -m "refactor(utils): rewire retrieve, scoring imports (collapse isAutomaticMode)"`

---

### Task 13: Rewire `src/ui/templates.js`, `src/ui/status.js`, `src/ui/export-debug.js`

**Goal:** Update UI module imports (batch 1).

**Changes:**

`src/ui/templates.js` — replace:
```js
import { escapeHtml } from '../utils.js';
```
with:
```js
import { escapeHtml } from '../utils/dom.js';
```

`src/ui/status.js` — replace:
```js
import { getOpenVaultData, log } from '../utils.js';
```
with:
```js
import { getOpenVaultData } from '../utils/data.js';
import { log } from '../utils/logging.js';
```

`src/ui/export-debug.js` — replace:
```js
import { getOpenVaultData, showToast } from '../utils.js';
```
with:
```js
import { getOpenVaultData } from '../utils/data.js';
import { showToast } from '../utils/dom.js';
```

**Verify:** `npx vitest run`

**Git Commit:** `git add src/ui/templates.js src/ui/status.js src/ui/export-debug.js && git commit -m "refactor(utils): rewire ui imports (templates, status, export-debug)"`

---

### Task 14: Rewire `src/ui/settings.js`, `src/ui/render.js`

**Goal:** Update UI module imports (batch 2).

**Changes:**

`src/ui/settings.js` — replace:
```js
import { deleteCurrentChatData, deleteCurrentChatEmbeddings, getOpenVaultData, showToast } from '../utils.js';
```
with:
```js
import { deleteCurrentChatData, deleteCurrentChatEmbeddings, getOpenVaultData } from '../utils/data.js';
import { showToast } from '../utils/dom.js';
```

`src/ui/render.js` — replace:
```js
import {
    deleteMemory as deleteMemoryAction,
    escapeHtml,
    getOpenVaultData,
    showToast,
    updateMemory as updateMemoryAction,
} from '../utils.js';
```
with:
```js
import {
    deleteMemory as deleteMemoryAction,
    getOpenVaultData,
    updateMemory as updateMemoryAction,
} from '../utils/data.js';
import { escapeHtml, showToast } from '../utils/dom.js';
```

**Verify:** `npx vitest run`

**Git Commit:** `git add src/ui/settings.js src/ui/render.js && git commit -m "refactor(utils): rewire ui imports (settings, render)"`

---

## Phase 3: Cleanup

### Task 15: Delete old files, full verification

**Goal:** Remove `src/utils.js` and `tests/utils.test.js`. Verify zero references remain.

**Step 1: Verify no remaining imports of the old path**
- Command: Search for `from.*['"].*\./utils\.js` and `from.*['"].*\.\./utils\.js` across `src/`. Should return zero hits (graph/graph.js imports from `../utils/stopwords.js` which is fine — only checking for bare `utils.js`).

**Step 2: Delete old files**
- Delete `src/utils.js`
- Delete `tests/utils.test.js`

**Step 3: Full test suite**
- Command: `npm test`
- Expect: All tests pass. No import resolution errors.

**Step 4: Git Commit**
- `git add -A && git commit -m "refactor(utils): delete monolithic utils.js, migration complete"`
