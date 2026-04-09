// @ts-check
import { beforeAll, describe, expect, it } from 'vitest';

describe('schemas — domain constraints', () => {
    let schemas;

    beforeAll(async () => {
        schemas = await import('../../src/store/schemas.js');
    });

    describe('ScoringConfigSchema', () => {
        it('should reject negative forgetfulnessBaseLambda', () => {
            const result = schemas.ScoringConfigSchema.safeParse({
                forgetfulnessBaseLambda: -0.05,
                forgetfulnessImportance5Floor: 5,
                reflectionDecayThreshold: 750,
                reflectionLevelMultiplier: 2.0,
                vectorSimilarityThreshold: 0.5,
                alpha: 0.7,
                combinedBoostWeight: 15,
                embeddingSource: 'local',
            });
            expect(result.success).toBe(false);
        });

        it('should reject vectorSimilarityThreshold >= 1.0', () => {
            const result = schemas.ScoringConfigSchema.safeParse({
                forgetfulnessBaseLambda: 0.05,
                forgetfulnessImportance5Floor: 5,
                reflectionDecayThreshold: 750,
                reflectionLevelMultiplier: 2.0,
                vectorSimilarityThreshold: 1.0,
                alpha: 0.7,
                combinedBoostWeight: 15,
                embeddingSource: 'local',
            });
            expect(result.success).toBe(false);
        });

        it('should reject alpha < 0', () => {
            const result = schemas.ScoringConfigSchema.safeParse({
                forgetfulnessBaseLambda: 0.05,
                forgetfulnessImportance5Floor: 5,
                reflectionDecayThreshold: 750,
                reflectionLevelMultiplier: 2.0,
                vectorSimilarityThreshold: 0.5,
                alpha: -0.5,
                combinedBoostWeight: 15,
                embeddingSource: 'local',
            });
            expect(result.success).toBe(false);
        });

        it('should reject alpha > 1', () => {
            const result = schemas.ScoringConfigSchema.safeParse({
                forgetfulnessBaseLambda: 0.05,
                forgetfulnessImportance5Floor: 5,
                reflectionDecayThreshold: 750,
                reflectionLevelMultiplier: 2.0,
                vectorSimilarityThreshold: 0.5,
                alpha: 1.5,
                combinedBoostWeight: 15,
                embeddingSource: 'local',
            });
            expect(result.success).toBe(false);
        });
    });
});
