import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { createLogger } from '@/lib/logger';
import { uriToFsPath } from '@/lib/bridge/path-utils';

const log = createLogger('Launch');

export const dynamic = 'force-dynamic';

function getAntigravityCli(): string {
  if (process.platform === 'win32') {
    const localApp = process.env.LOCALAPPDATA || '';
    const winCli = path.join(localApp, 'Programs', 'antigravity', 'Antigravity.exe');
    if (existsSync(winCli)) return winCli;
    return 'antigravity';
  }
  return '/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity';
}

/**
 * POST /api/workspaces/launch — Open a workspace in Antigravity (triggers language_server start)
 */
export async function POST(req: Request) {
  const { workspace } = await req.json();
  if (!workspace) {
    return NextResponse.json({ error: 'Missing workspace path' }, { status: 400 });
  }

  const wsPath = uriToFsPath(workspace);
  log.info({ wsPath }, 'Opening workspace');

  try {
    const cli = getAntigravityCli();
    const child = spawn(cli, ['--new-window', wsPath], {
      detached: true,
      stdio: 'ignore',
      shell: process.platform === 'win32' && !cli.endsWith('.exe'),
    });
    child.unref();
    log.info({ wsPath }, 'Antigravity CLI spawned');
    return NextResponse.json({ ok: true, launched: wsPath });
  } catch (e: any) {
    log.error({ err: e.message, wsPath }, 'Launch failed');
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

