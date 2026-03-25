# Zod-to-Types Generator - Phase 4 Implementation Plan

**Goal:** Migrate from manually-maintained JSDoc types to auto-generated TypeScript declaration files derived from Zod schemas.

**Architecture:** Create `src/store/schemas.js` as the single source of truth for Zod schemas. Use `zod-to-ts` in `scripts/generate-types.js` to generate `src/types.d.ts`. Extend base schemas in `src/extraction/structured.js` with `.catch()` fallbacks for LLM validation.

**Tech Stack:** Node.js, Zod v4, zod-to-ts, ESM modules

---

## File Structure Overview

**New Files:**
- Create: `src/store/schemas.js` - Zod schemas for all internal data structures (single source of truth)
- Create: `scripts/generate-types.js` - Generator script using zod-to-ts + CDN mock
- Create: `src/types.d.ts` - GENERATED (do not edit manually)
- Create: `tests/store/schemas.test.js` - Tests for schema validation
- Create: `tests/scripts/generate-types.test.js` - Tests for type generation

**Modified Files:**
- Modify: `package.json` - Add generate-types script, pretest hook
- Modify: `.githooks/pre-commit` - Add type generation step
- Modify: `src/extraction/structured.js` - Import base schemas from store/schemas.js, extend with .catch()
- Modify: `src/types.js` - Add deprecation notice (keep during transition)
- Modify: 9 source files - Change imports from types.js to types.d.ts

---

### Task 1: Install zod-to-ts dependency

**Files:**
- Modify: `package.json`

- [ ] Step 1: Install zod-to-ts as dev dependency

```bash
npm install --save-dev zod-to-ts
```

- [ ] Step 2: Verify installation

Run: `npm list zod-to-ts`
Expected: Shows zod-to-ts version installed

- [ ] Step 3: Commit

```bash
git add package.json package-lock.json && git commit -m "chore: install zod-to-ts for type generation"
```

---

### Task 2: Create src/store/schemas.js with Zod schemas

**Files:**
- Create: `src/store/schemas.js`
- Create: `tests/store/schemas.test.js`

**Purpose:** Create the single source of truth for Zod schemas. These schemas define both runtime validation boundaries and compile-time TypeScript types.

**Common Pitfalls:**
- Must use CDN import pattern (`cdnImport`) like rest of codebase
- Base schemas should NOT have `.catch()` fallbacks - those belong in structured.js
- Must export all schemas individually for generator script to import

- [ ] Step 1: Create directory if needed

```bash
mkdir -p src/store tests/store
```

- [ ] Step 2: Write the failing test

Create `tests/store/schemas.test.js`:

```javascript
// @ts-check
import { describe, it, expect, beforeAll } from 'vitest';

describe('schemas', () => {
    let schemas;

    beforeAll(async () => {
        schemas = await import('../../src/store/schemas.js');
    });

    describe('MemorySchema', () => {
        it('should export MemorySchema', () => {
            expect(schemas.MemorySchema).toBeDefined();
        });

        it('should validate a valid memory object', () => {
            const validMemory = {
                id: 'abc123',
                summary: 'Test memory summary',
                importance: 3,
                message_id: 100,
                timestamp: Date.now(),
                tokens: ['test', 'memori'],
            };

            const result = schemas.MemorySchema.safeParse(validMemory);
            expect(result.success).toBe(true);
        });

        it('should reject invalid importance values', () => {
            const invalidMemory = {
                id: 'abc123',
                summary: 'Test memory summary',
                importance: 10, // Invalid: max is 5
                message_id: 100,
                timestamp: Date.now(),
                tokens: ['test'],
            };

            const result = schemas.MemorySchema.safeParse(invalidMemory);
            expect(result.success).toBe(false);
        });
    });

    describe('GraphNodeSchema', () => {
        it('should export GraphNodeSchema', () => {
            expect(schemas.GraphNodeSchema).toBeDefined();
        });

        it('should validate a valid graph node', () => {
            const validNode = {
                name: 'Alice',
                type: 'PERSON',
                description: 'A test character',
                mentions: 5,
            };

            const result = schemas.GraphNodeSchema.safeParse(validNode);
            expect(result.success).toBe(true);
        });
    });

    describe('GraphEdgeSchema', () => {
        it('should export GraphEdgeSchema', () => {
            expect(schemas.GraphEdgeSchema).toBeDefined();
        });

        it('should validate a valid graph edge', () => {
            const validEdge = {
                source: 'alice',
                target: 'bob',
                description: 'Friends',
                weight: 3,
            };

            const result = schemas.GraphEdgeSchema.safeParse(validEdge);
            expect(result.success).toBe(true);
        });
    });

    describe('BaseEntitySchema', () => {
        it('should export BaseEntitySchema', () => {
            expect(schemas.BaseEntitySchema).toBeDefined();
        });

        it('should validate a valid entity without .catch fallbacks', () => {
            const validEntity = {
                name: 'Castle',
                type: 'PLACE',
                description: 'A medieval castle',
            };

            const result = schemas.BaseEntitySchema.safeParse(validEntity);
            expect(result.success).toBe(true);
        });

        it('should reject empty name without fallback', () => {
            const invalidEntity = {
                name: '',
                type: 'PLACE',
                description: 'A medieval castle',
            };

            const result = schemas.BaseEntitySchema.safeParse(invalidEntity);
            expect(result.success).toBe(false);
        });
    });

    describe('BaseRelationshipSchema', () => {
        it('should export BaseRelationshipSchema', () => {
            expect(schemas.BaseRelationshipSchema).toBeDefined();
        });

        it('should validate a valid relationship without .catch fallbacks', () => {
            const validRel = {
                source: 'Alice',
                target: 'Bob',
                description: 'Friends since childhood',
            };

            const result = schemas.BaseRelationshipSchema.safeParse(validRel);
            expect(result.success).toBe(true);
        });
    });
});
```

- [ ] Step 3: Run test to verify it fails

Run: `npx vitest tests/store/schemas.test.js --run`
Expected: FAIL with "Cannot find module '../../src/store/schemas.js'"

- [ ] Step 4: Create src/store/schemas.js

Create `src/store/schemas.js`:

```javascript
// @ts-check
/**
 * Zod schemas for OpenVault data structures
 *
 * These schemas serve dual purposes:
 * 1. Runtime validation where needed (optional, to save CPU)
 * 2. Source of truth for TypeScript type generation via zod-to-ts
 *
 * For LLM I/O schemas with .catch() fallbacks, define a Base schema here
 * and extend it in src/extraction/structured.js with the fallbacks.
 */

import { cdnImport } from '../utils/cdn.js';

const { z } = await cdnImport('zod');

// --- Core Memory Schema ---

export const MemorySchema = z.object({
    id: z.string(),
    summary: z.string(),
    importance: z.number().int().min(1).max(5),
    embedding: z.array(z.number()).optional(),
    message_id: z.number(),
    timestamp: z.number(),
    witnesses: z.array(z.string()).optional(),
    type: z.enum(['event', 'reflection', 'global_synthesis']).optional(),
    level: z.number().optional(),
    tokens: z.array(z.string()),
    message_ids: z.array(z.number()).optional(),
    mentions: z.number().optional(),
    retrieval_hits: z.number().optional(),
    archived: z.boolean().optional(),
    _st_synced: z.boolean().optional(),
    _proxyVectorScore: z.number().optional(),
});

// --- Graph Schemas ---

export const GraphNodeSchema = z.object({
    name: z.string().min(1),
    type: z.enum(['PERSON', 'PLACE', 'ORGANIZATION', 'OBJECT', 'CONCEPT']),
    description: z.string(),
    mentions: z.number(),
    embedding: z.array(z.number()).optional(),
    embedding_b64: z.string().optional(),
    aliases: z.array(z.string()).optional(),
    _st_synced: z.boolean().optional(),
});

export const GraphEdgeSchema = z.object({
    source: z.string(),
    target: z.string(),
    description: z.string(),
    weight: z.number(),
    _descriptionTokens: z.number().optional(),
    embedding: z.array(z.number()).optional(),
    embedding_b64: z.string().optional(),
    _st_synced: z.boolean().optional(),
});

export const GraphDataSchema = z.object({
    nodes: z.record(z.string(), GraphNodeSchema),
    edges: z.record(z.string(), GraphEdgeSchema),
    _mergeRedirects: z.record(z.string(), z.string()).optional(),
    _edgesNeedingConsolidation: z.array(z.string()).optional(),
});

// --- Entity & Relationship (Base Schemas for LLM Extension) ---

/**
 * Base Entity schema - strict validation for type generation
 * Extended in structured.js with .catch() fallbacks for LLM output
 */
export const BaseEntitySchema = z.object({
    name: z.string().min(1).describe('Entity name, capitalized'),
    type: z.enum(['PERSON', 'PLACE', 'ORGANIZATION', 'OBJECT', 'CONCEPT']),
    description: z.string().describe('Comprehensive description of the entity'),
});

/**
 * Base Relationship schema - strict validation for type generation
 * Extended in structured.js with .catch() fallbacks for LLM output
 */
export const BaseRelationshipSchema = z.object({
    source: z.string().min(1).describe('Source entity name'),
    target: z.string().min(1).describe('Target entity name'),
    description: z.string().min(1).describe('Description of the relationship'),
});

// --- Scoring & Retrieval Schemas ---

export const ScoreBreakdownSchema = z.object({
    total: z.number(),
    base: z.number(),
    baseAfterFloor: z.number(),
    recencyPenalty: z.number(),
    vectorBonus: z.number(),
    vectorSimilarity: z.number(),
    bm25Bonus: z.number(),
    bm25Score: z.number(),
    distance: z.number(),
    importance: z.number(),
    hitDamping: z.number().optional(),
    frequencyFactor: z.number().optional(),
});

export const ScoredMemorySchema = z.object({
    memory: MemorySchema,
    score: z.number(),
    breakdown: ScoreBreakdownSchema,
});

// --- Event Schemas ---

export const EventSchema = z.object({
    summary: z.string().min(20, 'Summary must be a complete descriptive sentence'),
    importance: z.number().int().min(1).max(5).default(3),
    characters_involved: z.array(z.string()).default([]),
    witnesses: z.array(z.string()).default([]),
    location: z.string().nullable().default(null),
    is_secret: z.boolean().default(false),
    emotional_impact: z.record(z.string(), z.any()).optional().default({}),
    relationship_impact: z.record(z.string(), z.any()).optional().default({}),
});

export const EventExtractionSchema = z.object({
    events: z.array(EventSchema),
});

// --- OpenVault Data Schema ---

export const CharacterDataSchema = z.object({
    firstSeen: z.number().optional(),
    lastSeen: z.number().optional(),
    mentionCount: z.number().optional(),
});

export const ReflectionStateSchema = z.object({
    lastMessageId: z.number().optional(),
    reflectionCount: z.number().optional(),
});

export const GlobalWorldStateSchema = z.object({
    summary: z.string(),
    last_updated: z.number(),
    community_count: z.number(),
});

export const CommunitySummarySchema = z.object({
    id: z.string(),
    title: z.string(),
    summary: z.string(),
    entities: z.array(z.string()).optional(),
    findings: z.array(z.string()).optional(),
    last_updated: z.number().optional(),
});

export const OpenVaultDataSchema = z.object({
    schema_version: z.number(),
    memories: z.array(MemorySchema).optional(),
    characters: z.record(z.string(), CharacterDataSchema).optional(),
    processed_messages: z.array(z.string()).optional(),
    graph: GraphDataSchema.optional(),
    communities: z.record(z.string(), CommunitySummarySchema).optional(),
    reflection_state: ReflectionStateSchema.optional(),
    graph_message_count: z.number().optional(),
    global_world_state: GlobalWorldStateSchema.optional(),
    embedding_model_id: z.string().optional(),
});

// --- StVectorItem Schema ---

export const StVectorItemSchema = z.object({
    hash: z.number(),
    text: z.string(),
    index: z.number().optional(),
});

// --- Config Schemas ---

export const ScoringConfigSchema = z.object({
    forgetfulnessBaseLambda: z.number(),
    forgetfulnessImportance5Floor: z.number(),
    reflectionDecayThreshold: z.number(),
    reflectionLevelMultiplier: z.number(),
    vectorSimilarityThreshold: z.number(),
    alpha: z.number(),
    combinedBoostWeight: z.number(),
    embeddingSource: z.enum(['local', 'ollama', 'st_vector']),
});

export const QueryConfigSchema = z.object({
    contextWindowSize: z.number().optional(),
    entityBoostWeight: z.number().optional(),
    corpusGroundedBoost: z.number().optional(),
    corpusNonGroundedBoost: z.number().optional(),
    exactPhraseBoostWeight: z.number().optional(),
});
```

- [ ] Step 5: Run tests to verify they pass

Run: `npx vitest tests/store/schemas.test.js --run`
Expected: PASS (6 tests)

- [ ] Step 6: Commit

```bash
git add -A && git commit -m "feat(types): add Zod schemas as single source of truth in src/store/schemas.js"
```

---

### Task 3: Create scripts/generate-types.js generator

**Files:**
- Create: `scripts/generate-types.js`
- Create: `tests/scripts/generate-types.test.js`
- Create: `src/types.d.ts` (generated, initially empty)

**Purpose:** Generate TypeScript declaration files from Zod schemas using zod-to-ts. Must work in Node.js with CDN mock pattern.

**Common Pitfalls:**
- Generator runs in Node.js but schemas use browser CDN imports
- Must use same `_setTestOverride` pattern as tests to mock CDN imports
- Must use BASE schemas (not extended with .catch()) for clean types

- [ ] Step 1: Create directory

```bash
mkdir -p tests/scripts
```

- [ ] Step 2: Write the failing test

Create `tests/scripts/generate-types.test.js`:

```javascript
// @ts-check
import { describe, it, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

describe('generate-types script', () => {
    it('should generate a types.d.ts file', async () => {
        const typesPath = path.join(PROJECT_ROOT, 'src/types.d.ts');

        // Check file exists
        const stats = await fs.stat(typesPath).catch(() => null);
        expect(stats).toBeTruthy();
        expect(stats?.isFile()).toBe(true);
    });

    it('should contain generated type definitions', async () => {
        const typesPath = path.join(PROJECT_ROOT, 'src/types.d.ts');
        const content = await fs.readFile(typesPath, 'utf-8');

        // Check for auto-generated marker
        expect(content).toContain('AUTO-GENERATED');

        // Check for key types
        expect(content).toContain('export type Memory');
        expect(content).toContain('export type GraphNode');
        expect(content).toContain('export type GraphEdge');
        expect(content).toContain('export type Entity');
        expect(content).toContain('export type Relationship');
    });

    it('should NOT contain | "Unknown" unions from .catch() fallbacks', async () => {
        const typesPath = path.join(PROJECT_ROOT, 'src/types.d.ts');
        const content = await fs.readFile(typesPath, 'utf-8');

        // Entity type should have clean string type, not string | "Unknown"
        const entityMatch = content.match(/export type Entity[\s\S]*?^export type/m);
        if (entityMatch) {
            expect(entityMatch[0]).not.toContain('"Unknown"');
        }
    });
});
```

- [ ] Step 3: Run test to verify it fails

Run: `npx vitest tests/scripts/generate-types.test.js --run`
Expected: FAIL - types.d.ts doesn't exist yet

- [ ] Step 4: Create scripts/generate-types.js

Create `scripts/generate-types.js`:

```javascript
#!/usr/bin/env node
/**
 * Generate src/types.d.ts from Zod schemas
 * Run via: npm run generate-types
 *
 * Uses the same _setTestOverride pattern as tests to mock CDN imports
 * so Node.js can import browser-targeted schema files.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- 1. Mock CDN imports for Node.js ---
// Same pattern used in tests: set up global override before importing source files

if (!globalThis.__openvault_cdn_test_overrides) {
    globalThis.__openvault_cdn_test_overrides = new Map();
}

// Provide local zod for CDN mock
const { z } = await import('zod');
globalThis.__openvault_cdn_test_overrides.set('zod', { z });

// --- 2. Dynamically import zod-to-ts (ESM) ---
const { zodToTs, printNode } = await import('zod-to-ts');

// --- 3. Import schemas from browser-accessible source files ---

const {
    MemorySchema,
    GraphNodeSchema,
    GraphEdgeSchema,
    GraphDataSchema,
    ScoreBreakdownSchema,
    ScoredMemorySchema,
    BaseEntitySchema,
    BaseRelationshipSchema,
    EventSchema,
    EventExtractionSchema,
    CharacterDataSchema,
    ReflectionStateSchema,
    GlobalWorldStateSchema,
    CommunitySummarySchema,
    OpenVaultDataSchema,
    StVectorItemSchema,
    ScoringConfigSchema,
    QueryConfigSchema,
} = await import('../src/store/schemas.js');

// --- 4. Map: Type Name → Zod Schema ---

const typeMappings = [
    { name: 'Memory', schema: MemorySchema },
    { name: 'GraphNode', schema: GraphNodeSchema },
    { name: 'GraphEdge', schema: GraphEdgeSchema },
    { name: 'GraphData', schema: GraphDataSchema },
    { name: 'ScoreBreakdown', schema: ScoreBreakdownSchema },
    { name: 'ScoredMemory', schema: ScoredMemorySchema },
    { name: 'Entity', schema: BaseEntitySchema },      // Use base schema for types
    { name: 'Relationship', schema: BaseRelationshipSchema },
    { name: 'ExtractedEvent', schema: EventSchema },
    { name: 'EventExtraction', schema: EventExtractionSchema },
    { name: 'CharacterData', schema: CharacterDataSchema },
    { name: 'ReflectionState', schema: ReflectionStateSchema },
    { name: 'GlobalWorldState', schema: GlobalWorldStateSchema },
    { name: 'CommunitySummary', schema: CommunitySummarySchema },
    { name: 'OpenVaultData', schema: OpenVaultDataSchema },
    { name: 'StVectorItem', schema: StVectorItemSchema },
    { name: 'ScoringConfig', schema: ScoringConfigSchema },
    { name: 'QueryConfig', schema: QueryConfigSchema },
];

// --- 5. Generate the .d.ts file ---

const OUTPUT_PATH = path.resolve(__dirname, '../src/types.d.ts');

async function generateTypes() {
    const timestamp = new Date().toISOString();
    let dtsContent = `// AUTO-GENERATED BY scripts/generate-types.js
// Generated at: ${timestamp}
// DO NOT EDIT DIRECTLY. Update src/store/schemas.js instead.

`;

    for (const { name, schema } of typeMappings) {
        const { node } = zodToTs(schema, name);
        const typeDef = printNode(node);
        dtsContent += `export type ${name} = ${typeDef};\n\n`;
    }

    // Add type-only export marker
    dtsContent += `// End of generated types\n`;

    await fs.writeFile(OUTPUT_PATH, dtsContent, 'utf-8');
    console.log(`Generated ${typeMappings.length} types in ${OUTPUT_PATH}`);
}

generateTypes().catch(err => {
    console.error('Type generation failed:', err.message);
    process.exit(1);
});
```

- [ ] Step 5: Run the generator to create initial types.d.ts

Run: `node scripts/generate-types.js`
Expected: "Generated 18 types in C:\projects\openvault\src\types.d.ts"

- [ ] Step 6: Verify the generated file

Run: `head -30 src/types.d.ts`
Expected: Shows auto-generated header and Memory type definition

- [ ] Step 7: Run tests to verify they pass

Run: `npx vitest tests/scripts/generate-types.test.js --run`
Expected: PASS (3 tests)

- [ ] Step 8: Commit

```bash
git add -A && git commit -m "feat(types): add type generation script with CDN mock pattern"
```

---

### Task 4: Update package.json with generate-types script

**Files:**
- Modify: `package.json`

- [ ] Step 1: Add scripts to package.json

Edit `package.json` scripts section:

```json
{
    "scripts": {
        "clear": "node -e \"process.stdout.write('\\u001B[2J\\u001B[0;0f')\"",
        "prepare": "git config core.hooksPath .githooks",
        "generate-types": "node scripts/generate-types.js",
        "pretest": "npm run generate-types",
        "lint": "biome check .",
        "lint:fix": "biome check --write --unsafe .",
        "lint:jsdoc": "node scripts/check-jsdoc.mjs",
        "format": "biome format --write .",
        "test": "node scripts/test.js",
        "test:run": "vitest run",
        "test:related": "vitest --run --reporter=dot related",
        "test:math": "vitest --run tests/math.test.js tests/retrieval/math.test.js",
        "test:extract": "vitest --run tests/extraction/",
        "test:ci": "vitest run --reporter=dot",
        "test:coverage": "vitest run --coverage",
        "test:ui": "vitest --ui",
        "typecheck": "npm run generate-types && tsc --noEmit",
        "sync-version": "node scripts/sync-version.js",
        "check-css": "node scripts/check-css.js",
        "trim": "python scripts/trim-logs.py",
        "trim:aggressive": "python scripts/trim-logs.py --aggressive",
        "repomix": "npm run repomix:logic-lite && npm run repomix:logic-full && npm run repomix:ui && npm run repomix:tests",
        "repomix:logic-full": "npx repomix --remove-empty-lines --output repomix-logic-full.md --include \"src/**/*.js,index.js,package.json,include/**,**/CLAUDE.md\" --ignore \"src/ui/**,**/*.css,**/*.html\"",
        "repomix:logic-lite": "npx repomix --remove-empty-lines --compress --output repomix-logic-lite.md --include \"src/**/*.js,index.js,package.json,include/**,**/CLAUDE.md\" --ignore \"src/ui/**,src/prompts/examples/**,**/*.css,**/*.html\"",
        "repomix:ui": "npx repomix --remove-empty-lines --compress --output repomix-ui.md --include \"src/ui/**/*.js,templates/**/*.html,css/**/*.css,manifest.json,**/CLAUDE.md\" --remove-empty-lines",
        "repomix:tests": "npx repomix --remove-empty-lines --compress --output repomix-tests.md --include \"tests/**,vitest.config.js,**/CLAUDE.md\""
    }
}
```

- [ ] Step 2: Test the generate-types script

Run: `npm run generate-types`
Expected: "Generated 18 types in ..."

- [ ] Step 3: Test pretest hook runs generate-types

Run: `npm run pretest`
Expected: "Generated 18 types in ..."

- [ ] Step 4: Test typecheck runs generate-types first

Run: `npm run typecheck 2>&1 | head -5`
Expected: Shows generate-types output, then TypeScript checking

- [ ] Step 5: Commit

```bash
git add package.json && git commit -m "build: add generate-types script and pretest hook"
```

---

### Task 5: Update .githooks/pre-commit to regenerate types

**Files:**
- Modify: `.githooks/pre-commit`

- [ ] Step 1: Read current pre-commit hook

Run: `cat .githooks/pre-commit`

- [ ] Step 2: Update pre-commit hook

Edit `.githooks/pre-commit`:

```bash
#!/bin/sh
# Generate types from Zod schemas before linting
echo "Generating types from Zod schemas..."
npm run generate-types

# Stage the generated file if it changed
if ! git diff --quiet src/types.d.ts; then
    echo "Staging updated types.d.ts..."
    git add src/types.d.ts
fi

# Run existing lint check
echo "Running linter..."
npm run lint
```

- [ ] Step 3: Make hook executable (if not already)

Run: `chmod +x .githooks/pre-commit`

- [ ] Step 4: Test the hook

Run: `.githooks/pre-commit`
Expected: Generates types, stages if changed, runs lint

- [ ] Step 5: Commit

```bash
git add .githooks/pre-commit && git commit -m "build: add type generation to pre-commit hook"
```

---

### Task 6: Update src/extraction/structured.js to use base schemas

**Files:**
- Modify: `src/extraction/structured.js`

**Purpose:** Import base schemas from store/schemas.js and extend with `.catch()` fallbacks for LLM validation. This ensures types are clean (no `| 'Unknown'` unions) while runtime is forgiving.

- [ ] Step 1: Write test to verify structured.js exports schemas

Create `tests/extraction/structured-schema-import.test.js`:

```javascript
// @ts-check
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

describe('structured.js schema imports', () => {
    let structured;

    beforeEach(async () => {
        // Reset modules to get fresh imports
        vi.resetModules();
        await global.registerCdnOverrides?.();
        structured = await import('../../src/extraction/structured.js');
    });

    it('should export EntitySchema with .catch() fallbacks', () => {
        expect(structured.EntitySchema).toBeDefined();

        // Should accept valid entity
        const valid = { name: 'Alice', type: 'PERSON', description: 'A person' };
        const validResult = structured.EntitySchema.safeParse(valid);
        expect(validResult.success).toBe(true);

        // Should FALLBACK on invalid (empty name) due to .catch()
        const invalid = { name: '', type: 'PERSON', description: 'A person' };
        const fallbackResult = structured.EntitySchema.safeParse(invalid);
        expect(fallbackResult.success).toBe(true);
        expect(fallbackResult.data.name).toBe('Unknown');
    });

    it('should export RelationshipSchema with .catch() fallbacks', () => {
        expect(structured.RelationshipSchema).toBeDefined();

        // Should FALLBACK on invalid due to .catch()
        const invalid = { source: '', target: '', description: '' };
        const fallbackResult = structured.RelationshipSchema.safeParse(invalid);
        expect(fallbackResult.success).toBe(true);
        expect(fallbackResult.data.source).toBe('Unknown');
    });

    it('should re-export EventSchema from store/schemas.js', () => {
        expect(structured.EventSchema).toBeDefined();
    });

    it('should re-export EventExtractionSchema', () => {
        expect(structured.EventExtractionSchema).toBeDefined();
    });
});
```

- [ ] Step 2: Run test to verify current behavior (may need modification)

Run: `npx vitest tests/extraction/structured-schema-import.test.js --run`
Expected: Current structured.js doesn't import from store/schemas.js, so fallbacks won't work as expected

- [ ] Step 3: Update src/extraction/structured.js

Edit `src/extraction/structured.js` to import and extend base schemas:

```javascript
import { cdnImport } from '../utils/cdn.js';

const { z } = await cdnImport('zod');

import { logError, logWarn } from '../utils/logging.js';
import { safeParseJSON, stripMarkdownFences } from '../utils/text.js';

// Import base schemas from store/schemas.js
import {
    BaseEntitySchema,
    BaseRelationshipSchema,
    EventSchema,
    EventExtractionSchema,
} from '../store/schemas.js';

// --- Schemas Extended with .catch() Fallbacks for LLM Validation ---

/**
 * Schema for a single memory event
 * Re-exported from store/schemas.js
 */
export { EventSchema, EventExtractionSchema };

/**
 * Schema for relationship impact between characters
 */
export const RelationshipImpactSchema = z.record(z.string(), z.any());

/**
 * Schema for an entity (person, place, organization, object, or concept)
 * Uses .catch() fallbacks to salvage partial LLM output —
 * invalid entries (name = "Unknown") are dropped downstream.
 */
export const EntitySchema = z.object({
    name: BaseEntitySchema.shape.name.catch('Unknown').describe('Entity name, capitalized'),
    type: BaseEntitySchema.shape.type.catch('OBJECT'),
    description: BaseEntitySchema.shape.description.catch('No description available').describe('Comprehensive description of the entity'),
});

/**
 * Schema for a relationship between two entities
 * Uses .catch() fallbacks to salvage partial LLM output in large batches —
 * invalid entries (source/target = "Unknown") are dropped downstream.
 */
export const RelationshipSchema = z.object({
    source: BaseRelationshipSchema.shape.source.catch('Unknown').describe('Source entity name'),
    target: BaseRelationshipSchema.shape.target.catch('Unknown').describe('Target entity name'),
    description: BaseRelationshipSchema.shape.description.catch('No description').describe('Description of the relationship'),
});

/**
 * Schema for Stage 1: Event extraction only
 */
export const GraphExtractionSchema = z.object({
    entities: z.array(EntitySchema).max(5, 'Limit to 5 most significant entities per batch').default([]),
    relationships: z.array(RelationshipSchema).max(5, 'Limit to 5 most significant relationships per batch').default([]),
});

// ... rest of the file (parsing functions, other schemas) remains the same ...
```

**Note:** Keep the rest of the file unchanged - all the parsing functions, jsonSchema converters, reflection schemas, etc.

- [ ] Step 4: Run tests to verify changes work

Run: `npx vitest tests/extraction/structured.test.js tests/extraction/structured-schema-import.test.js --run`
Expected: PASS (all existing tests + new import tests)

- [ ] Step 5: Run full extraction test suite

Run: `npm run test:extract`
Expected: PASS (all extraction tests)

- [ ] Step 6: Commit

```bash
git add -A && git commit -m "refactor(types): import base schemas from store/schemas.js, extend with .catch() fallbacks"
```

---

### Task 7: Migrate source file imports from types.js to types.d.ts

**Files:**
- Modify: `src/utils/cdn.js`
- Modify: `src/utils/queue.js`
- Modify: `src/services/st-vector.js`
- Modify: `src/extraction/extract.js`
- Modify: `src/store/chat-data.js`
- Modify: `src/retrieval/math.js`
- Modify: `src/retrieval/scoring.js`
- Modify: `src/reflection/reflect.js`
- Modify: `src/graph/graph.js`

**Purpose:** Update all type imports to use the generated types.d.ts instead of manual JSDoc in types.js.

- [ ] Step 1: Create a script to update imports

Create a temporary script `scripts/update-imports.js`:

```javascript
#!/usr/bin/env node
/**
 * Update imports from types.js to types.d.ts
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, '../src');

const filesToUpdate = [
    'utils/cdn.js',
    'utils/queue.js',
    'services/st-vector.js',
    'extraction/extract.js',
    'store/chat-data.js',
    'retrieval/math.js',
    'retrieval/scoring.js',
    'reflection/reflect.js',
    'graph/graph.js',
];

async function updateFile(filePath) {
    const fullPath = path.join(SRC_DIR, filePath);
    let content = await fs.readFile(fullPath, 'utf-8');

    // Replace import('../types.js') with import('../types.d.ts')
    // Handle various path depths
    content = content.replace(
        /import\(['"](\.\.\/)+types\.js['"]\)/g,
        (match) => match.replace('types.js', 'types.d.ts')
    );

    await fs.writeFile(fullPath, content, 'utf-8');
    console.log(`Updated ${filePath}`);
}

async function main() {
    for (const file of filesToUpdate) {
        await updateFile(file);
    }
    console.log('Done updating imports');
}

main().catch(console.error);
```

- [ ] Step 2: Run the update script

Run: `node scripts/update-imports.js`

- [ ] Step 3: Verify changes in each file

Run: `grep -n "types.d.ts" src/utils/cdn.js src/utils/queue.js src/services/st-vector.js src/extraction/extract.js src/store/chat-data.js src/retrieval/math.js src/retrieval/scoring.js src/reflection/reflect.js src/graph/graph.js`

Expected: Shows updated imports in all files

- [ ] Step 4: Run typecheck to verify types resolve

Run: `npm run typecheck 2>&1 | head -20`
Expected: TypeScript checking passes (or shows pre-existing errors, no new ones)

- [ ] Step 5: Run tests to verify nothing broke

Run: `npm run test:run`
Expected: PASS (all tests pass)

- [ ] Step 6: Remove temporary script and commit

Run: `rm scripts/update-imports.js`

Run:
```bash
git add -A && git commit -m "refactor(types): migrate imports from types.js to types.d.ts"
```

---

### Task 8: Add deprecation notice to src/types.js and finalize

**Files:**
- Modify: `src/types.js`

**Purpose:** Mark types.js as deprecated during transition period. Keep it for backward compatibility until full migration is verified.

- [ ] Step 1: Add deprecation notice to top of src/types.js

Edit `src/types.js` - add at the top after the @ts-check comment:

```javascript
// @ts-check

/**
 * ⚠️ DEPRECATED: This file is being replaced by src/types.d.ts
 *
 * The types in this file are being migrated to auto-generated TypeScript
 * declarations from Zod schemas (src/store/schemas.js).
 *
 * For new code, use: import('../types.d.ts').TypeName
 *
 * This file will be removed in a future update once all imports are migrated.
 *
 * @deprecated Use src/types.d.ts instead
 */

// ... rest of existing file ...
```

- [ ] Step 2: Run typecheck to ensure nothing broke

Run: `npm run typecheck`
Expected: No new errors

- [ ] Step 3: Run full test suite

Run: `npm run test:run`
Expected: PASS

- [ ] Step 4: Verify generated types.d.ts

Run: `wc -l src/types.d.ts`
Expected: Shows ~100+ lines of generated types

- [ ] Step 5: Final commit

```bash
git add -A && git commit -m "docs(types): add deprecation notice to types.js"
```

---

### Task 9: Update CLAUDE.md with type generation documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] Step 1: Add type generation section to CLAUDE.md

Add to the "ARCHITECTURE MAP" section in CLAUDE.md:

```markdown
### Type System
- `src/store/schemas.js` - Zod schemas (single source of truth)
- `src/types.d.ts` - Auto-generated TypeScript declarations (run `npm run generate-types`)
- `src/types.js` - DEPRECATED: Manual JSDoc types (being phased out)
```

- [ ] Step 2: Add to "CRITICAL RULES":

```markdown
- **Type Generation**: Types are generated from Zod schemas via `npm run generate-types`. Run before committing type changes.
- **Import Pattern**: Use `import('../types.d.ts').TypeName` for type imports, not `types.js`.
```

- [ ] Step 3: Commit

```bash
git add CLAUDE.md && git commit -m "docs: document type generation system in CLAUDE.md"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `npm run generate-types` creates valid `src/types.d.ts`
- [ ] `npm run typecheck` passes with generated types
- [ ] `npm run test` passes (pretest hook generates types first)
- [ ] Pre-commit hook regenerates and stages types
- [ ] Entity type in types.d.ts does NOT have `| "Unknown"` union (uses base schema)
- [ ] structured.js EntitySchema DOES have .catch() fallbacks for runtime
- [ ] All 9 source files updated to use types.d.ts imports
- [ ] types.js has deprecation notice
- [ ] CLAUDE.md documents the type system

## Success Criteria

1. Single source of truth: Zod schemas in `src/store/schemas.js` define both runtime and compile-time types
2. Auto-generation: `npm run generate-types` produces valid TypeScript declarations
3. No duplication: Base schemas generate clean types; extended schemas provide runtime fallbacks
4. Zero breaking changes: All existing tests pass, no runtime behavior changes
5. Developer experience: Pre-commit and pretest hooks ensure types stay fresh

---

Plan written to `docs/plans/2026-03-25-zod-to-types-generator-phase-4.md`. Please review and let me know if you want changes.
