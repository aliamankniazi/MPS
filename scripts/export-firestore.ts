/**
 * Take a full, READ-ONLY copy of the old Firebase project.
 *
 *   npm run data:export
 *
 * Needs GOOGLE_APPLICATION_CREDENTIALS to hold the path of a service-account
 * key file kept OUTSIDE this folder. This script only reads: it never writes,
 * deletes or changes rules in Firebase. Every collection is copied, including
 * any the app does not know about, deleted items in the recycle bin, and
 * records nested under other records.
 *
 * Output: exports/mps-<date>/ (git-ignored). It refuses to overwrite an
 * existing backup.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { DocumentReference, GeoPoint, getFirestore, Timestamp, type CollectionReference, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { sha256, type ExportedRecord, type ExportedUser, type Manifest } from '../src/server/migration/export-format';
import { argValue } from '../src/server/db/remote-guard';

const PAGE = 500;
const manifest: Manifest = { source: '', exportedAt: new Date().toISOString(), files: {}, timestampFields: {}, warnings: [] };
const timestampFields = new Map<string, Set<string>>();
const lines = new Map<string, string[]>();

function encode(value: unknown, collection: string, field: string, recordPath: string): unknown {
  if (value instanceof Timestamp) {
    if (!timestampFields.has(collection)) timestampFields.set(collection, new Set());
    timestampFields.get(collection)!.add(field);
    return { __ts: value.toDate().toISOString() };
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    manifest.warnings.push(`${recordPath}: field "${field}" is ${value}`);
    return { __num: String(value) };
  }
  if (value instanceof GeoPoint || value instanceof DocumentReference || Buffer.isBuffer(value) || value instanceof Uint8Array) {
    manifest.warnings.push(`${recordPath}: field "${field}" is a kind of value the app never used (${value.constructor.name})`);
    return { __unsupported: value.constructor.name };
  }
  if (Array.isArray(value)) return value.map((v) => encode(v, collection, field, recordPath));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v, collection, field ? `${field}.${k}` : k, recordPath)]));
  }
  return value;
}

async function copyCollection(ref: CollectionReference, topLevelName: string): Promise<void> {
  let last: QueryDocumentSnapshot | undefined;
  for (;;) {
    let query = ref.orderBy('__name__').limit(PAGE);
    if (last) query = query.startAfter(last);
    const page = await query.get();
    if (page.empty) break;
    for (const doc of page.docs) {
      const record: ExportedRecord = { path: doc.ref.path, data: encode(doc.data(), ref.path, '', doc.ref.path) as ExportedRecord['data'] };
      if (!lines.has(topLevelName)) lines.set(topLevelName, []);
      lines.get(topLevelName)!.push(JSON.stringify(record));
    }
    // Records nested under these ones.
    const nested = await Promise.all(page.docs.map((doc) => doc.ref.listCollections()));
    for (const sub of nested.flat()) await copyCollection(sub, topLevelName);
    last = page.docs[page.docs.length - 1];
    process.stdout.write(`\r  ${ref.path}: ${lines.get(topLevelName)?.length ?? 0}   `);
    if (page.size < PAGE) break;
  }
}

async function main() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS is not set. Point it at the service-account key file (kept outside this folder).');
  }
  const out = argValue(process.argv, '--out') ?? path.join('exports', `mps-${new Date().toISOString().slice(0, 10)}`);
  if (existsSync(out)) throw new Error(`${out} already exists; a backup is never overwritten. Pass --out <another folder>.`);

  const app = initializeApp({ credential: applicationDefault() });
  const db = getFirestore(app);
  manifest.source = `firebase:${app.options.projectId ?? (await db.listCollections(), 'project')}`;

  for (const ref of await db.listCollections()) {
    await copyCollection(ref, ref.id);
    process.stdout.write('\n');
  }

  const users: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await getAuth(app).listUsers(1000, pageToken);
    for (const u of page.users) {
      // Emails and status only. Password hashes are deliberately not copied.
      const user: ExportedUser = { uid: u.uid, email: u.email ?? null, emailVerified: u.emailVerified, disabled: u.disabled };
      users.push(JSON.stringify(user));
    }
    pageToken = page.pageToken;
  } while (pageToken);

  mkdirSync(out, { recursive: true });
  const write = (file: string, rows: string[]) => {
    const text = rows.length ? rows.join('\n') + '\n' : '';
    writeFileSync(path.join(out, file), text);
    manifest.files[file] = { records: rows.length, sha256: sha256(text) };
  };
  for (const [name, rows] of [...lines].sort()) write(`${name}.ndjson`, rows);
  write('users.ndjson', users);
  manifest.timestampFields = Object.fromEntries([...timestampFields].sort().map(([c, f]) => [c, [...f].sort()]));
  writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  console.log(`\nBackup written to ${out}`);
  console.table(Object.fromEntries(Object.entries(manifest.files).map(([f, v]) => [f, v.records])));
  if (manifest.warnings.length) console.log(`${manifest.warnings.length} warning(s): see manifest.json`);
}

main().catch((e) => {
  console.error('[export] stopped:', e instanceof Error ? e.message : e);
  process.exit(1);
});
