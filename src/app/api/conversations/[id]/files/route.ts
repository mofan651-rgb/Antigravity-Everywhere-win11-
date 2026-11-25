import { NextResponse } from 'next/server';
import { getOwnerConnection } from '@/lib/bridge/gateway';
import { uriToFsPath } from '@/lib/bridge/path-utils';
import { createLogger } from '@/lib/logger';
import { readdirSync, existsSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const IGNORED_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'out']);

function walkWorkspaceFiles(
  rootDir: string,
  needle: string,
  maxResults: number,
  results: Array<{ absolutePath: string; relativePath: string; name: string }> = [],
  currentDir: string = rootDir,
): Array<{ absolutePath: string; relativePath: string; name: string }> {
  if (results.length >= maxResults) return results;
  let entries;
  try {
    entries = readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (results.length >= maxResults) break;
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      walkWorkspaceFiles(rootDir, needle, maxResults, results, path.join(currentDir, entry.name));
    } else if (entry.isFile()) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
      if (!needle || entry.name.toLowerCase().includes(needle) || relPath.toLowerCase().includes(needle)) {
        results.push({
          absolutePath: fullPath,
          relativePath: relPath,
          name: entry.name,
        });
      }
    }
  }
  return results;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();

  const conn = await getOwnerConnection(id);
  const maxResults = 25;

  const workspacePath = conn?.workspace ? path.resolve(uriToFsPath(conn.workspace)) : process.cwd();
  if (!existsSync(workspacePath)) {
    return NextResponse.json({ files: [] });
  }

  try {
    const files = walkWorkspaceFiles(workspacePath, q, maxResults);
    return NextResponse.json({ files });
  } catch (e: any) {
    const log = createLogger('FileSearch');
    log.warn({ err: e.message }, 'Error walking workspace files');
    return NextResponse.json({ files: [], error: e.message });
  }
}
