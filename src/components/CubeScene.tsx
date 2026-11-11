"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { parseMove, stickerEntries, type CubeState, type Face } from "../lib/cube";
import { faceTurnFromDrag } from "../lib/drag";
import type { Palette } from "../lib/palette";

const STEP = 70;
const FACES: { face: Face; pose: string }[] = [
  { face: "U", pose: "rotateX(90deg) translateZ(calc(var(--s) / 2))" },
  { face: "D", pose: "rotateX(-90deg) translateZ(calc(var(--s) / 2))" },
  { face: "F", pose: "translateZ(calc(var(--s) / 2))" },
  { face: "B", pose: "rotateY(180deg) translateZ(calc(var(--s) / 2))" },
  { face: "R", pose: "rotateY(90deg) translateZ(calc(var(--s) / 2))" },
  { face: "L", pose: "rotateY(-90deg) translateZ(calc(var(--s) / 2))" },
];

/** Quarter-turn sign in CSS space. Cube +Y is CSS −Y, which reverses X-axis turns. */
const CLOCKWISE_SIGN: Record<string, number> = {
  U: -1,
  D: 1,
  F: 1,
  B: -1,
  R: 1,
  L: -1,
  y: -1,
  x: 1,
  z: 1,
  u: -1,
  d: 1,
  f: 1,
  b: -1,
  r: 1,
  l: -1,
};

function axisOf(turn: string): "X" | "Y" | "Z" {
  if ("UuYy".includes(turn)) return "Y";
  if ("FfZzBb".includes(turn) && "FfZz".includes(turn)) return "Z";
  if (turn === "B" || turn === "b") return "Z";
  return "X";
}

function inSlice(turn: string, pos: [number, number, number]): boolean {
  const [x, y, z] = pos;
  if (turn === "x" || turn === "y" || turn === "z") return true;
  if (turn === "U") return y === 1;
  if (turn === "D") return y === -1;
  if (turn === "F") return z === 1;
  if (turn === "B") return z === -1;
  if (turn === "R") return x === 1;
  if (turn === "L") return x === -1;
  if (turn === "u") return y !== -1;
  if (turn === "d") return y !== 1;
  if (turn === "f") return z !== -1;
  if (turn === "b") return z !== 1;
  if (turn === "r") return x !== -1;
  if (turn === "l") return x !== 1;
  return false;
}

function turnStyle(move: string, pos: [number, number, number], live: boolean): CSSProperties {
  if (!live) return {};
  const parsed = parseMove(move);
  if (!inSlice(parsed.turn, pos)) return {};
  const direction = parsed.quarter === 2 ? 2 : parsed.quarter === 3 ? -1 : 1;
  const angle = direction * 90 * (CLOCKWISE_SIGN[parsed.turn] ?? 1);
  const axis = axisOf(parsed.turn);
  const lift = wholeTurn(parsed.turn) ? 0 : 18;
  const liftX = axis === "X" ? Math.sign(parsed.turn === "L" || parsed.turn === "l" ? -1 : 1) * lift : 0;
  const liftY = axis === "Y" ? (parsed.turn === "D" || parsed.turn === "d" ? lift : -lift) : 0;
  const liftZ = axis === "Z" ? (parsed.turn === "B" || parsed.turn === "b" ? -lift : lift) : 0;
  return {
    ["--angle" as string]: `${angle}deg`,
    ["--lx" as string]: `${liftX}px`,
    ["--ly" as string]: `${liftY}px`,
    ["--lz" as string]: `${liftZ}px`,
  };
}

function wholeTurn(turn: string): boolean {
  return turn === "x" || turn === "y" || turn === "z";
}

export function CubeScene({
  cube,
  palette,
  anim,
  onAnimEnd,
  onTurn,
  camera,
  onCamera,
  hintMove,
}: {
  cube: CubeState;
  palette: Palette;
  anim: { move: string; duration: number; token: number } | null;
  onAnimEnd: () => void;
  onTurn: (move: string) => void;
  camera: { x: number; y: number };
  onCamera: (next: { x: number; y: number }) => void;
  hintMove?: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const orbit = useRef<{ x: number; y: number; camX: number; camY: number } | null>(null);
  const orbitFrame = useRef(0);
  const drag = useRef<{ x: number; y: number; face: Face } | null>(null);
  const endRef = useRef(onAnimEnd);
  endRef.current = onAnimEnd;

  function paintCamera(next: { x: number; y: number }) {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.style.transform = `rotateX(${next.x}deg) rotateY(${next.y}deg)`;
  }

  useLayoutEffect(() => {
    if (orbit.current) return;
    paintCamera(camera);
  }, [camera]);

  useEffect(() => {
    if (!anim) {
      setLive(false);
      return;
    }
    setLive(false);
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => setLive(true));
    });
    const timer = setTimeout(() => endRef.current(), Math.max(32, anim.duration + 32));
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [anim]);

  function pointerDown(event: React.PointerEvent) {
    if (anim) return;
    const target = event.target as HTMLElement;
    const onCube = Boolean(target.closest(".cubie"));
    if (onCube) {
      const face = target.closest("[data-face]")?.getAttribute("data-face") as Face | undefined;
      drag.current = face ? { x: event.clientX, y: event.clientY, face } : null;
      orbit.current = null;
    } else {
      orbit.current = { x: event.clientX, y: event.clientY, camX: camera.x, camY: camera.y };
      drag.current = null;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: React.PointerEvent) {
    if (orbit.current) {
      const next = {
        x: Math.max(-70, Math.min(70, orbit.current.camX - (event.clientY - orbit.current.y) * 0.35)),
        y: orbit.current.camY + (event.clientX - orbit.current.x) * 0.45,
      };
      paintCamera(next);
      cancelAnimationFrame(orbitFrame.current);
      orbitFrame.current = requestAnimationFrame(() => onCamera(next));
      return;
    }
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    if (Math.hypot(dx, dy) < 18) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height * 0.46;
    const move = faceTurnFromDrag(
      drag.current.face,
      [(drag.current.x - originX) / STEP, (drag.current.y - originY) / STEP],
      [dx, dy],
      camera,
    );
    drag.current = null;
    onTurn(move);
  }

  function pointerUp() {
    drag.current = null;
    if (!orbit.current || !sceneRef.current) {
      orbit.current = null;
      return;
    }
    const match = sceneRef.current.style.transform.match(/rotateX\(([-\d.]+)deg\) rotateY\(([-\d.]+)deg\)/);
    orbit.current = null;
    if (!match) return;
    onCamera({ x: Number(match[1]), y: Number(match[2]) });
  }

  return (
    <div
      ref={stageRef}
      className="stage"
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
    >
      <div className="table-shadow" />
      <div className="viewport">
        <div
          ref={sceneRef}
          className="scene"
          style={{ transform: `rotateX(${camera.x}deg) rotateY(${camera.y}deg)` }}
        >
          {cube.cubies.map((cubie) => {
            const spinning = Boolean(anim && live && inSlice(parseMove(anim.move).turn, cubie.pos));
            const axis = spinning && anim ? axisOf(parseMove(anim.move).turn) : "Y";
            return (
              <div
                key={cubie.id}
                className={spinning ? `pivot turning axis-${axis}` : "pivot"}
                style={{
                  ...turnStyle(anim?.move ?? "", cubie.pos, spinning),
                  ["--dur" as string]: spinning && anim ? `${anim.duration}ms` : "0ms",
                }}
              >
                <div
                  className="cubie"
                  style={{ transform: `translate3d(${cubie.pos[0] * STEP}px, ${-cubie.pos[1] * STEP}px, ${cubie.pos[2] * STEP}px)` }}
                >
                  {FACES.map(({ face, pose }) => {
                    const color = stickerEntries(cubie).find(([dir]) => dir === face)?.[1];
                    return (
                      <div key={face} className="face" data-face={face} style={{ transform: pose }}>
                        {color ? (
                          <button
                            type="button"
                            className="sticker"
                            data-face={face}
                            aria-label={`${palette[color].name} sticker`}
                            style={{ background: palette[color].hex }}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {hintMove ? <HintArrow move={hintMove} /> : null}
        </div>
      </div>
    </div>
  );
}

const ARROW_POSE: Record<string, string> = {
  U: `translate3d(0, ${-STEP}px, 0) rotateX(90deg) translateZ(50px)`,
  D: `translate3d(0, ${STEP}px, 0) rotateX(-90deg) translateZ(50px)`,
  F: `translate3d(0, 0, ${STEP}px) translateZ(50px)`,
  B: `translate3d(0, 0, ${-STEP}px) rotateY(180deg) translateZ(50px)`,
  R: `translate3d(${STEP}px, 0, 0) rotateY(90deg) translateZ(50px)`,
  L: `translate3d(${-STEP}px, 0, 0) rotateY(-90deg) translateZ(50px)`,
  y: `translate3d(0, ${-STEP - 46}px, 0) rotateX(90deg)`,
  x: `translate3d(${STEP + 46}px, 0, 0) rotateY(90deg)`,
  z: `translate3d(0, 0, ${STEP + 46}px)`,
};

function HintArrow({ move }: { move: string }) {
  const parsed = parseMove(move);
  const pose = ARROW_POSE[parsed.turn] ?? ARROW_POSE[parsed.turn.toUpperCase()];
  if (!pose) return null;
  const counter = parsed.quarter === 3;
  return (
    <div className="hint-arrow" style={{ transform: pose }}>
      <div className={counter ? "hint-glyph counter" : "hint-glyph"}>
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M46 20a18 18 0 1 0 4 16" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
          <path d="M44 8l12 14-16 2z" fill="currentColor" />
        </svg>
        {parsed.quarter === 2 ? <span>2</span> : null}
      </div>
    </div>
  );
}
