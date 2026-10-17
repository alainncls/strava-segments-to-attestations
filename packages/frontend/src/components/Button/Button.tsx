import React from 'react';
import styles from './Button.module.css';

type ButtonVariant = 'primary' | 'secondary';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: React.ReactNode;
}

export function buttonClassName(variant: ButtonVariant = 'secondary', className?: string): string {
  return [styles.button, styles[variant], className].filter(Boolean).join(' ');
}

export function Button({
  variant = 'secondary',
  className,
  children,
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <button className={buttonClassName(variant, className)} {...props}>
      {children}
    </button>
  );
}
