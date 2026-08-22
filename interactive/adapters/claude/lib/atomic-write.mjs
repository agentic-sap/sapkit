/**
 * All-or-nothing file writes for the Claude adapter.
 *
 * A hook that is killed mid-write must not leave a half-written file behind:
 * the next run would read the fragment as if it were the whole thing. So the
 * content goes to a sibling temporary file first and only becomes the target
 * through `rename`, which is atomic on the same filesystem — a reader sees
 * either the previous file or the complete new one, never a partial one.
 *
 * Durability is bought with two `fsync` calls: one on the file, so the bytes
 * are on disk before the rename, and one on the directory afterwards, so the
 * rename itself survives a crash. The second is best-effort, since not every
 * platform lets a directory be opened for that.
 *
 * The temporary file is created with `wx` and mode 0600 — it must not exist
 * already, and it must not be readable by other users while it holds the
 * content. It is removed again on any failure.
 *
 * Node built-ins only. These helpers run inside hooks, which ship without
 * dependencies.
 */

import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, renameSync, unlinkSync, writeSync } from 'fs';
import { basename, dirname, join } from 'path';
import { randomUUID } from 'crypto';

/**
 * Create `dir` and any missing parents.
 *
 * A concurrent creator winning the race is success, not failure, so `EEXIST`
 * is swallowed; every other error is the caller's to handle.
 *
 * @param {string} dir directory to create
 */
export function ensureDirSync(dir) {
  if (existsSync(dir)) return;
  try {
    mkdirSync(dir, { recursive: true });
  } catch (err) {
    if (err.code === 'EEXIST') return;
    throw err;
  }
}

/**
 * Write `content` to `filePath` so that readers never observe a partial file.
 *
 * @param {string} filePath target path; its directory is created if missing
 * @param {string} content  text to store, written as UTF-8
 */
export function atomicWriteFileSync(filePath, content) {
  const dir = dirname(filePath);
  const tempPath = join(dir, `.${basename(filePath)}.tmp.${randomUUID()}`);

  let fd = null;
  let renamed = false;

  try {
    ensureDirSync(dir);
    fd = openSync(tempPath, 'wx', 0o600);
    writeSync(fd, content, 0, 'utf-8');
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    renameSync(tempPath, filePath);
    renamed = true;

    try {
      const dirFd = openSync(dir, 'r');
      try { fsyncSync(dirFd); } finally { closeSync(dirFd); }
    } catch {
      // Directory fsync is unavailable on some platforms — the rename stands.
    }
  } finally {
    // Anything a failure left behind is ours to clean up; neither cleanup can
    // be allowed to replace the error that got us here.
    if (fd !== null) {
      try { closeSync(fd); } catch { /* the descriptor dies with the process */ }
    }
    if (!renamed) {
      try { unlinkSync(tempPath); } catch { /* it may never have been created */ }
    }
  }
}
