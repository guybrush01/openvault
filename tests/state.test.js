import { describe, expect, it } from 'vitest';
import { getSessionSignal, resetSessionController } from '../src/state.js';

describe('Session AbortController', () => {
    it('getSessionSignal returns an AbortSignal', () => {
        const signal = getSessionSignal();
        expect(signal).toBeInstanceOf(AbortSignal);
        expect(signal.aborted).toBe(false);
    });

    it('resetSessionController aborts the previous signal', () => {
        const oldSignal = getSessionSignal();
        resetSessionController();
        expect(oldSignal.aborted).toBe(true);
    });

    it('resetSessionController creates a fresh non-aborted signal', () => {
        resetSessionController();
        const newSignal = getSessionSignal();
        expect(newSignal.aborted).toBe(false);
    });

    it('multiple resets do not throw', () => {
        expect(() => {
            resetSessionController();
            resetSessionController();
            resetSessionController();
        }).not.toThrow();
    });

    it('each reset produces a distinct signal', () => {
        const signal1 = getSessionSignal();
        resetSessionController();
        const signal2 = getSessionSignal();
        expect(signal1).not.toBe(signal2);
        expect(signal1.aborted).toBe(true);
        expect(signal2.aborted).toBe(false);
    });
});
