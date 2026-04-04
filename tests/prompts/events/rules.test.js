import { describe, expect, it } from 'vitest';
import { EVENT_RULES } from '../../../src/prompts/events/rules.js';

describe('events/rules', () => {
    it('should include Commitments & Rules in precision section', () => {
        expect(EVENT_RULES).toContain('Commitments & Rules:');
        expect(EVENT_RULES).toContain('exact promise, schedule, boundary');
    });

    it('should include Preferences in precision section', () => {
        expect(EVENT_RULES).toContain('Preferences:');
        expect(EVENT_RULES).toContain('like, dislike, or require');
    });

    it('should include vagueness blacklist entries for commitments', () => {
        expect(EVENT_RULES).toContain('"they made a promise"');
        expect(EVENT_RULES).toContain('"rules were discussed"');
    });
});
