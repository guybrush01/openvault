/**
 * CDN Import with Retry + Mirror Fallback
 *
 * Tries esm.sh first, then esm.run (jsdelivr's ESM CDN).
 * Retries the full mirror cycle up to MAX_ROUNDS times.
 * Uses an application-level cache so the same package spec is never fetched twice.
 */

const MIRRORS = [(pkg) => `https://esm.sh/${pkg}`, (pkg) => `https://esm.run/${pkg}`];

/** Full mirror cycle repeated this many times before giving up. */
const MAX_ROUNDS = 2;

/** @type {Map<string, object>} Package spec → resolved module */
const cache = new Map();

/**
 * Test-only override map. Populated by vitest setup before modules load.
 * @type {Map<string, object>}
 */
const _testOverrides = new Map();

/**
 * Register a local module for a package spec (test-only).
 * Must be called from vitest setupFiles BEFORE source modules are imported.
 * @param {string} packageSpec
 * @param {object} mod - The module namespace object
 */
export function _setTestOverride(packageSpec, mod) {
    _testOverrides.set(packageSpec, mod);
}

/**
 * Import an npm package from CDN with retry and mirror fallback.
 *
 * @param {string} packageSpec - Package specifier (e.g. 'zod', 'gpt-tokenizer/encoding/o200k_base')
 * @returns {Promise<object>} The resolved ES module namespace
 * @throws {Error} If all mirrors and retries are exhausted
 */
export async function cdnImport(packageSpec) {
    // Test override — instant, no network
    if (_testOverrides.has(packageSpec)) return _testOverrides.get(packageSpec);

    // Application-level cache — same package spec never fetched twice
    if (cache.has(packageSpec)) return cache.get(packageSpec);

    let lastError;

    for (let round = 0; round < MAX_ROUNDS; round++) {
        for (const mirror of MIRRORS) {
            const url = mirror(packageSpec);
            try {
                const mod = await import(/* webpackIgnore: true */ url);
                cache.set(packageSpec, mod);
                return mod;
            } catch (err) {
                lastError = err;
                console.warn(`[OpenVault CDN] ${url} failed (round ${round + 1}/${MAX_ROUNDS}): ${err.message}`);
            }
        }
    }

    throw new Error(
        `CDN import failed for "${packageSpec}" after ${MAX_ROUNDS} rounds ` +
            `across ${MIRRORS.length} mirrors: ${lastError?.message}`
    );
}
