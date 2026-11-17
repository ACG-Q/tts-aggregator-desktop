import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { pushRecentVoice, readRecentVoices } from '@/lib/voiceFilter';
import {
  CHINESE_FILTER, chipEntries, defaultFilter, filterVoices, groupVoicesByLanguage,
  languageOptions, recentVoiceIds, searchVoices, voiceLabel, voiceMeta,
  type VoiceFilter,
} from '@/lib/voiceQuery';
import { useVoicesStore } from '@/store/voicesStore';
import type { Voice } from '@/types/models';

interface VoicePickerProps {
  /** 当前音色 ID；空字符串表示节点默认音色。 */
  value: string;
  onChange: (id: string) => void;
  triggerClassName?: string;
  defaultOptionLabel?: string;
  allowDefault?: boolean;
}

export function VoicePicker({
  value,
  onChange,
  triggerClassName,
  defaultOptionLabel = '节点默认音色',
  allowDefault = true,
}: VoicePickerProps) {
  const voices = useVoicesStore((s) => s.voices);
  const load = useVoicesStore((s) => s.load);
  const loading = useVoicesStore((s) => s.loading);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [storedRecent, setStoredRecent] = useState<string[]>([]);
  const [filter, setFilter] = useState<VoiceFilter>(CHINESE_FILTER);
  const [allLanguages, setAllLanguages] = useState(false);

  useEffect(() => {
    if (!open) return;
    void load();
    const stored = readRecentVoices(localStorage);
    setStoredRecent(stored);
    setFilter(defaultFilter(stored));
    setQuery('');
    setAllLanguages(false);
  }, [open, load]);

  const byId = useMemo(() => new Map(voices.map((v) => [v.id, v])), [voices]);
  const recentIds = useMemo(
    () => recentVoiceIds(value, storedRecent, new Set(byId.keys())),
    [value, storedRecent, byId],
  );
  const chips = useMemo(() => chipEntries(languageOptions(voices)), [voices]);

  const searching = query.trim().length > 0;
  const shown = useMemo(
    () => (searching ? searchVoices(voices, query) : filterVoices(voices, filter, recentIds)),
    [voices, searching, query, filter, recentIds],
  );
  const groups = useMemo(
    () => (searching || filter.kind !== 'frequent' ? groupVoicesByLanguage(shown) : null),
    [searching, filter.kind, shown],
  );
  const recentVoices = useMemo(
    () => recentIds.map((id) => byId.get(id)).filter((v): v is Voice => Boolean(v)),
    [recentIds, byId],
  );

  const selected = value ? byId.get(value) : undefined;
  const selectedLabel = value
    ? (selected ? voiceLabel(voices, selected) : value)
    : defaultOptionLabel;

  const baseChips = chips.filter(
    (chip) => chip.filter.kind !== 'language' || chip.filter.code === 'en',
  );
  const languageChips = chips.filter(
    (chip) => chip.filter.kind === 'language' && chip.filter.code !== 'en',
  );
  const visibleChips = allLanguages
    ? [...baseChips, ...languageChips]
    : [...baseChips, ...languageChips.slice(0, 4)];
  const activeCode = filter.kind === 'language' ? filter.code : '';
  if (!allLanguages && activeCode && activeCode !== 'en'
    && !visibleChips.some((chip) => chip.filter.kind === 'language' && chip.filter.code === activeCode)) {
    const active = languageChips.find(
      (chip) => chip.filter.kind === 'language' && chip.filter.code === activeCode,
    );
    if (active) visibleChips.push(active);
  }
  const hiddenLanguageCount = Math.max(0, languageChips.length - 4);

  function choose(id: string): void {
    onChange(id);
    if (id) setStoredRecent(pushRecentVoice(localStorage, id));
    setOpen(false);
  }

  function isActive(filterValue: VoiceFilter): boolean {
    if (searching || filter.kind !== filterValue.kind) return false;
    if (filter.kind === 'language' && filterValue.kind === 'language') {
      return filter.code === filterValue.code;
    }
    return true;
  }

  function row(v: Voice) {
    const active = v.id === value;
    const label = voiceLabel(voices, v);
    return (
      <button
        key={v.id}
        type="button"
        onClick={() => choose(v.id)}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left transition-colors hover:bg-surface-2',
          active && 'bg-primary/8',
        )}
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] border border-line bg-surface-2 text-[11px] font-semibold text-muted-foreground">
          {label.slice(0, 1) || '音'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium">{label}</span>
          <span className="block truncate text-[10px] text-faint">{voiceMeta(v)}</span>
        </span>
        {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
      </button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-9 w-full items-center gap-2 rounded-md border border-line bg-surface-2 px-3 text-left text-[12.5px] transition-colors hover:border-line-strong',
            triggerClassName,
          )}
        >
          <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DialogTrigger>

      <DialogContent
        showCloseButton={false}
        className="fixed inset-y-0 right-0 left-auto top-0 flex h-full w-[440px] max-w-[92vw] translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-y-0 border-r-0 border-l border-line bg-card p-0 shadow-2xl data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-[92vw]"
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <DialogTitle className="text-[14px] font-semibold">选择音色</DialogTitle>
          <DialogDescription className="sr-only">
            搜索或按语言筛选音色，点击条目即可切换。
          </DialogDescription>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="关闭"
            className="ml-auto grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-line px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <Input
              autoFocus
              placeholder="搜索音色名、ID 或语言"
              className="h-9 w-full pl-8"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {visibleChips.map((chip) => (
              <button
                key={chip.label}
                type="button"
                aria-pressed={isActive(chip.filter)}
                onClick={() => { setQuery(''); setFilter(chip.filter); }}
                className={cn(
                  'inline-flex h-[26px] items-center rounded-full border px-2.5 text-[10.5px] transition-colors',
                  isActive(chip.filter)
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-line bg-surface-2 text-muted-foreground hover:border-line-strong hover:text-foreground',
                )}
              >
                {chip.label}
              </button>
            ))}
            {hiddenLanguageCount > 0 && (
              <button
                type="button"
                aria-expanded={allLanguages}
                onClick={() => setAllLanguages((v) => !v)}
                className="inline-flex h-[26px] items-center rounded-full border border-dashed border-line px-2.5 text-[10.5px] text-muted-foreground transition-colors hover:border-line-strong hover:text-foreground"
              >
                {allLanguages ? '收起语言' : `更多语言（${hiddenLanguageCount}）`}
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {allowDefault && !searching && (
            <button
              type="button"
              onClick={() => choose('')}
              className={cn(
                'mb-1 flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left transition-colors hover:bg-surface-2',
                value === '' && 'bg-primary/8',
              )}
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] border border-line bg-surface-2 text-[11px] font-semibold text-muted-foreground">
                默
              </span>
              <span className="min-w-0 flex-1 text-[12.5px] font-medium">{defaultOptionLabel}</span>
              {value === '' && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </button>
          )}

          {groups
            ? groups.map((group) => (
              <div key={group.code}>
                <div className="sticky top-0 z-10 flex items-center justify-between bg-card px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground">
                  <span>{group.label}</span>
                  <span className="font-normal text-faint num">{group.voices.length}</span>
                </div>
                {group.voices.map(row)}
              </div>
            ))
            : recentVoices.length > 0 && (
              <div>
                <div className="sticky top-0 z-10 flex items-center justify-between bg-card px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground">
                  <span>最近使用</span>
                  <span className="font-normal text-faint num">{recentVoices.length}</span>
                </div>
                {recentVoices.map(row)}
              </div>
            )}

          {shown.length === 0 && !loading && (
            <p className="px-3 py-10 text-center text-[11.5px] text-muted-foreground">
              {searching ? '没有匹配的音色' : filter.kind === 'frequent'
                ? '还没有常用音色，先从「中文」或「全部」里选一个'
                : '没有可用音色，请先添加节点并探测'}
            </p>
          )}
          {loading && voices.length === 0 && (
            <p className="px-3 py-10 text-center text-[11.5px] text-muted-foreground">正在加载音色…</p>
          )}
        </div>

        <div className="border-t border-line px-4 py-2.5 text-[10.5px] text-faint num">
          共 {voices.length} 个音色 · 同名版本以括号区分
        </div>
      </DialogContent>
    </Dialog>
  );
}
