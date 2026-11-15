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
  E: FACE_VELOCITY.D,
  M: FACE_VELOCITY.L,
  S: FACE_VELOCITY.F,
};

function slicesAt([x, y, z]: Vec, order: CubeOrder): string[] {
  const outer = outerIndex(order);
  const letter = (value: number, positive: string, negative: string, innerPositive: string, innerNegative: string, middle: string) => {
    if (value === outer) return positive;
    if (value === -outer) return negative;
    if ((order === 4 && Math.abs(value) === outer - 2) || (order === 5 && Math.abs(value) === 1)) return value > 0 ? innerPositive : innerNegative;
    if (order === 5 && value === 0) return middle === "y" ? "E" : middle === "x" ? "M" : "S";
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
/** A layer follows the pointer until this far, then it completes the quarter turn. */
export const LAYER_SNAP_DEGREES = 30;

/**
 * How far a layer has turned, in degrees, after the pointer moves `alongPx`
 * along the turn. A full quarter turn is 45% of the cube's width, and the
 * layer stops at 120° while it is still following the pointer.
 */
export function dragLayerDegrees(alongPx: number, spanPx: number): number {
  if (spanPx <= 0) return 0;
  const degrees = (alongPx * 90) / (0.45 * spanPx);
  return Math.max(-120, Math.min(120, degrees));
}

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
  return alongFacingEdge(face, cubie, drag, camera, order, bestScore) ?? bestMove;
}

/** A drag along the front or back edge of a side face turns that front or back face. */
function alongFacingEdge(
  face: Face,
  cubie: Vec,
  drag: [number, number],
  camera: Mat3,
  order: CubeOrder,
  bestScore: number,
): string | null {
  const dragLen = Math.hypot(drag[0], drag[1]);
  if (dragLen < 1e-4) return null;
  const dragUnit: [number, number] = [drag[0] / dragLen, drag[1] / dragLen];
  let chosen: string | null = null;
  let bestParallel = 0.94;
  for (const edge of outerEdges(cubie, order)) {
    const along = projectCube(edge.dir, camera);
    const alongLen = Math.hypot(along[0], along[1]);
    if (alongLen < 1e-4) continue;
    const parallel = Math.abs((along[0] * dragUnit[0] + along[1] * dragUnit[1]) / alongLen);
    if (parallel < bestParallel) continue;
    if (face !== "L" && face !== "R") continue;
    const facing = edge.faces.find((item) => item === "F" || item === "B");
    if (!facing) continue;
    const screen = projectCube(SLICE_VELOCITY[facing](cubie), camera);
    const alignment = screen[0] * drag[0] + screen[1] * drag[1];
    const score = Math.abs(alignment);
    if (score + 1e-3 < bestScore * 0.75) continue;
    bestParallel = parallel;
    chosen = alignment >= 0 ? facing : `${facing}'`;
  }
  return chosen;
}

function outerEdges(cubie: Vec, order: CubeOrder): { dir: Vec; faces: [Face, Face] }[] {
  const outer = outerIndex(order);
  const axisFace = (value: number, positive: Face, negative: Face): Face | null => {
    if (value === outer) return positive;
    if (value === -outer) return negative;
    return null;
  };
  const x = axisFace(cubie[0], "R", "L");
  const y = axisFace(cubie[1], "U", "D");
  const z = axisFace(cubie[2], "F", "B");
  const edges: { dir: Vec; faces: [Face, Face] }[] = [];
  if (y && z) edges.push({ dir: [1, 0, 0], faces: [y, z] });
  if (x && z) edges.push({ dir: [0, 1, 0], faces: [x, z] });
  if (x && y) edges.push({ dir: [0, 0, 1], faces: [x, y] });
  return edges;
}
