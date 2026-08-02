import React, { useMemo, useState } from 'react';
import { Button, Card, Space } from 'antd';
import { RiskItem } from '@/mock/dashboardMock';
import { EmptyState } from '@/shared/components/EmptyState';
import { RiskLevel } from '@/types/common';
import { sortRiskItems, SortField } from './risk-utils';
import styles from './RiskList.module.css';

interface RiskListProps {
  items: RiskItem[];
}

const sortLabels: Record<SortField, string> = {
  riskScore: '风险分',
  ttc: 'TTC',
  timestamp: '时间',
};

const riskLabels: Record<RiskLevel, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  critical: '危急',
};

export const RiskList: React.FC<RiskListProps> = ({ items }) => {
  const [sortBy, setSortBy] = useState<SortField>('riskScore');
  const sorted = useMemo(() => sortRiskItems(items, sortBy), [items, sortBy]);

  return (
    <Card
      className={`glass-card tech-border ${styles.card}`}
      title={
        <div className={styles.title}>
          <span className={`${styles.liveDot} data-pulse`} aria-hidden="true" />
          <span>实时风险榜</span>
          <span className={styles.count}>{sorted.length.toString().padStart(2, '0')}</span>
        </div>
      }
      size="small"
      extra={
        <Space size={4} className={styles.sortGroup} role="group" aria-label="风险排序">
          {(Object.keys(sortLabels) as SortField[]).map((field) => (
            <Button
              key={field}
              size="small"
              type="text"
              className={`${styles.sortButton} ${sortBy === field ? styles.sortActive : ''}`}
              aria-pressed={sortBy === field}
              onClick={() => setSortBy(field)}
            >
              {sortLabels[field]}
            </Button>
          ))}
        </Space>
      }
    >
      {sorted.length === 0 ? (
        <EmptyState title="暂无实时风险" description="当前路口没有需要关注的目标" />
      ) : (
        <div className={styles.list} role="list" aria-label="实时风险列表">
          {sorted.map((item, index) => {
            const isCritical = item.riskLevel === 'critical';
            return (
              <div
                key={item.id}
                className={`${styles.row} ${isCritical ? styles.critical : ''} fade-in`}
                data-risk-level={item.riskLevel}
                role="listitem"
              >
                <span className={styles.riskLine} aria-hidden="true" />
                <span className={styles.rank}>{String(index + 1).padStart(2, '0')}</span>
                <div className={styles.target}>
                  <strong>{item.target}</strong>
                  <span>TTC {item.ttc.toFixed(1)}s · {item.location}</span>
                </div>
                <div className={styles.score}>
                  <strong>{item.riskScore.toFixed(2)}</strong>
                  <span>{riskLabels[item.riskLevel]}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};
