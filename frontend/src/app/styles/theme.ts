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
      colorWarning: colors.warning,
      colorError: colors.danger,
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
        headerBg: colors.cardBg,
        headerFontSize: 13,
      },
      Table: {
        colorBgContainer: colors.cardBg,
        headerBg: mode === 'dark' ? 'rgba(0, 212, 255, 0.06)' : '#fafafa',
        headerColor: colors.textSecondary,
        rowHoverBg: mode === 'dark' ? 'rgba(0, 212, 255, 0.06)' : '#f5f8ff',
      },
      Input: {
        activeBorderColor: colors.accent,
        hoverBorderColor: colors.accent,
      },
      Select: {
        optionSelectedBg: mode === 'dark' ? 'rgba(0, 212, 255, 0.12)' : '#e6f4ff',
        optionActiveBg: mode === 'dark' ? 'rgba(0, 212, 255, 0.08)' : '#f0f7ff',
      },
    },
  };
}
