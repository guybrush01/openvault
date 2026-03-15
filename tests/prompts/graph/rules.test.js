import { describe, expect, it } from 'vitest';
import { GRAPH_RULES } from '../../../src/prompts/graph/rules.js';

describe('graph/rules', () => {
    it('should include <thinking_process> block in GRAPH_RULES', () => {
        expect(GRAPH_RULES).toContain('<thinking_process>');
        expect(GRAPH_RULES).toContain('</thinking_process>');
    });

    it('should include the 4 steps in thinking_process', () => {
        expect(GRAPH_RULES).toContain('Step 1: Entity scan');
        expect(GRAPH_RULES).toContain('Step 2: Type validation');
        expect(GRAPH_RULES).toContain('Step 3: Relationship map');
        expect(GRAPH_RULES).toContain('Step 4: Output');
    });

    it('should reference <thinking> tags in thinking_process', () => {
        expect(GRAPH_RULES).toContain('<thinking>');
        expect(GRAPH_RULES).toContain('</thinking>');
    });
});
