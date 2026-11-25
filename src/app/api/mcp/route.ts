import { NextResponse } from 'next/server';
import path from 'path';
import { homedir } from 'os';
import { readFileSync } from 'fs';

export const dynamic = 'force-dynamic';

function redactEnv(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactEnv);
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'env' && v && typeof v === 'object' && !Array.isArray(v)) {
      const masked: Record<string, string> = {};
      for (const [ek, ev] of Object.entries(v)) {
        const s = String(ev ?? '');
        masked[ek] = /key|token|secret|pass|auth/i.test(ek) && s.length > 4
          ? `${s.slice(0, 2)}****${s.slice(-2)}`
          : s;
      }
      out[k] = masked;
    } else {
      out[k] = redactEnv(v);
    }
  }
  return out;
}

export async function GET() {
  const mcpPath = path.join(homedir(), '.gemini/antigravity/mcp_config.json');
  try {
    const content = readFileSync(mcpPath, 'utf-8');
    if (!content.trim()) return NextResponse.json({ servers: [] });
    return NextResponse.json(redactEnv(JSON.parse(content)));
  } catch {
    return NextResponse.json({ servers: [] });
  }
}
