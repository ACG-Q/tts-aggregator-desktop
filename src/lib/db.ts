import Database from '@tauri-apps/plugin-sql';
import {
  API_VERSION_ORDINAL, HEALTH_ORDINAL, MODE_ORDINAL, newId,
  type ApiVersion, type Book, type BookChapter, type CallLog, type CallMode, type Health, type TtsNode,
} from '../types/models';
import type { TocEntry } from './toc';

export interface SqlExec {
  execute(sql: string, params?: unknown[]): Promise<unknown>;
  select<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export const LOG_KEEP = 500;
export const LOG_QUERY_LIMIT = 500;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    base_url TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL DEFAULT '',
    keyless INTEGER NOT NULL DEFAULT 0,
    api_key TEXT,
    health INTEGER NOT NULL DEFAULT 2,
    last_checked INTEGER NOT NULL DEFAULT 0,
    default_voice TEXT NOT NULL DEFAULT '',
    voice_count INTEGER NOT NULL DEFAULT 0,
    fail_count INTEGER NOT NULL DEFAULT 0,
    cooldown_until INTEGER NOT NULL DEFAULT 0,
    disabled INTEGER NOT NULL DEFAULT 0,
    api_version INTEGER NOT NULL DEFAULT 2,
    source TEXT NOT NULL DEFAULT 'manual'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_nodes_health ON nodes(health)`,
  `CREATE INDEX IF NOT EXISTS idx_nodes_checked ON nodes(last_checked)`,
  `CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time INTEGER NOT NULL,
    node_url TEXT NOT NULL,
    mode INTEGER NOT NULL,
    text_len INTEGER NOT NULL,
    attempt INTEGER NOT NULL,
    success INTEGER NOT NULL,
    latency_ms INTEGER NOT NULL,
    from_node TEXT,
    error TEXT,
    cooldown INTEGER NOT NULL DEFAULT 0,
    text_preview TEXT NOT NULL DEFAULT '',
    voice TEXT NOT NULL DEFAULT '',
    rate INTEGER NOT NULL DEFAULT 0,
    pitch INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_logs_time ON logs(time DESC)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    imported_at INTEGER NOT NULL,
    last_chapter INTEGER NOT NULL DEFAULT 0,
    last_segment INTEGER NOT NULL DEFAULT 0,
    playback_rate REAL NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS chapters (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    volume TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id, idx)`,
];

export async function openDb(): Promise<SqlExec> {
  const db = await Database.load('sqlite:tts_desktop.db');
  for (const sql of SCHEMA) await db.execute(sql);
  return db;
}

// ---------- 行 ↔ 模型（纯函数，可单测） ----------

export interface NodeRow {
  id: string; base_url: string; label: string; keyless: number; api_key: string | null;
  health: number; last_checked: number; default_voice: string; voice_count: number;
  fail_count: number; cooldown_until: number; disabled: number; api_version: number; source: string;
}

export function rowToNode(r: NodeRow): TtsNode {
  const health: Health = (['OK', 'FAIL', 'UNKNOWN'] as Health[])[r.health] ?? 'UNKNOWN';
  const apiVersion: ApiVersion = (['V1', 'LEGACY', 'UNKNOWN'] as ApiVersion[])[r.api_version] ?? 'UNKNOWN';
  const source = r.source === 'fofa' || r.source === 'zoomeye' ? r.source : 'manual';
  return {
    id: r.id, baseUrl: r.base_url, label: r.label, keyless: r.keyless !== 0,
    apiKey: r.api_key, health, lastChecked: r.last_checked, defaultVoice: r.default_voice,
    voiceCount: r.voice_count, failCount: r.fail_count, cooldownUntil: r.cooldown_until,
    disabled: r.disabled !== 0, apiVersion, source,
  };
}

export function nodeRow(n: TtsNode): unknown[] {
  return [
    n.id, n.baseUrl, n.label, n.keyless ? 1 : 0, n.apiKey,
    HEALTH_ORDINAL[n.health], n.lastChecked, n.defaultVoice, n.voiceCount,
    n.failCount, n.cooldownUntil, n.disabled ? 1 : 0,
    API_VERSION_ORDINAL[n.apiVersion], n.source,
  ];
}

export interface LogRow {
  id: number; time: number; node_url: string; mode: number; text_len: number;
  attempt: number; success: number; latency_ms: number; from_node: string | null;
  error: string | null; cooldown: number; text_preview: string; voice: string;
  rate: number; pitch: number;
}

export function rowToLog(r: LogRow): CallLog {
  const mode: CallMode = (['AUTO', 'GROUP', 'MANUAL'] as CallMode[])[r.mode] ?? 'AUTO';
  return {
    id: r.id, time: r.time, nodeUrl: r.node_url, mode, textLen: r.text_len,
    attempt: r.attempt, success: r.success !== 0, latencyMs: r.latency_ms,
    fromNode: r.from_node, error: r.error, triggeredCooldown: r.cooldown !== 0,
    textPreview: r.text_preview, voice: r.voice, rate: r.rate, pitch: r.pitch,
  };
}

export function logRow(l: CallLog): unknown[] {
  return [
    l.id ?? null, l.time, l.nodeUrl, MODE_ORDINAL[l.mode], l.textLen,
    l.attempt, l.success ? 1 : 0, l.latencyMs, l.fromNode, l.error,
    l.triggeredCooldown ? 1 : 0, l.textPreview, l.voice, l.rate, l.pitch,
  ];
}

// ---------- 仓储 ----------

const NODE_UPSERT_SQL = `INSERT INTO nodes (
  id, base_url, label, keyless, api_key, health, last_checked, default_voice,
  voice_count, fail_count, cooldown_until, disabled, api_version, source
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(base_url) DO UPDATE SET
  label=excluded.label, keyless=excluded.keyless, api_key=excluded.api_key,
  health=excluded.health, last_checked=excluded.last_checked,
  default_voice=excluded.default_voice, voice_count=excluded.voice_count,
  fail_count=excluded.fail_count, cooldown_until=excluded.cooldown_until,
  disabled=excluded.disabled, api_version=excluded.api_version, source=excluded.source`;

export interface NodesRepo {
  getAll(): Promise<TtsNode[]>;
  upsert(n: TtsNode): Promise<void>;
  delete(ids: string[]): Promise<void>;
  setDisabled(ids: string[], disabled: boolean): Promise<void>;
  clear(): Promise<void>;
}

export function createNodesRepo(db: SqlExec): NodesRepo {
  return {
    async getAll() {
      const rows = await db.select<NodeRow>(
        'SELECT * FROM nodes ORDER BY health ASC, last_checked DESC',
      );
      return rows.map(rowToNode);
    },
    async upsert(n) {
      await db.execute(NODE_UPSERT_SQL, nodeRow(n));
    },
    async delete(ids) {
      if (!ids.length) return;
      const ph = ids.map(() => '?').join(',');
      await db.execute(`DELETE FROM nodes WHERE id IN (${ph})`, ids);
    },
    async setDisabled(ids, disabled) {
      if (!ids.length) return;
      const ph = ids.map(() => '?').join(',');
      await db.execute(`UPDATE nodes SET disabled = ? WHERE id IN (${ph})`, [disabled ? 1 : 0, ...ids]);
    },
    async clear() {
      await db.execute('DELETE FROM nodes');
    },
  };
}

export type LogsFilterKind = 'ALL' | 'OK' | 'FAIL' | 'SWITCH';

const LOG_FILTER_SQL: Record<LogsFilterKind, string> = {
  ALL: 'SELECT * FROM logs ORDER BY id DESC LIMIT ?',
  OK: 'SELECT * FROM logs WHERE success = 1 ORDER BY id DESC LIMIT ?',
  FAIL: 'SELECT * FROM logs WHERE success = 0 ORDER BY id DESC LIMIT ?',
  SWITCH: 'SELECT * FROM logs WHERE from_node IS NOT NULL ORDER BY id DESC LIMIT ?',
};

export interface LogsRepo {
  insert(l: CallLog): Promise<void>;
  query(filter: LogsFilterKind): Promise<CallLog[]>;
  clear(): Promise<void>;
}

export function createLogsRepo(db: SqlExec): LogsRepo {
  return {
    async insert(l) {
      await db.execute(
        `INSERT INTO logs (id, time, node_url, mode, text_len, attempt, success,
          latency_ms, from_node, error, cooldown, text_preview, voice, rate, pitch)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        logRow(l),
      );
      await db.execute(
        `DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY id DESC LIMIT ${LOG_KEEP})`,
      );
    },
    async query(filter) {
      const rows = await db.select<LogRow>(LOG_FILTER_SQL[filter], [LOG_QUERY_LIMIT]);
      return rows.map(rowToLog);
    },
    async clear() {
      await db.execute('DELETE FROM logs');
    },
  };
}

export interface SettingsRepo {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  getJson<T>(key: string, fallback: T): Promise<T>;
  setJson(key: string, value: unknown): Promise<void>;
}

export function createSettingsRepo(db: SqlExec): SettingsRepo {
  return {
    async get(key) {
      const rows = await db.select<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
      return rows.length ? rows[0].value : null;
    },
    async set(key, value) {
      await db.execute(
        'INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        [key, value],
      );
    },
    async getJson<T>(key: string, fallback: T): Promise<T> {
      const raw = await this.get(key);
      if (!raw) return fallback;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    },
    async setJson(key, value) {
      await this.set(key, JSON.stringify(value));
    },
  };
}

// ---------- 书架 ----------

export interface BookRow {
  id: string; title: string; imported_at: number;
  last_chapter: number; last_segment: number; playback_rate: number;
  chapter_count: number;
}

export function rowToBook(r: BookRow): Book {
  return {
    id: r.id, title: r.title, importedAt: r.imported_at,
    lastChapter: r.last_chapter, lastSegment: r.last_segment, playbackRate: r.playback_rate,
    chapterCount: r.chapter_count,
  };
}

export function bookRow(b: Book): unknown[] {
  return [b.id, b.title, b.importedAt, b.lastChapter, b.lastSegment, b.playbackRate];
}

export interface BookTocItem {
  idx: number;
  volume: string;
  title: string;
}

export interface BooksRepo {
  getAll(): Promise<Book[]>;
  getToc(bookId: string): Promise<BookTocItem[]>;
  getChapter(bookId: string, idx: number): Promise<BookChapter | null>;
  hasChapter(bookId: string, idx: number): Promise<boolean>;
  importBook(title: string, units: TocEntry[]): Promise<Book>;
  delete(id: string): Promise<void>;
  rename(id: string, title: string): Promise<void>;
  setProgress(id: string, chapter: number, segment: number): Promise<void>;
  setRate(id: string, rate: number): Promise<void>;
}

export function createBooksRepo(db: SqlExec): BooksRepo {
  return {
    async getAll() {
      const rows = await db.select<BookRow>(
        `SELECT b.*, (SELECT COUNT(*) FROM chapters c WHERE c.book_id = b.id) AS chapter_count
         FROM books b ORDER BY b.imported_at DESC`,
      );
      return rows.map(rowToBook);
    },
    async getToc(bookId) {
      return db.select<BookTocItem>(
        'SELECT idx, volume, title FROM chapters WHERE book_id = ? ORDER BY idx ASC',
        [bookId],
      );
    },
    async getChapter(bookId, idx) {
      const rows = await db.select<{
        id: string; book_id: string; idx: number; volume: string; title: string; content: string;
      }>('SELECT * FROM chapters WHERE book_id = ? AND idx = ?', [bookId, idx]);
      if (!rows.length) return null;
      const r = rows[0];
      return { id: r.id, bookId: r.book_id, idx: r.idx, volume: r.volume, title: r.title, content: r.content };
    },
    async hasChapter(bookId, idx) {
      const rows = await db.select<{ n: number }>(
        'SELECT COUNT(*) AS n FROM chapters WHERE book_id = ? AND idx = ?',
        [bookId, idx],
      );
      return (rows[0]?.n ?? 0) > 0;
    },
    async importBook(title, units) {
      if (units.length === 0) throw new Error('未识别到任何内容');
      const book: Book = {
        id: newId(), title, importedAt: Date.now(),
        lastChapter: 0, lastSegment: 0, playbackRate: 0, chapterCount: units.length,
      };
      await db.execute(
        'INSERT INTO books (id, title, imported_at, last_chapter, last_segment, playback_rate) VALUES (?,?,?,?,?,?)',
        bookRow(book),
      );
      for (let i = 0; i < units.length; i++) {
        await db.execute(
          'INSERT INTO chapters (id, book_id, idx, volume, title, content) VALUES (?,?,?,?,?,?)',
          [newId(), book.id, i, units[i].volume, units[i].title, units[i].content],
        );
      }
      return book;
    },
    async delete(id) {
      await db.execute('DELETE FROM chapters WHERE book_id = ?', [id]);
      await db.execute('DELETE FROM books WHERE id = ?', [id]);
    },
    async rename(id, title) {
      await db.execute('UPDATE books SET title = ? WHERE id = ?', [title, id]);
    },
    async setProgress(id, chapter, segment) {
      await db.execute('UPDATE books SET last_chapter = ?, last_segment = ? WHERE id = ?', [chapter, segment, id]);
    },
    async setRate(id, rate) {
      await db.execute('UPDATE books SET playback_rate = ? WHERE id = ?', [rate, id]);
    },
  };
}
