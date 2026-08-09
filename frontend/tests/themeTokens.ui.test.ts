import { THEME_COLORS } from '@/constants/colors';
import { V2X_LIGHT_THEME } from '@/constants/echarts-theme';
import { getAntdTheme } from '@/app/styles/theme';
import { useSettingsStore } from '@/store/settingsStore';

function contrastRatio(foreground: string, background: string): number {
  const channel = (hex: string, offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex: string) => (
    0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5)
  );
  const light = luminance(foreground);
  const dark = luminance(background);
  return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
}

describe('light theme contract', () => {
  it('uses the analytical-console surface palette', () => {
    expect(THEME_COLORS.light.bg).toBe('#F8FAFC');
    expect(THEME_COLORS.light.cardBg).toBe('#FFFFFF');
    expect(THEME_COLORS.light.text).toBe('#0F172A');
    expect(THEME_COLORS.light.textSecondary).toBe('#334155');
    expect(THEME_COLORS.light.textMuted).toBe('#64748B');
  });

  it('keeps normal text and semantic text above the AA floor', () => {
    const colors = THEME_COLORS.light;
    expect(contrastRatio(colors.text, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.textSecondary, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.textMuted, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.accent, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.success, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.warning, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.danger, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('uses the analytical-console chart palette', () => {
    expect(V2X_LIGHT_THEME.color).toEqual(['#1D4ED8', '#15803D', '#6D28D9', '#B45309', '#B91C1C']);
    expect(V2X_LIGHT_THEME.tooltip?.backgroundColor).toBe('#FFFFFF');
    expect(V2X_LIGHT_THEME.tooltip?.borderColor).toBe('#CBD5E1');
  });

  it('keeps the theme switch contract aligned across Zustand and Ant Design', () => {
    useSettingsStore.getState().setTheme('light');
    const lightTheme = getAntdTheme('light');

    expect(useSettingsStore.getState().theme).toBe('light');
    expect(lightTheme.token?.colorPrimary).toBe(THEME_COLORS.light.accent);
    expect(lightTheme.token?.colorBgBase).toBe(THEME_COLORS.light.bg);
    expect(lightTheme.token?.colorText).toBe(THEME_COLORS.light.text);

    useSettingsStore.getState().setTheme('dark');
  });
});
