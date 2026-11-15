export interface Lesson {
  title: string;
  body: string[];
  algorithm?: string;
}

export const LESSONS: Lesson[] = [
  {
    title: "1. White cross, on the bottom",
    body: [
      "Turn the whole cube until yellow is on top and white is on the bottom. Hints use that orientation, which is also how most video lessons are filmed.",
      "Find the four edges that show white. Park each one so white is on the bottom and the other color lines up with the center beside it. If an edge is flipped, the hint lifts it out and puts it back the right way.",
      "Already-solved white edges stay put. You do not have to start over when one piece is wrong.",
    ],
  },
  {
    title: "2. White corners",
    body: [
      "A white corner belongs between the two side centers that match its other colors. For green and red, that slot is the corner where the green and red centers meet.",
      "Get the corner into the top layer, turn the top until it sits above the right slot, then repeat the right-hand trigger until white faces down.",
    ],
    algorithm: "R U R' U'",
  },
  {
    title: "3. Second layer",
    body: [
      "The middle edges have no white or yellow. Look at the edge sitting in the top layer. Turn the top until the side color matches the center it is sitting over.",
      "The color on top tells you which way it goes. Match on the right, use the right insert. Match on the left, use the left insert. If the edge is trapped in the wrong middle slot, the same insert pops it out so you can put it back.",
    ],
    algorithm: "U R U' R' U' F' U F",
  },
  {
    title: "4. Yellow cross",
    body: [
      "Ignore the corners for a moment. You only care whether the four yellow edge stickers face up.",
      "Hold the pattern as the hint shows and do the cross move. A dot becomes an L, an L becomes a line, and a line becomes the cross. You usually need it once or twice.",
    ],
    algorithm: "F R U R' U' F'",
  },
  {
    title: "5. Yellow corners facing up",
    body: [
      "The cross stays a cross. Now turn the corners so yellow is on top, even if they are still in the wrong seats.",
      "The common case is the sune, below. There are six other patterns. Ask for a hint and the app picks the one that matches the cube in front of you, including how to hold it.",
    ],
    algorithm: "R U R' U R U2 R'",
  },
  {
    title: "6. Put the yellow corners in their seats",
    body: [
      "Yellow is already facing up. If two corners are correct and two are swapped, a corner cycle fixes them. The hint turns the whole cube so the pair you want to move is in front of the algorithm.",
      "Edges may shuffle during this step. That is expected. You place them last.",
    ],
    algorithm: "R U R' U' R' F R2 U' R' U' R U R' F'",
  },
  {
    title: "7. Put the yellow edges in their seats",
    body: [
      "If one yellow edge is already correct, hold it at the front or the back, whichever the hint says, and cycle the other three.",
      "If none are correct, the first pass creates one solved edge. Ask again and finish from there. When the last edge lands, the cube is solved.",
    ],
    algorithm: "R U' R U R U R U' R' U' R2",
  },
];

export const REFERENCES: { title: string; href: string; note: string; videoId?: string; size: 2 | 3 | 4 | 5 }[] = [
  {
    title: "J Perm — beginner 3×3 tutorial",
    href: "https://www.youtube.com/watch?v=7Ron6MN45LY",
    note: "A clear filmed walkthrough of this same layer-by-layer order. Pause it beside the cube.",
    videoId: "7Ron6MN45LY",
    size: 3,
  },
  {
    title: "Ruwix — beginner method",
    href: "https://ruwix.com/the-rubiks-cube/how-to-solve-the-rubiks-cube-beginners-method/",
    note: "Diagrams for every stage if you want a still picture instead of a video.",
    size: 3,
  },
  {
    title: "J Perm — beginner 2×2 tutorial",
    href: "https://www.youtube.com/watch?v=GANnG5a19kg",
    note: "Build one layer, place the last corners, then finish the cube.",
    videoId: "GANnG5a19kg",
    size: 2,
  },
  {
    title: "J Perm — 4×4 Yau method",
    href: "https://www.youtube.com/watch?v=KWOZHbDdOeo",
    note: "Solve the centers, pair the edges, then finish it like a 3×3.",
    videoId: "KWOZHbDdOeo",
    size: 4,
  },
  {
    title: "J Perm — beginner 5×5 tutorial",
    href: "https://www.youtube.com/watch?v=d1I-jJlVwB4",
    note: "Solve the centers, pair the edges, then finish it like a 3×3.",
    videoId: "d1I-jJlVwB4",
    size: 5,
  },
];
