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
  type CubeOrder,
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
const TURN_MS = 160;

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
  const [order, setOrder] = useState<CubeOrder>(3);
  const orderRef = useRef<CubeOrder>(3);
  const [tab, setTab] = useState<Tab>("solve");
  const solveRef = useRef<HTMLElement>(null);
  const panelShellRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const skipPanelFocus = useRef(true);
  const [hint, setHint] = useState<Hint | null>(null);
  const hintRef = useRef<Hint | null>(null);
  const [hintLit, setHintLit] = useState(false);
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

  useEffect(() => {
    if (skipPanelFocus.current) {
      skipPanelFocus.current = false;
      return;
    }
    const section = tab === "solve" ? solveRef.current : panelShellRef.current;
    const focusTarget = tab === "solve" ? solveRef.current : panelRef.current;
    if (!section || !focusTarget) return;
    section.scrollIntoView({ behavior: "auto", block: "start" });
    focusTarget.focus({ preventScroll: true });
  }, [tab]);

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
    const hintedMove = hintRef.current?.algorithm.split(/\s+/)[0] ?? "";
    if (hintedMove && formatMove(parseMove(hintedMove)) === job.move) setHintLit(false);
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
    const shouldRecord = record ?? (phaseRef.current === "idle" || phaseRef.current === "ready" || phaseRef.current === "solving");
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
    const alg = scrambleAlg(orderRef.current === 2 ? 11 : orderRef.current === 4 ? 36 : 20, Math.random, orderRef.current);
    cubeRef.current = restingCube(orderRef.current);
    setCube(cubeRef.current);
    setScramble(alg);
    setSolution([]);
    setFinalMs(null);
    setRunning(false);
    setStartedAt(null);
    startedRef.current = null;
    rememberHint(null);
    setExplainHint(false);
    setPhaseBoth("scrambling");
    enqueue(alg, prefersReduced() ? 16 : 80, false);
  }

  function resetCube() {
    queueRef.current = [];
    jobRef.current = null;
    setAnim(null);
    cubeRef.current = restingCube(orderRef.current);
    setCube(cubeRef.current);
    setScramble(null);
    setSolution([]);
    setFinalMs(null);
    setRunning(false);
    setStartedAt(null);
    startedRef.current = null;
    rememberHint(null);
    setStatus("");
    setCamera(HOME_VIEW);
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
    rememberHint(null);
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
      rememberHint(nextHint(cubeRef.current, namesOf(palette)));
      setExplainHint(false);
      setHinting(false);
    }, 20);
  }

  async function publish(onBoard: boolean) {
    if (!scramble || phase !== "solved") return;
    const moves = solution.join(" ");
    if (!replaySolved(scramble, moves, orderRef.current)) {
      setStatus("That solve did not replay. Scramble again and the timer will keep a clean record.");
      return;
    }
    const name = (boardName || user?.name || "").trim();
    const timed = track && finalMs !== null;
    if (onBoard && (!user || user.guest)) {
      setStatus("Sign in to add a time to the leaderboard.");
      setTab("you");
      return;
    }
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

  function chooseSize(next: CubeOrder) {
    if (next === orderRef.current || jobRef.current || queueRef.current.length > 0) return;
    orderRef.current = next;
    setOrder(next);
    queueRef.current = [];
    jobRef.current = null;
    setAnim(null);
    cubeRef.current = restingCube(next);
    setCube(cubeRef.current);
    setScramble(null);
    setSolution([]);
    setFinalMs(null);
    setRunning(false);
    setStartedAt(null);
    startedRef.current = null;
    rememberHint(null);
    setExplainHint(false);
    setStatus("");
    setCamera(HOME_VIEW);
    setPhaseBoth("idle");
  }

  function rememberHint(next: Hint | null) {
    hintRef.current = next;
    setHint(next);
    setHintLit(Boolean(next?.algorithm));
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
  const hintMove = hint && hintLit && stage !== "solved" ? hint.algorithm.split(/\s+/)[0] ?? "" : "";
  function hinted(token: string) {
    return hintMove === token ? "hinted" : "";
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <p className="mark">Rubik's Cube</p>
          <div className="title-line">
            <h1>Solve a cube</h1>
            <div className="size-switch" role="group" aria-label="Cube size">
              {([2, 3, 4] as const).map((size) => (
                <button key={size} type="button" className={order === size ? "on" : ""} onClick={() => chooseSize(size)}>
                  {size}×{size}
                </button>
              ))}
            </div>
          </div>
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
        <section ref={solveRef} tabIndex={-1} className="play with-solve">
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
              {order === 3 ? (
                <div className="dots" aria-hidden="true">
                  {STAGE_ORDER.map((item) => (
                    <span key={item} className={stage === "solved" || STAGE_ORDER.indexOf(item) < STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number]) ? "dot filled" : stage === item ? "dot now" : "dot"} title={STAGE_LABEL[item]} />
                  ))}
                </div>
              ) : null}
              <p className="stage-name">{stage === "solved" ? "Solved" : order === 3 ? STAGE_LABEL[stage] : hint?.title || "In progress"}</p>
              <button type="button" onClick={askHint} disabled={hinting || stage === "solved"}>
                {hinting ? "Looking…" : hint ? "Another hint" : "I'm stuck"}
              </button>
              {hint && stage !== "solved" && hintMove ? (
                <p className="hint-note">The highlighted notation is the next move.</p>
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
                user && !user.guest ? (
                <form
                  className="save-solve"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void publish(true);
                  }}
                >
                  <label>
                    Name on the board
                    <input value={boardName} onChange={(event) => setBoardName(event.target.value)} placeholder={user.name} maxLength={24} />
                  </label>
                  <div className="row">
                    <button type="submit" className="primary" disabled={!track || finalMs === null}>Add to leaderboard</button>
                    <button type="button" onClick={() => void publish(false)}>Save privately</button>
                  </div>
                </form>
                ) : (
                <div className="save-solve">
                  <p>Sign in to put this time on the leaderboard.</p>
                  <div className="row">
                    <button type="button" className="primary" onClick={() => setTab("you")}>Sign in</button>
                    <button type="button" onClick={() => void publish(false)}>Save privately</button>
                  </div>
                </div>
                )
              ) : null}
              {status ? <p className="status">{status}</p> : null}
            </div>
          <div className="cube-column">
          <div className="cube-row">
          <div className="cube-stack">
          <CubeScene
            cube={cube}
            palette={palette}
            anim={anim}
            onAnimEnd={finishAnim}
            onTurn={(move, duration) => enqueue(move, duration ?? (prefersReduced() ? 16 : TURN_MS))}
            camera={camera}
            onCamera={setCamera}
          />
          <div className="move-pad" aria-label="Face turns">
            {MOVE_ROWS.map((face) => (
              <div key={face} className="move-row">
                <button type="button" className={hinted(face)} onClick={() => enqueue(face, TURN_MS)}>{face}</button>
                <button type="button" className={hinted(`${face}'`)} onClick={() => enqueue(`${face}'`, TURN_MS)}>{face}′</button>
                <button type="button" className={hinted(`${face}2`)} onClick={() => enqueue(`${face}2`, TURN_MS)}>{face}2</button>
              </div>
            ))}
          </div>
          {order === 4 ? (
            <div className="move-pad inner-pad" aria-label="Inner slices">
              {MOVE_ROWS.map((face) => (
                <div key={face} className="move-row">
                  <button type="button" className={hinted(face.toLowerCase())} onClick={() => enqueue(face.toLowerCase(), TURN_MS)}>{face.toLowerCase()}</button>
                  <button type="button" className={hinted(`${face.toLowerCase()}'`)} onClick={() => enqueue(`${face.toLowerCase()}'`, TURN_MS)}>{face.toLowerCase()}′</button>
                  <button type="button" className={hinted(`${face.toLowerCase()}2`)} onClick={() => enqueue(`${face.toLowerCase()}2`, TURN_MS)}>{face.toLowerCase()}2</button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="cube-turns">
            <button type="button" onClick={() => orient("D", "U")}>Yellow on top</button>
            <button type="button" onClick={() => orient("U", "D")}>White on bottom</button>
            <button type="button" className={hinted("y'")} onClick={() => enqueue("y'", TURN_MS)}>Turn left</button>
            <button type="button" className={hinted("y")} onClick={() => enqueue("y", TURN_MS)}>Turn right</button>
            <button type="button" onClick={() => setCamera(HOME_VIEW)}>Reset view</button>
          </div>
          <p className="keys">Drag a sticker to turn that face. Drag outside the cube to look around. Keys U D L R F B, Shift for inverse, Alt for double.</p>
          </div>
          <aside className="turn-log" aria-label="Turn history">
            <h2>Turns</h2>
            {solution.length === 0 ? <p>No turns yet.</p> : (
              <ol>
                {turnsForLog(solution).map((move, index) => (
                  <li key={`${index}-${move}`}>{move.replaceAll("'", "′")}</li>
                ))}
              </ol>
            )}
          </aside>
          </div>
          </div>
        </section>

        <aside ref={panelShellRef} className="panel">
          <div className="tabs" role="tablist">
            {(["solve", "learn", "board", "you"] as Tab[]).map((item) => (
              <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? "on" : ""} onClick={() => setTab(item)}>
                {item === "solve" ? "Solve" : item === "learn" ? "Learn" : item === "board" ? "Leaderboard" : "You"}
              </button>
            ))}
          </div>

          {tab === "learn" ? (
            <div ref={panelRef} tabIndex={-1} className="tab-body lessons">
              <p className="learn-lead">This is the beginner layer-by-layer method: white on the bottom, yellow on top. The hint button uses these same moves.</p>
              <aside className="notation">
                <h2>What the letters mean</h2>
                <ul className="notation-faces">
                  <li><strong>U</strong> up</li>
                  <li><strong>D</strong> down</li>
                  <li><strong>L</strong> left</li>
                  <li><strong>R</strong> right</li>
                  <li><strong>F</strong> front</li>
                  <li><strong>B</strong> back</li>
                </ul>
                <p><strong>U</strong> clockwise · <strong>U′</strong> counter-clockwise · <strong>U2</strong> rotate twice</p>
              </aside>
              <details className="lesson-group" open>
                <summary>Text tutorials</summary>
                {LESSONS.map((lesson) => (
                  <article key={lesson.title}>
                    <details>
                      <summary>{lesson.title}</summary>
                      {lesson.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                      {lesson.algorithm ? <p className="alg">{lesson.algorithm}</p> : null}
                    </details>
                  </article>
                ))}
                <ul className="refs">
                  {REFERENCES.filter((link) => !link.videoId).map((link) => (
                    <li key={link.href}>
                      <a href={link.href} target="_blank" rel="noreferrer">{link.title}</a>
                      <span>{link.note}</span>
                    </li>
                  ))}
                </ul>
              </details>
              <details className="lesson-group" open>
                <summary>Video tutorials</summary>
                <div className="video-list">
                  {REFERENCES.filter((link) => link.videoId).map((link) => (
                    <a key={link.href} className="video-card" href={link.href} target="_blank" rel="noreferrer">
                      <img src={`https://i.ytimg.com/vi/${link.videoId}/hqdefault.jpg`} alt="" width={168} height={94} />
                      <span>
                        <strong>{link.title}</strong>
                        <span>{link.note}</span>
                      </span>
                    </a>
                  ))}
                </div>
              </details>
            </div>
          ) : null}

          {tab === "board" ? (
            <div ref={panelRef} tabIndex={-1} className="tab-body">
              <h2>Leaderboard</h2>
              <p>{backend.mode === "local" ? "Times saved in this browser." : "Times saved in Firebase."} A solve is added only after the cube is finished with the timer on, and only from a signed-in account.</p>
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
            <div ref={panelRef} tabIndex={-1} className="you-panel">
            <AccountTab
              backend={backend}
              user={user}
              palette={palette}
              history={history}
              onPalette={updatePalette}
              onStatus={setStatus}
            />
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function turnsForLog(moves: string[]): string[] {
  const shown: string[] = [];
  for (let index = 0; index < moves.length; index += 1) {
    const move = moves[index];
    if (moves[index + 1] === move && !move.endsWith("2") && !move.endsWith("'") && !move.endsWith("’")) {
      shown.push(`${move.replace(/['’]/g, "")}2`);
      index += 1;
      continue;
    }
    shown.push(move);
  }
  return shown;
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
          ? "You can practice as a guest. Sign in before a time can go on the leaderboard."
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
              type="text"
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
