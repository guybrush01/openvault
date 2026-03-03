import { describe, it, expect } from 'vitest';
import { LLM_CONFIGS } from '../src/llm.js';

describe('LLM_CONFIGS after smart retrieval removal', () => {
    it('does not have a retrieval config', () => {
        expect(LLM_CONFIGS.retrieval).toBeUndefined();
    });

    it('still has extraction config', () => {
        expect(LLM_CONFIGS.extraction).toBeDefined();
        expect(LLM_CONFIGS.extraction.profileSettingKey).toBe('extractionProfile');
    });
});
