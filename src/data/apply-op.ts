/**
 * How one change is applied to one record. The browser uses this to show a
 * change at once; the server uses the very same code to make it permanent,
 * so the two can never disagree about what a change means.
 *
 * The three kinds mirror what the app did with Firestore:
 *   set     replace the record (or merge into it when `merge` is set)
 *   update  change some fields; 'a.b' reaches inside field `a`; fails if the record is gone
 *   delete  remove the record
 */
export type DocData = Record<string, unknown>;

export type Op =
  | { opId: string; path: string; type: 'set'; data: DocData; merge?: boolean }
  | { opId: string; path: string; type: 'update'; data: DocData }
  | { opId: string; path: string; type: 'delete' };

/** Stands in for "the server's clock at the moment this is saved". */
export const SERVER_TIMESTAMP_KEY = '__serverTimestamp';
export const serverTimestampMarker = (): DocData => ({ [SERVER_TIMESTAMP_KEY]: true });

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_PATH = 512;
const MAX_SEGMENT = 255;

const isPlainObject = (v: unknown): v is DocData => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 'customers/abc' -> { collection: 'customers', docId: 'abc' }; null when the path is not a record's path. */
export function splitPath(path: string): { collection: string; docId: string; root: string } | null {
  if (typeof path !== 'string' || path.length === 0 || path.length > MAX_PATH) return null;
  const parts = path.split('/');
  if (parts.length < 2 || parts.length % 2 !== 0) return null;
  // eslint-disable-next-line no-control-regex
  if (parts.some((p) => p.length === 0 || p.length > MAX_SEGMENT || p === '.' || p === '..' || /[\u0000-\u001f]/.test(p))) return null;
  return { collection: parts.slice(0, -1).join('/'), docId: parts[parts.length - 1], root: parts[0] };
}

/** Why a change cannot be accepted, or null when it is well formed. */
export function invalidReason(op: unknown): string | null {
  if (!isPlainObject(op)) return 'not an object';
  if (typeof op.opId !== 'string' || op.opId.length < 8 || op.opId.length > 64) return 'bad opId';
  if (typeof op.path !== 'string' || !splitPath(op.path)) return 'bad path';
  if (op.type === 'delete') return null;
  if (op.type !== 'set' && op.type !== 'update') return 'bad type';
  if (!isPlainObject(op.data)) return 'bad data';
  return hasForbiddenKey(op.data, op.type === 'update') ? 'bad field name' : null;
}

function hasForbiddenKey(value: unknown, splitDots: boolean): boolean {
  if (Array.isArray(value)) return value.some((v) => hasForbiddenKey(v, false));
  if (!isPlainObject(value)) return false;
  return Object.entries(value).some(([key, v]) => {
    const names = splitDots ? key.split('.') : [key];
    return names.some((n) => FORBIDDEN_KEYS.has(n) || n.length === 0) || hasForbiddenKey(v, false);
  });
}

/** Swaps every "server clock" marker for the given time. */
export function resolveServerTimestamps(value: unknown, nowIso: string): unknown {
  if (Array.isArray(value)) return value.map((v) => resolveServerTimestamps(v, nowIso));
  if (!isPlainObject(value)) return value;
  if (value[SERVER_TIMESTAMP_KEY] === true && Object.keys(value).length === 1) return nowIso;
  const out: DocData = {};
  for (const [k, v] of Object.entries(value)) out[k] = resolveServerTimestamps(v, nowIso);
  return out;
}

function deepMerge(base: DocData, patch: DocData): DocData {
  const out: DocData = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    const existing = out[k];
    out[k] = isPlainObject(v) && isPlainObject(existing) ? deepMerge(existing, v) : v;
  }
  return out;
}

function setAtPath(target: DocData, dotted: string, value: unknown): void {
  const names = dotted.split('.');
  let cursor = target;
  for (const name of names.slice(0, -1)) {
    const next = cursor[name];
    // Copy on the way down so the previous version of the record is never altered.
    cursor[name] = isPlainObject(next) ? { ...next } : {};
    cursor = cursor[name] as DocData;
  }
  cursor[names[names.length - 1]] = value;
}

export type ApplyResult = { status: 'applied'; data: DocData | null } | { status: 'missing' };

/**
 * The record after `op`, given the record before it (`null` = does not exist).
 * `data: null` means the record is now deleted. Never alters `current`.
 */
export function applyOp(current: DocData | null, op: Op, nowIso: string): ApplyResult {
  if (op.type === 'delete') return { status: 'applied', data: null };
  const incoming = resolveServerTimestamps(op.data, nowIso) as DocData;
  if (op.type === 'set') {
    return { status: 'applied', data: op.merge && current ? deepMerge(current, incoming) : incoming };
  }
  // update: Firestore refuses to update a record that does not exist.
  if (!current) return { status: 'missing' };
  const next: DocData = { ...current };
  for (const [key, value] of Object.entries(incoming)) setAtPath(next, key, value);
  return { status: 'applied', data: next };
}
