import { NextResponse } from 'next/server';
import { discoverLanguageServers } from '@/lib/bridge/gateway';

export const dynamic = 'force-dynamic';

export async function GET() {
  const servers = await discoverLanguageServers();
  return NextResponse.json(
    servers.map(({ pid, port, workspace }) => ({ pid, port, workspace }))
  );
}
