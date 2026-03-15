/**
 * JSON output schema for event extraction.
 */

export const EVENT_SCHEMA = `Output EXACTLY ONE JSON object with this structure:

{
  "events": [
    {
      "summary": "8-25 word description of what happened, past tense",
      "importance": 3,
      "characters_involved": ["CharacterName"],
      "witnesses": [],
      "location": null,
      "is_secret": false,
      "emotional_impact": {"CharacterName": "emotion description"},
      "relationship_impact": {"CharacterA->CharacterB": "how relationship changed"}
    }
  ]
}

FORMAT RULES:
1. Top level MUST be a JSON object { }, NEVER a bare array [ ].
2. The "events" key MUST always be present. If nothing found: "events": [].
3. Do NOT wrap in markdown code blocks.
4. Keep character names exactly as they appear in the input.
5. NEVER use string concatenation ("+") inside JSON values. Write all text as a single, unbroken line within the quotes.`;
