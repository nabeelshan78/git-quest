/**
 * Star rating for completed levels.
 *
 * 3 stars: within par and no hints used.
 * 2 stars: within 2x par OR at most 1 hint tier.
 * 1 star: completed.
 */

export function computeStars(commandsUsed: number, par: number | null, hintsRevealed: 0 | 1 | 2 | 3): 1 | 2 | 3 {
  // If there is no par (e.g., read-only levels), only hints matter
  if (par === null) {
    if (hintsRevealed === 0) return 3;
    if (hintsRevealed <= 1) return 2;
    return 1;
  }

  // 3 stars: within par AND no hints
  if (commandsUsed <= par && hintsRevealed === 0) return 3;

  // 2 stars: within 2x par OR at most 1 hint tier
  if (commandsUsed <= par * 2 || hintsRevealed <= 1) return 2;

  // 1 star: completed
  return 1;
}

/**
 * Project stars for the current state (before level is completed).
 * Same logic as computeStars.
 */
export function projectStars(commandsUsed: number, par: number | null, hintsRevealed: 0 | 1 | 2 | 3): 1 | 2 | 3 {
  return computeStars(commandsUsed, par, hintsRevealed);
}
