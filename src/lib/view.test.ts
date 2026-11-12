import assert from "node:assert/strict";
import test from "node:test";
import { applyView, orbitView, viewFromAngles } from "./view";

function css(view: ReturnType<typeof viewFromAngles>, cube: [number, number, number]) {
  return applyView(view, cube[0], -cube[1], cube[2]);
}

test("dragging right carries the front of the cube to the right", () => {
  const turned = orbitView(viewFromAngles(0, 0), 0, 24);
  const front = css(turned, [0, 0, 1]);
  assert.ok(front[0] > 0.3, `front x ${front[0]}`);
});

test("dragging up carries the front of the cube up", () => {
  const turned = orbitView(viewFromAngles(0, 0), 24, 0);
  const front = css(turned, [0, 0, 1]);
  assert.ok(front[1] < -0.3, `front y ${front[1]}`);
});

test("after turning sideways, dragging up still lifts the face you are looking at", () => {
  const sideways = orbitView(viewFromAngles(0, 0), 0, 90);
  const facing = css(sideways, [-1, 0, 0]);
  assert.ok(facing[2] > 0.9 && Math.abs(facing[0]) < 0.05);

  const lifted = orbitView(sideways, 28, 0);
  const moved = css(lifted, [-1, 0, 0]);
  assert.ok(moved[1] < -0.35, `should rise, y ${moved[1]}`);
  assert.ok(Math.abs(moved[0]) < Math.abs(moved[1]), `should not slide sideways, x ${moved[0]}`);
});

test("after tilting up, dragging right spins around the screen, not the cube", () => {
  const tilted = orbitView(viewFromAngles(0, 0), 40, 0);
  const spun = orbitView(tilted, 0, 30);
  const front = css(spun, [0, 0, 1]);
  const untilted = css(tilted, [0, 0, 1]);
  assert.ok(front[0] > untilted[0] + 0.2, `front should move right (${untilted[0]} -> ${front[0]})`);
});
