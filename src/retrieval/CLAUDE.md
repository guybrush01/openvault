# Memory Retrieval & Scoring Subsystem

## WHAT
Selects optimal memories (events + reflections) and community summaries, then formats them for prompt injection via ST named slots (`openvault_memory`, `openvault_world`).

## RETRIEVAL PIPELINE (`retrieve.js`)
1. **Candidate Pool**: Hidden memories (visible ones are already in ST context) + Reflections (no message IDs).
2. **POV Filter**: Strict filter. Characters only recall what they witnessed or are told (`known_events`).
3. **Budgeting**: Top-scored results sliced to `retrievalFinalTokens` limit.
4. **Formatting**: Grouped into temporal buckets: *The Story So Far*, *Leading Up To This Moment*, *Current Scene*.

## SCORING MATH (Alpha-Blend in `math.js`)
**Formula**: `Total = Base + (Alpha * VectorBonus) + ((1 - Alpha) * BM25Bonus)`

- **Forgetfulness Curve (Base)**: Exponential decay by narrative distance.
  - Higher importance = slower decay. Importance 5 has a soft floor of `1.0`.
  - *Reflection Decay*: Reflections older than 750 messages suffer linear penalty (floor 0.25x) to prevent stale insights.
- **BM25 Keyword Matching**:
  - *Token Caching*: Pre-computed `m.tokens` (stemmed) to save CPU.
  - *Graph-Anchored*: Extracts query entities directly from Graph Nodes (no regex guessing).
  - *IDF-Aware*: Query tokens weighted by Inverse Document Frequency.
  - *Dynamic Stopwords*: Main character names are stripped from BM25 queries since they have near-zero IDF and waste scoring weight.
- **Vector Similarity**: Cosine similarity against last 3 user messages + top entities.

## WORLD CONTEXT (`world-context.js`)
- Retrieves GraphRAG community summaries.
- Uses **Pure Vector Similarity** (bypasses BM25 entirely).
- Injects via `<world_context>` XML tag high up in the prompt (`openvault_world` slot).

## GOTCHAS & RULES
- **Pure Math**: `math.js` contains ZERO DOM/deps imports. Fully worker-safe.
- **Bucket Limits**: The *Old* bucket ("The Story So Far") is hard-capped at 50% of the memory budget to prevent ancient history from drowning out recent context.