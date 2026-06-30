export const RISK_COLORS = {
  low: '#52c41a',
  medium: '#faad14',
  high: '#ff7a45',
  critical: '#ff4d4f',
} as const;

export const CHART_COLORS = {
  primary: '#00d4ff',
  secondary: '#00ff88',
  tertiary: '#a855f7',
  quaternary: '#f97316',
  quinary: '#ec4899',
  line1: '#00d4ff',
  line2: '#00ff88',
  line3: '#faad14',
  line4: '#ff4d4f',
  area: 'rgba(0, 212, 255, 0.15)',
} as const;

export const THEME_COLORS = {
  dark: {
    bg: '#0a0e1a',
    cardBg: 'rgba(16, 24, 48, 0.85)',
    cardBorder: 'rgba(0, 212, 255, 0.15)',
    text: '#e0e6f0',
    textSecondary: '#8892a4',
    accent: '#00d4ff',
    success: '#00ff88',
    neonGlow: '0 0 20px rgba(0, 212, 255, 0.3)',
    headerBg: 'rgba(10, 14, 26, 0.95)',
    siderBg: 'rgba(10, 14, 26, 0.98)',
  },
  light: {
    bg: '#f0f2f5',
    cardBg: '#ffffff',
    cardBorder: '#e8e8e8',
    text: '#1f1f1f',
    textSecondary: '#8c8c8c',
    accent: '#1677ff',
    success: '#52c41a',
    neonGlow: '0 2px 8px rgba(0, 0, 0, 0.08)',
    headerBg: '#ffffff',
    siderBg: '#ffffff',
  },
} as const;

export const LOG_LEVEL_COLORS = {
  info: '#00d4ff',
  warn: '#faad14',
  error: '#ff4d4f',
  debug: '#8892a4',
} as const;
