"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { cubieTurnsWith, outerIndex, parseMove, stickerEntries, type CubeState, type Face } from "../lib/cube";
import { dragLayerDegrees, faceTurnFromDrag, LAYER_SNAP_DEGREES } from "../lib/drag";
import { orbitView, viewMatrix3d, type Mat3 } from "../lib/view";
import type { Palette } from "../lib/palette";
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
  E: 1,
  M: -1,
  S: 1,
};

function axisOf(turn: string): "X" | "Y" | "Z" {
  if ("UuDdYyEe".includes(turn)) return "Y";
  if ("FfZzSs".includes(turn) || turn === "B" || turn === "b") return "Z";
  return "X";
}

function inSlice(order: CubeState["order"], turn: string, pos: [number, number, number]): boolean {
  return cubieTurnsWith(order, parseMove(turn).turn, pos);
}

function cssAngle(move: string): number {
  const parsed = parseMove(move);
  const direction = parsed.quarter === 2 ? 2 : parsed.quarter === 3 ? -1 : 1;
  return direction * 90 * (CLOCKWISE_SIGN[parsed.turn] ?? 1);
}

function turnStyle(order: CubeState["order"], move: string, pos: [number, number, number], live: boolean): CSSProperties {
  if (!live || !inSlice(order, parseMove(move).turn, pos)) return {};
  return { ["--angle" as string]: `${cssAngle(move)}deg` };
}

function opposite(move: string): string {
  return move.endsWith("'") ? move.slice(0, -1) : `${move}'`;
}

function isFaceCenter(face: Face, [x, y, z]: [number, number, number]): boolean {
  if (face === "U" || face === "D") return x === 0 && z === 0;
  if (face === "F" || face === "B") return x === 0 && y === 0;
  return y === 0 && z === 0;
}

function inkOn(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.62 ? "#1c1915" : "#f7f4ee";
}

function cubieAt(target: Element): [number, number, number] | null {
  const cubie = target.closest(".cubie") as HTMLElement | null;
  const raw = cubie?.dataset.pos;
  if (!raw) return null;
  const [x, y, z] = raw.split(",").map(Number);
  return [x, y, z];
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
  onTurn: (move: string, duration?: number) => void;
  camera: Mat3;
  onCamera: (next: Mat3) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const orbit = useRef<{ x: number; y: number; view: Mat3; spun: boolean } | null>(null);
  const [turningView, setTurningView] = useState(false);
  const viewRef = useRef(camera);
  viewRef.current = camera;
  const orbitFrame = useRef(0);
  const drag = useRef<{ x: number; y: number; face: Face; cubie: [number, number, number] } | null>(null);
  const follow = useRef<{ move: string; ux: number; uy: number; deg: number; settling: boolean } | null>(null);
  const settleFrame = useRef(0);
  const orderRef = useRef(cube.order);
  orderRef.current = cube.order;
  const spanRef = useRef(1);
  const endRef = useRef(onAnimEnd);
  endRef.current = onAnimEnd;
  const turnRef = useRef(onTurn);
  turnRef.current = onTurn;

  function paintCamera(next: Mat3) {
    const scene = sceneRef.current;
    if (!scene) return;
    viewRef.current = next;
    scene.style.transform = viewMatrix3d(next);
  }

  useLayoutEffect(() => {
    if (orbit.current) return;
    paintCamera(camera);
  }, [camera]);

  useLayoutEffect(() => {
    cancelAnimationFrame(settleFrame.current);
    follow.current = null;
    sceneRef.current?.querySelectorAll<HTMLElement>(".pivot").forEach((pivot) => {
      pivot.style.transform = "";
    });
  }, [cube]);

  function paintLayer(move: string, fraction: number) {
    const scene = sceneRef.current;
    if (!scene) return;
    const angle = cssAngle(move) * fraction;
    const axis = axisOf(parseMove(move).turn);
    scene.querySelectorAll<HTMLElement>(".pivot").forEach((pivot) => {
      const pos = cubieAt(pivot.querySelector(".cubie") ?? pivot);
      const turning = pos !== null && inSlice(orderRef.current, parseMove(move).turn, pos);
      pivot.style.transform = turning ? `rotate${axis}(${angle}deg)` : "";
    });
  }

  function settleLayer(from: number, to: number, move: string | null) {
    const active = follow.current;
    if (!active) return;
    active.settling = true;
    const locked = active.move;
    const started = performance.now();
    const step = (now: number) => {
      if (follow.current !== active) return;
      const t = Math.min(1, (now - started) / 140);
      const eased = 1 - (1 - t) ** 3;
      const degrees = from + (to - from) * eased;
      active.deg = degrees;
      paintLayer(locked, degrees / 90);
      if (t < 1) {
        settleFrame.current = requestAnimationFrame(step);
        return;
      }
      follow.current = null;
      if (move) turnRef.current(move, 0);
      else sceneRef.current?.querySelectorAll<HTMLElement>(".pivot").forEach((pivot) => {
        pivot.style.transform = "";
      });
    };
    settleFrame.current = requestAnimationFrame(step);
  }

  useEffect(() => {
    if (!anim || anim.duration <= 0) {
      setLive(false);
      if (anim) endRef.current();
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
    if (anim || follow.current) return;
    const target = event.target as HTMLElement;
    const onCube = Boolean(target.closest(".cubie"));
    if (onCube) {
      const face = target.closest("[data-face]")?.getAttribute("data-face") as Face | undefined;
      const cubie = cubieAt(target);
      drag.current = face && cubie ? { x: event.clientX, y: event.clientY, face, cubie } : null;
      orbit.current = null;
    } else {
      orbit.current = { x: event.clientX, y: event.clientY, view: viewRef.current, spun: false };
      drag.current = null;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: React.PointerEvent) {
    if (orbit.current) {
      const dx = event.clientX - orbit.current.x;
      const dy = event.clientY - orbit.current.y;
      if (!orbit.current.spun && dx * dx + dy * dy > 16) {
        orbit.current.spun = true;
        setTurningView(true);
      }
      const next = orbitView(
        orbit.current.view,
        -dy * 0.4,
        dx * 0.4,
      );
      paintCamera(next);
      cancelAnimationFrame(orbitFrame.current);
      orbitFrame.current = requestAnimationFrame(() => onCamera(next));
      return;
    }
    if (!drag.current || follow.current?.settling) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    if (!follow.current) {
      if (dx * dx + dy * dy < 25) return;
      const move = faceTurnFromDrag(drag.current.face, drag.current.cubie, [dx, dy], camera, orderRef.current);
      const length = Math.hypot(dx, dy);
      follow.current = { move, ux: dx / length, uy: dy / length, deg: 0, settling: false };
    }
    const active = follow.current;
    const along = dx * active.ux + dy * active.uy;
    const degrees = dragLayerDegrees(along, spanRef.current);
    active.deg = degrees;
    paintLayer(active.move, degrees / 90);
    if (Math.abs(degrees) < LAYER_SNAP_DEGREES) return;
    drag.current = null;
    settleLayer(degrees, degrees > 0 ? 90 : -90, degrees > 0 ? active.move : opposite(active.move));
  }

  function pointerUp() {
    const active = follow.current;
    drag.current = null;
    if (active && !active.settling) settleLayer(active.deg, 0, null);
    if (!orbit.current) return;
    orbit.current = null;
    setTurningView(false);
    onCamera(viewRef.current);
  }

  const pitch = cube.order === 3 || cube.order === 5 ? 1 : 2;
  const step = cube.order === 5 ? 42 : cube.order === 4 ? 54 : 70;
  const unit = step / pitch;
  const sticker = cube.order === 5 ? 38 : cube.order === 4 ? 46 : cube.order === 2 ? 78 : 62;
  const outer = outerIndex(cube.order);
  spanRef.current = outer * 2 * unit + sticker;

  return (
    <div
      ref={stageRef}
      className="stage"
      style={{ ["--s" as string]: `${sticker}px` }}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
    >
      <div className="table-shadow" />
      <div className={turningView ? "orbit-hint away" : "orbit-hint"} aria-hidden="true">
        <span className="orbit-arrow side left">
          <OrbitArrow direction="left" />
        </span>
        <span className="orbit-arrow side right">
          <OrbitArrow direction="right" />
        </span>
        <span className="orbit-arrow below">
          <OrbitArrow direction="both" />
        </span>
      </div>
      <div className="viewport">
        <div
          ref={sceneRef}
          className="scene"
          style={{ transform: viewMatrix3d(camera) }}
        >
          {cube.cubies.map((cubie) => {
            const spinning = Boolean(anim && live && inSlice(cube.order, parseMove(anim.move).turn, cubie.pos));
            const axis = spinning && anim ? axisOf(parseMove(anim.move).turn) : "Y";
            return (
              <div
                key={cubie.id}
                className={spinning ? `pivot turning axis-${axis}` : "pivot"}
                style={{
                  ...turnStyle(cube.order, anim?.move ?? "", cubie.pos, spinning),
                  ["--dur" as string]: spinning && anim ? `${anim.duration}ms` : "0ms",
                }}
              >
                <div
                  className="cubie"
                  data-pos={cubie.pos.join(",")}
                  style={{ transform: `translate3d(${cubie.pos[0] * unit}px, ${-cubie.pos[1] * unit}px, ${cubie.pos[2] * unit}px)` }}
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
                            aria-label={isFaceCenter(face, cubie.pos) ? `${face} center, ${palette[color].name}` : `${palette[color].name} sticker`}
                            style={{ background: palette[color].hex, color: inkOn(palette[color].hex) }}
                          >
                            {cube.order === 3 && isFaceCenter(face, cubie.pos) ? <span className="face-mark">{face}</span> : null}
                          </button>
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

function OrbitArrow({ direction }: { direction: "left" | "right" | "both" }) {
  const path = direction === "left"
    ? "M34 10 L12 24 L34 38"
    : direction === "right"
      ? "M14 10 L36 24 L14 38"
      : "M6 16 H42 M6 16 L16 7 M6 16 L16 25 M42 16 L32 7 M42 16 L32 25";
  return (
    <svg viewBox={direction === "both" ? "0 0 48 32" : "0 0 48 48"} aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

