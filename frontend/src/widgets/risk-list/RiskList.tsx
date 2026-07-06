import React, { useState } from 'react';
import { Card, Table, Select } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { RiskTag } from '@/shared/components/RiskTag';
import { RiskItem } from '@/mock/dashboardMock';
import { useSettingsStore } from '@/store/settingsStore';
import { THEME_COLORS } from '@/constants/colors';

interface RiskListProps {
  items: RiskItem[];
}

type SortField = 'riskScore' | 'ttc' | 'timestamp';

export const RiskList: React.FC<RiskListProps> = ({ items }) => {
  const [sortBy, setSortBy] = useState<SortField>('riskScore');
  const theme = useSettingsStore((s) => s.theme);
  const colors = THEME_COLORS[theme];

  const sorted = [...items].sort((a, b) => {
    if (sortBy === 'riskScore') return b.riskScore - a.riskScore;
    if (sortBy === 'ttc') return a.ttc - b.ttc;
    return b.timestamp.localeCompare(a.timestamp);
  });

  const columns: ColumnsType<RiskItem> = [
    {
      title: '目标',
      dataIndex: 'target',
      width: 90,
      render: (text: string) => (
        <span style={{ color: colors.accent }}>{text}</span>
      ),
    },
    {
      title: '风险',
      dataIndex: 'riskLevel',
      width: 80,
      render: (level: RiskItem['riskLevel']) => <RiskTag level={level} />,
    },
    {
      title: '分数',
      dataIndex: 'riskScore',
      width: 60,
      render: (v: number) => <span style={{ fontWeight: 600 }}>{v.toFixed(2)}</span>,
    },
    {
      title: 'TTC',
      dataIndex: 'ttc',
      width: 60,
      render: (v: number) => `${v}s`,
    },
  ];

  return (
    <Card
      className="glass-card"
      title="实时风险榜"
      size="small"
      extra={
        <Select
          size="small"
          value={sortBy}
          onChange={setSortBy}
          style={{ width: 100 }}
          options={[
            { label: '风险分', value: 'riskScore' },
            { label: 'TTC', value: 'ttc' },
            { label: '时间', value: 'timestamp' },
          ]}
        />
      }
      style={{ height: '100%' }}
      styles={{ body: { padding: '0 8px', maxHeight: 400, overflow: 'auto' } }}
    >
      <Table
        dataSource={sorted}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={false}
        showHeader
        style={{ fontSize: 12 }}
      />
    </Card>
  );
};
