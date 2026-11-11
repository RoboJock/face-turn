"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { parseMove, stickerEntries, type CubeState, type Face } from "../lib/cube";
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

const CLOCKWISE_SIGN: Record<string, number> = {
  U: -1,
  D: 1,
  F: 1,
  B: -1,
  R: -1,
  L: 1,
  y: -1,
  x: -1,
  z: 1,
  u: -1,
  d: 1,
  f: 1,
  b: -1,
  r: -1,
  l: 1,
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

function spin(move: string, pos: [number, number, number], live: boolean): string {
  if (!live) return "";
  const parsed = parseMove(move);
  if (!inSlice(parsed.turn, pos)) return "";
  const direction = parsed.quarter === 2 ? 2 : parsed.quarter === 3 ? -1 : 1;
  const angle = direction * 90 * (CLOCKWISE_SIGN[parsed.turn] ?? 1);
  return `rotate${axisOf(parsed.turn)}(${angle}deg) `;
}

export function CubeScene({
  cube,
  palette,
  anim,
  onAnimEnd,
  onTurn,
  camera,
  onCamera,
}: {
  cube: CubeState;
  palette: Palette;
  anim: { move: string; duration: number; token: number } | null;
  onAnimEnd: () => void;
  onTurn: (move: string) => void;
  camera: { x: number; y: number };
  onCamera: (next: { x: number; y: number }) => void;
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
    const face = (event.target as HTMLElement).dataset.face as Face | undefined;
    if (face) {
      drag.current = { x: event.clientX, y: event.clientY, face };
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
        x: Math.max(-70, Math.min(70, orbit.current.camX + (event.clientY - orbit.current.y) * 0.35)),
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
    const sx = drag.current.x - (rect.left + rect.width / 2);
    const sy = drag.current.y - (rect.top + rect.height / 2);
    const clockwise = sx * dy - sy * dx > 0;
    const move = `${drag.current.face}${clockwise ? "" : "'"}`;
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
            return (
              <div
                key={cubie.id}
                className={spinning ? "pivot turning" : "pivot"}
                style={{
                  transform: spin(anim?.move ?? "", cubie.pos, spinning),
                  transitionDuration: spinning && anim ? `${anim.duration}ms` : "0ms",
                }}
              >
                <div
                  className="cubie"
                  style={{ transform: `translate3d(${cubie.pos[0] * STEP}px, ${-cubie.pos[1] * STEP}px, ${cubie.pos[2] * STEP}px)` }}
                >
                  {FACES.map(({ face, pose }) => {
                    const color = stickerEntries(cubie).find(([dir]) => dir === face)?.[1];
                    return (
                      <div key={face} className="face" style={{ transform: pose }}>
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
        </div>
      </div>
    </div>
  );
}
