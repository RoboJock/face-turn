import { applyAlg, applyMove, solvedCube, type CubeState, type Face } from "./cube";
import type { Hint } from "./hints";

/**
 * 2×2 hints. A shallow distance table keeps each search short. The hint is the
 * piece of the solution that next improves the white face, the white layer,
 * the yellow face, or the last corners.
 */

const SLOTS: [number, number, number][] = [];
for (const x of [-1, 1]) {
  for (const y of [-1, 1]) {
    for (const z of [-1, 1]) SLOTS.push([x, y, z]);
  }
}

const SLOT_FACES: Face[][] = SLOTS.map((pos) => [pos[1] === 1 ? "U" : "D", pos[2] === 1 ? "F" : "B", pos[0] === 1 ? "R" : "L"]);
const MOVES = ["U", "U'", "U2", "D", "D'", "D2", "L", "L'", "L2", "R", "R'", "R2", "F", "F'", "F2", "B", "B'", "B2"];

function indexOf(pos: readonly number[]) {
  return SLOTS.findIndex((slot) => slot.every((value, index) => value === pos[index]));
}

export function encodePocket(state: CubeState) {
  let out = "";
  for (let slot = 0; slot < SLOTS.length; slot += 1) {
    const cubie = state.cubies.find((item) => indexOf(item.pos) === slot);
    if (!cubie) return "";
    for (const face of SLOT_FACES[slot]) out += cubie.stickers[face] ?? "?";
  }
  return out;
}

function feed(move: string) {
  const before = solvedCube(2);
  const after = applyMove(before, move);
  const map = Array<number>(24);
  for (let slot = 0; slot < SLOTS.length; slot += 1) {
    const cubie = after.cubies.find((item) => indexOf(item.pos) === slot)!;
    const from = before.cubies.find((item) => item.id === cubie.id)!;
    const fromSlot = indexOf(from.pos);
    SLOT_FACES[slot].forEach((face, faceIndex) => {
      const color = cubie.stickers[face] as Face;
      const fromFace = (Object.entries(from.stickers) as [Face, Face][]).find(([, sticker]) => sticker === color)![0];
      map[slot * 3 + faceIndex] = fromSlot * 3 + SLOT_FACES[fromSlot].indexOf(fromFace);
    });
  }
  return map;
}

const TABLES = MOVES.map((move) => feed(move));

function applyCode(code: string, moveIndex: number) {
  return TABLES[moveIndex].map((src) => code[src]).join("");
}

const SOLVED = encodePocket(solvedCube(2));
const DISTANCE = new Map<string, number>([[SOLVED, 0]]);
const LAYER = ["x2", "x2 y", "x2 y'", "x2 y2"].map((alg) => encodePocket(applyAlg(solvedCube(2), alg)));

function buildDistances() {
  if (DISTANCE.size > 1) return;
  let frontier = [SOLVED];
  for (let depth = 0; depth < 4; depth += 1) {
    const next: string[] = [];
    for (const code of frontier) {
      for (let move = 0; move < MOVES.length; move += 1) {
        const child = applyCode(code, move);
        if (DISTANCE.has(child)) continue;
        DISTANCE.set(child, depth + 1);
        next.push(child);
      }
    }
    frontier = next;
  }
}

function whiteDown(code: string) {
  let count = 0;
  for (let slot = 0; slot < SLOTS.length; slot += 1) {
    if (SLOTS[slot][1] === -1 && code[slot * 3] === "U") count += 1;
  }
  return count;
}

function bottom(code: string) {
  let best = 0;
  for (const target of LAYER) {
    let count = 0;
    for (let slot = 0; slot < SLOTS.length; slot += 1) {
      if (SLOTS[slot][1] !== -1) continue;
      if (code.slice(slot * 3, slot * 3 + 3) === target.slice(slot * 3, slot * 3 + 3)) count += 1;
    }
    best = Math.max(best, count);
  }
  return best;
}

function yellowUp(code: string) {
  let count = 0;
  for (let slot = 0; slot < SLOTS.length; slot += 1) {
    if (SLOTS[slot][1] === 1 && code[slot * 3] === "D") count += 1;
  }
  return count;
}

function uniform(code: string) {
  for (const face of ["U", "D", "F", "B", "L", "R"] as Face[]) {
    let color = "";
    for (let slot = 0; slot < SLOTS.length; slot += 1) {
      const faceIndex = SLOT_FACES[slot].indexOf(face);
      if (faceIndex < 0) continue;
      const sticker = code[slot * 3 + faceIndex];
      if (!color) color = sticker;
      else if (sticker !== color) return false;
    }
  }
  return true;
}

function rank(code: string) {
  const white = whiteDown(code);
  const layer = white === 4 ? bottom(code) : 0;
  const yellow = layer === 4 ? yellowUp(code) : 0;
  return white * 1000 + layer * 100 + yellow * 10 + (uniform(code) ? 1 : 0);
}

function solve(start: string) {
  buildDistances();
  const heuristic = (code: string) => DISTANCE.get(code) ?? 5;
  let found = "";
  let limit = heuristic(start);
  const search = (code: string, goal: number, path: string, previous: string): number => {
    if (goal + heuristic(code) > limit) return goal + heuristic(code);
    if (code === SOLVED) {
      found = path;
      return -1;
    }
    let nextLimit = Infinity;
    for (let move = 0; move < MOVES.length; move += 1) {
      if (MOVES[move][0] === previous) continue;
      const result = search(applyCode(code, move), goal + 1, path ? `${path} ${MOVES[move]}` : MOVES[move], MOVES[move][0]);
      if (result < 0) return -1;
      if (result < nextLimit) nextLimit = result;
    }
    return nextLimit;
  };
  for (let round = 0; round < 8 && !found; round += 1) {
    const next = search(start, 0, "", "");
    if (found || !Number.isFinite(next)) break;
    limit = next;
  }
  return found;
}

function prefix(start: string, alg: string) {
  const base = rank(start);
  let code = start;
  const taken: string[] = [];
  for (const move of alg.split(" ").filter(Boolean)) {
    code = applyCode(code, MOVES.indexOf(move));
    taken.push(move);
    if (rank(code) > base) break;
  }
  return taken.join(" ");
}

export function pocketHint(state: CubeState, names: Record<Face, string>): Hint {
  const start = encodePocket(state);
  if (!start || uniform(start)) {
    return {
      stage: "solved",
      title: "Solved",
      detail: "Every face is one color. Scramble it when you want another solve.",
      algorithm: "",
      progress: "Done",
    };
  }
  const algorithm = prefix(start, solve(start));
  const white = names.U;
  const yellow = names.D;
  const layer = bottom(start);
  const up = yellowUp(start);
  if (whiteDown(start) < 4) {
    return {
      stage: "corners",
      title: `${white} face`,
      detail: `This brings another ${white} sticker onto the bottom. On a 2×2 the first face is four corners.`,
      algorithm,
      progress: `${whiteDown(start)} of 4 ${white} stickers are on the bottom.`,
    };
  }
  if (layer < 4) {
    return {
      stage: "corners",
      title: `${white} corners`,
      detail: `This puts the next ${white} corner in place so the side colors agree. Corners already finished stay finished.`,
      algorithm,
      progress: `${layer} of 4 ${white} corners are solved.`,
    };
  }
  if (up < 4) {
    return {
      stage: "yellow-face",
      title: `${yellow} face`,
      detail: `This turns another ${yellow} sticker onto the top. The ${white} face stays solved.`,
      algorithm,
      progress: `${up} of 4 ${yellow} stickers are on top.`,
    };
  }
  return {
    stage: "permute-corners",
    title: "Last corners",
    detail: "This moves the last corners into their own places. Both faces stay one color.",
    algorithm,
    progress: "The faces are built. The corners still need to trade places.",
  };
}
