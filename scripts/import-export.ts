/**
 * Load a backup of the old Firebase project into the database.
 *
 *   npm run data:import -- --from exports/mps-2026-11-15            (shows what it WOULD do)
 *   npm run data:import -- --from exports/mps-2026-11-15 --apply    (does it, on this PC)
 *   ... --apply --allow-remote <host>                               (does it on the cloud database)
 *   ... --keep-existing     leave records the database already holds differently as they are
 *
 * Without --apply nothing is written. A database that is not this PC is
 * refused unless the command names its host.
 */
import { connect, databaseUrl } from '../src/server/db/client';
import { argValue, checkTarget } from '../src/server/db/remote-guard';
import { applyImport, databaseTotals, planImport } from '../src/server/migration/import';
import { canonical, totals } from '../src/server/migration/export-format';

async function main() {
  const dir = argValue(process.argv, '--from');
  if (!dir) throw new Error('say which backup: --from exports/<folder>');
  const url = databaseUrl();
  if (!url) throw new Error('DATABASE_URL is not set');
  const apply = process.argv.includes('--apply');
  const { host, remote } = apply ? checkTarget(url, argValue(process.argv, '--allow-remote')) : { host: new URL(url).hostname, remote: false };

  const { db, pool } = connect(url);
  try {
    const plan = await planImport(db, dir);
    console.log(`Backup: ${dir} (taken ${plan.manifest.exportedAt} from ${plan.manifest.source})`);
    console.log(`Database: ${host}${remote ? '  ** NOT THIS PC **' : ''}\n`);
    console.table(plan.summary);
    console.log(`Sign-in accounts in backup: ${plan.users.length}`);
    if (plan.notNumbers) console.log(`Note: ${plan.notNumbers} not-a-number value(s) will be stored as empty.`);
    for (const warning of plan.manifest.warnings) console.log(`Backup warning: ${warning}`);
    if (plan.different.length) console.log(`\n${plan.different.length} record(s) differ from what the database already holds, e.g. ${plan.different.slice(0, 5).join(', ')}`);

    if (!apply) {
      console.log(`\nDRY RUN: nothing was written. ${plan.toAdd.length} record(s) would be added. Add --apply to do it.`);
      return;
    }
    const outcome = await applyImport(db, plan, { keepExisting: process.argv.includes('--keep-existing') });
    const same = canonical(totals(plan.records.filter((r) => !plan.different.includes(r.path)))) === canonical(await databaseTotals(db, { ...plan, records: plan.records.filter((r) => !plan.different.includes(r.path)) }));
    console.log(`\nAdded ${outcome.added} record(s) and ${outcome.accountsAdded} sign-in account(s).`);
    console.log(`Read back and compared with the backup: ${outcome.verified} record(s) identical.`);
    if (outcome.emailClashes.length) console.log(`ATTENTION: ${outcome.emailClashes.length} email(s) in the backup already belong to a different account here and were not linked: ${outcome.emailClashes.join(', ')}`);
    console.log(`Totals of every numeric field, backup vs database: ${same ? 'IDENTICAL' : 'DIFFERENT - investigate before going further'}`);
    if (!same) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('[import] stopped:', e instanceof Error ? e.message.split('params:')[0] : e);
  process.exit(1);
});
