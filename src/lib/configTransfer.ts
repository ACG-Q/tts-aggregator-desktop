import {
  newId, normalizeBaseUrl, normalizeAppPrefs, normalizeSynth,
  type ApiVersion, type AppPrefs, type Health, type NodeSource,
  type SynthSettings, type TtsNode,
} from '../types/models';

export const CONFIG_VERSION = 1;

export interface ConfigNode {
  name: string;
  url: string;
  source: NodeSource;
  health: Health;
  keyless: boolean;
  apiVersion: ApiVersion;
  defaultVoice: string;
  voiceCount: number;
}

export interface ConfigFile {
  version: 1;
  exportedAt: string;
  count: number;
  settings: { synth: SynthSettings; appPrefs: AppPrefs };
  nodes: ConfigNode[];
}

const HEALTHS: Health[] = ['OK', 'FAIL', 'UNKNOWN'];
const VERSIONS: ApiVersion[] = ['V1', 'LEGACY', 'UNKNOWN'];
const SOURCES: NodeSource[] = ['manual', 'fofa', 'zoomeye'];

export function buildConfigFile(
  nodes: TtsNode[],
  synth: SynthSettings,
  appPrefs: AppPrefs,
  now: number = Date.now(),
): ConfigFile {
  const exported = nodes.map((n) => ({
    name: n.label,
    url: n.baseUrl,
    source: n.source,
    health: n.health,
    keyless: n.keyless,
    apiVersion: n.apiVersion,
    defaultVoice: n.defaultVoice,
    voiceCount: n.voiceCount,
  }));
  return {
    version: 1,
    exportedAt: new Date(now).toISOString(),
    count: exported.length,
    settings: { synth, appPrefs },
    nodes: exported,
  };
}

function parseNode(raw: unknown, index: number): ConfigNode {
  if (typeof raw !== 'object' || raw === null) throw new Error(`第 ${index + 1} 个节点格式错误`);
  const o = raw as Record<string, unknown>;
  const url = typeof o.url === 'string' ? normalizeBaseUrl(o.url) : '';
  if (!url) throw new Error(`第 ${index + 1} 个节点缺少 URL`);
  return {
    name: typeof o.name === 'string' ? o.name : url,
    url,
    source: SOURCES.includes(o.source as NodeSource) ? o.source as NodeSource : 'manual',
    health: HEALTHS.includes(o.health as Health) ? o.health as Health : 'UNKNOWN',
    keyless: typeof o.keyless === 'boolean' ? o.keyless : false,
    apiVersion: VERSIONS.includes(o.apiVersion as ApiVersion) ? o.apiVersion as ApiVersion : 'UNKNOWN',
    defaultVoice: typeof o.defaultVoice === 'string' ? o.defaultVoice : '',
    voiceCount: typeof o.voiceCount === 'number' && o.voiceCount >= 0 ? o.voiceCount : 0,
  };
}

export function parseConfigFile(raw: string): ConfigFile {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('JSON 解析失败，请选择有效的配置文件');
  }
  if (typeof data !== 'object' || data === null) throw new Error('配置文件格式错误');
  const o = data as Record<string, unknown>;
  if (o.version !== CONFIG_VERSION) throw new Error('配置版本不兼容');
  if (!Array.isArray(o.nodes)) throw new Error('配置文件缺少 nodes 数组');
  const settings = (typeof o.settings === 'object' && o.settings !== null
    ? o.settings
    : {}) as Record<string, unknown>;
  return {
    version: 1,
    exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : new Date(0).toISOString(),
    count: o.nodes.length,
    settings: {
      synth: normalizeSynth(settings.synth),
      appPrefs: normalizeAppPrefs(settings.appPrefs),
    },
    nodes: o.nodes.map(parseNode),
  };
}

export function mergeImportedNode(existing: TtsNode | undefined, n: ConfigNode): TtsNode {
  if (existing) {
    return {
      ...existing,
      label: n.name || existing.label,
      health: n.health,
      apiVersion: n.apiVersion,
      defaultVoice: n.defaultVoice,
      voiceCount: n.voiceCount,
      failCount: 0,
      cooldownUntil: 0,
    };
  }
  return {
    id: newId(),
    baseUrl: n.url,
    label: n.name || n.url,
    keyless: n.keyless,
    apiKey: null,
    health: n.health,
    lastChecked: 0,
    defaultVoice: n.defaultVoice,
    voiceCount: n.voiceCount,
    failCount: 0,
    cooldownUntil: 0,
    disabled: false,
    apiVersion: n.apiVersion,
    source: n.source,
  };
}
