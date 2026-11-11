export type Face = "U" | "D" | "F" | "B" | "L" | "R";
export type Wide = "r" | "l" | "u" | "d" | "f" | "b";
export type CubeTurn = Face | "x" | "y" | "z" | Wide;

export const FACES: Face[] = ["U", "D", "F", "B", "L", "R"];
export const SIDE_FACES: Face[] = ["F", "R", "B", "L"];

const VECTORS: Record<Face, [number, number, number]> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
  R: [1, 0, 0],
  L: [-1, 0, 0],
};

const DIR_FROM_KEY: Record<string, Face> = {
  "0,1,0": "U",
  "0,-1,0": "D",
  "0,0,1": "F",
  "0,0,-1": "B",
  "1,0,0": "R",
  "-1,0,0": "L",
};

export type StickerMap = Partial<Record<Face, Face>>;

export interface Cubie {
  id: number;
  pos: [number, number, number];
  stickers: StickerMap;
}

export interface CubeState {
  cubies: Cubie[];
}

export interface Move {
  turn: CubeTurn;
  /** 1 clockwise, 2 double, 3 inverse */
  quarter: 1 | 2 | 3;
}

const OPPOSITE: Record<Face, Face> = {
  U: "D",
  D: "U",
  F: "B",
  B: "F",
  L: "R",
  R: "L",
};

function n(value: number): number {
  return value === 0 ? 0 : value;
}

function rot90(face: Face, [x, y, z]: [number, number, number]): [number, number, number] {
  switch (face) {
    case "F":
      return [n(y), n(-x), n(z)];
    case "B":
      return [n(-y), n(x), n(z)];
    case "R":
      return [n(x), n(z), n(-y)];
    case "L":
      return [n(x), n(-z), n(y)];
    case "U":
      return [n(-z), n(y), n(x)];
    case "D":
      return [n(z), n(y), n(-x)];
  }
}

function dirOf(v: [number, number, number]): Face {
  const dir = DIR_FROM_KEY[v.join(",")];
  if (!dir) throw new Error(`Not a face vector: ${v.join(",")}`);
  return dir;
}

function remapStickers(stickers: StickerMap, face: Face): StickerMap {
  const next: StickerMap = {};
  for (const [dir, color] of Object.entries(stickers) as [Face, Face][]) {
    next[dirOf(rot90(face, VECTORS[dir]))] = color;
  }
  return next;
}

export function solvedCube(): CubeState {
  const cubies: Cubie[] = [];
  let id = 0;
  for (const x of [-1, 0, 1]) {
    for (const y of [-1, 0, 1]) {
      for (const z of [-1, 0, 1]) {
        if (x === 0 && y === 0 && z === 0) continue;
        const stickers: StickerMap = {};
        if (y === 1) stickers.U = "U";
        if (y === -1) stickers.D = "D";
        if (z === 1) stickers.F = "F";
        if (z === -1) stickers.B = "B";
        if (x === 1) stickers.R = "R";
        if (x === -1) stickers.L = "L";
        cubies.push({ id: id++, pos: [x, y, z], stickers });
      }
    }
  }
  return { cubies };
}

export function cloneCube(state: CubeState): CubeState {
  return {
    cubies: state.cubies.map((cubie) => ({
      id: cubie.id,
      pos: [cubie.pos[0], cubie.pos[1], cubie.pos[2]],
      stickers: { ...cubie.stickers },
    })),
  };
}

function turnFace(turn: CubeTurn): Face {
  if (turn === "x" || turn === "r") return "R";
  if (turn === "y" || turn === "u") return "U";
  if (turn === "z" || turn === "f") return "F";
  if (turn === "l") return "L";
  if (turn === "d") return "D";
  if (turn === "b") return "B";
  return turn;
}

function affectsAll(turn: CubeTurn): boolean {
  return turn === "x" || turn === "y" || turn === "z";
}

function inWide(turn: CubeTurn, pos: [number, number, number]): boolean {
  const [x, y, z] = pos;
  if (turn === "r") return x !== -1;
  if (turn === "l") return x !== 1;
  if (turn === "u") return y !== -1;
  if (turn === "d") return y !== 1;
  if (turn === "f") return z !== -1;
  if (turn === "b") return z !== 1;
  return false;
}

function isWide(turn: CubeTurn): turn is Wide {
  return turn === "r" || turn === "l" || turn === "u" || turn === "d" || turn === "f" || turn === "b";
}

function onFace(pos: [number, number, number], face: Face): boolean {
  const [x, y, z] = pos;
  if (face === "U") return y === 1;
  if (face === "D") return y === -1;
  if (face === "F") return z === 1;
  if (face === "B") return z === -1;
  if (face === "R") return x === 1;
  return x === -1;
}

export function applyMove(state: CubeState, move: Move | string): CubeState {
  const parsed = typeof move === "string" ? parseMove(move) : move;
  let current = state;
  for (let i = 0; i < parsed.quarter; i += 1) {
    const face = turnFace(parsed.turn);
    const whole = affectsAll(parsed.turn);
    const wide = isWide(parsed.turn);
    current = {
      cubies: current.cubies.map((cubie) => {
        if (!whole && !wide && !onFace(cubie.pos, face)) return cubie;
        if (wide && !inWide(parsed.turn, cubie.pos)) return cubie;
        return {
          id: cubie.id,
          pos: rot90(face, cubie.pos),
          stickers: remapStickers(cubie.stickers, face),
        };
      }),
    };
  }
  return current;
}

export function parseMove(token: string): Move {
  const match = token.trim().match(/^([URFDLBxyzrludfb])(2|'|’)?$/);
  if (!match) throw new Error(`Unknown move: ${token}`);
  const suffix = match[2];
  const quarter = suffix === "2" ? 2 : suffix === "'" || suffix === "’" ? 3 : 1;
  return { turn: match[1] as CubeTurn, quarter };
}

export function parseAlg(alg: string): Move[] {
  return alg
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(parseMove);
}

export function formatMove(move: Move): string {
  const suffix = move.quarter === 2 ? "2" : move.quarter === 3 ? "'" : "";
  return `${move.turn}${suffix}`;
}

export function formatAlg(moves: Move[]): string {
  return moves.map(formatMove).join(" ");
}

export function applyAlg(state: CubeState, alg: string): CubeState {
  return parseAlg(alg).reduce((current, move) => applyMove(current, move), state);
}

export function invertMove(move: Move): Move {
  const quarter = move.quarter === 1 ? 3 : move.quarter === 3 ? 1 : 2;
  return { turn: move.turn, quarter };
}

export function invertAlg(alg: string): string {
  return formatAlg(parseAlg(alg).reverse().map(invertMove));
}

export function scrambleAlg(length = 20, rng: () => number = Math.random): string {
  const moves: string[] = [];
  let previous = "";
  let beforeThat = "";
  while (moves.length < length) {
    const face = FACES[Math.floor(rng() * FACES.length)];
    if (face === previous) continue;
    if (OPPOSITE[face] === previous && face === beforeThat) continue;
    const suffix = ["", "'", "2"][Math.floor(rng() * 3)];
    moves.push(`${face}${suffix}`);
    beforeThat = previous;
    previous = face;
  }
  return moves.join(" ");
}

export function stickerEntries(cubie: Cubie): [Face, Face][] {
  return Object.entries(cubie.stickers) as [Face, Face][];
}

export function centerFace(state: CubeState, color: Face): Face {
  for (const cubie of state.cubies) {
    const entries = stickerEntries(cubie);
    if (entries.length === 1 && entries[0][1] === color) return entries[0][0];
  }
  throw new Error(`Missing center ${color}`);
}

export function centerColors(state: CubeState): Record<Face, Face> {
  const colors = {} as Record<Face, Face>;
  for (const face of FACES) {
    for (const cubie of state.cubies) {
      const entries = stickerEntries(cubie);
      if (entries.length === 1 && entries[0][0] === face) colors[face] = entries[0][1];
    }
  }
  return colors;
}

/** A cube is solved when every face is one color, matching that face's center. */
export function isSolved(state: CubeState): boolean {
  const centers = centerColors(state);
  for (const cubie of state.cubies) {
    for (const [dir, color] of stickerEntries(cubie)) {
      if (color !== centers[dir]) return false;
    }
  }
  return true;
}

export function findCubie(state: CubeState, colors: Face[]): Cubie {
  const wanted = [...colors].sort().join("");
  const cubie = state.cubies.find((item) => stickerEntries(item).map(([, color]) => color).sort().join("") === wanted);
  if (!cubie) throw new Error(`Missing cubie ${wanted}`);
  return cubie;
}

export function colorFacing(cubie: Cubie, color: Face): Face {
  for (const [dir, sticker] of stickerEntries(cubie)) {
    if (sticker === color) return dir;
  }
  throw new Error(`Cubie has no ${color} sticker`);
}

export function isPieceSolved(state: CubeState, colors: Face[]): boolean {
  const cubie = findCubie(state, colors);
  return colors.every((color) => colorFacing(cubie, color) === centerFace(state, color));
}

const ORIENT_MOVES = ["x", "x'", "x2", "y", "y'", "y2", "z", "z'", "z2"];

/** Whole-cube turns that put a color's center on a face, preserving a solved cube. */
export function movesToPutColorOn(state: CubeState, color: Face, face: Face): string {
  if (centerFace(state, color) === face) return "";
  const queue: { state: CubeState; alg: string }[] = [{ state, alg: "" }];
  const seen = new Set<string>([encodeCenters(state)]);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current.alg.split(" ").filter(Boolean).length >= 3) continue;
    for (const move of ORIENT_MOVES) {
      const next = applyMove(current.state, move);
      const key = encodeCenters(next);
      if (seen.has(key)) continue;
      seen.add(key);
      const alg = `${current.alg} ${move}`.trim();
      if (centerFace(next, color) === face) return alg;
      queue.push({ state: next, alg });
    }
  }
  throw new Error(`Cannot place ${color} on ${face}`);
}

function encodeCenters(state: CubeState): string {
  return FACES.map((face) => `${face}${centerFace(state, face)}`).join("");
}

export function signature(state: CubeState): string {
  return state.cubies
    .map((cubie) => {
      const stickers = stickerEntries(cubie)
        .map(([dir, color]) => `${dir}${color}`)
        .sort()
        .join("");
      return `${cubie.pos.join("")}${stickers}`;
    })
    .sort()
    .join("|");
}

export function replaySolved(scramble: string, solution: string): boolean {
  return isSolved(applyAlg(applyAlg(solvedCube(), scramble), solution));
}

export function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
