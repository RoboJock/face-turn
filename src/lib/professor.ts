import { applyAlg, applyMove, invertAlg, solvedCube, stickerEntries, type CubeState, type Face } from "./cube";
import type { Hint } from "./hints";

/**
 * 5×5 hints follow the reduction lesson: finish each center, pair both wings
 * of every edge, then hand the cube to the 3×3 guide. A 5×5 has no parity
 * once the edges are paired.
 */

type Pos = [number, number, number];
const COORDS = [-2, -1, 0, 1, 2];
const CENTER: Pos[] = [];
const WING: Pos[] = [];
const MIDGE: Pos[] = [];
for (const x of COORDS) {
  for (const y of COORDS) {
    for (const z of COORDS) {
      const abs = [Math.abs(x), Math.abs(y), Math.abs(z)];
      const outer = abs.filter((value) => value === 2).length;
      if (outer === 1) CENTER.push([x, y, z]);
      if (outer === 2 && abs.includes(0)) MIDGE.push([x, y, z]);
      if (outer === 2 && !abs.includes(0)) WING.push([x, y, z]);
    }
  }
}

function pieceFaces(pos: Pos): Face[] {
  const faces: Face[] = [];
  if (Math.abs(pos[1]) === 2) faces.push(pos[1] === 2 ? "U" : "D");
  if (Math.abs(pos[2]) === 2) faces.push(pos[2] === 2 ? "F" : "B");
  if (Math.abs(pos[0]) === 2) faces.push(pos[0] === 2 ? "R" : "L");
  return faces;
}

const CENTER_FACE: Face[] = CENTER.map((pos) => pieceFaces(pos)[0]);
const FIXED = new Set(CENTER.map((pos, index) => (pieceFaces(pos).length === 1 && Math.abs(pos[0]) + Math.abs(pos[1]) + Math.abs(pos[2]) === 2 ? index : -1)).filter((index) => index >= 0));
const WING_FACES = WING.map((pos) => pieceFaces(pos) as [Face, Face]);
const MIDGE_FACES = MIDGE.map((pos) => pieceFaces(pos) as [Face, Face]);

function slotKey(pos: Pos) {
  return pos.map((value) => (Math.abs(value) === 2 ? String(value) : "0")).join(",");
}

const EDGES = MIDGE.map((pos, midge) => ({
  midge,
  wings: WING.map((wing, index) => (slotKey(wing) === slotKey(pos) ? index : -1)).filter((index) => index >= 0),
}));

const FACE_TURN = ["U", "U'", "U2", "D", "D'", "D2", "L", "L'", "L2", "R", "R'", "R2", "F", "F'", "F2", "B", "B'", "B2"];
const SLICE_TURN = ["u", "u'", "u2", "d", "d'", "d2", "l", "l'", "l2", "r", "r'", "r2", "f", "f'", "f2", "b", "b'", "b2"];
const MIDDLE_TURN = ["E", "E'", "E2", "M", "M'", "M2", "S", "S'", "S2"];
const CENTER_MOVES = [...FACE_TURN, ...SLICE_TURN, ...MIDDLE_TURN];
const PAIR_MOVES = [...FACE_TURN, ...SLICE_TURN];
const CENTER_ORDER: Face[] = ["U", "D", "F", "R", "B", "L"];

function slotIndex(slots: Pos[], pos: readonly number[]) {
  return slots.findIndex((slot) => slot.every((value, index) => value === pos[index]));
}

function cubieAt(state: CubeState, pos: Pos) {
  return state.cubies.find((cubie) => cubie.pos.every((value, index) => value === pos[index]));
}

function pieceTable(slots: Pos[], faces: Face[][], moves: string[]) {
  return new Map(moves.map((move) => {
    const before = solvedCube(5);
    const after = applyMove(before, move);
    const map = Array<number>(slots.length * faces[0].length);
    slots.forEach((pos, slot) => {
      const cubie = cubieAt(after, pos)!;
      const from = before.cubies.find((item) => item.id === cubie.id)!;
      const fromSlot = slotIndex(slots, from.pos);
      faces[slot].forEach((face, faceIndex) => {
        const color = cubie.stickers[face] as Face;
        const fromFace = (Object.entries(from.stickers) as [Face, Face][]).find(([, sticker]) => sticker === color)![0];
        map[slot * faces[0].length + faceIndex] = fromSlot * faces[fromSlot].length + faces[fromSlot].indexOf(fromFace);
      });
    });
    return [move, map] as const;
  }));
}

const CENTER_TABLE = pieceTable(CENTER, CENTER_FACE.map((face) => [face]), CENTER_MOVES);
const WING_TABLE = pieceTable(WING, WING_FACES, PAIR_MOVES);
const MIDGE_TABLE = pieceTable(MIDGE, MIDGE_FACES, PAIR_MOVES);

function encode(state: CubeState, slots: Pos[], faces: Face[][]) {
  let out = "";
  slots.forEach((pos, slot) => {
    const cubie = cubieAt(state, pos)!;
    for (const face of faces[slot]) out += cubie.stickers[face];
  });
  return out;
}

function applyCode(code: string, move: string, table: Map<string, number[]>) {
  return table.get(move)!.map((src) => code[src]).join("");
}

function fixedColor(code: string, face: Face) {
  for (let index = 0; index < code.length; index += 1) {
    if (CENTER_FACE[index] === face && FIXED.has(index)) return code[index];
  }
  return "";
}

function matchedCenters(code: string, face: Face) {
  const color = fixedColor(code, face);
  let total = 0;
  for (let index = 0; index < code.length; index += 1) {
    if (CENTER_FACE[index] === face && !FIXED.has(index) && code[index] === color) total += 1;
  }
  return total;
}

function uniformFaces(code: string) {
  return CENTER_ORDER.filter((face) => matchedCenters(code, face) === 8).length;
}

function wingMatches(wings: string, midges: string) {
  let total = 0;
  for (const edge of EDGES) {
    const midge = midges.slice(edge.midge * 2, edge.midge * 2 + 2);
    for (const wing of edge.wings) {
      if (wings.slice(wing * 2, wing * 2 + 2) === midge) total += 1;
    }
  }
  return total;
}

function searchCenters(start: string, better: (code: string) => boolean, maxDepth = 4) {
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const queue = [start];
    const how = [""];
    const seen = new Set([start]);
    for (let index = 0; index < queue.length; index += 1) {
      const moves = how[index] ? how[index].split(" ") : [];
      if (moves.length >= depth) continue;
      const previous = moves.at(-1)?.[0] ?? "";
      for (const move of CENTER_MOVES) {
        if (move[0] === previous) continue;
        const next = applyCode(queue[index], move, CENTER_TABLE);
        const alg = how[index] ? `${how[index]} ${move}` : move;
        if (better(next)) return alg;
        if (seen.has(next) || moves.length + 1 >= depth || queue.length > 400000) continue;
        seen.add(next);
        queue.push(next);
        how.push(alg);
      }
    }
  }
  return "";
}

function searchCenterSwap(start: string, better: (code: string) => boolean) {
  const slices = [...SLICE_TURN, ...MIDDLE_TURN];
  const attempt = (moves: string[]) => (better(moves.reduce((code, move) => applyCode(code, move, CENTER_TABLE), start)) ? moves.join(" ") : "");
  const conjugation = (prefix: string[]) => {
    for (const slice of slices) {
      const undo = slice.endsWith("2") ? slice : slice.endsWith("'") ? slice[0] : `${slice[0]}'`;
      const head = [...prefix, slice];
      const direct = attempt([...head, undo]);
      if (direct) return direct;
      for (const first of FACE_TURN) {
        const one = attempt([...head, first, undo]);
        if (one) return one;
        for (const second of FACE_TURN) {
          if (second[0] === first[0]) continue;
          const two = attempt([...head, first, second, undo]);
          if (two) return two;
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
  return "";
}

const CYCLES: { alg: string; bad: Pos; good: Pos; kind: "x" | "t" }[] = [
  { alg: "r u' r' U r u r' U'", bad: [1, 2, -1], good: [2, 1, 1], kind: "x" },
  { alg: "M u M' U M u' M' U'", bad: [-1, 2, 0], good: [2, 1, 0], kind: "t" },
];

function centerKind(pos: readonly number[]): "x" | "t" | "fixed" {
  const zeros = pos.filter((value) => value === 0).length;
  if (zeros >= 2) return "fixed";
  return zeros === 1 ? "t" : "x";
}

function faceOfPos(pos: readonly number[]): Face {
  if (pos[1] === 2) return "U";
  if (pos[1] === -2) return "D";
  if (pos[2] === 2) return "F";
  if (pos[2] === -2) return "B";
  if (pos[0] === 2) return "R";
  return "L";
}

function orientOntoU(face: Face) {
  if (face === "D") return "x2";
  if (face === "F") return "x";
  if (face === "B") return "x'";
  if (face === "R") return "z'";
  if (face === "L") return "z";
  return "";
}

function yawOntoR(face: Face) {
  if (face === "B") return "y";
  if (face === "L") return "y2";
  if (face === "F") return "y'";
  return "";
}

function turnOnto(state: CubeState, id: number, slot: Pos, face: Face) {
  for (const move of ["", face, `${face}'`, `${face}2`]) {
    const next = move ? applyMove(state, move) : state;
    const cubie = next.cubies.find((item) => item.id === id);
    if (cubie && cubie.pos.every((value, index) => value === slot[index])) return move;
  }
  return null;
}

function cycleCenter(state: CubeState, face: Face, done: Face[]) {
  const centers = state.cubies.filter((cubie) => stickerEntries(cubie).length === 1);
  const fixed = centers.find((cubie) => faceOfPos(cubie.pos) === face && Math.abs(cubie.pos[0]) + Math.abs(cubie.pos[1]) + Math.abs(cubie.pos[2]) === 2);
  if (!fixed) return "";
  const color = fixed.stickers[face] as Face;
  const wrong = centers.filter((cubie) => faceOfPos(cubie.pos) === face && cubie.stickers[face] !== color && centerKind(cubie.pos) !== "fixed");
  const goods = centers.filter((cubie) => faceOfPos(cubie.pos) !== face && stickerEntries(cubie)[0][1] === color);
  const startCode = encode(state, CENTER, CENTER_FACE.map((item) => [item]));
  for (const bad of wrong) {
    const cycle = CYCLES.find((item) => item.kind === centerKind(bad.pos));
    if (!cycle) continue;
    for (const good of goods.filter((cubie) => centerKind(cubie.pos) === cycle.kind)) {
      const lift = orientOntoU(faceOfPos(bad.pos));
      const lifted = lift ? applyAlg(state, lift) : state;
      const parked = faceOfPos(lifted.cubies.find((cubie) => cubie.id === good.id)!.pos);
      const parks = parked === "D" ? ["", "U", "U'", "U2"] : [""];
      const shifts = parked === "D" ? ["r", "r'", "l", "l'", "f", "f'", "b", "b'"] : [""];
      for (const uPark of parks) {
      for (const shift of shifts) {
        const parkedU = uPark ? applyMove(lifted, uPark) : lifted;
        const badPos = parkedU.cubies.find((cubie) => cubie.id === bad.id)!.pos;
        const goodPos = parkedU.cubies.find((cubie) => cubie.id === good.id)!.pos;
        const hits = (move: string, pos: readonly number[]) => move[0] === "r" ? pos[0] === 1 : move[0] === "l" ? pos[0] === -1 : move[0] === "f" ? pos[2] === 1 : move[0] === "b" ? pos[2] === -1 : false;
        if (shift && (hits(shift, badPos) || !hits(shift, goodPos))) continue;
        const shifted = shift ? applyMove(parkedU, shift) : parkedU;
        const side = faceOfPos(shifted.cubies.find((cubie) => cubie.id === good.id)!.pos);
        if (side === "U" || side === "D" || faceOfPos(shifted.cubies.find((cubie) => cubie.id === bad.id)!.pos) !== "U") continue;
        const yaw = yawOntoR(side);
        const yawed = yaw ? applyAlg(shifted, yaw) : shifted;
        const u = turnOnto(yawed, bad.id, cycle.bad, "U");
        if (u === null) continue;
        const aimed = u ? applyMove(yawed, u) : yawed;
        const right = turnOnto(aimed, good.id, cycle.good, "R");
        if (right === null) continue;
        const setup = [lift, uPark, shift, yaw, u, right].filter(Boolean).join(" ");
        const algorithm = [setup, cycle.alg, setup ? invertAlg(setup) : ""].filter(Boolean).join(" ");
        const nextCode = encode(applyAlg(state, algorithm), CENTER, CENTER_FACE.map((item) => [item]));
        if (matchedCenters(nextCode, face) > matchedCenters(startCode, face) && done.every((item) => matchedCenters(nextCode, item) === 8)) return algorithm;
      }
      }
    }
  }
  return "";
}

function centerHint(code: string, names: Record<Face, string>): Hint | null {
  if (uniformFaces(code) === 6) return null;
  for (let index = 0; index < CENTER_ORDER.length; index += 1) {
    const face = CENTER_ORDER[index];
    const have = matchedCenters(code, face);
    if (have === 8) continue;
    const done = CENTER_ORDER.slice(0, index);
    const keeps = (next: string) => matchedCenters(next, face) > have && done.every((kept) => matchedCenters(next, kept) === 8);
    const algorithm = searchCenters(code, keeps, 3) || searchCenterSwap(code, keeps);
    const word = names[fixedColor(code, face) as Face] ?? names[face];
    return {
      stage: "cross",
      title: `${word} centers`,
      detail: `This brings another ${word} center next to the middle ${word} center. Centers that already match stay together.`,
      algorithm,
      progress: `${have} of 8 ${word} centers match the middle.`,
    };
  }
  return null;
}

function play(centers: string, wings: string, midges: string, moves: string[]) {
  for (const move of moves) {
    centers = applyCode(centers, move, CENTER_TABLE);
    wings = applyCode(wings, move, WING_TABLE);
    midges = applyCode(midges, move, MIDGE_TABLE);
  }
  return { centers, wings, midges };
}

function searchPairs(centers: string, wings: string, midges: string) {
  const start = wingMatches(wings, midges);
  const better = (moves: string[]) => {
    const next = play(centers, wings, midges, moves);
    return uniformFaces(next.centers) === 6 && wingMatches(next.wings, next.midges) > start ? moves.join(" ") : "";
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
          if (start < 22) {
            for (const third of FACE_TURN) {
              if (third[0] === second[0]) continue;
              const three = better([...head, first, second, third, undo]);
              if (three) return three;
            }
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
  if (start >= 22) return finishWings(centers, wings, midges, start);
  return "";
}

function finishWings(centers: string, wings: string, midges: string, start: number) {
  const moves = [...FACE_TURN, ...SLICE_TURN];
  let layer = [{ c: centers, w: wings, m: midges, alg: "", score: start }];
  const seen = new Set([`${wings}|${midges}`]);
  for (let depth = 0; depth < 6; depth += 1) {
    const next: { c: string; w: string; m: string; alg: string; score: number }[] = [];
    for (const item of layer) {
      const previous = item.alg.split(" ").at(-1)?.[0] ?? "";
      for (const move of moves) {
        if (move[0] === previous) continue;
        const c = applyCode(item.c, move, CENTER_TABLE);
        const w = applyCode(item.w, move, WING_TABLE);
        const m = applyCode(item.m, move, MIDGE_TABLE);
        const matched = wingMatches(w, m);
        const faces = uniformFaces(c);
        const alg = item.alg ? `${item.alg} ${move}` : move;
        if (faces === 6 && matched > start) return alg;
        next.push({ c, w, m, alg, score: matched * 10 + faces });
      }
    }
    next.sort((a, b) => b.score - a.score);
    layer = [];
    for (const item of next) {
      const key = `${item.w}|${item.m}`;
      if (seen.has(key)) continue;
      seen.add(key);
      layer.push(item);
      if (layer.length === 300) break;
    }
  }
  return "";
}

const WIDE: Record<string, string[]> = {
  r: ["r", "M'", "l'"],
  l: ["l", "M", "r'"],
  u: ["u", "E'", "d'"],
  d: ["d", "E", "u'"],
  f: ["f", "S", "b'"],
  b: ["b", "S'", "f'"],
};

function widen(alg: string) {
  return alg.split(/\s+/).filter(Boolean).flatMap((token) => {
    const parts = WIDE[token[0]];
    if (!parts) return [token];
    const quarter = token.endsWith("2") ? 2 : token.endsWith("'") ? 3 : 1;
    const written = (letter: string, turns: number) => {
      const cycle = ((turns % 4) + 4) % 4;
      if (cycle === 0) return "";
      return `${letter}${cycle === 2 ? "2" : cycle === 3 ? "'" : ""}`;
    };
    const turnsOf = (part: string) => (part.endsWith("2") ? 2 : part.endsWith("'") ? 3 : 1);
    return [written(token[0].toUpperCase(), quarter), ...parts.map((part) => written(part[0], turnsOf(part) * quarter))].filter(Boolean);
  }).join(" ");
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
    const source = CENTER.findIndex((slot, index) => FIXED.has(index) && CENTER_FACE[index] === face);
    const color = stickerEntries(cubieAt(state, CENTER[source])!)[0][1];
    put([color], pos as [number, number, number], { [face]: color });
  }
  for (const x of [-2, 2]) {
    for (const y of [-2, 2]) {
      for (const z of [-2, 2]) {
        const cubie = cubieAt(state, [x, y, z])!;
        const entries = stickerEntries(cubie);
        put(entries.map(([, color]) => color), [x / 2, y / 2, z / 2], Object.fromEntries(entries));
      }
    }
  }
  for (const pos of MIDGE) {
    const cubie = cubieAt(state, pos)!;
    const entries = stickerEntries(cubie);
    const at = pos.map((value) => (Math.abs(value) === 2 ? value / 2 : 0)) as [number, number, number];
    put(entries.map(([, color]) => color), at, Object.fromEntries(entries));
  }
  return cube;
}

export function professorHint(state: CubeState, names: Record<Face, string>, solve3: (state: CubeState, names: Record<Face, string>) => Hint): Hint {
  const centers = encode(state, CENTER, CENTER_FACE.map((face) => [face]));
  const centerStep = centerHint(centers, names);
  if (centerStep) {
    if (centerStep.algorithm) return centerStep;
    const face = CENTER_ORDER.find((item, index) => matchedCenters(centers, item) < 8 && CENTER_ORDER.slice(0, index).every((kept) => matchedCenters(centers, kept) === 8)) ?? "U";
    const done = CENTER_ORDER.slice(0, CENTER_ORDER.indexOf(face));
    return { ...centerStep, algorithm: cycleCenter(state, face, done) };
  }
  const wings = encode(state, WING, WING_FACES);
  const midges = encode(state, MIDGE, MIDGE_FACES);
  const matched = wingMatches(wings, midges);
  if (matched < 24) {
    return {
      stage: "middle",
      title: "Edge pairs",
      detail: "This joins the next wing to its middle edge. Centers stay solved, and wings you already paired stay paired.",
      algorithm: searchPairs(centers, wings, midges),
      progress: `${matched} of 24 wings are paired.`,
    };
  }
  const hint = solve3(project(state), names);
  return { ...hint, algorithm: widen(hint.algorithm) };
}
