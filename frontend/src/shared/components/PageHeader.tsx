import React from 'react';
import styles from './PageHeader.module.css';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  extra?: React.ReactNode;
  eyebrow?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, icon, extra, eyebrow }) => {
  return (
    <header className={`${styles.header} fade-in`}>
      <div className={styles.headingGroup}>
        {icon && <span className={styles.icon} aria-hidden="true">{icon}</span>}
        <div className={styles.headingCopy}>
          {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
          <h2 className={styles.title}>{title}</h2>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
      </div>
      {extra && <div className={styles.extra}>{extra}</div>}
    </header>
  );
};

export default PageHeader;
