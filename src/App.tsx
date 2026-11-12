import { useEffect, useRef, useState } from 'react';
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import {
  Check, ChevronDown, Headphones, Menu, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Sun,
} from 'lucide-react';
import { PlayerDock } from '@/components/player/PlayerDock';
import { LanSyncRequestDialog } from '@/components/LanSyncRequestDialog';
import { ThemeController } from '@/components/ThemeController';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { PALETTES, type PaletteMeta } from '@/lib/palette';
import { NAV_ITEMS, type NavItem } from '@/nav';
import { SIDEBAR_RAIL_THRESHOLD } from '@/lib/sidebar';
import { usePlayerStore } from '@/store/playerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { SIDEBAR_COLLAPSE_THRESHOLD, useSidebarStore } from '@/store/sidebarStore';
import type { PaletteId, ThemeMode } from '@/types/models';
import { BookDetailPage } from './pages/BookDetailPage';
import { BooksPage } from './pages/BooksPage';
import { LogsPage } from './pages/LogsPage';
import { NodesPage } from './pages/NodesPage';
import { ReadPage } from './pages/ReadPage';
import { SettingsPage } from './pages/SettingsPage';
import { VoicesPage } from './pages/VoicesPage';

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Moon }[] = [
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'system', label: '跟随系统', icon: Monitor },
];

function PlayingDot() {
  return (
    <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-primary" aria-label="正在播放" />
  );
}

function NavRow({ item, rail, onNavigate }: {
  item: NavItem;
  rail: boolean;
  onNavigate: () => void;
}) {
  const playing = usePlayerStore((s) => s.status !== 'idle');
  const source = usePlayerStore((s) => s.source);
  const playerSource = source?.kind;
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      title={rail ? item.label : undefined}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'relative flex h-10 items-center gap-3 rounded-[10px] border border-transparent px-3 text-[13px] font-medium transition-colors',
          rail && 'justify-center px-0',
          isActive
            ? 'border-primary/20 bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && !rail && (
            <span className="absolute left-1 top-1/2 h-3.5 w-[3px] -translate-y-1/2 rounded-full bg-primary" />
          )}
          <Icon className="h-[18px] w-[18px] shrink-0" />
          {!rail && <span className="truncate">{item.label}</span>}
          {!rail && item.to === '/' && playing && playerSource !== 'book' && <PlayingDot />}
          {!rail && item.to === '/books' && playing && playerSource === 'book' && <PlayingDot />}
        </>
      )}
    </NavLink>
  );
}

function PaletteOptions({ onPick, current }: { onPick: (id: PaletteId) => void; current: PaletteId }) {
  return (
    <>
      {PALETTES.map((p: PaletteMeta) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onPick(p.id)}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors',
            current === p.id
              ? 'bg-primary/10 text-foreground'
              : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
          )}
        >
          <span
            className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10"
            style={{ background: p.swatch }}
          />
          <span className="min-w-0">
            <span className="block text-[11.5px] font-medium">{p.label}</span>
            <span className="block text-[9.5px] text-faint">{p.hint}</span>
          </span>
          {current === p.id && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
        </button>
      ))}
    </>
  );
}

function PaletteSwitch({ rail }: { rail: boolean }) {
  const appPrefs = useSettingsStore((s) => s.appPrefs);
  const saveAppPrefs = useSettingsStore((s) => s.saveAppPrefs);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = PALETTES.find((p) => p.id === appPrefs.palette) ?? PALETTES[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (id: PaletteId) => {
    void saveAppPrefs({ ...appPrefs, palette: id });
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`配色：${current.label}`}
        aria-label="选择配色"
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-2 rounded-[9px] border border-line bg-surface-2 text-muted-foreground hover:border-line-strong hover:text-foreground',
          rail ? 'h-[34px] justify-center' : 'h-[34px] px-2.5',
        )}
      >
        <span
          className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10"
          style={{ background: current.swatch }}
        />
        {!rail && <span className="text-[11.5px]">{current.label}</span>}
        {!rail && <ChevronDown className="ml-auto h-3.5 w-3.5" />}
      </button>
      {open && (
        <div
          className={cn(
            'absolute z-[70] rounded-xl border border-line bg-popover p-1.5 shadow-xl',
            rail
              ? 'bottom-0 left-[calc(100%+10px)] w-44'
              : 'bottom-[calc(100%+8px)] left-0 w-full',
          )}
        >
          <div className="px-2 pb-1.5 pt-1 text-[9.5px] uppercase tracking-[0.14em] text-faint">显示配色</div>
          <PaletteOptions onPick={pick} current={appPrefs.palette} />
        </div>
      )}
    </div>
  );
}

function ThemeSwitch({ rail }: { rail: boolean }) {
  const theme = useSettingsStore((s) => s.appPrefs.theme);
  const appPrefs = useSettingsStore((s) => s.appPrefs);
  const saveAppPrefs = useSettingsStore((s) => s.saveAppPrefs);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (value: ThemeMode) => {
    void saveAppPrefs({ ...appPrefs, theme: value });
    setOpen(false);
  };

  if (!rail) {
    return (
      <div className="flex gap-0.5 rounded-[9px] border border-line bg-surface-2 p-[3px]" role="group" aria-label="主题">
        {THEME_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              type="button"
              title={opt.label}
              aria-label={opt.label}
              aria-pressed={theme === opt.value}
              onClick={() => pick(opt.value)}
              className={cn(
                'grid h-[27px] flex-1 place-items-center rounded-md transition-colors',
                theme === opt.value
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>
    );
  }

  const CurrentIcon = THEME_OPTIONS.find((o) => o.value === theme)?.icon ?? Moon;
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`主题：${THEME_OPTIONS.find((o) => o.value === theme)?.label ?? '深色'}`}
        aria-label="选择主题"
        aria-expanded={open}
        className="grid h-[34px] w-full place-items-center rounded-[9px] border border-line bg-surface-2 text-muted-foreground hover:border-line-strong hover:text-foreground"
      >
        <CurrentIcon className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute bottom-0 left-[calc(100%+10px)] z-[70] w-36 rounded-xl border border-line bg-popover p-1.5 shadow-xl">
          {THEME_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => pick(opt.value)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors',
                  theme === opt.value
                    ? 'bg-primary/10 text-foreground'
                    : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {opt.label}
                {theme === opt.value && <Check className="ml-auto h-4 w-4 text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const collapsed = useSidebarStore((s) => s.collapsed());
  const windowWidth = useSidebarStore((s) => s.windowWidth);
  const setWindowWidth = useSidebarStore((s) => s.setWindowWidth);
  const toggle = useSidebarStore((s) => s.toggle);
  const [mobileOpen, setMobileOpen] = useState(false);

  const mobile = windowWidth < SIDEBAR_COLLAPSE_THRESHOLD;
  const forceRail = !mobile && windowWidth < SIDEBAR_RAIL_THRESHOLD;
  const rail = !mobile && (collapsed || forceRail);
  const sidebarWidth = mobile ? 232 : rail ? 72 : 232;

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [setWindowWidth]);

  useEffect(() => {
    if (!mobile) setMobileOpen(false);
  }, [mobile]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  return (
    <HashRouter>
      <div className="min-h-screen bg-background text-foreground">
        <ThemeController />

        <header className="fixed inset-x-0 top-0 z-40 flex h-[54px] items-center gap-2.5 border-b border-line bg-card/95 px-3 backdrop-blur md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="打开导航"
            aria-expanded={mobileOpen}
            className="grid h-9 w-9 place-items-center rounded-[9px] text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <Headphones className="h-4 w-4" />
            </span>
            <span className="text-[13px] font-semibold tracking-tight">TTS Aggregator</span>
          </div>
        </header>

        {mobileOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
        )}

        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-[60] flex flex-col border-r border-line bg-card transition-[width,transform] duration-200',
            mobile ? 'w-[232px]' : rail ? 'w-[72px]' : 'w-[232px]',
            mobile && !mobileOpen && '-translate-x-full',
          )}
          aria-label="侧栏"
        >
          <div className={cn('flex items-center gap-3 px-[18px] pb-[18px] pt-[22px]', rail && 'justify-center px-0')}>
            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] border border-primary/25 bg-primary/10 text-primary">
              <Headphones className="h-[22px] w-[22px]" />
            </span>
            {!rail && (
              <div className="min-w-0">
                <div className="whitespace-nowrap text-[14.5px] font-semibold tracking-tight">TTS Aggregator</div>
                <div className="mt-0.5 whitespace-nowrap text-[9px] uppercase tracking-[0.16em] text-faint">Reading Room</div>
              </div>
            )}
          </div>

          <nav className="flex flex-col gap-[3px] px-3 py-2" aria-label="主导航">
            {NAV_ITEMS.map((item) => (
              <NavRow key={item.to} item={item} rail={rail} onNavigate={() => setMobileOpen(false)} />
            ))}
          </nav>

          <div className={cn('mt-auto flex flex-col gap-2.5 border-t border-line py-3.5', rail ? 'px-3' : 'px-3.5')}>
            <PaletteSwitch rail={rail} />
            <ThemeSwitch rail={rail} />
            {!mobile && !forceRail && (
              <button
                type="button"
                onClick={toggle}
                title={collapsed ? '展开侧栏' : '收起侧栏'}
                className={cn(
                  'flex h-[34px] items-center justify-center gap-2 rounded-[9px] border border-line bg-surface-2 text-[11.5px] text-muted-foreground hover:border-line-strong hover:text-foreground',
                  rail && 'gap-0',
                )}
              >
                {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                {!rail && <span>收起侧栏</span>}
              </button>
            )}
          </div>
        </aside>

        <main
          className="min-h-screen transition-[margin] duration-200"
          style={{ marginLeft: mobile ? 0 : sidebarWidth }}
        >
          <div className="mx-auto w-full max-w-[1180px] px-4 pb-40 pt-[74px] sm:px-6 md:px-10 md:pt-9">
            <Routes>
              <Route path="/" element={<ReadPage />} />
              <Route path="/books" element={<BooksPage />} />
              <Route path="/books/:id" element={<BookDetailPage />} />
              <Route path="/nodes" element={<NodesPage />} />
              <Route path="/voices" element={<VoicesPage />} />
              <Route path="/logs" element={<LogsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </div>
        </main>

        <PlayerDock />
        <LanSyncRequestDialog />
        <Toaster position="bottom-right" richColors />
      </div>
    </HashRouter>
  );
}
