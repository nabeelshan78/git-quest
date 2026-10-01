import { describe, expect, it } from 'vitest';
import { computeStars, projectStars } from '../../../src/levels/scoring';

describe('Scoring', () => {
  describe('computeStars', () => {
    it('gives 3 stars when within par and no hints', () => {
      expect(computeStars(3, 5, 0)).toBe(3);
      expect(computeStars(5, 5, 0)).toBe(3);
    });

    it('gives 2 stars when within 2x par', () => {
      expect(computeStars(8, 5, 0)).toBe(2);
      expect(computeStars(10, 5, 0)).toBe(2);
    });

    it('gives 2 stars when 1 hint used but over par', () => {
      expect(computeStars(8, 5, 1)).toBe(2);
    });

    it('gives 1 star when over 2x par and more than 1 hint', () => {
      expect(computeStars(15, 5, 2)).toBe(1);
    });

    it('gives 2 stars when within par but 1 hint used', () => {
      expect(computeStars(3, 5, 1)).toBe(2);
    });

    it('handles null par (no command goals)', () => {
      expect(computeStars(0, null, 0)).toBe(3);
      expect(computeStars(0, null, 1)).toBe(2);
      expect(computeStars(0, null, 2)).toBe(1);
    });
  });

  describe('projectStars', () => {
    it('returns the same as computeStars', () => {
      expect(projectStars(3, 5, 0)).toBe(3);
      expect(projectStars(8, 5, 1)).toBe(2);
      expect(projectStars(15, 5, 3)).toBe(1);
    });
  });
});
