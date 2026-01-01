import React from 'react';
import styles from './Button.module.css';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'secondary' | 'outline';
  children: React.ReactNode;
}

export function Button({
  variant = 'secondary',
  className,
  children,
  ...props
}: ButtonProps): React.JSX.Element {
  const classes = [styles.button, styles[variant], className].filter(Boolean).join(' ');

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
