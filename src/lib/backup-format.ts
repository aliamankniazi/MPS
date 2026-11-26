/**
 * THE BACKUP FILE: every document of every collection, as it is stored, in one JSON file.
 *
 *   { format, projectId, exportedAt, documents, counts: {collection: n}, sha256, collections: {collection: [{id, data}]} }
 *
 * Nothing is rounded or reformatted on the way out. A Firestore timestamp keeps its seconds AND nanoseconds
 * (`{"$ts":[s, ns]}`), because a date turned into text and back is no longer the record that was stored.
 * `sha256` is the fingerprint of the `collections` part exactly as written, so a copy can be proved unaltered.
 *
 * Pure: no Firestore import, values are recognised by shape. The reader is lib/backup.ts.
 */
export const BACKUP_FORMAT = 'mps-backup/1';

export type BackupDoc = { id: string; data: unknown };
export type BackupCollections = Record<string, BackupDoc[]>;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  projectId: string;
  exportedAt: string;
  documents: number;
  counts: Record<string, number>;
  sha256: string;
  collections: BackupCollections;
}

/** One stored value, losslessly, as plain JSON. */
export function encodeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : { $num: String(value) };
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (value instanceof Date) return { $date: Number.isNaN(value.getTime()) ? null : value.toISOString() };
  if (Array.isArray(value)) return value.map(encodeValue);
  if (typeof value === 'object') {
    const v = value as Record<string, any>;
    // Firestore Timestamp
    if (typeof v.toDate === 'function' && typeof v.seconds === 'number' && typeof v.nanoseconds === 'number') {
      return { $ts: [v.seconds, v.nanoseconds] };
    }
    // Firestore GeoPoint
    if (typeof v.latitude === 'number' && typeof v.longitude === 'number' && typeof v.isEqual === 'function') {
      return { $geo: [v.latitude, v.longitude] };
    }
    // Firestore DocumentReference
    if (typeof v.path === 'string' && typeof v.id === 'string' && 'firestore' in v) {
      return { $ref: v.path };
    }
    // Firestore Bytes
    if (typeof v.toBase64 === 'function') return { $bytes: v.toBase64() };
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(v).sort()) {
      if (v[key] === undefined) continue;
      out[key] = encodeValue(v[key]);
    }
    return out;
  }
  return String(value);
}

/** The collections, ids in order, so the same data always writes the same text (and the same fingerprint). */
export function orderCollections(collections: BackupCollections): BackupCollections {
  const out: BackupCollections = {};
  for (const name of Object.keys(collections).sort()) {
    out[name] = [...collections[name]].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  return out;
}

export function countDocuments(collections: BackupCollections): { documents: number; counts: Record<string, number> } {
  const counts: Record<string, number> = {};
  let documents = 0;
  for (const name of Object.keys(collections).sort()) {
    counts[name] = collections[name].length;
    documents += collections[name].length;
  }
  return { documents, counts };
}

/** The exact text whose SHA-256 is recorded in the file. */
export function collectionsText(collections: BackupCollections): string {
  return JSON.stringify(orderCollections(collections));
}

export function backupFileName(projectId: string, exportedAt: Date, sha256: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${exportedAt.getFullYear()}${pad(exportedAt.getMonth() + 1)}${pad(exportedAt.getDate())}-${pad(exportedAt.getHours())}${pad(exportedAt.getMinutes())}`;
  return `${projectId || 'mps'}-backup-${stamp}-${sha256.slice(0, 8)}.json`;
}
