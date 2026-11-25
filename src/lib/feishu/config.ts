import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { atomicWriteFileSync } from '@/lib/bridge/path-utils';

const CONFIG_PATH = join(homedir(), '.gemini', 'antigravity', 'feishu-config.json');
const WS_BOT_DIR = join(homedir(), '.gemini', 'antigravity', 'workspace-bots');

function backupCorruptJson(filePath: string) {
  try {
    if (existsSync(filePath)) {
      const backup = `${filePath}.corrupt-${Date.now()}`;
      copyFileSync(filePath, backup);
      console.error(`[FeishuConfig] Backed up corrupt config to ${backup}`);
    }
  } catch {}
}

export interface FeishuConfig {
  appId: string;
  appSecret: string;
  showThoughts?: boolean;
}

export interface WorkspaceBotConfig extends FeishuConfig {
  workspaceUri: string;   // e.g. "file:///Users/hanyi/Projects/MyApp"
  label?: string;         // friendly name, e.g. "前端专属机器人"
  preferredModel?: string; // e.g. "MODEL_PLACEHOLDER_M26" — overrides global default for this bot
  enabled: boolean;
}

export interface AllBotsConfig {
  global: FeishuConfig;
  workspaceBots: WorkspaceBotConfig[];
}

// --- Global config (backward compat) ---
export const feishuConfigStore = {
  get(): FeishuConfig {
    if (!existsSync(CONFIG_PATH)) {
      return { appId: '', appSecret: '', showThoughts: false };
    }
    try {
      const parsed = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
      return {
        appId: parsed.appId || '',
        appSecret: parsed.appSecret || '',
        showThoughts: Boolean(parsed.showThoughts),
      };
    } catch (e) {
      console.error('Failed to parse feishu config', e);
      backupCorruptJson(CONFIG_PATH);
      return { appId: '', appSecret: '', showThoughts: false };
    }
  },

  set(config: FeishuConfig) {
    try {
      mkdirSync(dirname(CONFIG_PATH), { recursive: true });
      const prev = this.get();
      const next: FeishuConfig = {
        appId: config.appId ?? prev.appId,
        appSecret: config.appSecret ?? prev.appSecret,
        showThoughts: config.showThoughts !== undefined ? Boolean(config.showThoughts) : Boolean(prev.showThoughts),
      };
      atomicWriteFileSync(CONFIG_PATH, JSON.stringify(next, null, 2));
    } catch (e) {
      console.error('Failed to save feishu config', e);
    }
  }
};

// --- Workspace-level bot configs ---
function getWsBotsPath() {
  return join(WS_BOT_DIR, 'bots.json');
}

export const workspaceBotStore = {
  /** Get all workspace bot configs */
  getAll(): WorkspaceBotConfig[] {
    const p = getWsBotsPath();
    if (!existsSync(p)) return [];
    try {
      return JSON.parse(readFileSync(p, 'utf-8'));
    } catch (e) {
      console.error('Failed to parse workspace bots config', e);
      backupCorruptJson(p);
      return [];
    }
  },

  /** Save entire list */
  saveAll(bots: WorkspaceBotConfig[]) {
    try {
      mkdirSync(WS_BOT_DIR, { recursive: true });
      atomicWriteFileSync(getWsBotsPath(), JSON.stringify(bots, null, 2));
    } catch (e) {
      console.error('Failed to save workspace bots', e);
    }
  },

  /** Upsert a bot config keyed by appId (allows multiple bots per workspace) */
  upsert(config: WorkspaceBotConfig) {
    const bots = this.getAll();
    const idx = bots.findIndex(b => b.appId === config.appId);
    if (idx >= 0) {
      bots[idx] = config;
    } else {
      bots.push(config);
    }
    this.saveAll(bots);
  },

  /** Remove bot config by appId */
  remove(appId: string) {
    const bots = this.getAll().filter(b => b.appId !== appId);
    this.saveAll(bots);
  },

  /** Get all bot configs for a specific workspace */
  getAllByWorkspace(workspaceUri: string): WorkspaceBotConfig[] {
    return this.getAll().filter(b => b.workspaceUri === workspaceUri && b.enabled);
  },

  /** Get first bot config for a specific workspace */
  getByWorkspace(workspaceUri: string): WorkspaceBotConfig | undefined {
    return this.getAll().find(b => b.workspaceUri === workspaceUri);
  },

  /** Lookup bot by appId */
  getByAppId(appId: string): WorkspaceBotConfig | undefined {
    return this.getAll().find(b => b.appId === appId);
  }
};
