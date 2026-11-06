import { describe, expect, it } from 'vitest';
import { parseSnapshotJson, type PlaybackSnapshot } from './snapshot';

const textSnap: PlaybackSnapshot = {
  version: 1,
  source: { kind: 'text' },
  segIndex: 3,
  text: '你好世界',
  updatedAt: 1700000000000,
};

describe('parseSnapshotJson', () => {
  it('合法快照原样解析', () => {
    expect(parseSnapshotJson(JSON.stringify(textSnap))).toEqual(textSnap);
  });

  it('空值与坏 JSON 返回 null', () => {
    expect(parseSnapshotJson(null)).toBeNull();
    expect(parseSnapshotJson('')).toBeNull();
    expect(parseSnapshotJson('{oops')).toBeNull();
  });

  it('版本或来源非法返回 null', () => {
    expect(parseSnapshotJson(JSON.stringify({ ...textSnap, version: 2 }))).toBeNull();
    expect(parseSnapshotJson(JSON.stringify({ ...textSnap, source: { kind: 'x' } }))).toBeNull();
    expect(parseSnapshotJson(JSON.stringify({ ...textSnap, segIndex: -1 }))).toBeNull();
    expect(parseSnapshotJson(JSON.stringify({ ...textSnap, text: '' }))).toBeNull();
  });

  it('书籍快照保留书籍字段', () => {
    const book: PlaybackSnapshot = {
      version: 1,
      source: { kind: 'book', bookId: 'b1', chapterIdx: 2 },
      segIndex: 4,
      text: '',
      bookTitle: '书名',
      chapterTitle: '第三章',
      chapterCount: 10,
      updatedAt: 1700000000000,
    };
    expect(parseSnapshotJson(JSON.stringify(book))).toEqual(book);
  });
});
