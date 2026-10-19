import { normalizeBaseUrl } from '../types/models';

export interface BatchNodeInput {
  baseUrl: string;
  label: string;
  apiKey: string | null;
}

export interface BatchParseResult {
  items: BatchNodeInput[];
  duplicates: string[];
  invalid: string[];
}

export function parseBatchLines(text: string, existingUrls: string[]): BatchParseResult {
  const existing = new Set(existingUrls.map((u) => normalizeBaseUrl(u)));
  const seen = new Set<string>();
  const items: BatchNodeInput[] = [];
  const duplicates: string[] = [];
  const invalid: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const parts = line.split(/[\t ]+/).filter(Boolean);
    const url = parts[0];

    if (!/^https?:\/\//i.test(url)) {
      invalid.push(line);
      continue;
    }

    const baseUrl = normalizeBaseUrl(url);

    if (existing.has(baseUrl) || seen.has(baseUrl)) {
      duplicates.push(baseUrl);
      continue;
    }
    seen.add(baseUrl);

    let label = parts[1] ?? '';
    if (!label) {
      try { label = new URL(baseUrl).hostname; } catch { label = ''; }
    }
    const apiKey = parts[2] || null;
    items.push({ baseUrl, label, apiKey });
  }

  return { items, duplicates, invalid };
}
