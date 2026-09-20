import type { ReactNode } from 'react';

import styles from './workspace.module.css';

export function PageHeader({
  actions,
  description,
  title,
}: {
  readonly actions?: ReactNode;
  readonly description: string;
  readonly title: string;
}) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className={styles.headerActions}>{actions}</div> : null}
    </header>
  );
}

export function DataUnavailable({
  detail,
  title,
}: {
  readonly detail: string;
  readonly title: string;
}) {
  return (
    <div className={styles.empty}>
      <div>
        <strong>{title}</strong>
        {detail}
      </div>
    </div>
  );
}
