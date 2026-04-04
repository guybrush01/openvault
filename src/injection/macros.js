import { getDeps } from '../deps.js';

/**
 * Cached content for macro access.
 * Exported so injection logic can update it.
 * Mutating properties (not reassigning) updates macro return values in-place.
 */
export const cachedContent = {
    memory: '',
    world: '',
};

/**
 * Initialize macros by registering with SillyTavern.
 * Must be called after extension is loaded.
 */
export function initMacros() {
    const context = getDeps().getContext();

    try {
        const registry = context.macros?.registry;
        if (registry && typeof registry.registerMacro === 'function') {
            // ST 1.13+ format: registerMacro(name, optionsObject)
            registry.registerMacro('openvault_memory', {
                value: () => cachedContent.memory,
                description: 'OpenVault Memory Context',
            });
            registry.registerMacro('openvault_world', {
                value: () => cachedContent.world,
                description: 'OpenVault World Context',
            });
        } else if (typeof context.registerMacro === 'function') {
            // Legacy format: registerMacro(name, callback)
            context.registerMacro('openvault_memory', () => cachedContent.memory);
            context.registerMacro('openvault_world', () => cachedContent.world);
        }
    } catch (e) {
        console.warn('[OpenVault] Macro registration failed. ST API may have changed.', e);
    }
}

// Auto-initialize on import
initMacros();
