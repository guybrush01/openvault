/**
 * Shared formatters for prompt construction.
 *
 * Language resolution, message assembly, context formatting.
 */

import { sortMemoriesBySequence } from '../utils/text.js';
import { SYSTEM_PREAMBLE_CN } from './preambles.js';

// =============================================================================
// LANGUAGE RESOLUTION
// =============================================================================

/**
 * Detect non-Latin script in text and return a language reinforcement reminder.
 * Fires only when the narrative is not primarily English — avoids unnecessary noise for English chats.
 * @param {string} text - The messages/content text to analyze
 * @returns {string} Reminder string if non-Latin detected, empty string otherwise
 */
function buildLanguageReminder(text) {
    if (!text) return '';
    const sample = text.slice(0, 2000);
    const allLetters = sample.match(/\p{L}/gu) || [];
    const latinLetters = allLetters.filter((c) => /[a-zA-Z]/.test(c)).length;
    const nonLatinLetters = allLetters.length - latinLetters;
    if (nonLatinLetters > latinLetters * 0.5) {
        return '\nIMPORTANT — LANGUAGE: The text above is NOT in English. Per Language Rules, ALL output string values (summaries, descriptions, emotions, relationship impacts) MUST be in the SAME language as the narrative text. Do NOT translate to English. JSON keys stay English. EXCEPTION: Character names MUST stay in their original script exactly as written — do NOT transliterate.\n';
    }
    return '';
}

/**
 * Build a deterministic output language instruction for forced RU/EN mode.
 * Returns empty string for 'auto' (caller should use buildLanguageReminder instead).
 * @param {'auto'|'en'|'ru'} language
 * @returns {string}
 */
function buildOutputLanguageInstruction(language) {
    if (language === 'ru') {
        return '\nIMPORTANT — LANGUAGE: Write ALL output string values (summaries, descriptions, emotions, relationship impacts) in Russian. JSON keys stay English. EXCEPTION: Character names MUST stay in their original script exactly as written — do NOT transliterate.\n';
    }
    if (language === 'en') {
        return '\nIMPORTANT — LANGUAGE: Write ALL output string values (summaries, descriptions, emotions, relationship impacts) in English. JSON keys stay English. EXCEPTION: Character names MUST stay in their original script exactly as written — do NOT transliterate.\n';
    }
    return '';
}

/**
 * Resolve the language instruction for a prompt's user message.
 * In 'auto' mode, uses heuristic detection on the text to add a reminder for non-Latin scripts.
 * In forced mode ('en'/'ru'), returns a deterministic instruction.
 * @param {string} text - The text to analyze (used only in 'auto' mode)
 * @param {'auto'|'en'|'ru'} outputLanguage - The output language setting
 * @returns {string} Language instruction string (may be empty)
 */
export function resolveLanguageInstruction(text, outputLanguage) {
    return outputLanguage === 'auto' ? buildLanguageReminder(text) : buildOutputLanguageInstruction(outputLanguage);
}

// =============================================================================
// MESSAGE ASSEMBLY
// =============================================================================

/**
 * Wrap system prompt with preamble and build message array with assistant prefill.
 * @param {string} systemPrompt - The task-specific system prompt
 * @param {string} userPrompt - The user message
 * @param {string} [assistantPrefill='{'] - Assistant prefill to bias toward output mode
 * @param {string} [preamble=SYSTEM_PREAMBLE_CN] - System preamble to prepend
 * @returns {Array<{role: string, content: string}>}
 */
export function buildMessages(systemPrompt, userPrompt, assistantPrefill = '{', preamble = SYSTEM_PREAMBLE_CN) {
    const msgs = [
        { role: 'system', content: `${preamble}\n\n${systemPrompt}` },
        { role: 'user', content: userPrompt },
    ];
    if (assistantPrefill) {
        msgs.push({ role: 'assistant', content: assistantPrefill });
    }
    return msgs;
}

// =============================================================================
// CONTEXT FORMATTING
// =============================================================================

/**
 * Format existing memories as an XML section for dedup context.
 * @param {Object[]} existingMemories
 * @returns {string}
 */
export function formatEstablishedMemories(existingMemories) {
    if (!existingMemories?.length) return '';
    const memorySummaries = sortMemoriesBySequence(existingMemories, true)
        .map((m, i) => `${i + 1}. [${m.importance} Star] ${m.summary}`)
        .join('\n');
    return `<established_memories>\n${memorySummaries}\n</established_memories>`;
}

/**
 * Format character descriptions as an XML section.
 * @param {string} characterName
 * @param {string} userName
 * @param {string} characterDescription
 * @param {string} personaDescription
 * @returns {string}
 */
export function formatCharacters(characterName, userName, characterDescription, personaDescription) {
    if (characterDescription || personaDescription) {
        const parts = ['<characters>'];
        if (characterDescription) {
            parts.push(`<character name="${characterName}" role="main">\n${characterDescription}\n</character>`);
        }
        if (personaDescription) {
            parts.push(`<character name="${userName}" role="user">\n${personaDescription}\n</character>`);
        }
        parts.push('</characters>');
        return parts.join('\n');
    }

    return `<characters>\n<character name="${characterName}" role="main"/>\n<character name="${userName}" role="user"/>\n</characters>`;
}
