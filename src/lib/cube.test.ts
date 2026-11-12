import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAlg,
  applyMove,
  centerFace,
  colorFacing,
  findCubie,
  invertAlg,
  isSolved,
  movesToPutColorOn,
  mulberry32,
  replaySolved,
  scrambleAlg,
  solvedCube,
} from "./cube";

test("a solved cube is solved and four quarter turns cancel", () => {
  const solved = solvedCube();
  assert.equal(isSolved(solved), true);
  for (const face of ["U", "D", "L", "R", "F", "B", "x", "y", "z"]) {
    assert.equal(isSolved(applyAlg(solved, `${face} ${face} ${face} ${face}`)), true);
    assert.equal(isSolved(applyAlg(solved, `${face} ${face}'`)), true);
    assert.equal(isSolved(applyAlg(solved, `${face}2 ${face}2`)), true);
  }
});

test("U clockwise sends the front-top edge to the left", () => {
  const turned = applyMove(solvedCube(), "U");
  const edge = findCubie(turned, ["U", "F"]);
  assert.deepEqual(edge.pos, [-1, 1, 0]);
  assert.equal(colorFacing(edge, "U"), "U");
  assert.equal(colorFacing(edge, "F"), "L");
});

test("R clockwise sends the front-right edge to the top", () => {
  const turned = applyMove(solvedCube(), "R");
  const edge = findCubie(turned, ["F", "R"]);
  assert.deepEqual(edge.pos, [1, 1, 0]);
  assert.equal(colorFacing(edge, "R"), "R");
  assert.equal(colorFacing(edge, "F"), "U");
});

test("sexy move six times returns to solved", () => {
  let state = solvedCube();
  for (let i = 0; i < 6; i += 1) state = applyAlg(state, "R U R' U'");
  assert.equal(isSolved(state), true);
});

test("every scramble is undone by its inverse", () => {
  const rng = () => {
    let seed = 7;
    return () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  };
  const random = rng();
  for (let i = 0; i < 30; i += 1) {
    const scramble = scrambleAlg(25, random);
    assert.equal(isSolved(applyAlg(solvedCube(), scramble)), false);
    assert.equal(replaySolved(scramble, invertAlg(scramble)), true);
  }
});

test("x2 swaps the white and yellow centers", () => {
  const turned = applyAlg(solvedCube(), "x2");
  assert.equal(centerFace(turned, "U"), "D");
  assert.equal(centerFace(turned, "D"), "U");
  assert.equal(isSolved(turned), true);
});

test("a wide right turn four times is a solved cube", () => {
  assert.equal(isSolved(applyAlg(solvedCube(), "r r r r")), true);
  assert.equal(isSolved(applyAlg(solvedCube(), "r r'")), true);
});

test("orientation search puts yellow on top", () => {
  const alg = movesToPutColorOn(solvedCube(), "D", "U");
  const turned = applyAlg(solvedCube(), alg);
  assert.equal(centerFace(turned, "D"), "U");
  assert.equal(isSolved(turned), true);
});

test("a 2×2 and a 4×4 solve and undo like the 3×3", () => {
  for (const order of [2, 4] as const) {
    const solved = solvedCube(order);
    assert.equal(isSolved(solved), true);
    assert.equal(isSolved(applyAlg(solved, "U U U U")), true);
    assert.equal(isSolved(applyAlg(solved, "R U R' U' U R U' R'")), true);
    const scramble = scrambleAlg(order === 2 ? 8 : 20, mulberry32(order), order);
    assert.equal(isSolved(applyAlg(solved, scramble)), false);
    assert.equal(isSolved(applyAlg(applyAlg(solved, scramble), invertAlg(scramble))), true);
  }
  const inner = applyMove(solvedCube(4), "u");
  assert.equal(isSolved(inner), false);
  assert.equal(isSolved(applyAlg(inner, "u'")), true);
});
