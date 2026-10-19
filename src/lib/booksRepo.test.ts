import { beforeEach, describe, expect, it } from 'vitest';
import initSqlJs from 'sql.js';
import { createBooksRepo, type SqlExec } from './db';
import { parseToc } from './toc';

const SCHEMA = [
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

async function memoryDb(): Promise<SqlExec> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  for (const sql of SCHEMA) db.run(sql);
  return {
    async execute(sql: string, params: unknown[] = []) {
      db.run(sql, params as never[]);
      return { rowsAffected: 0, lastInsertId: 0 };
    },
    async select<T>(sql: string, params: unknown[] = []) {
      const st = db.prepare(sql);
      st.bind(params as never[]);
      const out: T[] = [];
      while (st.step()) out.push(st.getAsObject() as T);
      st.free();
      return out;
    },
  };
}

const RAW = [
  '第一章 陨落的天才',
  '萧炎握紧了拳。',
  '第二章 斗气大陆',
  '这里是斗气大陆。',
  '第三章 客人',
  '来了一位客人。',
].join('\n');

describe('BooksRepo 集成（真 SQLite 内存库）', () => {
  let repo: ReturnType<typeof createBooksRepo>;

  beforeEach(async () => {
    repo = createBooksRepo(await memoryDb());
  });

  it('importBook 写入书与全部章节，getToc 按 idx 升序返回', async () => {
    const units = parseToc(RAW);
    expect(units.length).toBe(3);

    const book = await repo.importBook('斗破苍穹', units);

    const toc = await repo.getToc(book.id);
    expect(toc.map((c) => c.idx)).toEqual([0, 1, 2]);
    expect(toc[0].title).toBe('第一章 陨落的天才');
  });

  it('getChapter 取回内容，hasChapter 判定存在与不存在', async () => {
    const book = await repo.importBook('斗破苍穹', parseToc(RAW));

    const ch = await repo.getChapter(book.id, 1);
    expect(ch?.title).toBe('第二章 斗气大陆');
    expect(ch?.content).toBe('这里是斗气大陆。');

    expect(await repo.hasChapter(book.id, 2)).toBe(true);
    expect(await repo.hasChapter(book.id, 99)).toBe(false);
  });

  it('setProgress 写入的进度能从 getAll 读回', async () => {
    const book = await repo.importBook('斗破苍穹', parseToc(RAW));
    await repo.setProgress(book.id, 2, 1);

    const [loaded] = await repo.getAll();
    expect(loaded.lastChapter).toBe(2);
    expect(loaded.lastSegment).toBe(1);
  });

  it('getAll 带出章节数 chapterCount', async () => {
    await repo.importBook('斗破苍穹', parseToc(RAW));

    const [loaded] = await repo.getAll();
    expect(loaded.chapterCount).toBe(3);
  });

  it('空书 getAll 返回空数组', async () => {
    expect(await repo.getAll()).toEqual([]);
  });

  it('importBook 空章节抛错', async () => {
    await expect(repo.importBook('空书', [])).rejects.toThrow('未识别到任何内容');
  });
});
