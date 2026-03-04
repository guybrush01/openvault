# Implementation Plan - Export Debug to Clipboard

> **Reference:** `docs/designs/2026-03-04-export-debug-clipboard-design.md`
> **Execution:** Use `executing-plans` skill.

---

### Task 1: Create Debug Cache Module

**Goal:** Create `src/retrieval/debug-cache.js` with cache/get/clear functions.

**Step 1: Write the Failing Test**
- File: `tests/retrieval/debug-cache.test.js`
- Code:
  ```javascript
  import { describe, expect, it, beforeEach } from 'vitest';
  import { cacheRetrievalDebug, getLastRetrievalDebug, clearRetrievalDebug } from '../../src/retrieval/debug-cache.js';

  describe('debug-cache', () => {
      beforeEach(() => {
          clearRetrievalDebug();
      });

      it('returns null when no data cached', () => {
          expect(getLastRetrievalDebug()).toBeNull();
      });

      it('caches and retrieves data with timestamp', () => {
          const data = { filters: { total: 10 } };
          cacheRetrievalDebug(data);
          const result = getLastRetrievalDebug();
          expect(result.filters.total).toBe(10);
          expect(result.timestamp).toBeTypeOf('number');
      });

      it('merges successive cache calls', () => {
          cacheRetrievalDebug({ filters: { total: 10 } });
          cacheRetrievalDebug({ queryContext: { entities: ['Alice'] } });
          const result = getLastRetrievalDebug();
          expect(result.filters.total).toBe(10);
          expect(result.queryContext.entities).toEqual(['Alice']);
      });

      it('clears cache', () => {
          cacheRetrievalDebug({ filters: { total: 10 } });
          clearRetrievalDebug();
          expect(getLastRetrievalDebug()).toBeNull();
      });
  });
  ```

**Step 2: Run Test (Red)**
- Command: `npm test -- tests/retrieval/debug-cache.test.js`
- Expect: Fail — module not found

**Step 3: Implementation (Green)**
- File: `src/retrieval/debug-cache.js`
- Code:
  ```javascript
  /**
   * OpenVault Debug Cache
   *
   * Stores intermediates from the last retrieval run for debug export.
   * Updated by retrieve.js/scoring.js at key decision points.
   */

  /** @type {Object|null} */
  let lastRetrieval = null;

  /**
   * Cache retrieval debug data. Merges with existing cache (additive).
   * @param {Object} data - Key-value pairs to cache
   */
  export function cacheRetrievalDebug(data) {
      if (!lastRetrieval) {
          lastRetrieval = { timestamp: Date.now() };
      }
      Object.assign(lastRetrieval, data);
      lastRetrieval.timestamp = Date.now();
  }

  /**
   * Get the last cached retrieval debug data.
   * @returns {Object|null}
   */
  export function getLastRetrievalDebug() {
      return lastRetrieval;
  }

  /**
   * Clear the debug cache (call on chat change).
   */
  export function clearRetrievalDebug() {
      lastRetrieval = null;
  }
  ```

**Step 4: Verify (Green)**
- Command: `npm test -- tests/retrieval/debug-cache.test.js`
- Expect: PASS

**Step 5: Git Commit**
- Command: `git add src/retrieval/debug-cache.js tests/retrieval/debug-cache.test.js && git commit -m "feat: add retrieval debug cache module"`

---

### Task 2: Wire Cache into Retrieval Pipeline

**Goal:** Add cache calls in `retrieve.js` and `scoring.js` to capture intermediates during retrieval.

**Step 1: Write the Failing Test**
- File: `tests/retrieval/debug-cache-integration.test.js`
- Code:
  ```javascript
  import { describe, expect, it } from 'vitest';
  import { cacheRetrievalDebug } from '../../src/retrieval/debug-cache.js';

  describe('debug cache import verification', () => {
      it('cacheRetrievalDebug is importable from retrieve.js dependencies', async () => {
          // Verify the module can be imported (ensures no circular deps)
          const mod = await import('../../src/retrieval/debug-cache.js');
          expect(mod.cacheRetrievalDebug).toBeTypeOf('function');
          expect(mod.clearRetrievalDebug).toBeTypeOf('function');
      });
  });
  ```

**Step 2: Run Test (Red)**
- Command: `npm test -- tests/retrieval/debug-cache-integration.test.js`
- Expect: PASS (this is a smoke test — the real verification is manual)

**Step 3: Implementation (Green)**

**File: `src/retrieval/retrieve.js`**
- Add import at top:
  ```javascript
  import { cacheRetrievalDebug } from './debug-cache.js';
  ```
- In `retrieveAndInjectContext()`, after the POV filter log line (~line 166), add:
  ```javascript
  cacheRetrievalDebug({
      filters: {
          totalMemories: memories.length,
          hiddenMemories: hiddenMemories.length,
          afterPOVFilter: accessibleMemories.length,
      },
      povCharacters,
  });
  ```
- In `selectFormatAndInject()`, after `injectContext(formattedContext)` (~line 114), add:
  ```javascript
  cacheRetrievalDebug({
      injectedContext: formattedContext,
      selectedCount: relevantMemories.length,
  });
  ```
- In `selectFormatAndInject()`, after the world context injection block (~line 133), add:
  ```javascript
  // Cache world context result for debug export
  if (worldResult?.text) {
      cacheRetrievalDebug({ injectedWorldContext: worldResult.text });
  }
  ```
  Note: `worldResult` is scoped inside the `if` block. Move the cache call inside:
  ```javascript
  if (worldQueryEmbedding) {
      const worldResult = retrieveWorldContext(worldCommunities, worldQueryEmbedding, ctx.worldContextBudget);
      safeSetExtensionPrompt(worldResult.text, 'openvault_world');
      cacheRetrievalDebug({ injectedWorldContext: worldResult.text });
  }
  ```
- In `retrieveAndInjectContext()`, after `const ctx = buildRetrievalContext()` (~line 175), add:
  ```javascript
  cacheRetrievalDebug({
      retrievalContext: {
          userMessages: ctx.userMessages,
          chatLength: ctx.chatLength,
          primaryCharacter: ctx.primaryCharacter,
          activeCharacters: ctx.activeCharacters,
          tokenBudget: ctx.finalTokens,
          worldContextBudget: ctx.worldContextBudget,
      },
  });
  ```

**File: `src/retrieval/scoring.js`**
- Add import at top:
  ```javascript
  import { cacheRetrievalDebug } from './debug-cache.js';
  ```
- In `selectRelevantMemoriesSimple()`, after the `extractQueryContext` call and before the embedding fetch, add:
  ```javascript
  cacheRetrievalDebug({
      queryContext: {
          entities: queryContext.entities,
          embeddingQuery: embeddingQuery,
          bm25TokenCount: Array.isArray(bm25Tokens) ? bm25Tokens.length : 0,
      },
  });
  ```

**Step 4: Verify (Green)**
- Command: `npm test`
- Expect: All existing tests still PASS (no logic changes, only additive cache calls)

**Step 5: Git Commit**
- Command: `git add src/retrieval/retrieve.js src/retrieval/scoring.js tests/retrieval/debug-cache-integration.test.js && git commit -m "feat: wire debug cache into retrieval pipeline"`

---

### Task 3: Clear Cache on Chat Change

**Goal:** Call `clearRetrievalDebug()` in `onChatChanged()` to prevent stale data.

**Step 1: No test needed** — this is a 2-line change to an event handler.

**Step 2: Implementation**

**File: `src/events.js`**
- Add import at top:
  ```javascript
  import { clearRetrievalDebug } from './retrieval/debug-cache.js';
  ```
- In `onChatChanged()` function (line 183), after `clearEmbeddingCache()` (line 190), add:
  ```javascript
  clearRetrievalDebug();
  ```

**Step 3: Verify**
- Command: `npm test`
- Expect: All tests PASS

**Step 4: Git Commit**
- Command: `git add src/events.js && git commit -m "feat: clear debug cache on chat change"`

---

### Task 4: Build Export Payload Function

**Goal:** Create `src/ui/export-debug.js` with `buildExportPayload()` that assembles the full debug JSON.

**Step 1: Write the Failing Test**
- File: `tests/ui/export-debug.test.js`
- Code:
  ```javascript
  import { describe, expect, it, beforeEach, vi } from 'vitest';

  // Mock deps before import
  vi.mock('../../src/deps.js', () => ({
      getDeps: () => ({
          getExtensionSettings: () => ({
              openvault: {
                  alpha: 0.7,
                  vectorSimilarityThreshold: 0.5,
                  combinedBoostWeight: 15,
                  forgetfulnessBaseLambda: 0.05,
                  forgetfulnessImportance5Floor: 5,
                  retrievalFinalTokens: 10000,
                  worldContextBudget: 2000,
                  embeddingSource: 'multilingual-e5-small',
                  debugMode: false,
                  enabled: true,
              },
          }),
          getContext: () => ({
              chat: [{ mes: 'hello', is_system: false, is_user: true }],
              name2: 'Alice',
              chatMetadata: {
                  openvault: {
                      memories: [
                          { id: '1', type: 'event', summary: 'Test', importance: 3, characters_involved: ['Alice'], embedding: new Float32Array(384) },
                          { id: '2', type: 'reflection', summary: 'Insight', importance: 4, characters_involved: ['Alice'] },
                      ],
                      character_states: {
                          Alice: { name: 'Alice', current_emotion: 'happy', emotion_intensity: 5, known_events: ['1'] },
                      },
                      graph: {
                          nodes: {
                              alice: { name: 'Alice', type: 'PERSON', description: 'Main char', mentions: 10 },
                              garden: { name: 'Garden', type: 'PLACE', description: 'A garden', mentions: 5 },
                          },
                          edges: {
                              alice__garden: { source: 'alice', target: 'garden', description: 'visits', weight: 3 },
                          },
                      },
                      communities: {
                          c1: { title: 'Alice World', summary: 'Summary', findings: ['f1'], nodes: ['alice', 'garden'], embedding: new Float32Array(384) },
                      },
                  },
              },
          }),
      }),
  }));

  vi.mock('../../src/embeddings.js', () => ({
      isEmbeddingsEnabled: () => true,
  }));

  // Must import after mocks
  const { buildExportPayload } = await import('../../src/ui/export-debug.js');
  const { cacheRetrievalDebug, clearRetrievalDebug } = await import('../../src/retrieval/debug-cache.js');

  describe('buildExportPayload', () => {
      beforeEach(() => {
          clearRetrievalDebug();
      });

      it('returns payload with marker and timestamp', () => {
          const payload = buildExportPayload();
          expect(payload.openvault_debug_export).toBe(true);
          expect(payload.exportedAt).toBeTypeOf('string');
      });

      it('includes memory stats', () => {
          const payload = buildExportPayload();
          expect(payload.state.memories.total).toBe(2);
          expect(payload.state.memories.byType.event).toBe(1);
          expect(payload.state.memories.byType.reflection).toBe(1);
      });

      it('includes character states without known_events array', () => {
          const payload = buildExportPayload();
          expect(payload.state.characterStates.Alice.emotion).toBe('happy');
          expect(payload.state.characterStates.Alice.knownEvents).toBe(1); // count, not array
      });

      it('includes graph summary with top entities', () => {
          const payload = buildExportPayload();
          expect(payload.state.graph.summary.nodeCount).toBe(2);
          expect(payload.state.graph.summary.edgeCount).toBe(1);
          expect(payload.state.graph.summary.topEntitiesByMentions[0].name).toBe('Alice');
      });

      it('includes graph raw without embeddings', () => {
          const payload = buildExportPayload();
          expect(payload.state.graph.raw.nodes.alice).toBeDefined();
          expect(payload.state.graph.raw.nodes.alice.embedding).toBeUndefined();
      });

      it('strips embeddings from community details', () => {
          const payload = buildExportPayload();
          expect(payload.state.communities.details.c1.title).toBe('Alice World');
          expect(payload.state.communities.details.c1.embedding).toBeUndefined();
      });

      it('includes settings', () => {
          const payload = buildExportPayload();
          expect(payload.settings.alpha).toBe(0.7);
          expect(payload.settings.embeddingsEnabled).toBe(true);
      });

      it('includes lastRetrieval when cached', () => {
          cacheRetrievalDebug({
              filters: { totalMemories: 10, hiddenMemories: 5, afterPOVFilter: 4 },
              injectedContext: '<scene_memory>test</scene_memory>',
          });
          const payload = buildExportPayload();
          expect(payload.lastRetrieval.filters.totalMemories).toBe(10);
          expect(payload.lastRetrieval.injectedContext).toBe('<scene_memory>test</scene_memory>');
      });

      it('sets lastRetrieval to null when no cache', () => {
          const payload = buildExportPayload();
          expect(payload.lastRetrieval).toBeNull();
      });
  });
  ```

**Step 2: Run Test (Red)**
- Command: `npm test -- tests/ui/export-debug.test.js`
- Expect: Fail — module not found

**Step 3: Implementation (Green)**
- File: `src/ui/export-debug.js`
- Code:
  ```javascript
  /**
   * OpenVault Debug Export
   *
   * Assembles and exports full system state + last retrieval debug data to clipboard.
   */

  import { extensionName, CHARACTERS_KEY, MEMORIES_KEY } from '../constants.js';
  import { getDeps } from '../deps.js';
  import { isEmbeddingsEnabled } from '../embeddings.js';
  import { getLastRetrievalDebug } from '../retrieval/debug-cache.js';
  import { getOpenVaultData, showToast } from '../utils.js';

  const RECENT_CONTEXT_CAP = 2000;

  /**
   * Strip embedding arrays from an object (shallow clone).
   * @param {Object} obj
   * @returns {Object} Clone without 'embedding' key
   */
  function stripEmbedding(obj) {
      if (!obj || typeof obj !== 'object') return obj;
      const clone = { ...obj };
      delete clone.embedding;
      return clone;
  }

  /**
   * Build memory statistics from memories array.
   * @param {Object[]} memories
   * @returns {Object}
   */
  function buildMemoryStats(memories) {
      const byType = {};
      const byImportance = {};
      let importanceSum = 0;

      for (const m of memories) {
          const type = m.type || 'unknown';
          byType[type] = (byType[type] || 0) + 1;
          const imp = String(m.importance || 0);
          byImportance[imp] = (byImportance[imp] || 0) + 1;
          importanceSum += m.importance || 0;
      }

      return {
          total: memories.length,
          byType,
          byImportance,
          averageImportance: memories.length > 0 ? Math.round((importanceSum / memories.length) * 100) / 100 : 0,
      };
  }

  /**
   * Build character state summary (counts instead of arrays).
   * @param {Object} characterStates
   * @returns {Object}
   */
  function buildCharacterSummary(characterStates) {
      if (!characterStates) return {};
      const result = {};
      for (const [name, state] of Object.entries(characterStates)) {
          result[name] = {
              emotion: state.current_emotion || 'neutral',
              intensity: state.emotion_intensity || 0,
              knownEvents: state.known_events?.length || 0,
          };
      }
      return result;
  }

  /**
   * Build graph summary + raw (embeddings stripped).
   * @param {Object} graph
   * @returns {Object}
   */
  function buildGraphExport(graph) {
      if (!graph) return { summary: { nodeCount: 0, edgeCount: 0, typeBreakdown: {}, topEntitiesByMentions: [] }, raw: { nodes: {}, edges: {} } };

      const nodes = graph.nodes || {};
      const edges = graph.edges || {};
      const nodeEntries = Object.values(nodes);
      const edgeEntries = Object.values(edges);

      // Type breakdown
      const typeBreakdown = {};
      for (const node of nodeEntries) {
          const t = node.type || 'UNKNOWN';
          typeBreakdown[t] = (typeBreakdown[t] || 0) + 1;
      }

      // Top entities by mentions
      const topEntities = nodeEntries
          .slice()
          .sort((a, b) => (b.mentions || 0) - (a.mentions || 0))
          .slice(0, 10)
          .map((n) => ({ name: n.name, type: n.type, mentions: n.mentions || 0 }));

      // Raw without embeddings
      const rawNodes = {};
      for (const [key, node] of Object.entries(nodes)) {
          rawNodes[key] = stripEmbedding(node);
      }

      return {
          summary: {
              nodeCount: nodeEntries.length,
              edgeCount: edgeEntries.length,
              typeBreakdown,
              topEntitiesByMentions: topEntities,
          },
          raw: { nodes: rawNodes, edges: { ...edges } },
      };
  }

  /**
   * Build communities export (embeddings stripped).
   * @param {Object} communities
   * @returns {Object}
   */
  function buildCommunitiesExport(communities) {
      if (!communities) return { count: 0, details: {} };
      const details = {};
      for (const [id, comm] of Object.entries(communities)) {
          details[id] = {
              title: comm.title,
              summary: comm.summary,
              findings: comm.findings,
              nodeCount: comm.nodes?.length || 0,
          };
      }
      return { count: Object.keys(communities).length, details };
  }

  /**
   * Build the full export payload.
   * @returns {Object} JSON-serializable payload
   */
  export function buildExportPayload() {
      const deps = getDeps();
      const settings = deps.getExtensionSettings()[extensionName] || {};
      const data = getOpenVaultData() || {};
      const memories = data[MEMORIES_KEY] || [];
      const characterStates = data[CHARACTERS_KEY] || {};
      const graph = data.graph || {};
      const communities = data.communities || {};

      // Cached retrieval debug data
      const cached = getLastRetrievalDebug();

      // Truncate recentContext in cached data if present
      let lastRetrieval = null;
      if (cached) {
          lastRetrieval = { ...cached };
          if (lastRetrieval.retrievalContext?.userMessages) {
              // userMessages is already capped at 1000 by buildRetrievalContext, keep as-is
          }
      }

      return {
          openvault_debug_export: true,
          exportedAt: new Date().toISOString(),

          lastRetrieval,

          state: {
              memories: buildMemoryStats(memories),
              characterStates: buildCharacterSummary(characterStates),
              graph: buildGraphExport(graph),
              communities: buildCommunitiesExport(communities),
          },

          settings: {
              alpha: settings.alpha,
              vectorSimilarityThreshold: settings.vectorSimilarityThreshold,
              combinedBoostWeight: settings.combinedBoostWeight,
              forgetfulnessBaseLambda: settings.forgetfulnessBaseLambda,
              forgetfulnessImportance5Floor: settings.forgetfulnessImportance5Floor,
              retrievalFinalTokens: settings.retrievalFinalTokens,
              worldContextBudget: settings.worldContextBudget,
              embeddingsEnabled: isEmbeddingsEnabled(),
              embeddingSource: settings.embeddingSource,
              autoMode: settings.enabled,
              debugMode: settings.debugMode,
          },
      };
  }

  /**
   * Export debug data to clipboard. Shows toast on success/failure.
   */
  export async function exportToClipboard() {
      try {
          const payload = buildExportPayload();
          const json = JSON.stringify(payload, null, 2);
          await navigator.clipboard.writeText(json);
          showToast('success', `Copied ${(json.length / 1024).toFixed(1)}KB to clipboard`);
      } catch (err) {
          // Fallback for clipboard API failure
          try {
              const textarea = document.createElement('textarea');
              textarea.value = JSON.stringify(buildExportPayload(), null, 2);
              textarea.style.position = 'fixed';
              textarea.style.opacity = '0';
              document.body.appendChild(textarea);
              textarea.select();
              document.execCommand('copy');
              document.body.removeChild(textarea);
              showToast('success', 'Copied to clipboard (fallback)');
          } catch (fallbackErr) {
              showToast('error', 'Failed to copy to clipboard');
          }
      }
  }
  ```

**Step 4: Verify (Green)**
- Command: `npm test -- tests/ui/export-debug.test.js`
- Expect: PASS

**Step 5: Git Commit**
- Command: `git add src/ui/export-debug.js tests/ui/export-debug.test.js && git commit -m "feat: add export debug payload builder and clipboard function"`

---

### Task 5: Add UI Button and Wire It Up

**Goal:** Add Export button to System tab in `settings_panel.html` and wire click handler in `settings.js`.

**Step 1: No unit test** — UI wiring is verified manually.

**Step 2: Implementation**

**File: `templates/settings_panel.html`**
- After the Debug card closing `</div>` (after line 514, the `</div>` closing the Debug card), insert:
  ```html
                <!-- Export Debug -->
                <div class="openvault-card">
                    <div class="openvault-card-header">
                        <span class="openvault-card-title"><i class="fa-solid fa-clipboard"></i> Export</span>
                    </div>
                    <button id="openvault_export_debug_btn" class="menu_button wide">
                        <i class="fa-solid fa-copy"></i> Export Debug to Clipboard
                    </button>
                    <small class="openvault-hint">Copies full system state + last retrieval debug data as JSON</small>
                </div>
  ```

**File: `src/ui/settings.js`**
- Add import at top:
  ```javascript
  import { exportToClipboard } from './export-debug.js';
  ```
- In the function that wires button handlers (near line 439-440, after the delete buttons), add:
  ```javascript
  $('#openvault_export_debug_btn').on('click', exportToClipboard);
  ```

**Step 3: Verify**
- Command: `npm test`
- Expect: All tests PASS (no regressions)
- Manual: Open SillyTavern → OpenVault → System tab → click "Export Debug to Clipboard" → paste in text editor → verify JSON structure

**Step 4: Git Commit**
- Command: `git add templates/settings_panel.html src/ui/settings.js && git commit -m "feat: add export debug button to system tab UI"`

---

### Task 6: Final Verification

**Goal:** Run full test suite and verify no regressions.

**Step 1: Run all tests**
- Command: `npm test`
- Expect: All PASS

**Step 2: Run lint**
- Command: `npm run lint`
- Expect: No errors

**Step 3: Git tag (optional)**
- The feature is complete across commits. No squash needed — each commit is atomic.
