import { describe, expect, it } from 'vitest';
import { loadBuiltinVoices, mergeVoiceTranslations } from './builtinVoices';
import type { Voice } from '../types/models';

const voice = (id: string, name: string, localName = '', extra: Partial<Voice> = {}): Voice => ({
  id, name, localName, gender: '', locale: 'zh-CN', styles: null, ...extra,
});

describe('loadBuiltinVoices', () => {
  it('加载安卓内置库并缓存', async () => {
    const first = await loadBuiltinVoices();
    const second = await loadBuiltinVoices();
    expect(first.length).toBeGreaterThan(300);
    expect(second).toBe(first);
    expect(first.find((v) => v.id === 'zh-CN-XiaoxiaoNeural')?.nameZh).toBe('晓晓');
  });
});

describe('mergeVoiceTranslations', () => {
  it('按 id 补全缺失的中文名与简介', () => {
    const builtin = [voice('a', 'Alpha', '阿尔法', { nameZh: '阿尔法', introZh: '简介 A' })];
    const [remote] = mergeVoiceTranslations([voice('a', 'Alpha')], builtin);
    expect(remote).toMatchObject({ nameZh: '阿尔法', introZh: '简介 A' });
  });

  it('id 不匹配时按基础人名匹配', () => {
    const builtin = [voice('b1', 'Beta Dragon HD', '贝塔', { nameZh: '贝塔', introZh: '简介 B' })];
    const [remote] = mergeVoiceTranslations([voice('b2', 'Beta Latest', '贝塔')], builtin);
    expect(remote.nameZh).toBe('贝塔');
  });

  it('基础人名忽略变音符与空格', () => {
    const builtin = [voice('vi-VN-HoaiMyNeural', 'Hoài My', 'Hoài My', {
      nameZh: '怀美', introZh: '越南语女声', locale: 'vi-VN',
    })];
    const [remote] = mergeVoiceTranslations(
      [voice('vi-VN-HoaiMy:DragonHDLatestNeural', 'Hoài My HD', 'Hoài My', { locale: 'vi-VN' })],
      builtin,
    );
    expect(remote.nameZh).toBe('怀美');
  });

  it('去掉变体后缀后按 id 匹配', () => {
    const builtin = [voice('vi-VN-Grant:MAI-Voice-2.1', 'Grant 2.1', 'Grant', {
      nameZh: '格兰特', introZh: '越南语男声', locale: 'vi-VN',
    })];
    const [remote] = mergeVoiceTranslations(
      [voice('vi-VN-Grant:MAI-Voice-2.1-Flash', 'Grant Flash', 'Grant', { locale: 'vi-VN' })],
      builtin,
    );
    expect(remote.nameZh).toBe('格兰特');
  });

  it('内置库真实数据能补全 HoaiMy 变体', async () => {
    const builtin = await loadBuiltinVoices();
    const [remote] = mergeVoiceTranslations(
      [voice('vi-VN-HoaiMyNeural', 'Hoài My', 'Hoài My', { locale: 'vi-VN' })],
      builtin,
    );
    expect(remote.nameZh).toBeTruthy();
  });

  it('远端已有翻译不被覆盖', () => {
    const builtin = [voice('a', 'Alpha', '', { nameZh: '内置', introZh: '内置简介' })];
    const [remote] = mergeVoiceTranslations(
      [voice('a', 'Alpha', '', { nameZh: '远端', introZh: '远端简介' })],
      builtin,
    );
    expect(remote).toMatchObject({ nameZh: '远端', introZh: '远端简介' });
  });

  it('内置库为空时原样返回', () => {
    const remote = [voice('a', 'Alpha')];
    expect(mergeVoiceTranslations(remote, [])).toBe(remote);
  });
});
