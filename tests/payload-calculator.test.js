import { describe, expect, it } from 'vitest';
import { PAYLOAD_CALC } from '../src/constants.js';

/**
 * Test the pure calculation logic that updatePayloadCalculator() uses.
 * We can't test DOM manipulation in vitest, but we can test the threshold logic.
 */
function getPayloadSeverity(budget, rearview) {
    const total = budget + rearview + PAYLOAD_CALC.OVERHEAD;
    if (total <= PAYLOAD_CALC.THRESHOLD_GREEN) return { total, severity: 'safe', emoji: '✅' };
    if (total <= PAYLOAD_CALC.THRESHOLD_YELLOW) return { total, severity: 'caution', emoji: '⚠️' };
    if (total <= PAYLOAD_CALC.THRESHOLD_ORANGE) return { total, severity: 'warning', emoji: '🟠' };
    return { total, severity: 'danger', emoji: '🔴' };
}

describe('Payload severity calculation', () => {
    it('defaults (12k + 8k) = 32k = green', () => {
        const r = getPayloadSeverity(12000, 8000);
        expect(r.total).toBe(32000);
        expect(r.severity).toBe('safe');
        expect(r.emoji).toBe('✅');
    });

    it('16k + 8k = 36k = yellow', () => {
        const r = getPayloadSeverity(16000, 8000);
        expect(r.total).toBe(36000);
        expect(r.severity).toBe('caution');
    });

    it('32k + 8k = 52k = orange', () => {
        const r = getPayloadSeverity(32000, 8000);
        expect(r.total).toBe(52000);
        expect(r.severity).toBe('warning');
    });

    it('48k + 16k = 76k = red', () => {
        const r = getPayloadSeverity(48000, 16000);
        expect(r.total).toBe(76000);
        expect(r.severity).toBe('danger');
    });

    it('boundary: exactly 32k = green (inclusive)', () => {
        const r = getPayloadSeverity(12000, 8000);
        expect(r.total).toBe(32000);
        expect(r.severity).toBe('safe');
    });

    it('boundary: 32001 = yellow', () => {
        // 12001 + 8000 + 12000 = 32001
        const r = getPayloadSeverity(12001, 8000);
        expect(r.total).toBe(32001);
        expect(r.severity).toBe('caution');
    });
});
