import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDeps, setDeps } from '../../src/deps.js';
import { defaultSettings, extensionName } from '../../src/constants.js';

// Mock embeddings
vi.mock('../../src/embeddings.js', () => ({
    enrichEventsWithEmbeddings: vi.fn(async (events) => {
        events.forEach(e => { e.embedding = [0.1, 0.2]; });
    }),
    isEmbeddingsEnabled: () => true,
    getQueryEmbedding: vi.fn(async () => [0.1, 0.2]),
}));

// Mock LLM to return entities/relationships
vi.mock('../../src/llm.js', () => ({
    callLLMForExtraction: vi.fn(async () => JSON.stringify({
        reasoning: null,
        events: [{ summary: 'King Aldric entered the Castle', importance: 3, characters_involved: ['King Aldric'] }],
        entities: [
            { name: 'King Aldric', type: 'PERSON', description: 'The aging ruler' },
            { name: 'Castle', type: 'PLACE', description: 'An ancient fortress' },
        ],
        relationships: [
            { source: 'King Aldric', target: 'Castle', description: 'Rules from' },
        ],
    })),
    LLM_CONFIGS: { extraction: { profileSettingKey: 'extractionProfile', maxTokens: 4000, timeoutMs: 120000 } },
}));

// Mock UI
vi.mock('../../src/ui/render.js', () => ({ refreshAllUI: vi.fn() }));
vi.mock('../../src/ui/status.js', () => ({ setStatus: vi.fn() }));

import { extractMemories } from '../../src/extraction/extract.js';

describe('extractMemories graph integration', () => {
    let mockContext;
    let mockData;

    beforeEach(() => {
        mockData = {
            memories: [],
            character_states: {},
            last_processed_message_id: -1,
            processed_message_ids: [],
        };

        mockContext = {
            chat: [
                { mes: 'Hello', is_user: true, name: 'User' },
                { mes: 'Welcome to the Castle', is_user: false, name: 'King Aldric' },
            ],
            name1: 'User',
            name2: 'King Aldric',
            characterId: 'char1',
            characters: { char1: { description: '' } },
            chatMetadata: { openvault: mockData },
            chatId: 'test-chat',
            powerUserSettings: {},
        };

        setDeps({
            getContext: () => mockContext,
            getExtensionSettings: () => ({
                [extensionName]: { ...defaultSettings, enabled: true },
            }),
            saveChatConditional: vi.fn(async () => true),
            console: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
            Date: { now: () => 1000000 },
        });
    });

    afterEach(() => {
        resetDeps();
        vi.clearAllMocks();
    });

    it('populates graph.nodes from extracted entities', async () => {
        const result = await extractMemories([0, 1]);
        expect(result.status).toBe('success');
        expect(mockData.graph).toBeDefined();
        expect(mockData.graph.nodes['king aldric']).toBeDefined();
        expect(mockData.graph.nodes['king aldric'].type).toBe('PERSON');
        expect(mockData.graph.nodes['castle']).toBeDefined();
    });

    it('populates graph.edges from extracted relationships', async () => {
        await extractMemories([0, 1]);
        expect(mockData.graph.edges['king aldric__castle']).toBeDefined();
        expect(mockData.graph.edges['king aldric__castle'].description).toBe('Rules from');
    });

    it('increments graph_message_count', async () => {
        await extractMemories([0, 1]);
        expect(mockData.graph_message_count).toBeGreaterThan(0);
    });
});
