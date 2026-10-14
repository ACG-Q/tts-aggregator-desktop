import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { LogsPage } from './pages/LogsPage';
import { NodesPage } from './pages/NodesPage';
import { ReadPage } from './pages/ReadPage';
import { SettingsPage } from './pages/SettingsPage';
import { VoicesPage } from './pages/VoicesPage';

const NAV: [string, string][] = [
  ['/', '朗读'],
  ['/nodes', '节点'],
  ['/voices', '音色'],
  ['/logs', '日志'],
  ['/settings', '设置'],
];

export default function App() {
  return (
    <HashRouter>
      <div className="layout">
        <nav className="sidebar">
          <div className="brand">TTS Aggregator</div>
          {NAV.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>
          ))}
        </nav>
        <main className="content">
          <Routes>
            <Route path="/" element={<ReadPage />} />
            <Route path="/nodes" element={<NodesPage />} />
            <Route path="/voices" element={<VoicesPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
