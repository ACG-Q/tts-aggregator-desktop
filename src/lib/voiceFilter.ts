import type { Voice } from '../types/models';
import { voiceDisplayName } from './voices';

export type LanguageBucket = 'zh' | 'en' | 'ja' | 'ko' | 'other';

export const LANGUAGE_OPTIONS: { value: LanguageBucket | 'all'; label: string }[] = [  { value: 'all', label: '全部' },
  { value: 'zh', label: '中文' },
  { value: 'en', label: '英语' },
  { value: 'ja', label: '日语' },
  { value: 'ko', label: '韩语' },
  { value: 'other', label: '其他' },
];

export const LANGUAGE_LABELS: Record<LanguageBucket, string> = {
  zh: '中文',
  en: '英语',
  ja: '日语',
  ko: '韩语',
  other: '其他语言',
};

export interface VoiceFilterInput {
  query: string;
  language: LanguageBucket | 'all';
  gender: '' | 'Female' | 'Male';
}

export function languageBucket(locale: string): LanguageBucket {
  const l = locale.toLowerCase();
  if (l.startsWith('zh')) return 'zh';
  if (l.startsWith('en')) return 'en';
  if (l.startsWith('ja')) return 'ja';
  if (l.startsWith('ko')) return 'ko';
  return 'other';
}

export function filterVoices(voices: Voice[], filter: VoiceFilterInput): Voice[] {
  const q = filter.query.trim().toLowerCase();
  return voices.filter((v) => {
    if (filter.language !== 'all' && languageBucket(v.locale) !== filter.language) return false;
    if (filter.gender && v.gender !== filter.gender) return false;
    if (!q) return true;
    return voiceDisplayName(v).toLowerCase().includes(q) || v.id.toLowerCase().includes(q);
  });
}

export interface VoiceGroup {
  bucket: LanguageBucket;
  label: string;
  voices: Voice[];
}
const BUCKET_ORDER: Record<LanguageBucket, number> = {
  zh: 0, en: 1, ja: 2, ko: 3, other: 4,
};

/** 按语言优先级（中文在前）再按名称排序，保证分页切片时中文不会被挤到后面。 */
export function sortVoicesByLanguage(voices: Voice[]): Voice[] {
  return [...voices].sort((a, b) => {
    const order = BUCKET_ORDER[languageBucket(a.locale)] - BUCKET_ORDER[languageBucket(b.locale)];
    if (order !== 0) return order;
    return voiceDisplayName(a).localeCompare(voiceDisplayName(b)) || a.locale.localeCompare(b.locale);
  });
}

export function groupByLanguage(voices: Voice[]): VoiceGroup[] {
  const map = new Map<LanguageBucket, Voice[]>();
  for (const v of voices) {
    const bucket = languageBucket(v.locale);
    const list = map.get(bucket);
    if (list) list.push(v);
    else map.set(bucket, [v]);
  }
  const groups: VoiceGroup[] = [...map.entries()].map(([bucket, list]) => ({
    bucket,
    label: LANGUAGE_LABELS[bucket],
    voices: [...list].sort((a, b) =>
      voiceDisplayName(a).localeCompare(voiceDisplayName(b)) || a.locale.localeCompare(b.locale)),
  }));
  return groups.sort((a, b) => {
    if (a.bucket === 'zh') return -1;
    if (b.bucket === 'zh') return 1;
    return b.voices.length - a.voices.length || a.bucket.localeCompare(b.bucket);
  });
}

export const RECENT_KEY = 'voice_recent';
const RECENT_LIMIT = 8;

interface ReadableStorage {
  getItem(key: string): string | null;
}

interface WritableStorage extends ReadableStorage {
  setItem(key: string, value: string): void;
}

export function readRecentVoices(storage: ReadableStorage): string[] {
  try {
    const raw = storage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((x): x is string => typeof x === 'string'))].slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

export function pushRecentVoice(storage: WritableStorage, id: string): string[] {
  const next = [id, ...readRecentVoices(storage).filter((x) => x !== id)].slice(0, RECENT_LIMIT);
  try {
    storage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* 存储禁用时只返回内存结果 */
  }
  return next;
}
