import React from 'react';
import { Table, Card, Input, Select, Tag, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SearchOutlined } from '@ant-design/icons';
import { ReplayEvent } from '@/types/event';
import { RiskTag } from '@/shared/components/RiskTag';
import styles from './EventTable.module.css';

interface EventTableProps {
  events: ReplayEvent[];
  searchText: string;
  filterType: string;
  selectedEventId: string | null;
  onSearch: (text: string) => void;
  onFilterType: (type: string) => void;
  onSelect: (event: ReplayEvent) => void;
}

const typeLabels: Record<string, string> = {
  ghost_probe: '鬼探头',
  near_miss: '险碰撞',
  collision_warning: '碰撞预警',
  brake_trigger: '制动触发',
};

export const EventTable: React.FC<EventTableProps> = ({
  events,
  searchText,
  filterType,
  selectedEventId,
  onSearch,
  onFilterType,
  onSelect,
}) => {
  const filtered = events.filter((e) => {
    const matchSearch =
      !searchText ||
      e.description.includes(searchText) ||
      e.eventId.includes(searchText) ||
      e.location.includes(searchText);
    const matchType = filterType === 'all' || e.type === filterType;
    return matchSearch && matchType;
  });

  const columns: ColumnsType<ReplayEvent> = [
    {
      title: '事件ID',
      dataIndex: 'eventId',
      width: 100,
      render: (id: string) => (
        <span className={styles.eventId}>{id}</span>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      width: 90,
      render: (type: string) => <Tag color="blue">{typeLabels[type] || type}</Tag>,
    },
    {
      title: '风险',
      dataIndex: 'riskLevel',
      width: 80,
      render: (level: ReplayEvent['riskLevel']) => <RiskTag level={level} />,
    },
    {
      title: '位置',
      dataIndex: 'location',
      width: 110,
    },
    {
      title: '时间',
      dataIndex: 'timestamp',
      width: 150,
    },
    {
      title: '时长',
      dataIndex: 'duration',
      width: 70,
      render: (v: number) => `${v}s`,
    },
    {
      title: '帧数',
      dataIndex: 'frameCount',
      width: 60,
    },
  ];

  return (
    <Card className="glass-card" size="small" title="事件列表">
      <Space className={styles.filters} wrap>
        <Input
          placeholder="搜索事件..."
          prefix={<SearchOutlined />}
          size="small"
          value={searchText}
          onChange={(e) => onSearch(e.target.value)}
          className={styles.search}
        />
        <Select
          size="small"
          value={filterType}
          onChange={onFilterType}
          className={styles.typeSelect}
          options={[
            { label: '全部类型', value: 'all' },
            { label: '鬼探头', value: 'ghost_probe' },
            { label: '险碰撞', value: 'near_miss' },
            { label: '碰撞预警', value: 'collision_warning' },
            { label: '制动触发', value: 'brake_trigger' },
          ]}
        />
      </Space>
      <Table
        dataSource={filtered}
        columns={columns}
        rowKey="eventId"
        size="small"
        pagination={{ pageSize: 5, size: 'small' }}
        onRow={(record) => ({
          onClick: () => onSelect(record),
        })}
        rowClassName={(record) => record.eventId === selectedEventId ? styles.selectedRow : styles.clickableRow}
      />
    </Card>
  );
};
