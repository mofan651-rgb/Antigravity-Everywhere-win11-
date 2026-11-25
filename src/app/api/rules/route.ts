import { NextResponse } from 'next/server';
import { getAllConnections, getDynamicConversations, grpc, normalizeWorkspaceUri } from '@/lib/bridge/gateway';
import { uriToFsPath, isPathInside, isSafeId } from '@/lib/bridge/path-utils';
import fs, { existsSync, mkdirSync, copyFileSync, rmSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { execFile } from 'child_process';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { getGlobalItems } = await import('@/lib/global-agents');
    const globalRules = getGlobalItems('rules');
    
    const conns = await getAllConnections();
    const ruleMap = new Map<string, any>();
    
    // Seed with global rules first
    for (const rule of globalRules) {
      ruleMap.set(rule.name, rule);
    }

    const wsUris = new Set<string>();
    for (const conn of conns) {
      if (conn.workspace) wsUris.add(normalizeWorkspaceUri(conn.workspace));
    }
    try {
      const convs = await getDynamicConversations();
      for (const c of convs) {
        if (c.workspace) wsUris.add(normalizeWorkspaceUri(c.workspace));
      }
    } catch {}

    for (const wsUri of wsUris) {
      if (!wsUri) continue;
      const wsPath = uriToFsPath(wsUri);

      // 1. Manually parse local rules from `.agents/rules.md` and `.agents/rules/*.md`
      const tryAddRule = (filepath: string, defaultName: string) => {
        if (!existsSync(filepath)) return;
        try {
          const content = fs.readFileSync(filepath, 'utf-8');
          const name = path.basename(filepath, '.md');
          const descMatch = content.match(/^description:\s*(.*)$/m);
          const key = filepath;
          if (!ruleMap.has(key)) {
            ruleMap.set(key, {
              name: name === 'rules' ? defaultName : name,
              description: descMatch ? descMatch[1].trim() : '',
              path: filepath,
              content,
              scope: 'workspace',
              baseDir: path.dirname(filepath),
              workspace: wsUri
            });
          }
        } catch(e) {}
      };

      try {
        tryAddRule(path.join(wsPath, '.agents', 'rules.md'), 'project-rules');
        tryAddRule(path.join(wsPath, '.cursorrules'), 'cursor-rules');
        tryAddRule(path.join(wsPath, '.clinerules'), 'cline-rules');
        
        const rulesDir = path.join(wsPath, '.agents', 'rules');
        if (existsSync(rulesDir) && fs.statSync(rulesDir).isDirectory()) {
          const files = fs.readdirSync(rulesDir);
          for (const file of files) {
            if (file.endsWith('.md')) {
              tryAddRule(path.join(rulesDir, file), file.replace('.md', ''));
            }
          }
        }
      } catch(e) { console.error('Error reading local rules', e) }
    }

    for (const conn of conns) {
      // 2. Try gRPC as fallback
      try {
        const data = await grpc.getAllRules(conn.port, conn.csrf);
        if (data?.rules) {
          for (const rule of data.rules) {
            const key = rule.path || rule.name || JSON.stringify(rule);
            if (!ruleMap.has(key)) {
              ruleMap.set(key, {
                name: rule.name || '',
                description: rule.description || '',
                path: rule.path || '',
                content: rule.content || '',
                scope: rule.scope?.globalScope ? 'global' : 'workspace',
                baseDir: rule.baseDir || '',
                workspace: (conn as any).workspace || '',
              });
            }
          }
        }
      } catch {}
    }
    return NextResponse.json([...ruleMap.values()]);
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

async function getKnownWorkspaceRoots(): Promise<string[]> {
  const roots = new Set<string>();
  const conns = await getAllConnections().catch(() => []);
  for (const conn of conns) {
    if (conn.workspace) roots.add(uriToFsPath(conn.workspace));
  }
  const convs = await getDynamicConversations().catch(() => []);
  for (const conv of convs) {
    if (conv.workspace) roots.add(uriToFsPath(conv.workspace));
  }
  return [...roots];
}

async function isAllowedRulePath(targetPath: string): Promise<boolean> {
  const globalDir = path.join(homedir(), '.agents', 'rules');
  if (isPathInside(targetPath, globalDir)) return true;
  if (path.resolve(targetPath) === path.resolve(path.join(homedir(), '.agents', 'rules.md'))) return true;
  const wsRoots = await getKnownWorkspaceRoots();
  for (const wsPath of wsRoots) {
    if (
      isPathInside(targetPath, path.join(wsPath, '.agents', 'rules')) ||
      path.resolve(targetPath) === path.resolve(path.join(wsPath, '.agents', 'rules.md')) ||
      path.resolve(targetPath) === path.resolve(path.join(wsPath, '.cursorrules')) ||
      path.resolve(targetPath) === path.resolve(path.join(wsPath, '.clinerules'))
    ) {
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

      const wsPath = uriToFsPath(workspace);
      if (!isPathInside(wsPath, homedir())) {
        const wsRoots = await getKnownWorkspaceRoots();
        if (!wsRoots.some(r => isPathInside(wsPath, r))) {
          return NextResponse.json({ error: 'Forbidden workspace path' }, { status: 403 });
        }
      }
      const rulesDir = path.join(wsPath, '.agents', 'rules');
      if (!existsSync(rulesDir)) mkdirSync(rulesDir, { recursive: true });

      const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
      if (!safeName || !isSafeId(safeName)) {
        return NextResponse.json({ error: 'Invalid rule name' }, { status: 400 });
      }
      const filepath = path.join(rulesDir, `${safeName}.md`);
      if (!isPathInside(filepath, rulesDir)) {
        return NextResponse.json({ error: 'Invalid rule path' }, { status: 400 });
      }
      if (existsSync(filepath)) throw new Error('Rule already exists');

      const content = `---
description: ${description || ''}
---

# ${name}

Write your custom rule guidelines here...
`;
      writeFileSync(filepath, content, 'utf-8');
      
      openFileInEditor(filepath);
      
      return NextResponse.json({ success: true, path: filepath });
    }

    if (action === 'open') {
      const filepath = body.filepath ? uriToFsPath(body.filepath) : '';
      if (!filepath || !existsSync(filepath)) throw new Error('File not found at: ' + filepath);
      if (!(await isAllowedRulePath(filepath))) {
        return NextResponse.json({ error: 'Forbidden rule path' }, { status: 403 });
      }
      openFileInEditor(filepath);
      return NextResponse.json({ success: true });
    }

    if (action === 'promote') {
      const filepath = body.filepath ? uriToFsPath(body.filepath) : '';
      if (!filepath || !existsSync(filepath)) throw new Error('File not found at: ' + filepath);
      if (!(await isAllowedRulePath(filepath))) {
        return NextResponse.json({ error: 'Forbidden rule path' }, { status: 403 });
      }

      const globalDir = path.join(homedir(), '.agents', 'rules');
      if (!existsSync(globalDir)) mkdirSync(globalDir, { recursive: true });

      const filename = path.basename(filepath);
      if (!isSafeId(filename)) {
        return NextResponse.json({ error: 'Invalid rule filename' }, { status: 400 });
      }
      const destPath = path.join(globalDir, filename);

      copyFileSync(filepath, destPath);
      rmSync(filepath);

      return NextResponse.json({ success: true, path: destPath });
    }

    if (action === 'delete') {
      const filepath = body.filepath ? uriToFsPath(body.filepath) : '';
      if (!filepath || !existsSync(filepath)) throw new Error('File not found at: ' + filepath);
      if (!(await isAllowedRulePath(filepath))) {
        return NextResponse.json({ error: 'Forbidden rule path' }, { status: 403 });
      }
      rmSync(filepath);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
