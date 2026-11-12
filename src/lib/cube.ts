export type Face = "U" | "D" | "F" | "B" | "L" | "R";
export type Wide = "r" | "l" | "u" | "d" | "f" | "b";
export type Middle = "E" | "M" | "S";
export type CubeTurn = Face | "x" | "y" | "z" | Wide | Middle;

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

export type CubeOrder = 2 | 3 | 4 | 5;

export interface CubeState {
  order: CubeOrder;
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

/** Solved, held the way the lessons do: yellow on top, white on the bottom. */
export function restingCube(order: CubeOrder = 3): CubeState {
  return applyMove(solvedCube(order), "x2");
}

export function outerIndex(order: CubeOrder): number {
  if (order === 4) return 3;
  if (order === 5) return 2;
  return 1;
}

export function solvedCube(order: CubeOrder = 3): CubeState {
  const outer = outerIndex(order);
  const coords = order === 2 ? [-1, 1] : order === 3 ? [-1, 0, 1] : order === 4 ? [-3, -1, 1, 3] : [-2, -1, 0, 1, 2];
  const cubies: Cubie[] = [];
  let id = 0;
  for (const x of coords) {
    for (const y of coords) {
      for (const z of coords) {
        if (Math.abs(x) !== outer && Math.abs(y) !== outer && Math.abs(z) !== outer) continue;
        const stickers: StickerMap = {};
        if (y === outer) stickers.U = "U";
        if (y === -outer) stickers.D = "D";
        if (z === outer) stickers.F = "F";
        if (z === -outer) stickers.B = "B";
        if (x === outer) stickers.R = "R";
        if (x === -outer) stickers.L = "L";
        cubies.push({ id: id++, pos: [x, y, z], stickers });
      }
    }
  }
  return { order, cubies };
}

export function cloneCube(state: CubeState): CubeState {
  return {
    order: state.order,
    cubies: state.cubies.map((cubie) => ({
      id: cubie.id,
      pos: [cubie.pos[0], cubie.pos[1], cubie.pos[2]],
      stickers: { ...cubie.stickers },
    })),
  };
}

function turnFace(turn: CubeTurn): Face {
  if (turn === "x" || turn === "r" || turn === "M") return "R";
  if (turn === "y" || turn === "u") return "U";
  if (turn === "z" || turn === "f" || turn === "S") return "F";
  if (turn === "l") return "L";
  if (turn === "d" || turn === "E") return "D";
  if (turn === "b") return "B";
  return turn;
}

/** The face whose clockwise direction a middle slice follows. E matches D, M matches L, S matches F. */
function rotationFace(turn: CubeTurn): Face {
  if (turn === "M") return "L";
  return turnFace(turn);
}

function affectsAll(turn: CubeTurn): boolean {
  return turn === "x" || turn === "y" || turn === "z";
}

function isWide(turn: CubeTurn): turn is Wide {
  return turn === "r" || turn === "l" || turn === "u" || turn === "d" || turn === "f" || turn === "b";
}

function isMiddle(turn: CubeTurn): turn is Middle {
  return turn === "E" || turn === "M" || turn === "S";
}

function faceSign(face: Face): number {
  return face === "D" || face === "B" || face === "L" ? -1 : 1;
}

function axisCoord(pos: [number, number, number], face: Face): number {
  if (face === "U" || face === "D") return pos[1];
  if (face === "F" || face === "B") return pos[2];
  return pos[0];
}

function inWide(turn: CubeTurn, pos: [number, number, number], order: CubeOrder): boolean {
  const face = turnFace(turn);
  const outer = outerIndex(order);
  return axisCoord(pos, face) !== -faceSign(face) * outer;
}

function onFace(pos: [number, number, number], face: Face, order: CubeOrder): boolean {
  return axisCoord(pos, face) === faceSign(face) * outerIndex(order);
}

/** A lowercase turn on a 4×4 or 5×5 spins only the inner slice beside that face. On a 3×3 it stays a wide turn. */
function onInnerSlice(turn: CubeTurn, pos: [number, number, number], order: CubeOrder): boolean {
  const face = turnFace(turn);
  const outer = outerIndex(order);
  const depth = order === 4 ? 2 : 1;
  return axisCoord(pos, face) === faceSign(face) * (outer - depth);
}

function onMiddle(turn: CubeTurn, pos: [number, number, number], order: CubeOrder): boolean {
  if (order !== 5) return false;
  if (turn === "E") return pos[1] === 0;
  if (turn === "M") return pos[0] === 0;
  return pos[2] === 0;
}

export function cubieTurnsWith(order: CubeOrder, turn: CubeTurn, pos: [number, number, number]): boolean {
  if (turn === "x" || turn === "y" || turn === "z") return true;
  if (isMiddle(turn)) return onMiddle(turn, pos, order);
  if (isWide(turn)) return order >= 4 ? onInnerSlice(turn, pos, order) : inWide(turn, pos, order);
  return onFace(pos, turn, order);
}

export function applyMove(state: CubeState, move: Move | string): CubeState {
  const parsed = typeof move === "string" ? parseMove(move) : move;
  let current = state;
  for (let i = 0; i < parsed.quarter; i += 1) {
    const face = rotationFace(parsed.turn);
    const whole = affectsAll(parsed.turn);
    const wide = isWide(parsed.turn);
    const middle = isMiddle(parsed.turn);
    current = {
      order: current.order,
      cubies: current.cubies.map((cubie) => {
        const turns = whole || (middle ? onMiddle(parsed.turn, cubie.pos, current.order) : wide ? (current.order >= 4 ? onInnerSlice(parsed.turn, cubie.pos, current.order) : inWide(parsed.turn, cubie.pos, current.order)) : onFace(cubie.pos, face, current.order));
        if (!turns) return cubie;
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
  const match = token.trim().match(/^([URFDLBxyzrludfbEMS])(2|'|’)?$/);
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

export function scrambleAlg(length = 20, rng: () => number = Math.random, order: CubeOrder = 3): string {
  const alphabet = order === 4 ? [...FACES, "u", "d", "l", "r", "f", "b"] : order === 5 ? [...FACES, "u", "d", "l", "r", "f", "b", "E", "M", "S"] : [...FACES];
  const moves: string[] = [];
  let previous = "";
  let beforeThat = "";
  while (moves.length < length) {
    const face = alphabet[Math.floor(rng() * alphabet.length)];
    if (face.toLowerCase() === previous.toLowerCase()) continue;
    if (order === 3 && OPPOSITE[face as Face] === previous && face === beforeThat) continue;
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

/** A cube is solved when every face is one color, matching that face's center on a 3×3. */
export function isSolved(state: CubeState): boolean {
  if (state.order !== 3) {
    const seen = new Set<Face>();
    for (const face of FACES) {
      const colors = state.cubies.flatMap((cubie) => (cubie.stickers[face] ? [cubie.stickers[face]] : []));
      if (colors.length === 0 || colors.some((color) => color !== colors[0])) return false;
      seen.add(colors[0]);
    }
    return seen.size === 6;
  }
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
  if (state.order !== 3) return orientToward(state, color, face);
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

function stickersOf(state: CubeState, face: Face, color: Face): number {
  return state.cubies.filter((cubie) => cubie.stickers[face] === color).length;
}

function orientToward(state: CubeState, color: Face, face: Face): string {
  let best = "";
  let bestCount = stickersOf(state, face, color);
  const queue: { state: CubeState; alg: string }[] = [{ state, alg: "" }];
  const seen = new Set<string>([signature(state)]);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current.alg.split(" ").filter(Boolean).length >= 2) continue;
    for (const move of ORIENT_MOVES) {
      const next = applyMove(current.state, move);
      const key = signature(next);
      if (seen.has(key)) continue;
      seen.add(key);
      const alg = `${current.alg} ${move}`.trim();
      const count = stickersOf(next, face, color);
      if (count > bestCount) {
        best = alg;
        bestCount = count;
      }
      queue.push({ state: next, alg });
    }
  }
  return best;
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

export function replaySolved(scramble: string, solution: string, order: CubeOrder = 3): boolean {
  return isSolved(applyAlg(applyAlg(restingCube(order), scramble), solution));
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
