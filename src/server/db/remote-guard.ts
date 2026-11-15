/**
 * THE RULE EVERY DATA SCRIPT FOLLOWS BEFORE IT WRITES.
 *
 * A database that is not this PC is only ever written to when the command
 * names that exact host (`--allow-remote <host>`): the owner's go-ahead,
 * spelled out each time, so a copied command or a stale .env file can never
 * aim a script at the cloud by accident.
 */
const LOCAL = ['127.0.0.1', 'localhost'];

export function checkTarget(url: string, allowRemote: string | undefined): { host: string; remote: boolean } {
  const host = new URL(url).hostname;
  const remote = !LOCAL.includes(host);
  if (remote && allowRemote !== host) {
    throw new Error(`refusing: ${host} is not this PC. To write to it on purpose, add --allow-remote ${host}`);
  }
  return { host, remote };
}

/** Reads `--name value` from a command line. */
export function argValue(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
