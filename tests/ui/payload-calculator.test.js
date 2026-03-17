import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('updatePayloadCalculator', () => {
    let mockJQuery;

    beforeEach(async () => {
        vi.resetModules();
        await global.registerCdnOverrides();

        document.body.innerHTML = `
            <input type="range" id="openvault_extraction_token_budget" value="8000" min="0" max="50000" />
            <input type="range" id="openvault_extraction_rearview" value="6000" min="0" max="50000" />
            <div id="openvault_payload_calculator"></div>
            <span id="openvault_payload_emoji"></span>
            <span id="openvault_payload_total"></span>
            <div id="openvault_payload_breakdown"></div>
        `;

        // Mock jQuery
        mockJQuery = vi.fn((selector) => {
            const elements = document.querySelectorAll(selector);
            const first = elements.length > 0 ? elements[0] : null;

            const $obj = {
                val: vi.fn((newValue) => {
                    if (newValue !== undefined) {
                        elements.forEach((el) => {
                            el.value = newValue;
                        });
                        return $obj;
                    }
                    // Always re-query to get latest DOM values
                    const current = document.querySelectorAll(selector);
                    return current.length > 0 ? current[0].value : '';
                }),
                text: vi.fn((newValue) => {
                    if (newValue !== undefined) {
                        if (first) first.textContent = newValue;
                        return $obj;
                    }
                    return first ? first.textContent : '';
                }),
                html: vi.fn((newValue) => {
                    if (newValue !== undefined) {
                        if (first) first.innerHTML = newValue;
                        return $obj;
                    }
                    return first ? first.innerHTML : '';
                }),
                addClass: vi.fn(() => $obj),
                removeClass: vi.fn(() => $obj),
                append: vi.fn((html) => {
                    if (first) first.innerHTML += html;
                    return $obj;
                }),
                find: vi.fn((subSelector) => {
                    if (subSelector === '.openvault-payload-warning') {
                        const found = first ? first.querySelector(subSelector) : null;
                        return {
                            length: found ? 1 : 0,
                            text: vi.fn((newValue) => {
                                if (newValue !== undefined && found) {
                                    found.textContent = newValue;
                                    return mockJQuery(found);
                                }
                                return found ? found.textContent : '';
                            }),
                        };
                    }
                    return $obj;
                }),
            };

            return $obj;
        });

        global.$ = mockJQuery;
    });

    it('shows LLM compatibility warning', async () => {
        const { updatePayloadCalculator } = await import('../../src/ui/settings.js');
        updatePayloadCalculator();
        const calc = document.getElementById('openvault_payload_calculator');
        expect(calc.innerHTML).toContain('Ensure your Extraction Profile');
        expect(calc.innerHTML).toContain('context');
    });

    it('shows green emoji for totals under 32k', async () => {
        const { updatePayloadCalculator } = await import('../../src/ui/settings.js');
        document.getElementById('openvault_extraction_token_budget').value = '4000';
        document.getElementById('openvault_extraction_rearview').value = '4000';
        updatePayloadCalculator();
        expect(document.getElementById('openvault_payload_emoji').textContent).toBe('✅');
    });

    it('shows red emoji for totals over 64k', async () => {
        const budgetEl = document.getElementById('openvault_extraction_token_budget');
        const rearviewEl = document.getElementById('openvault_extraction_rearview');
        budgetEl.value = '32000';
        rearviewEl.value = '32000';

        const { updatePayloadCalculator } = await import('../../src/ui/settings.js');
        updatePayloadCalculator();
        expect(document.getElementById('openvault_payload_emoji').textContent).toBe('🔴');
    });
});
