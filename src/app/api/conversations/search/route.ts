import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import util from 'util';
import path from 'path';
import os from 'os';
import * as fs from 'fs';

const execFileAsync = util.promisify(execFile);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  
  if (!q || q.trim().length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const convDir = path.join(os.homedir(), '.gemini', 'antigravity', 'conversations');
    if (!fs.existsSync(convDir)) {
      return NextResponse.json({ results: [] });
    }
    
    // Get all .pb files safely using Node.js
    const files = fs.readdirSync(convDir).filter(f => f.endsWith('.pb'));
    if (files.length === 0) {
      // Antigravity 2.0 stores conversations in conversation_summaries.db / *.db
      const { readConversationSummariesDb } = await import('@/lib/bridge/statedb');
      const needle = q.trim().toLowerCase();
      const summaryMatches = readConversationSummariesDb()
        .filter(s => !s.killed && (s.title.toLowerCase().includes(needle) || s.preview.toLowerCase().includes(needle)))
        .map(s => ({
          id: s.id,
          snippets: [s.title || s.preview].filter(Boolean),
        }));
      return NextResponse.json({ success: true, results: summaryMatches });
    }

    // Use child_process.execFile with `--` to prevent option injection;
    // fall back to Node binary/text scan when `grep` is unavailable (e.g. Windows).
    const snippets: Record<string, string[]> = {};
    const qLower = q.toLowerCase();
    const pushCleanSnippet = (id: string, rawText: string) => {
      const cleanSnippet = rawText.replace(/[^\x20-\x7E\u4e00-\u9fa5]/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleanSnippet.length > 0 && cleanSnippet.toLowerCase().includes(qLower)) {
        if (!snippets[id]) snippets[id] = [];
        if (snippets[id].length >= 2) return;
        const idx = cleanSnippet.toLowerCase().indexOf(qLower);
        const start = Math.max(0, idx - 40);
        const end = Math.min(cleanSnippet.length, idx + q.length + 40);
        snippets[id].push((start > 0 ? '...' : '') + cleanSnippet.substring(start, end) + (end < cleanSnippet.length ? '...' : ''));
      }
    };

    let stdout = '';
    let usedNodeFallback = false;
    try {
      const { stdout: out } = await execFileAsync('grep', ['-a', '-i', '-H', '-m', '2', '--', q, ...files], {
        cwd: convDir,
        timeout: 5000
      });
      stdout = out;
    } catch (err: any) {
      if (err.code === 1) {
        stdout = '';
      } else if (err.code === 'ENOENT') {
        usedNodeFallback = true;
      } else {
        usedNodeFallback = true;
      }
    }

    const matchedIds = new Set<string>();
    if (usedNodeFallback) {
      for (const file of files) {
        try {
          const buf = fs.readFileSync(path.join(convDir, file));
          const text = buf.toString('utf8');
          const lower = text.toLowerCase();
          let pos = lower.indexOf(qLower);
          if (pos === -1) continue;
          const id = file.replace('.pb', '');
          matchedIds.add(id);
          let count = 0;
          while (pos !== -1 && count < 2) {
            const slice = text.slice(Math.max(0, pos - 80), Math.min(text.length, pos + q.length + 80));
            pushCleanSnippet(id, slice);
            count++;
            pos = lower.indexOf(qLower, pos + qLower.length);
          }
        } catch { /* skip unreadable file */ }
      }
    } else if (stdout.trim()) {
      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        if (!line) continue;
        const separatorIdx = line.indexOf(':');
        if (separatorIdx === -1) continue;
        const file = line.slice(0, separatorIdx);
        const text = line.slice(separatorIdx + 1);
        if (!file.endsWith('.pb')) continue;
        const id = file.replace('.pb', '');
        matchedIds.add(id);
        pushCleanSnippet(id, text);
      }
    }

    if (matchedIds.size === 0) {
      return NextResponse.json({ results: [] });
    }

    return NextResponse.json({ 
      success: true, 
      results: Array.from(matchedIds).map(id => ({ id, snippets: snippets[id] || [] })) 
    });

  } catch (error: any) {
    console.error('Search API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
