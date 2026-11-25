import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;

export function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}

export function isSafeId(id: string): boolean {
  return SAFE_ID_RE.test(id);
}

/**
 * Convert a file:// URI or filesystem path to a native OS path.
 */
export function uriToFsPath(uriOrPath: string): string {
  if (!uriOrPath) return '';
  let p = uriOrPath.replace(/^file:\/\//, '');
  try {
    p = decodeURIComponent(p);
  } catch {}
  if (process.platform === 'win32') {
    if (/^\/[a-zA-Z]:/.test(p)) {
      p = p.slice(1);
    }
    p = p.replace(/\//g, path.sep);
  }
  return p;
}

/**
 * Resolve real path if it exists, or resolve via the nearest existing ancestor
 * so symlink escapes cannot bypass boundary checks even for new/target files.
 */
function resolveCanonical(targetPath: string): string {
  const resolved = path.resolve(targetPath);
  try {
    return fs.realpathSync(resolved);
  } catch {
    const parent = path.dirname(resolved);
    if (parent === resolved) return resolved;
    return path.join(resolveCanonical(parent), path.basename(resolved));
  }
}

/**
 * Verify targetPath stays strictly within allowedRoot (or equals allowedRoot).
 */
export function isPathInside(targetPath: string, allowedRoot: string): boolean {
  try {
    const realTarget = resolveCanonical(targetPath);
    const realRoot = resolveCanonical(allowedRoot);
    const cmpTarget = process.platform === 'win32' ? realTarget.toLowerCase() : realTarget;
    const cmpRoot = process.platform === 'win32' ? realRoot.toLowerCase() : realRoot;
    if (cmpTarget === cmpRoot) return true;
    const prefix = cmpRoot.endsWith(path.sep) ? cmpRoot : cmpRoot + path.sep;
    return cmpTarget.startsWith(prefix);
  } catch {
    return false;
  }
}

/**
 * Atomically write a UTF-8 file using a temporary sibling file + rename.
 */
export function atomicWriteFileSync(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
    throw err;
  }
}
