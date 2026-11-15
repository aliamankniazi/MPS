/**
 * The handful of Firestore functions the app uses, with the same names and
 * the same behaviour, but backed by the app's own server (see store.ts).
 *
 * Keeping the names means the app's data logic (use-database.tsx) did not
 * have to be rewritten: only the line that says where these come from changed.
 */
import { serverTimestampMarker, type DocData, type Op } from './apply-op';
import { LocalStore } from './store';

export type Firestore = { readonly store: LocalStore };

export type CollectionReference = { readonly kind: 'collection'; readonly firestore: Firestore; readonly path: string; readonly id: string };
export type DocumentReference = { readonly kind: 'doc'; readonly firestore: Firestore; readonly path: string; readonly id: string };

let instance: Firestore | undefined;

export function getFirestore(): Firestore {
  instance ??= { store: new LocalStore() };
  return instance;
}

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** A new 20-character id, the same shape Firestore generated. */
function autoId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
}

const newOpId = (): string =>
  typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}-${autoId()}`;

const lastPart = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

export function collection(parent: Firestore, ...segments: string[]): CollectionReference {
  const path = segments.join('/');
  return { kind: 'collection', firestore: parent, path, id: lastPart(path) };
}

/** doc(db, 'customers', id) · doc(db, 'customers/id') · doc(collectionRef) for a new id · doc(collectionRef, id) */
export function doc(parent: Firestore | CollectionReference, ...segments: string[]): DocumentReference {
  if ('kind' in parent) {
    const path = [parent.path, ...(segments.length ? segments : [autoId()])].join('/');
    return { kind: 'doc', firestore: parent.firestore, path, id: lastPart(path) };
  }
  const path = segments.join('/');
  return { kind: 'doc', firestore: parent, path, id: lastPart(path) };
}

export class DocumentSnapshot {
  constructor(
    readonly ref: DocumentReference,
    private readonly value: DocData | undefined,
  ) {}

  get id(): string {
    return this.ref.id;
  }

  exists(): boolean {
    return this.value !== undefined;
  }

  /** A copy, so a screen that changes what it was given cannot alter the stored record. */
  data(): any {
    return this.value === undefined ? undefined : { ...this.value };
  }
}

export class QuerySnapshot {
  constructor(readonly docs: DocumentSnapshot[]) {}

  get empty(): boolean {
    return this.docs.length === 0;
  }

  get size(): number {
    return this.docs.length;
  }

  forEach(callback: (doc: DocumentSnapshot) => void): void {
    this.docs.forEach(callback);
  }
}

function snapshotOfDoc(ref: DocumentReference): DocumentSnapshot {
  return new DocumentSnapshot(ref, ref.firestore.store.getDoc(ref.path));
}

function snapshotOfCollection(ref: CollectionReference): QuerySnapshot {
  const docs: DocumentSnapshot[] = [];
  for (const [id, value] of ref.firestore.store.getCollection(ref.path)) {
    docs.push(new DocumentSnapshot({ kind: 'doc', firestore: ref.firestore, path: `${ref.path}/${id}`, id }, value));
  }
  return new QuerySnapshot(docs);
}

export type Unsubscribe = () => void;

/**
 * Calls `next` now (as soon as the records are loaded) and again after every
 * change, from this device or anyone else's.
 */
export function onSnapshot(ref: DocumentReference, next: (snapshot: DocumentSnapshot) => void, error?: (e: Error) => void): Unsubscribe;
export function onSnapshot(ref: CollectionReference, next: (snapshot: QuerySnapshot) => void, error?: (e: Error) => void): Unsubscribe;
export function onSnapshot(ref: DocumentReference | CollectionReference, next: (snapshot: any) => void): Unsubscribe {
  const store = ref.firestore.store;
  let active = true;
  const fire = () => {
    if (!active || !store.ready) return;
    next(ref.kind === 'doc' ? snapshotOfDoc(ref) : snapshotOfCollection(ref));
  };
  const unsubscribe = store.subscribe(ref.kind === 'doc' ? 'doc' : 'collection', ref.path, fire);
  queueMicrotask(fire);
  return () => {
    active = false;
    unsubscribe();
  };
}

export async function getDoc(ref: DocumentReference): Promise<DocumentSnapshot> {
  await ref.firestore.store.whenReady();
  return snapshotOfDoc(ref);
}

export async function getDocs(ref: CollectionReference): Promise<QuerySnapshot> {
  await ref.firestore.store.whenReady();
  return snapshotOfCollection(ref);
}

/** Dates become ISO text (what the app reads back), `undefined` fields are dropped. */
function toPlain(value: unknown): unknown {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : toPlain(v)));
  if (typeof value === 'object' && value !== null) {
    const out: DocData = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined && typeof v !== 'function') out[k] = toPlain(v);
    return out;
  }
  return value;
}

const plain = (data: object): DocData => toPlain(data) as DocData;

export function serverTimestamp(): DocData {
  return serverTimestampMarker();
}

export async function addDoc(ref: CollectionReference, data: object): Promise<DocumentReference> {
  const created = doc(ref);
  await ref.firestore.store.write([{ opId: newOpId(), path: created.path, type: 'set', data: plain(data), ifAbsent: true }]);
  return created;
}

/**
 * A plain set of a record this device does not hold is sent as "create only":
 * if the server turns out to have it already (this device's copy was behind),
 * the server's record is kept. The app saves default settings and default
 * roles this way whenever it sees none, so this is what stops an incomplete
 * copy from wiping the real ones.
 */
function setOp(ref: DocumentReference, data: object, options?: { merge?: boolean }): Op {
  const merge = options?.merge === true;
  const ifAbsent = !merge && ref.firestore.store.getDoc(ref.path) === undefined;
  return { opId: newOpId(), path: ref.path, type: 'set', data: plain(data), merge, ifAbsent };
}

export function setDoc(ref: DocumentReference, data: object, options?: { merge?: boolean }): Promise<void> {
  return ref.firestore.store.write([setOp(ref, data, options)]);
}

export function updateDoc(ref: DocumentReference, data: object): Promise<void> {
  return ref.firestore.store.write([{ opId: newOpId(), path: ref.path, type: 'update', data: plain(data) }]);
}

export function deleteDoc(ref: DocumentReference): Promise<void> {
  return ref.firestore.store.write([{ opId: newOpId(), path: ref.path, type: 'delete' }]);
}

/** Several changes saved together: all of them or none. */
export function writeBatch(firestore: Firestore) {
  const ops: Op[] = [];
  const batch = {
    set(ref: DocumentReference, data: object, options?: { merge?: boolean }) {
      ops.push(setOp(ref, data, options));
      return batch;
    },
    update(ref: DocumentReference, data: object) {
      ops.push({ opId: newOpId(), path: ref.path, type: 'update', data: plain(data) });
      return batch;
    },
    delete(ref: DocumentReference) {
      ops.push({ opId: newOpId(), path: ref.path, type: 'delete' });
      return batch;
    },
    commit(): Promise<void> {
      return firestore.store.write(ops.splice(0));
    },
  };
  return batch;
}
