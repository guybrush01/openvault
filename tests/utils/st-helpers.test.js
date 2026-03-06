import { afterEach, describe, expect, it, vi } from 'vitest';
import { extensionName } from '../../src/constants.js';
import { resetDeps, setDeps } from '../../src/deps.js';
import { isExtensionEnabled, safeSetExtensionPrompt, withTimeout, yieldToMain } from '../../src/utils/st-helpers.js';

describe('st-helpers', () => {
    afterEach(() => resetDeps());

    describe('withTimeout', () => {
        it('resolves when promise completes before timeout', async () => {
            const result = await withTimeout(Promise.resolve('success'), 1000, 'Test');
            expect(result).toBe('success');
        });

        it('rejects when promise exceeds timeout', async () => {
            const promise = new Promise((resolve) => setTimeout(resolve, 100));
            await expect(withTimeout(promise, 10, 'Test')).rejects.toThrow('Test timed out after 10ms');
        });
    });

    describe('safeSetExtensionPrompt', () => {
        it('calls setExtensionPrompt and returns true on success', () => {
            const mockSetPrompt = vi.fn();
            setDeps({
                console: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
                setExtensionPrompt: mockSetPrompt,
                extension_prompt_types: { IN_PROMPT: 3 },
            });

            expect(safeSetExtensionPrompt('test content')).toBe(true);
            expect(mockSetPrompt).toHaveBeenCalledWith(extensionName, 'test content', 3, 0);
        });

        it('returns false on error', () => {
            setDeps({
                console: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
                setExtensionPrompt: () => {
                    throw new Error('Prompt failed');
                },
                extension_prompt_types: { IN_PROMPT: 3 },
            });

            expect(safeSetExtensionPrompt('test content')).toBe(false);
        });

        it('passes custom name to setExtensionPrompt', () => {
            const mockSetPrompt = vi.fn();
            setDeps({
                console: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
                setExtensionPrompt: mockSetPrompt,
                extension_prompt_types: { IN_PROMPT: 0 },
            });

            safeSetExtensionPrompt('test content', 'openvault_world');
            expect(mockSetPrompt).toHaveBeenCalledWith('openvault_world', 'test content', 0, 0);
        });

        it('defaults to extensionName when no name provided', () => {
            const mockSetPrompt = vi.fn();
            setDeps({
                console: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
                setExtensionPrompt: mockSetPrompt,
                extension_prompt_types: { IN_PROMPT: 0 },
            });

            safeSetExtensionPrompt('test content');
            expect(mockSetPrompt).toHaveBeenCalledWith('openvault', 'test content', 0, 0);
        });
    });

    describe('isExtensionEnabled', () => {
        it('returns true when enabled is true', () => {
            setDeps({ getExtensionSettings: () => ({ [extensionName]: { enabled: true } }) });
            expect(isExtensionEnabled()).toBe(true);
        });

        it('returns false when enabled is false', () => {
            setDeps({ getExtensionSettings: () => ({ [extensionName]: { enabled: false } }) });
            expect(isExtensionEnabled()).toBe(false);
        });

        it('returns false when settings missing', () => {
            setDeps({ getExtensionSettings: () => ({}) });
            expect(isExtensionEnabled()).toBe(false);
        });
    });

    describe('yieldToMain', () => {
        it('returns a promise that resolves', async () => {
            await yieldToMain();
        });
    });
});
