import assert from "node:assert/strict";
import test from "node:test";
import { LEADERBOARD_HINT_LIMIT, leaderboardAllowed } from "./board";

test("a manual solve with up to five hints can be posted", () => {
  assert.equal(LEADERBOARD_HINT_LIMIT, 5);
  assert.equal(leaderboardAllowed(0, false), true);
  assert.equal(leaderboardAllowed(5, false), true);
  assert.equal(leaderboardAllowed(6, false), false);
});

test("an automatic or instant solve stays off the leaderboard", () => {
  assert.equal(leaderboardAllowed(0, true), false);
  assert.equal(leaderboardAllowed(5, true), false);
});
