import styles from './loading-spinner.module.css';

export function LoadingSpinner() {
  return <span className={styles.spinner} aria-hidden="true" />;
}
