import { describe, expect, it } from 'vitest';
import {
    cleanupCharacterStates,
    updateCharacterStatesFromEvents,
} from '../../src/extraction/extract.js';
import { buildMockData } from '../factories.js';

describe('updateCharacterStatesFromEvents', () => {
    it('creates character states for valid characters in emotional_impact', () => {
        const data = buildMockData();
        const events = [
            {
                id: 'event_1',
                emotional_impact: { 'King Aldric': 'triumphant' },
                message_ids: [1, 2],
            },
        ];

        updateCharacterStatesFromEvents(events, data, ['King Aldric', 'User']);

        expect(data.character_states['King Aldric']).toBeDefined();
        expect(data.character_states['King Aldric'].current_emotion).toBe('triumphant');
    });

    it('skips invalid character names in emotional_impact', () => {
        const data = buildMockData();
        const events = [
            {
                id: 'event_1',
                emotional_impact: {
                    'King Aldric': 'triumphant',
                    don: 'angry',
                },
                message_ids: [1, 2],
                characters_involved: ['King Aldric'],
            },
        ];

        updateCharacterStatesFromEvents(events, data, ['King Aldric', 'User']);

        expect(data.character_states['King Aldric']).toBeDefined();
        expect(data.character_states.don).toBeUndefined();
    });

    it('creates character states for valid characters in witnesses', () => {
        const data = buildMockData();
        const events = [
            {
                id: 'event_1',
                witnesses: ['King Aldric', 'User'],
                characters_involved: ['King Aldric', 'User'],
            },
        ];

        updateCharacterStatesFromEvents(events, data, ['King Aldric', 'User']);

        expect(data.character_states['King Aldric']).toBeDefined();
        expect(data.character_states.User).toBeDefined();
        expect(data.character_states['King Aldric'].known_events).toContain('event_1');
    });

    it('skips invalid character names in witnesses', () => {
        const data = buildMockData();
        const events = [
            {
                id: 'event_1',
                witnesses: ['King Aldric', 'Stranger'],
                characters_involved: ['King Aldric'],
            },
        ];

        updateCharacterStatesFromEvents(events, data, ['King Aldric', 'User']);

        expect(data.character_states['King Aldric']).toBeDefined();
        expect(data.character_states.Stranger).toBeUndefined();
    });

    it('allows characters from characters_involved even if not in validCharNames', () => {
        const data = buildMockData();
        const events = [
            {
                id: 'event_1',
                emotional_impact: { Queen: 'worried' },
                characters_involved: ['Queen'],
            },
        ];

        updateCharacterStatesFromEvents(events, data, ['King Aldric', 'User']);

        expect(data.character_states.Queen).toBeDefined();
        expect(data.character_states.Queen.current_emotion).toBe('worried');
    });

    it('accepts Cyrillic witness name matching Latin characters_involved via transliteration', () => {
        const data = buildMockData();
        const events = [
            {
                id: 'event_1',
                characters_involved: ['Mina'],
                witnesses: ['\u041c\u0438\u043d\u0430'],
            },
        ];

        updateCharacterStatesFromEvents(events, data, ['Suzy', 'Vova']);

        expect(data.character_states['\u041c\u0438\u043d\u0430']).toBeDefined();
        expect(data.character_states['\u041c\u0438\u043d\u0430'].known_events).toContain('event_1');
    });

    it('accepts Cyrillic emotional_impact name matching Latin validCharNames via transliteration', () => {
        const data = buildMockData();
        const events = [
            {
                id: 'event_1',
                emotional_impact: { '\u041c\u0438\u043d\u0430': 'surprised' },
                characters_involved: ['Mina'],
                message_ids: [1],
            },
        ];

        updateCharacterStatesFromEvents(events, data, ['Suzy', 'Vova']);

        expect(data.character_states['\u041c\u0438\u043d\u0430']).toBeDefined();
        expect(data.character_states['\u041c\u0438\u043d\u0430'].current_emotion).toBe('surprised');
    });
});

describe('cleanupCharacterStates', () => {
    it('removes character states not in validCharNames or memories', () => {
        const data = buildMockData({
            character_states: {
                'King Aldric': { name: 'King Aldric', current_emotion: 'neutral' },
                User: { name: 'User', current_emotion: 'neutral' },
                Stranger: { name: 'Stranger', current_emotion: 'angry' },
            },
        });

        cleanupCharacterStates(data, ['King Aldric', 'User']);

        expect(data.character_states['King Aldric']).toBeDefined();
        expect(data.character_states.User).toBeDefined();
        expect(data.character_states.Stranger).toBeUndefined();
    });

    it('keeps character states found in memories characters_involved', () => {
        const data = buildMockData({
            character_states: {
                'King Aldric': { name: 'King Aldric', current_emotion: 'neutral' },
                Queen: { name: 'Queen', current_emotion: 'worried' },
                Stranger: { name: 'Stranger', current_emotion: 'angry' },
            },
            memories: [{ characters_involved: ['King Aldric', 'Queen'] }],
        });

        cleanupCharacterStates(data, ['King Aldric', 'User']);

        expect(data.character_states['King Aldric']).toBeDefined();
        expect(data.character_states.Queen).toBeDefined();
        expect(data.character_states.Stranger).toBeUndefined();
    });

    it('handles empty character_states gracefully', () => {
        const data = buildMockData();

        expect(() => cleanupCharacterStates(data, ['King Aldric', 'User'])).not.toThrow();
    });

    it('handles missing validCharNames', () => {
        const data = buildMockData({
            character_states: {
                'King Aldric': { name: 'King Aldric', current_emotion: 'neutral' },
                Queen: { name: 'Queen', current_emotion: 'worried' },
            },
            memories: [{ characters_involved: ['King Aldric'] }],
        });

        cleanupCharacterStates(data, []);

        expect(data.character_states['King Aldric']).toBeDefined();
        expect(data.character_states.Queen).toBeUndefined();
    });
});
