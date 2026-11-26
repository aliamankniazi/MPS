/**
 * TAKE A COMPLETE BACKUP, from the server, into one file on this device. Read-only.
 *
 * Every collection is read FROM THE SERVER (never from this device's saved copy, which may be behind), and
 * if any one of them cannot be read the whole backup is refused: a file that is missing a collection and
 * still says "backup" is how records are lost without anyone noticing.
 */
import { collection, getDocsFromServer, type Firestore } from 'firebase/firestore';
import {
  BACKUP_FORMAT,
  backupFileName,
  collectionsText,
  countDocuments,
  encodeValue,
  orderCollections,
  type BackupCollections,
  type BackupFile,
} from './backup-format';

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface BackupResult {
  blob: Blob;
  fileName: string;
  documents: number;
  counts: Record<string, number>;
  sha256: string;
}

export async function takeFullBackup(firestore: Firestore, collectionNames: readonly string[], projectId: string): Promise<BackupResult> {
  const collections: BackupCollections = {};
  for (const name of [...new Set(collectionNames)].sort()) {
    let snapshot;
    try {
      snapshot = await getDocsFromServer(collection(firestore, name));
    } catch (error: any) {
      throw new Error(`Backup stopped: "${name}" could not be read from the server (${error?.code || error?.message || 'unknown error'}). No file was written.`);
    }
    collections[name] = snapshot.docs.map((d) => ({ id: d.id, data: encodeValue(d.data()) }));
  }
  const ordered = orderCollections(collections);
  const sha256 = await sha256Hex(collectionsText(ordered));
  const { documents, counts } = countDocuments(ordered);
  const exportedAt = new Date();
  const file: BackupFile = { format: BACKUP_FORMAT, projectId, exportedAt: exportedAt.toISOString(), documents, counts, sha256, collections: ordered };
  // `collections` is written with the same serialiser the fingerprint was taken from.
  const { collections: _omit, ...head } = file;
  const body = `${JSON.stringify(head).slice(0, -1)},"collections":${collectionsText(ordered)}}`;
  return {
    blob: new Blob([body], { type: 'application/json' }),
    fileName: backupFileName(projectId, exportedAt, sha256),
    documents,
    counts,
    sha256,
  };
}
