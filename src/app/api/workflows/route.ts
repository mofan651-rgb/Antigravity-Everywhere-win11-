import { NextResponse } from 'next/server';
import { getAllConnections, getDynamicConversations, grpc } from '@/lib/bridge/gateway';
import { uriToFsPath, isPathInside, isSafeId } from '@/lib/bridge/path-utils';
import { existsSync, mkdirSync, copyFileSync, rmSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { execFile } from 'child_process';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { getGlobalItems } = await import('@/lib/global-agents');
    const globalWorkflows = getGlobalItems('workflows');

    const conns = await getAllConnections();
    const workflowMap = new Map<string, {name: string, description: string, path: string, content: string, scope: string, baseDir: string, workspace: string}>();
    
    for (const wf of globalWorkflows) {
      workflowMap.set(wf.name, wf);
    }

    for (const conn of conns) {
      try {
        const data = await grpc.getAllWorkflows(conn.port, conn.csrf);
        if (data?.workflows) {
          for (const wf of data.workflows) {
            if (!workflowMap.has(wf.name)) {
              workflowMap.set(wf.name, {
                name: wf.name,
                description: wf.description || '',
                path: wf.path || '',
                content: wf.content || '',
                scope: wf.scope?.globalScope ? 'global' : 'workspace',
                baseDir: wf.baseDir || '',
                workspace: (conn as { workspace?: string }).workspace || '',
              });
            }
          }
        }
      } catch {}
    }
    return NextResponse.json([...workflowMap.values()].sort((a, b) => a.name.localeCompare(b.name)));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

const openFileInEditor = (pathToOpen: string) => {
  if (process.platform === 'win32') {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', 'if (Get-Command code -ErrorAction SilentlyContinue) { & code $env:AG_TARGET } else { Start-Process -FilePath $env:AG_TARGET }'],
      { env: { ...process.env, AG_TARGET: pathToOpen } },
      () => {}
    );
    return;
  }
  execFile('code', [pathToOpen], (err) => {
    if (!err) return;
    execFile(process.platform === 'darwin' ? 'open' : 'xdg-open', [pathToOpen], () => {});
  });
};

async function isAllowedWorkflowPath(targetPath: string): Promise<boolean> {
  const globalDir = path.join(homedir(), '.agents', 'workflows');
  if (isPathInside(targetPath, globalDir)) return true;
  const conns = await getAllConnections().catch(() => []);
  for (const conn of conns) {
    if (conn.workspace && isPathInside(targetPath, path.join(uriToFsPath(conn.workspace), '.agents', 'workflows'))) {
      return true;
    }
  }
  const convs = await getDynamicConversations().catch(() => []);
  for (const conv of convs) {
    if (conv.workspace && isPathInside(targetPath, path.join(uriToFsPath(conv.workspace), '.agents', 'workflows'))) {
      return true;
    }
  }
  return false;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'create') {
      const { workspace, name, description } = body;
      if (!workspace || !name) throw new Error('Workspace and name are required');
      if (!isSafeId(name)) {
        return NextResponse.json({ error: 'Invalid workflow name' }, { status: 400 });
      }

      const wsPath = uriToFsPath(workspace);
      if (!isPathInside(wsPath, homedir())) {
        const conns = await getAllConnections().catch(() => []);
        if (!conns.some(c => c.workspace && isPathInside(wsPath, uriToFsPath(c.workspace)))) {
          return NextResponse.json({ error: 'Forbidden workspace path' }, { status: 403 });
        }
      }
      const workflowsDir = path.join(wsPath, '.agents', 'workflows');
      if (!existsSync(workflowsDir)) mkdirSync(workflowsDir, { recursive: true });

      const filepath = path.join(workflowsDir, `${name}.md`);
      if (!isPathInside(filepath, workflowsDir)) {
        return NextResponse.json({ error: 'Invalid workflow path' }, { status: 400 });
      }
      if (existsSync(filepath)) throw new Error('Workflow already exists');

      const content = `---
description: ${description || ''}
---

# ${name}

Write your workflow steps here...
`;
      writeFileSync(filepath, content, 'utf-8');
      
      openFileInEditor(filepath);
      
      return NextResponse.json({ success: true, path: filepath });
    }

    if (action === 'open') {
      const filepath = body.filepath ? uriToFsPath(body.filepath) : '';
      if (!filepath || !existsSync(filepath)) throw new Error('File not found at: ' + filepath);
      if (!(await isAllowedWorkflowPath(filepath))) {
        return NextResponse.json({ error: 'Forbidden workflow path' }, { status: 403 });
      }
      openFileInEditor(filepath);
      return NextResponse.json({ success: true });
    }

    if (action === 'promote') {
      const filepath = body.filepath ? uriToFsPath(body.filepath) : '';
      if (!filepath || !existsSync(filepath)) throw new Error('File not found at: ' + filepath);
      if (!(await isAllowedWorkflowPath(filepath))) {
        return NextResponse.json({ error: 'Forbidden workflow path' }, { status: 403 });
      }

      const globalDir = path.join(homedir(), '.agents', 'workflows');
      if (!existsSync(globalDir)) mkdirSync(globalDir, { recursive: true });

      const filename = path.basename(filepath);
      if (!isSafeId(filename)) {
        return NextResponse.json({ error: 'Invalid workflow filename' }, { status: 400 });
      }
      const destPath = path.join(globalDir, filename);

      copyFileSync(filepath, destPath);
      rmSync(filepath);

      return NextResponse.json({ success: true, path: destPath });
    }

    if (action === 'delete') {
      const filepath = body.filepath ? uriToFsPath(body.filepath) : '';
      if (!filepath || !existsSync(filepath)) throw new Error('File not found at: ' + filepath);
      if (!(await isAllowedWorkflowPath(filepath))) {
        return NextResponse.json({ error: 'Forbidden workflow path' }, { status: 403 });
      }
      rmSync(filepath);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
