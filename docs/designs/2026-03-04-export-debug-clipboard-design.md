# Design: Export Debug to Clipboard

## 1. Problem Statement

No way to inspect what OpenVault actually injected into the prompt, what scoring decisions were made, or what the full system state looks like. Need a single "Export" button that copies a comprehensive debug payload to clipboard for prompt optimization and debugging.

## 2. Goals & Non-Goals

**Must do:**
- Export exactly what was injected last retrieval (scene_memory + world_context)
- Export retrieval pipeline intermediates (filter counts, query context, POV chars)
- Export current state snapshot (memories count, graph, communities, character states, settings)
- Export graph as summary + raw JSON (embeddings stripped)
- Smart truncation: recentContext capped ~2000 chars, embeddings stripped from all objects
- Single clipboard copy, JSON format
- DRY: reuse existing functions, no duplicated logic
- Button in System tab

**Won't do:**
- Re-run the retrieval pipeline (use cached results)
- Export individual memory embeddings (too large, not useful for debugging)
- Export full chat messages (already visible in SillyTavern)
- Streaming/file export (clipboard only)

## 3. Proposed Architecture

### 3.1 Cache Layer (`src/retrieval/debug-cache.js`)

Module-level object that stores intermediates from the last retrieval run. Updated by `retrieve.js` at key decision points — **assignments only, no logic changes**.

```javascript
// src/retrieval/debug-cache.js
let lastRetrieval = null;

export function cacheRetrievalDebug(data) {
    lastRetrieval = { ...data, timestamp: Date.now() };
}

export function getLastRetrievalDebug() {
    return lastRetrieval;
}
```

### 3.2 Cache Points in `retrieve.js`

After each filtering/scoring step, call `cacheRetrievalDebug()` with accumulated data:

1. After POV filtering: `{ total, hidden, afterPOV, povCharacters }`
2. After `selectFormatAndInject()` returns: `{ selectedMemories, formattedContext, worldContext }`
3. From `buildRetrievalContext()`: `{ userMessages, chatLength, activeCharacters, tokenBudget }`

Also cache in `scoring.js` after `extractQueryContext()`: `{ entities, embeddingQuery, bm25Tokens }`

### 3.3 Export Function (`src/ui/export-debug.js`)

Single function that assembles the payload from:
- `getLastRetrievalDebug()` — cached retrieval data
- `getOpenVaultData()` — current state (memories, graph, communities, character_states)
- `getScoringParams()` — current settings
- `buildRetrievalContext()` — current retrieval context (for freshness)

```javascript
export function buildExportPayload() → object
export async function exportToClipboard() → void  // calls buildExportPayload + navigator.clipboard
```

### 3.4 UI Button

Add to System tab in `settings_panel.html`, between Debug card and Danger Zone:

```html
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

Wire up in `src/ui/render.js` or `src/ui/settings.js`.

## 4. Data Model: Export Payload

```jsonc
{
  "openvault_debug_export": true,          // Marker for identification
  "exportedAt": "2026-03-04T12:00:00Z",
  "version": "from manifest.json",

  // === WHAT WAS INJECTED (cached from last retrieval) ===
  "lastRetrieval": {
    "timestamp": 1709553600000,            // When retrieval ran
    "injectedContext": "<scene_memory>...</scene_memory>",
    "injectedWorldContext": "<world_context>...</world_context>",
    "queryContext": {
      "entities": ["Alice", "garden"],
      "embeddingQuery": "Alice walking through garden...",
      "bm25TokenCount": 45
    },
    "filters": {
      "totalMemories": 200,
      "hiddenMemories": 80,
      "afterPOVFilter": 65,
      "selectedForInjection": 25
    },
    "retrievalContext": {
      "userMessages": "last 3 user messages (max 1000 chars)",
      "chatLength": 150,
      "primaryCharacter": "Alice",
      "activeCharacters": ["Alice", "Bob"],
      "povCharacters": ["Alice"],
      "tokenBudget": 12000,
      "worldContextBudget": 2000
    }
  },

  // === CURRENT STATE SNAPSHOT ===
  "state": {
    "memories": {
      "total": 200,
      "byType": { "event": 185, "reflection": 15 },
      "byImportance": { "1": 10, "2": 30, "3": 80, "4": 50, "5": 30 },
      "averageImportance": 3.2
    },
    "characterStates": {
      "Alice": { "emotion": "anxious", "intensity": 7, "knownEvents": 45 },
      "Bob": { "emotion": "calm", "intensity": 3, "knownEvents": 30 }
    },
    "graph": {
      "summary": {
        "nodeCount": 45,
        "edgeCount": 78,
        "typeBreakdown": { "PERSON": 12, "PLACE": 8, "OBJECT": 15, "CONCEPT": 10 },
        "topEntitiesByMentions": [
          { "name": "Alice", "type": "PERSON", "mentions": 50 },
          { "name": "Garden", "type": "PLACE", "mentions": 20 }
        ]
      },
      "raw": {
        "nodes": { "...full graph.nodes without embeddings..." },
        "edges": { "...full graph.edges..." }
      }
    },
    "communities": {
      "count": 3,
      "details": {
        "comm_1": { "title": "...", "summary": "...", "findings": [...], "nodeCount": 5 }
      }
    }
  },

  // === SETTINGS (for reproducing behavior) ===
  "settings": {
    "alpha": 0.7,
    "vectorSimilarityThreshold": 0.5,
    "combinedBoostWeight": 15,
    "forgetfulnessBaseLambda": 0.05,
    "forgetfulnessImportance5Floor": 5,
    "retrievalFinalTokens": 12000,
    "worldContextBudget": 2000,
    "embeddingsEnabled": true,
    "embeddingsSource": "webgpu",
    "autoMode": true,
    "debugMode": false
  }
}
```

## 5. Interface / API Design

### New file: `src/retrieval/debug-cache.js`
```javascript
/** @type {Object|null} */
let lastRetrieval = null;

export function cacheRetrievalDebug(data) {
    lastRetrieval = { ...data, timestamp: Date.now() };
}

export function getLastRetrievalDebug() {
    return lastRetrieval;
}

export function clearRetrievalDebug() {
    lastRetrieval = null;
}
```

### New file: `src/ui/export-debug.js`
```javascript
import { getLastRetrievalDebug } from '../retrieval/debug-cache.js';
import { getOpenVaultData, isAutomaticMode } from '../utils.js';
import { getScoringParams } from '../retrieval/scoring.js';
import { buildRetrievalContext } from '../retrieval/retrieve.js';
import { isEmbeddingsEnabled } from '../embeddings.js';
import { getDeps } from '../deps.js';
import { extensionName, MEMORIES_KEY, CHARACTERS_KEY } from '../constants.js';

export function buildExportPayload() { ... }
export async function exportToClipboard() { ... }
```

### Modified: `src/retrieval/retrieve.js`
- Import `cacheRetrievalDebug` from `debug-cache.js`
- In `retrieveAndInjectContext()`: cache filter stats after POV filtering
- In `selectFormatAndInject()`: cache formatted context + world context after injection

### Modified: `src/retrieval/scoring.js`
- Import `cacheRetrievalDebug` (or extend the cache call in retrieve.js)
- Cache query context (entities, embedding query) after extraction

### Modified: `src/ui/render.js` or `src/ui/settings.js`
- Wire `#openvault_export_debug_btn` click → `exportToClipboard()`
- Show toast on success/failure

### Modified: `src/events.js`
- On `onChatChanged()`: call `clearRetrievalDebug()` to prevent stale data

## 6. Risks & Edge Cases

| Risk | Mitigation |
|------|-----------|
| No retrieval has run yet (fresh chat) | Show toast "No retrieval data cached yet. Send a message first." Export state-only payload without `lastRetrieval`. |
| Clipboard API blocked (HTTP, iframe) | Fallback: `document.execCommand('copy')` with textarea. Show error toast if both fail. |
| Graph too large for clipboard | Strip embeddings from all objects. Graph nodes/edges are key-value maps — typically <100KB even for large chats. |
| `recentContext` is entire chat | Truncate to last 2000 chars in export (still show full length stat). |
| Stale cache after chat switch | `clearRetrievalDebug()` on chat change. |
| Memory embeddings in payload | Strip `embedding` field from all memory objects in state snapshot. Only include embedding metadata (dimensions, enabled status). |

## 7. Files Changed

| File | Change |
|------|--------|
| `src/retrieval/debug-cache.js` | **NEW** — 3 functions, ~15 lines |
| `src/ui/export-debug.js` | **NEW** — `buildExportPayload()` + `exportToClipboard()`, ~100 lines |
| `src/retrieval/retrieve.js` | Add ~5 cache calls (import + assignments) |
| `src/retrieval/scoring.js` | Add ~3 cache calls for query context |
| `src/events.js` | Add `clearRetrievalDebug()` on chat change |
| `templates/settings_panel.html` | Add Export card (button + hint) |
| `src/ui/render.js` or `src/ui/settings.js` | Wire button click handler |
