import {
  applyAlg,
  applyMove,
  centerColors,
  centerFace,
  findCubie,
  invertAlg,
  isPieceSolved,
  isSolved,
  movesToPutColorOn,
  stickerEntries,
  type CubeState,
  type Face,
} from "./cube";
import { pocketHint } from "./pocket";
import { professorHint } from "./professor";
import { revengeHint } from "./revenge";

export const COLOR_WORDS: Record<Face, string> = {
  U: "white",
  D: "yellow",
  F: "green",
  B: "blue",
  L: "orange",
  R: "red",
};

export type Stage =
  | "orient"
  | "cross"
  | "corners"
  | "middle"
  | "yellow-cross"
  | "yellow-face"
  | "permute-corners"
  | "permute-edges"
  | "solved";

export const STAGE_ORDER: Stage[] = [
  "cross",
  "corners",
  "middle",
  "yellow-cross",
  "yellow-face",
  "permute-corners",
  "permute-edges",
];

export interface Hint {
  stage: Stage;
  title: string;
  detail: string;
  algorithm: string;
  progress: string;
}

const SIDES: Face[] = ["F", "R", "B", "L"];
const CORNER_PAIRS: [Face, Face][] = [
  ["F", "R"],
  ["R", "B"],
  ["B", "L"],
  ["L", "F"],
];
const SETUPS = ["", "U", "U'", "U2"];
const Y_SETUPS = ["", "y", "y2", "y'"];
const FACE_MOVES = ["U", "U'", "U2", "D", "D'", "D2", "L", "L'", "L2", "R", "R'", "R2", "F", "F'", "F2", "B", "B'", "B2"];

const STAGE_TITLE: Record<Stage, string> = {
  orient: "Set the cube up",
  cross: "White cross",
  corners: "White corners",
  middle: "Second layer",
  "yellow-cross": "Yellow cross",
  "yellow-face": "Yellow corners",
  "permute-corners": "Place the yellow corners",
  "permute-edges": "Place the yellow edges",
  solved: "Solved",
};

function crossCount(state: CubeState): number {
  return SIDES.filter((side) => isPieceSolved(state, ["U", side])).length;
}

function cornerCount(state: CubeState): number {
  return CORNER_PAIRS.filter(([a, b]) => isPieceSolved(state, ["U", a, b])).length;
}

function middleCount(state: CubeState): number {
  return CORNER_PAIRS.filter(([a, b]) => isPieceSolved(state, [a, b])).length;
}

function yellowEdgeOrient(state: CubeState): number {
  const yellowFace = centerFace(state, "D");
  return SIDES.filter((side) => colorOn(findCubie(state, ["D", side]), "D") === yellowFace).length;
}

function yellowCornerOrient(state: CubeState): number {
  const yellowFace = centerFace(state, "D");
  return CORNER_PAIRS.filter(([a, b]) => colorOn(findCubie(state, ["D", a, b]), "D") === yellowFace).length;
}

function yellowCornerSolved(state: CubeState): number {
  return CORNER_PAIRS.filter(([a, b]) => isPieceSolved(state, ["D", a, b])).length;
}

function yellowEdgeSolved(state: CubeState): number {
  return SIDES.filter((side) => isPieceSolved(state, ["D", side])).length;
}

function colorOn(cubie: ReturnType<typeof findCubie>, color: Face): Face {
  for (const [dir, sticker] of stickerEntries(cubie)) {
    if (sticker === color) return dir;
  }
  throw new Error(`Missing ${color}`);
}

function firstTwoLayers(state: CubeState): boolean {
  return crossCount(state) === 4 && cornerCount(state) === 4 && middleCount(state) === 4;
}

export function stageOf(state: CubeState): Stage {
  if (isSolved(state)) return "solved";
  if (state.order !== 3) return "cross";
  if (centerFace(state, "U") !== "D") return "orient";
  if (crossCount(state) < 4) return "cross";
  if (cornerCount(state) < 4) return "corners";
  if (middleCount(state) < 4) return "middle";
  if (yellowEdgeOrient(state) < 4) return "yellow-cross";
  if (yellowCornerOrient(state) < 4) return "yellow-face";
  if (yellowCornerSolved(state) < 4) return "permute-corners";
  return "permute-edges";
}

function pieceLabel(colors: Face[], names: Record<Face, string>): string {
  return colors.map((color) => names[color]).join("-");
}

function joinAlg(parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join(" ");
}

function lastToken(alg: string): string {
  const parts = alg.split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function edgeSignature(state: CubeState): string {
  let out = "";
  for (const side of SIDES) {
    const cubie = findCubie(state, ["U", side]);
    out += `${side}${cubie.pos.join("")}`;
    out += `${cubie.stickers.U ?? "-"}${cubie.stickers.D ?? "-"}${cubie.stickers.F ?? "-"}${cubie.stickers.B ?? "-"}${cubie.stickers.L ?? "-"}${cubie.stickers.R ?? "-"}`;
  }
  return out;
}

/** Shortest face turns that place one more white edge, even if another edge moves aside and comes back. */
function searchCross(state: CubeState): string {
  const start = crossCount(state);
  if (start === 4) return "";
  const seen = new Set<string>([edgeSignature(state)]);
  const queue: { alg: string; state: CubeState }[] = [{ alg: "", state }];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const depth = current.alg ? current.alg.split(/\s+/).length : 0;
    if (depth >= 8) continue;
    const previousFace = lastToken(current.alg)[0] ?? "";
    for (const move of FACE_MOVES) {
      if (move[0] === previousFace) continue;
      const next = applyMove(current.state, move);
      const alg = joinAlg([current.alg, move]);
      if (crossCount(next) > start) return alg;
      const key = edgeSignature(next);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ alg, state: next });
    }
  }
  return "";
}

function yUntil(state: CubeState, colors: Face[], pos: [number, number, number]): string {
  for (const setup of Y_SETUPS) {
    const cubie = findCubie(applyAlg(state, setup), colors);
    if (cubie.pos[0] === pos[0] && cubie.pos[1] === pos[1] && cubie.pos[2] === pos[2]) return setup;
  }
  return "";
}

function cornerStep(state: CubeState): string {
  const colors = CORNER_PAIRS.map(([a, b]) => ["U", a, b] as Face[]).find((item) => !isPieceSolved(state, item));
  if (!colors) return "";
  let alg = "";
  let current = state;
  if (findCubie(current, colors).pos[1] === -1) {
    const setup = yUntil(current, colors, [1, -1, 1]);
    let sexy = "";
    let moved = applyAlg(current, setup);
    for (let turn = 0; turn < 6 && findCubie(moved, colors).pos[1] !== 1; turn += 1) {
      sexy = joinAlg([sexy, "R U R' U'"]);
      moved = applyAlg(moved, "R U R' U'");
    }
    const eject = joinAlg([setup, sexy, setup ? invertAlg(setup) : ""]);
    if (findCubie(applyAlg(current, eject), colors).pos[1] !== 1) return "";
    alg = eject;
    current = applyAlg(current, eject);
  }

  const sides = colors.filter((color) => color !== "U") as [Face, Face];
  let setup = "";
  for (const candidate of Y_SETUPS) {
    const next = applyAlg(current, candidate);
    const home = [centerFace(next, sides[0]), centerFace(next, sides[1])].sort().join("");
    if (home === "FR") {
      setup = candidate;
      break;
    }
  }
  let aligned = applyAlg(current, setup);
  let spin = "";
  for (const candidate of SETUPS) {
    const next = applyAlg(aligned, candidate);
    const cubie = findCubie(next, colors);
    if (cubie.pos[0] === 1 && cubie.pos[1] === 1 && cubie.pos[2] === 1) {
      spin = candidate;
      aligned = next;
      break;
    }
  }
  if (findCubie(aligned, colors).pos.join(",") !== "1,1,1") return "";
  let sexy = "";
  let inserted = aligned;
  for (let turn = 0; turn < 6 && !isPieceSolved(inserted, colors); turn += 1) {
    sexy = joinAlg([sexy, "R U R' U'"]);
    inserted = applyAlg(inserted, "R U R' U'");
  }
  if (!isPieceSolved(inserted, colors)) return "";
  return joinAlg([alg, setup, spin, sexy, setup ? invertAlg(setup) : ""]);
}

const RIGHT_MIDDLE = "U R U' R' U' F' U F";
const LEFT_MIDDLE = "U' L' U L U F U' F'";

function simplifyAlg(alg: string): string {
  const stack: { face: string; quarter: number }[] = [];
  for (const token of alg.split(/\s+/).filter(Boolean)) {
    const face = token[0];
    const quarter = token.endsWith("2") ? 2 : token.endsWith("'") ? 3 : 1;
    const previous = stack[stack.length - 1];
    if (previous && previous.face === face) {
      const sum = (previous.quarter + quarter) % 4;
      stack.pop();
      if (sum !== 0) stack.push({ face, quarter: sum });
    } else stack.push({ face, quarter });
  }
  return stack.map(({ face, quarter }) => `${face}${quarter === 2 ? "2" : quarter === 3 ? "'" : ""}`).join(" ");
}

function ejectMiddle(state: CubeState, colors: [Face, Face]): string {
  if (findCubie(state, colors).pos[1] !== 0) return "";
  const setup = yUntil(state, colors, [1, 0, 1]);
  if (!setup && findCubie(state, colors).pos.join(",") !== "1,0,1") return "";
  return joinAlg([setup, RIGHT_MIDDLE, setup ? invertAlg(setup) : ""]);
}

function insertMiddle(state: CubeState, colors: [Face, Face]): string {
  if (findCubie(state, colors).pos[1] !== 1) return "";
  for (const front of colors) {
    let setup = "";
    let found = false;
    for (const candidate of Y_SETUPS) {
      if (centerFace(applyAlg(state, candidate), front) === "F") {
        setup = candidate;
        found = true;
        break;
      }
    }
    if (!found) continue;
    const turned = applyAlg(state, setup);
    const other = colors[0] === front ? colors[1] : colors[0];
    const otherFace = centerFace(turned, other);
    if (otherFace !== "R" && otherFace !== "L") continue;
    let spin = "";
    let aligned = turned;
    let linedUp = false;
    for (const candidate of SETUPS) {
      const next = applyAlg(turned, candidate);
      const cubie = findCubie(next, colors);
      if (cubie.pos[0] === 0 && cubie.pos[1] === 1 && cubie.pos[2] === 1 && cubie.stickers.F === centerColors(next).F) {
        spin = candidate;
        aligned = next;
        linedUp = true;
        break;
      }
    }
    if (!linedUp) continue;
    const alg = centerFace(aligned, other) === "R" ? RIGHT_MIDDLE : LEFT_MIDDLE;
    return joinAlg([setup, spin, alg, setup ? invertAlg(setup) : ""]);
  }
  return "";
}

function middleStep(state: CubeState): string {
  const pair = CORNER_PAIRS.find(([a, b]) => !isPieceSolved(state, [a, b]));
  if (!pair) return "";
  let prefix = "";
  let current = state;
  if (findCubie(current, pair).pos[1] === 0) {
    prefix = ejectMiddle(current, pair);
    if (!prefix) return "";
    current = applyAlg(current, prefix);
  }
  return joinAlg([prefix, insertMiddle(current, pair)]);
}

function bestPreset(
  state: CubeState,
  algorithms: string[],
  setups: string[],
  scoreOf: (state: CubeState) => number,
  allowed: (state: CubeState) => boolean,
): string {
  const start = scoreOf(state);
  let best = "";
  let bestScore = start;
  for (const algorithm of algorithms) {
    for (const setup of setups) {
      let current = applyAlg(state, setup);
      let sequence = setup;
      if (setup && !allowed(current)) continue;
      for (let count = 1; count <= 2; count += 1) {
        current = applyAlg(current, algorithm);
        sequence = joinAlg([sequence, algorithm]);
        if (!allowed(current)) break;
        const score = scoreOf(current);
        const shorter = best !== "" && sequence.split(/\s+/).length < best.split(/\s+/).length;
        if (score > bestScore || (score === bestScore && score > start && shorter)) {
          bestScore = score;
          best = sequence;
        }
      }
    }
  }
  return best;
}

const YELLOW_FACE_ALGS = [
  "R U R' U R U2 R'",
  "R U2 R' U' R U' R'",
  "R U R' U R U' R' U R U2 R'",
  "R U2 R2 U' R2 U' R2 U2 R",
  "R2 D R' U2 R D' R' U2 R'",
  "R2 D' R U2 R' D R U2 R",
  "r U R' U' r' F R F'",
  "F' r U R' U' r' F R",
];

const CORNER_PERM_ALGS = [
  "R' F R' B2 R F' R' B2 R2",
  "R2 B2 R F R' B2 R F' R",
  "R U R' U' R' F R2 U' R' U' R U R' F'",
  "F R U' R' U' R U R' F' R U R' U' R' F R F'",
  "R' U L' U2 R U' R' U2 R L U'",
  "R U R' F' R U R' U' R' F R2 U' R'",
];

const EDGE_PERM_ALGS = [
  "R U' R U R U R U' R' U' R2",
  "R2 U R U R' U' R' U' R' U R'",
  "R2 U2 R U2 R2 U2 R2 U2 R U2 R2",
  "R' U' R U' R U R U' R' U R U R2 U' R'",
];

function algorithmFor(state: CubeState, stage: Stage): string {
  if (stage === "cross") return searchCross(state);
  if (stage === "corners") {
    const alg = cornerStep(state);
    if (alg && cornerCount(applyAlg(state, alg)) > cornerCount(state) && crossCount(applyAlg(state, alg)) === 4) return alg;
    return "";
  }
  if (stage === "middle") {
    const alg = simplifyAlg(middleStep(state));
    if (!alg) return "";
    const next = applyAlg(state, alg);
    const preserved = crossCount(next) === 4 && cornerCount(next) === 4;
    if (preserved && middleCount(next) > middleCount(state)) return alg;
    return "";
  }
  if (stage === "yellow-cross") {
    return bestPreset(state, ["F R U R' U' F'"], SETUPS, yellowEdgeOrient, firstTwoLayers);
  }
  if (stage === "yellow-face") {
    return bestPreset(state, YELLOW_FACE_ALGS, SETUPS, yellowCornerOrient, (next) => firstTwoLayers(next) && yellowEdgeOrient(next) === 4);
  }
  const wholeCube = [...SETUPS, ...Y_SETUPS];
  if (stage === "permute-corners") {
    return bestPreset(
      state,
      CORNER_PERM_ALGS,
      wholeCube,
      yellowCornerSolved,
      (next) => firstTwoLayers(next) && yellowEdgeOrient(next) === 4 && yellowCornerOrient(next) === 4,
    );
  }
  return bestPreset(
    state,
    EDGE_PERM_ALGS,
    Y_SETUPS,
    yellowEdgeSolved,
    (next) => firstTwoLayers(next) && yellowCornerSolved(next) === 4,
  );
}

function progressLine(state: CubeState, stage: Stage, names: Record<Face, string>): string {
  const white = names.U;
  const yellow = names.D;
  if (stage === "cross") return `${crossCount(state)} of 4 ${white} edges are on the bottom.`;
  if (stage === "corners") return `${cornerCount(state)} of 4 ${white} corners are solved.`;
  if (stage === "middle") return `${middleCount(state)} of 4 middle edges are solved.`;
  if (stage === "yellow-cross") return `${yellowEdgeOrient(state)} of 4 ${yellow} edges are facing up.`;
  if (stage === "yellow-face") return `${yellowCornerOrient(state)} of 4 ${yellow} corners are facing up.`;
  if (stage === "permute-corners") return `${yellowCornerSolved(state)} of 4 ${yellow} corners are in the right place.`;
  if (stage === "permute-edges") return `${yellowEdgeSolved(state)} of 4 ${yellow} edges are in the right place.`;
  return "";
}

function faceHint(state: CubeState, names: Record<Face, string>): Hint {
  const stage = stageOf(state);
  if (stage === "solved") {
    return {
      stage,
      title: "Solved",
      detail: "Every face is one color. Scramble it when you want another solve.",
      algorithm: "",
      progress: "Done",
    };
  }
  if (stage === "orient") {
    const algorithm = movesToPutColorOn(state, "U", "D");
    return {
      stage,
      title: "Yellow on top",
      detail: `Hints follow the usual beginner lesson, with ${names.D} on top and ${names.U} on the bottom. This turns the whole cube and keeps every piece you already solved.`,
      algorithm,
      progress: "Setup",
    };
  }
  const algorithm = simplifyAlg(algorithmFor(state, stage));
  const progress = progressLine(state, stage, names);
  const detail = detailFor(stage, names, algorithm);
  return { stage, title: STAGE_TITLE[stage], detail, algorithm, progress };
}

export function nextHint(state: CubeState, names: Record<Face, string> = COLOR_WORDS): Hint {
  if (state.order === 2) return pocketHint(state, names);
  if (state.order === 4) return revengeHint(state, names, faceHint);
  if (state.order === 5) return professorHint(state, names, faceHint);
  return faceHint(state, names);
}

function detailFor(stage: Stage, names: Record<Face, string>, algorithm: string): string {
  const white = names.U;
  const yellow = names.D;
  if (!algorithm) {
    return "No short hint is available from this exact position. Turn the top face once and ask again.";
  }
  if (stage === "cross") {
    return `This parks the next ${white} edge and drops it under the matching center. Edges already on the bottom stay there.`;
  }
  if (stage === "corners") {
    return `This brings the next ${white} corner above its slot, then repeats the right-hand trigger until that corner is in. The ${white} cross stays solved.`;
  }
  if (stage === "middle") {
    return "Line the edge up with the center of the same color, then insert it to the left or the right. If it was trapped in the middle, the first sequence pops it out.";
  }
  if (stage === "yellow-cross") {
    return `Make a ${yellow} cross on top. You may need this move more than once: a dot becomes an L, an L becomes a line, and a line becomes the cross.`;
  }
  if (stage === "yellow-face") {
    return `Turn the ${yellow} corners so ${yellow} faces up. The cross stays a cross. If they are not all up yet, ask for the next hint.`;
  }
  if (stage === "permute-corners") {
    return `Swap the ${yellow} corners into their own slots without turning them over. You may need the sequence more than once.`;
  }
  return `Cycle the ${yellow} edges into place. If none of them are already correct, the first pass creates one you can hold at the back.`;
}

export function hintSolves(state: CubeState): boolean {
  return Boolean(nextHint(state).algorithm) || isSolved(state);
}
