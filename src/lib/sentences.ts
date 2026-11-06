export interface SentenceRange {
  text: string;
  start: number;
  end: number;
}

const SENTENCE_END = /[。！？!?；;\n]/;

export function splitSentences(text: string): SentenceRange[] {
  const out: SentenceRange[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (!SENTENCE_END.test(text[i])) continue;
    let end = i + 1;
    while (end < text.length && SENTENCE_END.test(text[end])) end++;
    const raw = text.slice(start, end);
    if (raw.trim()) out.push({ text: raw, start, end });
    start = end;
    i = end - 1;
  }
  if (start < text.length) {
    const raw = text.slice(start);
    if (raw.trim()) out.push({ text: raw, start, end: text.length });
  }
  return out;
}

export function sentenceIndexAt(ratio: number, sentences: SentenceRange[]): number {
  if (sentences.length === 0) return -1;
  const r = Math.max(0, Math.min(1, ratio));
  if (r >= 1) return sentences.length - 1;
  const lengths = sentences.map((s) => s.text.length);
  const total = lengths.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let target = total * r;
  for (let i = 0; i < lengths.length; i++) {
    if (target < lengths[i]) return i;
    target -= lengths[i];
  }
  return lengths.length - 1;
}
