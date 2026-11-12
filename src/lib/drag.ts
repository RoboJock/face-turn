import { outerIndex, type CubeOrder, type Face } from "./cube";
import { applyView, type Mat3 } from "./view";

/** Cube vector to screen offset. +x right, +y down. */
export function projectCube(vec: [number, number, number], view: Mat3): [number, number] {
  const [x, y] = applyView(view, vec[0], -vec[1], vec[2]);
  return [x, y];
}

type Vec = [number, number, number];

/** How a clockwise quarter of each slice moves a cubie. Whole-cube x/y/z match R/U/F. */
const FACE_VELOCITY: Record<string, (pos: Vec) => Vec> = {
  U: ([x, , z]) => [-z, 0, x],
  D: ([x, , z]) => [z, 0, -x],
  F: ([x, y]) => [y, -x, 0],
  B: ([x, y]) => [-y, x, 0],
  R: ([, y, z]) => [0, z, -y],
  L: ([, y, z]) => [0, -z, y],
};
const SLICE_VELOCITY: Record<string, (pos: Vec) => Vec> = {
  ...FACE_VELOCITY,
  u: FACE_VELOCITY.U,
  d: FACE_VELOCITY.D,
  f: FACE_VELOCITY.F,
  b: FACE_VELOCITY.B,
  r: FACE_VELOCITY.R,
  l: FACE_VELOCITY.L,
  y: FACE_VELOCITY.U,
  x: FACE_VELOCITY.R,
  z: FACE_VELOCITY.F,
};

function slicesAt([x, y, z]: Vec, order: CubeOrder): string[] {
  const outer = outerIndex(order);
  const letter = (value: number, positive: string, negative: string, innerPositive: string, innerNegative: string, middle: string) => {
    if (value === outer) return positive;
    if (value === -outer) return negative;
    if (order === 4 && value === outer - 2) return innerPositive;
    if (order === 4 && value === -(outer - 2)) return innerNegative;
    return middle;
  };
  return [
    letter(y, "U", "D", "u", "d", "y"),
    letter(x, "R", "L", "r", "l", "x"),
    letter(z, "F", "B", "f", "b", "z"),
  ];
}

const CAP_EDGES: Partial<Record<Face, Vec[]>> = {
  U: [
    [1, 1, 0],
    [-1, 1, 0],
    [0, 1, 1],
    [0, 1, -1],
  ],
  D: [
    [1, -1, 0],
    [-1, -1, 0],
    [0, -1, 1],
    [0, -1, -1],
  ],
};

/** Edge of this cap that faces the camera, so a center drag still has a direction. */
function nearestCapEdge(face: Face, camera: Mat3, order: CubeOrder): Vec {
  const outer = outerIndex(order);
  let best = CAP_EDGES[face]![0];
  let bestDepth = -Infinity;
  for (const point of CAP_EDGES[face]!) {
    const scaled: Vec = [point[0] * outer, point[1] * outer, point[2] * outer];
    const depth = applyView(camera, scaled[0], -scaled[1], scaled[2])[2];
    if (depth > bestDepth) {
      bestDepth = depth;
      best = scaled;
    }
  }
  return best;
}

/**
 * Turn that carries this cubie with the pointer. `drag` is screen movement, y down.
 * A drag on the top or bottom turns that face so the edge nearest the camera
 * slides with the pointer, instead of rolling the cube onto its side. A sideways
 * drag elsewhere slides that row; an upward drag slides the column.
 */
export function faceTurnFromDrag(
  face: Face,
  cubie: Vec,
  drag: [number, number],
  camera: Mat3,
  order: CubeOrder = 3,
): string {
  if (face === "U" || face === "D") {
    const ref = nearestCapEdge(face, camera, order);
    const screen = projectCube(SLICE_VELOCITY[face](ref), camera);
    const alignment = screen[0] * drag[0] + screen[1] * drag[1];
    return alignment >= 0 ? face : `${face}'`;
  }
  let bestMove: string = face;
  let bestScore = -Infinity;
  for (const base of slicesAt(cubie, order)) {
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
