import { ThemeConfig, theme as antTheme } from 'antd';
import { ThemeMode } from '@/types/common';
import { THEME_COLORS } from '@/constants/colors';

export function getAntdTheme(mode: ThemeMode): ThemeConfig {
  const colors = THEME_COLORS[mode];
  return {
    algorithm: mode === 'dark' ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    token: {
      colorPrimary: colors.accent,
      colorBgBase: colors.bg,
      colorBgContainer: colors.cardBg,
      colorText: colors.text,
      colorTextSecondary: colors.textSecondary,
      colorBorder: colors.cardBorder,
      colorSuccess: colors.success,
      borderRadius: 8,
      fontFamily:
        "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
    components: {
      Layout: {
        headerBg: colors.headerBg,
        siderBg: colors.siderBg,
        bodyBg: colors.bg,
      },
      Card: {
        colorBgContainer: colors.cardBg,
        colorBorderSecondary: colors.cardBorder,
      },
      Table: {
        colorBgContainer: colors.cardBg,
      },
    },
  };
}
