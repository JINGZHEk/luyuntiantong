import React from 'react';
import { Tag } from 'antd';
import { RiskLevel } from '@/types/common';
import { RISK_COLORS } from '@/constants/colors';
import styles from './RiskTag.module.css';

interface RiskTagProps {
  level: RiskLevel;
  showText?: boolean;
}

const RISK_LABELS: Record<RiskLevel, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  critical: '危急',
};

export const RiskTag: React.FC<RiskTagProps> = ({ level, showText = true }) => {
  const color = RISK_COLORS[level];
  return (
    <Tag
      color={color}
      className={`${level === 'critical' ? 'risk-blink-critical ' : ''}${styles.tag}`}
    >
      {showText ? RISK_LABELS[level] : level.toUpperCase()}
    </Tag>
  );
};
