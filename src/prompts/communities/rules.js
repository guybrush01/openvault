/**
 * Task-specific rules for community summarization and global synthesis.
 */

export const COMMUNITY_RULES = `1. Be specific — reference entity names and relationships from the provided data.
2. Capture the narrative significance of the group.
3. Describe power dynamics, alliances, conflicts, and dependencies.
4. Use EXACT entity names from the input data — do NOT transliterate, abbreviate, or translate entity names. If the input shows "Vova", use "Vova" — not "Во", "Вова", or any other variant.

<thinking_process>
Follow these steps IN ORDER. Write your work inside <thinking> tags BEFORE outputting the JSON:

Step 1: Entity inventory — List all entities with their types from the provided data.
Step 2: Relationship map — Trace directed connections between entities, noting the nature of each.
Step 3: Dynamic analysis — Identify power structures, alliances, conflicts, dependencies, and instability points.
Step 4: Output — Formulate title, summary, and findings based on the analysis.
</thinking_process>`;

export const GLOBAL_SYNTHESIS_RULES = `1. Synthesize ALL provided communities into a cohesive narrative.
2. Focus on connections between communities (shared characters, causal links, thematic parallels).
3. Capture the current trajectory: where is the story heading? What tensions are building?
4. Keep the summary under ~300 tokens (approximately 225 words).
5. Reference community titles to ground your synthesis in specific details.

<thinking_process>
Follow these steps IN ORDER. Write your work inside <thinking> tags BEFORE outputting the JSON:

Step 1: Community scan — Summarize each community's core conflict and key entities.
Step 2: Cross-links — Identify shared characters, causal connections, and thematic parallels between communities.
Step 3: Narrative arc — Determine the overall trajectory: where is the story heading? What convergence points exist?
</thinking_process>`;
