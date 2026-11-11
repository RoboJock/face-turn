import assert from "node:assert/strict";
import test from "node:test";
import type { Face } from "./cube";
import { faceTurnFromDrag, projectCube } from "./drag";

const camera = { x: -28, y: 34 };

test("a sideways drag slides that row with the pointer", () => {
  assert.equal(faceTurnFromDrag("U", [0, 1, 1], [1, 0], camera), "U'");
  assert.equal(faceTurnFromDrag("U", [0, 1, 1], [-1, 0], camera), "U");
  assert.equal(faceTurnFromDrag("F", [0, -1, 1], [1, 0], camera), "F'");
  assert.equal(faceTurnFromDrag("F", [0, -1, 1], [-1, 0], camera), "F");
  assert.equal(faceTurnFromDrag("F", [0, 0, 1], [1, 0], camera), "y'");
  assert.equal(faceTurnFromDrag("F", [0, 0, 1], [-1, 0], camera), "y");
});

test("an upward drag still slides that edge upward", () => {
  assert.equal(faceTurnFromDrag("F", [1, 0, 1], [0, -1], camera), "F'");
  assert.equal(faceTurnFromDrag("F", [-1, 0, 1], [0, -1], camera), "F");
});

test("the chosen turn is the one that follows the pointer", () => {
  const cameras = [camera, { x: 20, y: -30 }, { x: -40, y: 100 }];
  const spots: [Face, [number, number, number]][] = [
    ["U", [0, 1, 1]],
    ["U", [1, 1, 1]],
    ["F", [0, 1, 1]],
    ["F", [1, 0, 1]],
    ["F", [-1, -1, 1]],
    ["R", [1, 1, 0]],
    ["L", [-1, 0, -1]],
    ["D", [0, -1, 1]],
  ];
  const drags: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, -1],
    [0, 1],
    [1, 0.2],
  ];
  for (const view of cameras) {
    for (const [face, cubie] of spots) {
      for (const drag of drags) {
        const move = faceTurnFromDrag(face, cubie, drag, view);
        const chosen = alignment(move, cubie, drag, view);
        for (const other of candidates(cubie)) {
          const score = alignment(other, cubie, drag, view);
          assert.ok(chosen + 1e-3 >= score, `${move} should beat ${other} for ${face} ${cubie} drag ${drag}`);
        }
      }
    }
  }
});

function candidates(cubie: [number, number, number]): string[] {
  const [x, y, z] = cubie;
  const bases = [y === 1 ? "U" : y === -1 ? "D" : "y", x === 1 ? "R" : x === -1 ? "L" : "x", z === 1 ? "F" : z === -1 ? "B" : "z"];
  return bases.flatMap((base) => [base, `${base}'`]);
}

const VELOCITY: Record<string, (pos: [number, number, number]) => [number, number, number]> = {
  U: ([x, , z]) => [-z, 0, x],
  D: ([x, , z]) => [z, 0, -x],
  F: ([x, y]) => [y, -x, 0],
  B: ([x, y]) => [-y, x, 0],
  R: ([, y, z]) => [0, z, -y],
  L: ([, y, z]) => [0, -z, y],
  y: ([x, , z]) => [-z, 0, x],
  x: ([, y, z]) => [0, z, -y],
  z: ([x, y]) => [y, -x, 0],
};

function alignment(move: string, cubie: [number, number, number], drag: [number, number], view: { x: number; y: number }): number {
  const base = move.replace("'", "");
  const sign = move.endsWith("'") ? -1 : 1;
  const velocity = VELOCITY[base](cubie).map((part) => part * sign) as [number, number, number];
  const screen = projectCube(velocity, view);
  return screen[0] * drag[0] + screen[1] * drag[1];
}
