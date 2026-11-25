import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { atomicWriteFileSync } from '@/lib/bridge/path-utils';

const STORE_PATH = join(homedir(), '.gemini', 'antigravity', 'feishu-chats.json');

export type ChatState = 'idle' | 'selecting_workspace' | 'selecting_history' | 'selecting_workspace_history' | 'selecting_model' | 'selecting_delegation' | 'inputting_new_project_name' | 'selecting_new_project_mode';

export interface FeishuUserSession {
  activeCascadeId?: string;
  state: ChatState;
  workspacesCache?: string[]; // Temp cache for numbered selection
  historyCache?: string[];    // Temp cache for numbered selection
  modelsCache?: string[];     // Temp cache for model selection
  preferredModel?: string;    // User's globally preferred model ID
  unionId?: string;           // User's cross-app union ID
  pendingWorkspaceUri?: string; // Cache for delegation flow
  pendingProjectName?: string; // Track new project creation flow
  botAppId?: string;          // Application ID of the bot handling this session
}

function backupCorruptFile(filePath: string) {
  try {
    if (existsSync(filePath)) {
      const backup = `${filePath}.corrupt-${Date.now()}`;
      copyFileSync(filePath, backup);
      console.error(`[FeishuStore] Backed up corrupt file to ${backup}`);
    }
  } catch {}
}

export const feishuStore = {
  load(): Record<string, FeishuUserSession> {
    if (!existsSync(STORE_PATH)) return {};
    try {
      return JSON.parse(readFileSync(STORE_PATH, 'utf-8'));
    } catch (e) {
      console.error('Failed to parse feishu store, backing up corrupt file', e);
      backupCorruptFile(STORE_PATH);
      return {};
    }
  },

  save(data: Record<string, FeishuUserSession>) {
    try {
      mkdirSync(dirname(STORE_PATH), { recursive: true });
      atomicWriteFileSync(STORE_PATH, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('Failed to save feishu store', e);
    }
  },

  getSession(openId: string): FeishuUserSession {
    const data = this.load();
    return data[openId] || { state: 'idle' };
  },

  updateSession(openId: string, session: Partial<FeishuUserSession>) {
    const data = this.load();
    data[openId] = { ...(data[openId] || { state: 'idle' }), ...session };
    this.save(data);
  }
};
