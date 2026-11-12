import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  EmailAuthProvider,
  GithubAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  linkWithCredential,
  linkWithPopup,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type Auth,
  type User,
} from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import { paletteOk, type Palette } from "./palette";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  guest: boolean;
  provider: "guest" | "password" | "github";
}

export interface SolveRecord {
  id: string;
  name: string;
  timeMs: number | null;
  scramble: string;
  moves: string;
  moveCount: number;
  at: number;
  onBoard: boolean;
}

export interface Backend {
  mode: "firebase" | "local";
  subscribe(listener: (user: AppUser | null) => void): () => void;
  register(email: string, password: string, name: string): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signInGitHub(): Promise<void>;
  signOut(): Promise<void>;
  saveColors(palette: Palette): Promise<void>;
  loadColors(): Promise<Palette | null>;
  saveSolve(input: Omit<SolveRecord, "id" | "at">): Promise<void>;
  mySolves(): Promise<SolveRecord[]>;
  leaderboard(): Promise<SolveRecord[]>;
}

export function firebasePublicConfig(): Record<string, string> | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() ?? "";
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() ?? "";
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ?? "";
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim() ?? "";
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  const config: Record<string, string> = { apiKey, authDomain, projectId, appId };
  const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
  const sender = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim();
  if (bucket) config.storageBucket = bucket;
  if (sender) config.messagingSenderId = sender;
  return config;
}

function friendly(error: unknown): Error {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const text: Record<string, string> = {
    "auth/operation-not-allowed": "That sign-in method is turned off in the Firebase console.",
    "auth/popup-blocked": "The browser blocked the GitHub window. Allow popups and try again.",
    "auth/popup-closed-by-user": "The GitHub window was closed before it finished.",
    "auth/account-exists-with-different-credential": "That email already belongs to a different sign-in method.",
    "auth/credential-already-in-use": "That GitHub account is already registered. Sign in with GitHub instead of linking it.",
    "auth/email-already-in-use": "That email already has an account. Sign in instead.",
    "auth/invalid-credential": "Email or password did not match.",
    "auth/invalid-email": "That email address does not look valid.",
    "auth/weak-password": "Use at least 8 characters.",
    "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
  };
  if (code && text[code]) return new Error(text[code]);
  if (error instanceof Error && error.message) return error;
  return new Error("Something went wrong. Try again.");
}

function asUser(user: User): AppUser {
  const github = user.providerData.some((provider) => provider.providerId === "github.com");
  const password = user.providerData.some((provider) => provider.providerId === "password");
  return {
    id: user.uid,
    name: user.displayName?.trim() || (user.isAnonymous ? "Guest" : "Solver"),
    email: user.email ?? "",
    guest: user.isAnonymous,
    provider: user.isAnonymous ? "guest" : github ? "github" : password ? "password" : "guest",
  };
}

let firebaseApp: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

function services() {
  const config = firebasePublicConfig();
  if (!config) throw new Error("Firebase is not configured.");
  firebaseApp ??= initializeApp(config);
  auth ??= getAuth(firebaseApp);
  db ??= getFirestore(firebaseApp);
  return { auth, db };
}

function cleanName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length < 2 || trimmed.length > 24) throw new Error("Use a display name between 2 and 24 characters.");
  return trimmed;
}

async function remember(user: User, name: string, palette?: Palette): Promise<void> {
  const { db: database } = services();
  await setDoc(
    doc(database, "users", user.uid),
    {
      name,
      guest: user.isAnonymous,
      ...(palette ? { colors: palette } : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function createFirebaseBackend(): Backend {
  return {
    mode: "firebase",
    subscribe(listener) {
      const { auth: current } = services();
      let stop = false;
      const unsub = onAuthStateChanged(current, (user) => {
        if (stop) return;
        if (user) {
          listener(asUser(user));
          return;
        }
        signInAnonymously(current).catch((error: unknown) => {
          console.error(friendly(error).message);
          listener(null);
        });
      });
      return () => {
        stop = true;
        unsub();
      };
    },
    async register(email, password, name) {
      try {
        const { auth: current } = services();
        const display = cleanName(name);
        if (password.length < 8) throw new Error("Use at least 8 characters.");
        const user = current.currentUser;
        if (user?.isAnonymous) {
          const credential = EmailAuthProvider.credential(email.trim(), password);
          const linked = await linkWithCredential(user, credential);
          await updateProfile(linked.user, { displayName: display });
          await remember(linked.user, display);
          return;
        }
        const created = await createUserWithEmailAndPassword(current, email.trim(), password);
        await updateProfile(created.user, { displayName: display });
        await remember(created.user, display);
      } catch (error) {
        throw friendly(error);
      }
    },
    async signIn(email, password) {
      try {
        const { auth: current } = services();
        const signed = await signInWithEmailAndPassword(current, email.trim(), password);
        if (signed.user.displayName) await remember(signed.user, signed.user.displayName);
      } catch (error) {
        throw friendly(error);
      }
    },
    async signInGitHub() {
      try {
        const { auth: current } = services();
        const provider = new GithubAuthProvider();
        const user = current.currentUser;
        const result =
          user?.isAnonymous ? await linkWithPopup(user, provider) : await signInWithPopup(current, provider);
        const name = result.user.displayName?.trim() || "GitHub solver";
        await updateProfile(result.user, { displayName: name });
        await remember(result.user, name);
      } catch (error) {
        throw friendly(error);
      }
    },
    async signOut() {
      try {
        const { auth: current } = services();
        await signOut(current);
        await signInAnonymously(current);
      } catch (error) {
        throw friendly(error);
      }
    },
    async saveColors(palette) {
      const { auth: current } = services();
      const user = current.currentUser;
      if (!user || user.isAnonymous) return;
      await remember(user, user.displayName?.trim() || "Solver", palette);
    },
    async loadColors() {
      const { auth: current, db: database } = services();
      const user = current.currentUser;
      if (!user) return null;
      const snap = await getDoc(doc(database, "users", user.uid));
      const colors = snap.data()?.colors;
      return paletteOk(colors) ? colors : null;
    },
    async saveSolve(input) {
      const { auth: current, db: database } = services();
      const user = current.currentUser;
      if (!user) throw new Error("Sign in with an account first.");
      if (input.onBoard && user.isAnonymous) {
        throw new Error("Sign in to add a time to the leaderboard.");
      }
      const name = cleanName(input.name);
      const payload = {
        name,
        timeMs: input.timeMs,
        scramble: input.scramble.slice(0, 200),
        moves: input.moves.slice(0, 2000),
        moveCount: input.moveCount,
        at: Date.now(),
        onBoard: input.onBoard,
        uid: user.uid,
      };
      await setDoc(doc(database, "users", user.uid), { name, guest: user.isAnonymous, updatedAt: serverTimestamp() }, { merge: true });
      await addDoc(collection(database, "users", user.uid, "solves"), payload);
      if (input.onBoard && input.timeMs !== null) {
        await addDoc(collection(database, "leaderboard"), payload);
      }
    },
    async mySolves() {
      const { auth: current, db: database } = services();
      const user = current.currentUser;
      if (!user) return [];
      const snap = await getDocs(query(collection(database, "users", user.uid, "solves"), orderBy("at", "desc"), limit(40)));
      return snap.docs.map((item) => readSolve(item.id, item.data()));
    },
    async leaderboard() {
      const { db: database } = services();
      const snap = await getDocs(query(collection(database, "leaderboard"), orderBy("timeMs", "asc"), limit(50)));
      return snap.docs.map((item) => readSolve(item.id, item.data())).filter((item) => item.timeMs !== null);
    },
  };
}

function readSolve(id: string, data: Record<string, unknown>): SolveRecord {
  return {
    id,
    name: typeof data.name === "string" ? data.name : "Solver",
    timeMs: typeof data.timeMs === "number" && data.timeMs > 0 ? data.timeMs : null,
    scramble: typeof data.scramble === "string" ? data.scramble : "",
    moves: typeof data.moves === "string" ? data.moves : "",
    moveCount: typeof data.moveCount === "number" ? data.moveCount : 0,
    at: typeof data.at === "number" ? data.at : Date.now(),
    onBoard: data.onBoard === true,
  };
}

const LOCAL_KEY = "faceturn-local-v1";

interface LocalState {
  users: { id: string; email: string; name: string; salt: string; hash: string }[];
  session: string | null;
  solves: (SolveRecord & { owner: string })[];
  colors: Record<string, Palette>;
}

function blankLocal(): LocalState {
  return { users: [], session: null, solves: [], colors: {} };
}

function readLocal(): LocalState {
  if (typeof window === "undefined") return blankLocal();
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "") as LocalState;
    if (!parsed || !Array.isArray(parsed.users) || !Array.isArray(parsed.solves)) return blankLocal();
    return parsed;
  } catch {
    return blankLocal();
  }
}

function writeLocal(state: LocalState) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
}

async function digest(salt: string, password: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${password}`));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createLocalBackend(): Backend {
  const listeners = new Set<(user: AppUser | null) => void>();
  let guest: AppUser = {
    id: `guest-${Math.random().toString(36).slice(2, 10)}`,
    name: "Guest",
    email: "",
    guest: true,
    provider: "guest",
  };

  function current(): AppUser {
    const state = readLocal();
    const account = state.users.find((user) => user.id === state.session);
    if (!account) return guest;
    return { id: account.id, name: account.name, email: account.email, guest: false, provider: "password" };
  }

  function emit() {
    const user = current();
    listeners.forEach((listener) => listener(user));
  }

  return {
    mode: "local",
    subscribe(listener) {
      listeners.add(listener);
      listener(current());
      return () => listeners.delete(listener);
    },
    async register(email, password, name) {
      const display = cleanName(name);
      if (password.length < 8) throw new Error("Use at least 8 characters.");
      const state = readLocal();
      if (state.users.some((user) => user.email.toLowerCase() === email.trim().toLowerCase())) {
        throw new Error("That email already has an account. Sign in instead.");
      }
      const salt = crypto.randomUUID();
      const id = crypto.randomUUID();
      state.users.push({ id, email: email.trim(), name: display, salt, hash: await digest(salt, password) });
      const owned = state.solves.filter((solve) => solve.owner === guest.id);
      owned.forEach((solve) => {
        solve.owner = id;
      });
      state.session = id;
      if (state.colors[guest.id]) state.colors[id] = state.colors[guest.id];
      writeLocal(state);
      emit();
    },
    async signIn(email, password) {
      const state = readLocal();
      const account = state.users.find((user) => user.email.toLowerCase() === email.trim().toLowerCase());
      if (!account || (await digest(account.salt, password)) !== account.hash) {
        throw new Error("Email or password did not match.");
      }
      state.session = account.id;
      writeLocal(state);
      emit();
    },
    async signInGitHub() {
      throw new Error("GitHub sign-in runs through Firebase. Connect the Firebase project to use it.");
    },
    async signOut() {
      const state = readLocal();
      state.session = null;
      writeLocal(state);
      guest = { id: `guest-${Math.random().toString(36).slice(2, 10)}`, name: "Guest", email: "", guest: true, provider: "guest" };
      emit();
    },
    async saveColors(palette) {
      const state = readLocal();
      state.colors[current().id] = palette;
      writeLocal(state);
    },
    async loadColors() {
      const colors = readLocal().colors[current().id];
      return paletteOk(colors) ? colors : null;
    },
    async saveSolve(input) {
      if (input.onBoard && current().guest) {
        throw new Error("Sign in to add a time to the leaderboard.");
      }
      const name = cleanName(input.name);
      const state = readLocal();
      state.solves.push({
        id: crypto.randomUUID(),
        owner: current().id,
        name,
        timeMs: input.timeMs,
        scramble: input.scramble,
        moves: input.moves,
        moveCount: input.moveCount,
        at: Date.now(),
        onBoard: input.onBoard,
      });
      writeLocal(state);
    },
    async mySolves() {
      const me = current();
      return readLocal()
        .solves.filter((solve) => solve.owner === me.id)
        .sort((a, b) => b.at - a.at)
        .slice(0, 40);
    },
    async leaderboard() {
      return readLocal()
        .solves.filter((solve) => solve.onBoard && solve.timeMs !== null)
        .sort((a, b) => (a.timeMs ?? 0) - (b.timeMs ?? 0))
        .slice(0, 50);
    },
  };
}

function createResilientBackend(): Backend {
  const remote = createFirebaseBackend();
  const local = createLocalBackend();
  let active: Backend = remote;
  return {
    get mode() {
      return active.mode;
    },
    subscribe(listener) {
      let stopLocal: (() => void) | undefined;
      const stopRemote = remote.subscribe((user) => {
        if (user) {
          listener(user);
          return;
        }
        if (active === local) return;
        active = local;
        stopLocal = local.subscribe(listener);
      });
      return () => {
        stopRemote();
        stopLocal?.();
      };
    },
    register: (...args) => active.register(...args),
    signIn: (...args) => active.signIn(...args),
    signInGitHub: () => active.signInGitHub(),
    signOut: () => active.signOut(),
    saveColors: (palette) => active.saveColors(palette),
    loadColors: () => active.loadColors(),
    saveSolve: (input) => active.saveSolve(input),
    mySolves: () => active.mySolves(),
    leaderboard: () => active.leaderboard(),
  };
}

export function createBackend(): Backend {
  return firebasePublicConfig() ? createResilientBackend() : createLocalBackend();
}
