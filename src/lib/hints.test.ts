import assert from "node:assert/strict";
import test from "node:test";
import { applyAlg, isSolved, mulberry32, scrambleAlg, signature, solvedCube } from "./cube";
import { nextHint, stageOf } from "./hints";

test("a solved cube asks for a scramble", () => {
  const hint = nextHint(solvedCube());
  assert.equal(hint.stage, "solved");
  assert.equal(hint.algorithm, "");
});

test("hints solve scrambled cubes", () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const scramble = scrambleAlg(20, mulberry32(seed));
    let state = applyAlg(solvedCube(), scramble);
    const seen = new Set<string>();
    for (let step = 0; step < 80 && !isSolved(state); step += 1) {
      const hint = nextHint(state);
      const before = stageOf(state);
      assert.notEqual(hint.algorithm, "", `seed ${seed} stuck at ${before} after ${step} hints`);
      const key = `${signature(state)} ${hint.algorithm}`;
      assert.equal(seen.has(key), false, `seed ${seed} repeated a hint at ${before}`);
      seen.add(key);
      state = applyAlg(state, hint.algorithm);
    }
    assert.equal(isSolved(state), true, `seed ${seed} did not finish`);
  }
});
