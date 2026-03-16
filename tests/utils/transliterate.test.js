import { describe, expect, it } from 'vitest';
import { levenshteinDistance, resolveCharacterName, transliterateCyrToLat } from '../../src/utils/transliterate.js';

describe('transliterateCyrToLat', () => {
    it('transliterates Сузи to suzi', () => {
        expect(transliterateCyrToLat('Сузи')).toBe('suzi');
    });

    it('transliterates Вова to vova', () => {
        expect(transliterateCyrToLat('Вова')).toBe('vova');
    });

    it('transliterates Мина to mina', () => {
        expect(transliterateCyrToLat('Мина')).toBe('mina');
    });

    it('passes through Latin text unchanged (lowercased)', () => {
        expect(transliterateCyrToLat('Suzy')).toBe('suzy');
    });

    it('handles empty string', () => {
        expect(transliterateCyrToLat('')).toBe('');
    });
});

describe('levenshteinDistance', () => {
    it('returns 0 for identical strings', () => {
        expect(levenshteinDistance('suzy', 'suzy')).toBe(0);
    });

    it('returns string length for empty comparison', () => {
        expect(levenshteinDistance('abc', '')).toBe(3);
        expect(levenshteinDistance('', 'abc')).toBe(3);
    });

    it('returns 1 for single char difference (suzi vs suzy)', () => {
        expect(levenshteinDistance('suzi', 'suzy')).toBe(1);
    });

    it('returns 2 for two char differences', () => {
        // "vova" vs "vava" = 1 (o->a), "mina" vs "mona" = 1 (i->o)
        expect(levenshteinDistance('ab', 'cd')).toBe(2);
    });

    it('handles insertion/deletion', () => {
        expect(levenshteinDistance('cat', 'cats')).toBe(1);
        expect(levenshteinDistance('cats', 'cat')).toBe(1);
    });
});

describe('resolveCharacterName', () => {
    it('returns exact match (case-insensitive)', () => {
        expect(resolveCharacterName('Mina', ['Mina', 'Suzy'])).toBe('Mina');
        expect(resolveCharacterName('mina', ['Mina', 'Suzy'])).toBe('Mina');
    });

    it('resolves Cyrillic name to Latin canonical via transliteration', () => {
        expect(resolveCharacterName('Мина', ['Mina', 'Suzy'])).toBe('Mina');
    });

    it('resolves Latin name to Cyrillic canonical via transliteration', () => {
        expect(resolveCharacterName('Mina', ['Мина', 'Suzy'])).toBe('Мина');
    });

    it('handles transliteration with Levenshtein distance (Сузи→suzi vs suzy)', () => {
        expect(resolveCharacterName('Сузи', ['Suzy', 'Vova'])).toBe('Suzy');
    });

    it('returns null when no match found', () => {
        expect(resolveCharacterName('Unknown', ['Mina', 'Suzy'])).toBeNull();
    });

    it('returns null for cross-script with distance > 2', () => {
        expect(resolveCharacterName('Александр', ['Bob'])).toBeNull();
    });

    it('returns null for empty canonical list', () => {
        expect(resolveCharacterName('Mina', [])).toBeNull();
    });
});
