/**
 * Event extraction prompt builder (Stage A).
 */

import {
    assembleSystemPrompt,
    assembleUserConstraints,
    buildMessages,
    formatCharacters,
    formatEstablishedMemories,
    resolveLanguageInstruction,
} from '../shared/formatters.js';
import { EVENT_ROLE } from './role.js';
import { EVENT_SCHEMA } from './schema.js';
import { EVENT_RULES } from './rules.js';
import { getExamples } from './examples/index.js';

/**
 * Build the event extraction prompt (Stage 1).
 * @returns {Array<{role: string, content: string}>}
 */
export function buildEventExtractionPrompt({
    messages,
    names,
    context = {},
    preamble,
    prefill,
    outputLanguage = 'auto',
}) {
    const { char: characterName, user: userName } = names;
    const {
        memories: existingMemories = [],
        charDesc: characterDescription = '',
        personaDesc: personaDescription = '',
    } = context;

    const systemPrompt = assembleSystemPrompt({
        role: EVENT_ROLE,
        examples: getExamples(outputLanguage),
        outputLanguage,
    });

    const memoriesSection = formatEstablishedMemories(existingMemories);
    const charactersSection = formatCharacters(characterName, userName, characterDescription, personaDescription);
    const contextParts = [memoriesSection, charactersSection].filter(Boolean).join('\n');
    const contextSection = contextParts ? `<context>\n${contextParts}\n</context>\n` : '';

    const languageInstruction = resolveLanguageInstruction(messages, outputLanguage);
    const constraints = assembleUserConstraints({
        rules: EVENT_RULES,
        schema: EVENT_SCHEMA,
        languageInstruction,
    });

    const userPrompt = `${contextSection}
<messages>
${messages}
</messages>

Analyze the messages above. Extract events only.
Use EXACT character names: ${characterName}, ${userName}. Never transliterate these names into another script.

${constraints}`;

    return buildMessages(systemPrompt, userPrompt, prefill ?? '<thinking>\n', preamble);
}
