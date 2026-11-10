import { useEffect, useState } from 'react';
import { applyTheme, resolveTheme, watchSystemTheme } from '@/lib/theme';
import { applyPalette } from '@/lib/palette';
import { useSettingsStore } from '@/store/settingsStore';

export function ThemeController() {
  const theme = useSettingsStore((s) => s.appPrefs.theme);
  const palette = useSettingsStore((s) => s.appPrefs.palette);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => watchSystemTheme(setSystemDark), []);
  useEffect(() => {
    applyTheme(resolveTheme(theme, systemDark));
  }, [theme, systemDark]);
  useEffect(() => {
    applyPalette(palette);
  }, [palette]);
  return null;
}
