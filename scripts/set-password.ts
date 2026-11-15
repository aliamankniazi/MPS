/**
 * Set a password for one account from this PC: for the owner's own account,
 * or for anyone when email is not set up yet.
 *
 *   npm run account:set-password -- --email someone@example.com
 *   ... --mark-verified          also treat the email address as confirmed
 *   ... --allow-remote <host>    needed for the cloud database
 *   ... --stdin                  read the password from piped input instead of the prompt
 *
 * At the prompt the password does not appear on screen. It is never put on
 * the command line, in a file or in the logs. Any "choose your password" link
 * still waiting for this account stops working, and other devices are signed out.
 */
import { stdin, stdout } from 'node:process';
import { and, eq, isNull } from 'drizzle-orm';
import { connect, databaseUrl } from '../src/server/db/client';
import { accounts, emailTokens } from '../src/server/db/schema';
import { argValue, checkTarget } from '../src/server/db/remote-guard';
import { normaliseEmail } from '../src/server/auth/accounts';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../src/server/auth/password';
import { endAllSessions } from '../src/server/auth/session';

function askHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY) return reject(new Error('run this in a terminal so the password can be typed privately (or pipe it in with --stdin)'));
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

async function readPiped(): Promise<string> {
  let text = '';
  for await (const chunk of stdin) text += chunk;
  return text.replace(/\r?\n$/, '');
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

    let password: string;
    if (process.argv.includes('--stdin')) {
      password = await readPiped();
    } else {
      password = await askHidden(`New password for ${email} on ${host}: `);
      if ((await askHidden('Type it again: ')) !== password) throw new Error('the two entries do not match; nothing changed');
    }
    if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);

    const verified = process.argv.includes('--mark-verified') ? true : account.emailVerified;
    const now = new Date();
    await db.update(accounts).set({ passwordHash: await hashPassword(password), emailVerified: verified, failedSignIns: 0, lockedUntil: null }).where(eq(accounts.id, account.id));
    await db.update(emailTokens).set({ usedAt: now }).where(and(eq(emailTokens.accountId, account.id), eq(emailTokens.purpose, 'reset'), isNull(emailTokens.usedAt)));
    await endAllSessions(db, account.id);
    console.log(`Password set for ${email} on ${host}. Other devices signed in as this account have been signed out, and any setup link still waiting has been cancelled.`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('[set-password] stopped:', e instanceof Error ? e.message : e);
  process.exit(1);
});
