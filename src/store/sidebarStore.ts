import { create } from 'zustand';
import { resolveCollapsed } from '../lib/sidebar';

export const SIDEBAR_COLLAPSE_THRESHOLD = 768;

interface SidebarState {
  /** 用户手动折叠偏好；null 表示从未手动操作过，跟随自动判断 */
  manual: boolean | null;
  /** 当前窗口宽度，由组件在 resize 时写入 */
  windowWidth: number;
  setManual(v: boolean | null): void;
  setWindowWidth(w: number): void;
  /** 计算得到的是否折叠 */
  collapsed(): boolean;
  toggle(): void;
}

export const useSidebarStore = create<SidebarState>((set, get) => ({
  manual: null,
  windowWidth: typeof window === 'undefined' ? 1280 : window.innerWidth,
  setManual(manual) { set({ manual }); },
  setWindowWidth(windowWidth) { set({ windowWidth }); },
  collapsed() {
    return resolveCollapsed(get().windowWidth, get().manual, SIDEBAR_COLLAPSE_THRESHOLD);
  },
  toggle() {
    set({ manual: !get().collapsed() });
  },
}));
