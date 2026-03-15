import { describe, expect, it } from 'vitest';
import { hasSufficientTokenOverlap } from '../../src/graph/graph.js';

describe('hasSufficientTokenOverlap', () => {
    it('should accept 50%+ token overlap', () => {
        const tokensA = new Set(['king', 'aldric', 'northern']);
        const tokensB = new Set(['king', 'aldric', 'southern']);

        expect(hasSufficientTokenOverlap(tokensA, tokensB, 0.5)).toBe(true);
    });

    it('should handle substring containment separately', () => {
        const keyA = 'alice';
        const keyB = 'alicia';

        expect(hasSufficientTokenOverlap(new Set([keyA]), new Set([keyB]), 0.5, keyA, keyB)).toBe(true); // Substring containment
    });

    it('should match Russian morphological variants via stemming (ошейник/ошейником)', () => {
        // "ошейник" (nominative) vs "ошейником" (instrumental) — same word, different case
        const tokensA = new Set(['ошейник']);
        const tokensB = new Set(['ошейником']);
        // keyA/keyB won't substring-match, tokens won't overlap, but stems should
        expect(hasSufficientTokenOverlap(tokensA, tokensB, 0.5, 'ошейник', 'ошейником')).toBe(true);
    });

    it('should match short names via lowered LCS threshold (Кай/Каю)', () => {
        // "Кай" (3 chars) and "Каю" (3 chars) — LCS "Ка" = 2/3 = 67% ≥ 60%
        // Currently skipped because length ≤ 3. After lowering to > 2, should match.
        const tokensA = new Set(['кай']);
        const tokensB = new Set(['каю']);
        expect(hasSufficientTokenOverlap(tokensA, tokensB, 0.5, 'кай', 'каю')).toBe(true);
    });

    it('should NOT merge unrelated entities even with stem check', () => {
        // "малина" (raspberry/safeword) vs "машина" (car) — different stems
        const tokensA = new Set(['малина']);
        const tokensB = new Set(['машина']);
        expect(hasSufficientTokenOverlap(tokensA, tokensB, 0.5, 'малина', 'машина')).toBe(false);
    });

    it('should NOT merge расчёска/миска (short suffix "-ска" = 3 chars < 4 min)', () => {
        const tokensA = new Set(['расчёска']);
        const tokensB = new Set(['миска']);
        expect(hasSufficientTokenOverlap(tokensA, tokensB, 0.6, 'расчёска', 'миска')).toBe(false);
    });

    it('should NOT merge anything with воск (LCS 3 chars < 4 min)', () => {
        const tokensA = new Set(['чёрный', 'кружевной', 'бюстгальтер', 'с', 'носками', 'в', 'чашках']);
        const tokensB = new Set(['воск']);
        expect(
            hasSufficientTokenOverlap(tokensA, tokensB, 0.6, 'чёрный кружевной бюстгальтер с носками в чашках', 'воск')
        ).toBe(false);
    });

    it('should NOT merge кольцо/колокольчик (LCS "коль" 4/6=0.67 < 0.7)', () => {
        const tokensA = new Set(['кольцо']);
        const tokensB = new Set(['колокольчик']);
        expect(hasSufficientTokenOverlap(tokensA, tokensB, 0.6, 'кольцо', 'колокольчик')).toBe(false);
    });

    it('should still merge Свечи/Свеча (LCS "свеч" 4/5=0.8 ≥ 0.7)', () => {
        const tokensA = new Set(['свечи']);
        const tokensB = new Set(['свеча']);
        expect(hasSufficientTokenOverlap(tokensA, tokensB, 0.6, 'свечи', 'свеча')).toBe(true);
    });

    it('should still merge верёвки/верёвка (LCS "верёвк" 6/7=0.86 ≥ 0.7)', () => {
        const tokensA = new Set(['верёвки']);
        const tokensB = new Set(['верёвка']);
        expect(hasSufficientTokenOverlap(tokensA, tokensB, 0.6, 'верёвки', 'верёвка')).toBe(true);
    });
});
