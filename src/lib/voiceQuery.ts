import type { Voice } from '../types/models';
import { voiceDisplayName } from './voices';

/** 音色选择器筛选：常用 / 全部 / 中文 / 指定语言。 */
export type VoiceFilter =
  | { kind: 'frequent' }
  | { kind: 'all' }
  | { kind: 'chinese' }
  | { kind: 'language'; code: string };

export const FREQUENT_FILTER: VoiceFilter = { kind: 'frequent' };
export const ALL_FILTER: VoiceFilter = { kind: 'all' };
export const CHINESE_FILTER: VoiceFilter = { kind: 'chinese' };

const LANG_LABELS: Record<string, string> = {
  zh: '中文', en: '英语', ja: '日语', ko: '韩语', fr: '法语', de: '德语',
  es: '西班牙语', pt: '葡萄牙语', ru: '俄语', ar: '阿拉伯语', hi: '印地语',
  th: '泰语', vi: '越南语', it: '意大利语', nl: '荷兰语', pl: '波兰语',
  tr: '土耳其语', sv: '瑞典语', da: '丹麦语', nb: '挪威语', fi: '芬兰语',
  cs: '捷克语', sk: '斯洛伐克语', hu: '匈牙利语', ro: '罗马尼亚语',
  bg: '保加利亚语', el: '希腊语', he: '希伯来语', fa: '波斯语', ur: '乌尔都语',
  bn: '孟加拉语', ta: '泰米尔语', te: '泰卢固语', kn: '卡纳达语',
  ml: '马拉雅拉姆语', mr: '马拉地语', gu: '古吉拉特语', pa: '旁遮普语',
  ne: '尼泊尔语', si: '僧伽罗语', km: '高棉语', lo: '老挝语', my: '缅甸语',
  id: '印尼语', ms: '马来语', fil: '菲律宾语', sw: '斯瓦希里语',
  sq: '阿尔巴尼亚语', hr: '克罗地亚语', sr: '塞尔维亚语', sl: '斯洛文尼亚语',
  et: '爱沙尼亚语', lv: '拉脱维亚语', lt: '立陶宛语', uk: '乌克兰语',
  az: '阿塞拜疆语', ka: '格鲁吉亚语', hy: '亚美尼亚语', ca: '加泰罗尼亚语',
  eu: '巴斯克语', is: '冰岛语', af: '南非荷兰语', am: '阿姆哈拉语',
  be: '白俄罗斯语', bs: '波斯尼亚语', cy: '威尔士语', ga: '爱尔兰语',
  gl: '加利西亚语', jv: '爪哇语', mk: '马其顿语', mn: '蒙古语', ps: '普什图语',
  uz: '乌兹别克语', zu: '祖鲁语', ht: '海地克里奥尔语', rw: '卢旺达语',
  yo: '约鲁巴语', sn: '绍纳语', so: '索马里语', xh: '科萨语', ig: '伊博语',
  as: '阿萨姆语', iu: '因纽特语', kk: '哈萨克语', mt: '马耳他语', or: '奥里亚语',
  su: '巽他语', wuu: '吴语', yue: '粤语',
};

const REGION_LABELS: Record<string, string> = {
  CN: '中国 · 简体', TW: '中国台湾 · 繁体', HK: '中国香港 · 繁体',
  MO: '中国澳门 · 繁体', SG: '新加坡', MY: '马来西亚', US: '美国', GB: '英国',
  AU: '澳大利亚', CA: '加拿大', IE: '爱尔兰', NZ: '新西兰', IN: '印度',
  PK: '巴基斯坦', BD: '孟加拉国', LK: '斯里兰卡', NP: '尼泊尔', PH: '菲律宾',
  ID: '印度尼西亚', VN: '越南', TH: '泰国', JP: '日本', KR: '韩国', FR: '法国',
  DE: '德国', AT: '奥地利', CH: '瑞士', BE: '比利时', NL: '荷兰', ES: '西班牙',
  MX: '墨西哥', AR: '阿根廷', CO: '哥伦比亚', CL: '智利', BR: '巴西',
  PT: '葡萄牙', IT: '意大利', SE: '瑞典', NO: '挪威', DK: '丹麦', FI: '芬兰',
  PL: '波兰', CZ: '捷克', SK: '斯洛伐克', HU: '匈牙利', RO: '罗马尼亚',
  BG: '保加利亚', GR: '希腊', TR: '土耳其', RU: '俄罗斯', UA: '乌克兰',
  IL: '以色列', SA: '沙特阿拉伯', AE: '阿联酋', EG: '埃及', ZA: '南非',
  NG: '尼日利亚', KE: '肯尼亚', QA: '卡塔尔', KW: '科威特', OM: '阿曼',
  BH: '巴林', JO: '约旦', LB: '黎巴嫩', IQ: '伊拉克', MA: '摩洛哥',
  DZ: '阿尔及利亚', TN: '突尼斯', ET: '埃塞俄比亚', TZ: '坦桑尼亚',
  UG: '乌干达', GH: '加纳', IS: '冰岛', HR: '克罗地亚', RS: '塞尔维亚',
  SI: '斯洛文尼亚', EE: '爱沙尼亚', LT: '立陶宛', LV: '拉脱维亚',
  AZ: '阿塞拜疆', GE: '格鲁吉亚', AM: '亚美尼亚', BY: '白俄罗斯',
  KZ: '哈萨克斯坦', UZ: '乌兹别克斯坦', AF: '阿富汗', MM: '缅甸',
  KH: '柬埔寨', LA: '老挝', MN: '蒙古', TL: '东帝汶', FJ: '斐济',
  AL: '阿尔巴尼亚', BA: '波斯尼亚和黑塞哥维那', BO: '玻利维亚',
  CR: '哥斯达黎加', CU: '古巴', DO: '多米尼加', EC: '厄瓜多尔',
  GQ: '赤道几内亚', GT: '危地马拉', HN: '洪都拉斯', IR: '伊朗', LY: '利比亚',
  MK: '北马其顿', MT: '马耳他', NI: '尼加拉瓜', PA: '巴拿马', PE: '秘鲁',
  PR: '波多黎各', PY: '巴拉圭', SO: '索马里', SV: '萨尔瓦多', SY: '叙利亚',
  UY: '乌拉圭', VE: '委内瑞拉', YE: '也门',
};

export function langLabel(code: string): string {
  return LANG_LABELS[code] ?? code;
}

export function regionLabel(code: string): string {
  return REGION_LABELS[code] ?? code;
}

export function genderLabel(gender: string): string {
  if (gender === 'Female') return '女声';
  if (gender === 'Male') return '男声';
  return gender;
}

/** locale 拆解：兼容 `zh-CN`、`iu-Cans-CA`（四字母脚本）与 `zh-CN-guangxi`（方言）。 */
export function localeLang(voice: Pick<Voice, 'locale' | 'id'>): string {
  return localeSegments(voice)[0];
}

export function localeRegion(voice: Pick<Voice, 'locale' | 'id'>): string | null {
  return localeSegments(voice)[1];
}

function localeSegments(voice: Pick<Voice, 'locale' | 'id'>): [string, string | null] {
  const raw = voice.locale || voice.id;
  const parts = raw.split('-');
  let region: string | null = null;
  if (parts.length >= 3 && parts[1].length === 4) region = parts[2];
  else if (parts.length >= 2) region = parts[1];
  return [parts[0] ?? '', region];
}

/**
 * 同名音色的版本标记，依据 short_name 后缀推导。
 * 与安卓端保持一致，并补充 MAI-Voice 系列的版本号。
 */
export function variantTag(id: string): string {
  if (/Multilingual/i.test(id)) return '多语种';
  if (/Dialects/i.test(id)) return '方言';
  if (/DragonHDFlashLatest/i.test(id)) return '高清闪速';
  if (/DragonHDOmniLatest/i.test(id)) return '高清全能';
  if (/DragonHDLatest|:DragonHD/i.test(id)) return '高清';
  if (/DragonLatest|:Dragon/i.test(id)) return '龙系列';
  if (/MAI-Voice-2\.1-Flash/i.test(id)) return '2.1 闪速';
  if (/MAI-Voice-2\.1/i.test(id)) return '2.1';
  if (/MAI-Voice-2-Flash/i.test(id)) return '2.0 闪速';
  if (/MAI-Voice-2/i.test(id)) return '2.0';
  return '标准';
}

/**
 * 音色的完整显示名。
 * 只在同一语言内比较重名，避免跨语言同名时让每个标签都带上语言。
 * 语言内重名时追加版本标记；标记仍冲突时追加语言 · 地区；最后回落完整 ID。
 */
export function voiceLabel(voices: Voice[], voice: Voice): string {
  const base = voiceDisplayName(voice) || voice.id;
  const lang = localeLang(voice);
  const sameName = voices.filter(
    (v) => voiceDisplayName(v) === base && localeLang(v) === lang,
  );
  if (sameName.length <= 1) return base;

  const tag = variantTag(voice.id);
  const sameTag = sameName.filter((v) => variantTag(v.id) === tag);
  if (sameTag.length <= 1) return `${base}（${tag}）`;

  const locale = localeTag(voice);
  const sameLocale = sameTag.filter((v) => localeTag(v) === locale);
  if (sameLocale.length <= 1) return `${base}（${tag} · ${locale}）`;

  return `${base}（${tag} · ${locale} · ${voice.id}）`;
}

function localeTag(voice: Voice): string {
  const lang = langLabel(localeLang(voice));
  const region = localeRegion(voice);
  return region ? `${lang} · ${regionLabel(region)}` : lang;
}

/** 行内副标题：语言 · 地区 · 性别 · 风格数。 */
export function voiceMeta(voice: Voice): string {
  const region = localeRegion(voice);
  const styles = voice.styles?.length ?? 0;
  return [
    langLabel(localeLang(voice)),
    region ? regionLabel(region) : '',
    genderLabel(voice.gender),
    styles > 0 ? `${styles} 种风格` : '无风格',
  ].filter(Boolean).join(' · ');
}

/** 有最近记录时默认「常用」，否则默认「中文」。 */
export function defaultFilter(recentIds: string[]): VoiceFilter {
  return recentIds.length > 0 ? FREQUENT_FILTER : CHINESE_FILTER;
}

function matches(voice: Voice, filter: VoiceFilter): boolean {
  switch (filter.kind) {
    case 'frequent': return false;
    case 'chinese': return localeLang(voice) === 'zh';
    case 'all': return true;
    case 'language': return localeLang(voice) === filter.code;
  }
}

const voiceOrder = (a: Voice, b: Voice): number =>
  a.locale.localeCompare(b.locale) || voiceDisplayName(a).localeCompare(voiceDisplayName(b));

export function filterVoices(
  voices: Voice[],
  filter: VoiceFilter,
  recentIds: string[] = [],
): Voice[] {
  if (filter.kind === 'frequent') {
    const byId = new Map(voices.map((v) => [v.id, v]));
    return recentIds.map((id) => byId.get(id)).filter((v): v is Voice => Boolean(v));
  }
  return voices.filter((v) => matches(v, filter)).sort(voiceOrder);
}

/** 最近使用：当前音色 + 历史记录，去重、过滤失效 ID，最多 6 条。 */
export function recentVoiceIds(
  currentId: string,
  stored: string[],
  available: Set<string>,
): string[] {
  if (stored.length === 0) return [];
  return [currentId, ...stored]
    .filter((id) => id !== '' && available.has(id))
    .filter((id, i, list) => list.indexOf(id) === i)
    .slice(0, 6);
}

/** 应用新音色后更新最近记录：最新在前、去重、最多 max 条。 */
export function withRecent(stored: string[], appliedId: string, max = 6): string[] {
  return [appliedId, ...stored].filter((id, i, list) => list.indexOf(id) === i).slice(0, max);
}

/** 全部语言：中文第一，其余按音色数量降序。 */
export function languageOptions(voices: Voice[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const v of voices) {
    const code = localeLang(v);
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => {
    if (a[0] === 'zh') return -1;
    if (b[0] === 'zh') return 1;
    return b[1] - a[1] || a[0].localeCompare(b[0]);
  });
}

export interface ChipEntry {
  label: string;
  filter: VoiceFilter;
}

/** 顶部 chips：常用 → 全部 → 中文 → 英语 → 其余语言。 */
export function chipEntries(languages: [string, number][]): ChipEntry[] {
  const available = new Set(languages.map(([code]) => code));
  const rest = languages
    .filter(([code]) => code !== 'zh' && code !== 'en')
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const out: ChipEntry[] = [
    { label: '常用', filter: FREQUENT_FILTER },
    { label: '全部', filter: ALL_FILTER },
  ];
  if (available.has('zh')) out.push({ label: '中文', filter: CHINESE_FILTER });
  if (available.has('en')) out.push({ label: '英语', filter: { kind: 'language', code: 'en' } });
  for (const [code] of rest) out.push({ label: langLabel(code), filter: { kind: 'language', code } });
  return out;
}

/** 搜索覆盖全部音色；中文结果排在最前。 */
export function searchVoices(voices: Voice[], query: string): Voice[] {
  const q = query.trim().toLowerCase();
  if (!q) return voices;
  return voices
    .filter((v) => searchText(v).includes(q))
    .sort((a, b) => {
      const zh = (v: Voice) => (localeLang(v) === 'zh' ? 0 : 1);
      return zh(a) - zh(b) || a.locale.localeCompare(b.locale)
        || voiceDisplayName(a).localeCompare(voiceDisplayName(b));
    });
}

function searchText(voice: Voice): string {
  const region = localeRegion(voice);
  return [
    voice.nameZh ?? '',
    voice.name,
    voice.id,
    voice.localName,
    langLabel(localeLang(voice)),
    region ? regionLabel(region) : '',
  ].join(' ').toLowerCase();
}

export interface VoiceGroup {
  code: string;
  label: string;
  voices: Voice[];
}

/** 按语言分组，中文组置顶，其余按组内音色数降序。 */
export function groupVoicesByLanguage(voices: Voice[]): VoiceGroup[] {
  const groups = new Map<string, Voice[]>();
  for (const v of voices) {
    const code = localeLang(v);
    const list = groups.get(code);
    if (list) list.push(v);
    else groups.set(code, [v]);
  }
  return [...groups.entries()]
    .map(([code, list]) => ({ code, label: langLabel(code), voices: [...list].sort(voiceOrder) }))
    .sort((a, b) => {
      if (a.code === 'zh') return -1;
      if (b.code === 'zh') return 1;
      return b.voices.length - a.voices.length || a.code.localeCompare(b.code);
    });
}
