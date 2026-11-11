import type { Face } from "./cube";

/** Right and up while looking at the face from outside. Cube +Y is up. */
const FACE_AXES: Record<Face, { right: [number, number, number]; up: [number, number, number]; center: [number, number, number] }> = {
  U: { right: [1, 0, 0], up: [0, 0, -1], center: [0, 1, 0] },
  D: { right: [1, 0, 0], up: [0, 0, 1], center: [0, -1, 0] },
  F: { right: [1, 0, 0], up: [0, 1, 0], center: [0, 0, 1] },
  B: { right: [-1, 0, 0], up: [0, 1, 0], center: [0, 0, -1] },
  R: { right: [0, 0, -1], up: [0, 1, 0], center: [1, 0, 0] },
  L: { right: [0, 0, 1], up: [0, 1, 0], center: [-1, 0, 0] },
};

/** Cube vector to screen offset. +x right, +y down. Camera matches rotateX then rotateY. */
export function projectCube(vec: [number, number, number], camera: { x: number; y: number }): [number, number] {
  const yaw = (camera.y * Math.PI) / 180;
  const pitch = (camera.x * Math.PI) / 180;
  const x = vec[0];
  const y = -vec[1];
  const z = vec[2];
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const x1 = x * cosY + z * sinY;
  const y1 = y;
  const z1 = -x * sinY + z * cosY;
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  return [x1, y1 * cosP - z1 * sinP];
}

/**
 * Face turn that follows the pointer. `pointer` and `drag` are in the same
 * screen space as projectCube (y down), with the pointer measured from the cube origin.
 */
export function faceTurnFromDrag(
  face: Face,
  pointer: [number, number],
  drag: [number, number],
  camera: { x: number; y: number },
): string {
  const axes = FACE_AXES[face];
  const center = projectCube(axes.center, camera);
  const right = projectCube(axes.right, camera);
  const up = projectCube(axes.up, camera);
  const px = pointer[0] - center[0];
  const py = pointer[1] - center[1];
  const det = right[0] * up[1] - up[0] * right[1];
  const localRight = Math.abs(det) < 1e-4 ? 0 : (px * up[1] - py * up[0]) / det;
  const localUp = Math.abs(det) < 1e-4 ? 0 : (right[0] * py - right[1] * px) / det;
  const clockwiseX = localUp * right[0] - localRight * up[0];
  const clockwiseY = localUp * right[1] - localRight * up[1];
  const follow = clockwiseX * drag[0] + clockwiseY * drag[1];
  if (Math.abs(follow) < 1e-6) {
    const horizontal = Math.abs(drag[0]) >= Math.abs(drag[1]);
    const clockwise = horizontal ? drag[0] > 0 : drag[1] > 0;
    return `${face}${clockwise ? "" : "'"}`;
  }
  return `${face}${follow > 0 ? "" : "'"}`;
}
