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
