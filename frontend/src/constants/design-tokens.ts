// ═══════════════════════════════════════════════════════════
// Design Tokens — 路云天瞳 V2X 平台设计系统
// ═══════════════════════════════════════════════════════════

// ═══ 排版 ═══
export const TYPOGRAPHY = {
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontFamilyMono: "'JetBrains Mono', 'Fira Code', monospace",
  fontFamilyDisplay: "'Orbitron', sans-serif",

  fontSize: {
    xs: 10,
    sm: 12,
    base: 14,
    lg: 16,
    xl: 20,
    xxl: 28,
    display: 36,
  },

  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    black: 900,
  },

  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.8,
  },

  letterSpacing: {
    tight: '-0.02em',
    normal: '0em',
    wide: '0.05em',
    extraWide: '0.15em',
  },
} as const;

export const CSS_VAR = {
  bg: '--color-bg',
  surface: '--color-surface',
  surfaceRaised: '--color-surface-raised',
  border: '--color-border',
  accent: '--color-accent',
  success: '--color-success',
  warning: '--color-warning',
  danger: '--color-danger',
  text: '--color-text',
  textSecondary: '--color-text-secondary',
  textMuted: '--color-text-muted',
} as const;

// ═══ 间距（8px 栅格系统） ═══
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

// ═══ 圆角 ═══
export const RADIUS = {
  sm: 4,
  base: 6,
  md: 8,
  lg: 12,
  full: 9999,
} as const;

// ═══ 阴影层级 ═══
export const SHADOWS = {
  card: '0 2px 12px rgba(0, 0, 0, 0.3)',
  cardHover: '0 8px 32px rgba(0, 212, 255, 0.12)',
  popover: '0 12px 40px rgba(0, 0, 0, 0.5)',
  glowCyan: '0 0 20px rgba(0, 212, 255, 0.3)',
  glowGreen: '0 0 20px rgba(0, 255, 136, 0.3)',
  glowRed: '0 0 20px rgba(255, 77, 79, 0.3)',
} as const;

// ═══ 动效 ═══
export const MOTION = {
  durationFast: '0.15s',
  durationNormal: '0.3s',
  durationSlow: '0.5s',
  easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
  easeInOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;

// ═══ Z-index 层级 ═══
export const Z_INDEX = {
  base: 0,
  dropdown: 1000,
  sticky: 1020,
  fixed: 1030,
  drawer: 1040,
  modal: 1050,
  popover: 1060,
  toast: 1070,
  tooltip: 1080,
} as const;

// ═══ 过渡 ═══
export const TRANSITIONS = {
  fast: `${MOTION.durationFast} ${MOTION.easeOut}`,
  normal: `${MOTION.durationNormal} ${MOTION.easeOut}`,
  slow: `${MOTION.durationSlow} ${MOTION.easeOut}`,
} as const;
