import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { ThemeController } from '@/components/ThemeController';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { NAV_ITEMS, type NavItem } from '@/nav';
import { usePlayerStore } from '@/store/playerStore';
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

function NavRow({ item }: { item: NavItem }) {
  const playing = usePlayerStore((s) => s.status !== 'idle');
  const source = usePlayerStore((s) => s.source);
  const playerSource = source?.kind;
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
          isActive
            ? 'bg-primary/10 font-medium text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        )
      }
    >
      <Icon className="h-4 w-4" />
      <span>{item.label}</span>
      {item.to === '/' && playing && playerSource !== 'book' && <PlayingDot />}
      {item.to === '/books' && playing && playerSource === 'book' && <PlayingDot />}
    </NavLink>
  );
}

export default function App() {
  return (
    <HashRouter>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <ThemeController />
        <aside className="flex w-52 shrink-0 flex-col border-r bg-card">
          <div className="flex h-14 items-center border-b px-4">
            <span className="text-base font-semibold tracking-tight">TTS Aggregator</span>
          </div>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
            {NAV_ITEMS.map((item) => (
              <NavRow key={item.to} item={item} />
            ))}
          </nav>
          <div className="border-t px-4 py-3 text-xs text-muted-foreground">
            节点池 · SQLite 本地库
          </div>
        </aside>
        <main className="flex-1 overflow-y-auto p-6">
          <Routes>
            <Route path="/" element={<ReadPage />} />
            <Route path="/books" element={<BooksPage />} />
            <Route path="/nodes" element={<NodesPage />} />
            <Route path="/voices" element={<VoicesPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
        <Toaster position="bottom-right" richColors />
      </div>
    </HashRouter>
  );
}
