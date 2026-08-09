export const RISK_COLORS = {
  low: '#15803D',
  medium: '#B45309',
  high: '#C2410C',
  critical: '#B91C1C',
} as const;

export const GRADIENTS = {
  cyan: 'linear-gradient(135deg, #00d4ff 0%, #0099cc 100%)',
  green: 'linear-gradient(135deg, #00ff88 0%, #00cc6a 100%)',
  purple: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
  danger: 'linear-gradient(135deg, #ff4d4f 0%, #cc3333 100%)',
  warning: 'linear-gradient(135deg, #faad14 0%, #cc8800 100%)',
  bg: 'linear-gradient(135deg, #050816 0%, #0a0e1a 50%, #0d1424 100%)',
  glowLine: 'linear-gradient(90deg, transparent, #00d4ff, transparent)',
  cardTop: 'linear-gradient(90deg, transparent 0%, rgba(0, 212, 255, 0.5) 50%, transparent 100%)',
} as const;

export const SEMANTIC_COLORS = {
  live: '#15803D',
  mock: '#B45309',
  online: '#15803D',
  offline: '#B91C1C',
  connecting: '#B45309',
  low: '#15803D',
  medium: '#B45309',
  high: '#C2410C',
  critical: '#B91C1C',
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
    cardBgSolid: '#101830',
    surfaceSubtle: 'rgba(255, 255, 255, 0.04)',
    surfaceRaised: '#141f3d',
    cardBorder: 'rgba(0, 212, 255, 0.15)',
    borderStrong: 'rgba(0, 212, 255, 0.45)',
    text: '#e0e6f0',
    textSecondary: '#8892a4',
    textMuted: '#5d6880',
    primary: '#00d4ff',
    accent: '#00d4ff',
    success: '#00ff88',
    warning: '#faad14',
    danger: '#ff4d4f',
    purple: '#a855f7',
    neonGlow: '0 0 20px rgba(0, 212, 255, 0.3)',
    headerBg: 'rgba(10, 14, 26, 0.95)',
    siderBg: 'rgba(10, 14, 26, 0.98)',
  },
  light: {
    bg: '#F8FAFC',
    cardBg: '#FFFFFF',
    cardBgSolid: '#FFFFFF',
    surfaceSubtle: '#F1F5F9',
    surfaceRaised: '#FFFFFF',
    cardBorder: '#CBD5E1',
    borderStrong: '#93C5FD',
    text: '#0F172A',
    textSecondary: '#334155',
    textMuted: '#64748B',
    primary: '#1E40AF',
    accent: '#2563EB',
    success: '#15803D',
    warning: '#B45309',
    danger: '#B91C1C',
    purple: '#6D28D9',
    neonGlow: '0 1px 2px rgb(15 23 42 / 0.06), 0 4px 12px rgb(15 23 42 / 0.04)',
    headerBg: '#FFFFFF',
    siderBg: '#F8FAFC',
  },
} as const;

export const LOG_LEVEL_COLORS = {
  info: '#00d4ff',
  warn: '#faad14',
  error: '#ff4d4f',
  debug: '#8892a4',
} as const;
