"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBackend, firebasePublicConfig, type AppUser, type Backend, type SolveRecord } from "../lib/backend";
import {
  applyMove,
  formatMove,
  invertMove,
  isSolved,
  movesToPutColorOn,
  parseAlg,
  parseMove,
  replaySolved,
  restingCube,
  scrambleAlg,
  type CubeState,
} from "../lib/cube";
import { nextHint, stageOf, STAGE_ORDER, type Hint, type Stage } from "../lib/hints";
import { DEFAULT_PALETTE, namesOf, paletteOk, PRESETS, type Palette } from "../lib/palette";
import { formatTime, formatWhen } from "../lib/time";
import { LESSONS, REFERENCES } from "../lib/tutorial";
import { HOME_VIEW } from "../lib/view";
import { CubeScene } from "./CubeScene";

type Phase = "idle" | "scrambling" | "ready" | "solving" | "solved";
type Tab = "solve" | "learn" | "board" | "you";

interface Job {
  move: string;
  record: boolean;
  duration: number;
}

const STAGE_LABEL: Record<Stage, string> = {
  orient: "Yellow on top",
  cross: "Cross",
  corners: "Corners",
  middle: "Middle",
  "yellow-cross": "Yellow cross",
  "yellow-face": "Yellow face",
  "permute-corners": "Corners",
  "permute-edges": "Edges",
  solved: "Solved",
};

const MOVE_ROWS = ["U", "D", "L", "R", "F", "B"] as const;
const TURN_MS = 460;

export function CubeApp() {
  const backend = useMemo<Backend>(() => createBackend(), []);
  const cubeRef = useRef<CubeState>(restingCube());
  const phaseRef = useRef<Phase>("idle");
  const queueRef = useRef<Job[]>([]);
  const jobRef = useRef<Job | null>(null);
  const trackRef = useRef(true);
  const startedRef = useRef<number | null>(null);

  const [cube, setCube] = useState<CubeState>(cubeRef.current);
  const [anim, setAnim] = useState<{ move: string; duration: number; token: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [scramble, setScramble] = useState<string | null>(null);
  const [solution, setSolution] = useState<string[]>([]);
  const [track, setTrack] = useState(true);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finalMs, setFinalMs] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [tab, setTab] = useState<Tab>("solve");
  const [hint, setHint] = useState<Hint | null>(null);
  const [explainHint, setExplainHint] = useState(false);
  const [hinting, setHinting] = useState(false);
  const [palette, setPalette] = useState<Palette>(DEFAULT_PALETTE);
  const [camera, setCamera] = useState(HOME_VIEW);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [user, setUser] = useState<AppUser | null>(null);
  const [board, setBoard] = useState<SolveRecord[]>([]);
  const [history, setHistory] = useState<SolveRecord[]>([]);
  const [status, setStatus] = useState("");
  const [boardName, setBoardName] = useState("");

  useEffect(() => {
    const saved = document.documentElement.dataset.theme;
    setTheme(saved === "light" ? "light" : "dark");
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("faceturn-palette");
    const tracking = localStorage.getItem("faceturn-track");
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as unknown;
        if (paletteOk(parsed)) setPalette(parsed);
      } catch {
        /* keep the classic colors */
      }
    }
    if (tracking === "off") {
      trackRef.current = false;
      setTrack(false);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("faceturn-palette", JSON.stringify(palette));
  }, [palette]);

  useEffect(() => backend.subscribe(setUser), [backend]);

  useEffect(() => {
    if (!user || user.guest) return;
    let cancel = false;
    backend.loadColors().then((saved) => {
      if (!cancel && saved) setPalette(saved);
    }).catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [backend, user]);

  useEffect(() => {
    if (!running || startedAt === null) return;
    let frame = 0;
    const loop = () => {
      setNow(performance.now());
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [running, startedAt]);

  const refreshLists = useCallback(async () => {
    try {
      const [nextBoard, nextHistory] = await Promise.all([backend.leaderboard(), backend.mySolves()]);
      setBoard(nextBoard);
      setHistory(nextHistory);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load solves.");
    }
  }, [backend]);

  useEffect(() => {
    if (tab === "board" || tab === "you") void refreshLists();
  }, [tab, refreshLists, user]);

  function setPhaseBoth(next: Phase) {
    phaseRef.current = next;
    setPhase(next);
  }

  const pump = useCallback(() => {
    if (jobRef.current || queueRef.current.length === 0) return;
    const job = queueRef.current.shift();
    if (!job) return;
    jobRef.current = job;
    setAnim({ move: job.move, duration: job.duration, token: Date.now() + Math.random() });
  }, []);

  const finishAnim = useCallback(() => {
    const job = jobRef.current;
    jobRef.current = null;
    setAnim(null);
    if (!job) return;
    const next = applyMove(cubeRef.current, job.move);
    cubeRef.current = next;
    setCube(next);
    if (job.record) {
      setSolution((previous) => [...previous, job.move]);
      if (phaseRef.current === "ready") {
        setPhaseBoth("solving");
        if (trackRef.current) {
          const start = performance.now();
          startedRef.current = start;
          setStartedAt(start);
          setRunning(true);
        }
      }
      if (isSolved(next) && (phaseRef.current === "solving" || phaseRef.current === "ready")) {
        const elapsed = startedRef.current === null ? null : performance.now() - startedRef.current;
        setRunning(false);
        setFinalMs(trackRef.current ? elapsed : null);
        setPhaseBoth("solved");
      }
    } else if (queueRef.current.length === 0 && phaseRef.current === "scrambling") {
      setPhaseBoth("ready");
    }
    pump();
  }, [pump]);

  function enqueue(alg: string, duration: number, record?: boolean) {
    const shouldRecord = record ?? (phaseRef.current === "ready" || phaseRef.current === "solving");
    const moves = parseAlg(alg).map((move) => formatMove(move));
    if (moves.length === 0) return;
    queueRef.current.push(...moves.map((move) => ({ move, record: shouldRecord, duration })));
    pump();
  }

  function busy() {
    return jobRef.current !== null || queueRef.current.length > 0;
  }

  function dealScramble() {
    if (busy()) return;
    const alg = scrambleAlg(20);
    cubeRef.current = restingCube();
    setCube(cubeRef.current);
    setScramble(alg);
    setSolution([]);
    setFinalMs(null);
    setRunning(false);
    setStartedAt(null);
    startedRef.current = null;
    setHint(null);
    setExplainHint(false);
    setPhaseBoth("scrambling");
    enqueue(alg, prefersReduced() ? 16 : 140, false);
  }

  function resetCube() {
    queueRef.current = [];
    jobRef.current = null;
    setAnim(null);
    cubeRef.current = restingCube();
    setCube(cubeRef.current);
    setScramble(null);
    setSolution([]);
    setFinalMs(null);
    setRunning(false);
    setStartedAt(null);
    startedRef.current = null;
    setHint(null);
    setStatus("");
    setPhaseBoth("idle");
  }

  function undo() {
    if (busy() || solution.length === 0) return;
    const last = solution[solution.length - 1];
    const next = applyMove(cubeRef.current, formatMove(invertMove(parseMove(last))));
    cubeRef.current = next;
    setCube(next);
    const remaining = solution.slice(0, -1);
    setSolution(remaining);
    setHint(null);
    if (remaining.length === 0 && scramble) {
      setRunning(false);
      setStartedAt(null);
      startedRef.current = null;
      setFinalMs(null);
      setPhaseBoth("ready");
      return;
    }
    if (phase === "solved") {
      setPhaseBoth("solving");
      setFinalMs(null);
      if (trackRef.current && finalMs !== null) {
        const start = performance.now() - finalMs;
        startedRef.current = start;
        setStartedAt(start);
        setRunning(true);
      }
    }
  }

  function askHint() {
    setHinting(true);
    window.setTimeout(() => {
      setHint(nextHint(cubeRef.current, namesOf(palette)));
      setExplainHint(false);
      setHinting(false);
    }, 20);
  }

  async function publish(onBoard: boolean) {
    if (!scramble || phase !== "solved") return;
    const moves = solution.join(" ");
    if (!replaySolved(scramble, moves)) {
      setStatus("That solve did not replay. Scramble again and the timer will keep a clean record.");
      return;
    }
    const name = (boardName || user?.name || "").trim();
    const timed = track && finalMs !== null;
    if (onBoard && (!timed || finalMs === null || finalMs < 1000)) {
      setStatus("Leaderboard times start at 1.00 so an accidental tap stays off the board.");
      return;
    }
    try {
      await backend.saveSolve({
        name,
        timeMs: timed ? Math.round(finalMs ?? 0) : null,
        scramble,
        moves,
        moveCount: solution.length,
        onBoard: onBoard && timed,
      });
      if (!user?.guest) await backend.saveColors(palette);
      setStatus(onBoard ? "Added to the leaderboard." : "Saved with your solves.");
      await refreshLists();
      setTab(onBoard ? "board" : "you");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save that solve.");
    }
  }

  function updatePalette(next: Palette) {
    setPalette(next);
    if (user && !user.guest) void backend.saveColors(next).catch(() => undefined);
  }

  function orient(color: "U" | "D", face: "U" | "D") {
    if (jobRef.current || queueRef.current.length > 0) return;
    const alg = movesToPutColorOn(cubeRef.current, color, face);
    if (alg) enqueue(alg, prefersReduced() ? 16 : TURN_MS);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : "";
      if ("urfdlb".includes(key)) {
        event.preventDefault();
        const suffix = event.altKey ? "2" : event.shiftKey ? "'" : "";
        enqueue(`${key.toUpperCase()}${suffix}`, prefersReduced() ? 16 : TURN_MS);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const elapsed = finalMs ?? (running && startedAt !== null ? now - startedAt : 0);
  const stage = stageOf(cube);

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <p className="mark">Rubik's Cube</p>
          <h1>Solve a 3×3, with a hint when you want one.</h1>
        </div>
        <div className="top-actions">
          <button
            type="button"
            className="theme-toggle"
            aria-pressed={theme === "dark"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            onClick={() => {
              const next = theme === "dark" ? "light" : "dark";
              setTheme(next);
              document.documentElement.dataset.theme = next;
              localStorage.setItem("faceturn-theme", next);
            }}
          >
            {theme === "dark" ? <MoonIcon /> : <SunIcon />}
          </button>
          <button type="button" className="who" onClick={() => setTab("you")}>
            <span>{user?.guest ? "Guest" : user?.name ?? "Guest"}</span>
            <small>{user?.guest || !user ? "Guest session" : user.email || user.provider}</small>
          </button>
        </div>
      </header>

      {backend.mode === "local" ? (
        <p className="banner">
          {firebasePublicConfig()
            ? `Firebase project ${firebasePublicConfig()?.projectId} is connected, but sign-in is still off, so solves stay in this browser.`
            : "Firebase is not connected, so guest solves and the leaderboard stay in this browser. GitHub sign-in starts working when the Firebase project is connected."}
        </p>
      ) : null}

      <div className="layout">
        <section className={`play ${tab === "solve" ? "with-solve" : ""}`}>
          {tab === "solve" ? (
            <div className="solve-side">
              <label className="track">
                <input
                  type="checkbox"
                  checked={track}
                  onChange={(event) => {
                    trackRef.current = event.target.checked;
                    setTrack(event.target.checked);
                    localStorage.setItem("faceturn-track", event.target.checked ? "on" : "off");
                    if (!event.target.checked) {
                      setRunning(false);
                      setFinalMs(null);
                    }
                  }}
                />
                <span>Time this solve</span>
              </label>
              <p className={`clock ${phase === "solved" ? "done" : ""}`} aria-live="polite">
                {track || finalMs !== null ? formatTime(elapsed) : "—"}
              </p>
              <p className="phase-line">
                {phase === "idle" && "Scramble when you want a timed solve."}
                {phase === "scrambling" && "Scrambling…"}
                {phase === "ready" && (track ? "Timer starts on your first turn." : "Timer is off for this solve.")}
                {phase === "solving" && `${solution.length} ${solution.length === 1 ? "move" : "moves"}`}
                {phase === "solved" && (track && finalMs !== null ? `Solved in ${formatTime(finalMs)}` : "Solved")}
              </p>
              <div className="row">
                <button type="button" className="primary" onClick={dealScramble}>Scramble</button>
                <button type="button" onClick={undo} disabled={solution.length === 0}>Undo</button>
                <button type="button" onClick={resetCube}>Reset</button>
              </div>
              {scramble ? <p className="scramble">{scramble}</p> : null}
              <div className="dots" aria-hidden="true">
                {STAGE_ORDER.map((item) => (
                  <span key={item} className={stage === "solved" || STAGE_ORDER.indexOf(item) < STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number]) ? "dot filled" : stage === item ? "dot now" : "dot"} title={STAGE_LABEL[item]} />
                ))}
              </div>
              <p className="stage-name">{stage === "solved" ? "Solved" : STAGE_LABEL[stage]}</p>
              <button type="button" onClick={askHint} disabled={hinting || stage === "solved"}>
                {hinting ? "Looking…" : hint ? "Another hint" : "I'm stuck"}
              </button>
              {hint && stage !== "solved" ? (
                <p className="hint-note">An arrow on the cube shows the next move.</p>
              ) : null}
              {hint && stage !== "solved" && hint.algorithm ? (
                <div className="row">
                  <button type="button" onClick={() => setExplainHint((open) => !open)}>{explainHint ? "Hide the words" : "Explain"}</button>
                  <button type="button" onClick={() => enqueue(hint.algorithm, prefersReduced() ? 16 : TURN_MS)}>Play it</button>
                </div>
              ) : null}
              {explainHint && hint && stage !== "solved" ? (
                <article className="hint">
                  <h2>{hint.title}</h2>
                  <p>{hint.progress}</p>
                  <p>{hint.detail}</p>
                  {hint.algorithm ? <p className="alg">{hint.algorithm}</p> : null}
                </article>
              ) : null}
              {phase === "solved" ? (
                <form
                  className="save-solve"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void publish(true);
                  }}
                >
                  <label>
                    Name on the board
                    <input value={boardName} onChange={(event) => setBoardName(event.target.value)} placeholder={user?.guest ? "Your name" : user?.name ?? "Your name"} maxLength={24} />
                  </label>
                  <div className="row">
                    <button type="submit" className="primary" disabled={!track || finalMs === null}>Add to leaderboard</button>
                    <button type="button" onClick={() => void publish(false)}>Save privately</button>
                  </div>
                </form>
              ) : null}
              {status ? <p className="status">{status}</p> : null}
            </div>
          ) : null}
          <div className="cube-column">
          <CubeScene
            cube={cube}
            palette={palette}
            anim={anim}
            hintMove={hint && stage !== "solved" ? hint.algorithm.split(/\s+/)[0] ?? "" : ""}
            onAnimEnd={finishAnim}
            onTurn={(move) => enqueue(move, prefersReduced() ? 16 : TURN_MS)}
            camera={camera}
            onCamera={setCamera}
          />
          <div className="move-pad" aria-label="Face turns">
            {MOVE_ROWS.map((face) => (
              <div key={face} className="move-row">
                <button type="button" onClick={() => enqueue(face, TURN_MS)}>{face}</button>
                <button type="button" onClick={() => enqueue(`${face}'`, TURN_MS)}>{face}′</button>
                <button type="button" onClick={() => enqueue(`${face}2`, TURN_MS)}>{face}2</button>
              </div>
            ))}
          </div>
          <div className="cube-turns">
            <button type="button" onClick={() => orient("D", "U")}>Yellow on top</button>
            <button type="button" onClick={() => orient("U", "D")}>White on bottom</button>
            <button type="button" onClick={() => enqueue("y'", TURN_MS)}>Turn left</button>
            <button type="button" onClick={() => enqueue("y", TURN_MS)}>Turn right</button>
            <button type="button" onClick={() => setCamera(HOME_VIEW)}>Reset view</button>
          </div>
          <p className="keys">Drag a sticker to turn that face. Drag outside the cube to look around. Keys U D L R F B, Shift for inverse, Alt for double.</p>
          </div>
        </section>

        <aside className="panel">
          <div className="tabs" role="tablist">
            {(["solve", "learn", "board", "you"] as Tab[]).map((item) => (
              <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? "on" : ""} onClick={() => setTab(item)}>
                {item === "solve" ? "Solve" : item === "learn" ? "Learn" : item === "board" ? "Leaderboard" : "You"}
              </button>
            ))}
          </div>

          {tab === "learn" ? (
            <div className="tab-body lessons">
              <p>This is the beginner layer-by-layer method: white on the bottom, yellow on top. The hint button uses these same moves.</p>
              {LESSONS.map((lesson) => (
                <article key={lesson.title}>
                  <h2>{lesson.title}</h2>
                  {lesson.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  {lesson.algorithm ? <p className="alg">{lesson.algorithm}</p> : null}
                </article>
              ))}
              <h2>Lessons other people use</h2>
              <ul className="refs">
                {REFERENCES.map((link) => (
                  <li key={link.href}>
                    <a href={link.href} target="_blank" rel="noreferrer">{link.title}</a>
                    <span>{link.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {tab === "board" ? (
            <div className="tab-body">
              <h2>Leaderboard</h2>
              <p>{backend.mode === "local" ? "Times saved in this browser." : "Times saved in Firebase."} A solve is added only after the cube is finished with the timer on.</p>
              {board.length === 0 ? <p>No times yet. Finish a timed scramble and add it.</p> : (
                <ol className="board">
                  {board.map((entry, index) => (
                    <li key={entry.id}>
                      <span>{index + 1}</span>
                      <strong>{entry.name}</strong>
                      <em>{entry.timeMs === null ? "—" : formatTime(entry.timeMs)}</em>
                      <small>{formatWhen(entry.at)} · {entry.moveCount} {entry.moveCount === 1 ? "move" : "moves"}</small>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : null}

          {tab === "you" ? (
            <AccountTab
              backend={backend}
              user={user}
              palette={palette}
              history={history}
              onPalette={updatePalette}
              onStatus={setStatus}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function prefersReduced(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function AccountTab({
  backend,
  user,
  palette,
  history,
  onPalette,
  onStatus,
}: {
  backend: Backend;
  user: AppUser | null;
  palette: Palette;
  history: SolveRecord[];
  onPalette: (palette: Palette) => void;
  onStatus: (message: string) => void;
}) {
  const [mode, setMode] = useState<"create" | "signin">("create");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      if (mode === "create") await backend.register(email, password, name);
      else await backend.signIn(email, password);
      setPassword("");
      setMessage(mode === "create" ? "Account saved." : "Signed in.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign in.");
    }
  }

  return (
    <div className="tab-body">
      <h2>{user?.guest ? "Guest" : user?.name ?? "You"}</h2>
      <p>
        {user?.guest
          ? "You can solve and post a time without an account. Create one if you want the solves kept under your name."
          : user
            ? "Solves below stay on this account."
            : "Starting a guest session…"}
      </p>
      {user && !user.guest ? (
        <button
          type="button"
          onClick={() => {
            void backend.signOut().then(() => setMessage("Signed out. You are a guest again.")).catch((error: unknown) => {
              onStatus(error instanceof Error ? error.message : "Could not sign out.");
            });
          }}
        >
          Sign out
        </button>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="account-form">
          <div className="row">
            <button type="button" className={mode === "create" ? "primary" : ""} onClick={() => setMode("create")}>Create account</button>
            <button type="button" className={mode === "signin" ? "primary" : ""} onClick={() => setMode("signin")}>Sign in</button>
          </div>
          {mode === "create" ? (
            <label>
              Display name
              <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={24} />
            </label>
          ) : null}
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete={mode === "create" ? "new-password" : "current-password"} />
          </label>
          <button type="submit" className="primary">{mode === "create" ? "Create account" : "Sign in"}</button>
          <button
            type="button"
            onClick={() => {
              void backend.signInGitHub().then(() => setMessage("Signed in with GitHub.")).catch((error: unknown) => {
                setMessage(error instanceof Error ? error.message : "GitHub sign-in failed.");
              });
            }}
          >
            Continue with GitHub
          </button>
        </form>
      )}
      {message ? <p className="status">{message}</p> : null}

      <h2>Colors</h2>
      <div className="presets">
        {PRESETS.map((preset) => (
          <button key={preset.id} type="button" onClick={() => onPalette(preset.palette)}>{preset.label}</button>
        ))}
      </div>
      <div className="colors">
        {(["U", "D", "F", "B", "L", "R"] as const).map((face) => (
          <label key={face}>
            <input
              aria-label={`${palette[face].name} color`}
              type="color"
              value={palette[face].hex}
              onChange={(event) => onPalette({ ...palette, [face]: { ...palette[face], hex: event.target.value } })}
            />
            <input
              aria-label={`${face} color name`}
              value={palette[face].name}
              maxLength={16}
              onChange={(event) => onPalette({ ...palette, [face]: { ...palette[face], name: event.target.value } })}
            />
          </label>
        ))}
      </div>
      <p className="fine">Hints use these names, so “white” follows whatever you call the first color.</p>

      <h2>Saved solves</h2>
      {history.length === 0 ? <p>No saved solves yet.</p> : (
        <ul className="history">
          {history.map((solve) => (
            <li key={solve.id}>
              <strong>{solve.timeMs === null ? "Untimed" : formatTime(solve.timeMs)}</strong>
              <span>{formatWhen(solve.at)} · {solve.moveCount} {solve.moveCount === 1 ? "move" : "moves"}{solve.onBoard ? " · on the board" : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SunIcon() {
  return (
    <svg className="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.1 5.1l1.6 1.6M17.3 17.3l1.6 1.6M18.9 5.1l-1.6 1.6M6.7 17.3l-1.6 1.6" />
      </g>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M14.5 3.2a8.2 8.2 0 1 0 6.3 13.2A7.2 7.2 0 0 1 14.5 3.2z" />
    </svg>
  );
}
