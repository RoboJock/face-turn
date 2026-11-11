import type { Face } from "./cube";

/** Cube vector to screen offset. +x right, +y down. Camera matches rotateX then rotateY. */
export function projectCube(vec: [number, number, number], camera: { x: number; y: number }): [number, number] {
  const yaw = (camera.y * Math.PI) / 180;
  const pitch = (camera.x * Math.PI) / 180;
  const x = vec[0];
  const y = -vec[1];
  const z = vec[2];
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const x1 = x * cosY + z * sinY;
  const y1 = y;
  const z1 = -x * sinY + z * cosY;
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  return [x1, y1 * cosP - z1 * sinP];
}

type Vec = [number, number, number];

/** How a clockwise quarter of each slice moves a cubie. Whole-cube x/y/z match R/U/F. */
const SLICE_VELOCITY: Record<string, (pos: Vec) => Vec> = {
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

function slicesAt([x, y, z]: Vec): string[] {
  return [
    y === 1 ? "U" : y === -1 ? "D" : "y",
    x === 1 ? "R" : x === -1 ? "L" : "x",
    z === 1 ? "F" : z === -1 ? "B" : "z",
  ];
}

/**
 * Turn that carries this cubie with the pointer. `drag` is screen movement, y down.
 * A sideways drag slides the row; an upward drag slides the column.
 */
export function faceTurnFromDrag(
  face: Face,
  cubie: Vec,
  drag: [number, number],
  camera: { x: number; y: number },
): string {
  let bestMove: string = face;
  let bestScore = -Infinity;
  for (const base of slicesAt(cubie)) {
    const screen = projectCube(SLICE_VELOCITY[base](cubie), camera);
    const alignment = screen[0] * drag[0] + screen[1] * drag[1];
    for (const [move, score] of [
      [base, alignment],
      [`${base}'`, -alignment],
    ] as const) {
      const letter = move[0];
      const bonus = letter === face ? 1e-4 : "xyz".includes(letter) ? -1e-4 : 0;
      if (score + bonus > bestScore) {
        bestScore = score + bonus;
        bestMove = move;
      }
    }
  }
  return bestMove;
}
