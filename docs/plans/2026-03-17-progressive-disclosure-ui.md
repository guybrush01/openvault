# Progressive Disclosure UI Implementation Plan

**Goal:** Restructure OpenVault settings panel to prioritize user activity patterns over technical categorization using progressive disclosure principles.

**Architecture:** Reorganize 5 tabs (Dashboard, Memories, World, Advanced, Performance) to surface status and browsing first while hiding fine-tuning math behind collapsible sections. Remove 9 constants from user-facing settings to prevent misconfiguration.

**Tech Stack:** Vanilla JS (ESM), jQuery for DOM manipulation, Vitest for testing, SillyTavern extension APIs.

---

## File Structure Overview

**Files to Modify:**
- `src/constants.js` - Add internal constants, remove from defaultSettings
- `templates/settings_panel.html` - Complete restructure of all 5 tabs
- `src/ui/settings.js` - Update bindings, add reset logic, add Graph Stats Card rendering
- `src/ui/render.js` - Add Graph Stats Card rendering functions
- `src/ui/templates.js` - Add Graph Stats Card template
- `src/ui/helpers.js` - Add payload calculator helper
- `style.css` (SillyTavern) - Add new CSS classes (via `src/ui/styles.js` or inline)

**Files to Create:**
- `tests/ui/progressive-disclosure.test.js` - UI structure tests
- `tests/ui/graph-stats.test.js` - Graph Stats Card tests
- `tests/ui/reset-logic.test.js` - Reset preservation logic tests

---

### Task 1: Add Internal Constants

**Files:**
- Modify: `src/constants.js`
- Test: `tests/constants/internal.test.js`

**Purpose:** Move 9 user-facing settings to internal constants to prevent misconfiguration.

- [ ] Step 1: Write the failing test

```javascript
// tests/constants/internal.test.js
import { describe, expect, it } from 'vitest';
import {
  REFLECTION_DEDUP_REJECT_THRESHOLD,
  REFLECTION_DEDUP_REPLACE_THRESHOLD,
  REFLECTION_DECAY_THRESHOLD,
  ENTITY_DESCRIPTION_CAP,
  EDGE_DESCRIPTION_CAP,
  COMMUNITY_STALENESS_THRESHOLD,
  COMBINED_BOOST_WEIGHT,
  IMPORTANCE_5_FLOOR,
  ENTITY_MERGE_THRESHOLD,
} from '../../src/constants.js';

describe('Internal Constants', () => {
  it('exports REFLECTION_DEDUP_REJECT_THRESHOLD as 0.90', () => {
    expect(REFLECTION_DEDUP_REJECT_THRESHOLD).toBe(0.90);
  });

  it('exports REFLECTION_DEDUP_REPLACE_THRESHOLD as 0.80', () => {
    expect(REFLECTION_DEDUP_REPLACE_THRESHOLD).toBe(0.80);
  });

  it('exports REFLECTION_DECAY_THRESHOLD as 750', () => {
    expect(REFLECTION_DECAY_THRESHOLD).toBe(750);
  });

  it('exports ENTITY_DESCRIPTION_CAP as 3', () => {
    expect(ENTITY_DESCRIPTION_CAP).toBe(3);
  });

  it('exports EDGE_DESCRIPTION_CAP as 5', () => {
    expect(EDGE_DESCRIPTION_CAP).toBe(5);
  });

  it('exports COMMUNITY_STALENESS_THRESHOLD as 100', () => {
    expect(COMMUNITY_STALENESS_THRESHOLD).toBe(100);
  });

  it('exports COMBINED_BOOST_WEIGHT as 15', () => {
    expect(COMBINED_BOOST_WEIGHT).toBe(15);
  });

  it('exports IMPORTANCE_5_FLOOR as 5', () => {
    expect(IMPORTANCE_5_FLOOR).toBe(5);
  });

  it('exports ENTITY_MERGE_THRESHOLD as 0.80', () => {
    expect(ENTITY_MERGE_THRESHOLD).toBe(0.80);
  });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npx vitest tests/constants/internal.test.js --run`
Expected: FAIL with "Cannot find export 'REFLECTION_DEDUP_REJECT_THRESHOLD'"

- [ ] Step 3: Write minimal implementation

```javascript
// src/constants.js - Add at end of file, before UI_DEFAULT_HINTS

// =============================================================================
// Internal Constants (Not Exposed in UI)
// These values are pre-calibrated and should not be user-configurable.
// =============================================================================

/** Reflection deduplication: reject threshold (cosine similarity) */
export const REFLECTION_DEDUP_REJECT_THRESHOLD = 0.90;

/** Reflection deduplication: replace threshold (auto: reject - 0.10) */
export const REFLECTION_DEDUP_REPLACE_THRESHOLD = 0.80;

/** Reflection decay: messages before reflections lose priority */
export const REFLECTION_DECAY_THRESHOLD = 750;

/** Entity graph: max description segments per entity (FIFO eviction) */
export const ENTITY_DESCRIPTION_CAP = 3;

/** Entity graph: max description segments per edge (FIFO eviction) */
export const EDGE_DESCRIPTION_CAP = 5;

/** Community detection: messages before summaries are stale */
export const COMMUNITY_STALENESS_THRESHOLD = 100;

/** Alpha-blend scoring: max boost weight (BM25 + vector) */
export const COMBINED_BOOST_WEIGHT = 15;

/** Forgetfulness curve: minimum score for importance-5 memories */
export const IMPORTANCE_5_FLOOR = 5;

/** Entity merge: semantic similarity threshold for clustering */
export const ENTITY_MERGE_THRESHOLD = 0.80;
```

- [ ] Step 4: Run test to verify it passes

Run: `npx vitest tests/constants/internal.test.js --run`
Expected: PASS (9 tests)

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: add internal constants for progressive disclosure"
```

---

### Task 2: Remove Constants from defaultSettings

**Files:**
- Modify: `src/constants.js`
- Test: `tests/constants/settings.test.js`

**Purpose:** Remove 9 settings from defaultSettings export so they're not persisted as user settings.

- [ ] Step 1: Write the failing test

```javascript
// tests/constants/settings.test.js
import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../src/constants.js';

describe('defaultSettings', () => {
  const REMOVED_KEYS = [
    'reflectionDedupThreshold',
    'entityDescriptionCap',
    'edgeDescriptionCap',
    'communityStalenessThreshold',
    'combinedBoostWeight',
    'forgetfulnessImportance5Floor',
    'entityMergeSimilarityThreshold',
    'reflectionDecayThreshold',
  ];

  it.each(REMOVED_KEYS)('should not contain removed key: %s', (key) => {
    expect(defaultSettings).not.toHaveProperty(key);
  });

  it('should still contain essential user-facing settings', () => {
    expect(defaultSettings).toHaveProperty('enabled');
    expect(defaultSettings).toHaveProperty('extractionTokenBudget');
    expect(defaultSettings).toHaveProperty('reflectionThreshold');
    expect(defaultSettings).toHaveProperty('alpha');
  });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npx vitest tests/constants/settings.test.js --run`
Expected: FAIL - settings still exist in defaultSettings

- [ ] Step 3: Write minimal implementation

```javascript
// src/constants.js - Modify defaultSettings object
// Remove these 9 keys from defaultSettings:
// 1. reflectionDedupThreshold: 0.9
// 2. entityDescriptionCap: 3
// 3. edgeDescriptionCap: 5
// 4. communityStalenessThreshold: 100
// 5. combinedBoostWeight: 15
// 6. forgetfulnessImportance5Floor: 5
// 7. entityMergeSimilarityThreshold: 0.95 -> keep as user-facing, rename to entityMergeThreshold
// 8. reflectionDecayThreshold: 750
// 9. maxReflectionsPerCharacter: 50 -> KEEP this one (user-facing)

// Note: reflectionDedupThreshold is a 3-tier system. Replace with:
// reflectionDedupRejectThreshold: 0.9 (but we're removing it entirely)
// Actually per design, remove the entire 3-tier UI and use internal constants.

// Keep these user-facing (they stay in defaultSettings):
// - entityMergeSimilarityThreshold -> rename to entityMergeThreshold (kept in Advanced)
// - maxReflectionsPerCharacter (kept in Memories)

// Remove from defaultSettings:
// reflectionDedupThreshold: 0.9,
// entityDescriptionCap: 3,
// edgeDescriptionCap: 5,
// communityStalenessThreshold: 100,
// combinedBoostWeight: 15, -> Keep this in Advanced (user-facing)
// forgetfulnessImportance5Floor: 5,
// reflectionDecayThreshold: 750,
```

- [ ] Step 4: Run test to verify it passes

Run: `npx vitest tests/constants/settings.test.js --run`
Expected: PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "refactor: remove internal constants from defaultSettings"
```

---

### Task 3: Create Graph Stats Card Template

**Files:**
- Modify: `src/ui/templates.js`
- Test: `tests/ui/templates.test.js`

**Purpose:** Add template function for the World tab Graph Stats Card.

- [ ] Step 1: Write the failing test

```javascript
// tests/ui/templates.test.js
import { describe, expect, it } from 'vitest';
import { graphStatsCard } from '../../src/ui/templates.js';

describe('graphStatsCard', () => {
  const mockStats = {
    entities: 142,
    relationships: 310,
    communities: 4,
    lastClustered: 12,
  };

  it('returns HTML string with entity count', () => {
    const html = graphStatsCard(mockStats);
    expect(html).toContain('142');
    expect(html).toContain('Entities Tracked');
  });

  it('returns HTML string with relationship count', () => {
    const html = graphStatsCard(mockStats);
    expect(html).toContain('310');
    expect(html).toContain('Relationships');
  });

  it('returns HTML string with community count', () => {
    const html = graphStatsCard(mockStats);
    expect(html).toContain('4');
    expect(html).toContain('Communities');
  });

  it('returns HTML string with last clustered message count', () => {
    const html = graphStatsCard(mockStats);
    expect(html).toContain('12 msgs ago');
  });

  it('handles zero values gracefully', () => {
    const html = graphStatsCard({ entities: 0, relationships: 0, communities: 0, lastClustered: 0 });
    expect(html).toContain('0');
    expect(html).toContain('Not yet clustered');
  });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npx vitest tests/ui/templates.test.js --run`
Expected: FAIL - graphStatsCard not exported

- [ ] Step 3: Write minimal implementation

```javascript
// src/ui/templates.js - Add new export

/**
 * Graph Stats Card template for World tab
 * @param {Object} stats - { entities, relationships, communities, lastClustered }
 * @returns {string} HTML string
 */
export function graphStatsCard(stats) {
  const lastClusteredText = stats.lastClustered > 0
    ? `${stats.lastClustered} msgs ago`
    : 'Not yet clustered';

  return `
    <div class="openvault-card openvault-graph-stats">
      <div class="openvault-card-header">
        <span class="openvault-card-title">
          <i class="fa-solid fa-chart-pie"></i> Graph Status
        </span>
      </div>
      <div class="openvault-stats-row">
        <div class="openvault-stat-item">
          <span class="openvault-stat-number">${stats.entities}</span>
          <span class="openvault-stat-label">Entities Tracked</span>
        </div>
        <div class="openvault-stat-item">
          <span class="openvault-stat-number">${stats.relationships}</span>
          <span class="openvault-stat-label">Relationships</span>
        </div>
        <div class="openvault-stat-item">
          <span class="openvault-stat-number">${stats.communities}</span>
          <span class="openvault-stat-label">Communities</span>
        </div>
      </div>
      <div class="openvault-stats-footer">
        <span class="openvault-stats-last">
          <i class="fa-solid fa-clock"></i> Last Clustered: ${lastClusteredText}
        </span>
      </div>
    </div>
  `;
}
```

- [ ] Step 4: Run test to verify it passes

Run: `npx vitest tests/ui/templates.test.js --run`
Expected: PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: add graphStatsCard template for World tab"
```

---

### Task 4: Add Graph Stats Rendering

**Files:**
- Modify: `src/ui/render.js`
- Test: `tests/ui/render.test.js`

**Purpose:** Add function to compute and render graph stats in the World tab.

- [ ] Step 1: Write the failing test

```javascript
// tests/ui/render.test.js
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderGraphStats } from '../../src/ui/render.js';
import { setupTestContext, resetDeps } from '../setup.js';

describe('renderGraphStats', () => {
  beforeEach(() => {
    setupTestContext({
      data: {
        graph: {
          nodes: [
            { id: '1', name: 'Alice', type: 'PERSON' },
            { id: '2', name: 'Bob', type: 'PERSON' },
            { id: '3', name: 'Castle', type: 'PLACE' },
          ],
          edges: [
            { source: '1', target: '2', relation: 'knows' },
            { source: '1', target: '3', relation: 'owns' },
          ],
        },
        communities: [
          { id: 'c1', summary: 'Test community' },
        ],
        lastCommunityDetection: 100,
      },
    });
    document.body.innerHTML = '<div id="openvault_graph_stats"></div>';
  });

  afterEach(() => {
    resetDeps();
  });

  it('renders graph stats into container', () => {
    renderGraphStats();
    const container = document.getElementById('openvault_graph_stats');
    expect(container.innerHTML).toContain('3'); // entities
    expect(container.innerHTML).toContain('2'); // relationships
    expect(container.innerHTML).toContain('1'); // communities
  });

  it('calculates messages since last clustering', () => {
    renderGraphStats();
    const container = document.getElementById('openvault_graph_stats');
    expect(container.innerHTML).toContain('msgs ago');
  });

  it('handles missing graph data gracefully', () => {
    setupTestContext({ data: {} });
    renderGraphStats();
    const container = document.getElementById('openvault_graph_stats');
    expect(container.innerHTML).toContain('0');
  });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npx vitest tests/ui/render.test.js --run`
Expected: FAIL - renderGraphStats not exported

- [ ] Step 3: Write minimal implementation

```javascript
// src/ui/render.js - Add import and export

import { graphStatsCard } from './templates.js';
import { getOpenVaultData } from '../utils/data.js';
import { getDeps } from '../deps.js';

/**
 * Render Graph Stats Card in World tab
 */
export function renderGraphStats() {
  const container = document.getElementById('openvault_graph_stats');
  if (!container) return;

  const data = getOpenVaultData();
  const context = getDeps().getContext?.();
  const currentMessageId = context?.chat?.length || 0;

  const graph = data?.graph || { nodes: [], edges: [] };
  const communities = data?.communities || [];
  const lastDetection = data?.lastCommunityDetection || 0;

  const stats = {
    entities: graph.nodes?.length || 0,
    relationships: graph.edges?.length || 0,
    communities: communities.length,
    lastClustered: currentMessageId - lastDetection,
  };

  container.innerHTML = graphStatsCard(stats);
}

// Add to refreshAllUI():
// renderGraphStats();
```

- [ ] Step 4: Run test to verify it passes

Run: `npx vitest tests/ui/render.test.js --run`
Expected: PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: add graph stats rendering function"
```

---

### Task 5: Update Reset Logic for Preserved Settings

**Files:**
- Modify: `src/ui/settings.js` (handleResetSettings function)
- Test: `tests/ui/reset-logic.test.js`

**Purpose:** Update reset to preserve connection settings and only reset fine-tune values.

- [ ] Step 1: Write the failing test

```javascript
// tests/ui/reset-logic.test.js
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { setupTestContext, resetDeps } from '../setup.js';

describe('handleResetSettings', () => {
  let mockSettings;

  beforeEach(() => {
    mockSettings = {
      // Connection settings (should be preserved)
      extractionProfile: 'custom-llm',
      backupProfile: 'backup-llm',
      preambleLanguage: 'en',
      outputLanguage: 'en',
      extractionPrefill: 'custom_prefill',
      embeddingSource: 'ollama',
      ollamaUrl: 'http://custom:11434',
      embeddingModel: 'custom-model',
      embeddingQueryPrefix: 'custom query:',
      embeddingDocPrefix: 'custom passage:',
      maxConcurrency: 3,
      backfillMaxRPM: 50,
      debugMode: false,
      // Fine-tune settings (should be reset)
      extractionTokenBudget: 9999,
      extractionRearviewTokens: 9999,
      retrievalFinalTokens: 9999,
      visibleChatBudget: 9999,
      reflectionThreshold: 99,
      maxInsightsPerReflection: 9,
      alpha: 0.99,
      forgetfulnessBaseLambda: 0.99,
    };

    setupTestContext({
      extensionSettings: {
        openvault: mockSettings,
      },
    });
  });

  afterEach(() => {
    resetDeps();
  });

  it('preserves connection settings on reset', async () => {
    const { handleResetSettings } = await import('../../src/ui/settings.js');
    await handleResetSettings();

    const settings = mockSettings;
    expect(settings.extractionProfile).toBe('custom-llm');
    expect(settings.embeddingSource).toBe('ollama');
    expect(settings.ollamaUrl).toBe('http://custom:11434');
    expect(settings.preambleLanguage).toBe('en');
  });

  it('resets fine-tune settings to defaults', async () => {
    const { handleResetSettings, defaultSettings } = await import('../../src/ui/settings.js');
    await handleResetSettings();

    const settings = mockSettings;
    expect(settings.extractionTokenBudget).toBe(defaultSettings.extractionTokenBudget);
    expect(settings.alpha).toBe(defaultSettings.alpha);
    expect(settings.reflectionThreshold).toBe(defaultSettings.reflectionThreshold);
  });

  it('enables debug mode after reset', async () => {
    const { handleResetSettings } = await import('../../src/ui/settings.js');
    await handleResetSettings();

    expect(mockSettings.debugMode).toBe(true);
  });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npx vitest tests/ui/reset-logic.test.js --run`
Expected: FAIL - current reset logic doesn't match expected behavior

- [ ] Step 3: Write minimal implementation

```javascript
// src/ui/settings.js - Replace handleResetSettings function

async function handleResetSettings() {
  if (!confirm('Restore default math and threshold values? Your connection profiles and chat data will not be affected.')) {
    return;
  }

  const extension_settings = getDeps().getExtensionSettings();
  const currentSettings = extension_settings[extensionName] || {};

  // Define preserved environment settings
  const PRESERVED_KEYS = [
    'extractionProfile',
    'backupProfile',
    'preambleLanguage',
    'outputLanguage',
    'extractionPrefill',
    'embeddingSource',
    'ollamaUrl',
    'embeddingModel',
    'embeddingQueryPrefix',
    'embeddingDocPrefix',
    'maxConcurrency',
    'backfillMaxRPM',
    'debugMode',
    'requestLogging',
  ];

  // Save preserved values
  const preserved = {};
  for (const key of PRESERVED_KEYS) {
    if (key in currentSettings) {
      preserved[key] = currentSettings[key];
    }
  }

  // Define fine-tune settings that get reset
  const RESETTABLE_KEYS = [
    'extractionTokenBudget',
    'extractionRearviewTokens',
    'retrievalFinalTokens',
    'visibleChatBudget',
    'worldContextBudget',
    'reflectionThreshold',
    'maxInsightsPerReflection',
    'maxReflectionsPerCharacter',
    'alpha',
    'forgetfulnessBaseLambda',
    'vectorSimilarityThreshold',
    'dedupSimilarityThreshold',
    'dedupJaccardThreshold',
    'autoHideEnabled',
    'entityWindowSize',
    'embeddingWindowSize',
    'topEntitiesCount',
    'entityBoostWeight',
    'communityDetectionInterval',
    'enabled',
  ];

  // Reset each fine-tune setting to default
  for (const key of RESETTABLE_KEYS) {
    if (key in defaultSettings) {
      extension_settings[extensionName][key] = defaultSettings[key];
    }
  }

  // Restore preserved values
  Object.assign(extension_settings[extensionName], preserved);

  // Always enable debug after reset
  extension_settings[extensionName].debugMode = true;

  // Save
  getDeps().saveSettingsDebounced();

  // Update UI
  updateUI();

  showToast('success', 'Fine-tune values restored to defaults. Connection settings preserved.');
}
```

- [ ] Step 4: Run test to verify it passes

Run: `npx vitest tests/ui/reset-logic.test.js --run`
Expected: PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: update reset logic to preserve connection settings"
```

---

### Task 6: Reorder Dashboard Tab HTML

**Files:**
- Modify: `templates/settings_panel.html` (Dashboard tab section)
- Test: `tests/ui/dashboard-structure.test.js`

**Purpose:** Reorder Dashboard to: Quick Toggles → Status → Stats → Progress → [details] Setup (Connection, Embeddings, API Limits).

- [ ] Step 1: Write the failing test

```javascript
// tests/ui/dashboard-structure.test.js
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Dashboard Tab Structure', () => {
  const html = readFileSync(
    resolve(process.cwd(), 'templates/settings_panel.html'),
    'utf-8'
  );

  // Extract dashboard tab content
  const dashboardMatch = html.match(
    /<div class="openvault-tab-content[^"]*" data-tab="dashboard-connections">([\s\S]*?)<div class="openvault-tab-content"/i
  );
  const dashboardHtml = dashboardMatch ? dashboardMatch[1] : html;

  it('has Quick Toggles before Connection Settings', () => {
    const quickTogglesIndex = dashboardHtml.indexOf('Quick Toggles');
    const connectionSettingsIndex = dashboardHtml.indexOf('Connection Settings');

    expect(quickTogglesIndex).toBeGreaterThan(-1);
    expect(connectionSettingsIndex).toBeGreaterThan(-1);
    expect(quickTogglesIndex).toBeLessThan(connectionSettingsIndex);
  });

  it('has Status Card visible (not in details)', () => {
    const statusCardMatch = dashboardHtml.match(/openvault-status-card/);
    expect(statusCardMatch).toBeTruthy();

    // Status card should not be inside a details element
    const beforeStatus = dashboardHtml.split('openvault-status-card')[0];
    const detailsOpenCount = (beforeStatus.match(/<details/g) || []).length;
    const detailsCloseCount = (beforeStatus.match(/<\/details>/g) || []).length;
    expect(detailsOpenCount).toBe(detailsCloseCount);
  });

  it('has API Limits section in dashboard', () => {
    expect(dashboardHtml).toContain('API Limits');
    expect(dashboardHtml).toContain('Cloud API Concurrency');
    expect(dashboardHtml).toContain('Backfill RPM');
  });

  it('has collapsible details for Connection Settings', () => {
    expect(dashboardHtml).toContain('<details');
    expect(dashboardHtml).toContain('Connection Settings');
  });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npx vitest tests/ui/dashboard-structure.test.js --run`
Expected: FAIL - current order doesn't match requirements

- [ ] Step 3: Write minimal implementation

Reorganize the Dashboard tab HTML in `templates/settings_panel.html`:

```html
<!-- ================================================================
     TAB 1: DASHBOARD (Status & Health)
     ================================================================ -->
<div class="openvault-tab-content active" data-tab="dashboard-connections">

    <!-- Quick Toggles (immediately visible) -->
    <div class="openvault-card">
        <div class="openvault-card-header">
            <span class="openvault-card-title"><i class="fa-solid fa-toggle-on"></i> Quick Toggles</span>
        </div>
        <div class="openvault-quick-toggles">
            <label class="openvault-quick-toggle">
                <input type="checkbox" id="openvault_enabled" checked />
                <span>Enable OpenVault</span>
            </label>
            <label class="openvault-quick-toggle">
                <input type="checkbox" id="openvault_auto_hide" checked />
                <span>Auto-hide Messages</span>
            </label>
        </div>
    </div>

    <!-- Status Card (immediately visible) -->
    <div class="openvault-card openvault-status-card">
        <div class="openvault-status-indicator ready" id="openvault_status_indicator">
            <i class="fa-solid fa-check"></i>
        </div>
        <div class="openvault-status-info">
            <div class="openvault-status-text" id="openvault_status_text">Ready</div>
            <div class="openvault-status-subtext" id="openvault_status_subtext">OpenVault is idle</div>
            <div id="openvault_dashboard_embedding_status" class="openvault-embedding-status loading">
                <i class="fa-solid fa-circle-notch fa-spin"></i>
                <span>Embeddings not loaded</span>
            </div>
        </div>
    </div>

    <!-- Stats Grid (immediately visible) -->
    <div class="openvault-stats-grid">
        <!-- ... existing 6 stat cards ... -->
    </div>

    <!-- Progress (immediately visible) -->
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
        <div class="openvault-button-row">
            <button id="openvault_extract_all_btn" class="menu_button">
                <i class="fa-solid fa-layer-group"></i> Backfill History
            </button>
            <button id="openvault_backfill_embeddings_btn" class="menu_button">
                <i class="fa-solid fa-vector-square"></i> Generate Embeddings
            </button>
        </div>
    </div>

    <!-- Connection & Setup (collapsed by default) -->
    <details class="openvault-details">
        <summary><i class="fa-solid fa-plug"></i> Connection & Setup</summary>
        <div class="openvault-settings-group">
            <!-- Extraction Profile, Backup Profile, Languages, Prefill -->
        </div>
    </details>

    <!-- Embeddings (collapsed by default) -->
    <details class="openvault-details">
        <summary><i class="fa-solid fa-vector-square"></i> Embeddings</summary>
        <div class="openvault-settings-group">
            <!-- Model selector, prefixes, Ollama URL -->
        </div>
    </details>

    <!-- API Limits (collapsed by default) -->
    <details class="openvault-details">
        <summary><i class="fa-solid fa-gauge"></i> API Limits</summary>
        <div class="openvault-settings-group">
            <label for="openvault_max_concurrency">
                Cloud API Concurrency: <span id="openvault_max_concurrency_value">1</span>
                <small class="openvault-default-hint" data-default-key="maxConcurrency"></small>
            </label>
            <input type="range" id="openvault_max_concurrency" min="1" max="5" step="1" />
            <small class="openvault-hint">How many simultaneous API calls. Use 1 for local (Ollama/LM Studio), 3-5 for cloud (Kimi/OpenAI)</small>

            <label for="openvault_backfill_rpm">
                Backfill Rate Limit (RPM)
                <small class="openvault-default-hint" data-default-key="backfillRateLimit"></small>
            </label>
            <input type="number" id="openvault_backfill_rpm" class="text_pole" min="1" max="600" />
            <small class="openvault-hint">Max requests per minute when processing old messages</small>
        </div>
    </details>

</div>
```

- [ ] Step 4: Run test to verify it passes

Run: `npx vitest tests/ui/dashboard-structure.test.js --run`
Expected: PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "refactor: reorder Dashboard tab for progressive disclosure"
```

---

### Task 7: Reorder Memories Tab HTML

**Files:**
- Modify: `templates/settings_panel.html` (Memories tab)
- Test: `tests/ui/memories-structure.test.js`

**Purpose:** Move Memory Browser to top, group settings into collapsible details.

- [ ] Step 1: Write the failing test

```javascript
// tests/ui/memories-structure.test.js
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Memories Tab Structure', () => {
  const html = readFileSync(
    resolve(process.cwd(), 'templates/settings_panel.html'),
    'utf-8'
  );

  const memoriesMatch = html.match(
    /<div class="openvault-tab-content[^"]*" data-tab="memory-bank">([\s\S]*?)<div class="openvault-tab-content"/i
  );
  const memoriesHtml = memoriesMatch ? memoriesMatch[1] : '';

  it('has Memory Browser before any settings', () => {
    const searchIndex = memoriesHtml.indexOf('Search memories');
    const firstDetailsIndex = memoriesHtml.indexOf('<details');

    expect(searchIndex).toBeGreaterThan(-1);
    expect(searchIndex).toBeLessThan(firstDetailsIndex);
  });

  it('has Character States section in collapsible details', () => {
    expect(memoriesHtml).toContain('Character States');
    // Should be in a details element after the browser
    const afterBrowser = memoriesHtml.split('openvault_memory_list')[1] || '';
    expect(afterBrowser).toContain('Character States');
    expect(afterBrowser).toContain('<details');
  });

  it('has Extraction & Context section', () => {
    expect(memoriesHtml).toContain('Extraction');
    expect(memoriesHtml).toContain('Batch Size');
    expect(memoriesHtml).toContain('Context Window');
  });

  it('has Reflection Engine section', () => {
    expect(memoriesHtml).toContain('Reflection');
    expect(memoriesHtml).toContain('Threshold');
    expect(memoriesHtml).toContain('Max Insights');
  });

  it('renamed Extraction Token Budget to Extraction Batch Size', () => {
    expect(memoriesHtml).toContain('Extraction Batch Size');
  });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npx vitest tests/ui/memories-structure.test.js --run`
Expected: FAIL

- [ ] Step 3: Write minimal implementation

Reorganize the Memories tab HTML:

```html
<!-- ================================================================
     TAB 2: MEMORIES (Browse & Engine)
     ================================================================ -->
<div class="openvault-tab-content" data-tab="memory-bank">

    <!-- Memory Browser (immediately visible) -->
    <div class="openvault-search-container">
        <i class="fa-solid fa-search"></i>
        <input type="text" id="openvault_memory_search" class="openvault-search-input" placeholder="Find memories by content, character, or type..." />
    </div>

    <!-- Filters -->
    <div class="openvault-filters">
        <select id="openvault_filter_type" class="text_pole">
            <option value="">All Memories</option>
            <option value="event">Events</option>
            <option value="reflection">Reflections</option>
        </select>
        <select id="openvault_filter_character" class="text_pole">
            <option value="">All Characters</option>
        </select>
    </div>

    <!-- Memory List -->
    <div id="openvault_memory_list" class="openvault-memory-list">
        <p class="openvault-placeholder">No memories yet</p>
    </div>

    <!-- Pagination -->
    <div class="openvault-pagination">
        <button id="openvault_prev_page" class="menu_button" disabled>
            <i class="fa-solid fa-chevron-left"></i>
        </button>
        <span id="openvault_page_info">Page 1</span>
        <button id="openvault_next_page" class="menu_button" disabled>
            <i class="fa-solid fa-chevron-right"></i>
        </button>
    </div>

    <!-- Character States (collapsed) -->
    <details class="openvault-details" style="margin-top: 15px;">
        <summary><i class="fa-solid fa-users"></i> Character States</summary>
        <div class="inline-drawer-content">
            <div id="openvault_character_states" class="openvault-character-list">
                <p class="openvault-placeholder">No character data yet</p>
            </div>
        </div>
    </details>

    <!-- Extraction & Context (collapsed) -->
    <details class="openvault-details" style="margin-top: 10px;">
        <summary><i class="fa-solid fa-microchip"></i> Extraction & Context</summary>
        <div class="openvault-settings-group">
            <label for="openvault_extraction_token_budget">
                Extraction Batch Size: <span id="openvault_extraction_token_budget_value">8000</span> tokens
                <small class="openvault-default-hint" data-default-key="extractionTokenBudget"></small>
            </label>
            <input type="range" id="openvault_extraction_token_budget" min="4000" max="64000" step="1000" />
            <small class="openvault-hint">How much chat history to send to the background AI at once. Larger batches = fewer API calls but longer waits between updates</small>

            <label for="openvault_extraction_rearview">
                Context Window Size: <span id="openvault_extraction_rearview_value">6000</span> tokens
                <small class="openvault-default-hint" data-default-key="contextWindowSize"></small>
            </label>
            <input type="range" id="openvault_extraction_rearview" min="1000" max="32000" step="1000" />
            <small class="openvault-hint">How far back the AI reads to extract new memories. Larger = better context, but costs more tokens</small>

            <!-- Context & Injection Budgets -->
            <div style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px;">
                <div style="font-weight: bold; margin-bottom: 10px;">Context & Injection Budgets</div>

                <label for="openvault_final_budget">
                    Final Context Budget: <span id="openvault_final_budget_value">10000</span> tokens
                    <small class="openvault-default-hint" data-default-key="retrievalFinalTokens"></small>
                </label>
                <input type="range" id="openvault_final_budget" min="1000" max="32000" step="1000" />
                <small class="openvault-hint">How many tokens of memories to inject into each AI response</small>

                <label for="openvault_visible_chat_budget">
                    Visible Chat Budget: <span id="openvault_visible_chat_budget_value">16000</span> tokens
                    <small class="openvault-default-hint" data-default-key="visibleChatBudget"></small>
                </label>
                <input type="range" id="openvault_visible_chat_budget" min="4000" max="64000" step="1000" />
                <small class="openvault-hint">Maximum tokens visible in chat history. Oldest messages are auto-hidden when exceeded.</small>
            </div>

            <!-- Payload Calculator -->
            <div id="openvault_payload_calculator" class="openvault-payload-calc">
                <span id="openvault_payload_emoji">✅</span>
                Estimated total: ~<span id="openvault_payload_total">32,000</span> tokens
                <div class="openvault-payload-breakdown" id="openvault_payload_breakdown">
                    (8k batch + 6k rearview + 12k overhead)
                </div>
                <div class="openvault-payload-warning">
                    Ensure your background LLM supports at least this context size.
                </div>
            </div>
        </div>
    </details>

    <!-- Reflection Engine (collapsed) -->
    <details class="openvault-details" style="margin-top: 10px;">
        <summary><i class="fa-solid fa-lightbulb"></i> Reflection Engine</summary>
        <div class="openvault-settings-group">
            <label for="openvault_reflection_threshold">
                Reflection Threshold: <span id="openvault_reflection_threshold_value">40</span>
                <small class="openvault-default-hint" data-default-key="reflectionThreshold"></small>
            </label>
            <input type="range" id="openvault_reflection_threshold" min="10" max="100" step="5" />
            <small class="openvault-hint">How much 'interesting stuff' needs to happen before the AI thinks deeper about a character. Lower = more frequent insights</small>

            <label for="openvault_max_insights">
                Max Insights per Reflection: <span id="openvault_max_insights_value">3</span>
                <small class="openvault-default-hint" data-default-key="maxInsightsPerReflection"></small>
            </label>
            <input type="range" id="openvault_max_insights" min="1" max="5" step="1" />
            <small class="openvault-hint">How many new insights per reflection (1-5). More = richer character understanding, but more tokens</small>

            <label for="openvault_max_reflections">
                Max Reflections per Character: <span id="openvault_max_reflections_value">50</span>
                <small class="openvault-default-hint" data-default-key="maxReflectionsPerCharacter"></small>
            </label>
            <input type="range" id="openvault_max_reflections" min="10" max="200" step="10" />
            <small class="openvault-hint">Maximum stored insights per character. Older ones are archived when exceeded</small>
        </div>
    </details>

</div>
```

- [ ] Step 4: Run test to verify it passes

Run: `npx vitest tests/ui/memories-structure.test.js --run`
Expected: PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "refactor: reorder Memories tab - browser first, settings collapsed"
```

---

### Task 8: Restructure World Tab (Pure Viewer)

**Files:**
- Modify: `templates/settings_panel.html` (World tab)
- Test: `tests/ui/world-structure.test.js`

**Purpose:** Remove all settings, add Graph Stats Card, keep Communities and Entity browsers.

- [ ] Step 1: Write the failing test

```javascript
// tests/ui/world-structure.test.js
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('World Tab Structure', () => {
  const html = readFileSync(
    resolve(process.cwd(), 'templates/settings_panel.html'),
    'utf-8'
  );

  const worldMatch = html.match(
    /<div class="openvault-tab-content[^"]*" data-tab="world">([\s\S]*?)<div class="openvault-tab-content"/i
  );
  const worldHtml = worldMatch ? worldMatch[1] : '';

  it('has Graph Stats Card at top', () => {
    expect(worldHtml).toContain('openvault_graph_stats');
    const graphStatsIndex = worldHtml.indexOf('openvault_graph_stats');
    const communitiesIndex = worldHtml.indexOf('Communities');
    expect(graphStatsIndex).toBeLessThan(communitiesIndex);
  });

  it('has no visible sliders/inputs for settings', () => {
    // Should not have visible range inputs (they would be in collapsed sections if any)
    const inputMatches = worldHtml.match(/<input[^>]*type="range"/g);
    // If there are any, they must be inside <details> elements
    if (inputMatches) {
      for (const match of inputMatches) {
        const beforeInput = worldHtml.split(match)[0];
        const openDetails = (beforeInput.match(/<details/g) || []).length;
        const closedDetails = (beforeInput.match(/<\/details>/g) || []).length;
        // Input should be inside closed details (not directly visible)
        expect(openDetails).toBeGreaterThan(closedDetails);
      }
    }
  });

  it('has Communities browser', () => {
    expect(worldHtml).toContain('Communities');
    expect(worldHtml).toContain('openvault_community_list');
  });

  it('has Entity browser', () => {
    expect(worldHtml).toContain('Entities');
    expect(worldHtml).toContain('openvault_entity_list');
  });

  it('has entity search and type filter', () => {
    expect(worldHtml).toContain('openvault_entity_search');
    expect(worldHtml).toContain('openvault_entity_type_filter');
  });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npx vitest tests/ui/world-structure.test.js --run`
Expected: FAIL

- [ ] Step 3: Write minimal implementation

```html
<!-- ================================================================
     TAB 3: WORLD (Pure Viewer)
     ================================================================ -->
<div class="openvault-tab-content" data-tab="world">

    <!-- Graph Stats Card -->
    <div id="openvault_graph_stats" class="openvault-graph-stats-container">
        <!-- Rendered by renderGraphStats() -->
    </div>

    <!-- Communities Browser -->
    <div class="openvault-card">
        <div class="openvault-card-header">
            <span class="openvault-card-title">
                <i class="fa-solid fa-circle-nodes"></i> Communities
            </span>
            <span class="openvault-card-badge" id="openvault_community_count">0</span>
        </div>
        <div class="openvault-help-text" style="padding: 10px; font-size: 0.85em; color: var(--SmartThemeEmColor);">
            AI-discovered groups of related people, places, and concepts
        </div>
        <div id="openvault_community_list" class="openvault-community-list">
            <p class="openvault-placeholder">No communities detected yet</p>
        </div>
    </div>

    <!-- Entity Browser -->
    <div class="openvault-card" style="margin-top: 15px;">
        <div class="openvault-card-header">
            <span class="openvault-card-title">
                <i class="fa-solid fa-diagram-project"></i> Entities
            </span>
            <span class="openvault-card-badge" id="openvault_entity_count">0</span>
        </div>
        <div class="openvault-help-text" style="padding: 10px; font-size: 0.85em; color: var(--SmartThemeEmColor);">
            Browse all people, places, organizations, objects, and concepts in your story
        </div>
        <div class="openvault-filters">
            <div class="openvault-search-container" style="flex: 1;">
                <i class="fa-solid fa-search"></i>
                <input type="text" id="openvault_entity_search" class="openvault-search-input"
                       placeholder="Search entities..." />
            </div>
            <select id="openvault_entity_type_filter" class="text_pole">
                <option value="">All Types</option>
                <option value="PERSON">Person</option>
                <option value="PLACE">Place</option>
                <option value="ORGANIZATION">Organization</option>
                <option value="OBJECT">Object</option>
                <option value="CONCEPT">Concept</option>
            </select>
        </div>
        <div id="openvault_entity_list" class="openvault-entity-list">
            <p class="openvault-placeholder">No entities extracted yet</p>
        </div>
    </div>

</div>
```

- [ ] Step 4: Run test to verify it passes

Run: `npx vitest tests/ui/world-structure.test.js --run`
Expected: PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "refactor: restructure World tab as pure viewer with Graph Stats"
```

---

### Task 9: Add Advanced Warning Banner

**Files:**
- Modify: `templates/settings_panel.html` (Advanced tab)
- Test: `tests/ui/advanced-structure.test.js`

**Purpose:** Add warning banner, group settings in collapsible details, rename reset button.

- [ ] Step 1: Write the failing test

```javascript
// tests/ui/advanced-structure.test.js
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Advanced Tab Structure', () => {
  const html = readFileSync(
    resolve(process.cwd(), 'templates/settings_panel.html'),
    'utf-8'
  );

  const advancedMatch = html.match(
    /<div class="openvault-tab-content[^"]*" data-tab="advanced">([\s\S]*?)<div class="openvault-tab-content"/i
  );
  const advancedHtml = advancedMatch ? advancedMatch[1] : '';

  it('has Expert Tuning warning banner at top', () => {
    expect(advancedHtml).toContain('Expert Tuning');
    expect(advancedHtml).toContain('pre-calibrated');
    expect(advancedHtml).toContain('openvault-warning-banner');
  });

  it('has warning banner before any settings', () => {
    const warningIndex = advancedHtml.indexOf('Expert Tuning');
    const firstDetailsIndex = advancedHtml.indexOf('<details');
    expect(warningIndex).toBeLessThan(firstDetailsIndex);
  });

  it('has Scoring & Weights in collapsible details', () => {
    expect(advancedHtml).toContain('Scoring');
    expect(advancedHtml).toContain('Alpha');
  });

  it('has Decay Math section', () => {
    expect(advancedHtml).toContain('Decay');
    expect(advancedHtml).toContain('Lambda');
  });

  it('has Similarity Thresholds section', () => {
    expect(advancedHtml).toContain('Similarity');
    expect(advancedHtml).toContain('Vector Threshold');
  });

  it('renames reset button to clarify scope', () => {
    expect(advancedHtml).toContain('Restore Default Math');
    expect(advancedHtml).toContain('chat memories and connection profiles will not be touched');
  });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npx vitest tests/ui/advanced-structure.test.js --run`
Expected: FAIL

- [ ] Step 3: Write minimal implementation

```html
<!-- ================================================================
     TAB 4: ADVANCED (Expert Math)
     ================================================================ -->
<div class="openvault-tab-content" data-tab="advanced">

    <!-- Warning Banner -->
    <div class="openvault-warning-banner">
        <div class="openvault-warning-icon">⚠️</div>
        <div class="openvault-warning-content">
            <div class="openvault-warning-title">Expert Tuning</div>
            <div class="openvault-warning-text">
                These values are pre-calibrated for optimal AI performance.
                Change them only if you understand cosine similarity and BM25 math.
            </div>
        </div>
    </div>

    <!-- Scoring & Weights -->
    <details class="openvault-details">
        <summary><i class="fa-solid fa-scale-balanced"></i> Scoring & Weights</summary>
        <div class="openvault-settings-group">
            <label for="openvault_alpha">
                Alpha (Vector vs Keyword Balance): <span id="openvault_alpha_value">0.7</span>
                <small class="openvault-default-hint" data-default-key="alpha"></small>
            </label>
            <input type="range" id="openvault_alpha" min="0" max="1" step="0.01" />
            <small class="openvault-hint">Balance between 'find similar meaning' (1.0) and 'find exact words' (0.0). Default 0.7 works for most RPs</small>
        </div>
    </details>

    <!-- Decay Math -->
    <details class="openvault-details">
        <summary><i class="fa-solid fa-chart-line"></i> Decay Math</summary>
        <div class="openvault-settings-group">
            <label for="openvault_forgetfulness_lambda">
                Lambda (Forgetfulness Rate): <span id="openvault_forgetfulness_lambda_value">0.05</span>
                <small class="openvault-default-hint" data-default-key="forgetfulnessBaseLambda"></small>
            </label>
            <input type="range" id="openvault_forgetfulness_lambda" min="0.01" max="0.20" step="0.01" />
            <small class="openvault-hint">How quickly old memories fade in relevance. Higher = forgets faster. Lower = remembers longer. Default 0.05 is highly recommended</small>
        </div>
    </details>

    <!-- Similarity Thresholds -->
    <details class="openvault-details">
        <summary><i class="fa-solid fa-bullseye"></i> Similarity Thresholds</summary>
        <div class="openvault-settings-group">
            <label for="openvault_vector_threshold">
                Vector Similarity Threshold: <span id="openvault_vector_threshold_value">0.5</span>
                <small class="openvault-default-hint" data-default-key="vectorSimilarityThreshold"></small>
            </label>
            <input type="range" id="openvault_vector_threshold" min="0" max="1" step="0.01" />
            <small class="openvault-hint">Minimum similarity for a memory to match. Higher = fewer, more relevant results. Lower = more matches, more noise</small>

            <label for="openvault_dedup_threshold">
                Dedup Cosine Threshold: <span id="openvault_dedup_threshold_value">0.95</span>
                <small class="openvault-default-hint" data-default-key="dedupSimilarityThreshold"></small>
            </label>
            <input type="range" id="openvault_dedup_threshold" min="0.80" max="0.98" step="0.01" />
            <small class="openvault-hint">How similar memories must be to count as duplicates. Higher = keeps more variations. Lower = more aggressive merging</small>

            <label for="openvault_dedup_jaccard">
                Dedup Jaccard Threshold: <span id="openvault_dedup_jaccard_value">0.60</span>
                <small class="openvault-default-hint" data-default-key="dedupJaccardThreshold"></small>
            </label>
            <input type="range" id="openvault_dedup_jaccard" min="0.30" max="0.90" step="0.01" />
            <small class="openvault-hint">Word-level duplicate detection. Backup filter when semantic similarity is borderline</small>
        </div>
    </details>

    <!-- Danger Zone -->
    <details class="openvault-details openvault-danger-zone">
        <summary><i class="fa-solid fa-triangle-exclamation"></i> Danger Zone</summary>
        <div class="openvault-settings-group">
            <p style="font-size: 0.85em; color: var(--SmartThemeEmColor, #888); margin-bottom: 15px;">
                These actions cannot be undone.
            </p>

            <button id="openvault_reset_settings_btn" class="menu_button wide">
                <i class="fa-solid fa-rotate-left"></i> Restore Default Math & Thresholds
            </button>
            <small class="openvault-hint">Reset fine-tuning values to defaults. Your chat memories and connection profiles will not be touched</small>

            <button id="openvault_delete_chat_btn" class="menu_button danger wide" style="margin-top: 15px;">
                <i class="fa-solid fa-trash"></i> Delete Current Chat Memories
            </button>
            <small class="openvault-hint">Permanently remove all OpenVault data for this chat</small>
        </div>
    </details>

    <!-- Footer -->
    <div class="openvault-footer">
        <small>OpenVault v<span id="openvault_version"></span> - Free & Open Source Agentic Memory</small>
    </div>

</div>
```

- [ ] Step 4: Run test to verify it passes

Run: `npx vitest tests/ui/advanced-structure.test.js --run`
Expected: PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "refactor: add warning banner and reorganize Advanced tab"
```

---

### Task 10: Update Settings Bindings

**Files:**
- Modify: `src/ui/settings.js`
- Test: `tests/ui/settings-bindings.test.js`

**Purpose:** Update bindings to match new HTML structure, handle relocated settings.

- [ ] Step 1: Write the failing test

```javascript
// tests/ui/settings-bindings.test.js
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { bindUIElements } from '../../src/ui/settings.js';
import { setupTestContext, resetDeps } from '../setup.js';

describe('Settings Bindings', () => {
  beforeEach(() => {
    setupTestContext({
      extensionSettings: { openvault: {} },
    });
    // Setup minimal DOM
    document.body.innerHTML = `
      <input type="range" id="openvault_max_concurrency" />
      <span id="openvault_max_concurrency_value"></span>
      <input type="number" id="openvault_backfill_rpm" />
      <input type="range" id="openvault_final_budget" />
      <span id="openvault_final_budget_value"></span>
      <input type="range" id="openvault_visible_chat_budget" />
      <span id="openvault_visible_chat_budget_value"></span>
    `;
  });

  afterEach(() => {
    resetDeps();
  });

  it('binds relocated max_concurrency from Memories to Dashboard', () => {
    bindUIElements();
    const eventHandlers = $._data($('#openvault_max_concurrency')[0], 'events');
    expect(eventHandlers).toHaveProperty('input');
  });

  it('binds relocated backfill_rpm from Memories to Dashboard', () => {
    bindUIElements();
    const eventHandlers = $._data($('#openvault_backfill_rpm')[0], 'events');
    expect(eventHandlers).toHaveProperty('change');
  });

  it('binds relocated final_budget from World to Memories', () => {
    bindUIElements();
    const eventHandlers = $._data($('#openvault_final_budget')[0], 'events');
    expect(eventHandlers).toHaveProperty('input');
  });

  it('binds relocated visible_chat_budget from World to Memories', () => {
    bindUIElements();
    const eventHandlers = $._data($('#openvault_visible_chat_budget')[0], 'events');
    expect(eventHandlers).toHaveProperty('input');
  });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npx vitest tests/ui/settings-bindings.test.js --run`
Expected: FAIL - bindings may need updates for relocated elements

- [ ] Step 3: Write minimal implementation

Update `src/ui/settings.js`:

```javascript
// In bindUIElements(), update/remove bindings as needed:

// REMOVE (moved to Dashboard):
// - max_concurrency binding (keep, just ensure it works in new location)
// - backfill_rpm binding (keep, just ensure it works in new location)

// KEEP in Memories:
// - extraction_token_budget
// - extraction_rearview
// - reflection_threshold
// - max_insights
// - max_reflections

// ADD new bindings for relocated settings:
// These were in World tab, now in Memories
bindSetting('final_budget', 'retrievalFinalTokens', 'int', (v) =>
  updateWordsDisplay(v, 'openvault_final_budget_words')
);
bindSetting('visible_chat_budget', 'visibleChatBudget');

// REMOVE from World (settings no longer exist there):
// - world_context_budget (removed entirely? Or moved?)
// - entity_window (removed)
// - embedding_window (removed)
// - top_entities (removed)
// - entity_boost (removed)

// REMOVE from Advanced (converted to internal constants):
// - combined_weight (removed - now internal constant)
// - importance5_floor (removed - now internal constant)
// - entity_description_cap (removed - now internal constant)
// - edge_description_cap (removed - now internal constant)
// - reflection_decay_threshold (removed - now internal constant)
// - community_staleness (removed - now internal constant)
// - reflection_dedup_threshold (removed - using internal constants)
// - entity_merge_threshold (keep this one - user-facing in Advanced)
```

Also update `updateUI()` to sync relocated settings:

```javascript
// In updateUI(), add/update:

// Relocated from World to Memories
$('#openvault_final_budget').val(settings.retrievalFinalTokens);
$('#openvault_final_budget_value').text(settings.retrievalFinalTokens);
updateWordsDisplay(settings.retrievalFinalTokens, 'openvault_final_budget_words');

$('#openvault_visible_chat_budget').val(settings.visibleChatBudget);
$('#openvault_visible_chat_budget_value').text(settings.visibleChatBudget);
```

- [ ] Step 4: Run test to verify it passes

Run: `npx vitest tests/ui/settings-bindings.test.js --run`
Expected: PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "refactor: update settings bindings for relocated controls"
```

---

### Task 11: Add Warning Banner CSS

**Files:**
- Modify: `src/ui/styles.js` (if exists) or inline styles in HTML
- Test: `tests/ui/css-classes.test.js`

**Purpose:** Add styling for warning banner and Graph Stats card.

- [ ] Step 1: Write the failing test

```javascript
// tests/ui/css-classes.test.js
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('CSS Classes', () => {
  const html = readFileSync(
    resolve(process.cwd(), 'templates/settings_panel.html'),
    'utf-8'
  );

  const css = readFileSync(
    resolve(process.cwd(), 'src/ui/styles.js'),
    'utf-8'
  );

  it('warning banner has red/amber border styling', () => {
    expect(css).toContain('openvault-warning-banner');
    expect(css).toContain('border-left');
  });

  it('graph stats card has styling', () => {
    expect(css).toContain('openvault-graph-stats');
  });

  it('payload calculator has color classes', () => {
    expect(css).toContain('payload-safe');
    expect(css).toContain('payload-caution');
    expect(css).toContain('payload-warning');
    expect(css).toContain('payload-danger');
  });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npx vitest tests/ui/css-classes.test.js --run`
Expected: FAIL

- [ ] Step 3: Write minimal implementation

Add to SillyTavern CSS or inline style block:

```css
/* Warning Banner */
.openvault-warning-banner {
  display: flex;
  gap: 12px;
  padding: 15px;
  margin-bottom: 15px;
  background: rgba(255, 193, 7, 0.1);
  border-left: 3px solid #ffc107;
  border-radius: 4px;
}

.openvault-warning-icon {
  font-size: 1.5em;
  flex-shrink: 0;
}

.openvault-warning-title {
  font-weight: bold;
  color: #ffc107;
  margin-bottom: 4px;
}

.openvault-warning-text {
  font-size: 0.9em;
  color: var(--SmartThemeBodyColor);
  line-height: 1.4;
}

/* Graph Stats Card */
.openvault-graph-stats {
  margin-bottom: 15px;
}

.openvault-stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 15px;
  padding: 15px;
}

.openvault-stat-item {
  text-align: center;
}

.openvault-stat-number {
  font-size: 1.8em;
  font-weight: bold;
  color: var(--SmartThemeQuoteColor);
}

.openvault-stat-label {
  font-size: 0.8em;
  color: var(--SmartThemeEmColor);
  margin-top: 4px;
}

.openvault-stats-footer {
  padding: 10px 15px;
  border-top: 1px solid rgba(255,255,255,0.1);
  text-align: center;
  font-size: 0.85em;
  color: var(--SmartThemeEmColor);
}

/* Payload Calculator Colors */
.openvault-payload-calc {
  padding: 12px;
  margin-top: 15px;
  border-radius: 4px;
  font-size: 0.95em;
}

.openvault-payload-calc.payload-safe {
  background: rgba(40, 167, 69, 0.15);
  border: 1px solid #28a745;
}

.openvault-payload-calc.payload-caution {
  background: rgba(255, 193, 7, 0.15);
  border: 1px solid #ffc107;
}

.openvault-payload-calc.payload-warning {
  background: rgba(253, 126, 20, 0.15);
  border: 1px solid #fd7e14;
}

.openvault-payload-calc.payload-danger {
  background: rgba(220, 53, 69, 0.15);
  border: 1px solid #dc3545;
}

.openvault-payload-warning {
  font-size: 0.85em;
  margin-top: 8px;
  opacity: 0.8;
}
```

- [ ] Step 4: Run test to verify it passes

Run: `npx vitest tests/ui/css-classes.test.js --run`
Expected: PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: add CSS styles for warning banner and Graph Stats"
```

---

### Task 12: Update Description Rewrites

**Files:**
- Modify: `templates/settings_panel.html` (all small.hint elements)
- Test: `tests/ui/descriptions.test.js`

**Purpose:** Update all setting descriptions per design document.

- [ ] Step 1: Write the failing test

```javascript
// tests/ui/descriptions.test.js
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Setting Descriptions', () => {
  const html = readFileSync(
    resolve(process.cwd(), 'templates/settings_panel.html'),
    'utf-8'
  );

  it('has updated Extraction Batch Size description', () => {
    expect(html).toContain('How much chat history to send');
    expect(html).toContain('fewer API calls but longer waits');
  });

  it('has updated Context Window Size description', () => {
    expect(html).toContain('How far back the AI reads');
    expect(html).toContain('better context, but costs more tokens');
  });

  it('has updated Reflection Threshold description', () => {
    expect(html).toContain('interesting stuff');
    expect(html).toContain('Lower = more frequent insights');
  });

  it('has updated Auto-hide description', () => {
    expect(html).toContain('Hide old messages from AI context');
    expect(html).toContain('they remain saved as Memories');
  });

  it('has updated Alpha description', () => {
    expect(html).toContain('find similar meaning');
    expect(html).toContain('find exact words');
  });

  it('has updated Lambda description', () => {
    expect(html).toContain('How quickly old memories fade');
    expect(html).toContain('Default 0.05 is highly recommended');
  });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npx vitest tests/ui/descriptions.test.js --run`
Expected: FAIL - descriptions not yet updated

- [ ] Step 3: Write minimal implementation

Update all `<small class="openvault-hint">` elements in HTML per design document. Key changes:

| Setting | New Description |
|---------|-----------------|
| Enable OpenVault | Turn memory system on/off |
| Auto-hide Messages | Hide old messages from AI context (they remain saved as Memories) |
| Extraction Profile | Which AI model extracts memories from your chat |
| Extraction Batch Size | How much chat history to send to the background AI at once. Larger batches = fewer API calls but longer waits between updates |
| Context Window Size | How far back the AI reads to extract new memories. Larger = better context, but costs more tokens |
| Final Context Budget | How many tokens of memories to inject into each AI response |
| Visible Chat Budget | Maximum tokens visible in chat history. Oldest messages are auto-hidden when exceeded |
| Reflection Threshold | How much 'interesting stuff' needs to happen before the AI thinks deeper about a character. Lower = more frequent insights |
| Max Insights | How many new insights per reflection (1-5). More = richer character understanding, but more tokens |
| Max Reflections | Maximum stored insights per character. Older ones are archived when exceeded |
| Alpha | Balance between 'find similar meaning' (1.0) and 'find exact words' (0.0). Default 0.7 works for most RPs |
| Lambda | How quickly old memories fade in relevance. Higher = forgets faster. Lower = remembers longer. Default 0.05 is highly recommended |
| Vector Threshold | Minimum similarity for a memory to match. Higher = fewer, more relevant results. Lower = more matches, more noise |
| Dedup Cosine | How similar memories must be to count as duplicates. Higher = keeps more variations. Lower = more aggressive merging |
| Dedup Jaccard | Word-level duplicate detection. Backup filter when semantic similarity is borderline |
| Reset Button | Reset fine-tuning values to defaults. Your chat memories and connection profiles will not be touched |

- [ ] Step 4: Run test to verify it passes

Run: `npx vitest tests/ui/descriptions.test.js --run`
Expected: PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "docs: update all setting descriptions for clarity"
```

---

### Task 13: Add LLM Compatibility Warning to Payload Calculator

**Files:**
- Modify: `src/ui/settings.js` (updatePayloadCalculator function)
- Test: `tests/ui/payload-calculator.test.js`

**Purpose:** Add explicit LLM context size compatibility warning.

- [ ] Step 1: Write the failing test

```javascript
// tests/ui/payload-calculator.test.js
import { describe, expect, it, beforeEach } from 'vitest';
import { updatePayloadCalculator } from '../../src/ui/settings.js';

describe('updatePayloadCalculator', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <input type="range" id="openvault_extraction_token_budget" value="8000" />
      <input type="range" id="openvault_extraction_rearview" value="6000" />
      <div id="openvault_payload_calculator"></div>
      <span id="openvault_payload_emoji"></span>
      <span id="openvault_payload_total"></span>
      <div id="openvault_payload_breakdown"></div>
    `;
  });

  it('shows LLM compatibility warning', () => {
    updatePayloadCalculator();
    const calc = document.getElementById('openvault_payload_calculator');
    expect(calc.innerHTML).toContain('Ensure your Extraction Profile');
    expect(calc.innerHTML).toContain('context size');
  });

  it('shows green emoji for totals under 32k', () => {
    $('#openvault_extraction_token_budget').val(4000);
    $('#openvault_extraction_rearview').val(4000);
    updatePayloadCalculator();
    expect($('#openvault_payload_emoji').text()).toBe('✅');
  });

  it('shows red emoji for totals over 64k', () => {
    $('#openvault_extraction_token_budget').val(32000);
    $('#openvault_extraction_rearview').val(32000);
    updatePayloadCalculator();
    expect($('#openvault_payload_emoji').text()).toBe('🔴');
  });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npx vitest tests/ui/payload-calculator.test.js --run`
Expected: FAIL - warning text may be missing

- [ ] Step 3: Write minimal implementation

Update `updatePayloadCalculator()` in `src/ui/settings.js`:

```javascript
function updatePayloadCalculator() {
  const budget = Number($('#openvault_extraction_token_budget').val()) || defaultSettings.extractionTokenBudget;
  const rearview = Number($('#openvault_extraction_rearview').val()) || defaultSettings.extractionRearviewTokens;
  const total = budget + rearview + PAYLOAD_CALC.OVERHEAD;

  $('#openvault_payload_total').text(total.toLocaleString());

  // Breakdown: show each component
  const bStr = Math.round(budget / 1000) + 'k';
  const rStr = Math.round(rearview / 1000) + 'k';
  const ovhStr = Math.round(PAYLOAD_CALC.OVERHEAD / 1000) + 'k';
  $('#openvault_payload_breakdown').text(`(${bStr} batch + ${rStr} rearview + ${ovhStr} overhead)`);

  // Color thresholds
  const $calc = $('#openvault_payload_calculator');
  $calc.removeClass('payload-safe payload-caution payload-warning payload-danger');
  let emoji;
  if (total <= PAYLOAD_CALC.THRESHOLD_GREEN) {
    $calc.addClass('payload-safe');
    emoji = '✅';
  } else if (total <= PAYLOAD_CALC.THRESHOLD_YELLOW) {
    $calc.addClass('payload-caution');
    emoji = '⚠️';
  } else if (total <= PAYLOAD_CALC.THRESHOLD_ORANGE) {
    $calc.addClass('payload-warning');
    emoji = '🟠';
  } else {
    $calc.addClass('payload-danger');
    emoji = '🔴';
  }
  $('#openvault_payload_emoji').text(emoji);

  // ADDED: LLM compatibility warning
  const $warning = $calc.find('.openvault-payload-warning');
  if (!$warning.length) {
    $calc.append(`
      <div class="openvault-payload-warning">
        Ensure your Extraction Profile supports at least ${Math.ceil(total / 1000)}k context.
      </div>
    `);
  } else {
    $warning.text(`Ensure your Extraction Profile supports at least ${Math.ceil(total / 1000)}k context.`);
  }
}
```

- [ ] Step 4: Run test to verify it passes

Run: `npx vitest tests/ui/payload-calculator.test.js --run`
Expected: PASS

- [ ] Step 5: Commit

```bash
git add -A && git commit -m "feat: add LLM compatibility warning to payload calculator"
```

---

### Task 14: Integration Test - Full UI Restructure

**Files:**
- Create: `tests/ui/progressive-disclosure.integration.test.js`

**Purpose:** Integration test verifying the complete progressive disclosure structure.

- [ ] Step 1: Write the failing test

```javascript
// tests/ui/progressive-disclosure.integration.test.js
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { setupTestContext, resetDeps } from '../setup.js';
import { loadSettings } from '../../src/ui/settings.js';

describe('Progressive Disclosure Integration', () => {
  beforeEach(async () => {
    setupTestContext({
      extensionSettings: { openvault: {} },
    });
    // Mock fetch for template loading
    global.fetch = vi.fn(() =>
      Promise.resolve({
        text: () => Promise.resolve('<div>Mock Template</div>'),
      })
    );
  });

  afterEach(() => {
    resetDeps();
  });

  it('loads all 5 tabs', async () => {
    await loadSettings();
    const tabs = document.querySelectorAll('.openvault-tab-btn');
    expect(tabs.length).toBe(5);
  });

  it('Dashboard has Quick Toggles before collapsible sections', async () => {
    await loadSettings();
    const dashboard = document.querySelector('[data-tab="dashboard-connections"]');
    const html = dashboard.innerHTML;
    const quickTogglesIndex = html.indexOf('Quick Toggles');
    const detailsIndex = html.indexOf('<details');
    expect(quickTogglesIndex).toBeLessThan(detailsIndex);
  });

  it('Memories has browser before settings', async () => {
    await loadSettings();
    const memories = document.querySelector('[data-tab="memory-bank"]');
    const html = memories.innerHTML;
    const searchIndex = html.indexOf('memory_search');
    const detailsIndex = html.indexOf('<details');
    expect(searchIndex).toBeLessThan(detailsIndex);
  });

  it('World has no visible range inputs', async () => {
    await loadSettings();
    const world = document.querySelector('[data-tab="world"]');
    const visibleInputs = world.querySelectorAll(':scope > input[type="range"]');
    expect(visibleInputs.length).toBe(0);
  });

  it('Advanced has warning banner', async () => {
    await loadSettings();
    const advanced = document.querySelector('[data-tab="advanced"]');
    expect(advanced.innerHTML).toContain('Expert Tuning');
  });
});
```

- [ ] Step 2: Run test to verify it fails

Run: `npx vitest tests/ui/progressive-disclosure.integration.test.js --run`
Expected: FAIL

- [ ] Step 3: Run after all HTML changes complete

Once all previous tasks are complete:

Run: `npx vitest tests/ui/progressive-disclosure.integration.test.js --run`
Expected: PASS

- [ ] Step 4: Commit

```bash
git add -A && git commit -m "test: add progressive disclosure integration tests"
```

---

### Task 15: Final Verification

**Files:**
- All modified files

**Purpose:** Run full test suite and verify no regressions.

- [ ] Step 1: Run full test suite

Run: `npm run test:run`
Expected: All tests pass

- [ ] Step 2: Run linting

Run: `npm run lint`
Expected: No errors

- [ ] Step 3: Commit

```bash
git add -A && git commit -m "chore: final verification for progressive disclosure UI"
```

---

## Summary

This implementation plan covers:

1. **Constants Migration** (Tasks 1-2): Move 9 settings to internal constants
2. **Template Restructure** (Tasks 3-9, 12): Reorganize all 5 tabs
3. **Logic Updates** (Tasks 5, 10-11, 13): Update bindings, reset logic, calculator
4. **Styling** (Task 11): Add CSS for new components
5. **Testing** (All tasks): TDD red-green for each change
6. **Integration** (Task 14): Verify complete structure
7. **Verification** (Task 15): Final validation

**Estimated Tasks:** 15
**Estimated Time:** Each task is 2-5 minutes, total ~60-75 minutes

**Success Criteria:**
- Dashboard shows status without scrolling
- Memories has browser at top
- World has zero settings, pure exploration
- Advanced has clear warning
- All descriptions rewritten
- Payload calculator shows LLM warning
- Reset preserves connections
- All tests pass
