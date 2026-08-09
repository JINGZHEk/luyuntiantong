import { ThemeConfig, theme as antTheme } from 'antd';
import { ThemeMode } from '@/types/common';
import { THEME_COLORS } from '@/constants/colors';
import { UI_TOKENS } from '@/constants/design-tokens';

export function getAntdTheme(mode: ThemeMode): ThemeConfig {
  const colors = THEME_COLORS[mode];
  return {
    algorithm: mode === 'dark' ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    token: {
      colorPrimary: colors.accent,
      colorBgBase: colors.bg,
      colorBgLayout: colors.bg,
      colorBgContainer: colors.cardBg,
      colorFillAlter: colors.surfaceSubtle,
      colorText: colors.text,
      colorTextSecondary: colors.textSecondary,
      colorTextTertiary: colors.textMuted,
      colorBorder: colors.cardBorder,
      colorSuccess: colors.success,
      colorWarning: colors.warning,
      colorError: colors.danger,
      controlHeight: UI_TOKENS.controlHeight,
      borderRadius: UI_TOKENS.cardRadius,
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
        headerFontSize: UI_TOKENS.bodyFontSize,
      },
      Table: {
        colorBgContainer: colors.cardBg,
        headerBg: colors.surfaceSubtle,
        headerColor: colors.textSecondary,
        rowHoverBg: colors.surfaceSubtle,
        rowSelectedBg: colors.surfaceSubtle,
        rowSelectedHoverBg: colors.surfaceRaised,
      },
      Input: {
        colorBgContainer: colors.cardBg,
        colorBorder: colors.cardBorder,
        activeBorderColor: colors.accent,
        hoverBorderColor: colors.accent,
      },
      Select: {
        optionSelectedBg: colors.surfaceSubtle,
        optionActiveBg: colors.surfaceSubtle,
      },
      Button: {
        defaultBg: colors.cardBg,
        defaultBorderColor: colors.cardBorder,
        defaultColor: colors.text,
        primaryColor: colors.cardBg,
        primaryShadow: 'none',
      },
    },
  };
}
