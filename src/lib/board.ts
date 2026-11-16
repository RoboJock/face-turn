/** A posted time can include a few requests for help, and no more. */
export const LEADERBOARD_HINT_LIMIT = 5;

export function leaderboardAllowed(hintsUsed: number, assisted: boolean): boolean {
  return !assisted && hintsUsed <= LEADERBOARD_HINT_LIMIT;
}
