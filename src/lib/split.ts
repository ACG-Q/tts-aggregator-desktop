export function splitForReading(raw: string, maxLen = 800): string[] {
  const text = raw.replace(/\r\n/g, '\n').trim();
  if (!text) return [];
  const out: string[] = [];
  for (const para of text.split(/\n+/)) {
    const p = para.trim();
    if (!p) continue;
    if (p.length <= maxLen) {
      out.push(p);
      continue;
    }
    let buf = '';
    const sentences = p.split(/(?<=[。！？!?；;])/).filter((s) => s.length > 0);
    for (const s of sentences) {
      if ((buf + s).length <= maxLen) {
        buf += s;
        continue;
      }
      if (buf) out.push(buf);
      buf = '';
      let rest = s;
      while (rest.length > maxLen) {
        out.push(rest.slice(0, maxLen));
        rest = rest.slice(maxLen);
      }
      // 剩余尾句直接落盘，避免下一句被缓冲吞并导致超段
      if (rest) out.push(rest);
    }
    if (buf) out.push(buf);
  }
  return out;
}
