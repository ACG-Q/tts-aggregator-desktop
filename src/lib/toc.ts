export interface TocEntry {
  volume: string;
  title: string;
  content: string;
}

const NUM_MAP: Record<string, number> = {
  〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

export function parseCnNum(s: string): number {
  if (/^[0-9]+$/.test(s)) return Number(s);
  if (s.includes('万')) {
    const [t, o] = s.split('万');
    return (parseCnNum(t) || 1) * 10000 + (o ? parseCnNum(o) : 0);
  }
  if (s.includes('千')) {
    const [t, o] = s.split('千');
    return (parseCnNum(t) || 1) * 1000 + (o ? parseCnNum(o) : 0);
  }
  if (s.includes('百')) {
    const [t, o] = s.split('百');
    return (parseCnNum(t) || 1) * 100 + (o ? parseCnNum(o) : 0);
  }
  if (s.includes('十')) {
    const [t, o] = s.split('十');
    return (t ? parseCnNum(t) : 1) * 10 + (o ? parseCnNum(o) : 0);
  }
  let n = 0;
  for (const ch of s) {
    const d = NUM_MAP[ch];
    if (d === undefined) return Number.NaN;
    n = n * 10 + d;
  }
  return n;
}

const CN_OR_DIGIT = '[0-9〇零一二三四五六七八九十百千万IVXLCivxlc]+';
const KIND_PATTERNS: { kind: 'volume' | 'chapter'; re: RegExp }[] = [
  { kind: 'volume', re: new RegExp(`^\\s*第${CN_OR_DIGIT}\\s*[卷篇部]`) },
  { kind: 'chapter', re: new RegExp(`^\\s*第${CN_OR_DIGIT}\\s*[章回节集]`) },
  { kind: 'chapter', re: /^\s*[0-9]{1,4}\s*[、.．]\s*\S/ },
];

export function parseToc(raw: string): TocEntry[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const heads: { line: number; kind: 'volume' | 'chapter'; title: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || t.length > 50) continue;
    for (const p of KIND_PATTERNS) {
      if (p.re.test(t)) {
        heads.push({ line: i, kind: p.kind, title: t });
        break;
      }
    }
  }
  const chapterHeads = heads.filter((h) => h.kind === 'chapter');
  if (chapterHeads.length < 2) {
    const all = raw.replace(/\r\n/g, '\n').trim();
    return all ? [{ volume: '', title: '全文', content: all }] : [];
  }
  const out: TocEntry[] = [];
  let volume = '';
  for (let h = 0; h < heads.length; h++) {
    const head = heads[h];
    if (head.kind === 'volume') {
      volume = head.title;
      continue;
    }
    const next = heads[h + 1];
    const content = lines.slice(head.line + 1, next ? next.line : lines.length).join('\n').trim();
    out.push({ volume, title: head.title, content });
  }
  return out;
}
