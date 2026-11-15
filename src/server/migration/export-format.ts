/**
 * The shape of a backup taken from the old Firebase project, shared by the
 * script that writes it, the script that loads it, and the tests.
 *
 *   exports/mps-<date>/
 *     manifest.json            what is inside, with a checksum per file
 *     <collection>.ndjson      one record per line: {"path": "...", "data": {...}}
 *     users.ndjson             sign-in emails (never passwords)
 *
 * Two values JSON cannot carry are wrapped so nothing is lost on the way:
 *   a Firestore date     {"__ts": "2026-01-02T03:04:05.000Z"}
 *   NaN / Infinity       {"__num": "NaN"}
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { DocData } from '../../data/apply-op';

export type ExportedRecord = { path: string; data: DocData };
export type ExportedUser = { uid: string; email: string | null; emailVerified: boolean; disabled: boolean };

export type Manifest = {
  source: string;
  exportedAt: string;
  files: Record<string, { records: number; sha256: string }>;
  /** collection -> field names that held Firestore dates. */
  timestampFields: Record<string, string[]>;
  warnings: string[];
};

export const sha256 = (text: string | Buffer): string => createHash('sha256').update(text).digest('hex');

const isPlainObject = (v: unknown): v is DocData => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Turns an exported value into what the app stores: dates become the ISO text
 * the app has always converted them to on reading. Returns how many
 * not-a-number values were turned into empty (null), which the caller reports.
 */
export function decodeValue(value: unknown, counts: { notNumbers: number; unsupported: number }): unknown {
  if (Array.isArray(value)) return value.map((v) => decodeValue(v, counts));
  if (!isPlainObject(value)) return value;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === '__ts' && typeof value.__ts === 'string') return value.__ts;
  if (keys.length === 1 && keys[0] === '__num') {
    counts.notNumbers++;
    return null;
  }
  if (keys.length === 1 && keys[0] === '__unsupported') {
    counts.unsupported++;
    return null;
  }
  const out: DocData = {};
  for (const [k, v] of Object.entries(value)) out[k] = decodeValue(v, counts);
  return out;
}

/** The same record always gives the same text, whatever order its fields were written in. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!isPlainObject(value)) return JSON.stringify(value) ?? 'null';
  return `{${Object.keys(value)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
    .join(',')}}`;
}

export function readManifest(dir: string): Manifest {
  return JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as Manifest;
}

/** Reads one file of the backup, refusing it if it no longer matches the checksum taken when it was written. */
export function readExportFile<T>(dir: string, manifest: Manifest, file: string): T[] {
  const entry = manifest.files[file];
  if (!entry) throw new Error(`${file} is not listed in the manifest`);
  const text = readFileSync(path.join(dir, file), 'utf8');
  if (sha256(text) !== entry.sha256) throw new Error(`${file} has changed since the backup was taken (checksum mismatch); refusing to use it`);
  const rows = text.split('\n').filter((line) => line.length > 0).map((line) => JSON.parse(line) as T);
  if (rows.length !== entry.records) throw new Error(`${file} holds ${rows.length} records but the manifest says ${entry.records}`);
  return rows;
}

/** Adds up every numeric top-level field per collection: a quick "same totals?" check between two copies. */
export function totals(records: ExportedRecord[]): Record<string, { count: number; sums: Record<string, number> }> {
  const out: Record<string, { count: number; sums: Record<string, number> }> = {};
  for (const record of [...records].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    const collection = record.path.slice(0, record.path.lastIndexOf('/'));
    const entry = (out[collection] ??= { count: 0, sums: {} });
    entry.count++;
    for (const [field, value] of Object.entries(record.data)) {
      if (typeof value === 'number' && Number.isFinite(value)) entry.sums[field] = (entry.sums[field] ?? 0) + value;
    }
  }
  return out;
}
