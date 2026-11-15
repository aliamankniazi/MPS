/**
 * Set a password for one account from this PC: for the owner's own account,
 * or for anyone when email is not set up yet.
 *
 *   npm run account:set-password -- --email someone@example.com
 *   ... --mark-verified          also treat the email address as confirmed
 *   ... --allow-remote <host>    needed for the cloud database
 *
 * The password is typed at a prompt (it does not appear on screen) and is
 * never put on the command line, in a file or in the logs.
 */
import { stdin, stdout } from 'node:process';
import { eq } from 'drizzle-orm';
import { connect, databaseUrl } from '../src/server/db/client';
import { accounts } from '../src/server/db/schema';
import { argValue, checkTarget } from '../src/server/db/remote-guard';
import { normaliseEmail } from '../src/server/auth/accounts';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../src/server/auth/password';
import { endAllSessions } from '../src/server/auth/session';

function askHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY) return reject(new Error('run this in a terminal so the password can be typed privately'));
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    let typed = '';
    const onData = (chunk: Buffer) => {
      for (const ch of chunk.toString('utf8')) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          return resolve(typed);
        }
        if (ch === '\u0003') return reject(new Error('cancelled'));
        if (ch === '\u007f' || ch === '\b') typed = typed.slice(0, -1);
        else typed += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const email = normaliseEmail(argValue(process.argv, '--email'));
  if (!email) throw new Error('say whose: --email someone@example.com');
  const url = databaseUrl();
  if (!url) throw new Error('DATABASE_URL is not set');
  const { host } = checkTarget(url, argValue(process.argv, '--allow-remote'));

  const { db, pool } = connect(url);
  try {
    const [account] = await db.select().from(accounts).where(eq(accounts.email, email)).limit(1);
    if (!account) throw new Error(`no account for ${email} on ${host}`);
    const password = await askHidden(`New password for ${email} on ${host}: `);
    if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    if ((await askHidden('Type it again: ')) !== password) throw new Error('the two entries do not match; nothing changed');
    const verified = process.argv.includes('--mark-verified') ? true : account.emailVerified;
    await db.update(accounts).set({ passwordHash: await hashPassword(password), emailVerified: verified, failedSignIns: 0, lockedUntil: null }).where(eq(accounts.id, account.id));
    await endAllSessions(db, account.id);
    console.log(`Password set for ${email}. Other devices signed in as this account have been signed out.`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('[set-password] stopped:', e instanceof Error ? e.message : e);
  process.exit(1);
});
