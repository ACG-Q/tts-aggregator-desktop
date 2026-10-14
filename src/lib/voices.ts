import type { Voice } from '../types/models';

const VOICE_NAME_ZH: Record<string, string> = {
  Xiaoxiao: '晓晓', Xiaochen: '晓辰', Xiaoyi: '晓伊', Xiaorui: '晓睿', Xiaozhou: '晓舟',
  Xiaomo: '晓墨', Xiaohan: '晓涵', Xiaorou: '晓柔', Xiaobei: '晓北', Xiaoni: '晓妮',
  Xiaozhen: '晓臻', Xiaoxuan: '晓萱', Xiaomeng: '晓萌', XiaobeiNeural: '晓北',
  Xiaojiao: '晓姣', Yunxi: '云希', Yunyang: '云扬', Yunxia: '云夏', Yunfeng: '云枫',
  Yunze: '云泽', Yunjian: '云健', Yunxiao: '云骁', Yunfan: '云帆', Yunyi: '云逸',
  Yunhao: '云皓', Yunjin: '云瑾', Yunrui: '云睿', HsiaoChen: '晓臻', HsiaoYu: '晓雅',
  HsiaoTing: '晓婷', YunJhe: '云哲', YunJhih: '云智', YunZe2: '云泽', HiuMaan: '晓曼',
  HiuGaai: '晓儿', HiuChi: '晓芝', HiuSik: '晓色', WanLung: '云龙', WanYiu: '云尧',
  WanNgo: '云娥', HiuChing: '晓晴', Hiufan: '晓雯', WanYi: '云逸',
};

const VOICE_SERIES_ZH: Record<string, string> = {
  Dragon: '龙', HD: '高清', Flash: '闪速', Latest: '最新版', Multilingual: '多语种',
  Instant: '即时', Turbo: '加速版', Lite: '轻量版', Pro: '专业版', Nano: '微型版',
  Standard: '标准版', Enhanced: '增强版', Natural: '自然', Fast: '快速', New: '新版',
  HighQuality: '高品质', Narrator: '旁白', Reader: '朗读', Mini: '迷你版',
};

export function voiceDisplayName(v: Pick<Voice, 'id' | 'name' | 'localName'>): string {
  const raw = v.localName || v.name;
  if (!raw) return v.id;
  let base = raw;
  for (const [key, zh] of Object.entries(VOICE_NAME_ZH)) {
    if (base.startsWith(key)) {
      base = zh + base.slice(key.length);
      break;
    }
  }
  return base.split(' ')
    .map((w) => VOICE_SERIES_ZH[w] ?? w)
    .filter((w) => w.length > 0)
    .join(' ');
}

export function parseVoices(data: unknown): Voice[] {
  if (!Array.isArray(data)) return [];
  const out: Voice[] = [];
  for (const item of data) {
    if (typeof item !== 'object' || item === null) continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.short_name === 'string' ? o.short_name : '';
    if (!id) continue;
    out.push({
      id,
      name: typeof o.display_name === 'string' ? o.display_name : '',
      localName: typeof o.local_name === 'string' ? o.local_name : '',
      gender: typeof o.gender === 'string' ? o.gender : '',
      locale: typeof o.locale === 'string' ? o.locale : '',
      styles: Array.isArray(o.style_list) ? o.style_list.map(String) : null,
    });
  }
  return out;
}
