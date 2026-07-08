import React from 'react';
import { InboxOutlined } from '@ant-design/icons';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = <InboxOutlined style={{ fontSize: 32, color: '#555' }} />,
  title = '暂无数据',
  description,
}) => {
  return (
    <div className="empty-state">
      {icon}
      <span style={{ fontSize: 13, color: '#8892a4' }}>{title}</span>
      {description && (
        <span style={{ fontSize: 11, color: '#555' }}>{description}</span>
      )}
    </div>
  );
};

export default EmptyState;
