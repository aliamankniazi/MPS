/**
 * Windows only: on an exFAT drive, asking whether an ordinary file is a link
 * fails with EISDIR instead of the usual EINVAL, and `next build` stops.
 * Report it the usual way so the build tools carry on. Loaded before anything
 * else by scripts/run-next.cjs; never used on Vercel.
 */
const fs = require('fs');

const asNotALink = (err) => {
  if (err && err.code === 'EISDIR') err.code = 'EINVAL';
  return err;
};

const readlink = fs.readlink;
fs.readlink = function (path, options, callback) {
  const cb = typeof options === 'function' ? options : callback;
  const opts = typeof options === 'function' ? undefined : options;
  return readlink.call(fs, path, opts, (err, target) => cb(asNotALink(err), target));
};

const readlinkSync = fs.readlinkSync;
fs.readlinkSync = function (...args) {
  try {
    return readlinkSync.apply(fs, args);
  } catch (err) {
    throw asNotALink(err);
  }
};

const readlinkPromise = fs.promises.readlink;
fs.promises.readlink = function (...args) {
  return readlinkPromise.apply(fs.promises, args).catch((err) => {
    throw asNotALink(err);
  });
};
