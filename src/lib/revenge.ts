import { applyAlg, applyMove, centerFace, movesToPutColorOn, solvedCube, stickerEntries, type CubeState, type Face } from "./cube";
import type { Hint } from "./hints";

/**
 * 4×4 hints follow the reduction lesson: gather each center, pair the edges,
 * fix parity, then hand the cube to the 3×3 guide.
 */

type Pos = [number, number, number];
const COORDS = [-3, -1, 1, 3];
const CENTER: Pos[] = [];
const WING: Pos[] = [];
for (const x of COORDS) {
  for (const y of COORDS) {
    for (const z of COORDS) {
      const abs = [Math.abs(x), Math.abs(y), Math.abs(z)];
      if (abs.filter((value) => value === 3).length === 1 && abs.filter((value) => value === 1).length === 2) CENTER.push([x, y, z]);
      if (abs.filter((value) => value === 3).length === 2 && abs.filter((value) => value === 1).length === 1) WING.push([x, y, z]);
    }
  }
}

const EDGES: [number, number][] = [];
for (let i = 0; i < WING.length; i += 1) {
  for (let j = i + 1; j < WING.length; j += 1) {
    const a = WING[i];
    const b = WING[j];
    const axes = [0, 1, 2];
    const same = axes.filter((axis) => a[axis] === b[axis] && Math.abs(a[axis]) === 3).length;
    const near = axes.filter((axis) => Math.abs(a[axis]) === 1 && a[axis] === -b[axis]).length;
    if (same === 2 && near === 1) EDGES.push([i, j]);
  }
}

const CENTER_FACE: Face[] = CENTER.map((pos) => (pos[1] === 3 ? "U" : pos[1] === -3 ? "D" : pos[2] === 3 ? "F" : pos[2] === -3 ? "B" : pos[0] === 3 ? "R" : "L"));
const WING_FACES: [Face, Face][] = WING.map((pos) => {
  const faces: Face[] = [];
  if (Math.abs(pos[1]) === 3) faces.push(pos[1] === 3 ? "U" : "D");
  if (Math.abs(pos[2]) === 3) faces.push(pos[2] === 3 ? "F" : "B");
  if (Math.abs(pos[0]) === 3) faces.push(pos[0] === 3 ? "R" : "L");
  return faces as [Face, Face];
});

const CENTER_MOVES = ["U", "U'", "U2", "D", "D'", "D2", "L", "L'", "L2", "R", "R'", "R2", "F", "F'", "F2", "B", "B'", "B2", "u", "u'", "u2", "d", "d'", "d2", "l", "l'", "l2", "r", "r'", "r2", "f", "f'", "f2", "b", "b'", "b2"];
const PAIR_MOVES = ["U", "U'", "U2", "D", "D'", "D2", "R", "R'", "R2", "L", "L'", "L2", "F", "F'", "F2", "B", "B'", "B2", "r", "r'", "r2", "l", "l'", "l2", "u", "u'", "u2", "d", "d'", "d2"];
const CENTER_ORDER: Face[] = ["U", "D", "F", "R", "B", "L"];
/** Flips the front-top edge and leaves every other piece paired. */
const OLL_PARITY = "r2 B2 U2 l U2 r' U2 r U2 F2 r F2 l' B2 r2";
/** Swaps the front-top and back-top edges. */
const PLL_PARITY = "r2 U2 r2 U2 u2 r2 u2";

function slotIndex(slots: Pos[], pos: readonly number[]) {
  return slots.findIndex((slot) => slot.every((value, index) => value === pos[index]));
}

function cubieAt(state: CubeState, pos: Pos) {
  return state.cubies.find((cubie) => cubie.pos.every((value, index) => value === pos[index]));
}

const CENTER_TABLE = new Map(CENTER_MOVES.map((move) => {
  const before = solvedCube(4);
  const after = applyMove(before, move);
  const map = CENTER.map((_, slot) => {
    const cubie = cubieAt(after, CENTER[slot])!;
    const from = before.cubies.find((item) => item.id === cubie.id)!;
    return slotIndex(CENTER, from.pos);
  });
  return [move, map] as const;
}));

const WING_TABLE = new Map(PAIR_MOVES.map((move) => {
  const before = solvedCube(4);
  const after = applyMove(before, move);
  const map = Array<number>(WING.length * 2);
  WING.forEach((pos, slot) => {
    const cubie = cubieAt(after, pos)!;
    const from = before.cubies.find((item) => item.id === cubie.id)!;
    const fromSlot = slotIndex(WING, from.pos);
    WING_FACES[slot].forEach((face, faceIndex) => {
      const color = cubie.stickers[face] as Face;
      const fromFace = (Object.entries(from.stickers) as [Face, Face][]).find(([, sticker]) => sticker === color)![0];
      map[slot * 2 + faceIndex] = fromSlot * 2 + WING_FACES[fromSlot].indexOf(fromFace);
    });
  });
  return [move, map] as const;
}));

function encodeCenters(state: CubeState) {
  return CENTER.map((pos) => stickerEntries(cubieAt(state, pos)!)[0][1]).join("");
}

function encodeWings(state: CubeState) {
  let out = "";
  WING.forEach((pos, slot) => {
    const cubie = cubieAt(state, pos)!;
    for (const face of WING_FACES[slot]) out += cubie.stickers[face];
  });
  return out;
}

function applyCenters(code: string, move: string) {
  return CENTER_TABLE.get(move)!.map((src) => code[src]).join("");
}

function applyWings(code: string, move: string) {
  return WING_TABLE.get(move)!.map((src) => code[src]).join("");
}

function uniformFaces(code: string) {
  let total = 0;
  for (const face of CENTER_ORDER) {
    let color = "";
    let same = true;
    for (let index = 0; index < code.length; index += 1) {
      if (CENTER_FACE[index] !== face) continue;
      if (!color) color = code[index];
      else if (code[index] !== color) same = false;
    }
    if (same) total += 1;
  }
  return total;
}

function count(code: string, color: string, face: Face) {
  let total = 0;
  for (let index = 0; index < code.length; index += 1) {
    if (code[index] === color && CENTER_FACE[index] === face) total += 1;
  }
  return total;
}

function pairs(code: string) {
  let total = 0;
  for (const [a, b] of EDGES) {
    if (code.slice(a * 2, a * 2 + 2) === code.slice(b * 2, b * 2 + 2)) total += 1;
  }
  return total;
}

function searchCenters(start: string, better: (code: string) => boolean) {
  for (let depth = 1; depth <= 4; depth += 1) {
    const queue = [start];
    const how = [""];
    const seen = new Set([start]);
    for (let index = 0; index < queue.length; index += 1) {
      const moves = how[index] ? how[index].split(" ") : [];
      if (moves.length >= depth) continue;
      const previous = moves.at(-1)?.[0].toLowerCase() ?? "";
      for (const move of CENTER_MOVES) {
        if (move[0].toLowerCase() === previous) continue;
        const next = applyCenters(queue[index], move);
        const alg = how[index] ? `${how[index]} ${move}` : move;
        if (better(next)) return alg;
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
        how.push(alg);
      }
    }
  }
  return "";
}

const FACE_TURN = ["U", "U'", "U2", "D", "D'", "D2", "L", "L'", "L2", "R", "R'", "R2", "F", "F'", "F2", "B", "B'", "B2"];
const SLICE_TURN = ["u", "u'", "u2", "d", "d'", "d2", "l", "l'", "l2", "r", "r'", "r2"];

function play(centers: string, wings: string, moves: string[]) {
  for (const move of moves) {
    centers = applyCenters(centers, move);
    wings = applyWings(wings, move);
  }
  return { centers, wings };
}

/** Pair one edge by a slice, a short face setup, and the slice back. */
function searchPairs(centers: string, wings: string) {
  const startPairs = pairs(wings);
  const better = (moves: string[]) => {
    const next = play(centers, wings, moves);
    return uniformFaces(next.centers) === 6 && pairs(next.wings) > startPairs ? moves.join(" ") : "";
  };
  const conjugation = (prefix: string[]) => {
    for (const slice of SLICE_TURN) {
      const undo = slice.endsWith("2") ? slice : slice.endsWith("'") ? slice[0] : `${slice[0]}'`;
      const head = [...prefix, slice];
      const direct = better([...head, undo]);
      if (direct) return direct;
      for (const first of FACE_TURN) {
        const one = better([...head, first, undo]);
        if (one) return one;
        for (const second of FACE_TURN) {
          if (second[0] === first[0]) continue;
          const two = better([...head, first, second, undo]);
          if (two) return two;
          for (const third of FACE_TURN) {
            if (third[0] === second[0]) continue;
            const three = better([...head, first, second, third, undo]);
            if (three) return three;
          }
        }
      }
    }
    return "";
  };
  const plain = conjugation([]);
  if (plain) return plain;
  for (const prep of FACE_TURN) {
    const found = conjugation([prep]);
    if (found) return found;
  }
  if (startPairs < 10) return "";
  const lastTwo = [
    "u R U R' U' R' F R F' u'",
    "u' R U R' U' R' F R F' u",
    "d R U R' U' R' F R F' d'",
    "d' R U R' U' R' F R F' d",
    "u R U R' F R' F' R u'",
    "u' L' U' L F' L F L' u",
    "r U2 r' F r F' U2 r U r'",
  ];
  const queue: string[][] = [[]];
  for (let index = 0; index < queue.length; index += 1) {
    const setup = queue[index];
    for (const alg of lastTwo) {
      const found = better([...setup, ...alg.split(" ")]);
      if (found) return found;
    }
    if (setup.length >= 3) continue;
    const previous = setup.at(-1)?.[0] ?? "";
    for (const move of FACE_TURN) {
      if (move[0] === previous) continue;
      queue.push([...setup, move]);
    }
  }
  return "";
}

function centerHint(code: string, names: Record<Face, string>): Hint | null {
  if (uniformFaces(code) === 6) return null;
  for (let index = 0; index < CENTER_ORDER.length; index += 1) {
    const face = CENTER_ORDER[index];
    if (count(code, face, face) === 4) continue;
    const have = count(code, face, face);
    const done = CENTER_ORDER.slice(0, index);
    const algorithm = searchCenters(code, (next) => count(next, face, face) > have && done.every((kept) => count(next, kept, kept) === 4));
    const word = names[face];
    return {
      stage: "cross",
      title: `${word} centers`,
      detail: `This brings another ${word} center onto its face. Centers that are already together stay together.`,
      algorithm,
      progress: `${have} of 4 ${word} centers are on the ${word} face.`,
    };
  }
  return null;
}

const OPPOSITE_SLICE: Record<string, string> = { r: "l", l: "r", u: "d", d: "u", f: "b", b: "f" };

/** A 3×3 wide turn moves the outer face and both inner slices, so a paired edge stays paired. */
function widen(alg: string) {
  return alg.split(/\s+/).filter(Boolean).flatMap((token) => {
    const face = token[0];
    const opposite = OPPOSITE_SLICE[face];
    if (!opposite) return [token];
    const quarter = token.endsWith("2") ? 2 : token.endsWith("'") ? 3 : 1;
    const suffix = (turns: number) => (turns === 2 ? "2" : turns === 3 ? "'" : "");
    return [`${face.toUpperCase()}${suffix(quarter)}`, `${face}${suffix(quarter)}`, `${opposite}${suffix((4 - quarter) % 4)}`];
  }).join(" ");
}

/** Whole-cube turns that put white on top and green in front, so parity is not confused with a rotation. */
function colorAligned(cube: CubeState) {
  let current = applyAlg(cube, movesToPutColorOn(cube, "U", "U"));
  for (const move of ["", "y", "y'", "y2"]) {
    const next = applyAlg(current, move);
    if (centerFace(next, "U") === "U" && centerFace(next, "F") === "F") return next;
  }
  return current;
}

function project(state: CubeState): CubeState {
  const cube = solvedCube(3);
  const placed = new Set<number>();
  const put = (colors: Face[], pos: [number, number, number], stickers: Partial<Record<Face, Face>>) => {
    const key = [...colors].sort().join("");
    const cubie = cube.cubies.find((item) => !placed.has(item.id) && Object.values(item.stickers).sort().join("") === key);
    if (!cubie) throw new Error(`Missing 3×3 piece ${key}`);
    placed.add(cubie.id);
    cubie.pos = pos;
    cubie.stickers = { ...stickers };
  };
  for (const face of CENTER_ORDER) {
    const pos = face === "U" ? [0, 1, 0] : face === "D" ? [0, -1, 0] : face === "F" ? [0, 0, 1] : face === "B" ? [0, 0, -1] : face === "R" ? [1, 0, 0] : [-1, 0, 0];
    const source = CENTER[CENTER_FACE.indexOf(face)];
    const color = stickerEntries(cubieAt(state, source)!)[0][1];
    put([color], pos as [number, number, number], { [face]: color });
  }
  for (const x of [-3, 3]) {
    for (const y of [-3, 3]) {
      for (const z of [-3, 3]) {
        const cubie = cubieAt(state, [x, y, z])!;
        const entries = stickerEntries(cubie);
        put(entries.map(([, color]) => color), [x / 3, y / 3, z / 3], Object.fromEntries(entries));
      }
    }
  }
  for (const [a] of EDGES) {
    const cubie = cubieAt(state, WING[a])!;
    const entries = stickerEntries(cubie);
    const pos = WING[a].map((value) => (Math.abs(value) === 3 ? value / 3 : 0)) as [number, number, number];
    put(entries.map(([, color]) => color), pos, Object.fromEntries(entries));
  }
  return cube;
}

function slotPrimary(pos: readonly number[]): Face {
  if (pos[1] === 1) return "U";
  if (pos[1] === -1) return "D";
  if (pos[2] === 1) return "F";
  return "B";
}

/** Edge flip parity. Each slot has one face that carries the reference sticker on a solved cube. */
function oddFlip(cube: CubeState) {
  let sum = 0;
  for (const cubie of cube.cubies) {
    const entries = stickerEntries(cubie);
    if (entries.length !== 2) continue;
    const colors = entries.map(([, color]) => color);
    const primary = colors.find((color) => color === "U" || color === "D") ?? colors.find((color) => color === "F" || color === "B");
    if (!primary) continue;
    const facing = entries.find(([, color]) => color === primary)?.[0];
    if (facing !== slotPrimary(cubie.pos)) sum += 1;
  }
  return sum % 2 === 1;
}

function inversions(order: number[]) {
  let total = 0;
  for (let i = 0; i < order.length; i += 1) {
    for (let j = i + 1; j < order.length; j += 1) if (order[i] > order[j]) total += 1;
  }
  return total % 2 === 1;
}

function oddPermutation(cube: CubeState) {
  const solved = solvedCube(3);
  const key = (stickers: Partial<Record<Face, Face>>) => Object.values(stickers).sort().join("");
  const home = new Map(solved.cubies.map((cubie) => [key(cubie.stickers), cubie.pos.join(",")]));
  const slots = (size: number) => solved.cubies.filter((cubie) => stickerEntries(cubie).length === size).map((cubie) => cubie.pos.join(","));
  const perm = (size: number) => slots(size).map((slot) => {
    const cubie = cube.cubies.find((item) => item.pos.join(",") === slot)!;
    return slots(size).indexOf(home.get(key(cubie.stickers)) ?? "");
  });
  return inversions(perm(3)) !== inversions(perm(2));
}

export function revengeHint(state: CubeState, names: Record<Face, string>, solve3: (state: CubeState, names: Record<Face, string>) => Hint): Hint {
  const centers = encodeCenters(state);
  const centerStep = centerHint(centers, names);
  if (centerStep) return centerStep;
  const wingCode = encodeWings(state);
  const paired = pairs(wingCode);
  if (paired < 12) {
    return {
      stage: "middle",
      title: "Edge pairs",
      detail: "This joins the next pair of wings into one edge. Centers stay solved, and pairs you already made stay together.",
      algorithm: searchPairs(centers, wingCode),
      progress: `${paired} of 12 edges are paired.`,
    };
  }
  const reduced = colorAligned(project(state));
  if (oddFlip(reduced)) {
    return {
      stage: "yellow-cross",
      title: "Edge flip",
      detail: "A 4×4 can end up with one edge flipped. This flips it back so the cube can be finished like a 3×3.",
      algorithm: OLL_PARITY,
      progress: "The edges are paired. One of them is flipped.",
    };
  }
  if (oddPermutation(reduced)) {
    return {
      stage: "permute-edges",
      title: "Edge swap",
      detail: "A 4×4 can end up with two edges swapped. This swaps them back so the cube can be finished like a 3×3.",
      algorithm: PLL_PARITY,
      progress: "The edges are paired. Two of them are swapped.",
    };
  }
  const hint = solve3(project(state), names);
  return { ...hint, algorithm: widen(hint.algorithm) };
}
