import assert from "node:assert/strict";
import test from "node:test";
import { createLocalBackend, type SolveRecord } from "./backend";

function memoryStorage() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
  Object.assign(globalThis, { localStorage: storage, window: globalThis });
  storage.clear();
}

function solve(name: string, timeMs: number | null, onBoard: boolean): Omit<SolveRecord, "id" | "at"> {
  return {
    name,
    timeMs,
    scramble: "R U R' U'",
    moves: "U R U' R'",
    moveCount: 4,
    onBoard,
  };
}

test("two people keep their own solves and share one leaderboard", async () => {
  memoryStorage();
  const first = createLocalBackend();
  const second = createLocalBackend();
  first.subscribe(() => undefined);
  second.subscribe(() => undefined);

  await assert.rejects(() => first.saveSolve(solve("Guest", 2000, true)), /leaderboard/);
  await first.saveSolve(solve("Guest", null, false));
  assert.equal((await first.leaderboard()).length, 0);
  assert.equal((await first.mySolves()).length, 1);

  await first.register("ada@example.com", "password1", "Ada");
  await first.saveSolve(solve("Ada", 4200, true));
  await first.saveSolve(solve("Ada", null, false));
  await first.signOut();

  await second.register("ben@example.com", "password2", "Ben");
  await second.saveSolve(solve("Ben", 6100, true));
  await second.saveSolve(solve("Ben", null, false));

  const board = await second.leaderboard();
  assert.deepEqual(board.map((entry) => [entry.name, entry.timeMs]), [
    ["Ada", 4200],
    ["Ben", 6100],
  ]);
  assert.deepEqual(
    (await first.leaderboard()).map((entry) => entry.timeMs),
    board.map((entry) => entry.timeMs),
  );

  const ben = await second.mySolves();
  assert.equal(ben.every((entry) => entry.name === "Ben"), true);
  assert.equal(ben.some((entry) => entry.timeMs === null), true);
  assert.equal(ben.some((entry) => entry.name === "Ada"), false);

  await second.signOut();
  await assert.rejects(() => second.signIn("ada@example.com", "wrong-password"), /did not match/);
  await second.signIn("ada@example.com", "password1");
  const ada = await second.mySolves();
  assert.equal(ada.some((entry) => entry.name === "Ada" && entry.onBoard), true);
  assert.equal(ada.some((entry) => entry.name === "Ben"), false);
  assert.equal((await second.leaderboard()).map((entry) => entry.name).join(","), "Ada,Ben");
});

test("account names and duplicate emails are rejected", async () => {
  memoryStorage();
  const backend = createLocalBackend();
  await assert.rejects(() => backend.register("a@example.com", "short", "Al"), /8 characters/);
  await assert.rejects(() => backend.register("a@example.com", "password1", "A"), /display name/);
  await backend.register("a@example.com", "password1", "Ada");
  await assert.rejects(() => backend.register("A@example.com", "password1", "Ada"), /already has an account/);
});
