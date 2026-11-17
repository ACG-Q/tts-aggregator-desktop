// 内置音色库来源：tts-aggregator-android/app/src/main/assets/voices.json。
// 同步时整份覆盖，不要手改 JSON 内容。
import type { Voice } from '../types/models';
import { parseVoices } from './voices';

let cache: Voice[] | null = null;
let loading: Promise<Voice[]> | null = null;

/** 懒加载内置音色库；Vite 会把 voices.json 拆成独立 chunk。 */
export async function loadBuiltinVoices(): Promise<Voice[]> {
  if (cache) return cache;
  if (loading) return loading;
  loading = (async () => {
    try {
      const mod = await import('../assets/voices.json');
      cache = parseVoices(mod.default);
    } catch (e) {
      console.error('读取内置音色失败', e);
      cache = [];
    } finally {
      loading = null;
    }
    return cache;
  })();
  return loading;
}

/** 去变音符并保留各语言字母：`Hoài My` → `hoaimy`。 */
function normalizeName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** 基础人名：取首个词并规范化，用于跨 id 匹配内置翻译。 */
function baseName(v: Voice): string {
  return normalizeName((v.localName || v.name).trim().split(/\s+/)[0] ?? '');
}

/** id 去掉变体后缀与 Neural，用于跨版本匹配内置翻译。 */
function idStem(id: string): string {
  return id.split(':')[0].replace(/Neural$/i, '').toLowerCase();
}

/**
 * 远端列表补中文翻译：先按 id 精确匹配，再按去后缀的 id、最后按基础人名匹配；
 * 远端已有的翻译优先保留（与安卓 VoiceRepository 一致）。
 */
export function mergeVoiceTranslations(remote: Voice[], builtin: Voice[]): Voice[] {
  if (builtin.length === 0) return remote;
  const byId = new Map(builtin.map((v) => [v.id, v]));
  const byIdStem = new Map<string, Voice>();
  const byBase = new Map<string, Voice>();
  for (const v of builtin) {
    if (!v.nameZh) continue;
    const stem = idStem(v.id);
    if (stem && !byIdStem.has(stem)) byIdStem.set(stem, v);
    const key = baseName(v);
    if (key && !byBase.has(key)) byBase.set(key, v);
  }
  return remote.map((voice) => {
    if (voice.nameZh && voice.introZh) return voice;
    const match = byId.get(voice.id)
      ?? byIdStem.get(idStem(voice.id))
      ?? byBase.get(baseName(voice));
    if (!match) return voice;
    return {
      ...voice,
      nameZh: voice.nameZh || match.nameZh || undefined,
      introZh: voice.introZh || match.introZh || undefined,
    };
  });
}
