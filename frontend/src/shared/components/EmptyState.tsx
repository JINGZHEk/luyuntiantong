import React from 'react';
import { InboxOutlined } from '@ant-design/icons';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = <InboxOutlined className={styles.icon} />,
  title = '暂无数据',
  description,
}) => {
  return (
    <div className={`empty-state ${styles.emptyState}`}>
      {icon}
      <span className={styles.title}>{title}</span>
      {description && (
        <span className={styles.description}>{description}</span>
      )}
    </div>
  );
};

export default EmptyState;
