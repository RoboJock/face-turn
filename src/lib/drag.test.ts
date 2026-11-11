import assert from "node:assert/strict";
import test from "node:test";
import { solvedCube, type Face } from "./cube";
import { faceTurnFromDrag, projectCube } from "./drag";

const OUTWARD: Record<Face, [number, number, number]> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
  R: [1, 0, 0],
  L: [-1, 0, 0],
};

const FACES: Face[] = ["U", "D", "F", "B", "L", "R"];
const CAMERAS = [
  { x: -28, y: 34 },
  { x: 24, y: -40 },
  { x: -50, y: 140 },
  { x: 10, y: 200 },
];

test("a face drag follows the sticker in either direction", () => {
  for (const camera of CAMERAS) {
    for (const face of FACES) {
      const start = solvedCube();
      const sample = start.cubies.find((cubie) => {
        const onFace =
          (face === "U" && cubie.pos[1] === 1) ||
          (face === "D" && cubie.pos[1] === -1) ||
          (face === "F" && cubie.pos[2] === 1) ||
          (face === "B" && cubie.pos[2] === -1) ||
          (face === "R" && cubie.pos[0] === 1) ||
          (face === "L" && cubie.pos[0] === -1);
        const edge = Math.abs(cubie.pos[0]) + Math.abs(cubie.pos[1]) + Math.abs(cubie.pos[2]) === 2;
        return onFace && edge;
      });
      if (!sample) throw new Error(`No sample on ${face}`);
      const normal = OUTWARD[face];
      const [x, y, z] = sample.pos;
      const tangent: [number, number, number] = [
        y * normal[2] - z * normal[1],
        z * normal[0] - x * normal[2],
        x * normal[1] - y * normal[0],
      ];
      const before = projectCube(sample.pos, camera);
      const drag = projectCube(tangent, camera);
      if (Math.hypot(drag[0], drag[1]) < 0.2) continue;
      assert.equal(faceTurnFromDrag(face, before, drag, camera), face, `${face} at camera ${camera.x},${camera.y}`);
      assert.equal(
        faceTurnFromDrag(face, before, [-drag[0], -drag[1]], camera),
        `${face}'`,
        `${face}' at camera ${camera.x},${camera.y}`,
      );
    }
  }
});
