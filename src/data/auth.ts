/**
 * The sign-in functions the app uses, with the names Firebase gave them, but
 * talking to the app's own server. The password is checked on the server and
 * the browser only ever holds a cookie it cannot read.
 */
export type User = {
  uid: string;
  email: string | null;
  /**
   * True once the person may use the app: their email is approved AND an
   * admin-recognised role is on their account. The sign-in screen waits on this.
   */
  emailVerified: boolean;
  /** Ask the server again and update this same object. */
  reload(): Promise<void>;
};

export type Auth = { currentUser: User | null };
export type UserCredential = { user: User };

type ServerUser = { uid: string; email: string; emailVerified: boolean; active: boolean; roleId: string | null };
type Listener = (user: User | null) => void;

const CACHED_USER = 'mps_user';
const SIGN_OUT_OWED = 'mps_sign_out_owed';

const auth: Auth = { currentUser: null };
const listeners = new Set<Listener>();
let started: Promise<void> | undefined;

export function getAuth(): Auth {
  return auth;
}

class OfflineError extends Error {
  constructor() {
    super('No internet connection. Please try again.');
  }
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new OfflineError();
  }
  const payload = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok) throw new Error(payload.error?.message ?? 'Something went wrong. Please try again.');
  return payload;
}

const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null): void {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // storage blocked: nothing to remember
    }
  },
};

function makeUser(from: Pick<ServerUser, 'uid' | 'email' | 'active'>): User {
  const user: User = {
    uid: from.uid,
    email: from.email,
    emailVerified: from.active,
    async reload() {
      const { user: fresh } = await api<{ user: ServerUser | null }>('/api/auth/session');
      if (!fresh) {
        setUser(null);
        return;
      }
      user.emailVerified = fresh.active;
      storage.set(CACHED_USER, JSON.stringify({ uid: fresh.uid, email: fresh.email, active: fresh.active }));
    },
  };
  return user;
}

function setUser(from: Pick<ServerUser, 'uid' | 'email' | 'active'> | null): User | null {
  auth.currentUser = from ? makeUser(from) : null;
  storage.set(CACHED_USER, from ? JSON.stringify({ uid: from.uid, email: from.email, active: from.active }) : null);
  for (const listener of [...listeners]) listener(auth.currentUser);
  return auth.currentUser;
}

async function start(): Promise<void> {
  try {
    if (storage.get(SIGN_OUT_OWED)) {
      // The person signed out with no internet: finish that before anything else.
      await api('/api/auth/signout', {});
      storage.set(SIGN_OUT_OWED, null);
    }
    const { user } = await api<{ user: ServerUser | null }>('/api/auth/session');
    setUser(user);
  } catch (e) {
    // No internet: carry on as the person who was last signed in here, so the
    // app opens on its saved copy. The server still checks them on every sync.
    const cached = e instanceof OfflineError && !storage.get(SIGN_OUT_OWED) ? storage.get(CACHED_USER) : null;
    setUser(cached ? (JSON.parse(cached) as Pick<ServerUser, 'uid' | 'email' | 'active'>) : null);
  }
}

/** Calls `next` once the signed-in person is known, and again whenever that changes. */
export function onAuthStateChanged(_auth: Auth, next: Listener, _error?: (e: Error) => void): () => void {
  listeners.add(next);
  if (started) void started.then(() => listeners.has(next) && next(auth.currentUser));
  else started = start();
  return () => void listeners.delete(next);
}

export async function signInWithEmailAndPassword(_auth: Auth, email: string, password: string): Promise<UserCredential> {
  const { user } = await api<{ user: ServerUser }>('/api/auth/signin', { email, password });
  storage.set(SIGN_OUT_OWED, null);
  return { user: setUser(user)! };
}

export async function createUserWithEmailAndPassword(_auth: Auth, email: string, password: string): Promise<UserCredential> {
  const { user } = await api<{ user: ServerUser }>('/api/auth/signup', { email, password });
  storage.set(SIGN_OUT_OWED, null);
  return { user: setUser(user)! };
}

export async function signOut(_auth: Auth): Promise<void> {
  try {
    await api('/api/auth/signout', {});
  } catch (e) {
    if (!(e instanceof OfflineError)) throw e;
    storage.set(SIGN_OUT_OWED, '1');
  }
  setUser(null);
}

export async function sendPasswordResetEmail(_auth: Auth, email: string): Promise<void> {
  await api('/api/auth/reset/request', { email });
}

/** Sends the "approve this sign-in" email. */
export async function sendEmailVerification(user: User): Promise<void> {
  const { result } = await api<{ result: 'sent' | 'already-verified' | 'recently-sent' }>('/api/auth/verify/send', {});
  if (result !== 'already-verified') return;
  await user.reload();
  if (!user.emailVerified) {
    throw new Error('Your email is confirmed. An admin now needs to give your account a role in Role Management before you can sign in.');
  }
}

export async function completePasswordReset(token: string, password: string): Promise<void> {
  await api('/api/auth/reset', { token, password });
}

export const browserLocalPersistence = 'local';

/** Kept for the app's existing call; the session cookie already lasts across visits. */
export async function setPersistence(_auth: Auth, _persistence: string): Promise<void> {}
