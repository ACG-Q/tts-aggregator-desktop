/**
 * 计算侧边栏是否应折叠。
 * 手动偏好（manual）一旦存在即覆盖自动判断；否则按窗口宽度与阈值自动决定。
 * 宽度等于阈值时不折叠（窄于阈值才折叠）。
 */
export function resolveCollapsed(
  windowWidth: number,
  manual: boolean | null,
  threshold: number,
): boolean {
  if (manual !== null) return manual;
  return windowWidth < threshold;
}

/** 窄于此宽度时侧栏强制显示为图标栏（优先于手动展开），但仍不算移动端。 */
export const SIDEBAR_RAIL_THRESHOLD = 940;
