/**
 * Run a transaction again when the database chose it as a deadlock victim, a
 * lock wait timed out, or (TiDB) a write conflict was found at commit. All of
 * them mean "nothing was written, try again" and happen in ordinary use when
 * two people save at the same moment.
 */
const RETRYABLE = ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT', 'ER_WRITE_CONFLICT'];
const RETRYABLE_ERRNO = [1205, 1213, 8002, 8005, 9007];

export function isRetryable(e: unknown): boolean {
  let cur = e as { code?: string; errno?: number; cause?: unknown } | undefined;
  for (let depth = 0; cur && depth < 5; depth++) {
    if ((cur.code && RETRYABLE.includes(cur.code)) || (cur.errno && RETRYABLE_ERRNO.includes(cur.errno))) return true;
    cur = cur.cause as typeof cur;
  }
  return false;
}

export async function withRetry<T>(work: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await work();
    } catch (e) {
      if (i >= attempts || !isRetryable(e)) throw e;
      await new Promise((r) => setTimeout(r, 15 * i + Math.floor(Math.random() * 20)));
    }
  }
}
