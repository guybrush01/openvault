# Prompts Module

LLM prompt construction for all extraction domains. Targets mid-tier CN instruct models (Qwen, Kimi).

## Tag Convention: `<think>` ONLY

Every reference to reasoning tags in this module MUST use `<think>`, never `<thinking>`:
- `EXECUTION_TRIGGER` in `shared/formatters.js` instructs `<think>`
- `MIRROR_LANGUAGE_RULES` in `shared/rules.js` references `<think>`
- `PREFILL_PRESETS` in `shared/preambles.js` all use `<think>`
- `formatExamples()` in `shared/format-examples.js` wraps the `thinking` property in `<think>...</think>`
- `<thinking_process>` blocks inside each domain's `rules.js` instruct `<think>` tags

The XML wrapper `<thinking_process>` is a structural delimiter (not a tag the model outputs). The model *outputs* `<think>`. These are different things — do not confuse them.

Backward compat: `stripThinkingTags()` in `src/utils/text.js` still strips `<thinking>` from model output, but prompts must never instruct it.

## Domain Structure

Four extraction domains + shared utilities. Each domain follows a fixed file convention:

| File | Purpose |
|------|---------|
| `role.js` | System role definition (who the model is) |
| `rules.js` | Task-specific rules with `<thinking_process>` reasoning steps |
| `schema.js` | Output JSON schema description |
| `builder.js` | Assembles messages via `buildMessages()` |
| `examples/{en,ru}.js` | Bilingual few-shot examples with `thinking` + `output` properties |
| `examples/index.js` | Merges and re-exports EN/RU examples |

Domains: `events/` (Stage A), `graph/` (Stage B), `reflection/`, `communities/`.

## Prompt Topology

System prompt = role + examples (via `assembleSystemPrompt`).
User prompt = context + messages + constraints (via `assembleUserConstraints`).

Schema and rules are in the **user** prompt (end of context window) to defeat recency bias. See root `CLAUDE.md` for the `buildMessages` contract.

## Shared Utilities (`shared/`)

- `formatters.js` — `assembleSystemPrompt`, `assembleUserConstraints`, `buildMessages`, `EXECUTION_TRIGGER`, language resolution
- `format-examples.js` — `formatExamples()` formats few-shot examples into numbered XML blocks, wrapping `thinking` in `<think>` tags
- `preambles.js` — Anti-refusal preambles (CN/EN), `PREFILL_PRESETS`, `resolveExtractionPrefill`
- `rules.js` — `MIRROR_LANGUAGE_RULES` (shared across all domains)

## Few-Shot Examples

Each example object has: `{ input, thinking?, output, label? }`.
- `thinking`: Plain reasoning text (no tags) — `formatExamples` wraps it in `<think>...</think>`
- `label`: Language tag like `(EN/SFW)`, `(RU/NSFW)` — used for filtering when `outputLanguage` is forced
- Examples progress SFW → explicit to calibrate model compliance
