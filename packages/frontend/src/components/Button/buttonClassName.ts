import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary';

export function buttonClassName(variant: ButtonVariant = 'secondary', className?: string): string {
  return [styles.button, styles[variant], className].filter(Boolean).join(' ');
}
