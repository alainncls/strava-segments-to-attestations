import React from 'react';
import styles from './Loader.module.css';

interface LoaderProps {
  loading: boolean;
  message?: string;
}

export default function Loader({ loading, message }: LoaderProps): React.JSX.Element | null {
  if (!loading) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.container}>
        <div className={styles.spinner} />
        {message && <p className={styles.message}>{message}</p>}
      </div>
    </div>
  );
}
