import { useEffect } from 'react';
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { PlayerDock } from '@/components/player/PlayerDock';
import { ThemeController } from '@/components/ThemeController';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { NAV_ITEMS, type NavItem } from '@/nav';
import { usePlayerStore } from '@/store/playerStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { BookDetailPage } from './pages/BookDetailPage';
import { BooksPage } from './pages/BooksPage';
import { LogsPage } from './pages/LogsPage';
import { NodesPage } from './pages/NodesPage';
import { ReadPage } from './pages/ReadPage';
import { SettingsPage } from './pages/SettingsPage';
import { VoicesPage } from './pages/VoicesPage';

function PlayingDot() {
  return (
    <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-primary" aria-label="正在播放" />
  );
}

function NavRow({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const playing = usePlayerStore((s) => s.status !== 'idle');
  const source = usePlayerStore((s) => s.source);
  const playerSource = source?.kind;
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
          collapsed && 'justify-center px-0',
          isActive
            ? 'bg-primary/10 font-medium text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span>{item.label}</span>}
      {item.to === '/' && playing && playerSource !== 'book' && <PlayingDot />}
      {item.to === '/books' && playing && playerSource === 'book' && <PlayingDot />}
    </NavLink>
  );
}

export default function App() {
  const collapsed = useSidebarStore((s) => s.collapsed());
  const setWindowWidth = useSidebarStore((s) => s.setWindowWidth);
  const toggle = useSidebarStore((s) => s.toggle);

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [setWindowWidth]);

  return (
    <HashRouter>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <ThemeController />
        <aside
          className={`flex shrink-0 flex-col border-r bg-card transition-[width] duration-200 ${
            collapsed ? 'w-14' : 'w-52'
          }`}
        >
          <div className="flex h-14 items-center justify-between border-b px-3">
            {!collapsed && <span className="text-base font-semibold tracking-tight">TTS Aggregator</span>}
            <button
              onClick={toggle}
              title={collapsed ? '展开侧栏' : '折叠侧栏'}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
            {NAV_ITEMS.map((item) => (
              <NavRow key={item.to} item={item} collapsed={collapsed} />
            ))}
          </nav>
          {!collapsed && (
            <div className="border-t px-4 py-3 text-xs text-muted-foreground">
              节点池 · SQLite 本地库
            </div>
          )}
        </aside>
        <main className="flex-1 overflow-y-auto px-8 py-8">
          <Routes>
            <Route path="/" element={<ReadPage />} />
            <Route path="/books" element={<BooksPage />} />
            <Route path="/books/:id" element={<BookDetailPage />} />
            <Route path="/nodes" element={<NodesPage />} />
            <Route path="/voices" element={<VoicesPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
          <div className="h-20" />
        </main>
        <PlayerDock />
        <Toaster position="bottom-right" richColors />
      </div>
    </HashRouter>
  );
}
