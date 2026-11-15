import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Db } from '../../src/server/db/client';
import { accounts } from '../../src/server/db/schema';
import { applyImport, databaseTotals, planImport } from '../../src/server/migration/import';
import { canonical, sha256, totals, type Manifest } from '../../src/server/migration/export-format';
import { pullChanges, pushOps, readDocs } from '../../src/server/sync/documents';
import type { Actor } from '../../src/server/access/policy';
import { closeTestDb, freshTestDb } from './test-db';

let db: Db;
const admin: Actor = { accountId: 'a1', email: 'o@e.com', emailVerified: true, roleId: 'admin', active: true };

/** A small made-up backup in the same format the real export writes. */
function makeBackup(files: Record<string, object[]>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'mps-backup-'));
  const manifest: Manifest = { source: 'firebase:test', exportedAt: '2026-11-15T00:00:00.000Z', files: {}, timestampFields: {}, warnings: [] };
  for (const [file, rows] of Object.entries(files)) {
    const text = rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');
    writeFileSync(path.join(dir, file), text);
    manifest.files[file] = { records: rows.length, sha256: sha256(text) };
  }
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  return dir;
}

const BACKUP = {
  'transactions.ndjson': [
    { path: 'transactions/t1', data: { totalAmount: 5400.5, volume: 20, pricePerLitre: 270.025, timestamp: { __ts: '2026-03-01T05:00:00.000Z' }, customerName: 'احمد' } },
    { path: 'transactions/t2', data: { totalAmount: 0.1, volume: 0.2, timestamp: { __ts: '2026-03-02T05:00:00.000Z' } } },
  ],
  'recycleBin.ndjson': [{ path: 'recycleBin/r1', data: { originalPath: 'expenses/e9', deletedAt: '2026-02-01T00:00:00.000Z', data: { amount: 75, timestamp: { __ts: '2026-01-31T00:00:00.000Z' } } } }],
  'employees.ndjson': [{ path: 'employees/e1', data: { name: 'Bilal', salary: 30000, salaryHistory: [{ amount: 28000, effectiveDate: { __ts: '2025-07-01T00:00:00.000Z' } }] } }],
  'userRoles.ndjson': [{ path: 'userRoles/uidOwner', data: { roleId: 'admin', email: 'owner@example.com' } }],
  'users.ndjson': [
    { uid: 'uidOwner', email: 'Owner@Example.com', emailVerified: true, disabled: false },
    { uid: 'uidGone', email: 'gone@example.com', emailVerified: true, disabled: true },
  ],
};

beforeEach(async () => {
  db = await freshTestDb();
});
afterAll(closeTestDb);

describe('loading a backup', () => {
  it('a dry run writes nothing', async () => {
    const plan = await planImport(db, makeBackup(BACKUP));
    expect(plan.toAdd).toHaveLength(5);
    expect((await pullChanges(db, 0)).docs).toHaveLength(0);
  });

  it('puts every record in under its own path, with dates as the text the app reads', async () => {
    const plan = await planImport(db, makeBackup(BACKUP));
    const outcome = await applyImport(db, plan);
    expect(outcome).toEqual({ added: 5, accountsAdded: 1, verified: 5 });

    const docs = await readDocs(db, ['transactions/t1', 'recycleBin/r1', 'employees/e1']);
    expect(docs.get('transactions/t1')).toEqual({ totalAmount: 5400.5, volume: 20, pricePerLitre: 270.025, timestamp: '2026-03-01T05:00:00.000Z', customerName: 'احمد' });
    expect(docs.get('recycleBin/r1')).toEqual({ originalPath: 'expenses/e9', deletedAt: '2026-02-01T00:00:00.000Z', data: { amount: 75, timestamp: '2026-01-31T00:00:00.000Z' } });
    expect(docs.get('employees/e1')).toEqual({ name: 'Bilal', salary: 30000, salaryHistory: [{ amount: 28000, effectiveDate: '2025-07-01T00:00:00.000Z' }] });

    expect(canonical(await databaseTotals(db, plan))).toBe(canonical(totals(plan.records)));
  });

  it('brings people across without passwords and skips disabled ones', async () => {
    await applyImport(db, await planImport(db, makeBackup(BACKUP)));
    const all = await db.select().from(accounts);
    expect(all).toHaveLength(1);
    const [owner] = await db.select().from(accounts).where(eq(accounts.id, 'uidOwner'));
    expect(owner).toMatchObject({ email: 'owner@example.com', passwordHash: null, emailVerified: true });
  });

  it('running it again adds nothing', async () => {
    const dir = makeBackup(BACKUP);
    await applyImport(db, await planImport(db, dir));
    const before = (await pullChanges(db, 0)).cursor;

    const second = await planImport(db, dir);
    expect(second.toAdd).toHaveLength(0);
    expect(Object.values(second.summary).every((s) => s.identical === s.inBackup)).toBe(true);
    expect(await applyImport(db, second)).toEqual({ added: 0, accountsAdded: 0, verified: 5 });
    expect((await pullChanges(db, 0)).cursor).toBe(before);
  });

  it('never alters a record the database already holds differently', async () => {
    await pushOps(db, admin, [{ opId: 'op-existing-1', path: 'transactions/t1', type: 'set', data: { totalAmount: 9999, note: 'entered in the new app' } }]);
    const plan = await planImport(db, makeBackup(BACKUP));
    expect(plan.different).toEqual(['transactions/t1']);

    await expect(applyImport(db, plan)).rejects.toThrow(/differ from the backup/);
    expect((await pullChanges(db, 0)).docs).toHaveLength(1); // nothing else was written

    const outcome = await applyImport(db, plan, { keepExisting: true });
    expect(outcome.added).toBe(4);
    expect((await readDocs(db, ['transactions/t1'])).get('transactions/t1')).toEqual({ totalAmount: 9999, note: 'entered in the new app' });
  });

  it('refuses a backup file that was changed after it was taken', async () => {
    const dir = makeBackup(BACKUP);
    writeFileSync(path.join(dir, 'transactions.ndjson'), JSON.stringify({ path: 'transactions/t1', data: { totalAmount: 1 } }) + '\n');
    await expect(planImport(db, dir)).rejects.toThrow(/checksum mismatch/);
  });
});
