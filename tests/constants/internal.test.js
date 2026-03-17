// tests/constants/internal.test.js
import { describe, expect, it } from 'vitest';
import {
  REFLECTION_DEDUP_REJECT_THRESHOLD,
  REFLECTION_DEDUP_REPLACE_THRESHOLD,
  REFLECTION_DECAY_THRESHOLD,
  ENTITY_DESCRIPTION_CAP,
  EDGE_DESCRIPTION_CAP,
  COMMUNITY_STALENESS_THRESHOLD,
  COMBINED_BOOST_WEIGHT,
  IMPORTANCE_5_FLOOR,
  ENTITY_MERGE_THRESHOLD,
} from '../../src/constants.js';

describe('Internal Constants', () => {
  it('exports REFLECTION_DEDUP_REJECT_THRESHOLD as 0.90', () => {
    expect(REFLECTION_DEDUP_REJECT_THRESHOLD).toBe(0.90);
  });

  it('exports REFLECTION_DEDUP_REPLACE_THRESHOLD as 0.80', () => {
    expect(REFLECTION_DEDUP_REPLACE_THRESHOLD).toBe(0.80);
  });

  it('exports REFLECTION_DECAY_THRESHOLD as 750', () => {
    expect(REFLECTION_DECAY_THRESHOLD).toBe(750);
  });

  it('exports ENTITY_DESCRIPTION_CAP as 3', () => {
    expect(ENTITY_DESCRIPTION_CAP).toBe(3);
  });

  it('exports EDGE_DESCRIPTION_CAP as 5', () => {
    expect(EDGE_DESCRIPTION_CAP).toBe(5);
  });

  it('exports COMMUNITY_STALENESS_THRESHOLD as 100', () => {
    expect(COMMUNITY_STALENESS_THRESHOLD).toBe(100);
  });

  it('exports COMBINED_BOOST_WEIGHT as 15', () => {
    expect(COMBINED_BOOST_WEIGHT).toBe(15);
  });

  it('exports IMPORTANCE_5_FLOOR as 5', () => {
    expect(IMPORTANCE_5_FLOOR).toBe(5);
  });

  it('exports ENTITY_MERGE_THRESHOLD as 0.80', () => {
    expect(ENTITY_MERGE_THRESHOLD).toBe(0.80);
  });
});
