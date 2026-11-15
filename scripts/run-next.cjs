/**
 * Runs `next <args>` on this PC. On Windows it first loads the exFAT fix into
 * Next and every helper process it starts. Vercel does not use this file: it
 * runs the `vercel-build` script.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const env = { ...process.env };
if (process.platform === 'win32') {
  const fix = path.join(__dirname, 'exfat-readlink-fix.cjs').split(path.sep).join('/');
  env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ''} --require "${fix}"`.trim();
}
const next = require.resolve('next/dist/bin/next');
const result = spawnSync(process.execPath, [next, ...process.argv.slice(2)], { stdio: 'inherit', env });
process.exit(result.status ?? 1);
