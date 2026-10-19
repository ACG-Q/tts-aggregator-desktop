import { AudioLines, FileClock, ListMusic, Server, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: '朗读', icon: AudioLines },
  { to: '/nodes', label: '节点', icon: Server },
  { to: '/voices', label: '音色', icon: ListMusic },
  { to: '/logs', label: '日志', icon: FileClock },
  { to: '/settings', label: '设置', icon: Settings },
];
