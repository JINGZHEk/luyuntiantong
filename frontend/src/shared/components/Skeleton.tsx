import React from 'react';
import styles from './Skeleton.module.css';

interface SkeletonProps {
  type?: 'card' | 'table' | 'chart';
  height?: number | string;
  rows?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  type = 'card',
  height = 200,
  rows = 3,
}) => {
  const heightStyle = {
    '--skeleton-height': typeof height === 'number' ? `${height}px` : height,
  } as React.CSSProperties;

  if (type === 'card') {
    return (
      <div className={`glass-card ${styles.surface} ${styles.card}`} style={heightStyle}>
        <div className={`skeleton ${styles.title}`} />
        <div className={`skeleton ${styles.value}`} />
        <div className={`skeleton ${styles.line}`} />
        <div className={`skeleton ${styles.lineShort}`} />
      </div>
    );
  }

  if (type === 'table') {
    return (
      <div className={`glass-card ${styles.surface}`}>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className={`skeleton ${styles.tableRow}`}
          />
        ))}
      </div>
    );
  }

  // chart
  return (
    <div className={`glass-card ${styles.surface} ${styles.chart}`} style={heightStyle}>
      <div className={`skeleton ${styles.chartPlaceholder}`} />
    </div>
  );
};

export default Skeleton;
