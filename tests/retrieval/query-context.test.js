import { describe, expect, it } from 'vitest';

describe('buildCorpusVocab', () => {
    it('should collect memory tokens into the vocabulary set', async () => {
        const { buildCorpusVocab } = await import('../../src/retrieval/query-context.js');

        const memories = [
            { tokens: ['sword', 'fight', 'castl'] },
            { tokens: ['dragon', 'fire'] },
        ];
        const hiddenMemories = [
            { tokens: ['sword', 'shield'] },
        ];

        const vocab = buildCorpusVocab(memories, hiddenMemories, {}, {});

        expect(vocab).toBeInstanceOf(Set);
        expect(vocab.has('sword')).toBe(true);
        expect(vocab.has('fight')).toBe(true);
        expect(vocab.has('castl')).toBe(true);
        expect(vocab.has('dragon')).toBe(true);
        expect(vocab.has('fire')).toBe(true);
        expect(vocab.has('shield')).toBe(true);
        expect(vocab.size).toBe(6); // sword deduplicated, shield added from hidden
    });

    it('should tokenize graph node and edge descriptions into vocab', async () => {
        const { buildCorpusVocab } = await import('../../src/retrieval/query-context.js');

        const graphNodes = {
            king_aldric: { name: 'King Aldric', description: 'The wise ruler of the northern kingdom' },
        };
        const graphEdges = {
            king_aldric__queen_sera: { description: 'Married in the great cathedral' },
        };

        const vocab = buildCorpusVocab([], [], graphNodes, graphEdges);

        // tokenize() stems and filters stopwords + words <= 2 chars
        // "wise", "ruler", "northern", "kingdom", "married", "great", "cathedral" should produce stems
        expect(vocab.size).toBeGreaterThan(0);
        // Should NOT contain stopwords or short words like "the", "of", "in"
        expect(vocab.has('the')).toBe(false);
        expect(vocab.has('of')).toBe(false);
    });

    it('should handle empty/null inputs gracefully', async () => {
        const { buildCorpusVocab } = await import('../../src/retrieval/query-context.js');

        const vocab = buildCorpusVocab([], [], null, null);
        expect(vocab).toBeInstanceOf(Set);
        expect(vocab.size).toBe(0);
    });

    it('should handle memories without tokens property', async () => {
        const { buildCorpusVocab } = await import('../../src/retrieval/query-context.js');

        const memories = [{ summary: 'no tokens here' }, { tokens: ['valid'] }];
        const vocab = buildCorpusVocab(memories, [], {}, {});

        expect(vocab.has('valid')).toBe(true);
        expect(vocab.size).toBe(1);
    });
});
