/** Row-major rotation of CSS coordinates: +x right, +y down, +z toward the viewer. */
export type Mat3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

export function mul(a: Mat3, b: Mat3): Mat3 {
  const out = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      out[row * 3 + col] = a[row * 3] * b[col] + a[row * 3 + 1] * b[3 + col] + a[row * 3 + 2] * b[6 + col];
    }
  }
  return out as unknown as Mat3;
}

export function rotX(deg: number): Mat3 {
  const radians = (deg * Math.PI) / 180;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}

export function rotY(deg: number): Mat3 {
  const radians = (deg * Math.PI) / 180;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}

/** Same starting view as rotateX(pitch) rotateY(yaw). */
export function viewFromAngles(pitch: number, yaw: number): Mat3 {
  return mul(rotX(pitch), rotY(yaw));
}

export const HOME_VIEW = viewFromAngles(-28, 34);

/** Pitch and yaw of a turntable view, the kind `viewFromAngles` builds. */
export function orbitAngles(view: Mat3): { pitch: number; yaw: number } {
  return {
    pitch: (Math.atan2(view[7], view[4]) * 180) / Math.PI,
    yaw: (Math.atan2(view[2], view[0]) * 180) / Math.PI,
  };
}

/**
 * Turntable orbit. Positive pitch lifts the front of the cube.
 * Positive yaw spins it to the right. Pitch stays between straight up and
 * straight down, so the cube never rolls onto its side.
 */
export function orbitView(view: Mat3, pitch: number, yaw: number): Mat3 {
  const angles = orbitAngles(view);
  const nextPitch = Math.max(-90, Math.min(90, angles.pitch + pitch));
  return viewFromAngles(nextPitch, angles.yaw + yaw);
}

export function applyView(view: Mat3, x: number, y: number, z: number): [number, number, number] {
  return [
    view[0] * x + view[1] * y + view[2] * z,
    view[3] * x + view[4] * y + view[5] * z,
    view[6] * x + view[7] * y + view[8] * z,
  ];
}

export function viewMatrix3d(view: Mat3): string {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = view;
  return `matrix3d(${m00},${m10},${m20},0,${m01},${m11},${m21},0,${m02},${m12},${m22},0,0,0,0,1)`;
}
